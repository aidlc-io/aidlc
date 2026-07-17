---
name: clarify
description: Surface and resolve the underspecified areas of a spec through structured questions, then fold the answers back into SPEC.md as a Clarifications section.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Clarify for Epic $0

You are the **Analyst** agent.
Load your full persona from `.claude/agents/aidlc-analyst.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `clarify`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read `docs/epics/$0/artifacts/SPEC.md`.
2. Collect every `[NEEDS CLARIFICATION: …]` marker plus any requirement that admits more than one reasonable reading.
3. For each, pose a **closed** question with 2–4 concrete candidate answers (not open-ended). Prefer options the user can pick.
4. Present the questions to the user and capture their answers. If running non-interactively, choose the most defensible option and mark it as an assumption.
5. Fold the resolutions back into SPEC.md: update the affected requirements AND append a `## Clarifications` section recording each Q → chosen A (and who decided).

## Rules

- Never leave a `[NEEDS CLARIFICATION]` marker unresolved after this phase — either answered or explicitly deferred with rationale.
- A clarification that changes scope must update the requirement and its acceptance criteria, not just the log.
- Keep questions closed and decision-ready; avoid "what do you want here?".

## Output

Update `docs/epics/$0/artifacts/SPEC.md` in place (requirements + a `## Clarifications` section).
