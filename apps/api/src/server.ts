import { buildApp } from './app.js';
import { readConfig } from './config/env.js';
import { LinuxSystemProvider } from './infrastructure/linux/system.provider.js';
import { MockSystemProvider } from './infrastructure/linux/mock-system.provider.js';
import {
  createLinuxSources,
  createMockSources,
} from './infrastructure/linux/monitoring.provider.js';

const config = readConfig();

const app = await buildApp({
  provider: config.provider === 'linux' ? new LinuxSystemProvider() : new MockSystemProvider(),
  monitoringSources: config.provider === 'linux' ? createLinuxSources() : createMockSources(),
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.close().catch((error: unknown) => {
      app.log.error(error);
      process.exitCode = 1;
    });
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
