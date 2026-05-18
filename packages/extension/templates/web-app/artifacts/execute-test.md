# Test Execution Report — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Tester:** QA
**Environment:** UAT (preview / staging)
**Build URL:** *(Vercel preview / staging URL)*
**Status:** Draft
**Created:** `$DATE`

---

## 1. Execution Summary

| Metric | Value |
|--------|-------|
| Total scenarios | 0 |
| Passed | 0 |
| Failed | 0 |
| Blocked | 0 |
| Skipped | 0 |
| Pass rate | —% |

## 2. Environment

| Item | Value |
|------|-------|
| Build URL | `https://pr-XX-app.vercel.app` |
| Git SHA | `<sha>` |
| Feature flags | `<flag>: on for cohort` |
| Browser | Chrome 125 / Safari 17 / Firefox 126 |
| Viewport | desktop 1280×800 + mobile 375×667 |
| Locale | en-US (RTL spot-check: ar) |
| Network | Fast + Slow 3G (for failure-mode) |
| Test accounts | user@example.com / admin@example.com |

## 3. Scenario Results

| ID | Title | AC | Result | Browser | Notes |
|----|-------|----|--------|---------|-------|
| `$EPIC_ID-S01` | Create project happy path | AC01 | ⬜ Pass / ⬜ Fail | chromium | |
| `$EPIC_ID-S02` | Validation errors on empty form | AC02 | ⬜ Pass / ⬜ Fail | chromium | |
| `$EPIC_ID-S03` | Empty state on `/projects` | AC03 | ⬜ Pass / ⬜ Fail | chromium | |
| `$EPIC_ID-S04` | Offline submit shows toast | NET01 | ⬜ Pass / ⬜ Fail | chromium | DevTools offline |
| `$EPIC_ID-S05` | Slow 3G shows skeleton | NET02 | ⬜ Pass / ⬜ Fail | chromium | DevTools throttle |
| `$EPIC_ID-S06` | Forbidden role sees 403 | SEC02 | ⬜ Pass / ⬜ Fail | chromium | |
| `$EPIC_ID-S07` | Cross-browser smoke | AC01 | ⬜ Pass / ⬜ Fail | webkit + firefox | |

## 4. Accessibility Spot-Check

| Check | Result | Notes |
|-------|--------|-------|
| Keyboard reachability through filter → list → detail | ⬜ | |
| Visible focus ring | ⬜ | |
| Screen reader (VoiceOver) announces button + state | ⬜ | |
| Reduced motion respected | ⬜ | |
| Zoom 200% — no horizontal scroll | ⬜ | |

## 5. Performance Spot-Check

| Route | LCP | INP (TBT proxy) | CLS | Status |
|-------|-----|-----------------|-----|--------|
| `/projects` | — s | — ms | 0.— | ⬜ |
| `/projects/new` | — s | — ms | 0.— | ⬜ |

Lighthouse CI report: *(link)*
Bundle delta vs prior: +X.X KB / -X.X KB gzip

## 6. Bugs Found

| Bug ID | Severity | Title | Scenario | Status |
|--------|----------|-------|----------|--------|
|        | P1/P2/P3 |       |          | Open   |

## 7. Regression Check

| Area | Tested | Status |
|------|--------|--------|
| Sign in / sign out | ⬜ | |
| Navigation across adjacent routes | ⬜ | |
| Locale switcher (en ↔ ar) | ⬜ | |
| Theme switcher (light ↔ dark) | ⬜ | |
| One core flow outside this epic | ⬜ | |

## 8. Browser / Viewport / Locale Coverage

| Browser | Version | Viewport | Locale | Tester | Result |
|---------|---------|----------|--------|--------|--------|
| Chrome  | 125     | 1280×800 | en | | ⬜ |
| Chrome  | 125     | 375×667  | en | | ⬜ |
| Safari  | 17      | 1280×800 | en | | ⬜ |
| Firefox | 126     | 1280×800 | en | | ⬜ |
| Chrome  | 125     | 1280×800 | ar (RTL) | | ⬜ |

## 9. Sign-off

- [ ] All P1 bugs resolved
- [ ] Pass rate ≥ threshold
- [ ] Lighthouse CI within budget
- [ ] axe scans clean on affected routes
- [ ] Regression areas clear
- [ ] QA sign-off granted

**Sign-off by:** *(tester name)*
**Date:** *(date)*
