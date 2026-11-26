import type { MetricsCollector } from '../metrics/collector.service.js';
import type { ProcessQuery } from './processes.types.js';
import { processPage } from './processes.service.js';
export const createProcessesController = (collector: MetricsCollector) => ({
  async list(request: { query: ProcessQuery }) {
    return { data: processPage(collector, request.query) };
  },
});
