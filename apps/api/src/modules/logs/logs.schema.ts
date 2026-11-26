import {
  object as objectSchema,
  array,
  string as stringSchema,
  nullableString as nullableStringSchema,
  count,
  boolean as booleanSchema,
  timestamp,
  responses,
} from '../../common/schemas/monitoring.schema.js';

export const logEntrySchema = objectSchema({
  cursor: stringSchema,
  timestamp,
  bootId: nullableStringSchema,
  priority: { ...count, nullable: true, maximum: 7 },
  unit: stringSchema,
  identifier: nullableStringSchema,
  pid: { ...count, nullable: true },
  message: stringSchema,
});

export const logsDataSchema = objectSchema({
  scope: stringSchema,
  entries: array(logEntrySchema),
  nextCursor: nullableStringSchema,
  hasMore: booleanSchema,
  direction: stringSchema,
  gaps: nullableStringSchema,
});

export const logsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    unit: { type: 'string', enum: ['nodexora-api.service'] },
    limit: { type: 'integer', minimum: 1, maximum: 200, default: 100 },
    cursor: { type: 'string', minLength: 1, maxLength: 2048, pattern: '^[A-Za-z0-9=;_-]+$' },
    priority: { type: 'integer', minimum: 0, maximum: 7 },
    since: timestamp,
    until: timestamp,
  },
} as const;

export const logsRouteSchema = {
  tags: ['Logs'],
  summary: 'Read the NodeXora user journal',
  description:
    'Only nodexora-api.service. Forward cursor pagination, oldest to newest within page. Without cursor starts at recent entries. Rotation may invalidate cursors (409); begin a new query. Redaction is best effort; application code must never log credentials. No filesystem paths or arbitrary units accepted.',
  querystring: logsQuerySchema,
  response: responses(logsDataSchema),
};
