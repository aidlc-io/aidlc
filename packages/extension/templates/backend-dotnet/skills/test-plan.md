---
name: test-plan
description: Generate a test plan for an ASP.NET Core backend epic. Covers xUnit unit + FluentAssertions + NSubstitute, Testcontainers integration, WebApplicationFactory in-process API tests, NetArchTest layer assertions, Stryker.NET mutation, Verify snapshot, NBomber / k6 load, and OWASP ZAP security.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Test Plan for Epic $0

You are the **QA Engineer (QA)** agent — a senior test practitioner with .NET backend test experience.
Load your full persona from `.claude/agents/qa.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `test-plan`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read epic: `docs/sdlc/epics/$0/$0.md`
2. Read PRD: `docs/sdlc/epics/$0/PRD.md` — AC drives test cases
3. Read tech design: `docs/sdlc/epics/$0/TECH-DESIGN.md` — file impact + DI graph + EF Core changes drive scope
4. Read existing tests / patterns / fixtures:
   - `tests/<Project>.UnitTests/` — xUnit setup, NSubstitute usage, Bogus builders
   - `tests/<Project>.IntegrationTests/` — Testcontainers `PostgreSqlContainer` fixture, `WebApplicationFactory<TProgram>` base class
   - `tests/Architecture/` — NetArchTest assertions
5. Read template: `docs/sdlc/epics/$0/TEST-PLAN.md` or `docs/sdlc/templates/TEST-PLAN-TEMPLATE.md`
6. Fill the test plan with sections below

## Test Plan Contents

### Test Scope
- Map each AC to one or more test types (UT-A / UT-V / UT-D / CT / IT-DB / IT-CACHE / IT-BUS / IT-API / MIG / ARCH / MUT / PF / SEC / IDEM)
- Call out what is **out of scope** and why

### Environment / Compatibility Matrix

| Dimension | Values |
|-----------|--------|
| **.NET TFM** | `net8.0` (LTS) (and `net9.0` if multi-target) |
| **Postgres** | 14 / 15 / 16 (Testcontainers image tag) |
| **Redis** | 7.x |
| **Kafka / RabbitMQ / SB** | per epic |
| **OS for CI** | `ubuntu-latest` primary, `windows-latest` for native-Windows-only paths |
| **Auth IDP** | Entra ID / Auth0 / IdentityServer — mock via `TestAuthHandler` in unit/integration |

Mark which combos are **must-test** vs **spot-check**. CI runs Testcontainers Postgres on every PR. Cross-DB-version matrix runs nightly.

### Unit — Application — prefix `$0-UT-A`
- Handlers (`IRequestHandler<,>` for MediatR; or direct handlers for vertical slice)
- Services, mappers, domain rules
- Deterministic: `FakeTimeProvider`, fixed seeds, no real network
- Tools: xUnit + FluentAssertions + NSubstitute + Bogus

### Unit — Validators — prefix `$0-UT-V`
- Every FluentValidation `RuleFor` — happy + invalid + boundary
- Use `FluentValidation.TestHelper` (`ShouldHaveValidationErrorFor`, `ShouldNotHaveValidationErrorFor`)

### Unit — Domain — prefix `$0-UT-D`
- Aggregates, value objects, domain events
- Invariants and state-transition rules
- No infrastructure dependency

### Contract — OpenAPI — prefix `$0-CT`
- Endpoint schema diff vs committed `openapi.json`
- ProblemDetails shape per error case
- Status codes match PRD ACs
- Version negotiation (`/v1/...` or `api-version` header)
- Tools: `WebApplicationFactory<TProgram>` + **Verify.Xunit** snapshot

### Integration — DB — prefix `$0-IT-DB`
- EF Core against **real Postgres via Testcontainers** (`Testcontainers.PostgreSql`), **NOT `InMemoryDatabase`**
- Migrations apply cleanly (clean + on top of last release schema)
- Transactions, isolation level, concurrency conflicts (`DbUpdateConcurrencyException`)
- Hot-path query plan verified (no N+1, indexes hit)

### Integration — Cache — prefix `$0-IT-CACHE`
- Redis via `Testcontainers.Redis`
- Cache hit / miss / TTL expiry
- Stampede protection behaves as designed (FusionCache / `HybridCache`)
- Key partitioning per tenant correct

### Integration — Message bus — prefix `$0-IT-BUS` (if applicable)
- MassTransit / Wolverine consumer against real broker (`Testcontainers.RabbitMq` / `Testcontainers.Kafka`)
- At-least-once delivery, dedup behaves as designed
- Poison message routed to DLQ
- Outbox dispatch ordering preserved

### Integration — API in-process — prefix `$0-IT-API`
- `WebApplicationFactory<TProgram>` with Testcontainer-backed `DbContext` override
- Full HTTP pipeline: auth → rate-limit → validation → handler → EF Core → response
- Use `TestAuthHandler` to inject JWT claims
- Every new endpoint has one happy-path + at least one error case

### Migration — prefix `$0-MIG`
- Apply migrations from scratch on empty DB
- Apply on top of last-released schema (verify no destructive break)
- Verify old code (previous release) still works after migration applied (coexist test)
- Verify `Down` migration (or compensating migration) works

### End-to-End — prefix `$0-E2E` (thin)
- Smoke pack via `HttpClient` against staging / preview env
- Bruno / Postman collection runnable in CI

### Architecture — prefix `$0-ARCH`
- **NetArchTest** assertions: Domain has no Infra ref; Application has no Api ref; Endpoints only call MediatR/handlers (not `DbContext` directly)
- Naming conventions (`*Handler`, `*Validator`, `*Endpoints`)
- `[Authorize]` / `RequireAuthorization(...)` on every public endpoint group

### Mutation — prefix `$0-MUT`
- **Stryker.NET** on high-value modules (validators, mappers, domain logic)
- Mutation score threshold (typical ≥ 70%)
- Run nightly; PR-blocking only on critical modules

### Performance — prefix `$0-PF`
- **NBomber** (.NET-native) or **k6** (script)
- Scenarios: steady-state RPS, ramp to peak, soak (30 min), spike (sudden 5×)
- Thresholds: p95 < X ms, p99 < Y ms, error rate < Z%, throughput ≥ N RPS
- Saturation criteria: CPU < 70%, DB connection pool wait p95 < 50ms, no GC Gen2 pressure

### Security — prefix `$0-SEC`
- AuthZ matrix: anonymous / wrong scope / wrong role / wrong tenant / correct
- Input fuzz on every new endpoint (oversized payload, malformed JSON, SQL injection attempt — must be rejected before SQL layer)
- OWASP ZAP scan nightly
- No secrets in artifact (Trivy / gitleaks scan)
- Image scan (Trivy / Snyk) — fail on HIGH/CRITICAL

### Idempotency — prefix `$0-IDEM` (for mutating endpoints)
- Same Idempotency-Key replays return identical response from cache
- Different Idempotency-Key with same body creates new resource (or business-rule violation if applicable)
- Idempotency-Key TTL expiry behavior
- Concurrent requests with same key serialize correctly

### Regression Checklist
- Core endpoints that must still work after this change (auth, top-traffic endpoints)

### Test Data Strategy
- **Bogus** builders for entities and DTOs (centralized in `tests/Shared/Builders/`)
- Per-test data isolation: each `WebApplicationFactory` uses a fresh Testcontainer or a transaction scope rolled back at test end
- No shared mutable state across tests

### Flaky-Test Policy
- `FakeTimeProvider` for clocks; fixed `Bogus.Faker` seed; deterministic Redis keys per test class
- Testcontainers fresh per test class via `IClassFixture<>`; parallel test classes allowed if container ports are dynamic
- Quarantine flaky tests; fix or delete — don't retry-to-green
- Mark tests requiring real infra unavailable in CI: `[Trait("Category", "Manual")]`

## Output

Write the completed test plan to `docs/sdlc/epics/$0/TEST-PLAN.md`.
