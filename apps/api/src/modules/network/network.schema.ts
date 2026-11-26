import { sampleSchema, responses, noQuery } from '../../common/schemas/monitoring.schema.js';
import {
  object as objectSchema,
  array,
  string as stringSchema,
  nullableString as nullableStringSchema,
  nullableNumber as nullableNumberSchema,
  count,
  boolean as booleanSchema,
  strings,
} from '../../common/schemas/monitoring.schema.js';

export const networkDataSchema = objectSchema({
  interfaces: array(
    objectSchema({
      id: stringSchema,
      name: stringSchema,
      index: count,
      state: stringSchema,
      kind: stringSchema,
      mtu: count,
      addresses: array(
        objectSchema({
          family: stringSchema,
          address: stringSchema,
          prefix: count,
          scope: stringSchema,
        }),
      ),
      rxBytes: {
        ...stringSchema,
        description: 'Cumulative RX bytes as decimal string, avoiding unsafe integer conversion.',
      },
      txBytes: stringSchema,
      rxBytesPerSecond: nullableNumberSchema,
      txBytesPerSecond: nullableNumberSchema,
    }),
  ),
  includedInterfaceIds: strings,
  rxBytesPerSecond: nullableNumberSchema,
  txBytesPerSecond: nullableNumberSchema,
  windowSeconds: nullableNumberSchema,
  currentAddress: {
    ...objectSchema({ interfaceId: stringSchema, family: stringSchema, address: stringSchema }),
    nullable: true,
  },
  addressReason: nullableStringSchema,
});

export const connectionsDataSchema = objectSchema({
  scope: stringSchema,
  truncated: booleanSchema,
  connections: array(
    objectSchema({
      protocol: stringSchema,
      localAddress: stringSchema,
      localPort: count,
      remoteAddress: stringSchema,
      remotePort: count,
      state: stringSchema,
      uid: count,
      inode: stringSchema,
    }),
  ),
});

export function networkRouteSchema(
  path: 'interfaces' | 'traffic' | 'connections',
  resource: 'network' | 'connections',
) {
  return {
    tags: ['Network'],
    summary: `Read network ${path}`,
    description:
      path === 'connections'
        ? 'Bounded TCP/UDP sockets in current network namespace; hex kernel state; no PID mapping. Not a list of users.'
        : 'Netlink via fixed iproute2 JSON command; counters from /proc/net/dev. Rates use monotonic elapsed seconds and decimal string counters. Total includes only configured enp5s0 while UP, excluding loopback/virtual links. New/reset/renamed interface requires new baseline. Current address is global IPv4 on preferred interface; never a browser address. External public-IP lookup disabled.',
    querystring: noQuery,
    response: responses(
      sampleSchema({ network: networkDataSchema, connections: connectionsDataSchema }[resource]),
    ),
  };
}
