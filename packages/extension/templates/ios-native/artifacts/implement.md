# Implementation Summary — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Developer
**Branch:** `feature/$EPIC_ID-<slug>`
**Status:** Draft
**Created:** `$DATE`

---

## 1. Branch & PR

| Item | Value |
|------|-------|
| Branch | `feature/$EPIC_ID-<slug>` |
| PR | *(link once opened)* |
| Base | `main` |
| Build number after merge | `<N>` (set via `agvtool` / fastlane) |

## 2. Files Changed

Grouped by SPM target / Xcode group.

| File | Type | Description |
|------|------|-------------|
| `Packages/Onboarding/Sources/Onboarding/OnboardingView.swift` | Add | Root SwiftUI view |
| `Packages/Onboarding/Sources/Onboarding/OnboardingViewModel.swift` | Add | `@MainActor @Observable` VM |
| `Packages/AuthCore/Sources/AuthCore/AuthRepository.swift` | Modify | Add `signUp(_:)` |
| `App/AppEnvironment.swift` | Modify | Register Onboarding flow |
| `App/Info.plist` | Modify | Add `NSCameraUsageDescription` |
| `App/PrivacyInfo.xcprivacy` | Modify | Add `NSPrivacyAccessedAPICategoryUserDefaults` reason CA92.1 |

## 3. Implementation Notes

### View Model + Repository wiring

```swift
@MainActor
@Observable
final class OnboardingViewModel {
    enum State: Equatable {
        case idle
        case loading
        case signedIn(User)
        case error(AuthError)
    }

    private(set) var state: State = .idle
    private let authRepository: any AuthRepository

    init(authRepository: any AuthRepository) {
        self.authRepository = authRepository
    }

    func submit(email: String, password: String) async {
        state = .loading
        do {
            let user = try await authRepository.signIn(email: email, password: password)
            state = .signedIn(user)
        } catch let error as AuthError {
            state = .error(error)
        } catch {
            state = .error(.network(error as? URLError ?? URLError(.unknown)))
        }
    }
}
```

### Matching XCTest

```swift
@MainActor
final class OnboardingViewModelTests: XCTestCase {
    func test_submit_signIn_success_transitionsTo_signedIn() async throws {
        let stubbedUser = User(id: "u1", displayName: "Test")
        let repo = AuthRepositoryFake(result: .success(stubbedUser))
        let vm = OnboardingViewModel(authRepository: repo)

        await vm.submit(email: "user@example.com", password: "Passw0rd!")

        XCTAssertEqual(vm.state, .signedIn(stubbedUser))
    }
}
```

### Deviations from Tech Design

> *List any places where implementation diverged from `TECH-DESIGN.md` and why.*

None.
(Or: e.g. "Switched from `actor AuthRepository` to `nonisolated final class` after profiling showed actor hop overhead was 8ms per call and contention was a non-issue. Flagged to TL; tech design updated via doc-sync.")

## 4. Tests Written

| Test file | Cases | Type | Target coverage |
|-----------|-------|------|-----------------|
| `Packages/Onboarding/Tests/OnboardingTests/OnboardingViewModelTests.swift` | 4 | XCTest unit | ≥ 85% |
| `Packages/Onboarding/Tests/OnboardingTests/OnboardingSnapshotTests.swift` | 3 (× 6 variants) | snapshot | — |
| `Packages/AuthCore/Tests/AuthCoreTests/AuthRepositoryIntegrationTests.swift` | 4 | integration | ≥ 90% |
| `App/AppUITests/OnboardingE2ETests.swift` | 1 | XCUITest | smoke |

## 5. Pre-PR Checklist

### Build & lint
- [ ] `xcodebuild -scheme App -destination 'platform=iOS Simulator,name=iPhone 15' build` succeeds
- [ ] `fastlane scan --scheme App` passes on canonical simulator
- [ ] SwiftLint clean (`swiftlint --strict`)
- [ ] SwiftFormat clean
- [ ] Swift 6 strict-concurrency warnings reviewed (or `@preconcurrency` justified)

### Tests
- [ ] All unit tests pass
- [ ] Snapshot tests pass (recorded on canonical sim; no spurious diffs)
- [ ] Integration tests pass with `URLProtocol` fake + in-memory SwiftData
- [ ] XCUITest E2E passes locally
- [ ] TSAN configuration runs clean for concurrency tests

### iOS-specific
- [ ] No `try!` / `!` / `as!` on user-driven paths
- [ ] `[weak self]` in every escaping closure capturing `self`
- [ ] `AnyCancellable` stored in lifecycle-scoped `Set`
- [ ] `Task` parented via `.task { }` or detached with comment
- [ ] No `DispatchSemaphore.wait()` on main thread
- [ ] No `print()` left in production paths (use `os.Logger`)
- [ ] No hardcoded URLs / secrets in source or `Info.plist`
- [ ] `PrivacyInfo.xcprivacy` updated per tech design
- [ ] `Info.plist` purpose strings present with proposed copy
- [ ] ATS HTTPS-only — no new `NSAllowsArbitraryLoads`
- [ ] dSYM upload step verified for release build (Sentry / Crashlytics)

### Conventions
- [ ] PR title `[${EPIC_ID}] <imperative summary>`
- [ ] Branch name `feature/${EPIC_ID}-<slug>`
- [ ] PR description references acceptance criteria
- [ ] Reviewer assigned (Tech Lead)

## 6. Known Limitations / Follow-ups

- Vision Pro spatial layout deferred to separate epic
- Manual-entry fallback for camera scan ships behind `manualEntryEnabled` flag (default ON for first release)
- SwiftData v2 migration verified up to ~50k cached users; large-fleet test deferred

## 7. Privacy Manifest Delta

```xml
<!-- App/PrivacyInfo.xcprivacy diff -->
<key>NSPrivacyAccessedAPITypes</key>
<array>
+  <dict>
+    <key>NSPrivacyAccessedAPIType</key>
+    <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
+    <key>NSPrivacyAccessedAPITypeReasons</key>
+    <array><string>CA92.1</string></array>
+  </dict>
</array>
```

App Privacy Nutrition Label (App Store Connect): add "Identifiers → User ID" linked-to-user with reason "Authentication".
