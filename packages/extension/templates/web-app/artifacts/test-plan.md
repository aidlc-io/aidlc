# Test Plan — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** QA
**Status:** Draft
**Created:** `$DATE`

---

## 1. Scope

**In scope:**
- Route(s): `/projects`, `/projects/new`, `/projects/[id]`
- Server Actions: `createProjectAction`, `updateProjectAction`
- tRPC procedures: `projects.list`, `projects.detail`
- Component: `NewProjectForm`, `ProjectList`, `ProjectFilter`
- i18n: en, plus RTL spot-check

**Out of scope:**
- Legacy `/old-projects` flow (deprecated)
- Marketing surface (no changes)

## 2. Test Strategy

| Type | Tool | Owner |
|------|------|-------|
| Unit | **Vitest** | Dev |
| Component | **Vitest** + **React Testing Library** + **MSW** | Dev / QA |
| Contract | Vitest (schema parse) | Dev |
| Integration | Vitest + MSW (route-level) | QA |
| E2E | **Playwright** (chromium / firefox / webkit) | QA |
| Visual regression | Playwright `toHaveScreenshot` / Chromatic | QA |
| Accessibility | `jest-axe` (unit) + `@axe-core/playwright` (e2e) | QA |
| Performance | **Lighthouse CI** + bundle analyzer | QA |
| Security | AuthZ matrix tests + secrets-in-bundle scan | QA |

## 3. Browser / Viewport / Locale Matrix

| Dimension | Must-test | Spot-check |
|-----------|-----------|------------|
| Browser (Playwright project) | chromium | firefox, webkit |
| Viewport | desktop 1280×800, mobile 375×667 | tablet 768×1024 |
| Locale | en | ar (RTL spot-check) |
| Connection | fast | Slow 3G for failure-mode |
| Auth state | signed-in user, signed-in admin | anonymous (for 403 path) |

## 4. Test Cases

### TC-UT — Schemas

| ID | Title | AC | Notes |
|----|-------|----|-------|
| `$EPIC_ID-UT01` | `CreateProjectSchema` accepts valid input | AC01 | Vitest |
| `$EPIC_ID-UT02` | `CreateProjectSchema` rejects empty name | AC02 | Vitest |
| `$EPIC_ID-UT03` | `CreateProjectSchema` rejects invalid slug | AC02 | Vitest |
| `$EPIC_ID-UT04` | `projectKeys` factory stable | — | Vitest |

### TC-CMP — Component

| ID | Title | AC | Notes |
|----|-------|----|-------|
| `$EPIC_ID-CMP01` | `NewProjectForm` renders & submits happy path | AC01 | RTL + MSW |
| `$EPIC_ID-CMP02` | `NewProjectForm` shows field errors on invalid input | AC02 | RTL |
| `$EPIC_ID-CMP03` | `ProjectList` renders empty state | AC03 | RTL |
| `$EPIC_ID-CMP04` | `ProjectList` renders loading skeleton | AC03 | RTL + Suspense |
| `$EPIC_ID-CMP05` | `ProjectFilter` updates URL via `nuqs` | AC04 | RTL |

### TC-IT — Integration

| ID | Title | AC | Notes |
|----|-------|----|-------|
| `$EPIC_ID-IT01` | Server Action invocation flow | AC01 | Vitest with MSW |
| `$EPIC_ID-IT02` | `revalidateTag` invalidates list | AC01 | Vitest |

### TC-CT — Contract

| ID | Title | AC | Notes |
|----|-------|----|-------|
| `$EPIC_ID-CT01` | tRPC `projects.list` schema conformance | — | Vitest |
| `$EPIC_ID-CT02` | Server Action returns `{ ok, data | fieldErrors }` | AC01, AC02 | Vitest |

### TC-E2E — End-to-End (Playwright)

| ID | Title | AC | Browser projects |
|----|-------|----|------------------|
| `$EPIC_ID-E2E01` | Create project happy path | AC01 | chromium, firefox, webkit |
| `$EPIC_ID-E2E02` | View project list with pagination | AC04 | chromium |
| `$EPIC_ID-E2E03` | Unauthorized access shows 403 | AC05 | chromium |

### TC-VR — Visual Regression

| ID | Title | Surface |
|----|-------|---------|
| `$EPIC_ID-VR01` | `/projects` empty state | Playwright screenshot |
| `$EPIC_ID-VR02` | `/projects` populated list | Playwright screenshot |
| `$EPIC_ID-VR03` | `NewProjectForm` default state | Chromatic Storybook |
| `$EPIC_ID-VR04` | `NewProjectForm` error state | Chromatic Storybook |

### TC-A11Y — Accessibility

| ID | Title | Tool |
|----|-------|------|
| `$EPIC_ID-A11Y01` | `NewProjectForm` axe scan clean | jest-axe |
| `$EPIC_ID-A11Y02` | `/projects` route axe scan clean | @axe-core/playwright |
| `$EPIC_ID-A11Y03` | Keyboard reachability through filter → list → detail | Playwright |
| `$EPIC_ID-A11Y04` | Modal focus trap + ESC close + focus return | RTL + jsdom |
| `$EPIC_ID-A11Y05` | Reduced motion respected | Playwright with `prefers-reduced-motion: reduce` |

### TC-PF — Performance

| ID | Title | Threshold | Tool |
|----|-------|-----------|------|
| `$EPIC_ID-PF01` | Lighthouse `/projects` LCP | ≤ 2.5 s | Lighthouse CI |
| `$EPIC_ID-PF02` | Lighthouse `/projects` TBT (INP proxy) | ≤ 200 ms | Lighthouse CI |
| `$EPIC_ID-PF03` | Lighthouse `/projects` CLS | ≤ 0.1 | Lighthouse CI |
| `$EPIC_ID-PF04` | Bundle delta vs baseline | ≤ +20 KB gzip | `@next/bundle-analyzer` diff |

### TC-NET — Network / Failure-Mode

| ID | Title | Condition |
|----|-------|-----------|
| `$EPIC_ID-NET01` | Offline submit shows toast | Playwright `context.setOffline(true)` |
| `$EPIC_ID-NET02` | Slow 3G shows skeleton then content | Playwright network throttle |
| `$EPIC_ID-NET03` | Blocked analytics SDK does not crash app | Block tracker domain |
| `$EPIC_ID-NET04` | Aborted fetch on unmount — no warning | RTL |

### TC-SEC — Security

| ID | Title |
|----|-------|
| `$EPIC_ID-SEC01` | AuthZ: anonymous cannot read `/projects` |
| `$EPIC_ID-SEC02` | AuthZ: viewer cannot create project |
| `$EPIC_ID-SEC03` | XSS: project name with `<script>` rendered as text |
| `$EPIC_ID-SEC04` | CSP: no inline scripts without nonce |
| `$EPIC_ID-SEC05` | Secrets-in-bundle scan: no `API_KEY` strings in `.next/static/*.js` |

### TC-HYD — Hydration

| ID | Title |
|----|-------|
| `$EPIC_ID-HYD01` | SSR + TanStack Query hydration mismatch-free |
| `$EPIC_ID-HYD02` | Locale-sensitive dates stable across server/client |

## 5. Unit Test Coverage Targets

| Module | Target | Notes |
|--------|--------|-------|
| `features/projects/` | ≥ 80% | Schemas + hooks + actions |
| `lib/` (touched files) | ≥ 90% | Pure utilities |
| `components/ui/` (touched) | covered via Storybook | — |

## 6. Lighthouse CI Thresholds (per route)

```jsonc
// lighthouserc.json (excerpt)
{
  "assert": {
    "assertions": {
      "categories:performance":     ["error", { "minScore": 0.9 }],
      "categories:accessibility":   ["error", { "minScore": 0.95 }],
      "largest-contentful-paint":   ["error", { "maxNumericValue": 2500 }],
      "cumulative-layout-shift":    ["error", { "maxNumericValue": 0.1 }],
      "total-blocking-time":        ["error", { "maxNumericValue": 200 }]
    }
  }
}
```

## 7. Regression Checklist

- [ ] Sign in / sign up / sign out
- [ ] Navigation across affected + adjacent routes
- [ ] Locale switcher
- [ ] Theme switcher (if dark mode)
- [ ] One core flow outside this epic

## 8. Sign-off Criteria

- [ ] All TC pass on chromium; spot-check on firefox + webkit
- [ ] Lighthouse CI within budget on all key routes
- [ ] Bundle delta within budget
- [ ] axe scans clean on all affected routes
- [ ] No P1 open bugs
- [ ] QA sign-off
