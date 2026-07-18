---
name: discovery-gate
description: Human-in-the-loop discovery gate — when a phase accumulates open questions before it can produce a good artifact, turn them into a point-and-click questionnaire (DISCOVERY.md), open it in annotron, let the human answer/annotate, then resume the phase from the confirmed choices. Invoke via /discovery-gate <epic>. This is a gate any phase runs up front, NOT a separate phase.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# /discovery-gate — confirm open questions before the phase commits

The mirror image of `/annotate-artifact`. That skill reviews a *finished* artifact; this one
runs at the **start** of a phase, when the agent has **open questions** it would otherwise ask
one-at-a-time in chat or silently guess. Instead of inline questions, compose a questionnaire,
let the human answer it point-and-click in annotron, and resume the phase from confirmed
choices.

**Discovery is not a separate phase.** It is a gate the calling phase runs up front (most often
**Plan**, also **Design**). There is no `discovery` slash command in the pipeline, no
`discovery` node, and `DISCOVERY.md` is a **working doc, never a `produces:` / `depends_on`
artifact**. The durable output is a `## Discovery decisions` (Plan) / confirmed choices section
written into the calling phase's real artifact (`PRD.md`, `TECH-DESIGN.md`, …).

## When to invoke (the gate rule)

Run this gate **instead of asking inline** when either is true:
- there are **≥ 3 open questions** before you can write a good artifact, **or**
- there is **any single high-impact question** — scope, architecture, or acceptance criteria.

A small / clear epic that has no such questions **skips the gate entirely** — write the artifact
directly, no annotron round. The agent can't truly self-trigger mid-thought; this is a
documented rule the phase skill follows, not automatic behavior.

## Tools

Both ship with the AIDLC extension under `~/.claude/tools/` — no `python`, no `pip`, just
`node` (the same tools `/annotate-artifact` uses):
- Renderer: `R = node "$HOME/.claude/tools/md-to-html.mjs"`
- annotron:  `A = node "$HOME/.claude/tools/annotron/bin/annotron"`

Paths (relative to the open project): `ARTIFACTS = docs/epics/<epic>/artifacts`,
`MD = $ARTIFACTS/DISCOVERY.md`, `HTML = $ARTIFACTS/DISCOVERY.html`.

**MD-canonical rule (same as `/annotate-artifact`):** Markdown is the source; the `.html` is a
throwaway render. Annotation feedback arrives as selectors/text on the rendered HTML, but you
**always apply edits to `$MD`**, then re-render. Never edit the `.html`. Do NOT use annotron's
bundled `/annotron` command — its step 3 edits the HTML, the wrong layer here.

## Loop

1. **Compose the questionnaire.** Write `$MD` — a `# Discovery — <epic>` doc where each open
   question is its own `## Q<n>: <question>` section containing:
   - a checkbox list of concrete options (`- [ ] Option A`, `- [ ] Option B`, …);
   - an `- [ ] Other / notes:` line with a blank for freeform input;
   - a `- [x] Decide for me` **default** the agent pre-ticks — so a human who just clicks
     Finalize still resolves every question (you pick a sensible default and say so).

   Keep questions decision-shaped and mutually exclusive where possible. Group by topic
   (scope, users, data, density, edge cases, approach, boundaries). One question per behavior.

2. **Render.** `$R --all "$ARTIFACTS"` (`--all` so cross-links between sibling artifacts
   resolve `.md`→`.html`).

3. **Open.** `$A "$HTML"` — starts the background server (if needed), registers the file, opens
   the editor in the browser. Print the editor URL. Tell the user: turn on **Annotate**
   (press `A`), tick the options they want / add notes on the "Other" lines, then **Send
   feedback** — or just type a message. They can also edit checkboxes and Finalize; the
   pre-ticked "Decide for me" defaults stand for anything they leave untouched.

4. **Wait for feedback.** `$A poll "$HTML"` — blocks until the user sends. Output JSON:
   - `items[]` — each `{ kind: element|text, selector, text, note }` (which option / note they
     ticked or wrote);
   - `message` — freeform message;
   - `finalized: true` — the user clicked **Finalize** → go to step 6.
   If it returns empty / times out with nothing, run it again.

   **End signal (robust):** if `finalized` is true, OR the `message` is essentially just
   "done" / "xong" / "finalize" / "close" / "stop" (with no `items`), the user is finished →
   go to step 6. Tell the user up front they can end either way — clicking Finalize, or typing
   "done" and Send.

5. **Apply answers to `$MD` (never the `.html`, and ONLY this `.md`).** The poll feedback includes:
   - **Text annotations** — user selected text to comment on
   - **Form-control changes** — checkboxes, radios, selects, text inputs auto-captured when user interacts
   - **Freeform message** — any message the user typed
   
   For each form-control item, update the corresponding control in DISCOVERY.md:
   - **Checkbox**: tick `[x]` if value is true, clear `[ ]` if false
   - **Radio/Select**: record the selected value
   - **Text input**: record the input text
   
   For text annotations, find the matching question and record the user's note. Then re-render and re-arm:
   - `$R --all "$ARTIFACTS"` — re-render; annotron live-reloads the browser.
   - `$A poll "$HTML" --reply "<short summary of what you captured>"` — posts your reply and
     re-arms the poll. Loop back to step 4.
   **Scope:** during the loop edit ONLY `$MD`. Do not create/edit other files yet — the
   resolved choices land in the calling phase's artifact in step 6.

6. **Finalize — write `## Decisions` and hand back (do NOT re-arm).** When the end signal fires:
   - Append a `## Decisions` section to `$MD` summarizing each resolved question → chosen answer
     (one line each, including any "Decide for me" defaults that stood). This is the compact
     hand-off the calling phase reads.
   - **Do not call `poll` again** — `poll --reply` re-arms and would hang.
   - Optionally `$A stop` to shut the annotron server.
   - Return control to the calling phase with the resolved choices. The phase then writes them
     into its **real artifact** — Plan → a `## Discovery decisions` section at the top of
     `PRD.md`; Design → the confirmed approach/boundaries into `TECH-DESIGN.md` — and proceeds.

## Guardrails

- **`DISCOVERY.md` is a working doc, not a pipeline artifact.** Never add it to any step's
  `produces:` / `depends_on`. The durable record is the calling phase's artifact section.
- **Never edit `$HTML`.** Edits go in `$MD`; the render is derived.
- **Only touch `$MD` during the loop.** The resolved decisions are written into the phase
  artifact by the calling phase after this gate returns.
- **Never edit while a poll is in flight** — wait for the feedback JSON first.
- **Skippable.** If the gate rule doesn't fire (< 3 questions, none high-impact), don't compose
  a questionnaire — write the artifact directly.
- One questionnaire per gate. Re-invoke to open a fresh round.

<!-- AIDLC annotation tool — reinstalled by AIDLC; hand edits are overwritten -->
