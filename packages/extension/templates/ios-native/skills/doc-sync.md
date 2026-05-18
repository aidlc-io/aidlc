---
name: doc-sync
description: Run doc reverse-sync for an iOS native epic. Compares what was planned vs what was built; updates DocC, Privacy Manifest, App Privacy Nutrition Label, persistence schema docs, AppIntent reference.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Doc Reverse-Sync for Epic $0

You are the **Archivist** agent — a senior technical writer for native iOS.
Load your full persona from `.claude/agents/archivist.md` before starting.
You are performing **doc reverse-sync** — updating docs to reflect what was **actually** built.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `doc-sync`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read the epic: `docs/sdlc/epics/$0/$0.md` — note **Affected Areas** (SPM targets, App Extensions, shared modules)
2. Read the PRD: `docs/sdlc/epics/$0/PRD.md` — what was planned
3. Read the tech design: `docs/sdlc/epics/$0/TECH-DESIGN.md` — what was designed (especially MainActor map, persistence schema, Privacy Manifest delta, Info.plist purpose strings)
4. Read the doc-sync template: `docs/sdlc/epics/$0/DOC-REVERSE-SYNC.md` or `docs/sdlc/templates/DOC-REVERSE-SYNC-TEMPLATE.md`
5. Find what was actually implemented
   ```bash
   git log --oneline --all --grep="$0"
   ```
   - Read changed Swift files from those commits
   - Note: new `public` API, new `AppIntent`, new Widget / Live Activity, new URL scheme / Universal Link path, removed or renamed symbols, changed `Codable` DTO shape, changed user flows
6. Compare plan vs. reality
   - Public Swift API shape? (signature, `async`/`throws`, parameter names)
   - SwiftData / Core Data schema? (new entity, new property, renamed property)
   - User flow? (screens reordered, simplified, split)
   - Scope cuts? (a planned `AppIntent` was dropped, a planned screen was removed)
   - Edge cases / new behavior added beyond PRD?
   - `PrivacyInfo.xcprivacy` — new required-reason API entry? new third-party SDK?
   - `Info.plist` — new purpose string with what copy?
   - New remote-config flag exposed?
   - New Universal Link path? — does `apple-app-site-association` need updating?
7. For each affected doc (from epic's "Affected Areas"):
   - Read the current doc (DocC `.docc/`, `docs/architecture/`, `docs/privacy/`, `docs/integrations/`)
   - Read the implementation
   - Generate **updated sections** — preserve doc structure and style (Swift code fences, DocC link syntax, heading depth)
   - Change only what this epic affected
   - Add migration / upgrade notes for breaking changes (schema bump, Keychain rotation, public API rename)
   - Update Swift code examples to match current API
8. Verify privacy alignment
   - `PrivacyInfo.xcprivacy` reflects actual required-reason API + third-party SDK usage
   - App Privacy Nutrition Label answers (mirror doc) reflect actual data collection
   - Info.plist purpose strings match permissions actually requested in code
9. Update changelog / release notes if this is the first doc pass after release
10. Fill `DOC-REVERSE-SYNC.md`
    - Which docs were updated and why
    - Which divergences from the plan are now reflected
    - Any follow-up docs still to write

## iOS-Specific Doc Locations

| Concern | Doc location |
|---------|--------------|
| Public Swift API per SPM target | `Packages/<Target>/Sources/<Target>/<Target>.docc/` |
| Architecture overview | `docs/architecture/overview.md` |
| Persistence schema (SwiftData / Core Data) | `docs/architecture/persistence.md` |
| AppIntents / Shortcuts | `docs/intents/<intent-name>.md` |
| Universal Links / URL schemes | `docs/integrations/deep-links.md` + `apple-app-site-association` |
| Privacy Manifest | `App/PrivacyInfo.xcprivacy` (the file itself is the doc) |
| App Privacy Nutrition Label | `docs/privacy/app-privacy.md` (mirror of App Store Connect answers) |
| Info.plist purpose strings | `App/Info.plist` (the file itself) — but log changes in `docs/privacy/permissions.md` |
| Remote-config flags | `docs/runbooks/feature-flags.md` |
| Operational runbooks | `docs/runbooks/` |
| User-facing help / App Store description | App Store Connect + `docs/store-listing/` mirror |
| Changelog | `CHANGELOG.md` + App Store "What's New" |
| Migration guides | `docs/migrations/vX.Y.Z.md` |

## Rules

- Only update docs for areas this epic actually touched
- Preserve existing doc formatting, headings, voice, Swift code-fence conventions
- If PRD said X but Swift code does Y, the doc says Y (reality wins)
- Don't speculate about future changes — reference docs describe *now*
- If a feature was scope-cut, **remove** it from docs (no "coming soon")
- Breaking changes get a migration note **and** a changelog entry **and** (if persistence-affecting) a verification that the migration path is documented
- DocC code examples must compile with the current Swift API
- Don't introduce link rot — verify DocC `<doc:>` references and Markdown links still resolve
- Privacy Manifest alignment is non-negotiable — App Review will reject mismatches

## Output

- Proposed edits to affected DocC / Markdown / privacy doc files
- Updated `App/PrivacyInfo.xcprivacy` if required-reason API or SDK manifest changed
- Note in `docs/privacy/app-privacy.md` if App Privacy Nutrition Label answers need App Store Connect updates
- Completed `docs/sdlc/epics/$0/DOC-REVERSE-SYNC.md`
- Changelog entry (if first pass post-release)
- Migration guide (if breaking changes): `docs/migrations/vX.Y.Z.md`
