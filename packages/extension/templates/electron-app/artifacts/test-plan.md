# Test Plan — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** QA
**Status:** Draft
**Created:** `$DATE`
**Platform:** Electron desktop

---

## 1. Scope

> *What is being tested? What is explicitly out of scope?*

**In scope:**
- Feature A (across all OS)
- IPC channel `<feature>:<action>` (validation + round-trip)
- `userData` migration vN → vN+1
- Auto-update flow on this release

**Out of scope:**
- Legacy IPC channel `<old>` (deprecated, planned removal next major)
- arm64 Windows (until product priority shifts)

## 2. Test Strategy

| Type | Tool / Approach | Owner |
|------|----------------|-------|
| Unit — main | Vitest + `vi.mock('electron')` | Dev |
| Unit — renderer | Vitest + Testing Library (jsdom / happy-dom) | Dev |
| Unit — preload | Vitest typed-surface check | Dev |
| IPC contract | Vitest + zod round-trip against `common/` | Dev / QA |
| Integration | Playwright `_electron.launch()` against `./dist/main/index.js` | QA |
| E2E | Playwright `_electron.launch()` against **packaged build** | QA |
| Visual regression | Playwright snapshots per OS | QA |
| Auto-update | Mocked signed feed + electron-updater integration | QA |
| Native module smoke | `electron-rebuild` + smoke load per OS in CI matrix | Dev / QA |
| Performance | Playwright traces + `app.getAppMetrics()` | QA |
| Accessibility | `@axe-core/playwright` | QA |
| Security | IPC fuzzing + CSP report scrape | QA |

## 3. CI Matrix

| OS | Arch | Unit | IPC CT | Playwright `_electron` | Native rebuild | Signed installer smoke |
|----|------|------|--------|-----------------------|----------------|------------------------|
| macOS | arm64 | ✅ | ✅ | ✅ | ✅ | ✅ notarized dmg |
| macOS | x64 | ✅ | ✅ | spot | ✅ | spot |
| Windows | x64 | ✅ | ✅ | ✅ | ✅ | ✅ signed NSIS |
| Linux | x64 | ✅ | ✅ | ✅ | ✅ | AppImage |

## 4. Test Cases

### TC-UT-M-01: [Main-side logic happy path]
**Preconditions:** `vi.mock('electron')`, mocked `node:fs`
**Steps:** call handler directly with valid payload
**Expected:** returns response matching `FeatureActionResponse` schema
**AC covered:** AC-01

### TC-UT-R-01: [Renderer component renders]
**Preconditions:** `window.api.feature.action` mocked to resolve `{ id, result }`
**Steps:** mount component, click action button
**Expected:** UI shows success state
**AC covered:** AC-01

### TC-UT-P-01: [Preload surface typed correctly]
**Steps:** verify `window.api.feature.action` exists; verify `window.require` / `window.process` undefined
**Expected:** typed surface only

### TC-CT-01: [IPC channel rejects garbage]
**Steps:** invoke channel with `{ field: '' }`
**Expected:** rejects with `EINVAL`-shaped error

### TC-CT-02: [IPC channel round-trip]
**Steps:** invoke with valid payload via Playwright `_electron`
**Expected:** response matches `FeatureActionResponse`

### TC-E2E-01: [User completes feature flow]
**Preconditions:** packaged build launched via `_electron.launch()`
**Steps:**
1. Click the **Feature** button in the toolbar
2. Enter "test-input" in the dialog
3. Click **Confirm**
**Expected:** success toast appears within 2 s
**AC covered:** AC-01

### TC-UPD-01: [Auto-update from N-1 to N]
**Preconditions:** previous version installed, test feed pointing at N
**Steps:** launch, wait for update check, accept update, restart
**Expected:** app launches as N with `userData` migrated

### TC-UPD-02: [Unsigned feed rejected]
**Preconditions:** feed signature invalid
**Steps:** trigger update check
**Expected:** update rejected; user stays on current version; error logged

### TC-NAT-01: [Native module loads on each OS]
**Steps:** in CI per OS, launch packaged build, call code path that loads the native module
**Expected:** module loads without `NODE_MODULE_VERSION` mismatch

### TC-LC-01: [First-run no `userData`]
**Preconditions:** fresh install, no `userData/state.json`
**Steps:** launch
**Expected:** default state created at vN+1; window opens normally

### TC-LC-02: [Upgrade vN → vN+1 migration]
**Preconditions:** `userData/state.json` is a vN fixture
**Steps:** launch
**Expected:** state migrated; original fields preserved; new fields default

### TC-LC-03: [Second-instance focus]
**Preconditions:** app already running
**Steps:** launch a second instance
**Expected:** existing window focused; no duplicate window

### TC-PF-01: [Cold-start budget]
**Steps:** launch packaged build, measure `app.whenReady()` to `ready-to-show`
**Expected:** ≤ 2000 ms p95 on baseline hardware

### TC-A11Y-01: [Axe scan of main window]
**Steps:** Playwright `_electron` → axe-playwright scan
**Expected:** no critical or serious violations

### TC-SEC-01: [Renderer cannot access Node]
**Steps:** Playwright eval in renderer: `typeof window.require`, `typeof window.process`, `typeof window.Buffer`
**Expected:** all `'undefined'`

## 5. Unit Test Coverage Requirements

| Module | Target coverage | Notes |
|--------|----------------|-------|
| `main/` | ≥ 80% | main-side logic + IPC handlers |
| `preload/` | ≥ 90% | tiny surface, must be airtight |
| `common/` | ≥ 95% | pure schemas |
| `renderer/` | ≥ 70% | components + stores |

## 6. Device / OS Matrix

| Platform | Version | Arch | Priority |
|----------|---------|------|----------|
| macOS | 14, 13 | arm64 | P1 |
| macOS | 14 | x64 | P2 |
| Windows | 11, 10 | x64 | P1 |
| Windows | 11 | arm64 | P3 |
| Linux | Ubuntu 22.04 | x64 | P1 |
| Linux | Fedora latest | x64 | P2 |

## 7. Performance Benchmarks

| Scenario | Threshold |
|----------|-----------|
| Cold-start to ready-to-show | < 2000 ms p95 |
| Renderer FCP | < 1000 ms p95 |
| IPC latency p95 | < 50 ms |
| Memory after 24h idle | < 500 MB |

## 8. Regression Checklist

- [ ] App launches on all target OS / arch
- [ ] Single-instance lock works
- [ ] Existing IPC channels still validate
- [ ] Tray / menubar still functions
- [ ] Auto-update check still reaches feed
- [ ] `userData` from vN-1 still loads

## 9. Test Data Strategy

- Factories: zod-derived builders for each IPC schema in `tests/factories/`
- Fixtures: `tests/fixtures/userData/vN.json`, `vN-1.json`, `vN-2.json`
- Mock signed update feeds: `tests/fixtures/update/`
- Tmp dirs per test: `os.tmpdir()/myapp-test-<uuid>`
- No shared state between tests

## 10. Sign-off Criteria

- [ ] All TC pass on each P1 OS / arch
- [ ] Unit coverage ≥ targets
- [ ] No P1 open bugs
- [ ] Performance thresholds met on P1 platforms
- [ ] QA sign-off granted
