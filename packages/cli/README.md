# aidlc

[![License: MIT](https://img.shields.io/badge/license-MIT-97ca00)](https://github.com/aidlc-io/aidlc/blob/main/LICENSE)
[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/hueanmy)

Terminal CLI for AIDLC — drives Claude through pipelines you declare in
`.aidlc/workspace.yaml`. Manages the workspace, executes runs end-to-end via
the `claude` CLI, and shares state with the VS Code extension over the
filesystem (no daemon, no IPC).

**Claude only.** The CLI shells out to `claude --print --append-system-prompt
<skill>`. No Anthropic SDK calls, no other model runners.

## Install

```sh
# From npm (when published)
npm install -g aidlc

# From source (development)
pnpm install                                 # at repo root
cd packages/cli && npm link                  # makes `aidlc` available globally
```

## Prerequisites

- **Node.js ≥ 18**
- **`claude` CLI** on PATH — install from https://github.com/anthropics/claude-code
- **Authentication** — either `ANTHROPIC_API_KEY` env var, or `claude config list` returning ok

Run `aidlc doctor` to verify all of the above.

## Five-minute walkthrough

```sh
# 1. New workspace from scratch
mkdir my-pipeline && cd my-pipeline
aidlc init
aidlc doctor                                 # confirm claude is wired up

# 2. Drop in a built-in preset (or build manually with skill/agent/pipeline add)
aidlc preset apply code-review
aidlc list                                   # see the agents, skills, pipeline you got

# 3. Kick off a run and let Claude do the work
aidlc run start review-pipeline --context diff=$(git diff HEAD~1)
aidlc run exec <runId>                       # streams claude output, advances on success
```

## Command reference

Global flags available on every subcommand:

| Flag | Default | Purpose |
|---|---|---|
| `-w, --workspace <path>` | `cwd` | Workspace root (containing `.aidlc/`). Also reads `AIDLC_WORKSPACE` env. |

### `init` — bootstrap a workspace

```
aidlc init [--name "Workspace Name"]
```

Creates `.aidlc/workspace.yaml` (commented starter), `.aidlc/skills/`, `.aidlc/runs/`.
Idempotent — skips anything that already exists.

### `doctor` — health check

```
aidlc doctor
```

Verifies `workspace.yaml` parses + Zod-validates, `claude` binary is on PATH,
authentication works, all skill paths exist, custom runner files exist, and
run-state JSON files are parseable. Exit 1 on any failure.

### `validate` — schema-only check

```
aidlc validate
```

Stricter than the `doctor` workspace section: enumerates every Zod issue with
its `path[]` for editor jump-to-line.

### `list` — print workspace contents

```
aidlc list [--json]
```

Pretty table by default, structured JSON for piping into `jq`.

---

### Skills

```
aidlc skill add --id <id> --template <name>            # bundled template (5 available)
aidlc skill add --id <id> --path .aidlc/skills/my.md   # reference your own .md
aidlc skill list [--json] [--templates]                # `--templates` lists the 5 built-ins
aidlc skill show <id>                                  # prints the rendered .md content
aidlc skill remove <id>                                # removes from yaml (does NOT delete .md)
```

Built-in templates: `hello-world`, `code-reviewer`, `test-converter`,
`doc-writer`, `release-notes`. Run `aidlc skill list --templates` for a one-line
description of each.

### Agents

```
aidlc agent add --id <id> --name <n> --skill <skillId>
                [--model claude-sonnet-4-5]
                [--capabilities files,github,jira]
                [--description "…"]
                [--runner default|custom] [--runner-path .aidlc/runners/foo.js]
aidlc agent list [--json]
aidlc agent show <id>
aidlc agent remove <id>
aidlc agent run <id> [--message "…"] [--context k=v,…] [--dry-run]
```

`agent run` is one-shot — spawns `claude` with the agent's skill + your
message, streams to stdout, no run state created. Useful for quick checks and
piping into shell scripts.

### Pipelines

```
aidlc pipeline add --id <id> --steps agent1,agent2,agent3
                   [--human-review]                        # mark all steps as gated
                   [--produces "p1.md:p2.md,p3.md"]        # colon between steps, comma between artifacts
                   [--on-failure stop|continue]
aidlc pipeline list [--json]
aidlc pipeline show <id>                                   # numbered step graph
aidlc pipeline remove <id>
aidlc pipeline recipes                                     # list task-type recipes (bugfix, refactor, …)
aidlc pipeline classify "<brief>"                          # which recipe fits this task
aidlc pipeline generate                                    # assemble a pipeline from a recipe
aidlc recipe init                                          # back-fill built-in recipes into older workspaces
```

### Presets

```
aidlc preset list [--json]                # shows built-ins and saved snapshots
aidlc preset apply <name>                 # merges into current workspace (no overwrite)
aidlc preset save <name>                  # snapshot current workspace to .aidlc/presets/<name>.json
```

Built-in presets: `code-review`, `release-notes`, `sdlc` (full 9-phase SDLC
pipeline ported from the legacy AIDLC).

### Epics

Mirrors the extension's "Epic Pipeline" panel — reads each epic's `state.json`
under whatever `state.root` your `workspace.yaml` declares (default
`docs/epics/`).

```
aidlc epic list [--status pending|in_progress|done|failed] [--json]
aidlc epic status <id> [--json]                 # phase-by-phase view
aidlc epic show <id>                            # alias for status
aidlc epic start <id> --brief "…" [--llm]       # classify the brief → recipe → assembled pipeline
aidlc epic start <id> --recipe <recipeId>       # or pick the recipe yourself
aidlc epic start <id> --pipeline <pipelineId>   # or use an existing pipeline as-is
```

`epic start` mirrors the extension's smart **Start Epic**: `--brief` classifies
the requirement into a task-type recipe (heuristic by default, `--llm` for
model-backed classification) and assembles a right-sized pipeline.

In v2 an **epic** is a domain entity persisted on disk (one folder per epic
with a `state.json`); it's distinct from a pipeline **run**. An epic can exist
without a run, and a run can exist without an epic — `epic` reads the former,
`run` / `status` read the latter.

---

### `run` — pipeline lifecycle

These wrap `@aidlc/core`'s `PipelineRunner` and write atomically through
`RunStateStore`. The VS Code sidebar updates within ~200ms.

```
aidlc run start <pipelineId> [--id <runId>] [--context k=v,k=v]
aidlc run mark-done <runId>             # validates produces paths, advances or awaits review
aidlc run approve   <runId> [--comment "…"]
aidlc run reject    <runId> --reason "…"
aidlc run rerun     <runId> [--feedback "…"]
aidlc run delete    <runId> [--force]
aidlc run open      <runId> [--path]    # prints state.json content (or just file path)
aidlc run exec      <runId> [--until <step>] [--auto-approve] [--message "…"] [--dry-run]
aidlc run verify    <runId>             # re-checks recorded artifacts still exist + pass produces_contains
aidlc run report    <runId> [--format md|json] [--output <file>]  # shareable run history (Markdown/JSON)
```

**`run verify`** is a read-only post-run drift check: a `completed` run still
claims its artifacts exist, but someone may have since deleted or gutted one.
It re-validates every step's recorded `artifactsProduced` (existence + the same
`produces_contains` markers the gate applied) and exits non-zero when any step
has drifted — handy as a CI post-check.

**`run report`** renders the run history (steps, revisions, durations, reject
reasons, approve comments, cost when reported) as Markdown to paste into a PR
description or status update. `--format json` dumps the raw state instead.

**`run exec`** is the unique unlock: it spawns `claude` for the current step,
streams stdout to your terminal, validates the produced artifacts, and advances
to the next step automatically. With `--auto-approve` it also clears
`human_review` gates without pausing — a single command then drives the entire
pipeline end-to-end.

`run start` defaults `runId` to `<pipelineId>-<timestamp>` if `--id` is omitted.

#### Cost guard (`budget`)

Because `run exec --auto-approve` can drive a whole pipeline unattended (and a
self-fixing agent loop can quietly escalate spend), a pipeline may declare an
optional cost ceiling. After each step the autopilot sums the per-step LLM cost
(claude's reported `total_cost_usd`) and stops once a ceiling is crossed. Manual
`mark-done` is never gated.

```yaml
pipelines:
  - id: my-pipeline
    budget:
      max_usd: 5.00           # hard ceiling on cumulative cost for the run
      max_usd_per_step: 1.50  # optional — a single pricey step trips it too
      on_exceed: pause        # pause (default) → stop the loop; fail → exit non-zero
    steps: [...]
```

`run exec` prints a running `budget: $spent / $max` line per step; on `pause` it
stops and you can raise the budget or resume, on `fail` it exits non-zero (handy
in CI).

### `step` — direct step control

The `run` commands operate on the current step. `step` operates on **any**
step regardless of pipeline order, for when reality doesn't match the
pipeline (work done outside the tool, phases that don't apply this time,
hopping back to redo something).

```
aidlc step start  <runId> <step>          # → awaiting_work, moves pointer (demotes the old current step to pending)
aidlc step done   <runId> <step> [--reason "…"]   # → approved (no produces validation)
aidlc step skip   <runId> <step>          # → approved with skip note
aidlc step reset  <runId> <step>          # → pending (no cascade)
aidlc step set    <runId> <step> <status> # raw — any of: pending | awaiting_work | awaiting_review | approved | rejected
aidlc step jump   <runId> <step>          # moves pointer + auto-approves earlier pending steps
```

`<step>` accepts a 0-based index (`0`, `1`, `2`) or an agent id (`reviewer`,
`planner`) — whichever is easier in context.

`step done` and `step skip` only advance the pointer when the step they touch
is the **current** step; touching an earlier step won't drag the pointer
backward.

### `status` — list runs / inspect one

```
aidlc status                              # all runs in .aidlc/runs/
aidlc status <runId>                      # detailed view of one run
aidlc status [runId] --json               # raw RunState JSON
```

### `watch` — live re-render of run state

Uses `chokidar` on `.aidlc/runs/*.json` with a 150ms debounce. Clears the
visible terminal area on every redraw (preserves scrollback so you can scroll
up to past frames).

```
aidlc watch                               # multi-run table, all runs
aidlc watch <runId>                       # single-run focus mode (step pipeline)
```

### `tail` — stream state transitions

Same chokidar watch as `watch`, but emits one timestamped line per detected
change instead of redrawing a table. Useful for CI logs or piping.

```
aidlc tail                                # all runs
aidlc tail <runId>                        # one run
```

Output shape:

```
[16:42:01] ABC-123 step 0 awaiting_work → approved
[16:42:01] ABC-123 pointer 0 → 1
[16:42:01] ABC-123 step 1 pending → awaiting_work
```

### `dashboard` — browser UI with action buttons

Single-process HTTP server, no build step. Same data as `watch`; adds
click-to-approve / reject / rerun buttons. Updates push via SSE so the page
refreshes within ~100ms when files change.

```
aidlc dashboard                           # http://127.0.0.1:8787
aidlc dashboard --port 3000
aidlc dashboard --host 0.0.0.0            # expose on LAN (use with care)
```

Endpoints (handy for scripts): `GET /api/runs`, `GET /api/runs/:id`,
`POST /api/action`, `GET /events` (SSE).

### `monitor` — agent observability via agents-observe

Checks the [agents-observe](https://github.com/simple10/agents-observe) plugin
install, pins a stable data dir in `~/.claude/settings.json` (so the DB survives
plugin upgrades), and prints live server status.

```
aidlc monitor                             # status check + pin data dir
aidlc monitor --start                     # also launch the server if it's down
aidlc monitor --open                      # open the dashboard in your browser
aidlc monitor --json                      # machine-readable status (no writes)
aidlc monitor --dry-run                   # show the settings.json change, don't write
```

When the plugin isn't installed, `--start` offers to **auto-install** it (with
confirmation) instead of only printing manual steps; `monitor` also
distinguishes a plugin that is installed-but-failed-to-load from a healthy one.
`--start` uses Docker when available, otherwise falls back to the plugin's
**local** runtime (no Docker required) — in local mode the terminal becomes the
server's log window, and `npm install` is pinned to the public npm registry so
it never inherits a private registry default. The extension's **Start Monitor**
button runs `aidlc monitor --start`.

## Recipes

### Drive a complete SDLC pipeline end-to-end

```sh
aidlc preset apply sdlc
aidlc run start sdlc-pipeline --id ABC-123 --context epic=ABC-123
aidlc run exec ABC-123 --auto-approve     # claude works through every phase
```

### Manually mark a phase done that you completed outside AIDLC

```sh
aidlc step done <runId> implement --reason "merged via PR #42"
aidlc run exec <runId>                    # resumes from the next step
```

### Restart a single phase without cascading

```sh
aidlc step reset <runId> review
aidlc step start <runId> review            # → awaiting_work
aidlc run exec <runId>
```

### One-shot ask, no run state

```sh
aidlc agent run reviewer --message "Review the diff in /tmp/patch.diff"
```

### Pipe runs into another tool

```sh
aidlc list --json | jq '.pipelines[].id'
aidlc status <runId> --json | jq '.steps[] | select(.status=="rejected")'
aidlc epic list --json | jq '.[] | select(.status=="in_progress") | .id'
```

### Live monitor while a long pipeline runs

```sh
# Terminal 1 — kick off the run, then walk away
aidlc run start sdlc-pipeline --id ABC-123 --context epic=ABC-123
aidlc run exec ABC-123 --auto-approve

# Terminal 2 — live table
aidlc watch

# Terminal 3 — transition log for grep / save
aidlc tail | tee run-log.txt
```

### Open the browser dashboard

```sh
aidlc dashboard
# then open http://127.0.0.1:8787
# click any run → approve / reject / rerun directly from the page
```

## Filesystem layout

The CLI never holds in-memory state — everything lives in your workspace:

```
my-project/
├── .aidlc/
│   ├── workspace.yaml          # agents, skills, pipelines (Zod validated)
│   ├── skills/                 # custom skill .md files
│   │   └── code-reviewer.md
│   ├── runs/                   # one JSON per run
│   │   └── ABC-123.json        # full RunState (steps, status, context)
│   └── presets/                # saved workspace snapshots
│       └── my-preset.json
└── docs/                       # produces paths from your pipelines land here
    └── …
```

Runs and presets are local-only — gitignore `.aidlc/runs/` and
`.aidlc/presets/` if you want, the rest is meant to be committed.

## Troubleshooting

| Problem | Likely fix |
|---|---|
| `aidlc doctor` says "Not authenticated" | `claude login` (Claude Code) or set `ANTHROPIC_API_KEY` |
| `aidlc run exec` fails with "missing artifacts" | The agent didn't produce the files declared in `pipeline.steps[].produces`. Check the paths or fix the agent's skill. |
| `aidlc run start` rejects the runId | RunIds must match `^[A-Za-z0-9][A-Za-z0-9._-]*$`. No spaces, no leading dashes. |
| Pipeline step appears as a string in YAML, but I edited it as an object | Both forms are valid. The CLI writes string form when there's no metadata, object form when there's `human_review` or `produces`. |
| Custom runner not loading | `runner_path` must be `.js` / `.cjs` / `.mjs` (no TypeScript yet). Run `aidlc doctor` to check the file resolves. |

## Sponsor

If AIDLC saves you time, consider [sponsoring on GitHub](https://github.com/sponsors/hueanmy) ❤️ — it keeps the extension, the CLI, and the monitor maintained.

## License

MIT
