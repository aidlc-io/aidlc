---
name: test-plan
description: Generate a test plan for a web-app epic. Covers Vitest unit + RTL component + MSW + Playwright e2e + axe accessibility + visual regression + Lighthouse CI performance, adapted to the affected routes / features.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Test Plan for Epic $0

You are the **QA Engineer (QA)** agent — a senior test practitioner for modern TypeScript web apps.
Load your full persona from `.claude/agents/qa.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `test-plan`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read the epic: `docs/sdlc/epics/$0/$0.md`
2. Read the PRD: `docs/sdlc/epics/$0/PRD.md` — ACs are your test inputs
3. Read the tech design: `docs/sdlc/epics/$0/TECH-DESIGN.md` — file impact drives unit/integration scope
4. Read existing tests / fixtures / MSW handlers / Storybook stories so new tests match style
5. Read `vitest.config.ts`, `playwright.config.ts`, `lighthouserc.json`
6. Read the template: `docs/sdlc/epics/$0/TEST-PLAN.md` or `docs/sdlc/templates/TEST-PLAN-TEMPLATE.md`
7. Fill the test plan with the sections below

## Test Plan Contents

### Test Scope
- Map each AC to one or more test types (Unit / Component / Integration / Contract / E2E / Visual / A11Y / NFR)
- Call out what is **out of scope** and why

### Browser / Viewport / Locale Matrix

| Surface | Matrix |
|---------|--------|
| **Browsers (Playwright projects)** | chromium (must), firefox (must for marketing/auth flows), webkit (must for Safari quirks) |
| **Viewports** | Desktop 1280×800, Tablet 768×1024, Mobile 375×667 |
| **Locales** | Default + one RTL locale (ar / he) if i18n in scope |
| **Connection** | Fast 3G + Offline for failure-mode tests |
| **Auth state (`storageState`)** | anonymous, signed-in user, signed-in admin |

Mark **must-test** vs **spot-check**. Note CI vs real-device requirements.

### Unit Tests — prefix `$0-UT`
Tool: **Vitest** + `@testing-library/react` for hooks via `renderHook`

- Pure logic, Zod schemas (valid + invalid inputs), reducers, mappers, queryKey factories
- React hooks via `renderHook` + `act`
- Deterministic: mock `Date`, `Math.random`, `window.matchMedia`, `IntersectionObserver`
- Boundary: empty, max, null, undefined, RTL, very-long strings, emoji + grapheme clusters

### Component Tests — prefix `$0-CMP`
Tool: **Vitest** + **React Testing Library** + **MSW**

- Query by **role / label / text** first (`getByRole('button', { name: /save/i })`)
- Never `getByTestId` unless no other option
- Cover happy / error / empty / loading / disabled / RTL states
- MSW handlers from the shared fixture (reused across Vitest + Storybook + Playwright)
- Storybook story per component state (use `@storybook/test` interactions)

### Integration Tests — prefix `$0-IT`
- Route-level rendering with MSW network mocks
- Server Action invocation flow (form submit → action → revalidate)
- Multi-component flows within a feature module

### Contract Tests — prefix `$0-CT`
- tRPC procedures: input schema rejection on invalid data; output schema conformance
- OpenAPI endpoints: schema diff vs spec; example payloads parse against schema
- Server Action return shape (`{ ok, data | fieldErrors }`)

### End-to-End Tests — prefix `$0-E2E`
Tool: **Playwright** (projects per browser, trace on retry, video on failure)

- Top-level user flows only (login → core flow → success)
- Use `storageState` to skip login in 99% of tests
- Run against the production build (`next start` / `vite preview`), not dev server
- Keep thin — these are flaky and expensive; cover the top user risks only

### Visual Regression Tests — prefix `$0-VR`
- Playwright `toHaveScreenshot()` on key routes + key states
- Or Chromatic on Storybook stories
- Pin viewport + locale + reduced-motion + font; mask flaky regions (clocks, avatars, animations)

### Accessibility Tests — prefix `$0-A11Y`
- `jest-axe` in component tests (every visible component state)
- `@axe-core/playwright` in e2e (every key route + every state visited)
- Screen reader announcement assertions for state changes (toast, error, optimistic update)
- Keyboard reachability + tab order assertions
- Reduced-motion respected

### Hydration Tests — prefix `$0-HYD` (if SSR / RSC streaming in play)
- Render with `renderToString` then hydrate; assert no hydration mismatch warning in console
- Locale-sensitive / date-sensitive rendering: pass server timestamp as prop, assert stable on both sides

### Failure-Mode Tests

- **Network** (`$0-NET`): offline, slow 3G, abort mid-request, blocked CDN / tracker / third-party SDK
- **Auth** (`$0-PM`): expired session refresh mid-flow, multi-tab session sync, denied scope, signed-out from another tab
- **Upstream** (`$0-UP`): 4xx / 5xx / timeout / rate-limit from tRPC procedure or external API — graceful UI handling
- **Concurrency** (`$0-CC`): double-submit, optimistic update + server reject + rollback, stale TanStack Query data

### Non-Functional Tests

- **Performance** (`$0-PF`):
  - **Lighthouse CI** assertions per route: LCP ≤ 2.5s, INP ≤ 200ms (or TBT proxy), CLS ≤ 0.1, TTI, bundle KB
  - Bundle analyzer diff vs baseline — assert no regression > X KB
  - Web Vitals RUM in CI via Playwright + `web-vitals` library
- **Security** (`$0-SEC`):
  - AuthZ matrix tests (anonymous / user / admin can / cannot access each new route + procedure)
  - XSS payload tests on user-input rendering paths
  - CSP violation tests (verify no inline script needed; nonce flow correct)
  - Secrets-in-bundle scan: `grep -r "API_KEY\|SECRET\|PRIVATE" .next/static` returns nothing

### Regression Checklist
- Login / signup / logout
- Nav across affected routes
- Core flow not touched by this epic
- Locale switch
- Theme switch (if dark mode)

### Test Data Strategy
- Factories (e.g. `@faker-js/faker`) over static fixtures
- Per-test isolation (separate DB schema / namespace; clear TanStack Query cache between tests)
- MSW handlers as the single source of truth for network mocks — share across Vitest / Storybook / Playwright

### Flaky-Test Policy
- Deterministic: mock `Date`, `Math.random`, `matchMedia`, observers; pin Playwright viewport + locale
- Isolated: each test owns its data and storage state
- Idempotent: no order dependencies
- Quarantine flaky tests; fix or delete — never retry-to-green

## Output

Write the completed test plan to `docs/sdlc/epics/$0/TEST-PLAN.md`.
