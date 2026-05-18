---
name: monitor
description: Post-release monitoring for a React Native app. Analyzes Sentry RN, Crashlytics, EAS Update analytics, Play Vitals, App Store Connect, and store reviews to generate a health report.
argument-hint: "[version] (e.g., v1.4.0, or blank for latest)"
---

# Post-Release Monitor (React Native)

You are the **SRE (Healer)** agent — a senior production engineer.
Load your full persona from `.claude/agents/sre.md` before starting.

## Step 0: Gather Input

Most data lives in external systems (Sentry, Play Console, App Store Connect, EAS Updates) that can't always be pulled automatically. Ask the user to paste screenshots or numbers from any of the following. Wait for their input.

```markdown
## Data Needed for Health Report

Paste screenshots or numbers from any of these — more sources = better report.

### 1. Sentry React Native (required if possible)
   📍 Sentry → Releases → MyApp@$VERSION
   - Crash-free users (24h, 7d) for this release
   - Crash-free sessions (24h, 7d)
   - Top issues (top 5) with event counts + affected users
   - Source map + Hermes symbolication status (✅ symbols present? ❌ raw frames?)
   - Performance: app start cold/warm p50/p95, top slow transactions

### 2. Crashlytics (optional, supplemental for native ANR)
   📍 Firebase Console → Crashlytics → Issues
   - Native crashes (top 5) by users affected
   - ANR rate (Android) — target < 0.47%
   - Per-device-model + per-OS breakdown

### 3. Play Console Vitals (Android, required if applicable)
   📍 Play Console → Quality → Android vitals
   - Crash rate (user-perceived + total)
   - ANR rate
   - Slow startup %, excessive wakeups
   - Per-device-model breakdown
   - Reviews trend

### 4. App Store Connect (iOS, required if applicable)
   📍 App Store Connect → Analytics + App Store → Ratings & Reviews
   - Crashes (per build)
   - Sessions, installs, conversion
   - Rating trend (current + last 7d)
   - New reviews (mentioning current version)

### 5. EAS Update analytics (if OTA shipped)
   📍 EAS dashboard → Updates → branch:production
   - Update group + commit
   - Downloaded / Applied / Activated counts
   - Rollback rate
   - Runtime version distribution

### 6. Analytics (PostHog / Amplitude / Mixpanel / Firebase Analytics)
   - Event volume for key flows (24h / 7d vs previous)
   - Failure-event counts by category
   - Funnel drop-off on core flow
   - Push delivery + open rate

### 7. Support signal (optional)
   - Zendesk / Intercom ticket volume; top complaint themes
   - App Store + Play reviews mentioning bugs/regression
   - Social mentions
```

If the user provides no data, remind them which sources to check and stop — no speculation from zero data.

## Step 1: Read Reference Docs

1. Monitoring guide / SLO doc — thresholds, alert rules, on-call
2. Analytics event catalog — what each event means
3. If a version is specified (`$ARGUMENTS`), focus on that release
4. Recent EAS Build + Update history — correlate incidents to changes
5. Existing dashboards bookmarked

## Step 2: Check Local State

```bash
# Release tags
git tag --sort=-version:refname | head -5

# Recent commits on release branch
git log --oneline -10

# Release checklist existence
ls docs/sdlc/releases/ 2>/dev/null

# EAS recent updates (if EAS CLI authed)
eas update:list --branch production --limit 5 || true
```

## Step 3: Generate Health Report

```markdown
## Health Report — v{version} — {date}

### Data Sources
| Source | Provided | Notes |
|--------|----------|-------|
| Sentry RN | yes/no | {what was provided} |
| Crashlytics | yes/no | {what was provided} |
| Play Vitals | yes/no | {what was provided} |
| App Store Connect | yes/no | {what was provided} |
| EAS Update analytics | yes/no | {what was provided} |
| Analytics | yes/no | {what was provided} |
| Reviews / support | yes/no | {what was provided} |

### Release Context
| Item | Value |
|------|-------|
| Version | v{version} |
| iOS build | {buildNumber} |
| Android versionCode | {versionCode} |
| Runtime version | {runtimeVersion} |
| OTA channel | production |
| Native vs OTA | {classification} |
| Phased rollout % (iOS) | {phase} |
| Phased rollout % (Android) | {percent} |
| Release date | {date} |
| Hours in production | {N}h |

### Key Health Indicators
| KHI | Target | Warn | Crit | Actual | Status | Source |
|-----|--------|------|------|--------|--------|--------|
| Crash-free users (24h) | ≥ 99.5% | < 99.5% | < 98.5% | — | ⬜ | Sentry |
| Crash-free sessions (24h) | ≥ 99.7% | < 99.7% | < 99.0% | — | ⬜ | Sentry |
| ANR rate (Android) | < 0.47% | ≥ 0.47% | ≥ 1.0% | — | ⬜ | Play |
| Cold start p50 (mid-tier) | < 2.0 s | ≥ 2.5 s | ≥ 4.0 s | — | ⬜ | Sentry Perf |
| TTI top screen p95 | < 3.0 s | ≥ 4.0 s | ≥ 6.0 s | — | ⬜ | Sentry Perf |
| OTA apply success | ≥ 95% | < 95% | < 90% | — | ⬜ | EAS |
| Rating (last 7d) | ≥ 4.3 | < 4.3 | < 4.0 | — | ⬜ | Stores |
| Top JS error vs prev | flat/↓ | +20% | +50% | — | ⬜ | Sentry |
| Top native crash vs prev | flat/↓ | +20% | +50% | — | ⬜ | Sentry/Crashlytics |
| Push delivery | ≥ 95% | < 95% | < 90% | — | ⬜ | Provider |

Mark **N/A** where data wasn't provided — don't fabricate.

### Crash-free split by OS / Device class
| OS major | Crash-free users | vs prev release |
|----------|------------------|-----------------|
| iOS 18 | — | — |
| iOS 17 | — | — |
| iOS 16 | — | — |
| iOS 15 (min) | — | — |
| Android 14 | — | — |
| Android 13 | — | — |
| Android 12 | — | — |
| Android 11 (min) | — | — |

### Top Issues
1. {Signature} — P{X} — {events / users} — {OS or device slice} — symbolicated: ✅/❌
2. ...

### EAS Update Funnel (if OTA)
| Stage | Count | % of total | Notes |
|-------|-------|-----------|-------|
| Available | — | 100% | runtime version match |
| Downloaded | — | — | |
| Applied | — | — | |
| Activated | — | — | |
| Reverted | — | — | rollback rate |

### Performance (vs prior release)
| Metric | Prior | Current | Delta |
|--------|-------|---------|-------|
| Cold start p50 | — | — | — |
| Cold start p95 | — | — | — |
| TTI top screen p95 | — | — | — |
| JS-thread frame drops | — | — | — |
| Memory (p90 RSS) | — | — | — |

### Store Reviews (last 24–72h)
- iOS: avg rating {x.x}; {N} new reviews; themes: ...
- Android: avg rating {x.x}; {N} new reviews; themes: ...

### Analytics
- Event volume for {top flow}: {Δ vs prior week}
- Funnel drop-off: {step} {%}
- Push open rate: {%}

### Trend vs. Previous Release
- Crash rate: +X% / -X%
- ANR rate: +X% / -X%
- Cold start p95: +X ms / -X ms
- Support volume: +X tickets / -X
- (Use "unknown" if previous data unavailable)

### Recommendations
- [ ] {Action with epic key if new work needed}

### Decision
- [ ] **GO** — continue rollout (advance phased % per plan)
- [ ] **PAUSE** — halt Play rollout / pause iOS phased release; reason: ___
- [ ] **OTA HOTFIX** — JS-only fix via `eas update`; epic `{{EPIC_PREFIX}}-XXXX`
- [ ] **NATIVE HOTFIX** — new binary + expedited App Store review; epic `{{EPIC_PREFIX}}-XXXX`
- [ ] **ROLLBACK** — `eas update --republish` previous group + halt store rollout; reason: ___
- [ ] **FORCE UPDATE** — remote config gating to require new version; reason: ___
```

## If P0 signal found
- Reference `docs/sdlc/templates/ROLLBACK-PLAYBOOK.md`
- **Mitigation ladder** (fastest first):
  1. Flag flip (seconds)
  2. `eas update --republish` previous OTA group (minutes)
  3. Halt Play Console rollout (minutes)
  4. Pause iOS phased release (minutes via App Store Connect)
  5. Expedited App Store review for fix (hours–days)
  6. Force-update via remote config (minutes for users with current binary)
- Assign Incident Commander, open incident channel, capture timeline

## If P1+ signal found
- Suggest hotfix epic (`make epic KEY={{EPIC_PREFIX}}-XXXX`)
- Classify OTA-vs-native; choose deploy path accordingly

## If crash / stack trace provided
- Verify Sentry has source map + Hermes symbols for the release (otherwise frames are raw bytecode addresses)
- Map stack → source file
- `git blame` for recent changes
- Check if environment-specific (OS, device, locale, runtime version)
- Estimate severity; propose fix approach; open hotfix epic if warranted
