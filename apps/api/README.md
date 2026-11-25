# NodeXora

Self-hosted Debian monitoring API, following [PROJECT_SPEC](../PROJECT_SPEC.md)
and its current owner decision to keep the API self-contained and publish OpenAPI.
The local API provides health, RAM and swap endpoints. Angular is outside the current scope.
Swap is a local addition; it has not been deployed or verified against Debian yet.
The earlier health/RAM runtime artifact has been deployed on Debian. The API is managed by
the enabled `nodexora-api.service` user unit for `dvor`; user lingering is enabled.
The service and Nginx responses were checked without rebooting the server.

## Structure

- `src`: Fastify transport, system service, Linux/mock providers.
- `src/modules/health`: public health route and its complete schema.
- `src/modules/system`: resource routes, HTTP controller, calculations and feature types.
- `src/modules/system/schemas`: complete RAM and swap endpoint schemas, including Swagger metadata.
- `src/hooks`: named HTTP hooks, including no-cache.
- `src/common`: shared HTTP envelopes, error schema and application errors.
- `src/plugins/swagger.plugin.ts`: generated OpenAPI and Swagger UI.
- `tests`: backend tests.
- `package.json`, `package-lock.json`, `node_modules`: this API's npm project and dependencies.

Request flow: Route → Controller → Service → Provider.
Only the Linux provider reads `/proc/meminfo` for RAM and swap; routes never execute commands.

There is no shared npm package or root npm workspace. Run npm commands from
`apps/api`; installed dependencies remain there. Fastify route schemas are the
source for the OpenAPI document consumed by Swagger and future API clients.
Plugin references: [Fastify Swagger](https://github.com/fastify/fastify-swagger),
[Fastify Swagger UI](https://github.com/fastify/fastify-swagger-ui).

## Read the RAM feature in this order

1. [system.routes.ts](src/modules/system/system.routes.ts) registers the endpoint and scoped hooks.
2. [memory.schema.ts](src/modules/system/schemas/memory.schema.ts) describes response fields, errors and Swagger security.
3. [system.controller.ts](src/modules/system/system.controller.ts) wraps the service result in `{ data: ... }`.
4. [system.service.ts](src/modules/system/system.service.ts) calculates used bytes and percent.
5. [system.provider.ts](src/infrastructure/linux/system.provider.ts) reads and parses Debian memory data.

The service calls the provider and uses its returned values; the list above is a
reading guide. `app.ts` wires these pieces together, while `server.ts` starts the process.

## Agent guidance and formatting

Durable API rules: [AGENTS.md](AGENTS.md). Repository skill:
[nodexora-api-feature](../../.agents/skills/nodexora-api-feature/SKILL.md).
Invoke it with `$nodexora-api-feature` for the next agreed API task. The skill is
stored with the repository, not installed as a server process.

TypeScript and JSON use the API-local Prettier configuration. From `apps/api`:

```bash
npm run format
npm run format:check
```

The first command applies the style; the second checks it without rewriting files.
Build, type-check and behavior tests remain separate commands.

## Swagger UI

Open `http://192.168.1.33/api/` through Nginx, or `http://127.0.0.1:3000/api/`
when running locally. The backend root `/` redirects to `/api/`; the Nginx server
root is still its existing static site. JSON: `/api/json`. YAML: `/api/yaml`.

Swagger lists implemented endpoints only. Open health or RAM, click **Try it out**,
then **Execute**. Current local monitoring endpoints require no login or additional
headers. Authentication is deferred to a separate future task.

## Local development (PowerShell)

Use Node.js 26.x; the currently installed server release is 26.13.1 LTS. Prefer an up-to-date patch within that major version.

```powershell
cd D:\code\node_xora\apps\api
npm ci
npm run build
npm run check
npm test
$env:SYSTEM_PROVIDER = 'mock'
npm run dev
```

In another terminal, health is available at `http://127.0.0.1:3000/api/v1/health`.
Memory is available through a plain GET request. Mock data is explicitly marked `source: mock`.

## Debian development deployment through Nginx

### Update from Windows with one Bash script

Open **Git Bash** (the Bash terminal installed with Git for Windows), then run:

```bash
cd /d/code/node_xora/apps/api
bash deployment/deploy.sh
```

The script performs four steps:

1. Installs local dependencies from the lockfile, type-checks and runs tests, then
   builds JavaScript into a fresh temporary directory.
2. Creates a staging directory under `~/nodexora` on Debian.
3. Copies only compiled `dist`, `package.json` and `package-lock.json` over SSH.
   README, plans, deployment scripts, source, tests, local `.env`, SSH keys and
   Windows `node_modules` are not included in the release archive.
4. Installs production dependencies on Debian, checks the shipped JavaScript with
   real Linux RAM data, gracefully stops the verified old API process and starts
   the new release. It checks health, Swagger and RAM through Nginx.

Target: `dvor@192.168.1.33`; key: `~/.ssh/id_ed25519_hermes_server`.
Optional overrides and help:

```bash
SSH_KEY="$HOME/.ssh/id_ed25519_hermes_server" DEPLOY_HOST=dvor@192.168.1.33 bash deployment/deploy.sh
bash deployment/deploy.sh --help
```

Run this script **locally**, not on Debian. It requires Git Bash, Node.js/npm,
SSH/SCP and tar locally; on Debian it needs Node.js/npm, curl, flock, ss, systemctl and loginctl.
Node.js major versions must match. Dependency lifecycle scripts are disabled;
if future dependencies require native build/install hooks, review and update
this policy before adopting them.

It updates the existing `~/nodexora/api` deployment; no runtime credentials file
is required. It is not a first-install or Nginx setup script.
No sudo is needed. The Nginx route `/api/` must already work, the NodeXora user
service must be installed and enabled, and `loginctl show-user dvor -p Linger`
must report `yes`. Routine deployment does not install or change the unit file.

Build/install/preflight failure leaves the running API untouched. After stopping
the old process, activation failures attempt to restore its files and restart it.
The release switch has a short interruption; it is not a zero-downtime deployment.
The API is stopped and started through its configured systemd user unit; no broad process-killing command or separate background process is used.
Concurrent activations are blocked by a deployment lock.

On success the previous release is removed. On failure a staging release may
remain at the path printed in the terminal for inspection. If restoration also
fails, the script reports it and preserves files; inspect `journalctl --user -u nodexora-api.service`.
The temporary local archive/build is cleaned up automatically.

The deployed directory contains only `dist`, `package.json`, `package-lock.json`
and the production `node_modules` installed on Debian. Build Node.js major is passed
as an activation argument; no `release.json` is installed. Activation instructions
are executed through SSH stdin and are not saved in the API directory. Documentation
and deployment scripts remain in the local repository. Future changes are deployed
by running the same command again. The script stops the user service before replacing
the runtime directory and starts it afterward; rollback uses that same service.
It does not install documentation or the service unit in the API runtime directory.

### Existing Nginx setup

The previously deployed API is at `/home/dvor/nodexora/api`. The previous
`/home/dvor/nodexora-dev` workspace is retired. No SSH port forwarding is used.

```text
LAN browser -> Nginx :80 /api/ -> Fastify 127.0.0.1:3000 -> Linux provider
```

The update script above deploys a compiled artifact, with no external shared package.
After a successful replacement, the previous API directory and its old project
documentation/scripts are removed; unrelated server directories are untouched.
Run build/type-check/tests in the local source directory. The `deployment` directory
also contains a Nginx snippet and its one-time setup script, separate from regular updates.

The route was already applied and verified during earlier work. For ordinary API
updates, use `deploy.sh`; do not rerun this one-time setup script. The command below
is only for a fresh server where that route has not yet been configured:

```bash
sudo bash /path/to/reviewed/apply-nginx.sh
```

For a fresh installation only, transfer the reviewed setup script and its adjacent
`nginx-api.conf` to a temporary setup directory first; they are not shipped by regular
API deployment. Replace the example path above with that setup script's actual path.
This requires the server user's sudo password entered in the terminal. The script
backs up the existing site, adds an include for `/api/`, runs `nginx -t`, and reloads
Nginx. On validation/reload failure it restores the old site. It preserves the
existing static site. Run it once; it refuses to overwrite a backup or snippet.
Until it succeeds, Nginx does not forward `/api/`.

Once applied, health is available at `http://192.168.1.33/api/v1/health`.
The snippet permits the verified LAN `192.168.1.0/24` and loopback only.
Fastify stays on loopback. No port 3000 firewall rule or router forwarding is needed.
If port 80 is blocked, inspect the firewall before changing its rules.

### Automatic startup and service commands

The unit source is [deployment/nodexora-api.service](deployment/nodexora-api.service).
Its installed location is `/home/dvor/.config/systemd/user/nodexora-api.service`,
outside the runtime directory. It runs `%h/.local/bin/node dist/server.js` with
working directory `%h/nodexora/api`, `SYSTEM_PROVIDER=linux` and `PORT=3000`.
It runs as the user manager's owner (`dvor`), not root.

`WantedBy=default.target` plus `systemctl --user enable nodexora-api.service`
registers it with the user manager. The existing `Linger=yes` makes that manager
start at boot and remain available after logout, without an SSH login.
`Restart=on-failure` restarts an abnormally terminated API; the operational defaults
are a 3-second restart delay and a 15-second graceful-stop timeout. These are service
settings, not measured performance guarantees.

For the current server this setup is already applied. Installing on another server
requires copying the reviewed unit to its user's systemd config directory, verifying
its paths, running `systemd-analyze --user verify`, `systemctl --user daemon-reload`
and enabling/starting the unit after stopping any previous manual API process.
Lingering must be enabled separately if it is absent. Do not run both startup methods.

After SSH login as `dvor`, useful commands are:

```bash
systemctl --user status nodexora-api.service --no-pager
systemctl --user restart nodexora-api.service
systemctl --user is-enabled nodexora-api.service
journalctl --user -u nodexora-api.service -n 50 --no-pager
```

To stop/start explicitly, use `systemctl --user stop nodexora-api.service` and
`systemctl --user start nodexora-api.service`. Stopping it does not remove its boot
registration. Do not start it with `nohup` or use the obsolete `api.pid` file.
Logs go to the user journal; the old `api.log`, if retained, is historical.

Startup configuration (`enabled`, `Linger=yes`) and real service stop/start through
deployment were verified. A physical reboot and a forced-crash test were not performed.

Read RAM directly from PowerShell:

```powershell
Invoke-RestMethod http://192.168.1.33/api/v1/system/memory
```

The current read-only monitoring API has no application login or route authorization.
The future Angular dev proxy will forward relative `/api/v1` requests to Nginx.
Rollback restores the previous runtime directory and starts the same systemd user service.

## API

`GET /api/v1/health` is public and returns `{"data":{"status":"ok"}}`.
It checks API liveness, not availability of Linux metrics.

`GET /api/v1/system/memory` is public in the current local project and returns:

- `totalBytes`: usable RAM reported by Linux as MemTotal, not the nominal installed hardware capacity.
- `availableBytes`: Linux `MemAvailable`, converted from KiB to bytes.
- `usedBytes`: `totalBytes - availableBytes` (reclaimable cache is not counted as used).
- `usedPercent`: `usedBytes / totalBytes * 100`.
- `collectedAt`: ISO 8601 UTC timestamp after collection.
- `source`: `linux` or `mock`.

Success envelope: `{ "data": ... }`. Error envelope: `{ "error": { "code": ..., "message": ... } }`.
Missing, unreadable or invalid Linux memory data: 503
`MEMORY_INFO_UNAVAILABLE`; unknown values are never replaced with zero.
RAM is read once per REST request. No background collector or history exists yet;
centralized collection and WebSocket belong to the real-time phase.

`GET /api/v1/system/swap` is public and returns `{ "data": ... }` with:

- `totalBytes`: Linux `SwapTotal`, converted from KiB to bytes.
- `freeBytes`: Linux `SwapFree`, converted from KiB to bytes.
- `usedBytes`: `totalBytes - freeBytes`.
- `usedPercent`: `usedBytes / totalBytes * 100`, or `null` when swap is disabled.
- `enabled`: `totalBytes > 0`. Disabled swap has zero byte counts.
- `collectedAt`: ISO 8601 UTC timestamp after collection.
- `source`: `linux` or `mock`; examples and Windows development use mock data.

The existing request flow also applies to swap: `system.routes.ts` references
`schemas/swap.schema.ts` and `controller.getSwap`; `SystemService.getSwapInfo`
calculates usage, while `LinuxSystemProvider.getSwapInfo` reads `/proc/meminfo`
once per request and `parseSwapMeminfo` validates `SwapTotal` and `SwapFree`.
Reading requires OS permission for that file, without sudo or shell commands.
Missing, unreadable, malformed or inconsistent data returns 503
`SWAP_INFO_UNAVAILABLE`; it is not treated as disabled swap. The response uses
`Cache-Control: no-store`. No new query parameters, collector or history are added.
The existing RAM response contract is unchanged.
