---
name: doc-sync
description: Run doc reverse-sync for a React Native epic. Compares planned (PRD + Tech Design) vs built (code + app.config.ts + eas.json + git log), then updates affected docs — screens, hooks, native modules, permissions, EAS profiles, OTA channels.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Doc Reverse-Sync for Epic $0

You are the **Archivist** agent — a senior RN technical writer / docs engineer.
Load your full persona from `.claude/agents/archivist.md` before starting.
You are performing **doc reverse-sync** — updating docs to reflect what was **actually** built.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `doc-sync`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read epic: `docs/sdlc/epics/$0/$0.md` — note **Affected Areas**
2. Read PRD: `docs/sdlc/epics/$0/PRD.md` — what was planned
3. Read tech design: `docs/sdlc/epics/$0/TECH-DESIGN.md` — what was designed
4. Read template: `docs/sdlc/epics/$0/DOC-REVERSE-SYNC.md` or `docs/sdlc/templates/DOC-REVERSE-SYNC-TEMPLATE.md`
5. Find what was actually implemented:
   ```bash
   git log --oneline --all --grep="$0"
   ```
   For each commit, read the changed files. Note especially:
   - New / renamed / removed screens
   - `RootStackParamList` and linking config changes
   - New / removed hooks, query keys, services
   - `app.config.ts` diff — permissions, `Info.plist` strings, `AndroidManifest` permissions, splash, icon, scheme, intent filters, `runtimeVersion` policy
   - `eas.json` diff — profiles, env, channels
   - `package.json` diff — new/removed native deps
   - `ios/Podfile` and `android/build.gradle` if bare workflow
   - Privacy Manifest (`PrivacyInfo.xcprivacy`) entries
   - i18n keys added/removed
   - New analytics events
6. Compare plan vs reality:
   - Screens added/removed/renamed/merged vs design?
   - Navigation shape diverged (new tab? new modal?)?
   - Hook / query key API changed?
   - Native module decision changed (e.g., switched from custom TurboModule to community library)?
   - Permissions added/removed late?
   - `runtimeVersion` policy changed (impacts OTA channel compat)?
   - EAS profile env changed?
   - Push payload schema changed?
   - Deep link config changed?
   - Data safety form / Privacy Manifest impact?
7. For each affected doc (from epic's "Affected Areas") update:
   - `docs/navigation.md` — `RootStackParamList`, linking config, deep link reference
   - `docs/screens/<screen>.md` — purpose, params, states, accessibility
   - `docs/hooks/<hook>.md` — signature, query keys, example
   - `docs/native-modules.md` — module list, owners, codegen specs
   - `docs/permissions.md` — per-platform list, rationale strings, when prompted
   - `docs/eas.md` — profile env, channel mapping, runtime version policy
   - `docs/ota.md` — channel strategy, OTA-safe vs binary boundary
   - `docs/push.md` / `docs/deep-links.md` — categories, URL schemes, universal/app links
   - `docs/architecture.md` — only if layering / state strategy changed materially
   - `README.md` — only if dev setup commands or env vars changed
   - Domain / business docs under `docs/core-business/`
8. Update `CHANGELOG.md`:
   - Add entry under current release version
   - Tag every line with `[OTA]` or `[Native]`
   - Breaking changes called out with migration link
9. Fill `DOC-REVERSE-SYNC.md`:
   - Which docs updated and why
   - Plan vs reality divergences
   - Follow-up docs still to write

## Specific Diff Checks

### `app.config.ts`
```bash
git diff $(git merge-base HEAD main).. -- app.config.ts app.config.js app.json
```
Look for:
- `ios.infoPlist` keys added (e.g., `NSCameraUsageDescription`, `NSFaceIDUsageDescription`)
- `android.permissions` added
- `scheme` change
- `ios.associatedDomains` (universal links)
- `android.intentFilters` (app links)
- `runtimeVersion` change → **breaking for OTA compat**
- `version`, `ios.buildNumber`, `android.versionCode` bumps

### `eas.json`
```bash
git diff $(git merge-base HEAD main).. -- eas.json
```
Profile env, channel, distribution changes.

### `package.json`
```bash
git diff $(git merge-base HEAD main).. -- package.json
```
- New native deps → require new build (Native)
- New pure-JS deps → potentially OTA-safe
- Version bumps of Expo SDK, RN, Hermes-impacting libs

### `RootStackParamList`
```bash
git diff $(git merge-base HEAD main).. -- src/navigation/types.ts src/navigation/RootStack.tsx
```
- New routes / renamed routes / removed routes
- Deep link path mapping

## Rules

- Only update docs for areas this epic actually touched
- Preserve existing formatting, headings, voice, terminology
- If PRD said X but code does Y, the doc says Y (reality wins)
- Don't speculate about future changes
- Scope-cut features → **remove** from docs (no "coming soon")
- Breaking changes get a migration note **and** a changelog entry
- Code examples must still compile against current `tsconfig`
- Tag every changelog line `[OTA]` or `[Native]`
- Don't introduce link rot — check cross-references resolve

## Output

- Proposed edits to affected doc files
- Completed `docs/sdlc/epics/$0/DOC-REVERSE-SYNC.md`
- Changelog entry (if this is first pass post-release)
- Migration guide (if breaking changes): `docs/migrations/v$0.md`
