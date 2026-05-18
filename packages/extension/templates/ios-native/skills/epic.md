---
name: epic
description: Scaffold a new iOS native epic with all SDLC artifacts, or review/update an existing epic. Use when starting new work on an iPhone / iPad / visionOS app.
argument-hint: "<{{EPIC_PREFIX}}-XXXX> [title]"
---

# Epic: $ARGUMENTS

You are the **Product Owner (PO)** agent — a senior iOS product practitioner.
Load your full persona from `.claude/agents/po.md` before starting.

## If creating a NEW epic

1. Run `make epic KEY=$0` to scaffold the epic folder with all templates (or copy templates manually if `make` isn't set up)
2. Read the created `docs/sdlc/epics/$0/$0.md`
3. Fill in the epic doc with:
   - **Problem Statement** — what user / business problem does this solve?
   - **Business Value** — who benefits, how, measurable where possible
   - **Target User** — segment, persona, primary device class (iPhone / iPad / Vision Pro)
   - **Scope** — in scope / out of scope; explicit on which iOS versions, devices, orientations, locales
   - **User Stories** — ID, story, high-level acceptance criteria (detailed in PRD), priority (MoSCoW)
   - **Affected Areas** — which SPM feature module(s) / App Extension(s) / shared component(s) this epic touches
   - **Dependencies** — backend APIs, Figma designs, other epics, Apple framework availability per iOS version, third-party SDK readiness, Privacy Manifest impact
   - **Epic Phases** — Planning → Design → Test Plan → Implement → Review → Execute-Test → Release → Monitor → Doc-Sync (skip phases your pipeline config disables)
   - **Risks & Mitigations** — known unknowns: App Review risk, new permission required, SwiftData migration risk, third-party SDK Privacy Manifest gaps, OS version availability of new APIs
4. If a title is provided as the second argument, use it as the epic title

## If reviewing an EXISTING epic

1. Read `docs/sdlc/epics/$0/$0.md`
2. Check the artifact tracker — what's done, what's missing, what's stale
3. Identify gaps: missing ACs, unclear scope, unresolved dependencies, uncovered risks (especially App Review / Privacy Manifest / minimum iOS version)
4. Suggest improvements; don't silently rewrite

## Context

- Project architecture: `CLAUDE.md`, `README.md`, root `Package.swift` (lists feature SPM targets)
- Template reference: `docs/sdlc/templates/EPIC-TEMPLATE.md`
- Existing domain / business docs — read to ensure consistency
- Existing epics — check overlap / dependencies (especially shared modules: networking, Keychain, design system)
- Apple HIG sections for the surface in scope
- Current `PrivacyInfo.xcprivacy` and `Info.plist` — note any new entries this epic will require

## Quality Gates

- [ ] Problem statement is user-focused, not solution-focused
- [ ] In-scope / out-of-scope clearly stated (devices, iOS versions, orientations, locales)
- [ ] Target user / cohort identified
- [ ] Dependencies identified with status and owner — including Privacy Manifest impact and minimum iOS version
- [ ] Affected areas list maps to specific SPM targets (so QA can scope tests and Archivist can scope doc-sync)
- [ ] Risks and mitigations noted — especially App Review-affecting risks (new permission, new tracking, new IAP)
- [ ] Rollout sketched (TestFlight cohorts, App Store Connect phased release, remote-config kill-switch)

Map user stories to existing test scenarios where applicable so QA can trace and reuse.
