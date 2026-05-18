# Health Report — [Epic Title]

**Epic ID:** `$EPIC_ID`
**SRE:** SRE
**Version:** `v0.0.0`
**Channel:** stable / beta / nightly
**Period:** `$DATE` → `$DATE+7d`
**Status:** Draft
**Created:** `$DATE`
**Platform:** Electron desktop

---

## 1. Executive Summary

> *Go / Pause-rollout / Hotfix / Republish-N-1 recommendation in one paragraph.*

**Decision:** ⬜ Promote staged % ⬜ Hold ⬜ Hotfix required ⬜ Republish N-1

## 2. Key Health Indicators

| KHI | Threshold | Actual | Status |
|-----|-----------|--------|--------|
| Crash-free sessions | ≥ 99.5% | — | ⬜ |
| Crash-free users | ≥ 99% | — | ⬜ |
| Update download / check % | ≥ 90% | — | ⬜ |
| Update install / download % | ≥ 85% | — | ⬜ |
| 7-day adoption | ≥ 70% | — | ⬜ |
| IPC error rate | < 0.5% | — | ⬜ |
| Cold-start → ready-to-show p95 | < 2000 ms | — | ⬜ |

## 3. Per-OS Breakdown

| OS | Arch | Crash-free % | Update install % | Top signature |
|----|------|--------------|------------------|---------------|
| macOS | arm64 | | | |
| macOS | x64 | | | |
| Windows | x64 | | | |
| Linux | x64 | | | |

## 4. Top Crashes / Errors (Sentry)

| Rank | Signature | Process | Affected users | OS distribution | Electron ver | New? |
|------|-----------|---------|---------------|-----------------|--------------|------|
| 1 | | main / renderer / utility | | | | ⬜ |
| 2 | | | | | | ⬜ |

## 5. Native Module Load Failures

| Module | Affected OS | Arch | Count | Likely cause |
|--------|-------------|------|-------|--------------|
|        |             |      |       | (`electron-rebuild` missed? ABI mismatch?) |

## 6. Auto-Update Funnel

| Stage | Count | % of prior |
|-------|-------|-----------|
| `update_check_started` | | — |
| `update_available` | | |
| `update_downloaded` | | |
| `update_installed` | | |

**Stalls observed:**
- (e.g. low download / available → feed reachability? signature verify?)
- (e.g. low install / download → user restart friction?)

## 7. Performance Metrics

| Metric | Baseline | This release | Delta | OS |
|--------|----------|--------------|-------|-----|
| Cold-start p95 | — ms | — ms | — | mac arm64 |
| Renderer FCP p95 | — ms | — ms | — | mac arm64 |
| IPC latency p95 | — ms | — ms | — | mac arm64 |
| Memory after 24h idle | — MB | — MB | — | win x64 |

## 8. User Signal

### Store / GitHub reviews

> *(Summarize new reviews / issues mentioning install, update, crash, or affected feature)*

### Support Tickets

| Ticket | Description | Priority | OS | Status |
|--------|-------------|----------|-----|--------|
| | | | | |

## 9. Analytics Events

| Event | Expected change | Actual change | Status |
|-------|----------------|--------------|--------|
| `feature_used` | +X% | | ⬜ |
| `feature_error` | < 0.5% | | ⬜ |
| `update_installed` | ≥ 85% of downloaded | | ⬜ |

## 10. Incidents

| Incident | Severity | Duration | Root cause | Status |
|----------|----------|----------|------------|--------|
|          |          |          |            |        |

## 11. Recommendations

- …

## 12. Decision Log

| Time (UTC) | Action | Reason |
|------------|--------|--------|
| | Start `stagingPercentage: 5%` | Standard staged rollout |
| | Promote to 25% / hold / republish N-1 | |

## 13. Next Check-in

**Date:** *(date)*
**Trigger for escalation:** crash-free dips below 99.5% on any OS; update install % drops below 80%; > 5 new P1 tickets in 24h
