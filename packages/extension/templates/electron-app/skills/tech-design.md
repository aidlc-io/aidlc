---
name: tech-design
description: Generate or review a Technical Design for an Electron epic. Produces process split (main/preload/renderer), IPC contract, userData schema migration, electron-builder + electron-updater impact, file impact grouped by process, and per-OS rollout plan.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Tech Design for Epic $0

You are the **Tech Lead (TL)** agent — a staff-level engineer with deep Electron architectural experience.
Load your full persona from `.claude/agents/tech-lead.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `design`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read the epic doc: `docs/sdlc/epics/$0/$0.md`
2. Read the PRD: `docs/sdlc/epics/$0/PRD.md` (must be complete)
3. Read the template: `docs/sdlc/epics/$0/TECH-DESIGN.md` or `docs/sdlc/templates/TECH-DESIGN-TEMPLATE.md`
4. Analyze the existing codebase:
   - Architecture overview: `CLAUDE.md`, `README.md`, `docs/architecture.md`
   - `electron-builder.yml` / `electron-builder.json` / `package.json#build`
   - `BrowserWindow` creation sites in `main/`
   - Preload surface: `preload/` + `common/ipc/`
   - Existing IPC handlers: `main/ipc/*`
   - `userData` schema doc (if present): `docs/storage/userData-schema.md`
   - Auto-update wiring: `electron-updater` setup, feed URL, channel
   - Related ADRs (`docs/adr/`)
5. Fill the tech design with the sections below

## Tech Design Contents

### Summary
- One paragraph: what is being built, which processes are affected, what changes in the IPC surface and `userData` schema (if any)

### Architecture
- **Process split**: which logic lives in `main/`, `preload/`, `renderer/`, `common/`
- **Component / module diagram** showing process boundaries
- **Key design choices** with rationale — especially IPC surface decisions, native-module decisions, sandboxing exceptions (there should be none)
- Link ADRs for irreversible IPC contract / signing / packaging changes

### IPC Contract

For **every new or modified channel**, specify:

| Channel | Direction | Request schema (zod) | Response schema (zod) | Error envelope |
|---------|-----------|---------------------|----------------------|----------------|
| `file:save` | renderer → main | `{ path: string, data: string }` | `{ bytesWritten: number }` | `{ code: 'EACCES' \| 'ENOENT' \| 'EIO', message: string }` |

Sample IPC block:

```ts
// common/ipc/file-save.ts
import { z } from 'zod';
export const FILE_SAVE_CHANNEL = 'file:save';
export const FileSaveRequest = z.object({
  path: z.string().min(1),
  data: z.string(),
});
export const FileSaveResponse = z.object({ bytesWritten: z.number() });
export type FileSaveRequest = z.infer<typeof FileSaveRequest>;
export type FileSaveResponse = z.infer<typeof FileSaveResponse>;
```

State versioning / backward-compatibility strategy for any renamed or removed channel.

### Preload `contextBridge` Surface

For every new method exposed:

```ts
// preload/index.ts
contextBridge.exposeInMainWorld('api', {
  saveFile: (req: FileSaveRequest) => ipcRenderer.invoke(FILE_SAVE_CHANNEL, req) as Promise<FileSaveResponse>,
});
```

Declared types in `common/preload-api.d.ts` so `window.api` is fully typed in renderer.

### Data Model (`userData` schema)

- **Current schema version**: vN
- **New schema version**: vN+1
- **Migration**: expand-contract, applied on `app.whenReady()` before window creation
- **Storage layout**: file path under `app.getPath('userData')`, format (JSON, sqlite, electron-store)
- **Migration test**: load vN fixture → migrate → assert vN+1 invariants

### State Management

- Where state lives (renderer in-memory / `userData` persistent / main-process singleton)
- Lifecycle (created, updated, invalidated, destroyed)
- Synchronization across windows (broadcast via `webContents.send` to all windows)

### Sequence / Flow

- Key interaction across processes — diagram or text:
  ```
  renderer (button click)
    → window.api.saveFile(req)
    → ipcRenderer.invoke('file:save', req)
    → ipcMain.handle('file:save', validate(req), fs.writeFile, return response)
    → renderer awaits, updates UI state
  ```
- Include error / retry paths

### Dependency Wiring

- How new modules are registered in the main-process container
- Lifetimes: most main-process services are singletons, scoped to `app.whenReady()`
- Renderer-side: React context / Zustand / Pinia store

### Window / Navigation Changes

- New `BrowserWindow` configurations (always `show: false` + `ready-to-show`)
- New menu items / keyboard shortcuts (`Menu.setApplicationMenu`)
- New tray / dock menu entries
- New deep-link / `open-file` / `open-url` handlers (per-OS)

### Native Module Impact

- Which native module (if any), why
- ABI / rebuild strategy: `electron-rebuild` in CI per OS
- Fallback if native load fails (e.g. graceful degradation, error UI)

### Auto-Update / Packaging Impact

Sample `electron-builder` publish stanza for a new asset:

```yaml
# electron-builder.yml
publish:
  - provider: github
    owner: example-org
    repo: example-app
mac:
  hardenedRuntime: true
  entitlements: build/entitlements.mac.plist
  notarize: true
  target:
    - { target: dmg, arch: [arm64, x64] }
    - { target: zip, arch: [arm64, x64] }
win:
  certificateFile: ${WIN_CERT_PATH}
  signingHashAlgorithms: [sha256]
  target:
    - { target: nsis, arch: [x64] }
linux:
  target:
    - AppImage
    - deb
afterSign: build/notarize.js
```

- Update channel changes (stable / beta / nightly)
- `stagingPercentage` plan
- `blockmap` differential impact
- New entitlements (mac) or new permissions
- Asset size delta budget

### Non-Functional Design

- **Performance budget** — cold-start to `ready-to-show` (ms), renderer FCP, memory ceiling at 24h idle, IPC latency p95
- **Reliability** — IPC timeouts / retries, native module load failure handling
- **Security** — CSP unchanged or tightened; sandbox flags unchanged; IPC validation at every handler
- **Observability** — `electron-log` lines on key transitions, Sentry breadcrumbs, update events to analytics
- **Accessibility** — keyboard nav, screen reader (NVDA/VoiceOver/Orca), high contrast
- **Compatibility** — min Electron version, min OS versions per platform
- **Offline** — IPC handlers degrade gracefully when offline (network ops only)

### Rollout & Reversibility

- Channel: stable / beta
- Staged %: starting value (e.g. 5%) + ramp schedule
- Feature flag for risky native code paths
- Rollback: republish N-1 to `latest.yml`, set N's `stagingPercentage` to 0

### File / Module Impact (grouped by process)

| Process | File | Change | Reason |
|---------|------|--------|--------|
| main    | `main/ipc/file-save.ts` | Add | New IPC handler |
| main    | `main/index.ts` | Modify | Register handler |
| preload | `preload/index.ts` | Modify | Expose `saveFile` |
| common  | `common/ipc/file-save.ts` | Add | Channel + schemas |
| renderer | `renderer/src/components/SaveButton.tsx` | Add | UI |
| build   | `electron-builder.yml` | Modify | New entitlement |

### Risks & Technical Debt

- IPC type drift between main and renderer if `common/` is bypassed
- Native module ABI break on next Electron major
- `userData` migration failure leaving users stranded
- Signing cert expiry during rollout window

### Open Questions

- Questions that block implementation, with owner

## Architecture Rules (Electron-Specific)

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true` — unchanged
- Every `ipcMain.handle` validates input (zod/valibot)
- Preload surface is typed and minimal — no `ipcRenderer` leak
- `userData` schema is versioned, migrations are expand-contract
- Auto-update feed is signed; no unsigned fallback
- Native modules rebuilt via `electron-rebuild` in CI per OS
- Long-lived listeners are stored and disposed

## Output

Write the completed tech design to `docs/sdlc/epics/$0/TECH-DESIGN.md`.
