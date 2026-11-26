import { responses, noQuery } from '../../common/schemas/monitoring.schema.js';
import {
  object as o,
  array,
  string as s,
  nullableString as ns,
  number as n,
  nullableNumber as nn,
  count,
  boolean as b,
  timestamp,
  strings,
  sampleSchema,
} from '../../common/schemas/monitoring.schema.js';
import { memoryResponseSchema } from '../system/schemas/memory.schema.js';
import { swapResponseSchema } from '../system/schemas/swap.schema.js';
import {
  infoRouteSchema,
  loadRouteSchema,
  uptimeRouteSchema,
} from '../system/schemas/host.schema.js';
import {
  cpuDataSchema,
  disksDataSchema,
  temperatureDataSchema,
  sessionDataSchema,
} from '../system/schemas/monitoring.schema.js';
import { networkDataSchema, connectionsDataSchema } from '../network/network.schema.js';
import { processDataSchema } from '../processes/processes.schema.js';
import { servicesDataSchema } from '../services/services.schema.js';
import { routesDataSchema } from '../routing/routing.schema.js';
import type { Resource } from './metrics.types.js';
import { monitoringExamples } from './metrics.examples.js';

// Host schemas are shared with their direct REST contracts; no second OpenAPI document.
function hostData(schema: typeof infoRouteSchema): Record<string, unknown> {
  return (
    schema.response as Record<number, { properties: { data: Record<string, unknown> } }>
  )[200]!.properties.data;
}
export const dataSchemas: Record<Resource, Record<string, unknown>> = {
  memory: memoryResponseSchema.properties.data,
  swap: swapResponseSchema.properties.data,
  info: hostData(infoRouteSchema),
  load: hostData(loadRouteSchema),
  uptime: hostData(uptimeRouteSchema),
  cpu: cpuDataSchema,
  disks: disksDataSchema,
  temperature: temperatureDataSchema,
  network: networkDataSchema,
  connections: connectionsDataSchema,
  processes: processDataSchema,
  services: servicesDataSchema,
  sessions: sessionDataSchema,
  routes: routesDataSchema,
};
const capability = o({ available: b, quality: s, reason: ns });
for (const name of Object.keys(dataSchemas) as Resource[])
  dataSchemas[name]!.example = monitoringExamples[name];
export const currentSchema = o({
  schemaVersion: { type: 'integer', const: 1 },
  streamId: s,
  sequence: count,
  runtime: o({
    rssBytes: count,
    heapUsedBytes: count,
    cpuUserMicroseconds: count,
    cpuSystemMicroseconds: count,
    eventLoopDelayMeanMs: nn,
    eventLoopDelayMaxMs: nn,
  }),
  sections: o(
    Object.fromEntries(
      Object.entries(dataSchemas).map(([name, schema]) => [name, sampleSchema(schema)]),
    ),
  ),
  capabilities: o(Object.fromEntries(Object.keys(dataSchemas).map((name) => [name, capability]))),
  diagnostics: o({
    missedCollections: count,
    timedOutCollections: count,
    durationsMs: { type: 'object', additionalProperties: n },
  }),
});
export const historyQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['series', 'from', 'to'],
  properties: {
    series: { type: 'string', minLength: 1, maxLength: 4096 },
    from: timestamp,
    to: timestamp,
    resolutionSeconds: { type: 'integer', minimum: 2, maximum: 900, default: 2 },
  },
} as const;
export const historyDataSchema = o({
  streamId: s,
  retentionSeconds: count,
  persistent: b,
  availableSeries: strings,
  series: array(
    o({
      name: s,
      availableFrom: ns,
      availableTo: ns,
      insufficientHistory: b,
      points: array(
        o({
          windowStart: timestamp,
          collectedAt: timestamp,
          sequence: count,
          quality: s,
          mean: nn,
          min: nn,
          max: nn,
        }),
      ),
    }),
  ),
});

export const historyRouteSchema = {
  tags: ['Metrics'],
  summary: 'Read bounded in-memory history',
  description:
    '15-minute nonpersistent history, at most 8 series and 1000 aggregate points. Fixed series cpu,memory,swap,rx,tx; temperature:<sensorId> is discovered in current snapshot. Bucket timestamp is last actual measurement; windowStart identifies aggregation window. Any missing value keeps mean/min/max null. No fabricated pre-start points; no interpolation. Deduplicate live boundary with streamId+resource sequence.',
  querystring: historyQuerySchema,
  response: responses(historyDataSchema),
};

export const currentRouteSchema = {
  tags: ['Metrics'],
  summary: 'Read the shared monitoring snapshot',
  description:
    'Per-resource timestamps and quality. Sources are collected independently, not atomically. schemaVersion=1; streamId changes after API restart. History selection never changes current values.',
  querystring: noQuery,
  response: responses(currentSchema),
};
