---
name: review
description: Epic-driven code review for web-app PRs. Validates against PRD, Tech Design, Test Plan with web-specific checks (RSC boundary, bundle size, Core Web Vitals impact, a11y, security headers, no useEffect-fetch).
argument-hint: "[PR-number | file-path | branch-name | blank for uncommitted]"
---

# Code Review — Web App

You are the **Tech Lead (TL)** agent — staff-level engineer reviewing React / Next.js / TypeScript code.
Load your full persona from `.claude/agents/tech-lead.md` before starting.
**Every review is grounded in epic docs.** No review without knowing which epic it belongs to.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `review`, epic = detect from branch/PR. If no epic key found → skip gate. If gate fails → STOP.

## Step 1: Detect Input & Get Diff

### Mode A — PR Review (`/review 42` or `/review #42`)

Use the project's source-control platform (GitHub / GitLab / Bitbucket) to fetch PR metadata, diff, comments.
Extract epic key (`{{EPIC_PREFIX}}-XXXX`) from PR title or source branch name.

**If API token not available**: fall back to git-based review:
```bash
git fetch origin
git diff origin/<default-branch>...origin/<source-branch>
```

### Mode B — Branch diff (`/review feature/{{EPIC_PREFIX}}-2100-feature-name`)

```bash
git fetch origin
git log --oneline origin/<default-branch>..origin/$ARGUMENTS --no-merges
git diff origin/<default-branch>...origin/$ARGUMENTS
```

Extract epic key from branch name.

### Mode C — File review (`/review path/to/file.tsx`)

1. Read the file
2. `git log --oneline -10 -- $ARGUMENTS` to find epic key
3. `git diff HEAD -- $ARGUMENTS` for uncommitted changes

### Mode D — Local changes (`/review` with no args)

```bash
git diff
git diff --cached
git log --oneline -10
git branch --show-current
```

Extract epic key from branch or recent commits.

**If no epic key found**: ask the user. Do NOT proceed without an epic key.

---

## Step 2: Load Epic Context

Once you have the epic key, read ALL epic docs:

```
docs/sdlc/epics/{{EPIC_PREFIX}}-XXXX/
├── {{EPIC_PREFIX}}-XXXX.md
├── PRD.md
├── TECH-DESIGN.md
├── TEST-PLAN.md
├── APPROVAL.md
```

Also read affected design system / Storybook docs based on **Affected Areas**.

---

## Step 3: Validate Against PRD

| AC ID | Criteria | Implemented? | Evidence |
|-------|----------|--------------|----------|
| {{EPIC_PREFIX}}-XXXX-AC01 | Given/When/Then | ✅ / ❌ / ⚠️ Partial | `app/.../page.tsx:42` |

Flag:
- AC not implemented → 🔴 **BLOCKER**
- AC partially implemented → 🟠 **MAJOR**
- AC implemented differently from PRD → 🟡 doc-sync needed

---

## Step 4: Validate Against Tech Design

**File impact**: planned files missing → flag; new files not in design → scope creep?

**RSC / Client Boundary**:
- `"use client"` only where the design specifies (event handlers / hooks / browser APIs)
- No client component imports a `import 'server-only'` module
- No server module imports a client-only module
- No client bundle pulls in server libs (DB client, secrets, large server-only deps)

**API Contract**:
- tRPC procedure / OpenAPI endpoint signature matches contract
- Server Action input parsed with Zod
- Return shape `{ ok, data | error | fieldErrors }` matches

**State**:
- TanStack Query keys use factory; staleTime + invalidation tags match design
- No `useEffect` for data fetching
- URL state via `nuqs` / `useSearchParams` where design says so

**Performance**:
- `next/image` for images with explicit width/height (or `fill` + aspect-ratio)
- `next/font` for fonts
- Dynamic import for heavy below-the-fold components
- Bundle analyzer delta vs design budget — flag KB regressions

**Security**:
- CSP-safe (no inline scripts without nonce)
- No `dangerouslySetInnerHTML` without DOMPurify
- Cookies HTTP-only + SameSite per design
- Zod at every trust boundary

**Accessibility**:
- Semantic HTML / Radix primitives where applicable
- `aria-*` only when no semantic element exists
- Focus management for new modals / menus
- Visible focus ring
- Reduced-motion respected

**Rollout**:
- Feature flag wired per design
- Kill-switch path present

**Divergences** → flag for doc-sync.

---

## Step 5: Validate Against Test Plan

- Vitest unit tests for new logic / hooks / schemas
- RTL component tests query by role / label
- MSW handlers added for new endpoints
- Playwright e2e for new top-level flows (if in scope)
- axe assertions on new routes
- Storybook stories for new components / states
- Lighthouse CI assertions if performance-sensitive

Flag:
- Test plan says test exists, not in diff → 🟠 **MAJOR**
- New logic without test → 🟡 **MINOR** (or MAJOR if critical path)

---

## Step 6: Web-App Code Quality Check

### Architecture & RSC Boundary
- [ ] Layer boundaries respected (`app/` → `features/` → `lib/`)
- [ ] `"use client"` minimal and justified
- [ ] No server-only imports in client modules
- [ ] No client-only imports leaking into server-only modules

### TypeScript
- [ ] No `any` — `unknown` narrowed with type guards
- [ ] Exhaustive `switch` for discriminated unions
- [ ] Zod parse at every trust boundary

### React Patterns
- [ ] No `useEffect` for data fetching (use RSC, TanStack Query, Server Actions)
- [ ] AbortController on every fetch in `useEffect`
- [ ] Cleanup on every subscription / observer
- [ ] No state setter on unmounted component (would-be warning)
- [ ] Memoization only where profiled

### Bundle & Performance
- [ ] Bundle delta within budget (verify with `@next/bundle-analyzer` if available)
- [ ] No accidental import of large server libs (`zod` in client is fine; `drizzle-orm` is not)
- [ ] `next/image` for images with dimensions
- [ ] `next/font` for fonts
- [ ] Dynamic import for heavy interaction-triggered components
- [ ] No layout shift introduced (reserved dimensions for media / fonts)

### Accessibility
- [ ] axe assertions added / passing on changed routes
- [ ] Semantic HTML / Radix primitives used
- [ ] Visible focus ring
- [ ] Keyboard reachable; tab order correct
- [ ] `prefers-reduced-motion` respected for animations
- [ ] Color contrast checked

### Security
- [ ] No hardcoded secrets / URLs / keys / tokens
- [ ] Zod validation on Server Action / Route Handler input
- [ ] No `dangerouslySetInnerHTML` without DOMPurify
- [ ] Cookies HTTP-only + SameSite
- [ ] CSP headers diff reviewed
- [ ] No PII in logs / analytics

### SEO (public surfaces)
- [ ] `generateMetadata` set (title, description, canonical, OG, Twitter)
- [ ] Structured data (JSON-LD) where applicable
- [ ] hreflang if multi-language

### Observability
- [ ] Sentry browser + server source maps configured
- [ ] Web Vitals listener wired
- [ ] Server logs structured (`pino`); no PII

### Style / Linting
- [ ] Naming matches project conventions
- [ ] ESLint / TypeScript / Prettier clean
- [ ] No dead code or commented-out blocks
- [ ] File / function size within project limits

---

## Step 7: Check Doc Impact

Compare diff against design system docs, Storybook MDX, tRPC / OpenAPI reference, user help center, README, i18n catalogs:
- Code contradicts existing docs?
- Component prop added / changed / removed?
- New route requires user help entry?
- API contract changed?
- New env var?

→ flag for `/doc-sync`

---

## Output Format

```markdown
## Review: PR #XX — [{{EPIC_PREFIX}}-XXXX] Title

**Source**: feature/{{EPIC_PREFIX}}-XXXX-name → main
**Files changed**: X files (+Y, -Z)
**Bundle delta**: +X.X KB gzip (budget: +Y KB)
**Epic**: [{{EPIC_PREFIX}}-XXXX](docs/sdlc/epics/{{EPIC_PREFIX}}-XXXX/{{EPIC_PREFIX}}-XXXX.md)

### Epic Docs Loaded
- [x] Epic doc — scope: [summary]
- [x] PRD — N acceptance criteria
- [x] Tech Design — N files planned
- [x] Test Plan — N test cases defined
- [ ] Approval — approved / NOT approved

### PR Conventions
- Title format `[{{EPIC_PREFIX}}-XXXX]`: ✅ / ❌
- Branch naming: ✅ / ❌
- Description filled: ✅ / ❌

### Acceptance Criteria vs Code
| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| {{EPIC_PREFIX}}-XXXX-AC01 | ... | ✅ | `app/.../page.tsx:42` |

### Tech Design vs Code
| Check | Status | Notes |
|-------|--------|-------|
| File impact matches | ✅ / ⚠️ | |
| RSC / client boundary | ✅ / ⚠️ | |
| API contract (tRPC / OpenAPI / Server Action) | ✅ / ⚠️ | |
| TanStack Query wiring | ✅ / ⚠️ | |
| Bundle within budget | ✅ / ⚠️ | +X KB vs +Y budget |
| Feature flag | ✅ / ⚠️ | |
| a11y axe pass | ✅ / ⚠️ | |

### Test Coverage vs Test Plan
| Test Case | In Diff? | Notes |
|-----------|---------|-------|
| {{EPIC_PREFIX}}-XXXX-UT01 | ✅ / ❌ | |
| {{EPIC_PREFIX}}-XXXX-CMP01 | ✅ / ❌ | |
| {{EPIC_PREFIX}}-XXXX-E2E01 | ✅ / ❌ | |
| {{EPIC_PREFIX}}-XXXX-A11Y01 | ✅ / ❌ | |

### Code Quality Findings

🔴 **BLOCKER** — [file:line] description
   Suggestion: ...

🟠 **MAJOR** — [file:line] description
   Suggestion: ...

🟡 **MINOR** — [file:line] description

🔵 **NIT** — [file:line] suggestion

### Doc Impact
After merge, these docs need updating (run `/doc-sync`):
- `docs/...` — reason
- Storybook MDX — new component variant
- i18n catalog — new strings

### Verdict
✅ **Approve** / ⚠️ **Approve with comments** / ❌ **Changes requested**

**Reason**: [one sentence]
```
