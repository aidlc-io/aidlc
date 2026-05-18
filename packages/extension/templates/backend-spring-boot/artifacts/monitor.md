# Health Report — [Epic Title]

**Epic ID:** `$EPIC_ID`
**SRE:** SRE
**Period:** `$DATE` → `$DATE+7d`
**Status:** Draft
**Created:** `$DATE`
**Service:** `<service-name>` `vX.Y.Z`

---

## 1. Executive Summary

> *Go / Hotfix / Rollback recommendation in one paragraph citing golden signals + JVM + HikariCP.*

**Decision:** ⬜ Go &nbsp;&nbsp; ⬜ Pause rollout &nbsp;&nbsp; ⬜ Hotfix &nbsp;&nbsp; ⬜ Rollback

## 2. Key Health Indicators

| KHI | Threshold | Actual | Status | Source |
|-----|-----------|--------|--------|--------|
| Error rate (5xx) | < 0.5% | — | ⬜ | `http_server_requests_seconds_count{status=~"5.."}` |
| p95 latency | < 250 ms | — | ⬜ | `http_server_requests_seconds_bucket` |
| p99 latency | < 500 ms | — | ⬜ | same |
| RPS | within ±20% of baseline | — | ⬜ | `http_server_requests_seconds_count` |
| HikariCP active | < 80% of pool | — | ⬜ | `hikaricp_connections_active` |
| HikariCP pending | == 0 sustained | — | ⬜ | `hikaricp_connections_pending` |
| JVM heap usage | < 80% max | — | ⬜ | `jvm_memory_used_bytes{area="heap"}` |
| GC pause avg | < 100 ms | — | ⬜ | `jvm_gc_pause_seconds` |
| Thread count | within baseline | — | ⬜ | `jvm_threads_live_threads` |
| Circuit breakers OPEN | 0 | — | ⬜ | `resilience4j_circuitbreaker_state{state="OPEN"}` |
| Kafka consumer lag (if applicable) | < 1000 | — | ⬜ | `kafka_consumer_records_lag_max` |
| DLQ depth (if applicable) | 0 sustained | — | ⬜ | DLQ topic depth |

Dashboard: `<grafana URL>`

## 3. Error / Exception Analysis

### Top 5xx by endpoint

| Endpoint | Error count | Top exception | Sample traceId |
|----------|-------------|---------------|----------------|
| | | | |

### Top exception signatures (Loki)

| Count | Exception | Sample log | Sample traceId |
|-------|-----------|------------|----------------|
| | `LazyInitializationException at ...` | | |
| | `CannotAcquireLockException ...` | | |

### Resilience4j

| Outbound | Calls (succ/fail) | State changes | Time in OPEN |
|----------|-------------------|---------------|--------------|
| paymentService | / | | |

## 4. Performance

| Metric | Baseline (v(prev)) | This release | Delta |
|--------|-------------------|--------------|-------|
| p95 (POST /orders) | — ms | — ms | — |
| p95 (GET /orders/{id}) | — ms | — ms | — |
| Cold start | — s | — s | — |
| JVM heap (p90) | — MB | — MB | — |
| HikariCP active (p90) | — | — | — |

## 5. JVM / Container

| Metric | Value | Notes |
|--------|-------|-------|
| Heap (used / max) | — / — | |
| Non-heap | — | |
| GC algorithm | G1 / ZGC | |
| Avg GC pause | — ms | |
| Max GC pause | — ms | |
| Threads | — live (— peak) | |
| File descriptors | — / — max | |
| Container memory | — / — limit | Watch for OOMKilled |

## 6. Database / Persistence

| Metric | Value | Notes |
|--------|-------|-------|
| HikariCP `connections_active` (avg / max) | — / — | |
| HikariCP `connections_pending` | — | Should be 0 |
| HikariCP `connections_timeout_total` (delta) | — | |
| Slow query log entries (last 24h) | — | |
| Flyway state | UP-TO-DATE / pending | `actuator/flyway` |

## 7. Kafka (if applicable)

| Topic | Consumer lag (max) | Rebalance count (24h) | DLQ growth |
|-------|---------------------|------------------------|------------|
| | | | |

## 8. User Feedback / Partner Signal

### Support tickets

| Ticket | Description | Priority | Status |
|--------|-------------|----------|--------|
| | | | |

### Partner integration reports

| Partner | Status | Notes |
|---------|--------|-------|
| | | |

## 9. Analytics Events

| Event | Expected change | Actual | Status |
|-------|-----------------|--------|--------|
| `order.created` event count | +X% (rollout) | | ⬜ |

## 10. Incidents

| Incident | Severity | Duration | Root cause | Status |
|----------|----------|----------|-----------|--------|
| | | | | |

## 11. Top Slow Traces (Tempo / APM)

| traceId | Endpoint | Duration | Bottleneck span |
|---------|----------|----------|-----------------|
| | | | |

## 12. Recommendations

- [ ] {Action} — owner — date

## 13. Next Check-in

**Date:** *(date)*
**Trigger for escalation:** error rate > 1% over 5 min OR p95 > 500ms OR HikariCP pending > 0 sustained 1 min OR any P0 signal
