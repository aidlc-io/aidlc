# Changelog

All notable changes to annotron are documented in this file.

## [1.0.0] - 2026-07-18

### 🎉 Major Release: Loop Engineering & AI Agent Integration

**Loop engineering** is now a first-class feature. annotron automates tight human-AI feedback cycles for document and artifact review—no webhooks, no manual polling.

### ✨ Added

#### Loop Engineering (Core)
- **Integrated agent feedback loop** — `annotron --agent` starts auto-apply workflow (no setup needed)
- **Auto-apply feedback** — structured feedback (CSS selectors, text, images) sent to Claude Code
- **Live activity mirror** — watch agent's tool calls (Read/Edit/Bash) stream into sidebar in real-time
- **Continuous cycle** — agent applies changes → browser reloads → you see updates instantly → repeat

#### VS Code Extension
- **"Open in annotron" context menu** — right-click `.md`/`.html` files in Explorer or editor
- **Bundled annotron server** — runs with VS Code's Node (no global install)
- **Auto-agent launch** — `annotron.autoAgent` setting auto-starts feedback loop
- **Configurable launch** — `annotron.openIn`: open in browser or VS Code Simple Browser tab
- **Extension settings** panel with 3 options (port, openIn, autoAgent)

#### Outline Navigation (Markdown)
- **Auto-generated outline sidebar** — h1–h4 headings with visual hierarchy
- **One-click jump** — click heading to scroll to section
- **Collapse/expand** — toggle sidebar width with button or Ctrl+L
- **Active highlighting** — current section highlighted as you scroll
- **Persistent state** — collapse preference saved in localStorage

#### Documentation & Discoverability
- **Loop engineering concepts** — 3 key principles explained
- **Enhanced README** — reorganized into 4 semantic categories
- **VS Code extension README** — detailed agent loop workflows
- **NPM keywords** — 35 keywords including loop engineering, agent loop, feedback loop, auto-apply
- **VS Code categories** — added AI, Developer Tools, Documentation

#### Agent Environment Fixes
- **Strip Electron/VS Code vars** — prevents spawned `claude` from hanging
- **Clean auth flow** — drop stale ANTHROPIC_API_KEY to use OAuth login
- **GUI launch support** — augmented PATH for Dock/GUI apps

#### Heading Extraction
- **Meta tag extraction** — SDK extracts headings from `meta[name="headings-data"]`
- **Outline support** — headings passed to browser for sidebar navigation

### 🔧 Changed

- **Agent environment** — refactored to handle VS Code extension scenarios
- **Package description** — emphasize human-in-the-loop workflow
- **CLI help** — improved documentation for `--agent` flag

### 🐛 Fixed

- **Agent hanging** — fixed spawned `claude` processes hanging from VS Code extension
- **Auth issues** — resolved stale API key conflicts
- **Heading navigation** — proper extraction of Markdown outline

### 📦 NPM Package: 0.6.0 → 1.0.0

**35 keywords added:**
- loop-engineering, agent-loop, agentic-loop, feedback-loop
- auto-apply, auto-feedback, continuous-feedback
- human-in-the-loop, in-the-loop, agent-feedback
- agent-observability, activity-stream, context-engineering
- anthropic, agentic, artifact-review, document-review, tech-design

### 🔌 VS Code Extension: 0.1.0 → 1.0.0

**6 categories:** AI, Developer Tools, Visualization, Documentation, Notebooks, Other  
**35 keywords** + auto-agent feature

---

## [0.6.0] - 2026-07-17

### Added
- Markdown mode with Mermaid diagrams
- Outline navigation for long documents
- Basic annotation system

---

## [0.1.0] - 2026-06-01

### Added
- Initial release
- Browser-based review editor
- HTML artifact support
