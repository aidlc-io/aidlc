# Release Notes — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Release Manager:** RM
**Version:** `v0.0.0`
**Status:** Draft
**Created:** `$DATE`
**Platform:** Electron desktop (macOS / Windows / Linux)

---

## 1. Release Overview

| Item | Value |
|------|-------|
| Version tag | `v0.0.0` |
| `package.json#version` | `0.0.0` |
| Branch / SHA | `release/v0.0.0 @ <sha>` |
| Release date | `$DATE` |
| Channel | stable / beta / nightly |
| `stagingPercentage` (start) | 5% |
| Publish target | GitHub Releases / S3 / generic |

## 2. Per-OS Artifacts

| OS | Arch | Artifact | Signed | Notarized | Size | Blockmap |
|----|------|----------|--------|-----------|------|----------|
| macOS | arm64 | `MyApp-0.0.0-arm64.dmg` + `.zip` | yes | yes (stapled) | XX MB | yes |
| macOS | x64 | `MyApp-0.0.0-x64.dmg` + `.zip` | yes | yes (stapled) | XX MB | yes |
| Windows | x64 | `MyApp Setup 0.0.0.exe` (NSIS) | yes (timestamped) | n/a | XX MB | yes |
| Linux | x64 | `MyApp-0.0.0.AppImage`, `.deb`, `.rpm` | n/a | n/a | XX MB | zsync |

## 3. Auto-Update Feeds

| Channel | Feed file | URL | Signed |
|---------|-----------|-----|--------|
| mac | `latest-mac.yml` | <url> | yes |
| win | `latest.yml` | <url> | yes |
| linux | `latest-linux.yml` | <url> | GPG-signed |

## 4. What's New (user-facing — embed in `latest*.yml` `releaseNotes`)

```
What's New in v0.0.0:

- <Feature benefit in plain language>
- <Improvement benefit>
- <User-visible fix>
- macOS: <mac-only note if any>
- Windows: <win-only note if any>
- Linux: <linux-only note if any>
- Bug fixes and performance improvements
```

### Translations (if applicable)

| Locale | Status |
|--------|--------|
| en | ⬜ |
| fr | ⬜ |
| ja | ⬜ |

## 5. Technical Changelog (per epic)

### New
- **$EPIC_ID**: <one-line summary>

### Improved
- …

### Fixed
- …

### Breaking
- **IPC**: channel `<old>` removed → use `<new>`. Migration: `docs/migrations/v0.0.0.md`
- **`userData` schema**: bumped to vN+1. Automatic migration on startup. Supported source versions: vN-2, vN-1, vN.

### Internal
- …

### Per-OS notes
- macOS: new entitlement `<entitlement>`, hardened runtime + notarized
- Windows: signed with EV cert, timestamp server `<url>`
- Linux: `latest-linux.yml` GPG-signed; AppImage zsync metadata included

## 6. Release Checklist

### Pre-release

- [ ] All epic UAT passes (see TEST-SCRIPT.md per epic)
- [ ] No P0/P1 open bugs
- [ ] `package.json` version bumped to `0.0.0`
- [ ] Changelog updated
- [ ] CI green on macOS arm64 + x64
- [ ] CI green on Windows x64 (+ arm64 if shipping)
- [ ] CI green on Linux x64
- [ ] Vitest unit + IPC contract suites pass
- [ ] Playwright `_electron` E2E pass against packaged build
- [ ] Feature flags configured for production
- [ ] Dependencies audited (`npm audit`)
- [ ] `electron-rebuild` verified for any native modules

### Build + sign + publish

- [ ] `npm run build` succeeds locally
- [ ] macOS: `npx electron-builder --mac --arm64 --x64 --publish always`
  - [ ] `spctl -a -v dist/mac-arm64/MyApp.app` → accepted
  - [ ] `stapler validate dist/mac-arm64/MyApp.app` → validated
- [ ] Windows: `npx electron-builder --win --x64 --publish always`
  - [ ] `signtool verify /pa /v "dist/MyApp Setup 0.0.0.exe"` → success
- [ ] Linux: `npx electron-builder --linux --x64 --publish always`
  - [ ] `gpg --verify dist/latest-linux.yml.asc dist/latest-linux.yml` → good

### Cert / Notarization

- [ ] mac Developer ID cert: ≥ 90 days remaining
- [ ] Windows code-signing cert: ≥ 90 days remaining
- [ ] mac notarytool submission accepted, ticket stapled
- [ ] Timestamp server reachable for Windows signing

### Auto-update feed

- [ ] `latest.yml`, `latest-mac.yml`, `latest-linux.yml` reachable from publish target
- [ ] Blockmap differential present
- [ ] `releaseNotes` field populated per channel + locale
- [ ] `stagingPercentage` set in `electron-builder.yml` or channel config
- [ ] Rollback verified: N-1 build still downloadable from feed

### Staged Rollout Plan

| Step | Day | `stagingPercentage` | Promotion criteria |
|------|-----|---------------------|--------------------|
| 1 | 0 | 5% | crash-free ≥ 99.5% for 24h |
| 2 | 1 | 25% | crash-free ≥ 99.5% for 24h, update install rate ≥ 80% |
| 3 | 3 | 100% | metrics hold |

### Post-release

- [ ] Git tag `v0.0.0` created and pushed
- [ ] GitHub Release / S3 listing published with assets + release notes
- [ ] Smoke install on each OS from public feed (download → install → launch → update-from-prev)
- [ ] Monitoring dashboards bookmarked (Sentry electron, analytics funnel)
- [ ] Support team briefed; in-app banner / status page updated if needed

## 7. Rollback Plan

1. Lower `stagingPercentage` to **0** on N → no further users get this build
2. Republish N-1 to `latest.yml` / `latest-mac.yml` / `latest-linux.yml`
3. Verify N-1 binary still downloadable; verify signature
4. Notify stakeholders
5. Affected users on N stay on N (Electron auto-update does not silently downgrade); decide whether to ship a hotfix that supersedes N

## 8. Known Issues / Limitations

- …

## 9. Contributors

> *(Generated from git log)*
