# Release Notes — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Release Manager:** RM
**Version:** `v0.0.0`
**Status:** Draft
**Created:** `$DATE`

---

## 1. Release Overview

| Item | Value |
|------|-------|
| Version tag | `v0.0.0` |
| Branch / SHA | `main @ <sha>` |
| Release date | `$DATE` |
| Platform | iOS / Android / Web |
| Store submission | ⬜ Submitted / ⬜ Pending |

## 2. What's New

> *User-facing summary for the changelog / App Store notes.*

### New Features

- …

### Improvements

- …

### Bug Fixes

- …

## 3. Release Checklist

### Pre-release

- [ ] All epic test cases passed (see TEST-SCRIPT.md)
- [ ] No P1 open bugs
- [ ] Version numbers bumped (package.json, build.gradle, Info.plist)
- [ ] Changelog updated
- [ ] Feature flags enabled for production
- [ ] Dependencies audited (`npm audit`)
- [ ] Build succeeds on CI

### App Store (if applicable)

- [ ] Screenshots updated
- [ ] Release notes written (≤ 4000 chars)
- [ ] Submission created

### Post-release

- [ ] Git tag `v0.0.0` created and pushed
- [ ] Release deployed to production
- [ ] Smoke test on production passed
- [ ] Monitoring alerts acknowledged

## 4. Rollback Plan

1. Revert to previous tag: `git checkout vPREVIOUS`
2. Redeploy: `<deploy command>`
3. Notify stakeholders

## 5. Known Issues / Limitations

- …

## 6. Contributors

> *(Generated from git log)*
