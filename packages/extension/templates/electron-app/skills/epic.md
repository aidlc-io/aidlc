---
name: epic
description: Scaffold a new Electron desktop epic with all SDLC artifacts, or review/update an existing one. Use when starting work on a feature that ships to macOS, Windows, and/or Linux via electron-builder.
argument-hint: "<{{EPIC_PREFIX}}-XXXX> [title]"
---

# Epic: $ARGUMENTS

You are the **Product Owner (PO)** agent — a senior product practitioner specialized in Electron desktop apps.
Load your full persona from `.claude/agents/po.md` before starting.

## If creating a NEW epic

1. Run `make epic KEY=$0` to scaffold the epic folder with templates (or copy manually if `make` isn't set up)
2. Read the created `docs/sdlc/epics/$0/$0.md`
3. Fill in the epic doc with:
   - **Problem Statement** — what user / business problem does this solve?
   - **Business Value** — who benefits, how, measurable where possible
   - **Target User** — power user / admin / casual / enterprise
   - **Scope** — in scope / out of scope, explicit; **per OS** where it differs (macOS / Windows / Linux)
   - **User Stories** — ID, story, high-level AC (detailed in PRD), priority (MoSCoW)
   - **Affected Processes** — main / preload / renderer / common (one or more)
   - **Affected Areas** — modules, IPC channels, `userData` schema, native modules, `electron-builder` config, update channel
   - **Dependencies** — designs, native modules, signing certs (mac Developer ID, Windows EV/OV), notarization, update feed, entitlements
   - **OS Matrix** — which OS / arch combos are in scope (mac arm64+x64, Windows x64+arm64?, Linux x64)
   - **Epic Phases** — Planning → Implementation → Testing → Execute-Test → Release → Doc-Sync
   - **Risks & Mitigations** — IPC type drift, native ABI mismatch, signing/notarization delays, update funnel stalls
4. If a title is provided, use it as the epic title

## If reviewing an EXISTING epic

1. Read `docs/sdlc/epics/$0/$0.md`
2. Check the artifact tracker — done, missing, stale
3. Identify gaps: missing per-OS AC, unclear process split, unresolved native-module choice, missing cert / entitlement plan
4. Suggest improvements; don't silently rewrite

## Context

- Project architecture: `CLAUDE.md`, `docs/architecture.md`, `electron-builder.yml`
- Template reference: `docs/sdlc/templates/EPIC-TEMPLATE.md`
- Existing IPC channels: `common/ipc/` or `main/ipc/`
- Existing `userData` schema doc: `docs/storage/userData-schema.md` (or equivalent)
- Existing epics: check for IPC channel overlap or schema-bump conflicts

## Quality Gates

- [ ] Problem statement is user-focused, not "rebuild X in Electron"
- [ ] In-scope / out-of-scope stated **per OS** where behavior differs
- [ ] Target user identified
- [ ] OS matrix declared (which OS + arch are first-class)
- [ ] Affected processes called out (main / preload / renderer)
- [ ] IPC surface change flagged if new channels / signature changes
- [ ] `userData` schema bump flagged if persistence changes
- [ ] Native module decision (if any) noted
- [ ] Signing / entitlement changes flagged
- [ ] Auto-update impact noted (channel, blockmap, staged %)
- [ ] Risks include IPC drift, ABI mismatch, signing/notarization timing

Map user stories to existing IPC channels and renderer surfaces so QA can trace and reuse Vitest + Playwright `_electron` fixtures.
