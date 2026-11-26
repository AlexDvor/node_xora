import { servicesRouteSchema, serviceDetailRouteSchema } from './services.schema.js';
import type { FastifyPluginAsync } from 'fastify';
import type { MetricsCollector } from '../metrics/collector.service.js';
import { noCacheHook } from '../../hooks/no-cache.hook.js';
import { createServicesController } from './services.controller.js';
export const servicesRoutes: FastifyPluginAsync<{ collector: MetricsCollector }> = async (
  app,
  { collector },
) => {
  app.addHook('onSend', noCacheHook);
  const controller = createServicesController(collector);
  app.get('/', {
    schema: servicesRouteSchema,
    handler: controller.list,
  });
  app.get<{ Params: { name: string }; Querystring: { scope: 'system' | 'user' } }>('/:name', {
    schema: serviceDetailRouteSchema,
    handler: controller.detail,
  });
};
