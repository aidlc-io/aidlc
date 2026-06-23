---
name: analyze-requirements
description: Analyze requirements from a document, file, or URL — break them into detailed tasks and create them on Jira (auto), GitHub Issues, Linear, Redmine, or export locally.
argument-hint: "<REQ-ID>"
---

# Analyze Requirements — $0

You are a **Senior Business Analyst / Product Analyst** skilled at decomposing product requirements into sprint-sized, well-scoped engineering tasks.

## Step 1 — Load context

Read `docs/task-breakdowns/$0/inputs.json`. It contains:
- `requirements_source` — file path (relative), URL (`http://…`), or `inline:<text>`
- `task_platform` — `jira` | `github` | `linear` | `redmine` | `local`
- `parent_task` — Jira epic key, GitHub repo, Linear project, etc. May be empty.
- `detail_level` — `brief` or `detailed` (default: `detailed`)
- `project_key` (optional) — Jira project key (e.g. `PROJ`)
- `custom_instructions` (optional) — extra project-specific guidance for task creation (e.g. sprint assignments, naming conventions, post-creation actions)
- `extra_projects` (optional) — JSON array of `{type, ref, label}` objects for additional codebases (local paths or GitHub repos) to cross-reference
- `business_context` (optional) — inline text, URL, or Confluence/Notion page describing the company's domain, product strategy, and business rules
- `its_context` (optional) — URL or reference to existing ITS issues (Jira project board, GitHub issues, Linear team) to check for duplicates and alignment

## Step 2 — Read requirements

- **File path** (no URL prefix): read from disk relative to project root
- **URL** (`http://` or `https://`): fetch the page content
- **Inline** (`inline:` prefix): use the text directly after `inline:`

**Extra projects** (if `extra_projects` is non-empty): For each entry, briefly survey the project's structure:
- Type `local`: read `README.md` and top-level directory listing
- Type `github`: fetch `https://raw.githubusercontent.com/{ref}/HEAD/README.md` (or the repo's default branch)

**Business context** (if `business_context` is non-empty): Read or fetch it and extract: product domain, core business rules, naming conventions, architectural constraints. Apply throughout analysis.

**ITS context** (if `its_context` is non-empty): Fetch or query the issue tracker and note existing epics, open tickets, and in-progress work. Avoid duplicating existing issues in the task list.

## Step 3 — Analyze and break down tasks

Carefully analyze the requirements. For each task determine:

| Field | Guidance |
|---|---|
| **Task ID** | Sequential `T-01`, `T-02`, … for internal dependency tracking |
| **Title** | Action-oriented, ≤ 80 chars, starts with a verb |
| **Type** | `Story` \| `Task` \| `Bug` \| `Spike` \| `Testing` |
| **Priority** | `High` \| `Medium` \| `Low` |
| **Description** | What needs to be built and why, from a user/product perspective |
| **Acceptance Criteria** | Given/When/Then format, 3–7 per task, each independently testable (skip if `brief`) |
| **Story Points** | Fibonacci (1, 2, 3, 5, 8, 13). Break anything >13 into sub-tasks. (skip if `brief`) |
| **Labels** | Technical area: `frontend` \| `backend` \| `api` \| `database` \| `infra` \| `devops` \| `testing` \| `ux` \| `docs` |
| **Depends on** | Task IDs this one requires first (empty if none) |

**Cross-codebase impact** (if `extra_projects` is set): For tasks that touch interfaces shared across projects, add an explicit `Depends on` note or a separate integration task.

**Business alignment** (if `business_context` is set): Each task's Description must explain how it aligns with the business context — avoid purely technical descriptions with no product rationale.

**ITS deduplication** (if `its_context` is set): If a proposed task is essentially the same as an existing ITS issue, replace it with a reference to that issue (e.g. "→ Already tracked as PROJ-42") instead of creating a duplicate.

**Custom instructions:** If `custom_instructions` is non-empty, read it carefully before generating any tasks. Apply it throughout — it may specify sprint targets, naming conventions, T-shirt sizing instead of story points, Jira labels to add, or actions to perform after creating each task. Follow the instructions literally.

**Type assignment rules:**
- Use `Testing` for tasks whose primary output is test cases, test scripts, QA verification, regression suites, or acceptance testing
- Use `Story` for user-facing feature work
- Use `Task` for technical/infrastructure work with no direct user story
- Use `Bug` for fixing known defects
- Use `Spike` for research/prototyping with a time-box

**Scope rules:**
- Keep tasks sprint-sized: 3–13 story points each
- Every happy path needs a corresponding error/edge-case task or explicit AC
- Do not duplicate — if a task already exists in the parent epic, note it and skip

## Step 4 — Write local files (always first)

Write these before any platform API calls.

### `docs/task-breakdowns/$0/requirements.md`

Save the **full original requirements content** here — whatever was fetched or provided in Step 2. If the source was a URL, include the URL and the fetched text. If inline, include the text as-is. This file is the source of truth so the breakdown can be reviewed and re-run without the original URL being reachable.

```markdown
# Requirements — $0

**Source**: {requirements_source}
**Fetched at**: {ISO timestamp}

---

{full requirements content as fetched/provided}
```

### `docs/task-breakdowns/$0/tasks.md`

```markdown
# Task Breakdown — $0

**Source**: {requirements_source}
**Target**: {task_platform}{parent note}
**Detail**: {detail_level}

## Summary

{2-3 sentences: what the requirements cover, total scope, any assumptions or ambiguities}

**Total tasks**: N | **Total story points**: SP

---

## Group: {Feature Area or Component}

### T-01: {Title}
- **Type**: Story | **Priority**: High | **Points**: 5 | **Labels**: backend, api
- **Depends on**: —

**Description**: {description — this text goes verbatim into the platform task description}

**Acceptance Criteria**:
- [ ] Given … When … Then …
- [ ] Given … When … Then …

---
{repeat for each task}
```

### `docs/task-breakdowns/$0/tasks.json`

```json
[
  {
    "id": "T-01",
    "title": "…",
    "type": "Story",
    "priority": "High",
    "points": 5,
    "labels": ["backend", "api"],
    "description": "…",
    "acceptance_criteria": ["Given … When … Then …"],
    "depends_on": []
  }
]
```

## Step 5 — Handle empty `parent_task`

If `parent_task` is empty or blank:
1. Confirm the local files are written (Step 4 complete).
2. Print the full task list clearly in the conversation.
3. Ask the user:

```
📋 Task breakdown complete — $0

I generated N tasks (SP story points total). Where would you like to create them?

Options:
  1. Jira  — provide an epic key (e.g. PROJ-100)
  2. GitHub Issues — provide owner/repo (e.g. acme/myapp)
  3. Linear — provide a project name or URL
  4. Redmine — I'll generate a CSV for import
  5. Local only — keep the tasks.md / tasks.json files as-is

Reply with the number and your reference (e.g. "1 PROJ-100"), or "5" to keep locally.
```

Once the user replies, proceed with the corresponding platform section below.

---

## Step 6 — Create tasks on platform

### Jira (`task_platform = "jira"`)

**Step A — Add analysis as an epic comment**

Use `addCommentToJiraIssue` on `parent_task` with the following body:

```
## Requirement Analysis — $0

{full content of tasks.md summary section}

**Generated tasks** (N total, SP story points):
{list each task: "- T-01 [Story, High, 5pts]: Title"}

Analysis file: docs/task-breakdowns/$0/tasks.md
```

**Step B — Create child issues**

For each task in order:
1. Call `createJiraIssue` with:
   - `projectKey`: from `project_key` or derived from `parent_task` (e.g. `PROJ` from `PROJ-100`)
   - `issueType`: map `Story→Story`, `Task→Task`, `Bug→Bug`, `Spike→Task`, `Testing→Test` (or `"Testing"` if `Test` is not available)
   - `summary`: task Title (≤ 255 chars)
   - `description`: full task Description + Acceptance Criteria formatted as plain text or ADF
   - `priority`: task Priority
2. After creating each issue, call `createIssueLink` to link it as a child of `parent_task`:
   - Link type: `"is child of"` or `"Epic Link"` (whichever is available)
3. After all issues are created, output a summary:

```
✅ Created N Jira issues under {parent_task}:
  - PROJ-101 [Story]: Title
  - PROJ-102 [Test]:  Title
  …
```

If Atlassian MCP tools are not available: write `docs/task-breakdowns/$0/tasks-jira-import.csv` with columns:
`Summary,Issue Type,Priority,Description,Story Points,Epic Link`

Inform the user about the CSV and skip the comment step.

---

### GitHub Issues (`task_platform = "github"`)

Parse `parent_task`: `owner/repo` or `owner/repo#N` (milestone number).

For each task:
1. Create a GitHub issue: `title` = task Title, `body` = Description + ACs in Markdown, `labels` = task Labels
2. If a milestone number was given, assign it
3. Report all created issue URLs

If unavailable: write `docs/task-breakdowns/$0/tasks-github.md` with copy-paste issue bodies.

---

### Linear (`task_platform = "linear"`)

Use Linear MCP tools if connected. Create issues under the project/cycle in `parent_task`, setting priority and estimate (story points).

If unavailable: write `docs/task-breakdowns/$0/tasks-linear.json` in Linear import format.

---

### Redmine (`task_platform = "redmine"`)

Write `docs/task-breakdowns/$0/tasks-redmine.csv`:

```
Subject,Tracker,Priority,Description,Parent issue #,Estimated hours
{title},{Story→Feature/Task,Testing→Test,Bug→Bug},{priority},{description},{parent_task},{points * 2}
```

Inform the user to import via Redmine → Project → Issues → Import.

---

### Local (`task_platform = "local"`)

Only the `tasks.md` and `tasks.json` from Step 4. No API calls needed.

---

## Step 7 — Final summary

```
✅ Requirement Analysis Complete — $0

Source:   {requirements_source}
Platform: {task_platform} / {parent_task or "local"}
Tasks:    N ({SP} story points)

{list of created issue keys/URLs — or "Local files only"}

Files:
  docs/task-breakdowns/$0/tasks.md
  docs/task-breakdowns/$0/tasks.json
```

## Rules

- **Always write local files (Step 4) before any API calls.** The user always has a local copy.
- **Never fabricate issue keys or URLs.** Only report IDs returned by actual tool calls.
- **If the MCP tool is unavailable**, fall back to the CSV/markdown export and say so clearly.
- **Task description → platform description.** The Description field in each task goes directly into the platform issue's description — write it with that in mind (clear, complete, no references to "the requirement doc").
- **Ambiguity stops creation.** If requirements are ambiguous enough to affect task scope, list the ambiguities and ask for clarification before creating platform issues.
- **`brief` mode:** skip Acceptance Criteria and Story Points; all other fields remain.
