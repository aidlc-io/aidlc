---
description: AIDLC dispatcher — run a phase for an epic, or the next eligible phase. Usage: /aidlc <epic> [phase]
---

# AIDLC dispatcher

You were invoked as `/aidlc <epic> [phase]` with arguments: `$ARGUMENTS`.
The first token is the **epic id**; an optional second token is the **phase**.

## 1. Bind the epic to its pipeline

1. Read `docs/epics/<epic>/state.json`. Note `pipelineId` (the pipeline this
   epic is bound to) and the per-step `status` list. If the file is missing,
   tell the user the epic isn't started and stop.

## 2. Choose the phase

- **If a phase was given**, use it. Validate it is a step in the epic's
  pipeline (see step 3). If it isn't, tell the user which phases the pipeline
  *does* have and stop.
- **If no phase was given**, pick the **next eligible phase**: the first step
  that is `awaiting_work`, else the first `rejected` step, else the first
  `pending` step whose every `depends_on` is `approved`. If none is
  actionable (all approved or paused for review), say so and stop.

## 3. Resolve composition from the pipeline (never from the command name)

1. Read `.aidlc/workspace.yaml`. Find the pipeline whose `id` === `pipelineId`.
2. In that pipeline's `steps`, find the step whose `name` (or `agent` when
   unnamed) === the chosen phase. That step's `agent` + `skills` are the
   wiring. If the step omits `skills`, use the referenced agent's `skills:`.
3. Load the persona from `.claude/agents/<agent>.md` (fall back to
   `~/.claude/agents/<agent>.md`), and each skill from
   `.claude/skills/<skill>.md` (fall back to `~/.claude/skills/<skill>.md`).
   Adopt the persona and follow the skill instructions.

If the active SDLC standard (`standard:` in workspace.yaml, or a per-epic
override) is `none`, skip the persona/skill (opinion) layer and act as plain
Claude — but still follow the structural contract below.

## 4. Structural contract (always applies, every profile)

1. Read `docs/epics/<epic>/state.json` for prior feedback/history and address
   any rejection reasons in this revision.
2. Read `docs/epics/<epic>/inputs.json` for capability inputs.
3. Write your output to `docs/epics/<epic>/artifacts/<FILE>` where `<FILE>`
   is the step's declared artifact, or the phase's conventional file. The AIDLC
   validator checks this path when the step is marked done.
4. Summarize what you produced and tell the user to click **"Mark step done"**
   in the AIDLC panel to advance the pipeline.
