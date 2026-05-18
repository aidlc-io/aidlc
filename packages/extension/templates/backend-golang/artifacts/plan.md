# PRD — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Product Owner
**Status:** Draft
**Created:** `$DATE`
**Service:** *(e.g. `user-svc`, `billing-svc`)*

---

## 1. Problem Statement

> *Describe the user / business problem this epic solves. Who is the caller — browser client, mobile client, partner service, internal worker, scheduler? Why does it exist now?*

## 2. Goals

- [ ] Goal 1
- [ ] Goal 2
- [ ] Goal 3

## 3. Non-Goals

- Out of scope: …
- Will not address: …

## 4. Callers / Consumers

| Caller | Auth | Expected RPS | Notes |
|--------|------|--------------|-------|
| Mobile app | JWT (bearer) | 50 | iOS + Android |
| Internal `report-svc` | mTLS | 5 | scheduled job |

## 5. User Stories

| As a… | I want to… | So that… |
|--------|------------|----------|
| API consumer | … | … |

## 6. Functional Requirements

### FR-01: [Feature name]

**Endpoint / Method:** `POST /v1/widgets` *(or `WidgetService.Create` for gRPC)*
**Description:** …

**Request body (behavior level — full schema in OpenAPI/proto):**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| name  | string | yes | 1–100 chars |
| color | string | no  | enum: red/green/blue |

**Outcomes:**
| Outcome | Status | Body |
|---------|--------|------|
| Created | 201 | `{id, name, color, created_at, updated_at}` + `Location: /v1/widgets/{id}` |
| Validation failed | 400 | `{code:"validation_failed", details:[...]}` |
| Missing/invalid JWT | 401 | `{code:"unauthorized"}` |
| Wrong scope | 403 | `{code:"forbidden", required_scope:"widgets:write"}` |
| Duplicate name (tenant) | 409 | `{code:"conflict"}` |
| Rate limited | 429 | `{code:"rate_limited"}` + `Retry-After` header |
| Server / downstream error | 5xx | `{code:"internal"}` (no internals leaked) |

**Idempotency:** Required. Caller passes `Idempotency-Key` header (UUID). Replay returns the same response within 24h.

**Acceptance Criteria:**
- [ ] AC-01: Given valid input, when caller POSTs, then response is 201 with the new widget body and `Location` header
- [ ] AC-02: Given missing `name`, when caller POSTs, then response is 400 with `details[0].field == "name"`
- [ ] AC-03: Given missing JWT, when caller POSTs, then response is 401
- [ ] AC-04: Given JWT without `widgets:write`, then response is 403
- [ ] AC-05: Given same `Idempotency-Key` replayed within 24h, then same `id` returned, no new row created
- [ ] AC-06: Tenant isolation — caller in tenant A cannot read/write tenant B's widgets

### FR-02: [List endpoint]

**Endpoint:** `GET /v1/widgets?limit=&cursor=`
**Pagination:** cursor-based; `limit` ∈ [1, 100], default 20; `next_cursor` opaque string

…

## 7. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Latency p50 (Create) | < 80 ms |
| Latency p95 (Create) | < 200 ms |
| Latency p99 (Create) | < 500 ms |
| Throughput | sustain 500 RPS combined |
| Concurrency | optimistic-lock on PATCH via `If-Match`/`version` |
| Auth | JWT via `Authorization: Bearer`, scope `widgets:*` |
| Tenant isolation | tenant_id from JWT claims; never trusted from body/path |
| PII | none in this entity; if added later, redacted in slog via `ReplaceAttr` |
| Logs (slog fields) | request_id, tenant_id, user_id, route, status, duration_ms, error |
| Metrics | RED per endpoint + USE for pgxpool |
| Traces | OTEL span per handler + per DB query |
| Compatibility | additive-only JSON; deprecation requires 1 release notice |

## 8. Rollout

| Item | Value |
|------|-------|
| Feature flag | `feature.widgets` (default `false`) |
| Migration sequence | expand (additive table) → deploy code → contract (none yet) |
| Rollback | flag flip; previous container; `goose down` only if migration reversible |

## 9. Analytics / Success Metrics

| Metric | Baseline | Target |
|--------|----------|--------|
| Adoption (widgets created / DAU) | 0 | ≥ X / week by D+30 |
| Error rate | — | < 1% |
| p95 latency | — | < 200 ms |

## 10. Design & References

- OpenAPI: `api/openapi.yaml#/paths/~1v1~1widgets`
- Proto: `api/proto/widget.proto` *(if gRPC)*
- Figma: *(if there's a partner-facing UI for this)*
- Jira: *(ticket link)*

## 11. Open Questions

- [ ] Q1: …
- [ ] Q2: …

## 12. Revision History

| Date | Author | Change |
|------|--------|--------|
|      |        | Initial draft |
