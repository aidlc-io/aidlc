# Test Execution Report — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Tester:** QA
**Environment:** UAT
**Service:** *(e.g. `user-svc`)*
**Build:** *(container tag, e.g. `ghcr.io/org/app:v1.4.3-rc1`)*
**Status:** Draft
**Created:** `$DATE`

---

## 1. Execution Summary

| Metric | Value |
|--------|-------|
| Total scenarios | 0 |
| Passed | 0 |
| Failed | 0 |
| Blocked | 0 |
| Skipped | 0 |
| Pass rate | —% |

## 2. Scenario Results

| ID | Title | Method | Path | Result | Notes |
|----|-------|--------|------|--------|-------|
| $EPIC_ID-AC01 | Create widget happy path | POST | /v1/widgets | ⬜ Pass / ⬜ Fail | |
| $EPIC_ID-AC02 | Validation failure | POST | /v1/widgets | ⬜ Pass / ⬜ Fail | |
| $EPIC_ID-AC03 | Missing JWT → 401 | POST | /v1/widgets | ⬜ Pass / ⬜ Fail | |
| $EPIC_ID-AC04 | Wrong scope → 403 | POST | /v1/widgets | ⬜ Pass / ⬜ Fail | |
| $EPIC_ID-AC05 | Tenant isolation → 404 | GET | /v1/widgets/{id} | ⬜ Pass / ⬜ Fail | |
| $EPIC_ID-AC06 | Idempotency replay | POST | /v1/widgets | ⬜ Pass / ⬜ Fail | |
| $EPIC_ID-AC07 | Pagination | GET | /v1/widgets | ⬜ Pass / ⬜ Fail | |

## 3. Load Test Results (vegeta / k6)

| Scenario | Threshold | Actual | Status |
|----------|-----------|--------|--------|
| Create p50 | < 80 ms | | ⬜ |
| Create p95 | < 200 ms | | ⬜ |
| Create p99 | < 500 ms | | ⬜ |
| Sustained RPS | 500 | | ⬜ |
| Error rate under load | < 0.1% | | ⬜ |

Command used:
```bash
echo "POST https://uat.api.example.com/v1/widgets
Authorization: Bearer $JWT
Content-Type: application/json
@create-widget.json" | vegeta attack -rate=500 -duration=60s -name=$EPIC_ID | tee result.bin | vegeta report -type=hist
```

## 4. Resource Health During Load Test

| Metric | Observed | Threshold | Status |
|--------|----------|-----------|--------|
| go_goroutines (peak) | | < 1000 | ⬜ |
| go_memstats_heap_alloc_bytes | | flat ± GC | ⬜ |
| go_gc_duration_seconds p99 | | < 50 ms | ⬜ |
| pgxpool_acquired_conns / max | | < 80% | ⬜ |
| pgxpool_acquire_wait_time p95 | | < 100 ms | ⬜ |
| process_open_fds / max | | < 80% | ⬜ |

## 5. Failure-Mode Scenarios

| Scenario | Result | Notes |
|----------|--------|-------|
| DB unavailable → 503 | ⬜ | |
| Upstream timeout → 504 / mapped | ⬜ | |
| Slow client → WriteTimeout closes conn | ⬜ | |
| SIGTERM mid-request → in-flight completes | ⬜ | |
| Rate limit 429 with `Retry-After` | ⬜ | |

## 6. Bugs Found

| Bug ID | Severity | Title | Scenario | Status |
|--------|----------|-------|----------|--------|
|        | P0/P1/P2/P3 | | | Open |

## 7. Regression Check

| Area | Tested | Status |
|------|--------|--------|
| `/healthz` 200 | ⬜ | |
| `/readyz` 200 (DB + Redis) | ⬜ | |
| Other endpoints in same service smoke-tested | ⬜ | |
| `go test -race ./...` on the build commit | ⬜ | |
| `golangci-lint` clean on the build commit | ⬜ | |
| `govulncheck` clean | ⬜ | |

## 8. Sign-off

- [ ] All P1 bugs resolved
- [ ] Pass rate ≥ threshold
- [ ] Load thresholds met
- [ ] Resource health within bounds
- [ ] Regression checks clear
- [ ] QA sign-off granted

**Sign-off by:** *(tester name)*
**Date:** *(date)*
