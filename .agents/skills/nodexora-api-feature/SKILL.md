---
name: nodexora-api-feature
description: Develop or refactor a NodeXora Fastify monitoring API feature with separate routes, schemas, hooks, services and Linux providers. Use for backend tasks in this repository, not Angular work or unrelated Node.js projects.
---

# NodeXora API feature workflow

Use this workflow for one requested backend change at a time. The owner is learning; make the request flow easy to follow and explain changes in Ukrainian.

## Read the relevant project rules

Paths below are relative to this skill directory:

- [API AGENTS.md](../../../apps/api/AGENTS.md): durable file responsibilities, commands and boundaries. Read it before editing API files.
- [PROJECT_SPEC.md](../../../apps/PROJECT_SPEC.md): current architecture and owner decisions.
- [MONITORING_PLAN.md](../../../apps/api/MONITORING_PLAN.md): read the section for the requested resource or stage; it does not authorize implementing the entire roadmap.
- [API README](../../../apps/api/README.md): reading guide and local runtime instructions.

Keep these documents as the source of detailed rules instead of duplicating them here. If the user changes an architectural decision, reconcile the affected specification section in the same task.

## Implement a small, understandable change

1. Inspect the current feature, its consumers and tests. State the intended scope and explain Route/Controller → Service → Provider using the actual files.
2. Identify whether the change preserves an existing contract or changes it. For new data, define its Linux source, units, missing-data behavior and permission requirements before implementation; mark unresolved choices explicitly.
3. Put the complete endpoint schema in the feature's schema file. Keep route registration short and use named hooks. Preserve Fastify encapsulation, public health/Swagger behavior and the current access policy: local monitoring has no application authentication unless the user explicitly requests a future access-control feature.
4. Implement only the necessary layers: HTTP handling in controllers, calculations in services, Linux reads in providers. Reuse an existing provider boundary rather than introducing new abstractions for a simple refactor.
5. Keep feature DTO and schema fields consistent. Verify generated OpenAPI documents the implemented responses and current access requirements; do not hand-maintain a second OpenAPI file or recreate a shared npm package.
6. Run the formatting, build, type and relevant behavior checks listed in AGENTS.md. For behavior changes, add focused tests for the changed calculation, access rule or failure case. A mock passing on Windows is not evidence of a Linux integration check.
7. Report the outcome, key files, actual checks and remaining limitations. Explain one important concept introduced by the change. Separate local verification from any authorized server deployment.

For a pure structural refactor, use existing endpoint tests to protect response shape, the current access policy and Swagger discovery. Avoid adding tests that merely assert file names or directory structure. Do not connect to or mutate the server just to complete a local coding task.
