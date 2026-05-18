---
name: tech-design
description: Generate or review a Technical Design for a React Native epic. Produces navigation hierarchy, state strategy, API contracts, native module decisions, OTA strategy, performance budget per screen, and file impact.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Tech Design for Epic $0

You are the **Tech Lead (TL)** agent — a staff-level RN engineer.
Load your full persona from `.claude/agents/tech-lead.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `design`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read the epic: `docs/sdlc/epics/$0/$0.md`
2. Read the PRD: `docs/sdlc/epics/$0/PRD.md` (must be complete first)
3. Read the tech design template: `docs/sdlc/epics/$0/TECH-DESIGN.md` or `docs/sdlc/templates/TECH-DESIGN-TEMPLATE.md`
4. Analyze existing codebase:
   - `app.config.ts`, `eas.json`, `package.json`, `tsconfig.json`, `metro.config.js`, `babel.config.js`
   - Root navigator(s), `RootStackParamList`, linking config
   - Existing hooks, services, Zustand slices, query keys
   - `CLAUDE.md`, `docs/architecture.md`, ADRs touching navigation/state/native modules
   - For bare workflow: `ios/`, `android/` — Info.plist, AndroidManifest, Podfile, build.gradle
5. Fill the tech design with the sections below.

## Tech Design Contents

### Summary
- One paragraph: what is being built, technical approach, **OTA-vs-Native** classification for each deliverable.

### Navigation Hierarchy
- Diagram (text/ASCII) of new + modified navigators
- Per new/modified screen: route name, params (typed), deep link path, auth required?, lazy-loaded?
- Updates to `RootStackParamList` (or Expo Router file layout)
- Linking config: universal links (apple-app-site-association), app links (assetlinks.json), custom scheme

Example:
```
RootStack
├── (auth) Group
│   ├── LoginScreen          { redirectTo?: string }
│   └── BiometricEnrollScreen
├── (app) Group (auth-required, lazy)
│   ├── HomeTabs
│   │   ├── FeedScreen
│   │   ├── SearchScreen
│   │   └── ProfileScreen   { userId: string }
│   └── ItemDetailScreen    { itemId: string }
```

### Screen Specs

For each new/modified screen, provide:

```tsx
// src/screens/ItemDetail/ItemDetailScreen.tsx
type Props = NativeStackScreenProps<RootStackParamList, 'ItemDetail'>;

export function ItemDetailScreen({ route }: Props) {
  const { itemId } = route.params;
  const { data, isPending, error } = useQuery({
    queryKey: itemKeys.detail(itemId),
    queryFn: () => api.getItem(itemId),
    staleTime: 30_000,
  });
  // ...
}
```

- States: loading / error / empty / success
- Side effects: analytics events on mount, Sentry breadcrumb
- Accessibility tree (labels, roles)
- Performance budget: TTI < 1.5 s, FlashList FPS ≥ 58

### State Strategy

| Slice | Lives in | Lifetime | Invalidation | Persistence |
|-------|---------|----------|--------------|-------------|
| Authenticated user profile | TanStack Query `['user', 'me']` | App | mutation invalidate | none (refetch) |
| Auth tokens | SecureStore | Until logout | n/a | SecureStore (Keychain/Keystore) |
| Feed | TanStack Query `['feed', filter]` infinite | Screen | refetch on focus | none |
| Theme + locale | Zustand `useUiStore` persisted to MMKV | App | user action | MMKV |
| Draft form (offline) | Zustand `useDraftStore` persisted to MMKV | Until submit | submit | MMKV |
| Pending mutations (offline queue) | TanStack Query mutation cache + MMKV | Until success | network resume | MMKV |

### Server-State Hook Example

```tsx
// src/features/items/queries.ts
export const itemKeys = {
  all: ['items'] as const,
  list: (filter: ItemFilter) => [...itemKeys.all, 'list', filter] as const,
  detail: (id: string) => [...itemKeys.all, 'detail', id] as const,
};

export function useItem(id: string) {
  return useQuery({
    queryKey: itemKeys.detail(id),
    queryFn: ({ signal }) => api.getItem(id, { signal }),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.updateItem,
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: itemKeys.detail(next.id) });
      const prev = qc.getQueryData(itemKeys.detail(next.id));
      qc.setQueryData(itemKeys.detail(next.id), next);
      return { prev };
    },
    onError: (_err, next, ctx) => {
      if (ctx?.prev) qc.setQueryData(itemKeys.detail(next.id), ctx.prev);
    },
    onSettled: (_data, _err, next) => {
      qc.invalidateQueries({ queryKey: itemKeys.detail(next.id) });
    },
  });
}
```

### Reanimated Worklet Example (if animations)

```tsx
const offset = useSharedValue(0);
const animatedStyle = useAnimatedStyle(() => ({
  transform: [{ translateX: offset.value }],
}));

const gesture = Gesture.Pan()
  .onUpdate((e) => {
    'worklet';
    offset.value = e.translationX;
  })
  .onEnd(() => {
    'worklet';
    offset.value = withSpring(0);
    runOnJS(track)('swipe_complete'); // bridge to JS
  });
```

Document worklet boundaries: which values are shareable, which are captured via `runOnJS`.

### API / Interface Contract

For each endpoint touched:
- Method + path
- Request shape (Zod schema reference)
- Response shape (Zod schema reference)
- Error envelope + typed `ApiError` codes
- Auth: header, refresh strategy
- Idempotency for non-read ops

```ts
// src/api/items.ts
const ItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  updatedAt: z.string().datetime(),
});

export async function getItem(id: string, opts?: { signal?: AbortSignal }) {
  const res = await apiClient.get(`/items/${id}`, opts);
  return ItemSchema.parse(res);
}
```

### Native Module Decisions

| Capability | Decision | Rationale |
|------------|----------|-----------|
| Biometric | `expo-local-authentication` | Cross-platform, already in tree |
| Push tokens | `expo-notifications` | Expo path; no custom FCM/APNs glue needed |
| Camera scan | `expo-camera` + `expo-barcode-scanner` | Sufficient for our scan UX |
| Custom Bluetooth peripheral | **TurboModule (codegen)** | No community RN module supports our protocol |
| MMKV | `react-native-mmkv` (community) | Hermes-friendly, sync, encrypted variant |

For each custom native module, link to module spec (TypeScript codegen file) + iOS/Android implementation file paths.

### OTA vs Native Classification

| Change | Type | Why |
|--------|------|-----|
| Add `ItemDetailScreen` | OTA-safe | JS-only, no new permission |
| Add new push category | Native | `Info.plist` + `AndroidManifest.xml` change |
| Add `expo-local-authentication` | Native | New native dep |
| Change auth API base URL (prod) | OTA-safe | Pure JS config; OTA via env |
| Bump `expo.runtimeVersion` | Native | New runtime; OTA channel needs new build |

### Permissions

| Permission | iOS string (`Info.plist`) | Android (`AndroidManifest`) | Trigger | Pre-prompt rationale? |
|------------|---------------------------|------------------------------|---------|------------------------|
| Camera | `NSCameraUsageDescription` | `android.permission.CAMERA` | Scan flow | Yes — explain QR scan |
| Push | n/a (UNUserNotificationCenter) | `POST_NOTIFICATIONS` (Android 13+) | Onboarding step 2 | Yes — explain notifications |

Privacy Manifest entries (iOS) — `PrivacyInfo.xcprivacy`:
- `NSPrivacyAccessedAPITypes` reasons added for new required-reason APIs (UserDefaults, FileTimestamps, SystemBootTime, DiskSpace)

Data safety form (Android) — collected data categories and purposes documented.

### Sequence / Flow

For each top user flow, draw the sequence (text/diagram):
- Cold start → SplashScreen → check auth → route
- Login → SecureStore.setItemAsync(token) → navigate(HomeTabs)
- Offline mutation → queue in MMKV → on AppState 'active' + online → flush
- Push tap (cold start) → `Linking.getInitialURL` → navigator linking config → screen

Include error / retry paths.

### Dependency Wiring

- New providers added at app root (typically in `App.tsx`)
- Where the new hook/service is registered
- Singleton vs scoped (e.g., `QueryClient` is app-singleton)

### Non-Functional Design

- **Performance budget**:
  - Cold start p95 < 2.0 s (mid-tier device — Pixel 6a / iPhone SE 3)
  - TTI new screen < 1.5 s p95
  - FlashList FPS ≥ 58 on 200-item list
  - Bundle delta < 200 KB (gzip) for this epic
- **Reliability**: retry via TanStack Query (3 retries, exp backoff), AppState refetch on `active`, WS reconnect
- **Security**: tokens in SecureStore; deep link payloads zod-validated; HTTPS only; SSL pinning if epic requires
- **Observability**: Sentry breadcrumbs on screen change, `Sentry.setUser` on login, performance trace on critical interaction, analytics events listed
- **Accessibility**: target WCAG 2.1 AA; VoiceOver + TalkBack sweep planned in test plan
- **Internationalization**: locales `en`, `es`, `vi` (or per project); RTL where applicable
- **Compatibility**: iOS 15+, Android 8.0+ (API 26+); `expo.runtimeVersion` impact
- **Offline / resilience**: cached data via TanStack Query persistence; queued mutations via MMKV

### Rollout & Reversibility

- Feature flag: `feature_<name>` via remote config (LaunchDarkly/Statsig/ConfigCat) — OFF by default
- Phased rollout: TestFlight internal → external 100 → external 1000 → public; Play internal → closed → open → production 5% → 25% → 50% → 100%
- Rollback ladder: flag flip → `eas update --republish` → halt Play rollout → expedited App Store review
- Force-update gating only if min binary version bumps

### File / Module Impact

| File | Change | Reason |
|------|--------|--------|
| `src/screens/ItemDetail/ItemDetailScreen.tsx` | Add | New screen |
| `src/features/items/queries.ts` | Add | TanStack Query hooks |
| `src/features/items/api.ts` | Add | API client + Zod schemas |
| `src/navigation/RootStack.tsx` | Modify | Register new screen + linking config |
| `src/navigation/types.ts` | Modify | Extend `RootStackParamList` |
| `app.config.ts` | Modify | New permission strings, new linking scheme |
| `eas.json` | Modify | New env var for production profile |
| `src/i18n/en.json`, `es.json`, `vi.json` | Modify | New strings |

### Risks & Technical Debt

| Risk | Mitigation |
|------|------------|
| Hermes regex incompat in dep X | Pin dep version; fallback to alternative |
| New Architecture migration for legacy native module | Codegen spec or accept legacy interop mode |
| OTA fingerprint mismatch on binary refresh | Lock `runtimeVersion` policy to `appVersion` |
| Store review delay for new permission | Submit early in release window; expedited review ready |
| Bridge cost on heavy animation | Move to Reanimated worklet; profile with Reanimated profiler |

### Open Questions

- Should we use universal links (with apple-app-site-association) or only custom scheme? (Owner: PO)
- Push payload schema — server team confirmed? (Owner: Backend)
- Min iOS version — drop iOS 14? (Owner: PO)

## Architecture Rules (Reaffirm)

1. One source of truth per state slice
2. Tokens in SecureStore — period
3. Native side-effects in module/hook, not component
4. Animations on UI thread (Reanimated worklets)
5. FlashList for any list > 20 items
6. Design changes OTA-safe where possible; native flagged early
7. Suspense / lazy at navigator boundaries

## Output

Write to `docs/sdlc/epics/$0/TECH-DESIGN.md`.
