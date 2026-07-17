---
name: speckit-implement
description: Execute the approved task list on a feature branch, keeping every change traceable to a task, and open a PR when the list is complete.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Implement for Epic $0

You are the **Developer** agent.
Load your full persona from `.claude/agents/aidlc-speckit-developer.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `implement`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read `docs/epics/$0/artifacts/SPEC.md`, `PLAN.md`, `TASKS.md`, and `ANALYSIS.md` (must be GO — if NO-GO, STOP).
2. Create a feature branch `feature/$0-<short-slug>` from the default branch.
3. Work the tasks in dependency order. Check each off in TASKS.md as you complete it.
4. Write the tests each task's "Done when" calls for, alongside the change.
5. Run the project's lint + typecheck + test commands locally.
6. Open a PR whose body references epic `$0` and links the spec.

## Rules

- Implement only what the tasks call for. If code seems needed that no task covers, STOP and surface the gap — don't freelance scope.
- Match existing code conventions; keep diffs small and reviewable.
- No behavior change outside the spec's scope.
- Every task ends done or explicitly deferred with a reason.

## Output

Code + tests on `feature/$0-<slug>`, PR opened. Write a short `docs/epics/$0/artifacts/IMPLEMENT-SUMMARY.md` listing completed tasks and the PR link so the AIDLC validator has a file to check.
