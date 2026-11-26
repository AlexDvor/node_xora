import { sampleSchema, responses, noQuery } from '../../common/schemas/monitoring.schema.js';
import { monitoringExamples } from '../metrics/metrics.examples.js';
import { object as o, array, string as s, count } from '../../common/schemas/monitoring.schema.js';
export const serviceUnitSchema = o({
  name: s,
  scope: { type: 'string', enum: ['system', 'user'] },
  description: s,
  loadState: s,
  activeState: s,
  subState: s,
  mainPid: { ...count, nullable: true },
});
export const servicesDataSchema = o({
  units: array(serviceUnitSchema),
  runningCount: count,
  scope: s,
});

export const serviceDetailRouteSchema = {
  tags: ['Services'],
  summary: 'Read a known service unit',
  params: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', maxLength: 256, pattern: '^[A-Za-z0-9_.@:-]+\\.service$' },
    },
  },
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: { scope: { type: 'string', enum: ['system', 'user'], default: 'system' } },
  },
  response: responses(serviceUnitSchema),
};

export const servicesRouteSchema = {
  tags: ['Services'],
  summary: 'Read loaded system and current-user services',
  description:
    'Via systemctl D-Bus client. runningCount counts active/running units in this scope, not health/listening checks or all installed units. mainPid is available only in unit detail. No hardcoded ports.',
  querystring: noQuery,
  response: responses(
    sampleSchema({ ...servicesDataSchema, example: monitoringExamples.services }),
  ),
};
