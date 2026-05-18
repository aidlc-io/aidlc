# Monitor — {{EPIC_ID}}

> Post-release health report. Sequential SDLC phase, not run in the
> parallel workflow.

## Window

Release → +24h / +72h / +7d (pick the relevant cutoff).

## Production signals

| Signal | Baseline | Current | Δ | Notes |
|--------|----------|---------|---|-------|
| Crash rate |  |  |  |  |
| Error logs |  |  |  |  |
| Latency p95 |  |  |  |  |
| Conversion / KPI |  |  |  |  |

## Incidents

- None / list incidents tied to this release with severity + status.

## Customer feedback

- Support tickets:
- App-store reviews:
- Slack reports:

## Decision

- [ ] GO — release is healthy, close epic.
- [ ] HOTFIX — file follow-up issue + roll into the next release.
- [ ] ROLLBACK — coordinate with Release Manager immediately.
