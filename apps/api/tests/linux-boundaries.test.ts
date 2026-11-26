import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeSession } from '../src/infrastructure/linux/activity.provider.js';
import {
  LinuxProcessProvider,
  type ProcessReads,
} from '../src/infrastructure/linux/processes.provider.js';
import { parseJournal } from '../src/infrastructure/linux/journal.provider.js';

test('logind mapping excludes closing/background, preserves idle and missing metadata, counts duplicate UID sessions separately', () => {
  const properties = new Map([
    ['User', '1000'],
    ['Name', 'mock'],
    ['State', 'active'],
    ['Class', 'user'],
    ['Type', 'tty'],
    ['IdleHint', 'yes'],
    ['TimestampMonotonic', '1000000'],
  ]);
  const local = normalizeSession('1', properties, 120)!;
  const remote = normalizeSession(
    '2',
    new Map([...properties, ['Remote', 'yes'], ['Service', 'sshd'], ['RemoteHost', '192.0.2.1']]),
    120,
  )!;
  assert.equal(local.idleHint, true);
  assert.equal(local.remoteHost, null);
  assert.equal(local.tty, null);
  assert.equal(local.durationSeconds, 119);
  assert.equal(remote.remote, true);
  assert.equal(remote.service, 'sshd');
  const rows = [local, remote];
  assert.equal(rows.length, 2);
  assert.equal(new Set(rows.map((row) => row.uid)).size, 1);
  for (const state of ['closing', 'offline'])
    assert.equal(normalizeSession('3', new Map([...properties, ['State', state]]), 120), null);
  for (const sessionClass of ['greeter', 'background', 'manager'])
    assert.equal(
      normalizeSession('3', new Map([...properties, ['Class', sessionClass]]), 120),
      null,
    );
});

test('process provider tolerates vanished/denied PIDs and reuses UID cache without reading argv', async () => {
  let passwdReads = 0;
  const stat = (pid: number) => {
    const values = Array.from({ length: 22 }, () => '0');
    values[0] = 'S';
    values[19] = '123';
    values[21] = '2';
    return `${pid} (робочий (процес)) ${values.join(' ')}`;
  };
  const io: ProcessReads = {
    command: async (_file, args) => (args[0] === 'PAGESIZE' ? '4096' : '100'),
    directory: async () => ['1', '2', '3', 'self'],
    text: async (path) => {
      if (path === '/etc/passwd') {
        passwdReads++;
        return 'mock:x:1000:1000::/:/bin/sh';
      }
      if (path === '/proc/sys/kernel/random/boot_id') return 'mock-boot';
      if (path.startsWith('/proc/2/')) throw Object.assign(new Error('exited'), { code: 'ENOENT' });
      if (path.startsWith('/proc/3/')) throw Object.assign(new Error('denied'), { code: 'EACCES' });
      if (path === '/proc/1/stat') return stat(1);
      if (path === '/proc/1/status') return 'Uid:\t1000 1000 1000 1000';
      throw new Error(`Unexpected read: ${path}`);
    },
  };
  const provider = new LinuxProcessProvider(io);
  const first = await provider.read(new AbortController().signal);
  assert.equal(first.partial, true);
  assert.equal(first.skipped, 2);
  assert.equal(first.processes.length, 1);
  assert.equal(first.processes[0]!.rssBytes, 8192);
  assert.equal(first.processes[0]!.username, 'mock');
  assert.equal(first.processes[0]!.name, 'робочий (процес)');
  await provider.read(new AbortController().signal);
  assert.equal(passwdReads, 1);
  await assert.rejects(provider.read(AbortSignal.abort()));
});

test('journal bounds long messages and rejects invalid metadata', () => {
  const entry = {
    __CURSOR: 's=test;i=1',
    __REALTIME_TIMESTAMP: '1700000000000000',
    MESSAGE: 'я'.repeat(20000),
  };
  assert.equal(parseJournal(JSON.stringify(entry))[0]!.message.length, 16384);
  assert.throws(() => parseJournal(JSON.stringify({ MESSAGE: 'missing cursor/time' })));
});
