import type { FastifySchema } from 'fastify';

export const healthRouteSchema = {
  tags: ['Health'],
  summary: 'Check API liveness',
  description: 'Checks that the API responds. Does not verify availability of Linux metrics.',
  response: {
    200: {
      type: 'object',
      required: ['data'],
      additionalProperties: false,
      properties: {
        data: {
          type: 'object',
          required: ['status'],
          additionalProperties: false,
          properties: { status: { type: 'string', enum: ['ok'] } },
        },
      },
    },
  },
} satisfies FastifySchema;
