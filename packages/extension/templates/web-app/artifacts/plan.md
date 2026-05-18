# PRD — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** Product Owner
**Status:** Draft
**Created:** `$DATE`

---

## 1. Problem Statement

> *Describe the user or business problem this epic solves. Which user? Which moment in the funnel?*

## 2. Goals

- [ ] Goal 1 — measurable (e.g., +5% activation in 14 days)
- [ ] Goal 2
- [ ] Goal 3

## 3. Non-Goals

- Out of scope: …
- Will not address: …

## 4. Target User

| Segment / Role | Entitlement | Locale | Device profile |
|----------------|-------------|--------|----------------|
| e.g. signed-in user, free tier | free | en-US, en-GB | desktop + mobile |

## 5. User Stories

| ID | As a… | I want to… | So that… | Priority (MoSCoW) |
|----|-------|------------|----------|-------------------|
| US-01 | user | | | Must |

## 6. Functional Requirements

### FR-01: [Feature name]

**Description:** …

**Acceptance Criteria (Given/When/Then):**
- [ ] `$EPIC_ID-AC01` — **Given** [auth state, route, viewport, locale] **When** [action] **Then** [expected]
- [ ] `$EPIC_ID-AC02` — error state
- [ ] `$EPIC_ID-AC03` — empty / loading state
- [ ] `$EPIC_ID-AC04` — boundary (max length / RTL / very large list)

### FR-02: [Feature name]

**Description:** …
**Acceptance Criteria:**
- [ ] `$EPIC_ID-AC05`: …

## 7. Non-Functional Requirements

### Core Web Vitals (per route)
| Route | LCP p75 | INP p75 | CLS p75 | Bundle budget |
|-------|---------|---------|---------|---------------|
| `/` | ≤ 2.5 s | ≤ 200 ms | ≤ 0.1 | ≤ XX KB gzip |
| `/dashboard` | ≤ 2.5 s | ≤ 200 ms | ≤ 0.1 | ≤ XX KB gzip |

### Accessibility
- **WCAG 2.2 AA**
- Keyboard navigable; visible focus ring
- Screen reader: state changes announced
- Reduced motion respected
- Color contrast verified

### Security & Privacy
- No PII in URLs / logs / analytics
- CSP-safe (no inline scripts without nonce)
- Cookies: HTTP-only, SameSite=Lax, Secure in prod
- Zod validation at every trust boundary

### Browser Support
- Chrome / Edge / Firefox / Safari last 2 versions
- iOS Safari ≥ 16

### SEO (public surfaces only)
- Title / meta description / canonical URL
- OG / Twitter card
- JSON-LD structured data (Article / Product / FAQ)
- hreflang if multi-locale

### i18n
| Locale | Required | Notes |
|--------|----------|-------|
| en | required | default |
| (others) | | RTL: ar / he |

### Observability
- Analytics events:

| Event | Properties | Consent category |
|-------|-----------|-------------------|
| `project_created` | `tenant_id`, `route`, `viewport`, `flag_value` | functional |

- Sentry: errors captured; Web Vitals → analytics; server logs structured

## 8. Design & References

- Figma: *(link, with node-id)*
- Jira / GitHub issue: *(ticket)*
- Related epics: *(links)*
- Related ADRs: *(links)*

## 9. Metrics / Success Criteria

| Metric | Baseline | Target | Source |
|--------|----------|--------|--------|
| Activation (TTV) | — | — | PostHog / Mixpanel |
| Conversion rate | — | — | analytics |
| Error rate | — | < 1% | Sentry |
| LCP p75 | — | ≤ 2.5 s | Web Vitals RUM |

## 10. Rollout

- **Feature flag:** `<flag_name>`
- **Targeting:** per-user / per-org / % rollout
- **Stages:** 1% → 10% → 50% → 100%
- **Halt signals:** crash-free < threshold, LCP p75 regression > 10%, support volume > 2× baseline
- **Kill switch:** flag off via admin UI

## 11. Open Questions

- [ ] Q1: …
- [ ] Q2: …

## 12. Revision History

| Date | Author | Change |
|------|--------|--------|
|      |        | Initial draft |
