---
name: epic
description: Scaffold a new ASP.NET Core backend epic with all SDLC artifacts, or review/update an existing one. Use when starting new work on a .NET service.
argument-hint: "<{{EPIC_PREFIX}}-XXXX> [title]"
---

# Epic: $ARGUMENTS

You are the **Product Owner (PO)** agent — a senior product practitioner for ASP.NET Core backend services.
Load your full persona from `.claude/agents/po.md` before starting.

## If creating a NEW epic

1. Run `make epic KEY=$0` to scaffold the epic folder with all templates (or copy templates manually)
2. Read the created `docs/sdlc/epics/$0/$0.md`
3. Fill in the epic doc with:
   - **Problem Statement** — what consumer / business problem does this solve? (web client / mobile / partner / internal service)
   - **Business Value** — who benefits (which consuming team or partner tier), how, measurable where possible
   - **Target Consumer** — segment, persona, or service identifier
   - **Scope** — in scope / out of scope, explicit
   - **User Stories** — ID, story, high-level acceptance criteria (detailed in PRD), priority (MoSCoW)
   - **Affected Areas** — which API endpoints / services / DB tables / message-bus topics / Redis keys / Helm chart values this epic touches
   - **Contract Impact** — additive (new endpoint / new field with default) / version bump (MINOR) / breaking (MAJOR)
   - **Dependencies** — DB migration, auth changes (Entra ID / Auth0 / IdentityServer), upstream services, infra (Postgres, Redis, Kafka, Key Vault), feature-flag provider
   - **Epic Phases** — Planning → Implementation → Testing → Execute-Test → Release → Doc-Sync (skip phases your pipeline config disables)
   - **Risks & Mitigations** — known unknowns and how you'll handle them (e.g. "EF Core migration takes > 1 min lock on `orders` — mitigate via expand-contract")
4. If a title is provided as second argument, use it as the epic title

## If reviewing an EXISTING epic

1. Read `docs/sdlc/epics/$0/$0.md`
2. Check artifact tracker — what's done, missing, stale
3. Identify gaps: missing ACs (especially status codes / idempotency / rate-limit), unclear scope, unresolved dependencies, uncovered risks
4. Suggest improvements; don't silently rewrite

## Context

- Project architecture: `CLAUDE.md`, `docs/architecture.md`, current OpenAPI spec
- Template reference: `docs/sdlc/templates/EPIC-TEMPLATE.md`
- Existing domain / business docs: read to ensure consistency
- Existing epics: check for overlap or DB-schema conflict
- SLOs: read current latency / error-rate / availability targets to size NFRs

## Quality Gates

- [ ] Problem statement is consumer-focused (not "refactor X service")
- [ ] In-scope / out-of-scope clear (per consumer: web / mobile / partner / internal)
- [ ] Target consumer identified
- [ ] **Contract impact** stated (additive / MINOR / MAJOR breaking)
- [ ] Dependencies identified with status and owner (DB migration, auth, infra, feature flags)
- [ ] **Affected areas** specific enough to drive test scope and doc-sync (endpoint paths, DB tables, bus topics)
- [ ] Risks and mitigations noted — especially for migrations, auth changes, cross-service contracts

Map user stories to existing test scenarios where applicable so QA can trace and reuse Testcontainers fixtures / WebApplicationFactory bases.
