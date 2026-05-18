# Test Plan — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** QA
**Status:** Draft
**Created:** `$DATE`
**Stack:** JUnit 5 + AssertJ + Mockito + Spring Test + Testcontainers + WireMock + ArchUnit + PIT + Gatling

---

## 1. Scope

**In scope:**
- `POST /api/v1/orders`
- `GET /api/v1/orders/{id}`
- `order.created` Kafka event emission
- Idempotency-Key behavior
- Flyway `V42__add_orders.sql`

**Out of scope:**
- Payment service internals (mocked via WireMock)
- Existing legacy `/v0/orders` (not modified)

## 2. Test Strategy

| Type | Tool | Owner | Where it runs |
|------|------|-------|---------------|
| Unit | JUnit 5 + Mockito + AssertJ | Dev | local + CI |
| Web slice | `@WebMvcTest` + `MockMvc` | Dev | local + CI |
| Data slice | `@DataJpaTest` + Testcontainers Postgres | Dev | local + CI |
| Integration | `@SpringBootTest` + Testcontainers (PG + Kafka) | Dev | CI (slow) |
| Contract | springdoc OpenAPI diff + Pact (optional) | QA | CI |
| Resilience | WireMock + Resilience4j metrics | Dev | CI |
| Architecture | ArchUnit | Dev | CI (must pass) |
| Security | Spring Security test + AuthZ matrix | QA | CI |
| Mutation | PIT (pitest) on `com.example.app.order.*Service` | Dev | nightly |
| Load | Gatling on staging | QA | manual + CI nightly |

## 3. Test Cases

### Unit — `$EPIC_ID-UT*`

| ID | Description | AC | File |
|----|-------------|----|------|
| $EPIC_ID-UT01 | `OrderMapper.toDto` maps entity → DTO with all fields | AC-01 | `OrderMapperTest.java` |
| $EPIC_ID-UT02 | `OrderService.placeOrder` returns existing order on idempotency replay | AC-03 | `OrderServiceTest.java` |
| $EPIC_ID-UT03 | `OrderService.placeOrder` publishes `OrderCreatedEvent` after persist | AC-05 | `OrderServiceTest.java` |
| $EPIC_ID-UT04 | `OrderService.getById` throws `OrderNotFoundException` on miss | AC-07 | `OrderServiceTest.java` |

### Web slice — `$EPIC_ID-UI*` (`@WebMvcTest(OrderController.class)`)

| ID | Description | AC |
|----|-------------|----|
| $EPIC_ID-UI01 | POST with valid body → 201 + Location header | AC-01 |
| $EPIC_ID-UI02 | POST missing `customerId` → 400 + ProblemDetail | AC-02 |
| $EPIC_ID-UI03 | POST without `Idempotency-Key` header → 400 | AC-01 |
| $EPIC_ID-UI04 | POST with token missing scope → 403 | AC-04 |
| $EPIC_ID-UI05 | POST with no auth → 401 | AC-04 |
| $EPIC_ID-UI06 | GET existing id → 200 + body | AC-06 |
| $EPIC_ID-UI07 | GET non-existent id → 404 + ProblemDetail | AC-07 |

```java
@WebMvcTest(OrderController.class)
@Import({SecurityConfig.class, GlobalExceptionHandler.class})
class OrderControllerTest {
    @Autowired MockMvc mvc;
    @MockBean OrderService service;

    @Test
    @WithMockUser(authorities = "SCOPE_order.write")
    void placeOrder_returns201() throws Exception {
        given(service.placeOrder(any(), any())).willReturn(sampleDto());
        mvc.perform(post("/api/v1/orders")
                .header("Idempotency-Key", UUID.randomUUID())
                .contentType(APPLICATION_JSON)
                .content(validBody()))
           .andExpect(status().isCreated())
           .andExpect(header().exists("Location"))
           .andExpect(jsonPath("$.id").exists());
    }
}
```

### Data slice — `$EPIC_ID-DT*` (`@DataJpaTest` + Testcontainers PG)

| ID | Description | AC |
|----|-------------|----|
| $EPIC_ID-DT01 | `findByIdempotencyKey` returns existing order | AC-03 |
| $EPIC_ID-DT02 | `findWithLinesById` uses `@EntityGraph`, single SQL (no N+1) | AC-06 |
| $EPIC_ID-DT03 | Unique constraint on `idempotency_key` enforced | AC-03 |

```java
@DataJpaTest
@AutoConfigureTestDatabase(replace = Replace.NONE)
@Testcontainers
class OrderRepositoryTest {
    @Container @ServiceConnection
    static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

    @Autowired OrderRepository repo;
    @Autowired EntityManager em;

    @Test
    void findWithLinesById_noN1() {
        Statistics stats = em.unwrap(SessionImplementor.class).getFactory().getStatistics();
        stats.setStatisticsEnabled(true);
        stats.clear();

        OrderEntity saved = persistOrderWithLines(3);
        em.clear();

        var loaded = repo.findWithLinesById(saved.getId()).orElseThrow();
        loaded.getLines().forEach(l -> assertThat(l.getSku()).isNotNull());

        assertThat(stats.getPrepareStatementCount()).isEqualTo(1L);
    }
}
```

### Integration — `$EPIC_ID-IT*` (`@SpringBootTest` + Testcontainers)

| ID | Description | AC |
|----|-------------|----|
| $EPIC_ID-IT01 | Full flow: POST → DB row → Kafka event published AFTER commit | AC-01, AC-05 |
| $EPIC_ID-IT02 | Idempotency replay returns same id, no duplicate row | AC-03 |
| $EPIC_ID-IT03 | Validation failure 400 produces RFC 7807 body | AC-02 |

```java
@SpringBootTest(webEnvironment = RANDOM_PORT)
@Testcontainers
@AutoConfigureWireMock(port = 0)
class OrderFlowIT {
    @Container @ServiceConnection
    static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

    @Container @ServiceConnection
    static KafkaContainer kafka = new KafkaContainer(DockerImageName.parse("confluentinc/cp-kafka:7.6.0"));

    @Autowired TestRestTemplate rest;
    @Autowired KafkaTestUtils kafkaUtils;

    @Test
    void place_publishesEventAfterCommit() {
        var key = UUID.randomUUID();
        var resp = rest.exchange("/api/v1/orders", POST,
            requestWith(key, validBody()), OrderDto.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CREATED);

        ConsumerRecord<String, OrderCreatedEvent> rec = kafkaUtils.pollOne("order.events.v1");
        assertThat(rec.value().orderId()).isEqualTo(resp.getBody().id());
    }
}
```

### Resilience — `$EPIC_ID-RES*`

| ID | Description |
|----|-------------|
| $EPIC_ID-RES01 | Circuit breaker OPENs after 50% failure rate over 20 calls |
| $EPIC_ID-RES02 | Retry exhausts after 3 attempts; fallback invoked |
| $EPIC_ID-RES03 | TimeLimiter cancels call > 2s |

### Architecture — `$EPIC_ID-ARC*` (ArchUnit)

| ID | Rule |
|----|------|
| $EPIC_ID-ARC01 | No `@Autowired` on fields anywhere in `com.example.app` |
| $EPIC_ID-ARC02 | Controllers do not depend on `@Entity` classes |
| $EPIC_ID-ARC03 | `com.example.app.order` does not depend on other feature packages (except `..shared..`) |
| $EPIC_ID-ARC04 | `@Transactional` only on classes in `..service..` |

### Security — `$EPIC_ID-SEC*`

| ID | Description |
|----|-------------|
| $EPIC_ID-SEC01 | POST without JWT → 401 |
| $EPIC_ID-SEC02 | POST with JWT but missing `order.write` scope → 403 |
| $EPIC_ID-SEC03 | GET requires `order.read` scope |
| $EPIC_ID-SEC04 | Logs do not contain `Authorization` header value |
| $EPIC_ID-SEC05 | SQL injection attempt in path param → safely rejected by JPA |

### Migration — `$EPIC_ID-MG*`

| ID | Description |
|----|-------------|
| $EPIC_ID-MG01 | Flyway applies `V42__add_orders.sql` cleanly on empty DB |
| $EPIC_ID-MG02 | Flyway applies on staging schema snapshot (loaded via `pg_dump --schema-only`) |
| $EPIC_ID-MG03 | Re-running app does not trigger checksum mismatch |

### Performance — `$EPIC_ID-PF*` (Gatling)

```scala
class OrderPlacementSim extends Simulation {
  val httpProtocol = http.baseUrl(sys.env("BASE_URL"))
    .header("Authorization", s"Bearer ${sys.env("TOKEN")}")

  val place = scenario("Place order")
    .feed(Iterator.continually(Map("idem" -> UUID.randomUUID.toString)))
    .exec(http("POST /orders")
      .post("/api/v1/orders")
      .header("Idempotency-Key", "${idem}")
      .body(StringBody("""{"customerId":"<>","currency":"USD","lines":[{"sku":"A","quantity":1,"unitPrice":10.0}]}""")).asJson
      .check(status.is(201))
      .check(responseTimeInMillis.lt(250)))

  setUp(place.inject(rampUsersPerSec(10) to 500 during (2.minutes)))
    .protocols(httpProtocol)
    .assertions(
      global.responseTime.percentile3.lt(250),
      global.responseTime.percentile4.lt(500),
      global.failedRequests.percent.lt(0.5)
    )
}
```

Concurrent HikariCP assertion: `hikaricp_connections_pending == 0` throughout.

## 4. Unit Test Coverage Requirements

| Module | Target | Tool |
|--------|--------|------|
| `com.example.app.order.OrderService` | ≥ 90% line | JaCoCo |
| `com.example.app.order.OrderMapper` | ≥ 95% line (mostly generated) | JaCoCo |
| `com.example.app.order.*` overall | ≥ 80% line, ≥ 70% branch | JaCoCo |
| `OrderService` mutation score | ≥ 70% | PIT |

## 5. Compatibility / Environment Matrix

| Dimension | Values | Priority |
|-----------|--------|----------|
| Java | 21 (Temurin) | P1 |
| Spring Boot | 3.3.x (per `libs.versions.toml`) | P1 |
| Postgres | 16 (Testcontainers) | P1 |
| Kafka | 7.x Confluent (Testcontainers) | P1 |
| OS (CI) | Linux | P1 |
| OS (dev) | Linux, macOS Apple Silicon | P2 (Colima/Docker Desktop) |

## 6. Performance Benchmarks

| Scenario | Threshold |
|----------|-----------|
| POST /orders p95 | < 250 ms |
| POST /orders p99 | < 500 ms |
| Sustained RPS | 500 with < 0.5% error |
| HikariCP active | < 80% of pool |
| `hikaricp_connections_pending` | == 0 |
| GC pause max | < 100 ms |

## 7. Regression Checklist

- [ ] `GET /api/v0/orders` (legacy) still returns 200 with previous shape
- [ ] Existing Flyway migrations still apply (`flyway info` clean)
- [ ] Existing Kafka consumers still process `customer.events.v1` (no breaking schema change)
- [ ] `/actuator/health` UP across all subsystems

## 8. Sign-off Criteria

- [ ] All `$EPIC_ID-*` test IDs pass on CI
- [ ] JaCoCo coverage meets targets
- [ ] PIT mutation score meets target
- [ ] ArchUnit rules pass (build-breaking)
- [ ] Gatling staging run within thresholds
- [ ] OpenAPI diff vs previous tag matches design (no unintended breaking changes)
- [ ] No P0/P1 bugs open
- [ ] QA sign-off
