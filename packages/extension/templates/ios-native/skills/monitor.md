---
name: monitor
description: Post-release monitoring check for iOS native. Analyzes MetricKit, crash reporter (Sentry / Crashlytics), App Store Connect analytics, and recent reviews to generate a health report.
argument-hint: "[version] (e.g., v1.2.0, or blank for latest)"
---

# Post-Release Monitor

You are the **SRE (Healer)** agent — a senior iOS production engineer.
Load your full persona from `.claude/agents/sre.md` before starting.

## Step 0: Gather Input

Most data lives in external systems (Sentry, App Store Connect, Firebase, Datadog) that can't always be pulled automatically. Ask the user to paste screenshots or numbers from any of the following. Wait for their input.

```markdown
## Data Needed for Health Report

Paste screenshots or numbers from any of these — more sources = better report.

### 1. Crash reporter (required if possible)
   📍 Sentry / Crashlytics / Bugsnag / Embrace
   Filter to the release version ($ARGUMENTS or latest tag).
   - Crash-free users (%) and crash-free sessions (%) for the release
   - Top 5 crashes (signature, affected users, first seen, regression-from-prev-release flag)
   - Non-fatal error volume vs. previous release

### 2. MetricKit aggregate (required if you ingest MXMetricPayload)
   📍 Your ingestion endpoint / Sentry MetricKit integration / Datadog Mobile RUM
   - App launch p50 / p95 (MXAppLaunchMetric)
   - Hang rate (MXHangDiagnostic count per session)
   - Animation hitch rate (MXAnimationMetric / scrollHitchTimeRatio)
   - Disk write exceptions (MXDiskWriteExceptionDiagnostic)
   - CPU exceptions (MXCPUExceptionDiagnostic)

### 3. App Store Connect Analytics
   📍 https://appstoreconnect.apple.com → Analytics
   - Sessions, active devices, installations (last 24h / 7d)
   - Crashes as reported by the system (cross-reference with your crash reporter)
   - Retention curve for the new build

### 4. App Store Reviews (recommended)
   📍 App Store Connect → Ratings & Reviews
   - Recent rating (last 7 days vs. previous 7)
   - Top themes in new reviews (per locale if multi-language)
   - Any 1-star spikes referencing the new feature

### 5. Backend / API dependency metrics (if applicable)
   📍 Prometheus / Datadog / New Relic
   - Request rate, error rate, latency p95 for endpoints this release calls
   - 401 storm (token expiry handling)
   - Rate-limit hits

### 6. Phased release status
   📍 App Store Connect → App → Version → Phased Release
   - Current % rollout (1% / 2% / 5% / 10% / 20% / 50% / 100%)
   - Days since release
   - Any pause / halt events

### 7. Support signal (optional)
   📍 Zendesk / Intercom / Helpshift
   - Ticket volume change
   - Top complaint themes
```

If the user provides no data, remind them which sources to check and stop — no speculation from zero data.

## Step 1: Read Reference Docs

1. Monitoring guide — crash-free target, hang-rate baseline, launch-time budget
2. Analytics event catalog
3. If a version is specified (`$ARGUMENTS`), focus on that release
4. Recent deploy history — correlate incidents to release window

## Step 2: Check Local State

```bash
# Release tags
git tag --sort=-version:refname | head -5

# Recent commits on release branch
git log --oneline -10

# Release checklist existence
ls docs/sdlc/releases/ 2>/dev/null
```

## Step 3: Generate Health Report

```markdown
## Health Report — v{version} — {date}

### Data Sources
| Source | Provided | Notes |
|--------|----------|-------|
| Crash reporter (Sentry / Crashlytics) | yes/no | {what was provided} |
| MetricKit aggregate | yes/no | {what was provided} |
| App Store Connect Analytics | yes/no | {what was provided} |
| App Store reviews | yes/no | {what was provided} |
| Backend metrics | yes/no | {what was provided} |
| Phased release status | yes/no | {what was provided} |

### Key Health Indicators
| Metric | Status | Value | Threshold | Source |
|--------|--------|-------|-----------|--------|
| Crash-free users | ok/warn/crit | XX.X% | ≥ 99.5% | crash reporter |
| Crash-free sessions | ok/warn/crit | XX.X% | ≥ 99.8% | crash reporter |
| App launch p95 | ok/warn/crit | X.Xs | ≤ 2.0s | MetricKit MXAppLaunchMetric |
| Hang rate (per session) | ok/warn/crit | X.X | ≤ 0.5 | MetricKit MXHangDiagnostic |
| Animation hitch ratio | ok/warn/crit | X.XX% | ≤ 1% | MetricKit MXAnimationMetric |
| Top crash affected users | ok/warn/crit | X% | < 0.3% | crash reporter |
| App Store rating (7d avg) | ok/warn/crit | X.X | ≥ 4.5 | App Store Connect |
| Backend dependency error rate | ok/warn/crit | X.XX% | < 1% | backend metrics |

Mark **N/A** where data wasn't provided — don't fabricate.

### Local State
| Item | Value |
|------|-------|
| Version | v$ARGUMENTS |
| Build number (CFBundleVersion) | <N> |
| Branch | <branch> |
| Git tag | vX.Y.Z or "not tagged" |
| Release checklist | exists / missing |
| App Store submission status | In Review / Pending Developer Release / Phased Release Day X / Released |
| Phased rollout % | XX% |

### Top Crashes (this release)
| Rank | Signature | Affected users | New? | P-level | Sentry / Crashlytics link |
|------|-----------|---------------|------|---------|---------------------------|
| 1 | `Foo.bar() crash` | 0.8% | yes (regression) | P1 | <link> |
| 2 | ... | | | | |

### MetricKit Regressions (vs. prior release)
| Metric | Prior | Current | Delta | Status |
|--------|-------|---------|-------|--------|
| Launch p95 | X.Xs | X.Xs | +X.Xs / −X.Xs | ok/warn/crit |
| Hang rate | X.X | X.X | | |
| Scroll hitch ratio | X.X% | X.X% | | |

### App Store Reviews (last 7 days)
- Rating trend: X.X → X.X (Δ ±0.X)
- Top theme: <e.g. "App crashes on launch after update">
- Locale-specific issues: <e.g. de-DE reviews mention onboarding text overflow>

### Backend Dependency Health
- Endpoint X: error rate XX%, p95 XX ms, status ok/warn/crit

### Phased Release Decision
- [ ] Continue to next phase (currently XX%)
- [ ] Pause phased rollout — reason: ___
- [ ] Halt + kill-switch — reason: ___
- [ ] Expedited hotfix — open epic `{{EPIC_PREFIX}}-XXXX`

### Recommendations
- [ ] {Action with epic key if new work needed}
- [ ] Update runbook: ...
- [ ] Add MetricKit alert for ...
```

## If P0 signal found

- Flip remote-config kill-switch flag NOW (`<flag_key>`)
- Halt phased rollout in App Store Connect
- Reference `docs/sdlc/templates/ROLLBACK-PLAYBOOK.md`
- Assign Incident Commander, open `#incidents` thread, capture timeline
- Consider expedited hotfix submission (only with strong justification)
- Backend mitigation if available (force-upgrade, feature-off response)

## If P1+ signal found

- Suggest creating a hotfix epic (`make epic KEY={{EPIC_PREFIX}}-XXXX`)
- Halt phased rollout while hotfix is prepared
- Classify via severity matrix in persona

## If crash / stack trace provided

- Symbolicate via dSYM (verify dSYM uploaded to Sentry / Crashlytics)
- Map stack frames to source file:line
- Check `git blame` for recent changes in the affected file
- Check whether the crash is OS-version-specific, device-specific, locale-specific, or cohort-specific (Dynamic Type, Reduce Motion, Low Power Mode)
- Estimate severity (P0/P1/P2/P3)
- Propose fix approach; open hotfix epic if severity warrants
