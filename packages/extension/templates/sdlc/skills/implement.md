---
name: implement
description: Implement the approved tech design on a feature branch — write production code that follows the design, project conventions, and acceptance criteria. Stack-neutral (web, mobile, desktop, backend, CLI).
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Implement Epic $0

You are the **Developer (Dev)** agent — a senior polyglot engineer.
Load your full persona from `.claude/agents/developer.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `implement`, epic = `$0`. If gate fails → STOP.

## Context to read first
1. **Tech design**: `docs/epics/$0/TECH-DESIGN.md` — your implementation blueprint
2. **PRD**: `docs/epics/$0/PRD.md` — acceptance criteria you must satisfy
3. **Test plan**: `docs/epics/$0/TEST-PLAN.md` — the behavior your code must support
4. **`CLAUDE.md` + existing code** in the affected area — match idioms, naming, layering before writing a line

## Steps
1. Create a feature branch `feature/$0-<short-slug>` from the default branch.
2. Implement the files in the design's **File Impact** section. Follow the
   architecture and contracts exactly — don't freelance. If the design looks
   wrong, flag it to the Tech Lead instead of diverging silently.
3. Wire new components where the project expects them (DI, routing, registration).
4. Run the project's lint + typecheck + build locally; fix what you broke.
5. Open a PR whose body references the epic key `$0`.
6. Write a short summary to `docs/epics/$0/artifacts/IMPLEMENT-SUMMARY.md`:
   branch name, files touched, which acceptance criteria are addressed, and
   anything intentionally deferred.

## Rules
- Order of priority: **correct → clear → fast**. No speculative abstraction, no
  dead code, no "while I'm here" changes outside epic scope.
- Keep diffs small and reviewable.
- No secrets in code, logs, or client bundles. Validate untrusted input at
  trust boundaries; parameterize queries; least-privilege scopes.
- Close what you open (files, sockets, timers, subscriptions); cancel in-flight
  work when its scope is destroyed.
- Unit tests are written in the `unit-test` phase that runs next — keep the code
  testable (inject clocks/IO, avoid hidden globals), but don't write the test
  suite here.
