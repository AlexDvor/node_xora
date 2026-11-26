import { randomUUID } from 'node:crypto';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { EventEmitter } from 'node:events';
import { monitoringPolicy as policy } from '../../config/monitoring.js';
import { AppError } from '../../common/errors/app-error.js';
import type { MonitoringSources, Resource, ResourceMap, Sample, Quality } from './metrics.types.js';

const fastResources = new Set<Resource>(['memory', 'swap', 'load', 'uptime', 'cpu', 'network']);

export const resources: Resource[] = [
  'memory',
  'swap',
  'info',
  'load',
  'uptime',
  'cpu',
  'disks',
  'temperature',
  'network',
  'connections',
  'processes',
  'services',
  'sessions',
  'routes',
];

export function intervalFor(resource: Resource) {
  if (fastResources.has(resource)) {
    return policy.fastIntervalMs;
  }

  if (resource === 'processes' || resource === 'sessions') {
    return policy.processIntervalMs;
  }

  return policy.slowIntervalMs;
}

export interface HistoryPoint {
  sequence: number;
  collectedAt: string;
  quality: Quality;
  value: number | null;
}

export class MetricsCollector extends EventEmitter {
  readonly streamId = randomUUID();
  private revision = 0;
  private readonly eventLoop = monitorEventLoopDelay({ resolution: 20 });
  private samples = new Map<Resource, Sample>();
  private successTimes = new Map<Resource, number>();
  private jobs = new Map<Resource, { abort: AbortController; done: Promise<void> }>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private history = new Map<string, HistoryPoint[]>();
  private started = false;
  private stopped = false;
  readonly diagnostics = {
    missedCollections: 0,
    timedOutCollections: 0,
    durationsMs: {} as Partial<Record<Resource, number>>,
  };

  constructor(readonly sources: MonitoringSources) {
    super();
    this.setMaxListeners(policy.maxConnections + 8);
  }

  async start() {
    if (this.started) return;

    this.started = true;
    this.eventLoop.enable();
    await Promise.all(resources.map((resource) => this.collect(resource)));

    if (this.stopped) return;
    for (const resource of resources) {
      const timer = setInterval(() => {
        void this.collect(resource);
      }, intervalFor(resource));

      timer.unref();
      this.timers.push(timer);
    }
  }

  async collect<K extends Resource>(resource: K): Promise<void> {
    if (this.stopped) return;
    if (this.jobs.has(resource)) {
      this.diagnostics.missedCollections++;

      return;
    }

    const abort = new AbortController();
    const start = performance.now();
    let timedOut = false;
    let release!: () => void;
    const bounded = new Promise<void>((resolve) => {
      release = resolve;
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      abort.abort();
      this.diagnostics.timedOutCollections++;

      if (!this.stopped) this.failure(resource, 'COLLECTION_TIMEOUT');

      release();
    }, policy.taskTimeoutMs);
    const done = Promise.resolve()
      .then(() => this.sources.tasks[resource](abort.signal))
      .then((data) => {
        if (this.stopped || timedOut) return;

        let quality: Quality = 'ok',
          reason: string | null = null;

        if (
          (resource === 'cpu' && (data as ResourceMap['cpu']).totalPercent === null) ||
          (resource === 'network' && (data as ResourceMap['network']).windowSeconds === null)
        ) {
          quality = 'warming_up';
          reason = 'BASELINE_UNAVAILABLE';
        }
        if (
          quality === 'ok' &&
          resource === 'cpu' &&
          (data as ResourceMap['cpu']).cores.some((core) => core.usedPercent === null)
        ) {
          quality = 'partial';
          reason = 'CORE_BASELINE_UNAVAILABLE';
        }
        if (
          quality === 'ok' &&
          resource === 'network' &&
          (data as ResourceMap['network']).rxBytesPerSecond === null
        ) {
          quality = 'partial';
          reason = 'NETWORK_BASELINE_OR_INTERFACE_UNAVAILABLE';
        }
        if (
          ('partial' in data && data.partial === true) ||
          (resource === 'temperature' &&
            (data as ResourceMap['temperature']).sensors.some((sensor) => sensor.celsius === null))
        ) {
          quality = 'partial';
          reason = 'SOME_FIELDS_UNAVAILABLE';
        }
        if (resource === 'temperature' && !(data as ResourceMap['temperature']).sensors.length) {
          quality = 'unavailable';
          reason = 'NO_SENSORS';
        }

        this.successTimes.set(resource, performance.now());
        this.publish(resource, {
          streamId: this.streamId,
          sequence: (this.samples.get(resource)?.sequence ?? 0) + 1,
          collectedAt: new Date().toISOString(),
          lastSuccessAt: new Date().toISOString(),
          source: this.sources.source,
          quality,
          reason,
          data,
        });
      })
      .catch((error) => {
        if (!this.stopped && !timedOut)
          this.failure(
            resource,
            typeof error === 'object' &&
              error &&
              'code' in error &&
              (error.code === 'EACCES' || error.code === 'EPERM')
              ? 'PERMISSION_DENIED'
              : 'PROVIDER_UNAVAILABLE',
          );
      })
      .finally(() => {
        clearTimeout(timeout);
        this.jobs.delete(resource);
        this.diagnostics.durationsMs[resource] = performance.now() - start;
        release();
      });

    this.jobs.set(resource, { abort, done });

    return bounded;
  }

  private failure(resource: Resource, reason: string) {
    const old = this.samples.get(resource);

    this.publish(resource, {
      streamId: this.streamId,
      sequence: (old?.sequence ?? 0) + 1,
      collectedAt: new Date().toISOString(),
      lastSuccessAt: old?.lastSuccessAt ?? null,
      source: this.sources.source,
      quality: reason === 'PERMISSION_DENIED' ? 'permission_denied' : 'unavailable',
      reason,
      data: null,
    });
  }

  get<K extends Resource>(resource: K): Sample<K> {
    const sample = this.samples.get(resource) as Sample<K> | undefined;

    if (!sample)
      return {
        streamId: this.streamId,
        sequence: 0,
        collectedAt: null,
        lastSuccessAt: null,
        source: this.sources.source,
        quality: 'warming_up',
        reason: 'COLLECTOR_STARTING',
        data: null,
      };

    const success = this.successTimes.get(resource);

    if (
      sample.quality === 'ok' &&
      success !== undefined &&
      performance.now() - success > intervalFor(resource) * policy.staleMultiplier
    )
      return { ...sample, quality: 'stale', reason: 'SAMPLE_TOO_OLD' };

    return sample;
  }

  data<K extends Resource>(resource: K): ResourceMap[K] {
    const sample = this.get(resource);

    if (!sample.data || ['unavailable', 'permission_denied', 'stale'].includes(sample.quality))
      throw new AppError(
        `${resource.toUpperCase()}_INFO_UNAVAILABLE`,
        'Unable to retrieve monitoring information',
        503,
      );

    return sample.data;
  }

  current() {
    return {
      schemaVersion: 1,
      streamId: this.streamId,
      sequence: this.revision,
      sections: Object.fromEntries(resources.map((resource) => [resource, this.get(resource)])),
      capabilities: Object.fromEntries(
        resources.map((resource) => [
          resource,
          {
            available: this.get(resource).data !== null,
            quality: this.get(resource).quality,
            reason: this.get(resource).reason,
          },
        ]),
      ),
      diagnostics: this.diagnostics,
      runtime: {
        rssBytes: process.memoryUsage().rss,
        heapUsedBytes: process.memoryUsage().heapUsed,
        cpuUserMicroseconds: process.cpuUsage().user,
        cpuSystemMicroseconds: process.cpuUsage().system,
        eventLoopDelayMeanMs: Number.isFinite(this.eventLoop.mean)
          ? this.eventLoop.mean / 1000000
          : null,
        eventLoopDelayMaxMs: this.eventLoop.count ? this.eventLoop.max / 1000000 : null,
      },
    };
  }

  private publish(resource: Resource, sample: Sample) {
    this.revision++;
    this.samples.set(resource, sample);

    const add = (series: string, value: number | null) => {
      const points = this.history.get(series) ?? [];

      points.push({
        sequence: sample.sequence,
        collectedAt: sample.collectedAt!,
        quality: sample.quality,
        value,
      });

      const cutoff = Date.now() - policy.historyRetentionMs;

      while (
        points.length &&
        (Date.parse(points[0]!.collectedAt) < cutoff ||
          points.length > Math.ceil(policy.historyRetentionMs / 2000) + 1)
      )
        points.shift();

      this.history.set(series, points);
    };

    if (resource === 'cpu')
      add('cpu', (sample.data as ResourceMap['cpu'] | null)?.totalPercent ?? null);
    if (resource === 'memory' || resource === 'swap')
      add(resource, (sample.data as ResourceMap['memory'] | null)?.usedPercent ?? null);
    if (resource === 'network') {
      const data = sample.data as ResourceMap['network'] | null;

      add('rx', data?.rxBytesPerSecond ?? null);
      add('tx', data?.txBytesPerSecond ?? null);
    }
    if (resource === 'temperature') {
      const sensors = (sample.data as ResourceMap['temperature'] | null)?.sensors ?? [];
      // Fixed maximum of 64 history series; missing sensors receive a gap.
      const existing = [...this.history.keys()].filter((key) => key.startsWith('temperature:'));

      for (const id of new Set([
        ...existing.map((key) => key.slice(12)),
        ...sensors.slice(0, 64).map((sensor) => sensor.id),
      ])) {
        if (
          !this.history.has(`temperature:${id}`) &&
          [...this.history.keys()].filter((key) => key.startsWith('temperature:')).length >= 64
        )
          continue;

        add(`temperature:${id}`, sensors.find((sensor) => sensor.id === id)?.celsius ?? null);
      }
    }

    this.emit('sample', resource, sample);
  }

  queryHistory(series: string[], from: number, to: number, resolutionMs: number) {
    for (const name of series)
      if (!this.history.has(name) && !['cpu', 'memory', 'swap', 'rx', 'tx'].includes(name))
        throw new AppError('UNKNOWN_SERIES', 'Unknown history series', 404);

    return {
      streamId: this.streamId,
      retentionSeconds: policy.historyRetentionMs / 1000,
      persistent: false,
      availableSeries: [...this.history.keys()],
      series: series.map((name) => {
        const all = this.history.get(name) ?? [];
        const points = all.filter(
          (point) => Date.parse(point.collectedAt) >= from && Date.parse(point.collectedAt) <= to,
        );
        const buckets = new Map<number, HistoryPoint[]>();

        for (const point of points) {
          const key = Math.floor((Date.parse(point.collectedAt) - from) / resolutionMs);
          const bucket = buckets.get(key) ?? [];

          bucket.push(point);
          buckets.set(key, bucket);
        }

        return {
          name,
          availableFrom: all[0]?.collectedAt ?? null,
          availableTo: all.at(-1)?.collectedAt ?? null,
          insufficientHistory: !all.length || Date.parse(all[0]!.collectedAt) > from,
          points: [...buckets].map(([key, bucket]) => {
            const values = bucket.map((point) => point.value);
            const valid = values.every((value): value is number => value !== null);

            return {
              windowStart: new Date(from + key * resolutionMs).toISOString(),
              collectedAt: bucket.at(-1)!.collectedAt,
              sequence: bucket.at(-1)!.sequence,
              quality: valid ? 'ok' : 'partial',
              mean: valid ? (values as number[]).reduce((a, b) => a + b, 0) / values.length : null,
              min: valid ? Math.min(...(values as number[])) : null,
              max: valid ? Math.max(...(values as number[])) : null,
            };
          }),
        };
      }),
    };
  }

  async stop() {
    this.eventLoop.disable();
    this.stopped = true;
    this.timers.forEach(clearInterval);

    for (const job of this.jobs.values()) job.abort.abort();
    if (this.jobs.size) {
      let timer: ReturnType<typeof setTimeout> | undefined;

      await Promise.race([
        Promise.allSettled([...this.jobs.values()].map((job) => job.done)),
        new Promise((resolve) => {
          timer = setTimeout(resolve, policy.taskTimeoutMs);
        }),
      ]);

      if (timer) clearTimeout(timer);
    }

    this.removeAllListeners();
  }
}
