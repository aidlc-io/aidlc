# Code Review Approval — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Reviewer:** Auto-Reviewer (Tech Lead persona, ASP.NET Core stack)
**Status:** Pending
**Created:** `$DATE`

---

## 1. Review Summary

> *One-paragraph verdict.*

**Verdict:** ⬜ Pass &nbsp;&nbsp; ⬜ Reject

## 2. Acceptance Criteria Validation

| AC | Description | Status code (planned) | Implemented? | Evidence |
|----|-------------|----------------------|--------------|----------|
| AC-01 | Create order happy path | 201 | ⬜ Pass / ⬜ Fail | `Api/Endpoints/OrdersEndpoints.cs:42` |
| AC-02 | Idempotency-Key replay | 201 (cached) | ⬜ Pass / ⬜ Fail | `Application/.../CreateOrderHandler.cs:18` |
| AC-03 | Validation failure | 400 ValidationProblem | ⬜ Pass / ⬜ Fail | `.../CreateOrderValidator.cs` |
| AC-04 | Missing JWT | 401 | ⬜ Pass / ⬜ Fail | endpoint group `RequireAuthorization("OrdersWrite")` |
| AC-05 | Insufficient scope | 403 | ⬜ Pass / ⬜ Fail | policy `OrdersWrite` |
| AC-06 | Rate-limit | 429 + Retry-After | ⬜ Pass / ⬜ Fail | `RequireRateLimiting("standard")` |
| AC-07 | Upstream down | 503 | ⬜ Pass / ⬜ Fail | Polly circuit breaker open → `ServiceUnavailable` |

## 3. Architecture Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Layering (Domain has no Infra ref; Application has no Api ref) | ⬜ | NetArchTest passing |
| DI lifetimes correct (Scoped / Singleton / Transient) | ⬜ | |
| `DbContext` not captured in singleton; `IDbContextFactory<T>` for workers | ⬜ | |
| Endpoint registered in correct `MapGroup` with version + auth + rate-limit | ⬜ | |
| FluentValidation at boundary; ProblemDetails on failure | ⬜ | |
| ProblemDetails shape per error matches design | ⬜ | |
| OpenAPI diff vs committed `openapi.json` reviewed | ⬜ | additive / version-bump / breaking |
| EF Core migration is expand-only this release | ⬜ | |
| Migration job ordering set in Helm (init container / pre-sync hook) | ⬜ | |
| Polly resilience pipeline on outbound HTTP | ⬜ | |
| `IHttpClientFactory` used (no `new HttpClient()`) | ⬜ | |
| Feature flag in place for risky path | ⬜ | |

## 4. Code Quality

| Check | Status | Notes |
|-------|--------|-------|
| Nullable enabled; no `!` suppression w/o justification | ⬜ | |
| All IO `async Task<T>` + `CancellationToken` propagated | ⬜ | |
| No `.Result` / `.Wait()` / `.GetAwaiter().GetResult()` | ⬜ | |
| No `async void` (except event handlers) | ⬜ | |
| EF Core: `AsNoTracking()` for reads, projection over `Include()` | ⬜ | |
| No N+1 (eyeballed; test-asserted where critical) | ⬜ | |
| Parameterized SQL only | ⬜ | |
| `TimeProvider` injected (not `DateTime.UtcNow`) | ⬜ | |
| Structured logs (no string interpolation in `_logger.LogX`) | ⬜ | |
| No PII / JWT / connection strings in logs or source | ⬜ | |
| `dotnet format --verify-no-changes` clean | ⬜ | |
| Roslyn analyzers (NetAnalyzers / Roslynator / Sonar) clean | ⬜ | |
| Unit tests in xUnit + FluentAssertions + NSubstitute | ⬜ | |
| Integration tests use **Testcontainers Postgres** (NOT `InMemoryDatabase`) | ⬜ | |
| WebApplicationFactory in-process API tests present | ⬜ | |
| NetArchTest assertions passing | ⬜ | |
| Mutation score (Stryker.NET) ≥ threshold on high-value modules | ⬜ | nightly |

## 5. Issues Found

### Critical (BLOCKER — must fix before approval)

| # | File | Issue | Required action |
|---|------|-------|----------------|
|   |      |       |                |

### Major

| # | File | Issue | Required action |
|---|------|-------|----------------|
|   |      |       |                |

### Minor / NIT

| # | File | Issue | Suggested action |
|---|------|-------|-----------------|
|   |      |       |                 |

## 6. Doc Impact

After merge, run `/doc-sync`:
- [ ] `openapi.json` regenerated and committed
- [ ] API reference site rebuilt (Redocly / Stoplight / Scalar)
- [ ] `docs/integrations/<consumer>.md` updated if consumer-facing semantics changed
- [ ] `docs/runbooks/<alert>.md` updated for new metrics / failure modes
- [ ] `CHANGELOG.md` entry under target release
- [ ] ADR written if irreversible decision (layering / message bus / auth)

## 7. Final Decision

- [ ] **APPROVED** — All ACs pass, no critical issues, gates green
- [ ] **REJECTED** — See issues above. Resubmit after fixes

**Reviewer notes:**

> *(free text)*
