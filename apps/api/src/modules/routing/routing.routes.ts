import { routingRouteSchema } from './routing.schema.js';
import type { FastifyPluginAsync } from 'fastify';
import type { MetricsCollector } from '../metrics/collector.service.js';
import { noCacheHook } from '../../hooks/no-cache.hook.js';
import { resourceHandler } from '../metrics/resource.controller.js';
export const routingRoutes: FastifyPluginAsync<{ collector: MetricsCollector }> = async (
  app,
  { collector },
) => {
  app.addHook('onSend', noCacheHook);
  app.get('/routes', {
    schema: routingRouteSchema,
    handler: resourceHandler(collector, 'routes'),
  });
};
