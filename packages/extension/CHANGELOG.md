# Changelog

## 2.4.1

### Bundled annotron 0.6.0 → 1.0.0: Loop Engineering & AI Agent Integration

- chore(vendor): bump vendored [annotron](https://github.com/hueanmy/annotron) from 0.6.0 to **1.0.0** — a major release bringing **loop engineering** as a first-class feature, enabling tight human-AI feedback cycles:
  - **Integrated agent feedback loop** — `annotron --agent` automates feedback application (no manual polling)
  - **Live activity mirror** — watch agent's tool calls (Read/Edit/Bash) stream into sidebar in real-time
  - **Auto-apply feedback** — structured feedback (CSS selectors, text, images) sent directly to Claude Code
  - **Continuous cycle** — agent applies changes → browser reloads → you see updates instantly → repeat
  - **Outline navigation for Markdown** — auto-generated sidebar with h1–h4 headings, one-click jump, visual hierarchy
  - **Agent environment fixes** — better handling of Electron/VS Code vars, prevents spawned `claude` processes from hanging
  - **35 new NPM keywords** — loop engineering, agent loop, feedback loop, auto-apply, human-in-the-loop, and more
  - **VS Code extension built-in** — annotron now includes VS Code extension capabilities (context menu: "Open in annotron", bundled server, auto-agent launch, settings panel)
- note: AIDLC vendors the full annotron 1.0.0 package including new `commands/`, `hooks/`, `skills/`, `editors/` directories. The `/annotate-artifact` skill continues to drive the feedback loop; new loop engineering features will be exposed in follow-up work.
- chore(cli): `aidlc` CLI bumped 0.9.1 → **0.9.2** in lockstep so the terminal install ships annotron 1.0.0 too.

## 2.4.0

### Bundled annotron 0.3.0 → 0.6.0

- chore(vendor): bump vendored [annotron](https://github.com/hueanmy/annotron) from 0.3.0 to 0.6.0. The browser review editor that drives the `/annotate-artifact` feedback loop gains several user-facing capabilities, available automatically the next time you open Feedback:
  - **Annotation persistence** — every annotation is saved to a sidecar JSON beside the artifact and restored on reload/restart, so past context is never lost.
  - **Per-annotation threads** — each annotation card shows its own conversation (your notes + agent replies); reply inline without leaving context. Clicking a card jumps to and highlights the corresponding element.
  - **Annotations / History tabs** — the sidebar splits into an annotations view and a history of past feedback rounds with timestamps and counts.
  - **Image attachments** — paste or upload images into the composer or any annotation note; they're saved to `.annotron-uploads/` beside the artifact so the agent can read them.
  - **Live step log + cancel** — the agent's steps stream into the sidebar like a CLI, and a Cancel button stops an in-flight round.
- note: the project continues to vendor only annotron's `bin/` + `src/` (not its stock `skills/`/`commands/`/`hooks/`) — the annotation loop is driven by AIDLC's own `/annotate-artifact` skill. The 0.6.0 headline features (live CLI activity mirror, turn-status bar, remote permission approval) are hook-driven and ship in annotron's unvendored `hooks/`, so they are **not yet active** here; their server endpoints (`/hook/*`, `/permission/*`) exist in the vendored binary but need agent/skill wiring — a follow-up.
- chore(cli): `aidlc` CLI bumped 0.9.0 → **0.9.1** in lockstep so the terminal install (`aidlc globals install`) ships annotron 0.6.0 too (no functional CLI changes).

## 2.3.0

### Annotron artifact menu: separate Open HTML and Feedback

- feat(extension): the artifact dropdown now splits the old "Open HTML + feedback" entry into two distinct actions — **Open HTML** (shown only once the rendered `.html` exists; opens it read-only in your browser) and **Feedback** (always shown; runs `/annotate-artifact`, rendering the HTML first if it's missing, then opens annotron for the review loop).
- fix(extension): the annotate terminal is now recreated instead of silently reused when its Claude process has already exited. Previously, clicking Feedback again after a finished loop just re-focused a dead terminal and ran no command.
- chore: `aidlc` CLI bumped to 0.9.0 in lockstep (no functional CLI changes this release).

## 2.2.0

### Epic-memory auto-load + git-aware AST rescan

- feat(extension): **Epic-memory auto-load** (opt-in) — a "Memory auto-load: On/Off" toggle at the top of the Epics list. When on, a Claude Code `UserPromptSubmit` hook injects an epic's `epic-memory.json` (summary, decisions/constraints, reflections) into context whenever a prompt refers to that epic — so working on an epic loads its prior context automatically, without running `/epic-context`. Nothing is enabled unless you flip it; toggling only adds/removes the hook entry in `~/.claude/settings.json`.
- feat(cli): `aidlc globals memory-hook enable | disable | status` — the terminal equivalent of the toggle (enable also installs the tooling first).
- feat(extension): **git-aware AST rescan** — the AST graph now does a full clean rescan after git operations that change the working tree (branch switch/checkout, merge, rebase, reset, pull), via a watcher on `.git/{HEAD,ORIG_HEAD,MERGE_HEAD}`. Individual saves still trigger the fast incremental rescan.
- chore: the epic-memory hook script ships in the tooling payload and installs under `~/.claude/tools` with the rest (extension activation and `aidlc globals install`).

## 2.1.0

### Artifact annotation loop (annotron) + epic memory

- feat(extension): **Annotate artifacts in a browser** — clicking a step's `.md` artifact opens a popover with **Open Markdown** and **Open HTML + feedback**. The feedback option renders the Markdown to a self-contained, Claude-styled HTML (zero-dep Node renderer, `marked` vendored — no Python/pip) and opens it in **annotron** (vendored, no global install) for point-and-click review. Feedback is applied **back to the `.md`** (canonical source), never the HTML, then re-rendered live via the `/annotate-artifact` skill.
- feat(extension): **Revision history** — every applied round is snapshotted to `.revisions/<artifact>/rev-N.{md,html}`, attributed to the editing dev (git identity, hostname fallback), and shown both in the rendered HTML's "Revision history" section (with a per-revision selector to reopen old versions) and in the pipeline **History** panel. Reopening an unchanged artifact skips re-rendering.
- feat(extension): **Epic memory** — a compact per-epic digest (`docs/epics/<epic>/epic-memory.json`: summary, decisions/constraints, and reflections on how to prompt better next time) so continuing an epic with any agent is cheap on tokens. Viewable via the **Memory** button in the epic footer and maintained with the `/epic-context` skill; annotation rounds auto-append context entries.
- feat(cli): `aidlc globals install` now also installs the annotation tooling (renderer + annotron + epic-memory + the `/annotate-artifact` and `/epic-context` skills) under `~/.claude` — the loop works from a plain terminal + Claude Code, no VS Code required.
- chore: the annotation tooling auto-installs into `~/.claude` on extension activation and is shared with the CLI via `@aidlc/core`; it never modifies your `settings.json`.

## 2.0.1

- fix(extension): correctly handle claude mcp list timeout (#61)
- chore(cli): add .npmrc to use NPM_TOKEN for public registry publish
- chore: update pnpm-lock.yaml with vitest (fix frozen-lockfile CI)

## 2.0.0

### Test Agent + Analyze Requirements

- feat(extension): **Tests tab** in the Workspace Builder — integrates [`aidlc-testagent`](https://github.com/aidlc-io/aidlc-testagent) (`ata`) for AI-powered E2E tests. Shows the full **Explore → Plan → Confirm → Generate → Execute → Heal → Verdict** pipeline, lists targets from `testagent.config.yaml` with per-target **Plan** / **Run** buttons, a settings (⚙) button that opens the `.target.yaml` directly in the editor, and a global **Validate all** action. Setup prompt with "Run ata config" when no config exists.
- feat(extension): **Analyze Requirements tab** — import requirements from Jira, GitHub Issues, Linear, Redmine, or a local file/URL and convert them into a `requirements.md` via the `/analyze-requirements` slash command. Interactive wizard with platform picker, parent epic/issue ref, brief mode, and custom instructions.
- feat(cli): `aidlc analyze` — terminal equivalent of the Analyze Requirements wizard. Supports `--source`, `--text`, `--platform`, `--parent`, `--brief`, `--instruction`, `--id`, `-y`. Works without a `workspace.yaml`.

## 1.4.0

### Ask AIDLC + Bedrock/Vertex auth

- feat(extension): **Ask AIDLC** — a new button at the top of the AIDLC sidebar (and `AIDLC: Ask AIDLC` command) that opens a **chat panel** for asking what AIDLC does and how to set it up. Common questions (the suggestion chips + close paraphrases) answer **instantly** from curated templates; anything else streams from the local `claude` with a "Thinking…" indicator and conversation context for follow-ups — all grounded in a shared knowledge reference so answers stay accurate.
- feat(cli): `aidlc ask "<question>"` — ask Claude about AIDLC (setup, concepts, commands), and `aidlc guide` — a static, no-LLM getting-started reference card. Both work before a workspace is initialized.
- fix(cli): `aidlc doctor` now recognizes every auth mode Claude Code supports — **AWS Bedrock** (`CLAUDE_CODE_USE_BEDROCK`), **Google Vertex** (`CLAUDE_CODE_USE_VERTEX`), gateway `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, and a normal `claude login` (detected offline via `~/.claude.json`, no model call). Fixes false "Not authenticated" reports for Bedrock/Vertex users ([#55](https://github.com/aidlc-io/aidlc/issues/55)).
- fix(core/cli/extension): AIDLC now strips an inherited `ANTHROPIC_API_KEY` before spawning `claude` whenever the user has a `claude login` (or is inside a Claude Code session, where the key is ephemeral) — a stale/scoped shell key was shadowing a good OAuth login and failing with "Invalid API key". Pipeline runs, `aidlc ask`, and the extension's Ask now use the login, matching aidlc-testagent. A deliberately-set key with no login is left untouched, and a workspace.yaml `environment` key always wins.

## 1.3.2

- feat(extension): ❤️ **Sponsor** button on the Marketplace listing (`sponsor.url` → [github.com/sponsors/hueanmy](https://github.com/sponsors/hueanmy)); the CLI package gains a matching npm `funding` field.
- docs: new demo GIF/MP4 recorded against 1.3.1 (Monitor + Insights era); badges header (Marketplace / Open VSX / license / Sponsor) on the extension, CLI, and repo READMEs; feature lists refreshed to current state (Session Insights, OTel strip, monitor auto-install, `epic start --brief`, recipe commands).
- chore(extension): the Monitor command title now reads "Open AIDLC Monitor (Token Usage + Insights + Agents)".

## 1.3.1

### Native session-insights dashboard

- feat(extension): new **Insights** tab in AIDLC Monitor, built entirely from the Claude Code transcript (`~/.claude/projects/**.jsonl`) — no plugin, no server, no Docker. A session picker plus seven panels: overview, a context+cache area chart over turns, hooks (with errors), agents/subagents, prompts, context management (compactions/peak/file edits), retrieval (reads/search/MCP) and tool usage. Live via `fs.watch` on the active session + its `subagents/` dir.
- feat(extension): live **OTel** strip — a minimal OTLP/JSON receiver for Claude Code's native telemetry, with a one-click "enable telemetry" that writes the env to `~/.claude/settings.json`.
- feat(cli): `aidlc monitor --start` now offers to **auto-install** the agents-observe plugin (with confirmation) instead of only printing manual steps; `monitor` distinguishes a plugin that is **installed-but-failed-to-load** from a healthy one; the local-runtime launch pins `npm install` to the public npm registry so it never inherits a private CodeArtifact default.

## 1.3.0

### AIDLC Monitor — token usage + agent observability

- feat(extension): **AIDLC Monitor** panel (`AIDLC: Open AIDLC Monitor`) with **Token Usage** and **Agents** tabs. The Agents tab embeds the [agents-observe](https://github.com/simple10/agents-observe) dashboard so you can watch live agent sessions and history without leaving VS Code.
- feat(extension): status bar item that polls the agents-observe server and opens the Monitor. New settings `aidlc.monitor.enabled` (default on) and `aidlc.monitor.pollIntervalSeconds` (default 10); polling pauses while the window is unfocused. No-op surface when the server isn't running.
- feat(extension): when the server is down, the Agents tab shows a **Start Monitor** action (instead of an error) that launches it in a terminal.
- feat(cli): `aidlc monitor` — checks the agents-observe plugin install, pins a stable data dir in `~/.claude/settings.json` (data survives plugin upgrades), and prints live server status. `--json`, `--dry-run`, `--open` flags.
- feat(cli): `aidlc monitor --start` — actually launches the observe server when it's down. Uses Docker when available, otherwise falls back to the plugin's **local** runtime (no Docker required); the **Start Monitor** button now wires through this.

## 1.2.0

### Run verify & report (issue #23 E2, E6)

- feat: `aidlc run verify <runId>` — read-only post-run **drift check**. Re-checks every step's recorded artifacts still exist and pass the same `produces_contains` markers the gate applied; exits non-zero on drift (handy as a CI post-check).
- feat: `aidlc run report <runId> [--format md|json] [--output <file>]` — renders run history (steps, revisions, durations, reject reasons, approve comments, cost) as shareable Markdown.
- feat(extension): **Verify** / **Report** buttons in the run panel header, wired via `aidlc.verifyRun` / `aidlc.runReport`.

### Run-exec guards (issue #23 C1, C2, C4)

- feat: cost-guard `budget` for the `aidlc run exec` autopilot — accumulates per-step cost and pauses/fails when a ceiling is crossed.
- fix(core): bound the auto-reviewer runtime with a timeout (`auto_review_timeout_ms`) so a hung validator can't stall a run.
- fix(core): `markStepDone` is now idempotent — a duplicate mark-done for an already-advanced step is a safe no-op.

### Stronger gate (issue #23 E1)

- feat(core): `produces_contains` content assertions on the produces gate — assert minimum content (section markers) in produced files without writing a JS validator.
- feat(extension): edit `produces_contains` + `auto_review_timeout_ms` in the Step config modal; the pipeline builder carries both fields.

### SDLC artifact templates

- feat: per-tech-stack implement templates (`implement.backend.md`, `implement.web.md`, `implement.web-react.md`) with tech-stack detection; refreshed plan / design / implement / unit-test templates & skills.

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
