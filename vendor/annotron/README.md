# annotron

Local, browser-based review editor for **agent-generated HTML artifacts** — annotate elements and text, attach images, watch the agent work live, approve tool permissions, send feedback to your AI coding agent, then finalize the result into the file and download it.

## Demo

[![annotron in action](docs/annotron-demo.gif)](docs/annotron-demo.mp4)

Run `annotron architecture-demo.md` → the Markdown renders to HTML with **merslim** diagrams (flowchart, sequence, class, ER, gitGraph, gantt, C4) and technical tables. Comment on any text or element with an inline composer (comments are labeled with your GitHub identity), hover a highlight to preview its note, edit the Markdown source and **Save** to re-render, send feedback and watch the agent's activity stream in live, then browse **History**. ▶︎ [Watch the full-quality video](docs/annotron-demo.mp4)

## The problem

Agents (Claude Code, etc.) produce rich HTML plans, diagrams, reports, and mockups. Giving feedback by describing what you see in text is clumsy. `annotron` gives you a point-and-click annotation layer directly on the rendered artifact, so the agent gets precise, structured feedback (which element, what text, what to change).

## Features

### Review & annotation
- **Point-and-click annotations** — comment on any element or text selection; feedback carries the CSS selector, the text, and your note.
- **Annotation threads & history** — per-annotation conversation threads, persisted to a sidecar file, plus a history tab of past rounds.
- **Image attachments** — paste or upload images into the composer or any annotation reply/note; the agent reads them by path.

### Documents & diagrams
- **Markdown mode with diagrams** — open a `.md` and annotron renders it to HTML, turning ` ```mermaid ` blocks into inline SVG via [merslim](https://www.npmjs.com/package/merslim) (great for architecture docs / UML). An editable **Markdown pane** + **Save** button (⌘/Ctrl+S) sync your edits back to the `.md` source.
- **Outline navigation sidebar** — for Markdown files with multiple sections, an auto-generated **outline sidebar** shows h1–h4 headings with visual hierarchy. Click any heading to jump to that section; toggle with the collapse button (`‹`/`›`) or **Ctrl+L** to expand/collapse. State persists across sessions.

### Agent loop & loop engineering
- **Auto-apply feedback loop** — integrated **agent loop engineering** (`annotron agent <file>` or `--agent` flag) that continuously polls for your annotations, applies changes with Claude Code, and reports back — no manual wiring. Precise feedback in, precise edits out.
- **Live activity mirror** — a bundled hook streams the agent's tool calls (Read/Edit/Bash/…) into the sidebar like a CLI, so you can follow along in real time.
- **Turn-status bar** — always know whose turn it is: *Agent working… / Waiting for your feedback / Needs your permission*.

### Control & safety
- **Cancel anytime** — a Cancel button stops the agent at the next tool boundary (enforced by the bundled hook, no per-project setup).
- **Remote permission approval** — optionally route Claude Code permission prompts to the browser and click **Allow / Allow-always / Deny**; the decision goes back to the CLI.

## Outline navigation (Markdown files)

When reviewing a long Markdown document, an **outline sidebar** on the left shows all section headings extracted from the file. 

- **Visual hierarchy** — h1–h4 headings with progressive indentation and font sizing
- **One-click jump** — click any heading to scroll to that section in the document
- **Collapse/expand** — toggle the sidebar width with the `‹`/`›` button or press **Ctrl+L** (Cmd+L on Mac)
- **Active highlighting** — as you scroll, the current section is highlighted in the outline
- **Persistent state** — collapse preference is saved in your browser's localStorage

Great for reviewing architecture docs, tech specs, RFCs, and any long structured document.

## The agent loop: loop engineering for artifacts

**Loop engineering** is the discipline of building tight feedback cycles between humans and AI agents. annotron automates this for document and artifact review.

annotron's core strength is **the agent feedback loop**—a continuous cycle that keeps the agent and reviewer in sync:

```
agent generates artifact.html (or .md)
        │
        ▼
annotron <file> --agent           → opens review editor + starts agent loop in background
        │
        ▼
you annotate (click / select text / add notes) → Send feedback
        │
        ▼
agent receives feedback (JSON: selector, text, note, images) 
        │
        ▼
agent runs: claude -p [your feedback] → edits the file
        │
        ▼
file changes → editor live-reloads (you see updates instantly)
        │
        ▼
agent streams activity to sidebar (Read/Edit/Bash calls visible)
        │
        ▼
repeat until both agree, then:
        │
        ▼
Finalize → clean result written to file
Download → clean artifact saved to your machine
```

**This is loop engineering**: precise feedback → applied edits → live preview → repeat. The agent loop is wired directly into annotron with **zero setup**. Just `--agent` and start annotating. No webhooks, no manual polling, no context switching.

### Loop engineering concepts

**Auto-apply feedback loop** — a continuous cycle where:
- You annotate (click elements, select text, add notes)
- Annotron sends **structured feedback** (CSS selector, text content, your message, images)
- Agent receives feedback and applies changes to the source
- Browser reloads automatically to show edits
- Repeat until done

**Tight feedback cycles** — by removing prose, polling delays, and context switches, annotron keeps you in flow. Comment → applied in seconds → see the result. No "describe what you see" overhead.

**Agent-in-the-loop** — never block on async feedback. The agent works in a terminal while you review in the browser. Feedback arrives → agent processes → edits appear live.

### Without `--agent`

If you prefer manual control:

```
annotron <file>               → opens editor, no agent
[you annotate]
annotron agent <file>         → manually start the loop (in a separate terminal)
[agent applies feedback]
annotron stop                 → shut down when done
```

## VS Code extension

Prefer right‑click over the CLI? The bundled extension in [`editors/vscode/`](editors/vscode/) adds **Open in annotron** to the Explorer / editor context menu for `.md` and `.html` files. It ships annotron and runs it with VS Code's own Node (no global install), opening the review editor in your browser (or a Simple Browser tab — `annotron.openIn`).

```bash
cd editors/vscode && npm install && npm run package   # builds annotron-<version>.vsix
code --install-extension annotron-*.vsix
```

## Install

```bash
npm install -g annotron
```

Or run directly from the repo:

```bash
git clone https://github.com/hueanmy/annotron
cd annotron
node bin/annotron artifact.html
```

## Usage

```
annotron <file.html|file.md>              Open the editor in browser (.md renders to HTML with diagrams)
annotron <file.html|file.md> --agent      Open editor + start the auto-apply feedback loop (recommended for workflows)
annotron agent <file.html|file.md>        Run the agent loop separately (if server already running)
annotron poll <file.html>                 Wait for feedback (run by the agent)
annotron poll <file.html> --reply "…"    Post a reply then wait for feedback
annotron progress <file.html> "step"      Post a live progress step (optional; hooks do this automatically)
annotron check <file.html>                Print {"cancelled":true|false} for the session
annotron stop                             Shut down the background server
annotron help                             Show help
```

### Quick start: auto-apply loop

To open a file and automatically apply feedback:

```bash
annotron architecture-demo.md --agent
# Browser opens → add annotations → agent applies changes live → repeat until done
```

The `--agent` flag starts the **loop engineering**: annotron listens for your feedback annotations, passes them to Claude Code (via `claude -p`), and watches the file changes in real-time. No manual polling—just comment, and watch the agent work.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANNOTRON_PORT` | `7321` | Server port |
| `ANNOTRON_HOST` | `127.0.0.1` | Server bind host |

> **Security note:** The server is bound to loopback (`127.0.0.1`) by default. Binding beyond loopback via `ANNOTRON_HOST` exposes an **unauthenticated** server that can read and write any registered file. Only do that on a fully trusted network.

## Agent workflow (Claude Code)

```bash
# 1. Open the artifact
annotron plan.html

# 2. Wait for human feedback (agent side)
annotron poll plan.html

# 3. Feedback arrives as JSON → apply changes, reply
annotron poll plan.html --reply "I updated the color scheme and moved the nav to the top."
```

The poll output looks like:

```json
{
  "items": [
    { "kind": "element", "selector": "body > header", "text": null, "note": "Make this sticky", "images": [] },
    { "kind": "text", "selector": "body > p", "text": "lorem ipsum", "note": "Match this mockup",
      "images": [{ "name": "mockup.png", "path": "/…/.annotron-uploads/…_mockup.png" }] }
  ],
  "message": "Also please add a footer.",
  "images": []
}
```

Each `images[]` entry has a `name` and an absolute `path` — `Read` the path to view the image.

## Claude Code plugin

This repo includes a Claude Code plugin that teaches Claude Code *when and how* to drive `annotron`:

```text
/plugin marketplace add hueanmy/annotron
/plugin install annotron@meii-marketplace
```

After install, `/annotron` triggers the review loop automatically.

## How it works

- **Zero runtime dependencies** — Node built-ins only (`http`, `fs`, `crypto`, `path`, `url`).
- **Disk file stays clean** — the SDK is injected only at serve time; it's never written to your file.
- **Local-only** — server binds to `127.0.0.1`. No cloud, no accounts.
- **Live reload** — file changes are detected by content-hash polling; the browser reloads with scroll position preserved.
- **Structured feedback** — each annotation carries a kind (`element` | `text`), a CSS selector, the selected text, a freeform note, and any attached images.
- **Hook-powered mirror & control** — the plugin ships `PreToolUse`/`PostToolUse`/`Notification`/`Stop` hooks that stream activity, enforce cancellation, and (opt-in) gate tool permissions through the browser. They are no-ops (fail fast) when the server isn't running.
