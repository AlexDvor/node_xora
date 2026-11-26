import { dataSchemas, currentSchema } from '../modules/metrics/metrics.schema.js';
import { logsDataSchema } from '../modules/logs/logs.schema.js';
import {
  sampleSchema,
  object,
  string,
  count,
  nullableString,
  timestamp,
} from '../common/schemas/monitoring.schema.js';
import type { Resource } from '../modules/metrics/metrics.types.js';
export const topicResources: Record<string, Resource> = {
  'system.memory': 'memory',
  'system.swap': 'swap',
  'system.cpu': 'cpu',
  'system.load': 'load',
  'system.uptime': 'uptime',
  'system.disks': 'disks',
  'system.temperature': 'temperature',
  'system.sessions': 'sessions',
  'network.traffic': 'network',
  'network.interfaces': 'network',
  'network.connections': 'connections',
  processes: 'processes',
  services: 'services',
  'routing.routes': 'routes',
};
export const topics = [...Object.keys(topicResources), 'metrics.current', 'logs'];
export const clientMessageSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'requestId', 'topic'],
  properties: {
    type: { type: 'string', enum: ['subscribe', 'unsubscribe'] },
    requestId: { type: 'string', minLength: 1, maxLength: 64 },
    topic: { type: 'string', enum: topics },
    intervalSeconds: { type: 'integer', enum: [2, 5, 10, 30] },
  },
} as const;
export interface ClientMessage {
  type: 'subscribe' | 'unsubscribe';
  requestId: string;
  topic: string;
  intervalSeconds?: number;
}
export function serverMessageSchema(topic: string) {
  const resource = topicResources[topic];
  const data = resource
    ? sampleSchema(dataSchemas[resource])
    : topic === 'logs'
      ? logsDataSchema
      : currentSchema;
  return object({
    protocolVersion: { type: 'integer', const: 1 },
    type: string,
    topic: string,
    subscriptionId: string,
    requestId: nullableString,
    streamId: string,
    sequence: count,
    collectedAt: { ...timestamp, nullable: true },
    data,
  });
}
