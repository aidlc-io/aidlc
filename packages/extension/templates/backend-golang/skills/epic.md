---
name: epic
description: Scaffold a new epic for a Go backend service, or review/update an existing one. Use when starting work on a new endpoint, gRPC method, async worker, or schema migration.
argument-hint: "<{{EPIC_PREFIX}}-XXXX> [title]"
---

# Epic: $ARGUMENTS

You are the **Product Owner (PO)** agent — a senior product practitioner.
Load your full persona from `.claude/agents/po.md` before starting.

## If creating a NEW epic

1. Run `make epic KEY=$0` to scaffold the epic folder (or copy templates manually if `make` isn't set up)
2. Read the created `docs/sdlc/epics/$0/$0.md`
3. Fill in the epic doc with:
   - **Problem Statement** — what user / business problem does this solve? (who is "user" — browser client, mobile client, partner service, internal operator, scheduled job?)
   - **Business Value** — who benefits, how, measurable where possible
   - **Target Caller** — for an API/service: which client tier, which downstream service, which scheduled trigger
   - **Scope** — in scope / out of scope, explicit
   - **User Stories** — ID, story, high-level acceptance criteria (detailed in PRD), priority (MoSCoW)
   - **Affected Areas** — Go packages under `internal/` this epic touches (`internal/user`, `internal/billing`, `internal/platform/db`, etc.) + any new endpoints / gRPC methods / topics / queues
   - **Dependencies** — DB schema changes (will need `goose` migration), Redis, Kafka/NATS topics, downstream service contracts, secret store keys, infra capacity
   - **Epic Phases** — Planning → Implementation → Testing → Execute-Test → Release → Doc-Sync (skip phases your pipeline config disables)
   - **Risks & Mitigations** — known unknowns (e.g., "schema change requires expand-contract; backfill volume estimated 10M rows")
4. If a title is provided as the second argument, use it as the epic title

## If reviewing an EXISTING epic

1. Read `docs/sdlc/epics/$0/$0.md`
2. Check the artifact tracker — what's done, what's missing, what's stale
3. Identify gaps: missing endpoints, unclear status codes, unresolved schema decisions, uncovered failure modes (upstream timeout, pgxpool exhaustion, queue saturation)
4. Suggest improvements; don't silently rewrite

## Context

- Project architecture: `CLAUDE.md`, `README.md`, `docs/architecture.md`
- Existing endpoint catalog: `api/openapi.yaml`
- Existing gRPC services: `api/proto/`
- Existing sqlc queries: `internal/<feature>/queries.sql`
- Existing goose migrations: `migrations/`
- SLO sheet (if any): `docs/operations/slos.md`
- Related epics — check for overlap or dependencies (shared tables, shared queues, shared flags)

## Quality Gates

- [ ] Problem statement is caller-focused, not implementation-focused
- [ ] In-scope / out-of-scope clear (especially: "do we touch the legacy `/v0` endpoint? no.")
- [ ] Target caller identified (client app / partner / internal service / scheduler)
- [ ] Endpoints / RPCs / topics / queues enumerated by method + path / service.method / topic
- [ ] Dependencies identified with status and owner (DB migration owner, downstream service team, infra capacity)
- [ ] Affected areas (Go packages) specific enough to drive sqlc scope and test scope
- [ ] Risks and mitigations noted (especially for schema migration sequencing, dual-read/dual-write windows)

Map user stories to existing endpoints / contract tests where applicable so QA can trace and reuse.
