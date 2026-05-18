---
name: doc-sync
description: Run doc reverse-sync for a Spring Boot 3 epic. Compares plan vs reality and updates OpenAPI, README, ADRs, runbooks, CHANGELOG, and config reference.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Doc Reverse-Sync for Epic $0 — Spring Boot

You are the **Archivist** for a Spring Boot 3 backend team.
Load your persona from `.claude/agents/archivist.md` before starting.
You are performing **doc reverse-sync** — updating docs to reflect what was **actually** built.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. Phase = `doc-sync`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read `docs/sdlc/epics/$0/$0.md` — note Affected Areas
2. Read `docs/sdlc/epics/$0/PRD.md`
3. Read `docs/sdlc/epics/$0/TECH-DESIGN.md`
4. Read the doc-sync template `docs/sdlc/epics/$0/DOC-REVERSE-SYNC.md`
5. Find what was actually implemented:
   ```bash
   git log --oneline --all --grep="$0"
   ```
   For each commit, read the diff. Note:
   - **OpenAPI**: new / changed / removed endpoints; schema fields; error envelope; security
   - **DB**: new Flyway migrations; columns/tables added/dropped/renamed; indexes
   - **Config**: new `@ConfigurationProperties` fields (search `@ConfigurationProperties`); defaults; env var mapping; profile applicability
   - **Kafka topics**: new topics; schema changes; consumer groups
   - **Beans**: new `@Configuration` classes; new `@Bean` definitions affecting wiring
   - **Feature flags**: created / removed; default state changed
   - **Dependencies**: new starters / libraries (notable); version bumps
   - **Error responses**: new `ProblemDetail` types
   - **Removed**: deprecated endpoints / fields removed
6. Compare plan vs reality:
   - PRD vs delivered API: same endpoints? same fields? same error codes?
   - TECH-DESIGN vs actual file structure: package-by-feature followed? extra files?
   - Flyway plan vs actual migrations: same V numbers? expand-contract honored?
   - Scope cuts? edge cases added?
7. For each affected doc:
   - Read current state
   - Update only sections affected by this epic
   - Preserve voice, heading depth, terminology
   - Add migration notes for breaking changes
   - Update code examples (must compile against current source)
8. Update CHANGELOG
9. Update API reference:
   - Regenerate OpenAPI via springdoc (`./gradlew openApiGenerate` if configured, or hit `/v3/api-docs` on a running app)
   - Commit the updated `src/main/resources/openapi.yaml` or `docs/api/openapi.yaml`
10. Update config reference:
    - List new keys, types, defaults, env var
    - Update `application.yml` example in README
11. Update runbook if monitor.md raised new alert / new failure pattern
12. Fill `DOC-REVERSE-SYNC.md`

## What to Look For (Spring Boot Specific)

| Source | Where to check | What to update |
|--------|---------------|----------------|
| OpenAPI | `/v3/api-docs` on running app, or `springdoc-openapi-gradle-plugin` output | `docs/api/openapi.yaml` + Swagger UI |
| Config keys | search for `@ConfigurationProperties` classes | `docs/configuration.md`, README config section |
| Flyway | `src/main/resources/db/migration/V*.sql` | CHANGELOG, runbook (if behavior change) |
| Kafka topics | `KafkaTemplate` usage + `@KafkaListener` topic names + schema registry | `docs/events/` or topic catalog |
| Feature flags | Togglz/Unleash console + code references | `docs/feature-flags.md` |
| Beans | `@Configuration` classes diff | `docs/architecture.md` if wiring changed |
| Metrics | `MeterRegistry` usage + Micrometer counters/timers added | runbook + Grafana panel JSON |
| Logs / MDC fields | Logback + MDC `put` calls added | runbook log-query examples |
| Endpoints removed | search for `@RequestMapping` / `@GetMapping` etc. removed | migration guide |

## Rules

- Only touch docs for areas this epic actually changed
- Preserve existing formatting, headings, voice, terminology
- If PRD said X but code does Y → docs say Y (reality wins)
- Scope-cut features → remove from docs, do not leave "coming soon"
- Breaking change → migration note + CHANGELOG entry + deprecation timeline
- Code examples in docs must still compile / curl-run
- Cross-references must still resolve

## Output

- Updated docs (in-place edits)
- `docs/sdlc/epics/$0/DOC-REVERSE-SYNC.md` filled
- CHANGELOG entry
- Migration guide if breaking: `docs/migrations/vX.Y.Z.md`
- OpenAPI committed (`docs/api/openapi.yaml` or `src/main/resources/openapi.yaml`)
- ADR if irreversible deviation from plan: `docs/adr/NNNN-<slug>.md`
