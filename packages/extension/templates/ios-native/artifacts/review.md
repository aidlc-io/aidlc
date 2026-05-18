# Code Review Approval — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Reviewer:** Auto-Reviewer
**Status:** Pending
**Created:** `$DATE`

---

## 1. Review Summary

> *One-paragraph verdict.*

**Verdict:** ⬜ Pass &nbsp;&nbsp; ⬜ Reject

## 2. Acceptance Criteria Validation

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| $EPIC_ID-AC01 | … | ⬜ Pass / ⬜ Fail | `Packages/Onboarding/Sources/Onboarding/OnboardingView.swift:42` |
| $EPIC_ID-AC02 | … | ⬜ Pass / ⬜ Fail | … |

## 3. Architecture Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Layer boundaries respected (View → ViewModel → UseCase → Repository) | ⬜ | |
| SPM module impact matches tech design | ⬜ | |
| SwiftUI vs UIKit choice matches design | ⬜ | |
| `@MainActor` boundaries match concurrency map | ⬜ | |
| Protocol contracts match design (signatures, `async`, `throws`, `Sendable`) | ⬜ | |
| Composition / DI wiring updated in `AppEnvironment` | ⬜ | |
| No new singletons (except true system services) | ⬜ | |
| SwiftData / Core Data migration plan implemented | ⬜ | |

## 4. iOS Code Quality

| Check | Status | Notes |
|-------|--------|-------|
| No `try!` / `!` / `as!` on user-driven paths | ⬜ | |
| `[weak self]` in every escaping closure | ⬜ | |
| `AnyCancellable` stored in lifecycle-scoped `Set` | ⬜ | |
| `Task` parented to view (`.task { }`) or detached with rationale | ⬜ | |
| No `DispatchSemaphore.wait()` on main thread | ⬜ | |
| Heavy work off main (`Task.detached` / actor) | ⬜ | |
| `Sendable` conformance correct | ⬜ | |
| `Codable` DTOs decoded at boundary; mapped to domain | ⬜ | |
| Typed errors at domain boundaries | ⬜ | |
| No silent `try?` on critical paths | ⬜ | |
| `os.Logger` used (not `print`); sensitive data marked `.private` | ⬜ | |
| Tokens in Keychain with correct accessibility class | ⬜ | |
| ATS HTTPS-only (no new `NSAllowsArbitraryLoads`) | ⬜ | |

## 5. Privacy & Permissions

| Check | Status | Notes |
|-------|--------|-------|
| `PrivacyInfo.xcprivacy` updated per tech design | ⬜ | |
| `Info.plist` purpose strings match permissions actually requested | ⬜ | |
| App Privacy Nutrition Label answers need App Store Connect update | ⬜ | |
| New third-party SDKs include their Privacy Manifest | ⬜ | |
| ATT prompt copy reviewed (if IDFA used) | ⬜ | |

## 6. Test Coverage

| Check | Status | Notes |
|-------|--------|-------|
| XCTest unit tests for view models + repositories | ⬜ | |
| Snapshot tests for new SwiftUI views (light/dark/Dynamic Type/RTL) | ⬜ | |
| Integration tests with `URLProtocol` fake + in-memory SwiftData | ⬜ | |
| XCUITest E2E for primary flow | ⬜ | |
| Performance tests with `XCTMetric` for launch / scroll | ⬜ | |
| Accessibility tests for new interactive surfaces | ⬜ | |
| Failure-mode tests (network, lifecycle, permission, upstream) where applicable | ⬜ | |

## 7. Issues Found

### Critical (must fix before approval)

| # | File | Issue | Required action |
|---|------|-------|-----------------|
|   |      |       |                 |

### Non-critical (follow-up)

| # | File | Issue | Suggested action |
|---|------|-------|------------------|
|   |      |       |                  |

## 8. Doc Impact

After merge, run `/doc-sync` to update:
- ⬜ `Packages/<Target>/Sources/<Target>/<Target>.docc/` — public Swift API surface
- ⬜ `docs/architecture/persistence.md` — SwiftData schema version bump
- ⬜ `docs/privacy/app-privacy.md` — new data collected
- ⬜ `docs/integrations/deep-links.md` — new Universal Link path
- ⬜ `docs/runbooks/feature-flags.md` — new remote-config flag

## 9. Final Decision

- [ ] **APPROVED** — All ACs pass, no critical issues, tech design + privacy alignment verified.
- [ ] **REJECTED** — See issues above. Resubmit after fixes.

**Reviewer notes:**

> *(free text)*
