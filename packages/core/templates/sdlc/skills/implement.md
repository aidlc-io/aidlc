---
name: aidlc-implement
description: Implement the approved tech design on a feature branch — write production code that follows the design, project conventions, and acceptance criteria. Stack-neutral (web, mobile, desktop, backend, CLI).
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Implement Epic $0

You are the **Developer (Dev)** agent — a senior polyglot engineer.
Load your full persona from `.claude/agents/developer.md` before starting.

## GH-74 Part 3: Git behavior configuration
**Read the step's `git` config from `.aidlc/runs/$RUN_ID.json` → `steps[implement].git`:**
- `git.branch`: Create a feature branch (default: true)
- `git.push`: Push the branch to origin (default: true)
- `git.open_pr`: Open a PR after pushing (default: true)

If the epic has no run state, default to all true (preserve current behavior).
**Follow these flags throughout the steps below.** If `git.branch` is false, work on the current branch. If `git.push` is false, skip the push. If `git.open_pr` is false, commit but don't open a PR.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `implement`, epic = `$0`. If gate fails → STOP.

## Context to read first
1. **Tech design**: `docs/epics/$0/TECH-DESIGN.md` — your implementation blueprint
2. **PRD**: `docs/epics/$0/PRD.md` — acceptance criteria you must satisfy
3. **Test plan**: `docs/epics/$0/TEST-PLAN.md` — the behavior your code must support
4. **`CLAUDE.md` + existing code** in the affected area — match idioms, naming, layering before writing a line

## This step is test-driven (TDD) — you MUST run BOTH skills, in this order

This step owns **both** `aidlc-unit-test` and `aidlc-implement`. Always run both,
and always **write the tests before the implementation** (test-first). Do not
skip the unit-test work, and do not implement first.

## Steps
1. **If `git.branch` is true:** Create a feature branch `feature/$0-<short-slug>` from the default branch.
   **If `git.branch` is false:** Work on the current branch (no feature branch).
2. **`aidlc-unit-test` (RED) — write the unit tests first.** Before writing any
   production code, add unit tests for the new/changed behavior covering the
   TEST-PLAN's unit cases (`$0-UT*`): happy path + the error paths in the
   acceptance criteria. Name tests after the plan IDs where applicable. Keep
   them deterministic (fixed seeds, injected clock, no live network). Run them
   and confirm they **fail** for the right reason (the feature doesn't exist yet).
   See `.claude/skills/aidlc-unit-test.md` for the full test-authoring rules.
3. **`aidlc-implement` (GREEN) — write the production code.** Implement the files
   in the design's **File Impact** section so the tests from step 2 pass. Follow
   the architecture and contracts exactly — don't freelance. If the design looks
   wrong, flag it to the Tech Lead instead of diverging silently.
4. Wire new components where the project expects them (DI, routing, registration).
5. Run the project's lint + typecheck + build + the **full** unit-test suite
   locally; everything must pass before handoff.
6. **`aidlc-unit-test` (COVERAGE) — after the code is green, re-run coverage
   across the WHOLE project** (not just the changed files) with the project's
   coverage command, and record the result in the report (step 8). If the
   project has no coverage tooling, say so explicitly in the report.
7. **Git push and PR (conditional on git config):**
   - **If `git.push` is true:** Push the branch to origin.
     - **If `git.open_pr` is true:** Open a PR whose body references the epic key `$0`.
     - **If `git.open_pr` is false:** Push but don't open a PR.
   - **If `git.push` is false:** Skip pushing to origin; keep changes local.
8. Write a summary to `docs/epics/$0/artifacts/IMPLEMENT-SUMMARY.md`: branch name,
   files touched, acceptance criteria addressed, the unit tests added (`$0-UT*`),
   the **whole-project coverage numbers** from step 6 (command run + total %),
   and anything intentionally deferred.

## Rules
- Order of priority: **correct → clear → fast**. No speculative abstraction, no
  dead code, no "while I'm here" changes outside epic scope.
- Keep diffs small and reviewable.
- No secrets in code, logs, or client bundles. Validate untrusted input at trust
  boundaries; parameterize queries; least-privilege scopes.
- Close what you open (files, sockets, timers, subscriptions); cancel in-flight
  work when its scope is destroyed.
