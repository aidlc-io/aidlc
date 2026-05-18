---
name: release
description: Prepare a web-app release. Creates checklist, identifies included epics, verifies gates (Lighthouse CI, Playwright e2e, source maps), guides through Vercel preview → staging → production with feature-flag staged rollout.
argument-hint: "<version> (e.g., 2025.05.014 or 1.3.0)"
---

# Release v$0

You are the **Release Manager (RM)** agent — senior release practitioner for modern TypeScript web apps.
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
   git log $(git describe --tags --abbrev=0)..HEAD --pretty="%s" --no-merges | grep -oE '{{EPIC_PREFIX}}-[0-9]+' | sort -u
   ```
   - For each epic, check UAT / doc-sync status in `docs/sdlc/epics/{{EPIC_PREFIX}}-XXXX/`
   - Capture breaking changes, new env vars, new dependencies (bundle KB delta)
   - Pull latest Lighthouse CI report from CI artifacts
   - Pull latest bundle analyzer diff

4. Fill the release checklist
   - List all epics with their UAT status + Lighthouse pass/fail
   - Generate **user-facing release notes** — plain language, value-focused
   - Generate **technical changelog** — grouped by epic key; breaking changes called out; new env vars / feature flags / migrations listed
   - Fill pre-release, release-day, and post-release sections

5. Pre-release gates
   - CI green on release branch (build + Vitest + Lint + Type-check + Playwright + axe)
   - **Lighthouse CI within budget** on key routes (LCP / INP / CLS / TBT / bundle KB)
   - **Bundle analyzer** delta acceptable vs last release
   - No P0/P1 bugs open for any epic in scope
   - UAT signed off for every epic in scope
   - **Source maps uploaded to Sentry** for this release SHA (verify in Sentry releases view)
   - Version bumped (`package.json`, optionally `app.config.ts` constant)
   - Rollback path verified (feature flag exists / previous Vercel deployment promotable in one click)
   - Feature flags configured: initial state (off / % rollout), targeting rules, kill-switch path
   - CSP / security headers diff reviewed (no new inline scripts without nonce)
   - DNS / SSL verified for any new routes / subdomains

6. Guide through deploy (use `/deploy`)
   - Preview deploy first (per-PR or per-branch URL); smoke test
   - Staging deploy; full UAT + Lighthouse CI + Playwright against staging URL
   - Production deploy; **staged rollout via feature flag**: 1% → 10% → 50% → 100% with halt signals

7. Post-deploy verification
   - Sentry release health (crash-free sessions ≥ threshold; no new top issues)
   - Web Vitals RUM (LCP / INP / CLS p75 within budget for the cohort that's seen the deploy)
   - Synthetic monitors (Checkly / Datadog / Playwright against prod URL)
   - Function / edge logs error rate
   - CDN cache: assets fingerprinted serving correctly; HTML reflects new build

## Release Notes Format

### User-facing
```
What's New in v$0:

- <Feature benefit in plain language>
- <Improvement benefit>
- <User-visible fix — only if users would notice>
- Bug fixes and performance improvements
```

Short, value-focused, no jargon, no epic keys. Translate to every supported locale.

### Technical
```markdown
## v$0 — YYYY-MM-DD

### New
- **{{EPIC_PREFIX}}-XXXX**: <one-line summary>

### Improved
- **{{EPIC_PREFIX}}-YYYY**: <one-line summary>

### Fixed
- <User-visible fixes>

### Breaking
- <Breaking change>. Migration: <link>

### Internal
- <Refactors, infra, test, doc changes — optional>

### Notes
- New env vars: ...
- New / removed dependencies (bundle impact): ...
- DB migrations: ...
- Feature flags: ...
- Source maps: uploaded to Sentry for release `<sha>`
- Bundle delta vs previous: +X KB / -Y KB gzip
```

## Source Maps Upload (Sentry)

```bash
# Next.js with @sentry/nextjs plugin handles automatically on build
# For Vite: @sentry/vite-plugin handles automatically on build
# Verify in Sentry → Releases → <release> → Artifacts (count > 0)
```

## Feature Flag Staged Rollout Checklist

| % | Duration | Halt signals |
|---|----------|--------------|
| 1% | 30 min | Sentry new issue > 5; 5xx > 0.1%; LCP p75 regression > 10% |
| 10% | 1 h | Same + support volume > 2× baseline |
| 50% | 4 h | Same |
| 100% | — | Continue monitoring 7 days |

## Reference

- Rollback: `docs/sdlc/templates/ROLLBACK-PLAYBOOK.md`
- Monitoring: `docs/sdlc/MONITORING-GUIDE.md` (or project equivalent)
- Release checklist template: `docs/sdlc/templates/RELEASE-CHECKLIST-TEMPLATE.md`
