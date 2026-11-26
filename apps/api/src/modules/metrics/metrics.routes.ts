import { currentRouteSchema, historyRouteSchema } from './metrics.schema.js';
import type { FastifyPluginAsync } from 'fastify';
import type { MetricsCollector } from './collector.service.js';
import { noCacheHook } from '../../hooks/no-cache.hook.js';
import { createMetricsController, type HistoryQuery } from './metrics.controller.js';
export const metricsRoutes: FastifyPluginAsync<{ collector: MetricsCollector }> = async (
  app,
  { collector },
) => {
  app.addHook('onSend', noCacheHook);
  const controller = createMetricsController(collector);
  app.get('/current', {
    schema: currentRouteSchema,
    handler: controller.current,
  });
  app.get<{ Querystring: HistoryQuery }>('/history', {
    schema: historyRouteSchema,
    handler: controller.history,
  });
};
