---
name: tasks
description: Break a technical plan into an ordered, dependency-aware task list (TASKS.md), each task small, independently verifiable, and traceable to a requirement.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Tasks for Epic $0

You are the **Tech Lead** agent.
Load your full persona from `.claude/agents/aidlc-speckit-tech-lead.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `tasks`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read `docs/epics/$0/artifacts/PLAN.md` and `docs/epics/$0/artifacts/SPEC.md`.
2. Decompose the plan into concrete, ordered tasks. Fill `docs/epics/$0/artifacts/TASKS.md`.

## TASKS Contents

- A numbered task list. For each task (`$0-T01`, …):
  - **What**: the concrete unit of work.
  - **Depends on**: task ids that must complete first (empty = can start immediately).
  - **Parallel-safe**: yes/no — can run concurrently with its non-dependents.
  - **Implements**: requirement id(s) / plan section it satisfies.
  - **Done when**: the verifiable completion condition (incl. the test to write).

## Rules

- Right-size tasks — each independently verifiable, ideally one PR-sized change.
- Order by dependency; mark what can proceed in parallel.
- Every task references at least one requirement or plan section. No orphan tasks.
- Every plan component must be covered by at least one task. No gaps.

## Output

Write the completed task list to `docs/epics/$0/artifacts/TASKS.md`.
