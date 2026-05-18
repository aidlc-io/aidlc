---
name: doc-sync
description: Run doc reverse-sync for an Electron epic. Compares planned vs shipped (IPC surface, preload API, userData schema, electron-builder config, update channel) and updates affected docs.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Doc Reverse-Sync for Epic $0

You are the **Archivist** agent — a senior technical writer for Electron desktop apps.
Load your full persona from `.claude/agents/archivist.md` before starting.
You are performing **doc reverse-sync** — updating docs to reflect what was **actually** built and shipped.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `doc-sync`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read the epic: `docs/sdlc/epics/$0/$0.md` — note **Affected Areas** and **Affected Processes**
2. Read the PRD: `docs/sdlc/epics/$0/PRD.md` — what was planned
3. Read the tech design: `docs/sdlc/epics/$0/TECH-DESIGN.md` — what was designed
4. Read the doc-sync template: `docs/sdlc/epics/$0/DOC-REVERSE-SYNC.md` or `docs/sdlc/templates/DOC-REVERSE-SYNC-TEMPLATE.md`
5. Find what was actually implemented
   ```bash
   git log --oneline --all --grep="$0"
   ```
   - Read changed files from those commits
   - Note: new IPC channels (look in `common/ipc/` and `main/ipc/`), new preload methods (`preload/index.ts`), `userData` schema bumps (`docs/storage/userData-schema.md` or schema constants), new native modules (`package.json` dependencies), new `electron-builder` targets / entitlements, new update channels, renamed / removed symbols
6. Compare plan vs reality
   - IPC channel signature changes?
   - Preload `contextBridge` surface added / removed / renamed?
   - `userData` schema bumped? new migration?
   - `electron-builder` target / signing / entitlement changed?
   - Auto-update channel or `stagingPercentage` policy changed?
   - Native module added / swapped / dropped?
   - Per-OS behavior diverged from spec?
   - Scope cuts? (e.g. Linux support was planned but dropped)
   - Edge cases / new behavior not in spec?
7. For each affected doc:
   - **IPC reference** (`docs/ipc/<channel-name>.md`): channel name, request schema (zod-derived snippet), response schema, error envelope, code samples for main handler + renderer caller
   - **Preload API reference** (`docs/preload/` or JSDoc in `preload/api.d.ts`): each `window.api.*` method, params, return type
   - **`userData` schema** (`docs/storage/userData-schema.md`): current version, schema, migration from N-1
   - **`electron-builder` docs** (`docs/build/`): targets, signing requirements, entitlements
   - **Update channels** (`docs/updates/channels.md`): stable / beta / nightly layout, `stagingPercentage` policy
   - **Native modules** (`docs/native-modules.md`): which modules, supported OS/arch, rebuild step
   - **User guide / help**: any user-visible flow change
   - Read current doc, read implementation, generate **updated sections** preserving structure and style
   - Surgical edits — not rewrites
   - Add migration / upgrade notes for breaking changes (IPC channel removed → migration path; `userData` schema bump → automatic, but note it)
   - Update code examples if the surface changed
8. Update `CHANGELOG.md` / `latest.yml` `releaseNotes` if first doc pass after release
9. Fill `DOC-REVERSE-SYNC.md`
   - Which docs updated and why
   - Which divergences from plan are now reflected
   - Any follow-up docs still needed

## Rules

- Only update docs for areas this epic actually touched
- Preserve existing formatting, headings, voice, terminology
- If PRD said `saveFile(path, data)` but code does `saveFile({ path, data })`, doc says the latter (reality wins)
- Don't speculate about future changes
- Scope-cut features get **removed** from docs (no "coming soon")
- Breaking IPC removal → migration note **and** `CHANGELOG.md` entry under `### Breaking`
- `userData` schema bump → migration note (automatic on startup, but mention prior versions supported, e.g. "vN-2 → vN supported")
- Code examples in updated docs must compile against the shipped surface
- No link rot — verify cross-references

## Output

- Proposed edits to affected docs (IPC reference, preload API, `userData` schema, build config, update channel)
- Completed `docs/sdlc/epics/$0/DOC-REVERSE-SYNC.md`
- Changelog entry (if first pass post-release)
- Migration guide (if breaking): `docs/migrations/vX.Y.Z.md`
