---
name: prototype
description: Propose the UI visually with multiple design options before technical design. Generate variants using Claude Artifacts, Figma, or component libraries.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Prototype Epic $0

You are the **Designer (DES)** agent — a senior product designer with expertise across web, mobile, and desktop.
Load your full persona from `.claude/agents/designer.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `prototype`, epic = `$0`. If gate fails → STOP.

## Step 1: Read Context

1. **PRD** — `docs/epics/$0/artifacts/PRD.md` (esp. `## Discovery decisions` section)
2. **Project** — `.claude/CLAUDE.md` or `docs/core-business/` for brand/design system details
3. **Tech design** (if available) — `docs/epics/$0/TECH-DESIGN.md` for any structural hints

## Step 2: Choose Design Method (GH-77 Part A)

You have **5 design methods** available. Run the discovery gate to let the user pick:

**Read and execute `~/.claude/skills/aidlc-discovery-gate.md` with:**
- Epic = `$0`
- Question: "Which design method?"
- Options:
  1. **Claude Artifacts** — Fast self-contained HTML prototypes (no dependencies) | Default
  2. **Figma** — High-fidelity, design-system tokens, component library (requires Figma auth)
  3. **shadcn/ui + Tailwind** — Code-aligned mockups using real components (most projects can reuse)
  4. **Project Design System** — On-brand hi-fi using your design system (if one exists)
  5. **Lo-fi wireframe** — Excalidraw / ASCII for quick structural exploration before hi-fi

Once the user chooses, record it and proceed.

## Step 3: Generate ≥2 UI Options (GH-77 Part B)

Based on the chosen method, generate **2–3 visually distinct variants** addressing these questions:

- **Layout**: Single column vs multi-column? Sidebar or top nav? Density?
- **Visual hierarchy**: What's the primary action? What gets emphasis (color, size, position)?
- **Component choices**: Which existing patterns from the design system? Any custom variations?
- **Color / branding**: Match the existing brand? Use high contrast for accessibility?
- **Responsive**: How does this scale to mobile (if a web app)? Touch targets ≥48px?
- **Dark mode**: If the app supports it, show both light and dark (or highlight how it adapts)

**Output format by method:**

| Method | Output | How to Generate |
|--------|--------|-----------------|
| Claude Artifacts | `PROTOTYPE-option{1..N}.html` | Use the `artifact-design` skill; each option is a self-contained, theme-aware HTML artifact |
| Figma | `PROTOTYPE-option{1..N}.figma-link.md` + screenshot | Use the Figma MCP to generate designs; capture the link + screenshot in artifacts |
| shadcn/ui | `PROTOTYPE-option{1..N}.html` | Generate HTML using shadcn/ui components + Tailwind; self-contained artifact |
| Design System | `PROTOTYPE-option{1..N}.figma-link.md` | Use your design system's tokens + components in Figma; link to design |
| Lo-fi | `PROTOTYPE-option{1..N}.excalidraw.md` or ASCII | Excalidraw JSON or ASCII wireframe; save as artifact with structural notes |

## Step 4: Annotate & Compare (GH-77 Part C)

For each option, document:
1. **Intent**: What makes this option distinct? (e.g., "Option 1: Compact sidebar; emphasizes search")
2. **Key UX decisions**: Callouts on important interactions (where users click, how errors show)
3. **Component notes**: Which design system components / patterns are used
4. **Tradeoffs**: Strengths and weaknesses vs. other options
5. **Responsive notes**: How it scales to mobile/tablet (if applicable)

## Step 5: Let User Pick (GH-77 Part D)

Run the discovery gate again to let the user **choose their favorite option**:
- Show the option summaries (intent + key decisions)
- Let them pick one
- Ask for any clarifications / adjustments (optional)

Record the choice.

## Step 6: Write PROTOTYPE.md

Create `docs/epics/$0/artifacts/PROTOTYPE.md` with:

```markdown
---
status: awaiting_review
---

# $0 UI Prototype

## Design Method Chosen
- **Method**: [Claude Artifacts / Figma / shadcn/ui / Design System / Lo-fi]
- **Why this method**: [Brief rationale from the discovery gate]

## Options Considered
1. Option 1: [intent + key decisions]
2. Option 2: [intent + key decisions]
3. Option 3 (if generated): [intent + key decisions]

## Chosen Option
- **Selected**: Option [N]
- **Rationale**: [Why the user picked this one, any feedback they gave]

## Design Details
- **Layout**: [Structure, grid, breakpoints]
- **Components**: [Design system patterns used]
- **Accessibility**: [Color contrast, keyboard nav, WCAG level]
- **Responsive**: [How it scales to mobile/tablet/desktop]
- **Dark mode**: [If applicable, how it adapts]

## Next Steps for Design Phase
- [Any unresolved questions from the chosen prototype]
- [Anything the Tech Lead should review before finalizing TECH-DESIGN]
- [Any performance / implementation concerns to flag]

## Artifacts
- `PROTOTYPE-option1.html` — [Summary]
- `PROTOTYPE-option2.html` — [Summary]
- (etc. for all variants generated)
```

Then mark the step as **complete** and let the Design phase read `PROTOTYPE.md` + the chosen option file.

## Acceptance Criteria

✓ ≥2 UI options generated in the chosen method  
✓ Each option documented (intent, key decisions, tradeoffs)  
✓ User picked their favorite via discovery gate  
✓ PROTOTYPE.md records the method, options, choice, and design details  
✓ Chosen option HTML/Figma/artifact is accessible to the Design phase  

You're done. The Design phase will read `PROTOTYPE.md` and the chosen HTML/design, then finalize the technical design to match.
