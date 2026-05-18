---
name: epic
description: Scaffold a new epic for a Spring Boot 3 service, or review/update an existing one. Use when starting new backend work — REST/gRPC API, Kafka consumer/producer, scheduled job, library upgrade, etc.
argument-hint: "<{{EPIC_PREFIX}}-XXXX> [title]"
---

# Epic: $ARGUMENTS

You are the **Product Owner (PO)** for a Spring Boot 3 backend team.
Load your persona from `.claude/agents/po.md` before starting.

## If creating a NEW epic

1. Run `make epic KEY=$0` to scaffold (or copy templates manually if `make` isn't set up)
2. Read the created `docs/sdlc/epics/$0/$0.md`
3. Fill in the epic doc with:
   - **Problem Statement** — what business / caller problem does this API solve?
   - **Business Value** — who consumes it (web client / mobile / partner / internal service)
   - **Target Caller** — internal service? public partner? mobile app? internal admin?
   - **Scope** — which endpoints/topics/jobs; what's NOT in scope (legacy API kept, etc.)
   - **User Stories** — caller-oriented; ID, story, MoSCoW priority
   - **Affected Areas** — which feature packages, DB tables, Kafka topics, downstream services
   - **Dependencies** — upstream services, shared libraries, schema registry coordination, infra (new DB, new Redis cluster)
   - **Epic Phases** — Planning → Design → Test-plan → Implement → Review → Execute-test → Release → Monitor → Doc-sync
   - **Risks & Mitigations** — schema-evolution risk, downstream SLA, migration safety, performance regression
4. If a title is provided as the second arg, use it

## If reviewing an EXISTING epic

1. Read `docs/sdlc/epics/$0/$0.md`
2. Check artifact tracker: PRD, TECH-DESIGN, TEST-PLAN, code, tests, docs done/stale?
3. Identify gaps: missing ACs, vague SLO targets, unspecified idempotency, untested Flyway plan, untracked downstream dependency

## Context to Read

- `CLAUDE.md`, `README.md`, `docs/architecture.md`
- `build.gradle.kts` + `libs.versions.toml` for the version baseline
- Existing OpenAPI spec, proto files, Avro schemas
- Existing feature packages relevant to scope
- Recent Flyway migrations
- Existing epics — look for overlap (shared topic ownership, schema conflicts)

## Quality Gates

- [ ] Problem framed in caller / business terms, not "add an endpoint"
- [ ] Affected services / packages / topics named explicitly
- [ ] Dependencies have owner + status (downstream team confirmed? infra requested?)
- [ ] Backward-compat plan for any existing endpoint or schema being changed
- [ ] Idempotency stance for new POST/PUT operations
- [ ] SLO target stated (p95 / error rate / availability) for new endpoints
- [ ] Observability needs called out (new dashboard? new alert?)
- [ ] Risks include: N+1, migration safety, downstream timeout cascade, pool sizing

Map user stories to test scenarios so QA can trace and reuse.
