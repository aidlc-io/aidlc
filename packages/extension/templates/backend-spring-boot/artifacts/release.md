# Release Notes — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Release Manager:** RM
**Version:** `v0.0.0`
**Status:** Draft
**Created:** `$DATE`
**Service:** `<service-name>`

---

## 1. Release Overview

| Item | Value |
|------|-------|
| Version tag | `v0.0.0` |
| Image | `registry/<svc>:v0.0.0` |
| Branch / SHA | `release/v0.0.0 @ <sha>` |
| Release date | `$DATE` |
| Helm chart version | `v0.0.0` |
| Helm appVersion | `v0.0.0` |
| Deploy target | Kubernetes (ArgoCD GitOps) |
| Rollout strategy | Canary (5% → 25% → 50% → 100%) via Argo Rollouts |

## 2. What's Shipped

### New
- **`$EPIC_ID`**: <one-line summary>

### Improved
- **`$OTHER_EPIC`**: <summary>

### Fixed
- <summary>

### Breaking
- <change>. Migration: `docs/migrations/v0.0.0.md`

## 3. API Changes

| Type | Endpoint | Notes |
|------|----------|-------|
| Added | `POST /api/v1/orders` | Idempotency-Key required |
| Added | `GET /api/v1/orders/{id}` | scope `order.read` |
| Deprecated | `GET /api/v0/orders` | Removal in v0.0.0+1 |

OpenAPI diff vs previous tag attached: `docs/sdlc/releases/v0.0.0-openapi-diff.md`

## 4. Database (Flyway)

| Migration | Description | Type |
|-----------|-------------|------|
| `V42__add_orders.sql` | Add `orders` + `order_lines` tables, indexes | Additive — safe single-step |

Pre-deploy: rehearsed on staging snapshot, applied cleanly.
Post-deploy: verify via `curl /actuator/flyway`.

## 5. Configuration Changes

| Key | Type | Default | Env var | Notes |
|-----|------|---------|---------|-------|
| `app.order.idempotency-ttl` | Duration | `24h` | `APP_ORDER_IDEMPOTENCY_TTL` | New |
| `resilience4j.circuitbreaker.instances.paymentService.failure-rate-threshold` | int | `50` | — | New |

## 6. Feature Flags

| Flag | Default | Ramp plan |
|------|---------|-----------|
| `feature.orders.v1.enabled` | OFF | 5% on T+0, 25% on T+1d, 50% on T+2d, 100% on T+3d |

## 7. Pre-release Checklist

- [ ] `./gradlew clean build` green on CI (unit + slice + integration + ArchUnit)
- [ ] JaCoCo coverage meets target
- [ ] PIT mutation score meets target (if configured)
- [ ] springdoc OpenAPI diff reviewed; no unintended breaking changes
- [ ] OWASP Dependency-Check / Snyk reviewed
- [ ] Gatling smoke load test green on staging
- [ ] All UAT scenarios passed (see TEST-SCRIPT)
- [ ] No P0/P1 bugs open
- [ ] Flyway migration rehearsed on staging snapshot
- [ ] Version bumped (git tag + `version.txt` if used)
- [ ] Image `bootBuildImage` produced + pushed + signed (cosign)
- [ ] Helm chart `Chart.yaml` `version` + `appVersion` bumped
- [ ] Feature flags created in console, default OFF
- [ ] Canary plan in ArgoCD Rollout spec
- [ ] Rollback path verified
- [ ] Dashboards bookmarked (Grafana / Tempo / Loki)
- [ ] Alert routes verified (PagerDuty / Opsgenie)
- [ ] On-call notified; status-page draft prepared

## 8. Deploy Steps

```bash
# 1. Tag
git tag -a v0.0.0 -m "release: v0.0.0"
git push origin v0.0.0

# 2. CI builds + pushes image
./gradlew clean build
./gradlew bootBuildImage --imageName=registry/<svc>:v0.0.0

# 3. Bump chart (PR to chart repo)
yq -i '.version = "0.0.0"' deploy/helm/<svc>/Chart.yaml
yq -i '.appVersion = "v0.0.0"' deploy/helm/<svc>/Chart.yaml
yq -i '.image.tag = "v0.0.0"' deploy/helm/<svc>/values-prod.yaml
git commit -am "chore(<svc>): release v0.0.0" && git push

# 4. ArgoCD syncs → Argo Rollouts canary begins
argocd app sync <svc>
argocd app wait <svc> --health
```

## 9. Post-deploy Verification

```bash
# Build info
kubectl exec -n <ns> deploy/<svc> -- curl -s localhost:8080/actuator/info | jq .build

# Health (each replica)
for pod in $(kubectl get po -n <ns> -l app=<svc> -o name); do
  kubectl exec -n <ns> $pod -- curl -s localhost:8080/actuator/health
done

# Flyway
kubectl exec -n <ns> deploy/<svc> -- curl -s localhost:8080/actuator/flyway | jq

# Prometheus queries
# Error rate
curl -s "$PROM/api/v1/query?query=sum(rate(http_server_requests_seconds_count{service=\"<svc>\",status=~\"5..\"}[5m]))/sum(rate(http_server_requests_seconds_count{service=\"<svc>\"}[5m]))"
# p95
curl -s "$PROM/api/v1/query?query=histogram_quantile(0.95,sum(rate(http_server_requests_seconds_bucket{service=\"<svc>\"}[5m]))by(le))"
# HikariCP pending
curl -s "$PROM/api/v1/query?query=hikaricp_connections_pending{service=\"<svc>\"}"
```

## 10. Rollback Plan

1. **Feature flag flip** (instant, Togglz/Unleash console)
2. **Helm rollback**:
   ```bash
   helm history <svc> -n <ns>
   helm rollback <svc> <REV> -n <ns>
   # or via ArgoCD UI / `argocd app rollback`
   ```
3. **Image pin** to previous tag in chart values + ArgoCD sync

**Schema rollback NOT needed**: Flyway migration `V42__add_orders.sql` is additive; previous code ignores new tables/columns.

## 11. Post-release Tasks

- [ ] Git tag `v0.0.0` pushed
- [ ] Image published to registry + signed
- [ ] Helm chart published to chart repo
- [ ] ArgoCD application healthy
- [ ] Canary 100% confirmed; analysis template clean
- [ ] CHANGELOG.md updated
- [ ] Confluence / docs portal release page updated
- [ ] Customer-facing comms posted (if applicable)
- [ ] Monitor window started (see `/monitor`)

## 12. Known Issues / Limitations

- Idempotency cleanup job not yet scheduled (epic `$NEXT_EPIC`)
- Feature flag remains in code until next release; remove after 100% confirmed stable

## 13. Contributors

> *(Generated from `git log v(prev)..v0.0.0 --pretty="%an"` | sort -u)*
