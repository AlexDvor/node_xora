import { networkRouteSchema } from './network.schema.js';
import type { FastifyPluginAsync } from 'fastify';
import type { MetricsCollector } from '../metrics/collector.service.js';
import { resourceHandler } from '../metrics/resource.controller.js';
import { noCacheHook } from '../../hooks/no-cache.hook.js';
export const networkRoutes: FastifyPluginAsync<{ collector: MetricsCollector }> = async (
  app,
  { collector },
) => {
  app.addHook('onSend', noCacheHook);
  for (const [path, resource] of [
    ['interfaces', 'network'],
    ['traffic', 'network'],
    ['connections', 'connections'],
  ] as const) {
    app.get(`/${path}`, {
      schema: networkRouteSchema(path, resource),
      handler: resourceHandler(collector, resource),
    });
  }
};
