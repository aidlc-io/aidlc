# Test Execution Report — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Tester:** QA
**Environment:** UAT (signed packaged builds)
**Status:** Draft
**Created:** `$DATE`
**Platform:** Electron desktop

---

## 1. Builds Under Test

| OS | Arch | Artifact | Signed | Notarized | Source |
|----|------|----------|--------|-----------|--------|
| macOS | arm64 | `MyApp-1.4.2-arm64.dmg` | yes | yes (stapled) | staged channel |
| macOS | x64 | `MyApp-1.4.2-x64.dmg` | yes | yes (stapled) | staged channel |
| Windows | x64 | `MyApp Setup 1.4.2.exe` | yes (EV, timestamped) | n/a | staged channel |
| Linux | x64 | `MyApp-1.4.2.AppImage` | n/a (GPG `latest-linux.yml`) | n/a | staged channel |

## 2. Execution Summary

| Metric | Value |
|--------|-------|
| Total cases | 0 |
| Passed | 0 |
| Failed | 0 |
| Blocked | 0 |
| Skipped | 0 |
| Pass rate | —% |

## 3. Install / Upgrade Results

| Scenario | Build | OS | Result | Notes |
|----------|-------|-----|--------|-------|
| INSTALL-01 fresh install | v1.4.2 | mac arm64 | ⬜ Pass / ⬜ Fail | Gatekeeper outcome |
| INSTALL-01 fresh install | v1.4.2 | win x64 | ⬜ Pass / ⬜ Fail | SmartScreen outcome |
| INSTALL-01 fresh install | v1.4.2 | linux x64 | ⬜ Pass / ⬜ Fail | .desktop entry |
| INSTALL-02 upgrade from N-1 | v1.4.2 | mac arm64 | ⬜ Pass / ⬜ Fail | userData migrated |
| INSTALL-03 auto-update | v1.4.2 | mac arm64 | ⬜ Pass / ⬜ Fail | download → restart |
| INSTALL-03 auto-update | v1.4.2 | win x64 | ⬜ Pass / ⬜ Fail | |
| INSTALL-03 auto-update | v1.4.2 | linux x64 | ⬜ Pass / ⬜ Fail | AppImage zsync |

## 4. Acceptance Criteria Run Results

| TC | Title | AC | Build | OS | Result | Notes |
|----|-------|----|-------|-----|--------|-------|
| TC-01 | | AC-01 | | mac arm64 | ⬜ Pass / ⬜ Fail | |
| TC-01 | | AC-01 | | win x64 | ⬜ Pass / ⬜ Fail | |
| TC-01 | | AC-01 | | linux x64 | ⬜ Pass / ⬜ Fail | |

## 5. Auto-Update Funnel Verification

| Stage | Build | Observed |
|-------|-------|----------|
| `update_check_started` | v1.4.2 | ⬜ |
| `update_available` | v1.4.2 | ⬜ |
| `update_downloaded` (blockmap diff) | v1.4.2 | ⬜ |
| `update_installed` (after restart) | v1.4.2 | ⬜ |

## 6. Bugs Found

| Bug ID | Severity | Title | TC | OS | Status |
|--------|----------|-------|-----|-----|--------|
|        | P1/P2/P3 |       |     |     | Open |

## 7. Regression Check

| Area | Build | OS | Tested | Status |
|------|-------|-----|--------|--------|
| Single-instance lock | | mac/win/linux | ⬜ | |
| Tray / menubar | | mac/win/linux | ⬜ | |
| Existing IPC channels | | mac/win/linux | ⬜ | |
| `userData` vN-1 → vN+1 migration | | mac | ⬜ | |
| Auto-update check button (Help menu) | | mac/win/linux | ⬜ | |

## 8. Per-OS Coverage

| Platform | Version | Arch | Tester | Result |
|----------|---------|------|--------|--------|
| macOS | 14 | arm64 | | ⬜ |
| macOS | 14 | x64 | | ⬜ |
| Windows | 11 | x64 | | ⬜ |
| Linux | Ubuntu 22.04 | x64 | | ⬜ |

## 9. Performance Results

| Scenario | Threshold | OS | Actual | Status |
|----------|-----------|-----|--------|--------|
| Cold-start → `ready-to-show` p95 | < 2000 ms | mac arm64 | | ⬜ |
| Cold-start → `ready-to-show` p95 | < 2000 ms | win x64 | | ⬜ |
| Renderer FCP p95 | < 1000 ms | mac arm64 | | ⬜ |
| IPC latency p95 | < 50 ms | mac arm64 | | ⬜ |
| Memory after 24h idle | < 500 MB | mac arm64 | | ⬜ |

## 10. Accessibility & Security Spot-Check

| Check | OS | Status |
|-------|-----|--------|
| axe-playwright scan: no critical/serious | all | ⬜ |
| Keyboard navigation (Tab / Enter / Esc) | all | ⬜ |
| Screen reader smoke (NVDA win / VoiceOver mac) | win + mac | ⬜ |
| `window.require` / `window.process` undefined | all | ⬜ |
| CSP report fires on inline-script attempt | all | ⬜ |

## 11. Sign-off

- [ ] All P1 bugs resolved
- [ ] Pass rate ≥ threshold per OS
- [ ] Regression areas clear on each P1 OS
- [ ] Auto-update funnel observed end-to-end on at least one OS
- [ ] Signed/notarized install verified on mac + Windows
- [ ] QA sign-off granted

**Sign-off by:** *(tester name)*
**Date:** *(date)*
**Promote to:** ⬜ staged 25% ⬜ staged 100% ⬜ hold
