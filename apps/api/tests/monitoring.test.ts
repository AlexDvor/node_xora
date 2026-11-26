import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { buildApp } from '../src/app.js';
import { createMockSources } from '../src/infrastructure/linux/monitoring.provider.js';
import { MockSystemProvider } from '../src/infrastructure/linux/mock-system.provider.js';
import { parseCpuStat } from '../src/infrastructure/linux/cpu.provider.js';
import { cpuUsage } from '../src/modules/system/cpu.service.js';
import { parseNetDev, type NetworkCounters } from '../src/infrastructure/linux/network.provider.js';
import { networkUsage } from '../src/modules/network/network.service.js';
import { parseProcessStat } from '../src/infrastructure/linux/processes.provider.js';
import { processUsage } from '../src/modules/processes/processes.service.js';
import { MetricsCollector } from '../src/modules/metrics/collector.service.js';
import { processPage } from '../src/modules/processes/processes.service.js';
import { parseJournal, redactMessage } from '../src/infrastructure/linux/journal.provider.js';
import { monitoringPolicy } from '../src/config/monitoring.js';
import { LogsService } from '../src/modules/logs/logs.service.js';

test('CPU uses deltas, excludes guest double count and treats iowait as idle', () => {
  const a = parseCpuStat('cpu 100 0 0 100 0 0 0 0 100\ncpu0 100 0 0 100 0 0 0 0', 'boot', 1000);
  const b = parseCpuStat('cpu 150 0 0 140 10 0 0 0 150\ncpu0 150 0 0 140 10 0 0 0', 'boot', 3000);
  assert.equal(cpuUsage(a, b).totalPercent, 50);
  assert.equal(cpuUsage(a, b).windowSeconds, 2);
  assert.equal(cpuUsage(undefined, b).totalPercent, null);
  assert.equal(cpuUsage(b, a).totalPercent, null);
  assert.equal(cpuUsage(a, { ...b, bootId: 'reboot' }).totalPercent, null);
  assert.equal(cpuUsage(a, { ...b, cpus: { ...b.cpus, cpu1: b.cpus.cpu! } }).totalPercent, null);
  assert.equal(cpuUsage(a, { ...a, at: 2000 }).totalPercent, null);
  assert.throws(() => parseCpuStat('cpu bad', 'boot', 1));
});

test('network rates preserve big counters, monotonic timing and interface reset', () => {
  const counters = parseNetDev(
    'header\nheader\nenp5s0: 9007199254740993 0 0 0 0 0 0 0 100 0 0 0 0 0 0 0',
  );
  assert.equal(counters.get('enp5s0')!.rxBytes, '9007199254740993');
  const previous: NetworkCounters = {
    bootId: 'b',
    at: 1000,
    links: [
      {
        id: 'b:2:enp5s0',
        name: 'enp5s0',
        index: 2,
        state: 'UP',
        kind: 'ether',
        mtu: 1500,
        addresses: [{ family: 'IPv4', address: '192.168.1.33', prefix: 24, scope: 'global' }],
        rxBytes: '9007199254740993',
        txBytes: '100',
      },
    ],
  };
  const current = {
    ...previous,
    at: 3000,
    links: previous.links.map((link) => ({ ...link, rxBytes: '9007199254741193', txBytes: '200' })),
  };
  assert.equal(networkUsage(previous, current).rxBytesPerSecond, 100);
  assert.equal(networkUsage(previous, current).txBytesPerSecond, 50);
  assert.equal(networkUsage(previous, current).currentAddress!.address, '192.168.1.33');
  assert.equal(networkUsage(undefined, current).rxBytesPerSecond, null);
  assert.equal(
    networkUsage(current, {
      ...current,
      at: 5000,
      links: current.links.map((link) => ({ ...link, rxBytes: '0' })),
    }).rxBytesPerSecond,
    null,
  );
  assert.equal(networkUsage(previous, { ...current, bootId: 'new' }).rxBytesPerSecond, null);
});

test('process parsing handles comm spaces and parentheses; PID reuse resets CPU', () => {
  const fields = Array.from({ length: 22 }, () => '0');
  fields[0] = 'S';
  fields[11] = '100';
  fields[12] = '50';
  fields[19] = '123';
  fields[21] = '2';
  const parsed = parseProcessStat(`42 (my (worker) name) ${fields.join(' ')}`);
  assert.equal(parsed.name, 'my (worker) name');
  assert.equal(parsed.cpuTicks, '150');
  assert.equal(parsed.rssPages, 2n);
  const current = {
    bootId: 'b',
    at: 1000,
    ticksPerSecond: 100,
    partial: false,
    skipped: 0,
    processes: [{ ...parsed, uid: 1000, username: 'mock', rssBytes: 8192 }],
  };
  const next = {
    ...current,
    at: 2000,
    processes: current.processes.map((row) => ({ ...row, cpuTicks: '350' })),
  };
  assert.equal(processUsage(current, next, 16384).processes[0]!.cpuPercent, 200);
  assert.equal(processUsage(current, next, 16384).processes[0]!.memoryPercent, 50);
  assert.equal(
    processUsage(
      current,
      { ...next, processes: next.processes.map((row) => ({ ...row, startTicks: '999' })) },
      null,
    ).processes[0]!.cpuPercent,
    null,
  );
});

test('collector isolates failures, prevents overlapping tasks and preserves sample identity', async () => {
  const sources = createMockSources();
  let finish!: () => void,
    reads = 0;
  sources.tasks.load = async () => {
    reads++;
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return { load1: 1, load5: 1, load15: 1, source: 'mock', collectedAt: new Date().toISOString() };
  };
  sources.tasks.temperature = async () => {
    throw Object.assign(new Error('denied'), { code: 'EACCES' });
  };
  sources.tasks.sessions = async () => {
    throw new Error('logind unavailable');
  };
  const collector = new MetricsCollector(sources);
  try {
    const pending = collector.collect('load');
    await new Promise((resolve) => setImmediate(resolve));
    await collector.collect('load');
    assert.equal(reads, 1);
    assert.equal(collector.diagnostics.missedCollections, 1);
    finish();
    await pending;
    await collector.collect('temperature');
    await collector.collect('sessions');
    await collector.collect('memory');
    assert.equal(collector.get('temperature').quality, 'permission_denied');
    assert.equal(collector.get('sessions').quality, 'unavailable');
    assert.equal(
      collector.get('sessions').data,
      null,
      'Unavailable logind is not zero logged-in users',
    );
    assert.equal(collector.get('memory').quality, 'ok');
    assert.equal(collector.get('load').data!.load1, 1);
    assert.equal(collector.get('load').sequence, collector.get('load').sequence);
  } finally {
    await collector.stop();
  }
});

test('collector timeouts do not allow overlapping retries; stale age uses monotonic time', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 1000;
  t.mock.method(performance, 'now', () => now);
  const sources = createMockSources();
  let release!: () => void;
  sources.tasks.load = async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return { load1: 0, load5: 0, load15: 0, source: 'mock', collectedAt: new Date().toISOString() };
  };
  const collector = new MetricsCollector(sources);
  const pending = collector.collect('load');
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(monitoringPolicy.taskTimeoutMs + 1);
  await pending;
  assert.equal(collector.get('load').reason, 'COLLECTION_TIMEOUT');
  await collector.collect('load');
  assert.equal(collector.diagnostics.missedCollections, 1);
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(collector.get('load').data, null, 'A late result must not overwrite the timeout');
  await collector.collect('memory');
  now += monitoringPolicy.fastIntervalMs * monitoringPolicy.staleMultiplier + 1;
  assert.equal(collector.get('memory').quality, 'stale');
  await collector.stop();
});

test('history uses actual samples only and snapshot-aware process cursors reject stale pages', async () => {
  const sources = createMockSources();
  sources.tasks.processes = async () => ({
    scope: 'mock',
    partial: false,
    skipped: 0,
    windowSeconds: null,
    processes: [1, 2, 3].map((pid) => ({
      id: `b:${pid}:1`,
      pid,
      uid: 1000,
      username: 'mock',
      name: 'worker',
      state: 'S',
      rssBytes: 1,
      memoryPercent: 0,
      memoryReason: null,
      cpuPercent: null,
      cpuReason: 'BASELINE_UNAVAILABLE',
    })),
  });
  const collector = new MetricsCollector(sources);
  try {
    const empty = collector.queryHistory(['cpu'], Date.now() - 900000, Date.now(), 2000);
    assert.equal(empty.series[0]!.points.length, 0);
    await collector.collect('cpu');
    await collector.collect('processes');
    const history = collector.queryHistory(['cpu'], Date.now() - 900000, Date.now() + 1, 2000);
    assert.equal(history.series[0]!.points.length, 1);
    assert.equal(history.series[0]!.insufficientHistory, true);
    const query = { sort: 'pid' as const, direction: 'asc' as const, limit: 1 };
    const first = processPage(collector, query);
    const second = processPage(collector, { ...query, cursor: first.data.nextCursor! });
    assert.equal(second.data.processes[0]!.pid, 2);
    await collector.collect('processes');
    assert.throws(
      () => processPage(collector, { ...query, cursor: first.data.nextCursor! }),
      /snapshot changed/,
    );
  } finally {
    await collector.stop();
  }
});

test('journal parser handles Unicode, multiline messages and best-effort redaction', () => {
  const rows = parseJournal(
    JSON.stringify({
      __CURSOR: 's=abc;i=1',
      __REALTIME_TIMESTAMP: '1700000000000000',
      MESSAGE: 'Привіт\npassword=secret\u0000',
      PRIORITY: '6',
    }),
  );
  assert.equal(rows[0]!.timestamp, '2023-11-14T22:13:20.000Z');
  assert.match(rows[0]!.message, /Привіт\npassword=\[REDACTED\]/);
  assert.doesNotMatch(redactMessage('Bearer abc api_key=xyz'), /abc|xyz/);
});

test('journal denial is unavailable rather than an empty success, and lost cursor requires resync', async () => {
  const service = new LogsService('linux', async () => {
    throw Object.assign(new Error('private path'), { code: 'EACCES' });
  });
  await assert.rejects(
    service.read({ limit: 10 }),
    (error) =>
      error instanceof Error &&
      'statusCode' in error &&
      error.statusCode === 503 &&
      !error.message.includes('private'),
  );
  await assert.rejects(
    service.read({ limit: 10, cursor: 's=gone' }),
    (error) => error instanceof Error && 'statusCode' in error && error.statusCode === 409,
  );
  await assert.rejects(
    service.read({ limit: 10, since: '2026-11-26T01:00:00Z', until: '2026-11-26T00:00:00Z' }),
    (error) => error instanceof Error && 'statusCode' in error && error.statusCode === 400,
  );
});

test('complete monitoring REST shares RAM samples and exposes OpenAPI with bounded queries', async (t) => {
  const sources = createMockSources();
  let reads = 0;
  const memory = sources.tasks.memory;
  sources.tasks.memory = async (signal) => {
    reads++;
    return memory(signal);
  };
  const app = await buildApp({
    provider: new MockSystemProvider(),
    monitoringSources: sources,
    logger: false,
  });
  t.after(() => app.close());
  for (const path of [
    'system/info',
    'system/uptime',
    'system/load',
    'system/cpu',
    'system/disks',
    'system/temperature',
    'system/sessions',
    'network/interfaces',
    'network/traffic',
    'network/connections',
    'processes',
    'services',
    'routing/routes',
    'logs',
    'metrics/current',
  ]) {
    const response = await app.inject(`/api/v1/${path}`);
    assert.equal(response.statusCode, 200, `${path}: ${response.body}`);
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  const first = (await app.inject('/api/v1/system/memory')).json();
  const second = (await app.inject('/api/v1/system/memory')).json();
  assert.deepEqual(first, second);
  assert.equal(reads, 1);
  const current = (await app.inject('/api/v1/metrics/current')).json().data;
  assert.deepEqual(first.data, current.sections.memory.data);
  assert.equal((await app.inject('/api/v1/processes?limit=10000')).statusCode, 400);
  assert.equal((await app.inject('/api/v1/logs?unit=ssh.service')).statusCode, 400);
  assert.equal((await app.inject('/api/v1/network/interfaces?path=/etc/passwd')).statusCode, 400);
  assert.equal((await app.inject('/api/v1/services/unknown.service')).statusCode, 404);
  assert.equal(
    (await app.inject('/api/v1/metrics/history?series=cpu&from=bad&to=bad')).statusCode,
    400,
  );
  const spec = (await app.inject('/api/json')).json();
  assert.ok(spec.paths['/api/v1/metrics/current']);
  assert.ok(spec.paths['/api/v1/network/traffic']);
  assert.equal(spec.security, undefined);
});

test('real WebSocket validates messages, shares samples, unsubscribes and closes cleanly', async (t) => {
  const app = await buildApp({
    provider: new MockSystemProvider(),
    monitoringSources: createMockSources(),
    logger: false,
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  const ws = new WebSocket(`ws://127.0.0.1:${address.port}/api/v1/ws`);
  t.after(async () => {
    ws.terminate();
    await app.close();
  });
  const queue: Record<string, any>[] = [];
  ws.on('message', (raw) => queue.push(JSON.parse(raw.toString())));
  await once(ws, 'open');
  const waitFor = async (type: string) => {
    const end = Date.now() + 3000;
    while (Date.now() < end) {
      const index = queue.findIndex((message) => message.type === type);
      if (index >= 0) return queue.splice(index, 1)[0]!;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Missing ${type}: ${JSON.stringify(queue)}`);
  };
  ws.send('{broken');
  assert.equal((await waitFor('error')).code, 'INVALID_MESSAGE');
  ws.send(JSON.stringify({ type: 'subscribe', requestId: 'bad', topic: 'unknown' }));
  assert.equal((await waitFor('error')).code, 'INVALID_MESSAGE');
  ws.send(
    JSON.stringify({
      type: 'subscribe',
      requestId: 'bad',
      topic: 'system.cpu',
      intervalSeconds: 1,
    }),
  );
  assert.equal((await waitFor('error')).code, 'INVALID_MESSAGE');
  ws.send(
    JSON.stringify({
      type: 'subscribe',
      requestId: '1',
      topic: 'system.memory',
      intervalSeconds: 2,
    }),
  );
  assert.equal((await waitFor('subscribed')).intervalSeconds, 2);
  const snapshot = await waitFor('snapshot');
  const rest = (await app.inject('/api/v1/metrics/current')).json().data.sections.memory;
  assert.deepEqual(snapshot.data, rest);
  assert.equal((await waitFor('update')).sequence, 2);
  ws.send(JSON.stringify({ type: 'unsubscribe', requestId: '2', topic: 'system.memory' }));
  await waitFor('unsubscribed');
  ws.close();
  await once(ws, 'close');
});
