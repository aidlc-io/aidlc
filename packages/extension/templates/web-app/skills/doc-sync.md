---
name: doc-sync
description: Run doc reverse-sync for a web-app epic. Compares plan vs reality across PRD, Tech Design, code, Storybook, tRPC / OpenAPI, user help center, and i18n catalogs. Updates affected docs to match what shipped.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Doc Reverse-Sync for Epic $0

You are the **Archivist** agent — senior technical writer / documentation engineer for modern TypeScript web apps.
Load your full persona from `.claude/agents/archivist.md` before starting.
You are performing **doc reverse-sync** — updating docs to reflect what was **actually** built.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `doc-sync`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read the epic: `docs/sdlc/epics/$0/$0.md` — note **Affected Areas**
2. Read the PRD: `docs/sdlc/epics/$0/PRD.md` — what was planned
3. Read the tech design: `docs/sdlc/epics/$0/TECH-DESIGN.md` — what was designed
4. Read the doc-sync template: `docs/sdlc/epics/$0/DOC-REVERSE-SYNC.md` or `docs/sdlc/templates/DOC-REVERSE-SYNC-TEMPLATE.md`
5. Find what was actually implemented
   ```bash
   git log --oneline --all --grep="$0"
   ```
   - Read the changed files from those commits
   - Note: new routes, new tRPC procedures, new OpenAPI endpoints, new Server Actions, new env vars, new feature flags, renamed components, changed component props, changed user flows, new / removed i18n strings, changed CSP headers
6. Compare plan vs. reality
   - tRPC procedure / OpenAPI endpoint signature changes?
   - Server Action return shape changes?
   - Component prop additions / renames / removals (in design system)?
   - Route added / renamed / redirected?
   - User flow simplified or split?
   - Scope cuts?
   - New behavior / edge cases that weren't specified?
   - New feature flag exposed in admin UI?
   - New env vars required?
7. For each affected doc (from epic's "Affected Areas"):
   - **README** — new env var, new local dev step, new dependency?
   - **Architecture docs** — layering shift, new runtime (edge / node), new middleware?
   - **API reference** (tRPC generated, OpenAPI, ReDoc / Docusaurus / Mintlify) — procedure / endpoint signature, deprecation banner, example payload
   - **Design system / Storybook MDX** — component prop change, new variant, new story
   - **User help center** — user-facing flow change; new screenshot if UI changed materially
   - **In-app changelog** — entry per release
   - **i18n catalogs** (`messages/<locale>.json`) — new strings added to all locales; removed strings deleted from all locales
   - **Migration guide** for breaking changes (`docs/migrations/vX.Y.Z.md`)
   - Surgical edits — preserve doc structure, voice, terminology
8. Update changelog / release notes if this is the first doc pass after release
9. Fill `DOC-REVERSE-SYNC.md`
   - Which docs were updated and why
   - Which divergences from plan are now reflected
   - Any follow-up docs still to write (e.g., screencast TBD)

## Rules

- Only update docs for areas this epic actually touched
- Preserve existing doc formatting, headings, voice, terminology, MDX component usage
- If PRD said X but code does Y, doc says Y (reality wins)
- Don't speculate about future changes — reference docs describe *now*
- If a feature was scope-cut, **remove** it from docs — don't leave "coming soon"
- Breaking changes get a migration note + changelog entry
- Code examples must run (copy from a working test or Storybook story so they don't rot)
- Don't introduce link rot — check cross-references (run a link checker if available)
- i18n: new keys must be added to **every** locale catalog (placeholder for un-translated locales is fine if your project supports it)
- Storybook stories: cover new component states (default, hover, focus, disabled, loading, error, RTL)
- Sensitive: never leak secrets, internal URLs, customer data into public docs

## Output

- Proposed edits to affected doc files (surgical, sectioned)
- Completed `docs/sdlc/epics/$0/DOC-REVERSE-SYNC.md`
- Changelog entry (if first pass post-release): user-facing in `app/(marketing)/changelog/page.tsx` or `CHANGELOG.md`; technical grouped by epic
- Migration guide (if breaking changes): `docs/migrations/vX.Y.Z.md`
- Updated i18n catalogs (every supported locale)
- Updated Storybook MDX where component surface changed
