# Test Execution Report — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Tester:** QA
**Environment:** TestFlight build `<N>` on assigned devices
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

## 2. Test Run Results

| Scenario | Title | Result | Build | Device | iOS | Notes |
|----------|-------|--------|-------|--------|-----|-------|
| S-01 | Sign in happy path | ⬜ Pass / ⬜ Fail | | iPhone 15 | 17.4 | |
| S-02 | Sign in offline → graceful error | ⬜ | | iPhone SE | 16.7 | |
| S-03 | Camera permission denied → manual fallback | ⬜ | | iPhone 15 Pro Max | 18.0 | |
| S-04 | VoiceOver navigation through onboarding | ⬜ | | iPhone 15 | 17.4 | |
| S-05 | Dynamic Type AX5 — no truncation | ⬜ | | iPhone SE | 16.7 | |
| S-06 | Background → Foreground mid-flow | ⬜ | | iPad 10th gen | 17.4 | |

## 3. Bugs Found

| Bug ID | Severity | Title | Scenario | Screenshot / Recording | Ticket |
|--------|----------|-------|----------|------------------------|--------|
|        | P0 / P1 / P2 / P3 | | | | |

## 4. Regression Check

| Area | Tested | Status |
|------|--------|--------|
| Cold launch < 2s on iPhone 15 | ⬜ | |
| Sign in / sign out | ⬜ | |
| Push tap → correct deep link | ⬜ | |
| BGAppRefreshTask still fires | ⬜ | |
| SwiftData v1 → v2 migration on first launch | ⬜ | |

## 5. Device / OS Coverage

| Device | iOS | Tester | Result |
|--------|-----|--------|--------|
| iPhone SE (3rd gen) | 16.7 | | ⬜ |
| iPhone 15 | 17.4 | | ⬜ |
| iPhone 15 Pro Max | 18.0 | | ⬜ |
| iPad (10th gen) | 17.4 | | ⬜ |
| Apple Vision Pro | 1.x | N/A | — |

## 6. Performance Results

| Scenario | Threshold | Actual | Status |
|----------|-----------|--------|--------|
| Cold launch p95 (iPhone 15) | < 2.0s | | ⬜ |
| Scroll hitch ratio | < 1% | | ⬜ |
| Memory peak during onboarding | < 80MB | | ⬜ |
| Binary size delta | < 500KB | | ⬜ |

## 7. Accessibility Results

| Check | Result | Notes |
|-------|--------|-------|
| All interactive elements have meaningful VoiceOver labels | ⬜ | |
| Navigation order is sensible top-to-bottom | ⬜ | |
| Dynamic Type AX5 — no truncation | ⬜ | |
| WCAG AA contrast light + dark | ⬜ | |
| Reduce Motion respected | ⬜ | |

## 8. Sign-off

- [ ] All P1 bugs resolved
- [ ] Pass rate ≥ 95% on canonical device matrix
- [ ] Regression areas clear
- [ ] Performance thresholds met
- [ ] Accessibility manual pass complete
- [ ] QA sign-off granted

**Sign-off by:** *(tester name)*
**Date:** *(date)*
**Build verified:** TestFlight `<N>`
