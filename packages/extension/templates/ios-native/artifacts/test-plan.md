# Test Plan — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** QA
**Status:** Draft
**Created:** `$DATE`

---

## 1. Scope

**In scope:**
- Onboarding flow (sign in, sign up, password reset)
- Keychain token storage
- SwiftData `CachedUser` schema v2

**Out of scope:**
- Legacy onboarding (deleted in this epic)
- Vision Pro spatial layout (separate epic)

## 2. Test Strategy

| Type | Tool / Approach | Owner |
|------|-----------------|-------|
| Unit | XCTest, Swift Testing (Xcode 16+) | Dev |
| Snapshot | `swift-snapshot-testing` (PointFree) | QA |
| Integration | XCTest + `URLProtocol` fake + in-memory SwiftData | Dev / QA |
| UI Automation | XCUITest with `app.launchArguments = ["-UseFakeServer"]` | QA |
| Performance | XCTest `measure { }` + `XCTMetric` (launch, scroll, memory) | QA |
| Accessibility | XCUITest + Accessibility Inspector + manual VoiceOver | QA |
| Concurrency | Test plan with TSAN + Main Thread Checker | Dev |

## 3. Device & OS Matrix

| Device class | Device | iOS | Priority | Notes |
|--------------|--------|-----|----------|-------|
| iPhone — small | iPhone SE (3rd gen) | 16.x | P1 | Smallest screen + lowest CPU |
| iPhone — modern | iPhone 15 | 17.x | P1 | Canonical baseline / snapshot ref |
| iPhone — flagship | iPhone 15 Pro Max | 18.x | P1 | ProMotion, Dynamic Island |
| iPad | iPad (10th gen) | 17.x | P2 | Split View |
| Vision Pro | Apple Vision Pro | 1.x | N/A | Out of scope this epic |

`.xctestplan` configurations:

| Config | Targets | Sanitizers |
|--------|---------|-----------|
| `Debug-Unit` | All `*Tests` | — |
| `Debug-Concurrency` | View-model + repository tests | TSAN, Main Thread Checker |
| `Snapshot-Verify` | `OnboardingSnapshotTests` | — (canonical sim only) |
| `Release-Smoke` | `AppUITests` | — |
| `Performance` | Perf-tagged | — |

## 4. Test Cases

### Unit — `$EPIC_ID-UT*`

#### $EPIC_ID-UT01 — ViewModel state transitions

```swift
@MainActor
final class OnboardingViewModelTests: XCTestCase {

    func test_submit_signIn_success_transitionsTo_signedIn() async throws {
        let repo = AuthRepositoryFake(result: .success(.makeStub()))
        let vm = OnboardingViewModel(authRepository: repo)

        await vm.submit(email: "user@example.com", password: "Passw0rd!")

        XCTAssertEqual(vm.state, .signedIn(User.makeStub()))
    }

    func test_submit_signIn_invalidCredentials_setsErrorState() async throws {
        let repo = AuthRepositoryFake(result: .failure(.invalidCredentials))
        let vm = OnboardingViewModel(authRepository: repo)

        await vm.submit(email: "user@example.com", password: "wrong")

        XCTAssertEqual(vm.state, .error(.invalidCredentials))
    }
}
```

| ID | Title | AC |
|----|-------|----|
| UT01 | ViewModel transitions on signIn success | AC-01 |
| UT02 | ViewModel transitions on invalidCredentials | AC-02 |
| UT03 | ViewModel transitions on network error | AC-03 |
| UT04 | SignUpForm validator rejects empty fields | AC-04 |

### Snapshot — `$EPIC_ID-UI*`

| ID | View | Variants |
|----|------|----------|
| UI01 | `OnboardingView` | light / dark × Dynamic Type `.large` / `.accessibility3` × LTR / RTL |
| UI02 | `OnboardingView` error state | light × default Dynamic Type |
| UI03 | `OnboardingView` loading state | light × default |

### Integration — `$EPIC_ID-IT*`

| ID | Title | Wiring |
|----|-------|--------|
| IT01 | Repository signIn 200 → Keychain stored, returns User | URLProtocol fake 200 + isolated Keychain access group |
| IT02 | Repository signIn 401 → throws `.invalidCredentials`, Keychain untouched | URLProtocol fake 401 |
| IT03 | Repository signIn offline → throws `.network(URLError)` | URLProtocol throws |
| IT04 | SwiftData CachedUser persisted, fetched on relaunch | in-memory `ModelContainer(isStoredInMemoryOnly: true)` |

### Contract — `$EPIC_ID-CT*`

| ID | Contract |
|----|----------|
| CT01 | `SignInRequestDTO` encodes per backend OpenAPI fixture |
| CT02 | `SignInResponseDTO` decodes from backend fixture; missing-field defaults |
| CT03 | Universal Link path `/onboarding/verify?token=…` matches `apple-app-site-association` |

### E2E — `$EPIC_ID-E2E*`

```swift
final class OnboardingE2ETests: XCTestCase {
    func test_signIn_happyPath() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-UseFakeServer"]
        app.launch()

        app.buttons["onboarding.signIn"].tap()
        app.textFields["onboarding.email"].tap()
        app.textFields["onboarding.email"].typeText("user@example.com")
        app.secureTextFields["onboarding.password"].tap()
        app.secureTextFields["onboarding.password"].typeText("Passw0rd!")
        app.buttons["onboarding.continue"].tap()

        XCTAssertTrue(app.otherElements["home.screen"].waitForExistence(timeout: 5))
    }
}
```

### Failure-mode

| ID | Category | Scenario |
|----|----------|----------|
| NET01 | Network | Sign-in mid-call → enable Airplane Mode → expect retry option |
| NET02 | Network | 3G Network Link Conditioner profile → expect spinner, no UI freeze |
| LC01 | Lifecycle | Sign-in → background app → foreground → state preserved |
| LC02 | Lifecycle | Kill mid-sign-in → relaunch → start fresh, no zombie state |
| PM01 | Permission | First Camera prompt → deny → app shows manual-entry alternative |
| PM02 | Permission | Camera granted → Settings.app revokes → return to app → graceful |
| UP01 | Upstream | Backend 503 → retry with backoff, max 3 attempts |
| CC01 | Concurrency | Double-tap "Continue" rapidly → only one sign-in request fires |

### Performance — `$EPIC_ID-PF*`

```swift
func test_coldLaunch_p95_under_2s() throws {
    measure(metrics: [XCTApplicationLaunchMetric()]) {
        XCUIApplication().launch()
    }
    // Threshold enforced in CI: 2.0s p95
}

func test_onboardingList_scroll_no_hitches() throws {
    measure(metrics: [XCTOSSignpostMetric.scrollDecelerationMetric]) {
        // scroll the onboarding feature list
    }
}
```

| ID | Metric | Threshold |
|----|--------|-----------|
| PF01 | Cold launch | p95 < 2.0s on iPhone 15 |
| PF02 | Scroll hitch ratio | < 1% |
| PF03 | Memory peak during onboarding | < 80MB |
| PF04 | Binary size delta | < 500KB |

### Accessibility — `$EPIC_ID-A11Y*`

| ID | Check |
|----|-------|
| A11Y01 | Every button has accessibilityLabel + accessibilityHint |
| A11Y02 | VoiceOver navigation order is sensible top-to-bottom |
| A11Y03 | Dynamic Type at `.accessibility5` — no truncation in OnboardingView |
| A11Y04 | Color contrast WCAG AA in light + dark |
| A11Y05 | Reduce Motion disables button bounce animation |

### Security — `$EPIC_ID-SEC*`

| ID | Check |
|----|-------|
| SEC01 | Token stored with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` (verified via `SecItemCopyMatching`) |
| SEC02 | ATS exception list empty in Info.plist |
| SEC03 | No tokens in `os.Logger` output (verify with `log show --predicate`) |
| SEC04 | Biometric flow: success / wrong-face / lockout / passcode fallback |

## 5. Unit Test Coverage Targets

| Module | Target | Notes |
|--------|--------|-------|
| `Onboarding` (view models) | ≥ 85% | Pure logic |
| `AuthCore` (repository) | ≥ 90% | Critical path |
| `KeychainKit` | ≥ 80% | Boundary code |

## 6. Regression Checklist

- [ ] Cold launch < 2.0s on iPhone 15
- [ ] Sign in / sign out still works
- [ ] Push notification tap deep-links to correct screen
- [ ] BGAppRefreshTask still fires
- [ ] Existing SwiftData users migrate to v2 schema without data loss

## 7. Sign-off Criteria

- [ ] All `$EPIC_ID-UT*` and `$EPIC_ID-IT*` pass on CI
- [ ] Snapshot baselines reviewed and approved (`$EPIC_ID-UI*`)
- [ ] XCUITest E2E pass on canonical simulator
- [ ] Performance thresholds met (`$EPIC_ID-PF*`)
- [ ] No P1 open bugs
- [ ] TSAN run clean on the concurrency test plan
- [ ] Accessibility manual pass complete (`$EPIC_ID-A11Y*`)
- [ ] QA sign-off granted
