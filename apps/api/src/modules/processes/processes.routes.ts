import { processesRouteSchema } from './processes.schema.js';
import type { FastifyPluginAsync } from 'fastify';
import type { MetricsCollector } from '../metrics/collector.service.js';
import { noCacheHook } from '../../hooks/no-cache.hook.js';
import { createProcessesController } from './processes.controller.js';
import type { ProcessQuery } from './processes.types.js';

export const processesRoutes: FastifyPluginAsync<{ collector: MetricsCollector }> = async (
  app,
  { collector },
) => {
  app.addHook('onSend', noCacheHook);
  app.get<{ Querystring: ProcessQuery }>('/', {
    schema: processesRouteSchema,
    handler: createProcessesController(collector).list,
  });
};
