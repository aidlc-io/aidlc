---
name: test-plan
description: Generate a test plan for a Spring Boot 3 epic. Covers JUnit 5 slice tests (@WebMvcTest, @DataJpaTest), @SpringBootTest integration with Testcontainers, WireMock for external HTTP, ArchUnit for boundaries, PIT mutation, and Gatling load tests.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Test Plan for Epic $0

You are the **QA Engineer (QA)** for a Spring Boot 3 backend team.
Load your persona from `.claude/agents/qa.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. Phase = `test-plan`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read `docs/sdlc/epics/$0/$0.md`
2. Read `docs/sdlc/epics/$0/PRD.md` — ACs are test inputs
3. Read `docs/sdlc/epics/$0/TECH-DESIGN.md` — file impact drives slice scope
4. Inspect existing tests in affected feature package — match the style
5. Inspect `build.gradle.kts` for test dependencies (JUnit 5, AssertJ, Mockito, Testcontainers, WireMock, ArchUnit, PIT, Gatling)
6. Fill the test plan

## Test Plan Contents

### Test Scope
Map each AC to one or more test types:

| AC | Test Type | Test ID |
|----|-----------|---------|
| $0-AC01 | Web slice + Integration | $0-UI01, $0-IT01 |
| $0-AC02 | Data slice | $0-DT01 |
| $0-AC03 | Resilience | $0-RES01 |
| $0-AC04 | Security | $0-SEC01 |

Out of scope: ...

### Compatibility Matrix

| Dimension | Values |
|-----------|--------|
| Java | 21 (LTS) — CI uses Temurin 21 |
| Spring Boot | 3.3.x (matches `libs.versions.toml`) |
| Postgres | 16 via Testcontainers (matches prod minor) |
| Kafka (if applicable) | Confluent 7.x or Apache 3.x via Testcontainers |
| Redis (if applicable) | 7.x via Testcontainers |
| OS | Linux (CI) — verify Mac M-series spins Testcontainers via Colima/Docker Desktop |

### Unit Tests — prefix `$0-UT`

Pure logic, no Spring context.

- Mappers (MapStruct generated): null handling, list mapping, nested mapping
- Validators (custom Jakarta validators): boundary values
- Domain services with mocked collaborators (use Mockito; AssertJ for assertions)
- Time-dependent logic uses injected `Clock` (Mockito or fixed `Clock.fixed(...)`)

```java
@ExtendWith(MockitoExtension.class)
class OrderServiceTest {
    @Mock OrderRepository repo;
    @Mock EventPublisher events;
    @InjectMocks OrderService service;

    @Test
    void placeOrder_publishesEvent_afterCommit() { ... }
}
```

### Web Slice Tests — prefix `$0-UI`

`@WebMvcTest(<Controller>.class)` — only controller, jackson, validation, security loaded. Use `MockMvc`.

- Request validation (`@Valid`) — happy path + each constraint violation
- Response status + body shape per AC
- Authorization (`@PreAuthorize`) — allowed role, denied role (401/403)
- Error envelope (`ProblemDetail`) per error type
- Pagination + sorting query-param parsing

```java
@WebMvcTest(OrderController.class)
@Import(SecurityConfig.class)
class OrderControllerTest {
    @Autowired MockMvc mvc;
    @MockBean OrderService service;

    @Test
    @WithMockUser(roles = "USER")
    void placeOrder_returns201() throws Exception {
        mvc.perform(post("/api/v1/orders")
                .contentType(APPLICATION_JSON)
                .content("{...}"))
           .andExpect(status().isCreated())
           .andExpect(jsonPath("$.id").exists());
    }
}
```

### Data Slice Tests — prefix `$0-DT`

`@DataJpaTest` + Testcontainers Postgres via `@ServiceConnection` (Boot 3.1+). **Never H2**.

- Custom `@Query` JPQL/native results
- `@EntityGraph` eliminates N+1 (assert via Hibernate statistics)
- Unique constraints / index behavior
- Cascade / orphan-removal semantics

```java
@DataJpaTest
@AutoConfigureTestDatabase(replace = Replace.NONE)
@Testcontainers
class OrderRepositoryTest {
    @Container @ServiceConnection
    static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

    @Autowired OrderRepository repo;

    @Test
    void findByCustomer_eagerFetchesLines() { ... }
}
```

### Integration Tests — prefix `$0-IT`

`@SpringBootTest(webEnvironment = RANDOM_PORT)` + Testcontainers for Postgres + Kafka + Redis (whatever the feature needs). Use sparingly — slow context.

- Multi-bean flows: controller → service → repo → event publish
- `@TransactionalEventListener(AFTER_COMMIT)` actually fires post-commit
- Idempotency-Key replay returns identical response

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
    // ...
}
```

### Contract Tests — prefix `$0-CT`

- springdoc-generated OpenAPI vs committed spec: diff in CI must be empty (or intentional)
- Spring Cloud Contract (producer-side) or Pact (consumer-side) for cross-service contracts
- Kafka schema evolution (Avro / Proto) — backward compatibility check vs Schema Registry

### Resilience Tests — prefix `$0-RES`

- Circuit-breaker trips after N failures (drive via WireMock returning 500)
- Retry exhaustion → fallback invoked
- Timeout enforced (WireMock with `withFixedDelay`)
- Bulkhead capacity limit
- Verify metrics: `resilience4j_circuitbreaker_state{name="X",state="OPEN"}`

### Architecture Tests — prefix `$0-ARC`

ArchUnit rules in `src/test/java/architecture/`:

```java
@AnalyzeClasses(packages = "com.example.app")
class ArchitectureTest {
    @ArchTest
    static final ArchRule noFieldInjection =
        noFields().should().beAnnotatedWith(Autowired.class);

    @ArchTest
    static final ArchRule controllersDoNotReturnEntities =
        noClasses().that().resideInAPackage("..controller..")
                   .should().dependOnClassesThat().areAnnotatedWith(Entity.class);

    @ArchTest
    static final ArchRule featurePackagesAreIsolated =
        slices().matching("com.example.app.(*)..")
                .should().notDependOnEachOther()
                .ignoreDependency(belongTo("..shared.."));
}
```

### Security Tests — prefix `$0-SEC`

- AuthZ matrix per endpoint: `(role × endpoint) → 200/401/403`
- JWT scope check (token with required scope, token missing scope)
- SQL injection guard (parameterised query proven)
- CORS preflight allowed/denied per configured origin
- No secrets in logs (scan log output in test)

### Performance Tests — prefix `$0-PF`

Gatling scenario in `src/gatling/scala/...` (or k6 JS):

```scala
class OrderLoadSimulation extends Simulation {
  val httpProtocol = http.baseUrl("https://staging.example.com")

  val placeOrder = scenario("Place order")
    .exec(http("POST /api/v1/orders")
      .post("/api/v1/orders")
      .body(StringBody("""{"customerId":"...","amount":100}""")).asJson
      .check(status.is(201))
      .check(responseTimeInMillis.lt(250)))

  setUp(placeOrder.inject(rampUsersPerSec(10) to 500 during (2 minutes)))
    .protocols(httpProtocol)
    .assertions(global.responseTime.percentile3.lt(250),
                global.failedRequests.percent.lt(0.5))
}
```

Also assert HikariCP doesn't peg (`hikaricp_connections_pending == 0` during load).

### Mutation Tests

PIT (pitest) on critical service modules:
```
./gradlew pitest
```
Target ≥ 70% mutation score for `com.example.app.<feature>.*Service`.

### Migration Tests — prefix `$0-MG`

- Flyway runs cleanly on empty DB
- Flyway runs cleanly on snapshot of prod schema (`pg_dump --schema-only` checked in)
- Expand-contract steps verified (write both → backfill → switch)
- No checksum mismatch on re-run

### Regression Checklist

| Area | Test |
|------|------|
| Login / token issuance | smoke test on staging |
| Existing critical endpoints | Gatling baseline scenario |
| Kafka consumer lag | dashboard check |
| Flyway history | `flyway info` confirms expected state |

### Test Data Strategy

- Builders / factory methods over JSON fixtures (compile-time refactor-safe)
- Each test owns its data; Testcontainers gives a fresh DB per class (default) or per method (explicit)
- No shared static state across tests

### Flaky-Test Policy

- Inject `Clock`; never `Instant.now()` in production code paths under test
- Seed randomness explicitly
- No `Thread.sleep` — use Awaitility for async assertions
- Quarantine flaky tests in a separate tag; do not retry-to-green

### Coverage

- JaCoCo line ≥ 80%, branch ≥ 70% for new feature package
- Critical services ≥ 90%
- PIT mutation ≥ 70% on critical modules

## Output

Write to `docs/sdlc/epics/$0/TEST-PLAN.md`.
