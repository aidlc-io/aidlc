# Code Review Approval — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Reviewer:** Auto-Reviewer / Tech Lead
**Status:** Pending
**Created:** `$DATE`
**Stack:** Spring Boot 3 (Java 21)

---

## 1. Review Summary

> *One-paragraph verdict citing PRD ACs, design fidelity, and Spring Boot best practices.*

**Verdict:** ⬜ Pass &nbsp;&nbsp; ⬜ Reject

## 2. Acceptance Criteria Validation

| AC | Description | Status | Evidence (file:line) |
|----|-------------|--------|----------------------|
| $EPIC_ID-AC01 | Place order → 201 + body | ⬜ Pass / ⬜ Fail | `OrderController.java:24` |
| $EPIC_ID-AC02 | Validation failure → 400 ProblemDetail | ⬜ Pass / ⬜ Fail | `GlobalExceptionHandler.java:18` |
| $EPIC_ID-AC03 | Idempotency replay | ⬜ Pass / ⬜ Fail | `OrderService.java:32` |
| $EPIC_ID-AC04 | Missing scope → 403 | ⬜ Pass / ⬜ Fail | `OrderController.java:23` (`@PreAuthorize`) |
| $EPIC_ID-AC05 | Event published AFTER_COMMIT | ⬜ Pass / ⬜ Fail | `OrderEventListener.java:14` |
| $EPIC_ID-AC06 | GET existing → 200 | ⬜ Pass / ⬜ Fail | `OrderController.java:38` |
| $EPIC_ID-AC07 | GET missing → 404 | ⬜ Pass / ⬜ Fail | `OrderService.java:58` |

## 3. Architecture Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Package-by-feature (`com.example.app.order/*`) | ⬜ | |
| Constructor injection only (no `@Autowired` on fields) | ⬜ | Verified by ArchUnit |
| DTOs at controller boundary (no entity leaks) | ⬜ | Verified by ArchUnit |
| `@Transactional` on service layer only | ⬜ | |
| No `@Transactional` on private methods / self-invocation | ⬜ | |
| Flyway migration: `V{n}__{snake}.sql`, forward-only | ⬜ | `V42__add_orders.sql` |
| Expand-contract pattern (if breaking) | ⬜ N/A — additive only | |
| `spring.jpa.open-in-view: false` respected | ⬜ | |
| `RestClient` / Interface Clients (not `RestTemplate`) | ⬜ | |
| Resilience4j on outbound calls | ⬜ | |
| Springdoc OpenAPI annotations / spec updated | ⬜ | `docs/api/openapi.yaml` regenerated |

## 4. Code Quality

| Check | Status | Notes |
|-------|--------|-------|
| Records for DTOs / classes for entities | ⬜ | |
| `@Valid` on `@RequestBody` | ⬜ | |
| `ResponseEntity<T>` with explicit status | ⬜ | |
| `ProblemDetail` (RFC 7807) error envelope | ⬜ | |
| `@PreAuthorize` per endpoint | ⬜ | |
| No raw SQL string concat (JPQL / QueryDSL only) | ⬜ | |
| Fetch strategy explicit; N+1 mitigated (`@EntityGraph` / `JOIN FETCH`) | ⬜ | |
| Equals/HashCode on entities follows project policy | ⬜ | |
| No `Optional` fields on entities / DTOs | ⬜ | |
| No `System.out` / `printStackTrace`; SLF4J only | ⬜ | |
| No PII / JWT / secrets in logs | ⬜ | |
| HikariCP sizing reviewed (`maximum-pool-size`) | ⬜ | |

## 5. Concurrency / Resilience

| Check | Status | Notes |
|-------|--------|-------|
| Virtual threads enabled (`spring.threads.virtual.enabled: true`) | ⬜ | |
| No `synchronized` on hot paths | ⬜ | |
| `@Async` uses named `Executor` bean (not default `SimpleAsyncTaskExecutor`) | ⬜ | |
| Circuit breaker + retry + timeout on outbound HTTP / Kafka | ⬜ | |
| Fallback method present (same signature) | ⬜ | |

## 6. Tests

| Type | Present | Notes |
|------|---------|-------|
| Unit (`@ExtendWith(MockitoExtension)`) | ⬜ | |
| `@WebMvcTest` slice for controller | ⬜ | |
| `@DataJpaTest` + Testcontainers (not H2) for repo | ⬜ | |
| `@SpringBootTest` for integration | ⬜ | |
| WireMock for external HTTP | ⬜ | |
| ArchUnit rules pass | ⬜ | |
| `@MockBean` use justified | ⬜ | |
| Clock injected (no `Instant.now()` in tested code) | ⬜ | |
| No `Thread.sleep` (use Awaitility) | ⬜ | |
| JaCoCo coverage target met | ⬜ | |
| PIT mutation score target met (if configured) | ⬜ | |

## 7. Issues Found

### Critical (must fix before approval)

| # | File:line | Issue | Required action |
|---|-----------|-------|----------------|
| 1 | `OrderService.java:42` | `@Transactional` on a `private` method — Spring proxy can't apply | Make it package-private OR move to separate bean |
| 2 | `PaymentClient.java:18` | Uses `RestTemplate` (deprecated) | Switch to `RestClient` / Interface Client |

### Non-critical (follow-up)

| # | File:line | Issue | Suggested action |
|---|-----------|-------|------------------|
| 1 | `OrderEntity.java:88` | `equals/hashCode` using generated `id` | Remove or use business key (idempotency_key) |

## 8. Doc Impact

- [ ] `docs/api/openapi.yaml` regenerated and committed
- [ ] `CHANGELOG.md` entry added with `V42__add_orders.sql` reference
- [ ] `docs/configuration.md` lists new `app.order.*` config keys
- [ ] Runbook updated with `OrderPlacementErrorRateHigh` alert

## 9. Final Decision

- [ ] **APPROVED** — All ACs pass; no critical issues; architecture compliant.
- [ ] **REJECTED** — See critical issues. Resubmit after fixes.

**Reviewer notes:**

> *(free text)*
