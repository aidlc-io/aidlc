# Test Execution Report — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Tester:** QA
**Environment:** UAT (`https://staging.example.com`)
**Build:** `vX.Y.Z` (verify via `GET /actuator/info`)
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

## 2. Build Verification

```bash
curl -s https://staging.example.com/actuator/info | jq
```

| Field | Expected | Actual |
|-------|----------|--------|
| `build.version` | `vX.Y.Z` | |
| `git.commit.id.abbrev` | `<sha>` | |
| `git.branch` | `release/vX.Y.Z` | |

## 3. Scenario Results

| TC | Title | AC | Result | Notes |
|----|-------|----|--------|-------|
| $EPIC_ID-AC01 | Place order — happy path | AC-01 | ⬜ Pass / ⬜ Fail | |
| $EPIC_ID-AC02 | Validation failure — missing field | AC-02 | ⬜ Pass / ⬜ Fail | |
| $EPIC_ID-AC03 | Idempotency replay | AC-03 | ⬜ Pass / ⬜ Fail | |
| $EPIC_ID-AC04 | Missing scope → 403 | AC-04 | ⬜ Pass / ⬜ Fail | |
| $EPIC_ID-AC05 | Event published on Kafka | AC-05 | ⬜ Pass / ⬜ Fail | Verify in topic browser |
| $EPIC_ID-AC06 | GET existing → 200 | AC-06 | ⬜ Pass / ⬜ Fail | |
| $EPIC_ID-AC07 | GET missing → 404 | AC-07 | ⬜ Pass / ⬜ Fail | |
| $EPIC_ID-EC01 | Downstream payment timeout — graceful | edge | ⬜ Pass / ⬜ Fail | Toggle flag `payment.simulate-failure` |
| $EPIC_ID-EC02 | Rate limit → 429 | edge | ⬜ Pass / ⬜ Fail | Run 100 POSTs in 1s |

## 4. Bugs Found

| Bug ID | Severity | Title | TC | Status |
|--------|----------|-------|-----|--------|
| | P1/P2/P3 | | | Open |

## 5. Regression Check

| Area | Tested | Status |
|------|--------|--------|
| Legacy `/api/v0/orders` GET still works | ⬜ | |
| `/actuator/health` returns UP across subsystems | ⬜ | |
| Kafka consumer lag near zero (existing topics) | ⬜ | |
| Flyway `flyway info` shows expected migrations | ⬜ | |
| OpenAPI Swagger UI loads at `/swagger-ui/index.html` | ⬜ | |

## 6. Observability Verification

| Check | Result |
|-------|--------|
| Grafana dashboard `Spring Boot Service` shows `service=<svc>, version=vX.Y.Z` data | ⬜ |
| Error rate < 0.5% during test window | ⬜ |
| p95 latency < 250 ms during test window | ⬜ |
| HikariCP `connections_pending == 0` | ⬜ |
| Custom metric `app_orders_placed_total` incrementing | ⬜ |
| Trace from a 201 response visible in Tempo with correct span tree | ⬜ |
| Loki log line for the test request contains `traceId` matching trace | ⬜ |

## 7. Performance Results

| Scenario | Threshold | Actual | Status |
|----------|-----------|--------|--------|
| POST /orders p95 | < 250 ms | | ⬜ |
| POST /orders p99 | < 500 ms | | ⬜ |
| 500 RPS sustained, 5 min | error rate < 0.5% | | ⬜ |
| HikariCP `connections_pending` during load | == 0 | | ⬜ |

## 8. Sign-off

- [ ] All P1 bugs resolved
- [ ] Pass rate ≥ 100% on critical scenarios
- [ ] Regression areas clear
- [ ] Observability signals as expected
- [ ] Performance thresholds met
- [ ] QA sign-off granted

**Sign-off by:** *(tester name)*
**Date:** *(date)*
**Environment:** UAT (`https://staging.example.com`)
**Build:** `vX.Y.Z` (`<sha>`)
**Verdict:** ⬜ APPROVED FOR PRODUCTION RELEASE / ⬜ BLOCKED
