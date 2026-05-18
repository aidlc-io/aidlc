---
name: monitor
description: Post-release monitoring check for an Electron desktop app. Analyzes crash-free sessions, auto-update funnel, native module load failures, and per-OS error signatures via electron-log, Sentry electron, and analytics. Generates a health report.
argument-hint: "[version] (e.g., v1.2.0, or blank for latest)"
---

# Post-Release Monitor

You are the **SRE (Healer)** agent — a senior production engineer specialized in Electron.
Load your full persona from `.claude/agents/sre.md` before starting.

## Step 0: Gather Input

Most data lives in external systems. Ask the user to paste screenshots or numbers from any of the following.

```markdown
## Data Needed for Health Report

Paste screenshots or numbers from any of these — more sources = better report.

### 1. Crash / error dashboard (required if possible)
   📍 Sentry electron project (main + renderer)
   - Crash-free **sessions** % for the filtered version
   - Crash-free **users** % for the filtered version
   - Top issue signatures (top 5), each with: affected users count, OS distribution (mac / win / linux), arch (arm64 / x64), Electron version
   - "module did not self-register" / NODE_MODULE_VERSION errors (native module load failures) — counted separately
   - CSP violation reports (if collected)

### 2. Auto-update funnel (recommended)
   📍 Analytics (Amplitude / Mixpanel / PostHog) or custom backend
   - `update_check_started` count
   - `update_available` count
   - `update_downloaded` count
   - `update_installed` count (i.e. user restarted into the new version)
   - Funnel %: downloaded / check, installed / downloaded
   - 7-day adoption %: users on this version / total active

### 3. App metrics (recommended)
   📍 Analytics + electron-log aggregator (if you ship one)
   - DAU / WAU / MAU
   - Cold-start time p50 / p95 (from `app.whenReady()` to `ready-to-show`)
   - Memory after 1h / 24h sessions
   - IPC error rate (% of `ipcMain.handle` calls that throw)

### 4. User signal (optional)
   📍 Support tool (Zendesk / Intercom / GitHub Issues)
   📍 Store reviews (Mac App Store / MS Store / Snapcraft) if applicable
   - Recent ticket volume; top complaint themes (installer issues, update stuck, can't launch)
   - Rating trend per store

### 5. Synthetic / install smoke (optional)
   - Did a fresh-install + auto-update smoke run on each OS post-release?
   - Latest synthetic result per OS
```

If the user provides no data, list which sources to check and stop — no speculation from zero data.

## Step 1: Read Reference Docs

1. Monitoring guide / runbook — SLO thresholds (crash-free %, update funnel %), alert rules
2. Analytics event catalog — what each `update_*` and `crash_*` event means
3. If a version is specified (`$ARGUMENTS`), focus the report on that release
4. Recent deploy history — correlate signatures to release SHAs

## Step 2: Check Local State

```bash
git tag --sort=-version:refname | head -5
git log --oneline -10
ls docs/sdlc/releases/ 2>/dev/null
```

## Step 3: Generate Health Report

```markdown
## Health Report — v{version} — {date}

### Data Sources
| Source | Provided | Notes |
|--------|----------|-------|
| Sentry electron | yes/no | {what was provided} |
| Update funnel | yes/no | {what was provided} |
| App metrics | yes/no | {what was provided} |
| User signal | yes/no | {what was provided} |

### Key Indicators
| Metric | Status | Value | Threshold | Source |
|--------|--------|-------|-----------|--------|
| Crash-free sessions | ok/warn/crit | XX.X% | ≥ 99.5% | Sentry |
| Crash-free users | ok/warn/crit | XX.X% | ≥ 99% | Sentry |
| Update download / check | ok/warn/crit | XX% | ≥ 90% | analytics |
| Update install / download | ok/warn/crit | XX% | ≥ 85% | analytics |
| 7-day adoption | ok/warn/crit | XX% | ≥ 70% | analytics |
| IPC error rate | ok/warn/crit | X.XX% | < 0.5% | analytics |
| Cold-start p95 | ok/warn/crit | XXX ms | < 2000 ms | metrics |
| Top error volume | ok/warn/crit | N | n/a | Sentry |

Mark **N/A** where data wasn't provided — don't fabricate.

### Per-OS Breakdown
| OS | Arch | Crash-free % | Update install rate | Top signature |
|----|------|--------------|---------------------|----------------|
| macOS | arm64 | | | |
| macOS | x64 | | | |
| Windows | x64 | | | |
| Linux | x64 | | | |

### Local State
| Item | Value |
|------|-------|
| Version | vX.Y.Z |
| Build / commit | <sha> |
| Branch | <branch> |
| Git tag | vX.Y.Z or "not tagged" |
| Release checklist | exists / missing |
| Update channel | stable / beta / nightly |
| `stagingPercentage` | X% |
| Deploy time | <when> |

### Top Issues
1. [Signature] — P{X} — {N affected} — OS {dist} — Electron {version} — likely cause: [one line]
2. ...

### Native Module Load Failures
| Module | Affected OS | Count | Likely cause |
|--------|-------------|-------|--------------|
| | | | |

(If non-zero: check `electron-rebuild` ran in CI for the affected OS/arch.)

### Auto-Update Funnel
| Stage | Count | % of prior |
|-------|-------|------------|
| update_check_started | N | — |
| update_available | N | XX% |
| update_downloaded | N | XX% |
| update_installed | N | XX% |

(Look for stalls: low download % suggests feed reachability or signature failure; low install % suggests user restart friction.)

### Trend vs. Previous Release
- Crash-free sessions: +/− X.X% (per OS)
- Update install rate: +/− X%
- IPC error rate: +/− X.XX%
- Support volume: +/− X tickets
- (Use "unknown" if previous data not available.)

### Recommendations
- [ ] {Action with epic key if new work needed}

### Decision
- [ ] Continue rollout — promote `stagingPercentage` to next step
- [ ] Pause rollout — hold `stagingPercentage`. Reason: ___
- [ ] Roll back — republish N-1 to `latest.yml`. Reason: ___
- [ ] Hotfix — open epic `{{EPIC_PREFIX}}-XXXX`
```

## If P0 signal found
- Reference `docs/sdlc/templates/ROLLBACK-PLAYBOOK.md`
- Mitigation order: (1) lower `stagingPercentage` to 0 → no more users get this build; (2) republish N-1 over `latest.yml` → users who haven't updated get N-1; (3) feature-flag kill-switch for the offending code path; (4) cut a hotfix
- Assign Incident Commander, open incident channel, capture timeline

## If P1+ signal found
- Suggest creating a hotfix epic (`make epic KEY={{EPIC_PREFIX}}-XXXX`)
- Classify via severity matrix

## If crash / stack trace provided
- Source-map the stack via the Sentry release artifact map
- Identify process: main / renderer / utility
- Identify the OS / arch / Electron version distribution
- Check git blame for recent changes in the affected area
- Estimate severity (P0–P3)
- Propose fix approach; open hotfix epic if severity warrants

## Hotfix Path Reminder

`--enable-logging --v=1` flag can be requested from affected users to surface main-process log details that aren't normally captured. Combine with `electron-log` user-side logs for triage.
