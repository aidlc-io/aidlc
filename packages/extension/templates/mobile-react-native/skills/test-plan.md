---
name: test-plan
description: Generate a test plan for a React Native epic. Covers unit (Jest + RNTL), contract (MSW), integration, E2E (Detox or Maestro), performance regression (Reassure), accessibility (VoiceOver + TalkBack), device matrix, and OTA verification.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Test Plan for Epic $0

You are the **QA Engineer (QA)** agent — a senior RN test practitioner.
Load your full persona from `.claude/agents/qa.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `test-plan`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read epic: `docs/sdlc/epics/$0/$0.md`
2. Read PRD: `docs/sdlc/epics/$0/PRD.md` — ACs are inputs
3. Read tech design: `docs/sdlc/epics/$0/TECH-DESIGN.md` — file impact drives unit/integration scope
4. Read existing test patterns: `__tests__/`, `*.test.tsx`, `e2e/`, `maestro/`, `jest.setup.ts`, `detox.config.js`
5. Read template: `docs/sdlc/epics/$0/TEST-PLAN.md` or `docs/sdlc/templates/TEST-PLAN-TEMPLATE.md`
6. Fill with the sections below — pick categories that apply to this epic.

## Test Plan Contents

### Test Scope

Map each AC to test types:

| AC | Test types | Test IDs |
|----|-----------|----------|
| `$0-AC01` Login with email | UT + IT + E2E | `$0-UT01`, `$0-IT01`, `$0-E2E01` |
| `$0-AC02` Push tap deep-links | E2E + PUSH + DL | `$0-E2E02`, `$0-PUSH01`, `$0-DL01` |

**Out of scope** (explicit): legacy `username` field, biometric on iPad (not supported by hardware in scope).

### Device / OS Matrix

| Platform | Device | OS | Priority | CI? | Real device only? |
|----------|--------|----|----|-----|-------------------|
| iOS | iPhone SE (3rd gen) sim | 15.x | P1 | yes | no |
| iOS | iPhone 14 sim | 17.x | P1 | yes | no |
| iOS | iPhone 15 Pro | 18.x | P2 | partial | push, biometric |
| Android | Pixel 4a emu | API 31 / 12 | P1 | yes | no |
| Android | Pixel 6a | API 33 / 13 | P1 | partial | push, POST_NOTIFICATIONS |
| Android | Pixel 8 emu | API 34 / 14 | P2 | yes | no |
| Android | Samsung A53 | API 33 | P2 | no | OEM skin |

Mark CI-runnable vs real-device-required. Push, biometric, camera, Bluetooth → real device.

### Unit Tests — prefix `$0-UT`

- Pure logic: zod schemas, mappers, reducers, hook reducers, selectors
- Hooks: TanStack Query hook behavior (with `QueryClientProvider` test wrapper + MSW), Zustand selectors
- Deterministic: `jest.useFakeTimers()`, MSW for HTTP, mocked `expo-secure-store`, `expo-notifications`
- Boundary: empty list, max length, null token, unicode, RTL string, very-large feed page

Example test ID rows:

| ID | What it covers | Notes |
|----|----------------|-------|
| `$0-UT01` | LoginScreen zod schema rejects empty email | unit |
| `$0-UT02` | `useItem(id)` returns cached data after refetch | hook test with MSW |
| `$0-UT03` | offline queue selector preserves FIFO order | Zustand selector |

### Contract Tests — prefix `$0-CT`

- MSW handlers per endpoint touched
- Verify request shape (method, path, headers, body)
- Verify response shape parses with Zod
- Verify error envelope handling (4xx → user-facing message, 5xx → retry)

```ts
// __tests__/contract/items.contract.test.ts
server.use(
  http.get('/api/items/:id', ({ params }) =>
    HttpResponse.json({ id: params.id, title: 't', updatedAt: new Date().toISOString() }),
  ),
);
```

### Component / UI Tests — prefix `$0-UI`

- Render screen → query by **accessibility role/label**, not testID where avoidable
- Cover states: loading / error / empty / success
- Keyboard interaction (RN: focus, return key, dismiss)
- Press handlers, form submission

```tsx
// __tests__/screens/ItemDetailScreen.test.tsx
it('$0-UI01 renders item title when loaded', async () => {
  render(<ItemDetailScreen route={{ params: { itemId: 'abc' } } as any} />);
  expect(await screen.findByRole('header', { name: 'Item Title' })).toBeOnTheScreen();
});

it('$0-UI02 announces error via accessibilityLabel on 500', async () => {
  server.use(http.get('/api/items/:id', () => HttpResponse.error()));
  render(<ItemDetailScreen route={{ params: { itemId: 'abc' } } as any} />);
  expect(await screen.findByRole('alert')).toBeOnTheScreen();
});
```

### Integration Tests — prefix `$0-IT`

- Multi-hook flows (login → token in SecureStore → authed query)
- Navigation flows in-memory: `createNavigationContainerRef`, render with `NavigationContainer`
- Optimistic mutation rollback on server failure

### E2E Tests — prefix `$0-E2E` (pick **Detox** or **Maestro**)

#### Detox example
```js
// e2e/login.test.js
describe('$0-E2E01 login flow', () => {
  beforeEach(async () => {
    await device.launchApp({ permissions: { notifications: 'YES' } });
  });
  it('logs in and lands on Home', async () => {
    await element(by.label('Email')).typeText('user@example.com');
    await element(by.label('Password')).typeText('pw123456');
    await element(by.label('Sign in')).tap();
    await expect(element(by.id('home-feed'))).toBeVisible();
  });
});
```

#### Maestro example
```yaml
# maestro/login.flow.yaml
appId: com.example.app
---
- launchApp:
    permissions:
      notifications: allow
- tapOn: "Email"
- inputText: "user@example.com"
- tapOn: "Password"
- inputText: "pw123456"
- tapOn: "Sign in"
- assertVisible: "Home"
```

### Failure-Mode Tests

#### Network (`$0-NET`)
- Offline launch — cached data shown, banner displayed
- Disconnect mid-call — `useQuery` shows error, retry button works
- Slow / lossy — Network Link Conditioner profile "3G"; verify no UI freeze
- Captive portal redirect — fetch fails gracefully

#### Lifecycle (`$0-LC`)
- Background mid-form → return → form state preserved (from MMKV draft)
- Force-kill via OS → relaunch cold → resume at last screen (state restoration)
- Upgrade path: install previous binary, upgrade to current, verify migrations

#### Permission (`$0-PM`)
- Notifications: first prompt grant, first prompt deny, previously denied + open Settings deep link
- Camera: same matrix; "limited" iOS Photos access
- Android POST_NOTIFICATIONS (API 33+) — runtime grant required

#### Push (`$0-PUSH`)
- Foreground notification → in-app banner displays
- Background tap (warm) → app navigates to deep link target
- Cold start from notification → `Linking.getInitialURL` path → correct screen
- Notification while logged out → defer link until login

#### Deep links (`$0-DL`)
- Universal link tap from email (iOS) → opens app at correct screen
- App link from browser (Android) → opens app at correct screen
- Custom scheme cold + warm start
- Invalid URL → fallback route (not crash)

#### Concurrency (`$0-CC`)
- Double-submit guarded (button disabled while pending)
- Optimistic update rollback on server reject
- Two stale queries → newer wins (TanStack Query `cancelQueries` behavior)

### Non-Functional Tests

#### Performance (`$0-PF`) — Reassure baselines

| Scenario | Metric | Threshold |
|----------|--------|-----------|
| Cold start (Pixel 6a) | TTI | < 2.0 s p50, < 3.5 s p95 |
| Cold start (iPhone SE 3) | TTI | < 2.0 s p50, < 4.0 s p95 |
| ItemDetail TTI | first paint | < 1.5 s p95 |
| Feed FlashList scroll | FPS | ≥ 58 on 200 items |
| Memory after 5 min session | RSS | < 250 MB |
| Bundle size | gzip JS bundle | delta < 200 KB |

Reassure spec — commit baseline JSON under `__tests__/reassure/` and CI fail on > X% regression.

#### Accessibility (`$0-A11Y`)
- VoiceOver sweep on iOS — all interactive elements announce correctly, focus order correct
- TalkBack sweep on Android — same
- Dynamic Type (iOS) / Font scaling (Android) at max — no clipping
- Color contrast WCAG AA verified in light + dark mode
- Reduced motion respected (Reanimated should skip non-essential animations)

#### Security (`$0-SEC`)
- Token never appears in MMKV or AsyncStorage (grep + runtime assertion in dev build)
- Deep link payload rejects invalid scheme/host
- 401 from API → auto refresh once; failed refresh → logout + clear SecureStore
- No PII in Sentry breadcrumbs (scrubber configured)

#### Localization / RTL (`$0-I18N`)
- Launch with `LANG=ar_AR` → RTL layout applied (after restart)
- Pluralization rules: `t('items', { count: 0 | 1 | 5 })` correct in en, es, vi

#### OTA (`$0-OTA`)
- Install previous production binary (e.g., 1.4.0+42) → apply current OTA → verify behavior matches
- Run `eas update --branch staging` → verify update applies on dev client
- Verify rollback `eas update --branch staging --republish --group <prev>` restores prior behavior

### Regression Checklist
- [ ] Login + logout + biometric unlock
- [ ] Cold start to first screen
- [ ] Push tap (cold + warm)
- [ ] Deep link cold + warm
- [ ] Top-level navigation (Tabs + Stack)
- [ ] Offline → online sync
- [ ] Theme switch + locale switch

### Test Data Strategy
- Factories under `__tests__/factories/` — `makeUser()`, `makeItem(overrides?)`, etc.
- MSW handlers per feature under `__tests__/msw/handlers/`
- No real network, ever
- Fixed clock via `jest.useFakeTimers().setSystemTime(new Date('2025-01-01'))`

### Flaky-Test Policy
- Deterministic: fake timers, MSW, mocked native modules
- Isolated: each test resets MSW handlers + AsyncStorage stub
- Idempotent: no order dependencies
- Quarantine flaky tests; fix or delete — never retry-to-green
- Detox/Maestro flake budget: < 2% per run; > 5% halts CI

## Output

Write to `docs/sdlc/epics/$0/TEST-PLAN.md`.
