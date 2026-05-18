# Code Review Approval — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Reviewer:** Auto-Reviewer
**Status:** Pending
**Created:** `$DATE`

---

## 1. Review Summary

> *One-paragraph verdict.*

**Verdict:** ⬜ Pass &nbsp;&nbsp; ⬜ Reject

## 2. Acceptance Criteria Validation

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC-01 | … | ⬜ Pass / ⬜ Fail | `internal/widget/handler.go:42` |
| AC-02 | … | ⬜ Pass / ⬜ Fail | `internal/widget/service.go:88` |

## 3. Architecture Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Package layout (`internal/<feature>/`) | ⬜ | |
| Repository interface at consumer (service package) | ⬜ | |
| sqlc queries verb-first; regenerated | ⬜ | |
| goose migration versioned + reversible | ⬜ | |
| `cmd/api/main.go` wiring updated | ⬜ | |
| `http.Server` timeouts set | ⬜ | |
| OTEL spans + slog fields per design | ⬜ | |
| Feature flag wired (if planned) | ⬜ | |

## 4. Go Correctness

| Check | Status | Notes |
|-------|--------|-------|
| `context.Context` first param of all I/O funcs | ⬜ | |
| No `context.Background()` / `TODO()` in request paths | ⬜ | |
| No goroutine without exit signal | ⬜ | |
| All `return err` wrapped with `%w` | ⬜ | |
| `errors.Is` / `errors.As` used (no string-compare on errs) | ⬜ | |
| `defer rows.Close()` after err check; `rows.Err()` checked | ⬜ | |
| No `interface{}` / `any` at boundaries when concrete known | ⬜ | |
| `errgroup` uses returned ctx | ⬜ | |
| `time.NewTimer` + Stop instead of `time.After` in loops | ⬜ | |

## 5. Security

| Check | Status | Notes |
|-------|--------|-------|
| No hardcoded secrets / URLs / DSNs | ⬜ | |
| Inputs validated at HTTP boundary | ⬜ | |
| SQL via sqlc / `$1` (no string concat) | ⬜ | |
| JWT verified with algorithm allowlist (NEVER `none`) | ⬜ | |
| Tenant isolation enforced server-side (from JWT claims) | ⬜ | |
| PII redacted in slog (`ReplaceAttr`) | ⬜ | |
| `os/exec.Cmd.Env` set explicitly | ⬜ | |
| `govulncheck ./...` clean | ⬜ | |

## 6. Tests

| Check | Status | Notes |
|-------|--------|-------|
| Table-driven for ≥ 2 cases | ⬜ | |
| Handler tests use `httptest` | ⬜ | |
| Integration tests use `testcontainers-go` | ⬜ | |
| `t.Parallel()` on independent tests | ⬜ | |
| `go test -race ./...` clean | ⬜ | |
| `goleak.VerifyTestMain` for packages with goroutines | ⬜ | |
| AuthZ matrix covered (missing/expired/wrong-scope/wrong-tenant) | ⬜ | |
| Idempotency replay tested for non-idempotent endpoints | ⬜ | |
| Test IDs match test plan | ⬜ | |

## 7. Style / Lint

| Check | Status | Notes |
|-------|--------|-------|
| `gofumpt` clean | ⬜ | |
| `gci` import groups clean | ⬜ | |
| `golangci-lint run ./...` clean | ⬜ | |
| `go mod tidy` produces no diff | ⬜ | |
| No `fmt.Println` / `log.Printf` (use `slog`) | ⬜ | |
| No dead code / commented-out blocks | ⬜ | |

## 8. Issues Found

### Critical (must fix before approval)

| # | File | Issue | Required action |
|---|------|-------|----------------|
|   |      |       |                |

### Non-critical (can follow-up)

| # | File | Issue | Suggested action |
|---|------|-------|-----------------|
|   |      |       |                 |

## 9. Final Decision

- [ ] **APPROVED** — All ACs pass, no critical issues
- [ ] **REJECTED** — See issues above; resubmit after fixes

**Reviewer notes:**

> *(free text)*
