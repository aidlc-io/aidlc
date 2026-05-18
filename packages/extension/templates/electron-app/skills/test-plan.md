---
name: test-plan
description: Generate a test plan for an Electron epic. Covers Vitest (main + renderer + preload), IPC contract tests, Playwright `_electron.launch()` E2E, auto-update flow tests, native module CI matrix, and per-OS coverage.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Test Plan for Epic $0

You are the **QA Engineer (QA)** agent — a senior test practitioner specialized in Electron.
Load your full persona from `.claude/agents/qa.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `test-plan`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read the epic: `docs/sdlc/epics/$0/$0.md`
2. Read the PRD: `docs/sdlc/epics/$0/PRD.md` — AC drive test inputs
3. Read the tech design: `docs/sdlc/epics/$0/TECH-DESIGN.md` — process split + IPC contract drive scope
4. Read existing tests:
   - Vitest setup for main (`vitest.main.config.ts`) and renderer (`vitest.renderer.config.ts`)
   - Playwright `_electron` harness (`tests/e2e/*.spec.ts`)
   - Fixtures, mocks (`vi.mock('electron', ...)`), zod fixture builders
5. Read the template: `docs/sdlc/epics/$0/TEST-PLAN.md` or `docs/sdlc/templates/TEST-PLAN-TEMPLATE.md`
6. Fill the test plan with the sections below

## Test Plan Contents

### Test Scope

- Map each AC to one or more test types (UT-M / UT-R / UT-P / CT / IT / E2E / UPD / NAT / LC / PF / A11Y / SEC)
- Call out what is **out of scope** and why

### CI Matrix

| OS | Arch | Unit | IPC contract | Playwright `_electron` | Native rebuild | Signed installer smoke |
|----|------|------|--------------|-----------------------|----------------|------------------------|
| macOS | arm64 | ✅ | ✅ | ✅ | ✅ | ✅ (notarized) |
| macOS | x64 | ✅ | ✅ | ✅ | ✅ | spot-check |
| Windows | x64 | ✅ | ✅ | ✅ | ✅ | ✅ (signed NSIS) |
| Windows | arm64 | spot | spot | spot | spot | optional |
| Linux | x64 | ✅ | ✅ | ✅ | ✅ | AppImage |

Mark **must-test** vs **spot-check**. Note which require real signing infrastructure.

### Unit Tests — Main process (prefix `$0-UT-M`)
- Main-process logic, IPC handler bodies (logic only — IPC plumbing covered separately)
- File-system wrappers (against `memfs` or `vi.mock('node:fs')`)
- Native module shims (against mocked native impl)
- `electron-log` / Sentry init logic
- Deterministic — `vi.mock('electron', ...)`, inject clock, no real disk

### Unit Tests — Renderer (prefix `$0-UT-R`)
- React/Vue/Svelte components, stores
- Renderer-side IPC wrappers (mocked `window.api`)
- jsdom or happy-dom env via Vitest
- Boundary: empty, max length, null, unicode, RTL

### Unit Tests — Preload (prefix `$0-UT-P`)
- `contextBridge` surface types match `common/` declarations
- Each exposed method forwards correctly to `ipcRenderer.invoke`
- No accidental Node leak (`window.process`, `window.require` undefined)

### IPC Contract Tests — prefix `$0-CT`

For **every new or modified channel**:
- Round-trip: renderer wrapper → handler → response shape matches zod schema
- Validation: garbage payload rejected by zod, surfaced as typed error
- Error envelope conformance
- Type-level: TypeScript `expectTypeOf` checks against `common/` types

```ts
// example test
it('$0-CT01 file:save rejects invalid payload', async () => {
  await expect(invoke(FILE_SAVE_CHANNEL, { path: '', data: 'x' }))
    .rejects.toMatchObject({ code: 'EINVAL' });
});
```

### Integration Tests — prefix `$0-IT`
- Main + preload + renderer in a single launched app
- Real `app.whenReady()` boot, real `BrowserWindow`, real IPC
- Use Playwright `_electron.launch()` but assert at the IPC level

### End-to-End Tests — prefix `$0-E2E`

Use Playwright `_electron.launch()`:

```ts
import { _electron as electron, expect, test } from '@playwright/test';

test('$0-E2E01 user can save a file', async () => {
  const app = await electron.launch({ args: ['./dist/main/index.js'] });
  const window = await app.firstWindow();
  await window.click('button#save');
  await window.fill('input#filename', 'hello.txt');
  await window.click('button#confirm');
  await expect(window.locator('.toast.success')).toBeVisible();
  await app.close();
});
```

Run against the **packaged build** for release-candidate suites; against `./dist/main/index.js` (dev) for fast feedback.

### Auto-Update Tests — prefix `$0-UPD`

- Feed parsing: valid `latest.yml` ingested correctly
- Signed-feed verification: unsigned / wrong-signer feed **rejected**
- Differential blockmap: download size < full installer
- Staged rollout: `stagingPercentage: 10` → only 10% of test cohort sees update
- Update funnel events fire: `update_check`, `update_available`, `update_downloaded`, `update_installed`
- Rollback: republish N-1 → users still on N-1 stay; users who haven't updated get N-1 again
- Failure modes: network drop mid-download → resume / clean retry

### Native Module Tests — prefix `$0-NAT`

For each native module:
- Smoke load on each OS (arm64 + x64 where applicable)
- ABI check: rebuilt against current Electron version
- Minimal functional test
- Graceful degradation if load fails

### Lifecycle Tests — prefix `$0-LC`
- First-run (no `userData`)
- Upgrade-from-previous (vN-1 `userData` → migration → vN works)
- Second-instance attempt (single-instance lock works)
- `open-file` (macOS) / `second-instance` (Win/Linux) / deep-link handler
- macOS: last window closed, app stays alive, dock icon click reopens

### Performance Tests — prefix `$0-PF`
- Cold-start to `ready-to-show`: target ms
- Renderer FCP: target ms
- Memory after 24h idle: target MB
- IPC latency p95: target ms

State **thresholds**, not just measurements.

### Accessibility — prefix `$0-A11Y`
- axe-playwright runs over each renderer surface
- Keyboard navigation (Tab order, Escape closes modals, Enter activates)
- Screen reader announcements for state changes (smoke: NVDA on Windows, VoiceOver on macOS)
- High-contrast / forced-colors mode
- System text scale

### Security — prefix `$0-SEC`
- CSP enforced (CSP violation report fires for inline script attempt)
- IPC rejects garbage payloads at zod boundary
- `window.process`, `window.require`, `window.Buffer` all `undefined` in renderer
- No `enable-features` overrides
- mac entitlements only what tech design declared

### Regression Checklist
- Single-instance lock still works
- Auto-update still installs from staged channel
- All existing IPC channels still validate
- `userData` migration handles vN-2 → vN if not skipped

### Test Data Strategy
- Factories for IPC request/response shapes (zod-derived)
- Fixture `userData` files for vN-1, vN-2 schemas in `tests/fixtures/userData/`
- Mock signed feeds in `tests/fixtures/update/`
- No shared state between tests; isolated tmp dirs via `os.tmpdir()`

### Flaky-Test Policy
- Deterministic: `vi.setSystemTime`, `vi.mock('electron')`, no real network
- Isolated: each test owns its tmp `userData`
- Idempotent: no order dependencies
- Playwright `_electron`: `--workers=1` for shared resources; otherwise `--workers=auto`

## Output

Write the completed test plan to `docs/sdlc/epics/$0/TEST-PLAN.md`.
