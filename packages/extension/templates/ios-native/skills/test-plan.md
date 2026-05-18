---
name: test-plan
description: Generate a test plan for an iOS native epic. Covers XCTest, XCUITest, snapshot tests, performance via XCTMetric, accessibility, and device matrix across iPhone / iPad / Vision Pro.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Test Plan for Epic $0

You are the **QA Engineer (QA)** agent — a senior iOS test practitioner.
Load your full persona from `.claude/agents/qa.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `test-plan`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read the epic: `docs/sdlc/epics/$0/$0.md`
2. Read the PRD: `docs/sdlc/epics/$0/PRD.md` — acceptance criteria are your inputs
3. Read the tech design: `docs/sdlc/epics/$0/TECH-DESIGN.md` — module/file impact drives unit/integration scope; MainActor map drives concurrency tests
4. Read existing tests / fakes / snapshot baselines in the affected SPM target so new tests match style
5. Read existing `.xctestplan` files (current configurations, sanitizers, device matrix)
6. Read the test plan template: `docs/sdlc/epics/$0/TEST-PLAN.md` or `docs/sdlc/templates/TEST-PLAN-TEMPLATE.md`
7. Fill the test plan with the sections below

## Test Plan Contents

### Test Scope
- Map each AC to one or more test types (Unit / Snapshot / UI / Integration / E2E / Perf / A11y / NFR)
- Call out what is **out of scope** and why

### Device & OS Matrix

| Device class | Device | iOS version | Priority | Why |
|--------------|--------|-------------|----------|-----|
| iPhone — small | iPhone SE (3rd gen) | min supported (16.x) | P1 | Smallest screen + lowest CPU baseline |
| iPhone — modern | iPhone 15 | current (17.x) | P1 | Canonical baseline; snapshot reference |
| iPhone — flagship | iPhone 15 Pro Max | latest (18.x) | P1 | ProMotion 120Hz, Dynamic Island, largest screen |
| iPad | iPad (10th gen) | current | P2 / P1 if iPad in scope | Split View, multitasking |
| iPad Pro | iPad Pro 12.9" | current | P2 | Pencil, Stage Manager |
| Vision Pro | Apple Vision Pro | latest | P1 if visionOS in scope | Spatial layout, gaze-and-pinch |
| Simulator only | (per CI image) | matrix | P1 | CI runs |

Mark which combos are **must-test** (block release) vs. **spot-check** (sample). Note which require real devices (camera, Face ID, NFC, ARKit) and which CI simulators cover.

### `.xctestplan` Configurations

| Configuration | Targets | Sanitizers | When it runs |
|---------------|---------|------------|--------------|
| `Debug-Unit` | All `*Tests` | None | Every PR |
| `Debug-Concurrency` | View-model + repository tests | Thread Sanitizer, Main Thread Checker | Every PR |
| `Release-Smoke` | `AppTests` (XCUITest) | None | Pre-merge to release branch |
| `Snapshot-Verify` | Snapshot test target | None | Every PR (canonical simulator only) |
| `Performance` | Perf-tagged tests | None | Nightly + pre-release |

### Unit Tests — prefix `$0-UT`
- Pure logic, view-model state transitions, parsers, mappers, validators
- `@MainActor` view model: assert state machine using `await fulfillment(of:)` or async expectations
- Deterministic — inject `Clock`, seed random, no real network, no real Keychain
- Boundary conditions: empty, nil, max, duplicates, unicode, RTL, very-long strings

### Snapshot / UI Tests — prefix `$0-UI`
- SwiftUI views via `swift-snapshot-testing`
- Variants per view: light mode × dark mode × Dynamic Type (`.large`, `.accessibility3`) × RTL locale (`ar`, `he`)
- Recorded on canonical simulator (iPhone 15, iOS 17.x) — do NOT record on multiple sims
- Snapshot tests are not in PRs by default — record-mode flag

### Integration Tests — prefix `$0-IT`
- Repository ↔ Network: stub `URLSession` via custom `URLProtocol`
- Repository ↔ Keychain: use isolated test access group; clear in `setUp`/`tearDown`
- Repository ↔ SwiftData: `ModelContainer(isStoredInMemoryOnly: true)`
- Repository ↔ Core Data: in-memory `NSPersistentContainer` with `NSInMemoryStoreType`
- Auth refresh: token expiry → automatic refresh → retried request
- Multi-layer flows within a process

### Contract Tests — prefix `$0-CT`
- `Codable` round-trip for DTOs (encode → decode → equal)
- Schema compatibility with backend OpenAPI / fixture
- AppIntent / Widget shared schema (App Group `UserDefaults` / SwiftData)
- Push payload structure
- Universal Link path matching against `apple-app-site-association`

### End-to-End / XCUITest — prefix `$0-E2E`
- Full flows on simulator with stubbed server (`URLProtocol` injected via `app.launchArguments = ["-UseFakeServer"]`)
- Keep thin — these are flaky and expensive; cover only top-risk flows
- Require accessibility identifiers on every interactive element
- Run on canonical simulator in CI; device farm for sensor-required flows only

### Failure-Mode Tests

- **Network** (`$0-NET`): offline (Network Link Conditioner / Settings → Airplane Mode), slow 3G, packet loss, disconnect mid-call, captive portal
- **Lifecycle** (`$0-LC`): background → foreground, kill & relaunch, deep-link cold start, Handoff continuation, low-memory warning (simulator menu)
- **Permission** (`$0-PM`): first grant, first deny, "Ask Next Time", changed in Settings.app, restricted by parental controls
- **Upstream failure** (`$0-UP`): 4xx / 5xx / timeout / rate-limit from backend; graceful degradation, retry behavior
- **Concurrency** (`$0-CC`): double-tap submit, rapid navigation, simulator with TSAN on; verify `@MainActor` isolation holds

### Non-Functional Tests

- **Performance** (`$0-PF`):
  - Cold launch — `XCTApplicationLaunchMetric`, baseline + 10% threshold
  - Scroll FPS — `XCTOSSignpostMetric` over a representative list
  - Memory — `XCTMemoryMetric`
  - CPU — `XCTCPUMetric`
  - Binary size — `xcodebuild -showBuildSettings` delta vs. main; alert if > 500 KB
- **Accessibility** (`$0-A11Y`):
  - VoiceOver labels/hints/traits via XCUITest `app.descendants(matching: .any)`
  - Dynamic Type at `.accessibility5` — no truncation, no overlapping
  - Color contrast WCAG AA (manual or Accessibility Inspector)
  - Reduce Motion respected (non-essential animations disabled)
- **Security** (`$0-SEC`):
  - Keychain accessibility class verified per stored item
  - ATS exception scan — must be empty
  - Biometric flow: success, failure (wrong face / lockout), passcode fallback
  - No tokens in `os.Logger` output (verify with `log show --predicate`)

### Regression Checklist
- Cold launch < project budget
- Sign-in / sign-up succeeds
- Primary core flow succeeds end-to-end
- Push notification tap → correct deep link
- Background fetch behaves
- (keep the list short and high-signal)

### Test Data Strategy
- Factories / builders for domain types (e.g. `UserFactory.makeUser(id:)`)
- In-memory SwiftData `ModelContainer(isStoredInMemoryOnly: true)` per test
- Keychain isolated per test target via access group
- `URLProtocol` fakes per scenario, registered in `setUp`
- Locale / timezone injected explicitly via `XCTestCase.continueAfterFailure`

### Flaky-Test Policy
- Deterministic: inject `Clock`, seed random, stub network, control time-based animations
- Isolated: each test owns its data (no shared mutable state in `static` properties)
- Idempotent: no order dependencies; `setUp` / `tearDown` reset state
- Quarantine: tag flaky tests with `XCTSkip` + ticket; fix within 1 sprint or delete

## Output

Write the completed test plan to `docs/sdlc/epics/$0/TEST-PLAN.md`.
