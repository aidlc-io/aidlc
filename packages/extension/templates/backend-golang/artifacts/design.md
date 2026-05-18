# Technical Design — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Tech Lead
**Status:** Draft
**Created:** `$DATE`
**Service:** *(e.g. `user-svc`)*

---

## 1. Overview

> *One-paragraph summary of the Go approach (chi router, sqlc + pgx repository, errgroup orchestration, OTEL instrumentation).*

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ cmd/api/main.go (wiring; config; signal handling)               │
└────────┬────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ chi.Router  ──[middleware: RequestID, Recoverer, otelhttp,      │
│                          Logger, Timeout, AuthN, AuthZ]──►       │
│   ▼                                                              │
│ internal/widget/handler.go   (HTTP → service)                    │
│   ▼                                                              │
│ internal/widget/service.go   (business logic, Repository iface)  │
│   ▼ (interface)                                                  │
│ internal/widget/repository.go (PostgresRepo: sqlc.Queries)       │
│   ▼                                                              │
│ pgxpool ──► PostgreSQL                                           │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 Package Layout

```
cmd/api/main.go                          # entrypoint
internal/
  platform/
    db/        # pgxpool factory, goose runner
    http/      # chi middleware (RequestID, AuthN, AuthZ, Recoverer)
    logger/    # slog handler config
    config/    # envconfig structs
    telemetry/ # OTEL tracer + meter setup
  widget/
    handler.go      # http.Handler implementations
    service.go      # business logic + Repository interface (consumer-side)
    repository.go   # PostgresRepo implementing Repository
    queries.sql     # sqlc input
    queries.sql.go  # sqlc output
    widget.go       # domain type
    errors.go       # sentinel errors
    routes.go       # chi sub-router registration
    *_test.go
migrations/
  0042_add_widgets.sql
api/
  openapi.yaml
```

### 2.2 Layer Mapping

| Layer | Package | Responsibility |
|-------|---------|---------------|
| Transport | `internal/widget/handler.go` | HTTP shape ↔ service input/output; status mapping |
| Business | `internal/widget/service.go` | Validation, orchestration, error mapping |
| Persistence iface | `internal/widget/service.go` | `Repository` interface (consumer-side) |
| Persistence impl | `internal/widget/repository.go` | `PostgresRepo` wrapping sqlc `Queries` |
| Platform | `internal/platform/db` | `pgxpool` factory |

## 3. API Contract

### 3.1 HTTP

**`POST /v1/widgets`** — Create widget

Request:
```json
{
  "name": "My Widget",
  "color": "blue"
}
```

Headers:
- `Authorization: Bearer <jwt>` (required)
- `Idempotency-Key: <uuid>` (required for non-idempotent writes)
- `Content-Type: application/json`

Response 201:
```json
{
  "id": "01234567-89ab-7def-0123-456789abcdef",
  "tenant_id": "...",
  "name": "My Widget",
  "color": "blue",
  "created_at": "2026-05-18T10:00:00Z",
  "updated_at": "2026-05-18T10:00:00Z"
}
```

Errors:
| Status | Code | Cause |
|--------|------|-------|
| 400 | `validation_failed` | name empty / color not in enum |
| 401 | `unauthorized` | missing/invalid JWT |
| 403 | `forbidden` | missing `widgets:write` scope |
| 409 | `conflict` | (name, tenant_id) unique constraint violated |
| 429 | `rate_limited` | per-tenant token bucket exhausted |
| 500 | `internal` | unmapped server error |
| 503 | `unavailable` | downstream / DB unreachable |

### 3.2 Go types

```go
// internal/widget/widget.go
type Widget struct {
    ID        string    `json:"id"`
    TenantID  string    `json:"tenant_id"`
    Name      string    `json:"name"`
    Color     string    `json:"color"`
    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`
}

type CreateInput struct {
    Name  string `json:"name"  validate:"required,min=1,max=100"`
    Color string `json:"color" validate:"omitempty,oneof=red green blue"`
}
```

### 3.3 Sentinel Errors

```go
// internal/widget/errors.go
var (
    ErrNotFound   = errors.New("widget: not found")
    ErrConflict   = errors.New("widget: conflict")
    ErrValidation = errors.New("widget: validation failed")
)
```

## 4. Data Model

### 4.1 Migration (goose)

```sql
-- migrations/0042_add_widgets.sql
-- +goose Up
CREATE TABLE widgets (
    id              UUID PRIMARY KEY,
    tenant_id       UUID NOT NULL,
    name            TEXT NOT NULL,
    color           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT widgets_tenant_name_uniq UNIQUE (tenant_id, name)
);
CREATE INDEX widgets_tenant_id_created_at_idx
    ON widgets(tenant_id, created_at DESC);

-- +goose Down
DROP TABLE widgets;
```

### 4.2 sqlc Queries

```sql
-- internal/widget/queries.sql

-- name: CreateWidget :one
INSERT INTO widgets (id, tenant_id, name, color)
VALUES ($1, $2, $3, $4)
RETURNING id, tenant_id, name, color, created_at, updated_at;

-- name: GetWidget :one
SELECT id, tenant_id, name, color, created_at, updated_at
FROM widgets
WHERE id = $1 AND tenant_id = $2;

-- name: ListWidgetsByTenant :many
SELECT id, tenant_id, name, color, created_at, updated_at
FROM widgets
WHERE tenant_id = $1 AND ($2::timestamptz IS NULL OR created_at < $2)
ORDER BY created_at DESC
LIMIT $3;
```

### 4.3 Migration Sequencing (expand-contract)

| Step | Action | Release |
|------|--------|---------|
| 1 | Expand: add `widgets` table | v$0 (this) |
| 2 | Code switch: deploy handler/service | v$0 (this) |
| 3 | Backfill | n/a (new table) |
| 4 | Contract: n/a | n/a |

## 5. Dependency Wiring

```go
// cmd/api/main.go (sketch)
func main() {
    ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
    defer cancel()

    var cfg Config
    envconfig.MustProcess("APP", &cfg)

    pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
    if err != nil { log.Fatal(err) }
    defer pool.Close()

    // Telemetry
    shutdown := telemetry.Setup(ctx, cfg)
    defer shutdown(context.Background())

    // Widget feature
    queries := widget.New(pool)
    repo := &widget.PostgresRepo{Q: queries}
    svc := widget.NewService(repo, time.Now)
    h := widget.NewHandler(svc, slog.Default())

    r := chi.NewRouter()
    r.Use(middleware.RequestID, middleware.Recoverer,
          otelhttp.NewMiddleware("api"),
          httpmw.Logger(slog.Default()),
          middleware.Timeout(30*time.Second),
          httpmw.Auth(cfg.JWTPublicKey))
    r.Mount("/v1/widgets", widget.Routes(h))
    r.Get("/healthz", health.Live)
    r.Get("/readyz", health.Ready(pool))

    srv := &http.Server{
        Addr:              cfg.Addr,
        Handler:           r,
        ReadHeaderTimeout: 5 * time.Second,
        ReadTimeout:       30 * time.Second,
        WriteTimeout:      30 * time.Second,
        IdleTimeout:       120 * time.Second,
    }

    g, gctx := errgroup.WithContext(ctx)
    g.Go(func() error { return srv.ListenAndServe() })
    g.Go(func() error {
        <-gctx.Done()
        shutdownCtx, c := context.WithTimeout(context.Background(), 30*time.Second)
        defer c()
        return srv.Shutdown(shutdownCtx)
    })
    if err := g.Wait(); err != nil && !errors.Is(err, http.ErrServerClosed) {
        log.Fatal(err)
    }
}
```

## 6. File Impact List

| File | Change | Reason |
|------|--------|--------|
| `internal/widget/handler.go` | Add | HTTP handlers |
| `internal/widget/service.go` | Add | Business logic + `Repository` interface |
| `internal/widget/repository.go` | Add | `PostgresRepo` |
| `internal/widget/queries.sql` | Add | sqlc input |
| `internal/widget/widget.go` | Add | Domain type |
| `internal/widget/errors.go` | Add | Sentinel errors |
| `internal/widget/routes.go` | Add | chi sub-router |
| `internal/widget/*_test.go` | Add | Unit + integration tests |
| `migrations/0042_add_widgets.sql` | Add | Schema |
| `cmd/api/main.go` | Modify | Wire new handler |
| `api/openapi.yaml` | Modify | Document endpoints |
| `internal/platform/config/config.go` | Modify (maybe) | New env var if any |

## 7. Security Considerations

- Input validation: `validator/v10` tags + custom funcs for color enum
- AuthN: JWT verification via `jwt/v5` with explicit algorithm allowlist (`RS256` only); reject `none`
- AuthZ: scope `widgets:write` for POST/PATCH/DELETE; `widgets:read` for GET
- Tenant isolation: `tenant_id` extracted from JWT claims, NEVER from body/path; enforced in WHERE clauses
- SQL: parameterized via sqlc (`$1` placeholders); no string concat
- Secrets: loaded by `envconfig` from env; no hardcoded DSN/keys
- PII: none here; if added later, redact in slog via `ReplaceAttr`

## 8. Performance Considerations

- pgxpool: `max_conns = 30` (matches load test); idle `min_conns = 5`
- Index `widgets(tenant_id, created_at DESC)` for list query
- Rate limit: `golang.org/x/time/rate` token bucket — 100 RPS per tenant
- Cache: none in v1; consider Redis read-through for hot list queries if p95 > target
- JSON encoding: `encoding/json` stdlib; `goccy/go-json` swap deferred unless profile justifies

## 9. Observability

- **slog** fields: `request_id`, `tenant_id`, `user_id`, `route`, `status`, `duration_ms`, `error`
- **OTEL spans**: `widget.handler.create`, `widget.service.create`, `widget.repo.create` (latter via `otelpgx`)
- **Metrics**:
  - `http_server_requests_total{route, code}` (counter)
  - `http_server_duration_seconds{route}` (histogram)
  - `widget_creates_total{tenant_id}` (counter)
  - `pgxpool_*` from `otelpgxstats`

## 10. Rollout

| Item | Value |
|------|-------|
| Feature flag | `feature.widgets` (default `false`; ramp 10% → 50% → 100%) |
| Migration order | expand-only (this release) |
| Rollback | flag flip; previous container tag; migration `down` available |

## 11. Risks & Technical Debt

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| pgxpool sized wrong | Med | Med | Start at 30; alert if `acquired ≥ 80%` |
| Validation lib custom funcs miss edge case | Low | Low | Fuzz target on input |
| Tenant filter forgotten in future query | Low | High | Code review checklist + repo unit tests assert tenant_id is in WHERE |

## 12. Open Questions / Risks

| # | Question / Risk | Owner | Status |
|---|----------------|-------|--------|
| 1 | Should `color` be FK to a `colors` table? | TL + PO | Open |
