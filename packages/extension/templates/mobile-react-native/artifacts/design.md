# Technical Design — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Tech Lead
**Status:** Draft
**Created:** `$DATE`
**Stack:** React Native 0.74+, Expo SDK 51+, Hermes, New Architecture
**Min OS:** iOS 15.0, Android 8.0 (API 26)

---

## 1. Overview

> *One-paragraph summary. State the OTA-vs-Native classification of each deliverable.*

## 2. Navigation Hierarchy

```
RootStack
├── (auth) Group
│   ├── LoginScreen          { redirectTo?: string }
│   └── BiometricEnrollScreen
├── (app) Group (auth-required, lazy via React.lazy)
│   ├── HomeTabs
│   │   ├── FeedScreen
│   │   ├── SearchScreen
│   │   └── ProfileScreen   { userId: string }
│   └── ItemDetailScreen    { itemId: string }   ← deep link: /items/:id
```

### 2.1 Linking Config

```ts
const linking = {
  prefixes: ['https://app.example.com', 'myapp://'],
  config: {
    screens: {
      ItemDetail: 'items/:itemId',
      Profile: 'users/:userId',
      Login: 'login',
    },
  },
};
```

Universal links (iOS): `apple-app-site-association` for `app.example.com`.
App links (Android): `assetlinks.json` + `<intent-filter android:autoVerify="true">`.

### 2.2 `RootStackParamList`

```ts
export type RootStackParamList = {
  Login: { redirectTo?: string } | undefined;
  BiometricEnroll: undefined;
  HomeTabs: undefined;
  ItemDetail: { itemId: string };
  Profile: { userId: string };
};
```

## 3. Screen Specs

### 3.1 `ItemDetailScreen`

| Aspect | Value |
|--------|-------|
| Path | `src/screens/ItemDetail/ItemDetailScreen.tsx` |
| Params | `{ itemId: string }` |
| Auth | Required |
| Lazy-loaded | yes (`React.lazy` at navigator boundary) |
| TTI budget | < 1.5 s p95 |
| States | loading / error / empty / success |
| Hooks used | `useItem(itemId)`, `useUpdateItem()` |
| Accessibility | Header role; primary action labelled |

```tsx
// src/screens/ItemDetail/ItemDetailScreen.tsx
type Props = NativeStackScreenProps<RootStackParamList, 'ItemDetail'>;

export function ItemDetailScreen({ route, navigation }: Props) {
  const { itemId } = route.params;
  const { t } = useTranslation('items');
  const { data, isPending, error, refetch } = useItem(itemId);

  if (isPending) return <Skeleton variant="itemDetail" />;
  if (error)     return <ErrorView message={t('item.error.load')} onRetry={refetch} />;
  if (!data)     return <EmptyView message={t('item.empty')} />;

  return (
    <ScrollView accessibilityLabel={t('item.screen.label')}>
      <Text accessibilityRole="header">{data.title}</Text>
      {/* … */}
    </ScrollView>
  );
}
```

## 4. State Strategy

| Slice | Lives in | Lifetime | Invalidation | Persistence |
|-------|----------|----------|--------------|-------------|
| User profile | TanStack Query `['user', 'me']` | App | mutation invalidate | none |
| Auth tokens | **SecureStore** | Until logout | n/a | Keychain / Keystore |
| Feed | TanStack Query `['feed', filter]` (infinite) | Screen | refetch on focus | none |
| Theme + locale | Zustand `useUiStore` persisted to MMKV | App | user action | MMKV |
| Draft form | Zustand `useDraftStore` persisted to MMKV | Until submit | submit | MMKV |
| Offline queue | TanStack Query mutation cache + MMKV mirror | Until success | network resume | MMKV |

## 5. API / Interface Contract

### Endpoint: `GET /api/v1/items/:id`

**Request**: header `Authorization: Bearer <token>`
**Response (200)**:
```ts
const ItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  body: z.string(),
  updatedAt: z.string().datetime(),
});
export type Item = z.infer<typeof ItemSchema>;
```
**Errors**: 401 → refresh once → if still 401, logout. 404 → screen empty state. 5xx → retry up to 3× with exp backoff via TanStack Query.

### TanStack Query hook
```ts
export const itemKeys = {
  all: ['items'] as const,
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
```

## 6. Reanimated Worklet Example (if applicable)

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
  .onEnd((e) => {
    'worklet';
    if (Math.abs(e.translationX) > 120) {
      runOnJS(navigation.goBack)();
    } else {
      offset.value = withSpring(0);
    }
  });
```

Worklet boundary: `offset` is shareable; `navigation` is JS → use `runOnJS`.

## 7. Native Module Decisions

| Capability | Decision | Rationale |
|------------|----------|-----------|
| Biometric | `expo-local-authentication` | Cross-platform, already in tree |
| Push | `expo-notifications` | Manages APNs + FCM under hood |
| Storage (secrets) | `expo-secure-store` | Keychain (iOS) + Keystore (Android) |
| Storage (non-secret) | `react-native-mmkv` | Hermes-friendly, sync |
| Lists | `@shopify/flash-list` | High-perf virtualization |
| Images | `expo-image` | Built-in cache + blurhash |
| Animation | `react-native-reanimated` v3 | UI-thread worklets |
| Custom Bluetooth peripheral | **TurboModule (codegen)** | No community module supports protocol |

For each custom native module: link to codegen spec + iOS/Android implementation paths.

## 8. OTA vs Native Classification

| Change | Type | Reason |
|--------|------|--------|
| Add `ItemDetailScreen` | **OTA-safe** | JS-only, no new permission |
| Add new push category | **Native** | `Info.plist` + `AndroidManifest` change |
| Add `expo-local-authentication` | **Native** | New native dep |
| Bump `expo.runtimeVersion` | **Native** | New runtime; OTA channel needs new build |
| Add `EXPO_PUBLIC_FEATURE_X=true` to prod | **OTA-safe** | Pure JS config; OTA |

## 9. Permissions

| Permission | iOS string | Android | Trigger | Rationale (pre-prompt)? |
|------------|-----------|---------|---------|--------------------------|
| Camera | `NSCameraUsageDescription` | `android.permission.CAMERA` | Scan flow | Yes — QR scan |
| Push | n/a | `POST_NOTIFICATIONS` (API 33+) | Onboarding step 2 | Yes |
| Face ID / Biometric | `NSFaceIDUsageDescription` | `USE_BIOMETRIC` | Enroll screen | Yes |

### Privacy Manifest (iOS)
- `NSPrivacyAccessedAPITypes`: required-reason API entries for UserDefaults, FileTimestamps, SystemBootTime if used (via SDKs we include).

### Data safety form (Android)
- Collected data: account info (email, hashed user id), usage data (analytics), crash logs
- Purpose: account, analytics, app functionality
- Encrypted in transit: yes; user can request deletion: yes

## 10. Flow Diagrams

### Cold start
```
Splash → checkAuth (read SecureStore token) ─┐
                                              ├─ Authenticated  → HomeTabs (lazy)
                                              └─ No / expired   → Login
```

### Push tap (cold start)
```
Notification tap ──► Notifications.getLastNotificationResponseAsync()
                  ──► Linking.getInitialURL() (if data has URL)
                  ──► Navigator linking config routes to target screen
```

### Offline mutation
```
User submits ──► useMutation triggers
              ──► onlineManager.isOnline()?
                   ├─ yes: POST → invalidate query on success
                   └─ no:  store payload in MMKV queue, mark "pending"
                          on AppState 'active' + online → flush queue
```

## 11. Dependency Wiring

```tsx
// App.tsx
export default Sentry.wrap(function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <PersistQueryClientProvider client={queryClient} persistOptions={mmkvPersistOptions}>
          <I18nextProvider i18n={i18n}>
            <ThemeProvider>
              <NavigationContainer linking={linking} ref={navigationRef} onStateChange={trackScreen}>
                <RootStack />
              </NavigationContainer>
            </ThemeProvider>
          </I18nextProvider>
        </PersistQueryClientProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
});
```

## 12. Non-Functional Design

| Concern | Target / Approach |
|---------|-------------------|
| Cold start p95 | < 2.0 s mid-tier device (Pixel 6a / iPhone SE 3) |
| TTI new screen p95 | < 1.5 s |
| FlashList FPS | ≥ 58 on 200-item list, accurate `estimatedItemSize` |
| Bundle delta | < 200 KB gzip |
| Memory | < 250 MB RSS after 5-min session |
| Retry / backoff | TanStack Query 3 retries exponential |
| AppState | Refetch on `active`; WS reconnect; flush offline queue |
| HTTPS | TLS 1.2+; pinning if epic requires |
| Sentry | Breadcrumb on screen change; `setUser` on login; perf trace on critical flow |
| Source maps + Hermes symbols | Uploaded via EAS hook on every build + every `eas update` |
| Accessibility | WCAG 2.1 AA; VoiceOver + TalkBack passes |
| i18n | en, es, vi; RTL via `I18nManager.forceRTL` (requires restart) |

## 13. Rollout & Reversibility

- Feature flag: `flag_<name>` via remote config; default OFF
- Phased: iOS phased release ON; Android 5 → 25 → 50 → 100 staged
- Rollback ladder: flag flip → `eas update --republish` previous group → halt Play → expedited iOS review
- Force-update gating only if min binary version bumps

## 14. File / Module Impact

| File | Change | Reason |
|------|--------|--------|
| `src/screens/ItemDetail/ItemDetailScreen.tsx` | Add | New screen |
| `src/features/items/queries.ts` | Add | TanStack Query hooks + keys |
| `src/features/items/api.ts` | Add | API client + Zod schemas |
| `src/navigation/RootStack.tsx` | Modify | Register screen + linking config |
| `src/navigation/types.ts` | Modify | Extend `RootStackParamList` |
| `app.config.ts` | Modify | New permission strings, new linking entry |
| `eas.json` | Modify | New env for production profile |
| `src/i18n/en.json`, `es.json`, `vi.json` | Modify | New strings |

## 15. Risks & Technical Debt

| Risk | Mitigation |
|------|------------|
| Hermes regex/Intl gap in dep X | Pin version; runtime feature-detect |
| New Architecture migration for legacy module | Codegen spec; or legacy interop mode with rationale |
| OTA fingerprint mismatch on next binary | Lock `runtimeVersion` policy to `appVersion` |
| Store review delay for new permission | Submit early in window; expedited template ready |
| Bridge cost on heavy animation | Move to Reanimated worklet; profile |

## 16. Open Questions

| # | Question | Owner | Status |
|---|----------|-------|--------|
| 1 | Universal vs custom scheme only? | PO | Open |
| 2 | Push payload schema confirmed? | Backend | Open |
