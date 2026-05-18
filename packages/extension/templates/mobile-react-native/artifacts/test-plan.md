# Test Plan — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** QA
**Status:** Draft
**Created:** `$DATE`
**Stack:** Jest + @testing-library/react-native + MSW (native) + Detox or Maestro + Reassure

---

## 1. Scope

**In scope:**
- All ACs in `PRD.md`
- iOS + Android parity
- Offline / permission / push / deep link / lifecycle / RTL

**Out of scope:**
- Legacy username login (deprecated)
- Tablet layouts (not supported this release)

## 2. Test Strategy

| Type | Tool | Owner |
|------|------|-------|
| Unit (logic, hooks, zod, mappers, selectors) | Jest + RNTL + `@testing-library/react-hooks` | Dev |
| Contract (HTTP / MSW) | MSW (`msw/native`) | Dev |
| Component / UI | Jest + RNTL (queries by accessibility role/label) | Dev |
| Integration | RNTL with `NavigationContainer` + MSW | Dev |
| E2E | **Detox** (or Maestro — pick one) | QA |
| Performance regression | Reassure | QA |
| Accessibility | RNTL + VoiceOver + TalkBack manual sweep | QA |
| Visual / snapshot | sparingly, only for stable design-system primitives | Dev |
| OTA verification | `eas update --branch staging` on real device | QA + RM |

## 3. Test Cases (by AC)

### `$EPIC_ID-AC01` — Login with email

| ID | Type | Description |
|----|------|-------------|
| `$EPIC_ID-UT01` | Unit | LoginScreen zod schema accepts valid email/password |
| `$EPIC_ID-UT02` | Unit | `useAuth.signIn` stores token in SecureStore, not MMKV |
| `$EPIC_ID-CT01` | Contract | POST `/auth/login` request shape verified via MSW |
| `$EPIC_ID-UI01` | UI | LoginScreen renders error toast on 401 |
| `$EPIC_ID-IT01` | Integration | After login, navigates to HomeTabs |
| `$EPIC_ID-E2E01` | E2E | Detox/Maestro full sign-in flow |
| `$EPIC_ID-NET01` | Network | Offline sign-in shows "no internet" toast |
| `$EPIC_ID-SEC01` | Security | Token in SecureStore (grep), not in any other storage |

### `$EPIC_ID-AC02` — Push tap deep link

| ID | Type | Description |
|----|------|-------------|
| `$EPIC_ID-PUSH01` | Push | Foreground notification → in-app banner |
| `$EPIC_ID-PUSH02` | Push | Background tap (warm) → navigates to deep link |
| `$EPIC_ID-PUSH03` | Push | Cold start from notification → correct screen |
| `$EPIC_ID-DL01` | Deep link | Universal link from email opens target screen |
| `$EPIC_ID-E2E02` | E2E | Maestro flow: cold start from notification (real device) |

(Continue table per AC.)

## 4. Unit Test Coverage Requirements

| Module | Target | Notes |
|--------|--------|-------|
| `src/features/**/queries.ts` | ≥ 90% | hook behavior |
| `src/features/**/api.ts` | ≥ 95% | zod boundary |
| `src/features/**/schemas.ts` | 100% | branches matter |
| `src/screens/**` | ≥ 75% | component tests |
| `src/utils/**` | ≥ 90% | pure logic |
| Global | ≥ 80% lines, ≥ 70% branches | |

## 5. Device / OS Matrix

| Platform | Device | OS | Priority | CI? | Real device only? |
|----------|--------|----|----|-----|-------------------|
| iOS | iPhone SE 3 sim | 15.x | P1 | yes | no |
| iOS | iPhone 14 sim | 17.x | P1 | yes | no |
| iOS | iPhone 15 Pro | 18.x | P2 | no | push / biometric |
| Android | Pixel 4a emu | API 31 / 12 | P1 | yes | no |
| Android | Pixel 6a | API 33 / 13 | P1 | partial | push / POST_NOTIFICATIONS |
| Android | Pixel 8 emu | API 34 / 14 | P2 | yes | no |
| Android | Samsung A53 | API 33 | P2 | no | OEM skin |

## 6. Performance Benchmarks (Reassure + manual)

| Scenario | Metric | Threshold |
|----------|--------|-----------|
| Cold start Pixel 6a | TTI p50 / p95 | < 2.0 s / < 3.5 s |
| Cold start iPhone SE 3 | TTI p50 / p95 | < 2.0 s / < 4.0 s |
| ItemDetail screen | first paint p95 | < 1.5 s |
| Feed FlashList 200 items | scroll FPS | ≥ 58 |
| Memory after 5-min session | RSS | < 250 MB |
| Bundle size | gzip JS delta | < 200 KB |

## 7. Failure-Mode Coverage

| Category | Scenarios |
|----------|-----------|
| Network | Offline, slow (3G), captive portal, disconnect mid-call |
| Lifecycle | Background mid-form, force-kill, upgrade path, low memory |
| Permission | First grant, first deny, previously denied, partial scope (iOS Photos limited) |
| Push | Foreground, warm tap, cold tap, while logged out |
| Deep link | Universal, app link, custom scheme, invalid URL |
| Concurrency | Double-submit guard, optimistic rollback, stale-query cancel |

## 8. Accessibility Sweep

- [ ] VoiceOver (iOS) — all interactive elements announce; focus order correct
- [ ] TalkBack (Android) — same
- [ ] Dynamic Type AX5 (iOS) — no clipped text
- [ ] Font scaling 200% (Android) — no clipping
- [ ] Color contrast WCAG AA (light + dark)
- [ ] Reduced motion respected (Reanimated skips non-essential)

## 9. Security Checks

- [ ] Grep `setItemAsync` / SecureStore usage — tokens land there
- [ ] Grep `mmkv.set` / `AsyncStorage.setItem` — never with token-like keys
- [ ] Deep link payload validated with Zod before action
- [ ] 401 → auto refresh once → logout on failure
- [ ] Sentry PII scrubber configured; verify breadcrumbs scrubbed
- [ ] ProGuard / R8 enabled in Android release config

## 10. OTA Verification

- [ ] Install previous binary X → apply current OTA Y → core flow still works
- [ ] `eas update --branch staging` on dev client → behavior matches build
- [ ] Rollback: `eas update --branch staging --republish --group <prev>` restores

## 11. Regression Checklist

- [ ] Sign in (email + biometric)
- [ ] Sign out
- [ ] Cold start to first screen ≤ 2 s
- [ ] Push tap (cold + warm)
- [ ] Deep link cold + warm (universal/app + custom scheme)
- [ ] Top-level navigation (Tabs + Stack)
- [ ] Theme + locale switch
- [ ] Offline → online sync

## 12. Test Data & Determinism

- Factories under `__tests__/factories/`
- MSW handlers under `__tests__/msw/handlers/`
- `jest.useFakeTimers().setSystemTime('2025-01-01')`
- `jest.mock('expo-secure-store')`, `jest.mock('expo-notifications')`
- No real network, ever
- Detox/Maestro: simulator launched with consistent locale + permission flags

## 13. Sign-off Criteria

- [ ] All P1 test cases pass on all P1 devices
- [ ] Unit coverage ≥ target
- [ ] Reassure baselines committed; no regressions
- [ ] Accessibility sweep clean
- [ ] Security checks pass
- [ ] No P0/P1 open bugs
- [ ] QA sign-off
