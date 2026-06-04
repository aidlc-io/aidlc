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
| `src/components/...` | Add | … |
| `src/...` | Modify | … |

## 3. UI / Component Notes

> *Key decisions: component breakdown, state management, routing, data fetching.*

| Concern | Decision |
|---------|----------|
| Component structure | *(container vs. presentational, where state lives)* |
| State / data fetching | *(local state, store, query cache)* |
| Routing | *(new routes / params added)* |

### Deviations from Tech Design

> *List any places where implementation diverged from `TECH-DESIGN.md` and why.*

None.

## 4. Accessibility & Responsiveness

- [ ] Keyboard navigable (tab order, focus states, no keyboard traps)
- [ ] Semantic HTML / ARIA roles where needed
- [ ] Color contrast meets WCAG AA
- [ ] Works at mobile / tablet / desktop breakpoints
- [ ] Respects `prefers-reduced-motion`

{{#if backend}}
## 4b. API Integration

> This project also has a backend. Record the contract the UI depends on.

| Endpoint | Method | Request → Response shape | Error states handled |
|----------|--------|--------------------------|----------------------|
| `/api/...` | GET | … → … | loading / empty / error |

- [ ] Loading, empty, and error states rendered for every async call
- [ ] Request/response types shared with (or matched to) the backend
{{/if}}

## 5. Unit / Component Tests (TDD — written before the code)

> Tests authored first (red), then the implementation made them pass (green).
> Prefer testing behavior through the rendered DOM over implementation details.

| Test file | Cases (`$EPIC_ID-UT*`) | Type (happy / error / edge) |
|-----------|------------------------|------------------------------|
| `src/components/__tests__/...` | | |

## 6. Whole-Project Coverage (re-run after implementation)

> Required. Coverage is re-run across the **entire** project after the code is
> green — not just the changed files. If the project has no coverage tooling,
> state that here instead of leaving it blank.

| Item | Value |
|------|-------|
| Coverage command | `<project coverage command>` |
| Total coverage | `<N>%` (lines) / `<N>%` (branches) |
| Delta vs base | `<+/- N>%` |
| Meets target | `<yes / no>` (target ≥ 80%) |

## 7. Pre-PR Checklist

- [ ] Component/unit tests written **before** the implementation (TDD)
- [ ] Lint passes (`npm run lint`)
- [ ] Type-check passes (`npm run typecheck`)
- [ ] Full test suite passes (`npm test`)
- [ ] Whole-project coverage re-run and recorded in §6
- [ ] No new console errors / warnings in dev mode
- [ ] Accessibility checklist (§4) reviewed
- [ ] PR body references epic key `$EPIC_ID`
- [ ] Reviewer assigned

## 8. Known Limitations / Follow-ups

- …
