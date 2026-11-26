import { systemMonitoringSchema } from './schemas/monitoring.schema.js';
import type { FastifyPluginAsync } from 'fastify';
import type { MetricsCollector } from '../metrics/collector.service.js';
import { resourceHandler } from '../metrics/resource.controller.js';
import { noCacheHook } from '../../hooks/no-cache.hook.js';

export const systemMonitoringRoutes: FastifyPluginAsync<{ collector: MetricsCollector }> = async (
  app,
  { collector },
) => {
  app.addHook('onSend', noCacheHook);

  for (const resource of ['cpu', 'disks', 'temperature', 'sessions'] as const) {
    app.get(`/${resource}`, {
      schema: systemMonitoringSchema(resource),
      handler: resourceHandler(collector, resource),
    });
  }
};
