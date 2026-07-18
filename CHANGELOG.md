# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-07-19

### Added

- **GH-77: Prototype Phase** — New phase for visual UI design proposals before tech design. Designers propose multiple UI options (HTML prototypes, Figma mockups, or lo-fi sketches), users select a preferred option, and the chosen prototype feeds into the Design phase. Supports both Claude Artifacts and Figma integration.

- **GH-76: Discovery Gate** — Human-in-the-loop question confirmation flow. When a phase has open questions (≥3 or high-impact), the discovery-gate skill generates a structured questionnaire, opens it in the annotron annotation editor for point-and-click selection, and resumes the phase from confirmed choices. Keeps decisions in the artifact (e.g., `## Discovery decisions` in PRD.md). Integrated into Plan and Prototype phases.

- **GH-75: Builder Scope Visibility** — AIDLC workspace scope now visible in the Builder Source dropdown, allowing users to manage workspace.yaml entries directly from the UI.

- **GH-74: Configurable Git Behavior** — Per-step configuration for branch naming, push behavior, and auto-open PR. Users can customize git workflow in `workspace.yaml` without losing settings on re-apply.

- **Spec Kit Workflow** — New spec-driven development pipeline (GitHub Spec Kit): Specify → Clarify → Plan → Tasks → Analyze → Implement. Full end-to-end spec-driven SDLC alternative to the SDLC pipeline.

- **Recipe System** — Pre-built task-type recipes (bugfix, small-feature, refactor, ui-feature, feature-parallel, large-feature, spike) and spec-kit variants (quick-spec, full-spec-driven, spec-only). Auto-classifier in Start Epic modal suggests the right recipe.

### Fixed

- **GH-81: PATH Inheritance** — execFile calls now properly inherit `process.env`, ensuring the `claude` CLI is found on PATH without restart.

- **GH-73: Command File Auto-creation** — Command files (`.claude/commands/`) now auto-generated on fresh clones. Always creates a fresh Claude REPL terminal per run instead of reusing stale sessions.

- **Artifact Disk Detection** — Phases now auto-detect artifacts from disk when not explicitly listed in `produces` field, enabling flexible output generation (e.g., multiple prototype options).

### Changed

- **Pipeline DAG** — SDLC pipeline now explicit: `plan → prototype → design ∥ test-plan → implement → execute-test`. Prototype is sequential after Plan, Design and Test Plan run in parallel.

- **Two-Layer Command Model** — Slash commands now follow pattern: `/sdlc-parallel-full-<phase>` (phase-specific) backed by persona dispatcher. Cleaner namespace for multi-pipeline workspaces.

### Improved

- **Builder UX** — Stale count indicator, AIDLC scope visibility, better error messages.
- **Extension Robustness** — Fresh terminal creation, PATH inheritance, auto-recovery on clone.
- **Annotation Editor** — Full revision history per epic, compact memory storage (epic-memory.json).

## [2.6.0] - 2026-06-15

### Added

- AIDLC Monitor dashboard (token usage, session insights, live observability)
- Workspace schema with git config options
- Builder stale count tracking

### Fixed

- Various UI improvements and bug fixes

## [2.5.0] - 2026-05-01

### Added

- Initial release of core features
