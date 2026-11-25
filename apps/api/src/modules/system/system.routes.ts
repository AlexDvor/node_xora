import type { FastifyPluginAsync } from 'fastify';
import { noCacheHook } from '../../hooks/no-cache.hook.js';
import { createSystemController } from './system.controller.js';
import { memoryRouteSchema } from './schemas/memory.schema.js';
import { swapRouteSchema } from './schemas/swap.schema.js';
import type { SystemService } from './system.service.js';

export const systemRoutes: FastifyPluginAsync<{ service: SystemService }> = async (
  app,
  options,
) => {
  const controller = createSystemController(options.service);
  app.addHook('onSend', noCacheHook);
  app.get('/swap', {
    schema: swapRouteSchema,
    handler: controller.getSwap,
  });
  app.get('/memory', {
    schema: memoryRouteSchema,
    handler: controller.getMemory,
  });
};
