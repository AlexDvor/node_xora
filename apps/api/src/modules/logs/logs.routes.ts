import type { FastifyPluginAsync } from 'fastify';
import { noCacheHook } from '../../hooks/no-cache.hook.js';
import { logsRouteSchema } from './logs.schema.js';
import { createLogsController } from './logs.controller.js';
import type { LogsService } from './logs.service.js';
import type { JournalQuery } from '../../infrastructure/linux/journal.provider.js';

export const logsRoutes: FastifyPluginAsync<{ service: LogsService }> = async (app, { service }) => {
  app.addHook('onSend', noCacheHook);
  app.get<{ Querystring: JournalQuery }>('/', { schema: logsRouteSchema, handler: createLogsController(service).list });
};
