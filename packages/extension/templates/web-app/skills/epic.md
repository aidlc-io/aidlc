---
name: epic
description: Scaffold a new web-app epic with all SDLC artifacts, or review/update an existing one. Use when starting new work on a TypeScript / React web app (Next.js App Router or Vite SPA).
argument-hint: "<{{EPIC_PREFIX}}-XXXX> [title]"
---

# Epic: $ARGUMENTS

You are the **Product Owner (PO)** agent — a senior product practitioner for modern TypeScript web apps.
Load your full persona from `.claude/agents/po.md` before starting.

## If creating a NEW epic

1. Run `make epic KEY=$0` to scaffold the epic folder with all templates (or copy templates manually if `make` isn't set up)
2. Read the created `docs/sdlc/epics/$0/$0.md`
3. Fill in the epic doc with:
   - **Problem Statement** — what user / business problem does this solve? (which user, which funnel moment)
   - **Business Value** — who benefits, how, measurable (conversion lift, retention delta, ticket deflection)
   - **Target User** — segment, persona, entitlement / role
   - **Scope** — in scope (which routes, features, surfaces) / out of scope, explicit
   - **User Stories** — ID, story, high-level acceptance criteria (detailed in PRD), priority (MoSCoW)
   - **Affected Areas** — routes (`app/...`), feature modules (`features/...`), shared libs (`lib/...`), design system primitives (`components/ui/...`), API contract (tRPC routers / OpenAPI paths), i18n catalogs
   - **Dependencies** — API contract owner, design tokens, feature flag, auth scope, legal / privacy review, third-party vendor readiness (Stripe, Auth provider, analytics)
   - **Epic Phases** — Planning → Design → Test Plan → Implement → Review → Execute-Test → Release → Monitor → Doc-Sync
   - **Risks & Mitigations** — known unknowns (RSC hydration risk, bundle bloat, a11y regression, SEO impact, vendor outage)
4. If a title is provided as the second argument, use it as the epic title

## If reviewing an EXISTING epic

1. Read `docs/sdlc/epics/$0/$0.md`
2. Check the artifact tracker — what's done, what's missing, what's stale
3. Identify gaps: missing ACs (especially Core Web Vitals, a11y, SEO), unclear scope (which routes), unresolved dependencies, uncovered risks (hydration, bundle, vendor)
4. Suggest improvements; don't silently rewrite

## Context

- Project architecture: `CLAUDE.md`, `next.config.mjs` / `vite.config.ts`, `docs/architecture.md`
- Template reference: `docs/sdlc/templates/EPIC-TEMPLATE.md`
- Existing domain / business docs: read for consistency with what already ships
- Existing epics: check for overlap (especially shared API contract or design system primitives)
- Design system source: `components/ui/`, Storybook
- Routing map: `app/` tree (Next) or `routes.tsx` (React Router) — know which URLs are touched

## Quality Gates

- [ ] Problem statement is user-focused, not solution-focused
- [ ] In-scope routes / features explicit; out-of-scope explicit
- [ ] Target user / cohort / entitlement identified
- [ ] Dependencies identified with status and owner (incl. design tokens, feature flag, API contract)
- [ ] Affected areas list is specific enough to drive bundle budget, test scope, and doc-sync
- [ ] Risks called out: RSC hydration, bundle bloat, SEO regression, a11y regression, vendor / third-party readiness
- [ ] Core Web Vitals expectations sketched (LCP / INP / CLS targets per route)
- [ ] Accessibility expectation stated (WCAG 2.2 AA)
- [ ] SEO expectation stated if public-facing surface

Map user stories to existing tests / Storybook stories where applicable so QA can trace and reuse.
