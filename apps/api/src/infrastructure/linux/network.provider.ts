import { readFile } from 'node:fs/promises';
import { readCommand } from './read-command.js';
import { monitoringPolicy as policy } from '../../config/monitoring.js';

interface IpAddress {
  family: string;
  local: string;
  prefixlen: number;
  scope: string;
}

interface IpLink {
  ifindex: number;
  ifname: string;
  operstate: string;
  flags: string[];
  mtu: number;
  link_type: string;
  linkinfo?: { info_kind?: string };
  addr_info: IpAddress[];
}

export interface NetworkCounters {
  bootId: string;
  at: number;
  links: {
    id: string;
    name: string;
    index: number;
    state: string;
    kind: string;
    mtu: number;
    addresses: { family: string; address: string; prefix: number; scope: string }[];
    rxBytes: string;
    txBytes: string;
  }[];
}

export function parseNetDev(text: string): Map<string, { rxBytes: string; txBytes: string }> {
  const counters = new Map<string, { rxBytes: string; txBytes: string }>();

  for (const line of text.split('\n').slice(2)) {
    const colon = line.lastIndexOf(':');

    if (colon < 0) continue;

    const values = line
      .slice(colon + 1)
      .trim()
      .split(/\s+/);

    if (values.length < 16 || !values.every((value) => /^\d+$/.test(value)))
      throw new Error('Invalid interface counters');

    counters.set(line.slice(0, colon).trim(), { rxBytes: values[0]!, txBytes: values[8]! });
  }

  return counters;
}

export async function readNetwork(signal: AbortSignal): Promise<NetworkCounters> {
  const [json, text, boot] = await Promise.all([
    readCommand('/usr/sbin/ip', ['-j', '-d', 'address', 'show'], signal),
    readFile('/proc/net/dev', { encoding: 'utf8', signal }),
    readFile('/proc/sys/kernel/random/boot_id', { encoding: 'utf8', signal }),
  ]);
  const links = JSON.parse(json) as IpLink[];
  const counters = parseNetDev(text);

  return {
    bootId: boot.trim(),
    at: performance.now(),
    links: links.map((link) => {
      const count = counters.get(link.ifname);

      if (!count) throw new Error('Interface changed during collection');

      return {
        id: `${boot.trim()}:${link.ifindex}:${link.ifname}`,
        name: link.ifname,
        index: link.ifindex,
        state: link.operstate,
        kind: link.linkinfo?.info_kind ?? link.link_type,
        mtu: link.mtu,
        addresses: link.addr_info.map((address) => ({
          family: address.family === 'inet' ? 'IPv4' : 'IPv6',
          address: address.local,
          prefix: address.prefixlen,
          scope: address.scope,
        })),
        ...count,
      };
    }),
  };
}

export async function readRoutes(signal: AbortSignal) {
  const [ipv4, ipv6] = await Promise.all([
    readCommand('/usr/sbin/ip', ['-j', '-4', 'route', 'show', 'table', 'all'], signal),
    readCommand('/usr/sbin/ip', ['-j', '-6', 'route', 'show', 'table', 'all'], signal),
  ]);

  const convert = (text: string, family: string) =>
    (JSON.parse(text) as Record<string, unknown>[]).map((row) => ({
      family,
      destination: String(row.dst ?? 'default'),
      gateway: row.gateway ? String(row.gateway) : null,
      interface: row.dev ? String(row.dev) : null,
      metric: typeof row.metric === 'number' ? row.metric : null,
      table: String(row.table ?? 'main'),
      protocol: row.protocol ? String(row.protocol) : null,
      multipath: Array.isArray(row.nexthops)
        ? row.nexthops.map((hop: Record<string, unknown>) => ({
            gateway: hop.gateway ? String(hop.gateway) : null,
            interface: hop.dev ? String(hop.dev) : null,
            weight: typeof hop.weight === 'number' ? hop.weight : null,
          }))
        : [],
    }));

  return [...convert(ipv4, 'IPv4'), ...convert(ipv6, 'IPv6')];
}

function decodeAddress(hex: string) {
  if (hex.length === 8)
    return hex
      .match(/../g)!
      .reverse()
      .map((byte) => parseInt(byte, 16))
      .join('.');
  if (hex.length !== 32) throw new Error('Invalid socket address');

  return hex
    .match(/.{8}/g)!
    .map((word) => word.match(/../g)!.reverse().join(''))
    .join('')
    .match(/.{4}/g)!
    .join(':')
    .toLowerCase();
}

export async function readConnections(signal: AbortSignal) {
  const results: {
    protocol: string;
    localAddress: string;
    localPort: number;
    remoteAddress: string;
    remotePort: number;
    state: string;
    uid: number;
    inode: string;
  }[] = [];
  let truncated = false;

  for (const protocol of ['tcp', 'tcp6', 'udp', 'udp6']) {
    const text = await readFile(`/proc/net/${protocol}`, { encoding: 'utf8', signal });

    for (const line of text.trim().split('\n').slice(1)) {
      if (results.length >= policy.maxSockets) {
        truncated = true;

        break;
      }

      const values = line.trim().split(/\s+/);
      const [local, localPort] = values[1]!.split(':');
      const [remote, remotePort] = values[2]!.split(':');

      results.push({
        protocol,
        localAddress: decodeAddress(local!),
        localPort: parseInt(localPort!, 16),
        remoteAddress: decodeAddress(remote!),
        remotePort: parseInt(remotePort!, 16),
        state: values[3]!,
        uid: Number(values[7]),
        inode: values[9]!,
      });
    }
  }

  return {
    scope: 'current network namespace; TCP/UDP IPv4/IPv6; process mapping unavailable',
    truncated,
    connections: results,
  };
}
