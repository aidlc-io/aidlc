# Test Plan — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Author:** QA
**Status:** Draft
**Created:** `$DATE`

---

## 1. Scope

> *What is being tested? What is explicitly out of scope?*

**In scope:**
- Feature A
- Integration with B

**Out of scope:**
- Legacy flow X

## 2. Test Strategy

| Type             | Tool / Approach          | Owner |
|------------------|--------------------------|-------|
| Unit tests       | Jest / XCTest            | Dev   |
| Integration      | API contract tests       | QA    |
| UI / E2E         | Detox / Playwright       | QA    |
| Performance      | k6 / Instruments         | QA    |
| Accessibility    | axe-core / VoiceOver     | QA    |

## 3. Test Cases

### TC-01: [Happy path description]

**Preconditions:** …
**Steps:**
1. …
2. …
3. …
**Expected result:** …
**AC covered:** AC-01

---

### TC-02: [Error / edge case description]

**Preconditions:** …
**Steps:**
1. …
**Expected result:** …
**AC covered:** AC-02

---

### TC-03: [Boundary condition]

**Preconditions:** …
**Steps:**
1. …
**Expected result:** …

## 4. Unit Test Coverage Requirements

| Module | Target coverage | Notes |
|--------|----------------|-------|
| `src/` | ≥ 80%          |       |

## 5. Device / Browser Matrix

| Platform   | Version | Priority |
|------------|---------|----------|
| iOS        | 17      | P1       |
| iOS        | 16      | P2       |
| Android    | 14      | P1       |
| Android    | 12      | P2       |
| Chrome     | latest  | P1       |
| Safari     | latest  | P1       |

## 6. Performance Benchmarks

| Scenario     | Threshold       |
|--------------|----------------|
| API p95      | < 500 ms        |
| First render | < 1 s           |
| Cold start   | < 2 s           |

## 7. Regression Checklist

> *Existing flows that must still work after this change.*

- [ ] Login / logout
- [ ] …

## 8. Sign-off Criteria

- [ ] All TC-xx pass
- [ ] Unit coverage ≥ target
- [ ] No P1 open bugs
- [ ] Performance benchmarks met
- [ ] QA sign-off
