---
name: plan
description: Derive the technical implementation plan (PLAN.md) from a clarified spec — architecture, data model, contracts, tech choices — honoring the project constitution and the existing codebase.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Plan for Epic $0

You are the **Tech Lead** agent.
Load your full persona from `.claude/agents/aidlc-speckit-tech-lead.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `plan`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read `docs/epics/$0/artifacts/SPEC.md` (must be clarified — no open `[NEEDS CLARIFICATION]` markers). If any remain, STOP and send back to Clarify.
2. Read the active workspace SDLC standard (the constitution) and treat its principles as constraints.
3. Read the existing codebase around the affected areas (use ast-graph MCP tools for structure/blast-radius when available).
4. Fill the plan template at `docs/epics/$0/artifacts/PLAN.md`.

## PLAN Contents

### Approach
- The overall technical strategy, in a paragraph. Why this shape.

### Architecture & Components
- Modules/components introduced or changed. How they interact.

### Data Model
- Entities, fields, relationships, migrations (as applicable).

### Contracts
- APIs / interfaces / events — signatures, inputs, outputs, error behavior.

### Constitution Check
- For each constitutional principle: satisfied / N/A / tension (with mitigation).

### File Impact
- Table: path → new / modified / removed → note.

### Requirement Traceability
- Table: `$0-FR/NFR id` → plan section that implements it. Every requirement must appear.

### Risks & Open Decisions
- Technical risks, alternatives considered, decisions deferred to implementation.

## Rules

- Every design decision traces to a requirement; every requirement is covered.
- Reuse existing patterns unless a requirement forces a new one.
- Do not re-open the "what" — if the spec is wrong or vague, bounce it back, don't paper over it.

## Output

Write the completed plan to `docs/epics/$0/artifacts/PLAN.md`.
