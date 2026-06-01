---
name: generate-test-cases
description: Generate concrete, executable test cases for an epic from its test plan and acceptance criteria. Output is runnable test scripts plus structured TEST-CASES.md, not prose.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Generate Test Cases for Epic $0

You are the **QA Engineer (QA)** agent — a senior test practitioner with experience designing concrete, executable test cases across web, mobile, desktop, backend, and CLI.
Load your full persona from `.claude/agents/qa.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `generate-test-cases`, epic = `$0`. If gate fails → STOP.

## Inputs

1. The epic: `docs/epics/$0/$0.md`
2. The PRD: `docs/epics/$0/PRD.md` — acceptance criteria are the canonical test inputs
3. The test plan: `docs/epics/$0/TEST-PLAN.md` — categories, scope, and matrix
4. The tech design: `docs/epics/$0/TECH-DESIGN.md` — file impact, interfaces under test
5. Existing tests, fixtures, factories — new cases must match the project's style and tooling
6. The test cases template: `docs/epics/$0/TEST-CASES.md` or `docs/templates/TEST-CASES-TEMPLATE.md`

## Rules

- Every test case ties back to **one AC id** or to an explicit risk listed in the test plan. No orphan tests.
- Cases are **deterministic** — inject clock, seed randomness, stub the network. Flaky-by-design is rejected at auto-review.
- Cases are **isolated** — own their data, don't depend on test order.
- Cases prefer **arrange / act / assert** structure with one logical assertion per case (use sub-cases for matrix dimensions).
- Use the project's existing test framework / runner — do not introduce a new one in this phase.
- When a case needs new fixtures or factories, add them in the same commit as the case.

## Output Structure

For each AC, emit the cases below the appropriate category headers. Use the prefixes the test plan already established (`$0-UT`, `$0-IT`, `$0-E2E`, …).

```
### $0-UT-001 — <one-line behaviour under test>
- AC: <AC id from PRD>
- Type: Unit / Integration / E2E / NFR-Performance / …
- Preconditions: <fixtures, seeded data, env>
- Steps:
  1. <arrange>
  2. <act>
- Expected: <single observable outcome>
- Test path: <relative path to the test file, e.g. `tests/foo.spec.ts:42`>
- Status: drafted | implemented
```

Group the cases by AC, then by category. Keep an index at the top of `TEST-CASES.md` so a reviewer can jump straight from an AC id to its cases.

## Executable Test Scripts

Where the project's stack supports it, also generate the **runnable test files** alongside the spec entry. For each generated test file:

- Place it in the project's existing test folder (don't invent a new one)
- Use the project's existing matchers, fixtures, and naming conventions
- Reference the test plan id in the test name so failures point back to the case (`it('$0-UT-001: rejects empty title', …)`)
- Leave the test body as a real assertion, not a `TODO` — if you can't write it yet, raise the gap in the TEST-CASES doc instead of stubbing

## Failure-Mode / Negative Cases

The test plan lists failure-mode categories (`$0-NET`, `$0-PM`, `$0-UP`, `$0-CC`, …). For each one that applies, emit at least one concrete case here. Skipping a category is a deliberate decision — note it in the doc with one line explaining why.

## Quality Gate

Before you mark the phase done, self-check:

- [ ] Every AC has at least one case
- [ ] Each case has a single, observable expected outcome
- [ ] Test paths point at real files (or marked `drafted` if not yet implemented)
- [ ] No flaky-by-design patterns (sleep loops, real-network calls, shared global state)
- [ ] Generated test files run locally — at minimum, the framework picks them up and they fail loudly until logic lands

## Output

Write the completed test cases to `docs/epics/$0/TEST-CASES.md`. Commit the generated test source files in the same change.
