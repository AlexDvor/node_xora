import type { MetricsCollector } from '../metrics/collector.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { readServiceDetail } from '../../infrastructure/linux/activity.provider.js';
export class ServicesService {
  constructor(private readonly collector: MetricsCollector) {}
  list() {
    return this.collector.get('services');
  }
  async detail(name: string, scope: 'system' | 'user') {
    const units = this.collector.data('services').units;
    const known = units.find((unit) => unit.name === name && unit.scope === scope);
    if (!known) throw new AppError('SERVICE_NOT_FOUND', 'Unit not present in collected scope', 404);
    if (this.collector.sources.source === 'mock') return known;
    try {
      return await readServiceDetail(scope, name, AbortSignal.timeout(3000));
    } catch {
      throw new AppError('SERVICE_UNAVAILABLE', 'Unit details unavailable', 503);
    }
  }
}
