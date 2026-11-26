import type { CpuCounters } from '../../infrastructure/linux/cpu.provider.js';

export interface CpuInfo {
  totalPercent: number | null;
  cores: { id: string; usedPercent: number | null }[];
  windowSeconds: number | null;
  bootId: string;
}

export function cpuUsage(previous: CpuCounters | undefined, current: CpuCounters): CpuInfo {
  const ids = Object.keys(current.cpus).sort();
  const valid =
    previous &&
    previous.bootId === current.bootId &&
    ids.join(',') === Object.keys(previous.cpus).sort().join(',') &&
    current.at > previous.at;

  const calculate = (id: string): number | null => {
    if (!valid) return null;

    const deltas = current.cpus[id]!.map((value, i) => value - previous.cpus[id]![i]!);

    if (deltas.some((value) => value < 0n)) return null;

    const total = deltas.reduce((sum, value) => sum + value, 0n);
    const busy = total - deltas[3]! - deltas[4]!;

    if (total <= 0n || total > BigInt(Number.MAX_SAFE_INTEGER)) return null;

    return (Number(busy) / Number(total)) * 100;
  };

  return {
    totalPercent: calculate('cpu'),
    cores: ids.filter((id) => id !== 'cpu').map((id) => ({ id, usedPercent: calculate(id) })),
    windowSeconds: valid ? (current.at - previous.at) / 1000 : null,
    bootId: current.bootId,
  };
}
