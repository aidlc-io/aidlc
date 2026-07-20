---
description: Open agent-generated HTML artifacts in a local browser editor so the user can
  annotate elements/text and send feedback; receive that feedback, apply it, and iterate
  until the user finalizes. Use whenever the user wants to review or refine an HTML artifact.
---

## First-time setup

Before running annotron for the first time in a project, check if `.claude/settings.json`
already allows `Bash(curl:*)` and `Bash(annotron:*)`. If not, ask the user:

> "annotron cần tự động chạy `curl` và `annotron poll` để nhận feedback mà không cần bạn
> approve từng lần. Cho phép thêm auto-allow vào `.claude/settings.json` không?"

If yes, create/update `.claude/settings.json`:
```json
{
  "permissions": {
    "allow": ["Bash(curl:*)", "Bash(annotron:*)", "Read(/private/tmp/*)"]
  }
}
```

---

When the user wants to review or refine an HTML artifact you produced:

1. **Open it**: run `annotron <path-to-artifact.html>`.
   This starts the background server (if not running), registers the file, and opens the
   review editor in the user's browser. Print the editor URL for the user.

2. **Wait for feedback**: run `annotron poll <path>`.
   This blocks until the user sends feedback. Output is JSON with:
   - `items[]` — each has `kind` (element | text), `selector`, `text`, `note`, and an
     optional `images[]` (images attached to that specific annotation's note/reply box)
   - `message` — freeform message from the user
   - `images[]` — top-level images attached to the composer message (or a single annotation reply)
   - Every image (top-level or per-item) has `name` and `path` (an absolute file path).
     `Read` each `path` to see the image before applying the feedback.
   - `finalized: true` — signals the user is done; skip to step 5

3. **Apply the feedback**: edit the HTML file using the selector/text + note from each item.
   Each item in `items[]` now includes a server-assigned `id` field (e.g. `ann_xxx`) you can
   use to reply to a specific annotation thread.

   **Your steps are mirrored automatically.** A bundled `PostToolUse`/`PreToolUse` hook streams
   every tool call (Read/Edit/Bash/…) into the browser sidebar as CLI-like steps, and reflects
   idle/permission status — you do not need to narrate. You may still post a high-level milestone
   with `annotron progress <path> "…"` if it helps, but it is optional now.

   **Remote permission approval (optional, user-controlled).** If the user turns on *Remote approve*
   in the browser, the hook routes each tool's permission prompt to the browser; the user clicks
   Allow / Allow-always / Deny and the decision comes back to the CLI. If a tool is denied you'll get
   a deny reason — respect it, don't retry the same action. If the browser doesn't answer in time the
   prompt falls back to the terminal. This is transparent to you; no special commands needed.

   **Cancellation is enforced automatically.** annotron ships a `PreToolUse` hook: if the user
   clicks **Cancel** while you are mid-round, your next tool call (Edit/Write/Read/Bash, except
   `annotron` commands) is denied with a message telling you to stop. When you see that denial,
   do not retry other edits — reply with what you did and did not finish
   (`annotron poll <path> --reply "Stopped — cancelled. Applied X, skipped Y."`) and wait for the
   next feedback. The cancel flag resets automatically when the user sends new feedback.
   (You can also proactively `annotron check <path>` between steps; it prints `{"cancelled":true}`
   — but the hook makes this optional.)

4. **Tell the user what changed**: run `annotron poll <path> --reply "..."`.
   This posts an agent message to the general conversation log, then re-arms the poll.
   To reply directly to a specific annotation thread, pass `--annotation-id`:
   `annotron poll <path> --reply "message" --annotation-id ann_xxx`
   The browser shows that reply inline in the annotation's thread. A reply without
   `--annotation-id` posts to the general conversation log.
   Saving the file triggers an automatic live-reload in the browser.

5. **Repeat steps 2–4** until the poll returns `"finalized": true`.
   At that point the user has written the confirmed result into the file — the loop is done.

## Tips

- The `bin/` directory containing `annotron` is on your PATH while this plugin is active.
- Keep replies short and action-focused ("Updated h1 colour, fixed revenue figure, added footer.").
- Never edit the file while a poll is in flight — wait for the feedback JSON first.
- Annotations are persisted automatically in `<artifact>.annotron.json` beside the HTML file.
- Pasted/uploaded images are saved to `.annotron-uploads/` beside the artifact; feedback references them by absolute `path` — `Read` those paths to view the images.
- Post progress liberally with `annotron progress <file> "…"` — one short line per step. Keep it action-focused ("Reading X", "Updating Y").
- `annotron check <file>` is cheap; run it between edits so a mid-flight cancel is honored quickly.
- To reply to a specific annotation thread: `annotron poll <file> --reply "msg" --annotation-id <id>` — the browser shows the reply inline in that annotation's thread.
