# Review — {{EPIC_ID}}

> Auto-reviewer output validating the implementation diff against the PRD
> and Tech Design. Sequential SDLC phase, not run in the parallel workflow.

## Acceptance criteria check

| AC | Covered by | Result | Notes |
|----|------------|--------|-------|
|  |  | ✅ / ⚠️ / ❌ |  |

## Architecture check

- Followed Tech Design's file impact list? Yes / Partial / No
- New dependencies introduced? Justified?
- Public API changes documented?

## Test coverage

- Unit tests added/updated for new logic?
- Integration tests for cross-module changes?
- UI tests for user-visible changes?

## Risks

- Migrations, feature flags, rollout sequencing.
- Observable behavior changes for existing users.

## Verdict

- [ ] PASS — ready for QA execution
- [ ] REJECT — see comments above; bounce back to Implement
