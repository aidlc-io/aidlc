/**
 * Shared AIDLC help/knowledge content — the single source of truth used by
 * both the CLI (`aidlc ask`, `aidlc guide`) and the VS Code extension's
 * "Ask AIDLC" button. Keeping it here (in the surface-agnostic core) means
 * the CLI and extension can never drift on what AIDLC *is* or how it's set up.
 *
 * - AIDLC_KNOWLEDGE  → fed to `claude` as system context so the model answers
 *   "what is aidlc / how do I set it up / which command does X" accurately,
 *   grounded in the real command surface rather than guessing.
 * - AIDLC_CLI_GUIDE_TEXT → the static, no-LLM `aidlc guide` reference card.
 */

/** Grounding reference handed to claude for `ask` (CLI + extension). */
export const AIDLC_KNOWLEDGE = `
# AIDLC — reference for answering user questions

AIDLC is an AI-driven SDLC + agent workflow runner. It drives Claude through a
pipeline you declare in \`.aidlc/workspace.yaml\`, tracking every run, step, and
token. It has two surfaces that share the same files on disk (no daemon):

- **VS Code extension** (\`hueanmy.aidlc\`) — a visual Builder for workspace.yaml,
  a sidebar launcher, epic/run tracking, and the **AIDLC Monitor** (token usage,
  session insights, live agent observability).
- **CLI** (\`aidlc\`) — the same engine from any terminal, no editor required.

**Execution model:** AIDLC shells out to the \`claude\` CLI
(\`claude --print --append-system-prompt <skill>\`). Claude-only — no Anthropic
SDK calls, no other model runners. Both surfaces read/write the same
\`.aidlc/workspace.yaml\` and \`.aidlc/runs/*.json\`, so edits on one side appear on
the other within ~200ms.

## Core concepts (workspace.yaml)
- **skills** — markdown system prompts (a "skill" = what an agent knows how to do).
- **agents** — a runner + a skill. The default runner shells out to \`claude\`;
  Pro users can ship a custom JS runner via \`runner_path\`.
- **pipelines** — an ordered chain of agent steps with approval gates between them.
- **slash_commands** — name → agent/pipeline bindings (mirrors Claude slash commands).
- **epics** — a unit of work; \`aidlc epic start\` classifies the task, picks a
  recipe, and assembles a pipeline for it.
- **recipes** — task-type → pipeline templates (bugfix, small-feature, refactor, …).
- **presets / templates** — savable/loadable whole-workspace configs. Built-ins:
  \`code-review\`, \`release-notes\`, \`sdlc\`.
- **runs** — a live execution of a pipeline; each step is awaiting_work /
  awaiting_review / done / rejected, with revisions and feedback.

## Prerequisites (both surfaces)
- Node.js ≥ 18.
- \`claude\` CLI on PATH (https://github.com/anthropics/claude-code).
- Auth: any mode Claude Code supports works (AIDLC just shells out to \`claude\`):
  a \`claude login\`, \`ANTHROPIC_API_KEY\`, AWS Bedrock (\`CLAUDE_CODE_USE_BEDROCK=1\`
  + AWS profile/credentials), Google Vertex (\`CLAUDE_CODE_USE_VERTEX=1\`), or a
  gateway \`ANTHROPIC_AUTH_TOKEN\`/\`ANTHROPIC_BASE_URL\`. Run \`aidlc doctor\` to verify.

## CLI command surface
- Bootstrap: \`aidlc init\`, \`aidlc validate\`, \`aidlc doctor\`, \`aidlc list [--json]\`.
- Config (mirrors the Builder): \`aidlc skill|agent|pipeline add|list|show|remove\`.
- Presets: \`aidlc preset apply|save|list\` (built-ins code-review, release-notes, sdlc).
- Epics: \`aidlc epic list|status <id>|start <id> --brief "…" [--llm]\`.
- Recipes: \`aidlc recipe init\`, \`aidlc pipeline recipes|classify "<brief>"|generate\`.
- Runs: \`aidlc run start <pipeline> --context k=v\`, \`aidlc run exec <runId> [--auto-approve]\`.
- Watch: \`aidlc watch\`, \`aidlc tail\`, \`aidlc dashboard\`, \`aidlc monitor [--start|--open]\`.
- Requirements: \`aidlc analyze\` (import requirements → \`requirements.md\`).
- Help: \`aidlc guide\` (static getting-started card), \`aidlc ask "<question>"\` (this).
- Global flag: \`-w, --workspace <path>\` (defaults to cwd; also reads AIDLC_WORKSPACE).

## VS Code extension setup & UI
1. Install **AIDLC** (\`hueanmy.aidlc\`) from the VS Code Marketplace or Open VSX.
2. Ensure \`claude\` is on PATH and authenticated (the sidebar surfaces MCP/claude state).
3. Open a project folder. The **AIDLC** sidebar (activity bar) shows:
   - the project + workspace.yaml status and counts (Agents / Skills / Flows / Epics),
   - **Start Epic**, recent epics, workflow templates, and connected MCP servers.
4. First-time setup options: **Init Sample Workspace** (\`aidlc.initWorkspace\`),
   apply a built-in **Workflow** template, or **Load Demo Project** (a full pipeline
   + 6 epics) to explore without committing to your own repo.
5. Title-bar buttons / commands (all under the "AIDLC" category in the command palette):
   - **Open Workspace Builder** — the visual workspace.yaml editor.
   - **Open Claude CLI Terminal** — a terminal pre-launched into \`claude\`.
   - **Open AIDLC Monitor** — token usage + session insights + live agents.
   - **Open Getting Started Guide**, **Open AST Graph Report**.
6. **Workspace Builder tabs** (inside the Workspace Builder panel):
   - **Analyze** tab — import requirements from Jira, GitHub, Linear, Redmine, or a
     local file; converts them into \`requirements.md\` in the project root. CLI
     equivalent: \`aidlc analyze\`.
   - **Tests** tab — integrates \`aidlc-testagent\` (\`ata\` CLI); reads
     \`testagent.config.yaml\` at the workspace root; shows each target with
     **Plan** (\`ata plan <target>\`) and **Run** (\`ata run <target>\`) buttons;
     **Validate all** runs \`ata validate\`. If no config exists, the tab prompts
     **Run ata config** to generate one.
7. The extension auto-registers an **ast-graph** MCP server so Claude can read
   structural code context cheaply (toggle via \`aidlc.astGraph.enabled\`).

## Answering guidance
- Be concise and practical. Prefer the exact command or button name over prose.
- When the user is setting up, walk them through: install claude → \`aidlc doctor\`
  (or open the sidebar) → init/template/demo → start an epic or run.
- If unsure whether they mean the CLI or the extension, give the answer for both
  briefly. Never invent commands or settings not listed above.
`.trim();

/** Static, no-LLM getting-started card printed by \`aidlc guide\`. */
export const AIDLC_CLI_GUIDE_TEXT = `
╔══════════════════════════════════════════════════════╗
║              aidlc  —  Getting Started               ║
╚══════════════════════════════════════════════════════╝

AIDLC drives Claude through a pipeline you declare in
.aidlc/workspace.yaml — managing agents, skills, pipelines,
epics, and runs, and tracking every step and token. It shells
out to the \`claude\` CLI (Claude-only) and shares state with the
VS Code extension over the filesystem.

── Step 0: Prerequisites ──────────────────────────────
  • Node.js ≥ 18
  • claude CLI on PATH   (github.com/anthropics/claude-code)
  • auth: claude login · ANTHROPIC_API_KEY · AWS Bedrock
          (CLAUDE_CODE_USE_BEDROCK) · Vertex (CLAUDE_CODE_USE_VERTEX)
  aidlc doctor          verify all of the above

── Step 1: Bootstrap a workspace ──────────────────────
  aidlc init                    scaffold .aidlc/workspace.yaml
  aidlc preset apply code-review   (or: sdlc, release-notes)
  aidlc validate                parse + schema-check
  aidlc list                    show agents, skills, pipelines

── Step 2: Build config (mirrors the VS Code Builder) ──
  aidlc skill    add | list | show | remove
  aidlc agent    add | list | show | remove
  aidlc pipeline add | list | show | remove

── Step 3: Run, let Claude do the work ────────────────
  aidlc run start <pipeline> --context epic=ABC-123
  aidlc run exec <runId>              stream output, advance on success
  aidlc run exec <runId> --auto-approve   fully unattended

── Step 4: Work by epic (task-type → pipeline) ────────
  aidlc epic start <id> --brief "…" [--llm]
  aidlc epic list [--status …]    aidlc epic status <id>

── Step 5: Watch what's happening ─────────────────────
  aidlc watch          live table of all runs
  aidlc tail           one-line stream of state transitions
  aidlc dashboard      browser UI on http://127.0.0.1:8787
  aidlc monitor --start  agent observability (agents-observe)

── Need a hand? ───────────────────────────────────────
  aidlc ask "<question>"   ask Claude about aidlc & its commands
  aidlc <command> --help   all flags on any command

Global flag: -w, --workspace <path>  (defaults to cwd)
`;
