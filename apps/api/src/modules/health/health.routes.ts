import type { FastifyPluginAsync } from 'fastify';
import type { DataResponse } from '../../common/types/api-response.js';
import { healthRouteSchema } from './health.schema.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Reply: DataResponse<{ status: 'ok' }> }>(
    '/health',
    { schema: healthRouteSchema },
    async () => ({ data: { status: 'ok' } }),
  );
};
