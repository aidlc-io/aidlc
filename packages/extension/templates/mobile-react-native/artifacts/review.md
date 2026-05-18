# Code Review Approval — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Reviewer:** Auto-Reviewer (then Tech Lead)
**Status:** Pending
**Created:** `$DATE`
**Change type:** ⬜ OTA-safe &nbsp;&nbsp; ⬜ Native-required

---

## 1. Review Summary

> *One-paragraph verdict.*

**Verdict:** ⬜ Pass &nbsp;&nbsp; ⬜ Reject

## 2. Acceptance Criteria Validation

| AC | Description | Status | Evidence (file:line) |
|----|-------------|--------|----------------------|
| `$EPIC_ID-AC01` | … | ⬜ Pass / ⬜ Fail / ⬜ Partial | `src/...:42` |
| `$EPIC_ID-AC02` | … | ⬜ Pass / ⬜ Fail | |

## 3. Tech Design Compliance

| Check | Status | Notes |
|-------|--------|-------|
| File impact matches design | ⬜ | Extra: ___ / Missing: ___ |
| Navigation typed (`RootStackParamList`) | ⬜ | |
| State strategy respected (TanStack Query for server, Zustand for client) | ⬜ | |
| Tokens in **SecureStore** (not MMKV / AsyncStorage) | ⬜ | **BLOCKER if fail** |
| API contract matches (Zod parsing at boundary) | ⬜ | |
| Native module decision matches design | ⬜ | |
| Permissions match design (`Info.plist` / `AndroidManifest`) | ⬜ | |
| OTA-vs-Native classification respected | ⬜ | |
| Performance budget respected | ⬜ | Reassure delta: ___ |
| Sentry instrumentation present | ⬜ | breadcrumb on screen change, perf trace on critical flow |
| Source map + Hermes symbol upload step present | ⬜ | |

## 4. Code Quality

| Check | Status | Notes |
|-------|--------|-------|
| TS strict, no `any` on route params / API | ⬜ | |
| Reanimated worklets capture only shareable values | ⬜ | |
| `runOnJS` used at worklet boundary | ⬜ | |
| FlashList for lists > 20 items | ⬜ | |
| Expo Image for cached/network images | ⬜ | |
| `accessibilityLabel`/`Role`/`State` on interactive elements | ⬜ | |
| All `addEventListener` removed in cleanup | ⬜ | |
| No `console.log` in production paths | ⬜ | |
| ESLint + Prettier clean | ⬜ | |
| No new deps without justification | ⬜ | |

## 5. Test Coverage

| Test Case | In Diff? | Notes |
|-----------|---------|-------|
| `$EPIC_ID-UT*` | ⬜ | |
| `$EPIC_ID-CT*` (MSW) | ⬜ | |
| `$EPIC_ID-UI*` (RNTL) | ⬜ | |
| `$EPIC_ID-IT*` | ⬜ | |
| `$EPIC_ID-E2E*` (Detox/Maestro) | ⬜ | |
| `$EPIC_ID-PF*` (Reassure baseline) | ⬜ | |
| `$EPIC_ID-A11Y*` (manual sweep planned) | ⬜ | |

## 6. Issues Found

### Critical / BLOCKER (must fix before approval)

| # | File | Issue | Required action |
|---|------|-------|-----------------|
| 1 | `src/auth/useAuth.ts:42` | Token stored in MMKV instead of SecureStore | Switch to `SecureStore.setItemAsync` |

### Major (should fix in this PR)

| # | File | Issue | Required action |
|---|------|-------|-----------------|
|   |      |       |                 |

### Minor (follow-up acceptable)

| # | File | Issue | Suggested action |
|---|------|-------|------------------|
|   |      |       |                  |

### Nit (style / polish)

| # | File | Comment |
|---|------|---------|
|   |      |         |

## 7. Doc Impact (run `/doc-sync` after merge)

- [ ] `docs/navigation.md` — new screen + linking entry
- [ ] `docs/screens/<screen>.md` — new file
- [ ] `docs/permissions.md` — new permission listed
- [ ] `docs/ota.md` — runtime version note (if bumped)
- [ ] `CHANGELOG.md` — tag `[OTA]` / `[Native]`
- [ ] `docs/migrations/v$0.md` — only if breaking

## 8. Final Decision

- [ ] **APPROVED** — All ACs pass, no critical issues, OTA classification consistent.
- [ ] **REJECTED** — See issues above. Resubmit after fixes.

**Reviewer notes:**

> *(free text)*
