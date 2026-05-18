# Health Report — [Epic Title]

**Epic ID:** `$EPIC_ID`
**SRE:** SRE
**Period:** `$DATE` → `$DATE+7d`
**Service:** *(e.g. `user-svc`)*
**Build:** *(container tag, e.g. `ghcr.io/org/app:v1.4.3`)*
**Status:** Draft
**Created:** `$DATE`

---

## 1. Executive Summary

> *Go / Hotfix / Rollback recommendation in one paragraph.*

**Decision:** ⬜ Go &nbsp;&nbsp; ⬜ Hotfix required &nbsp;&nbsp; ⬜ Rollback

## 2. Key Health Indicators (KHI)

| KHI | Threshold | Actual | Status |
|-----|-----------|--------|--------|
| Request rate (RPS) | baseline ± 30% | — | ⬜ |
| Error rate (5xx %) | < 1% | — | ⬜ |
| Latency p50 | < 80 ms | — | ⬜ |
| Latency p95 | < 200 ms | — | ⬜ |
| Latency p99 | < 500 ms | — | ⬜ |
| `go_goroutines` | flat (growth < 20%/h) | — | ⬜ |
| `go_memstats_heap_alloc_bytes` | flat ± GC | — | ⬜ |
| `go_gc_duration_seconds` p99 | < 50 ms | — | ⬜ |
| `pgxpool_acquired_conns / max` | < 80% | — | ⬜ |
| `pgxpool_acquire_wait_time` p95 | < 100 ms | — | ⬜ |
| `process_open_fds / max` | < 80% | — | ⬜ |

## 3. Grafana Panel Queries (Prometheus)

| Panel | Query |
|-------|-------|
| RPS by route | `sum(rate(http_server_requests_total[5m])) by (route)` |
| Error rate by route | `sum(rate(http_server_requests_total{code=~"5.."}[5m])) by (route) / sum(rate(http_server_requests_total[5m])) by (route)` |
| p95 latency by route | `histogram_quantile(0.95, sum(rate(http_server_duration_seconds_bucket[5m])) by (le, route))` |
| Goroutines | `go_goroutines` |
| Heap | `go_memstats_heap_alloc_bytes` |
| GC pause p99 | `histogram_quantile(0.99, rate(go_gc_duration_seconds_bucket[5m]))` |
| pgxpool acquired | `pgxpool_acquired_conns / pgxpool_max_conns` |
| pgxpool wait p95 | `histogram_quantile(0.95, rate(pgxpool_acquire_wait_time_seconds_bucket[5m]))` |
| Open FDs | `process_open_fds / process_max_fds` |

## 4. Error & Crash Analysis

### Top error signatures (Loki / slog `error` field)

| Rank | Error | Count (24h) | First seen | New since release? |
|------|-------|-------------|------------|-------------------|
| 1    |       |             |            | ⬜ |
| 2    |       |             |            | ⬜ |

LogQL example:
```
sum by (error) (count_over_time({app="user-svc"} | json | error != "" [1h]))
```

### Panic count

| Window | Count |
|--------|-------|
| Last 1h | 0 |
| Last 24h | 0 |

LogQL:
```
count_over_time({app="user-svc"} |~ "panic:" [1h])
```

### 5xx by endpoint

| Endpoint | Error count (24h) | Root cause |
|----------|-------------------|-----------|
|          |                   |            |

## 5. Trace Analysis (Tempo / Jaeger)

| Span | p95 | p99 | Status |
|------|-----|-----|--------|
| `widget.handler.create` | | | ⬜ |
| `widget.service.create` | | | ⬜ |
| `widget.repo.create` (otelpgx) | | | ⬜ |

Top slow spans (>p95): …

## 6. Resource Forensics (if leak / pressure suspected)

### pprof captured?

- [ ] `goroutine?debug=2` — top blocking stacks: …
- [ ] `heap` — top alloc sites: …
- [ ] `profile?seconds=30` (CPU) — top hot funcs: …

## 7. User / Consumer Feedback

| Source | Volume | Top themes |
|--------|--------|-----------|
| Support tickets |  |  |
| Partner reports |  |  |
| Internal Slack |  |  |

## 8. Analytics / Adoption Events

| Event | Expected | Actual | Status |
|-------|----------|--------|--------|
| widget_created_total | ≥ X / day | | ⬜ |

## 9. Incidents

| Incident | Severity | Duration | Root cause | Mitigation | Status |
|----------|----------|----------|-----------|-----------|--------|
|          |          |          |            |           |        |

## 10. Trend vs Previous Release

- Error rate: +X% / -X%
- p95: +X ms / -X ms
- Goroutine count steady-state: +X / -X
- pgxpool wait p95: +X ms / -X ms

## 11. Recommendations

- [ ] {Action with epic key if new work needed}

## 12. Decision

- [ ] Continue rollout (advance Argo canary)
- [ ] Pause rollout — reason: ___
- [ ] Roll back — reason: ___
- [ ] Hotfix — open epic `{{EPIC_PREFIX}}-XXXX`

## 13. Next Check-in

**Date:** *(date)*
**Trigger for escalation:** error rate > 1% sustained 15 min / p95 > SLO / goroutine growth > 20%/h
