---
name: release
description: Prepare a React Native release. Creates EAS Build + Submit checklist for App Store + Play, EAS Update plan for OTA-safe JS-only changes, Sentry source-map + Hermes symbolication upload, phased rollout, and store-listing localization.
argument-hint: "<version> (e.g., 1.4.0)"
---

# Release v$0

You are the **Release Manager (RM)** agent — a senior RN release practitioner.
Load your full persona from `.claude/agents/release-manager.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `release`, epic = detect from branch/commits. If no epic key found → skip gate. If gate fails → STOP.

## Steps

1. Create the release checklist:
   ```bash
   make release-checklist VER=$0
   # or copy docs/sdlc/templates/RELEASE-CHECKLIST-TEMPLATE.md to docs/sdlc/releases/v$0-release-checklist.md
   ```

2. Read the created checklist at `docs/sdlc/releases/v$0-release-checklist.md`.

3. Gather release content:
   ```bash
   # Commits since last tag
   git log --oneline $(git describe --tags --abbrev=0)..HEAD --no-merges

   # Epic keys in commits
   git log $(git describe --tags --abbrev=0)..HEAD --pretty="%s" --no-merges | grep -oE '{{EPIC_PREFIX}}-[0-9]+' | sort -u
   ```
   For each epic, verify UAT + doc-sync status; capture native impact, new permissions, new deps, env-var changes.

4. **Classify the release**:
   - **Native** — any of: new native dep, `app.config.ts` native field change (permissions, splash, icon, scheme, intent filters, entitlements), `expo.runtimeVersion` change, min SDK bump
   - **OTA-only** — JS/asset only; previous binary's `runtimeVersion` matches
   - Mixed → ship binary first, OTA layered on after

5. Fill the release checklist:
   - List all epics + UAT status
   - **User-facing release notes** — per locale, plain language, ≤ 4000 chars iOS / ≤ 500 chars Android
   - **Technical changelog** — grouped by epic; tag `[OTA]` or `[Native]`; breaking changes called out
   - Pre-release, release-day, post-release sections

6. Pre-release gates (see below).

7. Execute deploy commands.

## Versioning Bumps

| File | Field | Bump |
|------|-------|------|
| `app.config.ts` | `expo.version` | SemVer (e.g., `1.3.5` → `1.4.0`) |
| `app.config.ts` | `expo.ios.buildNumber` | Monotonic integer / dotted; bump on every iOS binary |
| `app.config.ts` | `expo.android.versionCode` | Monotonic integer; bump on every Android binary |
| `app.config.ts` | `expo.runtimeVersion` | Bump on any native change |
| `package.json` | `version` | Match `expo.version` |
| `CHANGELOG.md` | Top of file | Add `## v$0 — YYYY-MM-DD` section |
| Git | tag | `v$0` annotated tag on `release/v$0` branch |

## EAS profile sanity

Verify `eas.json`:
- `production` profile env points to prod API/secrets (via EAS secrets, not committed)
- `production` distribution: `store`
- `production` channel: `production`
- iOS credentials configured (EAS managed) or Apple ID + ASC API key for fastlane fallback
- Android upload key configured

## Pre-Release Gates

### Universal (every release)
- [ ] EAS Build green on `production` profile for both platforms
- [ ] All P1 Jest + RNTL pass
- [ ] Detox / Maestro flows green on at least one iOS sim + one Android emu
- [ ] TypeScript compile clean
- [ ] ESLint + Prettier clean
- [ ] `expo.version` + `ios.buildNumber` + `android.versionCode` bumped
- [ ] `runtimeVersion` policy verified (locked to `appVersion` or `fingerprint`)
- [ ] Sentry release name set: `MyApp@$0+<buildNumber>`
- [ ] Source map + Hermes symbolication upload step verified in EAS build hooks (`@sentry/react-native/scripts/expo-upload-sourcemaps` or equivalent)

### Native release adds
- [ ] Privacy Manifest (`PrivacyInfo.xcprivacy`) up to date with required-reason APIs
- [ ] Play data safety form reviewed (if data collection changed)
- [ ] ATT prompt copy in App Store Connect (if tracking)
- [ ] iOS: app preview/screenshots updated if UI changed; in-app purchase metadata reviewed
- [ ] Android: app bundle (.aab) generated; Play App Signing enabled; mapping.txt uploaded

### OTA release adds
- [ ] Channel target verified (`staging` first, then `production`)
- [ ] Previous OTA group ID captured for rollback
- [ ] `runtimeVersion` unchanged from currently-installed binary
- [ ] Bundle smoke-tested via `eas update --branch staging` on real device

### Production (every release)
- [ ] UAT signed off for every epic in scope
- [ ] No P0/P1 bugs open
- [ ] Rollback path documented (flag flip → OTA republish → halt Play → expedited iOS review)
- [ ] Phased rollout plan: iOS phased release ON; Android staged % starting at 1% or 5%
- [ ] Feature flags configured for risky JS-only changes (OFF by default)
- [ ] Support team primed; status channel ready
- [ ] Monitoring dashboards bookmarked (Sentry release, Play Vitals, App Store Connect)

## Deploy Commands

### Native binary release
```bash
# Build both platforms
eas build --platform all --profile production --auto-submit

# Or build then submit separately
eas build --platform all --profile production
eas submit --platform ios --latest                              # → App Store Connect
eas submit --platform android --latest --track production --rollout 0.05
```

### OTA release
```bash
# Staging first
eas update --branch staging --message "[v$0] [EPIC-KEY] Brief summary"

# After verification → production
eas update --branch production --message "[v$0] [EPIC-KEY] Brief summary"

# Rollback
eas update --branch production --republish --group <previous-group-id>
```

### Sentry release finalization (if not via auto plugin)
```bash
sentry-cli releases new "MyApp@$0+<buildNumber>"
sentry-cli releases set-commits "MyApp@$0+<buildNumber>" --auto
sentry-cli releases finalize "MyApp@$0+<buildNumber>"
sentry-cli releases deploys "MyApp@$0+<buildNumber>" new -e production
```

## Release Notes Format

### User-facing (per locale)
```
What's New in v$0:

- Brand new Item Detail experience with smoother scrolling
- Sign in with biometrics — Face ID and Touch ID supported
- Faster push notifications open the right screen instantly
- Bug fixes and performance improvements
```
Short, value-focused, no jargon, no epic keys. Translate into every supported locale (en, es, vi, ar, …). Verify iOS ≤ 4000 chars per locale; Android ≤ 500 chars per locale.

### Technical changelog (`docs/sdlc/releases/v$0.md`)
```markdown
## v$0 — YYYY-MM-DD

**Runtime version**: 1.4.0
**iOS build**: 42 (Min iOS 15.0)
**Android versionCode**: 142 (Min API 26)
**Channel**: production
**OTA-only**: no — see Native section

### New
- **[Native] {{EPIC_PREFIX}}-2101**: ItemDetail screen + deep link routing
- **[Native] {{EPIC_PREFIX}}-2105**: Biometric sign in (Face ID / Touch ID / fingerprint)

### Improved
- **[OTA] {{EPIC_PREFIX}}-2110**: Feed FlashList recycling, +25% scroll FPS
- **[OTA] {{EPIC_PREFIX}}-2114**: Push tap deep-link reliability

### Fixed
- **[OTA] {{EPIC_PREFIX}}-2118**: Offline draft recovery on iOS 17.4

### Breaking
- None this release.

### Internal
- Sentry RN upgraded to 6.1.0
- Reanimated 3.10.0 for layout animations

### Notes
- **New permissions**: iOS Face ID usage description added; Android USE_BIOMETRIC; POST_NOTIFICATIONS reaffirmed.
- **New env vars**: `EXPO_PUBLIC_API_BASE_URL` (production-only override available via EAS secret).
- **Feature flags**: `flag_biometric_login` (default OFF; ramp to 100% after 7-day verification).
- **OTA fingerprint**: locked to `appVersion=1.4.0`; OTA updates only apply to binaries with this exact `runtimeVersion`.
```

## Phased Rollout Plan

| Stage | iOS | Android | Trigger to next |
|-------|-----|---------|-----------------|
| 1 | TestFlight internal | Play internal track | Smoke pass on real devices |
| 2 | TestFlight external (100) | Play closed track | 24h crash-free ≥ 99.5%, no top regression |
| 3 | App Store phased release 1d (1%) | Play production 5% | 24h KHIs green |
| 4 | App Store phased release ramp | Play 25% | 24h KHIs green |
| 5 | App Store full release | Play 100% | 7d post-monitor |

## Post-Deploy Verification (first 24h)

- [ ] Sentry: crash-free users ≥ 99.5%; no new top issue
- [ ] Play Vitals: ANR < 0.47%, crash-rate within budget
- [ ] App Store Connect: rating stable; analytics expected
- [ ] EAS Update funnel (if OTA): download ≥ 90% / apply ≥ 85% / activate ≥ 80%
- [ ] Feature flags in expected state
- [ ] Phased rollout % matches plan
- [ ] Source maps + Hermes symbols visible in Sentry release

## Reference

- Rollback: `docs/sdlc/templates/ROLLBACK-PLAYBOOK.md`
- Monitoring: `docs/sdlc/MONITORING-GUIDE.md`
- Release checklist template: `docs/sdlc/templates/RELEASE-CHECKLIST-TEMPLATE.md`
