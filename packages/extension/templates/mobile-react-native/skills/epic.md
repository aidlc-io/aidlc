---
name: epic
description: Scaffold a new React Native epic with all SDLC artifacts, or review/update an existing one. Use when starting new work — covers screens, native modules, EAS profiles, OTA strategy, permissions, push, deep links.
argument-hint: "<{{EPIC_PREFIX}}-XXXX> [title]"
---

# Epic: $ARGUMENTS

You are the **Product Owner (PO)** agent — a senior RN product practitioner.
Load your full persona from `.claude/agents/po.md` before starting.

## If creating a NEW epic

1. Run `make epic KEY=$0` to scaffold (or copy templates manually).
2. Read the created `docs/sdlc/epics/$0/$0.md`.
3. Fill in with:
   - **Problem Statement** — user / business problem (which user — new install, returning, push-engaged?)
   - **Business Value** — measurable where possible (install conv, retention, crash-free, rating)
   - **Target User** — segment / persona / cohort
   - **Scope** — in / out, explicit; tag each item `[iOS]`, `[Android]`, `[Both]`, `[OTA-safe]`, `[Native]`
   - **User Stories** — ID, story, high-level ACs, priority (MoSCoW)
   - **Affected Areas** — screens, navigators, hooks/services, native modules, EAS profile/channel impact, permissions, store metadata
   - **Dependencies** — native module availability, store policy, vendor SDK, design Figma URL, push provider setup
   - **Epic Phases** — Planning → Tech Design → Test-Plan → Implementation → Review → Execute-Test → Release (EAS Build/Submit and/or EAS Update) → Monitor → Doc-Sync
   - **Risks & Mitigations** — Hermes compat, New Architecture migration, store review delay, native module bridge cost, OTA fingerprint mismatch, force-update need
   - **OTA vs Native classification** for the deliverable
4. If a title is provided as second arg, use it as epic title.

## If reviewing an EXISTING epic

1. Read `docs/sdlc/epics/$0/$0.md`.
2. Check the artifact tracker — what's done, missing, stale.
3. Identify gaps: missing offline/permission/push ACs, untyped navigation params, missing platform tag, missing OTA classification, uncovered risks.
4. Suggest improvements; don't silently rewrite.

## Context

- Project architecture: `CLAUDE.md`, `docs/architecture.md`
- `app.config.ts`, `eas.json`, `package.json` — current native config, EAS profiles, deps
- Template reference: `docs/sdlc/templates/EPIC-TEMPLATE.md`
- Domain / business docs — consistency with what ships today
- Existing epics — overlap / dependency check (auth, push, offline, navigation rewrites)
- Latest store-listing metadata, age rating, data safety form, Privacy Manifest
- Latest Sentry crash dashboard, Play Vitals, App Store reviews

## Quality Gates

- [ ] Problem statement user-focused, not "add screen X"
- [ ] In-scope / out-of-scope explicit, per platform
- [ ] Each user story tagged `[iOS]` / `[Android]` / `[Both]` and `[OTA-safe]` / `[Native]`
- [ ] Target user / cohort identified
- [ ] Affected areas list specific enough to drive test scope and doc-sync (screens, hooks, native modules, permissions, push categories, deep links)
- [ ] Dependencies with status + owner (native module ready? Figma final? push provider configured?)
- [ ] Risks: store review timing, Hermes/New-Arch compat, OTA fingerprint, force-update, bundle-size delta
- [ ] OTA-shippability classified for each deliverable

Map user stories to existing test scenarios (Detox / Maestro flows, Reassure baselines) so QA can trace and reuse.
