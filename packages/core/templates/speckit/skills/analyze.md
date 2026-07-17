---
name: analyze
description: Cross-check spec ↔ plan ↔ tasks for coverage, gaps, and contradictions before implementation, and issue a go/no-go verdict (ANALYSIS.md).
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Analyze for Epic $0

You are the **QA** agent.
Load your full persona from `.claude/agents/aidlc-speckit-qa.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `analyze`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read `docs/epics/$0/artifacts/SPEC.md`, `PLAN.md`, and `TASKS.md`.
2. Build a coverage matrix: requirement id → plan section → task id(s).
3. Identify gaps, orphans, and contradictions.
4. Fill `docs/epics/$0/artifacts/ANALYSIS.md` and issue a verdict.

## ANALYSIS Contents

### Coverage Matrix
- Table: `$0-FR/NFR id` → PLAN.md section → TASKS.md task id(s). One row per requirement.

### Gaps
- Requirements with no plan coverage or no task.
- Acceptance criteria not satisfiable by any task.

### Orphans (scope creep)
- Plan decisions or tasks with no upstream requirement.

### Contradictions
- Where any two of spec / plan / tasks disagree.

### Constitution Check
- Any element that violates a workspace-standard principle.

### Verdict
- **GO** or **NO-GO**. If NO-GO, list blocking issues and which artifact owns each fix.

## Rules

- 100% of requirements must trace to both plan and tasks for a GO.
- Do not wave through a NO-GO — route it back to Analyst (spec) or Tech Lead (plan/tasks).

## Output

Write the analysis to `docs/epics/$0/artifacts/ANALYSIS.md`.
