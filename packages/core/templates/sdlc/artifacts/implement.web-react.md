# Implementation Summary — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Developer
**Branch:** `feature/$EPIC_ID-<slug>`
**Status:** Draft
**Created:** `$DATE`
**Stack:** React

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
| `src/hooks/...` | Add | … |
| `src/...` | Modify | … |

## 3. Component & Hook Design

| Concern | Decision |
|---------|----------|
| New components | *(name, props contract, where rendered)* |
| Custom hooks | *(name, inputs/outputs, what side-effects they own)* |
| State | *(useState / useReducer / context / external store — and why)* |
| Data fetching | *(query lib cache key, suspense vs. effect, invalidation)* |
| Memoization | *(any `useMemo`/`useCallback`/`memo` and the cost they avoid)* |

### Re-render / performance notes

> *Call out anything done to avoid wasteful re-renders (stable identities,
> key choices, list virtualization). State "none needed" if N/A.*

### Deviations from Tech Design

> *List any places where implementation diverged from `TECH-DESIGN.md` and why.*

None.

## 4. Accessibility

- [ ] Interactive elements are real buttons/links (or have correct `role`)
- [ ] Keyboard navigable, visible focus states, no keyboard traps
- [ ] Labels/`aria-*` on inputs; errors announced
- [ ] Color contrast meets WCAG AA
- [ ] Respects `prefers-reduced-motion`

{{#if backend}}
## 4b. API Integration

| Endpoint | Method | Request → Response shape | Query/mutation key | Error states |
|----------|--------|--------------------------|--------------------|--------------|
| `/api/...` | GET | … → … | `['...']` | loading / empty / error |

- [ ] Loading, empty, and error states rendered for every async call
- [ ] Response types shared with (or matched to) the backend
{{/if}}

## 5. Tests (TDD — React Testing Library)

> Tests authored first (red), then the implementation made them pass (green).
> Query by **role/label/text** (what the user sees), not by test-id or
> internal component state. Use `userEvent` for interactions.

| Test file | Cases (`$EPIC_ID-UT*`) | Type (happy / error / edge) |
|-----------|------------------------|------------------------------|
| `src/components/__tests__/...` | | |
| `src/hooks/__tests__/...` | | |

- [ ] Hooks tested via a component or `renderHook`
- [ ] Async UI asserted with `findBy*` / `waitFor` (no arbitrary timeouts)

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

- [ ] Component/hook tests written **before** the implementation (TDD)
- [ ] Lint passes (`npm run lint`)
- [ ] Type-check passes (`npm run typecheck`)
- [ ] Full test suite passes (`npm test`)
- [ ] Whole-project coverage re-run and recorded in §6
- [ ] No new console errors / React warnings (keys, act(), missing deps)
- [ ] Accessibility checklist (§4) reviewed
- [ ] PR body references epic key `$EPIC_ID`
- [ ] Reviewer assigned

## 8. Known Limitations / Follow-ups

- …
