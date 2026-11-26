# Monitoring contracts and Angular handoff

Updated: 2026-11-26. Scope: single Debian LAN server, read-only API. This is a
development contract, not a claim of production readiness. Architecture remains
Route → Controller → Service → Linux Provider. No application login, credentials,
roles or administration endpoints. Angular implementation is outside this task.

## Sources and shared collection

One `MetricsCollector` per API process starts in Fastify `onReady` and stops in
`onClose`. All frequent REST and WebSocket metrics use this cache; clients never
create their own Linux collectors. Independent jobs do not overlap themselves.
An overdue job is aborted at 5 seconds; a late result is discarded. A job which
ignores abort cannot be retried until it settles. Other jobs continue.

| Resource | Source | Default interval | Units/semantics |
|---|---|---|---|
| RAM | `/proc/meminfo` | 2 s | `MemTotal`, `MemAvailable` × 1024; used=total-available |
| Swap | `/proc/meminfo` | 2 s | `SwapTotal`, `SwapFree` × 1024; disabled ⇒ false/0/null |
| CPU | `/proc/stat`, boot ID | 2 s | Delta of first eight CPU fields; idle+iowait are idle; guest not added twice |
| Load | Linux `os.loadavg()` | 2 s | Task averages over 1/5/15 minutes, not percentages |
| Uptime | `/proc/uptime`, `/proc/stat` btime, kernel boot ID | 2 s | Seconds; boot wall-clock time and identity |
| Host identity | `os`, `/etc/os-release`, `/proc/cpuinfo` | 10 s | Physical topology may be null; logical CPUs are separate |
| Disk | `statfs('/')`, `/proc/self/mountinfo` | 10 s | Bytes; used=total-free; percent=used/total; available excludes reserved blocks |
| Temperature | read-only hwmon | 10 s | Celsius; stable device path+sensor ID; labels from driver, faults=null |
| Network | `ip -j -d address`, `/proc/net/dev` | 2 s | Counter strings; delta bytes / actual monotonic elapsed seconds |
| Connections | `/proc/net/{tcp,tcp6,udp,udp6}` | 10 s | Current namespace, at most 2048 sockets, no PID mapping |
| Processes | bounded `/proc` scan | 3 s | RSS bytes; CPU 100%=one logical CPU; safe comm only |
| Sessions | logind D-Bus via busctl/loginctl | 3 s | Online/active interactive user sessions; idle is still connected |
| Services | D-Bus via `systemctl` JSON | 10 s | Loaded system and current-user services, not all installed unit files |
| Routes | rtnetlink via `ip -j` IPv4/IPv6 | 10 s | All visible tables, next hops preserved |
| Journal | own user journal, NodeXora unit | On request/follow | Bounded JSON pages; one shared follow process for live subscribers |

Engineering choices are recorded explicitly: installed `iproute2` provides rtnetlink
access instead of adding a native netlink library; `systemctl`, `busctl` and
`loginctl` are fixed D-Bus clients. Providers use `execFile`/`spawn` with validated
argv, never shell interpolation. Ordinary commands have a 3 s timeout and 2 MiB
output bound. A missing tool or denied read is reported, not replaced with zero.
No tools, drivers, permissions or OS packages are installed automatically.

The selected network total is only the observed physical LAN interface `enp5s0`
while UP. Loopback, Wi-Fi when down and virtual links are not added to that total.
Per-interface counters remain visible. Current address means the global IPv4
address on that interface; if it disappears, currentAddress=null with a reason.
No external public-IP service is enabled. These choices live in
`src/config/monitoring.ts`; a server with another interface needs explicit config
adjustment and deployment. Preferred-interface configuration is not a claim that
the IP address is permanently fixed.

## REST and sample contract

Generated OpenAPI at `/api/json` and Swagger at `/api/` describe implemented HTTP
schemas. They are generated from code, never maintained as a second manual file.
Existing RAM/swap `{ data: DTO }`, URLs, formulas, error codes and no-store policy
are preserved. Their collectedAt now identifies the cached collection, not each
HTTP request. Their collector failure/stale state returns the existing 503 error.
Health remains liveness only. Host info/load/uptime also return `{ data: DTO }`.

New sampled resource endpoints return `{ data: Sample }`:

```json
{
  "data": {
    "streamId": "example-api-stream",
    "sequence": 1,
    "collectedAt": "2026-11-26T00:00:00.000Z",
    "lastSuccessAt": null,
    "source": "mock",
    "quality": "warming_up",
    "reason": "COLLECTOR_STARTING",
    "data": null
  }
}
```

This is an illustrative mock example, not server evidence. States:

- `ok`: measurement available.
- `warming_up`: no baseline or collection not yet available; rates are null.
- `partial`: some readings or rows are unavailable; use per-field reasons.
- `unavailable` / `permission_denied`: failed attempt, data=null; lastSuccessAt
  preserves the previous success time. Do not display unknown values as zero.
- `stale`: cached data is older than three normal intervals, measured with the
  monotonic clock. Retained values are visibly old, never relabelled as fresh.

No resource sources are read atomically with each other. `metrics/current`
returns schemaVersion=1, streamId, global sequence, sections with their own
sequences/timestamps/quality, capabilities and API runtime diagnostics. A global
sequence is a cache revision, not a timestamp or durable counter. Counters reset
after API restart; bootId separately identifies an OS restart. Optional absent
metadata is null with a documented field/resource reason.

Versioning: preserve existing `/api/v1` RAM/swap contracts; new resources are
additive. Future incompatible response changes require an explicit contract
decision and corresponding schemas/tests; this implementation does not promise
compatibility for undocumented fields. REST errors keep `{error:{code,message}}`.
Invalid queries=400, unknown resources=404, stale process cursors=409,
unavailable direct providers=503. Sampled endpoints may return HTTP 200 with an
explicit unavailable resource state; clients must inspect quality.

## Bounded queries

- Processes: sort cpuPercent/rssBytes/pid/name, asc/desc, UID and name search
  (128 characters), limit default 100/max 200. Scan max 4096 PIDs in batches of
  eight. UID names come from `/etc/passwd`, cached 60 s; unresolved UID name=null.
  No command line, environment, terminal contents or secrets are read.
  PID identity=bootId+PID+startTicks. First process CPU sample=null, not zero.
  RSS/MemTotal uses the shared RAM denominator; missing denominator=null/reason.
- Process cursors bind stream, snapshot sequence, sort, filters, page size and
  offset. Changed snapshot=409 RESYNC_REQUIRED; restart at first page. Ties use PID.
- Services: detail only for a unit present in the shared snapshot, validated
  `.service` name and scope system/user. runningCount counts active+running in the
  reported scope. Active does not establish health or listening ports. No ports
  are guessed from unit names. Main PID is read on detail, otherwise null.
- Journal: only `nodexora-api.service` in current user's journal. Limit 100/max
  200, priority 0–7, ISO since/until, opaque cursor max 2048 characters. Structured
  output is bounded at 2 MiB; extremely large pages fail rather than exhaust RAM.
  Initial page is recent, ordered oldest→newest. Cursor reads forward after the
  previous entry. Rotation/failed cursor=409; query afresh and show a gap. Empty
  successful journal is distinct from denied/unavailable source. Best-effort
  redaction strips common credential patterns/control characters and truncates
  each message to 16384 characters; it is not a guarantee that arbitrary secrets
  can be detected. Application code must never log credentials.
- History: 15 minutes in memory, reset after API restart. Fixed series cpu,
  memory, swap, rx, tx; temperature:<sensorId> discovered from current snapshot.
  At most 64 temperature series and 451 raw points per series (at most 31119
  points across all 69 series); memory depends on actual string/object sizes.
  Query at most eight unique series, 15-minute range and 1000 bucket points total.
  Resolution is 2–900 s; mean/min/max over actual samples, never sums of rates.
  windowStart denotes bucket, collectedAt the last real observation. A missing
  value keeps aggregates null. Empty intervals have no invented points; clients
  show gaps. availableFrom/To and insufficientHistory describe startup coverage.

These bounds are selected development settings authorized by the owner. They are
not measured production capacities, SLOs or guarantees. Actual observations belong
in the plan. After the three-client measurements the owner
approved initial development comparison budgets: RSS ≤ 200 MiB and mean Event Loop
delay ≤ 50 ms for that scenario. These are not production SLOs or guarantees for
other loads; future production budgets require a separate decision.

## WebSocket protocol v1

One connection per browser: `/api/v1/ws` through the existing Nginx, port 80.
No application credentials. Nginx repeats LAN allow/deny for exact WS location,
uses upstream HTTP/1.1, Upgrade/Connection headers and a 60 s read timeout.
`@fastify/websocket` 11.x targets Fastify 5; schemas are shared with REST using
Ajv validation and fast-json-stringify serialization.

Client messages:

```json
{"type":"subscribe","requestId":"cpu-1","topic":"system.cpu","intervalSeconds":5}
{"type":"unsubscribe","requestId":"pause-1","topic":"system.cpu"}
```

Allowed intervals=2/5/10/30 s, default 5. Re-subscribing updates delivery interval
and returns an immediate snapshot; it does not start another collector.
Supported topics: system.cpu/memory/swap/load/uptime/disks/temperature/sessions,
network.interfaces/traffic/connections, processes, services, routing.routes,
metrics.current and logs. Filters are not accepted in this version.

`subscribed` acknowledges requestId, subscriptionId, topic, interval and streamId.
`snapshot`/`update` include protocolVersion=1, type, topic, subscriptionId,
requestId (null for unsolicited updates), streamId, sequence, collectedAt and data.
For resource topics data is the same Sample as REST. metrics.current contains
the composed snapshot; its envelope collectedAt=null, since sections own times.
Sequences are per resource/topic (metrics.current uses the global cache revision),
never comparable across unrelated streams. `error` reports invalid messages;
`resync_required` explicitly reports slow clients or log gaps. Invalid messages
do not become HTTP errors after upgrade. `unsubscribed` acknowledges pause.

Limits: 16 sockets, 16 subscriptions/socket, incoming payload 4096 bytes,
outgoing queued+current message at most 1 MiB. Gauges deliver the newest shared
sample at client interval; intermediate measurements may be skipped deliberately.
Logs use one shared event-driven `journalctl --follow` process, only while there
are subscribers. Each raw line is bounded at 64 KiB. Reader errors, oversized
lines and reconnect report resync_required; no claim of lossless delivery is made.
Slow clients receive resync_required then close 1013. Dead clients without pong
are terminated on the next 15 s heartbeat cycle. Subscriptions, timers, reader
and handlers are removed on disconnect/shutdown.

Angular handoff (contract only; `apps/web` remains untouched):

1. GET initial data/history, then open one WS and subscribe to visible resources.
2. Apply acknowledged WS snapshot as baseline; an older REST response must not
   overwrite newer samples. Deduplicate using streamId+topic+sequence; for logs
   deduplicate entry cursors. Quality may change even without a new measurement.
3. For live logs subscribe first, buffer updates, GET recent entries after the
   resync notice, then merge by cursor. Reconnect has an explicit gap/resync path.
4. Pause unsubscribes metrics but keeps heartbeat; resume resubscribes and applies
   immediate snapshots. Do not run REST polling and WS updates for the same data.
5. Reconnect with exponential backoff plus jitter; allow only one pending socket
   and one reconnect timer. Subscribe again after reconnect; streamId change
   invalidates previous cache/history assumptions. No missed-message replay promise.
6. Disconnect/error/heartbeat failure removes green connection status. Preserve
   old values with stale/lost-connection labels. A failed sensor is not a dead API.
7. History selection affects graphs only, not current cards. RAM/uptime displayed
   twice use the same shared sample; Users means Debian login sessions, not PIDs
   or browser connections. Frontend formats bytes and rounding consistently.

## Verification and operations

Run local format/check/build/tests from `apps/api`. Real WS tests need permission
for loopback sockets. `deployment/update/deploy.sh` builds a fresh artifact, ships only
dist/package manifests, performs Linux preflight and systemd activation with
rollback. Nginx updates are separate reviewed owner-run sudo operations with backup/validation;
the completed one-time WebSocket migration script has been removed.
Do not rerun first-install setup over an existing snippet.

`deployment/checks/verify-server.mjs` runs via SSH stdin from the runtime directory. It
compares raw `/proc`/statfs/ip data, checks endpoints and three WS clients through
Nginx for 35 s/two heartbeat cycles. Comparison bounds are defined in that script
before execution; they are verification tolerances, not production targets.
The temporary server JSON report was removed at the owner's request;
the plan retains the measurement summary and LAN/startup/fingerprint results.
`deployment/checks/verify-lan.mjs` repeats the LAN REST/WS check from Windows.
A reboot test must compare bootId and
check service/Nginx availability after return; enabled+linger alone is not proof.
No persistent history or custom system-journal retention is configured.
