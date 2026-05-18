# Technical Design — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Tech Lead
**Status:** Draft
**Created:** `$DATE`
**Platform:** Electron desktop

---

## 1. Overview

> *One-paragraph summary of the approach: which processes are affected, what changes in IPC surface and `userData` schema, any native-module or signing impact.*

## 2. Architecture

```
┌──────────────┐    contextBridge    ┌──────────────┐    ipcRenderer.invoke    ┌────────────┐
│   renderer   │ ◄────────────────► │   preload    │ ◄──────────────────────► │    main    │
│  (sandboxed) │                    │ (typed bridge)│      ipcMain.handle      │ (privileged)│
└──────────────┘                    └──────────────┘                          └────────────┘
       ▲                                                                            │
       │                                                                            ▼
       │                                                                  ┌────────────────┐
       └──────────────────── common/ (types, zod schemas) ────────────────│  userData      │
                                                                          │  native modules│
                                                                          └────────────────┘
```

### 2.1 Process Split

| Process | Responsibility |
|---------|---------------|
| `main/` | OS integration, IPC handlers, file system, native modules, auto-update, signing-aware code |
| `preload/` | Narrow `contextBridge.exposeInMainWorld('api', ...)` surface; typed wrapper around `ipcRenderer.invoke` |
| `renderer/` | Sandboxed UI; no Node access; talks to main only via `window.api.*` |
| `common/` | DTOs, zod schemas, IPC channel names, error types |

### 2.2 New / Modified Modules

| Module | Process | Responsibility |
|--------|---------|---------------|
| `main/ipc/<feature>.ts` | main | IPC handler |
| `common/ipc/<feature>.ts` | common | Channel + zod schemas |
| `preload/index.ts` | preload | Expose `window.api.<feature>` |
| `renderer/src/features/<feature>/...` | renderer | UI |

## 3. IPC Contract

### Channel: `<feature>:<action>`

**Channel constant** (`common/ipc/<feature>.ts`):
```ts
import { z } from 'zod';
export const FEATURE_ACTION_CHANNEL = '<feature>:<action>';

export const FeatureActionRequest = z.object({
  field: z.string().min(1),
});
export const FeatureActionResponse = z.object({
  id: z.string(),
  result: z.string(),
});
export const FeatureActionError = z.object({
  code: z.enum(['EINVAL', 'EACCES', 'EIO']),
  message: z.string(),
});

export type FeatureActionRequest = z.infer<typeof FeatureActionRequest>;
export type FeatureActionResponse = z.infer<typeof FeatureActionResponse>;
```

**Main handler** (`main/ipc/<feature>.ts`):
```ts
ipcMain.handle(FEATURE_ACTION_CHANNEL, async (_e, payload): Promise<FeatureActionResponse> => {
  const req = FeatureActionRequest.parse(payload); // validate at boundary
  // ... logic
  return { id, result };
});
```

**Preload exposure** (`preload/index.ts`):
```ts
contextBridge.exposeInMainWorld('api', {
  feature: {
    action: (req: FeatureActionRequest) =>
      ipcRenderer.invoke(FEATURE_ACTION_CHANNEL, req) as Promise<FeatureActionResponse>,
  },
});
```

**Error envelope:** errors thrown by the handler are surfaced to renderer as rejected promises; renderer wraps in user-facing UI.

**Versioning:** if changing an existing channel signature, introduce `<channel>@v2` and keep `@v1` until next major.

## 4. Data Model (`userData` schema)

- **Current version:** vN
- **New version:** vN+1
- **Storage:** `app.getPath('userData')/state.json` (or sqlite / electron-store)
- **Migration:** expand-contract, applied on `app.whenReady()` before window creation

```ts
// main/userData/migrations/v(N+1).ts
export function migrateToVNPlus1(prev: StateVN): StateVNPlus1 {
  return {
    schemaVersion: N + 1,
    ...prev,
    newField: defaultValue,
  };
}
```

- **Supported source versions:** vN-2, vN-1, vN → vN+1
- **Migration test fixtures:** `tests/fixtures/userData/vN.json`

## 5. Preload `contextBridge` Surface (delta)

| Method | Signature | Notes |
|--------|-----------|-------|
| `window.api.feature.action` | `(req: FeatureActionRequest) => Promise<FeatureActionResponse>` | new |

Declared in `preload/api.d.ts` and consumed by renderer via global `Window` augmentation.

## 6. File Impact (grouped by process)

| Process | File | Change | Reason |
|---------|------|--------|--------|
| main | `main/ipc/<feature>.ts` | Add | New IPC handler |
| main | `main/index.ts` | Modify | Register handler |
| main | `main/userData/migrations/vN+1.ts` | Add | Schema migration |
| preload | `preload/index.ts` | Modify | Expose new method |
| preload | `preload/api.d.ts` | Modify | Typed surface |
| common | `common/ipc/<feature>.ts` | Add | Channel + schemas |
| renderer | `renderer/src/features/<feature>/...` | Add | UI |
| build | `electron-builder.yml` | Modify | New entitlement / target / asset |

## 7. Auto-Update / Packaging Impact

```yaml
# electron-builder.yml (delta)
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
  target: [AppImage, deb]
afterSign: build/notarize.js
```

- **New entitlement (mac):** `<entitlement>` — justification: …
- **Native module rebuild:** `electron-rebuild` step verified in CI per OS
- **Asset size delta:** estimated +X MB per OS
- **Update channel:** stable
- **`stagingPercentage`:** start 5% → 25% → 100%
- **Blockmap differential:** enabled (default with electron-builder)

## 8. Security Considerations

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true` — unchanged
- All new `ipcMain.handle` validates input via zod at handler entry
- CSP unchanged or tightened
- mac entitlements: only what's listed above
- Secrets stored via `safeStorage` (or `keytar`) — never plaintext in `userData`

## 9. Performance Considerations

- Cold-start to `ready-to-show` budget: X ms
- IPC latency p95 budget: X ms
- Memory ceiling after 24h: X MB
- Native module load: lazy in main; not on hot path

## 10. Observability

- `electron-log` lines: `feature.action.start`, `feature.action.success`, `feature.action.error`
- Sentry breadcrumb per IPC call with `{ channel, latency_ms }`
- Analytics event: `feature_used` on success, `feature_error` on failure (with `{ os, arch, code }`)

## 11. Rollout & Reversibility

- **Channel:** stable
- **Staged %:** 5% → 25% → 100%
- **Feature flag:** `feature.<name>.enabled` — default `true` once ramped
- **Kill switch:** flag flipped to `false` disables IPC handler from accepting new calls
- **Rollback:** republish N-1 to `latest.yml`; `stagingPercentage: 0` on N

## 12. Per-OS Variations

| Behavior | macOS | Windows | Linux |
|----------|-------|---------|-------|
| File dialog | native sheet | native modal | GTK/Qt |
| Keyboard shortcut | ⌘ | Ctrl | Ctrl |
| Tray vs menubar | menubar | system tray | system tray |
| Auto-update mechanism | Squirrel.Mac | Squirrel.Windows (NSIS) | AppImage zsync |

## 13. Open Questions / Risks

| # | Question / Risk | Owner | Status |
|---|----------------|-------|--------|
| 1 | IPC type drift if `common/` bypassed | TL | Open |
| 2 | Native module ABI on next Electron major | TL | Open |
| 3 | Notarization queue timing during rollout | RM | Open |
