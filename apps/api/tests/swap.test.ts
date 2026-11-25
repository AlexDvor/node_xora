import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { MockSystemProvider } from '../src/infrastructure/linux/mock-system.provider.js';
import {
  parseSwapMeminfo,
  type SystemProvider,
} from '../src/infrastructure/linux/system.provider.js';

test('swap parser converts KiB to bytes independently of RAM fields', () => {
  assert.deepEqual(parseSwapMeminfo('MemTotal: bad kB\nSwapTotal: 1000 kB\nSwapFree: 250 kB\n'), {
    totalBytes: 1024000,
    freeBytes: 256000,
    source: 'linux',
  });
  assert.deepEqual(parseSwapMeminfo('SwapTotal: 0 kB\nSwapFree: 0 kB\n'), {
    totalBytes: 0,
    freeBytes: 0,
    source: 'linux',
  });
});

test('swap parser rejects missing, malformed, duplicate, impossible and unsafe values', () => {
  for (const text of [
    '',
    'SwapTotal: 100 kB',
    'SwapFree: 100 kB',
    'SwapTotal: bad kB\nSwapFree: 10 kB',
    'SwapTotal: 100 kB\nSwapFree: -1 kB',
    'SwapTotal: -1 kB\nSwapFree: 0 kB',
    'SwapTotal: 100 MB\nSwapFree: 10 kB',
    'SwapTotal: 100 kB\nSwapFree: 101 kB',
    'SwapTotal: 0 kB\nSwapFree: 1 kB',
    'SwapTotal: 100 kB\nSwapTotal: 100 kB\nSwapFree: 10 kB',
    'SwapTotal: 100 kB\nSwapFree: 10 kB\nSwapFree: 10 kB',
    'SwapTotal: 9999999999999999999999 kB\nSwapFree: 0 kB',
    'SwapTotal: 100 kB\nSwapFree: 9999999999999999999999 kB',
  ])
    assert.throws(() => parseSwapMeminfo(text));
});

for (const [name, text, usedBytes, usedPercent, enabled] of [
  ['partly used', 'SwapTotal: 1000 kB\nSwapFree: 250 kB', 768000, 75, true],
  ['fully used', 'SwapTotal: 1000 kB\nSwapFree: 0 kB', 1024000, 100, true],
  ['unused', 'SwapTotal: 1000 kB\nSwapFree: 1000 kB', 0, 0, true],
  ['disabled', 'SwapTotal: 0 kB\nSwapFree: 0 kB', 0, null, false],
] as const) {
  test(`swap API returns ${name} swap without credentials`, async (t) => {
    let reads = 0;
    const app = await buildApp({
      logger: false,
      provider: {
        getMemoryInfo: () => new MockSystemProvider().getMemoryInfo(),
        async getSwapInfo() {
          reads++;
          return { ...parseSwapMeminfo(text), source: 'mock' };
        },
      },
    });
    t.after(() => app.close());
    const response = await app.inject('/api/v1/system/swap');
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['www-authenticate'], undefined);
    assert.equal(reads, 1);
    const { collectedAt, ...data } = response.json().data;
    const snapshot = parseSwapMeminfo(text);
    assert.deepEqual(data, {
      totalBytes: snapshot.totalBytes,
      freeBytes: snapshot.freeBytes,
      usedBytes,
      usedPercent,
      enabled,
      source: 'mock',
    });
    assert.equal(new Date(collectedAt).toISOString(), collectedAt);
  });
}

test('swap read or parse failures return 503 without leaking internals or breaking RAM', async (t) => {
  for (const getSwapInfo of [
    async () => {
      throw new Error('EACCES secret /proc/meminfo');
    },
    async () => parseSwapMeminfo('SwapTotal: 100 kB'),
  ]) {
    const provider: SystemProvider = {
      getMemoryInfo: () => new MockSystemProvider().getMemoryInfo(),
      getSwapInfo,
    };
    const app = await buildApp({ provider, logger: false });
    t.after(() => app.close());
    const response = await app.inject('/api/v1/system/swap');
    assert.equal(response.statusCode, 503);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.deepEqual(response.json(), {
      error: { code: 'SWAP_INFO_UNAVAILABLE', message: 'Unable to retrieve swap information' },
    });
    assert.equal((await app.inject('/api/v1/system/memory')).statusCode, 200);
  }
});

test('OpenAPI documents swap units, nullable percent, examples and public access', async (t) => {
  const app = await buildApp({ provider: new MockSystemProvider(), logger: false });
  t.after(() => app.close());
  const spec = (await app.inject('/api/json')).json();
  const swap = spec.paths['/api/v1/system/swap'].get;
  assert.equal(swap.security, undefined);
  assert.deepEqual(Object.keys(swap.responses).sort(), ['200', '503']);
  const schema = swap.responses['200'].content['application/json'].schema;
  const fields = schema.properties.data.properties;
  assert.deepEqual([...schema.properties.data.required].sort(), Object.keys(fields).sort());
  for (const name of ['totalBytes', 'freeBytes', 'usedBytes']) {
    assert.equal(fields[name].type, 'integer');
    assert.equal(fields[name].minimum, 0);
    assert.match(fields[name].description, /bytes/);
  }
  assert.equal(fields.usedPercent.nullable, true);
  assert.equal(fields.usedPercent.minimum, 0);
  assert.equal(fields.usedPercent.maximum, 100);
  assert.equal(fields.enabled.type, 'boolean');
  assert.equal(fields.collectedAt.format, 'date-time');
  assert.deepEqual(fields.source.enum, ['linux', 'mock']);
  const response = await app.inject('/api/v1/system/swap');
  assert.equal(response.statusCode, 200);
  const { collectedAt, ...actual } = response.json().data;
  const { collectedAt: exampleTimestamp, ...example } = schema.example.data;
  assert.deepEqual(example, actual);
  assert.equal(new Date(exampleTimestamp).toISOString(), exampleTimestamp);
  assert.ok(Number.isFinite(Date.parse(collectedAt)));
  assert.deepEqual(swap.responses['503'].content['application/json'].schema.example, {
    error: { code: 'SWAP_INFO_UNAVAILABLE', message: 'Unable to retrieve swap information' },
  });
});
