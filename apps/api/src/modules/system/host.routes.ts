import type { FastifyPluginAsync } from 'fastify';
import type { HostService } from './host.service.js';
import { createHostController } from './host.controller.js';
import { infoRouteSchema, loadRouteSchema, uptimeRouteSchema } from './schemas/host.schema.js';
import { noCacheHook } from '../../hooks/no-cache.hook.js';

export const hostRoutes: FastifyPluginAsync<{ service: HostService }> = async (app, options) => {
  const controller = createHostController(options.service);

  app.addHook('onSend', noCacheHook);
  app.get('/info', { schema: infoRouteSchema, handler: controller.getInfo });
  app.get('/load', { schema: loadRouteSchema, handler: controller.getLoad });
  app.get('/uptime', { schema: uptimeRouteSchema, handler: controller.getUptime });
};
