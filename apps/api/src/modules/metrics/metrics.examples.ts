import type { ResourceMap } from './metrics.types.js';
// Typed illustrations only. Never use these values as Linux measurements.
const meta = { source: 'mock' as const, collectedAt: '2026-11-26T00:00:00.000Z' };
export const monitoringExamples: ResourceMap = {
  memory: { ...meta, totalBytes: 4096, availableBytes: 3072, usedBytes: 1024, usedPercent: 25 },
  swap: { ...meta, totalBytes: 0, freeBytes: 0, usedBytes: 0, usedPercent: null, enabled: false },
  info: {
    ...meta,
    hostname: 'mock-host',
    os: { id: 'mock', name: 'Development mock', version: null },
    kernel: 'mock',
    architecture: 'mock',
    cpuModel: 'mock CPU',
    logicalCpuCount: 1,
    physicalCoreCount: null,
  },
  uptime: {
    ...meta,
    uptimeSeconds: 120,
    bootId: '00000000-0000-0000-0000-000000000001',
    bootTime: '2026-11-25T23:58:00.000Z',
  },
  load: { ...meta, load1: 0.1, load5: 0.2, load15: 0.3 },
  cpu: {
    totalPercent: 25,
    cores: [{ id: 'cpu0', usedPercent: 25 }],
    windowSeconds: 2,
    bootId: 'mock-boot',
  },
  disks: {
    mountPoint: '/',
    filesystem: 'mock',
    device: 'mock',
    readOnly: false,
    totalBytes: 1000,
    freeBytes: 750,
    availableBytes: 700,
    usedBytes: 250,
    usedPercent: 25,
  },
  temperature: {
    sensors: [{ id: 'mock-sensor', chip: 'mock', label: 'mock sensor', celsius: 30, reason: null }],
  },
  network: {
    interfaces: [],
    includedInterfaceIds: [],
    rxBytesPerSecond: null,
    txBytesPerSecond: null,
    windowSeconds: null,
    currentAddress: null,
    addressReason: 'MOCK_NO_INTERFACE',
  },
  connections: { scope: 'mock', truncated: false, connections: [] },
  processes: { scope: 'mock', partial: false, skipped: 0, windowSeconds: null, processes: [] },
  services: { units: [], runningCount: 0, scope: 'mock loaded services' },
  sessions: {
    scope: 'mock logind',
    connectedUsersCount: 0,
    sessionsCount: 0,
    sessions: [],
    partial: false,
  },
  routes: { routes: [] },
};
