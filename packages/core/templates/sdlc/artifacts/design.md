# Technical Design — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Tech Lead
**Status:** Draft
**Created:** `$DATE`

---

## 1. Overview

> *One-paragraph summary of the approach.*

## 2. Architecture

```
[Component A] ──► [Component B] ──► [Component C]
                       │
                       ▼
                 [Data Store]
```

### 2.1 System Context

> *Where does this feature fit in the existing architecture?*

### 2.2 New Components

| Component | Responsibility | Layer |
|-----------|---------------|-------|
|           |               |       |

## 3. Affected Areas / Blast Radius

> *Subsystems, modules, services, and integration points this change touches —
> higher-level than the file list in §7. Include downstream consumers that
> aren't modified but could regress, so review and regression testing can be
> scoped. If the project has an ast-graph, cross-check with `blast-radius`.*

| Area / Module | Kind (module / service / API / data / job / integration) | Impact (new / modified / deprecated) | Downstream consumers | Regression risk (low / med / high) |
|---------------|-----------------------------------------------------------|--------------------------------------|----------------------|------------------------------------|
|               |                                                           |                                      |                      |                                    |

## 4. API Contract

### Endpoint: `POST /api/v1/example`

**Request:**
```json
{
  "field": "value"
}
```

**Response (200):**
```json
{
  "id": "string",
  "result": "value"
}
```

**Error codes:** 400 Bad Request, 401 Unauthorized, 500 Internal Server Error

## 5. Data Model

### New / Modified Tables / Collections

```sql
-- Example
CREATE TABLE example (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 6. Dependency Injection Plan

| Interface | Existing impl | New impl | Notes |
|-----------|--------------|----------|-------|
|           |              |          |       |

## 7. File Impact List

| File | Change type | Reason |
|------|-------------|--------|
| `src/...` | Add | New feature |
| `src/...` | Modify | Extend existing |
| `src/...` | Delete | Superseded by … |

## 8. Security Considerations

- Input validation: …
- Auth / authz: …
- Data at rest / in transit: …

## 9. Performance Considerations

- Expected call volume: …
- Caching strategy: …
- DB index plan: …

## 10. Migration Plan

> *Steps to deploy without downtime. Include rollback steps.*

## 11. Open Questions / Risks

| # | Question / Risk | Owner | Status |
|---|----------------|-------|--------|
| 1 |                |       | Open   |
