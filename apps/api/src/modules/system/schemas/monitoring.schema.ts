import { sampleSchema, responses, noQuery } from '../../../common/schemas/monitoring.schema.js';
import {
  object as objectSchema,
  array,
  string as stringSchema,
  nullableString as nullableStringSchema,
  nullableNumber as nullableNumberSchema,
  count,
  boolean as booleanSchema,
} from '../../../common/schemas/monitoring.schema.js';

export const cpuDataSchema = objectSchema({
  totalPercent: { ...nullableNumberSchema, minimum: 0, maximum: 100 },
  cores: array(
    objectSchema({
      id: stringSchema,
      usedPercent: { ...nullableNumberSchema, minimum: 0, maximum: 100 },
    }),
  ),
  windowSeconds: nullableNumberSchema,
  bootId: stringSchema,
});

export const disksDataSchema = objectSchema({
  mountPoint: stringSchema,
  filesystem: stringSchema,
  device: stringSchema,
  readOnly: booleanSchema,
  totalBytes: count,
  freeBytes: count,
  availableBytes: count,
  usedBytes: count,
  usedPercent: nullableNumberSchema,
});

export const temperatureDataSchema = objectSchema({
  sensors: array(
    objectSchema({
      id: stringSchema,
      chip: stringSchema,
      label: stringSchema,
      celsius: nullableNumberSchema,
      reason: nullableStringSchema,
    }),
  ),
});

export const sessionDataSchema = objectSchema({
  scope: stringSchema,
  connectedUsersCount: count,
  sessionsCount: count,
  partial: booleanSchema,
  sessions: array(
    objectSchema({
      sessionId: stringSchema,
      uid: count,
      username: nullableStringSchema,
      state: nullableStringSchema,
      type: nullableStringSchema,
      service: nullableStringSchema,
      remote: { ...booleanSchema, nullable: true },
      remoteHost: nullableStringSchema,
      tty: nullableStringSchema,
      seat: nullableStringSchema,
      leaderPid: { ...count, nullable: true },
      startedAt: nullableStringSchema,
      durationSeconds: nullableNumberSchema,
      idleHint: { ...booleanSchema, nullable: true },
      idleSince: nullableStringSchema,
      missingMetadataReason: stringSchema,
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
