import type { MetricsCollector } from './collector.service.js';
import type { Resource } from './metrics.types.js';
export const resourceHandler = (collector: MetricsCollector, resource: Resource) => async () => ({
  data: collector.get(resource),
});
