---
name: review
description: Epic-driven code review for React Native. Validates PR / branch / file / working tree against epic docs (PRD, Tech Design, Test Plan). RN-aware — checks navigation typing, worklets, FlashList, MMKV/SecureStore, Reanimated, Expo Image, OTA classification, accessibility.
argument-hint: "[PR-number | file-path | branch-name | blank for uncommitted]"
---

# Code Review (React Native)

You are the **Tech Lead (TL)** agent — a staff-level RN engineer.
Load your full persona from `.claude/agents/tech-lead.md` before starting.
**Every review is grounded in epic docs.** No review without knowing which epic it belongs to.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `review`, epic = detect from branch/PR. If no epic key found → skip gate. If gate fails → STOP.

## Step 1: Detect Input & Get Diff

### Mode A — PR Review (`/review 42` or `/review #42`)

Use `gh` for GitHub PRs (or `glab` for GitLab):
```bash
gh pr view $PR_NUMBER --json title,headRefName,body,files
gh pr diff $PR_NUMBER
```
Extract epic key from PR title or source branch.

Fallback (no API token):
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

### Mode C — File review (`/review path/to/file.tsx`)
1. Read the file
2. `git log --oneline -10 -- $ARGUMENTS` → epic key from history
3. `git diff HEAD -- $ARGUMENTS` for uncommitted

### Mode D — Local changes (`/review` no args)
```bash
git diff
git diff --cached
git log --oneline -10
git branch --show-current
```

**If no epic key found**: ask the user. Do NOT proceed without an epic key.

## Step 2: Load Epic Context

```
docs/sdlc/epics/{{EPIC_PREFIX}}-XXXX/
├── {{EPIC_PREFIX}}-XXXX.md     ← Scope, user stories, affected areas
├── PRD.md                       ← ACs (source of truth)
├── TECH-DESIGN.md               ← Navigation, state, native modules, OTA, file impact
├── TEST-PLAN.md                 ← Detox/Maestro flows, device matrix, Reassure baselines
├── APPROVAL.md                  ← Pre-implementation approval
```

Also read affected docs (per epic's "Affected Areas"): screen catalog, hooks reference, native modules, permissions, EAS profile.

## Step 3: Validate Against PRD

| AC ID | Criteria | Status | Evidence |
|-------|----------|--------|----------|
| `{{EPIC_PREFIX}}-XXXX-AC01` | … | ✅ / ❌ / ⚠️ | `src/.../File.tsx:42` |

Flag:
- AC not implemented → 🔴 **BLOCKER**
- Partial → 🟠 **MAJOR**
- Differs from PRD → 🟡 divergence (flag for doc-sync)

## Step 4: Validate Against Tech Design

### File impact
- Files in tech design but missing → ❌ missing implementation
- Files in diff but not in tech design → scope creep or missed design step

### Navigation
- New screens added to `RootStackParamList` (typed) → ✅
- Linking config updated for deep links → ✅
- Lazy-load at navigator boundary as designed → ✅

### State strategy
- Server state via TanStack Query (not in Zustand) → ✅
- Tokens in SecureStore (NOT in MMKV / AsyncStorage / module vars) → must be ✅, else 🔴 BLOCKER
- Form state via RHF + Zod resolver → ✅
- Persistent UI state via MMKV → ✅

### Native module decisions
- Decision matches tech design (community / Expo / custom TurboModule)
- Permission strings added to `app.config.ts` per design
- Privacy Manifest entries added for new required-reason APIs

### OTA classification
- Native-change PR → `app.config.ts` native field bumped (version code/build number where applicable)? → ✅
- JS-only PR → no native changes? → ✅
- If runtime version policy is `fingerprint`, has the fingerprint changed in CI?

### API contract
- Request / response shapes match tech design
- Zod schemas at boundary
- Error envelope handled

### Non-functional
- Performance budget targets respected (cold start, TTI, FPS) — manual estimate or Reassure delta
- Sentry breadcrumbs/spans added as designed
- Accessibility labels/roles/states present

### Rollout
- Feature flag exists for risky changes
- Phased rollout doc updated

**Divergences** → flag for `/doc-sync` in Step 7.

## Step 5: Validate Against Test Plan

- Unit tests in diff match `{{EPIC_PREFIX}}-XXXX-UT*` entries
- MSW contract tests for new endpoints
- RNTL component tests for new screens (queries by accessibility role/label, not testID)
- Detox or Maestro flow for top-risk E2E
- Reassure baseline added/updated for new heavy screens
- Failure-mode tests where required (network, permission, lifecycle, push)

Flag:
- Test plan says X, not in diff → 🟠 MAJOR
- New logic without test → 🟡 MINOR (or MAJOR in critical path)

## Step 6: Code Quality (RN-aware)

### Architecture & Design
- [ ] Layer respected: screens → hooks → services → native modules
- [ ] No layer-skipping (screen calling `NativeModules.X` directly)
- [ ] External deps behind interfaces (testable seam)
- [ ] Subscriptions disposed (`AppState`, `Linking`, `Notifications`, `Keyboard`, `Dimensions`)

### Correctness & Types
- [ ] TS strict; no `any` / `as any` on route params
- [ ] Zod parsing at every external boundary
- [ ] Discriminated unions for state
- [ ] Exhaustive `switch` with `never` default

### Concurrency / Threading
- [ ] Reanimated worklets capture only shareable values
- [ ] `runOnJS` used to push values back to JS thread
- [ ] No JS-thread `Animated` for gesture-driven motion
- [ ] `useDeferredValue` / `useTransition` on heavy filters where useful
- [ ] AppState `active` → query refetch / WS reconnect

### Error Handling
- [ ] No silent `catch {}` — at minimum `Sentry.captureException`
- [ ] User-facing copy at presentation layer (i18n keys)
- [ ] Native module calls wrapped in try/catch where they can throw

### Security
- [ ] **Tokens in SecureStore, never MMKV/AsyncStorage** (grep `setItem.*token` / `mmkv.*token`) — any violation = 🔴 BLOCKER
- [ ] HTTPS only; no `usesCleartextTraffic`
- [ ] Deep link payload validated
- [ ] No secrets in `app.config.ts.extra` for prod
- [ ] Sentry PII scrubber configured
- [ ] ProGuard / R8 enabled on Android release

### Performance
- [ ] FlashList for lists > 20 items, accurate `estimatedItemSize`
- [ ] Expo Image for cached / network images
- [ ] No inline render functions on FlashList rows
- [ ] `React.memo` used judiciously — only where profiler indicates
- [ ] No synchronous storage reads on cold-start critical path
- [ ] Lazy-load at navigator boundary

### Observability
- [ ] Sentry breadcrumb on navigation change
- [ ] `Sentry.setUser` on auth state change
- [ ] Performance trace on critical interaction
- [ ] Source map + Hermes symbol upload step still present (release config)
- [ ] No `console.log` in production paths

### Accessibility
- [ ] `accessibilityLabel`, `accessibilityRole`, `accessibilityState` on interactive elements
- [ ] Touch targets ≥ 44×44 iOS / 48×48 dp Android
- [ ] Dynamic Type / font scaling respected
- [ ] `accessibilityElementsHidden` on decorative wrappers

### Platform-Specific
- **iOS**: `Info.plist` strings sane (no Lorem); Privacy Manifest updated; ATT prompt if tracking added; min iOS version respected
- **Android**: `AndroidManifest.xml` permissions match design; `targetSdkVersion` ≥ Play requirement; POST_NOTIFICATIONS runtime grant for API 33+; data safety form reviewed
- **Both**: keyboard handling (KeyboardAvoidingView or react-native-keyboard-controller), safe area (`SafeAreaView` / `react-native-safe-area-context`), status bar style

### Style / Linting
- [ ] ESLint clean (project config — `@react-native`, `eslint-plugin-react-hooks`, `eslint-plugin-react-native`, `eslint-plugin-import`)
- [ ] Prettier clean
- [ ] No unused imports / dead code
- [ ] File / component size within project limits
- [ ] Naming follows project conventions (`useFoo`, `FooScreen`, `useFooStore`)

## Step 7: Doc Impact

Compare diff vs affected docs (screens catalog, hooks ref, native module docs, permissions, EAS profile docs):
- Code contradicts existing docs? → flag for `/doc-sync`
- New behavior not documented? → flag
- Breaking change without migration note? → 🟠 MAJOR

## Output Format

```markdown
## Review: PR #XX — [{{EPIC_PREFIX}}-XXXX] Title
(or: Review: branch feature/{{EPIC_PREFIX}}-XXXX-name)
(or: Review: local changes for {{EPIC_PREFIX}}-XXXX)

**Source**: feature/{{EPIC_PREFIX}}-XXXX-name → main
**Files changed**: X files (+Y, -Z)
**Epic**: [{{EPIC_PREFIX}}-XXXX](docs/sdlc/epics/{{EPIC_PREFIX}}-XXXX/{{EPIC_PREFIX}}-XXXX.md)
**Change type**: [OTA-safe] / [Native-required]

### Epic Docs Loaded
- [x] Epic doc — scope: [summary]
- [x] PRD — N ACs
- [x] Tech Design — N files planned, OTA classification: [OTA] / [Native]
- [x] Test Plan — N test cases
- [ ] Approval — approved / NOT approved

### PR Conventions
- Title `[{{EPIC_PREFIX}}-XXXX]`: ✅ / ❌
- Branch naming: ✅ / ❌
- Description filled: ✅ / ❌

### Acceptance Criteria vs Code
| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| {{EPIC_PREFIX}}-XXXX-AC01 | ... | ✅ | `src/...:42` |
| {{EPIC_PREFIX}}-XXXX-AC02 | ... | ❌ Missing | not in diff |

### Tech Design vs Code
| Check | Status | Notes |
|-------|--------|-------|
| File impact matches | ✅ / ⚠️ | Extra: X / Missing: Y |
| Navigation typed | ✅ / ❌ | |
| State strategy | ✅ / ⚠️ | Deviated from design |
| OTA classification | ✅ / ❌ | Native change without binary build |
| API contract | ✅ / ⚠️ | Field differs: ... |
| Native module decision | ✅ / ⚠️ | |
| Permissions match | ✅ / ❌ | |
| Performance budget | ✅ / ⚠️ | Reassure delta +X% |
| Rollout (flag / phased) | ✅ / ⚠️ | |

### Test Coverage vs Test Plan
| Test Case | In Diff? | Notes |
|-----------|---------|-------|
| {{EPIC_PREFIX}}-XXXX-UT01 | ✅ / ❌ | |
| {{EPIC_PREFIX}}-XXXX-IT01 | ✅ / ❌ | |
| {{EPIC_PREFIX}}-XXXX-E2E01 | ✅ / ❌ | Detox/Maestro |
| {{EPIC_PREFIX}}-XXXX-PF01 | ✅ / ❌ | Reassure baseline |

### Code Quality Findings

🔴 **BLOCKER** — `src/auth/useAuth.ts:42` — token stored in MMKV instead of SecureStore.
   Suggestion: use `SecureStore.setItemAsync('token', value)`.

🟠 **MAJOR** — `src/screens/FeedScreen.tsx:88` — FlatList on 500-item list; switch to FlashList per tech design.

🟡 **MINOR** — `src/components/Avatar.tsx:15` — raw `Image` instead of `expo-image`; misses cache + blurhash placeholder.

🔵 **NIT** — `src/i18n/en.json:120` — copy could be punctuation-clean.

### Doc Impact
- `docs/navigation.md` — new screen needs entry
- `docs/permissions.md` — new POST_NOTIFICATIONS entry
- `docs/ota.md` — runtime version policy unchanged → OK

### Verdict
✅ **Approve** / ⚠️ **Approve with comments** / ❌ **Changes requested**

**Reason**: [one sentence]
```
