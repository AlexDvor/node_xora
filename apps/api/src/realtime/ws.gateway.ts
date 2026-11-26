import type { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { Ajv } from 'ajv';
import fastJson from 'fast-json-stringify';
import type { MetricsCollector } from '../modules/metrics/collector.service.js';
import { JournalFeed } from './journal-feed.js';
import {
  clientMessageSchema,
  serverMessageSchema,
  topicResources,
  topics,
  type ClientMessage,
} from './ws.schema.js';
import { monitoringPolicy as policy } from '../config/monitoring.js';

export function exceedsBackpressure(bufferedBytes: number, messageBytes: number) {
  return bufferedBytes + messageBytes > policy.maxWsBufferedBytes;
}

export async function registerRealtime(app: FastifyInstance, collector: MetricsCollector) {
  await app.register(websocket, {
    options: { maxPayload: policy.maxWsPayload, perMessageDeflate: false },
  });

  const sockets = new Set<WebSocket>();
  const feed = new JournalFeed(collector.sources.source);
  const validate = new Ajv({ strict: true }).compile(clientMessageSchema);
  const serializers = new Map(
    topics.map((topic) => [
      topic,
      fastJson(serverMessageSchema(topic) as Parameters<typeof fastJson>[0]),
    ]),
  );

  app.addHook('onClose', async () => {
    feed.stop();

    for (const socket of sockets) socket.terminate();
  });
  app.get('/api/v1/ws', { websocket: true, schema: { hide: true } }, (socket) => {
    if (sockets.size >= policy.maxConnections) {
      socket.close(1013, 'Connection limit');

      return;
    }

    sockets.add(socket);

    const subscriptions = new Map<
      string,
      { id: string; interval: number; lastSent: number; sequence: number; quality: string | null }
    >();
    let alive = true;
    let cleaned = false;

    const send = (message: unknown) => {
      if (socket.readyState !== 1) return;

      const encoded = typeof message === 'string' ? message : JSON.stringify(message);

      if (exceedsBackpressure(socket.bufferedAmount, Buffer.byteLength(encoded))) {
        socket.send(
          JSON.stringify({
            protocolVersion: 1,
            type: 'resync_required',
            reason: 'SLOW_CLIENT',
            streamId: collector.streamId,
          }),
        );
        socket.close(1013, 'Slow client; reconnect and resync');

        return;
      }

      socket.send(encoded);
    };

    const deliver = (
      topic: string,
      type: 'snapshot' | 'update',
      requestId: string | null = null,
    ) => {
      const subscription = subscriptions.get(topic);

      if (!subscription || topic === 'logs') return;

      const resource = topicResources[topic];
      const sample = resource ? collector.get(resource) : null;
      // metrics.current has no synthetic collection timestamp; each section owns its time.
      const sequence = sample?.sequence ?? collector.current().sequence;

      if (
        type === 'update' &&
        sequence <= subscription.sequence &&
        sample?.quality === subscription.quality
      )
        return;

      const data = sample ?? collector.current();

      send(
        serializers.get(topic)!({
          protocolVersion: 1,
          type,
          topic,
          subscriptionId: subscription.id,
          requestId,
          streamId: collector.streamId,
          sequence,
          collectedAt: sample?.collectedAt ?? null,
          data,
        }),
      );
      subscription.sequence = sequence;
      subscription.quality = sample?.quality ?? null;
      subscription.lastSent = performance.now();
    };

    const onPage = (data: unknown, sequence: number) => {
      const sub = subscriptions.get('logs');

      if (sub)
        send(
          serializers.get('logs')!({
            protocolVersion: 1,
            type: 'update',
            topic: 'logs',
            subscriptionId: sub.id,
            requestId: null,
            streamId: collector.streamId,
            sequence,
            collectedAt: null,
            data,
          }),
        );
    };

    const onGap = () => {
      if (subscriptions.has('logs'))
        send({
          protocolVersion: 1,
          type: 'resync_required',
          topic: 'logs',
          streamId: collector.streamId,
          reason: 'JOURNAL_GAP',
        });
    };

    feed.on('page', onPage);
    feed.on('gap', onGap);

    const updates = setInterval(() => {
      try {
        for (const [topic, sub] of subscriptions)
          if (performance.now() - sub.lastSent >= sub.interval) deliver(topic, 'update');
      } catch {
        send({ protocolVersion: 1, type: 'error', code: 'SERIALIZATION_FAILED' });
      }
    }, 250);
    const heartbeat = setInterval(() => {
      if (!alive) {
        socket.terminate();

        return;
      }

      alive = false;
      socket.ping();
    }, policy.heartbeatMs);

    socket.on('pong', () => {
      alive = true;
    });
    socket.on('error', () => cleanup());

    function cleanup() {
      if (cleaned) return;

      cleaned = true;
      clearInterval(updates);
      clearInterval(heartbeat);

      if (subscriptions.has('logs')) feed.release();

      subscriptions.clear();
      feed.off('page', onPage);
      feed.off('gap', onGap);
      sockets.delete(socket);
    }

    socket.on('close', cleanup);
    // Install immediately: do not await I/O before binding the message handler.
    socket.on('message', (raw, binary) => {
      try {
        if (binary) throw new Error('Binary message');

        const message: unknown = JSON.parse(raw.toString());

        if (!validate(message)) throw new Error('Invalid message');

        const { type, requestId, topic, intervalSeconds } = message as ClientMessage;

        if (type === 'unsubscribe') {
          if (topic === 'logs' && subscriptions.has(topic)) feed.release();

          subscriptions.delete(topic);
          send({ protocolVersion: 1, type: 'unsubscribed', requestId, topic });

          return;
        }
        if (!subscriptions.has(topic) && subscriptions.size >= policy.maxSubscriptions)
          throw new Error('Subscription limit');

        const existing = subscriptions.get(topic);
        const sub = {
          id: existing?.id ?? randomUUID(),
          interval: (intervalSeconds ?? 5) * 1000,
          lastSent: 0,
          sequence: -1,
          quality: null as string | null,
        };

        subscriptions.set(topic, sub);
        send({
          protocolVersion: 1,
          type: 'subscribed',
          requestId,
          topic,
          subscriptionId: sub.id,
          intervalSeconds: intervalSeconds ?? 5,
          streamId: collector.streamId,
        });

        if (topic === 'logs') {
          if (!existing) feed.acquire();

          send({
            protocolVersion: 1,
            type: 'resync_required',
            topic,
            reason: 'LOAD_RECENT_LOGS_VIA_REST',
            streamId: collector.streamId,
          });
        } else deliver(topic, 'snapshot', requestId);
      } catch {
        send({
          protocolVersion: 1,
          type: 'error',
          code: 'INVALID_MESSAGE',
          message: 'Expected subscribe/unsubscribe with a known topic and interval 2/5/10/30',
        });
      }
    });
  });
}
