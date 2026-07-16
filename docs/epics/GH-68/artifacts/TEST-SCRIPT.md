# GH-68 Test Script — Epics Directory Configurable from UI

## Prerequisites

- **Extension version**: Build from branch `feature/GH-68-epics-dir-setting` (PR #70) or later
- **VS Code**: 1.85.0+
- **Project**: Any folder with `.aidlc/workspace.yaml` present (run `AIDLC: Init Sample Workspace` if needed)
- **No special accounts or feature flags required**

---

## Scenario 1: View the epics directory setting in VS Code Settings

**What we're testing**: The new setting is discoverable in the VS Code Settings UI.
**Traces to**: AC — "There's a setting in the extension UI to view and change the epics directory."

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open VS Code Settings: press `Cmd+,` (macOS) or `Ctrl+,` (Windows/Linux) | The Settings tab opens |
| 2 | In the search bar, type `aidlc epics` | A setting named **Aidlc > Workspace: Epics Directory** appears in the results |
| 3 | Read the setting description | It says: "Relative path (from the project root) where epics are stored. Changing this updates `state.root` in workspace.yaml. The epic list and Start Epic wizard use this directory immediately." |
| 4 | Read the default value | The field shows `docs/epics` |

**Verdict**: PASS / FAIL

---

## Scenario 2: Change the setting and verify workspace.yaml updates

**What we're testing**: Changing the setting writes `state.root` in workspace.yaml.
**Traces to**: AC — "Changing it updates `state.root` in workspace.yaml."

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open `.aidlc/workspace.yaml` in the editor and note the current `state:` section (or its absence) | You can see the current YAML content |
| 2 | Open VS Code Settings (`Cmd+,`) and search for `aidlc epics` | The **Epics Directory** setting appears |
| 3 | Change the value from `docs/epics` to `custom/epics` and press Enter or click away | The setting value updates to `custom/epics` |
| 4 | Switch back to the `.aidlc/workspace.yaml` editor tab | The file content has changed |
| 5 | Look for the `state:` section in workspace.yaml | There is a `state:` section with `root: custom/epics` (or `root: "custom/epics"`) |

**Verdict**: PASS / FAIL

---

## Scenario 3: Epic list uses the new directory immediately

**What we're testing**: After changing the setting, the Epics panel reads from the new directory.
**Traces to**: AC — "The epic list and 'Start Epic' immediately use the new directory."

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a folder `custom/epics/TEST-EPIC/artifacts/` in the project root | The folder exists on disk |
| 2 | Create a file `custom/epics/TEST-EPIC/artifacts/PRD.md` with content `---\nstatus: draft\n---\n# Test` | The file exists |
| 3 | Open VS Code Settings and change **Epics Directory** to `custom/epics` | Setting updates |
| 4 | Open the AIDLC sidebar and click the Epics tab (or run `AIDLC: Open Epics List`) | The Epics panel opens |
| 5 | Look for `TEST-EPIC` in the epics list | `TEST-EPIC` appears in the list (as an artifacts-only epic) |
| 6 | Change the setting back to `docs/epics` | Setting updates |
| 7 | Refresh the Epics panel | `TEST-EPIC` no longer appears (it's under `custom/epics`, not `docs/epics`) |

**Verdict**: PASS / FAIL

---

## Scenario 4: Start Epic uses the new directory

**What we're testing**: The Start Epic wizard creates the epic folder in the configured directory.
**Traces to**: AC — "The epic list and 'Start Epic' immediately use the new directory."

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open VS Code Settings and change **Epics Directory** to `test-epics` | Setting updates |
| 2 | Open the Command Palette (`Cmd+Shift+P`) and run `AIDLC: Start Epic` | The Start Epic wizard opens |
| 3 | Pick any pipeline or agent and complete the wizard (enter an epic ID like `VERIFY-1`, leave title/description blank or fill them) | The wizard completes with a success message |
| 4 | Check the file explorer | A folder `test-epics/VERIFY-1/` exists with `state.json`, `inputs.json`, and `artifacts/` inside |
| 5 | Verify `docs/epics/VERIFY-1/` does NOT exist | The folder was created in `test-epics/`, not the old default |

**Cleanup**: Delete `test-epics/` and change the setting back to `docs/epics`.

**Verdict**: PASS / FAIL

---

## Scenario 5: Default behavior unchanged when setting is not modified

**What we're testing**: Existing projects without the setting continue to use `docs/epics`.
**Traces to**: AC — "Existing behavior (default `docs/epics` when nothing is set) is unchanged."

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open VS Code Settings and confirm **Epics Directory** shows the default value `docs/epics` | Default is `docs/epics` |
| 2 | Open `.aidlc/workspace.yaml` and remove the entire `state:` section (if present), then save | The file no longer has a `state:` section |
| 3 | Open the Epics panel | It shows epics from `docs/epics/` (any existing epics appear) |
| 4 | Run `AIDLC: Start Epic`, pick any target, enter epic ID `DEFAULT-1` | Wizard completes |
| 5 | Check the file explorer | `docs/epics/DEFAULT-1/` exists with `state.json` and `artifacts/` |

**Cleanup**: Delete `docs/epics/DEFAULT-1/` if desired.

**Verdict**: PASS / FAIL

---

## Scenario 6 (Edge): Hand-edit workspace.yaml and verify setting syncs back

**What we're testing**: When a user manually edits `state.root` in workspace.yaml, the VS Code setting updates to match.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open VS Code Settings — note the current **Epics Directory** value (e.g. `docs/epics`) | Value noted |
| 2 | Open `.aidlc/workspace.yaml` in the editor | File opens |
| 3 | Add or change `state.root` to `manual/epics` and save the file | File saved |
| 4 | Wait 1–2 seconds (workspace.yaml watcher fires) | — |
| 5 | Open VS Code Settings and check **Epics Directory** | The value now shows `manual/epics` |

**Cleanup**: Revert workspace.yaml change.

**Verdict**: PASS / FAIL

---

## Scenario 7 (Edge): Setting change with no workspace.yaml

**What we're testing**: Changing the setting when workspace.yaml doesn't exist does not crash.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Rename `.aidlc/workspace.yaml` to `.aidlc/workspace.yaml.bak` (temporarily remove it) | File renamed |
| 2 | Open VS Code Settings and change **Epics Directory** to `no-yaml/epics` | Setting updates without error — no crash, no error toast |
| 3 | Rename `.aidlc/workspace.yaml.bak` back to `.aidlc/workspace.yaml` | File restored |

**Verdict**: PASS / FAIL

---

## Scenario 8: Epics directory shown in webview header

**What we're testing**: The Epics view header displays the current epics directory with edit/browse controls.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open the AIDLC Workspace panel and click the **Epics** tab | Epics view opens |
| 2 | Look below the "AIDLC Epics" title | A folder icon and the path (e.g. `docs/epics`) are shown, with a pencil icon and a folder-browse icon |
| 3 | Click the **pencil** icon | An inline text input appears with the current path |
| 4 | Change the path to `custom/epics` and press Enter | The input closes; the displayed path updates to `custom/epics` |
| 5 | Open `.aidlc/workspace.yaml` | `state.root` is now `custom/epics` |
| 6 | Click the **folder** icon next to the path | A native folder picker dialog opens |
| 7 | Pick a folder inside the workspace | The path updates to the relative path of that folder |
| 8 | Pick a folder **outside** the workspace | The path updates to the absolute path of that folder |

**Cleanup**: Change the path back to `docs/epics`.

**Verdict**: PASS / FAIL

---

## Scenario 9: Start Epic modal prompts for directory on first epic

**What we're testing**: When no epics exist yet, the Start Epic modal shows an "Epics directory" section at the top.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ensure the epics directory is empty (no epic subfolders) | The Epics view shows "No epics yet." |
| 2 | Click **Start Epic** | The Start Epic modal opens |
| 3 | Look at the top of the modal | A highlighted "Epics directory" section appears with the current path and a Browse button |
| 4 | Change the path to `my-epics` and click away (blur) | The path is committed (workspace.yaml updated) |
| 5 | Complete the Start Epic flow (pick a pipeline, enter epic ID) | The epic is created under `my-epics/` |
| 6 | Open Start Epic again (now there's 1 epic) | The "Epics directory" section is **not** shown |

**Cleanup**: Delete `my-epics/` and reset the path to `docs/epics`.

**Verdict**: PASS / FAIL

---

## Scenario 10: No-project Epics view — Start Epic card

**What we're testing**: When no project is open, the Epics tab shows action cards including "Start Epic".

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open VS Code with no folder open (or close the current folder) | No project is loaded |
| 2 | Open the AIDLC Workspace panel and click the **Epics** tab | Three cards appear: **Start Epic**, **Load Epics from Folder**, **Open Project** |
| 3 | Click **Start Epic** | A folder picker dialog opens asking to select a project folder |
| 4 | Pick a project folder | The folder opens in the **current** VS Code window |
| 5 | The Epics view now shows the project's epics (or "No epics yet.") | Normal Epics view is rendered |

**Verdict**: PASS / FAIL

---

## Scenario 11: No-project Epics view — Load Epics from Folder card

**What we're testing**: Browsing to an epics folder from another project auto-detects its project root.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open VS Code with no folder open | No project is loaded |
| 2 | Click **Load Epics from Folder** on the Epics tab | A folder picker dialog opens |
| 3 | Navigate to and select an epics folder from another project (e.g. `~/other-project/docs/epics`) | The picker closes |
| 4 | If the parent project has `.aidlc/workspace.yaml` | The **project root** opens (not just the epics folder), with epics dir set to the relative path |
| 5 | If no `.aidlc/workspace.yaml` is found walking up | The epics folder's parent opens as the workspace |

**Verdict**: PASS / FAIL

---

## Scenario 12: Current window / New window prompt

**What we're testing**: When a project is already open, opening another folder asks the user where to open it.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open a project in VS Code | A project is loaded |
| 2 | On the Epics tab, trigger any action that opens a folder (e.g. no-project "Start Epic" — close the folder first, then reopen to trigger; or use "Load Epics from Folder" from a project) | — |
| 3 | Alternatively: close the current folder, go to Epics tab, click "Open Project", pick a folder | The folder opens in the current window (no prompt — no project was open) |
| 4 | Now with a project open, go to Epics tab empty state and click "Open Project" or use any folder-open action | A QuickPick appears: **Current window** / **New window** |
| 5 | Pick **Current window** | The new folder replaces the current project in this window |
| 6 | Repeat, pick **New window** | A new VS Code window opens with the selected folder; the original window keeps its project |
| 7 | Press Escape on the QuickPick | Nothing happens — the action is cancelled |

**Verdict**: PASS / FAIL

---

## Regression Quick Check

| Check | Action | Expected |
|-------|--------|----------|
| Builder opens | Run `AIDLC: Open Workspace Builder` | Builder panel opens without error |
| Epics list loads | Click Epics tab in AIDLC sidebar | Existing epics render correctly |
| Start Epic works with default | Run Start Epic with default `docs/epics` setting | Epic created in `docs/epics/` |
| Token monitor unaffected | Check status bar token usage item | Still shows token data |

---

## Verdict & Sign-off

| Field | Value |
|-------|-------|
| Tester | |
| Date | |
| Environment | VS Code ___; macOS/Windows/Linux ___ |
| Extension version | |
| Overall verdict | PASS / FAIL |

### Defect Log

| # | Description | Severity | Screenshot | Ticket |
|---|-------------|----------|------------|--------|
| | | | | |
