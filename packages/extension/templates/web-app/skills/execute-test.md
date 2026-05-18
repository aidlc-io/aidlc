---
name: execute-test
description: Generate a TEST-SCRIPT for a web-app epic — executable UAT scenarios for human testers in a browser (with explicit URLs, viewports, locales, auth states).
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Test Script for Epic $0

You are the **QA Engineer (QA)** agent — senior test practitioner for modern TypeScript web apps.
Load your full persona from `.claude/agents/qa.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `execute-test`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read the epic: `docs/sdlc/epics/$0/$0.md`
2. Read the PRD: `docs/sdlc/epics/$0/PRD.md` — ACs drive test scenarios
3. Read the template: `docs/sdlc/epics/$0/TEST-SCRIPT.md` or `docs/sdlc/templates/TEST-SCRIPT-TEMPLATE.md`
4. Fill the test script with the sections below

## Test Script Contents

### Prerequisites
- **Build URL** — preview / staging URL (e.g., `https://pr-42-app.vercel.app`)
- **Test accounts** — credentials for each role (user / admin / billing-admin) and tenant
- **Browser + version** — Chrome latest / Safari latest / Firefox latest (test each on a key flow)
- **Viewport** — desktop 1280×800, mobile 375×667 (test mobile on responsive routes)
- **Locale** — default + RTL locale (if multi-language)
- **Network condition** — fast + throttled "Slow 3G" via DevTools for spot-check
- **Feature flags** — exact flag name + value to set for this test (via admin UI or query param `?ff_<flag>=on`)
- **Browser storage** — clear cookies + localStorage between scenarios where auth state matters
- **Clock / timezone** — leave system default unless scenario specifies otherwise

### Scenarios (derived from acceptance criteria)

For **each AC**, write a scenario:
- **What we're testing** — one plain-language sentence
- **Auth state** — anonymous / signed-in as X / signed-in as admin
- **URL to start at** — exact URL with query params
- **Step-by-step actions** a non-technical tester can follow
- **Expected result** per step
- **Screenshot / recording** where it helps
- **Traceability** — note the AC ID

Rules for steps:
- One action per step
- Exact UI element label / URL / button text — no "open the feature"; say "Click the blue 'Create Project' button at top right" or "Visit https://app.example.com/projects/new"
- No jargon, no code, no implementation language
- Every step has a concrete expected result

### Edge-Case Scenarios (web-app specific)

Pick the ones that apply:
- **Offline** — DevTools Network → Offline; expected: offline banner / queued action / disabled submit
- **Slow network** — DevTools "Slow 3G"; expected: skeleton appears, no layout shift, no double-submit
- **Blocked third-party** — uBlock / Privacy Badger; expected: app still works (no crash from blocked analytics / fonts / SDK)
- **Session expired mid-flow** — wait for token expiry or set short TTL; expected: re-auth prompt + state preserved
- **Multi-tab** — sign out in tab A; expected: tab B reflects signed-out within reasonable time
- **Browser back/forward** — after submit, browser back; expected: form state preserved or explicit warning
- **Refresh mid-flow** — expected: form state preserved (or recoverable) where applicable
- **Empty state** — no data yet; expected: helpful empty state, no JS error
- **Large data / long text / unicode / RTL** — paste 1000-char title, emoji, Arabic; expected: no overflow, correct alignment
- **Permission denied** — try as wrong role; expected: 403 page / hidden UI element
- **Validation errors** — submit empty form, invalid email, max-length+1; expected: inline field error with helpful text
- **Optimistic update + rollback** — disconnect network mid-action; expected: optimistic UI rolled back with toast error

### Accessibility Spot-Check
- **Keyboard only** — Tab through the new feature; expected: visible focus ring, logical order, all interactive elements reachable, no focus trap escape
- **Screen reader smoke** — VoiceOver (Mac) or NVDA (Win); expected: button / label / state announced
- **Reduced motion** — System Prefs → Reduce Motion ON; expected: animations replaced with instant transitions
- **Zoom 200%** — Cmd/Ctrl + scroll; expected: no clipped content, no horizontal scroll (on body)
- **High contrast** (if relevant locale) — Forced Colors / High Contrast mode; expected: still legible

### Regression Quick Check
- Login / signup / sign out
- Navigation across affected routes
- Locale switcher (if i18n)
- Theme switcher (if dark mode)
- One core flow not touched by this epic

### Performance Spot-Check
- Open DevTools → Lighthouse → run on key route
- Expected: LCP ≤ 2.5s, INP ≤ 200ms (proxy via TBT), CLS ≤ 0.1, no console errors
- Compare to last release report

### Verdict Section
- Pass / fail per scenario
- Sign-off (tester name, date, browser + version, viewport, locale, verdict)
- Defect log (description, severity, screenshot URL, ticket reference)

## Rules

- Write for someone who has **never seen the code**
- Steps must be concrete and unambiguous (exact URL, exact label, exact key)
- Every step has an expected result — no "see that it works"
- Screenshots called out where the visual check matters (states, alignment, focus ring)
- Scenarios independently runnable — no "continue from previous scenario" unless explicit
- Always specify browser + viewport + locale + auth state at scenario start

## Output

Write the completed test script to `docs/sdlc/epics/$0/TEST-SCRIPT.md`.
