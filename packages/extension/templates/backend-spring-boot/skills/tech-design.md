---
name: tech-design
description: Generate or review a Technical Design for a Spring Boot 3 epic. Produces package-by-feature layout, OpenAPI contract, JPA mapping strategy, Flyway evolution, DI wiring, observability plan, and virtual-thread vs WebFlux decision.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Tech Design for Epic $0

You are the **Tech Lead (TL)** for a Spring Boot 3 backend team.
Load your persona from `.claude/agents/tech-lead.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. Phase = `design`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read `docs/sdlc/epics/$0/$0.md`
2. Read `docs/sdlc/epics/$0/PRD.md` (must be complete)
3. Read `docs/sdlc/epics/$0/TECH-DESIGN.md` or template
4. Analyze codebase:
   - `CLAUDE.md`, `README.md`, `docs/architecture.md`
   - `build.gradle.kts` + `libs.versions.toml` — know your versions
   - `application.yml` profiles + `@ConfigurationProperties` classes
   - Affected feature packages (`com.example.app.<feature>/`)
   - Flyway history (`src/main/resources/db/migration/`)
   - Existing OpenAPI spec / springdoc config
   - Related ADRs
5. Fill the tech design

## Tech Design Contents

### Summary
One paragraph: what API/job/consumer is being built, chosen approach (MVC vs WebFlux, sync vs async, pull vs push).

### Architecture

- **Package-by-feature layout** — exact package path for the new feature:
  ```
  com.example.app.<feature>.
    ├── <Feature>Controller          @RestController
    ├── <Feature>Service             business logic, @Transactional here
    ├── <Feature>Repository          JpaRepository<Entity, ID>
    ├── <Feature>Entity              @Entity
    ├── <Feature>Dto                 record (immutable, no JPA)
    ├── <Feature>Mapper              MapStruct interface
    └── config/<Feature>Properties   @ConfigurationProperties
  ```
- Component / sequence diagram across packages + downstream services
- Key choices with rationale:
  - **Virtual threads (Boot 3.2+) vs WebFlux** — default virtual threads; choose WebFlux only if streaming / fan-out / backpressure-critical
  - **Sync HTTP vs async** — Interface Clients (declarative) preferred; raw `RestClient` only if needed
  - **REST vs gRPC vs event** — based on coupling, latency budget, polyglot consumers
- Link ADRs for irreversible decisions

### API Contract (OpenAPI 3)

For each endpoint:
- HTTP verb + path (versioned: `/api/v1/...`)
- Request body schema (JSON, Jackson-serialised DTO)
- Response status codes + bodies
- Error envelope using `ProblemDetail` (RFC 7807):
  ```json
  {
    "type": "https://example.com/errors/validation",
    "title": "Validation failed",
    "status": 400,
    "detail": "Field 'email' must be a valid email",
    "instance": "/api/v1/users/123",
    "errors": [{"field": "email", "message": "invalid format"}]
  }
  ```
- Security: `bearerAuth` scheme + required scopes / roles
- Idempotency: `Idempotency-Key` header behavior for POST
- Pagination: cursor or `Pageable` (`page`, `size`, `sort`)
- Versioning + deprecation plan

Either generate via springdoc annotations (`@Operation`, `@ApiResponse`) or contract-first OpenAPI YAML — pick one.

### Data Model (JPA)

```java
@Entity
@Table(name = "orders", indexes = {
    @Index(name = "ix_orders_customer", columnList = "customer_id"),
    @Index(name = "ix_orders_created_at", columnList = "created_at")
})
public class OrderEntity {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID customerId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private OrderStatus status;

    @Column(nullable = false)
    private Instant createdAt;
    // ... constructors, getters; NO equals/hashCode unless business key

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<OrderLineEntity> lines = new ArrayList<>();
}
```

- Fetch type: `LAZY` everywhere; use `@EntityGraph` on repository methods that need joined fetches
- Avoid bidirectional `@OneToMany` without justification
- No `Optional` fields on entities
- Identify N+1 risks per method and plan mitigation

### Flyway Migration Plan

File: `src/main/resources/db/migration/V{n}__{snake_case}.sql`

- Forward-only
- If breaking schema change, document expand-contract steps across releases:
  1. **Expand** (this release): add column, write both, default value
  2. **Backfill** (job or this release): populate new column
  3. **Switch** (next release): read from new column
  4. **Contract** (release after): drop old column

```sql
-- V42__add_order_currency.sql
ALTER TABLE orders ADD COLUMN currency CHAR(3) NOT NULL DEFAULT 'USD';
CREATE INDEX CONCURRENTLY ix_orders_currency ON orders(currency);
```

### DTOs and MapStruct

```java
public record OrderDto(
    UUID id,
    UUID customerId,
    OrderStatus status,
    Instant createdAt,
    List<OrderLineDto> lines
) {}

@Mapper(componentModel = MappingConstants.ComponentModel.SPRING)
public interface OrderMapper {
    OrderDto toDto(OrderEntity entity);
    List<OrderDto> toDtos(List<OrderEntity> entities);
}
```

### Dependency Wiring / Registration

| Bean | Scope | Notes |
|------|-------|-------|
| `OrderService` | singleton | constructor injection of `OrderRepository`, `OrderMapper`, `EventPublisher` |
| `OrderEventPublisher` | singleton | wraps `KafkaTemplate<String, OrderEvent>` |
| `OrderProperties` | singleton | `@ConfigurationProperties("app.order")`, validated |

No `@Component` scanning of new packages should be needed — `@SpringBootApplication` base package covers it. Justify any custom `@ComponentScan` / `@Configuration`.

### Transaction Boundaries

- `@Transactional` on `OrderService.placeOrder(...)` (default `REQUIRED`, propagation explicit)
- `@Transactional(readOnly = true)` on `getOrder(id)` reads
- Side effects (Kafka publish, S3 upload) via `@TransactionalEventListener(phase = AFTER_COMMIT)`
- No self-invocation; split bean if needed

### Resilience (Outbound calls)

```java
@CircuitBreaker(name = "paymentService", fallbackMethod = "paymentFallback")
@Retry(name = "paymentService")
@TimeLimiter(name = "paymentService")
public CompletableFuture<PaymentResult> charge(ChargeRequest req) { ... }
```

Configure in `application.yml`:

```yaml
resilience4j:
  circuitbreaker:
    instances:
      paymentService:
        sliding-window-size: 50
        failure-rate-threshold: 50
        wait-duration-in-open-state: 30s
  retry:
    instances:
      paymentService:
        max-attempts: 3
        wait-duration: 500ms
```

### Sequence / Flow

Include error paths, retry behavior, and what gets persisted vs. rolled back when downstream call fails mid-transaction.

### Non-Functional Design

- **Performance budget**: p95 < 250ms at 500 RPS sustained
- **HikariCP sizing**: `maximum-pool-size = N` based on target RPS × p95-query-time; default 10 is rarely right
- **Virtual threads**: `spring.threads.virtual.enabled: true` — audit `synchronized` blocks on hot paths
- **Reliability**: timeout/retry per outbound call; circuit-breaker thresholds set
- **Security**: `@PreAuthorize` rules per endpoint, scope mapping, audit logging on mutations
- **Observability**:
  - Micrometer `Timer` per endpoint (automatic via Spring Boot)
  - Custom `Counter`/`Gauge` for business metrics
  - Trace spans via Micrometer Tracing + OTel; `traceId`/`spanId` in MDC via Logback Logstash encoder
  - Actuator: `/actuator/health`, `/actuator/prometheus`, `/actuator/info`
- **Compatibility**: Boot version, Java 21 LTS confirmed, OpenAPI consumer-side compat

### Rollout & Reversibility

- Feature flag (Togglz / Unleash / LaunchDarkly) — name, default OFF, ramp plan
- Canary via Argo Rollouts / Flagger with analysis template (error rate, p95)
- Rollback: previous Helm chart revision; expand-contract migration means schema rollback NOT needed

### File / Module Impact

| File | Type | Reason |
|------|------|--------|
| `src/main/java/com/example/app/order/OrderController.java` | Add | New REST endpoints |
| `src/main/java/com/example/app/order/OrderService.java` | Add | Business logic |
| `src/main/java/com/example/app/order/OrderRepository.java` | Add | JPA repository |
| `src/main/java/com/example/app/order/OrderEntity.java` | Add | JPA entity |
| `src/main/java/com/example/app/order/OrderDto.java` | Add | Record DTO |
| `src/main/java/com/example/app/order/OrderMapper.java` | Add | MapStruct |
| `src/main/resources/db/migration/V42__add_orders.sql` | Add | Schema |
| `src/main/resources/application.yml` | Modify | Resilience4j config + flag |
| `build.gradle.kts` | Modify | Add `springdoc-openapi-starter-webmvc-ui` |

### Risks & Tech Debt

| Risk | Mitigation |
|------|-----------|
| N+1 on order line fetch | `@EntityGraph(attributePaths={"lines"})` on repo method |
| Pool exhaustion under burst | Load test with HikariCP saturation alert |
| Downstream payment service timeout | Resilience4j circuit breaker + fallback |
| Migration locks orders table | `CREATE INDEX CONCURRENTLY` outside Flyway, or off-hours |

### Open Questions

Block-list with owners and target date.

## Architecture Rules (Spring Boot)

- Package-by-feature; no horizontal `controller/service/repository` directories
- Constructor injection only; never `@Autowired` on fields
- DTOs at controller boundary; never expose entities
- `@Transactional` on service layer only; never on private methods
- Flyway forward-only; expand-contract for breaking
- `spring.jpa.open-in-view = false`
- All outbound HTTP via Interface Clients or `RestClient`; never `RestTemplate`
- All outbound calls wrapped in Resilience4j circuit breaker + timeout

## Output

Write to `docs/sdlc/epics/$0/TECH-DESIGN.md`.
