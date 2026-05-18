---
name: release
description: Prepare an Electron release. Creates checklist, verifies per-OS gates (signing, notarization), staged rollout via electron-updater, and publishes signed dmg/zip/NSIS/AppImage artifacts.
argument-hint: "<version> (e.g., 1.3.0)"
---

# Release v$0

You are the **Release Manager (RM)** agent — a senior release practitioner specialized in Electron desktop apps.
Load your full persona from `.claude/agents/release-manager.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `release`, epic = detect from branch/commits. If no epic key → skip gate. If gate fails → STOP.

## Steps

1. Create the release checklist:
   ```bash
   make release-checklist VER=$0
   ```
   (or copy `docs/sdlc/templates/RELEASE-CHECKLIST-TEMPLATE.md` to `docs/sdlc/releases/v$0-release-checklist.md`)

2. Read the created checklist at `docs/sdlc/releases/v$0-release-checklist.md`

3. Gather release content
   ```bash
   git log --oneline $(git describe --tags --abbrev=0)..HEAD --no-merges
   git log $(git describe --tags --abbrev=0)..HEAD --pretty="%s" --no-merges \
     | grep -oE '{{EPIC_PREFIX}}-[0-9]+' | sort -u
   ```
   - For each epic: UAT / doc-sync status in `docs/sdlc/epics/{{EPIC_PREFIX}}-XXXX/`
   - Capture: new IPC channels, `userData` schema bumps, native module changes, entitlement additions, dependency bumps, new `electron-builder` targets

4. Bump version
   - `package.json` `version` is canonical — electron-builder reads it
   - Confirm no `-dev` / `-local` suffix left over

5. Build + sign + publish (use `/deploy`)
   ```bash
   # macOS (on a mac runner)
   npm run build
   npx electron-builder --mac --arm64 --x64 --publish always
   # Windows (on a windows runner)
   npx electron-builder --win --x64 --publish always
   # Linux
   npx electron-builder --linux --x64 --publish always
   ```
   - `--publish always` uploads signed artifacts + signed `latest.yml` to the configured publish target (GitHub Releases / S3 / generic).

6. Verify signing + notarization
   ```bash
   # macOS
   spctl -a -v "dist/mac-arm64/MyApp.app"            # → should report "accepted"
   stapler validate "dist/mac-arm64/MyApp.app"       # → "validated"
   xcrun notarytool history --keychain-profile <prof>  # check submission status

   # Windows
   signtool verify /pa /v "dist/MyApp Setup $0.exe"

   # Linux (no native signing, but verify checksum + GPG)
   gpg --verify dist/latest-linux.yml.asc dist/latest-linux.yml
   ```

7. Pre-release gates (must all be green)

   | Gate | Status |
   |------|--------|
   | CI green on macOS arm64 + x64 | ⬜ |
   | CI green on Windows x64 (and arm64 if shipping) | ⬜ |
   | CI green on Linux x64 | ⬜ |
   | Vitest unit + IPC contract suites pass | ⬜ |
   | Playwright `_electron` E2E pass | ⬜ |
   | No P0/P1 bugs open | ⬜ |
   | UAT signed off per epic | ⬜ |
   | `package.json` version bumped, no suffix | ⬜ |
   | macOS dmg + zip signed + notarized + stapled | ⬜ |
   | Windows NSIS signed with timestamp | ⬜ |
   | Linux AppImage zsync metadata generated, `latest-linux.yml` GPG-signed | ⬜ |
   | `latest.yml` / `latest-mac.yml` / `latest-linux.yml` reachable from publish target | ⬜ |
   | Differential blockmap present | ⬜ |
   | mac Developer ID cert: ≥ 90 days remaining | ⬜ |
   | Windows code-signing cert: ≥ 90 days remaining | ⬜ |
   | Rollback verified: N-1 still downloadable | ⬜ |
   | Feature flags for risky paths set to production state | ⬜ |
   | Staged rollout plan set in `electron-builder.yml` `stagingPercentage` or via release channel | ⬜ |

8. Staged rollout
   - Start at e.g. `stagingPercentage: 5` (5% of users get this update on next check)
   - Monitor crash-free + update funnel for 24h
   - Promote to 25%, then 100% if metrics hold
   - If metrics break: lower `stagingPercentage` to 0, prepare republish of N-1

## Release Notes Format

### User-facing (per `latest.yml` `releaseNotes`)
```
What's New in v$0:

- <Feature benefit in plain language>
- <Improvement benefit>
- <User-visible fix — only if users would notice>
- macOS: <mac-only note if any>
- Windows: <win-only note if any>
- Bug fixes and performance improvements
```

Short, value-focused, no jargon, no epic keys. Embed in `latest.yml` `releaseNotes` field per channel. Translate to all supported locales.

### Technical (`docs/sdlc/releases/v$0.md`)
```markdown
## v$0 — YYYY-MM-DD

### New
- **{{EPIC_PREFIX}}-XXXX**: <one-line summary>

### Improved
- **{{EPIC_PREFIX}}-YYYY**: <one-line summary>

### Fixed
- <User-visible fixes>

### Breaking
- **IPC**: channel `old:name` removed → use `new:name`. Migration: <link>
- **`userData` schema**: bumped to vN. Migration: expand-contract applied automatically on startup.

### Per-OS
- macOS: <new entitlement / signing change>
- Windows: <installer change>
- Linux: <packaging change>

### Internal
- <Refactors, infra, test, doc>

### Notes
- New native modules: ...
- Updated Electron: vN → vM
- mac hardened runtime entitlements: ...
- Auto-update channel: stable / beta — staged at X%
```

## Reference

- Rollback: `docs/sdlc/templates/ROLLBACK-PLAYBOOK.md` (republish N-1 to `latest.yml`)
- Monitoring: `docs/sdlc/MONITORING-GUIDE.md`
- Release checklist template: `docs/sdlc/templates/RELEASE-CHECKLIST-TEMPLATE.md`
- electron-builder docs: https://www.electron.build/
- electron-updater docs: https://www.electron.build/auto-update
