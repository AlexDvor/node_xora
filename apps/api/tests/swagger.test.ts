import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { MockSystemProvider } from '../src/infrastructure/linux/mock-system.provider.js';

test('API entry serves Swagger and local assets over LAN HTTP', async (t) => {
  const app = await buildApp({
    provider: new MockSystemProvider(),
    logger: false,
  });
  t.after(() => app.close());
  const root = await app.inject('/');
  assert.equal(root.statusCode, 302);
  assert.equal(root.headers.location, '/api/');
  const page = await app.inject('/api/');
  assert.equal(page.statusCode, 200);
  assert.match(page.headers['content-type']!, /text\/html/);
  assert.match(page.body, /swagger-ui/i);
  assert.ok(page.headers['content-security-policy']);
  assert.doesNotMatch(String(page.headers['content-security-policy']), /upgrade-insecure-requests/);
  const css = await app.inject('/api/static/swagger-ui.css');
  assert.equal(css.statusCode, 200);
  assert.match(css.headers['content-type']!, /text\/css/);
  const initializer = await app.inject('/api/static/swagger-initializer.js');
  assert.equal(initializer.statusCode, 200);
});

test('OpenAPI documents public monitoring routes without security requirements', async (t) => {
  const app = await buildApp({
    provider: new MockSystemProvider(),
    logger: false,
  });
  t.after(() => app.close());
  const response = await app.inject('/api/json');
  assert.equal(response.statusCode, 200);
  const spec = response.json();
  assert.equal(spec.openapi, '3.0.3');
  assert.deepEqual(Object.keys(spec.paths).sort(), [
    '/api/v1/health',
    '/api/v1/system/memory',
    '/api/v1/system/swap',
  ]);
  assert.equal(spec.paths['/api/v1/health'].get.security, undefined);
  const memory = spec.paths['/api/v1/system/memory'].get;
  assert.equal(memory.security, undefined);
  assert.equal(spec.security, undefined);
  assert.equal(spec.components?.securitySchemes, undefined);
  for (const status of ['200', '503']) assert.ok(memory.responses[status]);
  assert.equal(memory.responses['401'], undefined);
  assert.deepEqual(spec.servers, [{ url: '/', description: 'Current server' }]);
  const memoryResponse = await app.inject('/api/v1/system/memory');
  assert.equal(memoryResponse.statusCode, 200);
  const successSchema = memory.responses['200'].content['application/json'].schema;
  const fields = successSchema.properties.data.properties;
  for (const name of ['totalBytes', 'availableBytes', 'usedBytes']) {
    assert.equal(fields[name].type, 'integer');
    assert.match(fields[name].description, /bytes/);
  }
  assert.equal(fields.usedPercent.minimum, 0);
  assert.equal(fields.usedPercent.maximum, 100);
  assert.equal(fields.collectedAt.format, 'date-time');
  assert.match(fields.collectedAt.description, /UTC/);
  assert.deepEqual(fields.source.enum, ['linux', 'mock']);
  const { collectedAt, ...actualValues } = memoryResponse.json().data;
  const { collectedAt: exampleTimestamp, ...exampleValues } = successSchema.example.data;
  assert.deepEqual(exampleValues, actualValues);
  assert.equal(new Date(exampleTimestamp).toISOString(), exampleTimestamp);
  assert.ok(Number.isFinite(Date.parse(collectedAt)));

  const failedApp = await buildApp({
    logger: false,
    provider: {
      getSwapInfo: () => new MockSystemProvider().getSwapInfo(),
      async getMemoryInfo() {
        throw new Error('Synthetic provider failure');
      },
    },
  });
  t.after(() => failedApp.close());
  const failure = await failedApp.inject('/api/v1/system/memory');
  assert.equal(failure.statusCode, 503);
  const failureSchema = memory.responses['503'].content['application/json'].schema;
  assert.deepEqual(failureSchema.example, failure.json());
});
