# Implementation Summary — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Developer
**Branch:** `feature/$EPIC_ID-<slug>`
**Status:** Draft
**Created:** `$DATE`
**Change type:** ⬜ OTA-safe (JS-only) &nbsp;&nbsp; ⬜ Native-required (new binary)

---

## 1. Branch & PR

| Item | Value |
|------|-------|
| Branch | `feature/$EPIC_ID-<slug>` |
| PR | *(link once opened)* |
| Base | `main` |

## 2. Files Changed

| File | Type | Description |
|------|------|-------------|
| `src/screens/ItemDetail/ItemDetailScreen.tsx` | Add | New screen |
| `src/features/items/queries.ts` | Add | TanStack Query hooks |
| `src/features/items/api.ts` | Add | API client + Zod schemas |
| `src/navigation/RootStack.tsx` | Modify | Register screen + linking config |
| `src/navigation/types.ts` | Modify | Extend `RootStackParamList` |
| `app.config.ts` | Modify | New permission strings + scheme |
| `eas.json` | Modify | Env var for prod profile |
| `src/i18n/en.json`, `es.json`, `vi.json` | Modify | New strings |
| `__tests__/screens/ItemDetailScreen.test.tsx` | Add | RNTL component test |
| `__tests__/contract/items.contract.test.ts` | Add | MSW contract test |
| `e2e/itemDetail.test.js` (Detox) or `maestro/itemDetail.flow.yaml` | Add | E2E |
| `__tests__/reassure/itemDetail.perf.test.ts` | Add | Reassure baseline |

## 3. Code Snippets (illustrative — real code lives in the files)

### Screen — NativeWind + RNTL-friendly

```tsx
// src/screens/ItemDetail/ItemDetailScreen.tsx
import { ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useItem } from '@/features/items/queries';
import { Skeleton } from '@/ui/Skeleton';
import { ErrorView } from '@/ui/ErrorView';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ItemDetail'>;

export function ItemDetailScreen({ route }: Props) {
  const { itemId } = route.params;
  const { t } = useTranslation('items');
  const { data, isPending, error, refetch } = useItem(itemId);

  if (isPending) return <Skeleton variant="itemDetail" />;
  if (error)     return <ErrorView message={t('item.error.load')} onRetry={refetch} />;
  if (!data)     return <View accessibilityRole="alert"><Text>{t('item.empty')}</Text></View>;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="p-4 gap-4"
      accessibilityLabel={t('item.screen.label')}
    >
      <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
        {data.title}
      </Text>
      <Text className="text-base text-foreground/80">{data.body}</Text>
    </ScrollView>
  );
}
```

### RNTL component test — by accessibility role

```tsx
// __tests__/screens/ItemDetailScreen.test.tsx
import { render, screen } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { ItemDetailScreen } from '@/screens/ItemDetail/ItemDetailScreen';
import { withProviders } from '@/test/withProviders';

describe('ItemDetailScreen', () => {
  it('$EPIC_ID-UI01 renders header with item title on success', async () => {
    server.use(
      http.get('/api/items/abc', () =>
        HttpResponse.json({ id: 'abc', title: 'Item 42', body: 'b', updatedAt: new Date().toISOString() }),
      ),
    );
    render(withProviders(<ItemDetailScreen route={{ params: { itemId: 'abc' } } as any} navigation={{} as any} />));
    expect(await screen.findByRole('header', { name: 'Item 42' })).toBeOnTheScreen();
  });

  it('$EPIC_ID-UI02 announces error via alert role on 500', async () => {
    server.use(http.get('/api/items/abc', () => HttpResponse.error()));
    render(withProviders(<ItemDetailScreen route={{ params: { itemId: 'abc' } } as any} navigation={{} as any} />));
    expect(await screen.findByRole('alert')).toBeOnTheScreen();
  });
});
```

### Detox E2E

```js
// e2e/itemDetail.test.js
describe('$EPIC_ID-E2E01 item detail flow', () => {
  beforeAll(async () => {
    await device.launchApp({ permissions: { notifications: 'YES' } });
  });

  it('opens item detail from feed', async () => {
    await element(by.label('Sign in')).tap();
    await element(by.label('Email')).typeText('qa-existing@example.com');
    await element(by.label('Password')).typeText('pw-qa-existing');
    await element(by.label('Sign in')).tap();
    await waitFor(element(by.id('feed-list'))).toBeVisible().withTimeout(5_000);
    await element(by.id('feed-item-item-42')).tap();
    await expect(element(by.label('Item 42'))).toBeVisible();
  });
});
```

### Maestro alternative

```yaml
# maestro/itemDetail.flow.yaml
appId: com.example.app
---
- launchApp:
    permissions:
      notifications: allow
- tapOn: "Sign in"
- tapOn: "Email"
- inputText: "qa-existing@example.com"
- tapOn: "Password"
- inputText: "pw-qa-existing"
- tapOn: "Sign in"
- assertVisible: "Feed"
- tapOn:
    id: "feed-item-item-42"
- assertVisible: "Item 42"
```

## 4. Implementation Notes

> *Key decisions made during implementation. Reference design doc sections.*

### Deviations from Tech Design

> *List any places where implementation diverged from `TECH-DESIGN.md` and why. If any → flag for `/doc-sync`.*

None.

## 5. OTA-vs-Native Verification

| Change | Classification | Verified by |
|--------|----------------|-------------|
| New JS screen + hook | OTA-safe | No `app.config.ts` native field touched |
| New permission string | Native-required | `Info.plist` diff present; `runtimeVersion` bumped |

## 6. Pre-PR Checklist

- [ ] `npm run lint` clean
- [ ] `npm run typecheck` clean (strict)
- [ ] `npm test` green
- [ ] `npx jest --coverage` ≥ target
- [ ] Detox / Maestro flow green locally on iOS sim + Android emu
- [ ] Reassure perf test green (no regression > threshold)
- [ ] No `console.log` left in production paths
- [ ] No `any` / `as any` on route params or API boundaries
- [ ] Tokens land in SecureStore only (grep verified)
- [ ] FlashList used for any list > 20 items
- [ ] Expo Image used for cached/network images
- [ ] `accessibilityLabel`/`Role`/`State` on interactive elements
- [ ] All `addEventListener` removed in cleanup
- [ ] OTA classification verified (no native fields touched if marked OTA-safe)
- [ ] Source map + Hermes symbol upload step still present in EAS hook config
- [ ] PR title references `$EPIC_ID`
- [ ] Reviewer assigned (TL)

## 7. Known Limitations / Follow-ups

- …
