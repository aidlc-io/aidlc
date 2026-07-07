---
name: annotate-artifact
description: Run a human-in-the-loop review of an epic artifact — render its Markdown to HTML, open it in annotron for point-and-click annotation, receive the feedback, and apply it BACK TO THE .md source (never the .html), then re-render. Invoke via /annotate-artifact <epic> [FILE.md]. Use when the user wants to review/refine an artifact interactively.
---

# /annotate-artifact — MD-canonical review loop with annotron

Human-in-the-loop review of an epic artifact. The user annotates a rendered HTML copy in
annotron (point-and-click on elements / selected text); you receive that feedback as JSON,
apply it, and iterate until they finalize.

Both tools ship with the AIDLC extension and are installed under `~/.claude/tools/` — no
`python`, no `pip`, no global `annotron` needed, just `node`:
- Renderer: `node "$HOME/.claude/tools/md-to-html.mjs"`
- annotron:  `node "$HOME/.claude/tools/annotron/bin/annotron"`

**The one rule that makes this different from annotron's stock `/annotron` plugin:**
Markdown is the canonical source. The `.html` is a throwaway render. Annotation feedback
arrives as selectors/text on the **rendered HTML**, but you **always apply edits to the
`.md`**, then re-render. Never edit the `.html` — it is regenerated and any direct edit is
lost, and `produces:` in `workspace.yaml` points at `.md` so the pipeline never sees HTML.
Do NOT use annotron's bundled `/annotron` command — its step 3 edits the HTML directly,
the wrong layer here.

## Arguments

`/annotate-artifact <epic> [FILE.md]`
- `<epic>` — epic id, e.g. `EPIC-001`.
- `[FILE.md]` — artifact to review, e.g. `PRD.md`. If omitted, list the `*.md` in the epic's
  artifacts folder and ask which one (default to `PRD.md` if it exists).

Paths (relative to the open project): `ARTIFACTS = docs/epics/<epic>/artifacts`,
`MD = $ARTIFACTS/<FILE>.md`, `HTML = $ARTIFACTS/<FILE without .md>.html`.
Let `R = node "$HOME/.claude/tools/md-to-html.mjs"` and
`A = node "$HOME/.claude/tools/annotron/bin/annotron"`.

## Loop

1. **Render.** `$R --all "$ARTIFACTS"` (`--all` so cross-links between sibling artifacts
   resolve `.md`→`.html`).

2. **Open.** `$A "$HTML"` — starts the background server (if needed), registers the file,
   opens the review editor in the browser. Print the editor URL. Tell the user: turn on
   **Annotate** (press `A`), click elements / select text, add notes, then **Send feedback**
   — or just type a message. (Send does nothing until there is at least one annotation or a
   message — expected, not a bug.)

3. **Wait for feedback.** `$A poll "$HTML"` — blocks until the user sends. Output JSON:
   - `items[]` — each `{ kind: element|text, selector, text, note }`
   - `message` — freeform message
   - `finalized: true` — the user clicked **Finalize** → go to step 6.
   If it returns empty / times out with nothing, run it again.

   **End signal (robust):** if `finalized` is true, OR the `message` is essentially just
   "done" / "xong" / "finalize" / "close" / "stop" (with no `items`), the user is finished →
   go to step 6. Tell the user up front they can end the loop either way — clicking Finalize,
   or typing "done" and Send (the latter always works even if the Finalize button doesn't
   respond).

4. **Apply to the `.md` (never the `.html`, and ONLY this `.md`).** For each item, locate the
   corresponding place in the **Markdown source** — match on the item's `text` (the
   selected/element text) and `note`, not the CSS selector — and edit `MD`. The selector only
   hints *where* in the doc; the change lands in the `.md`.
   **Scope:** edit ONLY `$MD` (the artifact under review). Do **not** create or edit any other
   file — no new `RELEASE.md`, no sibling artifacts, no source files. If a note implies broader
   work, don't do it here; mention it in your reply and let the user drive it in the pipeline.

5. **Log the revision, re-render, reply.**
   - `$R --log "$ARTIFACTS" "<FILE>.md" "<the user's note(s)>" "<what you changed>"` — appends
     a revision-history entry (`.annotation-history.json`). This is what surfaces in the
     pipeline History panel and in the re-rendered HTML's "Revision history" section. Do this
     once per applied round, before re-rendering.
   - `$R --all "$ARTIFACTS"` — re-render (now including the new history entry); annotron
     live-reloads the browser.
   - `$A poll "$HTML" --reply "<short, action-focused summary>"` — posts your reply to the
     browser conversation log and re-arms the poll. Then loop back to step 3.
   - Keep the summary short: "Tightened the goals section, fixed the metric, added a risks table."

6. **Finalize (exit — do NOT re-arm).** When the end signal fires (`finalized: true`, or a
   "done"/"xong" message), the review is over. **Do not call `poll` again** — `poll --reply`
   re-arms and would hang. Instead:
   - Confirm to the user (in your normal reply) that the `.md` reflects every applied change
     (it does — each round edited the `.md`).
   - Optionally `$A stop` to shut the annotron server.
   - Stop. The `.html` is a throwaway render (Finalize may also write it; the next render
     overwrites it — harmless).

## Guardrails

- **Never edit `$HTML`.** Edits go in `$MD`; the render is derived.
- **Only touch `$MD`.** Never create or edit other files during the loop (no `RELEASE.md`,
  no other artifacts, no code). This keeps edits inside the pre-authorized artifacts scope so
  the loop doesn't stop to ask permission mid-review.
- **Never edit while a poll is in flight** — wait for the feedback JSON first.
- Do not add this loop to any pipeline `produces:` — MD stays the official artifact.
- One artifact per session. To review another file, re-invoke with that filename.

## Permissions (optional)

By default Claude Code will ask before each file write. If you'd rather the loop run without
stopping to confirm every round, add these to `.claude/settings.json` yourself (project or
user-global) — the extension does NOT change your settings automatically:
- `Bash(node:*)` and `Bash(curl:*)` — the renderer / annotron / poll commands.
- `Edit(docs/epics/**)` and `Write(docs/epics/**)` — applying feedback to the `.md`.

Because the loop only ever edits the artifact under review (see Guardrails), scoping writes to
`docs/epics/**` is safe: the human's real approval is the annotron review itself. Leaving the
prompts on is perfectly fine too — you just confirm each edit.
