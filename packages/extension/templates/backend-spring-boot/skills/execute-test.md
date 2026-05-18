---
name: execute-test
description: Generate a TEST-SCRIPT (executable scenarios for human testers / partner-integration validation) for a Spring Boot service. Uses curl / HTTPie / Postman commands and verifies via Actuator + Prometheus.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Test Script for Epic $0

You are the **QA Engineer (QA)** for a Spring Boot 3 backend team.
Load your persona from `.claude/agents/qa.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. Phase = `execute-test`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read `docs/sdlc/epics/$0/$0.md`
2. Read `docs/sdlc/epics/$0/PRD.md` — ACs drive scenarios
3. Read `docs/sdlc/epics/$0/TECH-DESIGN.md` — endpoint paths, payload shapes
4. Open the OpenAPI spec (springdoc UI at `/swagger-ui` on staging, or the YAML in repo)
5. Fill the test script

## Test Script Contents

### Prerequisites

| Item | Value |
|------|-------|
| Environment | `https://staging.example.com` (or per-tester sandbox) |
| Image tag | `vX.Y.Z` (verify via `GET /actuator/info`) |
| Test accounts | `tester1@example.com / ***`, `admin@example.com / ***` |
| Token issuance | `curl -X POST https://auth/oauth2/token -d grant_type=...` (steps below) |
| Flags | `feature.X.enabled=true` (set in Togglz/Unleash console for staging) |
| DB snapshot | Prod-like seed loaded as of `$DATE` |
| Tools | `curl`, `jq`, `httpie` (optional), Postman collection at `docs/api/postman/...` |
| Clock | Use `Date` header on responses to verify server time alignment |

### Token issuance (one-time per session)

```bash
TOKEN=$(curl -sX POST https://auth.example.com/oauth2/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=$CID&client_secret=$CS&scope=order.read order.write" \
  | jq -r .access_token)
echo $TOKEN
```

### Scenarios (per acceptance criteria)

#### Scenario $0-AC01 — Place an order (happy path)

**What we test:** A valid order request returns 201 with an order ID.

**Steps:**

1. Acquire token (see Prerequisites)
2. Run:
   ```bash
   curl -sX POST https://staging.example.com/api/v1/orders \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -H "Idempotency-Key: $(uuidgen)" \
     -d '{"customerId":"<cust>","amount":100,"currency":"USD"}' \
     -i
   ```
3. Verify HTTP `201 Created`
4. Verify response body has `id`, `status: "PENDING"`, `createdAt` ISO-8601
5. Capture `id` for next steps
6. Run `GET /api/v1/orders/{id}` — verify same body
7. Check `/actuator/prometheus` → `http_server_requests_seconds_count{uri="/api/v1/orders",status="201"}` incremented

**Expected result:** 201 status, body matches schema, GET retrieves same order, metric incremented.

**Traceability:** `$0-AC01`

---

#### Scenario $0-AC02 — Validation failure on missing field

**What we test:** Missing `customerId` returns 400 with `ProblemDetail` error envelope.

**Steps:**

1. Run:
   ```bash
   curl -sX POST https://staging.example.com/api/v1/orders \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"amount":100,"currency":"USD"}' \
     -i
   ```
2. Verify HTTP `400 Bad Request`
3. Verify response body matches:
   ```json
   {
     "type": "https://example.com/errors/validation",
     "title": "Validation failed",
     "status": 400,
     "errors": [{"field":"customerId","message":"must not be null"}]
   }
   ```

**Expected result:** 400 + ProblemDetail body with field error.

**Traceability:** `$0-AC02`

---

#### Scenario $0-AC03 — Idempotency replay

**What we test:** Same `Idempotency-Key` returns the original response, no duplicate order.

**Steps:**

1. Generate `KEY=$(uuidgen)`
2. POST `/api/v1/orders` with the key → expect 201, capture `id`
3. POST again with **same** key + same body → expect 200 (or 201) with **same `id`**
4. `GET /api/v1/orders?customerId=<cust>` → verify only ONE order exists

**Expected result:** Identical response on replay, no duplicate row.

**Traceability:** `$0-AC03`

---

### Edge-Case Scenarios

#### Auth — denied
- Run any endpoint **without** `Authorization` → expect `401 Unauthorized`
- Run with token missing required scope → expect `403 Forbidden`

#### Downstream failure
- Toggle staging feature flag `payment.simulate-failure=true`
- POST `/api/v1/orders` → expect graceful response (fallback path):
  - Either `503 Service Unavailable` with `Retry-After` header, OR
  - `201` with `status: "PENDING_PAYMENT"` (per design)
- Check `/actuator/prometheus` → `resilience4j_circuitbreaker_calls{kind="failed"}` increasing

#### Rate limit
- Run 100 POSTs in 1s from same client
- Expect 429 once limit hit, with `Retry-After` header

#### Invalid Authorization token
- Use expired / malformed token → expect `401`

#### Empty pagination
- `GET /api/v1/orders?customerId=<unknown>` → expect `200` + `{"content":[],"page":0,"size":20,"totalElements":0}`

### Database / Migration Smoke Check

After deploy:

1. `kubectl exec` into pod, run `curl localhost:8080/actuator/flyway` (if exposed) — verify expected migration count
2. Connect to staging DB read replica (read-only role): verify new columns/tables exist
3. Verify no Flyway repair was needed: `flyway info` shows all "Success"

### Observability Verification

- Grafana: open `Spring Boot Service` dashboard, filter by `service=<this>`, version `vX.Y.Z`
  - p95 latency, error rate within SLO
  - HikariCP active/idle/pending
  - JVM heap, threads
- Loki: `{service="<this>"} | json | level="ERROR"` for last 1h — review any new signatures
- Tempo: pick a `traceId` from a 4xx/5xx response, walk the span tree, confirm downstream calls instrumented

### Regression Quick-Check

| Endpoint | Expected | Status |
|----------|----------|--------|
| `GET /api/v1/health` (or `/actuator/health`) | 200, `{"status":"UP"}` | ⬜ |
| Existing critical endpoint A | baseline behavior | ⬜ |
| Existing critical endpoint B | baseline behavior | ⬜ |
| Kafka consumer lag | near zero | ⬜ |

### Verdict

- Pass / fail per scenario
- Sign-off: tester name, date, environment, build (`/actuator/info` commit), verdict
- Defect log with severity, request/response capture (`-v` curl), screenshots of Grafana panels

## Rules

- Concrete curl/HTTPie commands — never "use Postman to call X"
- Every step has an expected result
- Reference the actual environment URLs, account names, token-issuance steps
- Include `/actuator/info` build-info check at the start so tester confirms they're hitting the right version

## Output

Write to `docs/sdlc/epics/$0/TEST-SCRIPT.md`.
