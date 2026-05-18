# Technical Design — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Tech Lead
**Status:** Draft
**Created:** `$DATE`
**Service:** `<service-name>` (ASP.NET Core, .NET 8/9, EF Core 8+, Postgres 16, Redis 7)

---

## 1. Overview

> *One-paragraph summary: layering choice (Clean Architecture vs vertical slice), endpoint style (Minimal API vs Controller), CQRS (MediatR vs vertical slice), mapping (manual / Mapster / AutoMapper).*

## 2. Architecture

```
[ Client ] ──HTTPS/JWT──► [ Api ] ──MediatR──► [ Application ]
                            │                       │
                            │                       ├──► [ Domain ]
                            │                       │
                            ▼                       ▼
                       [ Validation ]      [ Infrastructure ]
                       (FluentValidation)    │       │
                                             ▼       ▼
                                          [ EF Core ]  [ Polly + HttpClient ]
                                             │              │
                                             ▼              ▼
                                          [ Postgres ]   [ Partner API ]
                                                   ▲
                                                   │
                                            [ Redis cache ]
```

### 2.1 Layering Choice

> *Clean Architecture (Api / Application / Domain / Infrastructure) — rationale: existing solution uses Clean; new feature fits naturally.*
> *Or: Vertical slice (`Features/Orders/`) — rationale: feature is self-contained, no cross-feature coupling.*

### 2.2 New Components

| Project | Type | Responsibility | Lifetime |
|---------|------|----------------|----------|
| `Api` | `OrdersEndpoints` (static class) | Minimal API endpoint group `/v1/orders` | n/a |
| `Application` | `CreateOrderCommand : IRequest<Result<OrderId>>` | CQRS command DTO (record) | n/a |
| `Application` | `CreateOrderHandler : IRequestHandler<...>` | Handle command, orchestrate domain + persistence | Scoped (via MediatR) |
| `Application` | `CreateOrderValidator : AbstractValidator<CreateOrderCommand>` | FluentValidation rules | Singleton (validators are stateless) |
| `Domain` | `Order` (aggregate root) | Business invariants for order state | n/a |
| `Domain` | `OrderStatus` (value object) | Strongly-typed status enum-ish | n/a |
| `Infrastructure` | `AppDbContext` (modified) | Add `DbSet<Order>` config + index | Scoped |
| `Infrastructure` | `RedisIdempotencyStore : IIdempotencyStore` | Store + replay Idempotency-Key responses | Scoped |
| `Infrastructure` | `PartnerApiClient : IPartnerApiClient` | Typed HTTP client with Polly | Transient (managed by `IHttpClientFactory`) |

## 3. API Contract

### Endpoint: `POST /v1/orders`

**Auth**: `RequireAuthorization("OrdersWrite")` — scope `orders:write`
**Rate-limit**: `RequireRateLimiting("standard")`
**Idempotency**: `Idempotency-Key` header required

**Request DTO** (`Application/Orders/Commands/CreateOrder.cs`):
```csharp
public sealed record CreateOrderRequest(
    string CustomerId,
    IReadOnlyList<OrderItemDto> Items,
    string? Notes);

public sealed record OrderItemDto(string Sku, int Quantity, decimal UnitPrice);
```

**Response (201)**:
```json
{
  "id": "01HK8XQZ...",
  "status": "Pending",
  "createdAt": "2026-05-18T10:00:00Z"
}
```

**Headers**: `Location: /v1/orders/{id}`

**Error responses (ProblemDetails)**:
| Status | When | `type` |
|--------|------|--------|
| 400 | Validation failed | `https://api.example.com/problems/validation` |
| 401 | Missing/invalid JWT | `https://api.example.com/problems/auth` |
| 403 | Insufficient scope | `https://api.example.com/problems/forbidden` |
| 409 | Business rule violation (e.g. duplicate order ref) | `https://api.example.com/problems/conflict` |
| 429 | Rate-limit exceeded | `https://api.example.com/problems/rate-limit` |
| 503 | Upstream payment service down | `https://api.example.com/problems/upstream-unavailable` |

**Versioning**: URL segment `/v1/...` via `Asp.Versioning`. Breaking changes go to `/v2/...` with 90-day deprecation notice.

### Endpoint sketch (Minimal API):
```csharp
public static class OrdersEndpoints
{
    public static IEndpointRouteBuilder MapOrders(this IEndpointRouteBuilder app)
    {
        var group = app
            .MapGroup("/v1/orders")
            .WithTags("Orders")
            .RequireAuthorization("OrdersWrite")
            .RequireRateLimiting("standard")
            .WithOpenApi();

        group.MapPost("/", CreateOrder)
            .WithName("CreateOrder")
            .Produces<OrderResponse>(StatusCodes.Status201Created)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable);

        return app;
    }

    private static async Task<Results<Created<OrderResponse>, ValidationProblem, Conflict<ProblemDetails>>>
        CreateOrder(
            CreateOrderRequest request,
            [FromHeader(Name = "Idempotency-Key")] string idempotencyKey,
            ISender mediator,
            CancellationToken ct)
    {
        var result = await mediator.Send(
            new CreateOrderCommand(request, idempotencyKey),
            ct);

        return result.Match<Results<Created<OrderResponse>, ValidationProblem, Conflict<ProblemDetails>>>(
            order => TypedResults.Created($"/v1/orders/{order.Id}", order),
            errors => TypedResults.ValidationProblem(errors),
            conflict => TypedResults.Conflict(conflict));
    }
}
```

## 4. Data Model

### New table: `orders`

```sql
CREATE TABLE orders (
    id            UUID         PRIMARY KEY,                         -- GUID v7 generated at boundary
    tenant_id     UUID         NOT NULL,
    customer_id   VARCHAR(64)  NOT NULL,
    status        VARCHAR(32)  NOT NULL DEFAULT 'Pending',
    total_amount  NUMERIC(18,2) NOT NULL,
    notes         TEXT         NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    row_version   BYTEA        NOT NULL                            -- xmin or explicit, for concurrency
);

CREATE INDEX ix_orders_tenant_created ON orders (tenant_id, created_at DESC);
CREATE INDEX ix_orders_tenant_status ON orders (tenant_id, status) WHERE status != 'Closed';
```

### EF Core entity

```csharp
public sealed class Order
{
    public OrderId Id { get; private set; }
    public TenantId TenantId { get; private set; }
    public string CustomerId { get; private set; }
    public OrderStatus Status { get; private set; }
    public decimal TotalAmount { get; private set; }
    public string? Notes { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public byte[] RowVersion { get; private set; } = null!;

    private Order() { } // EF Core

    public static Order Create(/* ... */) { /* invariants */ }
    public Result Close() { /* state transition */ }
}
```

### Migration sequence (expand-contract)

| Release | Migration | Type |
|---------|-----------|------|
| v1.4.0 | `20251018_AddOrdersTable` | expand (new table) |
| v1.4.0 | `20251018_AddOrdersIndexes` | expand (indexes added concurrently) |
| v1.5.0 | (no migration; new code uses new schema) | — |
| v1.6.0 | `20251101_DropOrdersLegacyView` | contract (only after all instances on v1.4+) |

All migrations have `Down` methods; non-trivial migrations get a compensating-migration plan.

## 5. Dependency Injection Plan

| Interface | Implementation | Lifetime | Reason |
|-----------|---------------|----------|--------|
| `IRequestHandler<CreateOrderCommand, ...>` | `CreateOrderHandler` | Scoped (via MediatR) | Captures `DbContext` |
| `IValidator<CreateOrderRequest>` | `CreateOrderValidator` | Singleton | Stateless |
| `IIdempotencyStore` | `RedisIdempotencyStore` | Scoped | Per-request context |
| `IPartnerApiClient` | `PartnerApiClient` | Transient (via `IHttpClientFactory`) | Managed `HttpClient` lifetime |
| `TimeProvider` | `TimeProvider.System` | Singleton | Stateless; `FakeTimeProvider` in tests |

### Registration (in `Program.cs` or `OrdersModule`)

```csharp
services.AddValidatorsFromAssemblyContaining<CreateOrderValidator>();
services.AddScoped<IIdempotencyStore, RedisIdempotencyStore>();
services.AddSingleton(TimeProvider.System);

services
    .AddHttpClient<IPartnerApiClient, PartnerApiClient>(c =>
        c.BaseAddress = new Uri(builder.Configuration["Partner:BaseUrl"]!))
    .AddResilienceHandler("partner", builder =>
    {
        builder.AddRetry(new HttpRetryStrategyOptions { MaxRetryAttempts = 3, UseJitter = true });
        builder.AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions { FailureRatio = 0.5 });
        builder.AddTimeout(TimeSpan.FromSeconds(10));
    });
```

## 6. File Impact List

| Project | File | Change type | Reason |
|---------|------|-------------|--------|
| `Api` | `Endpoints/OrdersEndpoints.cs` | Add | Minimal API endpoint group |
| `Api` | `Program.cs` | Modify | Register endpoint group, validator assembly, idempotency store |
| `Application` | `Orders/Commands/CreateOrder.cs` | Add | MediatR command record |
| `Application` | `Orders/Commands/CreateOrderHandler.cs` | Add | Handler |
| `Application` | `Orders/Validators/CreateOrderValidator.cs` | Add | FluentValidation rules |
| `Application` | `Orders/Dtos/OrderResponse.cs` | Add | Response DTO |
| `Domain` | `Orders/Order.cs` | Add | Aggregate root |
| `Domain` | `Orders/OrderStatus.cs` | Add | Value object |
| `Domain` | `Orders/OrderId.cs` | Add | Strongly-typed ID |
| `Infrastructure` | `Persistence/AppDbContext.cs` | Modify | `DbSet<Order>` + `OrderConfiguration` |
| `Infrastructure` | `Persistence/Configurations/OrderConfiguration.cs` | Add | EF Core type config |
| `Infrastructure` | `Migrations/20251018_AddOrdersTable.cs` | Add | EF migration |
| `Infrastructure` | `Idempotency/RedisIdempotencyStore.cs` | Add | Idempotency implementation |
| `Infrastructure` | `Partners/PartnerApiClient.cs` | Add | Typed HTTP client |
| `Tests.Unit` | `Application/Orders/CreateOrderHandlerTests.cs` | Add | xUnit + NSubstitute |
| `Tests.Unit` | `Application/Orders/CreateOrderValidatorTests.cs` | Add | FluentValidation.TestHelper |
| `Tests.Unit` | `Domain/Orders/OrderTests.cs` | Add | Pure domain tests |
| `Tests.Integration` | `Orders/OrdersEndpointsTests.cs` | Add | WebApplicationFactory + Testcontainers Postgres |
| `Tests.Integration` | `Migrations/OrderMigrationTests.cs` | Add | Migration coexist test |
| `Tests.Architecture` | `LayeringTests.cs` | Modify | NetArchTest assertion |
| `charts/<svc>` | `values.yaml` | Modify | `image.tag`, new env vars |
| `charts/<svc>` | `templates/job-migrate.yaml` | Modify | New migration job revision |
| `openapi.json` | (root) | Modify (regenerated) | New endpoint surface |

## 7. Caching Strategy

| Key | Layer | TTL | Invalidation |
|-----|-------|-----|--------------|
| `orders:list:{tenant}:{cursor}:{limit}` | Redis | 60s | TTL only |
| `orders:idem:{tenant}:{key}` | Redis | 24h | TTL only (Idempotency-Key replay) |

Stampede protection: `HybridCache` (.NET 9) — automatic single-flight per key.

## 8. Security Considerations

- JWT scheme: `JwtBearerDefaults.AuthenticationScheme`; issuer = Entra ID; algorithm `RS256`
- Policies: `OrdersRead` (scope `orders:read`), `OrdersWrite` (scope `orders:write`)
- Tenant isolation: `tenant_id` extracted from JWT claim; every query filters `WHERE tenant_id = @t`
- Input validation: FluentValidation at boundary; nothing trusted from `[FromBody]`
- SQL: EF Core only; no raw SQL with string interpolation
- HTTPS only, HSTS enabled, secure cookies (`Secure`, `HttpOnly`, `SameSite=Strict`)
- No PII / JWT / connection-string in logs

## 9. Performance Considerations

- p95 budget: 200 ms at 500 RPS
- DB query budget: ≤ 2 round-trips per request; index hit verified via `EXPLAIN ANALYZE`
- Read paths use `AsNoTracking()` + projection
- Hot list query compiled via `EF.CompileAsyncQuery`
- Outbound HTTP via `IHttpClientFactory` + Polly (retry+CB+timeout 10s)

## 10. Observability

- Logs (Serilog enrichers): `correlation_id`, `tenant_id`, `endpoint`, `status`, `duration_ms`
- Metrics (`Meter` named `Orders`):
  - `orders_created_total` (Counter)
  - `orders_create_duration_ms` (Histogram)
  - `orders_idempotency_replay_total` (Counter)
- Traces: `ActivitySource("Orders")` — span per handler with `tenant.id`, `idempotency.key.hash`
- Health checks: `/healthz/ready` includes Postgres + Redis + Partner API ping

## 11. Rollout & Reversibility

- **Feature flag**: `Microsoft.FeatureManagement` flag `OrdersV1Enabled`, default-off, flip on per-tenant via config refresh
- **Migration**: runs as **init container** in pod (blocks readiness until applied); expand-only in this release
- **Canary**: Argo Rollouts 5% → 25% → 50% → 100%, auto-rollback if 5xx > 5% or p95 > 400 ms over 5 min
- **Rollback**: `helm rollback <release> <prev-rev>`; `Order` table is additive — old code unaware

## 12. Open Questions / Risks

| # | Question / Risk | Owner | Status |
|---|----------------|-------|--------|
| 1 | Partner API SLA — needs confirmation for circuit-breaker threshold | TL + Partner X | Open |
| 2 | Should Idempotency-Key TTL be 24h or 7d? | PO | Open |
| 3 | Risk: rate-limit per API key — may exceed for high-volume partner; mitigation: dedicated bucket | TL | Mitigated (separate policy) |
