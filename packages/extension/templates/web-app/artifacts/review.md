# Code Review Approval — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Reviewer:** Auto-Reviewer
**Status:** Pending
**Created:** `$DATE`

---

## 1. Review Summary

> *One-paragraph verdict.*

**Verdict:** ⬜ Pass &nbsp;&nbsp; ⬜ Reject

## 2. Acceptance Criteria Validation

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| `$EPIC_ID-AC01` | … | ⬜ Pass / ⬜ Fail | `app/.../page.tsx:42` |
| `$EPIC_ID-AC02` | … | ⬜ Pass / ⬜ Fail | … |

## 3. Architecture Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Layer boundaries respected (`app/` → `features/` → `lib/`) | ⬜ | |
| `"use client"` minimal and justified | ⬜ | |
| No server-only imports in client modules | ⬜ | |
| No `useEffect` for data fetching | ⬜ | RSC / TanStack Query / Server Action |
| tRPC / OpenAPI / Server Action signatures match design | ⬜ | |
| TanStack Query keys + invalidation tags match design | ⬜ | |
| DI plan respected (no module-level singletons leaked into client) | ⬜ | |
| Feature flag wired per design | ⬜ | |

## 4. Code Quality

| Check | Status | Notes |
|-------|--------|-------|
| TypeScript strict — no `any` | ⬜ | |
| Zod parse at every trust boundary | ⬜ | Server Action / Route Handler / postMessage |
| `AbortController` on every `useEffect` fetch | ⬜ | |
| Cleanup on every subscription / observer | ⬜ | |
| No hardcoded secrets / URLs / keys / tokens | ⬜ | |
| No `dangerouslySetInnerHTML` without DOMPurify | ⬜ | |
| Cookies HTTP-only + SameSite=Lax | ⬜ | |

## 5. Performance Checks

| Check | Status | Value | Budget |
|-------|--------|-------|--------|
| Bundle delta (gzip) | ⬜ | — | +XX KB |
| Lighthouse `/route` LCP | ⬜ | — | ≤ 2.5 s |
| Lighthouse `/route` INP (TBT proxy) | ⬜ | — | ≤ 200 ms |
| Lighthouse `/route` CLS | ⬜ | — | ≤ 0.1 |
| No accidental import of large server libs into client | ⬜ | | |
| `next/image` for images with dimensions | ⬜ | | |
| `next/font` for fonts | ⬜ | | |

## 6. Accessibility

| Check | Status | Notes |
|-------|--------|-------|
| Semantic HTML / Radix primitives used | ⬜ | |
| Visible focus ring (`focus-visible:`) | ⬜ | |
| Keyboard reachable + correct tab order | ⬜ | |
| `aria-*` only when no semantic element exists | ⬜ | |
| `prefers-reduced-motion` respected | ⬜ | |
| axe assertion passes on changed routes | ⬜ | |

## 7. Test Coverage

| Check | Status | Notes |
|-------|--------|-------|
| Vitest unit tests present and meaningful | ⬜ | |
| RTL component tests query by role / label | ⬜ | |
| MSW handlers added for new endpoints | ⬜ | |
| Playwright e2e for new top-level flows | ⬜ | |
| Storybook stories for new component states | ⬜ | |
| axe assertions on new routes / components | ⬜ | |
| Coverage targets met (≥ 80% on `features/` + `lib/`) | ⬜ | |

## 8. Issues Found

### 🔴 Critical (must fix before approval)

| # | File | Issue | Required action |
|---|------|-------|-----------------|
|   |      |       |                 |

### 🟠 Major

| # | File | Issue | Required action |
|---|------|-------|-----------------|
|   |      |       |                 |

### 🟡 Minor / 🔵 Nit (can follow-up)

| # | File | Issue | Suggested action |
|---|------|-------|-------------------|
|   |      |       |                   |

## 9. Doc Impact

After merge, run `/doc-sync` for:
- `docs/...` — reason
- Storybook MDX — component variant added
- tRPC / OpenAPI reference — procedure added
- i18n catalog — new strings

## 10. Final Decision

- [ ] **APPROVED** — All ACs pass, no critical issues.
- [ ] **REJECTED** — See issues above. Resubmit after fixes.

**Reviewer notes:**

> *(free text)*
