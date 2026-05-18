# Release Notes — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Release Manager:** RM
**Version:** `v0.0.0`
**Status:** Draft
**Created:** `$DATE`
**Service:** `<service-name>` (ASP.NET Core, .NET 8/9)

---

## 1. Release Overview

| Item | Value |
|------|-------|
| Version tag | `v0.0.0` |
| Branch / SHA | `release/v0.0.0 @ <sha>` |
| Release date | `$DATE` |
| Image | `<registry>/<svc>:v0.0.0` |
| Helm chart version | `0.0.0` |
| ArgoCD app | `<svc>-prod` |
| Rollout strategy | Canary 5% → 25% → 50% → 100% via Argo Rollouts |
| Migration job | `<svc>-migrate-v0.0.0` (pre-sync hook) |
| Submitted | ⬜ Yes / ⬜ Pending |

## 2. What's New (Consumer-facing)

> *Plain language summary for the consumer-team email / status page entry.*

### New
- …

### Improved
- …

### Bug fixes
- … (only if user-visible)

### Breaking
- … (link to migration guide `docs/migrations/vX.Y.Z.md`)

### Deprecated
- Endpoint `…` — sunset YYYY-MM-DD. Use `…` instead.

## 3. Technical Changelog (Internal)

```markdown
## vX.Y.Z — YYYY-MM-DD

### New
- **$EPIC_ID**: Added `POST /v1/orders` with Idempotency-Key support, FluentValidation, Polly resilience pipeline on Partner API

### Improved
- **EPIC-YYYY**: `GET /v1/orders` p95 reduced 320ms → 95ms via compiled query + projection

### Fixed
- **EPIC-ZZZZ**: Race condition in order status PUT under concurrent updates (`DbUpdateConcurrencyException` now handled with retry)

### Breaking
- (none / see below)

### Internal
- Upgraded `Microsoft.AspNetCore.OpenApi` to 9.0.x
- Stryker.NET mutation suite added on `Orders.Domain`
```

## 4. Deploy Notes

### New endpoints
| Method | Path | Auth | Rate-limit |
|--------|------|------|------------|
| POST | `/v1/orders` | `OrdersWrite` scope | `standard` |

### Migrations

| Migration | Type | Risk | Lock duration estimate |
|-----------|------|------|------------------------|
| `20251018_AddOrdersTable` | expand (new table) | low | none — additive |
| `20251018_AddOrdersIndexes` | expand (CREATE INDEX CONCURRENTLY) | low | none — concurrent |

Migration runs as **init container** / **pre-sync hook** before pod rollout. All migrations have `Down` methods. Coexist test passed (previous-release code works on new schema).

### Env vars added

| Name | Default | Required | Notes |
|------|---------|----------|-------|
| `FeatureFlags__OrdersV1Enabled` | `false` | yes | Flip to `true` per-tenant for canary |
| `Redis__IdempotencyTtlSeconds` | `86400` | yes | 24h replay window |
| `Partner__BaseUrl` | — | yes | Partner API endpoint |
| `Partner__TimeoutSeconds` | `10` | no | Polly timeout |

### Helm changes (`charts/<svc>/values.yaml`)

```yaml
image:
  tag: v0.0.0
env:
  FeatureFlags__OrdersV1Enabled: "false"
  Redis__IdempotencyTtlSeconds: "86400"
secrets:
  - name: Partner__ApiKey
    secretName: partner-credentials
    key: api-key
resources:
  requests:
    cpu: 350m       # bumped from 200m per load test
    memory: 384Mi
  limits:
    cpu: 1000m
    memory: 768Mi
probes:
  readiness:
    httpGet:
      path: /healthz/ready
    initialDelaySeconds: 10
    periodSeconds: 5
```

### Feature flags

| Flag | Provider | Default | Lifecycle |
|------|----------|---------|-----------|
| `OrdersV1Enabled` | `Microsoft.FeatureManagement` | off | flip on Day 2 for canary tenants; flip on globally Day 7 if SLO holds; remove flag in vX.Y+1.0 |

### Canary plan

| Step | Weight | Wait | Promotion criteria |
|------|--------|------|-------------------|
| 1 | 5% | 10 min | 5xx < 5%, p95 < 400 ms |
| 2 | 25% | 10 min | 5xx < 2%, p95 < 250 ms |
| 3 | 50% | 10 min | 5xx < 1%, p95 < 220 ms |
| 4 | 100% | — | hold + SLO watch 24h |

Auto-rollback triggers: `success-rate < 99%` OR `p95 > 2 * baseline` over 5-min window.

## 5. Release Checklist

### Pre-release

- [ ] CI green on `release/v0.0.0` (warnings-as-errors)
- [ ] Unit + integration (Testcontainers) tests pass
- [ ] `dotnet format --verify-no-changes` clean
- [ ] Roslyn analyzers clean
- [ ] Image scanned (Trivy / Snyk) — no HIGH/CRITICAL CVEs
- [ ] Image signed (cosign) and signature verifiable
- [ ] OpenAPI diff vs previous tag reviewed
- [ ] No P1 open bugs for epics in scope
- [ ] UAT signed off
- [ ] Migration plan reviewed (expand-only? rollback path? coexist test passed?)
- [ ] Feature flags configured default-off
- [ ] Helm chart PR opened (GitOps repo)
- [ ] `Chart.yaml` `version` + `appVersion` bumped
- [ ] Consumer-team email drafted

### Release day

- [ ] Tag commit `v0.0.0`
- [ ] Push tag triggers CI release pipeline
- [ ] Image built and pushed to registry
- [ ] Helm PR merged → ArgoCD sync (or Flux reconcile)
- [ ] Migration job runs pre-sync; verify `kubectl logs job/<svc>-migrate-v0.0.0`
- [ ] Canary 5% pod ready, `/healthz/ready` 200
- [ ] Smoke test pack green on canary
- [ ] Promote per canary plan with SLO watch

### Post-release

- [ ] Git tag `v0.0.0` exists and points at release SHA
- [ ] All canary stages complete
- [ ] No new error signatures in Serilog / Sentry / App Insights
- [ ] SLO burn rate within budget
- [ ] Consumer-team email sent
- [ ] Status page entry posted
- [ ] CHANGELOG merged to `main`
- [ ] Health report drafted (SRE `/monitor`)

## 6. Rollback Plan

In priority order:

1. **Feature flag**: `FeatureFlags__OrdersV1Enabled = false` (config reload or LaunchDarkly flip) → instant
2. **Helm revision rollback**:
   ```bash
   helm rollback <release> <previous-revision> -n <ns>
   # or ArgoCD:
   argocd app rollback <svc>-prod <revision>
   ```
3. **Migration**: All migrations in this release are expand-only — no `Down` required. Old code coexists with new schema (verified via coexist test).
4. **Notify**: Post in `#incidents` and consumer-team channels; update status page.

## 7. Known Issues / Limitations

- Idempotency-Key TTL hardcoded 24h — tunable in follow-up
- Outbox-pattern for `order.created` event deferred to next epic

## 8. Contributors

> *(Generated from git log)*

```bash
git log --pretty="- %an" $(git describe --tags --abbrev=0 HEAD^)..HEAD | sort -u
```
