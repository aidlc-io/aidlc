# Test Plan — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** QA
**Status:** Draft
**Created:** `$DATE`
**Service:** `<service-name>` (ASP.NET Core, .NET 8/9)

---

## 1. Scope

> *What is being tested? What is explicitly out of scope?*

**In scope:**
- New endpoint `POST /v1/orders` end-to-end (Api → Application → Domain → Infrastructure → Postgres)
- FluentValidation rules for `CreateOrderRequest`
- Idempotency-Key replay behavior (Redis-backed)
- Polly resilience pipeline on Partner API client
- EF Core migration `20251018_AddOrdersTable` clean apply + coexist
- NetArchTest assertions for new types

**Out of scope:**
- Partner API internal behavior (mocked / wiremock)
- Idempotency replay > 24h window (acceptance: behaves as new request)

## 2. Test Strategy

| Type | Tool / Approach | Project | Owner |
|------|----------------|---------|-------|
| Unit (Application) | xUnit + FluentAssertions + NSubstitute + Bogus | `Tests.Unit` | Dev |
| Unit (Validators) | xUnit + `FluentValidation.TestHelper` | `Tests.Unit` | Dev |
| Unit (Domain) | xUnit + FluentAssertions | `Tests.Unit` | Dev |
| Contract (OpenAPI) | `WebApplicationFactory<TProgram>` + **Verify.Xunit** snapshot | `Tests.Integration` | QA |
| Integration (DB) | **Testcontainers.PostgreSql** | `Tests.Integration` | QA + Dev |
| Integration (Cache) | **Testcontainers.Redis** | `Tests.Integration` | QA |
| Integration (API) | `WebApplicationFactory<TProgram>` with Testcontainer DB + `TestAuthHandler` | `Tests.Integration` | QA |
| Migration | xUnit migration apply test | `Tests.Integration` | Dev |
| Architecture | **NetArchTest** | `Tests.Architecture` | TL |
| Mutation (nightly) | **Stryker.NET** | (CI job) | QA |
| Performance | **NBomber** | `Tests.Performance` | QA |
| Security | OWASP ZAP nightly + manual authz matrix | (CI job) | QA |

## 3. Test Cases

### TC-01 — `$EPIC_ID-UT-A01` — `CreateOrderHandler` happy path

**Project**: `Tests.Unit`
**Preconditions**: `DbContext` faked with NSubstitute; `IIdempotencyStore` returns `null` for fresh key; `TimeProvider` is `FakeTimeProvider(2026-05-18T10:00:00Z)`

**Steps**:
1. Construct `CreateOrderCommand` with valid `CreateOrderRequest`
2. Call `handler.Handle(cmd, CancellationToken.None)`

**Expected**:
- Result is `Result<OrderId>.Success`
- `db.Orders.AddAsync` called once with `Status == Pending`
- `db.SaveChangesAsync` called once
- `idempotencyStore.SaveAsync` called once with the key

**AC covered**: AC-01

---

### TC-02 — `$EPIC_ID-UT-V01` — `CreateOrderValidator` empty items

**Project**: `Tests.Unit`

**Steps**:
1. Build request with `Items` = empty list
2. Validate

**Expected**:
- `ValidationResult.IsValid` = false
- Error for `Items` with message contains "at least 1 item"

**AC covered**: AC-03

---

### TC-03 — `$EPIC_ID-IT-API01` — `POST /v1/orders` happy path via WebApplicationFactory

**Project**: `Tests.Integration`
**Preconditions**: Testcontainer Postgres + Redis running per class fixture; `TestAuthHandler` registered with claims `scope=orders:write, tenant_id=t1`

**Steps**:
1. `var response = await client.PostAsJsonAsync("/v1/orders", request, headers: { "Idempotency-Key": "abc" });`
2. Read response JSON

**Expected**:
- Status 201 Created
- `Location` header = `/v1/orders/{id}`
- Body matches `Verify` snapshot
- `orders` table has 1 row with `tenant_id = t1`, `status = Pending`
- Redis key `orders:idem:t1:abc` exists with serialized response

**AC covered**: AC-01

---

### TC-04 — `$EPIC_ID-IDEM01` — Idempotency-Key replay returns cached response

**Project**: `Tests.Integration`

**Steps**:
1. POST `/v1/orders` with `Idempotency-Key: abc` → 201
2. POST same body + same key

**Expected**:
- Second response is 201 with **identical** body (including `id`, `createdAt`)
- `orders` table still has 1 row

**AC covered**: AC-02

---

### TC-05 — `$EPIC_ID-SEC01` — Auth matrix

**Project**: `Tests.Integration`

| Case | Token | Expected |
|------|-------|----------|
| No token | — | 401 |
| Token with `orders:read` only | scope mismatch | 403 |
| Token with `orders:write`, tenant `t1` | correct | 201 |
| Token with `orders:write`, but request body refs tenant `t2` | tenant boundary | 404 (no existence leak) |

**AC covered**: AC-04, AC-05

---

### TC-06 — `$EPIC_ID-MIG01` — Migration coexist test

**Project**: `Tests.Integration`

**Steps**:
1. Apply previous-release schema (clone of v1.3.0 migrations)
2. Apply new migration `20251018_AddOrdersTable`
3. Run v1.3.0 read query against tables it knows about → must still succeed
4. Run new code → must succeed

**Expected**: Both queries succeed; no schema drift errors

---

### TC-07 — `$EPIC_ID-ARCH01` — Layering assertions

**Project**: `Tests.Architecture`

```csharp
[Fact]
public void Domain_should_not_depend_on_Infrastructure()
{
    var result = Types.InAssembly(typeof(Order).Assembly)
        .Should()
        .NotHaveDependencyOn("MyService.Infrastructure")
        .GetResult();
    result.IsSuccessful.Should().BeTrue();
}
```

---

### TC-08 — `$EPIC_ID-PF01` — Load test: 500 RPS sustained 5 min

**Tool**: NBomber

**Scenario**:
```csharp
var scenario = Scenario.Create("create_order_500rps", async ctx =>
{
    var response = await client.PostAsJsonAsync("/v1/orders", builder.Build(),
        headers: { ["Idempotency-Key"] = Guid.NewGuid().ToString() });
    return response.IsSuccessStatusCode ? Response.Ok() : Response.Fail();
})
.WithLoadSimulations(Simulation.Inject(rate: 500, interval: TimeSpan.FromSeconds(1), during: TimeSpan.FromMinutes(5)));
```

**Thresholds**:
- p95 < 200 ms
- p99 < 500 ms
- Error rate < 0.5%
- DB pool WaitTime p95 < 50 ms

## 4. Coverage Targets

| Project | Target line | Target branch | Notes |
|---------|-------------|---------------|-------|
| `Application` | ≥ 80% | ≥ 70% | |
| `Domain` | ≥ 90% | ≥ 80% | Pure logic — easy to cover |
| `Infrastructure` | ≥ 65% | ≥ 50% | Thin adapters |
| Mutation (Stryker.NET) on `Domain` | ≥ 75% mutation score | — | Nightly |

## 5. Environment Matrix

| Dimension | Value |
|-----------|-------|
| **.NET TFM** | `net8.0` |
| **Postgres** | 16 (Testcontainers `postgres:16-alpine`) |
| **Redis** | 7 (Testcontainers `redis:7-alpine`) |
| **OS** | `ubuntu-latest` |

Cross-DB-version (15 / 16 / 17) runs nightly.

## 6. Performance Benchmarks

| Scenario | Tool | Threshold |
|----------|------|-----------|
| `POST /v1/orders` @ 500 RPS sustained | NBomber | p95 < 200 ms, error < 0.5% |
| `GET /v1/orders` @ 1000 RPS sustained | NBomber | p95 < 100 ms, error < 0.1% |
| Cold start | `dotnet run` + measure first request | < 2s |
| Memory after 30 min soak | dotnet-counters | < 250 MB working set |
| GC Gen2 / min | dotnet-counters | < 2 |

## 7. Regression Checklist

> *Existing flows that must still work after this change.*

- [ ] `GET /v1/health/live` returns 200
- [ ] `GET /v1/health/ready` returns 200 (Postgres + Redis + Partner)
- [ ] Existing `GET /v1/customers/{id}` works (top-traffic endpoint)
- [ ] Auth flow: token issuance + introspection
- [ ] Rate-limit applied per policy

## 8. Sign-off Criteria

- [ ] All TC-xx pass on CI
- [ ] Unit coverage ≥ targets
- [ ] Mutation score ≥ target (nightly)
- [ ] No P1 open bugs
- [ ] Load test thresholds met
- [ ] OpenAPI diff reviewed
- [ ] Security scan (Trivy / OWASP ZAP) clean (no HIGH/CRITICAL)
- [ ] QA sign-off
