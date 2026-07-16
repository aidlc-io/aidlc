# GH-68 Implementation Summary

## Branch
`feature/GH-68-epics-dir-setting` — PR: https://github.com/aidlc-io/aidlc/pull/70

## What was built
A configurable epics directory — viewable and changeable from both VS Code Settings and the extension's webview UI, with a "no project" experience that lets users start epics or load them from other projects.

### 1. VS Code Setting + bidirectional sync
- **Setting → YAML**: when the user changes `aidlc.workspace.epicsDirectory`, `state.root` in `workspace.yaml` is updated. All consumers (epicsList, epicWizard, core/EpicScaffold) already read from `workspace.yaml`, so the epic list and Start Epic wizard use the new directory immediately.
- **YAML → Setting**: on activation and whenever the workspace.yaml file watcher fires, `state.root` is read and the VS Code setting is updated to match. A guard flag prevents write loops.

### 2. Webview UI — Epics view
- Current epics directory shown in the Epics view header with:
  - **Pencil icon** — inline text edit (Enter to commit, Escape to cancel)
  - **Folder icon** — native folder picker (`browseEpicsDir`)
- Supports paths outside the workspace (stored as absolute path; inside workspace uses relative).

### 3. Webview UI — Start Epic modal
- When starting the **first epic** (empty list), a highlighted "Epics directory" section appears at the top of the modal with text input + Browse button.
- When epics already exist, the section is hidden (not needed).

### 4. No-project Epics view
- When no project is open, the Epics tab shows 3 action cards instead of a blank screen:
  - **Start Epic** — browse to pick a project folder, open it, user starts epic from the Epics view
  - **Load Epics from Folder** — browse to an epics folder from another project; auto-detects the parent project (walks up looking for `.aidlc/workspace.yaml`) and opens it with epics dir pre-configured
  - **Open Project** — standard folder open

### 5. Current/New window prompt
- When opening a folder and a project is already open, a QuickPick asks "Current window" (replace) or "New window" (keep both).
- When no project is open, silently reuses the current window.

## Files touched
| File | Change |
|------|--------|
| `packages/extension/package.json` | Added `aidlc.workspace.epicsDirectory` to `contributes.configuration` (string, default `docs/epics`, resource-scoped) |
| `packages/extension/src/extension.ts` | Import sync helpers; register `onDidChangeConfiguration` listener; call `syncYamlToSetting()` on activate + yaml watcher |
| `packages/extension/src/v2/epicsDirSync.ts` | **New** — pure helpers: `readEpicsDirFromYaml()`, `writeEpicsDirToYaml()`, `DEFAULT_EPICS_DIR` |
| `packages/extension/src/v2/workspaceWebview.ts` | `changeEpicsDir`, `browseEpicsDir`, `loadEpicsFromFolder`, `startEpicPickProject` message handlers; `openFolder()` helper with current/new window prompt; pass `epicsDir` in `buildState` |
| `packages/extension/src/webview/components/EpicsView.tsx` | Epics dir display in header with inline edit + folder browse |
| `packages/extension/src/webview/components/StartEpicModal.tsx` | Epics dir prompt section on first epic (`isFirstEpic` prop) |
| `packages/extension/src/webview/components/WorkspaceShell.tsx` | `NoProjectEpicsView` component with 3 action cards |
| `packages/extension/src/webview/lib/types.ts` | Added `epicsDir: string` to `WorkspaceState` |
| `packages/extension/test/epicsDirSync.test.ts` | **New** — 7 unit tests covering read/write/defaults |

## Acceptance criteria addressed
| Criteria | Status |
|----------|--------|
| Setting in the extension UI to view and change the epics directory | Done — VS Code Settings + webview header + Start Epic modal |
| Changing it updates `state.root` in workspace.yaml | Done — `onDidChangeConfiguration` + `changeEpicsDir` handler |
| Epic list and Start Epic immediately use the new directory | Done — they read from workspace.yaml; YAML updated on any change |
| Default `docs/epics` when nothing is set is unchanged | Done — `DEFAULT_EPICS_DIR = 'docs/epics'`; tested |

## Unit tests added
| Test ID | Description |
|---------|-------------|
| GH-68-UT01a | `readEpicsDirFromYaml` returns `state.root` when set |
| GH-68-UT01b | Returns default when `state.root` is absent |
| GH-68-UT01c | Returns default when `workspace.yaml` does not exist |
| GH-68-UT02a | `writeEpicsDirToYaml` creates `state.root` when state section missing |
| GH-68-UT02b | Updates existing `state.root` |
| GH-68-UT02c | Preserves other state fields (entity, status_file) |
| GH-68-UT02d | No-op when `workspace.yaml` does not exist |
| GH-68-UT02e | Setting to default value still writes explicitly |

## Coverage
The project does not have coverage tooling configured (`vitest` is used without `--coverage`). All 17 extension tests pass; core tests have a pre-existing vitest resolution issue unrelated to this change.
