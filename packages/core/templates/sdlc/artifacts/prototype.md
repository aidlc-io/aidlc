# UI Prototype — [Epic Title]

**Epic ID:** `$EPIC_ID`
**Designer:** Designer Agent
**Status:** Draft → Awaiting Review
**Created:** `$DATE`

---

## Design Method Chosen

- **Method:** [Claude Artifacts / Figma / shadcn/ui / Project Design System / Lo-fi Wireframe]
- **Why this method:** [Brief rationale — speed vs. fidelity, project needs, team preferences]

## Options Generated

### Option 1: [Title / Focus]

**Intent:**
> [What makes this option distinct? E.g., "Compact layout with sidebar navigation for power users"]

**Layout:**
- Structure: [Single-column / multi-column / sidebar / top nav?]
- Grid / spacing: [e.g., 12-column grid, 8px baseline]
- Breakpoints: [Mobile / tablet / desktop breakpoint targets]

**Key Decisions:**
- Primary action: [What gets emphasis and where?]
- Information hierarchy: [What's visible first? What's secondary / hidden?]
- Component patterns: [Which design system components? Any custom variations?]
- Color / contrast: [Palette, accessibility level (AA / AAA?), dark mode?]

**Tradeoffs:**
- ✓ Strengths: [What works well in this option]
- ✗ Weaknesses: [What's uncertain or risky]

**Responsive notes:** [Mobile behavior, touch targets ≥48px?, landscape mode?]

---

### Option 2: [Title / Focus]

[Repeat structure above]

---

### Option 3 (if generated): [Title / Focus]

[Repeat structure above]

---

## Chosen Option

**Selected:** Option [N] — [Title / Focus]

**Why the user picked this one:**
> [Feedback from the discovery gate — what resonated with the team?]

**Any adjustments requested:**
- [Refinements to explore in the Design phase]
- [Questions the Tech Lead should weigh in on]

---

## Design Details (Chosen Option)

### Layout & Navigation

[Structure, grid system, key screens/flows, navigation pattern]

### Components

| Pattern | Component Used | Customization |
|---------|----------------|---------------|
| [Button] | [shadcn Button / Figma component / custom] | [None / minor / significant] |
| [Form input] | [shadcn Input / custom] | [None / minor / significant] |
| [Modal] | [shadcn Dialog / custom] | [None / minor / significant] |

### Accessibility

- **Color contrast:** WCAG [AA / AAA]
- **Keyboard navigation:** [Fully navigable / mostly / needs work]
- **Screen reader:** [Semantic HTML / ARIA labels / needs work]
- **Focus indicators:** [Clear / subtle / needs improvement]

### Responsive Behavior

| Screen | Layout | Notes |
|--------|--------|-------|
| Mobile (< 640px) | [Single-column / stacked nav] | [Touch targets, no hover-only] |
| Tablet (640–1024px) | [2-column / side nav] | [Optimized spacing] |
| Desktop (> 1024px) | [Full layout] | [Optimal reading width, pointer interactions] |

### Dark Mode

- **Status:** [Supported / not applicable / TBD]
- **Approach:** [CSS variables / Tailwind dark: modifier / manual] 
- **Key color changes:** [List any that differ from light mode]

---

## Next Steps for Design Phase

- [ ] Validate responsive behavior on actual devices (mobile / tablet / desktop)
- [ ] Confirm all text is final or use placeholder labels (Lorem ipsum OK?)
- [ ] Check that design system components are available in the project
- [ ] Any performance concerns (animations, bundle size)?
- [ ] Questions for the Tech Lead:
  - [What's the existing pattern for X in this project?]
  - [Can we use Y library or do we need Z instead?]
  - [How should error states / loading / empty states look?]

---

## Artifacts

- **`PROTOTYPE-option1.html`** (or `.figma-link.md` / `.excalidraw.md`)
  - [Brief description of what this file contains]

- **`PROTOTYPE-option2.html`**
  - [Brief description]

- **`PROTOTYPE-option3.html`** (if applicable)
  - [Brief description]

---

## Review Checklist

- [ ] ≥2 distinct UI options generated
- [ ] Each option documented (layout, components, accessibility)
- [ ] Chosen option rationale recorded
- [ ] All design decisions tied back to PRD (esp. Discovery decisions)
- [ ] Responsive behavior addressed
- [ ] Accessibility (color contrast, keyboard nav) verified
- [ ] Ready for Design phase to validate and refine against technical constraints

---

**Next phase:** /design $EPIC_ID — Design phase reads this prototype and writes TECH-DESIGN.md
