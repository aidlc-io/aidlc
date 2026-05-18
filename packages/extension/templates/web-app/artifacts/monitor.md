# Health Report — [Epic Title]

**Epic ID:** `$EPIC_ID`
**SRE:** SRE
**Version:** `v0.0.0`
**Period:** `$DATE` → `$DATE+7d`
**Status:** Draft
**Created:** `$DATE`

---

## 1. Executive Summary

> *GO / PAUSE / HOTFIX / ROLLBACK in one paragraph, with the key metric driving the decision.*

**Decision:** ⬜ Continue rollout &nbsp;&nbsp; ⬜ Hold &nbsp;&nbsp; ⬜ Pause &nbsp;&nbsp; ⬜ Hotfix &nbsp;&nbsp; ⬜ Rollback

## 2. Key Health Indicators

| KHI | Threshold | Actual | Status | Source |
|-----|-----------|--------|--------|--------|
| Crash-free sessions | ≥ 99.5% | — | ⬜ | Sentry release health |
| Crash-free users | ≥ 99.0% | — | ⬜ | Sentry |
| LCP p75 (top route) | ≤ 2.5 s | — | ⬜ | Web Vitals RUM |
| INP p75 (top route) | ≤ 200 ms | — | ⬜ | Web Vitals RUM |
| CLS p75 (top route) | ≤ 0.1 | — | ⬜ | Web Vitals RUM |
| 5xx rate | < 0.1% | — | ⬜ | Vercel / APM |
| Function duration p95 | project budget | — | ⬜ | Vercel / APM |
| Synthetic pass rate | ≥ 99% | — | ⬜ | Checkly |
| Release adoption (Sentry) | ≥ 50% by D+1 | — | ⬜ | Sentry |

## 3. Web Vitals Dashboard

| Route | LCP p75 | INP p75 | CLS p75 | TTFB p75 | Δ vs prior week |
|-------|---------|---------|---------|----------|------------------|
| `/` | — s | — ms | 0.— | — ms | +/- |
| `/dashboard` | — s | — ms | 0.— | — ms | +/- |
| `/pricing` | — s | — ms | 0.— | — ms | +/- |

Cohort breakdown:
- **Viewport**: desktop / tablet / mobile
- **Connection**: 4G / 3G / slow-2g

## 4. Sentry Release Health

### Top Issues
| Rank | Issue (source-mapped frame) | Type | Affected users / sessions | First seen | Status |
|------|----------------------------|------|--------------------------|------------|--------|
| 1 |  | new / regression / existing |  |  | open |

### Replays (P0/P1 only)
- *(link to Sentry replay reproducing top issue)*

## 5. Server / Function Metrics

| Endpoint / Function | Invocations | Error rate | Duration p95 | Cold start % |
|---------------------|-------------|------------|--------------|---------------|
| `POST /api/...` | — | — % | — ms | — % |

## 6. Synthetic Monitors

| Journey | Pass rate (7d) | Last failure |
|---------|----------------|--------------|
| Sign-in → dashboard | — % | |
| Create project happy path | — % | |
| Public landing → CTA | — % | |

## 7. User Feedback

### Support Tickets

| Volume (7d) | Top theme | Trend |
|-------------|-----------|-------|
| — | — | + / - / flat |

| Ticket | Description | Priority | Status |
|--------|-------------|----------|--------|
|        |             |          |        |

### Public / Social
> *(Twitter / Reddit / Discord mentions if relevant)*

## 8. Analytics Events

| Event | Expected change | Actual change | Status |
|-------|------------------|---------------|--------|
| `project_created` | +X% | — | ⬜ |
| `signup_completed` | flat | — | ⬜ |

## 9. Feature Flag Status

| Flag | Targeting | Current % | Next stage |
|------|-----------|-----------|------------|
| `<flag>` | per-tenant | XX% | XX% (if KHIs green) |

## 10. Incidents

| Incident | Severity | Duration | Root cause | Status |
|----------|----------|----------|------------|--------|
|          |          |          |            |        |

## 11. Recommendations

- …

## 12. Next Check-in

**Date:** *(date)*
**Trigger for escalation:** *(condition — e.g., LCP p75 > 3 s for > 1 hr)*

## 13. Decision

- [ ] Continue rollout (advance feature flag to next stage)
- [ ] Hold at current % — reason: ___
- [ ] Pause rollout — reason: ___
- [ ] Roll back — reason: ___
- [ ] Hotfix — open epic `{{EPIC_PREFIX}}-XXXX`
