import Fastify from 'fastify';
import { healthRoutes } from './modules/health/health.routes.js';
import type { SystemProvider } from './infrastructure/linux/system.provider.js';
import { SystemService } from './modules/system/system.service.js';
import { systemRoutes } from './modules/system/system.routes.js';
import { installErrorHandler } from './plugins/error-handler.plugin.js';
import { registerDocumentation } from './plugins/swagger.plugin.js';

export async function buildApp(options: { provider: SystemProvider; logger?: boolean }) {
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 16 * 1024,
  });

  installErrorHandler(app);
  await registerDocumentation(app);

  app.register(healthRoutes, { prefix: '/api/v1' });

  app.register(systemRoutes, {
    prefix: '/api/v1/system',
    service: new SystemService(options.provider),
  });
  return app;
}
