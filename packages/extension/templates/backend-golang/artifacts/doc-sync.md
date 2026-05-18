# Doc Reverse-Sync — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Archivist
**Status:** Draft
**Created:** `$DATE`
**Service:** *(e.g. `user-svc`)*

---

## 1. Summary

> *What changed between what was planned and what was actually built?*

## 2. PRD → Reality Delta

| Requirement | Planned | Actual | Action |
|-------------|---------|--------|--------|
| FR-01 (POST /v1/widgets) | 201 + Location header | | ⬜ Update doc / ⬜ No change |
| FR-02 (GET /v1/widgets) | cursor pagination, limit ≤ 100 | | ⬜ Update doc / ⬜ No change |
| Status codes | 400/401/403/409/429/5xx | | ⬜ Update doc / ⬜ No change |
| Idempotency | `Idempotency-Key` header | | ⬜ Update doc / ⬜ No change |
| Tenant isolation | enforced from JWT claims | | ⬜ Update doc / ⬜ No change |

## 3. Tech Design → Reality Delta

| Design decision | Planned | Actual | Action |
|----------------|---------|--------|--------|
| Package layout | `internal/widget/` package-by-feature | | ⬜ Update / ⬜ No change |
| Repository interface placement | in `service.go` (consumer-side) | | ⬜ Update / ⬜ No change |
| sqlc query names | verb-first | | ⬜ Update / ⬜ No change |
| goose migration | `0042_add_widgets.sql` | | ⬜ Update / ⬜ No change |
| `http.Server` timeouts | ReadHeader 5s, Read/Write 30s, Idle 120s | | ⬜ Update / ⬜ No change |
| OTEL spans | handler / service / repo | | ⬜ Update / ⬜ No change |
| slog fields | request_id, tenant_id, user_id, route, status, duration_ms, error | | ⬜ Update / ⬜ No change |
| Feature flag | `feature.widgets` default false | | ⬜ Update / ⬜ No change |

## 4. Documents to Update

| Doc | Change | Status |
|-----|--------|--------|
| `api/openapi.yaml` | Add `/v1/widgets` paths, schemas, error responses | ⬜ |
| `api/proto/widget.proto` (if gRPC) | Add `WidgetService.*` rpc methods | ⬜ |
| `docs/architecture.md` | Mention new `internal/widget` package if cross-cutting concern | ⬜ |
| `docs/operations/configuration.md` | New env var (if any): name, type, default, required, description | ⬜ |
| `docs/operations/flags.md` | New `feature.widgets` flag entry | ⬜ |
| `docs/operations/runbooks/widget.md` (new) | New runbook for `widget`-related alerts | ⬜ |
| `docs/operations/slos.md` | Add SLO row for new endpoints | ⬜ |
| `docs/adr/NNNN-*.md` (if any) | New ADR if irreversible decision discovered post-impl | ⬜ |
| godoc on exported symbols (`internal/widget/*.go`) | Comment starts with symbol name | ⬜ |
| `CHANGELOG.md` | User-facing + internal entry | ⬜ |
| `docs/migrations/vX.Y.Z.md` (if breaking) | Migration guide | ⬜ |

## 5. New API Surface (catalog this release)

| Method | Path | Auth scope | Idempotency | Deprecates |
|--------|------|-----------|-------------|------------|
| POST   | /v1/widgets | widgets:write | required (Idempotency-Key) | — |
| GET    | /v1/widgets | widgets:read  | — | — |
| GET    | /v1/widgets/{id} | widgets:read | — | — |

## 6. New Env Vars

| Name | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `WIDGET_DEFAULT_TTL` | duration | `24h` | no | TTL for cached widget lookups |

## 7. New Feature Flags

| Name | Default | Owner | Rollout plan |
|------|---------|-------|-------------|
| `feature.widgets` | `false` | widget-team | 10% → 50% → 100% over 2 weeks |

## 8. New Metrics / Traces / Logs

| Signal | Name | Notes |
|--------|------|-------|
| Metric | `widget_creates_total{tenant_id}` | Counter |
| Span   | `widget.service.create` | OTEL |
| slog field | `widget_id` | added on widget operations |

## 9. Validation

- [ ] `spectral lint api/openapi.yaml` clean (or `openapi-spec-validator`)
- [ ] `buf lint` + `buf breaking --against '.git#branch=main'` clean (if proto)
- [ ] godoc renders cleanly (`go doc ./internal/widget`)
- [ ] No broken markdown links (`lychee docs/` or similar)
- [ ] Examples in godoc still compile (`go test ./...` runs Example_*)

## 10. Reverse-Sync Checklist

- [ ] PRD reflects what was actually built
- [ ] TECH-DESIGN.md updated to match implementation
- [ ] OpenAPI / proto reflect actual contract
- [ ] godoc on all new exported symbols
- [ ] Env table and flag catalog match code reality
- [ ] Runbooks updated for new alerts / failure modes
- [ ] ADR written for any irreversible decision
- [ ] CHANGELOG entry added
- [ ] Migration guide written (if breaking)
- [ ] No "coming soon" — scope-cut features removed
- [ ] Cross-references resolve

## 11. Deferred Documentation

| Item | Owner | Target date |
|------|-------|------------|
|      |       |            |

## 12. Sign-off

- [ ] Archivist sign-off
- [ ] Tech Lead acknowledgement
