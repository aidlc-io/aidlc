# Health Report — [Epic Title]

**Epic ID:** `$EPIC_ID`
**SRE:** SRE
**Period:** `$DATE` → `$DATE+7d`
**Status:** Draft
**Created:** `$DATE`
**Stack:** Sentry RN + Crashlytics (optional) + Play Vitals + App Store Connect + EAS Update analytics

---

## 1. Executive Summary

> *GO / PAUSE / OTA-HOTFIX / NATIVE-HOTFIX / ROLLBACK recommendation in one paragraph.*

**Decision:**
- ⬜ **GO** — advance phased rollout per plan
- ⬜ **PAUSE** — halt rollout; investigate
- ⬜ **OTA HOTFIX** — `eas update` JS-only fix
- ⬜ **NATIVE HOTFIX** — new binary + expedited App Store review
- ⬜ **ROLLBACK** — OTA republish previous + halt store rollout
- ⬜ **FORCE UPDATE** — remote config gating

## 2. Release Context

| Item | Value |
|------|-------|
| Version | `v0.0.0` |
| iOS buildNumber | `0` |
| Android versionCode | `0` |
| `expo.runtimeVersion` | `0.0.0` |
| Native vs OTA | ⬜ Native &nbsp;&nbsp; ⬜ OTA-only &nbsp;&nbsp; ⬜ Mixed |
| iOS rollout % | — |
| Android rollout % | — |
| Hours in production | — |

## 3. Key Health Indicators (KHI)

| KHI | Target | Warn | Crit | Actual | Status | Source |
|-----|--------|------|------|--------|--------|--------|
| Crash-free users (24h) | ≥ 99.5% | < 99.5% | < 98.5% | — | ⬜ | Sentry |
| Crash-free sessions (24h) | ≥ 99.7% | < 99.7% | < 99.0% | — | ⬜ | Sentry |
| ANR rate (Android) | < 0.47% | ≥ 0.47% | ≥ 1.0% | — | ⬜ | Play |
| Cold start p50 (mid-tier) | < 2.0 s | ≥ 2.5 s | ≥ 4.0 s | — | ⬜ | Sentry Perf |
| TTI top screen p95 | < 3.0 s | ≥ 4.0 s | ≥ 6.0 s | — | ⬜ | Sentry Perf |
| OTA apply success | ≥ 95% | < 95% | < 90% | — | ⬜ | EAS |
| Rating (last 7d) | ≥ 4.3 | < 4.3 | < 4.0 | — | ⬜ | Stores |
| Top JS error vs prev | flat / ↓ | +20% | +50% | — | ⬜ | Sentry |
| Top native crash vs prev | flat / ↓ | +20% | +50% | — | ⬜ | Sentry / Crashlytics |
| Push delivery | ≥ 95% | < 95% | < 90% | — | ⬜ | Provider |

## 4. Crash-Free by OS / Device Class

| Slice | Crash-free users | Δ vs prev release |
|-------|------------------|-------------------|
| iOS 18 | — | — |
| iOS 17 | — | — |
| iOS 16 | — | — |
| iOS 15 (min) | — | — |
| Android 14 | — | — |
| Android 13 | — | — |
| Android 12 | — | — |
| Android 11 (min) | — | — |

## 5. Top Issues (Sentry / Crashlytics)

### Top JS / Hermes
| Rank | Signature | Events | Users | Symbolicated? | New? |
|------|-----------|--------|-------|---------------|------|
| 1 | | | | ⬜ ✅ / ❌ | ⬜ |

### Top Native (iOS + Android)
| Rank | Signature | Users | OS slice | New? |
|------|-----------|-------|----------|------|
| 1 | | | | ⬜ |

### Top ANRs (Android)
| Rank | Signature | Users | Notes |
|------|-----------|-------|-------|
| 1 | | | |

## 6. EAS Update Funnel (if OTA shipped)

| Stage | Count | % of total | Notes |
|-------|-------|-----------|-------|
| Available | — | 100% | runtime version match |
| Downloaded | — | — | |
| Applied | — | — | |
| Activated | — | — | |
| Reverted | — | — | rollback rate |

## 7. Performance vs Prior Release

| Metric | Prior | Current | Delta |
|--------|-------|---------|-------|
| Cold start p50 | — | — | — |
| Cold start p95 | — | — | — |
| TTI ItemDetail p95 | — | — | — |
| JS frame drops | — | — | — |
| Memory p90 RSS | — | — | — |

## 8. User Feedback

### App Store Reviews (last 72h)
- Avg rating: — (Δ vs prior week: —)
- New reviews: —
- Themes: …

### Play Store Reviews (last 72h)
- Avg rating: —
- New reviews: —
- Themes: …

### Support Tickets

| Ticket | Description | Priority | Status |
|--------|-------------|----------|--------|
|        |             |          |        |

## 9. Analytics Events

| Event | Expected change | Actual change | Status |
|-------|-----------------|---------------|--------|
| `feature_started` | flat or ↑ | — | ⬜ |
| `feature_completed` | flat or ↑ | — | ⬜ |
| `feature_failed` | flat or ↓ | — | ⬜ |
| Push open rate | ≥ 95% | — | ⬜ |

## 10. Incidents

| Incident | Severity | Duration | Root cause | Mitigation | Status |
|----------|----------|----------|------------|------------|--------|
|          |          |          |            |            |        |

## 11. Recommendations

- …

## 12. Next Check-in

**Date:** *(date)*
**Trigger for escalation:** crash-free users < 99% / ANR > 0.47% / top issue +50% / 1-star surge
