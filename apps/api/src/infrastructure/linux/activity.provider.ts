import { readCommand } from './read-command.js';

export interface ServiceUnit {
  name: string;
  scope: 'system' | 'user';
  description: string;
  loadState: string;
  activeState: string;
  subState: string;
  mainPid: number | null;
}

export async function readServices(signal: AbortSignal): Promise<ServiceUnit[]> {
  const read = async (scope: 'system' | 'user') => {
    // systemctl is a D-Bus client. Its JSON output avoids an extra native D-Bus dependency.
    const rows = JSON.parse(
      await readCommand(
        '/usr/bin/systemctl',
        [
          scope === 'user' ? '--user' : '--system',
          'list-units',
          '--all',
          '--type=service',
          '--output=json',
          '--no-pager',
        ],
        signal,
      ),
    ) as { unit: string; description: string; load: string; active: string; sub: string }[];

    return rows.map((row) => ({
      name: row.unit,
      scope,
      description: row.description,
      loadState: row.load,
      activeState: row.active,
      subState: row.sub,
      mainPid: null,
    }));
  };

  const [system, user] = await Promise.all([read('system'), read('user')]);

  return [...system, ...user];
}

export async function readServiceDetail(
  scope: 'system' | 'user',
  name: string,
  signal: AbortSignal,
) {
  const text = await readCommand(
    '/usr/bin/systemctl',
    [
      scope === 'user' ? '--user' : '--system',
      'show',
      '--no-pager',
      '--property=Id,Description,LoadState,ActiveState,SubState,MainPID',
      '--',
      name,
    ],
    signal,
  );
  const fields = new Map(
    text
      .trim()
      .split('\n')
      .map((line) => {
        const i = line.indexOf('=');

        return [line.slice(0, i), line.slice(i + 1)];
      }),
  );

  return {
    name: fields.get('Id') ?? name,
    scope,
    description: fields.get('Description') ?? '',
    loadState: fields.get('LoadState') ?? 'not-found',
    activeState: fields.get('ActiveState') ?? 'unknown',
    subState: fields.get('SubState') ?? 'unknown',
    mainPid: fields.has('MainPID') ? Number(fields.get('MainPID')) : null,
  };
}

export async function readSessions(signal: AbortSignal) {
  const list = JSON.parse(
    await readCommand(
      '/usr/bin/busctl',
      [
        '--system',
        '--json=short',
        'call',
        'org.freedesktop.login1',
        '/org/freedesktop/login1',
        'org.freedesktop.login1.Manager',
        'ListSessions',
      ],
      signal,
    ),
  ) as { data: [[string, number, string, string, string][]] };
  const sessions = [];
  let partial = false;
  let failed = 0;

  for (const [sessionId] of list.data[0].slice(0, 256)) {
    try {
      const text = await readCommand(
        '/usr/bin/loginctl',
        [
          'show-session',
          sessionId,
          '--no-pager',
          ...[
            'Id',
            'User',
            'Name',
            'State',
            'Type',
            'Class',
            'Service',
            'Remote',
            'RemoteHost',
            'TTY',
            'Seat',
            'Leader',
            'TimestampMonotonic',
            'Timestamp',
            'IdleHint',
            'IdleSinceHint',
          ].map((name) => `--property=${name}`),
        ],
        signal,
      );
      const properties = new Map(
        text
          .trim()
          .split('\n')
          .map((line) => {
            const i = line.indexOf('=');

            return [line.slice(0, i), line.slice(i + 1)];
          }),
      );
      const session = normalizeSession(sessionId, properties, await readBoottime());

      if (session) sessions.push(session);
    } catch {
      partial = true;
      failed++;
    }
  }
  if (list.data[0].length > 256) partial = true;
  if (list.data[0].length > 0 && failed === Math.min(list.data[0].length, 256))
    throw new Error('Session metadata unavailable');

  return {
    scope: 'logind online/active interactive user sessions',
    connectedUsersCount: new Set(sessions.map((session) => session.uid)).size,
    sessionsCount: sessions.length,
    sessions,
    partial,
  };
}

async function readBoottime() {
  const { readFile } = await import('node:fs/promises');

  return Number((await readFile('/proc/uptime', 'utf8')).split(' ')[0]);
}

export function normalizeSession(
  sessionId: string,
  properties: Map<string, string>,
  uptimeSeconds: number,
) {
  if (
    !['active', 'online'].includes(properties.get('State') ?? '') ||
    !['user', 'user-early', 'user-light'].includes(properties.get('Class') ?? '')
  )
    return null;

  const get = (key: string) => properties.get(key) || null;

  const monotonic = Number(properties.get('TimestampMonotonic'));
  const started = get('Timestamp');
  const parsed = started ? Date.parse(started) : NaN;

  return {
    sessionId,
    uid: Number(properties.get('User')),
    username: get('Name'),
    state: get('State'),
    type: get('Type'),
    service: get('Service'),
    remote: properties.has('Remote') ? properties.get('Remote') === 'yes' : null,
    remoteHost: get('RemoteHost'),
    tty: get('TTY'),
    seat: get('Seat'),
    leaderPid: get('Leader') ? Number(get('Leader')) : null,
    startedAt: Number.isFinite(parsed) ? new Date(parsed).toISOString() : null,
    durationSeconds:
      Number.isFinite(monotonic) && monotonic > 0
        ? Math.max(0, uptimeSeconds - monotonic / 1000000)
        : null,
    idleHint: properties.has('IdleHint') ? properties.get('IdleHint') === 'yes' : null,
    idleSince: get('IdleSinceHint'),
    missingMetadataReason:
      'Empty or absent logind properties are null; no terminal content is read',
  };
}
