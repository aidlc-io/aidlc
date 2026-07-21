# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.2.0] - 2026-07-21

### Added

- **Agent Skills Management** — Project-level agent configuration without workspace.yaml dependency:
  - Agent files (`.claude/agents/*.md`) now support `skills:` field in frontmatter
  - Supports both inline format (`[skill1, skill2]`) and bullet-list format
  - Auto-reload notification when creating/editing agents and skills with one-click reload button
  - Skills are auto-discovered from `.claude/skills/` and `~/.claude/skills/` directories

### Fixed

- **GH-XX: Project-Scope Agent Skills** — Fixed "skill not declared in workspace.yaml" error when creating agents with project-scope skills. Project/global scope agents now store skills in agent file frontmatter instead of requiring workspace.yaml entry.

- **GH-XX: Agent File Generation** — New agent files now include `skills:` field in frontmatter when skills are selected during creation.

- **GH-XX: Skill Validation Logic** — Only AIDLC scope agents now require skills to be in workspace.yaml. Project/global scope agents skip this validation since skills are stored in agent files.

### Improved

- **Agent UI Flow** — When editing agents, selected skills now display as checked checkboxes in modal. Changes to skills are reflected immediately in agent file.

- **User Notifications** — Create/edit operations now show "Reload VS Code" prompts with actionable [Reload] button for better UX.

### Changed

- **Agent File Frontmatter Order** — Standardized field order: `name → description → model → tools → skills → custom fields`

## [3.1.0] - 2026-07-20

### Added

- **Annotron 1.0.0 Integration** — Human-in-the-loop annotation editor with major new features:
  - **Markdown rendering with diagrams** — View `.md` files with inline Mermaid diagrams (flowchart, sequence, UML, ER, C4, architecture, Gantt, timeline)
  - **Editable Markdown pane** — Edit Markdown source directly in annotron, press Save (⌘/Ctrl+S) to re-render
  - **Outline navigation sidebar** — Auto-generated sidebar for h1–h4 headings with one-click navigation in long docs
  - **Auto-apply feedback loop** — Integrated agent loop engineering: send annotations → watch Claude apply changes live in real-time
  - **Live activity mirror** — Stream of agent's tool calls (Read/Edit/Bash/Run) visible in sidebar during execution
  - **Image attachments** — Paste/upload images into annotations and replies
  - **Permission approval in browser** — Approve/deny Claude Code tool permissions directly in the annotation UI

### Fixed

- **GH-XX: File Watcher Pattern** — `.claude/**` file discovery pattern now more reliable. Manual refresh button (🔄) added to sidebar + AIDLC command palette for immediate discovery without restart.

- **GH-XX: Skill Picker Discovery** — Skills created via `aidlc.addSkill` now immediately appear in agent creation picker without VSCode restart. Discovered skills (not in workspace.yaml) now included alongside workspace-declared skills.

- **GH-XX: Skills & Agents Deduplication** — Fixed duplicate skills appearing in picker when declared both in `workspace.yaml` AND discovered in `.claude/skills/`. Deduplication uses precedence: `aidlc > project > global`. Single skill now shows once, single checkbox per skill ID.

### Changed

- **Model Defaults** — Updated to current Claude models:
  - `claude-sonnet-4-6` → `claude-sonnet-5` (latest, balanced default)
  - `claude-opus-4-7` → `claude-opus-4-8` (current most capable)
  - `claude-haiku-4-5-20251001` (unchanged)

### Improved

- **Annotation Editor UX** — Zero-setup flow: `annotron <file.html>` or click **Annotate** in VS Code. Supports Markdown editing + live reload.
- **Skill Discovery** — Sidebar now shows all skills (workspace + discovered) with visual distinction. Refresh button provides immediate feedback.
- **Agent Skill Selection** — Cleaner picker with no duplicates, visual feedback on selection.

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
