# Doc Reverse-Sync — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Archivist
**Status:** Draft
**Created:** `$DATE`
**Stack:** React Native + Expo

---

## 1. Summary

> *What changed between what was planned and what was actually built?*

## 2. PRD → Reality Delta

| Requirement | Planned | Actual | Action |
|-------------|---------|--------|--------|
| FR-01 | | | ⬜ Update doc / ⬜ No change |
| FR-02 | | | ⬜ Update doc / ⬜ No change |

## 3. Tech Design → Reality Delta

| Decision | Planned | Actual | Action |
|----------|---------|--------|--------|
| Navigation hierarchy | | | ⬜ Update `docs/navigation.md` |
| `RootStackParamList` | | | ⬜ Update types doc |
| State strategy | | | ⬜ Update `docs/architecture.md` |
| TanStack Query keys | | | ⬜ Update `docs/hooks/<feature>.md` |
| Native module decision | | | ⬜ Update `docs/native-modules.md` |
| Permissions | | | ⬜ Update `docs/permissions.md` |
| EAS profiles / channels | | | ⬜ Update `docs/eas.md` |
| Runtime version policy | | | ⬜ Update `docs/ota.md` |
| Deep link config | | | ⬜ Update `docs/deep-links.md` |
| Push categories / payload | | | ⬜ Update `docs/push.md` |
| Privacy Manifest entries | | | ⬜ Update `app.config.ts` + privacy doc |
| Data safety form | | | ⬜ Update Play Console + privacy doc |

## 4. `app.config.ts` Diff

```diff
# git diff $(git merge-base HEAD main).. -- app.config.ts
```

| Field | Before | After | Action |
|-------|--------|-------|--------|
| `expo.ios.infoPlist.NSCameraUsageDescription` | absent | "We use camera to scan QR" | doc + Privacy Manifest |
| `expo.android.permissions` | … | + POST_NOTIFICATIONS | data safety form |
| `expo.runtimeVersion` | 1.3.0 | 1.4.0 | OTA channel reset; doc note |
| `expo.scheme` | myapp | myapp + myapp-v2 | deep-link doc |

## 5. `eas.json` Diff

| Profile / field | Before | After | Action |
|-----------------|--------|-------|--------|
| `production.env.EXPO_PUBLIC_API_BASE_URL` | … | … | EAS doc |
| `production.channel` | production | production | n/a |

## 6. Documents Updated

| Document | Change | Status |
|----------|--------|--------|
| `docs/navigation.md` | Added ItemDetail screen + linking | ⬜ Done |
| `docs/screens/ItemDetailScreen.md` | New file | ⬜ Done |
| `docs/hooks/items.md` | Added `useItem`, `useUpdateItem` | ⬜ Done |
| `docs/native-modules.md` | Updated biometric decision | ⬜ Done |
| `docs/permissions.md` | Added Face ID + POST_NOTIFICATIONS | ⬜ Done |
| `docs/eas.md` | Updated production env vars | ⬜ Done |
| `docs/ota.md` | Runtime version bump note | ⬜ Done |
| `docs/deep-links.md` | New universal link config | ⬜ Done |
| `docs/push.md` | New notification category | ⬜ Done |
| `CHANGELOG.md` | `[Native] $EPIC_ID …` / `[OTA] …` | ⬜ Done |

## 7. Reverse-Sync Checklist

- [ ] PRD reflects what was actually built (or update the doc-of-record below)
- [ ] TECH-DESIGN reflects implementation (file impact, hooks, screens)
- [ ] Navigation diagram + `RootStackParamList` doc up to date
- [ ] Hooks reference updated (signatures, query keys)
- [ ] Native module table updated (community vs custom)
- [ ] Permissions catalog updated (per platform)
- [ ] EAS profile + channel doc updated
- [ ] OTA / runtime version policy documented
- [ ] Push + deep link reference updated
- [ ] Privacy Manifest + data safety form synced
- [ ] CHANGELOG entry added with `[OTA]` / `[Native]` tags
- [ ] Migration guide written if breaking (`docs/migrations/vX.Y.Z.md`)
- [ ] ADR written for any significant deviation
- [ ] Cross-references resolve (no link rot)

## 8. Deferred Documentation

| Item | Owner | Target date |
|------|-------|-------------|
|      |       |             |

## 9. Sign-off

- [ ] Archivist sign-off
- [ ] Tech Lead acknowledgement
