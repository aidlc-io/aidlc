# Health Report — [Epic Title]

**Epic ID:** `$EPIC_ID`
**SRE:** SRE
**Period:** `$DATE` → `$DATE+7d`
**Status:** Draft
**Created:** `$DATE`

---

## 1. Executive Summary

> *Continue phased rollout / Pause / Kill-switch / Hotfix recommendation in one paragraph.*

**Decision:** ⬜ Continue &nbsp;&nbsp; ⬜ Pause phased rollout &nbsp;&nbsp; ⬜ Kill-switch &nbsp;&nbsp; ⬜ Expedited hotfix

## 2. Key Health Indicators

| Metric | Threshold | Actual | Status | Source |
|--------|-----------|--------|--------|--------|
| Crash-free users | ≥ 99.5% | — | ⬜ | Sentry / Crashlytics |
| Crash-free sessions | ≥ 99.8% | — | ⬜ | Sentry / Crashlytics |
| App launch p95 | ≤ 2.0s | — | ⬜ | MetricKit `MXAppLaunchMetric` |
| Hang rate (per session) | ≤ 0.5 | — | ⬜ | MetricKit `MXHangDiagnostic` |
| Animation hitch ratio | ≤ 1% | — | ⬜ | MetricKit `MXAnimationMetric` |
| Top-crash affected users | < 0.3% | — | ⬜ | Sentry / Crashlytics |
| App Store rating (7d avg) | ≥ 4.5 | — | ⬜ | App Store Connect |
| Backend dependency error rate | < 1% | — | ⬜ | backend metrics |

Mark **N/A** where data wasn't provided.

## 3. Local State

| Item | Value |
|------|-------|
| Version | v0.0.0 |
| Build (CFBundleVersion) | `<N>` |
| Git tag | v0.0.0 or "not tagged" |
| Phased rollout % | XX% (Day Y of 7) |
| Release checklist | exists / missing |

## 4. Top Crashes (this release)

| Rank | Signature | Affected users | First seen | Regression? | Severity | Link |
|------|-----------|---------------|------------|-------------|----------|------|
| 1 | `OnboardingViewModel.submit() — Thread 1 EXC_BAD_ACCESS` | 0.8% | 2024-04-12 | yes (vs. v0.0.0-prev) | P1 | <Sentry> |
| 2 | ... | | | | | |
| 3 | ... | | | | | |

## 5. MetricKit Regressions

| Metric | Prior release | Current | Delta | Status |
|--------|--------------|---------|-------|--------|
| Launch p50 | — ms | — ms | +X / −X | ⬜ |
| Launch p95 | — ms | — ms | | ⬜ |
| Hang rate | — | — | | ⬜ |
| Scroll hitch ratio | —% | —% | | ⬜ |
| Disk write exceptions | — | — | | ⬜ |
| CPU exceptions | — | — | | ⬜ |

## 6. App Store Reviews (last 7 days)

- Rating trend: X.X → X.X (Δ ±0.X)
- New review count: <n>
- Top themes per locale:
  - en-US: <e.g. "App crashes when scanning ID">
  - de-DE: <e.g. "Onboarding text overflows on iPhone SE">
  - ja-JP: <theme>

## 7. Analytics Funnel (epic-relevant events)

| Event | Expected baseline | Actual (this release) | Delta | Status |
|-------|-------------------|----------------------|-------|--------|
| `onboarding_started` | — | — | | ⬜ |
| `onboarding_signin_success` | — | — | | ⬜ |
| `onboarding_signin_failure_*` | — | — | | ⬜ |
| `onboarding_completed` | — | — | | ⬜ |

## 8. Backend Dependency Health

| Endpoint | Error rate | p95 latency | Status |
|----------|-----------|-------------|--------|
| `POST /api/v1/auth/signin` | — | — ms | ⬜ |
| `POST /api/v1/auth/signup` | — | — ms | ⬜ |

## 9. Phased Release Status

- Current phase: % rollout, Day X of 7
- Pause events: <list, if any>
- App Store Connect alert state: <list, if any>

## 10. Incidents

| Incident | Severity | Duration | Mitigation | Root cause | Status |
|----------|----------|----------|-----------|------------|--------|
|          |          |          |           |            |        |

## 11. Recommendations

- [ ] Continue to next phase
- [ ] Pause rollout — reason: …
- [ ] Flip kill-switch `<flag_key>` — reason: …
- [ ] Open hotfix epic `{{EPIC_PREFIX}}-XXXX` for crash `<signature>`
- [ ] Add MetricKit alert for `<metric>` regression > X%
- [ ] Update runbook `docs/runbooks/<name>.md`

## 12. Next Check-in

**Date:** *(date)*
**Trigger for escalation:** *(e.g. crash-free drops below 99.3%, OR hang rate > 0.7 per session)*
