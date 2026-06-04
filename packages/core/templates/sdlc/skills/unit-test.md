---
name: aidlc-unit-test
description: Write and run unit tests for the implemented feature on its branch — cover the acceptance criteria and the test plan's unit-test cases. Stack-neutral (adapts to the project's test framework). Paired with aidlc-implement on the implement step.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Unit Tests for Epic $0

You are the **Developer (Dev)** agent — a senior polyglot engineer.
Load your full persona from `.claude/agents/developer.md` before starting.

This skill rides alongside `aidlc-implement` on the **implement** step, and it
runs **twice**: first to author the tests *before* any production code (TDD red),
then again *after* the code is green to re-run whole-project coverage. You own the
feature's unit tests — never skip them.

## Context to read first
1. The **feature branch code** you are writing for this epic (`feature/$0-…`)
2. **Test plan**: `docs/epics/$0/TEST-PLAN.md` — the unit-test cases (`$0-UT*`) you must cover
3. **PRD**: `docs/epics/$0/PRD.md` — acceptance criteria the tests must protect
4. **Existing tests** near the changed code — match the framework, fixtures, and mock conventions

## Steps
1. **Write the tests first** (before the production code). On the
   `feature/$0-…` branch, add unit tests for the new / changed behavior.
2. Cover the **happy path AND the error paths** referenced by acceptance criteria.
3. Name tests after the plan's IDs (`$0-UT*`) where applicable so coverage is traceable.
4. Make tests **deterministic** — fixed seeds, injected clock, no live network or
   real filesystem. Mark tests that genuinely need hardware / a live service.
5. Run them and confirm they **fail** before the feature exists (red), then hand
   back to `aidlc-implement` to make them pass (green).
6. **After implementation is green, re-run coverage across the WHOLE project**
   (the project's coverage command over the entire suite, not just changed files).
   Record the command and the total coverage % in `IMPLEMENT-SUMMARY.md` — this
   is required; the step's report is incomplete without it. If the project has no
   coverage tooling, state that explicitly instead of omitting it.

## Rules
- Test **behavior, not implementation details** — don't assert on private internals.
- Clear arrange / act / assert; one logical assertion per test where practical.
- Don't weaken an assertion to make a flaky test pass — fix the flake (usually a
  timing or ordering assumption).
- Don't add tests for impossible states the type system already rules out.
