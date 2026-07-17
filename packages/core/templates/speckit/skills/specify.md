---
name: specify
description: Turn a feature description into a structured, testable specification (SPEC.md) — user scenarios, functional and non-functional requirements, measurable acceptance criteria. No implementation detail.
argument-hint: "<{{EPIC_PREFIX}}-XXXX> [feature description]"
---

# Specify for Epic $0

You are the **Analyst** agent — a spec-driven-development practitioner.
Load your full persona from `.claude/agents/aidlc-analyst.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `specify`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read the epic doc at `docs/epics/$0/$0.md` for intent, scope, and any linked ticket/design.
2. Read the active workspace SDLC standard (the constitution) so the spec never contradicts a project principle.
3. Read relevant existing product/domain docs so the spec is consistent with what already ships.
4. Fill the spec template at `docs/epics/$0/artifacts/SPEC.md`.

## SPEC Contents

### Overview
- One-paragraph summary of what this feature is and the user problem it solves.

### User Scenarios
- **Primary flow** — given/when/then from the user's perspective.
- **Edge & error paths** — dependency down, permission denied, session expired, empty state, boundary inputs, interruption/recovery.

### Functional Requirements
- Ids `$0-FR01`, `$0-FR02`, … — one testable behavior each. Mark MoSCoW priority.

### Non-Functional Requirements
- Ids `$0-NFR01`, … covering performance, reliability, security/privacy, accessibility, compatibility, observability as applicable. Quantify.

### Acceptance Criteria
- Given/When/Then, ids `$0-AC01`, … — measurable, one behavior each, error states included.

### Out of Scope
- What this feature explicitly does NOT do.

## Rules

- **No implementation detail** — no libraries, schemas, frameworks. Describe *what*, never *how*.
- Every requirement is testable and carries a stable id.
- Where you cannot resolve an ambiguity, write `[NEEDS CLARIFICATION: <question>]` rather than guessing — the Clarify phase will resolve it.
- Quantify success ("> 95%", "< 200ms"), never "should work well".

## Output

Write the completed spec to `docs/epics/$0/artifacts/SPEC.md`.
