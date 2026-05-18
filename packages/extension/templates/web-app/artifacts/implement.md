# Implementation Summary — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Developer
**Branch:** `feature/$EPIC_ID-<slug>`
**Status:** Draft
**Created:** `$DATE`

---

## 1. Branch & PR

| Item | Value |
|------|-------|
| Branch | `feature/$EPIC_ID-<slug>` |
| PR | *(link once opened)* |
| Base | `main` |
| Preview URL | *(Vercel preview deploy)* |

## 2. Files Changed

| File | Type | Description |
|------|------|-------------|
| `app/(dashboard)/projects/page.tsx` | Add | RSC list view |
| `features/projects/actions.ts` | Add | Server Actions |
| `features/projects/queries.ts` | Add | TanStack Query hooks |
| `features/projects/schemas.ts` | Add | Zod schemas |
| `features/projects/components/new-project-form.client.tsx` | Add | Client form |
| `server/api/routers/projects.ts` | Add | tRPC router |
| `messages/en.json` | Modify | New keys |

## 3. Implementation Notes

> *Key decisions during implementation. Reference design doc sections where relevant.*

### Example snippets

**Server Action with Zod**

```ts
'use server';
import { z } from 'zod';
import { revalidateTag } from 'next/cache';

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(80),
  slug: z.string().regex(/^[a-z0-9-]+$/),
});

export async function createProjectAction(formData: FormData) {
  const parsed = CreateProjectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false as const, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const project = await db.project.create({ data: parsed.data });
  revalidateTag('projects');
  return { ok: true as const, data: project };
}
```

**TanStack Query hook with `queryKeys` factory**

```ts
import { useInfiniteQuery } from '@tanstack/react-query';

export const projectKeys = {
  all: ['projects'] as const,
  list: (tenantId: string) => [...projectKeys.all, 'list', tenantId] as const,
};

export function useProjectsList(tenantId: string) {
  return useInfiniteQuery({
    queryKey: projectKeys.list(tenantId),
    queryFn: ({ pageParam }) => trpc.projects.list.query({ tenantId, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
  });
}
```

**shadcn-flavored form (Client Component)**

```tsx
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, Label, FormField, FormItem, FormMessage } from '@/components/ui';

export function NewProjectForm({ action }: { action: typeof createProjectAction }) {
  const form = useForm({ resolver: zodResolver(CreateProjectSchema) });
  return (
    <form action={action}>
      <FormField name="name" control={form.control} render={({ field }) => (
        <FormItem>
          <Label htmlFor="name">Project name</Label>
          <Input id="name" {...field} aria-describedby="name-error" />
          <FormMessage id="name-error" />
        </FormItem>
      )} />
      <Button type="submit">Create</Button>
    </form>
  );
}
```

**Vitest + RTL + MSW test**

```ts
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '@/test/msw/server';
import { http, HttpResponse } from 'msw';
import { NewProjectForm } from './new-project-form.client';

test('$EPIC_ID-CMP01 — submits happy path', async () => {
  server.use(http.post('/api/projects', () => HttpResponse.json({ ok: true, data: { id: '1' } })));
  const user = userEvent.setup();
  render(<NewProjectForm action={mockAction} />);
  await user.type(screen.getByRole('textbox', { name: /project name/i }), 'Acme');
  await user.click(screen.getByRole('button', { name: /create/i }));
  expect(await screen.findByText(/created/i)).toBeInTheDocument();
});
```

### Deviations from Tech Design

> *List any places where implementation diverged from `TECH-DESIGN.md` and why.*

None.

## 4. Unit / Component Tests Written

| Test file | Test IDs covered | Coverage target |
|-----------|------------------|-----------------|
| `features/projects/schemas.test.ts` | UT01–UT04 | 100% |
| `features/projects/components/new-project-form.test.tsx` | CMP01–CMP02 | ≥ 80% |
| `features/projects/queries.test.ts` | UT04 | 100% |

## 5. Storybook Stories Added

| Story | State |
|-------|-------|
| `NewProjectForm/Default` | empty |
| `NewProjectForm/WithErrors` | invalid input |
| `NewProjectForm/Submitting` | pending |
| `ProjectList/Empty` | no items |
| `ProjectList/Loading` | skeleton |
| `ProjectList/Populated` | list |

## 6. Pre-PR Checklist

- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes (strict mode)
- [ ] `pnpm test` (Vitest) passes
- [ ] `pnpm test:e2e` (Playwright chromium) passes
- [ ] `pnpm build` succeeds
- [ ] Bundle delta within budget (`@next/bundle-analyzer`)
- [ ] No new `console.*` calls in production paths
- [ ] No `useEffect` for data fetching
- [ ] All untrusted input parsed with Zod
- [ ] `AbortController` on every fetch in `useEffect`
- [ ] `next/image` for new images with explicit dimensions
- [ ] `next/font` for new fonts
- [ ] axe assertions added on changed routes / components
- [ ] PR body references epic key `$EPIC_ID`
- [ ] Reviewer assigned
- [ ] Preview deploy URL added to PR description

## 7. Known Limitations / Follow-ups

- …
