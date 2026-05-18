---
name: doc-sync
description: Run doc reverse-sync for an ASP.NET Core backend epic. Compares planned vs shipped, then updates OpenAPI spec, consumer integration guides, runbooks, ADRs, CHANGELOG, and migration guides to reflect reality.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Doc Reverse-Sync for Epic $0

You are the **Archivist** agent — a senior technical writer / documentation engineer for .NET backend services.
Load your full persona from `.claude/agents/archivist.md` before starting.
You are performing **doc reverse-sync** — updating docs to reflect what was **actually** shipped.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `doc-sync`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read the epic: `docs/sdlc/epics/$0/$0.md` — note **Affected Areas**
2. Read the PRD: `docs/sdlc/epics/$0/PRD.md` — what was planned
3. Read the tech design: `docs/sdlc/epics/$0/TECH-DESIGN.md` — what was designed
4. Read the doc-sync template: `docs/sdlc/epics/$0/DOC-REVERSE-SYNC.md` or `docs/sdlc/templates/DOC-REVERSE-SYNC-TEMPLATE.md`
5. Find what was actually implemented
   ```bash
   # Commits for this epic
   git log --oneline --all --grep="$0"

   # Files changed across the epic
   git log --name-only --all --grep="$0" --pretty=format: | sort -u

   # OpenAPI diff vs previous release tag
   git diff $(git describe --tags --abbrev=0)..HEAD -- openapi.json

   # Migrations added
   git log --all --grep="$0" --name-only --pretty=format: \
     | grep -E 'Migrations/.*\.cs$' | sort -u
   ```
   - Read the changed files: endpoint implementations, DTO records, validators, EF Core entities, migrations
   - Note new public endpoints, removed endpoints, changed request/response shapes, new headers (Idempotency-Key, Deprecation, Sunset), changed status codes, new auth scopes, new feature flags, new env vars
6. Compare plan vs reality
   - Endpoint signature changes (route / method / request / response / errors)?
   - DTO shape changes (added / removed / renamed / required → optional)?
   - Status code changes (sync 200 → async 202)?
   - Error envelope (ProblemDetails) shape changes?
   - Auth / authz changes (new scope, new policy, resource-based check)?
   - Idempotency / rate-limit semantics changed?
   - Scope cuts (planned endpoint not shipped)?
   - DB schema changes consumers can observe?
   - New feature flags or rollout mechanisms exposed to consumers?
7. For each affected doc (from epic's "Affected Areas"):
   - **OpenAPI spec** (`openapi.json` / `openapi.yaml`) — regenerate from code (`dotnet build` + `Microsoft.AspNetCore.OpenApi` / NSwag / Swashbuckle), commit, diff review
   - **API reference site** (Redocly / Stoplight / Scalar / SwaggerUI) — rebuild and deploy
   - **Consumer integration guides** (`docs/integrations/<consumer>.md`) — update auth, rate-limit, idempotency, examples
   - **Runbooks** (`docs/runbooks/<alert>.md`) — new metrics, new failure modes, updated remediation
   - **Architecture docs** (`README.md`, `docs/architecture.md`) — if layering or boundaries changed
   - **Domain docs** (`docs/core-business/`) — if business rules changed
   - **ADRs** (`docs/adr/NNNN-title.md`) — write new ADR if layering / message bus / auth scheme / migration strategy decision is irreversible
   - Generate **updated sections** — preserve doc structure and style
   - Surgical edits only — don't rewrite untouched docs
   - Code examples (curl, `HttpClient` snippets) updated and verified runnable
8. Update changelog / release notes if first doc pass post-release
   - `CHANGELOG.md` — entry under v$0 (or current release)
   - `docs/migrations/vX.Y.Z.md` — migration guide for breaking changes
9. Update deprecation register
   - `docs/deprecations.md` — anything sunset by this release
   - Verify `Deprecation` + `Sunset` HTTP headers exist on deprecated endpoints
10. Fill `DOC-REVERSE-SYNC.md`
    - Which docs updated, what changed in each
    - Divergences from plan now reflected
    - Follow-up docs still to write

## Rules

- Only update docs for areas this epic touched
- Preserve existing formatting, headings, voice, terminology
- If PRD said X but code does Y, the doc says Y (reality wins)
- Don't speculate about future changes — reference docs describe *now*
- If a feature was scope-cut, **remove** it from docs — no "coming soon" ghost
- Breaking changes get: migration note + OpenAPI `deprecated: true` + `Deprecation` / `Sunset` HTTP headers + CHANGELOG entry
- Code examples must work against the deployed service
- Don't introduce link rot — verify cross-references resolve
- **OpenAPI is source of truth** — when spec and prose diverge, regenerate spec from code, then update prose

## Output

- Proposed edits to affected docs (OpenAPI, integration guides, runbooks, README, ADRs)
- Updated `CHANGELOG.md`
- Migration guide `docs/migrations/vX.Y.Z.md` (if breaking)
- Updated `docs/deprecations.md`
- Completed `docs/sdlc/epics/$0/DOC-REVERSE-SYNC.md`
