---
name: tech-design
description: Generate or review a Technical Design document for an iOS native epic. Produces SwiftUI/UIKit architecture, SPM module layout, MainActor boundaries, persistence migration plan, Privacy Manifest delta, and rollout strategy.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Tech Design for Epic $0

You are the **Tech Lead (TL)** agent — a staff-level iOS engineer.
Load your full persona from `.claude/agents/tech-lead.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `design`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read the epic doc: `docs/sdlc/epics/$0/$0.md`
2. Read the PRD: `docs/sdlc/epics/$0/PRD.md` (must be complete first)
3. Read the tech design template: `docs/sdlc/epics/$0/TECH-DESIGN.md` or `docs/sdlc/templates/TECH-DESIGN-TEMPLATE.md`
4. Analyze the existing codebase:
   - Project architecture (`CLAUDE.md`, `README.md`, root `Package.swift`)
   - Composition root (`App` struct, `AppDelegate`, environment factory closures)
   - Existing SwiftData / Core Data model, Keychain wrapper, network client, design system module
   - Relevant source files in affected SPM target(s) (use Glob/Grep)
   - Related ADRs (`docs/adr/`)
   - Current `PrivacyInfo.xcprivacy` and `Info.plist`
5. Fill the tech design with the sections below

## Tech Design Contents

### Summary
- One paragraph: what's being built, SwiftUI vs UIKit choice, key architectural decisions

### Architecture
- **Layer diagram** — Feature module → ViewModel → UseCase → Repository → Data source
- **SPM module layout** — which feature targets are new / modified; dependency graph between targets
- **SwiftUI vs UIKit choice** — justify; if UIKit interop, name the `UIViewRepresentable` / `UIHostingController` boundary
- **Key design choices** with rationale (especially non-obvious trade-offs: actor vs MainActor view model, SwiftData vs Core Data, `@Observable` vs `ObservableObject`)
- Link to ADRs for any irreversible decision (persistence schema change, public AppIntent contract, framework swap)

### Protocol / Interface Contract
- New / modified Swift `protocol`s at layer boundaries
- Method signatures: `async`, `throws`, `@MainActor`, `Sendable`, generic constraints
- Error types — typed `enum MyError: Error` per domain
- Codable DTOs at the boundary (request/response shapes for any new endpoint)
- AppIntent / Widget / Live Activity contract (if applicable)
- Deep-link / Universal Link path (if applicable) + `apple-app-site-association` delta

### MainActor / Concurrency Map
- For every new type: which actor isolates it? `@MainActor`, `actor MyRepo`, `nonisolated`, default
- Cross-actor calls: where does `await MainActor.run { }` or `await viewModel.update()` happen?
- `Sendable` conformance: which types cross actor boundaries
- Cancellation strategy: which `Task`s are parented to view (`.task { }`) vs detached vs `TaskGroup`

### Data Model
- New / modified SwiftData `@Model` or Core Data entity definitions
- Migration strategy:
  - SwiftData: `VersionedSchema` + `MigrationPlan` for non-trivial changes
  - Core Data: lightweight migration if rename-mapping fits; otherwise mapping model `.xcmappingmodel`
- Keychain keys added/changed (key string, access class, access group)
- `UserDefaults` keys added (key, type) — keep this list short; non-preference data goes in SwiftData/Core Data
- Indexes / fetched-properties / inverse relationships

### State Management
- Where state lives (SwiftUI `@State` / `@Observable` ViewModel / repository in-memory / SwiftData / Keychain / server)
- Lifecycle (created on view appear, destroyed on disappear / scoped to App / persistent)
- Synchronization strategy (source of truth, propagation via `@Published` / `@Observable` / `AsyncSequence`, invalidation)

### Sequence / Flow
- Key interaction flow across layers
- Include `await` call sites, MainActor hops, error paths, retry paths
- Use a sequence-diagram-style notation in code fence:

```
User taps "Sign In" (MainActor)
  └─> SignInViewModel.signIn() async  (MainActor)
        └─> AuthRepository.authenticate(...)  (nonisolated, hops to Task)
              └─> URLSession.data(for:)
                    on success → KeychainStore.set(token) (background actor)
                    on 401     → SignInError.invalidCredentials
                    on offline → SignInError.network
        └─> back on MainActor → publish state .signedIn or .error(...)
```

### Dependency Injection / Composition
- How new components are wired in `App` struct or `AppDelegate`
- Environment values added: `environmentObject(...)` or `environment(\.myService, ...)`
- Factory closures vs concrete types in the composition root
- Lifetimes (singleton on app launch, scoped to feature module, transient per-view)

### Navigation Changes
- New `NavigationStack` destinations / `NavigationPath` types
- New deep links / Universal Links / URL schemes
- New AppIntents exposed to Shortcuts / Siri

### Non-Functional Design
- **Performance budget** — cold-launch p95 (impact in ms), scroll FPS, memory peak, binary size delta (after App Thinning estimate)
- **Reliability** — `URLSession` retry policy, timeout, backoff, BGTaskScheduler usage and expiration handler
- **Security & privacy** — Keychain accessibility class for any new token, ATS posture, biometric gating, threat model summary
- **Privacy Manifest delta** — new `NSPrivacyAccessedAPITypes` entries, new third-party SDK with its own manifest
- **Info.plist purpose strings** — new permission usage descriptions (exact copy proposed)
- **App Privacy Nutrition Label delta** — new data collection categories
- **Observability** — `os.Logger` subsystems/categories added, `os.signpost` for Instruments, MetricKit metrics watched, Sentry/Crashlytics tagging
- **Accessibility** — VoiceOver labels/hints plan, Dynamic Type support, Reduce Motion behavior, contrast verification
- **Localization** — new strings, RTL support, plural rules, formatter usage (date/number/measurement)
- **Compatibility** — minimum iOS version; iPad Split View support; Vision Pro support (if applicable)
- **Offline / resilience** — cached data strategy, queued mutations, sync-on-reconnect

### Rollout & Reversibility
- Remote-config flag(s) added (key name, default value, kill-switch behavior)
- TestFlight cohort plan (internal first; external for which user segment)
- App Store Connect phased release (7-day default; faster if low-risk)
- Rollback path: kill-switch flag → backend mitigation → expedited submission (in that order)

### File / Module Impact
- Complete list: new / modified / deleted, grouped by SPM target
- For each modified file, one-line reason
- Example format:

```
Packages/Feature/Onboarding/Sources/Onboarding/
  ├─ OnboardingView.swift                  [new]   — root SwiftUI view
  ├─ OnboardingViewModel.swift             [new]   — @MainActor @Observable VM
  └─ OnboardingNavigator.swift             [new]   — NavigationStack coordinator

Packages/Core/Auth/Sources/Auth/
  └─ AuthRepository.swift                  [mod]   — add `signUp(_:)` async throws

App/
  ├─ AppEnvironment.swift                  [mod]   — register Onboarding flow
  └─ PrivacyInfo.xcprivacy                 [mod]   — add NSUserDefaults reason
```

### Risks & Technical Debt
- Risks with mitigations (especially App Review-affecting and irreversible)
- Intentional shortcuts and when they'll be paid back

### Open Questions
- Questions that should block implementation until answered, and who answers them

## Architecture Rules (iOS-Specific)

- Layer boundaries are one-way: View → ViewModel → UseCase → Repository → Data source
- Every external dependency (URLSession, Keychain, FileManager, clock, UserDefaults, push, location) sits behind a `protocol` for XCTest fakes
- No singletons except true system services (`NotificationCenter.default`, `FileManager.default`); everything else wired explicitly
- Long-lived resources (`AnyCancellable`, `Task`, observers) have explicit disposal paths
- Breaking changes to SwiftData/Core Data schema or Keychain keys require a migration plan
- `@MainActor` only where UI is touched; heavy work on background actor or `Task.detached` with rationale
- Privacy Manifest and Info.plist purpose strings updated in this design — not deferred to implementation

## Output

Write the completed tech design to `docs/sdlc/epics/$0/TECH-DESIGN.md`.
