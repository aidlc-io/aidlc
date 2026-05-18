---
name: execute-test
description: Generate a TEST-SCRIPT (executable test scenarios for human testers / QA / partner-integration team) for a Go backend service. Covers curl / httpie / Postman scenarios per acceptance criteria.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Test Script for Epic $0 — Backend Go

You are the **QA Engineer (QA)** agent — a senior test practitioner.
Load your full persona from `.claude/agents/qa.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `execute-test`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read the epic: `docs/sdlc/epics/$0/$0.md`
2. Read the PRD: `docs/sdlc/epics/$0/PRD.md` — ACs drive scenarios
3. Read the tech design (for endpoint URLs, payload shapes, status codes)
4. Read `api/openapi.yaml` or `api/proto/` for exact contract
5. Fill the test script with the sections below

## Test Script Contents

### Prerequisites

- Base URL: `https://uat.api.example.com` (or staging)
- Test tenant ID: provided per environment
- Test JWT(s): one per role/scope to test
  - `tester-admin.jwt` — has `widgets:*` scope
  - `tester-readonly.jwt` — has `widgets:read` only
  - `tester-other-tenant.jwt` — for tenant-isolation tests
- Postman / Insomnia collection: `tests/postman/$0.json` (if exported)
- curl / httpie binary available locally
- (Optional) jq for JSON post-processing
- Clock / timezone notes: server uses UTC; client locale shouldn't matter

### Scenarios (one per AC)

For each AC, write:

#### Scenario: $0-AC01 — Create widget (happy path)

**Endpoint**: `POST /v1/widgets`
**What we're testing**: Authenticated user with `widgets:write` scope creates a widget; server returns 201 with the new widget body.

**Request**:
```bash
curl -i -X POST https://uat.api.example.com/v1/widgets \
  -H "Authorization: Bearer $(cat tester-admin.jwt)" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 11111111-1111-1111-1111-111111111111" \
  -d '{"name":"My Widget","color":"blue"}'
```

**Expected response**:
- Status: `201 Created`
- Header `Location: /v1/widgets/<id>`
- Body shape:
  ```json
  {
    "id": "<UUID>",
    "tenant_id": "<your tenant>",
    "name": "My Widget",
    "color": "blue",
    "created_at": "<RFC3339>",
    "updated_at": "<RFC3339>"
  }
  ```

**Validation steps**:
1. `id` is a UUID (regex `^[0-9a-f-]{36}$`)
2. `created_at` and `updated_at` are equal on first create
3. `tenant_id` matches the tenant in the JWT

---

#### Scenario: $0-AC02 — Create widget (validation failure)

**Request**:
```bash
curl -i -X POST https://uat.api.example.com/v1/widgets \
  -H "Authorization: Bearer $(cat tester-admin.jwt)" \
  -H "Content-Type: application/json" \
  -d '{"name":""}'
```

**Expected**:
- Status: `400 Bad Request`
- Body:
  ```json
  {
    "code": "validation_failed",
    "message": "name is required",
    "details": [{"field":"name","rule":"required"}]
  }
  ```

---

#### Scenario: $0-AC03 — AuthZ: missing JWT

**Request**:
```bash
curl -i -X POST https://uat.api.example.com/v1/widgets \
  -H "Content-Type: application/json" \
  -d '{"name":"x"}'
```

**Expected**: `401 Unauthorized` with body `{"code":"unauthorized"}`

---

#### Scenario: $0-AC04 — AuthZ: wrong scope

**Request**: same as AC01 but with `tester-readonly.jwt`.
**Expected**: `403 Forbidden` with body `{"code":"forbidden","required_scope":"widgets:write"}`

---

#### Scenario: $0-AC05 — Tenant isolation

**Setup**: Use AC01 with `tester-admin.jwt` to create widget; note `id`.
**Request**:
```bash
curl -i https://uat.api.example.com/v1/widgets/<id> \
  -H "Authorization: Bearer $(cat tester-other-tenant.jwt)"
```
**Expected**: `404 Not Found` (NOT 403 — tenant must be invisible, not "forbidden")

---

#### Scenario: $0-AC06 — Idempotency replay

**Setup**: Run AC01 once → note `id` from response.
**Request**: Re-run AC01 with the **same** `Idempotency-Key`.
**Expected**:
- Status: `200 OK` (or `201` if project policy returns idempotent-replay as same status — per PRD)
- Body: identical `id` to first response (no new widget created)
- Confirm in DB / GET endpoint that only one widget exists with that name+tenant

---

#### Scenario: $0-AC07 — Pagination (list endpoint)

**Request 1**:
```bash
curl -i "https://uat.api.example.com/v1/widgets?limit=2" \
  -H "Authorization: Bearer $(cat tester-admin.jwt)"
```
**Expected**: Status `200`; body `{"items":[{...},{...}],"next_cursor":"<opaque>"}`

**Request 2**:
```bash
curl -i "https://uat.api.example.com/v1/widgets?limit=2&cursor=<next_cursor>" \
  -H "Authorization: Bearer $(cat tester-admin.jwt)"
```
**Expected**: Next page of items, no overlap with page 1.

---

### Edge-Case Scenarios

- **Rate limit**: Hit endpoint 100 times in 1s with same tenant → `429 Too Many Requests` with `Retry-After` header
- **Slow client**: Send a partial body and pause for 35s → server closes connection (WriteTimeout)
- **Large body**: Send body > project limit (e.g. 1MB) → `413 Payload Too Large`
- **Unicode / RTL** in `name` field → stored and returned losslessly
- **Upstream failure**: trigger downstream service to return 5xx (or use chaos / kill-switch flag) → our API maps to 502 / 503 with retriable hint
- **Concurrency**: Two PATCH requests with same `If-Match`/`version` → second returns `409 Conflict`

### Regression Quick Check

- [ ] `GET /healthz` → 200
- [ ] `GET /readyz` → 200
- [ ] Existing endpoints unchanged: list them and curl each

### Verdict Section

| Scenario | Result | Build | Tester | Notes |
|----------|--------|-------|--------|-------|
| $0-AC01 | ⬜ Pass / ⬜ Fail | | | |
| $0-AC02 | ⬜ Pass / ⬜ Fail | | | |

**Sign-off**:
- [ ] All scenarios pass
- [ ] All P1 defects resolved
- [ ] QA sign-off

**Tester**: ___________  **Date**: ___________  **Environment**: UAT

### Defect Log

| ID | Severity | Description | Scenario | Status |
|----|----------|-------------|----------|--------|
|    | P1/P2/P3 |             |          | Open   |

## Rules

- Steps are concrete: full URL, full headers, full body
- Every step has an expected status + body shape
- No "make sure it works" — assert specific fields
- Scenarios are independently runnable (no "continue from previous")
- AuthZ failures are first-class scenarios, not afterthoughts
- Idempotency replays are required for non-idempotent endpoints

## Output

Write the completed test script to `docs/sdlc/epics/$0/TEST-SCRIPT.md`.
