import { createHash } from 'node:crypto';
import type { MetricsCollector } from '../metrics/collector.service.js';
import { AppError } from '../../common/errors/app-error.js';
import type { ProcessQuery } from './processes.types.js';
import type { ProcessCounters } from '../../infrastructure/linux/processes.provider.js';

export function processUsage(
  previous: ProcessCounters | undefined,
  current: ProcessCounters,
  memoryTotal: number | null,
) {
  const elapsed =
    previous && previous.bootId === current.bootId && current.at > previous.at
      ? (current.at - previous.at) / 1000
      : null;
  const oldById = new Map(
    previous?.processes.map((item) => [`${item.pid}:${item.startTicks}`, item]) ?? [],
  );

  return {
    scope: 'current PID namespace; safe comm only; CPU 100% per logical CPU',
    partial: current.partial,
    skipped: current.skipped,
    windowSeconds: elapsed,
    processes: current.processes.map((item) => {
      const old = oldById.get(`${item.pid}:${item.startTicks}`);
      const delta = old ? BigInt(item.cpuTicks) - BigInt(old.cpuTicks) : null;
      const cpuPercent =
        elapsed && delta !== null && delta >= 0n && delta <= BigInt(Number.MAX_SAFE_INTEGER)
          ? (Number(delta) / current.ticksPerSecond / elapsed) * 100
          : null;

      return {
        id: `${current.bootId}:${item.pid}:${item.startTicks}`,
        pid: item.pid,
        uid: item.uid,
        username: item.username,
        name: item.name,
        state: item.state,
        rssBytes: item.rssBytes,
        memoryPercent: memoryTotal && memoryTotal > 0 ? (item.rssBytes / memoryTotal) * 100 : null,
        memoryReason: memoryTotal ? null : 'MEMORY_TOTAL_UNAVAILABLE',
        cpuPercent,
        cpuReason: cpuPercent === null ? 'BASELINE_UNAVAILABLE' : null,
      };
    }),
  };
}

export function processPage(collector: MetricsCollector, query: ProcessQuery) {
  const sample = collector.get('processes');

  if (!sample.data)
    throw new AppError('PROCESSES_UNAVAILABLE', 'Process snapshot unavailable', 503);

  const snapshotId = `${sample.streamId}:${sample.sequence}`;
  const filter = createHash('sha256')
    .update(
      JSON.stringify([
        query.sort,
        query.direction,
        query.uid ?? null,
        query.search ?? null,
        query.limit,
      ]),
    )
    .digest('hex');
  let offset = 0;

  if (query.cursor) {
    try {
      const cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString()) as {
        snapshotId: string;
        filter: string;
        offset: number;
      };

      if (cursor.snapshotId !== snapshotId)
        throw new AppError(
          'RESYNC_REQUIRED',
          'Process snapshot changed; request the first page',
          409,
        );
      if (cursor.filter !== filter || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0)
        throw new Error('Invalid cursor');

      offset = cursor.offset;
    } catch (error) {
      if (error instanceof AppError) throw error;

      throw new AppError('INVALID_CURSOR', 'Invalid process cursor', 400);
    }
  }

  const rows = sample.data.processes
    .filter(
      (row) =>
        (query.uid === undefined || row.uid === query.uid) &&
        (!query.search || row.name.toLowerCase().includes(query.search.toLowerCase())),
    )
    .sort((a, b) => {
      const x = a[query.sort],
        y = b[query.sort];

      if (x === null && y !== null) return 1;
      if (y === null && x !== null) return -1;

      const result =
        typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : Number(x) - Number(y);

      return (query.direction === 'asc' ? result : -result) || a.pid - b.pid;
    });

  return {
    ...sample,
    data: {
      ...sample.data,
      processes: rows.slice(offset, offset + query.limit),
      snapshotId,
      nextCursor:
        offset + query.limit < rows.length
          ? Buffer.from(
              JSON.stringify({ snapshotId, filter, offset: offset + query.limit }),
            ).toString('base64url')
          : null,
    },
  };
}
