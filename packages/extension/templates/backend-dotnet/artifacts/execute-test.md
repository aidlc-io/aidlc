# Test Execution Report — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Tester:** QA / partner-dev
**Environment:** UAT (`https://api-staging.example.com`)
**Service version:** `vX.Y.Z` (commit `<sha>`)
**Status:** Draft
**Created:** `$DATE`

---

## 1. Execution Summary

| Metric          | Value |
|-----------------|-------|
| Total scenarios | 0     |
| Passed          | 0     |
| Failed          | 0     |
| Blocked         | 0     |
| Skipped         | 0     |
| Pass rate       | —%    |

## 2. Scenario Results

| TC | Title | AC | Result | Build | Notes |
|----|-------|----|--------|-------|-------|
| TC-01 | Create order — happy | AC-01 | ⬜ Pass / ⬜ Fail | vX.Y.Z | |
| TC-02 | Idempotency replay | AC-02 | ⬜ Pass / ⬜ Fail | | |
| TC-03 | Validation failure (missing field) | AC-03 | ⬜ Pass / ⬜ Fail | | |
| TC-04 | Missing JWT → 401 | AC-04 | ⬜ Pass / ⬜ Fail | | |
| TC-05 | Wrong scope → 403 | AC-05 | ⬜ Pass / ⬜ Fail | | |
| TC-06 | Cross-tenant → 404 | AC-05 | ⬜ Pass / ⬜ Fail | | |
| TC-07 | Rate-limit burst → 429 + Retry-After | AC-06 | ⬜ Pass / ⬜ Fail | | |
| TC-08 | Upstream down → 503 | AC-07 | ⬜ Pass / ⬜ Fail | | |
| TC-09 | List orders + ETag → 304 | AC-09 | ⬜ Pass / ⬜ Fail | | |

## 3. ProblemDetails Verification

For each error scenario, response body matches expected shape:

| TC | `type` | `title` | `status` | `detail` | `errors`? | Verified |
|----|--------|---------|----------|----------|-----------|----------|
| TC-03 | `.../problems/validation` | Validation failed | 400 | (varies) | yes (per-field) | ⬜ |
| TC-04 | `.../problems/auth` | Unauthorized | 401 | — | no | ⬜ |
| TC-05 | `.../problems/forbidden` | Forbidden | 403 | — | no | ⬜ |
| TC-07 | `.../problems/rate-limit` | Too many requests | 429 | retry guidance | no | ⬜ |
| TC-08 | `.../problems/upstream-unavailable` | Upstream unavailable | 503 | retry guidance | no | ⬜ |

## 4. Bugs Found

| Bug ID | Severity | Title | TC | ProblemDetails (if applicable) | Status |
|--------|----------|-------|----|--------------------------------|--------|
|        | P1/P2/P3 |       |    |                                | Open   |

## 5. Regression Check

| Area | Tested | Status |
|------|--------|--------|
| `GET /healthz/live` 200 | ⬜ | |
| `GET /healthz/ready` 200 (deps reachable) | ⬜ | |
| Existing `GET /v1/customers/{id}` works | ⬜ | |
| Auth: JWT issuance + introspection | ⬜ | |
| Rate-limit applied per policy | ⬜ | |

## 6. Performance Smoke

| Scenario | Tool | Threshold | Actual | Status |
|----------|------|-----------|--------|--------|
| `POST /v1/orders` p95 | k6 30s @ 50 VUs | < 200 ms | — | ⬜ |
| `GET /v1/orders` p95 | k6 30s @ 50 VUs | < 100 ms | — | ⬜ |
| 5xx error rate during smoke | k6 | < 0.5% | — | ⬜ |
| Synthetic uptime (last 24h) | Datadog / Grafana | ≥ 99.9% | — | ⬜ |

## 7. Service Health During UAT

| Metric | Value | Source |
|--------|-------|--------|
| 5xx error rate | — | Grafana / App Insights |
| p95 latency | — | Grafana / App Insights |
| Npgsql pool WaitTime p95 | — | metrics |
| Top exception (if any) | — | Sentry / App Insights |
| Migration job status | — | `kubectl logs job/<svc>-migrate` |

## 8. Sign-off

- [ ] All P1 bugs resolved
- [ ] Pass rate ≥ project threshold
- [ ] ProblemDetails shapes verified per scenario
- [ ] Regression areas clear
- [ ] Performance smoke thresholds met
- [ ] QA sign-off granted

**Sign-off by:** *(tester name)*
**Date:** *(date)*
**Environment:** UAT @ `<url>`
**Service version:** `vX.Y.Z` / commit `<sha>`
