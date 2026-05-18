# Doc Reverse-Sync — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Archivist
**Status:** Draft
**Created:** `$DATE`
**Service:** `<service-name>` (ASP.NET Core, .NET 8/9)

---

## 1. Summary

> *What changed between what was planned (PRD + tech design) and what was actually shipped (code + OpenAPI + migrations)?*

## 2. PRD → Reality Delta

| Requirement | Planned | Actual | Action needed |
|-------------|---------|--------|--------------|
| AC-01 status code | 201 | 201 | ⬜ No change |
| AC-02 idempotency window | 24h | 24h, configurable | ⬜ Doc update (add env-var doc) |
| AC-07 upstream failure | 503 with retry guidance | 503, no body retry guidance (only header `Retry-After: 30`) | ⬜ Update integration guide |
| FR-02 ETag caching | Server-side 60s cache | Shipped, but cache key uses `tenant + cursor` only (no `limit`) | ⬜ Update behavior in docs |

## 3. Tech Design → Reality Delta

| Decision | Planned | Actual | Action needed |
|----------|---------|--------|--------------|
| Layering | Clean Architecture | Clean Architecture | ⬜ No change |
| Mediator | MediatR | MediatR | ⬜ No change |
| ID generation | GUID v7 at boundary | GUID v7 at boundary | ⬜ No change |
| Outbox pattern | Deferred (next epic) | Synchronous publish after `SaveChangesAsync` | ⬜ Note as known limitation in runbook |
| Migration | expand-contract, 2 migrations | 2 migrations applied as planned | ⬜ No change |

## 4. OpenAPI Diff

```bash
git diff $(git describe --tags --abbrev=0)..HEAD -- openapi.json
```

| Change | Type | Consumer impact |
|--------|------|----------------|
| New `POST /v1/orders` endpoint | additive | low — new feature |
| New schema `OrderResponse` | additive | low |
| `OrderItemDto.qty` (int) added | additive | low |
| `ProblemDetails` extension `errors` member | additive | low — already standard |

**Version bump**: MINOR (additive only). No breaking changes.

## 5. Documents Updated

| Document | Change | Status |
|----------|--------|--------|
| `openapi.json` | Regenerated; new endpoint + schemas | ⬜ Done |
| `docs/api-reference/` (Redocly / Stoplight) | Rebuilt from OpenAPI | ⬜ Done |
| `docs/integrations/web-spa.md` | Added Idempotency-Key usage section + curl example | ⬜ Done |
| `docs/integrations/mobile.md` | Added Idempotency-Key + ETag usage | ⬜ Done |
| `docs/integrations/partner-x.md` | Added rate-limit policy + new scope `orders:write` | ⬜ Done |
| `docs/runbooks/orders-5xx.md` | Added metric `orders_create_duration_ms` + alert thresholds | ⬜ Done |
| `docs/runbooks/idempotency-replay.md` | New runbook for unexpected replay spike | ⬜ Done |
| `docs/architecture.md` | Updated layer diagram (new `Orders` feature module) | ⬜ Done / ⬜ No change |
| `docs/adr/0014-idempotency-store-redis.md` | New ADR for Redis-backed idempotency | ⬜ Done / ⬜ Not needed |
| `CHANGELOG.md` | v0.0.0 entry added | ⬜ Done |
| `docs/migrations/vX.Y.Z.md` | (no breaking changes — not needed) | ⬜ N/A |
| `docs/deprecations.md` | (nothing sunset in this release) | ⬜ N/A |

## 6. Reverse-Sync Checklist

- [ ] OpenAPI spec at `/openapi/v1.json` at runtime matches committed `openapi.json` (CI diff clean)
- [ ] All new endpoints documented in API reference (Redocly / Stoplight / Scalar)
- [ ] Consumer integration guides updated for every consumer in epic's "Affected Areas"
- [ ] New metrics (`orders_*`) documented in monitoring guide
- [ ] New alerts have runbook entries
- [ ] ADR written if irreversible architectural decision (idempotency store choice, message bus, auth scheme)
- [ ] `CHANGELOG.md` entry added under release version
- [ ] Migration guide written for any breaking change
- [ ] Deprecation register updated; `Deprecation` + `Sunset` HTTP headers verified at runtime
- [ ] Code examples (curl, `HttpClient`, partner SDK) updated and tested
- [ ] Cross-references resolve (no broken links)
- [ ] PRD + TECH-DESIGN.md updated where reality diverged (or note divergence in §2/§3 above)

## 7. Deferred Documentation

| Item | Owner | Target date |
|------|-------|------------|
| Outbox pattern runbook (for next epic) | SRE | TBD |
| Idempotency-Key best-practices guide | Archivist | next sprint |

## 8. Sign-off

- [ ] Archivist sign-off
- [ ] Tech Lead acknowledgement
- [ ] Consumer-team confirmation (integration guide changes reviewed)
