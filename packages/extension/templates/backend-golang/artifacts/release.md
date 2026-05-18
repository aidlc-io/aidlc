# Release Notes — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Release Manager:** RM
**Version:** `v0.0.0`
**Status:** Draft
**Created:** `$DATE`
**Service:** *(e.g. `user-svc`)*

---

## 1. Release Overview

| Item | Value |
|------|-------|
| Version tag | `v0.0.0` |
| Branch / SHA | `main @ <sha>` |
| Release date | `$DATE` |
| Container image | `ghcr.io/org/app:v0.0.0` (linux/amd64, linux/arm64) |
| Signed by | `cosign` (keyless via GH OIDC) |
| SBOM | attached (SPDX) |
| Deploy target | k8s namespace `<env>` via Argo Rollouts |

## 2. What's New

> *User-facing API consumer summary.*

### New endpoints / methods
- `POST /v1/widgets` — create widget
- `GET /v1/widgets` — list widgets (cursor pagination)
- `GET /v1/widgets/{id}` — retrieve widget

### Improvements
- p95 latency on `/v1/users/list` reduced from 380ms → 120ms (new index)

### Bug Fixes
- Fixed goroutine leak in user-refresh path (`internal/user/refresh.go`)

### Deprecations
- `X-Legacy-Auth` header — removal in v$0+2

### Breaking
- (none) — *or list each with migration link*

## 3. Pre-Release Checklist

### Code quality
- [ ] `golangci-lint run ./...` clean
- [ ] `go test -race ./...` green on CI
- [ ] `govulncheck ./...` clean
- [ ] `go mod tidy` produces no diff

### Build
- [ ] goreleaser dry-run succeeded
- [ ] `CGO_ENABLED=0` confirmed for static binary
- [ ] `-trimpath -ldflags "-s -w"` applied
- [ ] Multi-arch (amd64 + arm64) built
- [ ] SBOM generated (syft)
- [ ] Container signed (cosign keyless)
- [ ] Container scanned (grype / trivy) — no critical CVEs

### Epic readiness
- [ ] All test cases passed (see `TEST-EXECUTION.md`)
- [ ] No P0 / P1 bugs open
- [ ] UAT signed off
- [ ] Doc-sync run (or scheduled post-release)

### Migrations
- [ ] Migration plan reviewed (expand-contract sequence)
- [ ] Goose migrations dry-run on staging
- [ ] Rollback documented (down available where reversible)

### Rollout
- [ ] Feature flags configured (default + ramp plan)
- [ ] Canary stages defined (10% → 25% → 50% → 100%)
- [ ] Analysis run defined (error rate, p95, saturation gates)
- [ ] On-call notified

### Comms
- [ ] CHANGELOG.md updated
- [ ] Internal release notes posted (Slack #releases)
- [ ] Partner consumers notified (if external API change)

## 4. Deploy Sequence

```
1. Tag:                    git tag v0.0.0 && git push --tags
2. Build & sign:           goreleaser release --clean
3. Verify signature:       cosign verify ghcr.io/org/app:v0.0.0 ...
4. Run migration job:      kubectl apply -f deploy/jobs/goose-v0.0.0.yaml
                           kubectl wait --for=condition=complete job/goose-v0.0.0
5. Argo Rollout canary:    kubectl set image rollout/app app=ghcr.io/org/app:v0.0.0
6. Watch progressive:      kubectl argo rollouts get rollout app --watch
7. Promote / abort per analysis gates (manual or automated)
```

## 5. Post-Deploy Verification

- [ ] `/healthz` and `/readyz` green across all replicas
- [ ] Error rate < SLO for 15 min post-deploy
- [ ] p50/p95/p99 latency within SLO
- [ ] `go_goroutines` stable (no growth = no leak)
- [ ] `go_gc_duration_seconds` p99 < 50ms
- [ ] `pgxpool_acquired_conns / max` < 80%
- [ ] No new slog `error` signatures
- [ ] OTEL traces show expected spans
- [ ] Feature flags in expected state

## 6. Rollback Plan

Lever order (fastest first):

1. **Feature flag flip** (OpenFeature) — seconds
   ```
   curl -X PATCH https://flags.example.com/api/feature.widgets -d '{"enabled":false}'
   ```

2. **Argo Rollout undo** — < 1 min
   ```
   kubectl argo rollouts undo app
   ```

3. **Pin previous container** — ~ 2 min via Helm/Kustomize
   ```
   kubectl set image rollout/app app=ghcr.io/org/app:v<prev>
   ```

4. **`goose down`** — ONLY if migration is reversible AND no new data depends on the new shape
   ```
   goose -dir migrations postgres "$DSN" down
   ```

## 7. Known Issues / Limitations

- …

## 8. Contributors

> *(Generated from git log: `git shortlog -s -n $(git describe --tags --abbrev=0 v$0^)..v$0`)*
