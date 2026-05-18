---
name: review
description: Epic-driven code review for Go backend changes. Validates PR / branch / file / working tree against epic docs (PRD, Tech Design, Test Plan) and applies Go-specific quality bar.
argument-hint: "[PR-number | file-path | branch-name | blank for uncommitted]"
---

# Code Review — Backend Go

You are the **Tech Lead (TL)** agent — a staff-level engineer reviewing Go code.
Load your full persona from `.claude/agents/tech-lead.md` before starting.
**Every review is grounded in epic docs.** No review without an epic key.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `review`, epic = detect from branch/PR. If no epic key → skip gate. If gate fails → STOP.

## Step 1: Detect Input & Get Diff

### Mode A — PR Review (`/review 42`)
Fetch PR via `gh pr view` / GitLab API / Bitbucket. Extract epic key from PR title or branch.

Fallback to git:
```bash
git fetch origin
git diff origin/<default-branch>...origin/<source-branch>
```

### Mode B — Branch diff (`/review feature/{{EPIC_PREFIX}}-XXXX-name`)
```bash
git fetch origin
git log --oneline origin/<default>..origin/$ARGUMENTS --no-merges
git diff origin/<default>...origin/$ARGUMENTS
```

### Mode C — File review (`/review path/to/file.go`)
```bash
git log --oneline -10 -- $ARGUMENTS
git diff HEAD -- $ARGUMENTS
```

### Mode D — Local changes (`/review`)
```bash
git diff
git diff --cached
git branch --show-current
```

If no epic key → ask user. Do NOT proceed without one.

---

## Step 2: Load Epic Context

```
docs/sdlc/epics/{{EPIC_PREFIX}}-XXXX/
├── {{EPIC_PREFIX}}-XXXX.md
├── PRD.md
├── TECH-DESIGN.md
├── TEST-PLAN.md
├── APPROVAL.md
```

Also read affected domain docs from epic "Affected Areas".

---

## Step 3: Validate Against PRD

| AC | Criteria | Implemented? | Evidence |
|----|----------|--------------|----------|
| {{EPIC_PREFIX}}-XXXX-AC01 | POST /v1/widgets returns 201 on create | ✅ | `internal/widget/handler.go:42` |

Flag:
- AC not implemented → 🔴 **BLOCKER**
- Different status code than PRD says → 🟡 divergence (doc-sync)
- Idempotency not honored → 🟠 **MAJOR**

---

## Step 4: Validate Against Tech Design

**File impact**:
- Files in tech design but missing in diff → missing implementation?
- Files in diff but not in tech design → scope creep?

**Architecture**:
- [ ] Repository interface in **service** package (consumer-side)?
- [ ] sqlc queries added with verb-first names?
- [ ] goose migration versioned + reviewable?
- [ ] `cmd/<binary>/main.go` updated to wire new handler/service?
- [ ] `http.Server` timeouts present (if new server / new mount)?

**Concurrency**:
- [ ] `context.Context` first param of every I/O function?
- [ ] No `context.Background()` / `context.TODO()` in request paths?
- [ ] Every `go func()` has exit signal (`<-ctx.Done()`, errgroup, explicit stop)?

**Errors**:
- [ ] All `return err` wrapped with `fmt.Errorf("...: %w", err)`?
- [ ] Sentinel/typed errors checked via `errors.Is` / `errors.As`?
- [ ] No `err.Error() == "..."` string comparisons?

**Resources**:
- [ ] `defer rows.Close()` placed AFTER error check?
- [ ] `rows.Err()` checked after iteration?
- [ ] `*http.Response.Body.Close()` deferred?

**Observability**:
- [ ] slog fields per design (request_id, tenant_id, route, status, duration_ms, error)?
- [ ] OTEL spans where design called for them?
- [ ] No PII in slog output (ReplaceAttr covers new fields)?

**Rollout**:
- [ ] Feature flag wired if design called for it?
- [ ] Migration is expand-only (no destructive change on rollout)?

---

## Step 5: Validate Against Test Plan

- [ ] Table-driven where ≥ 2 cases?
- [ ] Handler tests use `httptest`?
- [ ] Integration tests use `testcontainers-go`?
- [ ] `t.Parallel()` on independent tests?
- [ ] `-race` runs in CI?
- [ ] `goleak.VerifyTestMain` for packages with goroutines?
- [ ] AuthZ matrix covered (missing JWT, wrong scope, wrong tenant)?
- [ ] Idempotency replay test for non-idempotent endpoints?

Flag:
- Test plan says test X should exist, not in diff → 🟠 **MAJOR**
- New logic without any test → 🟡 **MINOR** (or MAJOR if critical path)

---

## Step 6: Go-Specific Code Quality

### Architecture & Design
- [ ] Package boundaries respected (no import cycles, no inverted dependency)
- [ ] Interfaces at consumer, not provider
- [ ] No `init()` doing non-trivial work
- [ ] No package-level mutable state (except true singletons)
- [ ] `pkg/` not used for internal-only code

### Correctness & Types
- [ ] No `any` / `interface{}` at boundaries when concrete type known
- [ ] JSON decoded into typed structs (no `map[string]any` at boundary)
- [ ] Exhaustive switches on enum-like types (with `default` returning typed error)
- [ ] No unchecked type assertions; use comma-ok or `errors.As`

### Concurrency
- [ ] No goroutine leak (every `go func` has exit)
- [ ] `errgroup` uses returned ctx, not parent ctx
- [ ] Shared state protected: `sync.Mutex` / `sync.RWMutex` / `atomic.*` / channels
- [ ] No `time.After` in `for { select { } }` loops (use `time.NewTimer` + Stop)
- [ ] Loop variable capture safe (Go 1.22+ ok, otherwise explicit `i := i`)
- [ ] No data race surface (`go test -race` clean)

### Error Handling
- [ ] No swallowed errors (`_ = something` without comment justifying)
- [ ] Wrapping with `%w`; sentinels via `errors.Is`; typed via `errors.As`
- [ ] No `panic` on user input
- [ ] Recover middleware (chi `middleware.Recoverer`) present for handlers

### Security
- [ ] No hardcoded secrets / URLs / DSNs
- [ ] Input validated at HTTP boundary (validator tags + custom funcs)
- [ ] SQL via sqlc / `$1` placeholders — no string concat
- [ ] JWT verified with explicit algorithm allowlist (NEVER `none`)
- [ ] `os/exec.Cmd.Env` set explicitly (no inherited env in child processes)
- [ ] HTTP responses don't leak internal errors verbatim
- [ ] PII in slog redacted via `ReplaceAttr`

### Performance
- [ ] No N+1 — batch via `IN ($1)` or `ANY($1::uuid[])` in sqlc
- [ ] Caches bounded (LRU size or TTL)
- [ ] Heavy work not on hot path
- [ ] `pgxpool` shared, sized appropriately
- [ ] `[]byte` reused via `sync.Pool` where allocs hot

### Observability
- [ ] Structured slog logs (no `fmt.Println`, no `log.Printf`)
- [ ] No debug logging in prod code paths
- [ ] OTEL spans wrap external calls

### Style / Lint
- [ ] `gofumpt -l .` clean
- [ ] `gci write -s standard -s default -s "prefix(<module>)" .` clean (import groups)
- [ ] `golangci-lint run ./...` clean (govet, staticcheck, errcheck, gosec, gocritic, revive, gofumpt, gci)
- [ ] `go mod tidy` produces no diff
- [ ] `govulncheck ./...` clean
- [ ] File / function size within project limits
- [ ] No dead code; no commented-out blocks

---

## Step 7: Check Doc Impact

- OpenAPI updated if HTTP shape changed?
- proto updated if gRPC shape changed (no field renumber/remove)?
- godoc on new exported symbols?
- New env var documented in `docs/operations/configuration.md`?
- New flag documented in flag catalog?
- Runbook updated if new alert / new failure mode?
- ADR for any irreversible decision?

Flag any divergence for `/doc-sync`.

---

## Output Format

```markdown
## Review: PR #XX — [{{EPIC_PREFIX}}-XXXX] Title

**Source**: feature/{{EPIC_PREFIX}}-XXXX-name → main
**Files changed**: X files (+Y, -Z)
**Epic**: [{{EPIC_PREFIX}}-XXXX](docs/sdlc/epics/{{EPIC_PREFIX}}-XXXX/)

### Epic Docs Loaded
- [x] Epic doc
- [x] PRD — N acceptance criteria
- [x] Tech Design — N files planned
- [x] Test Plan — N test cases
- [ ] Approval

### PR Conventions
- Title `[{{EPIC_PREFIX}}-XXXX]`: ✅ / ❌
- Branch naming: ✅ / ❌
- Description filled: ✅ / ❌

### Acceptance Criteria vs Code
| AC | Status | Evidence |
|----|--------|----------|
| ...-AC01 | ✅ | `internal/widget/handler.go:42` |
| ...-AC02 | ❌ | Not in diff |
| ...-AC03 | ⚠️ Partial | `internal/widget/service.go:88` — error case missing |

### Tech Design vs Code
| Check | Status | Notes |
|-------|--------|-------|
| File impact matches | ✅ | |
| Repository interface in service package | ✅ | |
| sqlc query + goose migration | ✅ | |
| `http.Server` timeouts | ⚠️ | ReadHeaderTimeout missing |
| Wiring in `cmd/api/main.go` | ✅ | |

### Test Coverage vs Test Plan
| Test ID | In Diff? | Notes |
|---------|----------|-------|
| ...-UT01 | ✅ | |
| ...-IT01 | ❌ | testcontainers-go integration missing |

### Go Quality Findings

🔴 **BLOCKER** — `internal/widget/service.go:55` — `go func()` with no exit condition; will leak when service shuts down
   Fix: use `errgroup.WithContext` and `g.Go(func() error { ... })`

🟠 **MAJOR** — `internal/widget/repository.go:88` — `defer rows.Close()` before error check; will nil-deref on query error
   Fix: check err first, then `defer rows.Close()`

🟠 **MAJOR** — `internal/widget/handler.go:120` — error returned as `errors.New("...")` instead of wrapping
   Fix: `fmt.Errorf("create widget: %w", err)`

🟡 **MINOR** — `internal/widget/service.go:42` — `context.Background()` used; should be `r.Context()`

🔵 **NIT** — `internal/widget/handler.go:200` — JSON encoding uses `json.NewEncoder` without setting Content-Type

### Doc Impact (run `/doc-sync` after merge)
- `api/openapi.yaml` — new POST /v1/widgets endpoint
- `docs/operations/configuration.md` — new env var `WIDGET_DEFAULT_TTL`

### Verdict
❌ **Changes requested**

**Reason**: 1 BLOCKER (goroutine leak), 2 MAJOR (defer ordering, error wrapping). Address before re-review.
```
