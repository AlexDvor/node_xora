# NodeXora — Master Project Specification & Codex Instructions

**Project:** NodeXora  
**Type:** Self-hosted Linux Server Management & Interactive Network Learning Platform  
**Architecture:** Modular Monolith / Feature-Based Architecture  
**Frontend:** Angular + TypeScript  
**Backend:** Node.js + Fastify + TypeScript  
**Target OS:** Debian Linux  
**Status:** Planning / Initial Development

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

Use npm workspaces initially.

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
- Authentication.
- Authorization.
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

# 5. Monorepo Directory Structure

Use the following structure as the initial architectural target.

```text
nodexora/
│
├── apps/
│   │
│   ├── web/                      # Angular application
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── core/
│   │   │   │   ├── shared/
│   │   │   │   ├── layout/
│   │   │   │   ├── features/
│   │   │   │   ├── app.config.ts
│   │   │   │   ├── app.routes.ts
│   │   │   │   └── app.ts
│   │   │   ├── environments/
│   │   │   ├── styles/
│   │   │   └── main.ts
│   │   ├── public/
│   │   ├── proxy.conf.json
│   │   ├── angular.json
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── api/                      # Fastify backend
│       ├── src/
│       │   ├── app.ts
│       │   ├── server.ts
│       │   ├── config/
│       │   ├── plugins/
│       │   ├── hooks/
│       │   ├── modules/
│       │   ├── infrastructure/
│       │   ├── realtime/
│       │   ├── common/
│       │   └── types/
│       ├── tests/
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   └── shared/
│       └── src/
│           ├── contracts/
│           ├── schemas/
│           └── types/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── deployment/
│   └── decisions/
│
├── scripts/
├── AGENTS.md
├── PROJECT_SPEC.md
├── README.md
├── package.json
└── package-lock.json
```

This is a target structure, not a requirement to create every empty directory immediately.

Create folders and abstractions only when their responsibilities become necessary.

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

```text
apps/api/src/
│
├── app.ts
├── server.ts
│
├── config/
│   ├── env.ts
│   └── constants.ts
│
├── plugins/
│   ├── security.plugin.ts
│   ├── cors.plugin.ts
│   ├── websocket.plugin.ts
│   └── error-handler.plugin.ts
│
├── hooks/
│   ├── authenticate.hook.ts
│   ├── authorize.hook.ts
│   └── audit.hook.ts
│
├── modules/
│   │
│   ├── system/
│   │   ├── system.routes.ts
│   │   ├── system.controller.ts
│   │   ├── system.service.ts
│   │   └── system.schema.ts
│   │
│   ├── processes/
│   │   ├── processes.routes.ts
│   │   ├── processes.controller.ts
│   │   ├── processes.service.ts
│   │   └── processes.schema.ts
│   │
│   ├── network/
│   │   ├── network.routes.ts
│   │   ├── network.controller.ts
│   │   ├── network.service.ts
│   │   └── network.schema.ts
│   │
│   ├── routing/
│   │   ├── routing.routes.ts
│   │   ├── routing.controller.ts
│   │   ├── routing.service.ts
│   │   └── routing.schema.ts
│   │
│   ├── services/
│   │   ├── services.routes.ts
│   │   ├── services.controller.ts
│   │   ├── services.service.ts
│   │   └── services.schema.ts
│   │
│   ├── firewall/
│   │   ├── firewall.routes.ts
│   │   ├── firewall.controller.ts
│   │   ├── firewall.service.ts
│   │   └── firewall.schema.ts
│   │
│   ├── logs/
│   │   ├── logs.routes.ts
│   │   ├── logs.controller.ts
│   │   ├── logs.service.ts
│   │   └── logs.schema.ts
│   │
│   ├── metrics/
│   │   ├── metrics.routes.ts
│   │   ├── metrics.service.ts
│   │   └── metrics.collector.ts
│   │
│   ├── network-lab/
│   │   ├── network-lab.routes.ts
│   │   ├── network-lab.controller.ts
│   │   ├── network-lab.service.ts
│   │   ├── network-lab.schema.ts
│   │   └── simulation/
│   │
│   └── auth/
│       ├── auth.routes.ts
│       ├── auth.controller.ts
│       ├── auth.service.ts
│       └── auth.schema.ts
│
├── infrastructure/
│   ├── linux/
│   │   ├── system.provider.ts
│   │   ├── processes.provider.ts
│   │   ├── network.provider.ts
│   │   ├── routing.provider.ts
│   │   └── services.provider.ts
│   │
│   ├── persistence/
│   │   └── database.ts
│   │
│   └── privileged/
│       └── privileged-client.ts
│
├── realtime/
│   ├── websocket.gateway.ts
│   ├── subscription-manager.ts
│   └── message.types.ts
│
├── common/
│   ├── errors/
│   │   ├── app-error.ts
│   │   └── error-codes.ts
│   │
│   ├── utils/
│   └── validation/
│
└── types/
```

This structure must be implemented progressively.

Do not create placeholder files for features that do not exist yet.

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
Validation / Authentication / Authorization
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

Routes define HTTP methods, endpoint paths, request schemas, and handlers.

Example:

```typescript
// system.routes.ts

import type { FastifyPluginAsync } from 'fastify';
import { createSystemController } from './system.controller';

export const systemRoutes: FastifyPluginAsync =
  async (app) => {
    const controller = createSystemController(
      app.systemService
    );

    app.get('/info', {
      handler: controller.getInfo
    });
  };
```

The example assumes the system service has been registered and typed as a Fastify decoration.

A simpler explicit dependency factory is also acceptable.

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
- Authentication dependencies.
- Application service registration.
- Database integration.

Plugins must have clear ownership and avoid unnecessary global coupling.

Account for Fastify plugin encapsulation when registering shared services and hooks.

## 10.2 Hooks

Use hooks for cross-cutting request concerns.

Examples:

- Authentication.
- Authorization.
- Audit logging.
- Request lifecycle checks.
- Permission enforcement.

Avoid performing unrelated business logic in hooks.

## 10.3 Feature-Specific Hooks

Security requirements may differ by feature.

For example:

- Public health checks require no authentication.
- Monitoring endpoints require an authenticated session.
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

# 12. Frontend and Backend Shared Contracts

Use a shared workspace package for cross-application contracts.

```text
packages/shared/src/
├── contracts/
│   ├── system.contract.ts
│   ├── metrics.contract.ts
│   ├── network.contract.ts
│   └── routing.contract.ts
│
├── schemas/
└── types/
```

Both Angular and Fastify may import compatible framework-independent contracts.

Rules:

- Do not import backend implementation code into Angular.
- Do not introduce Node.js-only dependencies into the shared package.
- Keep shared contracts lightweight.
- Prefer clearly named types.
- Use runtime validation where data crosses trust boundaries.
- Avoid duplicating DTO definitions in frontend and backend.

Shared contracts must not expose privileged Linux implementation details unnecessarily.

---

# 13. Real-Time Architecture

Use WebSocket for real-time system metrics and events.

Use REST for standard queries and administrative operations.

## 13.1 WebSocket Responsibilities

The backend should:

- Maintain authenticated client connections.
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

# 15. Security Architecture

NodeXora must be secure by default.

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

- Initialize the npm workspace.
- Create the Angular application.
- Create the Fastify application.
- Configure TypeScript.
- Establish basic folder structure.
- Implement health-check API.
- Configure Angular-to-API communication.
- Add consistent error handling.
- Define shared contracts.

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

- Authentication.
- Authorization.
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
- Keep backward compatibility in mind when changing shared contracts.
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

# 24. Immediate Task for Codex

Begin with **Phase 1 — Project Foundation**.

Before implementing:

1. Inspect the repository.
2. Check whether Angular or Fastify already exists.
3. Check relevant Node.js and Angular toolchain versions.
4. Review this specification.
5. Propose the minimal folder structure necessary for Phase 1.
6. Explain how Angular and Fastify will communicate.
7. Propose the initial health-check endpoint.
8. Identify required dependencies.
9. Avoid creating empty future feature modules.
10. Do not modify the Debian server without authorization.

The initial goal is a working foundation where the Angular application successfully requests data from the Fastify backend.

**Build NodeXora incrementally, using clean modular architecture, practical engineering principles, and secure Linux integration.**