# Implementation Summary — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Developer
**Branch:** `feature/$EPIC_ID-<slug>`
**Status:** Draft
**Created:** `$DATE`
**Platform:** Electron desktop

---

## 1. Branch & PR

| Item | Value |
|------|-------|
| Branch | `feature/$EPIC_ID-<slug>` |
| PR | *(link once opened)* |
| Base | `main` |

## 2. Files Changed (grouped by process)

| Process | File | Type | Description |
|---------|------|------|-------------|
| main | `main/ipc/<feature>.ts` | Add | IPC handler |
| main | `main/index.ts` | Modify | Register handler |
| main | `main/userData/migrations/vN+1.ts` | Add | Schema migration |
| preload | `preload/index.ts` | Modify | Expose `window.api.feature.action` |
| preload | `preload/api.d.ts` | Modify | Typed surface |
| common | `common/ipc/<feature>.ts` | Add | Channel + zod schemas |
| renderer | `renderer/src/features/<feature>/index.tsx` | Add | UI |
| build | `electron-builder.yml` | Modify | New entitlement |

## 3. Implementation Notes

> *Key decisions made during implementation. Reference TECH-DESIGN.md sections where relevant.*

### IPC contract

```ts
// common/ipc/<feature>.ts
import { z } from 'zod';
export const FEATURE_ACTION_CHANNEL = '<feature>:<action>';
export const FeatureActionRequest = z.object({ field: z.string().min(1) });
export const FeatureActionResponse = z.object({ id: z.string(), result: z.string() });
export type FeatureActionRequest = z.infer<typeof FeatureActionRequest>;
export type FeatureActionResponse = z.infer<typeof FeatureActionResponse>;
```

### Main handler

```ts
// main/ipc/<feature>.ts
import { ipcMain } from 'electron';
import {
  FEATURE_ACTION_CHANNEL,
  FeatureActionRequest,
  type FeatureActionResponse,
} from '../../common/ipc/<feature>';

export function registerFeatureHandlers(): void {
  ipcMain.handle(FEATURE_ACTION_CHANNEL, async (_e, payload): Promise<FeatureActionResponse> => {
    const req = FeatureActionRequest.parse(payload); // validate at boundary
    // ... logic
    return { id: 'x', result: req.field };
  });
}
```

### Preload exposure

```ts
// preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
import {
  FEATURE_ACTION_CHANNEL,
  type FeatureActionRequest,
  type FeatureActionResponse,
} from '../common/ipc/<feature>';

contextBridge.exposeInMainWorld('api', {
  feature: {
    action: (req: FeatureActionRequest): Promise<FeatureActionResponse> =>
      ipcRenderer.invoke(FEATURE_ACTION_CHANNEL, req),
  },
});
```

### Renderer caller

```tsx
// renderer/src/features/<feature>/index.tsx
const res = await window.api.feature.action({ field: input });
```

### Playwright `_electron` E2E

```ts
import { _electron as electron, expect, test } from '@playwright/test';

test('feature flow', async () => {
  const app = await electron.launch({ args: ['./dist/main/index.js'] });
  const window = await app.firstWindow();
  await window.click('button#feature');
  await window.fill('input#field', 'test');
  await window.click('button#confirm');
  await expect(window.locator('.toast.success')).toBeVisible();
  await app.close();
});
```

### Deviations from Tech Design

> *List any places where implementation diverged from `TECH-DESIGN.md` and why.*

None.

## 4. Tests Written

| Test file | Test IDs | Coverage target |
|-----------|---------|-----------------|
| `main/__tests__/ipc-<feature>.test.ts` | `$EPIC_ID-UT-M-*`, `$EPIC_ID-CT-*` | ≥ 80% |
| `renderer/__tests__/<feature>.test.tsx` | `$EPIC_ID-UT-R-*` | ≥ 70% |
| `tests/e2e/<feature>.spec.ts` | `$EPIC_ID-E2E-*` | n/a |
| `tests/migrations/vN-to-vN+1.test.ts` | `$EPIC_ID-LC-*` | ≥ 95% |

## 5. Pre-PR Checklist

- [ ] Lint passes (`npm run lint`)
- [ ] Type-check passes (`npm run typecheck` — strict)
- [ ] Vitest main passes (`npm run test:main`)
- [ ] Vitest renderer passes (`npm run test:renderer`)
- [ ] Playwright `_electron` passes (`npm run test:e2e`)
- [ ] `electron-rebuild` runs in CI postinstall (if native module added)
- [ ] `electron-builder` builds locally on dev machine (smoke)
- [ ] No new console errors in dev mode
- [ ] No `contextIsolation: false`, no `sandbox: false`, no `nodeIntegration: true`
- [ ] No raw `ipcRenderer` exposed via preload
- [ ] Every new `ipcMain.handle` calls `Schema.parse(payload)` at entry
- [ ] PR body references epic key `$EPIC_ID`
- [ ] Reviewer assigned

## 6. `electron-builder` / packaging notes

- New entitlements (mac): *(list, with justification)*
- New `extraResources`: *(list)*
- Asset size delta: ~ +X MB per OS

## 7. Known Limitations / Follow-ups

- …
