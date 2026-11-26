import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { MockSystemProvider } from '../src/infrastructure/linux/mock-system.provider.js';
import {
  MockHostProvider,
  parseOsRelease,
  parseUptime,
} from '../src/infrastructure/linux/host.provider.js';

test('host parsers handle quoted OS identity, missing metadata and boot identity', () => {
  assert.deepEqual(parseOsRelease('ID=debian\nPRETTY_NAME="Debian GNU/Linux"\nVERSION_ID="13"'), {
    id: 'debian',
    name: 'Debian GNU/Linux',
    version: '13',
  });
  assert.deepEqual(parseOsRelease(''), { id: null, name: null, version: null });
  const bootId = '00000000-0000-0000-0000-000000000001';
  const parsed = parseUptime('125.5 250.0', 'cpu 1 2 3\nbtime 1700000000\n', bootId);
  assert.equal(parsed.uptimeSeconds, 125.5);
  assert.equal(parsed.bootTime, '2023-11-14T22:13:20.000Z');
  assert.equal(parsed.bootId, bootId);
  for (const [uptime, stat, boot] of [
    ['invalid', 'btime 1', bootId],
    ['-1', 'btime 1', bootId],
    ['1', '', bootId],
    ['1', 'btime 1', 'invalid'],
  ]) {
    assert.throws(() => parseUptime(uptime!, stat!, boot!));
  }
});

test('host endpoints expose typed public responses, units and failures', async (t) => {
  const hostProvider = new MockHostProvider();
  const app = await buildApp({ provider: new MockSystemProvider(), hostProvider, logger: false });
  t.after(() => app.close());
  for (const route of ['info', 'load', 'uptime']) {
    const response = await app.inject(`/api/v1/system/${route}`);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.json().data.source, 'mock');
  }
  assert.equal((await app.inject('/api/v1/system/load')).json().data.load1, 0.1);
  assert.equal((await app.inject('/api/v1/system/uptime')).json().data.uptimeSeconds, 120);
  const spec = (await app.inject('/api/json')).json();
  assert.match(spec.paths['/api/v1/system/load'].get.description, /not CPU percentages/);
  hostProvider.getLoadInfo = async () => {
    throw new Error('Private diagnostic');
  };
  const failure = await app.inject('/api/v1/system/load');
  assert.equal(failure.statusCode, 503);
  assert.deepEqual(failure.json(), {
    error: { code: 'LOAD_INFO_UNAVAILABLE', message: 'Unable to retrieve system information' },
  });
});
