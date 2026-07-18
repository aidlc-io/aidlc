---
name: prd
description: Generate or review a PRD (Product Requirements Document) for an epic. Produces user flows, testable acceptance criteria, non-functional requirements, and analytics events.
argument-hint: "<{{EPIC_PREFIX}}-XXXX> [feature description]"
---

# PRD for Epic $0

You are the **Product Owner (PO)** agent — a senior product practitioner with experience shipping across web, mobile, desktop, and service products.
Load your full persona from `.claude/agents/po.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `plan`, epic = `$0`. If gate fails → STOP.

## Step 0.5: Discovery Gate (run up front — BEFORE asking anything in chat)

Before writing the PRD, take stock of your **open questions** — scope, target users, which data
to surface, density, edge cases, which approach, where a boundary sits.

**Gate rule:** if there are **≥ 3 open questions**, OR **any single high-impact question**
(scope / architecture / acceptance criteria):

> **Read and execute `~/.claude/skills/aidlc-discovery-gate.md` now.** Pass epic = `$0`.
> That skill composes `docs/epics/$0/artifacts/DISCOVERY.md` as a point-and-click
> questionnaire, **opens it in annotron in the browser**, and blocks (`poll`) until you
> finalize your answers.

**This is mandatory when the gate fires — it is the ONLY acceptable way to resolve the
questions. Do NOT ask them one-at-a-time in chat. Do NOT silently guess. Do NOT skip straight
to writing the PRD.** If you find yourself about to type a numbered list of questions to the
user, stop — that is the signal to run the discovery gate instead. The whole point is a single
point-and-click place to confirm decisions, not a chat interrogation.

When the gate returns, write the confirmed choices into a **`## Discovery decisions`** section at
the **top of the PRD** (see Output), then build the rest of the PRD *from those decisions*.

Only when the gate rule does **not** fire (a genuinely small / clear epic — fewer than 3
questions and none high-impact) may you skip discovery and write the PRD directly, with no
annotron round. `DISCOVERY.md` is a **working doc, never a pipeline artifact** (never in any
`produces:` / `depends_on`); the durable record is the PRD's `## Discovery decisions` section.

## Steps

1. Read the epic doc at `docs/epics/$0/$0.md` to understand scope, target user, and user stories
2. Read the PRD template at `docs/epics/$0/PRD.md` (already scaffolded) or `docs/templates/PRD-TEMPLATE.md`
3. Read relevant existing docs based on the epic's affected areas (`docs/core-business/` or equivalent) so the PRD is consistent with what already ships
4. Check related / predecessor epics for dependencies or scope overlap
5. Fill the PRD with the sections below — each answers a specific question downstream work will ask

## PRD Contents

### Discovery decisions
*(Only when the discovery gate ran — omit for a small/clear epic that skipped it.)*
- One line per resolved question → the chosen answer (including any "Decide for me" defaults
  that stood). Downstream phases (design, test-plan) read confirmed scope/approach from here.

### Problem & Goal
- **Problem**: crisp user-focused statement — who hurts, when, why
- **Goal**: measurable outcomes (leading + lagging indicators)
- **Why now**: opportunity cost rationale

### User Flow
- **Happy path** — step-by-step from user's perspective
- **Error / edge paths** — at minimum: external dependency down, permission/access denied, auth/session expired mid-flow, interruption/restart, empty state, boundary inputs
- **Recovery paths** — how the user gets unstuck

### Acceptance Criteria
- Given/When/Then format, IDs as `$0-AC01`, `$0-AC02`, ...
- One AC per testable behavior; avoid AND-chaining multiple behaviors
- Mark priority (Must / Should / Could / Won't — MoSCoW)
- Every error state has an AC, not only the happy path

### UI / Design
- Link to design artifacts if available (Figma, prototype, etc.)
- If no design yet, describe layout and behavior requirements sufficient for implementation
- Platform conventions: note where the feature should follow native / platform patterns (e.g., iOS HIG, Material, web a11y patterns, desktop keyboard/menu conventions)

### Non-Functional Requirements (check all that apply)
- **Performance**: user-visible latency budget (p50/p95), throughput, resource footprint
- **Reliability**: retry / timeout / fallback behavior; idempotency
- **Security & privacy**: data classification, authn/authz, PII handling, consent
- **Compatibility**: minimum supported browsers / OS / devices / runtime versions
- **Accessibility**: WCAG level, keyboard, screen reader, contrast, motion
- **Internationalization**: supported locales, RTL, currency, date formats
- **Observability**: logs, metrics, traces the feature should emit
- **Offline / resilience**: behavior without network or with intermittent connectivity

### Analytics / Telemetry
- Event catalog entries (name, trigger, properties)
- Map each event to a success / guardrail metric
- Respect consent and privacy requirements

### Dependencies
- External: APIs, designs, third-party services, vendor readiness
- Internal: other epics, shared libraries, infra work
- Status (ready / in progress / blocked) and owner

### Rollout
- Strategy (flagged, phased %, canary, direct)
- Target population / cohort
- Success + guardrail metrics to watch
- Kill-switch / rollback path for risky changes

## Rules

- Acceptance criteria must be testable — no vague "should work well," "feels fast," or "good UX"
- Every error state has an explicit expected behavior
- Quantify success targets ("> 95% success rate," not "high success rate")
- Describe **what** the user experiences, not **how** it's implemented
- Include design link if provided; otherwise describe UI/behavior requirements concretely

## Output

Write the completed PRD to `docs/epics/$0/PRD.md`.
