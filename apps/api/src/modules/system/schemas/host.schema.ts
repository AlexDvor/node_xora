import type { FastifySchema } from 'fastify';
import { errorSchema } from '../../../common/schemas/error.schema.js';

const text = { type: 'string' } as const;
const nullableText = { type: 'string', nullable: true } as const;
const number = { type: 'number', minimum: 0 } as const;
const metadata = {
  source: { type: 'string', enum: ['linux', 'mock'] },
  collectedAt: { type: 'string', format: 'date-time' },
} as const;
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
function route(
  summary: string,
  description: string,
  properties: Record<string, unknown>,
): FastifySchema {
  return {
    tags: ['System'],
    summary,
    description,
    response: { 200: object({ data: object({ ...properties, ...metadata }) }), 503: errorSchema },
  };
}

export const infoRouteSchema = route(
  'Get host identity',
  'Reads hostname, /etc/os-release, kernel and CPU metadata. Null physicalCoreCount means unavailable topology; logicalCpuCount is not a physical core count.',
  {
    hostname: text,
    os: object({ id: nullableText, name: nullableText, version: nullableText }),
    kernel: text,
    architecture: text,
    cpuModel: nullableText,
    logicalCpuCount: { type: 'integer', minimum: 0 },
    physicalCoreCount: { type: 'integer', minimum: 1, nullable: true },
  },
);
export const uptimeRouteSchema = route(
  'Get uptime and boot identity',
  'uptimeSeconds comes from /proc/uptime. bootTime comes from btime in /proc/stat; wall-clock corrections may affect their relationship. bootId identifies a boot.',
  {
    uptimeSeconds: { ...number, description: 'Elapsed uptime in seconds.' },
    bootId: text,
    bootTime: { type: 'string', format: 'date-time' },
  },
);
export const loadRouteSchema = route(
  'Get load averages',
  'Linux node:os.loadavg(): average runnable and uninterruptible tasks over 1, 5 and 15 minutes. These are task counts, not CPU percentages.',
  { load1: number, load5: number, load15: number },
);
