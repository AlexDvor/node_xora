import { readFile } from 'node:fs/promises';

export interface CpuCounters {
  bootId: string;
  at: number;
  cpus: Record<string, bigint[]>;
}

export function parseCpuStat(text: string, bootId: string, at: number): CpuCounters {
  const cpus: Record<string, bigint[]> = {};

  for (const line of text.split('\n')) {
    if (!/^cpu(?:\d+)?\s/.test(line)) continue;

    const [id, ...values] = line.trim().split(/\s+/);

    if (values.length < 8 || !values.every((value) => /^\d+$/.test(value)) || cpus[id!]) {
      throw new Error('Invalid CPU counters');
    }

    cpus[id!] = values.slice(0, 8).map((value) => BigInt(value));
  }
  if (!cpus.cpu) {
    throw new Error('Missing aggregate CPU counters');
  }

  return { bootId, at, cpus };
}

export async function readCpu(signal: AbortSignal): Promise<CpuCounters> {
  const [stat, boot] = await Promise.all([
    readFile('/proc/stat', { encoding: 'utf8', signal }),
    readFile('/proc/sys/kernel/random/boot_id', { encoding: 'utf8', signal }),
  ]);

  return parseCpuStat(stat, boot.trim(), performance.now());
}
