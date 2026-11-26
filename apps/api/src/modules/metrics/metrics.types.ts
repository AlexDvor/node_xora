import type { MemoryInfo, SwapInfo } from '../system/system.types.js';
import type { HostInfo, UptimeInfo, LoadInfo } from '../../infrastructure/linux/host.provider.js';
import type { CpuInfo } from '../system/cpu.service.js';
import type { readDisk, readTemperature } from '../../infrastructure/linux/hardware.provider.js';
import type { networkUsage } from '../network/network.service.js';
import type { processUsage } from '../processes/processes.service.js';
import type { readConnections, readRoutes } from '../../infrastructure/linux/network.provider.js';
import type { readServices, readSessions } from '../../infrastructure/linux/activity.provider.js';

export interface ResourceMap {
  memory: MemoryInfo;
  swap: SwapInfo;
  info: HostInfo;
  uptime: UptimeInfo;
  load: LoadInfo;
  cpu: CpuInfo;
  disks: Awaited<ReturnType<typeof readDisk>> & { usedBytes: number; usedPercent: number | null };
  temperature: { sensors: Awaited<ReturnType<typeof readTemperature>> };
  network: ReturnType<typeof networkUsage>;
  connections: Awaited<ReturnType<typeof readConnections>>;
  processes: ReturnType<typeof processUsage>;
  services: {
    units: Awaited<ReturnType<typeof readServices>>;
    runningCount: number;
    scope: string;
  };
  sessions: Awaited<ReturnType<typeof readSessions>>;
  routes: { routes: Awaited<ReturnType<typeof readRoutes>> };
}

export type Resource = keyof ResourceMap;

export type Quality =
  'ok' | 'warming_up' | 'unavailable' | 'permission_denied' | 'stale' | 'partial';

export interface Sample<K extends Resource = Resource> {
  streamId: string;
  sequence: number;
  collectedAt: string | null;
  lastSuccessAt: string | null;
  source: 'linux' | 'mock';
  quality: Quality;
  reason: string | null;
  data: ResourceMap[K] | null;
}

export type CollectionTasks = { [K in Resource]: (signal: AbortSignal) => Promise<ResourceMap[K]> };

export interface MonitoringSources {
  source: 'linux' | 'mock';
  tasks: CollectionTasks;
}
