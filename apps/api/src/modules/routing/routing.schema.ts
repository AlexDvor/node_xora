import { sampleSchema, responses, noQuery } from '../../common/schemas/monitoring.schema.js';
import { monitoringExamples } from '../metrics/metrics.examples.js';
import {
  object as o,
  array,
  string as s,
  nullableString as ns,
  nullableNumber as nn,
} from '../../common/schemas/monitoring.schema.js';
export const routesDataSchema = o({
  routes: array(
    o({
      family: s,
      destination: s,
      gateway: ns,
      interface: ns,
      metric: nn,
      table: s,
      protocol: ns,
      multipath: array(o({ gateway: ns, interface: ns, weight: nn })),
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
