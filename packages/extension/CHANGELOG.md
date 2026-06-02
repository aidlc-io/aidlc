# Changelog

## 1.1.1

- fix(epic): a recipe-assembled epic now shows a **runnable** slash command. Its per-epic pipeline (e.g. `SWIFT-142`) has no command files of its own, so step commands now resolve to the recipe's source pipeline (`/sdlc-parallel-full-implement …`) — which reads the epic id from its argument. Previously the UI surfaced `/<epic>-<step>`, which Claude reported as an unknown command.

## 1.1.0

### Task-type recipes & smart Start Epic

- feat(recipes): built-in recipes — `bugfix`, `small-feature`, `refactor`, `feature-parallel`, `large-feature`, `spike`. Start Epic suggests the right one from a one-line brief and assembles a pipeline from it.
- feat(recipes): back-fill recipes into older workspaces automatically (extension, on load) or via `aidlc recipe init` (CLI), so projects scaffolded before recipes existed gain suggestion support.
- feat(cli): `aidlc epic start <id> --brief "…"` classifies the task and assembles a pipeline; `--llm` for model-backed classification. New `recipe`, `classify`, and `generate` commands.

### Pipelines

- feat(pipeline): rename **and** duplicate pipelines.
- feat(pipeline): namespaced slash commands & command files per pipeline — multiple pipelines no longer collide.
- feat(pipeline): "Load AIDLC default" button in the Add-pipeline modal.
- feat(pipeline): pick the step **name** first, then the agent; a "Runs after" dependency editor; duplicate agent ids are allowed.
- fix(pipeline): deleting a pipeline also removes the agents & skills it owned (counts now drop too).
- fix(pipeline): built-in agents sync with their real skills (no more bogus `<id>-skill`).

### Start Epic

- feat(epic): no-pipeline actions — "Load SDLC example" / "Create new pipeline".
- feat(start-epic): fetch GitHub issues host-side via the `gh` CLI (~1s, no Claude loop); live seconds counter; clearer message when a project's connector isn't enabled; don't dismiss on backdrop click.
- pipeline runs now display by **step name**, not agent name.

### Sidebar & Builder

- feat(sidebar): clickable Agents / Skills / Flows / Epics tiles open the matching view; Epics opens the top-level Epics view.
- chore(sidebar): remove the "Pipeline runs" and "Slash commands" sections.

### Built-in SDLC preset

- feat: streamlined to **po · tech-lead · developer · qa** with `implement` + `unit-test` skills (developer gets both); QA keeps `test-plan` / `generate-test-cases` / `execute-test` (+ `test-report`).
- refactor(core): single source of truth for the SDLC preset, templates, and global install moved into `@aidlc/core` — the extension and the `aidlc` CLI now share it.
- feat(core): opt-in global install of `~/.claude/agents/aidlc-*.md` + matching skills.

### Misc

- chore(ast-graph): bundle the ast-graph CLI v0.3.0.
- chore: update GitHub reference links to `novapizza/claude-token-monitor`.

## 1.0.1

- feat(skill-templates): expand library to 45 templates across 9 categories

## 1.0.0

- feat(workflow): non-destructive preset apply, DAG-aware modal, scoped skill picker
- feat(workflow): step skills, tech-stack templating, artifact wiring
- feat(workflow-presets): multi-domain templates + opt-in global install
- feat(workflow): SDLC built-in pipeline + artifact templates per workflow

## 0.9.0

- feat(ast-graph): auto-scan workspace + wire as Claude MCP server
- fix(report): label $ as API-equivalent, lead overview with tokens
- feat(report): full Token Usage Report panel from status bar click
- feat(sidebar): cost suggestions list + detail are stacked modals
- feat(sidebar): cost suggestions list moves into a popup
- fix(sidebar): cap cost-suggestions list height + tighter rows
- fix(sidebar): cost suggestions open in a modal — inline expand was too cramped
- feat(sidebar): cost-suggestion engine ported from claude-token-monitor
- fix(demo): scale synthetic usage ~10× smaller so demo doesn't scare users
- feat(demo): synthetic token usage so demo epics showcase the ⚡ badge
- feat(epics): per-history-entry token usage in step history
- feat(token-monitor): tokens primary, $ as API-equivalent secondary
- fix(epics): drop run-level fallback for token attribution
- feat(epics): per-epic + per-step token usage badge
- chore(cli): prep aidlc for npm publish
- feat(extension): token monitor status bar — today/month Claude spend
- feat(epics): "Load from file…" for description / feedback
- feat(sidebar): "MCP servers" section — show what Claude is connected to
- fix(epics): migration toast surfaces *why* epics were skipped
- feat(epics): migration backfills runState for legacy epics that only have state.json
- feat(epics): "Migrate Epic State Files" command — bring legacy state.json up to current schema
- feat(sidebar): inline "Load Demo Project" picker — replace VS Code notification
- fix(epics): "Run with Claude" first-time runs skip the modal
- fix(epics): button label is "Run with Claude" until the step has actually started
- feat(runs): "Request update" — reopen approved steps when requirements change
- feat(epics): live artifact refresh + Update-with-feedback modal w/ optional input
- feat(epics): "Run in Claude" button on awaiting_work steps — no more manual copy
- fix(demo): mirror agents into .claude/commands so slash commands work in Claude Code
- fix(epics): "Update with feedback" sends prompt INTO the Claude REPL, not the shell
- feat(epics): "Update with feedback" button — pre-types slash command into Claude
- feat(demo): two example epics with rich step history
- feat(epics): mirror run state into docs/epics/<id>/state.json on every transition
- feat(runs): per-step append-only history (reject reasons, reruns, verdicts)
- fix(epics): step badge and epic status now reflect run-state advances
- feat(webview): inline Rerun + SavePreset + Apply-overwrite confirm
- feat(webview): inline StartEpicModal — pipeline/agent + capability inputs in one form
- feat(webview): inline AddAgent + AddSkill modals (Tier 3)
- feat(webview): edit existing pipelines via inline modal
- feat(webview): inline AddPipelineModal — pick + configure all steps in one form
- feat(webview): inline modals for start-run and edit-step-config (Tier 2)
- feat(webview): inline modals for rename, delete confirm, add step (Tier 1)
- fix(core): AutoReviewer dynamic import — use native import() under module:node16
- feat(runs): inline Reject modal — no more VS Code input box pop-up
- feat: migrate webview to React + Vite; mono+teal theme; restore drag-and-drop step reorder

## 0.8.6

- feat: collapsible run cards in pipeline runs sidebar
- feat: kebab menu with rename/duplicate/delete for agent and skill cards; drag-and-drop workflow reorder; custom tooltip for truncated names
- Fix: Readme & Dashboard view
- M4 + M5: Fix and add command list epic
- M5: Doctor, tail, dashboard

## 0.8.5

- feat: add Get Started walkthrough (6 steps with command buttons)
- feat: ✕ button on sidebar project bar to close the open folder
- README: refresh demo gif (full pipeline run @ 2x speed) and refresh content (epics/runs, Load Demo Project, walkthrough)
- fix: AutoReviewer dynamic import (route through `new Function` so CJS transpile keeps `import()`)
- feat: Load Demo Project command, reject-to-upstream cascade, debug fixes
- feat: surface slash commands in sidebar runs and Epics panel step detail

## 0.8.4

- fix: ship bundled extension.js so commands register on activation. v0.8.3 packaged the unbundled tsc output, which threw on `require("@aidlc/core")` at startup and left every `aidlc.*` command unregistered ("command 'aidlc.openBuilder' not found"). v0.8.4 ships the esbuild bundle as intended.

## 0.8.3

- Discover and display Claude Code native skills + agents from `.claude/` (project) and `~/.claude/` (global), unified with AIDLC-scoped items declared in `workspace.yaml`. Builder + sidebar group items by scope, count items across all three scopes, and flag overridden ids. Add Skill / Add Agent wizards now prompt for a scope. Watchers on `.claude/{skills,agents}/**` and `.aidlc/{skills,agents}/**` keep the catalog in sync without a manual refresh.

## 0.8.2

- Drop the legacy SDLC-pipeline branding from README and CHANGELOG.
- Fix a dangling command call in the workspace builder webview ("Open Claude Terminal" was no-op after the v2 namespace migration).

## 0.8.1

- Marketplace metadata + demo asset fixes.

## 0.8.0

Initial release of the agent-workflow runner.

- `@aidlc/core` engine — Zod-validated `workspace.yaml` schema, `WorkspaceLoader`, `EnvResolver`, `SkillLoader`, `RunnerRegistry`, `DefaultRunner` (claude CLI shell-out), `CustomRunnerLoader`. 24 unit tests.
- Activity bar entry **AIDLC** with a single sidebar webview (**Workspace**) that surfaces agents · skills · pipelines stats and slash commands defined in `workspace.yaml`.
- `aidlc.openBuilder` — main-area visual builder with agent / skill / pipeline cards, ↑↓ step reorder, on-failure toggle, delete actions.
- `aidlc.initWorkspace` — scaffold `.aidlc/workspace.yaml` + sample skill, opens the folder if not already a workspace.
- `aidlc.addSkill` — wizard with 4 sources: load template (5 starters: hello-world, code-reviewer, test-converter, doc-writer, release-notes), paste markdown, upload `.md` file, or open blank file.
- `aidlc.addAgent` — wizard: id + display name + skill picker + Claude model picker (sonnet-4-6 / opus-4-7 / haiku-4-5).
- `aidlc.addPipeline` — wizard: id + multi-pick agents (in execution order) + on_failure (stop / continue).
- `aidlc.savePreset` / `aidlc.applyPreset` / `aidlc.deletePreset` — save and reload entire workspace configurations as named templates.
- `aidlc.startEpic` / `aidlc.openEpicsList` / `aidlc.insertDemoEpic` — manage epics inside the workspace.
- `aidlc.openClaudeTerminal` — open a zsh terminal in the bottom panel with the `claude` CLI auto-launched; reuses an existing terminal if open.
- `aidlc.showWorkspaceConfig` — dump parsed workspace.yaml to the AIDLC output channel (validated, env-resolved).
