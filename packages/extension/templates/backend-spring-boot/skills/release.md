---
name: release
description: Prepare a release for a Spring Boot 3 service. Cloud Native Buildpacks image build, Flyway migration timing, Helm chart bump, canary via Argo Rollouts / Flagger, feature flag setup, post-deploy Actuator + Prometheus verification.
argument-hint: "<version> (e.g., 1.3.0)"
---

# Release v$0 — Spring Boot Service

You are the **Release Manager (RM)** for a Spring Boot 3 service.
Load your persona from `.claude/agents/release-manager.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. Phase = `release`. If gate fails → STOP.

## Steps

1. Create the release checklist:
   ```bash
   make release-checklist VER=$0
   # or
   cp docs/sdlc/templates/RELEASE-CHECKLIST-TEMPLATE.md docs/sdlc/releases/v$0-release-checklist.md
   ```

2. Read `docs/sdlc/releases/v$0-release-checklist.md`

3. Gather release content:
   ```bash
   git log --oneline $(git describe --tags --abbrev=0)..HEAD --no-merges
   git log $(git describe --tags --abbrev=0)..HEAD --pretty="%s" --no-merges \
     | grep -oE '{{EPIC_PREFIX}}-[0-9]+' | sort -u
   ```
   For each epic, check UAT + doc-sync. Capture:
   - Breaking API changes (compare OpenAPI vs previous tag)
   - New / changed config keys (search `@ConfigurationProperties` diffs)
   - New Flyway migrations (`ls src/main/resources/db/migration/V*` vs previous tag)
   - New / changed Kafka topics + schema evolution
   - New dependencies (`build.gradle.kts` + `libs.versions.toml` diff)
   - New / removed feature flags

4. Fill the release checklist with content sections below

5. Pre-release gates:
   - [ ] `./gradlew clean build` green on CI (includes JaCoCo + ArchUnit + slice + integration tests)
   - [ ] `./gradlew pitest` mutation score ≥ target (if configured)
   - [ ] springdoc OpenAPI diff vs `vPREV` reviewed — breaking changes called out
   - [ ] `./gradlew dependencyCheckAnalyze` (OWASP) or Snyk scan reviewed
   - [ ] Gatling smoke load test green on staging
   - [ ] No P0/P1 bugs open
   - [ ] UAT signed off for every epic
   - [ ] **Flyway plan rehearsed on staging snapshot**; expand-contract verified if breaking
   - [ ] Version bumped (`axion-release-plugin` tag, or `version.txt`)
   - [ ] Image built: `./gradlew bootBuildImage --imageName=registry/<svc>:v$0`
   - [ ] Image pushed + signed (cosign if configured)
   - [ ] Helm chart `Chart.yaml` `version` + `appVersion` bumped to `v$0`
   - [ ] Feature flags created in console; default OFF; ramp plan documented
   - [ ] Canary plan: 5% → 25% → 50% → 100% with analysis template (error rate < baseline + 0.5%, p95 within SLO)
   - [ ] Rollback verified: previous Helm revision deployable; schema rollback unnecessary due to expand-contract
   - [ ] Dashboards bookmarked: Grafana Spring Boot panel, HikariCP, JVM, Kafka lag
   - [ ] Alert routes verified (PagerDuty / Opsgenie)
   - [ ] On-call notified; status-page draft prepared

6. Deploy guide (see `/deploy`):
   - UAT / staging first; verify Actuator + Prometheus before promoting
   - Production via ArgoCD sync (GitOps) — or `helm upgrade --install`
   - Canary: monitor analysis template results between each ramp step
   - After 100%, leave feature flag at expected state

## Release Notes Format

### User-facing (CHANGELOG.md)

```markdown
## v$0 — YYYY-MM-DD

### Added
- <Caller-visible feature in plain language>

### Changed
- <Behavior change with impact>

### Deprecated
- <Endpoint or field>, removal in vX.Y+1.0

### Fixed
- <User-visible bug fix>
```

### Technical (`docs/sdlc/releases/v$0.md`)

```markdown
## v$0 — YYYY-MM-DD

### New
- **{{EPIC_PREFIX}}-XXXX**: <one-line summary>

### Improved
- **{{EPIC_PREFIX}}-YYYY**: <summary>

### Fixed
- <summary>

### Breaking
- <Breaking change>. Migration: <link to migration guide>

### API
- New endpoints: `POST /api/v1/...`
- Changed endpoints: `GET /api/v1/...` — added pagination
- Removed: `GET /api/v0/...` (was deprecated in vX.Y.Z)

### Database (Flyway)
- `V42__add_orders.sql` — adds `orders` table
- `V43__add_orders_currency.sql` — expand step (column added, dual-write code)

### Configuration
- New: `app.payment.timeout: 5s` (default), env `APP_PAYMENT_TIMEOUT`
- Removed: `app.legacy.flag` (no longer used)

### Feature Flags
- `feature.X.enabled` — default OFF, ramp to 100% by YYYY-MM-DD

### Kafka
- New topic: `order.events.v1` (schema in registry)
- Schema evolution: `customer.events.v1` field `phone` made optional (backward compatible)

### Dependencies
- Spring Boot 3.3.4 → 3.3.5 (patch)
- Resilience4j 2.2.0 → 2.3.0

### Observability
- New metric: `app_orders_placed_total` (counter)
- New trace span: `order.publish-event`
- New alert: `OrderPlacementErrorRateHigh` (Prometheus)

### Migration / Rollback
- Forward-compat: previous version reads new schema fine (column has default)
- Rollback to v(prev) safe; no DB rollback needed
```

## Deploy commands (Helm + ArgoCD reference)

```bash
# Build + push (CI usually does this)
./gradlew clean build
./gradlew bootBuildImage --imageName=registry/<svc>:v$0
docker push registry/<svc>:v$0

# Bump chart
yq -i ".version = \"$0\"" deploy/helm/<svc>/Chart.yaml
yq -i ".appVersion = \"$0\"" deploy/helm/<svc>/Chart.yaml
yq -i ".image.tag = \"v$0\"" deploy/helm/<svc>/values-prod.yaml

# Commit + push chart change → ArgoCD picks up
git commit -am "chore: release v$0"
git push

# Or direct helm (non-GitOps)
helm upgrade --install <svc> deploy/helm/<svc> \
  -f deploy/helm/<svc>/values-prod.yaml \
  --set image.tag=v$0 \
  --namespace <ns> --wait
```

## Post-Deploy Verification

```bash
# Build info
kubectl exec -n <ns> deploy/<svc> -- curl -s localhost:8080/actuator/info | jq

# Health
kubectl exec -n <ns> deploy/<svc> -- curl -s localhost:8080/actuator/health | jq

# Quick Prometheus checks
# Error rate (last 5 min):
curl -s "$PROM/api/v1/query?query=sum(rate(http_server_requests_seconds_count{service=\"<svc>\",status=~\"5..\"}[5m]))/sum(rate(http_server_requests_seconds_count{service=\"<svc>\"}[5m]))"
# p95 latency:
curl -s "$PROM/api/v1/query?query=histogram_quantile(0.95,sum(rate(http_server_requests_seconds_bucket{service=\"<svc>\"}[5m]))by(le))"
# HikariCP pending:
curl -s "$PROM/api/v1/query?query=hikaricp_connections_pending{service=\"<svc>\"}"
```

## Rollback

1. **Feature flag flip** (fastest): toggle in Togglz/Unleash/LaunchDarkly console
2. **Helm revision rollback**:
   ```bash
   helm history <svc> -n <ns>
   helm rollback <svc> <REV> -n <ns>
   ```
   Or in ArgoCD UI / `argocd app rollback <svc>`
3. **Image pin to previous tag** in chart values; commit; ArgoCD sync

Schema rollback should NOT be needed because Flyway migrations are forward-only + expand-contract. If a migration must be reverted, write a new `V{n+1}__revert_X.sql` rather than touching the old file.

## Reference

- `docs/sdlc/templates/ROLLBACK-PLAYBOOK.md`
- `docs/operations.md` (deploy + runbook)
- Helm chart: `deploy/helm/<svc>/`
- ArgoCD app: `deploy/argocd/<svc>.yaml`
