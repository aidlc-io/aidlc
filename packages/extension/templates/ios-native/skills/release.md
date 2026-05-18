---
name: release
description: Prepare an iOS native release. Creates checklist, identifies included epics, verifies gates (Privacy Manifest, App Privacy, signing), drives fastlane / App Store Connect submission.
argument-hint: "<version> (e.g., 1.3.0)"
---

# Release v$0

You are the **Release Manager (RM)** agent — a senior iOS release practitioner.
Load your full persona from `.claude/agents/release-manager.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `release`, epic = detect from branch/commits. If no epic key found → skip gate. If gate fails → STOP.

## Steps

1. Create the release checklist:
   ```bash
   make release-checklist VER=$0
   ```
   (or copy `docs/sdlc/templates/RELEASE-CHECKLIST-TEMPLATE.md` to `docs/sdlc/releases/v$0-release-checklist.md`)

2. Read the created checklist at `docs/sdlc/releases/v$0-release-checklist.md`

3. Gather release content
   ```bash
   # Commits since last tag
   git log --oneline $(git describe --tags --abbrev=0)..HEAD --no-merges

   # Epic keys referenced in commits
   git log $(git describe --tags --abbrev=0)..HEAD --pretty="%s" --no-merges \
     | grep -oE '{{EPIC_PREFIX}}-[0-9]+' | sort -u
   ```
   - For each epic, check UAT / doc-sync status in `docs/sdlc/epics/{{EPIC_PREFIX}}-XXXX/`
   - Capture: breaking changes, new permissions (Info.plist), new required-reason API usage (Privacy Manifest), new third-party SDKs, new remote-config flags, SwiftData/Core Data migrations

4. Bump version numbers
   ```bash
   # Marketing version (CFBundleShortVersionString)
   xcrun agvtool new-marketing-version $0

   # Build number (CFBundleVersion) — monotonic, never reset
   xcrun agvtool next-version -all

   # Or via fastlane
   fastlane run increment_build_number xcodeproj:"App.xcodeproj"
   ```

5. Fill the release checklist
   - List all epics with UAT status
   - Generate **user-facing "What's New"** per supported locale, ≤ 4000 chars
   - Generate **technical changelog** grouped by epic key; breaking changes called out; new flags / migrations / dependencies listed
   - Fill pre-release, release-day, and post-release sections

6. Pre-release gates (see persona for full list)
   - CI green (`fastlane scan` on canonical simulator)
   - No P0/P1 bugs open for any epic in scope
   - UAT signed off for every epic
   - Version bumped (MARKETING_VERSION + CURRENT_PROJECT_VERSION)
   - `PrivacyInfo.xcprivacy` current; matches third-party SDK Privacy Manifests
   - App Privacy Nutrition Label answers in App Store Connect match reality
   - Info.plist purpose strings accurate
   - Screenshots current per device class
   - Rollback path verified: remote-config kill-switch flag(s) configured, backend mitigation endpoint ready
   - Feature flags configured for risky paths
   - dSYM upload step in the release lane (Sentry / Crashlytics)

7. Build & submit (use `/deploy`)
   - **TestFlight Internal first**:
     ```bash
     fastlane match appstore   # ensure signing identity
     fastlane gym --scheme App --configuration Release --export_method app-store
     fastlane pilot upload      # → TestFlight Internal
     ```
   - **TestFlight External** (Beta App Review ~24h first time):
     ```bash
     fastlane pilot distribute --groups "External Testers"
     ```
   - **App Store submission**:
     ```bash
     fastlane deliver --submit_for_review --automatic_release false \
       --phased_release true --release_notes "release_notes.txt"
     ```
   - Monitor App Store Connect for review status

## Release Notes Format

### User-facing ("What's New" — App Store Connect, per locale)
```
v$0:

• <Feature benefit in plain language>
• <Improvement benefit>
• <User-visible fix — only if users would notice>
• Bug fixes and performance improvements
```

Rules:
- Plain language; no jargon, no epic keys, no internal acronyms
- Length ≤ 4000 chars per locale (App Store limit)
- Same structure across every supported locale
- Natural translation — not machine output

### Technical
```markdown
## v$0 — YYYY-MM-DD

### New
- **{{EPIC_PREFIX}}-XXXX**: <one-line summary>

### Improved
- **{{EPIC_PREFIX}}-YYYY**: <one-line summary>

### Fixed
- <User-visible fix>

### Breaking
- <Breaking change>. Migration: <docs/migrations/v$0.md>

### Internal
- <Refactors, infra, test, doc changes>

### iOS platform notes
- New permission (Info.plist): NSCameraUsageDescription — "..."
- New required-reason API (PrivacyInfo.xcprivacy): NSPrivacyAccessedAPICategoryUserDefaults reason ...
- New third-party SDK: <Name> v<x.y.z> — Privacy Manifest bundled
- Remote-config flag(s): <key> (default <value>) — purpose ...
- Persistence migration: SwiftData v1 → v2 lightweight; users upgrade on first launch
- New Universal Link path(s): /<path> — apple-app-site-association updated
- Minimum iOS version: <unchanged | bumped from X to Y>
```

## Reference

- Rollback playbook: `docs/sdlc/templates/ROLLBACK-PLAYBOOK.md` (kill-switch flags, backend mitigation)
- Monitoring guide: `docs/sdlc/MONITORING-GUIDE.md` (MetricKit baselines, Sentry/Crashlytics dashboards)
- Release checklist template: `docs/sdlc/templates/RELEASE-CHECKLIST-TEMPLATE.md`
- fastlane Fastfile: `fastlane/Fastfile`
- Matchfile (signing): `fastlane/Matchfile`
- App Store Connect: https://appstoreconnect.apple.com
