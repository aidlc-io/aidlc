---
name: execute-test
description: Generate a TEST-SCRIPT (executable scenarios for human testers, including UAT) for an Electron desktop epic. Adapts to macOS / Windows / Linux installer flows and runs against the signed packaged build.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Test Script for Epic $0

You are the **QA Engineer (QA)** agent — a senior test practitioner.
Load your full persona from `.claude/agents/qa.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `execute-test`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read the epic: `docs/sdlc/epics/$0/$0.md` — note OS matrix and affected processes
2. Read the PRD: `docs/sdlc/epics/$0/PRD.md` — AC drive scenarios
3. Read the template: `docs/sdlc/epics/$0/TEST-SCRIPT.md` or `docs/sdlc/templates/TEST-SCRIPT-TEMPLATE.md`
4. Fill the test script with the sections below

## Test Script Contents

### Prerequisites

| Item | Value |
|------|-------|
| Build version | e.g. `v1.4.2` |
| Install artifact | macOS: `MyApp-1.4.2-arm64.dmg` / Win: `MyApp Setup 1.4.2.exe` / Linux: `MyApp-1.4.2.AppImage` |
| Signed? | yes (mac notarized, win signed with timestamp) |
| OS | macOS 14+ / Windows 10+ / Ubuntu 22.04+ |
| Arch | arm64 / x64 |
| Test account | (credentials, if applicable) |
| Network | online / offline scenarios both expected |
| Feature flags | (any required prod flag states) |
| Clean state? | start from "no prior install" for first-run scenarios; from "prior version installed" for upgrade scenarios |

### Install / Upgrade Scenarios (run first)

**INSTALL-01: Fresh install on each OS**
- Steps:
  1. Download the signed installer for your OS from the test feed.
  2. macOS: open the dmg, drag MyApp to Applications, eject, launch from Applications.
  3. Windows: run `MyApp Setup 1.4.2.exe`, accept SmartScreen (if shown — expected for new cert), follow installer.
  4. Linux: `chmod +x MyApp-1.4.2.AppImage` then double-click (or `./MyApp-1.4.2.AppImage`).
- Expected:
  - macOS: no Gatekeeper warning; app launches; mac menubar shows MyApp.
  - Windows: no SmartScreen block (warn is OK on first install of new cert version); app launches; tray icon appears.
  - Linux: app launches; appears in app menu / .desktop entry created.

**INSTALL-02: Upgrade from previous version**
- Preconditions: previous stable version installed, with sample `userData` from that version
- Steps:
  1. Launch the previous version; perform 1 minor action to dirty state (open file, change setting).
  2. Quit fully.
  3. Install the new version over the existing one.
  4. Launch.
- Expected:
  - `userData` migrated; previous setting still present.
  - No data loss; no migration error dialog.
  - Window position / size restored.

**INSTALL-03: Auto-update prompt**
- Preconditions: previous version installed and pointed at the staged channel
- Steps:
  1. Launch the previous version.
  2. Wait up to 5 minutes (or click "Check for updates" in Help menu).
  3. When prompted, accept the update.
  4. Confirm app restarts on the new version.
- Expected:
  - "Update available" UI appears.
  - Progress shown during download (blockmap differential = smaller than full).
  - Restart prompt appears after download.
  - After restart: app version shows new version in About.

### Scenarios (one per acceptance criteria)

For **each AC**, write:
- **What we're testing** (one sentence, plain language)
- **OS scope** (all / macOS only / Windows only / Linux only)
- **Step-by-step actions** a non-technical tester can follow
- **Expected result** per step
- **Screenshot / recording** where helpful
- Traceability: AC ID covered

Step rules:
- One action per step
- Exact UI: "Click the blue **Save** button in the top-right toolbar", not "save the file"
- Per-OS differences spelled out (e.g. "On macOS press ⌘S; on Windows/Linux press Ctrl+S")
- No code, no jargon

### Edge-Case Scenarios

Include the ones that apply:
- **Offline** — disconnect Wi-Fi → invoke network feature → expect graceful UI
- **Invalid input** — paste oversized file path / unicode / RTL text
- **Permission denied** — write to a read-only folder → expect typed error toast
- **Auth expired mid-flow** — token expired → re-auth flow
- **Crash & restart** — kill the renderer (`Reload` from devtools) / kill main (`kill <pid>`) → relaunch → state restored from `userData`
- **Backgrounded long** — minimize for 4h → bring back → check no stale state
- **Second instance** — try to launch the app while it's already running → focus existing window (no duplicate window)
- **`open-file` (macOS)** / **deep link (all)** — open a file association / custom protocol → app handles it
- **Multi-window** — open second window via File → New Window → independent state, single shared main process
- **Update rollback** — staged % at 0 → user on N can't downgrade, user on N-1 gets nothing (verify behavior)

### Per-OS Variations Quick-Check

| Behavior | macOS | Windows | Linux |
|----------|-------|---------|-------|
| Quit last window | App stays alive (dock click reopens) | App quits | App quits |
| Tray / menubar | menubar | system tray | system tray (varies by desktop env) |
| File dialog | native sheet | native modal | GTK/Qt dialog |
| Keyboard shortcut | ⌘ | Ctrl | Ctrl |
| Auto-update mechanism | Squirrel.Mac | Squirrel.Windows (NSIS) | AppImage zsync |

### Regression Quick Check
- Login / sign-in
- Existing core IPC flow (e.g. open file, save file)
- Existing settings persistence
- Existing tray / menubar behavior
- Auto-update check button works

### Verdict Section

| Scenario | Build | OS | Pass / Fail | Notes |
|----------|-------|-----|-------------|-------|
| INSTALL-01 | v1.4.2 | mac arm64 | | |
| AC01 | v1.4.2 | win x64 | | |

Sign-off fields: tester name, date, OS, arch, build, verdict. Defect log: description, severity, screenshot, ticket reference.

## Rules

- Write for someone who has **never seen the code**
- Steps concrete and unambiguous
- Every step has an expected result
- Test against the **signed packaged build**, not `npm run dev`
- Per-OS variations always spelled out
- Screenshots called out where visual check matters (mac traffic lights, Windows tray icon, Linux .desktop integration)

## Output

Write the completed test script to `docs/sdlc/epics/$0/TEST-SCRIPT.md`.
