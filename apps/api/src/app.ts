import Fastify from 'fastify';
import { healthRoutes } from './modules/health/health.routes.js';
import type { SystemProvider } from './infrastructure/linux/system.provider.js';
import { SystemService } from './modules/system/system.service.js';
import { systemRoutes } from './modules/system/system.routes.js';
import { installErrorHandler } from './plugins/error-handler.plugin.js';
import { registerDocumentation } from './plugins/swagger.plugin.js';
import type { HostProvider } from './infrastructure/linux/host.provider.js';
import { HostService } from './modules/system/host.service.js';
import { hostRoutes } from './modules/system/host.routes.js';
import { MetricsCollector } from './modules/metrics/collector.service.js';
import type { MonitoringSources } from './modules/metrics/metrics.types.js';
import { metricsRoutes } from './modules/metrics/metrics.routes.js';
import { systemMonitoringRoutes } from './modules/system/monitoring.routes.js';
import { networkRoutes } from './modules/network/network.routes.js';
import { processesRoutes } from './modules/processes/processes.routes.js';
import { servicesRoutes } from './modules/services/services.routes.js';
import { routingRoutes } from './modules/routing/routing.routes.js';
import { logsRoutes } from './modules/logs/logs.routes.js';
import { LogsService } from './modules/logs/logs.service.js';
import { registerRealtime } from './realtime/ws.gateway.js';

export async function buildApp(options: {
  provider: SystemProvider;
  hostProvider?: HostProvider;
  monitoringSources?: MonitoringSources;
  logger?: boolean;
}) {
  const app = Fastify({
    ajv: { customOptions: { removeAdditional: false } },
    logger: options.logger ?? true,
    bodyLimit: 16 * 1024,
  });

  installErrorHandler(app);
  await registerDocumentation(app);

  const collector = options.monitoringSources
    ? new MetricsCollector(options.monitoringSources)
    : undefined;

  if (collector) {
    const logs = new LogsService(collector.sources.source);

    await registerRealtime(app, collector);
    app.addHook('onReady', () => collector.start());
    app.addHook('onClose', () => collector.stop());
    app.register(metricsRoutes, { prefix: '/api/v1/metrics', collector });
    app.register(systemMonitoringRoutes, { prefix: '/api/v1/system', collector });
    app.register(networkRoutes, { prefix: '/api/v1/network', collector });
    app.register(processesRoutes, { prefix: '/api/v1/processes', collector });
    app.register(servicesRoutes, { prefix: '/api/v1/services', collector });
    app.register(routingRoutes, { prefix: '/api/v1/routing', collector });
    app.register(logsRoutes, { prefix: '/api/v1/logs', service: logs });
  }

  app.register(healthRoutes, { prefix: '/api/v1' });

  if (options.hostProvider || collector) {
    app.register(hostRoutes, {
      prefix: '/api/v1/system',
      service: new HostService(
        collector
          ? {
              getHostInfo: async () => collector.data('info'),
              getUptimeInfo: async () => collector.data('uptime'),
              getLoadInfo: async () => collector.data('load'),
            }
          : options.hostProvider!,
      ),
    });
  }

  app.register(systemRoutes, {
    prefix: '/api/v1/system',
    service: new SystemService(
      options.provider,
      collector
        ? { memory: () => collector.data('memory'), swap: () => collector.data('swap') }
        : undefined,
    ),
  });

  return app;
}
