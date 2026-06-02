# Getting Started with AIDLC

Your `.aidlc/workspace.yaml` is ready. This page walks you through what you
just got, how to run it, and how to customize it.

---

## 1. What's inside

The built-in **SDLC Parallel Pipeline** (`sdlc-parallel-full`) is a DAG where QA
runs in parallel with engineering. Six steps, four agents:

| Step | Agent | Skill(s) |
|------|-------|----------|
| `plan` | **po** | `prd` |
| `design` | **tech-lead** | `tech-design` |
| `test-plan` | **qa** | `test-plan` |
| `implement` | **developer** | `implement` + `unit-test` |
| `generate-test-cases` | **qa** | `generate-test-cases` |
| `execute-test` | **qa** | `execute-test` + `test-report` |

`test-plan` / `generate-test-cases` run alongside engineering, so multiple steps
can be in flight at once.

### Task-type recipes

The pipeline also ships **recipes** — named subsets of the steps for common task
types. Start Epic uses them to suggest the right shape from a one-line brief:

| Recipe | Steps |
|--------|-------|
| `bugfix` | implement → execute-test |
| `small-feature` | plan → implement → execute-test |
| `refactor` | design → implement → execute-test |
| `feature-parallel` | plan → design → test-plan → implement → execute-test |
| `large-feature` | the full pipeline |
| `spike` | plan only |

The Builder panel surfaces three tabs:

- **Workflows** — the pipeline graph (drag to reorder, settings per step,
  `+` on a node to add a parallel step at the same level)
- **Agents** — personas the pipeline uses (read from `.claude/agents/` and
  `~/.claude/agents/`)
- **Skills** — slash-command instructions referenced by agents (read from
  `.claude/skills/` and `~/.claude/skills/`)

---

## 2. Start your first epic

Click **Start Epic** in the AIDLC sidebar.

1. **Describe it (optional)** — type a one-line brief and AIDLC suggests a
   recipe (e.g. *"fix the null crash on login"* → `bugfix`). Accept the
   suggestion or pick a pipeline/recipe yourself.
2. **Pick the pipeline or recipe** (e.g. `sdlc-parallel-full`). No pipeline in
   the workspace yet? Use **Load SDLC example** or **Create new pipeline**
   right from the modal.
3. **Epic id** — pre-filled from the next sequential id; rename if you like.
4. **Inputs** — fill in the capabilities the first step (Plan) needs:
   - `jira_ticket` — Jira issue key (e.g. `EPIC-2100`)
   - `figma_url` — design link
   - `files_glob` — codebase paths to scan
   - `github_repo` — repo to read

### Jira auto-scan

If `jira_ticket` is set **and** you have an Atlassian MCP server connected,
the `plan` step will automatically fetch the ticket's title, description, and
acceptance criteria into the PRD draft — no manual copy-paste needed.

Connect Jira once via the **MCP Servers** section in the sidebar (button **`+`** →
pick `claude.ai Atlassian`). After that, every epic with a `jira_ticket`
input gets the same auto-scan treatment.

Other auto-fetched sources when configured:

| Input | MCP source | What gets pulled |
|-------|------------|------------------|
| `jira_ticket` | Atlassian | Title, description, AC, parent epic |
| `figma_url` | Figma | Component metadata, screenshot, design tokens |
| `github_repo` | GitHub | README, recent commits, open PRs |

---

## 3. Customize agents and skills

You don't need to start from scratch — every built-in agent and skill is a
plain markdown file you can edit:

| Asset | Location | What to edit |
|-------|----------|--------------|
| Agent persona | `~/.claude/agents/aidlc-<id>.md` | The role description, tone, constraints |
| Skill | `~/.claude/skills/aidlc-<id>.md` | Step-by-step instructions for the slash command |
| Slash command | `.claude/commands/<pipeline>-<step>.md` | The full prompt Claude sees when you run the step's slash command (namespaced per pipeline) |
| Artifact template | `.aidlc/aidlc-templates/<pipeline>/<artifact>.md` | The scaffold dropped into each epic |

Open any of these in your editor and the change takes effect on the next run.
The Agents and Skills tabs in the Builder are click-to-edit links to these
files.

---

## 4. Build your own pipeline

Two ways to add a custom pipeline:

**A. Mutate the existing graph**

- In the Workflows tab, hover any step → click **`+`** → pick an agent →
  the step gets inserted in parallel with that step (same DAG level).
- Click **`+ Add Pipeline`** in the top-right to scaffold a brand-new pipeline.
- Click **Settings** on a step to toggle `human_review` / `auto_review` and
  set `requires` / `produces` paths.

**B. Edit `workspace.yaml` directly**

```yaml
pipelines:
  - id: my-flow
    on_failure: stop
    steps:
      - agent: plan
        human_review: true
      - agent: my-custom-agent
        depends_on: [plan]
        human_review: true
```

`depends_on` is what drives the DAG layout. Steps with the same `depends_on`
set render in the same column.

---

## 5. Add a custom agent or skill

**Add an agent (via Builder)**

1. In the **Agents** tab, click **`+ Add Agent`**.
2. Pick the scope (`Project` = `.claude/agents/<id>.md`, `Global` =
   `~/.claude/agents/aidlc-<id>.md`).
3. Pick the skills it should use.
4. Edit the persona markdown when it opens.

**Add a skill** is the same flow under the **Skills** tab. Templates
(`PRD writer`, `Code reviewer`, …) seed common skill shapes — pick one
to skip the blank page.

---

## 6. Run a step

From the epic detail panel:

- **Run with Claude** → launches the slash command in the AIDLC · Claude
  terminal. If carried feedback exists (cascade reject, manual rerun),
  the modal opens so you can review the feedback before launching.
- **Mark step done** → tells AIDLC the agent finished. Validates that the
  step's `produces` paths exist, then advances the DAG.
- **Approve / Reject** (after `human_review`) → either advances or rewinds.
  Rewind to any upstream step; downstream steps reset to pending.
- **Update with feedback** → re-opens an already-approved step with
  feedback so a later phase can ask earlier ones to redo work.

---

## 7. Tips

- **Empty Workflows tab?** Use the sidebar's **Workflows** section to load
  a common pipeline, or click **`+ Add Pipeline`** at the top-right.
- **Workflow lost its DAG?** Open `workspace.yaml` and check the
  `depends_on` field on each step. The Settings modal preserves edges; the
  + parallel button on a step inflates a linear chain into a DAG.
- **Want to share a pipeline?** Run **AIDLC: Save Workspace as Template**
  in the command palette — it captures `workspace.yaml` + every referenced
  skill into a single JSON in `.aidlc/templates/<id>.json`. Commit it and
  teammates get the same flow via **Load Template**.

You can re-open this guide any time via **AIDLC: Open Getting Started Guide**
in the command palette.
