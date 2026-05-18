---
name: review
description: Epic-driven code review for iOS native code. Validates PR / branch / file / working tree against epic docs (PRD, Tech Design, Test Plan) with iOS-specific quality gates.
argument-hint: "[PR-number | file-path | branch-name | blank for uncommitted]"
---

# Code Review

You are the **Tech Lead (TL)** agent — a staff-level iOS engineer.
Load your full persona from `.claude/agents/tech-lead.md` before starting.
**Every review is grounded in epic docs.** No review without knowing which epic it belongs to.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `review`, epic = detect from branch/PR. If no epic key found → skip gate. If gate fails → STOP.

## Step 1: Detect Input & Get Diff

### Mode A — PR Review (`/review 42` or `/review #42`)

Use the project's source-control platform (GitHub / GitLab / Bitbucket) to fetch PR metadata, diff, and comments.
Extract epic key (`{{EPIC_PREFIX}}-XXXX`) from PR title or source branch name.

**If API token not available**: fall back to git-based review:
```bash
git fetch origin
git diff origin/<default-branch>...origin/<source-branch>
```

### Mode B — Branch diff (`/review feature/{{EPIC_PREFIX}}-2100-feature-name`)

```bash
git fetch origin
git log --oneline origin/<default-branch>..origin/$ARGUMENTS --no-merges
git diff origin/<default-branch>...origin/$ARGUMENTS
```

Extract epic key from branch name.

### Mode C — File review (`/review path/to/File.swift`)

1. Read the file at the path
2. `git log --oneline -10 -- $ARGUMENTS` to find epic key from commit history
3. `git diff HEAD -- $ARGUMENTS` for uncommitted changes

### Mode D — Local changes (`/review` with no args)

```bash
git diff                    # Unstaged changes
git diff --cached           # Staged changes
git log --oneline -10       # Recent commits for epic key
git branch --show-current   # Current branch for epic key
```

Extract epic key from branch name or recent commit messages.

**If no epic key found**: ask the user which epic this belongs to. Do NOT proceed without an epic key.

---

## Step 2: Load Epic Context

Once you have the epic key, read ALL epic docs:

```
docs/sdlc/epics/{{EPIC_PREFIX}}-XXXX/
├── {{EPIC_PREFIX}}-XXXX.md    ← Scope, user stories, affected areas
├── PRD.md                      ← Acceptance criteria (source of truth)
├── TECH-DESIGN.md              ← Architecture, protocols, file impact, MainActor map
├── TEST-PLAN.md                ← XCTest / XCUITest / snapshot / perf cases
├── APPROVAL.md                 ← Pre-implementation approval
```

Also read:
- `PrivacyInfo.xcprivacy` (verify delta from tech design landed)
- `Info.plist` purpose strings (verify new entries match design)
- Affected SPM target's `Package.swift` (verify dependency changes match design)

---

## Step 3: Validate Against PRD

For each acceptance criteria in `PRD.md`:

| AC ID | Criteria | Implemented? | Evidence (file:line) |
|-------|----------|--------------|----------------------|
| {{EPIC_PREFIX}}-XXXX-AC01 | Given/When/Then | ✅ / ❌ / ⚠️ Partial | `Packages/Feature/Sources/Feature/View.swift:42` |

Flag:
- AC not implemented → 🔴 **BLOCKER**
- AC partially implemented → 🟠 **MAJOR**
- AC implemented differently from PRD → 🟡 divergence (doc-sync needed)

---

## Step 4: Validate Against Tech Design

**File / module impact**:
- Files listed in tech design but missing from diff → missing implementation?
- Files in diff but not in tech design → scope creep or missed design step?
- SPM `Package.swift` changes match design's dependency plan?

**Architecture**:
- Layer mapping respected (View → ViewModel → UseCase → Repository → Data source)?
- No layer-skipping (e.g. View directly calling Repository)?
- Composition / DI wiring updated as planned?
- SwiftUI vs UIKit choice matches design?
- `@MainActor` boundaries match design's concurrency map?
- Protocol contracts match design (signatures, `async`, `throws`, `Sendable`)?

**Persistence**:
- SwiftData / Core Data schema changes match design?
- Migration plan implemented (VersionedSchema / mapping model)?
- Keychain keys + accessibility classes match design?

**Privacy & permissions**:
- `PrivacyInfo.xcprivacy` updated per design?
- New Info.plist purpose strings present with the proposed copy?
- New third-party SDKs have their Privacy Manifest bundled?

**Non-functional**:
- Performance-impacting code (launch path, scroll path) reviewed?
- Observability signals added (`os.Logger`, MetricKit subscription, Sentry/Crashlytics tags) where design called for them?
- Remote-config flag added for risky paths?

**Divergences** → flag for doc-sync in Step 7.

---

## Step 5: Validate Against Test Plan

From `TEST-PLAN.md`:
- Unit tests in diff match `{{EPIC_PREFIX}}-XXXX-UT*` entries?
- Snapshot tests added for new SwiftUI views (`{{EPIC_PREFIX}}-XXXX-UI*`)?
- Integration tests with `URLProtocol` / in-memory SwiftData (`{{EPIC_PREFIX}}-XXXX-IT*`)?
- XCUITest for end-to-end flows (`{{EPIC_PREFIX}}-XXXX-E2E*`)?
- Performance tests with `XCTMetric` baselines (`{{EPIC_PREFIX}}-XXXX-PF*`) for any launch/scroll-impacting code?
- Accessibility tests (`{{EPIC_PREFIX}}-XXXX-A11Y*`) for new interactive surfaces?
- Failure-mode tests (`-NET`, `-LC`, `-PM`, `-UP`, `-CC`) where applicable?

Flag:
- Test plan says test X should exist, not in diff → 🟠 **MAJOR**
- New view-model / repository without any unit test → 🟠 **MAJOR**
- New SwiftUI view without snapshot test → 🟡 **MINOR**

---

## Step 6: iOS-Specific Code Quality

### Architecture & Design
- [ ] Layer boundaries respected; no `import Feature` from `Repository`
- [ ] External dependencies (URLSession, Keychain, FileManager, clock) behind a `protocol`
- [ ] No singletons except true system services
- [ ] Resource disposal: every escaping closure captures `[weak self]`; `AnyCancellable` stored in lifecycle-scoped `Set`; `Task` parented via `.task { }` or detached with rationale
- [ ] `NotificationCenter` / KVO observers removed in `deinit`

### Concurrency
- [ ] `@MainActor` on view models touching UI
- [ ] No `DispatchSemaphore.wait()` on main thread
- [ ] No synchronous Keychain on main during launch
- [ ] Heavy work off main (`Task.detached` or actor isolation)
- [ ] `Sendable` conformance correct for cross-actor types
- [ ] No data races flagged by Swift 6 strict concurrency
- [ ] `try Task.checkCancellation()` at long-running points

### Correctness & Types
- [ ] No `Any` / `AnyObject` casts on user-driven paths
- [ ] No `try!` / `!` / `as!` on user-driven paths (only on compile-time-proved invariants)
- [ ] Exhaustive `switch` on `enum`s; no spurious `default:` to silence
- [ ] `Codable` DTOs decoded at boundary; mapped to domain types

### Error Handling
- [ ] Typed errors (`enum MyError: Error`) at domain boundaries
- [ ] No silent `try?` on critical paths
- [ ] Errors mapped to user-facing strings at the view layer
- [ ] `assertionFailure` for programmer errors in debug

### Memory & Retain Cycles
- [ ] `[weak self]` in every escaping closure: `Combine.sink`, `Task { }`, `NotificationCenter.addObserver`, delegate callbacks
- [ ] UIKit interop: `weak` delegates; no strong-ref cycles in `Coordinator` chains
- [ ] `URLSession` task `cancel()` on view disappear / scope destruction
- [ ] No retained `Image` / `Data` blobs in `static` properties or singletons

### Security & Privacy
- [ ] Tokens in Keychain with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` (or design-justified alternative)
- [ ] No hardcoded URLs / API keys / secrets in source, `Info.plist`, or xcconfig committed to git
- [ ] ATS HTTPS-only (no `NSAllowsArbitraryLoads` without ADR)
- [ ] No PII or tokens in `os.Logger` (use `.private` interpolation)
- [ ] `PrivacyInfo.xcprivacy` updated for any new required-reason API usage
- [ ] Info.plist purpose strings match permissions actually requested
- [ ] ATT prompt copy matches App Store Connect

### Performance
- [ ] No N+1 SwiftData fetch loops
- [ ] Unbounded `List` replaced with `LazyVStack` / paginated source
- [ ] Heavy work (image decode, large JSON parse, crypto) off main
- [ ] No synchronous network calls
- [ ] `URLSession.shared` only when no auth; otherwise project's configured client

### Observability
- [ ] `os.Logger(subsystem:category:)` used (not `print()`)
- [ ] Sensitive data marked `.private` in interpolations
- [ ] MetricKit / Sentry / Crashlytics tags added where design called for them
- [ ] No `print()` left in production paths

### iOS Platform
- [ ] Lifecycle: SwiftUI `.task { }` for async work tied to view; UIKit `viewWillDisappear` / `deinit` for cleanup
- [ ] Background tasks via `BGTaskScheduler` with expiration handler; no UI updates from background actor
- [ ] Deep-link handling via `onOpenURL` / `UIApplicationDelegate.application(_:open:options:)`
- [ ] Universal Link path matches `apple-app-site-association`
- [ ] App Extensions (Widget / Live Activity / Share / Intents) share data via App Group, not standalone storage

### Accessibility
- [ ] `accessibilityLabel` / `accessibilityHint` / `accessibilityValue` / `accessibilityAction` on every custom interactive view
- [ ] Dynamic Type via semantic font tokens (`.body`, `.headline`); no hardcoded sizes
- [ ] `@Environment(\.accessibilityReduceMotion)` respected for non-essential animation
- [ ] Color contrast verified light + dark
- [ ] Accessibility identifiers present for XCUITest hooks

### Style / Linting
- [ ] SwiftLint clean (or violations have justified `// swiftlint:disable`)
- [ ] SwiftFormat clean
- [ ] Naming matches project conventions (UpperCamelCase types, lowerCamelCase methods, descriptive not abbreviated)
- [ ] No dead code or commented-out blocks
- [ ] File / function size within project limits

---

## Step 7: Check Doc Impact

Compare diff against domain / reference / privacy docs:
- DocC `public` API surface changed?
- AppIntent contract changed?
- SwiftData schema changed (migration guide needed)?
- Keychain key changed (rotation note needed)?
- New Universal Link path (update `apple-app-site-association` doc)?
- `PrivacyInfo.xcprivacy` updated — App Privacy Nutrition Label answers need updating in App Store Connect?

→ flag for `/doc-sync` in verdict.

---

## Output Format

```markdown
## Review: PR #XX — [{{EPIC_PREFIX}}-XXXX] Title
(or: Review: branch feature/{{EPIC_PREFIX}}-XXXX-name)
(or: Review: local changes for {{EPIC_PREFIX}}-XXXX)

**Source**: feature/{{EPIC_PREFIX}}-XXXX-name → <default-branch>
**Files changed**: X files (+Y, -Z)
**Epic**: [{{EPIC_PREFIX}}-XXXX](docs/sdlc/epics/{{EPIC_PREFIX}}-XXXX/{{EPIC_PREFIX}}-XXXX.md)

### Epic Docs Loaded
- [x] Epic doc — scope: [summary]
- [x] PRD — N acceptance criteria
- [x] Tech Design — N files planned, MainActor map present
- [x] Test Plan — N test cases defined
- [ ] Approval — approved / NOT approved

### PR Conventions
- Title format `[{{EPIC_PREFIX}}-XXXX]`: ✅ / ❌
- Branch naming: ✅ / ❌
- Description filled: ✅ / ❌

### Acceptance Criteria vs Code
| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| {{EPIC_PREFIX}}-XXXX-AC01 | ... | ✅ Implemented | `Packages/Feature/Sources/Feature/View.swift:42` |
| {{EPIC_PREFIX}}-XXXX-AC02 | ... | ❌ Missing | Not found in diff |
| {{EPIC_PREFIX}}-XXXX-AC03 | ... | ⚠️ Partial | `View.swift:88` — missing error state |

### Tech Design vs Code
| Check | Status | Notes |
|-------|--------|-------|
| SPM module impact matches | ✅ / ⚠️ | Extra: X / Missing: Y |
| Protocol contracts | ✅ / ⚠️ | Field differs: ... |
| MainActor boundaries | ✅ / ⚠️ | View model `Foo` missing `@MainActor` |
| Composition / DI wiring | ✅ / ❌ | Missing environment registration |
| Persistence schema + migration | ✅ / ⚠️ | |
| PrivacyInfo.xcprivacy delta | ✅ / ⚠️ | |
| Info.plist purpose strings | ✅ / ⚠️ | |
| Remote-config flag | ✅ / ⚠️ | |

### Test Coverage vs Test Plan
| Test Case | In Diff? | Notes |
|-----------|---------|-------|
| {{EPIC_PREFIX}}-XXXX-UT01 | ✅ / ❌ | |
| {{EPIC_PREFIX}}-XXXX-UI01 (snapshot) | ✅ / ❌ | |
| {{EPIC_PREFIX}}-XXXX-IT01 | ✅ / ❌ | |
| {{EPIC_PREFIX}}-XXXX-E2E01 | ✅ / ❌ | |

### Code Quality Findings

🔴 **BLOCKER** — [file:line] description
   Suggestion: ...

🟠 **MAJOR** — [file:line] description
   Suggestion: ...

🟡 **MINOR** — [file:line] description

🔵 **NIT** — [file:line] suggestion

### Doc Impact
After merge, these docs need updating (run `/doc-sync`):
- `Sources/Feature/Feature.docc/...` — public API renamed
- `docs/privacy/app-privacy.md` — new data category collected
- `docs/architecture/persistence.md` — SwiftData schema v2

### Verdict
✅ **Approve** / ⚠️ **Approve with comments** / ❌ **Changes requested**

**Reason**: [one sentence]
```
