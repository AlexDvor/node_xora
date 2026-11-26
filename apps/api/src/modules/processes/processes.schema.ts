import { sampleSchema, responses } from '../../common/schemas/monitoring.schema.js';
import { monitoringExamples } from '../metrics/metrics.examples.js';
import {
  object as o,
  array,
  string as s,
  nullableString as ns,
  nullableNumber as nn,
  count,
  boolean as b,
} from '../../common/schemas/monitoring.schema.js';
export const processDataSchema = o({
  scope: s,
  partial: b,
  skipped: count,
  windowSeconds: nn,
  processes: array(
    o({
      id: s,
      pid: count,
      uid: count,
      username: ns,
      name: s,
      state: s,
      rssBytes: count,
      memoryPercent: nn,
      memoryReason: ns,
      cpuPercent: nn,
      cpuReason: ns,
    }),
  ),
});
export const processPageSchema = o({
  ...processDataSchema.properties,
  snapshotId: s,
  nextCursor: ns,
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
