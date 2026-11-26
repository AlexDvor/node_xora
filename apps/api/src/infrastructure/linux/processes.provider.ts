import { readFile, readdir } from 'node:fs/promises';
import { readCommand } from './read-command.js';
import { monitoringPolicy as policy } from '../../config/monitoring.js';

export interface RawProcess {
  pid: number;
  uid: number;
  username: string | null;
  name: string;
  state: string;
  startTicks: string;
  cpuTicks: string;
  rssBytes: number;
}

export interface ProcessCounters {
  bootId: string;
  at: number;
  ticksPerSecond: number;
  processes: RawProcess[];
  partial: boolean;
  skipped: number;
}

export function parseProcessStat(stat: string) {
  const open = stat.indexOf('('),
    close = stat.lastIndexOf(')');

  if (open < 1 || close <= open) throw new Error('Invalid process stat');

  const fields = stat
    .slice(close + 1)
    .trim()
    .split(/\s+/);
  const pid = Number(stat.slice(0, open).trim());

  if (
    !Number.isSafeInteger(pid) ||
    pid <= 0 ||
    fields.length < 22 ||
    ![fields[11], fields[12], fields[19], fields[21]].every(
      (value) => value !== undefined && /^\d+$/.test(value),
    )
  )
    throw new Error('Invalid process counters');

  return {
    pid,
    name: stat.slice(open + 1, close).replace(/[\x00-\x1f\x7f]/g, ''),
    state: fields[0]!,
    startTicks: fields[19]!,
    cpuTicks: (BigInt(fields[11]!) + BigInt(fields[12]!)).toString(),
    rssPages: BigInt(fields[21]!),
  };
}

export interface ProcessReads {
  text(path: string, signal?: AbortSignal): Promise<string>;
  directory(path: string): Promise<string[]>;
  command(file: string, args: string[]): Promise<string>;
}

const processReads: ProcessReads = {
  text: (path, signal) => readFile(path, { encoding: 'utf8', signal }),
  directory: (path) => readdir(path),
  command: (file, args) => readCommand(file, args),
};

export class LinuxProcessProvider {
  constructor(private readonly io: ProcessReads = processReads) {}

  private units: Promise<{ pageSize: number; ticksPerSecond: number }> | undefined;
  private users: Map<number, string> = new Map();
  private usersReadAt = 0;

  async read(signal: AbortSignal): Promise<ProcessCounters> {
    this.units ??= Promise.all([
      this.io.command('/usr/bin/getconf', ['PAGESIZE']),
      this.io.command('/usr/bin/getconf', ['CLK_TCK']),
    ])
      .then(([pages, ticks]) => {
        const pageSize = Number(pages.trim()),
          ticksPerSecond = Number(ticks.trim());

        if (![pageSize, ticksPerSecond].every((value) => Number.isSafeInteger(value) && value > 0))
          throw new Error('Invalid system units');

        return { pageSize, ticksPerSecond };
      })
      .catch((error) => {
        this.units = undefined;

        throw error;
      });

    const [{ pageSize, ticksPerSecond }, entries, boot] = await Promise.all([
      this.units,
      this.io.directory('/proc'),
      this.io.text('/proc/sys/kernel/random/boot_id', signal),
    ]);

    if (performance.now() - this.usersReadAt > 60000 || !this.usersReadAt) {
      const passwd = await this.io.text('/etc/passwd', signal);

      this.users = new Map(
        passwd
          .trim()
          .split('\n')
          .map((line) => {
            const fields = line.split(':');

            return [Number(fields[2]), fields[0]!] as const;
          }),
      );
      this.usersReadAt = performance.now();
    }

    const pids = entries
      .filter((entry) => /^\d+$/.test(entry))
      .sort((a, b) => Number(a) - Number(b));
    const processes: RawProcess[] = [];
    let skipped = 0;

    // Eight concurrent reads, with cancellation between bounded batches.
    for (let offset = 0; offset < Math.min(pids.length, policy.maxProcesses); offset += 8) {
      signal.throwIfAborted();
      await Promise.all(
        pids.slice(offset, Math.min(offset + 8, policy.maxProcesses)).map(async (pid) => {
          try {
            const [stat, status] = await Promise.all([
              this.io.text(`/proc/${pid}/stat`, signal),
              this.io.text(`/proc/${pid}/status`, signal),
            ]);
            const process = parseProcessStat(stat);
            const uidText = /^Uid:\s+(\d+)/m.exec(status)?.[1];
            const rssBytes = Number(process.rssPages * BigInt(pageSize));

            if (!uidText || !Number.isSafeInteger(rssBytes))
              throw new Error('Invalid process metadata');

            const uid = Number(uidText);

            processes.push({
              pid: process.pid,
              name: process.name,
              state: process.state,
              startTicks: process.startTicks,
              cpuTicks: process.cpuTicks,
              rssBytes,
              uid,
              username: this.users.get(uid) ?? null,
            });
          } catch {
            skipped++;
          }
        }),
      );
    }

    signal.throwIfAborted();

    if (pids.length > 0 && processes.length === 0)
      throw Object.assign(new Error('No process metadata readable'), { code: 'EACCES' });

    return {
      bootId: boot.trim(),
      at: performance.now(),
      ticksPerSecond,
      processes,
      skipped,
      partial: skipped > 0 || pids.length > policy.maxProcesses,
    };
  }
}
