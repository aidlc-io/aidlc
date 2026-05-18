---
name: execute-test
description: Generate a TEST-SCRIPT for ASP.NET Core backend epics — executable scenarios for QA / partner devs / on-call. Uses curl / Bruno / Postman collections against staging or preview env, covers auth setup, idempotency replay, rate-limit, and error scenarios.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Test Script for Epic $0

You are the **QA Engineer (QA)** agent — a senior test practitioner.
Load your full persona from `.claude/agents/qa.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `execute-test`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read epic: `docs/sdlc/epics/$0/$0.md`
2. Read PRD: `docs/sdlc/epics/$0/PRD.md` — AC drive scenarios
3. Read tech design: `docs/sdlc/epics/$0/TECH-DESIGN.md` — endpoint surface, auth policy, rate-limit policy
4. Read template: `docs/sdlc/epics/$0/TEST-SCRIPT.md` or `docs/sdlc/templates/TEST-SCRIPT-TEMPLATE.md`
5. Fill the test script with sections below

## Test Script Contents

### Prerequisites

| Item | Value / Where to get |
|------|----------------------|
| Environment URL | `https://api-staging.example.com` |
| Service version | vX.Y.Z (commit SHA `<sha>`) |
| API version path | `/v1` (or `api-version: 1.0` header) |
| OpenAPI spec | `https://api-staging.example.com/openapi/v1.json` |
| Test tenant ID | `tenant_test_<id>` |
| Test JWT / API key | Get from `team-credentials` 1Password vault (entry: "{{EPIC_PREFIX}} test JWT") |
| Required scopes / roles | `orders:read`, `orders:write` |
| Feature flags | `OrdersV2=on` (configure via LaunchDarkly / Microsoft.FeatureManagement) |
| Tools | `curl` 8+, **Bruno** (preferred for collections), Postman, `jq` |
| Seed data | Tenant `tenant_test_<id>` pre-populated with N orders — see `tests/seed/<epic>.sql` |

### Auth Setup

Step 1 — obtain JWT (script or manual):
```bash
TOKEN=$(curl -s -X POST "$IDP_URL/oauth2/token" \
  -d "grant_type=client_credentials" \
  -d "client_id=$CID" -d "client_secret=$CSECRET" \
  -d "scope=orders:read orders:write" | jq -r .access_token)
```

Step 2 — verify token has required claims:
```bash
echo "$TOKEN" | cut -d. -f2 | base64 -d | jq '.scope, .tenant_id, .exp'
```

Expected: `scope` contains `orders:read orders:write`, `tenant_id` matches test tenant, `exp` ≥ now + 1h.

### Scenarios (one per acceptance criteria)

For **each acceptance criteria** in PRD, write a scenario:
- **What we're testing** (one sentence, plain language)
- **Pre-state** (data the tenant must / must not have)
- **curl / Bruno step(s)** — exact command, no jargon
- **Expected** status code, response shape (JSON snippet), and side effect (DB row exists / event published)
- **Traceability**: AC ID

**Example scenario layout**:

```markdown
#### Scenario S01 — Create order (happy path) — covers AC01

**Pre-state**: Tenant has no order with `idempotency-key: test-S01-001`.

**Step 1** — POST a new order:
```bash
curl -s -X POST "$BASE_URL/v1/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-S01-001" \
  -d '{ "customerId": "cust_abc", "items": [{"sku": "SKU-1", "qty": 2}] }'
```

**Expected response**:
- Status: `201 Created`
- Header: `Location: /v1/orders/<id>`
- Body:
  ```json
  {
    "id": "<ulid>",
    "status": "Pending",
    "createdAt": "<iso-utc>"
  }
  ```

**Verify side effects**:
- New row in `orders` table with status `Pending`
- Event `order.created` published to `orders` Kafka topic (check via consumer or admin UI)
```

### Edge-Case Scenarios (at minimum)

- **Idempotency replay** — same `Idempotency-Key` returns identical response (cached); different key creates new order
- **Validation failure** — missing required field returns `400` with `ValidationProblemDetails` shape
- **Auth failure** — no token → `401`; wrong scope → `403`
- **Tenant isolation** — request with tenant A's token tries to read tenant B's resource → `404` (not `403`, to avoid leaking existence)
- **Rate-limit** — burst above limit returns `429` with `Retry-After` header
- **Concurrency conflict** — two PUTs to same resource with stale `If-Match` → second returns `409`
- **Upstream failure** — partner API down → endpoint returns `503` with retry guidance (or graceful degradation as designed)
- **Migration coexist** — old client (previous release schema) still works against new service

### ProblemDetails Verification

For every error scenario, verify response body matches:
```json
{
  "type": "https://api.example.com/problems/validation",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "detail": "<human-readable>",
  "instance": "/v1/orders",
  "errors": { "field": ["error message"] }
}
```

### Performance Smoke (optional, if epic touches hot path)

Run a 30-second NBomber / k6 smoke:
```bash
k6 run --vus 50 --duration 30s tests/load/orders-smoke.js
```

Expected:
- p95 latency < X ms
- Error rate < 0.5%
- Throughput ≥ N RPS

### Regression Quick Check

- Login / auth flow still works
- Existing top-traffic endpoint (`GET /v1/orders`) still works
- Health checks green (`/healthz/live`, `/healthz/ready`)

### Verdict Section

- Pass / fail per scenario
- Sign-off fields (tester, date, env URL, service version, verdict)
- Defect log (description, severity, ProblemDetails JSON if applicable, ticket ref)

## Rules

- Steps must be concrete: exact URL, exact header, exact body
- Every step has a concrete expected result (status code + response shape)
- No "see that it works" — verify specific JSON path or DB state
- Bruno / Postman collection committed alongside script when possible
- Scenarios independently runnable — no "continue from S01" unless explicit

## Output

Write the completed test script to `docs/sdlc/epics/$0/TEST-SCRIPT.md`.
