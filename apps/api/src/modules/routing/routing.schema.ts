import { sampleSchema, responses, noQuery } from '../../common/schemas/monitoring.schema.js';
import { monitoringExamples } from '../metrics/metrics.examples.js';
import {
  object as objectSchema,
  array,
  string as stringSchema,
  nullableString as nullableStringSchema,
  nullableNumber as nullableNumberSchema,
} from '../../common/schemas/monitoring.schema.js';

export const routesDataSchema = objectSchema({
  routes: array(
    objectSchema({
      family: stringSchema,
      destination: stringSchema,
      gateway: nullableStringSchema,
      interface: nullableStringSchema,
      metric: nullableNumberSchema,
      table: stringSchema,
      protocol: nullableStringSchema,
      multipath: array(
        objectSchema({
          gateway: nullableStringSchema,
          interface: nullableStringSchema,
          weight: nullableNumberSchema,
        }),
      ),
    }),
  ),
});

export const routingRouteSchema = {
  tags: ['Routing'],
  summary: 'Read IPv4/IPv6 routes',
  description:
    'All visible tables in current network namespace via rtnetlink through fixed ip -j route commands. Multipath next hops preserved. No route mutation.',
  querystring: noQuery,
  response: responses(sampleSchema({ ...routesDataSchema, example: monitoringExamples.routes })),
};
