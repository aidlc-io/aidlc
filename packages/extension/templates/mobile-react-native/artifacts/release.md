# Release Notes — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Release Manager:** RM
**Version:** `v0.0.0`
**Status:** Draft
**Created:** `$DATE`
**Stack:** React Native + Expo (EAS Build / Submit / Update)

---

## 1. Release Overview

| Item | Value |
|------|-------|
| Marketing version | `v0.0.0` |
| iOS buildNumber | `0` |
| Android versionCode | `0` |
| `expo.runtimeVersion` | `0.0.0` |
| Branch / SHA | `release/v0.0.0 @ <sha>` |
| Release date | `$DATE` |
| Release type | ⬜ Native (EAS Build + Submit) &nbsp;&nbsp; ⬜ OTA only (EAS Update) &nbsp;&nbsp; ⬜ Mixed |
| Channel | `production` |
| iOS distribution | TestFlight → App Store phased release |
| Android distribution | Play Console staged rollout |

## 2. What's New (user-facing, per locale)

> *Plain language. ≤ 4000 chars iOS / ≤ 500 chars Android.*

### English (en)
- …
- …

### Spanish (es)
- …

### Vietnamese (vi)
- …

## 3. Technical Changelog

### New
- **[Native] `{{EPIC_PREFIX}}-XXXX`**: …
- **[OTA] `{{EPIC_PREFIX}}-YYYY`**: …

### Improved
- **[OTA] `{{EPIC_PREFIX}}-ZZZZ`**: …

### Fixed
- **[OTA] `{{EPIC_PREFIX}}-AAAA`**: …

### Breaking
- None this release.

### Internal
- Expo SDK upgraded to ___
- Sentry RN upgraded to ___
- Reanimated upgraded to ___

### Notes
- **New permissions**: …
- **New env vars**: `EXPO_PUBLIC_*` …
- **Feature flags**: `flag_<name>` (default OFF; ramp plan …)
- **OTA fingerprint**: runtime version `___` locked; this OTA only applies to binaries with this runtime version

## 4. Pre-release Checklist

### Universal
- [ ] EAS Build green (production profile, iOS + Android)
- [ ] Tests pass (Jest, RNTL, Detox/Maestro, Reassure)
- [ ] TypeScript strict compile clean
- [ ] ESLint + Prettier clean
- [ ] `expo.version` bumped (SemVer)
- [ ] `expo.ios.buildNumber` bumped (monotonic)
- [ ] `expo.android.versionCode` bumped (monotonic)
- [ ] `expo.runtimeVersion` correct (bumped if native change)
- [ ] CHANGELOG entry added
- [ ] Sentry release `MyApp@vX.Y.Z+buildNumber` created
- [ ] Source maps + Hermes symbols uploaded (verify EAS hook)
- [ ] No P0/P1 open bugs
- [ ] UAT signed off for every epic in scope

### iOS (App Store)
- [ ] TestFlight internal pass
- [ ] TestFlight external pass (≥ 100 users, ≥ 24h)
- [ ] Privacy Manifest (`PrivacyInfo.xcprivacy`) up to date
- [ ] App Store screenshots updated (if UI changed)
- [ ] App Store release notes ≤ 4000 chars per locale
- [ ] ATT prompt copy approved (if tracking)
- [ ] Phased release ON
- [ ] Submitted to App Store review

### Android (Play Store)
- [ ] Play internal track pass
- [ ] Play closed track pass (≥ 24h)
- [ ] Data safety form reviewed
- [ ] `targetSdkVersion` meets Play requirement (currently ≥ 34)
- [ ] App bundle (.aab) generated; Play App Signing enabled; mapping uploaded
- [ ] Play release notes ≤ 500 chars per locale
- [ ] Staged rollout % defined (start 1% or 5%)

### Feature flags
- [ ] Risky changes flag-gated, default OFF
- [ ] Flag-flip path verified

## 5. Deploy Commands

### Native binary
```bash
# Build + submit
eas build --platform all --profile production --auto-submit
# Or split
eas build --platform all --profile production
eas submit --platform ios --latest
eas submit --platform android --latest --track production --rollout 0.05
```

### OTA
```bash
# Stage first
eas update --branch staging --message "[v0.0.0] [EPIC-KEY] summary"
# Production
eas update --branch production --message "[v0.0.0] [EPIC-KEY] summary"
```

## 6. Phased Rollout Plan

| Stage | iOS | Android | Trigger to next |
|-------|-----|---------|-----------------|
| 1 | TestFlight internal | Play internal | Smoke pass |
| 2 | TestFlight external 100 | Play closed | 24h KHIs green |
| 3 | App Store phased 1% | Play 5% | 24h KHIs green |
| 4 | App Store phased ramp | Play 25% | 24h KHIs green |
| 5 | App Store full | Play 100% | 7d monitor |

## 7. Rollback Plan

| Lever | Command | ETA |
|-------|---------|-----|
| Feature flag flip | Remote config | seconds |
| OTA republish | `eas update --branch production --republish --group <prev>` | minutes |
| Halt Play staged rollout | Play Console UI | minutes |
| Pause iOS phased release | App Store Connect UI | minutes |
| Expedited App Store review | ASC support request | hours–days |
| Force-update gate | Remote config min-version | minutes (clients with current binary) |

## 8. Post-release Verification (first 24h)

- [ ] Synthetic / smoke test on real device pass
- [ ] Sentry crash-free users ≥ 99.5% (warn 99%, halt 98.5%)
- [ ] No new top issue signature
- [ ] Play Vitals: ANR < 0.47%
- [ ] App Store Connect: rating stable
- [ ] EAS Update funnel (if OTA): apply ≥ 85%, activate ≥ 80%
- [ ] Feature flags in expected state
- [ ] Phased rollout % matches plan
- [ ] Source maps + Hermes symbols visible in Sentry release

## 9. Known Issues / Limitations

- …

## 10. Contributors

> *(Generated from git log)*
