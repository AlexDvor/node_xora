import { sampleSchema, responses, noQuery } from '../../common/schemas/monitoring.schema.js';
import {
  object as o,
  array,
  string as s,
  nullableString as ns,
  nullableNumber as nn,
  count,
  boolean as b,
  strings,
} from '../../common/schemas/monitoring.schema.js';
export const networkDataSchema = o({
  interfaces: array(
    o({
      id: s,
      name: s,
      index: count,
      state: s,
      kind: s,
      mtu: count,
      addresses: array(o({ family: s, address: s, prefix: count, scope: s })),
      rxBytes: {
        ...s,
        description: 'Cumulative RX bytes as decimal string, avoiding unsafe integer conversion.',
      },
      txBytes: s,
      rxBytesPerSecond: nn,
      txBytesPerSecond: nn,
    }),
  ),
  includedInterfaceIds: strings,
  rxBytesPerSecond: nn,
  txBytesPerSecond: nn,
  windowSeconds: nn,
  currentAddress: { ...o({ interfaceId: s, family: s, address: s }), nullable: true },
  addressReason: ns,
});
export const connectionsDataSchema = o({
  scope: s,
  truncated: b,
  connections: array(
    o({
      protocol: s,
      localAddress: s,
      localPort: count,
      remoteAddress: s,
      remotePort: count,
      state: s,
      uid: count,
      inode: s,
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
