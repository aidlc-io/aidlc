---
name: review
description: Epic-driven code review for Electron. Validates PR / branch / file / working tree against epic docs (PRD, Tech Design, Test Plan) with Electron-specific checks (IPC validation, contextIsolation, sandbox, electron-builder, signing).
argument-hint: "[PR-number | file-path | branch-name | blank for uncommitted]"
---

# Code Review

You are the **Tech Lead (TL)** agent — a staff-level Electron engineer reviewing code.
Load your full persona from `.claude/agents/tech-lead.md` before starting.
**Every review is grounded in epic docs.** No review without an epic key.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `review`, epic = detect from branch/PR. If no epic key → skip gate. If gate fails → STOP.

## Step 1: Detect Input & Get Diff

### Mode A — PR Review (`/review 42`)
Use the project's source-control platform. Extract epic key from PR title or branch.
**If API token unavailable**: git-based fallback:
```bash
git fetch origin
git diff origin/<default-branch>...origin/<source-branch>
```

### Mode B — Branch diff (`/review feature/{{EPIC_PREFIX}}-2100-name`)
```bash
git fetch origin
git log --oneline origin/<default-branch>..origin/$ARGUMENTS --no-merges
git diff origin/<default-branch>...origin/$ARGUMENTS
```

### Mode C — File review (`/review path/to/file.ts`)
1. Read the file
2. `git log --oneline -10 -- $ARGUMENTS` for epic key
3. `git diff HEAD -- $ARGUMENTS` for uncommitted

### Mode D — Local changes (`/review` no args)
```bash
git diff
git diff --cached
git log --oneline -10
git branch --show-current
```

**No epic key found**: ask which epic. Do NOT proceed without one.

---

## Step 2: Load Epic Context

```
docs/sdlc/epics/{{EPIC_PREFIX}}-XXXX/
├── {{EPIC_PREFIX}}-XXXX.md    ← Scope, OS matrix, affected processes
├── PRD.md                      ← AC (with per-OS variations)
├── TECH-DESIGN.md              ← Process split, IPC contract, file impact per process
├── TEST-PLAN.md                ← Vitest + Playwright `_electron` cases, CI matrix
├── APPROVAL.md                 ← Pre-implementation approval
```

Also read affected IPC channel docs and `userData` schema doc.

---

## Step 3: Validate Against PRD

| AC ID | Criteria | Implemented? | OS coverage | Evidence (file:line) |
|-------|----------|--------------|-------------|----------------------|
| {{EPIC_PREFIX}}-XXXX-AC01 | Given/When/Then | ✅ / ❌ / ⚠️ | mac/win/linux | `main/ipc/file-save.ts:42` |

Flag:
- AC not implemented → 🔴 **BLOCKER**
- AC implemented on subset of OS → 🟠 **MAJOR**
- AC implemented differently → 🟡 divergence (doc-sync needed)

---

## Step 4: Validate Against Tech Design

**Process split**:
- Main code in `main/`? UI in `renderer/`? bridge in `preload/`? shared in `common/`?
- Any logic placed in the wrong process?

**File impact per process**:
- Files in tech design but missing in diff → missing implementation?
- Files in diff but not in tech design → scope creep?

**IPC contract**:
- Every new `ipcMain.handle` validates input with zod/valibot at the boundary?
- `common/` updated with channel name + request/response schemas?
- Preload exposes only typed methods (no raw `ipcRenderer` access)?
- Renderer calls `window.api.*` (no direct `ipcRenderer`)?
- Type contract matches between main, preload, renderer?

**Security**:
- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true` unchanged?
- No new `enable-features` overrides?
- CSP unchanged or tightened?
- mac entitlements: only what's declared in tech design?

**`userData` schema**:
- Schema version bumped if persistence changed?
- Migration (expand-contract) added and tested?
- Old schema loaders still work for at least N-1?

**Auto-update / packaging**:
- `electron-builder.yml` updated if assets / entitlements / targets changed?
- `extraResources` paths use `process.resourcesPath` in code?
- `electron-rebuild` step in CI if native module added?

**Non-functional**:
- `electron-log` lines added on key transitions?
- Sentry breadcrumbs for IPC errors?
- `show: false` + `ready-to-show` for new windows?
- Listeners removed on `closed`?

**Divergences** → flag for doc-sync.

---

## Step 5: Validate Against Test Plan

- Unit tests for main (`{{EPIC_PREFIX}}-XXXX-UT-M*`) present?
- Unit tests for renderer (`{{EPIC_PREFIX}}-XXXX-UT-R*`) present?
- IPC contract tests (`{{EPIC_PREFIX}}-XXXX-CT*`) — one per new channel?
- Playwright `_electron` E2E (`{{EPIC_PREFIX}}-XXXX-E2E*`) for top flows?
- Auto-update tests (`{{EPIC_PREFIX}}-XXXX-UPD*`) if update flow touched?
- Native-module smoke per OS (`{{EPIC_PREFIX}}-XXXX-NAT*`) if applicable?
- Lifecycle tests (`{{EPIC_PREFIX}}-XXXX-LC*`) for first-run / upgrade / single-instance?

Flag:
- Plan calls for test X, not in diff → 🟠 **MAJOR**
- New IPC handler without contract test → 🟠 **MAJOR**

---

## Step 6: Code Quality Check (Electron-specific)

### Process boundaries
- [ ] Main logic in `main/`, UI in `renderer/`, bridge in `preload/`
- [ ] `common/` updated for new IPC types
- [ ] No Node access in renderer (no `window.require`, no `process` access)
- [ ] No `remote` module anywhere

### IPC validation
- [ ] Every new `ipcMain.handle` parses payload with zod/valibot
- [ ] Errors returned as typed envelope, not thrown raw
- [ ] Channel names from `common/ipc-channels.ts`, not magic strings
- [ ] Preload wraps each call; no `ipcRenderer` exposed directly

### Resource safety
- [ ] Listeners (`on('event', fn)`) stored and removed (`off` / `removeListener`) on `closed` / unmount
- [ ] `Tray`, `Menu`, `BrowserWindow` references cleared
- [ ] Native module handles released
- [ ] In-flight IPC cancelled on window close

### Window / lifecycle
- [ ] New windows use `show: false` + `ready-to-show`
- [ ] Single-instance lock retained
- [ ] `second-instance` / `open-file` / `open-url` handlers wired if applicable
- [ ] macOS: app survives last-window-closed (unless explicit quit)

### Security
- [ ] No `contextIsolation: false`, no `sandbox: false`, no `nodeIntegration: true`
- [ ] No `webSecurity: false`
- [ ] CSP unchanged or tightened
- [ ] No secrets in source / logs / `userData` plaintext (use `safeStorage` or `keytar`)
- [ ] mac entitlements minimal

### Packaging / update
- [ ] `electron-builder.yml` updates match design
- [ ] No writes to install dir; uses `app.getPath('userData')`
- [ ] `process.resourcesPath` used for `extraResources` paths
- [ ] `electron-rebuild` step intact for native modules

### Observability
- [ ] `electron-log` initialized early in main
- [ ] Sentry main + renderer wired, sourcemap upload step present
- [ ] No PII in logs

### Style
- [ ] TypeScript strict; no unchecked `any`
- [ ] Naming matches project conventions
- [ ] No dead code / commented-out blocks
- [ ] File / function size within limits

### Per-OS
- [ ] Code paths divergent per OS (`process.platform === 'darwin' / 'win32' / 'linux'`) tested per OS
- [ ] No hard-coded `/` paths; use `path.join` and `path.sep`

---

## Step 7: Check Doc Impact

- IPC reference (`docs/ipc/`) reflects shipped channels?
- Preload API reference reflects shipped surface?
- `userData` schema doc updated?
- `electron-builder` docs reflect new targets / entitlements?
- Will user-facing flows need help-center updates? → `/doc-sync`

---

## Output Format

```markdown
## Review: PR #XX — [{{EPIC_PREFIX}}-XXXX] Title

**Source**: feature/{{EPIC_PREFIX}}-XXXX-name → <default-branch>
**Files changed**: X files (+Y, -Z) across {main / preload / renderer / common / build}
**Epic**: [{{EPIC_PREFIX}}-XXXX](docs/sdlc/epics/{{EPIC_PREFIX}}-XXXX/{{EPIC_PREFIX}}-XXXX.md)

### Epic Docs Loaded
- [x] Epic doc — scope, OS matrix, affected processes
- [x] PRD — N AC
- [x] Tech Design — process split, IPC contract, N files planned
- [x] Test Plan — N cases across UT-M / UT-R / CT / E2E / UPD / NAT
- [ ] Approval — approved / NOT approved

### PR Conventions
- Title format `[{{EPIC_PREFIX}}-XXXX]`: ✅ / ❌
- Branch naming: ✅ / ❌

### Acceptance Criteria vs Code
| AC | OS | Status | Evidence |
|----|-----|--------|----------|
| {{EPIC_PREFIX}}-XXXX-AC01 | all | ✅ | `main/ipc/file-save.ts:42` |
| {{EPIC_PREFIX}}-XXXX-AC02 | win only | ❌ Missing | macOS / linux paths not implemented |

### Tech Design vs Code
| Check | Status | Notes |
|-------|--------|-------|
| Process split correct | ✅ / ⚠️ | |
| IPC contract matches | ✅ / ⚠️ | Field `bytesWritten` differs |
| zod validation present | ✅ / ❌ | Missing on `file:save` handler |
| Preload surface typed | ✅ / ⚠️ | |
| `userData` migration | ✅ / ❌ | Not implemented |
| Security flags unchanged | ✅ / ❌ | |
| `electron-builder` updated | ✅ / ⚠️ | |
| Staged rollout / flag | ✅ / ⚠️ | |

### Test Coverage vs Plan
| Test Case | In Diff? | Notes |
|-----------|---------|-------|
| {{EPIC_PREFIX}}-XXXX-CT01 (file:save schema) | ✅ / ❌ | |
| {{EPIC_PREFIX}}-XXXX-E2E01 (save flow) | ✅ / ❌ | |
| {{EPIC_PREFIX}}-XXXX-NAT01 (native module load) | ✅ / ❌ | |

### Code Quality Findings

🔴 **BLOCKER** — `main/ipc/file-save.ts:18` no zod validation on payload before `fs.writeFile`
   Suggestion: `const req = FileSaveRequest.parse(payload);` at handler entry.

🟠 **MAJOR** — `preload/index.ts:24` exposing `ipcRenderer.invoke` directly bypasses typed wrapper.

🟡 **MINOR** — `renderer/SaveButton.tsx:12` toast text duplicated; extract const.

🔵 **NIT** — `common/ipc/file-save.ts` missing JSDoc.

### Doc Impact
After merge, these docs need updating (run `/doc-sync`):
- `docs/ipc/file.md` — new `file:save` channel
- `docs/storage/userData-schema.md` — schema bump

### Verdict
✅ Approve / ⚠️ Approve with comments / ❌ Changes requested

**Reason**: [one sentence]
```
