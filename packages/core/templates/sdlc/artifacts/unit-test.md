# Unit Test Summary — {{EPIC_KEY}}

> Produced by the `unit-test` phase. Records the unit tests added on the
> feature branch and how they map back to the test plan.

## Branch
`feature/{{EPIC_KEY}}-<slug>`

## Tests added
| Test ID | File | What it verifies | Type (happy / error / edge) |
|---------|------|------------------|------------------------------|
| {{EPIC_KEY}}-UT01 | | | |

## Coverage vs TEST-PLAN
- [ ] Every `{{EPIC_KEY}}-UT*` case in `TEST-PLAN.md` has a corresponding test
- [ ] Happy path covered
- [ ] Error / failure paths from acceptance criteria covered
- [ ] Tests are deterministic (no live network, fixed seeds, injected clock)

## Results
- Command run: `<project unit-test command>`
- Result: `<N passed / 0 failed>`

## Whole-project coverage (re-run after implementation)
> Required — coverage is re-run across the entire project once the code is green,
> not just the changed files. The same numbers are recorded in `IMPLEMENT-SUMMARY.md`.
- Coverage command: `<project coverage command>`
- Total coverage: `<N>%` lines / `<N>%` branches
- Meets target (≥ 80%): `<yes / no>`

## Intentionally skipped
- _(list any cases deferred to integration / execute-test, with the reason)_
