# Technical Design — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Tech Lead
**Status:** Draft
**Created:** `$DATE`

---

## 1. Overview

> *One-paragraph summary: what is being built, RSC vs client breakdown, Server Action vs tRPC choice, edge vs node runtime.*

## 2. Architecture

```
app/                    ← routes (Server Components by default)
  └─ (group)/
       └─ feature/
            ├─ page.tsx           (RSC)
            ├─ loading.tsx        (Suspense fallback)
            ├─ error.tsx          (Error Boundary)
            └─ _components/
                 └─ X.client.tsx  ("use client")

features/<name>/        ← domain logic
  ├─ actions.ts         (Server Actions — 'use server')
  ├─ queries.ts         (TanStack Query hooks)
  ├─ schemas.ts         (Zod)
  └─ components/

lib/                    ← stack-neutral utilities (leaf)

components/ui/          ← design system primitives (leaf, shadcn / Radix)
```

### 2.1 RSC / Client Boundary

| Route / File | Server / Client | Reason |
|--------------|-----------------|--------|
| `app/projects/page.tsx` | Server | Data fetch + render list |
| `app/projects/_components/filter.client.tsx` | Client | `useState`, keyboard handlers |

### 2.2 New Components

| Component | Type | Responsibility | Layer |
|-----------|------|----------------|-------|
| `ProjectList` | RSC | Render list from server data | `features/projects` |
| `ProjectFilter` | Client | Filter state via `nuqs` | `features/projects` |
| `ProjectCard` | RSC | Render single project | `components/ui` |

## 3. API Contract

### 3.1 tRPC (or OpenAPI) — Procedure / Endpoint

```ts
// server/api/routers/projects.ts
export const projectsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ tenantId: z.string().uuid(), cursor: z.string().nullish() }))
    .query(async ({ ctx, input }) => {
      // returns { projects: Project[]; nextCursor: string | null }
    }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(80), slug: z.string().regex(/^[a-z0-9-]+$/) }))
    .mutation(async ({ ctx, input }) => {
      // returns Project
    }),
});
```

### 3.2 Server Action

```ts
// features/projects/actions.ts
'use server';

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

### 3.3 Route Handler (only if external consumer / webhook)

```ts
// app/api/webhooks/stripe/route.ts
export async function POST(req: Request) {
  const body = await req.text();
  const event = stripe.webhooks.constructEvent(body, sig, secret);
  // ...
  return Response.json({ received: true });
}
```

### 3.4 Error Envelope

| Code | Meaning | UI Treatment |
|------|---------|--------------|
| `UNAUTHORIZED` | Session expired | Redirect to /sign-in |
| `FORBIDDEN` | Wrong role | 403 page |
| `BAD_REQUEST` | Validation failure | Inline field errors |
| `RATE_LIMITED` | Too many requests | Toast + retry-after |
| `INTERNAL` | Server bug | Toast + Sentry capture |

## 4. Data Model

```sql
-- expand-contract migration plan
CREATE TABLE project (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenant(id),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);
CREATE INDEX project_tenant_idx ON project (tenant_id, created_at DESC);
```

## 5. State Management

### Server state (TanStack Query)

```ts
// features/projects/queries.ts
export const projectKeys = {
  all: ['projects'] as const,
  list: (tenantId: string) => [...projectKeys.all, 'list', tenantId] as const,
  detail: (id: string) => [...projectKeys.all, 'detail', id] as const,
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

### Hydration boundary (SSR + TanStack Query)

```tsx
// app/projects/page.tsx (RSC)
const queryClient = new QueryClient();
await queryClient.prefetchInfiniteQuery({ /* same key */ });
return (
  <HydrationBoundary state={dehydrate(queryClient)}>
    <ProjectListClient />
  </HydrationBoundary>
);
```

### Client / URL state

- URL params via `nuqs` for sort/filter
- Local UI state via `useState` (no Zustand needed for this epic)

## 6. Dependency Wiring

| Service / Client | Where instantiated | Lifetime | Notes |
|------------------|--------------------|----------|-------|
| Prisma client | `lib/db.ts` (server-only) | singleton per process | `import 'server-only'` |
| tRPC client (browser) | `lib/trpc.ts` | singleton | inside `'use client'` provider |
| Feature flag SDK | `lib/flags.ts` | singleton | server-evaluated for SSR routes |

## 7. Routing / Navigation Changes

| Route | Change | Runtime | Notes |
|-------|--------|---------|-------|
| `/projects` | New | node | Server-rendered list |
| `/projects/new` | New | node | Server Action form |
| `/projects/[id]` | New | node | Server-rendered detail |

## 8. File Impact List

### Routes (`app/`)
| File | Change | Reason |
|------|--------|--------|
| `app/(dashboard)/projects/page.tsx` | Add | RSC list |
| `app/(dashboard)/projects/new/page.tsx` | Add | RSC + form |
| `app/(dashboard)/projects/[id]/page.tsx` | Add | RSC detail |
| `app/(dashboard)/projects/loading.tsx` | Add | Skeleton |
| `app/(dashboard)/projects/error.tsx` | Add | Error boundary |

### Features (`features/projects/`)
| File | Change | Reason |
|------|--------|--------|
| `features/projects/actions.ts` | Add | Server Actions |
| `features/projects/queries.ts` | Add | TanStack Query hooks |
| `features/projects/schemas.ts` | Add | Zod |
| `features/projects/components/new-project-form.client.tsx` | Add | Client form |

### API contract
| File | Change | Reason |
|------|--------|--------|
| `server/api/routers/projects.ts` | Add | tRPC router |
| `server/api/root.ts` | Modify | Register router |

### Tests
| File | Change | Reason |
|------|--------|--------|
| `features/projects/schemas.test.ts` | Add | Vitest |
| `features/projects/components/new-project-form.test.tsx` | Add | RTL + MSW |
| `e2e/projects.spec.ts` | Add | Playwright |
| `features/projects/components/new-project-form.stories.tsx` | Add | Storybook |

### i18n
| File | Change | Reason |
|------|--------|--------|
| `messages/en.json` | Modify | Add keys |
| `messages/<other>.json` | Modify | Same |

## 9. Non-Functional Design

### Performance budget
- Route bundle: ≤ XX KB gzip
- LCP target: ≤ 2.5 s p75
- INP target: ≤ 200 ms p75
- CLS target: ≤ 0.1

### Security
- Zod validation on Server Action input
- CSP headers unchanged (no inline scripts)
- Cookies HTTP-only + SameSite=Lax

### Observability
- Sentry browser + server (source maps on release)
- `web-vitals` listener → analytics
- Server logs structured (`pino`)
- OpenTelemetry trace via `@vercel/otel`

### Accessibility
- Radix Dialog primitive for "New Project" modal (focus trap, ESC close, focus return)
- Form labels associated with inputs
- Inline field errors with `aria-describedby`
- Visible focus ring (Tailwind `focus-visible:`)

### SEO
- Not public — no metadata changes

### i18n
- All new strings keyed in `messages/<locale>.json`
- ICU plural for "N projects"

## 10. Rollout

- Feature flag: `projects_module` (server-evaluated)
- Targeting: per-tenant; initial whitelist; then % rollout
- Stages: 1% → 10% → 50% → 100%
- Halt signals: Sentry new issue > 5; 5xx > 0.1%; LCP regression > 10%
- Kill switch: flag off (propagates < 60s)

## 11. Migration Plan

> *DB: expand-contract. Step 1: ADD column. Step 2: backfill. Step 3: deploy code reading new shape. Step 4 (next release): drop old column.*

## 12. Open Questions / Risks

| # | Question / Risk | Owner | Status |
|---|-----------------|-------|--------|
| 1 | Bundle delta on `/dashboard` if we lazy-load filter — need analyzer run | TL | Open |
| 2 | RSC + TanStack Query hydration on slow connection — needs Lighthouse mobile run | QA | Open |
