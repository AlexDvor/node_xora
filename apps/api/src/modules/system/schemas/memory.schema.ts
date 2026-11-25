import type { FastifySchema } from 'fastify';
import { errorSchema } from '../../../common/schemas/error.schema.js';

export const memoryResponseSchema = {
  type: 'object',
  description: 'Current RAM measurement. This example contains mock data, not server measurements.',
  example: {
    data: {
      totalBytes: 4294967296,
      availableBytes: 3221225472,
      usedBytes: 1073741824,
      usedPercent: 25,
      collectedAt: '2026-11-25T00:00:00.000Z',
      source: 'mock',
    },
  },
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      required: [
        'totalBytes',
        'availableBytes',
        'usedBytes',
        'usedPercent',
        'collectedAt',
        'source',
      ],
      properties: {
        totalBytes: {
          type: 'integer',
          minimum: 1,
          description: 'Usable RAM in bytes (Linux MemTotal).',
        },
        availableBytes: {
          type: 'integer',
          minimum: 0,
          description: 'RAM available to applications in bytes (Linux MemAvailable).',
        },
        usedBytes: {
          type: 'integer',
          minimum: 0,
          description:
            'Used RAM in bytes: totalBytes minus availableBytes; not the sum of process RSS.',
        },
        usedPercent: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: 'usedBytes / totalBytes * 100.',
        },
        collectedAt: {
          type: 'string',
          format: 'date-time',
          description: 'UTC timestamp after collection.',
        },
        source: {
          type: 'string',
          enum: ['linux', 'mock'],
          description: 'Whether values come from Debian or the development mock.',
        },
      },
    },
  },
} as const;

export const memoryRouteSchema = {
  tags: ['System'],
  summary: 'Get current RAM usage',
  description:
    'Reads Linux MemTotal and MemAvailable once per request, converting kB to bytes by multiplying by 1024. Used = total - available. Fully available RAM has zero used bytes and zero used percent. collectedAt is recorded after collection. Mock mode is explicitly identified by source. Missing, unreadable or invalid memory data returns 503; it is never replaced with zero.',
  response: {
    200: memoryResponseSchema,
    503: {
      ...errorSchema,
      description: 'Memory data could not be read or failed validation.',
      example: {
        error: {
          code: 'MEMORY_INFO_UNAVAILABLE',
          message: 'Unable to retrieve memory information',
        },
      },
    },
  },
} satisfies FastifySchema;
