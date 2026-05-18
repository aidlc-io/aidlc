---
name: monitor
description: Post-release monitoring check for a Spring Boot 3 service. Pulls golden signals from Actuator + Micrometer + Prometheus + Tempo + Grafana; checks JVM, HikariCP, Kafka lag; produces health report with GO / PAUSE / HOTFIX / ROLLBACK recommendation.
argument-hint: "[version] (e.g., v1.2.0, or blank for latest)"
---

# Post-Release Monitor — Spring Boot Service

You are the **SRE (Healer)** for a Spring Boot 3 service.
Load your persona from `.claude/agents/sre.md` before starting.

## Step 0: Gather Input

Ask the user to paste / link any of:

```markdown
## Data Needed for Health Report

### 1. Prometheus / Grafana (required if possible)
   - Service Grafana dashboard URL (filtered to `service=<svc>`, `version=v$0`)
   - Or query results:
     - Error rate: `sum(rate(http_server_requests_seconds_count{service="<svc>",status=~"5.."}[5m])) / sum(rate(http_server_requests_seconds_count{service="<svc>"}[5m]))`
     - p95 latency: `histogram_quantile(0.95, sum(rate(http_server_requests_seconds_bucket{service="<svc>"}[5m])) by (le))`
     - RPS: `sum(rate(http_server_requests_seconds_count{service="<svc>"}[1m]))`
     - HikariCP active / pending: `hikaricp_connections_active{service="<svc>"}`, `hikaricp_connections_pending{service="<svc>"}`
     - JVM heap: `jvm_memory_used_bytes{service="<svc>",area="heap"}`
     - GC pause: `rate(jvm_gc_pause_seconds_sum{service="<svc>"}[5m])`
     - Thread count: `jvm_threads_live_threads{service="<svc>"}`

### 2. Tempo / Jaeger / Zipkin / Datadog APM (recommended)
   - Top slow trace samples (p95+)
   - Errored traces with full span tree

### 3. Loki / Datadog Logs / ELK
   - `{service="<svc>", level="ERROR"} | json` last 1h
   - Top 5 error signatures + counts

### 4. Resilience4j metrics
   - Circuit breaker state per outbound: `resilience4j_circuitbreaker_state{name="X"}`
   - Failed calls: `resilience4j_circuitbreaker_calls{name="X",kind="failed"}`

### 5. Kafka (if applicable)
   - Consumer lag per topic: `kafka_consumer_records_lag_max`
   - DLQ growth rate

### 6. Actuator endpoints (from inside cluster)
   - `/actuator/health` — all subsystems UP?
   - `/actuator/info` — version + git commit matches deployment?
   - `/actuator/flyway` — expected migrations applied?

### 7. User signal (optional)
   - Support ticket volume + top themes
   - Partner integration test status
```

If no data → remind which sources to check, STOP. No speculation from zero data.

## Step 1: Read Reference Docs

1. `docs/sdlc/MONITORING-GUIDE.md` (or `docs/runbooks/<svc>.md`) — SLOs, alert thresholds
2. `docs/operations.md`
3. Recent release notes (`docs/sdlc/releases/v$0.md` if version specified)
4. ADRs that affect the affected area

## Step 2: Check Local State

```bash
git tag --sort=-version:refname | head -5
git log --oneline -10
ls docs/sdlc/releases/ 2>/dev/null
```

## Step 3: Generate Health Report

```markdown
## Health Report — v{version} — {date}

### Data Sources
| Source | Provided | Notes |
|--------|----------|-------|
| Prometheus / Grafana | yes/no | {dashboard link} |
| Tempo / APM | yes/no | |
| Loki / Logs | yes/no | |
| Resilience4j metrics | yes/no | |
| Kafka lag | yes/no | |
| Actuator | yes/no | |
| User signal | yes/no | |

### Key Indicators (Golden Signals + JVM + HikariCP)
| Metric | Status | Value | Threshold | Source |
|--------|--------|-------|-----------|--------|
| Error rate | ok/warn/crit | X.XX% | < 0.5% | Prometheus `http_server_requests` |
| p95 latency | ok/warn/crit | XXX ms | < 250ms | Prometheus `http_server_requests_seconds` |
| p99 latency | ok/warn/crit | XXX ms | < 500ms | Prometheus |
| RPS | ok | XXX | expected ~XXX | Prometheus |
| HikariCP active | ok/warn/crit | XX / max | < 80% of pool | `hikaricp_connections_active` |
| HikariCP pending | ok/warn/crit | X | == 0 | `hikaricp_connections_pending` |
| JVM heap (used / max) | ok/warn/crit | X / Y GB | < 80% | `jvm_memory_used_bytes` |
| GC pause (avg) | ok/warn/crit | XX ms | < 100ms | `jvm_gc_pause_seconds` |
| Threads live | ok/warn/crit | X | < expected ceiling | `jvm_threads_live_threads` |
| Circuit breakers OPEN | ok/warn/crit | X | == 0 sustained | `resilience4j_circuitbreaker_state` |
| Kafka consumer lag (if applicable) | ok/warn/crit | X | < 1000 | `kafka_consumer_records_lag_max` |
| DLQ growth (if applicable) | ok | X / min | == 0 | DLQ topic depth |

Mark **N/A** where data not provided — never fabricate.

### Local State
| Item | Value |
|------|-------|
| Version | vX.Y.Z |
| Image tag | `registry/<svc>:vX.Y.Z` |
| Git commit | <sha> |
| Helm revision | N |
| Branch | <branch> |
| Release checklist | exists / missing |
| Deploy time | <when> |
| Flyway migrations applied (since v(prev)) | V41, V42 |

### Top Issues
1. [Issue] — P{X} — {affected %} — {endpoint/trace_id}
2. ...

### Trend vs. Previous Release
- Error rate: +X.XX% / -X.XX%
- p95 latency: +X ms / -X ms
- Pool saturation: +X% / -X%
- Heap usage: +X MB / -X MB

### Top Slow Traces (from APM)
| Trace ID | Endpoint | Duration | Bottleneck span |
|----------|----------|----------|-----------------|
| | | | |

### Top Error Signatures (from logs)
| Count | Signature | Sample trace_id |
|-------|-----------|-----------------|
| X | `LazyInitializationException at ...` | <id> |

### Recommendations
- [ ] {Action with epic key if new work needed}

### Decision
- [ ] Continue rollout / leave at 100%
- [ ] Pause rollout — reason: ___
- [ ] Roll back — reason: ___ (Helm revision rollback)
- [ ] Hotfix — open epic `{{EPIC_PREFIX}}-XXXX`
```

## If P0 Signal Found
- Reference `docs/sdlc/templates/ROLLBACK-PLAYBOOK.md`
- Feature-flag flip first lever; Helm rollback second; image pin third
- If DB-related: pause writes via flag if possible, then mitigate; rarely safe to roll back schema
- Assign Incident Commander, open incident channel, capture timeline

## If P1+ Signal Found
- Suggest hotfix epic
- Severity per the runbook matrix

## If Stack Trace / Trace Provided
- Map exception → source via line number (`OrderService.java:88`)
- `git log -L` / `git blame` for recent changes in that file
- Check Resilience4j metrics: is the circuit-breaker opening? is retry exhausting?
- Check HikariCP at the time of the incident — pool starved?
- Propose fix approach; open hotfix epic if severity warrants

## Common Spring Boot Failure Diagnoses

| Observation | Likely cause | First check |
|-------------|--------------|-------------|
| `Connection is not available, request timed out` | HikariCP exhausted | Long `@Transactional`, leaked connection, undersized pool |
| `LazyInitializationException` | `open-in-view=false` + missing fetch | Add `@EntityGraph` or `JOIN FETCH` |
| `JpaSystemException: could not extract ResultSet` | DB connection dropped mid-query | Check DB CPU / connection limits |
| `org.springframework.dao.CannotAcquireLockException` | Row contention / deadlock | Reduce transaction scope, add retry on this exception |
| OOMKilled in K8s | Heap > container limit OR Netty direct buffers | Heap dump (`kill -3` or jcmd); check `-XX:MaxRAMPercentage` |
| Slow startup + GC churn | Eager Hibernate init + large entity graph | Reduce `@Cacheable` warm-up; lazy init beans |
| Kafka rebalance every N min | Consumer slow → session timeout | Tune `max.poll.records`, `max.poll.interval.ms` |
| Resilience4j circuit OPEN constantly | Downstream actually down OR threshold too tight | Check downstream; consider adjusting `failure-rate-threshold` |
