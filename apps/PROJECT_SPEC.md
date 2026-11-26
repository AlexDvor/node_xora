# NodeXora — Master Project Specification & Codex Instructions

**Project:** NodeXora  
**Type:** Self-hosted Linux Server Management & Interactive Network Learning Platform  
**Architecture:** Modular Monolith / Feature-Based Architecture  
**Frontend:** Angular + TypeScript  
**Backend:** Node.js + Fastify + TypeScript  
**Target OS:** Debian Linux  
**Status:** Backend foundation implemented; monitoring development in progress

**Current owner decision:** The backend remains a standalone npm project inside
`apps/api`, including its package manifest, lockfile, installed dependencies, tests,
and README. Feature response types live beside their module (`*.types.ts`);
general response envelopes live in `apps/api/src/common/types`.
There is no `packages/shared` package. API consumers use the OpenAPI document
generated from Fastify route schemas; Swagger UI is served at `/api/`.
`apps/web` remains separate and is not part of the current task. No root npm workspace
is used at this stage; this overrides section 3.4 and the root npm files in section 5.
The backend layer boundaries remain unchanged.

**Current readability convention:** Keep complete endpoint schemas outside route
files, use named Fastify hooks for cross-cutting HTTP behavior, and keep `app.ts`
focused on composition. Section 8 describes the implemented layout. Agent rules
are in [apps/api/AGENTS.md](api/AGENTS.md); the repository skill is
[nodexora-api-feature](../.agents/skills/nodexora-api-feature/SKILL.md).

**Current development access:** Use the existing Debian Nginx on port 80 to proxy
`/api/` to Fastify at `127.0.0.1:3000`, limited to the server's LAN and loopback.
The intended health URL is `http://192.168.1.33/api/v1/health`; SSH port forwarding
is no longer used. This is LAN development access, not a public production deployment.
**Current access decision:** All local monitoring API routes are public. No application
login, credentials or route guards are required. Access control and HTTPS are
deferred to a separately requested future stage; they do not block monitoring work.

---

# 1. Project Vision

NodeXora is a modern, self-hosted web application for monitoring, visualizing, understanding, and managing Linux servers.

The application combines three major directions:

1. **Linux Monitoring** — real-time dashboards for system resources, processes, network traffic, and service health.
2. **Linux Administration** — safe and controlled management of services, network configuration, routing, logs, and firewall rules.
3. **Interactive Learning** — visual infrastructure diagrams and networking simulations that help users learn Linux and DevOps concepts.

The long-term vision is to develop NodeXora into a modular infrastructure management platform capable of supporting multiple Linux servers.

The initial version targets a single home Debian server.

The software should remain lightweight, secure, maintainable, and understandable.

---

# 2. Core Engineering Principles

All development must follow these principles:

- Modular architecture.
- Separation of concerns.
- Feature-based organization.
- Strong TypeScript typing.
- Explicit API contracts.
- Low coupling between modules.
- High cohesion within individual modules.
- Dependency injection where beneficial.
- Reusable components and services.
- Security by design.
- Minimal unnecessary abstractions.
- Simple developer experience.
- Consistent error handling.
- Automated testing of important functionality.
- Efficient resource usage.
- Incremental development.

**Avoid overengineering.**

Do not introduce microservices, complex event buses, unnecessary repositories, large state management frameworks, or additional infrastructure without a demonstrated need.

Prefer clear and maintainable code over theoretical architectural purity.

---

# 3. Technology Stack

## 3.1 Frontend

- Angular (current stable compatible release)
- TypeScript
- Standalone Components
- Angular Router
- Angular Signals
- RxJS
- Angular HttpClient
- SCSS
- Angular CDK
- Apache ECharts
- Foblex Flow for interactive diagrams

Angular Material may be used selectively. Prefer a consistent custom design system for the main application.

Do not introduce NgRx initially.

## 3.2 Backend

- Node.js
- TypeScript
- Fastify
- Fastify plugins and hooks
- REST API
- WebSocket
- Runtime schema validation
- Linux system interfaces
- SQLite when persistent storage becomes necessary
- Pino logging through Fastify

Use Fastify's native plugin architecture rather than unnecessarily reproducing Express-specific middleware patterns.

## 3.3 Infrastructure

- Debian Linux
- Nginx
- systemd
- UFW
- Optional Tailscale or Cloudflare Zero Trust
- Git / GitHub

## 3.4 Monorepo

Keep the API as an independent npm project in `apps/api`; no root npm workspace.

Do not introduce Nx, Turborepo, or another monorepo orchestration framework unless the project complexity justifies it.

---

# 4. Overall System Architecture

NodeXora consists of four logical layers.

## 4.1 Presentation Layer

Angular handles:

- User interface.
- Routing and navigation.
- Reactive UI state.
- Dashboard visualizations.
- Interactive network diagrams.
- User interaction.
- Form validation.
- Communication with backend APIs.

## 4.2 Application API Layer

Fastify handles:

- HTTP requests.
- WebSocket connections.
- Request validation.
- Authentication/authorization only in a separately agreed future access-control stage.
- API routing.
- Response serialization.
- Error handling.
- Request logging.

## 4.3 Application Services Layer

Backend services implement application-specific logic.

Examples:

- Calculate resource utilization.
- Aggregate process information.
- Prepare network topology.
- Coordinate metrics collection.
- Manage subscriptions.
- Validate proposed system changes.
- Record administrative actions.

## 4.4 Linux Infrastructure Layer

System providers communicate with Linux.

Examples:

- `/proc`
- `/sys`
- Filesystem statistics.
- systemd D-Bus.
- Linux netlink.
- System journal.
- Restricted privileged operations.

Controllers and API routes must not directly execute Linux commands.

---

# 5. Repository Structure and Documentation Ownership

The current source repository is organized as follows (generated files omitted):

```text
node_xora/
├── .agents/
│   └── skills/nodexora-api-feature/
│       ├── SKILL.md
│       └── agents/openai.yaml
├── apps/
│   ├── PROJECT_SPEC.md
│   ├── README.md
│   ├── api/                      # Independent npm project; see section 8
│   │   ├── AGENTS.md
│   │   ├── README.md
│   │   ├── MONITORING_PLAN.md
│   │   ├── package.json
│   │   ├── package-lock.json
│   │   ├── src/
│   │   ├── tests/
│   │   └── deployment/
│   └── web/                      # Frontend; outside the current backend scope
└── .gitignore
```

There is no root npm project, shared npm package or requirement to create root
`docs`, `scripts`, `AGENTS.md` or `PROJECT_SPEC.md`. The source specification is
this file in `apps`, not a second root copy. Add directories only when needed.

Each document has a distinct purpose:

| Document | Owns |
|---|---|
| `apps/PROJECT_SPEC.md` | Current architecture, owner decisions and long-term product scope |
| `apps/api/MONITORING_PLAN.md` | Monitoring stages, proposed future contracts, acceptance criteria and remaining decisions |
| `apps/api/AGENTS.md` | Durable instructions for agents editing backend files |
| `.agents/skills/nodexora-api-feature/SKILL.md` | Reusable feature-development workflow; links to the project rules |
| `apps/README.md` | Ukrainian Windows/Git Bash deployment guide |
| `apps/api/README.md` | Backend reading guide, local commands, API and deployment details |

The owner's current instructions take precedence. Reconcile approved architectural
changes here and update affected operational instructions; a roadmap proposal does
not silently override an implemented contract. README and skill files should link
to detailed rules instead of creating competing architecture specifications.

## Current implementation and deployment status

The API implements health, host info, RAM/swap/load/uptime, delta CPU, root disk
capacity, hwmon temperature, network addresses/rates/connections, bounded process
pages, logind sessions, loaded service state, IPv4/IPv6 routes, the NodeXora user
journal, shared snapshots, 15-minute in-memory history and WebSocket subscriptions.
The runtime is deployed on Debian. Current contracts, source choices, limits and
Angular handoff are in [MONITORING_CONTRACTS.md](api/MONITORING_CONTRACTS.md).
Authentication, public IP lookup, persistent history, administration and Angular
implementation remain out of scope. `MONITORING_PLAN.md` records actual checks and
remaining verification/owner decisions; implemented is not a production guarantee.

The current runtime build, including the file-layout refactor and public monitoring
access, has been deployed and checked through Nginx. Runtime is now managed by the
`nodexora-api.service` user unit for `dvor`, installed outside the application at
`~/.config/systemd/user/nodexora-api.service`. It is enabled under the user
`default.target`. Existing `Linger=yes` starts the user manager at boot without
login. The unit uses Node.js from `%h/.local/bin/node`, working directory
`%h/nodexora/api`, Linux provider and port 3000, with `Restart=on-failure`.
Logs are in the user journal. Nginx is also enabled for boot.

The deployment script stops and starts this user service, including rollback;
it does not use nohup or a PID file. Routine deployment does not change the unit.
Unit validation, enabled/active state, lingering, real deployment stop/start and
HTTP checks were performed. An owner-initiated reboot on 2026-11-26 confirmed
automatic API/Nginx startup (changed boot identity); the final release was deployed
afterward. A forced-crash test was not performed.
Always distinguish these checks from evidence of a physical boot cycle.

The deployment archive must contain only compiled `dist`, `package.json` and
`package-lock.json`. Install production dependencies on Debian. Do not ship project
README files, plans, source, tests, agent instructions or deployment scripts into
the API runtime directory. Execute activation instructions through SSH stdin;
build Node.js major is a command argument, not an installed metadata file.

Sections 6–7 and 16 describe future frontend/Network Lab work. Sections 15 and the
administration roadmap describe deferred work. None authorizes implementing those
features during a backend monitoring task.

---

# 6. Angular Frontend Architecture

Use a feature-based Angular architecture.

## 6.1 Frontend Structure

```text
apps/web/src/app/
│
├── core/
│   ├── auth/
│   │   ├── auth.service.ts
│   │   └── auth.guard.ts
│   │
│   ├── api/
│   │   ├── api.config.ts
│   │   └── interceptors/
│   │       └── error.interceptor.ts
│   │
│   └── realtime/
│       └── websocket.service.ts
│
├── shared/
│   ├── ui/
│   │   ├── stat-card/
│   │   ├── status-badge/
│   │   ├── loading-state/
│   │   └── error-state/
│   │
│   ├── pipes/
│   └── directives/
│
├── layout/
│   ├── app-shell/
│   ├── sidebar/
│   └── header/
│
├── features/
│   ├── dashboard/
│   ├── processes/
│   ├── network/
│   ├── routing/
│   ├── services/
│   ├── firewall/
│   ├── logs/
│   ├── network-lab/
│   └── settings/
│
├── app.config.ts
├── app.routes.ts
└── app.ts
```

## 6.2 Angular Feature Module Convention

Organize each feature consistently.

Example:

```text
features/dashboard/
│
├── pages/
│   └── dashboard.page.ts
│
├── components/
│   ├── cpu-card/
│   ├── memory-card/
│   ├── disk-card/
│   └── network-chart/
│
├── services/
│   └── dashboard-api.service.ts
│
├── state/
│   └── dashboard.store.ts
│
└── dashboard.routes.ts
```

The term "feature module" refers to architectural organization, not a requirement to use Angular NgModules.

Prefer standalone components.

### Responsibilities

**Pages**

- Compose feature components.
- Coordinate page-level state.
- Handle navigation and user interaction.

**Components**

- Render UI.
- Receive typed inputs.
- Emit meaningful events.
- Avoid direct Linux-specific knowledge.

**Services**

- Communicate with backend endpoints.
- Encapsulate HTTP and WebSocket integration.
- Normalize API responses when necessary.

**State**

- Manage feature-level reactive state.
- Use Angular Signals where practical.
- Use computed signals for derived values.
- Integrate RxJS for asynchronous streams.

**Routes**

- Define feature navigation.
- Support lazy loading.
- Apply route guards where necessary.

Not every feature must have a dedicated store.

Avoid creating abstractions that merely forward one function call.

---

# 7. Angular Development Standards

Use modern Angular practices.

Requirements:

1. Standalone components by default.
2. Strict TypeScript configuration.
3. Typed inputs and outputs.
4. `inject()` where appropriate.
5. Signals for component and feature state.
6. RxJS for asynchronous event streams.
7. Modern template control flow (`@if`, `@for`).
8. Lazy-loaded feature routes.
9. Reusable UI components.
10. Clear loading, error, empty, and disconnected states.
11. Proper subscription cleanup.
12. No unnecessary global mutable state.

Keep components reasonably focused.

Business logic and HTTP orchestration should not accumulate inside component templates.

Use Angular's built-in mechanisms before introducing external state management libraries.

---

# 8. Backend Architecture — Fastify

The backend must use a modular, feature-based architecture with clear separation between API transport, application logic, and Linux integrations.

## 8.1 Backend Directory Structure

The foundation layout is shown below. Monitoring additionally implements
`modules/metrics`, `network`, `processes`, `services`, `routing`, `logs`,
`realtime`, and the corresponding Linux providers. This tree is a reading guide,
not an exhaustive inventory; see the API README and MONITORING_CONTRACTS.md for
the current resource contracts. Existing layer responsibilities still apply.

```text
apps/api/
├── AGENTS.md
├── .prettierrc.json
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   │   └── env.ts
│   ├── plugins/
│   │   ├── swagger.plugin.ts
│   │   └── error-handler.plugin.ts
│   ├── hooks/
│   │   └── no-cache.hook.ts
│   ├── common/
│   │   ├── errors/app-error.ts
│   │   ├── schemas/error.schema.ts
│   │   └── types/api-response.ts
│   ├── modules/
│   │   ├── health/
│   │   │   ├── health.routes.ts
│   │   │   └── health.schema.ts
│   │   └── system/
│   │       ├── system.routes.ts
│   │       ├── system.controller.ts
│   │       ├── system.service.ts
│   │       ├── system.types.ts
│   │       ├── schemas/memory.schema.ts
│   │       └── schemas/swap.schema.ts
│   └── infrastructure/
│       └── linux/
│           ├── system.provider.ts
│           └── mock-system.provider.ts
├── tests/
└── deployment/
```

Add processes, network, routing, services, logs, metrics, auth and realtime only
when the agreed monitoring stage requires them. Follow the same responsibility
boundaries; do not create empty future modules.

## 8.2 File Responsibilities and Request Flow

- `app.ts` creates Fastify, installs root configuration/error handling, registers
  Swagger and feature routes, and passes dependencies explicitly.
- `server.ts` reads runtime configuration, selects the Linux/mock provider, starts
  the listener and handles process shutdown.
- `*.routes.ts` registers method/path and references named hooks, complete schemas
  and handlers. Do not put full schema objects, Linux parsing or calculations there.
- `*.controller.ts` handles HTTP response composition. `*.service.ts` implements
  calculations and coordinates providers. Keep services independent of Fastify.
- Linux providers own OS I/O. They may expose pure parsing helpers for tests;
  a separate parser file is optional when it improves readability.
- A feature's DTOs live in `<feature>.types.ts`. General data/error response
  envelopes live in `common/types`; general error schema lives in `common/schemas`.
- Resource schemas live in `<feature>/schemas/<resource>.schema.ts`. A small,
  single-endpoint health feature may use `health.schema.ts` directly.
- Each route schema contains request validation, response schemas and OpenAPI
  metadata (summary, description, tags, security) together. It is the runtime and
  documentation contract; Swagger is registered before application routes.
- Shared HTTP behavior uses named Fastify hooks in `hooks`. The no-cache hook
  remains scoped to system routes. All current monitoring routes, health and
  Swagger are accessible without application credentials.
- Keep the application error handler installed in the root context. Moving it to
  a normal encapsulated plugin can change which routes inherit it.
- The tiny hidden `/` to `/api/` redirect belongs to Swagger setup. It is not a
  business endpoint and does not require a separate controller or schema module.
- A simple health response does not need artificial controller/service/provider
  layers. Add layers when they have an actual responsibility.

The RAM request passes through route, controller, service and Linux
provider; the provider returns raw values, the service calculates usage, and the
controller wraps the result in the documented HTTP response.

## 8.3 Readability and Framework Conventions

Use the API-local Prettier configuration: two spaces, single quotes and LF.
`npm run format` writes formatting; `npm run format:check` verifies it.
Run build, type-check and behavior tests for code changes. Formatting checks are
separate from TypeScript checks; no linting framework is required by this change.

Preserve endpoint URLs, response shapes, status codes, security, cache policy and
metric formulas during structural refactoring unless a contract change is explicit.
Do not convert every function into a class or add dependency-injection containers
for the current small API.

These folders are the project's convention, using the framework mechanisms described
in the official Fastify documentation: [Routes](https://fastify.dev/docs/latest/Reference/Routes/),
[Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/),
[Hooks](https://fastify.dev/docs/latest/Reference/Hooks/) and
[Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/).

---

# 9. Backend Module Responsibilities

Each backend feature must follow a predictable request flow.

```text
HTTP Request
    |
    v
Route
    |
    v
Validation
    |
    v
Controller
    |
    v
Service
    |
    v
System Provider / Repository
    |
    v
Linux / Database
```

## 9.1 Routes

Routes register HTTP methods, paths, complete imported schemas and handlers.
Services are initialized once and passed explicitly in Fastify plugin options;
controllers receive those services through their existing factory.

For example, after initializing the controller and scoped hooks:

```typescript
app.get('/memory', {
  schema: memoryRouteSchema,
  handler: controller.getMemory,
});
```

Cache behavior is a named hook. The route file attaches them
in the relevant scope, while schema files own validation and OpenAPI metadata.
Do not duplicate dependency initialization across routes.

## 9.2 Controllers

Controllers handle the HTTP transport layer.

Responsibilities:

- Receive validated requests.
- Call application services.
- Return standardized responses.
- Translate expected application errors into appropriate HTTP results.

Controllers must not contain Linux-specific parsing or privileged operations.

## 9.3 Services

Services contain application logic.

Responsibilities:

- Coordinate providers.
- Transform data.
- Calculate metrics.
- Enforce relevant business rules.
- Coordinate operations across dependencies.

Services must be testable independently of HTTP.

## 9.4 Schemas

Schemas define:

- Request parameters.
- Query parameters.
- Request bodies.
- Response structures.
- Validation constraints.

Use runtime validation and strongly typed contracts.

Do not trust frontend validation alone.

## 9.5 Providers

Providers encapsulate access to external systems, including Linux.

Examples:

```typescript
interface SystemProvider {
  getSystemInfo(): Promise<SystemInfo>;
  getMemoryInfo(): Promise<MemoryInfo>;
  getCpuInfo(): Promise<CpuInfo>;
}
```

The production implementation may read `/proc`, `/sys`, or other supported Linux interfaces.

Tests may use mocked providers.

This separation makes backend development possible on Windows while production data comes from Debian.

---

# 10. Fastify Plugins, Hooks and Middleware

Use Fastify-native abstractions.

Do not mechanically copy Express middleware architecture.

## 10.1 Plugins

Global or shared application functionality may be registered through Fastify plugins.

Examples:

- Security headers.
- CORS configuration.
- WebSocket support.
- Error handling.
- Optional future authentication dependencies (not used by current monitoring).
- Application service registration.
- Database integration.

Plugins must have clear ownership and avoid unnecessary global coupling.

Account for Fastify plugin encapsulation when registering shared services and hooks.

## 10.2 Hooks

Use hooks for cross-cutting request concerns.

Examples:

- Authentication/authorization only in a separately agreed future access-control stage.
- Audit logging.
- Request lifecycle checks.
- Permission enforcement.

Avoid performing unrelated business logic in hooks.

## 10.3 Feature-Specific Hooks

Security requirements may differ by feature.

For example:

- Public health checks require no authentication.
- Current local monitoring endpoints require no application authentication.
- Administrative operations require additional permissions.
- Privileged actions require explicit authorization and audit logging.

Prefer route-level or scoped hooks when a requirement applies only to a specific module.

## 10.4 Middleware

If traditional middleware is genuinely required, use a supported Fastify middleware integration.

Do not introduce middleware plugins unnecessarily when Fastify hooks or plugins can solve the problem more clearly.

---

# 11. API Design

Use versioned REST endpoints.

Initial prefix:

```text
/api/v1
```

Example endpoints:

```text
GET    /api/v1/health

GET    /api/v1/system/info
GET    /api/v1/system/cpu
GET    /api/v1/system/memory
GET    /api/v1/system/disks

GET    /api/v1/processes

GET    /api/v1/network/interfaces
GET    /api/v1/network/connections

GET    /api/v1/routing/routes

GET    /api/v1/services
GET    /api/v1/services/:name

GET    /api/v1/firewall/status
GET    /api/v1/firewall/rules

GET    /api/v1/logs

GET    /api/v1/network-lab/topologies
POST   /api/v1/network-lab/topologies
```

Administrative mutation endpoints belong to later development phases.

Avoid exposing them before authentication, authorization, and the privileged execution layer are ready.

## API Response Conventions

Use consistent response contracts.

Example successful response:

```json
{
  "data": {
    "hostname": "hermes-server",
    "platform": "linux",
    "architecture": "x64"
  }
}
```

Example error response:

```json
{
  "error": {
    "code": "SYSTEM_INFO_UNAVAILABLE",
    "message": "Unable to retrieve system information"
  }
}
```

Use appropriate HTTP status codes.

Avoid unnecessary response wrappers for protocols that require a different format, such as WebSocket events.

---

# 12. API Contracts and Swagger

Define runtime request/response schemas in the backend and generate OpenAPI with
`@fastify/swagger`. Serve Swagger UI with `@fastify/swagger-ui` at `/api/` and the
machine-readable OpenAPI document at `/api/json`.

```text
apps/api/src/
├── common/types/              # General response envelopes
├── common/schemas/            # Shared error response schema
├── modules/                   # Feature DTOs and complete endpoint schemas
└── plugins/swagger.plugin.ts  # OpenAPI generation and Swagger UI
```

Angular consumes the HTTP API using its published OpenAPI contract. It does not
import backend source. Client type generation may be considered separately when
Angular integration starts; no generator is required for the current backend task.

Rules:

- Do not import backend implementation code into Angular.
- Do not create a separate shared npm package.
- Keep backend types and route schemas consistent with the generated OpenAPI.
- Prefer clearly named types.
- Use runtime validation where data crosses trust boundaries.
- Use OpenAPI to check frontend DTO compatibility; do not maintain a second handwritten API specification.

Published schemas must not expose secrets or unnecessary privileged Linux implementation details.
Current Swagger UI has no authentication scheme or login step. Its monitoring
requests execute directly; access control can be designed in a future task.

---

# 13. Real-Time Architecture

Use WebSocket for real-time system metrics and events.

Use REST for standard queries and administrative operations.

## 13.1 WebSocket Responsibilities

The backend should:

- Maintain client connections; application authentication is deferred for the local project.
- Validate message structure.
- Manage subscriptions.
- Broadcast metrics.
- Handle disconnects.
- Limit payload sizes.
- Prevent slow clients from exhausting memory.
- Implement heartbeat and cleanup mechanisms.

## 13.2 Central Metrics Collector

A single metrics collector should periodically collect system information.

Example:

```text
Linux
  |
  v
Metrics Collector
  |
  v
Subscription Manager
  |
  v
WebSocket Gateway
  |
  +--> Angular Client A
  |
  +--> Angular Client B
```

Do not launch a new Linux metrics collection process for every connected client.

## 13.3 Suggested Intervals

- CPU / RAM: 2 seconds.
- Network traffic: 2 seconds.
- Process list: 3 seconds.
- Disk usage: 10 seconds.
- Service status: 10 seconds.
- Routes: on change or periodic refresh.
- Logs: bounded event-driven stream.

These are starting values.

Actual performance must be measured.

## 13.4 Frontend WebSocket Integration

Centralize WebSocket connection management in the Angular core realtime layer.

Feature services should consume typed streams or signals without managing duplicate low-level socket connections.

Use explicit subscriptions by topic where practical.

Reconnect safely and prevent duplicate event handlers.

---

# 14. Linux System Integration

Keep Linux implementation details inside infrastructure providers.

Potential integrations:

| Feature | Linux Interface |
|---|---|
| CPU | `/proc/stat` |
| Memory | `/proc/meminfo` |
| Processes | `/proc/[pid]` |
| Disks | Filesystem statistics |
| Network | Netlink and system interfaces |
| Routing | Netlink |
| Services | systemd D-Bus |
| Logs | systemd journal |
| Firewall | UFW through restricted integration |

Do not assume every environment supports the same sensors or system configuration.

Handle unavailable metrics gracefully.

Linux permissions must be respected.

---

# 15. Future Administration Security — Deferred

This section describes future requirements for administration or wider access.
It does not introduce authentication, credentials or guards into the current
local read-only monitoring API. API input validation and OS permission boundaries
remain part of data correctness.

## Mandatory Rules

1. The main Fastify application must not run as root.
2. No arbitrary command execution endpoints.
3. No unsafe shell command construction from request parameters.
4. Authenticate administrative users.
5. Authorize every privileged operation.
6. Validate all external input.
7. Restrict access to sensitive endpoints.
8. Protect session-based mutations against CSRF.
9. Apply appropriate WebSocket origin and session checks.
10. Restrict CORS to explicitly trusted origins.
11. Log privileged operations.
12. Avoid storing credentials in frontend source code.
13. Do not expose the administrative interface publicly by default.
14. Keep system modifications out of the initial MVP.
15. Provide safe recovery for network configuration changes.

## Privileged Operations

Introduce a dedicated privileged helper only when administrative features are implemented.

The helper must accept a narrow set of validated, explicit operations.

Do not use unrestricted sudo access for the API process.

Avoid giving the Node.js backend broad permission to manipulate the entire operating system.

---

# 16. Interactive Network Lab

The Network Lab is a major product feature.

It must be architecturally separated from live Linux administration.

## 16.1 Angular Editor

Use an Angular-compatible node graph library.

Support:

- Custom nodes.
- Drag and drop.
- Connections.
- Zoom and pan.
- Selection.
- Node configuration panels.
- Topology editing.
- Undo and redo.
- Save and load.

## 16.2 Simulation Engine

The simulation engine must use its own domain model.

Potential entities:

- NetworkDevice
- Interface
- Subnet
- Route
- Gateway
- Connection
- Packet
- FirewallRule

The simulator should evaluate packet forwarding using networking rules rather than arbitrary visual node position.

The initial simulator is not expected to reproduce the complete Linux networking stack.

Clearly document supported and unsupported behavior.

## 16.3 Learning Mode

Include guided exercises covering:

- IPv4 addressing.
- CIDR and subnetting.
- Gateways.
- Static routing.
- Packet forwarding.
- NAT.
- Firewall behavior.
- Reverse proxies.
- API routing.
- Load balancing.

## 16.4 Live Mode

Live Mode may visualize actual Linux interfaces and routes.

A visual diagram must not directly mutate the real system.

Any proposed change must pass through backend validation, authorization, explicit confirmation, and a recovery mechanism.

---

# 17. Database Strategy

Do not introduce a database before it is needed.

The monitoring MVP can operate without persistent storage.

When persistence becomes necessary, use SQLite initially.

Potential stored data:

- Application settings.
- User preferences.
- Saved topologies.
- Network Lab exercises.
- Administrative audit records.
- Limited metrics history.

Avoid unnecessarily retaining high-frequency metrics forever.

Use bounded retention policies and efficient queries.

A repository/data-access abstraction may be introduced when persistence logic becomes substantial.

---

# 18. Development Environment

Frontend development runs on Windows.

Backend development may use mocks locally and real Linux providers on Debian.

Use a configurable provider selection for development and production.

Example:

```text
Development on Windows:
Angular → Fastify → MockLinuxProvider

Testing against Debian:
Angular → Fastify on Debian → LinuxProvider

Production:
Nginx → Angular + Fastify → LinuxProvider
```

The frontend should call relative API paths such as:

```text
/api/v1/system/info
```

Configure Angular development proxying as needed.

Do not hardcode the Debian LAN IP throughout frontend services.

---

# 19. Testing Strategy

Introduce testing progressively.

## Frontend

- Component tests.
- Service tests.
- API integration tests using mock responses.
- Tests for Signals and derived state.
- Interactive editor behavior tests.

## Backend

- Unit tests for services.
- Route tests using Fastify injection.
- Schema validation tests.
- Provider tests.
- Permission and authorization tests.
- WebSocket lifecycle tests.

## Integration

Test real Linux providers in a controlled environment.

Do not use destructive system operations in automated tests.

Test simulation behavior separately from live infrastructure operations.

---

# 20. Performance Requirements

The application must work on a low-resource home Linux server.

Initial target:

- Debian 13.
- Intel Core 2 Duo T9300.
- Approximately 3 GB RAM.
- Single Node.js API process.
- Nginx serving the Angular production build.

Performance principles:

- Avoid unnecessary background services.
- Use a centralized metrics collector.
- Limit process scanning frequency.
- Avoid large in-memory histories.
- Bound log streams.
- Do not create duplicate WebSocket connections.
- Use lazy-loaded Angular features.
- Avoid excessive rendering.
- Measure resource usage before optimizing.

Do not introduce Docker or orchestration tools as mandatory production dependencies.

---

# 21. Development Roadmap

## Phase 1 — Project Foundation

This is the overall product roadmap, not a command to recreate existing code.
The standalone backend project, health/RAM API, Swagger, tests and dev-deployment script
already exist. Angular integration and the remaining foundation tasks are separate
work when explicitly requested. For the active backend sequence use
[MONITORING_PLAN.md](api/MONITORING_PLAN.md).

- Initialize the standalone API npm project.
- Create the Angular application.
- Create the Fastify application.
- Configure TypeScript.
- Establish basic folder structure.
- Implement health-check API.
- Configure Angular-to-API communication.
- Add consistent error handling.
- Define backend contracts and publish OpenAPI with Swagger UI.

## Phase 2 — Monitoring MVP

- System information API.
- CPU and RAM providers.
- Disk statistics.
- Dashboard.
- Angular Services.
- Angular Signals.
- Initial charts.
- Loading and error handling.

## Phase 3 — Real-Time Monitoring

- Metrics collector.
- WebSocket gateway.
- Subscription manager.
- Angular realtime integration.
- Live dashboard.
- Resource usage testing.

## Phase 4 — System Explorer

- Processes.
- Network interfaces.
- Routing information.
- Active connections.
- systemd service status.
- Logs.

## Phase 5 — Interactive Network Lab

- Visual topology editor.
- Domain model.
- Simulation engine.
- Packet-flow visualization.
- Guided exercises.
- Saved configurations.

## Phase 6 — Secure Administration

- Authentication and authorization (future administration stage only).
- Audit logs.
- Privileged helper.
- Limited service operations.
- Firewall management.
- Network change safeguards.

## Phase 7 — Production Deployment

- Angular production build.
- Nginx configuration.
- Fastify systemd service.
- Deployment scripts.
- Private remote access.
- Performance optimization.
- Documentation.

---

# 22. Codex Development Instructions

Codex acts as:

1. Senior Angular Engineer.
2. Senior Node.js / Fastify Engineer.
3. Software Architect.
4. Linux Integration Engineer.
5. Technical Mentor.

The project owner is learning Angular and already understands React, TypeScript, Node.js, and basic Linux concepts.

## Working Rules

Backend-specific instructions are maintained in [api/AGENTS.md](api/AGENTS.md).
Use the repository skill [nodexora-api-feature](../.agents/skills/nodexora-api-feature/SKILL.md)
when implementing or refactoring API features. It provides a focused workflow;
AGENTS.md and this specification remain the source of durable project conventions.
The skill is instruction-only and is not a process installed on Debian.

- Communicate with the project owner in Ukrainian.
- Use English for source code and identifiers.
- Explain important architectural choices.
- Compare Angular concepts with React when educationally useful.
- Keep implementations small and focused.
- Follow the agreed module structure.
- Do not mix controllers, routes, services, and infrastructure logic.
- Do not overengineer simple features.
- Prefer framework-native solutions.
- Avoid unnecessary dependencies.
- Keep backward compatibility in mind when changing published API contracts.
- Write tests for meaningful logic.
- Do not silently modify Linux configuration.
- Do not execute destructive operations without explicit approval.
- Do not implement unrelated future features.

## Development Workflow

For each task:

1. Inspect the relevant existing code.
2. Identify the responsible feature module.
3. Explain the intended change.
4. Implement only the required scope.
5. Update types and schemas.
6. Run relevant checks.
7. Report results and limitations.
8. Explain important concepts learned.

Do not create a large amount of documentation or architectural boilerplate unrelated to the current task.

Do not add files merely to satisfy a theoretical architecture diagram.

---

# 23. Initial MVP Scope

The first MVP must include:

**Frontend**
- Angular application layout.
- Sidebar and navigation.
- Dashboard page.
- Reusable metric cards.
- Loading/error states.
- HTTP integration.

**Backend**
- Fastify application.
- Modular system feature.
- Health-check endpoint.
- System information endpoint.
- CPU provider.
- Memory provider.
- Disk provider.
- Central error handler.
- Typed API responses.

**Infrastructure**
- Debian integration.
- Nginx deployment path.
- systemd startup configuration.
- Safe read-only access to system information.

Exclude privileged system management, arbitrary command execution, and real network configuration changes.

---

# 24. Next Backend Work

Continue the existing implementation; do not initialize a second Fastify app or
recreate health/RAM endpoints. The current task scope is backend monitoring.

Before the next implementation step:

1. Read the current owner decisions, API AGENTS.md and relevant monitoring stage.
2. Inspect the existing route, schema, controller, service, provider and tests.
3. Select one small requested change from the monitoring plan; explicitly resolve
   any field semantics or Linux-source decisions needed for that change.
4. Explain the request/data flow and implement only that agreed scope.
5. Verify formatting, build, types, behavior and the generated Swagger description.
6. Report local results separately from deployment and Debian integration checks.

Do not start Angular or later product features unless the owner includes them in
the task. Do not connect to or modify Debian solely to complete local coding work.
If deployment is requested, use the documented script and report the actual outcome.

**Build NodeXora incrementally with readable modules and verifiable Linux data.**
