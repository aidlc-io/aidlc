# Technical Design — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Tech Lead
**Status:** Draft
**Created:** `$DATE`

---

## 1. Overview

> *One paragraph: what is being built, SwiftUI vs UIKit choice, persistence choice, key architectural decisions.*

## 2. Architecture

```
[OnboardingView]  ── @MainActor SwiftUI
       │
       ▼
[OnboardingViewModel] ── @MainActor @Observable
       │
       ▼
[AuthUseCase] ── actor / nonisolated
       │
       ▼
[AuthRepository] ── actor
   │              │
   ▼              ▼
[URLSession]  [KeychainStore]
```

### 2.1 SPM Module Layout

| Target | Type | Depends on | Reason |
|--------|------|------------|--------|
| `Onboarding` | new feature target | `DesignSystem`, `AuthCore` | Hosts onboarding flow |
| `AuthCore` | existing | `Networking`, `KeychainKit` | Add `signUp(_:)` |
| `DesignSystem` | existing | — | New `PrimaryButton` variant |

### 2.2 SwiftUI vs UIKit

- Onboarding flow: pure SwiftUI (`NavigationStack`, `@Observable` view models)
- Camera preview screen: UIKit via `UIViewRepresentable` wrapping `AVCaptureVideoPreviewLayer` (no SwiftUI equivalent yet)

### 2.3 Key Design Choices

| Choice | Rationale | ADR |
|--------|-----------|-----|
| `@Observable` over `ObservableObject` | iOS 17+ minimum; finer-grained invalidation | — |
| SwiftData over Core Data for new entities | Existing project uses SwiftData; consistency | — |
| `actor AuthRepository` over `nonisolated` class | Token refresh needs serialized access | ADR-0007 |

## 3. Protocol / Interface Contract

```swift
public protocol AuthRepository: Sendable {
    func signIn(email: String, password: String) async throws -> User
    func signUp(_ form: SignUpForm) async throws -> User
    func signOut() async throws
    var currentUser: AsyncStream<User?> { get }
}

public enum AuthError: Error, Sendable {
    case invalidCredentials
    case network(URLError)
    case server(statusCode: Int, message: String?)
    case keychainFailure(OSStatus)
}
```

### Codable DTO (Boundary)

```swift
struct SignInRequestDTO: Encodable {
    let email: String
    let password: String
}

struct SignInResponseDTO: Decodable {
    let userId: String
    let accessToken: String
    let refreshToken: String
    let expiresAt: Date
}
```

DTOs are mapped to domain types (`User`, `AuthToken`) at the repository boundary; never leak to the view layer.

## 4. MainActor / Concurrency Map

| Type | Isolation | Reason |
|------|-----------|--------|
| `OnboardingView` | `@MainActor` (SwiftUI implicit) | UI |
| `OnboardingViewModel` | `@MainActor` | Owns UI state |
| `AuthUseCase` | `nonisolated` (pure orchestration) | No mutable state |
| `AuthRepository` | `actor` | Serializes token refresh |
| `KeychainStore` | `nonisolated` (thread-safe `Security` API) | No mutable state |

Cross-actor hops:
- ViewModel calls `await repo.signIn(...)` — `await` parks main, work runs on actor's executor
- Result returned, `await MainActor.run` is implicit on `@MainActor` ViewModel — state update is on main

## 5. Data Model

### SwiftData — new `@Model`

```swift
@Model
final class CachedUser {
    @Attribute(.unique) var userId: String
    var displayName: String
    var avatarURL: URL?
    var lastFetchedAt: Date

    init(userId: String, displayName: String, avatarURL: URL?, lastFetchedAt: Date) {
        self.userId = userId
        self.displayName = displayName
        self.avatarURL = avatarURL
        self.lastFetchedAt = lastFetchedAt
    }
}
```

### Migration

- SwiftData schema: bump `VersionedSchema` from `V1` → `V2`; migration: lightweight (additive only)
- Keychain keys: new key `auth.refresh.v2` (replaces `auth.refresh`); rotate on first launch of v2.0

### Info.plist purpose strings (new)

```xml
<key>NSCameraUsageDescription</key>
<string>We use the camera to scan your ID for verification.</string>
```

### `PrivacyInfo.xcprivacy` delta

```xml
<key>NSPrivacyAccessedAPITypes</key>
<array>
  <dict>
    <key>NSPrivacyAccessedAPIType</key>
    <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
    <key>NSPrivacyAccessedAPITypeReasons</key>
    <array><string>CA92.1</string></array>
  </dict>
</array>
```

## 6. Dependency Injection / Composition

```swift
// App/AppEnvironment.swift
extension EnvironmentValues {
    @Entry var authRepository: any AuthRepository = LiveAuthRepository(
        session: .shared,
        keychain: KeychainStore(service: "io.example.auth")
    )
}

// At view root:
ContentView()
    .environment(\.authRepository, makeAuthRepository())
```

| Dependency | Lifetime | Wired in |
|-----------|----------|----------|
| `AuthRepository` | App-lifetime singleton via environment | `App.body` |
| `OnboardingViewModel` | Per-view (scoped to NavigationStack destination) | `OnboardingView.task { }` |

## 7. Sequence Flow

```
User taps "Sign In"
  └─> OnboardingViewModel.submit() async  (@MainActor)
        └─> AuthRepository.signIn(...)  (actor hop)
              └─> URLSession.data(for:)
                    on 200 → KeychainStore.set(token)  (nonisolated)
                          → User domain object returned
                    on 401 → throw AuthError.invalidCredentials
                    on URLError → throw AuthError.network(_)
        └─> back on MainActor → state = .signedIn(user)
        └─> NavigationPath.append(.home)
```

## 8. File / Module Impact

```
Packages/Onboarding/Sources/Onboarding/
  ├─ OnboardingView.swift                  [new]   — root SwiftUI view
  ├─ OnboardingViewModel.swift             [new]   — @MainActor @Observable VM
  ├─ OnboardingState.swift                 [new]   — enum state machine
  └─ OnboardingNavigator.swift             [new]   — NavigationStack coordinator

Packages/AuthCore/Sources/AuthCore/
  ├─ AuthRepository.swift                  [mod]   — add signUp(_:)
  ├─ LiveAuthRepository.swift              [mod]   — implement signUp
  └─ AuthError.swift                       [new]   — typed error enum

App/
  ├─ AppEnvironment.swift                  [mod]   — register Onboarding flow
  ├─ Info.plist                            [mod]   — add NSCameraUsageDescription
  └─ PrivacyInfo.xcprivacy                 [mod]   — add UserDefaults reason CA92.1
```

## 9. Non-Functional Design

| Concern | Plan |
|---------|------|
| Cold launch impact | +~50ms est. (lazy-load Onboarding module via SPM target dependency only when needed) |
| Memory | Peak +5MB for camera preview (released on view disappear) |
| Binary size | +~120KB after App Thinning |
| Observability | `os.Logger(subsystem: "io.example.app", category: "Auth")`; `signpost` around `signIn` |
| Crash reporting | Sentry breadcrumb on each state transition; Crashlytics `setCustomKey("auth_flow", "onboarding")` |
| Accessibility | All buttons have `accessibilityLabel` + `accessibilityHint`; Dynamic Type tested at AX5; Reduce Motion disables button bounce |

## 10. Rollout & Reversibility

- Remote-config flag: `onboardingV2Enabled` (default `true`; flip `false` to revert to legacy onboarding)
- TestFlight Internal first; External after 48h no P1
- App Store phased release enabled (7-day default)
- Rollback path: (1) flip flag, (2) backend mitigation `forceLegacyOnboarding`, (3) expedited submission

## 11. Risks & Technical Debt

| Risk | Mitigation |
|------|-----------|
| Camera permission denied during onboarding | Skippable; manual entry fallback path |
| Keychain migration fails | On failure, fall back to re-auth flow; log via Sentry |
| SwiftData v2 migration on low-storage device | Lightweight only; verified on iPhone SE 1GB available |

## 12. Open Questions / Risks

| # | Question / Risk | Owner | Status |
|---|----------------|-------|--------|
| 1 | Should we support iOS 15? Currently min 16 | PO | Open |
| 2 | Does the camera scan need a fallback for visionOS? | TL | Open |
