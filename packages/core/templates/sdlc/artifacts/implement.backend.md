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

## 3. API Surface

> *Endpoints / handlers added or changed. This is the contract consumers rely on.*

| Endpoint | Method | Auth | Request shape | Response shape | Status codes |
|----------|--------|------|---------------|----------------|--------------|
| `/api/...` | POST | required | … | … | 200 / 400 / 401 / 404 / 500 |

### Deviations from Tech Design

> *List any places where implementation diverged from `TECH-DESIGN.md` and why.*

None.

## 4. Data & Migrations

| Item | Detail |
|------|--------|
| Schema changes | *(tables/columns/indexes added or altered)* |
| Migration file | `<path>` — reversible? `<yes/no>` |
| Backfill needed | *(yes/no — describe)* |
| Rollback plan | *(how to revert safely)* |

## 5. Cross-cutting Concerns

- [ ] Input validation on every external-facing field
- [ ] AuthN/AuthZ enforced on new endpoints
- [ ] Errors mapped to correct status codes (no leaking internals)
- [ ] Structured logging / tracing on new paths
- [ ] Idempotency / retries considered for mutating endpoints
- [ ] N+1 queries checked; indexes cover new query patterns

## 6. Tests (TDD — written before the code)

> Tests authored first (red), then the implementation made them pass (green).

| Test file | Cases (`$EPIC_ID-UT*`) | Type (happy / error / edge) |
|-----------|------------------------|------------------------------|
| `src/.../__tests__/...` | | |

- [ ] Unit tests for business logic
- [ ] Contract/integration test per new endpoint (happy + auth + validation failure)

## 7. Whole-Project Coverage (re-run after implementation)

> Required. Coverage is re-run across the **entire** project after the code is
> green — not just the changed files. If the project has no coverage tooling,
> state that here instead of leaving it blank.

| Item | Value |
|------|-------|
| Coverage command | `<project coverage command>` |
| Total coverage | `<N>%` (lines) / `<N>%` (branches) |
| Delta vs base | `<+/- N>%` |
| Meets target | `<yes / no>` (target ≥ 80%) |

## 8. Pre-PR Checklist

- [ ] Tests written **before** the implementation (TDD)
- [ ] Lint passes (`npm run lint`)
- [ ] Type-check passes (`npm run typecheck`)
- [ ] Full test suite passes (`npm test`)
- [ ] Whole-project coverage re-run and recorded in §7
- [ ] Migrations reviewed and reversible (§4)
- [ ] API contract documented (§3)
- [ ] PR body references epic key `$EPIC_ID`
- [ ] Reviewer assigned

## 9. Known Limitations / Follow-ups

- …
