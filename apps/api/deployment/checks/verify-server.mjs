// Run over SSH stdin from /home/dvor/nodexora/api. No writes or mutations.
import assert from 'node:assert/strict';
import { readFile, statfs } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket } from 'ws';
const base = 'http://127.0.0.1';
const get = async (path) => {
  const r = await fetch(`${base}/api/v1/${path}`);
  assert.equal(r.status, 200, path);
  return (await r.json()).data;
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const current = await get('metrics/current');
const report = {
  checkedAt: new Date().toISOString(),
  bootId: (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim(),
  streamId: current.streamId,
  sections: Object.fromEntries(
    Object.entries(current.sections).map(([name, s]) => [
      name,
      { quality: s.quality, reason: s.reason },
    ]),
  ),
  runtimeBefore: current.runtime,
  collectionDurationsMs: current.diagnostics.durationsMs,
};
for (const resource of [
  'memory',
  'swap',
  'info',
  'uptime',
  'load',
  'cpu',
  'disks',
  'temperature',
  'network',
  'connections',
  'processes',
  'sessions',
  'services',
  'routes',
]) {
  assert.ok(current.sections[resource].data, `${resource}: ${current.sections[resource].reason}`);
  assert.ok(['ok', 'partial'].includes(current.sections[resource].quality), resource);
}
const meminfo = await readFile('/proc/meminfo', 'utf8');
const kb = (key) => Number(new RegExp(`^${key}:\\s+(\\d+)`, 'm').exec(meminfo)?.[1]) * 1024;
const memory = await get('system/memory');
const hostInfo = await get('system/info');
assert.equal(hostInfo.hostname, execFileSync('/usr/bin/hostname', [], { encoding: 'utf8' }).trim());
assert.equal(hostInfo.kernel, execFileSync('/usr/bin/uname', ['-r'], { encoding: 'utf8' }).trim());
const osRelease = await readFile('/etc/os-release', 'utf8');
assert.equal(hostInfo.os.id, /^ID=(.*)$/m.exec(osRelease)?.[1].replace(/^"|"$/g, ''));
report.host = {
  os: hostInfo.os,
  kernel: hostInfo.kernel,
  architecture: hostInfo.architecture,
  node: process.version,
};
const free = execFileSync('/usr/bin/free', ['-b'], { encoding: 'utf8' })
  .split('\n')
  .find((line) => /^Mem:/.test(line))
  .trim()
  .split(/\s+/);
assert.equal(memory.totalBytes, Number(free[1]));
assert.equal(memory.totalBytes, kb('MemTotal'));
assert.equal(memory.usedBytes, memory.totalBytes - memory.availableBytes);
assert.equal(memory.usedPercent, (memory.usedBytes / memory.totalBytes) * 100);
const swap = await get('system/swap');
assert.equal(swap.totalBytes, kb('SwapTotal'));
assert.equal(swap.usedBytes, swap.totalBytes - swap.freeBytes);
assert.equal(swap.usedPercent, swap.enabled ? (swap.usedBytes / swap.totalBytes) * 100 : null);
const disk = (await get('system/disks')).data;
const rawDisk = await statfs('/', { bigint: true });
assert.equal(disk.totalBytes, Number(rawDisk.blocks * rawDisk.bsize));
assert.equal(disk.usedBytes, disk.totalBytes - disk.freeBytes);
const df = execFileSync('/usr/bin/df', ['-B1', '--output=size,used,avail', '/'], {
  encoding: 'utf8',
})
  .trim()
  .split('\n')[1]
  .trim()
  .split(/\s+/)
  .map(Number);
assert.equal(df[0], disk.totalBytes);
// Before running: capacity-used tolerance is 16 MiB for changes between cache and df.
assert.ok(
  Math.abs(df[1] - disk.usedBytes) <= 16 * 1024 * 1024,
  'df used changed beyond comparison tolerance',
);
report.diskComparison = {
  apiUsedPercent: disk.usedPercent,
  dfUsedBytes: df[1],
  dfAvailableBytes: df[2],
  denominator: 'API uses used/total; df display may use used/(used+available)',
};
const interfaces = (await get('network/interfaces')).data.interfaces;
const ip = JSON.parse(execFileSync('/usr/sbin/ip', ['-j', 'address'], { encoding: 'utf8' }));
for (const link of interfaces)
  assert.ok(ip.some((row) => row.ifindex === link.index && row.ifname === link.name));
const ipCounters = JSON.parse(
  execFileSync('/usr/sbin/ip', ['-j', '-s', 'link'], { encoding: 'utf8' }),
);
for (const link of interfaces) {
  const raw = ipCounters.find((row) => row.ifindex === link.index);
  const stats = raw?.stats64 ?? raw?.stats;
  assert.ok(
    stats &&
      BigInt(stats.rx.bytes) >= BigInt(link.rxBytes) &&
      BigInt(stats.tx.bytes) >= BigInt(link.txBytes),
  );
}
const sockets = (await get('network/connections')).data;
const ssCount = execFileSync('/usr/bin/ss', ['-H', '-tanu'], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean).length;
// Before comparison: up to 20 sockets may change between the 10s cache and ss.
if (!sockets.truncated)
  assert.ok(
    Math.abs(ssCount - sockets.connections.length) <= 20,
    'Socket count differs beyond declared cache tolerance',
  );
report.socketComparison = {
  apiCount: sockets.connections.length,
  ssCount,
  toleranceCount: 20,
  scope: 'TCP/UDP IPv4/IPv6 current network namespace',
};
const routes = (await get('routing/routes')).data.routes;
const defaults = JSON.parse(
  execFileSync('/usr/sbin/ip', ['-j', '-4', 'route', 'show', 'default'], { encoding: 'utf8' }),
);
for (const route of defaults)
  assert.ok(
    routes.some(
      (row) =>
        row.family === 'IPv4' &&
        row.destination === 'default' &&
        row.interface === route.dev &&
        row.gateway === (route.gateway ?? null),
    ),
  );
const boot = await get('system/uptime');
assert.equal(boot.bootId, report.bootId);
const rawUptime = Number((await readFile('/proc/uptime', 'utf8')).split(' ')[0]);
assert.ok(Math.abs(rawUptime - boot.uptimeSeconds) < 10, 'uptime cache age exceeds 10s');
const service = await get('services/nodexora-api.service?scope=user');
assert.equal(service.activeState, 'active');
assert.ok(service.mainPid > 0);
const logs = await get('logs?limit=10');
assert.ok(logs.entries.every((entry) => entry.unit === 'nodexora-api.service'));
report.logEntryCount = logs.entries.length;
if (logs.nextCursor) {
  const next = await get(`logs?cursor=${encodeURIComponent(logs.nextCursor)}&limit=10`);
  assert.ok(next.entries.every((entry) => entry.cursor !== logs.nextCursor));
}
const sessions = (await get('system/sessions')).data;
assert.equal(sessions.connectedUsersCount, new Set(sessions.sessions.map((row) => row.uid)).size);
assert.equal(sessions.sessionsCount, sessions.sessions.length);
assert.ok(sessions.sessionsCount > 0, 'Expected the active SSH/local login sessions');
report.sessions = {
  connectedUsersCount: sessions.connectedUsersCount,
  sessionsCount: sessions.sessionsCount,
};
const processPage = (await get('processes?sort=pid&direction=asc&limit=200')).data;
assert.ok(processPage.processes.every((row) => !('commandLine' in row) && !('environment' in row)));
report.processCount = processPage.processes.length;
report.serviceCount = current.sections.services.data.units.length;
report.sensorCount = current.sections.temperature.data.sensors.length;
const topOutput = execFileSync('/usr/bin/top', ['-b', '-n', '2', '-d', '2'], {
  encoding: 'utf8',
  env: { ...process.env, LC_ALL: 'C' },
});
const cpuLine = topOutput
  .split('\n')
  .filter((line) => /Cpu\(s\)/.test(line))
  .at(-1);
assert.ok(cpuLine, 'Expected top CPU summary');
const idle = Number(/([\d.]+)\s+id/.exec(cpuLine)?.[1]);
const iowait = Number(/([\d.]+)\s+wa/.exec(cpuLine)?.[1]);
const topBusy = 100 - idle - iowait;
const cpu = (await get('system/cpu')).data;
assert.ok(Number.isFinite(topBusy));
report.cpuComparison = {
  apiPercent: cpu.totalPercent,
  topPercent: topBusy,
  note: 'Nonidentical windows: observational comparison only, not an accuracy assertion. See alignedCpuComparison.',
};
async function nextCpu(sequence) {
  const deadline=Date.now()+6000;
  while(Date.now()<deadline) {
    const sample=await get('system/cpu');
    if(sample.sequence>sequence && sample.quality==='ok')return sample;
    await wait(100);
  }
  throw new Error('CPU sample did not advance within 6s');
}
async function rawCpu() {
  const text=await readFile('/proc/stat','utf8');
  const values=/^cpu\s+(.+)$/m.exec(text)[1].trim().split(/\s+/).slice(0,8).map(BigInt);
  return {values,at:performance.now()};
}
// Observe two consecutive API transitions; raw reads follow each within the 100ms polling bound.
const startSample=await nextCpu((await get('system/cpu')).sequence);
const rawStart=await rawCpu();
const endSample=await nextCpu(startSample.sequence);
const rawEnd=await rawCpu();
assert.equal(endSample.sequence,startSample.sequence+1,'CPU comparison requires consecutive samples');
const deltas=rawEnd.values.map((value,index)=>value-rawStart.values[index]);
const totalDelta=deltas.reduce((sum,value)=>sum+value,0n);
assert.ok(totalDelta>0n&&deltas.every(value=>value>=0n));
const referencePercent=Number(totalDelta-deltas[3]-deltas[4])/Number(totalDelta)*100;
// Declared before this aligned check: 5 percentage points for at most ~100ms boundary error.
assert.ok(Math.abs(endSample.data.totalPercent-referencePercent)<=5,'Aligned raw CPU comparison exceeds 5 percentage points');
report.alignedCpuComparison={apiPercent:endSample.data.totalPercent,rawPercent:referencePercent,apiWindowSeconds:endSample.data.windowSeconds,rawWindowSeconds:(rawEnd.at-rawStart.at)/1000,tolerancePercentagePoints:5,pollIntervalMs:100};
for (const sensor of current.sections.temperature.data.sensors) {
  if (sensor.celsius === null) continue;
  const raw = Number((await readFile(`${sensor.id}_input`, 'utf8')).trim()) / 1000;
  // Up to 10 C between cached (10s) and direct readings; no calibration claim.
  assert.ok(
    Math.abs(raw - sensor.celsius) <= 10,
    'Temperature changed beyond cache comparison tolerance',
  );
}
const apiProcess = processPage.processes.find((row) => row.pid === service.mainPid);
if (apiProcess) {
  const ps = execFileSync('/usr/bin/ps', ['-p', String(service.mainPid), '-o', 'uid=,rss='], {
    encoding: 'utf8',
  })
    .trim()
    .split(/\s+/)
    .map(Number);
  assert.equal(apiProcess.uid, ps[0]);
  // Up to 32 MiB for RSS changes between a 3s cache and ps, including GC.
  assert.ok(Math.abs(apiProcess.rssBytes - ps[1] * 1024) <= 32 * 1024 * 1024);
  report.processComparison = {
    pid: service.mainPid,
    apiRssBytes: apiProcess.rssBytes,
    psRssBytes: ps[1] * 1024,
    toleranceBytes: 32 * 1024 * 1024,
  };
}
report.historyBefore = (
  await get(
    `metrics/history?series=cpu,memory,rx,tx&from=${new Date(Date.now() - 900000).toISOString()}&to=${new Date().toISOString()}&resolutionSeconds=5`,
  )
).series.map((series) => ({
  name: series.name,
  points: series.points.length,
  insufficientHistory: series.insufficientHistory,
}));
const clients = [];
const wsErrors = [];
let updates = 0,
  pongs = 0,
  logUpdates = 0;
try {
  for (let index = 0; index < 3; index++) {
    const ws = new WebSocket('ws://127.0.0.1/api/v1/ws');
    clients.push(ws);
    ws.on('error', (error) => wsErrors.push(error.message));
    ws.on('ping', () => pongs++);
    ws.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'update') {
        updates++;
        if (message.topic === 'logs') logUpdates++;
      }
      if (message.type === 'error') wsErrors.push(message.code);
    });
    await once(ws, 'open');
    for (const topic of [
      'system.cpu',
      'system.memory',
      'network.traffic',
      'metrics.current',
      'system.sessions',
      'logs',
    ])
      ws.send(
        JSON.stringify({
          type: 'subscribe',
          requestId: `${index}:${topic}`,
          topic,
          intervalSeconds: 2,
        }),
      );
  }
  // 35 seconds checks two heartbeat cycles through Nginx and three clients.
  await wait(35000);
  assert.ok(updates > 0);
  assert.ok(pongs >= 6, 'Expected two heartbeat cycles for three clients');
  assert.deepEqual(wsErrors, []);
  report.webSocket = {
    clients: clients.length,
    durationSeconds: 35,
    updates,
    heartbeatPings: pongs,
    logUpdates,
    errors: wsErrors,
  };
} finally {
  for (const ws of clients) ws.terminate();
}
const after = await get('metrics/current');
report.runtimeAfter = after.runtime;
report.diagnosticsAfter = after.diagnostics;
report.responseBytes = Buffer.byteLength(JSON.stringify(after));
report.developmentBudgets = {
  rssLimitBytes: 200 * 1024 * 1024,
  meanEventLoopLimitMs: 50,
  approvedByOwner: true,
  scenario: 'three clients, 35 seconds, local LAN development only',
};
assert.ok(after.runtime.rssBytes <= report.developmentBudgets.rssLimitBytes);
assert.ok(
  after.runtime.eventLoopDelayMeanMs !== null &&
    after.runtime.eventLoopDelayMeanMs <= report.developmentBudgets.meanEventLoopLimitMs,
);
console.log(JSON.stringify(report, null, 2));
