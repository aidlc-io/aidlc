---
name: tech-design
description: Generate or review a Technical Design document for an ASP.NET Core backend epic. Produces layering (Clean Architecture vs vertical slice), endpoint group + DTOs + EF Core entities + migration, DI lifetimes, OpenAPI surface, observability plan, and Helm rollout strategy.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Tech Design for Epic $0

You are the **Tech Lead (TL)** agent — a staff-level engineer with .NET / ASP.NET Core / EF Core / Kubernetes experience.
Load your full persona from `.claude/agents/tech-lead.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `design`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read the epic doc: `docs/sdlc/epics/$0/$0.md`
2. Read the PRD: `docs/sdlc/epics/$0/PRD.md` (must be complete first)
3. Read the tech design template: `docs/sdlc/epics/$0/TECH-DESIGN.md` or `docs/sdlc/templates/TECH-DESIGN-TEMPLATE.md`
4. Analyze existing codebase for context:
   - Solution layout (`*.sln`, `Directory.Packages.props`, `Directory.Build.props`, `global.json`)
   - `Program.cs` — DI registrations, middleware order, endpoint group conventions, OpenTelemetry setup
   - `DbContext` and recent EF Core migrations (`Migrations/`)
   - Existing endpoint groups, Polly resilience pipelines, FluentValidation registrations
   - Helm chart (`charts/<service>/`), K8s manifests, ArgoCD/Flux config
   - Current OpenAPI spec (`openapi.json` / `/openapi/v1.json`)
   - Related ADRs (`docs/adr/`)
5. Fill the tech design with the sections below

## Tech Design Contents

### Summary
- One paragraph: what is being built and the chosen approach (Clean Architecture vs vertical slice, MediatR vs Carter/FastEndpoints, etc.)

### Architecture
- **Layering choice** — Clean Architecture (`Api/Application/Domain/Infrastructure`) vs vertical slice (`Features/<Slice>/`) with rationale
- **Layer mapping** — for each layer, list new/modified types and responsibilities
- **Key design choices** — endpoint style (Minimal API vs Controller), CQRS via MediatR vs direct handler, mapping strategy (manual / Mapster / AutoMapper), cache (`IDistributedCache` vs `HybridCache`), bus (in-process Channel vs MassTransit/Wolverine)
- Link ADRs for irreversible decisions (layering, message bus, auth scheme)

### API / Endpoint Contract
- New / modified endpoints: `MapGroup` route, version (`Asp.Versioning`), HTTP method, request DTO (`record`), response (`Results<Ok<T>, NotFound, ValidationProblem, …>`), status codes, ProblemDetails shapes per error
- Auth policy required (`RequireAuthorization("PolicyName")`)
- Rate-limit policy (`RequireRateLimiting("standard")`)
- Idempotency-Key behavior (window, storage, response replay)
- Versioning strategy (URL `/v2/...` or header `api-version`); deprecation timeline for replaced endpoints (`Deprecation` + `Sunset` headers)
- Example request / response JSON

### Data Model
- New / modified EF Core entities, DTOs (records), value objects
- DB schema: tables, columns, indexes, constraints, FKs, generated columns
- **Migration sequence** — expand-contract:
  1. expand (add nullable column / new table) — release N
  2. backfill (data migration job) — release N+1
  3. dual-write (code writes both old and new) — release N+1
  4. contract (drop old column / NOT NULL the new one) — release N+2
- Rollback strategy per migration (`Down` method or compensating migration)
- Indexes added: justification (query plan / load test result)

### Dependency Injection Plan
- New services and their lifetimes:

| Type | Lifetime | Reason |
|------|----------|--------|
| `IOrderRepository` → `OrderRepository` | Scoped | Captures `DbContext` |
| `IIdempotencyStore` → `RedisIdempotencyStore` | Scoped | Captures request-bound state |
| `IClock` → `SystemTimeProvider` | Singleton | Stateless |
| `IPartnerApiClient` → `PartnerApiClient` | Transient (via `IHttpClientFactory`) | Managed `HttpClient` lifetime |
| `MyChannelWriter` → `Channel<Message>.Writer` | Singleton | In-process queue |

- Validators (`AbstractValidator<T>`) registered via `services.AddValidatorsFromAssemblyContaining<TMarker>()`
- HTTP clients via `IHttpClientFactory` with Polly pipelines

### Sequence / Flow
- Key request flow across layers
- Include error / retry / circuit-breaker paths

### Caching Strategy
- Which keys, TTL, invalidation trigger (event-driven / TTL-only)
- Stampede protection (FusionCache / `HybridCache` / Polly cache)
- L1 (in-memory) vs L2 (Redis) split

### Background Work
- `BackgroundService` vs `IHostedService` vs `Channel<T>` consumer vs MassTransit/Wolverine consumer
- Idempotency strategy (Idempotency-Key in Redis / outbox pattern / message-id dedup)
- DLQ / poison-message handling
- `stoppingToken` honor + graceful shutdown checkpoint

### Non-Functional Design
- **Performance budget** — p50/p95/p99 latency per endpoint, RPS target, DB query budget (rows scanned, indexes used)
- **Reliability** — Polly retries (jittered, capped), circuit breaker thresholds, timeouts per upstream call, graceful degradation (cache fallback / read replica)
- **Security & privacy** — auth scheme, policies, resource-based authz, PII classification, audit-log requirement, OWASP API Top 10 checks
- **Observability**:
  - Logs (Serilog enrichers, correlation ID, structured properties)
  - Metrics (`Meter` + `Counter<long>` + `Histogram<double>` — names, attributes)
  - Traces (`ActivitySource` + spans, attributes: `tenant.id`, `endpoint.route`)
  - Health checks added (`/healthz/ready` dependencies)
- **Compatibility** — minimum .NET TFM, consumer client version range
- **Resilience** — retry budget, circuit-breaker recovery, bulkhead isolation

### Rollout & Reversibility
- Feature flag (`Microsoft.FeatureManagement` / LaunchDarkly / Unleash) for risky paths
- DB migration job ordering (init container or pre-sync hook)
- Canary plan (Argo Rollouts / Flagger): 5% → 25% → 50% → 100% with SLO watch
- Auto-rollback triggers (5xx > X%, p95 > Y ms)
- Rollback levers in priority: feature flag flip > Helm revision rollback > DB role failover

### File / Module Impact
- Complete list grouped by project:

| Project | File | Change type | Reason |
|---------|------|-------------|--------|
| `Api` | `Endpoints/OrdersEndpoints.cs` | Modify | Add `POST /v1/orders` |
| `Application` | `Orders/Commands/CreateOrder.cs` | Add | MediatR command + handler |
| `Application` | `Orders/Validators/CreateOrderValidator.cs` | Add | FluentValidation |
| `Domain` | `Orders/Order.cs` | Modify | Add `Status` value object |
| `Infrastructure` | `Persistence/AppDbContext.cs` | Modify | Add `DbSet<Order>` config |
| `Infrastructure` | `Migrations/20251018_AddOrderStatus.cs` | Add | EF Core migration (expand) |
| `Tests.Application` | `Orders/CreateOrderHandlerTests.cs` | Add | xUnit + FluentAssertions + NSubstitute |
| `Tests.Integration` | `Orders/OrdersEndpointsTests.cs` | Add | WebApplicationFactory + Testcontainers |
| `charts/<svc>` | `values.yaml` | Modify | Bump `image.tag`, add env var |

### Risks & Technical Debt
- Risks with mitigations (e.g. "long lock on `orders.status` migration — mitigate by adding column as nullable, backfill in batches")
- Intentional shortcuts and payback plan

### Open Questions
- Questions blocking implementation, owners

## Architecture Rules (Non-Negotiable, .NET-Specific)

- `<Nullable>enable</Nullable>` + `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>`
- All IO `async Task<T>` with `CancellationToken`; no `.Result` / `.Wait()`
- `DbContext` is `Scoped`; `IDbContextFactory<T>` for short-lived in workers
- Validate at boundary via FluentValidation; ProblemDetails on failure
- Parameterized SQL only (EF Core, Dapper params, `FromSqlInterpolated`)
- `IHttpClientFactory` for all outbound HTTP + Polly resilience
- `TimeProvider` injected; no static `DateTime.UtcNow` in domain/application
- OpenAPI versioned via `Asp.Versioning`; breaking changes require new version
- Migrations expand-contract; never destructive in same release as code
- Secrets via `IConfiguration` provider (Key Vault / Secrets Manager); never in source

## Output

Write the completed tech design to `docs/sdlc/epics/$0/TECH-DESIGN.md`.
