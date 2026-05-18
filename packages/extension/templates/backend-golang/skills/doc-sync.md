---
name: doc-sync
description: Run doc reverse-sync for a Go backend epic. Updates OpenAPI, proto, godoc, runbooks, env/config docs, ADRs, and changelog to reflect what was actually built.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Doc Reverse-Sync for Epic $0 — Backend Go

You are the **Archivist** agent.
Load your persona from `.claude/agents/archivist.md` before starting.
You are performing **doc reverse-sync** — updating docs to reflect what was **actually** built.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `doc-sync`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read the epic: `docs/sdlc/epics/$0/$0.md` — note **Affected Areas**
2. Read the PRD: `docs/sdlc/epics/$0/PRD.md` — what was planned
3. Read the tech design: `docs/sdlc/epics/$0/TECH-DESIGN.md` — what was designed
4. Read the doc-sync template: `docs/sdlc/epics/$0/DOC-REVERSE-SYNC.md` or `docs/sdlc/templates/DOC-REVERSE-SYNC-TEMPLATE.md`
5. Find what was actually implemented:
   ```bash
   git log --oneline --all --grep="$0"
   ```
   For each commit, read the diff. Pay attention to:
   - New / modified HTTP handlers (chi `r.Get/Post/...` lines)
   - New / modified gRPC methods (rpc declarations in `.proto`)
   - New / modified sqlc queries (in `queries.sql`)
   - New / modified goose migrations (in `migrations/`)
   - New env vars (envconfig struct fields)
   - New OpenFeature flags
   - New OTEL spans / slog fields / Prometheus metrics
   - New `/healthz` or `/readyz` checks
   - New sentinel errors (`var Err... = errors.New(...)`)
   - New exported types/functions in `internal/` (for godoc) or `pkg/` (for external godoc)

6. Compare plan vs. reality:
   - HTTP / gRPC contract: did status codes change? new fields? renamed fields? new error codes?
   - Data model: which migrations applied? any added beyond plan? any deferred?
   - Behavior: any scope cuts? any "while we're in there" additions?
   - Idempotency: how was it implemented? (header? unique constraint? upsert?)
   - Feature flags: which got default-on this release? which got removed?

7. For each affected doc, update **only** the relevant sections:

| Doc | What to update |
|-----|----------------|
| `api/openapi.yaml` | New paths, schemas, error responses; mark removed paths as deprecated, not deleted |
| `api/proto/*.proto` | New rpc methods; new fields (NEVER renumber or remove — use `reserved`) |
| `docs/architecture.md` | If package boundaries changed, or new cross-cutting concern added |
| `docs/operations/configuration.md` | Each new env var: name, type, default, required, description |
| `docs/operations/flags.md` | Each new feature flag: name, default, owner, rollout plan |
| `docs/operations/runbooks/<topic>.md` | New alert added? new failure mode discovered? mitigation steps changed? |
| `docs/operations/slos.md` | New endpoint added? update SLO targets |
| `docs/adr/NNNN-*.md` | New ADR for any irreversible decision (DB engine, broker, framework swap) |
| `CHANGELOG.md` | User-facing + internal sections; breaking changes called out |
| `docs/migrations/vX.Y.Z.md` | Migration guide for breaking changes (proto field removal, env var rename, JSON shape change) |
| godoc on exported symbols | Update `// Package <name>` and per-symbol doc comments to match new behavior |

8. Update CHANGELOG / release notes if this is the first doc pass after release.

9. Fill `DOC-REVERSE-SYNC.md`:
   - Which docs were updated and why
   - Which divergences from plan are now reflected
   - Any follow-up docs still to write

## Validation Commands

```bash
# OpenAPI spec validity
spectral lint api/openapi.yaml
# (or) openapi-spec-validator api/openapi.yaml

# Proto lint + breaking change check
buf lint
buf breaking --against '.git#branch=main'

# godoc coverage (informal)
go doc ./...

# Markdown link check (if mlc / lychee installed)
lychee docs/
```

## Rules (Go backend specific)

- Only update docs for areas this epic actually touched
- Preserve existing doc formatting, headings, voice, terminology
- If PRD said X but code does Y, the doc says Y (reality wins)
- Don't speculate about future changes — reference docs describe *now*
- Scope-cut features: **remove** from docs (no "coming soon")
- Breaking external changes (proto field removal, env var rename, JSON shape) → migration guide AND CHANGELOG entry
- Proto evolution: never renumber, never remove a field — use `reserved` and mark `deprecated = true`
- OpenAPI: deprecate before delete; give consumers a release to migrate
- Env vars: keep `docs/operations/configuration.md` table sync'd with `envconfig` struct
- godoc on every exported symbol; the comment starts with the symbol name (`// Service ...`)
- Example_X functions in godoc must still compile (`go test ./...` runs them)

## Output

- Proposed edits to the affected doc files
- Completed `docs/sdlc/epics/$0/DOC-REVERSE-SYNC.md`
- Changelog entry (if first pass post-release)
- Migration guide (if breaking): `docs/migrations/vX.Y.Z.md`
- New ADR (if irreversible decision discovered post-implementation): `docs/adr/NNNN-*.md`
