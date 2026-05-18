---
name: release
description: Prepare a release for a Go backend service. Creates checklist, runs goreleaser, signs container with cosign, sequences goose migrations, and guides progressive rollout.
argument-hint: "<version> (e.g., 1.3.0)"
---

# Release v$0 — Backend Go

You are the **Release Manager (RM)** agent.
Load your persona from `.claude/agents/release-manager.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `release`, epic = detect from branch/commits. If no epic key → skip. If gate fails → STOP.

## Steps

1. Create the release checklist:
   ```bash
   make release-checklist VER=$0
   ```
   (or copy `docs/sdlc/templates/RELEASE-CHECKLIST-TEMPLATE.md` to `docs/sdlc/releases/v$0-release-checklist.md`)

2. Read the created checklist.

3. Gather release content:
   ```bash
   # Commits since last tag
   git log --oneline $(git describe --tags --abbrev=0)..HEAD --no-merges

   # Epic keys
   git log $(git describe --tags --abbrev=0)..HEAD --pretty="%s" --no-merges \
     | grep -oE '{{EPIC_PREFIX}}-[0-9]+' | sort -u
   ```
   For each epic, check UAT / doc-sync status. Capture:
   - Breaking changes (proto field removal, JSON shape change, env var rename)
   - New endpoints / gRPC methods
   - New env vars (envconfig fields)
   - New feature flags
   - New goose migrations (and reversibility)
   - New downstream dependencies (services, DBs, queues)

4. Pre-release gates:
   - [ ] `golangci-lint run ./...` clean
   - [ ] `go test -race ./...` green on CI
   - [ ] `govulncheck ./...` clean
   - [ ] `go mod tidy` produces no diff
   - [ ] No P0/P1 bugs open for any epic in scope
   - [ ] UAT signed off for every epic
   - [ ] Container build green (goreleaser dry-run)
   - [ ] Rollback path verified (previous tag pullable, previous container in registry)
   - [ ] Feature flags configured

5. Sequence migrations (expand-contract):
   - [ ] Expand migration (additive) already deployed in a previous release (or first in this one, before code rollout)
   - [ ] Backfill complete (or scheduled job running)
   - [ ] Code switch: this release reads/writes new shape
   - [ ] Contract migration deferred to next release

6. Build & sign:
   ```bash
   # Tag
   git tag v$0
   git push --tags

   # goreleaser builds binaries + containers + SBOM, cosign signs in same step
   goreleaser release --clean

   # Verify signature
   cosign verify ghcr.io/org/app:v$0 \
     --certificate-identity-regexp 'https://github.com/org/app' \
     --certificate-oidc-issuer https://token.actions.githubusercontent.com
   ```

7. Run migration job (K8s):
   ```bash
   kubectl apply -f deploy/jobs/goose-migrate-v$0.yaml
   kubectl wait --for=condition=complete job/goose-migrate-v$0 --timeout=10m
   ```

8. Deploy (progressive):
   ```bash
   # Argo Rollouts canary
   kubectl set image rollout/app app=ghcr.io/org/app:v$0
   kubectl argo rollouts get rollout app --watch
   # Halts at each step (10% → 25% → 50% → 100%) with analysis run
   ```

9. Verify:
   - `/healthz` and `/readyz` green
   - Error rate within SLO
   - Latency p95 within SLO
   - Goroutine count stable
   - pgxpool acquired/idle/waiting healthy

## Release Notes Format

### User-facing (API consumers)

```
v$0 — YYYY-MM-DD

What's new:
- New endpoint POST /v1/widgets — see OpenAPI for full contract
- GET /v1/users now includes lastLoginAt (additive)

Improvements:
- p95 latency on /v1/widgets/list reduced from 380ms → 120ms via new index

Deprecations:
- X-Legacy-Auth header — removal scheduled for v$0+2

Breaking changes:
- None
```

Translate user-facing notes to every supported locale.

### Technical changelog (`docs/sdlc/releases/v$0.md`)

```markdown
## v$0 — YYYY-MM-DD

### New
- **{{EPIC_PREFIX}}-XXXX**: POST /v1/widgets endpoint (handler + service + sqlc query + migration 0042)
- **{{EPIC_PREFIX}}-YYYY**: gRPC streaming method `WidgetService.Watch`

### Improved
- **{{EPIC_PREFIX}}-ZZZZ**: pgxpool sizing tuned (max conns 20 → 30 based on load test)

### Fixed
- **{{EPIC_PREFIX}}-AAAA**: goroutine leak in user-refresh flow (cancel ctx propagation)

### Breaking
- (none)

### Migrations
- `0042_add_widgets.sql` (additive; reversible)
- `0043_add_widgets_color_idx.sql` (additive index)

### Dependencies
- `pgx/v5` v5.6.0 → v5.7.0
- `redis/go-redis/v9` v9.5.0 → v9.5.1 (security patch)

### Env vars (new)
- `WIDGET_DEFAULT_TTL` (default `24h`)

### Feature flags (new)
- `feature.widgets` (default `false`)

### Observability
- New metric `widget_creates_total{tenant_id}`
- New OTEL span `widget.service.create`
```

## Reference

- Rollback: `docs/sdlc/templates/ROLLBACK-PLAYBOOK.md`
- Migration policy: `docs/operations/migrations.md` (expand-contract)
- Monitoring: Grafana dashboard URLs in `docs/operations/dashboards.md`
- Release checklist template: `docs/sdlc/templates/RELEASE-CHECKLIST-TEMPLATE.md`
- goreleaser config: `.goreleaser.yaml`
- cosign verification: `docs/operations/cosign-verify.md`
