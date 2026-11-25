import type { FastifyInstance } from 'fastify';
import { AppError } from '../common/errors/app-error.js';

// Install directly in the root scope; a nested plugin would encapsulate handlers.
export function installErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply
        .code(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    }
    const candidate =
      error instanceof Error && 'statusCode' in error ? error.statusCode : undefined;
    const status =
      typeof candidate === 'number' && candidate >= 400 && candidate < 500 ? candidate : 500;
    if (status === 500) request.log.error({ err: error }, 'Request failed');
    return reply.code(status).send({
      error: {
        code: status === 500 ? 'INTERNAL_SERVER_ERROR' : 'INVALID_REQUEST',
        message: status === 500 ? 'An unexpected error occurred' : 'Invalid request',
      },
    });
  });
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    }),
  );
}
