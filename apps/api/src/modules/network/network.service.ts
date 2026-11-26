import type { NetworkCounters } from '../../infrastructure/linux/network.provider.js';
import { monitoringPolicy as policy } from '../../config/monitoring.js';

export function networkUsage(previous: NetworkCounters | undefined, current: NetworkCounters) {
  const elapsed =
    previous && previous.bootId === current.bootId && current.at > previous.at
      ? (current.at - previous.at) / 1000
      : null;
  const interfaces = current.links.map((link) => {
    const old = previous?.links.find((item) => item.id === link.id);
    const rx = old ? BigInt(link.rxBytes) - BigInt(old.rxBytes) : null;
    const tx = old ? BigInt(link.txBytes) - BigInt(old.txBytes) : null;
    const valid =
      elapsed !== null &&
      rx !== null &&
      tx !== null &&
      rx >= 0n &&
      tx >= 0n &&
      rx <= BigInt(Number.MAX_SAFE_INTEGER) &&
      tx <= BigInt(Number.MAX_SAFE_INTEGER);

    return {
      ...link,
      rxBytesPerSecond: valid ? Number(rx) / elapsed : null,
      txBytesPerSecond: valid ? Number(tx) / elapsed : null,
    };
  });
  // Sum only the selected physical LAN interface; virtual/down links never double count.
  const included = interfaces.filter(
    (link) => link.name === policy.preferredInterface && link.state === 'UP',
  );
  const totalValid =
    included.length > 0 &&
    included.every((link) => link.rxBytesPerSecond !== null && link.txBytesPerSecond !== null);
  const preferred = interfaces.find(
    (link) => link.name === policy.preferredInterface && link.state === 'UP',
  );
  const address = preferred?.addresses.find(
    (item) => item.family === 'IPv4' && item.scope === 'global',
  );

  return {
    interfaces,
    includedInterfaceIds: included.map((link) => link.id),
    rxBytesPerSecond: totalValid
      ? included.reduce((sum, link) => sum + link.rxBytesPerSecond!, 0)
      : null,
    txBytesPerSecond: totalValid
      ? included.reduce((sum, link) => sum + link.txBytesPerSecond!, 0)
      : null,
    windowSeconds: elapsed,
    currentAddress:
      address && preferred
        ? { interfaceId: preferred.id, family: address.family, address: address.address }
        : null,
    addressReason: address ? null : 'PREFERRED_ADDRESS_UNAVAILABLE',
  };
}
