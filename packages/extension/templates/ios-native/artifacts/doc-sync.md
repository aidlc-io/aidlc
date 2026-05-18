# Doc Reverse-Sync — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Archivist
**Status:** Draft
**Created:** `$DATE`

---

## 1. Summary

> *What changed between what was planned and what was actually built?*

## 2. PRD → Reality Delta

| Requirement | Planned | Actual | Action needed |
|-------------|---------|--------|--------------|
| FR-01 | | | ⬜ Update doc / ⬜ No change |
| FR-02 | | | ⬜ Update doc / ⬜ No change |

## 3. Tech Design → Reality Delta

| Design decision | Planned | Actual | Action needed |
|----------------|---------|--------|--------------|
| Architecture (layering) | | | ⬜ |
| SwiftUI vs UIKit choice | | | ⬜ |
| `@MainActor` boundary map | | | ⬜ |
| Protocol contracts (signatures) | | | ⬜ |
| SwiftData / Core Data schema | | | ⬜ |
| Keychain key names / accessibility | | | ⬜ |
| Composition / DI wiring | | | ⬜ |
| `PrivacyInfo.xcprivacy` entries | | | ⬜ |
| `Info.plist` purpose strings | | | ⬜ |
| Remote-config flags | | | ⬜ |

## 4. Documents Updated

| Document | Change | Status |
|----------|--------|--------|
| `Packages/<Target>/Sources/<Target>/<Target>.docc/` | DocC reference updated for new `public` API surface | ⬜ |
| `docs/architecture/overview.md` | Added Onboarding feature module to layer diagram | ⬜ |
| `docs/architecture/persistence.md` | SwiftData schema bumped V1 → V2 | ⬜ |
| `docs/integrations/deep-links.md` | New Universal Link path `/onboarding/verify` | ⬜ |
| `docs/privacy/app-privacy.md` | Added "Identifiers → User ID" linked-to-user | ⬜ |
| `docs/privacy/permissions.md` | Documented new `NSCameraUsageDescription` | ⬜ |
| `docs/runbooks/feature-flags.md` | Added `onboardingV2Enabled` flag entry | ⬜ |
| `apple-app-site-association` | New `/onboarding/verify` path added | ⬜ |
| `App/PrivacyInfo.xcprivacy` | Added `NSPrivacyAccessedAPICategoryUserDefaults` reason | ⬜ |
| `CHANGELOG.md` | Entry for v0.0.0 | ⬜ |
| `docs/migrations/v0.0.0.md` | SwiftData V1 → V2 migration notes | ⬜ |

## 5. Privacy Alignment Check

- [ ] `PrivacyInfo.xcprivacy` matches actual required-reason API + third-party SDK usage in the bundled binary
- [ ] App Privacy Nutrition Label answers in App Store Connect match actual data collection
- [ ] `Info.plist` purpose strings match permissions actually requested by the code
- [ ] ATT prompt copy (if used) matches App Store Connect

## 6. Reverse-Sync Checklist

- [ ] PRD reflects what was actually built (or notes divergence with rationale)
- [ ] TECH-DESIGN.md updated to match implementation
- [ ] Architecture diagrams updated (component / sequence)
- [ ] DocC examples compile with current Swift API surface
- [ ] AppIntent / Widget / Live Activity reference docs updated
- [ ] Universal Link path docs match `apple-app-site-association`
- [ ] Persistence schema doc reflects current SwiftData / Core Data model
- [ ] Privacy Manifest aligned (non-negotiable for App Review)
- [ ] App Privacy Nutrition Label aligned
- [ ] Feature flag runbook updated
- [ ] CHANGELOG entry added
- [ ] Migration guide written (if breaking)
- [ ] No broken DocC `<doc:>` references or Markdown links

## 7. Deferred Documentation

> *Items that couldn't be completed now — log them as follow-up tasks.*

| Item | Owner | Target date |
|------|-------|------------|
| | | |

## 8. Sign-off

- [ ] Archivist sign-off
- [ ] Tech Lead acknowledgement
- [ ] Release Manager confirms App Store Connect answers updated (if applicable)
