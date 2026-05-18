# Code Review Approval — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Reviewer:** Auto-Reviewer / Tech Lead
**Status:** Pending
**Created:** `$DATE`
**Platform:** Electron desktop

---

## 1. Review Summary

> *One-paragraph verdict. Note process boundaries respected, IPC contract integrity, security flags unchanged.*

**Verdict:** ⬜ Pass ⬜ Reject

## 2. Acceptance Criteria Validation

| AC | Description | OS scope | Status | Evidence |
|----|-------------|----------|--------|----------|
| AC-01 | … | all | ⬜ Pass / ⬜ Fail | `main/ipc/<feature>.ts:42` |
| AC-02 | … | mac only | ⬜ Pass / ⬜ Fail | … |

## 3. Architecture Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Process split correct (main / preload / renderer / common) | ⬜ | |
| `common/` updated for new IPC types | ⬜ | |
| Tech design file impact matches diff | ⬜ | Extra: / Missing: |
| Dependency wiring updated | ⬜ | Handler registered in `main/index.ts` |
| `userData` schema migration present (if needed) | ⬜ | |
| `electron-builder` config updated (if assets/entitlements changed) | ⬜ | |
| No unapproved new dependencies (esp. native) | ⬜ | |

## 4. IPC Contract Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Every new `ipcMain.handle` validates payload with zod/valibot | ⬜ | |
| Channel names from `common/ipc-channels.ts` (no magic strings) | ⬜ | |
| Preload exposes only typed wrappers (no raw `ipcRenderer`) | ⬜ | |
| Renderer calls `window.api.*` only (no direct `ipcRenderer`) | ⬜ | |
| Type contract consistent across main / preload / renderer / common | ⬜ | |
| Error envelope shape consistent | ⬜ | |

## 5. Security

| Check | Status | Notes |
|-------|--------|-------|
| `contextIsolation: true` unchanged | ⬜ | |
| `sandbox: true` unchanged | ⬜ | |
| `nodeIntegration: false` unchanged | ⬜ | |
| `webSecurity: true` unchanged | ⬜ | |
| No new `enable-features` overrides | ⬜ | |
| CSP unchanged or tightened | ⬜ | |
| mac entitlements minimal (only what tech design declared) | ⬜ | |
| No secrets in source / logs / plaintext `userData` | ⬜ | |
| Custom `protocol.handle('app', ...)` preferred over `file://` | ⬜ | |

## 6. Resource Safety

| Check | Status | Notes |
|-------|--------|-------|
| Listeners removed on `closed` / unmount | ⬜ | |
| `BrowserWindow`, `Tray`, `Menu` references cleared | ⬜ | |
| In-flight IPC cancelled on window close | ⬜ | |
| Native module handles released | ⬜ | |
| Timers / intervals cleared on `before-quit` | ⬜ | |

## 7. Window / Lifecycle

| Check | Status | Notes |
|-------|--------|-------|
| New windows use `show: false` + `ready-to-show` | ⬜ | |
| Single-instance lock present | ⬜ | |
| `second-instance` / `open-file` / `open-url` handlers wired (if applicable) | ⬜ | |
| macOS: app survives last-window-closed (unless explicit quit) | ⬜ | |

## 8. Code Quality

| Check | Status | Notes |
|-------|--------|-------|
| TypeScript strict; no unchecked `any` | ⬜ | |
| Unit tests present and meaningful (main + renderer + preload) | ⬜ | |
| IPC contract tests per new channel | ⬜ | |
| Playwright `_electron` E2E for top flows | ⬜ | |
| Native-module smoke per OS (if applicable) | ⬜ | |
| No dead code introduced | ⬜ | |
| Linter / formatter clean | ⬜ | |

## 9. Per-OS

| Check | Status | Notes |
|-------|--------|-------|
| Code paths divergent per OS tested per OS | ⬜ | |
| No hard-coded `/` paths; uses `path.join` | ⬜ | |
| Keyboard shortcuts respect ⌘ on mac / Ctrl on win+linux | ⬜ | |

## 10. Issues Found

### Critical (must fix before approval)

| # | Process | File | Issue | Required action |
|---|---------|------|-------|----------------|
|   |         |      |       |                |

### Non-critical (can follow-up)

| # | Process | File | Issue | Suggested action |
|---|---------|------|-------|-----------------|
|   |         |      |       |                 |

## 11. Final Decision

- [ ] **APPROVED** — All AC pass, no critical issues, security flags unchanged.
- [ ] **REJECTED** — See issues above. Resubmit after fixes.

**Reviewer notes:**

> *(free text)*
