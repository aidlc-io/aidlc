# PRD — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Product Owner
**Status:** Draft
**Created:** `$DATE`
**Platform:** Electron desktop (macOS / Windows / Linux)

---

## 1. Problem Statement

> *Describe the user or business problem this epic solves. Why does it exist? Who is the user (power user / admin / casual / enterprise)?*

## 2. Goals

- [ ] Goal 1
- [ ] Goal 2
- [ ] Goal 3

## 3. Non-Goals

- Out of scope: …
- Will not address: …
- Out of scope per OS (if any): …

## 4. User Stories

| As a… | I want to… | So that… |
|--------|------------|----------|
| user   |            |          |

## 5. Functional Requirements

### FR-01: [Feature name]

**Description:** …
**OS scope:** all / macOS / Windows / Linux
**Acceptance Criteria:**
- [ ] AC-01: Given … When … Then …
- [ ] AC-02: Given … When … Then …

**Per-OS variations (if any):**
- macOS: …
- Windows: …
- Linux: …

### FR-02: [Feature name]

**Description:** …
**Acceptance Criteria:**
- [ ] AC-01: …

## 6. Process Impact

| Process | Affected? | Notes |
|---------|-----------|-------|
| main    | ⬜ | IPC handlers, native modules, lifecycle |
| preload | ⬜ | new `contextBridge` methods |
| renderer | ⬜ | UI surfaces, stores |
| common  | ⬜ | shared types, IPC channels, zod schemas |
| build   | ⬜ | electron-builder, entitlements, native rebuild |

## 7. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Crash-free sessions | ≥ 99.5% on stable channel |
| Cold-start to ready-to-show | < 2 s on baseline hardware |
| Memory after 24h idle | < 500 MB |
| Auto-update install rate | ≥ 85% within 7 days |
| IPC latency p95 | < 50 ms |
| Accessibility | WCAG 2.1 AA, full keyboard nav, NVDA/VoiceOver compatible |
| Security | contextIsolation true, sandbox true, nodeIntegration false; all IPC validated |
| Compatibility | macOS 13+, Windows 10+, Ubuntu 22.04+; Electron 30+ |
| Bundle size delta | < +10 MB per OS |

## 8. Design & References

- Figma: *(link)*
- Issue tracker: *(ticket)*
- Related docs: *(links)*

## 9. Metrics / Success Criteria

| Metric | Baseline | Target |
|--------|----------|--------|
| Feature engagement (DAU using feature) | — | — |
| Crash-free sessions | — | ≥ 99.5% |
| Auto-update install rate | — | ≥ 85% in 7d |
| Support tickets in affected area | — | no increase |

## 10. Analytics Events

| Event | When fired | Properties |
|-------|-----------|-----------|
| `feature_used` | main IPC handler success | `{ os, arch, version }` |
| `feature_error` | main IPC handler failure | `{ os, code, message }` |

## 11. Rollout Plan

- **Channel:** stable / beta / nightly
- **Staged rollout:** start at X% via `stagingPercentage`, ramp to 100% over N days
- **Feature flag:** name + default value
- **Kill switch:** describe how risky paths can be disabled remotely
- **Rollback path:** republish N-1 to `latest.yml` if regression detected

## 12. Open Questions

- [ ] Q1: …
- [ ] Q2: …

## 13. Revision History

| Date | Author | Change |
|------|--------|--------|
|      |        | Initial draft |
