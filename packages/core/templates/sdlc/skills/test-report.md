---
name: aidlc-test-report
description: Summarize the executed test run into a TEST-REPORT — pass/fail per test case, defects found, coverage vs the test plan, and a go / no-go recommendation. Rides alongside aidlc-execute-test on the execute-test step.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Test Report for Epic $0

You are the **QA Engineer (QA)** agent — a senior test practitioner.
Load your full persona from `.claude/agents/qa.md` before starting.

This skill pairs with `aidlc-execute-test`: once the test script has been run,
you record the results as a structured report.

## Context to read first
1. **Test script / cases**: `docs/epics/$0/artifacts/TEST-SCRIPT.md` and `TEST-CASES.md`
2. **Test plan**: `docs/epics/$0/TEST-PLAN.md` — the coverage targets to report against
3. **PRD**: `docs/epics/$0/PRD.md` — acceptance criteria that must be verified

## Steps
1. For every executed case, record **pass / fail / blocked** with evidence
   (logs, screenshots refs, reproduction steps for failures).
2. Log each **defect** found: severity, affected acceptance criterion, repro steps.
3. Summarize **coverage vs TEST-PLAN** — which planned cases ran, which were skipped (and why).
4. Give a clear **go / no-go** recommendation for the epic.
5. Write the report to `docs/epics/$0/artifacts/TEST-REPORT.md`.

## Report contents
- **Summary**: total cases, passed, failed, blocked; overall verdict.
- **Per-case results table**: id, title, result, notes.
- **Defects**: id, severity, criterion, status.
- **Coverage**: planned vs executed; gaps.
- **Recommendation**: ship / hold, with the blocking items if any.

## Rules
- Report what actually happened — never mark a case passed without evidence.
- Tie every failure back to a PRD acceptance criterion where possible.
- Keep it factual and skimmable; the report drives the go / no-go call.
