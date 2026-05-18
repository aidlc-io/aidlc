# PRD — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Product Owner
**Status:** Draft
**Created:** `$DATE`

---

## 1. Problem Statement

> *Describe the user or business problem this epic solves. Why does it exist? Which user, on which device class (iPhone / iPad / Vision Pro)?*

## 2. Goals

- [ ] Goal 1
- [ ] Goal 2
- [ ] Goal 3

## 3. Non-Goals

- Out of scope: …
- Will not address: …
- Excluded device classes / iOS versions: …

## 4. User Stories

| As a… | I want to… | So that… |
|--------|------------|----------|
| user   |            |          |

## 5. Functional Requirements

### FR-01: [Feature name]

**Description:** …
**Acceptance Criteria:**
- [ ] `$EPIC_ID-AC01`: Given … When … Then …
- [ ] `$EPIC_ID-AC02`: Given … When … Then …

### FR-02: [Feature name]

**Description:** …
**Acceptance Criteria:**
- [ ] `$EPIC_ID-AC03`: …

## 6. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Performance | Cold launch p95 < 2.0s on iPhone 15; scroll FPS ≥ 60 (120 on ProMotion) |
| Accessibility | VoiceOver labels/hints/traits on all interactive views; Dynamic Type up to AX5; WCAG AA contrast light + dark |
| Security | Tokens in Keychain (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`); ATS HTTPS-only; biometric gating where applicable |
| Privacy | `PrivacyInfo.xcprivacy` updated; App Privacy Nutrition Label answers match; ATT prompt copy reviewed if IDFA used |
| Compatibility | iOS 16+ (minimum); iPad Split View supported / not supported; Vision Pro supported / not supported |
| Localization | en-US, … (list); RTL support for ar/he; Dynamic formatters (date/number/measurement) |
| Observability | `os.Logger` subsystem `<id>.<feature>`; MetricKit metrics tracked; Sentry/Crashlytics tags |
| Offline | Behavior when offline (cached read, queued mutation, error state) |

## 7. iOS Platform Considerations

| Concern | Decision |
|---------|----------|
| New permissions requested | Camera / Photos / Location / Microphone / Notifications / Tracking — purpose string copy below |
| Info.plist purpose strings | `NSCameraUsageDescription`: "<exact copy>" |
| `PrivacyInfo.xcprivacy` impact | New required-reason API entry: <type> reason <code> |
| New third-party SDKs | <Name> — confirm Privacy Manifest bundled |
| App Extension impact | Widget / Live Activity / Share / Intents / Notification Service — yes/no |
| Universal Link / URL scheme | New path: `/<path>` — `apple-app-site-association` update needed |
| AppIntent / Shortcuts | New intent: `<IntentName>` — yes/no |
| Background work | BGAppRefreshTask / BGProcessingTask — yes/no |

## 8. Design & References

- Figma: *(link)*
- Jira: *(ticket)*
- Apple HIG section(s): *(link)*
- Related epics: *(links)*
- Prior research / usability tests: *(link)*

## 9. Metrics / Success Criteria

| Metric | Baseline | Target |
|--------|----------|--------|
| Crash-free users | — | ≥ 99.5% |
| Feature conversion rate | — | — |
| App Store rating (7d avg) | — | ≥ 4.5 |
| Onboarding completion (Day 1) | — | ≥ 80% |

## 10. Rollout Plan

| Phase | Audience | Trigger to advance |
|-------|----------|--------------------|
| TestFlight Internal | Internal team | All UAT scenarios pass |
| TestFlight External | Beta cohort (~500 users) | No P0/P1 in 48h |
| App Store phased release | Public, 1% → 100% over 7 days | Crash-free ≥ baseline − 0.3% at each step |

- Remote-config kill-switch flag: `<flag_key>` (default ON; flip OFF to disable)
- Backend mitigation endpoint: <if applicable>

## 11. Open Questions

- [ ] Q1: …
- [ ] Q2: …

## 12. Revision History

| Date | Author | Change |
|------|--------|--------|
|      |        | Initial draft |
