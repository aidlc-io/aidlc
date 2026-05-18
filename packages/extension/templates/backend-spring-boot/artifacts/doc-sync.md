# Doc Reverse-Sync — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Archivist
**Status:** Draft
**Created:** `$DATE`
**Service:** `<service-name>`

---

## 1. Summary

> *What changed between what was planned and what was actually built? List divergences across API, schema, config, events, and behavior.*

## 2. PRD → Reality Delta

| Requirement | Planned | Actual | Action |
|-------------|---------|--------|--------|
| FR-01 / AC-01 | POST /orders → 201 | as planned | ⬜ No change |
| FR-01 / AC-03 | Idempotency 24h TTL | TTL cleanup deferred to follow-up epic | ⬜ Note in CHANGELOG + ADR |
| FR-02 / AC-06 | GET returns full order with lines | as planned | ⬜ No change |

## 3. Tech Design → Reality Delta

| Design decision | Planned | Actual | Action |
|-----------------|---------|--------|--------|
| Package layout | `com.example.app.order/*` | as planned | ⬜ No change |
| MVC vs WebFlux | MVC + virtual threads | as planned | ⬜ No change |
| Mapping | MapStruct | as planned | ⬜ No change |
| HikariCP size | 30 | tuned to 25 during load test | ⬜ Update `application.yml` doc |
| Flyway migration | `V42__add_orders.sql` | same | ⬜ No change |
| Kafka partition key | TBD (open question Q1) | `customerId` chosen | ⬜ Update event catalog + ADR |
| Audit log destination | TBD (open question Q2) | DB table `audit_log` | ⬜ ADR + runbook |

## 4. API Reference Updates

| Endpoint | Action | Notes |
|----------|--------|-------|
| `POST /api/v1/orders` | Added — regenerate OpenAPI | springdoc auto-generated |
| `GET /api/v1/orders/{id}` | Added | |
| `GET /api/v0/orders` | Marked deprecated | Removal target: vX.Y+1.0 |

OpenAPI spec regenerated:
```bash
./gradlew openApiGenerate
# or hit /v3/api-docs on a running app
```

Committed to `docs/api/openapi.yaml`. Swagger UI at `/swagger-ui/index.html`.

## 5. Configuration Reference Updates

| Key | Type | Default | Env var | Profile | Status |
|-----|------|---------|---------|---------|--------|
| `app.order.idempotency-ttl` | Duration | `24h` | `APP_ORDER_IDEMPOTENCY_TTL` | all | Added |
| `resilience4j.circuitbreaker.instances.paymentService.*` | — | — | — | all | Added |
| `app.legacy.flag` | bool | — | — | — | Removed (unused) |

Updated:
- `docs/configuration.md`
- `README.md` (Configuration section)
- `application.yml` inline comments

## 6. Database Schema Updates

| Migration | Description | Status |
|-----------|-------------|--------|
| `V42__add_orders.sql` | Add `orders`, `order_lines`, indexes | Applied |

Updated:
- `docs/architecture.md` (ERD diagram)
- `CHANGELOG.md` — reference migration
- Runbook — note `orders` table size growth projection

## 7. Event Catalog Updates

| Topic | Schema | Action |
|-------|--------|--------|
| `order.events.v1` | Avro (registry) | Added |

Updated:
- `docs/events/order.events.v1.md` (or topic catalog)
- Schema Registry (`order.events.v1-value`)
- Consumer onboarding guide (`docs/integration/consumers.md`)

## 8. Feature Flag Catalog Updates

| Flag | State | Ramp plan | Removal date |
|------|-------|-----------|--------------|
| `feature.orders.v1.enabled` | LIVE (100%) | completed | vX.Y+1.0 |

Updated: `docs/feature-flags.md`

## 9. Runbook Updates

| Alert / pattern | Action |
|-----------------|--------|
| `OrderPlacementErrorRateHigh` | Added to runbook with mitigation steps |
| `LazyInitializationException` (none seen, but documented) | Added to playbook |
| `HikariCP pool starvation` | Added query + mitigation |

Updated: `docs/runbooks/<svc>.md`

## 10. ADR

| ADR | Decision | Filed |
|-----|----------|-------|
| `docs/adr/NNNN-kafka-partition-key.md` | Use `customerId` as partition key for `order.events.v1` | ⬜ |
| `docs/adr/NNNM-audit-log-in-db.md` | Audit log to DB table (not Kafka) | ⬜ |

## 11. Documents Updated

| Document | Change | Status |
|----------|--------|--------|
| `docs/api/openapi.yaml` | Regenerated | ⬜ Done |
| `docs/configuration.md` | New keys listed | ⬜ Done |
| `docs/architecture.md` | ERD updated; package-by-feature diagram | ⬜ Done |
| `docs/events/order.events.v1.md` | Added | ⬜ Done |
| `docs/feature-flags.md` | New flag | ⬜ Done |
| `docs/runbooks/<svc>.md` | New alerts | ⬜ Done |
| `README.md` | Config section + quick-start updated | ⬜ Done |
| `CHANGELOG.md` | Release entry + migration ref | ⬜ Done |

## 12. Reverse-Sync Checklist

- [ ] PRD reflects what was actually built (or divergences noted)
- [ ] TECH-DESIGN.md amended where actual diverged
- [ ] OpenAPI spec regenerated and committed
- [ ] New / changed config keys documented with type / default / env var
- [ ] Flyway migrations referenced in CHANGELOG
- [ ] Kafka topics + schemas added to event catalog
- [ ] Feature flag catalog updated
- [ ] Runbook updated for new alerts / failure patterns
- [ ] ADR written for irreversible decisions
- [ ] CHANGELOG entry added
- [ ] Migration guide written if breaking
- [ ] Code examples in docs compile against current source
- [ ] No "coming soon" / scope-cut features left in docs
- [ ] Cross-references resolve

## 13. Deferred Documentation

| Item | Owner | Target date |
|------|-------|-------------|
| Idempotency cleanup job runbook | Platform | vX.Y+1.0 |

## 14. Sign-off

- [ ] Archivist sign-off
- [ ] Tech Lead acknowledgement
