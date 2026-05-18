# Implementation Summary — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Developer
**Branch:** `feature/$EPIC_ID-<slug>`
**Status:** Draft
**Created:** `$DATE`
**Stack:** Java 21 / Spring Boot 3.3+

---

## 1. Branch & PR

| Item | Value |
|------|-------|
| Branch | `feature/$EPIC_ID-<slug>` |
| PR | *(link once opened)* |
| Base | `main` |
| Commit prefix | `$EPIC_ID <imperative summary>` |

## 2. Files Changed

| File | Type | Description |
|------|------|-------------|
| `src/main/java/com/example/app/order/OrderController.java` | Add | REST endpoints |
| `src/main/java/com/example/app/order/OrderService.java` | Add | Business logic, transactional |
| `src/main/java/com/example/app/order/OrderRepository.java` | Add | `JpaRepository`, `@EntityGraph` queries |
| `src/main/java/com/example/app/order/OrderEntity.java` | Add | JPA entity |
| `src/main/java/com/example/app/order/OrderLineEntity.java` | Add | JPA entity (nested) |
| `src/main/java/com/example/app/order/OrderDto.java` | Add | Record |
| `src/main/java/com/example/app/order/OrderCreateRequest.java` | Add | Record, `@Valid` |
| `src/main/java/com/example/app/order/OrderMapper.java` | Add | MapStruct interface |
| `src/main/java/com/example/app/order/OrderEventPublisher.java` | Add | Kafka producer wrapper |
| `src/main/java/com/example/app/order/config/OrderProperties.java` | Add | `@ConfigurationProperties` |
| `src/main/java/com/example/app/order/exception/OrderNotFoundException.java` | Add | Domain exception |
| `src/main/java/com/example/app/shared/GlobalExceptionHandler.java` | Modify | Map `OrderNotFoundException` → 404 ProblemDetail |
| `src/main/resources/db/migration/V42__add_orders.sql` | Add | Schema |
| `src/main/resources/application.yml` | Modify | Resilience4j config + feature flag |
| `build.gradle.kts` | Modify | Add MapStruct, springdoc, resilience4j-spring-boot3 |
| `src/test/java/com/example/app/order/OrderControllerTest.java` | Add | `@WebMvcTest` |
| `src/test/java/com/example/app/order/OrderServiceTest.java` | Add | Unit + Mockito |
| `src/test/java/com/example/app/order/OrderRepositoryTest.java` | Add | `@DataJpaTest` + Testcontainers |
| `src/test/java/com/example/app/order/OrderFlowIT.java` | Add | `@SpringBootTest` integration |
| `src/test/java/architecture/OrderArchTest.java` | Add | ArchUnit rules |

## 3. Implementation Notes

### Key code snippets

**Controller:**

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
}
```

**Service (transaction boundary + AFTER_COMMIT event):**

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
            .orElseGet(() -> createNew(idemKey, req));
    }

    private OrderDto createNew(UUID idemKey, OrderCreateRequest req) {
        OrderEntity entity = OrderEntityFactory.from(req, idemKey, clock.instant());
        OrderEntity saved = repo.save(entity);
        events.publishEvent(new OrderCreatedEvent(saved.getId(), saved.getCustomerId()));
        return mapper.toDto(saved);
    }
}
```

**Repository (avoid N+1):**

```java
public interface OrderRepository extends JpaRepository<OrderEntity, UUID> {

    Optional<OrderEntity> findByIdempotencyKey(String key);

    @EntityGraph(attributePaths = {"lines"})
    Optional<OrderEntity> findWithLinesById(UUID id);
}
```

**Web slice test:**

```java
@WebMvcTest(OrderController.class)
@Import({SecurityConfig.class, GlobalExceptionHandler.class})
class OrderControllerTest {

    @Autowired MockMvc mvc;
    @MockBean OrderService service;

    @Test
    @WithMockUser(authorities = "SCOPE_order.write")
    void place_returns201() throws Exception {
        given(service.placeOrder(any(), any())).willReturn(sampleDto());

        mvc.perform(post("/api/v1/orders")
                .header("Idempotency-Key", UUID.randomUUID())
                .contentType(APPLICATION_JSON)
                .content("""
                    {"customerId":"550e8400-e29b-41d4-a716-446655440000",
                     "currency":"USD",
                     "lines":[{"sku":"A","quantity":1,"unitPrice":10.0}]}
                    """))
           .andExpect(status().isCreated())
           .andExpect(header().exists("Location"))
           .andExpect(jsonPath("$.id").exists());
    }

    @Test
    void place_missingScope_returns403() throws Exception {
        // ... assert 403 ProblemDetail
    }
}
```

### Deviations from Tech Design

> *List divergences from `TECH-DESIGN.md` and why. If none, write "None".*

None.

## 4. Tests Written

| Test class | Type | Cases | Coverage target |
|------------|------|-------|----------------|
| `OrderServiceTest` | Unit (`@ExtendWith(MockitoExtension)`) | 8 | ≥ 90% |
| `OrderControllerTest` | `@WebMvcTest` | 7 | ≥ 85% |
| `OrderRepositoryTest` | `@DataJpaTest` + Testcontainers | 3 | ≥ 80% |
| `OrderFlowIT` | `@SpringBootTest` | 3 | (integration) |
| `OrderArchTest` | ArchUnit | 4 rules | (must pass) |

## 5. Pre-PR Checklist

- [ ] `./gradlew clean build` green locally
- [ ] `./gradlew test` green
- [ ] `./gradlew integrationTest` green (if separate source set)
- [ ] `./gradlew pitest` (if configured) ≥ target
- [ ] `./gradlew checkstyleMain` / SpotBugs clean
- [ ] ArchUnit rules pass
- [ ] springdoc OpenAPI regenerated; spec file committed
- [ ] No `@Autowired` on fields (verified by ArchUnit)
- [ ] DTOs returned from controllers (no entities)
- [ ] `@Transactional` only on `OrderService` public methods, none private
- [ ] Flyway migration runs cleanly on staging snapshot
- [ ] `application.yml` Resilience4j config in place
- [ ] No PII / JWT / secrets in logs (grep test outputs)
- [ ] PR title `[$EPIC_ID]` prefix
- [ ] PR description references AC mapping + test mapping
- [ ] Reviewer assigned (Tech Lead)

## 6. Known Limitations / Follow-ups

- Idempotency-Key cleanup job not yet scheduled — follow-up epic `$NEXT_EPIC`
- Feature flag remains in code until 100% rollout confirmed
- Audit log destination TBD (open question Q2 in TECH-DESIGN)
