import { readCommand } from './read-command.js';
import { spawn } from 'node:child_process';
import { monitoringPolicy as policy } from '../../config/monitoring.js';

export interface JournalQuery {
  limit: number;
  cursor?: string;
  priority?: number;
  since?: string;
  until?: string;
}

export interface LogEntry {
  cursor: string;
  timestamp: string;
  bootId: string | null;
  priority: number | null;
  unit: string;
  identifier: string | null;
  pid: number | null;
  message: string;
}

export function redactMessage(message: string): string {
  // Best-effort defense in depth; only this application's journal is exposed.
  return message
    .replace(/([\x00-\x08\x0b\x0c\x0e-\x1f\x7f])/g, '')
    .replace(
      /((?:password|passwd|token|secret|authorization|api[_-]?key)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi,
      '$1[REDACTED]',
    )
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .slice(0, 16384);
}

export function parseJournal(text: string): LogEntry[] {
  return text.trim()
    ? text
        .trim()
        .split('\n')
        .map((line) => {
          const row = JSON.parse(line) as Record<string, unknown>;

          if (typeof row.__CURSOR !== 'string' || typeof row.__REALTIME_TIMESTAMP !== 'string')
            throw new Error('Invalid journal metadata');

          const timestamp = Number(BigInt(row.__REALTIME_TIMESTAMP) / 1000n);
          const message =
            typeof row.MESSAGE === 'string' ? row.MESSAGE : '[non-text journal message]';

          return {
            cursor: row.__CURSOR,
            timestamp: new Date(timestamp).toISOString(),
            bootId: typeof row._BOOT_ID === 'string' ? row._BOOT_ID : null,
            priority: typeof row.PRIORITY === 'string' ? Number(row.PRIORITY) : null,
            unit: policy.logUnit,
            identifier: typeof row.SYSLOG_IDENTIFIER === 'string' ? row.SYSLOG_IDENTIFIER : null,
            pid: typeof row._PID === 'string' ? Number(row._PID) : null,
            message: redactMessage(message),
          };
        })
    : [];
}

export async function readJournal(query: JournalQuery, signal: AbortSignal) {
  const args = [
    '--user',
    `--unit=${policy.logUnit}`,
    '--output=json',
    '--no-pager',
    '--quiet',
    '--output-fields=MESSAGE,PRIORITY,_BOOT_ID,_PID,SYSLOG_IDENTIFIER',
  ];

  if (query.cursor) args.push(`--after-cursor=${query.cursor}`, `--lines=+${query.limit + 1}`);
  else args.push(`--lines=${query.limit + 1}`);
  if (query.priority !== undefined) args.push(`--priority=${query.priority}`);
  if (query.since) args.push(`--since=${query.since}`);
  if (query.until) args.push(`--until=${query.until}`);

  const text = await readCommand('/usr/bin/journalctl', args, signal);
  const rows = parseJournal(text);
  const entries = rows.slice(0, query.limit);

  return {
    scope: 'current OS user journal, NodeXora unit only',
    entries,
    nextCursor: entries.at(-1)?.cursor ?? query.cursor ?? null,
    hasMore: rows.length > query.limit,
    direction: 'forward',
    gaps: query.cursor
      ? 'Cursor resume can fail after journal rotation; use a new initial query on 409'
      : null,
  };
}

/** Bounded event-driven reader shared by all log subscribers. */
export function followJournal(
  onEntries: (entries: LogEntry[]) => void,
  onGap: () => void,
): () => void {
  const child = spawn(
    '/usr/bin/journalctl',
    [
      '--user',
      `--unit=${policy.logUnit}`,
      '--follow',
      '--lines=0',
      '--output=json',
      '--no-pager',
      '--quiet',
      '--output-fields=MESSAGE,PRIORITY,_BOOT_ID,_PID,SYSLOG_IDENTIFIER',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, LC_ALL: 'C' } },
  );
  let buffer = '',
    stopping = false,
    discarding = false;

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;

    let newline: number;

    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline);

      buffer = buffer.slice(newline + 1);

      if (discarding || Buffer.byteLength(line) > 65536) {
        discarding = false;
        onGap();

        continue;
      }
      try {
        const entries = parseJournal(line);

        if (entries.length) onEntries(entries);
      } catch {
        onGap();
      }
    }
    if (Buffer.byteLength(buffer) > 65536) {
      buffer = '';
      discarding = true;
      onGap();
    }
  });
  child.stderr.on('data', () => {
    if (!stopping) onGap();
  });
  child.on('error', () => {
    if (!stopping) onGap();
  });
  child.on('close', () => {
    if (!stopping) onGap();
  });

  return () => {
    stopping = true;
    child.kill('SIGTERM');
  };
}
