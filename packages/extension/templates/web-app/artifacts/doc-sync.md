# Doc Reverse-Sync — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Archivist
**Status:** Draft
**Created:** `$DATE`

---

## 1. Summary

> *What changed between what was planned and what was actually built?*

## 2. PRD → Reality Delta

| Requirement | Planned | Actual | Action needed |
|-------------|---------|--------|---------------|
| FR-01 |  |  | ⬜ Update doc / ⬜ No change |
| FR-02 |  |  | ⬜ Update doc / ⬜ No change |

## 3. Tech Design → Reality Delta

| Design decision | Planned | Actual | Action needed |
|-----------------|---------|--------|---------------|
| RSC / client boundary |  |  | ⬜ Update doc / ⬜ No change |
| Server Action signatures |  |  | ⬜ Update doc / ⬜ No change |
| tRPC procedure signatures |  |  | ⬜ Update doc / ⬜ No change |
| TanStack Query keys + invalidation |  |  | ⬜ Update doc / ⬜ No change |
| Edge vs Node runtime |  |  | ⬜ Update doc / ⬜ No change |
| Data model |  |  | ⬜ Update doc / ⬜ No change |

## 4. Code Surface Changes

| Surface | Change | Documented? |
|---------|--------|-------------|
| New route(s) | `/projects/...` | ⬜ |
| New tRPC procedure(s) | `projects.list`, `projects.create` | ⬜ |
| New Server Action(s) | `createProjectAction` | ⬜ |
| Component prop additions / renames | `ProjectFilter.onChange` → `onValueChange` | ⬜ |
| New i18n keys | `projects.title`, `projects.empty` | ⬜ |
| Removed i18n keys | — | ⬜ |
| New env var(s) | `NEXT_PUBLIC_X` / server-only `Y` | ⬜ |
| New feature flag | `<flag_name>` | ⬜ |
| CSP header change | — | ⬜ |

## 5. Documents Updated

| Document | Change | Status |
|----------|--------|--------|
| `README.md` | New env var documented | ⬜ Done |
| `docs/architecture.md` | New runtime decision noted | ⬜ Done |
| `docs/api/` (tRPC / OpenAPI reference) | New procedures added | ⬜ Done |
| `components/ui/.../Component.stories.mdx` | New variant story | ⬜ Done |
| Storybook MDX docs page | Prop change | ⬜ Done |
| User help center | New flow walkthrough | ⬜ Done |
| In-app changelog (`app/(marketing)/changelog`) | Release entry | ⬜ Done |
| `messages/en.json` | New + removed keys | ⬜ Done |
| `messages/<other>.json` | New + removed keys (all locales) | ⬜ Done |
| `docs/migrations/v0.0.0.md` | Breaking change migration | ⬜ Done (if applicable) |
| `CHANGELOG.md` | Release entry | ⬜ Done |

## 6. Reverse-Sync Checklist

- [ ] PRD reflects what was actually built
- [ ] TECH-DESIGN.md updated to match implementation (file impact accurate)
- [ ] Architecture / layering docs current
- [ ] API reference current (tRPC procedures / OpenAPI / Server Action shapes)
- [ ] Storybook stories cover new component states
- [ ] User help center reflects user-visible flow changes
- [ ] i18n catalogs synced across all locales
- [ ] README env vars + local dev steps current
- [ ] ADR written for any significant deviation (irreversible / wide-impact)
- [ ] Changelog entry added (user-facing + technical)
- [ ] Migration guide present for breaking changes
- [ ] Cross-references resolve (no broken links — link-checker pass if available)
- [ ] No "coming soon" for scope-cut features
- [ ] Code examples in updated sections still run

## 7. Deferred Documentation

> *Items that couldn't be completed now — log as follow-up.*

| Item | Owner | Target date |
|------|-------|-------------|
| Screencast for `/projects/new` flow | | |

## 8. Sign-off

- [ ] Archivist sign-off
- [ ] Tech Lead acknowledgement
- [ ] PO acknowledgement (user-facing docs accurate)
