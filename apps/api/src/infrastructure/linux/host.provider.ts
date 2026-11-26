import { readFile } from 'node:fs/promises';
import { arch, cpus, hostname, loadavg, release } from 'node:os';

export interface HostInfo {
  hostname: string;
  os: { id: string | null; name: string | null; version: string | null };
  kernel: string;
  architecture: string;
  cpuModel: string | null;
  logicalCpuCount: number;
  physicalCoreCount: number | null;
  source: 'linux' | 'mock';
  collectedAt: string;
}

export interface UptimeInfo {
  uptimeSeconds: number;
  bootId: string;
  bootTime: string;
  source: 'linux' | 'mock';
  collectedAt: string;
}

export interface LoadInfo {
  load1: number;
  load5: number;
  load15: number;
  source: 'linux' | 'mock';
  collectedAt: string;
}

export interface HostProvider {
  getHostInfo(): Promise<HostInfo>;
  getUptimeInfo(): Promise<UptimeInfo>;
  getLoadInfo(): Promise<LoadInfo>;
}

export function parseOsRelease(text: string): HostInfo['os'] {
  const values = new Map<string, string>();

  for (const line of text.split('\n')) {
    const match = /^(ID|PRETTY_NAME|VERSION_ID)=(.*)$/.exec(line);

    if (match) {
      const raw = match[2]!;

      values.set(match[1]!, raw.replace(/^(["'])(.*)\1$/, '$2').replace(/\\(["\\$`])/g, '$1'));
    }
  }

  return {
    id: values.get('ID') ?? null,
    name: values.get('PRETTY_NAME') ?? null,
    version: values.get('VERSION_ID') ?? null,
  };
}

export function parseUptime(text: string, stat: string, bootId: string): UptimeInfo {
  const uptimeSeconds = Number(text.trim().split(/\s+/)[0]);
  const btime = /^btime\s+(\d+)$/m.exec(stat);
  const epoch = btime ? Number(btime[1]) : NaN;

  if (
    !Number.isFinite(uptimeSeconds) ||
    uptimeSeconds < 0 ||
    !Number.isSafeInteger(epoch) ||
    epoch <= 0 ||
    !/^[a-f0-9-]{36}$/.test(bootId.trim())
  )
    throw new Error('Invalid uptime data');

  return {
    uptimeSeconds,
    bootId: bootId.trim(),
    bootTime: new Date(epoch * 1000).toISOString(),
    source: 'linux',
    collectedAt: new Date().toISOString(),
  };
}

export class LinuxHostProvider implements HostProvider {
  async getHostInfo(): Promise<HostInfo> {
    const [os, cpuinfo] = await Promise.all([
      readFile('/etc/os-release', 'utf8'),
      readFile('/proc/cpuinfo', 'utf8'),
    ]);
    const topology = new Set<string>();

    for (const block of cpuinfo.split(/\n\s*\n/)) {
      const socket = /^physical id\s*:\s*(\d+)/m.exec(block)?.[1];
      const core = /^core id\s*:\s*(\d+)/m.exec(block)?.[1];

      if (socket !== undefined && core !== undefined) topology.add(`${socket}:${core}`);
    }

    const processors = cpus();

    return {
      hostname: hostname(),
      os: parseOsRelease(os),
      kernel: release(),
      architecture: arch(),
      cpuModel: processors[0]?.model ?? null,
      logicalCpuCount: processors.length,
      physicalCoreCount: topology.size || null,
      source: 'linux',
      collectedAt: new Date().toISOString(),
    };
  }

  async getUptimeInfo(): Promise<UptimeInfo> {
    const [uptime, stat, boot] = await Promise.all([
      readFile('/proc/uptime', 'utf8'),
      readFile('/proc/stat', 'utf8'),
      readFile('/proc/sys/kernel/random/boot_id', 'utf8'),
    ]);

    return parseUptime(uptime, stat, boot);
  }

  async getLoadInfo(): Promise<LoadInfo> {
    if (process.platform !== 'linux') throw new Error('Linux provider requires Linux');

    const [load1, load5, load15] = loadavg();

    if (
      [load1, load5, load15].some(
        (value) => value === undefined || !Number.isFinite(value) || value < 0,
      )
    )
      throw new Error('Invalid load data');

    return {
      load1: load1!,
      load5: load5!,
      load15: load15!,
      source: 'linux',
      collectedAt: new Date().toISOString(),
    };
  }
}

export class MockHostProvider implements HostProvider {
  async getHostInfo(): Promise<HostInfo> {
    return {
      hostname: 'mock-host',
      os: { id: 'mock', name: 'Development mock', version: null },
      kernel: 'mock',
      architecture: 'mock',
      cpuModel: 'mock CPU',
      logicalCpuCount: 2,
      physicalCoreCount: null,
      source: 'mock',
      collectedAt: new Date().toISOString(),
    };
  }

  async getUptimeInfo(): Promise<UptimeInfo> {
    return {
      uptimeSeconds: 120,
      bootId: '00000000-0000-0000-0000-000000000001',
      bootTime: new Date(Date.now() - 120000).toISOString(),
      source: 'mock',
      collectedAt: new Date().toISOString(),
    };
  }

  async getLoadInfo(): Promise<LoadInfo> {
    return {
      load1: 0.1,
      load5: 0.2,
      load15: 0.3,
      source: 'mock',
      collectedAt: new Date().toISOString(),
    };
  }
}
