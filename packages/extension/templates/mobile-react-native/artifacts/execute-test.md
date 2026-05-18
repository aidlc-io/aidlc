# Test Execution Report — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Tester:** QA
**Environment:** TestFlight build / Play closed track build / EAS Update staging channel
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

## 2. Build Info

| Item | Value |
|------|-------|
| iOS build | `1.4.0 (42)` |
| Android versionCode | `142` |
| Runtime version | `1.4.0` |
| OTA channel under test | `staging` |
| Update group ID | *(if OTA verified)* |

## 3. Scenario Results

| ID | Title | Platform | Result | Device / OS | Notes |
|----|-------|----------|--------|-------------|-------|
| `$EPIC_ID-S01` | Sign in with email | iOS | ⬜ Pass / ⬜ Fail | iPhone 14 / 17.4 | |
| `$EPIC_ID-S01` | Sign in with email | Android | ⬜ Pass / ⬜ Fail | Pixel 6a / 13 | |
| `$EPIC_ID-S02` | Sign in offline | iOS | ⬜ | | |
| `$EPIC_ID-S03` | Push cold-start deep link | iOS | ⬜ | | real device |
| `$EPIC_ID-S04` | Permission deny → recovery | Android | ⬜ | API 33 runtime POST_NOTIFICATIONS |

## 4. Bugs Found

| Bug ID | Severity | Title | Scenario | Status |
|--------|----------|-------|----------|--------|
|        | P0/P1/P2/P3 |       |          | Open |

## 5. Regression Check

| Area | Tested | Status |
|------|--------|--------|
| Sign in (email + biometric) | ⬜ | |
| Sign out | ⬜ | |
| Cold start ≤ 2 s | ⬜ | |
| Push tap (cold + warm) | ⬜ | |
| Deep link (cold + warm) | ⬜ | |
| Top-level navigation | ⬜ | |
| Theme + locale switch | ⬜ | |
| Offline → online sync | ⬜ | |

## 6. Device / OS Coverage

| Platform | Device | OS | Tester | Result |
|----------|--------|----|--------|--------|
| iOS | iPhone SE 3 | 15.x | | ⬜ |
| iOS | iPhone 14 | 17.x | | ⬜ |
| iOS | iPhone 15 Pro | 18.x | | ⬜ (push / biometric) |
| Android | Pixel 4a | 12 | | ⬜ |
| Android | Pixel 6a | 13 | | ⬜ |
| Android | Pixel 8 | 14 | | ⬜ |
| Android | Samsung A53 | 13 | | ⬜ |

## 7. Performance Results

| Scenario | Threshold | Actual | Status |
|----------|-----------|--------|--------|
| Cold start Pixel 6a p50 | < 2.0 s | — | ⬜ |
| Cold start iPhone SE 3 p50 | < 2.0 s | — | ⬜ |
| ItemDetail first paint p95 | < 1.5 s | — | ⬜ |
| Feed FlashList 200 items FPS | ≥ 58 | — | ⬜ |
| Memory after 5 min | < 250 MB | — | ⬜ |

## 8. Accessibility Sweep

| Check | Platform | Result | Notes |
|-------|----------|--------|-------|
| VoiceOver — all interactive elements announce | iOS | ⬜ | |
| TalkBack — all interactive elements announce | Android | ⬜ | |
| Focus order correct | both | ⬜ | |
| Dynamic Type AX5 | iOS | ⬜ | no clipping |
| Font scaling 200% | Android | ⬜ | no clipping |
| Color contrast WCAG AA | both | ⬜ | light + dark |
| Reduced motion respected | both | ⬜ | |

## 9. OTA Verification

| Check | Result |
|-------|--------|
| Apply `eas update --branch staging` on dev client | ⬜ |
| Behavior matches binary build | ⬜ |
| Previous binary + current OTA works | ⬜ |
| Rollback `--republish --group <prev>` works | ⬜ |

## 10. Sign-off

- [ ] All P1 scenarios pass on all P1 devices
- [ ] No P0/P1 open bugs
- [ ] Perf thresholds met
- [ ] Accessibility sweep clean
- [ ] OTA verified
- [ ] QA sign-off

**Sign-off by:** *(tester name)*
**Date:** *(date)*
**Verdict:** ⬜ READY for production rollout &nbsp;&nbsp; ⬜ HOLD — open bugs/regressions
