# Implementation Summary — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Developer
**Branch:** `feature/$EPIC_ID-<slug>`
**Status:** Draft
**Created:** `$DATE`

---

## 1. Branch & PR

| Item | Value |
|------|-------|
| Branch | `feature/$EPIC_ID-<slug>` |
| PR | *(link once opened)* |
| Base | `main` |

## 2. Files Changed

| File | Type | Description |
|------|------|-------------|
| `internal/widget/handler.go` | Add | HTTP handlers (chi) |
| `internal/widget/service.go` | Add | Business logic + Repository interface |
| `internal/widget/repository.go` | Add | PostgresRepo (sqlc-backed) |
| `internal/widget/queries.sql` | Add | sqlc query definitions |
| `internal/widget/queries.sql.go` | Add (generated) | `sqlc generate` output |
| `internal/widget/widget.go` | Add | Domain type |
| `internal/widget/errors.go` | Add | Sentinel errors |
| `internal/widget/routes.go` | Add | chi sub-router |
| `internal/widget/*_test.go` | Add | Unit + handler + integration tests |
| `migrations/0042_add_widgets.sql` | Add | Schema migration |
| `cmd/api/main.go` | Modify | Wire new feature |
| `api/openapi.yaml` | Modify | Document endpoints |

## 3. Implementation Notes

> *Key decisions made during implementation. Reference design doc sections where relevant.*

### Handler skeleton

```go
// internal/widget/handler.go
type Handler struct {
    svc *Service
    log *slog.Logger
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context()
    var in CreateInput
    if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
        writeError(w, http.StatusBadRequest, "validation_failed", "invalid JSON")
        return
    }
    if err := validate.Struct(in); err != nil {
        writeError(w, http.StatusBadRequest, "validation_failed", err.Error())
        return
    }
    tenantID := httpmw.TenantFromContext(ctx)
    out, err := h.svc.Create(ctx, tenantID, in)
    switch {
    case errors.Is(err, ErrConflict):
        writeError(w, http.StatusConflict, "conflict", "duplicate name")
    case errors.Is(err, ErrValidation):
        writeError(w, http.StatusBadRequest, "validation_failed", err.Error())
    case err != nil:
        h.log.ErrorContext(ctx, "widget create failed", "err", err)
        writeError(w, http.StatusInternalServerError, "internal", "")
    default:
        w.Header().Set("Location", "/v1/widgets/"+out.ID)
        writeJSON(w, http.StatusCreated, out)
    }
}
```

### Service + Table-driven test

```go
// internal/widget/service.go
type Repository interface {
    Create(ctx context.Context, w *Widget) error
    Get(ctx context.Context, tenantID, id string) (*Widget, error)
}

type Service struct {
    repo  Repository
    now   func() time.Time
}

func (s *Service) Create(ctx context.Context, tenantID string, in CreateInput) (*Widget, error) {
    w := &Widget{
        ID:        uuid.NewString(),
        TenantID:  tenantID,
        Name:      in.Name,
        Color:     in.Color,
        CreatedAt: s.now(),
        UpdatedAt: s.now(),
    }
    if err := s.repo.Create(ctx, w); err != nil {
        return nil, fmt.Errorf("repo create: %w", err)
    }
    return w, nil
}
```

```go
// internal/widget/service_test.go
func TestService_Create(t *testing.T) {
    tests := []struct {
        name    string
        repo    Repository
        wantErr error
    }{
        {"ok", &fakeRepo{}, nil},
        {"conflict", &fakeRepo{createErr: ErrConflict}, ErrConflict},
    }
    for _, tc := range tests {
        t.Run(tc.name, func(t *testing.T) {
            t.Parallel()
            svc := &Service{repo: tc.repo, now: func() time.Time { return testTime }}
            _, err := svc.Create(context.Background(), "t1", CreateInput{Name: "x"})
            if !errors.Is(err, tc.wantErr) {
                t.Fatalf("got %v, want %v", err, tc.wantErr)
            }
        })
    }
}
```

### Handler test (httptest)

```go
// internal/widget/handler_test.go
func TestHandler_Create_201(t *testing.T) {
    svc := &fakeService{
        create: func(_ context.Context, _ string, _ CreateInput) (*Widget, error) {
            return &Widget{ID: "w1", Name: "x"}, nil
        },
    }
    h := &Handler{svc: svc, log: slog.Default()}
    body := strings.NewReader(`{"name":"x"}`)
    r := httptest.NewRequest("POST", "/v1/widgets", body)
    r.Header.Set("Content-Type", "application/json")
    r = r.WithContext(httpmw.WithTenant(r.Context(), "t1"))
    w := httptest.NewRecorder()
    h.Create(w, r)
    if w.Code != http.StatusCreated {
        t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
    }
    if loc := w.Header().Get("Location"); loc != "/v1/widgets/w1" {
        t.Fatalf("location=%s", loc)
    }
}
```

### Deviations from Tech Design

> *List any places where implementation diverged from `TECH-DESIGN.md` and why.*

None.

## 4. Tests Written

| Test file | Cases | Coverage target |
|-----------|-------|----------------|
| `internal/widget/service_test.go` | N table cases | ≥ 80% |
| `internal/widget/handler_test.go` | N httptest cases | ≥ 80% |
| `internal/widget/repository_test.go` | N integration cases (testcontainers-go) | — |
| `internal/widget/fuzz_test.go` | 1 fuzz target | — |

## 5. Pre-PR Checklist

- [ ] `gofumpt -l .` clean
- [ ] `gci write -s standard -s default -s "prefix(<module>)" .` clean
- [ ] `golangci-lint run ./...` clean
- [ ] `go test -race ./...` passes
- [ ] `go test -fuzz=Fuzz<X> -fuzztime=30s` (locally if introduced)
- [ ] `go mod tidy` produces no diff
- [ ] `govulncheck ./...` clean
- [ ] sqlc regenerated (`sqlc generate`) — generated files committed if project policy
- [ ] goose migration tested locally (`goose up && goose down && goose up`)
- [ ] No PII in slog output (ReplaceAttr covers any new fields)
- [ ] `http.Server` timeouts set
- [ ] PR body references epic key `$EPIC_ID`
- [ ] Reviewer assigned

## 6. Known Limitations / Follow-ups

- …
