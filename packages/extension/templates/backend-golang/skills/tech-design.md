---
name: tech-design
description: Generate or review a Technical Design for a Go backend epic. Produces package layout, sqlc + goose plan, http.Server config, OpenTelemetry instrumentation, errgroup orchestration, and rollout strategy.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Tech Design for Epic $0

You are the **Tech Lead (TL)** agent — a staff-level engineer for Go backend services.
Load your full persona from `.claude/agents/tech-lead.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `design`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read the epic doc: `docs/sdlc/epics/$0/$0.md`
2. Read the PRD: `docs/sdlc/epics/$0/PRD.md` (must be complete first)
3. Read the tech design template: `docs/sdlc/epics/$0/TECH-DESIGN.md` or `docs/sdlc/templates/TECH-DESIGN-TEMPLATE.md`
4. Analyze existing codebase:
   - `CLAUDE.md`, `README.md`, `docs/architecture.md`
   - `cmd/<binary>/main.go` — wiring + flag/env handling
   - `internal/platform/` — db, http, logger, telemetry, config packages
   - `internal/<affected-feature>/` — existing handler / service / repository / queries.sql
   - `api/openapi.yaml`, `api/proto/` — current API surface
   - `migrations/` — current schema state
   - `.golangci.yml`, `sqlc.yaml`, `goose.yaml`
   - Related ADRs (`docs/adr/`)
5. Fill the tech design with the sections below

## Tech Design Contents

### Summary
- One paragraph: what is being built and the chosen approach

### Architecture

- **Package layout** — package-by-feature under `internal/<feature>/` (handler.go, service.go, repository.go, queries.sql); cross-cutting under `internal/platform/`
- **Layer mapping** — handler → service → repository interface; repository impl is wired in `cmd/<binary>/main.go`
- **Interface placement** — repository interface declared in service package (consumer-side); impl in `repository.go` or `postgres.go`
- **Key design choices** with rationale — chi vs echo, sqlc vs squirrel, sync vs async, pgx vs database/sql
- Link to ADRs for irreversible decisions (DB engine choice, gRPC adoption, message broker selection)

### HTTP / gRPC API Contract

For each new/modified endpoint:
- Method + path (HTTP) or service.method (gRPC)
- Request shape (Go struct with `json:` / `validate:` tags)
- Response shape per status code
- Error mapping: sentinel/typed Go error → HTTP status + JSON envelope (or gRPC code)
- Idempotency contract for non-idempotent verbs (idempotency-key header? unique constraint? upsert via `ON CONFLICT`?)
- Pagination contract (cursor, max page size)
- Versioning policy (path prefix `/v1`, additive-only JSON, proto `reserved` for removed fields)

Example chi handler skeleton:

```go
r.Route("/v1/widgets", func(r chi.Router) {
    r.Use(middleware.RequireScope("widgets:write"))
    r.Post("/", h.Create)          // 201 on create, 409 on conflict
    r.Get("/{id}", h.Get)          // 200 / 404
    r.Patch("/{id}", h.Update)     // 200 / 404 / 409
})
```

### Data Model

- New/modified tables, columns, indexes
- Migration plan via **goose**, expand-contract sequenced:
  1. Expand (additive, nullable, new table)
  2. Backfill (background job, idempotent, batched)
  3. Code switch (deploy new code reading/writing new shape)
  4. Contract (drop old column/index in later release)
- Constraints, invariants, FK, check constraints

Example goose migration:

```sql
-- migrations/0042_add_widgets.sql
-- +goose Up
CREATE TABLE widgets (
    id          UUID PRIMARY KEY,
    tenant_id   UUID NOT NULL,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX widgets_tenant_id_idx ON widgets(tenant_id);

-- +goose Down
DROP TABLE widgets;
```

Example sqlc query block:

```sql
-- internal/widget/queries.sql

-- name: CreateWidget :one
INSERT INTO widgets (id, tenant_id, name)
VALUES ($1, $2, $3)
RETURNING id, tenant_id, name, created_at, updated_at;

-- name: GetWidget :one
SELECT id, tenant_id, name, created_at, updated_at
FROM widgets
WHERE id = $1 AND tenant_id = $2;

-- name: ListWidgetsByTenant :many
SELECT id, tenant_id, name, created_at, updated_at
FROM widgets
WHERE tenant_id = $1 AND created_at < $2
ORDER BY created_at DESC
LIMIT $3;
```

### State Management

- Where state lives: Postgres (source of truth), Redis (cache / rate-limit / session), in-process LRU (hot lookups)
- Cache invalidation strategy (TTL / write-through / event-driven)
- Source-of-truth declaration per entity

### Sequence / Flow

- Key flow across handler → service → repository → DB
- Concurrency: spawned via `errgroup`? owned by request ctx? background worker with separate ctx?
- Error / retry paths (upstream timeout, DB deadlock retry, rate-limit backoff)

### Dependency Wiring

```go
// cmd/api/main.go (sketch)
pool, _ := pgxpool.New(ctx, cfg.DatabaseURL)
defer pool.Close()

queries := widget.New(pool)
repo := &widget.PostgresRepo{Q: queries}
svc := widget.NewService(repo, clock.System)
h := widget.NewHandler(svc, slog.Default())

r := chi.NewRouter()
r.Use(middleware.RequestID, middleware.Recoverer, otelhttp.NewMiddleware("api"))
r.Mount("/v1/widgets", widget.Routes(h))
```

### Non-Functional Design

- **Performance budget**: p50 / p95 / p99 latency per endpoint; expected RPS; pgxpool size
- **Reliability**: retry policy (exponential backoff with jitter for upstreams; NO retries on non-idempotent writes); timeouts (per-request `context.WithTimeout`); circuit breaker if downstream history warrants
- **Security**: input validation via `validator/v10`; JWT verification with `jwt/v5` (explicit algorithm allowlist, NEVER `none`); secrets from env (loaded by `envconfig`); PII in `slog` redacted via `ReplaceAttr`
- **Observability**:
  - **slog** fields: `request_id`, `tenant_id`, `user_id` (if present), `route`, `status`, `duration_ms`, `error`
  - **OTEL spans**: per handler, per service method, per DB query (via `otelpgx`)
  - **Metrics**: RED per endpoint + USE for pgxpool + Go runtime (`go_goroutines`, `go_memstats_*`, `go_gc_*`)
- **Compatibility**: minimum Go version (`go.mod` directive); minimum Postgres version
- **`http.Server` timeouts**:
  ```go
  srv := &http.Server{
      Addr:              cfg.Addr,
      Handler:           r,
      ReadHeaderTimeout: 5 * time.Second,
      ReadTimeout:       30 * time.Second,
      WriteTimeout:      30 * time.Second,
      IdleTimeout:       120 * time.Second,
  }
  ```

### Rollout & Reversibility

- Feature flag(s) (OpenFeature flag name + default + ramp plan)
- Migration sequence: expand → deploy code → backfill → contract (separate releases)
- Rollback path:
  1. Flag flip (fastest)
  2. Deploy previous tag (rolling-back signed container)
  3. `goose down` only if migration is reversible AND no new data depends on the new shape

### File / Module Impact

| File | Change type | Reason |
|------|------------|--------|
| `internal/widget/handler.go` | Add | New endpoint handler |
| `internal/widget/service.go` | Add | Business logic + `Repository` interface |
| `internal/widget/repository.go` | Add | `PostgresRepo` implementing `Repository` |
| `internal/widget/queries.sql` | Add | sqlc input |
| `migrations/0042_add_widgets.sql` | Add | Schema |
| `cmd/api/main.go` | Modify | Wire new handler |
| `api/openapi.yaml` | Modify | Document new endpoint |
| `internal/widget/*_test.go` | Add | Unit + integration tests |

### Risks & Technical Debt

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Backfill volume too large for online run | Med | High | Run in batches via cron job; throttle |
| pgxpool sized wrong | Med | Med | Start with current `max_conns * 0.8`; alert on saturation |

### Open Questions

- Q: Should `widgets.tenant_id` be FK to `tenants(id)` or denormalised? (Owner: TL + DBA)

## Architecture Rules (Go-specific)

- Repository interfaces declared in service package, NOT repository package
- `context.Context` is first parameter of every I/O function
- No `context.Background()` / `context.TODO()` in request paths
- No goroutine without exit condition (`<-ctx.Done()`, errgroup, explicit stop)
- `http.Server` timeouts mandatory
- pgxpool shared, not wrapped in `sql.DB`
- All `errors` wrapped with `%w`; sentinels via `errors.Is`; typed via `errors.As`
- No `init()` for non-trivial work; wire in `main`

## Output

Write the completed tech design to `docs/sdlc/epics/$0/TECH-DESIGN.md`.
