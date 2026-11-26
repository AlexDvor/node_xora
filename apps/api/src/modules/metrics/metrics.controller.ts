import type { MetricsCollector } from './collector.service.js';
import { monitoringPolicy as policy } from '../../config/monitoring.js';
import { AppError } from '../../common/errors/app-error.js';
export interface HistoryQuery {
  series: string;
  from: string;
  to: string;
  resolutionSeconds: number;
}
export function createMetricsController(collector: MetricsCollector) {
  return {
    async current() {
      return { data: collector.current() };
    },
    async history(request: { query: HistoryQuery }) {
      const { series, from, to, resolutionSeconds } = request.query;
      const names = series.split(',');
      const begin = Date.parse(from),
        end = Date.parse(to);
      if (
        names.length > 8 ||
        new Set(names).size !== names.length ||
        !Number.isFinite(begin) ||
        !Number.isFinite(end) ||
        begin >= end ||
        end - begin > policy.historyRetentionMs ||
        (Math.floor((end - begin) / (resolutionSeconds * 1000)) + 1) * names.length >
          policy.historyMaxPoints
      )
        throw new AppError(
          'INVALID_HISTORY_QUERY',
          'History requires up to 8 unique series, a range up to 15 minutes, and at most 1000 points in total',
          400,
        );
      return { data: collector.queryHistory(names, begin, end, resolutionSeconds * 1000) };
    },
  };
}
