import { sampleSchema, responses } from '../../common/schemas/monitoring.schema.js';
import { monitoringExamples } from '../metrics/metrics.examples.js';
import {
  object as objectSchema,
  array,
  string as stringSchema,
  nullableString as nullableStringSchema,
  nullableNumber as nullableNumberSchema,
  count,
  boolean as booleanSchema,
} from '../../common/schemas/monitoring.schema.js';

export const processDataSchema = objectSchema({
  scope: stringSchema,
  partial: booleanSchema,
  skipped: count,
  windowSeconds: nullableNumberSchema,
  processes: array(
    objectSchema({
      id: stringSchema,
      pid: count,
      uid: count,
      username: nullableStringSchema,
      name: stringSchema,
      state: stringSchema,
      rssBytes: count,
      memoryPercent: nullableNumberSchema,
      memoryReason: nullableStringSchema,
      cpuPercent: nullableNumberSchema,
      cpuReason: nullableStringSchema,
    }),
  ),
});

export const processPageSchema = objectSchema({
  ...processDataSchema.properties,
  snapshotId: stringSchema,
  nextCursor: nullableStringSchema,
});

export const processQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sort: {
      type: 'string',
      enum: ['cpuPercent', 'rssBytes', 'pid', 'name'],
      default: 'cpuPercent',
    },
    direction: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
    uid: count,
    search: { type: 'string', maxLength: 128 },
    limit: { type: 'integer', minimum: 1, maximum: 200, default: 100 },
    cursor: { type: 'string', maxLength: 4096 },
  },
} as const;

export const processesRouteSchema = {
  tags: ['Processes'],
  summary: 'Read a bounded process snapshot page',
  description:
    'Safe process name only, no argv/environment. CPU 100% means one logical CPU and may exceed 100. MEM%=RSS/MemTotal, not system RAM%. PID+bootId+startTicks prevents PID reuse. Snapshot-aware cursor returns 409 on snapshot change; restart pagination. UID filter is not login sessions.',
  querystring: processQuerySchema,
  response: responses(
    sampleSchema({
      ...processPageSchema,
      example: {
        ...monitoringExamples.processes,
        snapshotId: 'example-stream:1',
        nextCursor: null,
      },
    }),
  ),
};
