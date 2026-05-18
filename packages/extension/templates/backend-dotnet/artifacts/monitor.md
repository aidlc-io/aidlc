# Health Report — [Epic Title]

**Epic ID:** `$EPIC_ID`
**SRE:** SRE
**Period:** `$DATE` → `$DATE+7d`
**Service:** `<service-name>` (ASP.NET Core, .NET 8/9)
**Release:** `vX.Y.Z`
**Status:** Draft
**Created:** `$DATE`

---

## 1. Executive Summary

> *GO / PAUSE / HOTFIX / ROLLBACK in one paragraph with rationale.*

**Decision:** ⬜ Go (promote next canary step) &nbsp;&nbsp; ⬜ Pause &nbsp;&nbsp; ⬜ Hotfix required &nbsp;&nbsp; ⬜ Rollback

## 2. Golden Signals (RED)

| Metric | SLO threshold | Actual | Status | Source |
|--------|---------------|--------|--------|--------|
| Request rate (RPS) | (baseline) | — | ⬜ | Grafana / App Insights |
| 5xx error rate | < 1% | — | ⬜ | Grafana |
| 4xx error rate | (baseline) | — | ⬜ | Grafana |
| p50 latency | < 100 ms | — | ⬜ | Grafana |
| p95 latency | < 200 ms | — | ⬜ | Grafana |
| p99 latency | < 500 ms | — | ⬜ | Grafana |
| Availability (rolling 30d) | ≥ 99.9% | — | ⬜ | SLO dashboard |
| Error budget remaining | ≥ 50% | — | ⬜ | SLO dashboard |

## 3. Saturation (USE)

| Metric | Threshold | Actual | Status | Source |
|--------|-----------|--------|--------|--------|
| CPU utilization (pod p95) | < 70% | — | ⬜ | Prometheus / `kubectl top` |
| Memory utilization (pod p95) | < 75% | — | ⬜ | Prometheus / `kubectl top` |
| Npgsql pool Busy/Max | < 80% | — | ⬜ | metrics |
| Npgsql WaitTime p95 | < 50 ms | — | ⬜ | metrics |
| Thread pool queue length (sustained) | < 10 | — | ⬜ | `dotnet-counters` |
| GC Gen 2 collections / min | < 5 | — | ⬜ | `dotnet-counters` |
| Allocation rate (MB/s) | < 50 | — | ⬜ | `dotnet-counters` |
| Redis hit ratio | > 80% | — | ⬜ | Redis metrics |
| Redis evictions / min | < 100 | — | ⬜ | Redis metrics |

## 4. Per-Endpoint Detail

| Endpoint | RPS | 5xx % | p95 ms | p99 ms | Trend vs prev release |
|----------|-----|-------|--------|--------|----------------------|
| `POST /v1/orders` | — | — | — | — | +/- ms |
| `GET /v1/orders` | — | — | — | — | +/- ms |
| `GET /v1/orders/{id}` | — | — | — | — | +/- ms |
| `GET /healthz/ready` | — | — | — | — | — |

## 5. Top Exceptions (Sentry / App Insights)

| Rank | Exception | Endpoint | Count | First seen | Affected tenants | Severity |
|------|-----------|----------|-------|-----------|------------------|----------|
| 1    |           |          |       |           |                  | P_       |
| 2    |           |          |       |           |                  | P_       |

## 6. Migration Status

| Item | Value |
|------|-------|
| Migration job | `<svc>-migrate-vX.Y.Z` |
| Status | completed / failed / pending |
| Apply duration | — s |
| Logs | `kubectl logs job/<svc>-migrate-vX.Y.Z` |
| Schema verification | passes / fails |
| Coexist verified | yes / no (previous release pods still healthy) |

## 7. Canary / Rollout State

| Step | Weight | Status | Promoted at | Notes |
|------|--------|--------|-------------|-------|
| 1 | 5% | ⬜ in-progress / promoted / rolled-back | | |
| 2 | 25% | ⬜ | | |
| 3 | 50% | ⬜ | | |
| 4 | 100% | ⬜ | | |

## 8. Consumer Feedback

### Support tickets (last 7 days vs prior 7 days)

| Source | Volume | Top theme |
|--------|--------|-----------|
| Zendesk / Intercom | +/- | |
| #consumer-team Slack | +/- | |
| Partner email | +/- | |

### Adoption (analytics)

| Consumer | Calls to new endpoint | Adoption % | Notes |
|----------|----------------------|-----------|-------|
| Web SPA | — | — | |
| Mobile | — | — | |
| Partner X | — | — | |

## 9. Analytics Events

| Event | Expected change | Actual change | Status |
|-------|----------------|--------------|--------|
| `order.created.success` | +N/day | — | ⬜ |
| `order.created.failure` | < 0.5% of `created.success` | — | ⬜ |
| `idempotency.replay` | observable | — | ⬜ |

## 10. Incidents (during monitoring window)

| Incident | Severity | Duration | Root cause | Status |
|----------|----------|----------|-----------|--------|
|          | P_       | — min    |            | open / closed |

## 11. Recommendations

- [ ] {Action}
- [ ] {Action with epic key if new work needed}

## 12. Next Check-in

**Date:** *(date)*
**Trigger for escalation:**
- 5xx > 5% sustained 5 min
- p95 > 2× baseline sustained 5 min
- SLO burn rate > 14.4× (1h window)
- New exception type > 100 occurrences in 1h
- Migration partial state detected
