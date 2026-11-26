import { LinuxHostProvider, MockHostProvider } from './host.provider.js';
import { LinuxSystemProvider } from './system.provider.js';
import { MockSystemProvider } from './mock-system.provider.js';
import { SystemService } from '../../modules/system/system.service.js';
import { readCpu, type CpuCounters } from './cpu.provider.js';
import { cpuUsage } from '../../modules/system/cpu.service.js';
import { readDisk, readTemperature } from './hardware.provider.js';
import {
  readConnections,
  readNetwork,
  readRoutes,
  type NetworkCounters,
} from './network.provider.js';
import { networkUsage } from '../../modules/network/network.service.js';
import { LinuxProcessProvider, type ProcessCounters } from './processes.provider.js';
import { processUsage } from '../../modules/processes/processes.service.js';
import { readServices, readSessions } from './activity.provider.js';
import type { MonitoringSources } from '../../modules/metrics/metrics.types.js';

export function createLinuxSources(): MonitoringSources {
  const memory = new SystemService(new LinuxSystemProvider());
  const host = new LinuxHostProvider();
  const processProvider = new LinuxProcessProvider();
  let previousCpu: CpuCounters | undefined,
    previousNetwork: NetworkCounters | undefined,
    previousProcesses: ProcessCounters | undefined;
  let memoryTotal: number | null = null;
  return {
    source: 'linux',
    tasks: {
      memory: async () => {
        const info = await memory.getMemoryInfo();
        memoryTotal = info.totalBytes;
        return info;
      },
      swap: () => memory.getSwapInfo(),
      info: () => host.getHostInfo(),
      uptime: () => host.getUptimeInfo(),
      load: () => host.getLoadInfo(),
      cpu: async (signal) => {
        const current = await readCpu(signal);
        const info = cpuUsage(previousCpu, current);
        previousCpu = current;
        return info;
      },
      network: async (signal) => {
        const current = await readNetwork(signal);
        const info = networkUsage(previousNetwork, current);
        previousNetwork = current;
        return info;
      },
      disks: async (signal) => {
        const disk = await readDisk(signal);
        const usedBytes = disk.totalBytes - disk.freeBytes;
        return {
          ...disk,
          usedBytes,
          usedPercent: disk.totalBytes > 0 ? (usedBytes / disk.totalBytes) * 100 : null,
        };
      },
      temperature: async (signal) => ({ sensors: await readTemperature(signal) }),
      connections: (signal) => readConnections(signal),
      processes: async (signal) => {
        const current = await processProvider.read(signal);
        const info = processUsage(previousProcesses, current, memoryTotal);
        previousProcesses = current;
        return info;
      },
      services: async (signal) => {
        const units = await readServices(signal);
        return {
          units,
          runningCount: units.filter(
            (unit) => unit.activeState === 'active' && unit.subState === 'running',
          ).length,
          scope:
            'loaded system services and current user services, not all installed unit files; active does not prove health',
        };
      },
      sessions: (signal) => readSessions(signal),
      routes: async (signal) => ({ routes: await readRoutes(signal) }),
    },
  };
}
export function createMockSources(): MonitoringSources {
  const memory = new SystemService(new MockSystemProvider());
  const host = new MockHostProvider();
  return {
    source: 'mock',
    tasks: {
      memory: () => memory.getMemoryInfo(),
      swap: () => memory.getSwapInfo(),
      info: () => host.getHostInfo(),
      uptime: () => host.getUptimeInfo(),
      load: () => host.getLoadInfo(),
      cpu: async () => ({
        totalPercent: 25,
        cores: [{ id: 'cpu0', usedPercent: 25 }],
        windowSeconds: 2,
        bootId: 'mock-boot',
      }),
      disks: async () => ({
        mountPoint: '/',
        filesystem: 'mock',
        device: 'mock',
        readOnly: false,
        totalBytes: 1000,
        freeBytes: 750,
        availableBytes: 700,
        usedBytes: 250,
        usedPercent: 25,
      }),
      temperature: async () => ({
        sensors: [{ id: 'mock-sensor', chip: 'mock', label: 'mock', celsius: 30, reason: null }],
      }),
      network: async () => ({
        interfaces: [],
        includedInterfaceIds: [],
        rxBytesPerSecond: null,
        txBytesPerSecond: null,
        windowSeconds: null,
        currentAddress: null,
        addressReason: 'MOCK_NO_INTERFACE',
      }),
      connections: async () => ({ scope: 'mock', truncated: false, connections: [] }),
      processes: async () => ({
        scope: 'mock',
        partial: false,
        skipped: 0,
        windowSeconds: null,
        processes: [],
      }),
      services: async () => ({ units: [], runningCount: 0, scope: 'mock' }),
      sessions: async () => ({
        scope: 'mock',
        connectedUsersCount: 0,
        sessionsCount: 0,
        sessions: [],
        partial: false,
      }),
      routes: async () => ({ routes: [] }),
    },
  };
}
