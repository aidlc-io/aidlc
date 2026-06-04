# Implementation Summary — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Developer
**Branch:** `feature/$EPIC_ID-<slug>`
**Status:** Draft
**Created:** `$DATE`

---

## 1. Branch & PR

| Item   | Value |
|--------|-------|
| Branch | `feature/$EPIC_ID-<slug>` |
| PR     | *(link once opened)* |
| Base   | `main` |

## 2. Files Changed

| File | Type | Description |
|------|------|-------------|
| `src/...` | Add | … |
| `src/...` | Modify | … |

## 3. Implementation Notes

> *Key decisions made during implementation. Reference design doc sections where relevant.*

### Deviations from Tech Design

> *List any places where implementation diverged from `TECH-DESIGN.md` and why.*

None.

## 4. Unit Tests (TDD — written before the code)

> Tests were authored first (red), then the implementation made them pass (green).

| Test file | Cases (`$EPIC_ID-UT*`) | Type (happy / error / edge) |
|-----------|------------------------|------------------------------|
| `src/__tests__/...` | | |

## 5. Whole-Project Coverage (re-run after implementation)

> Required. Coverage is re-run across the **entire** project after the code is
> green — not just the changed files. If the project has no coverage tooling,
> state that here instead of leaving it blank.

| Item | Value |
|------|-------|
| Coverage command | `<project coverage command>` |
| Total coverage | `<N>%` (lines) / `<N>%` (branches) |
| Delta vs base | `<+/- N>%` |
| Meets target | `<yes / no>` (target ≥ 80%) |

## 6. Pre-PR Checklist

- [ ] Unit tests written **before** the implementation (TDD)
- [ ] Lint passes (`npm run lint`)
- [ ] Type-check passes (`npm run typecheck`)
- [ ] Full unit-test suite passes (`npm test`)
- [ ] Whole-project coverage re-run and recorded in §5
- [ ] No new console errors in dev mode
- [ ] PR body references epic key `$EPIC_ID`
- [ ] Reviewer assigned

## 7. Known Limitations / Follow-ups

- …
