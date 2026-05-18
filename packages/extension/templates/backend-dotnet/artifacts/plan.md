# PRD — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Product Owner
**Status:** Draft
**Created:** `$DATE`
**Service:** `<service-name>` (ASP.NET Core, .NET 8/9)

---

## 1. Problem Statement

> *Which consumer (web SPA / mobile / partner / internal service) has a problem? What is it? Why does it exist now?*

## 2. Goals

- [ ] Goal 1 (measurable: e.g. "p95 < 200 ms for `POST /v1/orders`")
- [ ] Goal 2
- [ ] Goal 3

## 3. Non-Goals

- Out of scope: …
- Will not address: …

## 4. Target Consumers

| Consumer | Type | Volume / Tier | Contact |
|----------|------|---------------|---------|
| Web SPA team | Internal | 70% of traffic | #web-team |
| Mobile app | Internal | 25% | #mobile-team |
| Partner X | External | Premium tier | partner-x@... |

## 5. User Stories

| As a… | I want to… | So that… |
|-------|------------|----------|
| consuming web client | submit an order with an Idempotency-Key | retries don't create duplicates |
| consuming mobile client | list my orders with ETag | I can skip download when unchanged |

## 6. Functional Requirements

### FR-01: Create Order

**Endpoint:** `POST /v1/orders`
**Auth:** policy `OrdersWrite` (scope `orders:write`)
**Rate-limit:** `standard` (100 req/min sliding window per API key)
**Idempotency:** `Idempotency-Key` header required for POST; replay window 24h via Redis

**Acceptance Criteria:**
- [ ] AC-01: Given valid request + new Idempotency-Key, when POST, then 201 Created with `Location: /v1/orders/{id}` and body `{id, status, createdAt}`
- [ ] AC-02: Given same Idempotency-Key replayed within window, then 201 with identical body (from cache); no new DB row
- [ ] AC-03: Given missing required field, then 400 `ValidationProblemDetails` listing field errors
- [ ] AC-04: Given missing/invalid JWT, then 401 ProblemDetails
- [ ] AC-05: Given JWT with insufficient scope, then 403 ProblemDetails
- [ ] AC-06: Given burst above rate-limit, then 429 with `Retry-After` header
- [ ] AC-07: Given upstream payment service down (after Polly retries+CB), then 503 with retry guidance

### FR-02: List Orders

**Endpoint:** `GET /v1/orders?cursor=&limit=`
**Auth:** policy `OrdersRead`
**Caching:** `ETag` + `If-None-Match` support; server-side `IDistributedCache` per tenant for 60s

**Acceptance Criteria:**
- [ ] AC-08: Given valid request, then 200 with paginated body `{items, nextCursor}`
- [ ] AC-09: Given matching `If-None-Match`, then 304 Not Modified
- [ ] AC-10: Tenant isolation — caller's tenant only; cross-tenant request returns 404 (not 403, to avoid existence leak)

## 7. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| **Latency** | `POST /v1/orders` p95 < 200 ms, p99 < 500 ms at 500 RPS |
| **Throughput** | Sustained 500 RPS per pod; horizontal scaling to 5000 RPS |
| **Availability** | 99.9% monthly (error budget: 43.2 min / month) |
| **Security** | OWASP API Top 10 baseline; JWT with `RS256`; PII tokenized at rest |
| **Compatibility** | .NET 8 LTS; consumer client SDKs `^v1` |
| **Observability** | Per-endpoint duration histogram + 5xx counter; correlation ID via `traceparent`; structured Serilog logs |
| **Audit** | Every `POST /v1/orders` writes audit log entry with `actor.id`, `tenant.id`, `correlation.id` |

## 8. Contract Impact

| Type | Impact |
|------|--------|
| Additive (new endpoint, no break) | yes / no |
| Version bump (MINOR) | yes / no |
| Breaking (MAJOR — new `/v2/...`) | yes / no |
| Deprecation triggered | yes / no — endpoint X sunset YYYY-MM-DD |

## 9. Design & References

- OpenAPI sketch: *(link to draft)*
- Tech design: `docs/sdlc/epics/$EPIC_ID/TECH-DESIGN.md`
- Jira: *(ticket)*
- Related epics: *(links)*

## 10. Metrics / Success Criteria

| Metric | Baseline | Target |
|--------|----------|--------|
| `POST /v1/orders` success rate | — | ≥ 99.5% |
| p95 latency | — | < 200 ms |
| Adoption (consumers calling endpoint within 30 days) | — | ≥ 3 of 4 consumers |
| Idempotency-Key usage by consumers | — | ≥ 90% of POSTs |

## 11. Open Questions

- [ ] Q1: …
- [ ] Q2: …

## 12. Revision History

| Date | Author | Change |
|------|--------|--------|
|      |        | Initial draft |
