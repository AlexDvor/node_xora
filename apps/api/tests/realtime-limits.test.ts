import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { buildApp } from '../src/app.js';
import { MockSystemProvider } from '../src/infrastructure/linux/mock-system.provider.js';
import { createMockSources } from '../src/infrastructure/linux/monitoring.provider.js';
import { MetricsCollector } from '../src/modules/metrics/collector.service.js';

async function start() {
  const app = await buildApp({
    provider: new MockSystemProvider(),
    monitoringSources: createMockSources(),
    logger: false,
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  return { app, url: `ws://127.0.0.1:${address.port}/api/v1/ws` };
}

test('WebSocket supports all delivery intervals, pause/resume and reconnect', async (t) => {
  const { app, url } = await start();
  const sockets: WebSocket[] = [];
  t.after(async () => {
    for (const ws of sockets) ws.terminate();
    await app.close();
  });
  let previousStream: string | undefined;
  for (let reconnect = 0; reconnect < 2; reconnect++) {
    const ws = new WebSocket(url);
    sockets.push(ws);
    const queue: any[] = [];
    ws.on('message', (raw) => queue.push(JSON.parse(raw.toString())));
    await once(ws, 'open');
    const next = async (type: string) => {
      const end = Date.now() + 2000;
      while (Date.now() < end) {
        const index = queue.findIndex((row) => row.type === type);
        if (index >= 0) return queue.splice(index, 1)[0];
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      throw new Error(`Missing ${type}`);
    };
    for (const intervalSeconds of [2, 5, 10, 30]) {
      ws.send(
        JSON.stringify({
          type: 'subscribe',
          requestId: `i${intervalSeconds}`,
          topic: 'system.cpu',
          intervalSeconds,
        }),
      );
      const ack = await next('subscribed');
      assert.equal(ack.intervalSeconds, intervalSeconds);
      const sample = await next('snapshot');
      if (previousStream) assert.equal(sample.streamId, previousStream);
      previousStream = sample.streamId;
    }
    ws.send(JSON.stringify({ type: 'unsubscribe', requestId: 'pause', topic: 'system.cpu' }));
    await next('unsubscribed');
    ws.send(
      JSON.stringify({
        type: 'subscribe',
        requestId: 'resume',
        topic: 'system.cpu',
        intervalSeconds: 2,
      }),
    );
    await next('subscribed');
    await next('snapshot');
    ws.close();
    await once(ws, 'close');
  }
});

test('WebSocket terminates a peer that does not answer heartbeat', async (t) => {
  const { app, url } = await start();
  t.mock.timers.enable({ apis: ['setInterval'] });
  const ws = new WebSocket(url, { autoPong: false });
  t.after(async () => {
    ws.terminate();
    await app.close();
  });
  await once(ws, 'open');
  const ping = once(ws, 'ping');
  t.mock.timers.tick(15000);
  await ping;
  const close = once(ws, 'close');
  t.mock.timers.tick(15000);
  assert.equal((await close)[0], 1006);
});

test('WebSocket rejects payloads above 4096 bytes', async (t) => {
  const { app, url } = await start();
  const ws = new WebSocket(url);
  ws.on('error', () => {});
  t.after(async () => {
    ws.terminate();
    await app.close();
  });
  await once(ws, 'open');
  const close = once(ws, 'close');
  ws.send('x'.repeat(4097));
  assert.equal((await close)[0], 1009);
});

test('WebSocket sends explicit resync and closes when a snapshot exceeds the outgoing bound', async (t) => {
  const sources = createMockSources();
  const original = sources.tasks.processes;
  sources.tasks.processes = async (signal) => ({
    ...(await original(signal)),
    scope: 'x'.repeat(1024 * 1024),
  });
  const app = await buildApp({
    provider: new MockSystemProvider(),
    monitoringSources: sources,
    logger: false,
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  const ws = new WebSocket(`ws://127.0.0.1:${address.port}/api/v1/ws`);
  t.after(async () => {
    ws.terminate();
    await app.close();
  });
  const messages: any[] = [];
  ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
  await once(ws, 'open');
  const closed = once(ws, 'close');
  ws.send(JSON.stringify({ type: 'subscribe', requestId: 'large', topic: 'processes' }));
  assert.equal((await closed)[0], 1013);
  assert.ok(
    messages.some(
      (message) => message.type === 'resync_required' && message.reason === 'SLOW_CLIENT',
    ),
  );
  assert.equal(
    messages.some((message) => message.type === 'snapshot'),
    false,
  );
});

test('WebSocket connection cap rejects a seventeenth peer without another collector', async (t) => {
  const { app, url } = await start();
  const peers: WebSocket[] = [];
  t.after(async () => {
    for (const peer of peers) peer.terminate();
    await app.close();
  });
  for (let index = 0; index < 16; index++) {
    const peer = new WebSocket(url);
    peers.push(peer);
    await once(peer, 'open');
  }
  const rejected = new WebSocket(url);
  peers.push(rejected);
  const closed = once(rejected, 'close');
  await once(rejected, 'open');
  assert.equal((await closed)[0], 1013);
});

test('history retention bounds raw samples and reports partial gaps', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const sources = createMockSources();
  const collector = new MetricsCollector(sources);
  try {
    for (let i = 0; i < 460; i++) {
      t.mock.timers.tick(2);
      await collector.collect('cpu');
    }
    const now = Date.now();
    const report = collector.queryHistory(['cpu'], now - 900000, now + 1, 2);
    // Distinct 2ms buckets make the raw retention cap observable through the API.
    assert.equal(report.series[0]!.points.length, 451);
    sources.tasks.cpu = async () => {
      throw new Error('source unavailable');
    };
    await collector.collect('cpu');
    const gaps = collector.queryHistory(['cpu'], now - 1000, Date.now() + 1, 2000);
    assert.ok(gaps.series[0]!.points.some((point) => point.mean === null));
  } finally {
    await collector.stop();
  }
});
