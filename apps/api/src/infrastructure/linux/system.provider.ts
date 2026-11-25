import { readFile } from 'node:fs/promises';

export interface MemorySnapshot {
  totalBytes: number;
  availableBytes: number;
  source: 'linux' | 'mock';
}

export interface SystemProvider {
  getMemoryInfo(): Promise<MemorySnapshot>;
  getSwapInfo(): Promise<SwapSnapshot>;
}

export interface SwapSnapshot {
  totalBytes: number;
  freeBytes: number;
  source: 'linux' | 'mock';
}

export function parseSwapMeminfo(text: string): SwapSnapshot {
  const values = new Map<string, number>();
  for (const line of text.split('\n')) {
    const match = /^(SwapTotal|SwapFree):\s+(\d+)\s+kB\s*$/.exec(line);
    if (!match) continue;
    const key = match[1]!;
    if (values.has(key)) throw new Error('Duplicate swap field');
    values.set(key, Number(match[2]) * 1024);
  }
  const totalBytes = values.get('SwapTotal');
  const freeBytes = values.get('SwapFree');
  if (
    totalBytes === undefined ||
    freeBytes === undefined ||
    !Number.isSafeInteger(totalBytes) ||
    !Number.isSafeInteger(freeBytes) ||
    totalBytes < 0 ||
    freeBytes < 0 ||
    freeBytes > totalBytes
  ) {
    throw new Error('Invalid or missing swap fields');
  }
  return { totalBytes, freeBytes, source: 'linux' };
}

export function parseMeminfo(text: string): MemorySnapshot {
  const values = new Map<string, number>();
  for (const line of text.split('\n')) {
    const match = /^(MemTotal|MemAvailable):\s+(\d+)\s+kB\s*$/.exec(line);
    if (!match) continue;
    const key = match[1]!;
    if (values.has(key)) throw new Error('Duplicate memory field');
    values.set(key, Number(match[2]) * 1024);
  }
  const totalBytes = values.get('MemTotal');
  const availableBytes = values.get('MemAvailable');
  if (
    totalBytes === undefined ||
    availableBytes === undefined ||
    !Number.isSafeInteger(totalBytes) ||
    !Number.isSafeInteger(availableBytes) ||
    totalBytes <= 0 ||
    availableBytes < 0 ||
    availableBytes > totalBytes
  ) {
    throw new Error('Invalid or missing memory fields');
  }
  return { totalBytes, availableBytes, source: 'linux' };
}

export class LinuxSystemProvider implements SystemProvider {
  async getSwapInfo(): Promise<SwapSnapshot> {
    if (process.platform !== 'linux') throw new Error('Linux provider requires Linux');
    return parseSwapMeminfo(await readFile('/proc/meminfo', 'utf8'));
  }

  async getMemoryInfo(): Promise<MemorySnapshot> {
    if (process.platform !== 'linux') throw new Error('Linux provider requires Linux');
    return parseMeminfo(await readFile('/proc/meminfo', 'utf8'));
  }
}
