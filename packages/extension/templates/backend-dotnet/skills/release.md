---
name: release
description: Prepare an ASP.NET Core backend release. Creates checklist, identifies included epics, bumps Helm chart, verifies migration ordering, confirms canary plan and feature-flag posture, and produces consumer-facing + technical changelog.
argument-hint: "<version> (e.g., 1.3.0)"
---

# Release v$0

You are the **Release Manager (RM)** agent — a senior release practitioner for .NET backend services.
Load your full persona from `.claude/agents/release-manager.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `release`, epic = detect from branch/commits. If no epic key → skip gate. If gate fails → STOP.

## Steps

1. Create the release checklist:
   ```bash
   make release-checklist VER=$0
   ```
   (or copy `docs/sdlc/templates/RELEASE-CHECKLIST-TEMPLATE.md` to `docs/sdlc/releases/v$0-release-checklist.md`)

2. Read the created checklist at `docs/sdlc/releases/v$0-release-checklist.md`

3. Gather release content
   ```bash
   # Commits since last tag
   git log --oneline $(git describe --tags --abbrev=0)..HEAD --no-merges

   # Epic keys referenced
   git log $(git describe --tags --abbrev=0)..HEAD --pretty="%s" --no-merges \
     | grep -oE '{{EPIC_PREFIX}}-[0-9]+' | sort -u

   # Migrations added since last release
   git diff $(git describe --tags --abbrev=0)..HEAD -- '**/Migrations/*.cs' --stat

   # OpenAPI diff
   git diff $(git describe --tags --abbrev=0)..HEAD -- openapi.json | head -100
   ```
   For each epic: check UAT / doc-sync status. Capture breaking changes, new env vars, new dependencies, feature flags added/removed.

4. Bump versions
   ```bash
   # Central version (Directory.Build.props or MinVer/Nerdbank.GitVersioning)
   # Update <Version> in Directory.Build.props (or let MinVer derive from tag)

   # Helm chart
   # charts/<service>/Chart.yaml: bump `version` and `appVersion`
   # charts/<service>/values.yaml: bump `image.tag` to v$0
   ```

5. Fill the release checklist
   - List all epics with UAT status
   - **User-facing release notes** — plain language, value-focused (consumer-team email + status-page entry)
   - **Technical changelog** — grouped by epic key; breaking changes called out; new env vars / migrations / flags listed
   - **Deploy notes** — migration ordering, canary plan, rollback levers
   - Pre-release, release-day, post-release sections

6. Pre-release gates
   - CI green on release branch (`dotnet build` warnings-as-errors)
   - Unit + integration (Testcontainers) tests pass
   - `dotnet format --verify-no-changes` clean; Roslyn analyzers clean
   - Image scanned (Trivy / Snyk) — no HIGH/CRITICAL CVEs
   - OpenAPI diff reviewed; MAJOR bumps justified with new version path
   - No P0/P1 bugs open for any epic in scope
   - UAT signed off for every epic
   - **Migration plan**: expand-only? rollback path? coexist test passed?
   - Feature flags configured (default-off for risky paths)
   - Helm chart PR opened against GitOps repo
   - Image signed (cosign) and verified

7. Deploy
   - **Migration job runs first** (init container or pre-sync hook)
   - **Canary 5%** → wait 10 min → check SLOs → 25% → 50% → 100%
   - Auto-rollback triggers: 5xx > 5%, p95 > 2× baseline, error budget burn > 14.4×
   - Use `/deploy` for env-specific steps

## Release Notes Format

### Consumer-facing
```
Service vX.Y.Z — released YYYY-MM-DD

New
- <Feature benefit in plain language>
- <Improvement>

Breaking
- <Endpoint X removed; use Y instead — see migration guide /docs/migrations/vX.Y.Z>

Action required
- <Update client to use new field>
- <New scope `orders:write` required for POST /v1/orders>

Deprecated
- <Endpoint Z deprecated; sunset YYYY-MM-DD>
```

Sent to consumer-team channels + posted on status page.

### Technical
```markdown
## v$0 — YYYY-MM-DD

### New
- **{{EPIC_PREFIX}}-XXXX**: Added `POST /v1/orders` with Idempotency-Key support

### Improved
- **{{EPIC_PREFIX}}-YYYY**: `GET /v1/orders` p95 reduced 320ms → 95ms (compiled query + projection)

### Fixed
- **{{EPIC_PREFIX}}-ZZZZ**: Race condition in order status update under concurrent PUT

### Breaking
- `GET /v1/orders/{id}` field `customer` → `customerId` (string). v1 retained for 90 days; v2 ships with new name. Migration: `docs/migrations/v$0.md`

### Deprecated
- `POST /v1/orders/legacy` — sunset YYYY-MM-DD; use `POST /v1/orders`

### Internal
- Stryker.NET mutation suite added for `Orders.Domain`
- Upgraded `Microsoft.AspNetCore.OpenApi` to 9.0.0

### Deploy notes
- **Migrations**: `20251018_AddOrderStatus` (expand: nullable column `Status`); `20251018_BackfillOrderStatus` (data job; run before scaling code)
- **Env vars added**: `FeatureFlags__OrdersV2`, `Redis__IdempotencyTtlSeconds`
- **Helm changes**: `values.yaml` — new `idempotency.ttl`, bumped `image.tag` to v$0
- **Feature flags**: `OrdersV2=off` at release; flip on for canary tenants Day 2
- **Resource changes**: CPU request bumped 200m → 350m (load-test result)
- **Rollback**: `helm rollback <release> <previous-revision>`; migration `Status` column is nullable so old code reads/writes fine
```

## Helm Chart Bump Checklist

- [ ] `Chart.yaml`: `version` (chart) and `appVersion` (image tag) bumped
- [ ] `values.yaml`: `image.tag: v$0`
- [ ] Any new env var added to `values.yaml` + `templates/deployment.yaml`
- [ ] Any new secret referenced from Key Vault / Sealed Secret
- [ ] Migration job manifest (`templates/job-migrate.yaml`) updated with new image tag
- [ ] Resource requests / limits adjusted if load-test demanded it
- [ ] PR opened against GitOps repo with rationale
- [ ] ArgoCD app health = `Healthy` post-sync; revision noted

## Canary / Rollout Config

For Argo Rollouts example:
```yaml
strategy:
  canary:
    steps:
    - setWeight: 5
    - pause: { duration: 10m }
    - setWeight: 25
    - pause: { duration: 10m }
    - setWeight: 50
    - pause: { duration: 10m }
    - setWeight: 100
    analysis:
      templates:
      - templateName: success-rate
      - templateName: latency-p95
      startingStep: 1
```

Auto-rollback on `success-rate < 99%` or `p95 > 2 * baseline`.

## Reference

- Rollback playbook: `docs/sdlc/templates/ROLLBACK-PLAYBOOK.md`
- Monitoring guide: `docs/sdlc/MONITORING-GUIDE.md`
- Migration guide template: `docs/migrations/TEMPLATE.md`
- Release checklist template: `docs/sdlc/templates/RELEASE-CHECKLIST-TEMPLATE.md`
