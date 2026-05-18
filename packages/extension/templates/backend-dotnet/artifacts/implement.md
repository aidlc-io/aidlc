# Implementation Summary — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Developer
**Branch:** `feature/$EPIC_ID-<slug>`
**Status:** Draft
**Created:** `$DATE`

---

## 1. Branch & PR

| Item   | Value |
|--------|-------|
| Branch | `feature/$EPIC_ID-<slug>` |
| PR     | *(link once opened)* |
| Base   | `main` |
| Target release | `vX.Y.Z` |

## 2. Files Changed

| Project | File | Type | Description |
|---------|------|------|-------------|
| `Api` | `Endpoints/OrdersEndpoints.cs` | Add | Minimal API group `POST /v1/orders` |
| `Api` | `Program.cs` | Modify | Register endpoints, validators, idempotency |
| `Application` | `Orders/Commands/CreateOrder.cs` | Add | MediatR command + handler |
| `Application` | `Orders/Validators/CreateOrderValidator.cs` | Add | FluentValidation |
| `Application` | `Orders/Dtos/OrderResponse.cs` | Add | Response record |
| `Domain` | `Orders/Order.cs` | Add | Aggregate root |
| `Domain` | `Orders/OrderId.cs` | Add | Strongly-typed ID |
| `Infrastructure` | `Persistence/AppDbContext.cs` | Modify | `DbSet<Order>` |
| `Infrastructure` | `Persistence/Configurations/OrderConfiguration.cs` | Add | EF type config |
| `Infrastructure` | `Migrations/20251018_AddOrdersTable.cs` | Add | EF migration |
| `Infrastructure` | `Idempotency/RedisIdempotencyStore.cs` | Add | Idempotency impl |
| `Tests.Unit` | `Application/Orders/CreateOrderHandlerTests.cs` | Add | xUnit |
| `Tests.Integration` | `Orders/OrdersEndpointsTests.cs` | Add | WebApplicationFactory + Testcontainers |
| `charts/<svc>` | `values.yaml` | Modify | image.tag bump, new env vars |
| `openapi.json` | (root) | Modify | Regenerated |

## 3. Implementation Notes

> *Key decisions made during implementation. Reference tech-design sections where relevant.*

### Endpoint sketch

```csharp
// Api/Endpoints/OrdersEndpoints.cs
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
            .ProducesProblem(StatusCodes.Status409Conflict);

        return app;
    }

    private static async Task<Results<Created<OrderResponse>, ValidationProblem, Conflict<ProblemDetails>>>
        CreateOrder(
            CreateOrderRequest request,
            [FromHeader(Name = "Idempotency-Key")] string idempotencyKey,
            ISender mediator,
            CancellationToken ct)
    {
        var result = await mediator.Send(new CreateOrderCommand(request, idempotencyKey), ct);
        return result.Match<...>(
            order => TypedResults.Created($"/v1/orders/{order.Id}", order),
            errors => TypedResults.ValidationProblem(errors),
            conflict => TypedResults.Conflict(conflict));
    }
}
```

### Handler sketch

```csharp
// Application/Orders/Commands/CreateOrderHandler.cs
public sealed class CreateOrderHandler(
    AppDbContext db,
    IIdempotencyStore idempotency,
    TimeProvider clock,
    ILogger<CreateOrderHandler> logger)
    : IRequestHandler<CreateOrderCommand, Result<OrderResponse>>
{
    public async Task<Result<OrderResponse>> Handle(CreateOrderCommand cmd, CancellationToken ct)
    {
        var cached = await idempotency.GetAsync<OrderResponse>(cmd.TenantId, cmd.IdempotencyKey, ct);
        if (cached is not null)
        {
            logger.LogInformation("Idempotency replay for tenant {TenantId} key {Key}",
                cmd.TenantId, cmd.IdempotencyKey);
            return Result.Success(cached);
        }

        var order = Order.Create(cmd.TenantId, cmd.Request.CustomerId, cmd.Request.Items, clock.GetUtcNow());
        await db.Orders.AddAsync(order, ct);
        await db.SaveChangesAsync(ct);

        var response = new OrderResponse(order.Id.Value, order.Status.ToString(), order.CreatedAt);
        await idempotency.SaveAsync(cmd.TenantId, cmd.IdempotencyKey, response, TimeSpan.FromHours(24), ct);

        return Result.Success(response);
    }
}
```

### Validator sketch

```csharp
// Application/Orders/Validators/CreateOrderValidator.cs
public sealed class CreateOrderValidator : AbstractValidator<CreateOrderRequest>
{
    public CreateOrderValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty().MaximumLength(64);
        RuleFor(x => x.Items).NotEmpty().WithMessage("At least 1 item is required");
        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(x => x.Sku).NotEmpty().MaximumLength(32);
            item.RuleFor(x => x.Quantity).GreaterThan(0).LessThanOrEqualTo(1000);
            item.RuleFor(x => x.UnitPrice).GreaterThanOrEqualTo(0);
        });
    }
}
```

### EF Core entity + config

```csharp
// Infrastructure/Persistence/Configurations/OrderConfiguration.cs
public sealed class OrderConfiguration : IEntityTypeConfiguration<Order>
{
    public void Configure(EntityTypeBuilder<Order> b)
    {
        b.ToTable("orders");
        b.HasKey(o => o.Id);
        b.Property(o => o.Id).HasConversion(x => x.Value, x => new OrderId(x));
        b.Property(o => o.TenantId).HasConversion(x => x.Value, x => new TenantId(x));
        b.Property(o => o.Status).HasConversion<string>().HasMaxLength(32);
        b.Property(o => o.TotalAmount).HasPrecision(18, 2);
        b.Property(o => o.RowVersion).IsRowVersion();
        b.HasIndex(o => new { o.TenantId, o.CreatedAt }).IsDescending(false, true);
    }
}
```

### Migration sketch

```csharp
// Infrastructure/Migrations/20251018_AddOrdersTable.cs
public partial class AddOrdersTable : Migration
{
    protected override void Up(MigrationBuilder mb)
    {
        mb.CreateTable("orders", t => new
        {
            id = t.Column<Guid>(nullable: false),
            tenant_id = t.Column<Guid>(nullable: false),
            customer_id = t.Column<string>(maxLength: 64, nullable: false),
            status = t.Column<string>(maxLength: 32, nullable: false),
            total_amount = t.Column<decimal>(precision: 18, scale: 2, nullable: false),
            notes = t.Column<string>(nullable: true),
            created_at = t.Column<DateTime>(nullable: false),
            updated_at = t.Column<DateTime>(nullable: false),
            row_version = t.Column<byte[]>(rowVersion: true, nullable: false)
        }, c => c.PrimaryKey("pk_orders", x => x.id));

        mb.CreateIndex("ix_orders_tenant_created", "orders", new[] { "tenant_id", "created_at" });
    }

    protected override void Down(MigrationBuilder mb) => mb.DropTable("orders");
}
```

### xUnit handler test sketch

```csharp
// Tests.Unit/Application/Orders/CreateOrderHandlerTests.cs
public class CreateOrderHandlerTests
{
    [Fact]
    public async Task Handle_HappyPath_Returns201Equivalent()
    {
        // Arrange
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 5, 18, 10, 0, 0, TimeSpan.Zero));
        var idempotency = Substitute.For<IIdempotencyStore>();
        idempotency.GetAsync<OrderResponse>(default!, default!, default).ReturnsForAnyArgs((OrderResponse?)null);

        var db = new AppDbContext(InMemoryOptions()); // for THIS handler-only test; integration uses Testcontainer
        var handler = new CreateOrderHandler(db, idempotency, clock, NullLogger<CreateOrderHandler>.Instance);

        var cmd = new CreateOrderCommand(new CreateOrderRequest("cust", [new("SKU-1", 1, 10m)], null), "key-1");

        // Act
        var result = await handler.Handle(cmd, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Status.Should().Be("Pending");
        await idempotency.Received(1).SaveAsync(Arg.Any<TenantId>(), "key-1", Arg.Any<OrderResponse>(), TimeSpan.FromHours(24), Arg.Any<CancellationToken>());
    }
}
```

### Integration test sketch (Testcontainers + WebApplicationFactory)

```csharp
// Tests.Integration/OrdersApiFactory.cs
public sealed class OrdersApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _pg = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine").Build();
    private readonly RedisContainer _redis = new RedisBuilder()
        .WithImage("redis:7-alpine").Build();

    public async Task InitializeAsync()
    {
        await _pg.StartAsync();
        await _redis.StartAsync();
    }

    public new async Task DisposeAsync()
    {
        await _pg.DisposeAsync();
        await _redis.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.AddDbContext<AppDbContext>(o => o.UseNpgsql(_pg.GetConnectionString()));
            services.AddSingleton<IDistributedCache>(_ =>
                new RedisCache(Options.Create(new RedisCacheOptions { Configuration = _redis.GetConnectionString() })));

            services.AddAuthentication("Test").AddScheme<AuthenticationSchemeOptions, TestAuthHandler>("Test", _ => { });
            services.PostConfigure<AuthenticationOptions>(o => o.DefaultAuthenticateScheme = "Test");
        });
    }
}

public class OrdersEndpointsTests : IClassFixture<OrdersApiFactory>
{
    private readonly OrdersApiFactory _f;
    public OrdersEndpointsTests(OrdersApiFactory f) => _f = f;

    [Fact]
    public async Task POST_Orders_HappyPath_Returns201()
    {
        // Arrange
        using var scope = _f.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
        var client = _f.CreateClient();

        var req = new CreateOrderRequest("cust_abc", [new("SKU-1", 2, 9.99m)], null);
        client.DefaultRequestHeaders.Add("Idempotency-Key", "test-001");

        // Act
        var response = await client.PostAsJsonAsync("/v1/orders", req);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await response.Content.ReadFromJsonAsync<OrderResponse>();
        await Verify(body);
    }
}
```

### Deviations from Tech Design

> *List any places where implementation diverged from `TECH-DESIGN.md` and why.*

None.

## 4. Tests Written

| Test file | Cases | Type | Target |
|-----------|-------|------|--------|
| `Tests.Unit/Application/Orders/CreateOrderHandlerTests.cs` | 5 | xUnit | UT-A |
| `Tests.Unit/Application/Orders/CreateOrderValidatorTests.cs` | 8 | xUnit + FluentValidation.TestHelper | UT-V |
| `Tests.Unit/Domain/Orders/OrderTests.cs` | 6 | xUnit | UT-D |
| `Tests.Integration/Orders/OrdersEndpointsTests.cs` | 6 | WebApplicationFactory + Testcontainers | IT-API, IDEM, SEC |
| `Tests.Integration/Migrations/OrderMigrationTests.cs` | 2 | Testcontainers | MIG |
| `Tests.Architecture/LayeringTests.cs` | 3 (updated) | NetArchTest | ARCH |

## 5. Pre-PR Checklist

- [ ] `dotnet build` clean (warnings as errors)
- [ ] `dotnet test` all pass locally
- [ ] `dotnet format --verify-no-changes` clean
- [ ] Roslyn analyzers clean (`Microsoft.CodeAnalysis.NetAnalyzers`, `Roslynator`, `SonarAnalyzer.CSharp`)
- [ ] OpenAPI spec regenerated and committed (`openapi.json` diff in PR)
- [ ] No `DbContext` captured in singleton; `IDbContextFactory<T>` used in workers
- [ ] All IO async + `CancellationToken` propagated; no `.Result` / `.Wait()`
- [ ] FluentValidation registered; ProblemDetails on validation failure
- [ ] `IHttpClientFactory` for outbound HTTP + Polly pipeline
- [ ] `TimeProvider` injected (not `DateTime.UtcNow`)
- [ ] Structured logs only (no string interpolation in `_logger.LogX`)
- [ ] No secrets / connection strings in source
- [ ] PR title `[$EPIC_ID] <imperative summary>` (≤72 chars)
- [ ] PR body references epic key `$EPIC_ID`
- [ ] Reviewer assigned (Tech Lead)

## 6. Known Limitations / Follow-ups

- Idempotency-Key TTL hardcoded 24h — make configurable via `appsettings` in follow-up
- Outbox-pattern for `order.created` event deferred to next epic; for now we publish synchronously after `SaveChangesAsync` (acceptable per design)
