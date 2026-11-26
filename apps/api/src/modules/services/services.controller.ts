import type { MetricsCollector } from '../metrics/collector.service.js';
import { ServicesService } from './services.service.js';
export function createServicesController(collector: MetricsCollector) {
  const service = new ServicesService(collector);
  return {
    async list() {
      return { data: service.list() };
    },
    async detail(request: { params: { name: string }; query: { scope: 'system' | 'user' } }) {
      const { name } = request.params,
        { scope } = request.query;
      return { data: await service.detail(name, scope) };
    },
  };
}
