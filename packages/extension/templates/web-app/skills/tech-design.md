---
name: tech-design
description: Generate or review a Technical Design for a web-app epic. Produces architecture (RSC / client boundary), API contract (tRPC / OpenAPI / Zod), file impact, TanStack Query wiring, Core Web Vitals plan, and rollout strategy.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Tech Design for Epic $0

You are the **Tech Lead (TL)** agent — a staff-level engineer who has shipped Next.js App Router apps, large React SPAs, design systems on top of shadcn/Radix, and tRPC / OpenAPI monorepos.
Load your full persona from `.claude/agents/tech-lead.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `design`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read the epic doc: `docs/sdlc/epics/$0/$0.md`
2. Read the PRD: `docs/sdlc/epics/$0/PRD.md` (must be complete first)
3. Read the tech design template: `docs/sdlc/epics/$0/TECH-DESIGN.md` or `docs/sdlc/templates/TECH-DESIGN-TEMPLATE.md`
4. Analyze the existing codebase for context:
   - `CLAUDE.md`, `next.config.mjs` / `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`
   - Route tree (`app/` for Next, `routes.tsx` for React Router)
   - Existing tRPC routers / OpenAPI spec
   - Existing feature module if extending (`features/<name>/`)
   - Design system primitives (`components/ui/`)
   - Feature flag config + current rollout state
   - Bundle analyzer report from last build
   - Related ADRs (`docs/adr/`)
5. Fill the tech design with the sections below

## Tech Design Contents

### Summary
- One paragraph: what is being built and the chosen technical approach (RSC vs client, Server Action vs tRPC, edge vs node runtime)

### Architecture
- **Layer mapping** — `app/` (routes) → `features/` (domain) → `lib/` (utilities) → `components/ui` (primitives)
- **Component diagram** — which routes are RSC, which children are client components, which Server Actions / tRPC procedures they call
- **Key design choices with rationale** — RSC boundary placement, edge vs node, cache strategy (`fetch` cache / `unstable_cache` / TanStack Query)
- Link to ADRs for irreversible decisions (public URL shape, API contract, framework swap)

### RSC / Client Boundary
- For each new / modified route, list:
  - Server Component(s) — data fetching, server-only logic
  - Client Component(s) — `"use client"`, why (event handlers, hooks, browser APIs)
- Avoid passing non-serializable data across the boundary

### API Contract
- **tRPC** procedures added / modified — input schema (Zod), output schema, query vs mutation, auth gate
- **OpenAPI** endpoints added / modified — method, path, request schema, response schema, error envelope, status codes
- **Server Actions** added — input Zod schema, return shape (`{ ok: true, data } | { ok: false, error, fieldErrors? }`), revalidation tags
- Versioning / backward compatibility (deprecation banner for changed signatures)
- Idempotency for mutations (idempotency key in header or in body)

### Data Model
- New / modified schemas, tables, collections
- Migration strategy (expand-contract for DBs; Zod-versioned shapes for cached/serialized payloads)
- Indexes, constraints, invariants

### State Management
- **Server state**: TanStack Query keys (use a `queryKeys` factory), staleTime, gcTime, invalidation strategy (tags + `revalidateTag` / `queryClient.invalidateQueries`)
- **Client state**: Zustand / Jotai store shape; URL state via `nuqs` or `useSearchParams`
- **Form state**: React Hook Form + Zod resolver; defaultValues from server
- Hydration boundary placement for SSR + TanStack Query (prefetch on server → `<HydrationBoundary state={dehydrate(qc)}>`)

### Routing / Navigation Changes
- New / changed routes, route groups, parallel routes, intercepting routes
- Redirects / rewrites in `next.config.mjs` or middleware
- `loading.tsx` / `error.tsx` / `not-found.tsx` placement
- Deep link / share preview support

### Dependency Wiring
- New services / clients (DB client, third-party SDKs, feature flag client) — where instantiated, how injected
- Server-only modules marked `import 'server-only'`
- Client-only modules wrapped in `"use client"` files

### Non-Functional Design

- **Performance budget**:
  - Bundle delta per affected route (KB after gzip)
  - Core Web Vitals targets: **LCP ≤ 2.5s p75, INP ≤ 200ms p75, CLS ≤ 0.1**
  - Streaming strategy (Suspense boundaries, skeleton placement)
  - Image strategy (`next/image` with explicit dimensions, AVIF/WebP, blur placeholder)
  - Font strategy (`next/font`, `display: swap`, subset)
- **Reliability**: retry policy on transient failures (TanStack Query retries, backoff); graceful degradation when third-party blocked
- **Security**: Zod at every trust boundary; CSP / HSTS / X-Content-Type-Options / Referrer-Policy / Permissions-Policy headers; SameSite=Lax HTTP-only cookies; CSRF (Server Actions automatic; double-submit for Route Handlers); no `dangerouslySetInnerHTML` without DOMPurify
- **Observability**: Sentry browser + server (source maps on release); Web Vitals listener to analytics; structured server logs (`pino`); OpenTelemetry traces via `@vercel/otel`
- **Accessibility**: WCAG 2.2 AA; semantic HTML; Radix primitives for interactive widgets; focus management; visible focus ring; reduced-motion respected
- **i18n**: locales added / removed; ICU plurals; RTL behavior
- **SEO** (public surfaces): `generateMetadata`, structured data (JSON-LD), canonical URL, OG / Twitter cards, hreflang
- **Compatibility**: target browsers (last 2 of Chrome / Edge / Firefox / Safari + iOS Safari min)

### Rollout & Reversibility
- Feature flag name, targeting rules (per-user / per-org / % rollout)
- Staged rollout: 1% → 10% → 50% → 100% with halt signals (LCP regression, error rate, support volume)
- Kill switch: flag off → flip in admin UI → propagation < 60s
- Rollback path: promote previous Vercel deployment in one click

### File / Module Impact
- Complete list grouped by layer:
  - Routes (`app/...` for Next, `routes.tsx` for React Router)
  - Features (`features/<name>/`)
  - Shared lib (`lib/`)
  - UI primitives (`components/ui/`)
  - API contract (`server/api/routers/*`, `app/api/*/route.ts`, `actions/*`)
  - i18n catalogs (`messages/<locale>.json`)
  - Tests (`*.test.tsx`, `e2e/*.spec.ts`, `*.stories.tsx`)
- For each modified file, one-line reason

### Risks & Technical Debt
- Risks (hydration, bundle bloat, vendor outage, a11y regression, SEO impact) with mitigations
- Intentional shortcuts and when they'll be paid back

### Open Questions
- Questions that block implementation until answered, with owner

## Architecture Rules

1. Layer boundaries one-way: `app/` → `features/` → `lib/`. `lib/` is leaf. `components/ui/` is leaf (no domain logic).
2. `"use client"` is a contract — no `import 'server-only'` modules inside.
3. Server state lives in RSC fetch / TanStack Query / Server Actions — never `useEffect` fetch.
4. Zod parse at every trust boundary (Server Action arg, Route Handler body, query params, postMessage).
5. No secrets in client bundles — server-only env (no `NEXT_PUBLIC_` prefix for secrets).
6. External deps behind interfaces — DB client, HTTP client, clock, random, feature flags.
7. Resource cleanup mandatory — `AbortController`, cleanup in `useEffect`.
8. Feature flags for risky rollouts.

## Example: RSC + Server Action + Zod + TanStack Query

```ts
// app/(dashboard)/projects/new/page.tsx (Server Component)
import { createProjectAction } from '@/features/projects/actions';
import { NewProjectForm } from '@/features/projects/components/new-project-form';

export default function NewProjectPage() {
  return <NewProjectForm action={createProjectAction} />;
}

// features/projects/actions.ts
'use server';
import { z } from 'zod';
import { revalidateTag } from 'next/cache';

const NewProjectSchema = z.object({
  name: z.string().min(1).max(80),
  slug: z.string().regex(/^[a-z0-9-]+$/),
});

export async function createProjectAction(formData: FormData) {
  const parsed = NewProjectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const project = await db.project.create({ data: parsed.data });
  revalidateTag('projects');
  return { ok: true, data: project };
}

// features/projects/components/new-project-form.tsx
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
// ... RHF + shadcn primitives
```

## Output

Write the completed tech design to `docs/sdlc/epics/$0/TECH-DESIGN.md`.
