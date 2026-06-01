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

## 3. API Contract

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

## 4. Data Model

### New / Modified Tables / Collections

```sql
-- Example
CREATE TABLE example (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 5. Dependency Injection Plan

| Interface | Existing impl | New impl | Notes |
|-----------|--------------|----------|-------|
|           |              |          |       |

## 6. File Impact List

| File | Change type | Reason |
|------|-------------|--------|
| `src/...` | Add | New feature |
| `src/...` | Modify | Extend existing |
| `src/...` | Delete | Superseded by … |

## 7. Security Considerations

- Input validation: …
- Auth / authz: …
- Data at rest / in transit: …

## 8. Performance Considerations

- Expected call volume: …
- Caching strategy: …
- DB index plan: …

## 9. Migration Plan

> *Steps to deploy without downtime. Include rollback steps.*

## 10. Open Questions / Risks

| # | Question / Risk | Owner | Status |
|---|----------------|-------|--------|
| 1 |                |       | Open   |
