import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { readConfig } from '../src/config/env.js';
import { parseMeminfo, type SystemProvider } from '../src/infrastructure/linux/system.provider.js';
import { SystemService } from '../src/modules/system/system.service.js';
import { MockSystemProvider } from '../src/infrastructure/linux/mock-system.provider.js';

const provider: SystemProvider = {
  getSwapInfo: () => new MockSystemProvider().getSwapInfo(),
  async getMemoryInfo() {
    return { totalBytes: 8192, availableBytes: 2048, source: 'mock' };
  },
};

test('meminfo uses MemAvailable rather than MemFree and converts KiB to bytes', () => {
  assert.deepEqual(parseMeminfo('MemTotal: 1000 kB\nMemFree: 10 kB\nMemAvailable: 400 kB\n'), {
    totalBytes: 1024000,
    availableBytes: 409600,
    source: 'linux',
  });
});

test('meminfo rejects missing, malformed, impossible and duplicate values', () => {
  for (const text of [
    'MemTotal: 100 kB',
    'MemTotal: 0 kB\nMemAvailable: 0 kB',
    'MemTotal: 100 kB\nMemAvailable: 101 kB',
    'MemTotal: bad kB\nMemAvailable: 10 kB',
    'MemTotal: 100 kB\nMemAvailable: -1 kB',
    'MemTotal: 100 kB\nMemTotal: 100 kB\nMemAvailable: 10 kB',
    'MemTotal: 9999999999999999999999 kB\nMemAvailable: 10 kB',
  ])
    assert.throws(() => parseMeminfo(text));
});

test('service calculates memory usage and timestamps the measurement', async () => {
  const memory = await new SystemService(provider).getMemoryInfo();
  assert.equal(memory.usedBytes, 6144);
  assert.equal(memory.usedPercent, 75);
  assert.ok(Number.isFinite(Date.parse(memory.collectedAt)));
});

test('health and RAM are available without credentials', async (t) => {
  let calls = 0;
  const app = await buildApp({
    logger: false,
    provider: {
      getSwapInfo: provider.getSwapInfo,
      async getMemoryInfo() {
        calls++;
        return provider.getMemoryInfo();
      },
    },
  });
  t.after(() => app.close());
  const health = await app.inject('/api/v1/health');
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.json(), { data: { status: 'ok' } });
  assert.equal(calls, 0);
  const memory = await app.inject('/api/v1/system/memory');
  assert.equal(memory.statusCode, 200);
  assert.equal(memory.headers['www-authenticate'], undefined);
  assert.equal(memory.headers['cache-control'], 'no-store');
  assert.equal(calls, 1);
});

test('fully available memory returns zero usage through the API', async (t) => {
  const app = await buildApp({
    logger: false,
    provider: {
      getSwapInfo: provider.getSwapInfo,
      async getMemoryInfo() {
        // Synthetic meminfo exercises parsing without reading the host OS.
        return {
          ...parseMeminfo('MemTotal: 1000 kB\nMemAvailable: 1000 kB\n'),
          source: 'mock',
        };
      },
    },
  });
  t.after(() => app.close());
  const response = await app.inject('/api/v1/system/memory');
  assert.equal(response.statusCode, 200);
  const { data } = response.json();
  assert.equal(data.totalBytes, 1024000);
  assert.equal(data.availableBytes, data.totalBytes);
  assert.equal(data.usedBytes, 0);
  assert.equal(data.usedPercent, 0);
  assert.equal(data.source, 'mock');
  assert.equal(new Date(data.collectedAt).toISOString(), data.collectedAt);
});

test('memory response follows the response contract', async (t) => {
  const app = await buildApp({ provider, logger: false });
  t.after(() => app.close());
  const response = await app.inject({
    url: '/api/v1/system/memory',
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(
    Object.keys(response.json().data).sort(),
    ['totalBytes', 'availableBytes', 'usedBytes', 'usedPercent', 'collectedAt', 'source'].sort(),
  );
  assert.equal(response.json().data.usedPercent, 75);
  assert.equal(response.json().data.source, 'mock');
});

test('provider failure returns 503 without leaking Linux paths or internal details', async (t) => {
  const app = await buildApp({
    logger: false,
    provider: {
      getSwapInfo: provider.getSwapInfo,
      async getMemoryInfo() {
        throw new Error('secret /proc/meminfo diagnostic');
      },
    },
  });
  t.after(() => app.close());
  const response = await app.inject({
    url: '/api/v1/system/memory',
  });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    error: {
      code: 'MEMORY_INFO_UNAVAILABLE',
      message: 'Unable to retrieve memory information',
    },
  });
});

test('unknown routes use the standard error envelope', async (t) => {
  const app = await buildApp({ provider, logger: false });
  t.after(() => app.close());
  const response = await app.inject('/missing');
  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.code, 'NOT_FOUND');
});

test('config needs no credentials and rejects invalid ports and providers', () => {
  assert.deepEqual(readConfig({}), { port: 3000, provider: 'linux', host: '127.0.0.1' });
  for (const PORT of ['0', '65536', '3.5', 'invalid']) {
    assert.throws(() => readConfig({ PORT }));
  }
  assert.throws(() => readConfig({ SYSTEM_PROVIDER: 'unknown' }));
  assert.equal(readConfig({ SYSTEM_PROVIDER: 'mock' }).provider, 'mock');
});
