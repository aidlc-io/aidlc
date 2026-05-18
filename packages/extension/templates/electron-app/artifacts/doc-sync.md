# Doc Reverse-Sync — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Archivist
**Status:** Draft
**Created:** `$DATE`
**Platform:** Electron desktop

---

## 1. Summary

> *What changed between what was planned and what was actually built? Focus on IPC surface, preload API, `userData` schema, electron-builder config, update channel, and per-OS behavior.*

## 2. PRD → Reality Delta

| Requirement | Planned | Actual | Action needed |
|-------------|---------|--------|--------------|
| FR-01 | | | ⬜ Update doc / ⬜ No change |
| FR-02 | | | ⬜ Update doc / ⬜ No change |

## 3. Tech Design → Reality Delta

| Design decision | Planned | Actual | Action needed |
|----------------|---------|--------|--------------|
| Process split (main / preload / renderer) | | | ⬜ Update doc / ⬜ No change |
| IPC channel name + schemas | | | ⬜ Update doc / ⬜ No change |
| Preload `contextBridge` surface | | | ⬜ Update doc / ⬜ No change |
| `userData` schema version | vN+1 | | ⬜ Update doc / ⬜ No change |
| `userData` migration sources supported | vN-2, vN-1, vN | | ⬜ Update doc / ⬜ No change |
| `electron-builder` targets | | | ⬜ Update doc / ⬜ No change |
| mac entitlements | | | ⬜ Update doc / ⬜ No change |
| Update channel / `stagingPercentage` | | | ⬜ Update doc / ⬜ No change |
| Native modules | | | ⬜ Update doc / ⬜ No change |

## 4. Per-OS Behavior Delta

| Behavior | Planned | Actual (mac) | Actual (win) | Actual (linux) | Action |
|----------|---------|--------------|--------------|----------------|--------|
| | | | | | ⬜ |

## 5. Documents Updated

| Document | Change | Status |
|----------|--------|--------|
| `docs/ipc/<channel>.md` | Added new channel reference | ⬜ Done |
| `docs/preload/api.md` | Documented new `window.api.feature.action` method | ⬜ Done |
| `docs/storage/userData-schema.md` | Bumped to vN+1; migration noted | ⬜ Done |
| `docs/build/electron-builder.md` | New entitlement documented | ⬜ Done |
| `docs/updates/channels.md` | No change | ⬜ Skip |
| `docs/native-modules.md` | Updated CI matrix | ⬜ Done |
| `docs/architecture.md` | Updated process split diagram | ⬜ Done |
| `README.md` | No change | ⬜ Skip |
| `CHANGELOG.md` | Entry for v0.0.0 added under New / Breaking | ⬜ Done |
| `docs/migrations/v0.0.0.md` | IPC channel rename migration written | ⬜ Done |

## 6. Reverse-Sync Checklist

- [ ] PRD reflects what was actually built (or annotated where intentionally not)
- [ ] TECH-DESIGN.md updated to match implementation (or divergences flagged)
- [ ] IPC reference docs reflect shipped zod schemas (not planned ones)
- [ ] Preload API reference matches `preload/api.d.ts`
- [ ] `userData` schema version + migration documented
- [ ] `electron-builder` targets / entitlements documented
- [ ] Auto-update channel + `stagingPercentage` documented
- [ ] Native module CI matrix documented
- [ ] Per-OS divergences documented
- [ ] Breaking changes have a migration note **and** `CHANGELOG.md` entry
- [ ] Code examples in updated docs compile against shipped surface
- [ ] Cross-references resolve (no broken links)
- [ ] Help-center / user guide updated (if user-visible flow changed)

## 7. Deferred Documentation

> *Items that couldn't be completed now — log as follow-up tasks.*

| Item | Owner | Target date |
|------|-------|------------|
|      |       |            |

## 8. Sign-off

- [ ] Archivist sign-off
- [ ] Tech Lead acknowledgement (IPC + preload + `userData` docs)
- [ ] Release Manager acknowledgement (build + signing + channel docs)
