# Technical Design — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Tech Lead
**Status:** Draft
**Created:** `$DATE`
**Stack:** Java 21 / Spring Boot 3.3+ / Spring Web MVC (virtual threads) / Spring Data JPA / Flyway / PostgreSQL 16

---

## 1. Overview

> *One paragraph: what's built, sync vs async, MVC vs WebFlux choice, key trade-offs.*

## 2. Architecture

### 2.1 Package-by-feature layout

```
com.example.app.order
├── OrderController.java          @RestController
├── OrderService.java             business logic, @Transactional here
├── OrderRepository.java          JpaRepository<OrderEntity, UUID>
├── OrderEntity.java              @Entity
├── OrderLineEntity.java
├── OrderDto.java                 record
├── OrderCreateRequest.java       record (validated)
├── OrderMapper.java              MapStruct
├── OrderEventPublisher.java      wraps KafkaTemplate
└── config/
    ├── OrderProperties.java      @ConfigurationProperties("app.order")
    └── OrderClientConfig.java    Resilience4j config
```

### 2.2 Sequence

```
client → OrderController.placeOrder(req)
  → @Valid → ProblemDetail on validation fail (400)
  → @PreAuthorize("hasAuthority('SCOPE_order.write')") → 403 on miss
  → OrderService.placeOrder(req) [Transactional]
      → OrderRepository.save(entity)
      → publishOrderCreatedEvent (queued via @TransactionalEventListener AFTER_COMMIT)
  → OrderMapper.toDto(entity)
  → ResponseEntity 201 + body
  ─── COMMIT ───
  OrderEventPublisher.publish(event) → Kafka order.events.v1
```

### 2.3 Key choices

| Choice | Decision | Rationale |
|--------|----------|-----------|
| MVC vs WebFlux | **MVC + virtual threads** (`spring.threads.virtual.enabled=true`) | Streaming/fan-out not needed; team familiarity; simpler debugging |
| HTTP client | **Spring Interface Clients** (Boot 3.2+) | Declarative, type-safe; replaces `RestTemplate` (deprecated) |
| Mapping | **MapStruct** `@Mapper(componentModel=SPRING)` | Compile-time, zero-reflection |
| Persistence | **Spring Data JPA + Hibernate 6**, QueryDSL for complex queries | Standard, well-known; QueryDSL keeps complex queries type-safe |
| Migration | **Flyway** forward-only, expand-contract for breaking changes | Audit trail; safe rollback via expand-contract |
| Resilience | **Resilience4j** (Hystrix EOL) | Modern, integrates with Micrometer |

ADR links: `docs/adr/0012-virtual-threads.md`

## 3. API Contract

### `POST /api/v1/orders`

**Headers:**
- `Authorization: Bearer <jwt>` (scope `order.write`)
- `Idempotency-Key: <uuid>` (required for POST)
- `Content-Type: application/json`

**Request:**
```json
{
  "customerId": "550e8400-e29b-41d4-a716-446655440000",
  "currency": "USD",
  "lines": [
    {"sku": "ABC-123", "quantity": 2, "unitPrice": 49.99}
  ]
}
```

**Response 201:**
```json
{
  "id": "01HX7Z...",
  "customerId": "550e8400-...",
  "status": "PENDING",
  "currency": "USD",
  "totalAmount": 99.98,
  "createdAt": "2026-05-18T10:23:00Z",
  "lines": [{"sku": "ABC-123", "quantity": 2, "unitPrice": 49.99}]
}
```

**Errors (`ProblemDetail` RFC 7807):**

| Status | Type | Trigger |
|--------|------|---------|
| 400 | `/errors/validation` | Bean Validation failure |
| 401 | `/errors/unauthenticated` | Missing / invalid JWT |
| 403 | `/errors/forbidden` | Missing scope |
| 409 | `/errors/idempotency-conflict` | Same key, different body |
| 422 | `/errors/business-rule` | Quantity > stock |
| 503 | `/errors/dependency-unavailable` | Payment service circuit OPEN |

**Idempotency**: same `Idempotency-Key` within 24h returns the original response.

### `GET /api/v1/orders/{id}`

Standard; 200 / 404. AuthZ: scope `order.read`.

## 4. Controller skeleton

```java
@RestController
@RequestMapping("/api/v1/orders")
@RequiredArgsConstructor
@Validated
public class OrderController {

    private final OrderService service;

    @PostMapping
    @PreAuthorize("hasAuthority('SCOPE_order.write')")
    public ResponseEntity<OrderDto> place(
        @RequestHeader("Idempotency-Key") UUID idempotencyKey,
        @Valid @RequestBody OrderCreateRequest req
    ) {
        OrderDto dto = service.placeOrder(idempotencyKey, req);
        return ResponseEntity
            .status(HttpStatus.CREATED)
            .location(URI.create("/api/v1/orders/" + dto.id()))
            .body(dto);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('SCOPE_order.read')")
    public OrderDto get(@PathVariable UUID id) {
        return service.getById(id);
    }
}
```

## 5. Data Model

```java
@Entity
@Table(name = "orders", indexes = {
    @Index(name = "ix_orders_customer", columnList = "customer_id"),
    @Index(name = "ix_orders_idempotency", columnList = "idempotency_key", unique = true)
})
@Getter @Setter
@NoArgsConstructor
public class OrderEntity {

    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "customer_id", nullable = false)
    private UUID customerId;

    @Column(name = "idempotency_key", nullable = false, length = 36)
    private String idempotencyKey;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private OrderStatus status;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(name = "total_amount", nullable = false, precision = 19, scale = 4)
    private BigDecimal totalAmount;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<OrderLineEntity> lines = new ArrayList<>();
    // NO equals/hashCode using generated id
}
```

### Flyway migration

`src/main/resources/db/migration/V42__add_orders.sql`

```sql
CREATE TABLE orders (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID            NOT NULL,
    idempotency_key VARCHAR(36)     NOT NULL,
    status          VARCHAR(20)     NOT NULL,
    currency        CHAR(3)         NOT NULL,
    total_amount    NUMERIC(19, 4)  NOT NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX ix_orders_idempotency ON orders(idempotency_key);
CREATE INDEX ix_orders_customer ON orders(customer_id);

CREATE TABLE order_lines (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID            NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    sku         VARCHAR(64)     NOT NULL,
    quantity    INTEGER         NOT NULL CHECK (quantity > 0),
    unit_price  NUMERIC(19, 4)  NOT NULL
);
CREATE INDEX ix_order_lines_order ON order_lines(order_id);
```

**Expand-contract**: this is additive — safe single-step. Any future breaking column changes use 3-release expand-contract.

## 6. Mapping

```java
@Mapper(componentModel = MappingConstants.ComponentModel.SPRING)
public interface OrderMapper {
    OrderDto toDto(OrderEntity entity);
    List<OrderDto> toDtos(List<OrderEntity> entities);
}
```

## 7. Service & Transactions

```java
@Service
@RequiredArgsConstructor
public class OrderService {

    private final OrderRepository repo;
    private final OrderMapper mapper;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    @Transactional
    public OrderDto placeOrder(UUID idemKey, OrderCreateRequest req) {
        return repo.findByIdempotencyKey(idemKey.toString())
            .map(mapper::toDto)
            .orElseGet(() -> create(idemKey, req));
    }

    private OrderDto create(UUID idemKey, OrderCreateRequest req) {
        OrderEntity entity = new OrderEntity();
        entity.setCustomerId(req.customerId());
        entity.setIdempotencyKey(idemKey.toString());
        entity.setStatus(OrderStatus.PENDING);
        entity.setCurrency(req.currency());
        entity.setTotalAmount(totalOf(req.lines()));
        entity.setCreatedAt(clock.instant());
        // ... add lines ...
        OrderEntity saved = repo.save(entity);
        events.publishEvent(new OrderCreatedEvent(saved.getId()));   // dispatched AFTER_COMMIT
        return mapper.toDto(saved);
    }

    @Transactional(readOnly = true)
    public OrderDto getById(UUID id) {
        return repo.findWithLinesById(id)
            .map(mapper::toDto)
            .orElseThrow(() -> new OrderNotFoundException(id));
    }
}
```

```java
@Component
@RequiredArgsConstructor
public class OrderEventListener {
    private final OrderEventPublisher publisher;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onOrderCreated(OrderCreatedEvent ev) {
        publisher.publish(ev);
    }
}
```

## 8. Resilience (outbound)

```yaml
resilience4j:
  circuitbreaker:
    instances:
      paymentService:
        sliding-window-type: COUNT_BASED
        sliding-window-size: 50
        minimum-number-of-calls: 20
        failure-rate-threshold: 50
        wait-duration-in-open-state: 30s
        permitted-number-of-calls-in-half-open-state: 5
  retry:
    instances:
      paymentService:
        max-attempts: 3
        wait-duration: 500ms
        retry-exceptions: [java.io.IOException, java.net.SocketTimeoutException]
  timelimiter:
    instances:
      paymentService:
        timeout-duration: 2s
```

## 9. DI Wiring

| Bean | Scope | Created in |
|------|-------|-----------|
| `OrderService` | singleton | component scan |
| `OrderMapper` | singleton | MapStruct generated impl |
| `OrderEventPublisher` | singleton | wraps `KafkaTemplate<String, OrderEvent>` |
| `OrderProperties` | singleton | `@ConfigurationProperties` + `@Validated` |
| `Clock` | singleton | `@Bean Clock systemUTC()` in `AppConfig` (so tests can inject fixed) |

No new `@ComponentScan` needed.

## 10. Non-Functional Design

- **HikariCP**: `maximum-pool-size: 30` based on target 500 RPS × 50ms p95 query = ~25 active needed; +20% margin
- **Virtual threads**: `spring.threads.virtual.enabled: true`. Audited: no `synchronized` on hot paths
- **Observability**:
  - Micrometer: per-endpoint `Timer` (auto via Spring Boot), custom `Counter app_orders_placed_total{currency=}`, `Timer app_payment_external_seconds`
  - Tracing: Micrometer Tracing + OTel → Tempo; spans `order.persist`, `order.publish-event`
  - Logging: Logback JSON encoder; MDC `traceId`, `spanId`, `customerId` (NEVER PII)
  - Actuator: `health`, `prometheus`, `info`, `flyway` exposed; `env` admin-only
- **Security**:
  - Spring Security 6 OAuth2 Resource Server: `spring.security.oauth2.resourceserver.jwt.issuer-uri`
  - Method-level `@PreAuthorize` per endpoint
  - CORS via `CorsConfiguration` — origins from `app.cors.allowed-origins`
- **Compatibility**: Java 21 LTS, Spring Boot 3.3.x

## 11. Rollout & Reversibility

- Feature flag: `feature.orders.v1.enabled` (Togglz)
- Canary via Argo Rollouts:
  ```yaml
  steps:
    - setWeight: 5
    - pause: { duration: 5m }
    - analysis: { templates: [{templateName: error-rate-and-p95}] }
    - setWeight: 25
    - pause: { duration: 10m }
    - setWeight: 50
    - pause: { duration: 10m }
    - setWeight: 100
  ```
- Rollback: flag flip → Helm revision rollback. Schema rollback not needed (additive only).

## 12. File / Module Impact

| File | Change | Reason |
|------|--------|--------|
| `src/main/java/com/example/app/order/OrderController.java` | Add | New endpoints |
| `src/main/java/com/example/app/order/OrderService.java` | Add | Business logic |
| `src/main/java/com/example/app/order/OrderRepository.java` | Add | JPA repo |
| `src/main/java/com/example/app/order/OrderEntity.java` | Add | JPA entity |
| `src/main/java/com/example/app/order/OrderLineEntity.java` | Add | Nested entity |
| `src/main/java/com/example/app/order/OrderDto.java` | Add | Response record |
| `src/main/java/com/example/app/order/OrderCreateRequest.java` | Add | Request record (validated) |
| `src/main/java/com/example/app/order/OrderMapper.java` | Add | MapStruct |
| `src/main/java/com/example/app/order/OrderEventPublisher.java` | Add | Kafka wrapper |
| `src/main/java/com/example/app/order/config/OrderProperties.java` | Add | `@ConfigurationProperties` |
| `src/main/resources/db/migration/V42__add_orders.sql` | Add | Schema |
| `src/main/resources/application.yml` | Modify | Resilience4j config + flag |
| `build.gradle.kts` | Modify | Add `springdoc-openapi-starter-webmvc-ui`, `mapstruct`, `resilience4j-spring-boot3` |
| `deploy/helm/<svc>/values.yaml` | Modify | New env vars |

## 13. Risks & Technical Debt

| Risk | Mitigation |
|------|------------|
| N+1 on order lines fetch | `@EntityGraph(attributePaths={"lines"})` on `findWithLinesById` |
| HikariCP pool starvation under burst | Load test at 1000 RPS; alert on `hikaricp_connections_pending > 0` |
| Idempotency-Key TTL not enforced (24h) | Cleanup job scheduled daily; ADR pending |
| Downstream payment timeout cascade | Resilience4j circuit-breaker + fallback to PENDING_PAYMENT status |

## 14. Open Questions

| # | Question | Owner | Status |
|---|----------|-------|--------|
| 1 | Partition key for `order.events.v1` — customerId or orderId? | Platform | Open |
| 2 | Audit log destination — DB or Kafka topic? | Security | Open |
