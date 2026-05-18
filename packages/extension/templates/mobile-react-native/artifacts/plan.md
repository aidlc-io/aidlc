# PRD — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Product Owner
**Status:** Draft
**Created:** `$DATE`
**Platform:** iOS + Android (React Native, Expo SDK 51+)

---

## 1. Problem Statement

> *Which user / business problem does this solve? Which user — new install, returning, push-engaged?*

## 2. Goals

- [ ] Goal 1 (measurable: install conv +X%, retention +X%, crash-free ≥ 99.5%, rating ≥ 4.3)
- [ ] Goal 2
- [ ] Goal 3

## 3. Non-Goals

- Out of scope: …
- Will not address this release: …

## 4. User Stories

| ID | As a… | I want to… | So that… | Priority | Platform | OTA-safe? |
|----|-------|------------|----------|----------|----------|-----------|
| US-01 | returning user | sign in with biometrics | I skip typing my password | Must | Both | Native (uses `expo-local-authentication`) |

## 5. Functional Requirements & Acceptance Criteria

### FR-01: [Feature]

**Description:** …

**Acceptance Criteria** (Given/When/Then, tag platform + offline + permission behavior):

- [ ] `$EPIC_ID-AC01` **[Both]** GIVEN the user has a valid session, WHEN they cold-start the app, THEN Home tab appears within 2 s and shows cached feed.
- [ ] `$EPIC_ID-AC02` **[Both][Offline]** GIVEN the device is offline, WHEN the user submits the form, THEN the action is queued and a "saved locally" toast appears; on reconnect, it syncs within 30 s.
- [ ] `$EPIC_ID-AC03` **[Both][Permission]** GIVEN notifications are denied, WHEN the user enters the feature, THEN a rationale screen offers a Settings deep link.
- [ ] `$EPIC_ID-AC04` **[iOS only]** Face ID prompt is shown on first launch after enrollment.
- [ ] `$EPIC_ID-AC05` **[Android only]** POST_NOTIFICATIONS runtime permission is requested on Android 13+ before any push registration.

### FR-02: [Feature]

…

## 6. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Performance — cold start | < 2.0 s p50, < 3.5 s p95 on Pixel 6a / iPhone SE 3 |
| Performance — TTI top screen | < 1.5 s p95 |
| Performance — FlashList FPS | ≥ 58 on 200-item list |
| Bundle size | delta < 200 KB (gzip) |
| Crash-free users | ≥ 99.5% |
| ANR rate (Android) | < 0.47% |
| Accessibility | WCAG 2.1 AA, VoiceOver + TalkBack pass |
| Min OS | iOS 15.0, Android 8.0 (API 26) |
| i18n | en, es, vi; RTL respected for ar |
| Privacy | Privacy Manifest entries listed; data safety form updated; no PII in logs / breadcrumbs |
| Offline | Cached data + queued mutations; AppState resume reconnects WS |

## 7. Design & References

- Figma: *(URL — phase /plan, /design, /execute-test may fetch via Figma MCP)*
- Jira: *(ticket)*
- Related epics: …
- Vendor / SDK docs: …

## 8. Analytics / Success Metrics

| Event name | Trigger | Properties | Owner |
|------------|---------|------------|-------|
| `feature_started` | screen enter | userId, source | PO |
| `feature_completed` | success state | userId, latencyMs | PO |
| `feature_failed` | error state | userId, errorCode | PO |

| Funnel step | Baseline | Target |
|-------------|----------|--------|
| Screen enter | — | — |
| Action submitted | — | — |
| Success | — | ≥ 80% of enters |

## 9. OTA vs Native Classification

| Deliverable | Type | Reason |
|-------------|------|--------|
| New screen `ItemDetail` | OTA-safe | JS-only |
| Biometric enroll | Native | `expo-local-authentication` is native dep |
| Push category | Native | `Info.plist` + `AndroidManifest` change |

## 10. Privacy / Compliance

- iOS Privacy Manifest entries required-reason APIs: ___
- Android data safety: new collected data: ___, purposes: ___
- ATT prompt copy (if tracking added): ___
- Age rating: unchanged / revisit
- COPPA / GDPR / CCPA implications: …

## 11. Rollout Plan

- Feature flag: `flag_<name>` (default OFF; remote-config-toggled)
- Phased rollout: iOS phased release ON; Android staged % (5 → 25 → 50 → 100)
- Rollback ladder: flag flip → `eas update --republish` → halt Play → expedited iOS review
- Force-update gate: yes/no; condition: ___

## 12. Open Questions

- [ ] Q1: …
- [ ] Q2: …

## 13. Revision History

| Date | Author | Change |
|------|--------|--------|
| `$DATE` | PO | Initial draft |
