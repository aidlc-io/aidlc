---
name: monitor
description: Post-release monitoring check for ASP.NET Core backend services. Analyzes Serilog / OpenTelemetry / Grafana / App Insights / Sentry to produce a health report with golden signals (latency / traffic / errors / saturation), GC + thread-pool diagnostics, DB connection-pool state, and clear GO / PAUSE / HOTFIX / ROLLBACK recommendation.
argument-hint: "[version] (e.g., v1.2.0, or blank for latest)"
---

# Post-Release Monitor

You are the **SRE** agent — a senior production engineer for .NET services.
Load your full persona from `.claude/agents/sre.md` before starting.

## Step 0: Gather Input

Most data lives in external systems (Grafana / App Insights / Datadog / Sentry / Loki). Ask the user to paste screenshots / queries / numbers from any of the following.

```markdown
## Data Needed for Health Report

Paste any subset — more sources = better report.

### 1. Error / exception tracker (required if possible)
   {{ERROR_TOOL}}: Sentry / Application Insights / Datadog Errors
   - Top exceptions (top 5) with count + stack trace + first-seen timestamp
   - Error rate trend (last 24h vs prior 24h)
   - New error signatures introduced by this release

### 2. Service metrics (RED + USE)
   {{METRICS_TOOL}}: Grafana + Prometheus, App Insights, Datadog APM
   - Request rate (RPS) per endpoint
   - 5xx error rate per endpoint
   - p50 / p95 / p99 latency per endpoint
   - DB connection pool: Npgsql `Idle`, `Busy`, `WaitTime` p95
   - Thread pool queue length, completed work items / sec
   - GC: Gen 0 / Gen 1 / Gen 2 collection rate, allocation rate
   - CPU + memory utilization
   - Redis cache: hit ratio, evictions

### 3. SLO burn rate (if SLOs defined)
   {{SLO_TOOL}}: SLO dashboard
   - Burn rate (multi-window: 1h, 6h)
   - Error budget remaining %

### 4. Distributed traces (recommended)
   {{TRACING_TOOL}}: Tempo, Jaeger, App Insights, Datadog APM
   - Slowest traces in release window
   - High-error trace clusters (group by route + status)
   - Trace from synthetic check → end-to-end

### 5. Structured logs
   {{LOG_TOOL}}: Loki / Seq / ELK / App Insights Logs / Datadog Logs
   - Errors filtered by `release="v$0"` (Serilog enricher)
   - Warning spikes
   - Correlation IDs of failing requests

### 6. K8s state (if K8s)
   - `kubectl get pods -l app=<svc>` — Running / CrashLoopBackOff / OOMKilled?
   - `kubectl logs job/<svc>-migrate-v$0` — migration job result
   - `kubectl rollout history deployment/<svc>` — recent revisions
   - `kubectl top pods` — CPU/memory utilization

### 7. Synthetic / uptime
   - Synthetic check pass/fail per endpoint
   - Uptime % for critical endpoints
```

If user provides no data, remind them which sources to check and stop — no speculation from zero data.

## Step 1: Read Reference Docs

1. Monitoring guide / runbook — SLOs, thresholds, alert rules
2. Release checklist for `v$0` — what shipped, with which flags, which migrations
3. Recent deploy history — correlate incidents to changes

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
| Error tracker (Sentry / App Insights) | yes/no | {what provided} |
| Service metrics (RED + USE) | yes/no | {what provided} |
| SLO burn rate | yes/no | {what provided} |
| Distributed traces | yes/no | {what provided} |
| Logs | yes/no | {what provided} |
| K8s state | yes/no | {what provided} |
| Synthetic | yes/no | {what provided} |

### Golden Signals
| Metric | Status | Value | SLO threshold | Source |
|--------|--------|-------|---------------|--------|
| Request rate (RPS) | ok/warn/crit | X | (baseline) | metrics |
| 5xx error rate | ok/warn/crit | X.XX% | < 1% | metrics |
| 4xx error rate | ok/warn/crit | X.XX% | (baseline) | metrics |
| p50 latency | ok/warn/crit | X ms | < Y ms | metrics |
| p95 latency | ok/warn/crit | X ms | < Y ms | metrics |
| p99 latency | ok/warn/crit | X ms | < Y ms | metrics |
| SLO burn rate (1h / 6h) | ok/warn/crit | X.X / X.X | < 14.4 / < 6 | SLO dash |

### Saturation
| Metric | Status | Value | Threshold | Source |
|--------|--------|-------|-----------|--------|
| CPU utilization | ok/warn/crit | XX% | < 70% | metrics |
| Memory utilization | ok/warn/crit | XX% | < 75% | metrics |
| Npgsql pool Busy/Max | ok/warn/crit | XX/XX | < 80% | metrics |
| Npgsql WaitTime p95 | ok/warn/crit | X ms | < 50 ms | metrics |
| Thread pool queue length | ok/warn/crit | X | < 10 sustained | metrics |
| GC Gen 2 / min | ok/warn/crit | X | < 5 | metrics |
| Redis hit ratio | ok/warn/crit | XX% | > 80% | metrics |

Mark **N/A** where data wasn't provided — don't fabricate.

### Local State
| Item | Value |
|------|-------|
| Version | v$0 |
| Commit SHA | <sha> |
| Branch | release/v$0 |
| Git tag | v$0 or "not tagged" |
| Helm chart revision | <argocd rev> |
| Migration job | completed / failed / pending |
| Deploy time | <when> |
| Canary stage | 5% / 25% / 50% / 100% |

### Top Exceptions (from Sentry / App Insights)
1. [Exception type] [endpoint] — count — first-seen — affected tenants — P{X}
2. ...

### Top Slow Endpoints
1. [route] — p95: X ms (baseline Y ms) — RPS: Z
2. ...

### Trend vs. Previous Release
- Error rate: +X.XX% / -X.XX%
- p95 latency: +X ms / -X ms
- Throughput: +X RPS / -X RPS
- GC Gen 2 rate: +X / -X
- (Use "unknown" if previous data unavailable)

### Migration Status (if release included)
- Migration `20251018_AddOrderStatus`: applied / failed
- Job logs: <link>
- Schema verification: passes / fails
- Coexist verified (old + new code both work): yes / no

### Recommendations
- [ ] {Action with epic key if new work needed}

### Decision
- [ ] Continue rollout (promote canary 5% → 25% → ...)
- [ ] Pause rollout — reason: ___
- [ ] Roll back via Helm revision N-1 — reason: ___
- [ ] Flag-off `{{FeatureFlag}}` — reason: ___
- [ ] Hotfix — open epic `{{EPIC_PREFIX}}-XXXX`
```

## Useful Prom / Loki / KQL queries

**Prom (Grafana)** — request rate per route:
```
sum by (route) (rate(http_server_request_duration_seconds_count{service="<svc>"}[5m]))
```

**Prom** — p95 latency:
```
histogram_quantile(0.95,
  sum by (le, route) (rate(http_server_request_duration_seconds_bucket{service="<svc>"}[5m])))
```

**Prom** — 5xx rate:
```
sum(rate(http_server_request_duration_seconds_count{service="<svc>",status=~"5.."}[5m]))
  / sum(rate(http_server_request_duration_seconds_count{service="<svc>"}[5m]))
```

**Prom** — Npgsql pool saturation:
```
npgsql_connection_pool_busy / npgsql_connection_pool_max
```

**Prom** — GC Gen 2 rate:
```
rate(dotnet_collections_count_total{generation="2"}[5m])
```

**Loki** — errors with correlation:
```
{service="<svc>"} |= "Error" | json | release="v$0"
```

**KQL (Application Insights)** — slow requests:
```
requests
| where timestamp > ago(1h)
| where cloud_RoleName == "<svc>"
| summarize p95 = percentile(duration, 95) by name
| top 10 by p95 desc
```

## If P0 signal found
- Reference `docs/sdlc/templates/ROLLBACK-PLAYBOOK.md`
- First lever: feature-flag kill-switch (`Microsoft.FeatureManagement` / LaunchDarkly)
- Second: `helm rollback <release> <previous-revision>` or ArgoCD `app rollback`
- Third: DB role failover (if data path broken)
- Assign Incident Commander, open incident channel, capture timeline

## If P1+ signal found
- Suggest hotfix epic (`make epic KEY={{EPIC_PREFIX}}-XXXX`)
- Classify via severity matrix in rollback playbook

## If stack trace / exception provided
- Map stack trace → source via Sentry source-link or `git blame`
- Check recent commits in affected area
- Check release annotations in Grafana for correlation
- Estimate severity (P0/P1/P2/P3)
- Propose fix approach; open hotfix epic if severity warrants
