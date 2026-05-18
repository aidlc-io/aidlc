/**
 * Bundled skill templates exposed by the "Add Skill → Load template" wizard
 * step. Kept inline as TypeScript constants (vs. shipping .md files) so the
 * VSIX picks them up automatically without messing with .vscodeignore.
 *
 * Templates are grouped by `category` so the AddSkill modal can split a
 * long flat list into filterable sections (general / frontend / backend /
 * mobile / devops / data / refactor / docs). Add new templates by
 * appending to SKILL_TEMPLATES below.
 *
 * Style guideline: keep prompts focused (one job per skill), include
 * concrete acceptance criteria so the user can adapt without rewriting.
 */

export type SkillCategory =
  | 'general'
  | 'frontend'
  | 'backend'
  | 'mobile'
  | 'devops'
  | 'data'
  | 'qa'
  | 'refactor'
  | 'docs';

export const CATEGORY_LABELS: Record<SkillCategory, string> = {
  general: 'General',
  frontend: 'Frontend',
  backend: 'Backend',
  mobile: 'Mobile',
  devops: 'DevOps',
  data: 'Data',
  qa: 'QA',
  refactor: 'Refactor',
  docs: 'Docs',
};

export interface SkillTemplate {
  id: string;
  category: SkillCategory;
  description: string;
  /** Suggested skill id when scaffolded. User can override. */
  suggestedFilename: string;
  content: string;
}

export const SKILL_TEMPLATES: SkillTemplate[] = [
  // ── general ─────────────────────────────────────────────────────────────
  {
    id: 'code-reviewer',
    category: 'general',
    description: 'Review a code diff for bugs, security, performance — outputs structured table',
    suggestedFilename: 'code-reviewer.md',
    content: `# Code Reviewer

You review the supplied code diff. Focus only on issues that would block a
merge in a serious team. Skip nitpicks and stylistic preferences unless
they introduce a real bug.

**For every issue you find, output one row:**

| File:line | Severity | Category | What's wrong | Suggested fix |
|-----------|----------|----------|--------------|---------------|

**Severity**: \`block\` (must fix), \`warn\` (should fix), \`note\` (FYI).
**Category**: bug | security | perf | api-contract | test-coverage.

If there are no blockers, end your reply with \`VERDICT: PASS\`.
Otherwise, end with \`VERDICT: FAIL — N blockers\`.
`,
  },

  {
    id: 'security-audit',
    category: 'general',
    description: 'Scan a diff or file for OWASP-top-10 / common security mistakes',
    suggestedFilename: 'security-audit.md',
    content: `# Security Auditor

You audit the supplied code for security issues. Focus on issues a malicious
input could exploit — not theoretical risks.

**Check for**

- Injection: SQL, command, LDAP, XPath, NoSQL, template-engine
- Authn / authz: missing checks, IDOR, privilege escalation, token leaks
- Secrets: hardcoded keys / passwords / tokens; secrets in logs or errors
- Crypto: weak algos (MD5, SHA1, DES, ECB), missing IV, predictable RNG
- Input validation: deserialization, path traversal, unbounded input
- Output encoding: XSS in HTML / JS / CSS / attribute contexts
- Dependencies: known-vulnerable versions, supply-chain markers

**Output**: one row per finding.

| File:line | Severity | CWE | Issue | Exploit sketch | Fix |
|-----------|----------|-----|-------|----------------|-----|

End with \`VERDICT: PASS\` (no high/critical) or \`VERDICT: FAIL — N issues\`.
`,
  },

  {
    id: 'test-converter',
    category: 'general',
    description: 'Convert one Cypress test file to Playwright equivalent',
    suggestedFilename: 'test-converter.md',
    content: `# Cypress → Playwright Converter

You convert one Cypress test file to its Playwright equivalent.

**Mapping rules**

- \`cy.visit(url)\` → \`await page.goto(url)\`
- \`cy.get(selector).click()\` → \`await page.locator(selector).click()\`
- \`cy.get(selector).type(text)\` → \`await page.locator(selector).fill(text)\`
- \`cy.contains(text)\` → \`page.getByText(text)\`
- Custom commands (\`cy.login()\`, etc.) → call equivalent helpers under
  \`./playwright/helpers/\`. If one doesn't exist, leave a TODO comment.

**Output**

- Plain TypeScript — no fences, no commentary outside the file.
- Use Playwright's \`@playwright/test\` style: \`import { test, expect } ...\`.
- Preserve test names and structure 1:1.
`,
  },

  {
    id: 'threat-model',
    category: 'general',
    description: 'STRIDE threat model for a feature — assets, threats, mitigations',
    suggestedFilename: 'threat-model.md',
    content: `# Threat Modeler (STRIDE)

You produce a STRIDE threat model for the supplied feature / system.

**Output exactly this structure (markdown)**

\`\`\`md
## System under review
<One paragraph + 1–3 bullets listing trust boundaries>

## Data flow (text-only DFD)
- Actor → Component (data, direction)
- Component → Datastore (data, direction)

## Assets
| Asset | Owner | Sensitivity (P / I / A) | Notes |
|-------|-------|--------------------------|-------|

## Threats (one row per threat)
| ID | STRIDE | Component | Threat | Likelihood | Impact | Mitigation | Status |
|----|--------|-----------|--------|------------|--------|-------------|--------|
\`\`\`

**STRIDE = Spoofing, Tampering, Repudiation, Info-Disclosure, DoS, Elevation-of-privilege.**

**Rules**

- Threats trace to a specific component or data flow — no generic "we should validate input".
- Likelihood × Impact yields a sev: critical / high / med / low. Cap at \`med\` if mitigation is already in place.
- Mitigations cite an existing control or propose a concrete one (auth, ratelimit, encrypt-at-rest, audit log, etc.).
- Don't enumerate every theoretical threat — focus on the top ~10 that this system actually needs to defend.
`,
  },

  {
    id: 'codebase-summarizer',
    category: 'general',
    description: 'Summarize an unfamiliar codebase into a 1-page orientation doc',
    suggestedFilename: 'codebase-summarizer.md',
    content: `# Codebase Summarizer

You produce a one-page orientation for the supplied codebase. A new
engineer should be able to navigate the repo confidently after reading it.

**Output structure (markdown, ~1 page)**

\`\`\`md
## What this repo does
<One paragraph. What does it ship, to whom, why.>

## Top-level layout
| Path | What lives here |
|------|------------------|
| ... | ... |

## Build / run / test (the three commands)
- Build: \`...\`
- Run: \`...\`
- Test: \`...\`

## Key abstractions
- <Name> — <one-line definition + file path>
- <Name> — <one-line definition + file path>

## Read-this-first files
1. <path> — why it matters
2. <path> — why it matters

## Conventions
- <One-line convention> — <where it's enforced>

## Pitfalls
- <Trap a newcomer would hit> — <how to avoid>
\`\`\`

**Rules**

- No file dump — every entry earns its line by being load-bearing.
- Skip generic stack-level details ("this uses TypeScript") unless the repo
  diverges from the obvious idioms.
- Read \`README\` / \`CONTRIBUTING\` / package metadata before writing — don't
  re-derive what's already documented.
`,
  },

  {
    id: 'pr-description',
    category: 'general',
    description: 'Write a clean PR description from a list of commits + diff',
    suggestedFilename: 'pr-description.md',
    content: `# PR Description Writer

You write a pull-request description from the supplied commits + diff.

**Output exactly this structure (markdown):**

\`\`\`md
## Summary
<2–4 bullets — what & why, not how. No code.>

## Changes
- <Bullet per logically distinct change, file path + verb>

## Test plan
- [ ] <Concrete step a reviewer can run>
- [ ] <Edge case to verify>

## Risk / rollback
<One sentence: what breaks if this is wrong, how to revert.>
\`\`\`

**Rules**

- No emojis unless the project's existing PRs use them.
- Don't restate diff line counts or file counts — the PR UI shows those.
- Skip the "Changes" section if there's only one logical change.
- If the diff touches migrations, infra, or auth → add a "Rollout" subsection.
`,
  },

  // ── frontend ────────────────────────────────────────────────────────────
  {
    id: 'component-test',
    category: 'frontend',
    description: 'Write Vitest + Testing Library tests for one React component',
    suggestedFilename: 'component-test.md',
    content: `# Component Test Writer

You write Vitest + @testing-library/react tests for the supplied React
component.

**Coverage targets (one test per row)**

| Concern | What to assert |
|---------|----------------|
| Renders | Component mounts with default props; key text/role visible |
| Variants | Each \`variant\` / \`size\` prop renders the expected class/style |
| Interaction | Click / keyboard / form submit triggers expected callback |
| Loading / error / empty | Each state renders the right indicator |
| Accessibility | Has correct role + accessible name; keyboard-reachable |

**Rules**

- Prefer \`getByRole\` + \`getByLabelText\` over \`getByTestId\` / \`querySelector\`.
- No \`waitFor\` on synchronous render — only for async state.
- Mock network at the boundary (MSW or \`vi.mock\`), never the component itself.
- One \`expect\` per test where practical; multi-assert only inside loops.
`,
  },

  {
    id: 'a11y-audit',
    category: 'frontend',
    description: 'Audit a component / page for WCAG 2.2 AA issues',
    suggestedFilename: 'a11y-audit.md',
    content: `# Accessibility Auditor

You audit the supplied component / page markup for WCAG 2.2 AA issues.

**Check for**

- Semantic roles — buttons that aren't \`<button>\`, links that aren't \`<a>\`
- Labels — every interactive control has an accessible name
- Keyboard — every action reachable without a mouse, focus visible
- Headings — one \`<h1>\`, no level skips
- Images — \`alt\` present (or empty for decorative)
- Color — text contrast ≥ 4.5:1 (3:1 for ≥ 18pt or bold ≥ 14pt)
- Motion — \`prefers-reduced-motion\` honored
- Forms — errors associated to fields; required indicated to AT users
- Live regions — async updates announced (\`aria-live\`)

**Output**

| Selector | Severity | WCAG | Issue | Fix |
|----------|----------|------|-------|-----|

End with \`VERDICT: PASS\` (no critical/serious) or \`VERDICT: FAIL — N issues\`.
`,
  },

  {
    id: 'perf-budget',
    category: 'frontend',
    description: 'Diagnose web perf regressions from Lighthouse / Web Vitals report',
    suggestedFilename: 'perf-budget.md',
    content: `# Web Perf Diagnostician

You diagnose a regression in the supplied Lighthouse / Web-Vitals report.

**Targets**

| Metric | Good | Action threshold |
|--------|------|-------------------|
| LCP | ≤ 2.5s | > 2.5s |
| INP | ≤ 200ms | > 200ms |
| CLS | ≤ 0.1 | > 0.1 |
| TBT | ≤ 200ms | > 300ms |
| JS bundle (first-load) | ≤ 170KB | > 200KB |

**For each metric over budget**

1. Identify the dominant cause (long task / render-blocking / image / font / etc.)
2. Quote the specific evidence (waterfall row, JS chunk, etc.)
3. Recommend one concrete fix tied to a file or import

**Don't**

- Don't list every audit suggestion — only those that move a budget metric.
- Don't recommend libraries the project doesn't already use.
`,
  },

  {
    id: 'storybook-story',
    category: 'frontend',
    description: 'Write Storybook stories for one component (CSF 3)',
    suggestedFilename: 'storybook-story.md',
    content: `# Storybook Story Writer

You write Storybook CSF 3 stories for the supplied component.

**Required stories**

- \`Default\` — minimum required props
- One story per visual variant (\`size\`, \`variant\`, \`tone\`)
- \`Loading\`, \`Error\`, \`Empty\` — if the component has these states
- \`Interactive\` — a story that uses \`play\` to demonstrate the main flow

**Conventions**

- \`title\` follows \`<Domain>/<Component>\` (e.g. \`Forms/Button\`).
- Args typed via \`Meta<typeof Component>\`.
- No styles in stories — let the component own its CSS.
- Don't wrap stories in router / provider unless the component truly needs it.

Output a single \`.stories.tsx\` file, no commentary.
`,
  },

  {
    id: 'react-perf-audit',
    category: 'frontend',
    description: 'Audit a React component / page for re-render / memo / hook issues',
    suggestedFilename: 'react-perf-audit.md',
    content: `# React Perf Auditor

You audit the supplied React component / page for render performance.

**Patterns to flag (one row per finding)**

| File:line | Issue | Why it's slow | Fix |
|-----------|-------|----------------|-----|

**Categories**

- Re-render cascade: parent re-renders on every keystroke, dragging N children
- Wasted memos: \`useMemo\` / \`React.memo\` with non-primitive deps that change every render
- Inline functions / objects as props: new identity each render breaks memo downstream
- Big lists: missing virtualization (≥ 100 rows of moderate complexity)
- Effects firing too often: \`useEffect\` deps include objects / arrays declared in render
- State at the wrong level: state up high causing wide re-renders for narrow updates
- Context overuse: a single context bundles unrelated state → consumers re-render on any change
- Sync expensive work in render: parse / format / regex / sort that should be memoized or moved out

**Don't**

- Don't suggest \`useMemo\` for primitives or cheap computations.
- Don't suggest \`React.memo\` without confirming the parent re-renders frequently.
- Don't recommend a library swap (Recoil → Jotai, etc.) — work within the project's choice.
`,
  },

  {
    id: 'next-app-router-page',
    category: 'frontend',
    description: 'Scaffold a Next.js 15+ App Router page with server / client split',
    suggestedFilename: 'next-app-router-page.md',
    content: `# Next.js App Router Page Scaffold

You scaffold a Next.js (App Router) route for the supplied feature.

**Output**

- \`app/<route>/page.tsx\` — Server Component by default; fetches data via
  async function (no \`useEffect\`).
- \`app/<route>/loading.tsx\` — meaningful skeleton, not a generic spinner.
- \`app/<route>/error.tsx\` — \`'use client'\`; logs to the project's error sink.
- One Client Component file for any interactive piece (\`'use client'\` only
  on the smallest leaf that needs it).
- Route-level metadata via the \`metadata\` export.

**Rules**

- Don't mark a component \`'use client'\` "just in case" — push the boundary as
  far down the tree as possible.
- Don't fetch data in a Client Component if a Server Component can do it.
- Use \`<Link>\` for navigation and \`<Image>\` for images; raw \`<a>\` / \`<img>\`
  only if there's a specific reason.
- Caching: explicitly choose \`fetch\` cache strategy (\`force-cache\` /
  \`no-store\` / \`revalidate: N\`) — don't rely on defaults.
- Don't use \`useEffect\` for initial data load on a route component.
`,
  },

  {
    id: 'design-system-audit',
    category: 'frontend',
    description: 'Audit a component against design-system tokens (spacing, color, type)',
    suggestedFilename: 'design-system-audit.md',
    content: `# Design System Auditor

You audit the supplied component against the project's design system. Flag
every spot that uses ad-hoc values where a token exists.

**Inputs the user gives you**

- The component source.
- The token source — Tailwind config / CSS vars / a tokens file. If absent,
  ask once, then run on conventions.

**Output**

| File:line | Category | Ad-hoc value | Suggested token | Why it matters |
|-----------|----------|---------------|------------------|----------------|

**Categories**

- color — hex / rgb / hsl literal that should map to a semantic token
- spacing — px / rem literal that should map to the scale (4 / 8 / 16 / …)
- typography — font-size / line-height / weight not in the scale
- radius — corner radius literal not on the radius scale
- shadow — box-shadow literal not in the shadow tokens
- breakpoint — media query that doesn't match the defined breakpoints
- motion — duration / easing not in the motion tokens

**Don't**

- Don't flag values that legitimately have no token (one-off decorative graphics).
- Don't propose a new token unless the same literal appears ≥ 3× in the codebase.
`,
  },

  // ── backend ─────────────────────────────────────────────────────────────
  {
    id: 'rest-endpoint',
    category: 'backend',
    description: 'Scaffold a REST endpoint with validation, errors, and integration test',
    suggestedFilename: 'rest-endpoint.md',
    content: `# REST Endpoint Scaffold

You scaffold one HTTP endpoint matching the project's existing patterns.

**Inputs you ask for (in order)**

1. Method + path (\`POST /v1/users/:id/avatar\`)
2. Auth required? (none / user / admin)
3. Request body schema
4. Response shape (200 + error envelopes)
5. Side effects (DB writes, queue events, external calls)

**Output**

- The handler file
- Request / response Zod (or equivalent) schema
- Error mapping for: 400 (validation), 401, 403, 404, 409, 500
- One integration test covering happy path + each error branch
- Updated OpenAPI spec entry if the project ships one

**Rules**

- Match the project's existing handler signature (Express / Fastify / Nest / …).
- Don't introduce a new validation lib or HTTP client.
- Idempotency: \`POST\` that creates → return 201 + Location; retry-safe via
  \`Idempotency-Key\` only if the project's conventions already use it.
`,
  },

  {
    id: 'openapi-contract',
    category: 'backend',
    description: 'Author / update an OpenAPI 3.1 path spec from a handler',
    suggestedFilename: 'openapi-contract.md',
    content: `# OpenAPI Path Author

You produce an OpenAPI 3.1 path entry for the supplied handler / endpoint.

**Output the YAML for a single path** with:

- \`summary\` (≤ 60 chars) + \`description\` (one paragraph max)
- \`operationId\` (camelCase verb-noun)
- Path / query params with \`name\`, \`in\`, \`required\`, \`schema\`, \`example\`
- \`requestBody\` (when applicable) with at least one example
- \`responses\` for 200 + every error the handler emits — each with schema
- \`security\` — referenced scheme, not inlined
- Reuse component schemas via \`$ref\` rather than duplicating shapes

**Don't**

- Don't invent endpoints / fields the handler doesn't have.
- Don't write Swagger 2.0 syntax (no \`definitions:\`).
- Don't include examples that would leak real data.
`,
  },

  {
    id: 'db-migration',
    category: 'backend',
    description: 'Generate a forward + backward migration for a schema change',
    suggestedFilename: 'db-migration.md',
    content: `# DB Migration Author

You generate a database migration for the supplied schema change.

**Output two files**: \`up\` and \`down\`. Use the migration tool the project
already uses (Prisma / Knex / Alembic / Flyway / Atlas / Rails / …).

**Rules**

- **Online-safe** by default: \`ADD COLUMN\` nullable first, backfill,
  \`ALTER\` to \`NOT NULL\` in a follow-up. Don't lock a hot table.
- Index creation: \`CREATE INDEX CONCURRENTLY\` on Postgres; \`ALGORITHM=INPLACE\`
  on MySQL when possible.
- Renames: drop the old name only after a deploy cycle that double-writes.
- \`down\` must be exact reverse — no data loss surprises.
- Add a comment block explaining the why + any rollout sequencing.
`,
  },

  {
    id: 'n-plus-one-audit',
    category: 'backend',
    description: 'Find N+1 queries / ORM smells in the supplied code',
    suggestedFilename: 'n-plus-one-audit.md',
    content: `# N+1 / ORM Audit

You audit the supplied request handler / service for N+1 queries and
ORM-induced over-fetching.

**Patterns to flag**

- Loop over a parent list, accessing a relation inside → N+1
- \`SELECT *\` when only 2 fields are used
- Eager-loading the wrong direction (parent → child → grandchild via lazy)
- Per-iteration count / exists checks that could be a single aggregate
- Missing batch operations (\`updateMany\` / \`bulkInsert\`)

**Output**

| File:line | Pattern | Estimated cost (per req) | Fix |
|-----------|---------|---------------------------|-----|

Quote the offending lines and propose the smallest fix that uses the
project's existing ORM features.
`,
  },

  {
    id: 'api-deprecation-plan',
    category: 'backend',
    description: 'Plan + execute a safe API deprecation (sunset, telemetry, comms)',
    suggestedFilename: 'api-deprecation-plan.md',
    content: `# API Deprecation Planner

You produce a deprecation plan for the supplied endpoint / field / shape.

**Output structure**

\`\`\`md
## What's being deprecated
<Endpoint / field / behavior. One sentence.>

## Why
<Why now, what the replacement is.>

## Replacement
- Migration path: <old call → new call, one example before/after>
- Compatibility window: <date range — when does old stop working>

## Rollout
1. **Soft-deprecate (T0)** — \`Deprecation:\` + \`Sunset:\` headers, docs updated,
   announce to consumers. Behavior unchanged.
2. **Track usage (T0 → T-30d)** — log every caller (\`user-agent\`, \`client-id\`,
   request rate). Goal: zero non-internal callers before T-30d.
3. **Warn loudly (T-30d)** — log \`WARN\` per call; nudge the top N callers
   directly.
4. **Remove (T0)** — return 410 Gone with a body pointing at the replacement.

## Comms
- Changelog entry: <draft 2–3 sentences>
- Direct-message message: <draft for top callers>

## Rollback
<How to put the endpoint back if removal breaks something.>
\`\`\`

**Rules**

- Default window: 90 days from soft-deprecate to removal. Shorten only if
  caller set is internal and small.
- Headers follow RFC 8594 / draft \`Sunset\` semantics — don't invent custom ones.
- Removal step returns \`410 Gone\`, not \`404\`.
`,
  },

  {
    id: 'retry-circuit-breaker',
    category: 'backend',
    description: 'Design retry + circuit-breaker for an outbound dependency',
    suggestedFilename: 'retry-circuit-breaker.md',
    content: `# Retry + Circuit Breaker Designer

You design retry + circuit-breaker behavior for the supplied outbound call.

**Output**

\`\`\`md
## Call profile
- Endpoint: <method + url>
- Idempotent? <yes / no — affects retry safety>
- Typical latency p50 / p95: <ms / ms>
- Acceptable user-facing latency budget: <ms>

## Retry policy
- Retries: <N> (cap so total time stays under the latency budget)
- Backoff: exponential, base = <ms>, jitter = full
- Retry on: <5xx, network errors, 429 with Retry-After> — NOT on 4xx
- Idempotency: <"Idempotency-Key" / natural-key on the call body>

## Circuit breaker
- Window: rolling <N>s
- Open if: error rate ≥ <X>% over ≥ <K> requests
- Half-open after: <T>s — let 1 request through; close on success, re-open on fail
- Open response: <fallback / cached value / 503 with Retry-After>

## Observability
- Metrics: \`upstream.<dep>.requests / errors / circuit_state\`
- Alert: page if circuit open ≥ <T>s during business hours
\`\`\`

**Rules**

- Never retry non-idempotent POSTs without an idempotency key.
- Total retry budget must stay under the caller's latency budget; missing
  this is worse than failing fast.
- Don't add a circuit breaker around a dependency that has only one downstream
  — it doesn't help, only adds operational surface.
`,
  },

  // ── mobile ──────────────────────────────────────────────────────────────
  {
    id: 'swiftui-view',
    category: 'mobile',
    description: 'Scaffold a SwiftUI view with @State, preview, and accessibility',
    suggestedFilename: 'swiftui-view.md',
    content: `# SwiftUI View Scaffold

You scaffold one SwiftUI view for the supplied feature description.

**Output a single file** with:

- The \`View\` struct (one struct, one file)
- \`@State\` / \`@Binding\` / \`@Environment\` declarations as appropriate
- A loading / error / empty state branch where the feature needs it
- VoiceOver labels via \`.accessibilityLabel\` / \`.accessibilityHint\`
- \`Dynamic Type\` friendly fonts (\`.font(.body)\`, not fixed sizes)
- A \`#Preview\` macro showing at least the default + one variant

**Don't**

- Don't subclass UIKit views unless the feature truly needs it.
- Don't fire network calls from inside \`body\` — use \`.task\` / a view model.
- Don't hardcode dark/light colors — use \`Color(.systemBackground)\` etc.
`,
  },

  {
    id: 'jetpack-compose-screen',
    category: 'mobile',
    description: 'Scaffold a Jetpack Compose screen + state hoisting + preview',
    suggestedFilename: 'jetpack-compose-screen.md',
    content: `# Jetpack Compose Screen Scaffold

You scaffold one Compose screen for the supplied feature.

**Output a single file** with:

- A stateless \`@Composable\` taking all state via parameters (state hoisting)
- A stateful wrapper that collects the ViewModel state via \`collectAsStateWithLifecycle\`
- \`Modifier\` chains start with positioning, then sizing, then visuals — keep
  them passed in from the caller where possible
- Accessibility via \`semantics { contentDescription = ... }\`
- A \`@Preview\` for the default + at least one error / empty variant

**Don't**

- Don't read \`LocalContext\` for resources — pass them in.
- Don't allocate inside \`Modifier.composed\` — use \`remember\`.
- Don't call \`LaunchedEffect\` without a meaningful key.
`,
  },

  {
    id: 'rn-screen',
    category: 'mobile',
    description: 'Scaffold a React Native screen with navigation, hooks, safe-area',
    suggestedFilename: 'rn-screen.md',
    content: `# React Native Screen Scaffold

You scaffold one screen for the project's React Native app.

**Output a single \`.tsx\` file** with:

- Typed navigation props (\`@react-navigation/native-stack\` style)
- \`SafeAreaView\` (or the project's \`useSafeAreaInsets\` hook)
- Loading / error / empty branches gated on the data hook
- Pull-to-refresh if the screen lists remote data
- Tested-styled component patterns the project already uses (StyleSheet /
  NativeWind / Tamagui — pick what's there, don't introduce a new one)

**Don't**

- Don't import from \`react-native-web\`-only modules unless the project's
  cross-platform.
- Don't block the main thread on JSON parsing — use the project's data hook.
- Don't use \`Alert.alert\` for confirmations on screens that own a header.
`,
  },

  {
    id: 'mobile-crash-triage',
    category: 'mobile',
    description: 'Triage a mobile crash log (iOS / Android / React Native)',
    suggestedFilename: 'mobile-crash-triage.md',
    content: `# Mobile Crash Triage

You triage the supplied mobile crash log / stack trace.

**Output**

\`\`\`md
## Top-line
- Signal / exception: <SIGSEGV / NullPointerException / fatal JS / …>
- Most-likely root cause: <one sentence>
- Confidence: high / medium / low

## Frame walk
- Frame N (your code): <symbol> @ <file:line> — what it was doing
- Frame N-1 (your code): <symbol> @ <file:line>
- … (stop when frames leave your code)

## Environment factors
- OS / version, device class, locale, app build, free memory, network
- Anything correlated across the affected sessions

## Hypotheses
1. <Hypothesis> — supporting evidence — how to verify
2. <Hypothesis> — supporting evidence — how to verify

## Next step
<One concrete action: add log, reproduce locally with X, ship hotfix to gate, …>
\`\`\`

**Rules**

- Quote the exact symbol + file:line — don't paraphrase the stack.
- Skip frames inside the platform SDK / framework unless they're directly load-bearing.
- For RN: separate JS frames from native frames; identify which side crashed.
- Don't propose a fix more invasive than the bug — start with the smallest reproducible patch.
`,
  },

  // ── devops ──────────────────────────────────────────────────────────────
  {
    id: 'dockerfile',
    category: 'devops',
    description: 'Multi-stage Dockerfile tuned for size + caching',
    suggestedFilename: 'dockerfile.md',
    content: `# Dockerfile Author

You write a production Dockerfile for the supplied project.

**Required**

- Multi-stage: build stage compiles / installs; final stage copies artifacts
- Pin the base image to a specific digest (or at minimum, a minor tag)
- Run as non-root (\`USER\` with a fixed uid)
- Add a \`HEALTHCHECK\` matching the app's readiness endpoint
- Set \`WORKDIR\` once near the top; avoid \`cd\` in \`RUN\`
- Cache deps before copying source (\`COPY package.json\` then \`RUN install\` then \`COPY .\`)
- Final stage avoids dev deps / shells / compilers it doesn't need

**Don't**

- Don't use \`latest\` tags.
- Don't \`ADD\` when \`COPY\` would do.
- Don't run package managers as root if the language has a better way.
`,
  },

  {
    id: 'github-actions-workflow',
    category: 'devops',
    description: 'Author a GitHub Actions workflow with proper caching + concurrency',
    suggestedFilename: 'github-actions-workflow.md',
    content: `# GitHub Actions Workflow Author

You write a \`.github/workflows/<name>.yml\` for the supplied job description.

**Required**

- \`name:\` + minimal \`on:\` triggers (PR + push to main, not every branch)
- \`concurrency:\` block keyed on \`{{ github.ref }}\` to cancel in-progress runs
- \`permissions:\` block — request only what the job uses (least privilege)
- Step-level cache for the language's deps (\`actions/cache\` or built-in)
- Pin third-party actions to a commit SHA (not a moving tag)
- \`if:\` guards to skip duplicated work (PRs from forks, draft PRs, etc.)

**Don't**

- Don't put secrets in \`env:\` at workflow level — scope to the step.
- Don't run on every push to every branch.
- Don't \`continue-on-error: true\` to silence a flaky test — fix or skip it.
`,
  },

  {
    id: 'k8s-manifest',
    category: 'devops',
    description: 'Generate Deployment + Service + HPA manifests for a service',
    suggestedFilename: 'k8s-manifest.md',
    content: `# Kubernetes Manifest Author

You produce Deployment + Service + HPA YAML for the supplied service.

**Required**

- Container image pinned to a tag (no \`latest\`)
- \`resources.requests\` AND \`limits\` for CPU + memory (sensible defaults if unknown)
- \`readinessProbe\` + \`livenessProbe\` pointing at the right endpoints
- \`securityContext\`: \`runAsNonRoot: true\`, drop \`ALL\` capabilities
- \`PodDisruptionBudget\` if replicas > 1
- HPA on CPU and/or memory with min ≥ 2 for prod
- Labels: \`app.kubernetes.io/{name,version,component,part-of}\`

**Don't**

- Don't emit a NodePort Service unless explicitly asked.
- Don't bake secrets into the manifest — use \`secretKeyRef\`.
- Don't set \`hostNetwork: true\` unless absolutely required.
`,
  },

  {
    id: 'terraform-module',
    category: 'devops',
    description: 'Author a reusable Terraform module with variables, outputs, and example',
    suggestedFilename: 'terraform-module.md',
    content: `# Terraform Module Author

You produce a reusable Terraform module for the supplied resource.

**Files to output**

- \`main.tf\` — resources only; no \`provider\` blocks (callers own that)
- \`variables.tf\` — every input typed, with description + sensible default
  where reasonable; \`sensitive = true\` for anything secret
- \`outputs.tf\` — every output that a caller would plausibly consume
- \`versions.tf\` — \`required_version\` + \`required_providers\` with version constraints
- \`README.md\` — auto-doc-friendly format (matches \`terraform-docs\` output)
- \`examples/basic/\` — minimal working example a user can copy

**Rules**

- No hardcoded region / account / project ids — surface as variables.
- Tag every resource via a \`tags\` / \`labels\` variable so the caller can stamp
  cost-center / env / owner.
- No \`null\` workarounds (\`count = var.x ? 1 : 0\`) without a comment explaining why.
- \`for_each\` over \`count\` whenever the set is keyed (more predictable diffs).
- Use \`moved {}\` blocks instead of forcing destroys when refactoring resource paths.
- No \`null_resource\` + \`local-exec\` unless you've ruled out a native resource.
`,
  },

  {
    id: 'k8s-troubleshoot',
    category: 'devops',
    description: 'Diagnose Pod failures (ImagePullBackOff, OOMKilled, CrashLoopBackOff)',
    suggestedFilename: 'k8s-troubleshoot.md',
    content: `# Kubernetes Pod Troubleshooter

You diagnose the supplied Pod / Deployment failure.

**Output**

\`\`\`md
## Symptom
<Reason from \`kubectl get pods\` (ImagePullBackOff / OOMKilled / CrashLoopBackOff / Pending / …)>

## Most-likely root cause
<One sentence.>

## Verification — run these
1. \`kubectl describe pod <name>\` — look for: <specific Event line>
2. \`kubectl logs <name> --previous\` — look for: <specific message>
3. <Any cluster-specific check — node pressure, quota, image registry, RBAC>

## Fix
<Specific patch — image tag, resource limits, probe path, secret name, etc.>

## Prevention
<Manifest change / policy / admission rule that would have caught it.>
\`\`\`

**Common reasons → most-likely cause**

- ImagePullBackOff → wrong tag / private registry without \`imagePullSecret\`
- OOMKilled → \`limits.memory\` too low; check actual peak via metrics
- CrashLoopBackOff → app exits on boot; usually missing config / env / probe failure
- Pending → no node matches \`nodeSelector\` / \`affinity\` / resources / taints
- CreateContainerConfigError → secret / configmap referenced but absent

**Don't**

- Don't recommend \`kubectl delete pod\` as the fix — fix the manifest.
- Don't blindly raise limits to make OOM go away — diagnose the leak first.
`,
  },

  // ── data ────────────────────────────────────────────────────────────────
  {
    id: 'sql-optimizer',
    category: 'data',
    description: 'Optimize a slow query using EXPLAIN output + schema',
    suggestedFilename: 'sql-optimizer.md',
    content: `# SQL Query Optimizer

You optimize the supplied slow query given its \`EXPLAIN\` / \`EXPLAIN ANALYZE\`
output and the relevant table schema.

**Steps**

1. Identify the dominant cost node in the plan (seq scan, sort, hash join, …)
2. Hypothesize the root cause (missing index, type mismatch, function on
   indexed column, bad estimate, etc.)
3. Propose the smallest fix — typically one of: add index, rewrite predicate,
   add LIMIT/ORDER, change join order via CTE, add covering index
4. Show the new query + the index DDL (if any)
5. Estimate the expected gain ("seq scan → index scan, ~100x rows pruned")

**Don't**

- Don't add an index without checking write-amp on the table.
- Don't suggest denormalization without explicit asking.
- Don't blindly add \`SELECT \*\` columns to a covering index.
`,
  },

  {
    id: 'schema-design',
    category: 'data',
    description: 'Design a normalized schema for a feature description',
    suggestedFilename: 'schema-design.md',
    content: `# Schema Designer

You design the database schema for the supplied feature description.

**Output**

- DDL for each table (Postgres syntax unless the project says otherwise)
- One ER-style description listing relationships + cardinalities
- Index list — every FK indexed; cover the top 2–3 query patterns
- Constraints — \`NOT NULL\` defaults, \`CHECK\` for enums, \`UNIQUE\` for natural keys
- A short paragraph explaining what's intentionally denormalized and why

**Rules**

- 3NF as the default. Denormalize only with a stated read-pattern justification.
- Use \`bigint\` ids unless you know the row count stays small.
- Timestamps: \`created_at\` + \`updated_at\` (\`timestamptz\`) on every table.
- Soft delete only if the product has a defined retention policy.
- Naming: \`snake_case\`, singular table names, FK = \`<table>_id\`.
`,
  },

  {
    id: 'dbt-model',
    category: 'data',
    description: 'Author a dbt model with materialization, tests, docs, and lineage',
    suggestedFilename: 'dbt-model.md',
    content: `# dbt Model Author

You author a dbt model for the supplied transformation.

**Output**

- \`models/<layer>/<name>.sql\` — the SQL (CTE-style, named CTEs, one purpose
  per CTE). Use \`{{ ref('parent_model') }}\` / \`{{ source('schema', 'table') }}\`
  for every upstream dep — no hardcoded \`schema.table\` strings.
- \`models/<layer>/<name>.yml\` — model description + per-column descriptions
  + tests on every key / FK / categorical column

**Layer + materialization defaults**

- \`staging\` — \`view\` (cheap, lineage-only)
- \`intermediate\` — \`ephemeral\` (CTE inlined into downstream) or \`view\`
- \`marts\` — \`incremental\` when row volume is high; \`table\` otherwise

**Required tests**

- Primary key: \`unique\` + \`not_null\`
- FKs: \`relationships\` to the parent's PK
- Categoricals: \`accepted_values\`
- Date columns: \`dbt_utils.expression_is_true\` for sensible ranges

**Don't**

- Don't \`SELECT *\` from a model that's likely to grow columns.
- Don't reach across layers (mart reading raw / source directly).
- Don't put filters inside the final \`SELECT\` — put them in a named CTE so
  the intent shows in the lineage.
`,
  },

  // ── qa ──────────────────────────────────────────────────────────────────
  {
    id: 'test-plan-author',
    category: 'qa',
    description: 'Author a focused test plan from PRD + acceptance criteria',
    suggestedFilename: 'test-plan-author.md',
    content: `# Test Plan Author

You author a test plan for the supplied feature using the PRD's acceptance
criteria as the source of truth.

**Output structure**

\`\`\`md
## Scope
<What's in / out. One bullet each.>

## Test categories
For each, list **only** if it applies:
- Unit | Contract | Integration | UI | E2E | NFR-Perf | NFR-Security | A11y

## Environment matrix
| Surface | Dimensions | Must-test | Spot-check |
|---------|------------|-----------|------------|

## Test cases per AC
For every AC id in the PRD:
- AC: <id> — <short title>
  - Happy path: <1 line>
  - Negative: <1 line each — empty, boundary, permission, upstream-fail>
  - Risk: <link to failure-mode if relevant>
\`\`\`

**Rules**

- Every AC has at least one test. Every test traces to one AC or one explicit risk.
- Skip categories that don't apply — don't pad.
- Don't propose tests for behavior the PRD doesn't promise.
`,
  },

  {
    id: 'test-cases-generator',
    category: 'qa',
    description: 'Generate runnable test cases (arrange/act/assert) from a test plan',
    suggestedFilename: 'test-cases-generator.md',
    content: `# Test Case Generator

You generate concrete, executable test cases from the supplied test plan.

**Output per case**

\`\`\`md
### <PREFIX>-NNN — <one-line behaviour>
- AC: <AC id from PRD>
- Type: Unit | Integration | E2E | NFR-Perf | …
- Preconditions: <fixtures, seeded data, env>
- Steps:
  1. <arrange>
  2. <act>
- Expected: <single observable outcome>
- Test path: <relative path to test file>
\`\`\`

**Rules**

- Deterministic: inject clock, seed randomness, stub network — no real-network calls.
- Isolated: each case owns its data. No order dependencies.
- One observable assertion per case (matrix dimensions go in sub-cases).
- Use the project's existing test framework / fixtures. Don't introduce a new one.
- Negative cases: for each failure-mode category in the plan, emit ≥ 1 case
  or note in plain text why the category is skipped.
`,
  },

  {
    id: 'bug-report',
    category: 'qa',
    description: 'Write an actionable bug report from observed behavior',
    suggestedFilename: 'bug-report.md',
    content: `# Bug Report Writer

You turn the supplied observation into a bug report a developer can act on
without asking follow-up questions.

**Output exactly this structure (markdown)**

\`\`\`md
## Summary
<One sentence: what's broken, where.>

## Steps to reproduce
1. ...
2. ...
3. ...

## Expected
<What should happen — quote AC or doc if possible.>

## Actual
<What does happen. Include error text verbatim.>

## Environment
- App version / commit:
- OS / browser / device:
- User role / account state:
- Network:

## Impact
- Severity: blocker | major | minor | trivial
- Frequency: always | often | sometimes | once
- Workaround: <if any>

## Evidence
- Logs / screenshot / video / HAR — link or paste.

## Suspected area (optional)
<Module / file if you have a hypothesis. Otherwise leave blank.>
\`\`\`

**Rules**

- Repro steps are click-by-click, no "see image". A dev should reproduce
  it cold from the steps alone.
- No screenshots of plain text — paste the text.
- Severity ≠ priority — describe impact, let triage set priority.
`,
  },

  {
    id: 'exploratory-charter',
    category: 'qa',
    description: 'Author a time-boxed exploratory testing charter (session-based)',
    suggestedFilename: 'exploratory-charter.md',
    content: `# Exploratory Testing Charter

You author a session-based exploratory testing charter for the supplied
feature / risk area.

**Output**

\`\`\`md
# Charter: <one-line goal>

## Mission
Explore <area> with <tools/data>, to discover <kind of information>.

## Duration
<60 / 90 / 120 minutes — pick one. Sessions over 2h lose focus.>

## Areas to investigate
- <Specific surface / flow>
- <Specific surface / flow>

## Test ideas
- <Tour name>: <approach> — e.g. "Money tour: any flow that handles
  currency, tax, refund"
- <Tour name>: <approach>

## Risks / heuristics
- CRUD: every entity has Create / Read / Update / Delete — check all
- Goldilocks: too big / too small / just right inputs
- Bad neighbor: behavior under low memory / disk / network / battery
- Time travel: clock changes, expiry, DST, leap day

## Out of scope
- <What this session does NOT cover, to defend the time-box>

## Notes
<Captured during the session — observations, bugs, follow-ups, new questions.>

## Debrief
- Bugs found: <links>
- Coverage achieved: <areas, depth>
- Follow-up charters: <new charters proposed>
\`\`\`

**Rules**

- One mission per charter. If it splits, file two charters.
- Tours are heuristics, not scripts — log what surprised you.
`,
  },

  {
    id: 'load-test-k6',
    category: 'qa',
    description: 'k6 load-test script with stages, thresholds, and check assertions',
    suggestedFilename: 'load-test-k6.md',
    content: `# k6 Load Test Author

You write a k6 load test for the supplied endpoint / scenario.

**Output a single \`.js\` file** with:

- A staged \`scenarios.ramping_vus\` block — warm-up → steady → cool-down
- \`thresholds:\` for at least: \`http_req_failed\` (< 1%), \`http_req_duration\`
  p95 (sensible default), and a custom \`Trend\` for the business metric
- \`check()\` assertions on every request — status, payload shape, business invariant
- Realistic think time (\`sleep\`) between user steps — not zero
- Setup / teardown for fixture data; teardown leaves no orphan rows
- A short comment block at the top stating the scenario being modeled

**Rules**

- Don't hardcode prod URLs — read \`__ENV.BASE_URL\`.
- Don't bake credentials into the script — read \`__ENV.AUTH_TOKEN\`.
- If the scenario covers a write endpoint, add a teardown that deletes
  whatever the test created (or run against an ephemeral DB).
- One file per scenario. Don't combine "browse" + "checkout" in one script.
`,
  },

  {
    id: 'contract-test-pact',
    category: 'qa',
    description: 'Author a consumer-driven contract test (Pact) for an API call',
    suggestedFilename: 'contract-test-pact.md',
    content: `# Pact Contract Test Author

You author a consumer-driven contract test (Pact) for the supplied
consumer ↔ provider interaction.

**Output**

- One \`*.pact.test.ts\` (or language equivalent) file on the consumer side:
  - \`pact.given('<provider state>')\` — describe what data must exist
  - \`.uponReceiving('<short description>')\` — the request the consumer makes
  - \`.withRequest({ method, path, headers, body })\` — match by structure, not literals where possible (use Pact matchers)
  - \`.willRespondWith({ status, headers, body })\` — match by structure
- One provider-side state handler implementing the named state(s).
- Verification hook (script / CI step) that runs Pact \`can-i-deploy\` before merging.

**Rules**

- Tests describe the **shape** the consumer needs, not the provider's full shape.
- Use matchers (\`like\`, \`eachLike\`, \`term\`) for fields where the value varies
  between environments. Literals only where the contract truly nails the value.
- Don't assert on fields the consumer doesn't read — every assertion is a
  constraint the provider must honor forever.
- Avoid coupling to error messages — assert on status code + structured fields.
`,
  },

  // ── refactor ────────────────────────────────────────────────────────────
  {
    id: 'extract-function',
    category: 'refactor',
    description: 'Extract a focused function from a large block — same behavior',
    suggestedFilename: 'extract-function.md',
    content: `# Extract Function Refactor

You extract one focused function from the supplied code block. The behavior
of the surrounding code is unchanged.

**Process**

1. Identify the smallest cohesive chunk that has a name (a *what*, not *how*).
2. Inputs are explicit parameters — no captured shared state.
3. Outputs: prefer a return value over mutation; if multiple, return a tuple/object.
4. New function lives in the same file unless reused across files.
5. Add JSDoc / docstring with the contract.

**Don't**

- Don't change types or signatures of the surrounding code.
- Don't add new behavior, validation, or logging.
- Don't extract single one-liners that are already self-explanatory.
- Don't introduce a class to host a single function.
`,
  },

  {
    id: 'dead-code-finder',
    category: 'refactor',
    description: 'List dead exports / unused symbols in the supplied module',
    suggestedFilename: 'dead-code-finder.md',
    content: `# Dead Code Finder

You scan the supplied module(s) for dead code — exports / symbols / files
that aren't referenced.

**Output**

| Path:symbol | Last-touched commit (if known) | Why it looks dead | Suggested action |
|-------------|--------------------------------|--------------------|-------------------|

**Categories of action**

- \`delete\` — safe to remove this PR
- \`deprecate\` — public API; mark and remove next major
- \`investigate\` — could be reflective / config-loaded; needs grep across the repo
- \`keep\` — false positive (e.g. used by a generated client)

**Rules**

- Don't list symbols that are exported as part of a public package surface.
- Don't list test helpers that are only used by tests in the same dir.
- Quote the grep line counts so the user can verify.
`,
  },

  {
    id: 'hardcoded-values-extractor',
    category: 'refactor',
    description: 'Pull magic numbers / strings / URLs into named constants or config',
    suggestedFilename: 'hardcoded-values-extractor.md',
    content: `# Hardcoded Values Extractor

You find magic numbers / strings / URLs / CIDRs / instance sizes in the
supplied module(s) and propose extracting them into constants or config.

**Categorize each finding**

| Kind | Example | Destination |
|------|---------|-------------|
| Env-varying | URLs, region, account id, bucket name | env / config file |
| Domain constant | Default page size, retry count, timeout | \`constants.ts\` next to caller |
| Magic literal | \`if (status === 3)\` where 3 is a state enum | typed enum |
| Tunable | Cache TTL, batch size, concurrency | config with sensible default |

**Output**

| File:line | Value | Kind | Proposed name | Destination |
|-----------|-------|------|---------------|-------------|

**Rules**

- Don't extract a value used once unless it's truly env-varying.
- Don't introduce a new config system — use what the project already has.
- Skip values that are arguments / payload literals (e.g. test fixtures);
  extract only what behaves as configuration.
- Name the constant by **meaning**, not value (\`MAX_RETRIES\`, not \`THREE\`).
`,
  },

  {
    id: 'type-strictness',
    category: 'refactor',
    description: 'Tighten loose types (any / unknown / object) toward strict types',
    suggestedFilename: 'type-strictness.md',
    content: `# Type Strictness Refactor

You tighten loose types in the supplied TypeScript / Python / Java code.

**TypeScript patterns to flag**

- \`any\` — promote to \`unknown\` + narrow at the boundary, or to a real type
- \`as any\` casts — figure out the real shape; an \`as\` cast is a lie the
  compiler can't check
- \`Record<string, any>\` — name the shape (\`interface\` or \`type\`)
- \`function f(x): any\` — annotate the return; let the compiler infer rest
- \`object\` / \`Function\` — too wide; use a specific signature
- \`@ts-ignore\` / \`@ts-expect-error\` without reason — add a comment or fix

**Output**

| File:line | Current | Why it's too loose | Proposed |
|-----------|---------|---------------------|----------|

**Rules**

- Start at module boundaries (exports, public APIs) — most bang for the buck.
- Don't widen tests' types — they're allowed to be loose.
- If \`any\` represents external input (JSON, HTTP, FFI), accept \`unknown\` +
  validate at the seam with Zod / io-ts / equivalent.
- Don't turn on \`strict\` mode for the whole repo in this pass — propose
  it as a follow-up.
`,
  },

  // ── docs ────────────────────────────────────────────────────────────────
  {
    id: 'release-notes',
    category: 'docs',
    description: 'Summarize a list of git commits into user-facing release notes',
    suggestedFilename: 'release-notes.md',
    content: `# Release Notes Writer

You summarize the supplied list of git commit messages into user-facing
release notes for an end-user audience.

**Output structure**

\`\`\`md
## v<NEW_VERSION>

### New
- One bullet per genuinely user-visible feature.

### Improved
- Performance, reliability, polish — nothing internal-only.

### Fixed
- Bug fixes the user might have hit. Skip "fix typo" / "fix CI".

### Behind the scenes (optional)
- Refactors, deps, tooling — only if the audience cares.
\`\`\`

**Rules**

- Translate engineer-speak into user-speak. "Switched API client to
  retry on 503" → "Fewer dropped requests when the server is busy".
- Skip merge commits, version bumps, and changelog edits themselves.
- If a commit doesn't map to a user-visible change, drop it.
`,
  },

  {
    id: 'doc-writer',
    category: 'docs',
    description: 'Document a function/class given source code — JSDoc-style',
    suggestedFilename: 'doc-writer.md',
    content: `# Documentation Writer

You write API documentation for the supplied function or class.

**Output a single JSDoc-style block** with these sections, in order:

1. One-line summary (purpose, not mechanics).
2. Detailed description (when/why to use, edge cases, gotchas).
3. \`@param\` for every parameter (name, type, description, default if any).
4. \`@returns\` (type + description).
5. \`@throws\` for each exception class.
6. \`@example\` — at least one, runnable as-is.

**Don't**

- Don't repeat the function signature in prose.
- Don't add lifecycle / framework boilerplate not present in the source.
- Don't speculate about future features.
`,
  },

  {
    id: 'adr-writer',
    category: 'docs',
    description: 'Author an Architecture Decision Record (Nygard format)',
    suggestedFilename: 'adr-writer.md',
    content: `# ADR Writer

You author an Architecture Decision Record (Nygard-style) for the supplied
decision.

**Output exactly this structure (markdown)**

\`\`\`md
# ADR-<NNN>: <title>

- Status: proposed | accepted | superseded by ADR-<NNN>
- Date: YYYY-MM-DD
- Deciders: <names / teams>

## Context
<What forces are at play. What constraints / requirements. 1–3 paragraphs.>

## Decision
<What we are doing, in one paragraph. Active voice.>

## Consequences
**Positive**
- ...

**Negative**
- ...

**Neutral**
- ...

## Alternatives considered
- <Option> — why rejected (one line each)
\`\`\`

**Rules**

- Decision section is one paragraph max — if it needs more, the decision
  isn't clear enough yet.
- "Consequences" must include negatives — if you can't think of any, you
  haven't thought hard enough.
- ADRs are immutable once accepted. To change, add a new ADR that
  supersedes this one.
`,
  },

  {
    id: 'runbook',
    category: 'docs',
    description: 'Author an oncall runbook for one alert / incident class',
    suggestedFilename: 'runbook.md',
    content: `# Runbook Author

You write an oncall runbook for the supplied alert / incident class.

**Output exactly this structure (markdown)**

\`\`\`md
# Runbook: <alert name>

## What this alert means
<Plain-English meaning of the symptom — not the metric expression.>

## Severity & SLO impact
<Sev, who pages, customer impact if untreated.>

## First 5 minutes
1. <Confirm the symptom — link to dashboard panel>
2. <Check most-likely cause — link to query / log>
3. <Mitigate (revert / scale / failover) — exact command>

## Common causes
- <Cause> — <how to confirm> — <how to fix>

## Escalation
<Who to page if the first 5 minutes didn't recover it.>

## Followups (after the page)
- File a postmortem if customer impact > X minutes.
- Open a ticket on root cause if mitigation was a workaround.
\`\`\`

**Rules**

- Every step is concrete: a link, a query, a command — not "investigate".
- No advice that requires reading code during an incident.
- Mitigation comes before diagnosis — get customers green first.
`,
  },

  {
    id: 'getting-started-readme',
    category: 'docs',
    description: 'Author a project README "Getting started" section that actually works',
    suggestedFilename: 'getting-started-readme.md',
    content: `# Getting Started README Author

You author the "Getting started" section of a project README. A first-time
contributor should be able to clone → run a working version in ≤ 5 minutes.

**Output structure**

\`\`\`md
# <Project name>

> <One-line value proposition. What it does, for whom.>

## Quick start

\`\`\`bash
<exact commands, copy-pasteable, in order>
\`\`\`

That's it — open <local URL> to see it running.

## Prerequisites

- <Tool> ≥ <version> — \`<install command>\` or [link]
- <Tool> ≥ <version> — \`<install command>\` or [link]

## Common commands

| Command | What it does |
|---------|---------------|
| \`<cmd>\` | <one-line description> |

## Project layout

| Path | Purpose |
|------|---------|

## Need help?
- <Issue tracker / chat / docs link>
\`\`\`

**Rules**

- Quick-start must be **runnable as-is** — no \`<placeholders>\` the user has
  to fill in before the first command works.
- No prose explaining the architecture in the getting-started section. Link
  out to a separate doc.
- Don't list every Make target — list the ≤ 5 a first-time contributor uses.
- Pin versions only where the version actually matters. "Node 18+" is fine,
  "Node 18.17.1" is too specific.
`,
  },
];

export function findTemplate(id: string): SkillTemplate | undefined {
  return SKILL_TEMPLATES.find((t) => t.id === id);
}
