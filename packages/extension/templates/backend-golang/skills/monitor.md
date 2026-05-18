---
name: monitor
description: Post-release monitoring for a Go backend service. Reads slog + OTEL + Prometheus + Grafana + pprof signals; alerts on goroutine leaks, GC pressure, pgxpool saturation, panic loops.
argument-hint: "[version] (e.g., v1.2.0, or blank for latest)"
---

# Post-Release Monitor — Backend Go

You are the **SRE (Healer)** agent.
Load your persona from `.claude/agents/sre.md` before starting.

## Step 0: Gather Input

Most signal lives in external systems. Ask the user to paste screenshots, Grafana panel snapshots, or numbers. Wait for input.

```markdown
## Data Needed for Health Report

Paste screenshots or numbers from any of these — more sources = better report.

### 1. Grafana dashboards (required if possible)
   📍 LGTM stack (Loki + Grafana + Tempo + Mimir/Prometheus)
   - HTTP RED panel: rate, error rate %, latency p50/p95/p99 per endpoint
   - Go runtime panel: `go_goroutines`, `go_memstats_heap_alloc_bytes`,
     `go_gc_duration_seconds`
   - pgxpool panel: acquired / idle / waiting; acquire wait time p95
   - Process: `process_open_fds` / `process_max_fds`

### 2. Loki / log aggregator (required for error triage)
   - Top error signatures by `error` field (slog JSON)
   - Panic count (`panic:` substring) in the last hour
   - Distribution by level (DEBUG / INFO / WARN / ERROR)

### 3. Tempo / Jaeger / Datadog APM (recommended)
   - Top slow spans (>p95)
   - Spans with errors
   - DB query latency (otelpgx spans)

### 4. Prometheus alerts (if any fired)
   - List active alerts
   - Burn rate of error-budget if SLOs defined

### 5. pprof (only if leak / GC pressure suspected)
   - `curl -s :8081/debug/pprof/goroutine?debug=2 | head -200`
   - `curl -s :8081/debug/pprof/heap > heap.out`
   - `curl -s :8081/debug/pprof/profile?seconds=30 > cpu.out`

### 6. User signal (optional)
   - Partner / consumer tickets
   - Internal Slack #incidents
```

If the user provides no data, remind them of the sources and stop — no speculation from zero data.

## Step 1: Read Reference Docs

1. `docs/operations/slos.md` — SLO thresholds
2. `docs/operations/dashboards.md` — Grafana panel URLs
3. `docs/operations/runbooks/` — alert → mitigation playbooks
4. Recent deploy history (git tags + Argo rollout history) — correlate to changes

## Step 2: Check Local State

```bash
# Release tags
git tag --sort=-version:refname | head -5

# Recent commits
git log --oneline -10

# Release notes presence
ls docs/sdlc/releases/ 2>/dev/null

# Container in registry
crane manifest ghcr.io/org/app:v$ARGUMENTS 2>/dev/null
```

## Step 3: Generate Health Report

```markdown
## Health Report — v{version} — {date}

### Data Sources
| Source | Provided | Notes |
|--------|----------|-------|
| Grafana HTTP RED | yes/no | |
| Grafana Go runtime | yes/no | |
| Grafana pgxpool | yes/no | |
| Loki errors | yes/no | |
| Tempo traces | yes/no | |
| pprof | yes/no | |

### Key Indicators
| Metric | Status | Value | Threshold | Source |
|--------|--------|-------|-----------|--------|
| Request rate (RPS) | ok/warn/crit | | baseline | Prometheus |
| Error rate (5xx %) | ok/warn/crit | | < 1% | Prometheus |
| Latency p50 | ok/warn/crit | ms | < SLO | Prometheus |
| Latency p95 | ok/warn/crit | ms | < SLO | Prometheus |
| Latency p99 | ok/warn/crit | ms | < SLO × 2 | Prometheus |
| go_goroutines | ok/warn/crit | | growth < 20%/h | Prometheus |
| heap_alloc_bytes | ok/warn/crit | | flat ± GC | Prometheus |
| gc_duration_p99 | ok/warn/crit | ms | < 50 ms | Prometheus |
| pgxpool acquired | ok/warn/crit | / max | < 80% | Prometheus |
| pgxpool wait p95 | ok/warn/crit | ms | < 100 ms | Prometheus |
| process_open_fds | ok/warn/crit | / max | < 80% | Prometheus |

Mark **N/A** where data wasn't provided.

### Useful Prom queries (paste into Grafana)
- `sum(rate(http_server_requests_total[5m])) by (route)`
- `sum(rate(http_server_requests_total{code=~"5.."}[5m])) by (route) / sum(rate(http_server_requests_total[5m])) by (route)`
- `histogram_quantile(0.95, sum(rate(http_server_duration_seconds_bucket[5m])) by (le, route))`
- `go_goroutines`
- `rate(go_gc_duration_seconds_sum[5m])`
- `pgxpool_acquired_conns / pgxpool_max_conns`

### Local State
| Item | Value |
|------|-------|
| Version | v$ARGUMENTS |
| Container tag | ghcr.io/org/app:v$ARGUMENTS |
| Branch | <branch> |
| Git tag | v$ARGUMENTS or "not tagged" |
| Release checklist | exists / missing |
| Deploy time | <when> |
| Migration applied | goose 0042 / verified ok |

### Top Issues
1. [Issue] — P{X} — affected: {N requests / users / tenants} — first seen: {ts}
2. ...

### Trend vs. Previous Release
- Error rate: +X% / -X%
- p95: +X ms / -X ms
- Goroutine count: +X / -X
- pgxpool wait p95: +X ms / -X ms

### Recommendations
- [ ] {Action with epic key if new work needed}

### Decision
- [ ] Continue rollout
- [ ] Pause rollout — reason: ___
- [ ] Roll back — reason: ___
- [ ] Hotfix — open epic `{{EPIC_PREFIX}}-XXXX`
```

## If P0 signal found

- Reference `docs/sdlc/templates/ROLLBACK-PLAYBOOK.md`
- Levers in order of speed:
  1. **Feature flag flip** (OpenFeature) — seconds
  2. **Argo rollout undo** — single command, < 1 min
  3. **Container tag pin to previous** — Helm/Kustomize change + apply, ~ 2 min
  4. **`goose down`** — ONLY if migration is reversible AND no new data depends on the new shape
- Assign Incident Commander; open incident channel; capture timeline in UTC

## If P1 signal found (Go-specific patterns)

### Goroutine leak (growth > 20% per hour)
1. Capture `pprof/goroutine?debug=2`
2. Identify spawn site (file:line in trace)
3. Hotfix: add `<-ctx.Done()` exit, or close channel, or use `errgroup`
4. Suggest hotfix epic `{{EPIC_PREFIX}}-XXXX`

### pgxpool exhaustion (`acquired ≥ max`, `wait > 100ms p95`)
1. Check Postgres `pg_stat_activity` for long-running queries
2. Common culprits: missing `defer tx.Rollback()`, hot lock, missing index
3. Mitigation: bump `max_conns` via env + rolling restart (temporary)
4. Hotfix: optimize query / add index / fix tx lifecycle

### GC pressure (p99 `gc_duration` > 50ms, latency cliff)
1. Capture `pprof/heap`
2. Identify high-alloc paths (`go tool pprof -top heap.out`)
3. Common culprits: per-request `bytes.Buffer` not pooled; huge JSON encoding
4. Mitigation: `sync.Pool` for buffers; stream large payloads; tune GOGC

### Panic loop
1. Confirm `middleware.Recoverer` is wired
2. Identify panic source from log stack
3. Mitigation: flag-off the new feature; hotfix root cause

## If crash / stack trace provided

- Map stack trace to source file:line
- `git blame` on affected lines
- Correlate to deploy: which commit/release introduced the change?
- Estimate severity; propose fix approach; open hotfix epic if warranted
