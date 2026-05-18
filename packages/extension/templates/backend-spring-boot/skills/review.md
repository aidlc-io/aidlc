---
name: review
description: Epic-driven code review for Spring Boot 3 PRs. Validates PR / branch / file / working tree against PRD + TECH-DESIGN + TEST-PLAN. Spring Boot-specialized — checks package-by-feature, DTOs, Flyway, transactions, Resilience4j, slice tests.
argument-hint: "[PR-number | file-path | branch-name | blank for uncommitted]"
---

# Code Review — Spring Boot

You are the **Tech Lead (TL)** for a Spring Boot 3 backend team.
Load your persona from `.claude/agents/tech-lead.md` before starting.
Every review is grounded in epic docs.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. Phase = `review`, epic = detect from branch/PR. If no epic key → skip gate. If gate fails → STOP.

## Step 1: Detect Input & Get Diff

### Mode A — PR Review (`/review 42`)
Fetch via `gh pr view 42` / GitLab equivalent. Extract epic key from PR title / branch.

```bash
gh pr view 42 --json title,body,headRefName,baseRefName,files
gh pr diff 42
```

Fallback to git: `git fetch origin && git diff origin/<base>...origin/<head>`

### Mode B — Branch diff (`/review feature/{{EPIC_PREFIX}}-2100-name`)

```bash
git fetch origin
git log --oneline origin/main..origin/$ARGUMENTS --no-merges
git diff origin/main...origin/$ARGUMENTS
```

### Mode C — File review (`/review path/to/File.java`)

```bash
git log --oneline -10 -- $ARGUMENTS
git diff HEAD -- $ARGUMENTS
```

### Mode D — Local (`/review` no args)

```bash
git diff
git diff --cached
git branch --show-current
```

If no epic key found → ask user.

## Step 2: Load Epic Context

Read all:
```
docs/sdlc/epics/<KEY>/<KEY>.md
docs/sdlc/epics/<KEY>/PRD.md
docs/sdlc/epics/<KEY>/TECH-DESIGN.md
docs/sdlc/epics/<KEY>/TEST-PLAN.md
docs/sdlc/epics/<KEY>/APPROVAL.md
```

## Step 3: Validate Against PRD

For each AC: implemented? evidence? Status: ✅ / ❌ / ⚠️ Partial.

## Step 4: Validate Against Tech Design

### File impact
- Files in design but missing in diff?
- Files in diff but not in design?

### Architecture
- Package-by-feature respected? (new code in `com.example.app.<feature>/`)
- Layer responsibilities respected (controller thin, service holds logic, repo data-only)?
- No entities leaked to controller responses?
- DI wiring via constructor injection?

### API contract
- Endpoints match OpenAPI?
- Error envelope is `ProblemDetail`?
- AuthZ (`@PreAuthorize`) per design?

### Persistence
- Flyway migration follows naming + forward-only?
- Expand-contract steps respected for breaking schema changes?
- `@EntityGraph` / `JOIN FETCH` added where N+1 risk noted in design?
- `@Transactional` on service methods only, never on private?

### Resilience
- Circuit-breaker + retry + timeout on outbound calls?
- Fallback method present, identical signature?

### Observability
- Micrometer metrics added per design?
- Log fields include `traceId`/`spanId`?

### Rollout
- Feature flag in place?
- Helm chart bumped?

## Step 5: Validate Against Test Plan

| Test ID | Type | Present in diff? |
|---------|------|------------------|
| `$0-UT01` | Unit | ✅ / ❌ |
| `$0-UI01` | `@WebMvcTest` | ✅ / ❌ |
| `$0-DT01` | `@DataJpaTest` + Testcontainers | ✅ / ❌ |
| `$0-IT01` | `@SpringBootTest` | ✅ / ❌ |
| `$0-RES01` | Resilience4j | ✅ / ❌ |
| `$0-ARC01` | ArchUnit | ✅ / ❌ |

## Step 6: Spring Boot Quality Check

### Architecture
- [ ] Package-by-feature; no leakage to other features' internals
- [ ] Constructor injection only; no `@Autowired` on fields
- [ ] DTOs at controller boundary; no entity returned
- [ ] No `@Transactional` on controller / private method
- [ ] No `@Transactional` self-invocation
- [ ] `spring.jpa.open-in-view: false` respected (no lazy-load at controller)

### Persistence
- [ ] Repository custom queries via `@Query` or QueryDSL (no raw String SQL with concatenation)
- [ ] Fetch type explicit; N+1 mitigations in place
- [ ] Flyway migration: `V{n}__{snake_case}.sql`, forward-only
- [ ] Destructive migration only after expand step in previous release
- [ ] No `equals`/`hashCode` using generated ID on entities (unless business key)

### Web Layer
- [ ] `@Valid` on `@RequestBody`
- [ ] `ResponseEntity<T>` with explicit status
- [ ] `@ControllerAdvice` returns `ProblemDetail`
- [ ] `@PreAuthorize` on non-public endpoints
- [ ] springdoc annotations where the spec needs them

### Resilience
- [ ] Outbound HTTP via `RestClient` or Interface Clients — NOT `RestTemplate`
- [ ] Circuit-breaker + retry + timeout configured
- [ ] Fallback method signature matches
- [ ] No infinite default timeouts

### Concurrency
- [ ] Virtual threads enabled in `application.yml` if Boot 3.2+
- [ ] No `synchronized` on hot paths if virtual threads in use
- [ ] `@Async` with explicit `Executor` bean (not `SimpleAsyncTaskExecutor`)

### Security
- [ ] No hardcoded secrets / URLs
- [ ] CORS explicit; `allowCredentials=true` requires explicit origins
- [ ] No PII / JWT / Authorization header in logs
- [ ] Parameterised queries throughout

### Observability
- [ ] Custom Micrometer metrics where design called for them
- [ ] No `System.out.println` / `printStackTrace`; SLF4J only
- [ ] Actuator endpoints registered per profile

### Testing
- [ ] `@WebMvcTest` / `@DataJpaTest` used over full `@SpringBootTest` when possible
- [ ] Testcontainers (not H2) for DB integration
- [ ] WireMock for external HTTP stubs
- [ ] ArchUnit rule covers new package
- [ ] No `@MockBean` in slice tests without justification
- [ ] Tests use injected `Clock`, not `Instant.now()`
- [ ] No `Thread.sleep`; use Awaitility

### Code Quality
- [ ] Records for DTOs; classes for entities
- [ ] No raw `Optional` field in entity / DTO
- [ ] No force `Optional.get()` without `isPresent`
- [ ] Lombok used consistently (or not used — pick one)
- [ ] Linter / Checkstyle / SpotBugs clean

## Step 7: Doc Impact

- OpenAPI regenerated? (springdoc)
- `application.yml` config keys documented?
- New Flyway migration in CHANGELOG?
- ADR for non-obvious decisions?

## Output Format

```markdown
## Review: PR #XX — [<EPIC_KEY>] Title

**Source**: feature/<KEY>-name → main
**Files changed**: X files (+Y, -Z)
**Epic**: [<KEY>](docs/sdlc/epics/<KEY>/<KEY>.md)

### Epic Docs Loaded
- [x] Epic — scope: ...
- [x] PRD — N ACs
- [x] Tech Design — N files planned
- [x] Test Plan — N test cases

### PR Conventions
- Title `[<KEY>]`: ✅
- Branch `feature/<KEY>-...`: ✅
- Description filled: ✅

### Acceptance Criteria vs Code
| AC | Status | Evidence |
|----|--------|----------|
| <KEY>-AC01 | ✅ | `OrderController.java:42` |

### Tech Design vs Code
| Check | Status | Notes |
|-------|--------|-------|
| Package-by-feature | ✅ | |
| OpenAPI updated | ✅ / ❌ | |
| Flyway migration present | ✅ / ❌ | `V42__...` |
| `@Transactional` placement | ✅ / ⚠️ | |
| Resilience4j on outbound | ✅ / ❌ | |
| DTOs at boundary | ✅ | |

### Test Coverage vs Test Plan
| Test ID | In Diff? |
|---------|----------|
| <KEY>-UT01 | ✅ |
| <KEY>-DT01 | ✅ |
| <KEY>-IT01 | ❌ |
| <KEY>-ARC01 | ✅ |

### Findings

🔴 **BLOCKER** — `OrderService.java:88` `@Transactional` on a `private` method — Spring proxies do not apply. Move to package-private + separate bean.

🟠 **MAJOR** — `PaymentClient.java:30` outbound HTTP without circuit breaker. Add `@CircuitBreaker(name="paymentService", fallbackMethod="paymentFallback")`.

🟡 **MINOR** — `OrderEntity.java:45` `equals/hashCode` using generated `id` — breaks pre-persist comparisons. Remove or switch to business key.

🔵 **NIT** — Constant string repeated; extract.

### Doc Impact
- `docs/api/openapi.yaml` — regenerate via springdoc
- `CHANGELOG.md` — add Flyway `V42__add_orders.sql` reference

### Verdict
✅ **Approve** / ⚠️ **Approve with comments** / ❌ **Changes requested**

**Reason**: [one sentence]
```
