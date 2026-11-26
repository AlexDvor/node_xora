import { sampleSchema, responses, noQuery } from '../../../common/schemas/monitoring.schema.js';
import {
  object as o,
  array,
  string as s,
  nullableString as ns,
  nullableNumber as nn,
  count,
  boolean as b,
} from '../../../common/schemas/monitoring.schema.js';
export const cpuDataSchema = o({
  totalPercent: { ...nn, minimum: 0, maximum: 100 },
  cores: array(o({ id: s, usedPercent: { ...nn, minimum: 0, maximum: 100 } })),
  windowSeconds: nn,
  bootId: s,
});
export const disksDataSchema = o({
  mountPoint: s,
  filesystem: s,
  device: s,
  readOnly: b,
  totalBytes: count,
  freeBytes: count,
  availableBytes: count,
  usedBytes: count,
  usedPercent: nn,
});
export const temperatureDataSchema = o({
  sensors: array(o({ id: s, chip: s, label: s, celsius: nn, reason: ns })),
});
export const sessionDataSchema = o({
  scope: s,
  connectedUsersCount: count,
  sessionsCount: count,
  partial: b,
  sessions: array(
    o({
      sessionId: s,
      uid: count,
      username: ns,
      state: ns,
      type: ns,
      service: ns,
      remote: { ...b, nullable: true },
      remoteHost: ns,
      tty: ns,
      seat: ns,
      leaderPid: { ...count, nullable: true },
      startedAt: ns,
      durationSeconds: nn,
      idleHint: { ...b, nullable: true },
      idleSince: ns,
      missingMetadataReason: s,
    }),
  ),
});

export function systemMonitoringSchema(resource: 'cpu' | 'disks' | 'temperature' | 'sessions') {
  return {
    tags: ['System'],
    summary: `Read shared ${resource} sample`,
    description:
      resource === 'cpu'
        ? 'Delta CPU percent 0–100 total and per logical CPU; iowait counts as idle. Guest times are not double counted. First/reset sample is warming_up with null values.'
        : resource === 'disks'
          ? 'Root filesystem / only. Bytes from statfs; used=total-free; percent=used/total*100. Available excludes reserved blocks; percent can differ from df.'
          : resource === 'temperature'
            ? 'Read-only hwmon Celsius values. Sensor IDs use resolved device paths; labels are from driver, not guessed CPU package labels. Faults are null with reason.'
            : 'Logind interactive online/active sessions. Idle users remain connected; background/closing sessions excluded. Empty metadata is null with reason.',
    querystring: noQuery,
    response: responses(
      sampleSchema(
        {
          cpu: cpuDataSchema,
          disks: disksDataSchema,
          temperature: temperatureDataSchema,
          sessions: sessionDataSchema,
        }[resource],
      ),
    ),
  };
}
