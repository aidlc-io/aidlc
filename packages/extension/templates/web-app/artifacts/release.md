# Release Notes — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Release Manager:** RM
**Version:** `v0.0.0` (SemVer or CalVer `YYYY.MM.NNN`)
**Status:** Draft
**Created:** `$DATE`

---

## 1. Release Overview

| Item | Value |
|------|-------|
| Version tag | `v0.0.0` |
| Branch / SHA | `release/v0.0.0 @ <sha>` |
| Release date | `$DATE` |
| Platform | Web (Vercel / Cloud Run / Cloudflare Pages) |
| Deploy target | Production |
| Source maps uploaded to Sentry | ⬜ Verified |

## 2. What's New (User-facing)

> *Plain language, value-focused. Translate to all supported locales.*

### New Features

- …

### Improvements

- …

### Bug Fixes

- …

## 3. Technical Changelog

### New
- **`$EPIC_ID`**: <one-line summary>

### Improved
- **`$EPIC_ID`**: <one-line summary>

### Fixed
- <User-visible fixes>

### Breaking
- <Breaking change>. Migration: `docs/migrations/v0.0.0.md`

### Internal
- <Refactors, infra, test, doc — optional>

### Notes
- New env vars:
- New / removed dependencies (bundle impact):
- DB migrations:
- Feature flags:
- Bundle delta vs previous: +X KB / -Y KB gzip
- Source maps: uploaded to Sentry for release `<sha>`

## 4. Pre-release Checklist

- [ ] All epic test cases passed (TEST-SCRIPT.md, TEST-PLAN.md)
- [ ] Playwright e2e green (chromium / firefox / webkit)
- [ ] Lighthouse CI within budget on key routes (LCP / INP / CLS / TBT)
- [ ] Bundle analyzer delta within budget
- [ ] axe scans clean on affected routes
- [ ] No P0 / P1 open bugs
- [ ] UAT signed off for every epic in scope
- [ ] Version bumped (`package.json`)
- [ ] Changelog updated (user-facing + technical)
- [ ] Feature flags configured: initial state, targeting, kill-switch
- [ ] CSP / security headers diff reviewed
- [ ] DB migrations applied (expand-contract) where applicable
- [ ] Source maps uploaded to Sentry for this release SHA
- [ ] Build succeeds on CI
- [ ] Preview deploy accessible

## 5. Deploy

### Preview / Per-PR
- [ ] Per-PR preview URL works for the merged commit
- [ ] Smoke test on preview

### Staging
- [ ] Promoted to staging
- [ ] Playwright + Lighthouse against staging URL
- [ ] Synthetic monitors green

### Production (staged rollout via feature flag)

| % | Time | Halt signals | Status |
|---|------|--------------|--------|
| 1% | 30 min | New Sentry issue > 5; 5xx > 0.1%; LCP regression > 10% | ⬜ |
| 10% | 1 h | + support volume > 2× baseline | ⬜ |
| 50% | 4 h | Same | ⬜ |
| 100% | — | Continue monitoring 7 days | ⬜ |

- [ ] Git tag `v0.0.0` created and pushed
- [ ] CDN cache invalidated (if static export)
- [ ] DNS / domain verified for any new routes / subdomains
- [ ] Status page entry (if user-visible)

## 6. Post-deploy Verification

- [ ] Synthetic / smoke tests green
- [ ] Sentry release health: crash-free sessions ≥ threshold
- [ ] Web Vitals RUM within budget (LCP / INP / CLS p75)
- [ ] 5xx rate within threshold
- [ ] Feature flag percentage matches plan
- [ ] No P0 signals in first 30 minutes
- [ ] Support pre-briefed; monitoring dashboards bookmarked

## 7. Rollback Plan

1. **First lever**: feature flag kill-switch — flip in admin UI (`<flag_name>` → off). Propagation < 60s.
2. **Second lever**: promote previous Vercel deployment in one click (`vercel rollback` or dashboard).
3. **Third lever**: redeploy from prior commit SHA `<previous_sha>`.
4. Notify team + status page if user-visible.

## 8. Known Issues / Limitations

- …

## 9. Contributors

> *(Generated from `git log $(git describe --tags --abbrev=0)..HEAD --format='%an' | sort -u`)*

## 10. Localization

| Locale | User-facing notes translated | Reviewer |
|--------|------------------------------|----------|
| en | ⬜ | |
| (others) | ⬜ | |
