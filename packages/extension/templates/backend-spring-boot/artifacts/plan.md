# PRD — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Product Owner
**Status:** Draft
**Created:** `$DATE`
**Service / Bounded Context:** `<service-name>`

---

## 1. Problem Statement

> *Which caller (web client / mobile app / partner service / internal job) has which problem? Why does this API / consumer / job need to exist?*

## 2. Goals

- [ ] Goal 1 (measurable, e.g., "p95 < 250ms at 500 RPS")
- [ ] Goal 2
- [ ] Goal 3

## 3. Non-Goals

- Out of scope: …
- Will not address: …

## 4. User Stories (caller-oriented)

| As (caller) | I want to… | So that… |
|-------------|------------|----------|
| web-client | place an order via POST /orders | the checkout flow can complete |
| internal-billing-service | consume `order.created` events | invoices can be generated |

## 5. Functional Requirements

### FR-01: Place an order

**Description:** New `POST /api/v1/orders` endpoint.

**Acceptance Criteria:**

- [ ] **AC-01** — Given a valid order request, when a client POSTs to `/api/v1/orders`, then the response is `201 Created` with body matching `OrderDto` schema (`{ id, customerId, status, createdAt, lines[] }`).
- [ ] **AC-02** — Given a request missing `customerId`, when POSTed, then response is `400 Bad Request` with `ProblemDetail` body listing the field error.
- [ ] **AC-03** — Given a request with the same `Idempotency-Key` as a previously successful POST, when POSTed, then the same order is returned (no duplicate row).
- [ ] **AC-04** — Given a caller token without scope `order.write`, when POSTed, then response is `403 Forbidden`.
- [ ] **AC-05** — On successful order creation, an `order.created` event is published to topic `order.events.v1` (Avro schema in registry) AFTER the DB transaction commits.

### FR-02: Get an order

**Description:** `GET /api/v1/orders/{id}`

**Acceptance Criteria:**

- [ ] **AC-06** — Given an existing order, when GETted by id, then `200 OK` with `OrderDto` body.
- [ ] **AC-07** — Given a non-existent id, then `404 Not Found` with `ProblemDetail`.

## 6. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Availability | 99.95% per quarter |
| Latency | p95 < 250 ms, p99 < 500 ms at 500 RPS sustained |
| Throughput | 1000 RPS burst for 60 s |
| Error rate | < 0.5% over any 5-min window |
| Security | OAuth2 JWT (issuer: `auth.example.com`); scopes `order.read`, `order.write`; mTLS for service-to-service |
| Compliance | Audit log all mutations; retain 7 years; mask PII in logs |
| Compatibility | Java 21 LTS, Spring Boot 3.3+, Postgres 16, Kafka 3.x |
| Observability | Per-endpoint Micrometer timer + counter; trace span per outbound call; `order.created` event traced |
| Rate limit | 100 RPS per client_id (sustained), burst 200 |

## 7. API References

- OpenAPI sketch: `docs/api/openapi-$EPIC_ID.yaml` (draft)
- Event schema: `schema-registry://order.events.v1`
- Figma / sequence diagram: *(link)*
- Jira: *(ticket)*

## 8. Metrics / Success Criteria

| Metric | Baseline | Target |
|--------|----------|--------|
| Order creation success rate | — | ≥ 99.5% |
| p95 endpoint latency | — | < 250 ms |
| `order.created` event lag | — | < 5 s end-to-end |
| Consumer DLQ rate | — | < 0.01% |

## 9. Rollout

- Feature flag: `feature.orders.v1.enabled` (Togglz / Unleash) — default OFF
- Canary plan: 5% → 25% → 50% → 100% via Argo Rollouts / Flagger
- Rollback: flag flip (instant) → Helm revision rollback (minutes)

## 10. Open Questions

- [ ] Q1: Idempotency key TTL — 24h sufficient?
- [ ] Q2: Which Kafka partition key — `customerId` or `orderId`?

## 11. Revision History

| Date | Author | Change |
|------|--------|--------|
| | | Initial draft |
