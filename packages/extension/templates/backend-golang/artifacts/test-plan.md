# Test Plan — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** QA
**Status:** Draft
**Created:** `$DATE`
**Service:** *(e.g. `user-svc`)*

---

## 1. Scope

**In scope:**
- `POST /v1/widgets` create flow + validation + authZ
- `GET /v1/widgets/{id}` retrieve + tenant isolation
- `GET /v1/widgets` list + cursor pagination
- Idempotency replay
- Migration `0042_add_widgets.sql`

**Out of scope:**
- Existing `/v0/widgets` legacy flow
- Per-user (not per-tenant) ACL

## 2. Test Strategy

| Type | Tool / Approach | Owner |
|------|----------------|-------|
| Unit | stdlib `testing`, table-driven | Dev |
| Handler | `net/http/httptest` + chi router | Dev |
| Integration | `testcontainers-go` (Postgres) | Dev / QA |
| Contract | OpenAPI validation in CI (spectral / kin-openapi) | QA |
| Fuzz | `go test -fuzz=Fuzz<X>` on parsers | Dev |
| Race detector | `go test -race ./...` (CI) | CI |
| Goroutine leak | `goleak.VerifyTestMain` | Dev |
| Load | **vegeta** against UAT | QA |
| Security | `gosec ./...`, `govulncheck ./...` | CI |
| Coverage | `go test -coverprofile=cover.out -covermode=atomic` | CI |

## 3. Test Cases

### TC-01 — $EPIC_ID-UT01 — Validate happy path input

**Type:** Unit (table-driven)
**Package:** `internal/widget`
**Preconditions:** none
**Steps:**
1. Build `CreateInput{Name:"x", Color:"blue"}`
2. Call `svc.Create(ctx, in)` with fake `Repository`
**Expected:** Returns widget; no error
**AC covered:** $EPIC_ID-AC01

---

### TC-02 — $EPIC_ID-UT02 — Reject empty name

**Type:** Unit (table-driven)
**Steps:**
1. Build `CreateInput{Name:""}`
2. Call `svc.Create(ctx, in)`
**Expected:** `errors.Is(err, ErrValidation)` true
**AC covered:** $EPIC_ID-AC02

---

### TC-03 — $EPIC_ID-UI01 — Handler returns 201 on success

**Type:** Handler (`httptest.NewRecorder`)
**Package:** `internal/widget`
**Preconditions:** fake service returns widget
**Steps:**
1. `r := httptest.NewRequest("POST", "/v1/widgets", body)`
2. `r.Header.Set("Authorization", "Bearer "+testJWT)`
3. Call handler
**Expected:** Status `201`, body matches `Widget` shape (cmp.Diff with IgnoreFields(`CreatedAt`, `UpdatedAt`))
**AC covered:** $EPIC_ID-AC01

---

### TC-04 — $EPIC_ID-UI02 — Handler returns 401 without JWT

**Steps:** Request without Authorization
**Expected:** Status `401`, body `{"code":"unauthorized"}`
**AC covered:** $EPIC_ID-AC03

---

### TC-05 — $EPIC_ID-IT01 — Repository creates row in Postgres

**Type:** Integration (testcontainers-go)
**Preconditions:** Postgres container started + `goose up`
**Steps:**
1. Spin up Postgres via testcontainers-go
2. Apply migrations via `goose.Up`
3. Call `repo.Create(ctx, widget)`
4. SELECT row back via raw `pool.QueryRow`
**Expected:** Row present; columns match
**AC covered:** $EPIC_ID-AC01

---

### TC-06 — $EPIC_ID-IT02 — Unique constraint violation maps to ErrConflict

**Steps:**
1. Create widget with name `"x"` in tenant T1 → ok
2. Create widget with name `"x"` in tenant T1 again
**Expected:** `errors.Is(err, ErrConflict)` true
**AC covered:** $EPIC_ID-AC05

---

### TC-07 — $EPIC_ID-PM01 — Tenant isolation

**Steps:**
1. Create widget in tenant T1 → note ID
2. GET that ID using JWT for tenant T2
**Expected:** 404 (NOT 403 — tenant must be invisible)
**AC covered:** $EPIC_ID-AC06

---

### TC-08 — $EPIC_ID-CC01 — Concurrent create with same idempotency key

**Steps:**
1. Two goroutines POST with same Idempotency-Key
**Expected:** Both return 201 with same widget ID; exactly one DB row
**AC covered:** $EPIC_ID-AC07

---

### TC-09 — $EPIC_ID-NET01 — Postgres unavailable maps to 503

**Steps:**
1. Stop Postgres container
2. POST /v1/widgets
**Expected:** Status `503`, body `{"code":"unavailable"}`; slog `error` field populated

---

### TC-10 — $EPIC_ID-LC01 — Graceful shutdown completes in-flight request

**Steps:**
1. Start server
2. Begin POST that takes ~5s
3. Send SIGTERM
**Expected:** In-flight request completes; new requests refused; server exits within 30s drain timeout

---

### TC-11 — $EPIC_ID-FZ01 — Fuzz widget ID parser

**Type:** Fuzz
**Target:** `FuzzParseWidgetID`
**Steps:** Run `go test -fuzz=FuzzParseWidgetID -fuzztime=60s ./internal/widget`
**Expected:** No panic, no out-of-bounds

---

### TC-12 — $EPIC_ID-PF01 — Latency p95 < 200ms at 500 RPS

**Type:** Load (vegeta)
**Steps:**
```bash
echo "POST https://uat.api/v1/widgets
Authorization: Bearer $JWT
Content-Type: application/json
@create-widget.json" | vegeta attack -rate=500 -duration=60s | vegeta report -type=hist
```
**Expected:** p50 < 80ms, p95 < 200ms, p99 < 500ms; 0 errors

---

## 4. Unit Test Coverage Requirements

| Package | Target | Notes |
|---------|--------|-------|
| `internal/widget` | ≥ 80% | Don't chase 100%; cover handler/service/repo branches |
| `internal/platform/*` | ≥ 70% | Cross-cutting; some glue is hard to test |

## 5. Environment / Compatibility Matrix

| Dimension | Values | Priority |
|-----------|--------|----------|
| Go version | go.mod directive + latest stable | P1 / P2 |
| Postgres | matches prod major (15 / 16) | P1 |
| OS (CI) | linux/amd64 | P1 |
| Race detector | always on | P1 (mandatory) |
| `-short` mode | skips integration tests for quick feedback | P2 |

## 6. Performance Benchmarks

| Scenario | Threshold |
|----------|-----------|
| Create p95 | < 200 ms at 500 RPS |
| List p95 (20 items) | < 100 ms |
| pgxpool wait p95 under load | < 100 ms |
| go_goroutines under load | < 1000 sustained, < 20%/h growth |

## 7. Regression Checklist

- [ ] `GET /healthz` returns 200
- [ ] `GET /readyz` returns 200 (checks pgxpool + redis if applicable)
- [ ] Existing endpoints unchanged (smoke test each)
- [ ] `go test -race ./...` green
- [ ] `golangci-lint run ./...` clean
- [ ] `govulncheck ./...` clean

## 8. Sign-off Criteria

- [ ] All TC-xx pass on CI
- [ ] Unit coverage ≥ target per package
- [ ] No P1 open bugs
- [ ] Load test thresholds met
- [ ] `go test -race ./...` green
- [ ] `golangci-lint` clean
- [ ] `govulncheck` clean
- [ ] QA sign-off
