import type { FastifySchema } from 'fastify';
import { errorSchema } from '../../../common/schemas/error.schema.js';

export const swapResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  description: 'Current swap usage. The example is mock data, not a server measurement.',
  example: {
    data: {
      totalBytes: 1073741824,
      freeBytes: 805306368,
      usedBytes: 268435456,
      usedPercent: 25,
      enabled: true,
      collectedAt: '2026-11-25T00:00:00.000Z',
      source: 'mock',
    },
  },
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      required: [
        'totalBytes',
        'freeBytes',
        'usedBytes',
        'usedPercent',
        'enabled',
        'collectedAt',
        'source',
      ],
      properties: {
        totalBytes: {
          type: 'integer',
          minimum: 0,
          description: 'Total configured swap in bytes (Linux SwapTotal). Zero means disabled.',
        },
        freeBytes: {
          type: 'integer',
          minimum: 0,
          description: 'Free swap in bytes (Linux SwapFree).',
        },
        usedBytes: {
          type: 'integer',
          minimum: 0,
          description: 'Used swap in bytes: totalBytes minus freeBytes.',
        },
        usedPercent: {
          type: 'number',
          nullable: true,
          minimum: 0,
          maximum: 100,
          description: 'usedBytes / totalBytes * 100; null when swap is disabled.',
        },
        enabled: {
          type: 'boolean',
          description:
            'True when totalBytes > 0. Disabled swap has zero byte counts and null percent.',
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

export const swapRouteSchema = {
  tags: ['System'],
  summary: 'Get current swap usage',
  description:
    'Reads Linux SwapTotal and SwapFree once per request, converting kB to bytes by multiplying by 1024. Used = total - free. Disabled swap returns enabled=false, zero byte counts and usedPercent=null. Missing, unreadable or invalid data returns 503, not zero usage. No application credentials or privileged commands are required.',
  response: {
    200: swapResponseSchema,
    503: {
      ...errorSchema,
      description: 'Swap data could not be read or failed validation.',
      example: {
        error: {
          code: 'SWAP_INFO_UNAVAILABLE',
          message: 'Unable to retrieve swap information',
        },
      },
    },
  },
} satisfies FastifySchema;
