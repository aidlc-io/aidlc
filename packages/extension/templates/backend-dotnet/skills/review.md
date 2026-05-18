---
name: review
description: Epic-driven code review for ASP.NET Core backend. Validates PR / branch / file / working tree against epic docs (PRD, Tech Design, Test Plan). Checks DI lifetimes, async patterns, EF Core query hygiene, FluentValidation, ProblemDetails, migration safety, OpenAPI diff, Testcontainers usage.
argument-hint: "[PR-number | file-path | branch-name | blank for uncommitted]"
---

# Code Review

You are the **Tech Lead (TL)** agent — a staff-level engineer reviewing ASP.NET Core backend code.
Load your full persona from `.claude/agents/tech-lead.md` before starting.
**Every review is grounded in epic docs.** No review without knowing which epic it belongs to.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `review`, epic = detect from branch/PR. If no epic key → skip gate. If gate fails → STOP.

## Step 1: Detect Input & Get Diff

### Mode A — PR Review (`/review 42` or `/review #42`)
Use the project's source-control platform (GitHub/GitLab/Azure DevOps) to fetch PR metadata, diff, comments.
Extract epic key (`{{EPIC_PREFIX}}-XXXX`) from PR title or branch name.

If API token unavailable: fall back to git:
```bash
git fetch origin
git diff origin/<default-branch>...origin/<source-branch>
```

### Mode B — Branch diff (`/review feature/{{EPIC_PREFIX}}-2100-...`)
```bash
git fetch origin
git log --oneline origin/<default-branch>..origin/$ARGUMENTS --no-merges
git diff origin/<default-branch>...origin/$ARGUMENTS
```

### Mode C — File review (`/review path/to/file.cs`)
```bash
cat $ARGUMENTS
git log --oneline -10 -- $ARGUMENTS
git diff HEAD -- $ARGUMENTS
```

### Mode D — Local changes (`/review` no args)
```bash
git diff
git diff --cached
git log --oneline -10
git branch --show-current
```

Extract epic key from branch / commit messages. If no key → ask user.

---

## Step 2: Load Epic Context

```
docs/sdlc/epics/{{EPIC_PREFIX}}-XXXX/
├── {{EPIC_PREFIX}}-XXXX.md
├── PRD.md
├── TECH-DESIGN.md
├── TEST-PLAN.md
├── APPROVAL.md
```

Also read domain / business docs from epic's Affected Areas.

Also read:
- `openapi.json` — current committed spec (compare diff)
- Recent migrations in `Migrations/`

---

## Step 3: Validate Against PRD

For each **acceptance criteria** in `PRD.md`:

| AC | Criteria | Status code | Implemented? | Evidence |
|----|----------|-------------|--------------|----------|
| {{EPIC_PREFIX}}-XXXX-AC01 | Given/When/Then | 201 | OK / Missing / Partial | `Api/Endpoints/OrdersEndpoints.cs:42` |

Flag:
- AC not implemented → **BLOCKER**
- AC partially implemented → **MAJOR**
- AC implemented differently (e.g. PRD said 201, code returns 202) → divergence (doc-sync needed)

---

## Step 4: Validate Against Tech Design

**File impact**:
- Files listed in tech design but missing in diff → missing implementation?
- Files in diff but not in tech design → scope creep or missed design step?

**Architecture**:
- Layering respected (Domain has no Infra ref; Application has no Api ref)?
- DI lifetimes match design (Scoped / Singleton / Transient)?
- New services registered in `Program.cs` or feature module's `AddXxx` extension?
- Endpoint registered in correct `MapGroup` with version + auth + rate-limit?

**API / OpenAPI**:
- New endpoints have `WithName`, `WithTags`, `Produces<T>`, `ProducesProblem` for OpenAPI?
- ProblemDetails shape matches design?
- Status codes match design?
- OpenAPI diff vs committed `openapi.json` reviewed?

**Data / Migration**:
- EF Core entity changes match design?
- Migration is expand-only (no destructive ops in same release as code)?
- Migration applied via init container or pre-sync hook in Helm?
- Index plan justified?

**Non-functional design**:
- Performance budget respected (no obvious N+1)?
- Polly resilience pipeline configured for new outbound HTTP?
- Observability signals added (Activity spans, Meter counters/histograms)?
- Health check added if new dependency?
- Feature flag in place for risky paths?

**Divergences** → flag for doc-sync (Step 7).

---

## Step 5: Validate Against Test Plan

From `TEST-PLAN.md`:
- Unit tests in diff match `{{EPIC_PREFIX}}-XXXX-UT-A*` / `-UT-V*` / `-UT-D*`?
- Integration tests against **Testcontainers Postgres** (NOT `InMemoryDatabase`)?
- WebApplicationFactory in-process API tests (`-IT-API`) present?
- FluentValidation rules each have a `-UT-V` test?
- Migration coexist test (`-MIG`) present?
- NetArchTest assertions (`-ARCH`) added or updated?
- AuthZ matrix tests (`-SEC`) for new public endpoints?
- Idempotency tests (`-IDEM`) for mutating endpoints?

Flag missing → MAJOR.

---

## Step 6: Code Quality Check (.NET-specific)

### Architecture & Design
- [ ] Layer boundaries respected (Domain → no Infra; Application → no Api)
- [ ] No `IServiceProvider` injected as service-locator
- [ ] No captive dependency (Scoped captured by Singleton)
- [ ] `IDbContextFactory<T>` used in `BackgroundService` / Channel consumer

### Correctness & Types
- [ ] `<Nullable>enable</Nullable>` clean; no `!` suppression without justification
- [ ] DTOs as `record` with `required` members where appropriate
- [ ] Pattern matching exhaustive
- [ ] FluentValidation at boundary; `Results.ValidationProblem(...)` on failure
- [ ] ProblemDetails for all error responses (no leaked stack traces)

### Async & Concurrency
- [ ] All IO `async Task<T>` with `CancellationToken`
- [ ] `CancellationToken` from `HttpContext.RequestAborted` / `stoppingToken`
- [ ] No `.Result` / `.Wait()` / `.GetAwaiter().GetResult()`
- [ ] No `async void` (except event handlers)
- [ ] `DbContext` not shared across `Task.WhenAll`
- [ ] `BackgroundService` honors `stoppingToken`

### EF Core
- [ ] `AsNoTracking()` for read paths
- [ ] Projection (`Select(...)`) over `Include()` where possible
- [ ] No N+1 (eyeballed; ideally test-asserted)
- [ ] Hot paths use `EF.CompileAsyncQuery` after profiling
- [ ] No `IEnumerable<T>` returned from data layer

### Error Handling
- [ ] No silent swallow on critical paths
- [ ] Expected business failures → `Result<T>` or typed exception → ProblemDetails
- [ ] Errors mapped to user-facing strings at presentation layer

### Security
- [ ] No hardcoded secrets / connection strings / URLs
- [ ] Parameterized SQL only (no `FromSqlRaw` with string concat)
- [ ] `[Authorize]` / `RequireAuthorization(...)` on protected endpoints
- [ ] HTTPS only, HSTS, secure cookies (`Secure`, `HttpOnly`, `SameSite=Strict`)
- [ ] CORS explicit, no `AllowAnyOrigin` with credentials
- [ ] No PII / JWT / connection-strings in logs
- [ ] `dotnet user-secrets` / Key Vault used; no `appsettings.json` secret

### Performance
- [ ] `IHttpClientFactory` used; no `new HttpClient()`
- [ ] Polly resilience pipeline on outbound HTTP
- [ ] Bounded caches with explicit TTL + invalidation
- [ ] No blocking calls on critical path
- [ ] `IDistributedCache` / `HybridCache` keys partitioned per tenant

### Observability
- [ ] Structured logs (no string interpolation in `_logger.LogX`)
- [ ] Correlation ID propagated
- [ ] `Activity` spans on cross-boundary calls
- [ ] `Meter` counters/histograms added per design
- [ ] Health checks updated for new deps

### Style / Tooling
- [ ] `dotnet format --verify-no-changes` clean
- [ ] Roslyn analyzers (`Microsoft.CodeAnalysis.NetAnalyzers`, `Roslynator`, `SonarAnalyzer.CSharp`) clean
- [ ] `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>` honored
- [ ] No dead code, no commented-out blocks
- [ ] File / class size within project limits

---

## Step 7: Check Doc Impact

Compare diff against domain / reference docs:
- OpenAPI spec — does committed `openapi.json` need regenerating?
- Consumer integration guides — auth / rate-limit / idempotency changed?
- Runbooks — new alerts / metrics?
- ADR needed for any irreversible decision (layering, message bus, auth scheme)?
- Deprecation register — anything sunset by this change?

Flag for `/doc-sync`.

---

## Output Format

```markdown
## Review: PR #XX — [{{EPIC_PREFIX}}-XXXX] Title

**Source**: feature/{{EPIC_PREFIX}}-XXXX-name → main
**Files changed**: X files (+Y, -Z)
**Epic**: [{{EPIC_PREFIX}}-XXXX](docs/sdlc/epics/{{EPIC_PREFIX}}-XXXX/{{EPIC_PREFIX}}-XXXX.md)

### Epic Docs Loaded
- [x] Epic doc — scope
- [x] PRD — N acceptance criteria
- [x] Tech Design — N files planned
- [x] Test Plan — N test cases
- [ ] Approval — approved / NOT approved

### PR Conventions
- Title format `[{{EPIC_PREFIX}}-XXXX]`: ok / fail
- Branch naming: ok / fail
- Description filled: ok / fail

### Acceptance Criteria vs Code
| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| {{EPIC_PREFIX}}-XXXX-AC01 | ... | Implemented | `Api/Endpoints/OrdersEndpoints.cs:42` |
| {{EPIC_PREFIX}}-XXXX-AC02 | ... | Missing | Not in diff |
| {{EPIC_PREFIX}}-XXXX-AC03 | ... | Partial | `...` — missing 409 path |

### Tech Design vs Code
| Check | Status | Notes |
|-------|--------|-------|
| File impact matches | ok / warn | Extra: X / Missing: Y |
| DI lifetimes correct | ok / fail | `OrderRepository` registered as Singleton — should be Scoped |
| OpenAPI diff reviewed | ok / warn | New endpoint missing `Produces<T>` |
| Migration expand-only | ok / fail | Column drop in same release → BLOCKER |
| Rate-limit + auth on new endpoints | ok / fail | |
| Observability signals | ok / warn | |

### Test Coverage vs Test Plan
| Test Case | In Diff? | Notes |
|-----------|---------|-------|
| {{EPIC_PREFIX}}-XXXX-UT-A01 | ok / fail | |
| {{EPIC_PREFIX}}-XXXX-IT-DB01 | ok / fail | |
| {{EPIC_PREFIX}}-XXXX-IT-API01 | ok / fail | |
| {{EPIC_PREFIX}}-XXXX-MIG01 | ok / fail | Coexist test missing |

### Code Quality Findings

**BLOCKER** — [file:line] `OrderRepository` registered as `Singleton` but injects `DbContext` (Scoped). Captive-dependency bug.
   Suggestion: change to `AddScoped<IOrderRepository, OrderRepository>()`.

**MAJOR** — [file:line] `Include(o => o.Items)` on read path returns full graph; projection would cut payload 80%.
   Suggestion: `.Select(o => new OrderDto(o.Id, o.Items.Count, ...))`.

**MINOR** — [file:line] `DateTime.UtcNow` used directly; inject `TimeProvider` for testability.

**NIT** — [file:line] consider `WithSummary("…")` for OpenAPI doc.

### Doc Impact
After merge, run `/doc-sync`:
- `openapi.json` — regenerate, new endpoint added
- `docs/integrations/web-spa.md` — `Idempotency-Key` header documented
- `docs/runbooks/orders-5xx.md` — update with new metric name

### Verdict
**Approve** / **Approve with comments** / **Changes requested**

**Reason**: [one sentence]
```
