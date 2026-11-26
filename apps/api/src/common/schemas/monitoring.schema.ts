import { errorSchema } from './error.schema.js';
export const string = { type: 'string' } as const;
export const nullableString = { type: 'string', nullable: true } as const;
export const number = { type: 'number' } as const;
export const nullableNumber = { type: 'number', nullable: true } as const;
export const count = { type: 'integer', minimum: 0 } as const;
export const boolean = { type: 'boolean' } as const;
export const timestamp = { type: 'string', format: 'date-time' } as const;
export const strings = { type: 'array', items: string } as const;
export const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
export const array = (items: unknown) => ({ type: 'array', items });
export const sampleSchema = (data: Record<string, unknown>) => ({
  ...object({
    streamId: string,
    sequence: count,
    collectedAt: { ...timestamp, nullable: true },
    lastSuccessAt: { ...timestamp, nullable: true },
    source: { type: 'string', enum: ['linux', 'mock'] },
    quality: {
      type: 'string',
      enum: ['ok', 'warming_up', 'unavailable', 'permission_denied', 'stale', 'partial'],
    },
    reason: nullableString,
    data: { ...data, nullable: true },
  }),
  ...(data.example
    ? {
        example: {
          streamId: 'example-stream',
          sequence: 1,
          collectedAt: '2026-11-26T00:00:00.000Z',
          lastSuccessAt: '2026-11-26T00:00:00.000Z',
          source: 'mock',
          quality: (data.example as { addressReason?: string }).addressReason ? 'warming_up' : 'ok',
          reason: (data.example as { addressReason?: string }).addressReason
            ? 'BASELINE_UNAVAILABLE'
            : null,
          data: data.example,
        },
      }
    : {}),
});
export const envelope = (data: unknown) => object({ data });
export const responses = (data: unknown) => ({
  200: envelope(data),
  400: errorSchema,
  404: errorSchema,
  409: errorSchema,
  503: errorSchema,
});
export const noQuery = { type: 'object', additionalProperties: false, properties: {} } as const;
