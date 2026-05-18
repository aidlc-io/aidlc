---
name: test-plan
description: Generate a test plan for a Go backend epic. Covers table-driven unit tests, httptest handler tests, testcontainers-go integration tests, fuzz targets, vegeta/k6 load tests, and goleak / race detector requirements.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Test Plan for Epic $0

You are the **QA Engineer (QA)** agent — a senior test practitioner for Go backend services.
Load your full persona from `.claude/agents/qa.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `test-plan`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read the epic: `docs/sdlc/epics/$0/$0.md`
2. Read the PRD: `docs/sdlc/epics/$0/PRD.md` — ACs drive tests
3. Read the tech design: `docs/sdlc/epics/$0/TECH-DESIGN.md` — file impact drives test scope; interface boundaries are the seams
4. Read existing tests / fixtures:
   - `internal/<affected>/...*_test.go`
   - `internal/platform/testutil/` (if present)
   - `testdata/` directories
5. Read `.golangci.yml`, `go.mod` (which test deps are available), CI config (does it run `-race`?)
6. Fill the test plan with the sections below

## Test Plan Contents

### Test Scope

Map each AC → test ID(s):

| AC | Test type(s) | Test ID(s) |
|----|-------------|------------|
| $0-AC01 | Unit + Handler | $0-UT01, $0-UI01 |
| $0-AC02 | Integration | $0-IT01 |

Out of scope (explicit): ...

### Unit Tests — prefix `$0-UT`

Pure logic in service package + helpers. Table-driven by default.

```go
func TestService_Create(t *testing.T) {
    tests := []struct {
        name    string
        input   CreateInput
        repo    Repository // fake in-memory impl
        wantErr error
    }{
        {"valid", validInput(), newFakeRepo(), nil},
        {"validation_missing_name", missingName(), newFakeRepo(), ErrValidation},
        {"repo_duplicate", validInput(), &fakeRepo{err: ErrDuplicate}, ErrConflict},
    }
    for _, tc := range tests {
        t.Run(tc.name, func(t *testing.T) {
            t.Parallel()
            svc := NewService(tc.repo, func() time.Time { return testTime })
            _, err := svc.Create(context.Background(), tc.input)
            if !errors.Is(err, tc.wantErr) {
                t.Fatalf("got %v, want %v", err, tc.wantErr)
            }
        })
    }
}
```

Coverage targets:
- Validators / parsers
- State transitions
- Error mapping (sentinel → external code)
- Time-dependent logic (use injected clock)
- Boundary conditions (empty, max length, unicode, leading/trailing whitespace)

### Handler Tests — prefix `$0-UI`

`httptest.NewRecorder` + chi router; per endpoint, per outcome:

```go
func TestHandler_Create_201(t *testing.T) {
    svc := &fakeService{create: func(_ context.Context, _ CreateInput) (*Widget, error) {
        return &Widget{ID: "w1"}, nil
    }}
    h := NewHandler(svc, slog.Default())
    r := httptest.NewRequest("POST", "/v1/widgets", strings.NewReader(`{"name":"x"}`))
    r.Header.Set("Content-Type", "application/json")
    w := httptest.NewRecorder()
    h.Create(w, r)
    if w.Code != http.StatusCreated { t.Fatalf("status=%d", w.Code) }
    // assert body shape via cmp.Diff with cmpopts.IgnoreFields
}
```

Per endpoint, cover:
- 2xx happy path
- 400 validation failure (per field)
- 401 missing/invalid JWT
- 403 wrong scope / wrong tenant
- 404 not found
- 409 conflict (idempotency replay, optimistic-lock conflict)
- 422 semantic failure
- 429 rate limit
- 5xx from downstream — mapped, not bubbled raw

### Contract Tests — prefix `$0-CT`

If the epic touches `api/openapi.yaml` or `api/proto/`:
- OpenAPI: validate handler responses against schema (e.g., `kin-openapi/openapi3filter` or contract test in CI)
- Proto: `buf breaking --against ...` in CI; consumer-driven contracts via Pact (Go) or equivalent

### Integration Tests — prefix `$0-IT`

Use **testcontainers-go**. Skip in `-short` mode.

```go
func TestRepo_Integration(t *testing.T) {
    if testing.Short() { t.Skip("short") }
    ctx := context.Background()
    pgC, err := postgres.RunContainer(ctx,
        postgres.WithDatabase("test"),
        postgres.WithUsername("test"),
        postgres.WithPassword("test"),
        testcontainers.WithWaitStrategy(wait.ForLog("ready").WithOccurrence(2)),
    )
    require.NoError(t, err)
    t.Cleanup(func() { _ = pgC.Terminate(ctx) })
    dsn, _ := pgC.ConnectionString(ctx, "sslmode=disable")
    pool, _ := pgxpool.New(ctx, dsn)
    // apply migrations
    db := stdlib.OpenDBFromPool(pool)
    require.NoError(t, goose.Up(db, "../../migrations"))
    repo := &PostgresRepo{Q: New(pool)}
    // ... test cases against real Postgres
}
```

Covers:
- Real query execution (sqlc-generated functions)
- Transactions (commit, rollback)
- Constraint violations → mapped errors
- Migration `up` from scratch + (where reversible) `down`

### Failure-Mode Tests

| Category | Prefix | Examples |
|----------|--------|----------|
| Network / Upstream | `$0-NET` | HTTP client timeout → 504; 5xx from upstream → mapped; partial body |
| Lifecycle | `$0-LC` | SIGTERM mid-request → request completes within drain timeout; `srv.Shutdown(ctx)` honored |
| Permission / AuthZ | `$0-PM` | missing JWT, expired JWT, wrong algorithm, wrong scope, wrong tenant ID |
| Concurrency | `$0-CC` | concurrent writes → optimistic lock; goroutine leak detection via `goleak` in `TestMain`; race detector |

### Non-Functional Tests

- **Performance** (`$0-PF`): vegeta or k6 against staging; assert p50/p95/p99 from PRD; assert RPS target sustained; monitor pgxpool / goroutines during load
- **Security** (`$0-SEC`): AuthZ matrix; `gosec ./...`; `govulncheck ./...`; SQL-injection scan (sqlc protects but verify with fuzz on string params); secrets-in-binary scan via `grep` on built artifact
- **Fuzz** (`$0-FZ`): native `go test -fuzz=Fuzz<X>` on parsers, validators, header decoders, URL extractors

Example fuzz target:

```go
func FuzzParseWidgetID(f *testing.F) {
    f.Add("w_123abc")
    f.Fuzz(func(t *testing.T, s string) {
        _, _ = ParseWidgetID(s) // must not panic
    })
}
```

### Determinism Requirements

- `go test -race ./...` MUST be in CI
- `t.Parallel()` on independent tests
- Inject clock — no `time.Now()` directly in tested code
- Seed any random with deterministic value per test (or accept it as a parameter)
- No reliance on map iteration order

### Goroutine Leak Detection

For any package that spawns goroutines:

```go
func TestMain(m *testing.M) {
    goleak.VerifyTestMain(m)
}
```

### Test Data Strategy

- Builders/factories per type (e.g., `WidgetBuilder().WithName("x").Build()`)
- No global fixtures
- Each integration test creates its own tenant_id (e.g., `uuid.New()`)
- Cleanup via `t.Cleanup` + `TRUNCATE` (or container disposal per package)

### Environment / Compatibility Matrix

| Dimension | Values | Priority |
|-----------|--------|----------|
| Go version | go.mod directive + latest | P1 / spot-check |
| Postgres | matches prod major | P1 |
| OS | linux/amd64 (CI) | P1 |
| Race detector | on | P1 (mandatory) |

### Coverage Requirements

```bash
go test -race -coverprofile=cover.out -covermode=atomic ./...
go tool cover -func=cover.out
```

- Target: ≥ 80% for new packages (handler/service)
- Per-package review, not just total
- Don't chase 100% — error paths that just return wrapped errors don't need a unit test

### Flaky-Test Policy

- Inject clock; never `time.Sleep` in tests
- No network calls in unit tests
- No shared state across tests
- `t.Parallel()` only where data is isolated
- Quarantine flaky tests; fix or delete — never retry-to-green

## Output

Write the completed test plan to `docs/sdlc/epics/$0/TEST-PLAN.md`.
