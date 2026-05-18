# Release Notes — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Release Manager:** RM
**Version:** `v0.0.0` (build `<N>`)
**Status:** Draft
**Created:** `$DATE`

---

## 1. Release Overview

| Item | Value |
|------|-------|
| Marketing version (CFBundleShortVersionString) | `0.0.0` |
| Build number (CFBundleVersion) | `<N>` |
| Branch / SHA | `release/0.0.0 @ <sha>` |
| Release date | `$DATE` |
| Platforms | iPhone / iPad / visionOS (per epic) |
| Minimum iOS version | iOS 16+ |
| Submission channel | TestFlight Internal → External → App Store |
| App Store submission status | ⬜ Submitted / ⬜ Pending Developer Release / ⬜ Released |
| Phased release | ⬜ Enabled (7-day default) / ⬜ Disabled |

## 2. What's New (User-facing — App Store Connect, per locale)

> *Plain language, ≤ 4000 chars per locale. No jargon, no epic keys.*

### en-US

```
v0.0.0:

• <Feature benefit in plain language>
• <Improvement benefit>
• <Bug fix users would notice>
• Bug fixes and performance improvements
```

### <other-locale>

```
(translated equivalent)
```

## 3. Technical Changelog (internal)

```markdown
## v0.0.0 — $DATE

### New
- **$EPIC_ID**: <one-line summary>

### Improved
- **<EPIC_KEY>**: <one-line summary>

### Fixed
- <User-visible fix>

### Breaking
- <Breaking change>. Migration: `docs/migrations/v0.0.0.md`

### Internal
- <Refactors, infra, test, doc changes>
```

## 4. iOS Platform Notes

| Item | Detail |
|------|--------|
| New `Info.plist` purpose strings | `NSCameraUsageDescription` = "<exact copy>" |
| `PrivacyInfo.xcprivacy` delta | Added `NSPrivacyAccessedAPICategoryUserDefaults` reason `CA92.1` |
| App Privacy Nutrition Label delta | App Store Connect updated: added "Identifiers → User ID" linked-to-user |
| New third-party SDKs | <Name> v<x.y.z> — Privacy Manifest bundled |
| Remote-config flags | `onboardingV2Enabled` (default `true`) — kill-switch path |
| Persistence migration | SwiftData v1 → v2 lightweight (additive only); users upgrade on first launch |
| New Universal Link paths | `/onboarding/verify?token=…` — `apple-app-site-association` updated |
| New AppIntents | None / `<IntentName>` |
| Minimum iOS bumped? | No (still 16.0) / Yes (from X to Y) |

## 5. Release Checklist

### Pre-release (Tech)
- [ ] All epic test cases passed (TEST-EXECUTION.md sign-off)
- [ ] No P0/P1 open bugs
- [ ] `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` bumped (`agvtool` or fastlane)
- [ ] CI green on `release/0.0.0` branch (`fastlane scan`)
- [ ] SwiftLint / SwiftFormat clean
- [ ] Swift 6 strict-concurrency warnings reviewed
- [ ] dSYM upload step in release lane verified (Sentry / Crashlytics)

### Pre-release (App Store Connect)
- [ ] "What's New" copy entered in every supported locale (≤ 4000 chars)
- [ ] Screenshots current per device class (6.7" / 6.5" / 6.1" / 5.5" / iPad 12.9" / iPad 11" / Vision Pro)
- [ ] App Privacy Nutrition Label answers match actual data collection
- [ ] `PrivacyInfo.xcprivacy` matches third-party SDK bundle
- [ ] Info.plist purpose strings accurate
- [ ] Age rating current
- [ ] Export compliance answered (ATS HTTPS = exempt)
- [ ] ATT prompt copy reviewed (if IDFA used)

### TestFlight
- [ ] Internal build available; internal team verified happy path
- [ ] External Beta App Review submitted (~24h first time)
- [ ] External cohort tested for ≥ 48h with no P0/P1

### Production
- [ ] App Store submission created
- [ ] Phased release enabled
- [ ] Remote-config kill-switch flag set to expected state
- [ ] Backend mitigation endpoint ready (if applicable)
- [ ] Support team briefed
- [ ] Monitoring dashboards bookmarked (Sentry / Crashlytics / App Store Connect / MetricKit ingestion)

### Post-release
- [ ] Git tag `v0.0.0` created and pushed
- [ ] dSYM uploaded for the released binary
- [ ] Phased rollout advancing per schedule
- [ ] Crash-free users ≥ baseline − 0.3% in first 24h
- [ ] App Store rating not dropping > 0.2 stars
- [ ] No new top-5 crash signatures from this release

## 6. Rollback Plan

App Store has no version rollback. Mitigation order:

1. **Kill-switch flag** — flip `<flag_key>` to OFF via remote config (minutes)
2. **Backend mitigation** — `forceLegacyOnboarding` server flag returns legacy UI manifest (hours)
3. **Expedited hotfix** — submit `v0.0.1` to App Review with justification (24h+)

## 7. Known Issues / Limitations

- …

## 8. Contributors

> *(Generated from `git log --pretty=format:"- %an" v(prev)..HEAD | sort -u`)*
