#!/usr/bin/env node
/**
 * Render Markdown artifact(s) to standalone, self-contained HTML for annotation.
 *
 * Markdown stays the canonical source (cheaper for agents/pipeline to read, and the
 * `produces:` paths in workspace.yaml all point at .md). This script produces a
 * throwaway .html render next to the .md whenever you want to open an artifact in an
 * annotation tool (e.g. annotron) and comment on it. The HTML is a *render*, not a
 * source: to change it, edit the .md and re-run.
 *
 * Zero external/runtime dependencies: `marked` is vendored next to this file, so the
 * script runs with just `node` — no `npm install`, no Python, no `pip`. That makes it
 * safe to bundle in the VS Code extension and to copy into ~/.claude/tools for the
 * /annotate-artifact skill.
 *
 * Usage:
 *   node md-to-html.mjs path/to/PRD.md              # -> PRD.html next to it
 *   node md-to-html.mjs PRD.md /tmp/PRD.html         # explicit output
 *   node md-to-html.mjs --all path/to/artifacts     # whole folder, cross-links rewritten
 *
 * --all mode rewrites cross-links between sibling artifacts (PRD.md -> PRD.html) so the
 * rendered set stays navigable, while leaving links that point outside the folder
 * (../foo.md, sub/bar.md) or to external URLs untouched — those still point at .md.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { marked, Renderer } from './vendor/marked.esm.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CSS = `
:root {
  color-scheme: light dark;
  --bg: #faf9f6;
  --surface: #f2f0e9;
  --surface-2: #f6f4ee;
  --text: #1f1d1a;
  --muted: #6f6b62;
  --border: #e6e2d6;
  --border-strong: #d9d4c6;
  --accent: #c15f3c;
  --accent-soft: rgba(193, 95, 60, .12);
  --code-text: #1f1d1a;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1e1c19;
    --surface: #29261f;
    --surface-2: #26231d;
    --text: #ecebe3;
    --muted: #a6a196;
    --border: #3a362d;
    --border-strong: #474237;
    --accent: #e0996f;
    --accent-soft: rgba(224, 153, 111, .16);
    --code-text: #ecebe3;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  font-family: ui-serif, "Charter", "Iowan Old Style", "Palatino", Georgia, Cambria, "Times New Roman", serif;
  font-size: 1.06rem;
  line-height: 1.72;
  color: var(--text);
  background: var(--bg);
  max-width: 46rem;
  margin: 0 auto;
  padding: 4.5rem 1.75rem 8rem;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
::selection { background: var(--accent-soft); }

h1, h2, h3, h4, h5, h6 {
  font-weight: 640;
  line-height: 1.25;
  letter-spacing: -0.011em;
  color: var(--text);
}
h1 { font-size: 2.1rem; margin: 0 0 .1em; letter-spacing: -0.02em; }
h2 { font-size: 1.5rem; margin: 2.4em 0 .6em; padding-bottom: .28em; border-bottom: 1px solid var(--border); }
h3 { font-size: 1.2rem; margin: 2em 0 .5em; }
h4 { font-size: 1.03rem; margin: 1.7em 0 .4em; }
h5, h6 { font-size: .92rem; margin: 1.5em 0 .4em; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }

p { margin: 0 0 1.1em; }
a { color: var(--accent); text-decoration: none; border-bottom: 1px solid transparent; transition: border-color .12s ease; }
a:hover { border-bottom-color: var(--accent); }

ul, ol { margin: 0 0 1.1em; padding-left: 1.5em; }
li { margin: .3em 0; }
li > ul, li > ol { margin: .3em 0; }
li::marker { color: var(--muted); }

strong { font-weight: 680; }
em { font-style: italic; }

code {
  font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: .86em;
  background: var(--accent-soft);
  color: var(--code-text);
  padding: .12em .38em;
  border-radius: 5px;
}
pre {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem 1.15rem;
  overflow-x: auto;
  line-height: 1.55;
  margin: 1.3em 0;
}
pre code {
  background: none;
  color: var(--text);
  padding: 0;
  font-size: .84rem;
  border-radius: 0;
}

blockquote {
  border-left: 3px solid var(--accent);
  margin: 1.3em 0;
  padding: .1em 1.1em;
  color: var(--muted);
  background: var(--surface-2);
  border-radius: 0 8px 8px 0;
  font-style: italic;
}
blockquote p { margin: .5em 0; }

.table-wrap { overflow-x: auto; margin: 1.4em 0; }
table {
  border-collapse: collapse;
  width: 100%;
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: .9rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}
th, td { border-bottom: 1px solid var(--border); padding: .6em .85em; text-align: left; vertical-align: top; }
th { background: var(--surface); font-weight: 640; letter-spacing: -0.005em; }
tr:last-child td { border-bottom: none; }
tbody tr:nth-child(even) td { background: var(--surface-2); }

hr { border: none; border-top: 1px solid var(--border-strong); margin: 2.6em 0; }
img { max-width: 100%; height: auto; border-radius: 8px; }

.doc-meta {
  display: inline-flex;
  align-items: center;
  gap: .5em;
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: .78rem;
  color: var(--muted);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: .35em .85em;
  margin-bottom: 2.4em;
}
.doc-meta::before {
  content: "";
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--accent);
  flex: none;
}

.rev-history {
  margin-top: 3.5em;
  border-top: 1px solid var(--border-strong);
  padding-top: 1.4em;
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: .85rem;
}
.rev-history > summary {
  cursor: pointer;
  color: var(--muted);
  font-weight: 600;
  letter-spacing: .01em;
  list-style: none;
}
.rev-history > summary::-webkit-details-marker { display: none; }
.rev-history > summary::before { content: "▸ "; color: var(--accent); }
.rev-history[open] > summary::before { content: "▾ "; }
.rev-history ol { margin: 1em 0 0; padding: 0; list-style: none; }
.rev-history li {
  margin: 0 0 1em; padding-left: 1em;
  border-left: 2px solid var(--border);
}
.rev-history .rev-head {
  display: flex; gap: .6em; align-items: baseline; flex-wrap: wrap;
  color: var(--muted); font-size: .78rem;
}
.rev-history .rev-n { color: var(--accent); font-weight: 700; }
a.rev-n { border-bottom: 1px dotted var(--accent); }
a.rev-n:hover { border-bottom-style: solid; }
.rev-history .rev-author { color: var(--text); font-weight: 600; }
.doc-historical { border-style: dashed; }
.doc-historical::before { background: #d98b3c; }
.rev-history .rev-note { color: var(--text); font-weight: 600; margin: .2em 0 .1em; }
.rev-history .rev-summary { color: var(--muted); }

@media (max-width: 640px) {
  body { padding: 2.5rem 1.15rem 5rem; font-size: 1.02rem; }
  h1 { font-size: 1.7rem; }
  h2 { font-size: 1.3rem; }
}
@media print {
  body { max-width: none; color: #000; background: #fff; padding: 0; }
  .doc-meta { display: none; }
  pre, blockquote, table { break-inside: avoid; }
  a { color: inherit; border-bottom: none; }
}
`;

const LINK_RE = /\b(href|src)="([^"]*)"/g;

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function firstH1(text, fallback) {
  const m = text.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}

// ── Annotation revision history ──────────────────────────────────────────────
// One JSON file per artifacts folder, keyed by artifact .md filename:
//   { "PRD.md": [ { at, rev, note, summary } ], ... }
// The /annotate-artifact loop appends an entry each time it applies feedback to
// the .md, so re-rendering surfaces "what changed, and why" per revision.
const HISTORY_FILE = '.annotation-history.json';
// Per-revision snapshots (a .md + rendered .html copy) so old revisions can be
// viewed later without re-deriving them.
const REV_DIR = '.revisions';

function readHistory(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, HISTORY_FILE), 'utf8'));
  } catch {
    return {};
  }
}

// Who made the edit: git identity (repo-local or global), falling back to the
// machine hostname when there's no git / no configured user.
function detectAuthor(cwd) {
  const git = (args) => {
    try {
      return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 })
        .toString().trim();
    } catch { return ''; }
  };
  const name = git(['config', 'user.name']);
  if (name) {
    const email = git(['config', 'user.email']);
    return email ? `${name} <${email}>` : name;
  }
  return os.hostname();
}

function logHistory(dir, mdName, note, summary) {
  const all = readHistory(dir);
  const list = Array.isArray(all[mdName]) ? all[mdName] : [];
  const rev = list.length ? (list[list.length - 1].rev ?? list.length) + 1 : 1;
  const stem = mdName.replace(/\.md$/i, '');

  // Snapshot the current .md (the post-edit state for this revision) plus a
  // rendered HTML copy, so this revision can be reopened later as-is.
  const snapshot = `${REV_DIR}/${stem}/rev-${rev}.html`;
  try {
    const snapDir = path.join(dir, REV_DIR, stem);
    fs.mkdirSync(snapDir, { recursive: true });
    const mdText = fs.readFileSync(path.join(dir, mdName), 'utf8');
    fs.writeFileSync(path.join(snapDir, `rev-${rev}.md`), mdText, 'utf8');
    const html = render(mdText, `${firstH1(mdText, stem)} (rev ${rev})`, mdName, [], [], {
      historical: { rev, backHref: `../../${stem}.html` },
    });
    fs.writeFileSync(path.join(snapDir, `rev-${rev}.html`), html, 'utf8');
  } catch (e) {
    console.error(`warning: could not snapshot rev ${rev}: ${e.message}`);
  }

  list.push({
    at: new Date().toISOString(),
    rev,
    author: detectAuthor(dir),
    note: note || '',
    summary: summary || '',
    snapshot,
  });
  all[mdName] = list;
  fs.writeFileSync(path.join(dir, HISTORY_FILE), JSON.stringify(all, null, 2) + '\n', 'utf8');
  console.log(`logged rev ${rev} for ${mdName} (snapshot ${snapshot})`);
}

function renderHistorySection(entries) {
  if (!entries || !entries.length) return '';
  const items = entries.map((e) => {
    const when = escapeHtml(e.at || '');
    const revLabel = `rev ${escapeHtml(String(e.rev ?? ''))}`;
    // Link each revision to its snapshot so you can open the old version.
    // (Navigates when the .html is opened directly; annotron's own server
    // doesn't serve sibling files.)
    const revEl = e.snapshot
      ? `<a class="rev-n" href="${escapeHtml(e.snapshot)}" title="Open this revision">${revLabel}</a>`
      : `<span class="rev-n">${revLabel}</span>`;
    const author = e.author ? `<span class="rev-author">${escapeHtml(e.author)}</span>` : '';
    const note = e.note ? `<div class="rev-note">${escapeHtml(e.note)}</div>` : '';
    const summary = e.summary ? `<div class="rev-summary">${escapeHtml(e.summary)}</div>` : '';
    return `<li><div class="rev-head">${revEl}${author}<time>${when}</time></div>${note}${summary}</li>`;
  }).join('\n');
  return `\n<details class="rev-history">
<summary>Revision history (${entries.length})</summary>
<ol>
${items}
</ol>
</details>`;
}

function slugify(text) {
  return text.toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

// Heading ids (matches the old Python `toc` behaviour) so annotron selectors are stable.
function makeRenderer() {
  const r = new Renderer();
  r.heading = function (text, level, raw) {
    const id = slugify(raw ?? text);
    return `<h${level} id="${id}">${text}</h${level}>\n`;
  };
  return r;
}

/**
 * Rewrite same-directory links to sibling artifacts (foo.md -> foo.html). Only touches
 * relative links resolving to a .md in the same folder that matches a rendered sibling;
 * ../x.md, sub/y.md, absolute paths, and external URLs keep pointing at the .md source.
 */
function rewriteSiblingLinks(body, siblingStems) {
  const stems = new Set(siblingStems);
  if (!stems.size) return body;
  return body.replace(LINK_RE, (whole, attr, url) => {
    const hashIdx = url.indexOf('#');
    const target = hashIdx === -1 ? url : url.slice(0, hashIdx);
    const frag = hashIdx === -1 ? '' : url.slice(hashIdx);
    if (!target.endsWith('.md')) return whole;
    if (/^[a-zA-Z][\w+.-]*:/.test(target) || target.startsWith('/')) return whole; // external/absolute
    const clean = target.startsWith('./') ? target.slice(2) : target;
    if (clean.includes('/')) return whole; // points into another directory
    const stem = clean.slice(0, -3);
    if (!stems.has(stem)) return whole;
    const prefix = target.startsWith('./') ? './' : '';
    return `${attr}="${prefix}${stem}.html${frag}"`;
  });
}

function wrapTables(body) {
  return body
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, '</table></div>');
}

function render(text, title, sourceName, siblingStems = [], history = [], opts = {}) {
  let body = marked.parse(text, { renderer: makeRenderer(), gfm: true });
  body = rewriteSiblingLinks(body, siblingStems);
  body = wrapTables(body);
  const meta = opts.historical
    ? `<div class="doc-meta doc-historical">Historical snapshot · rev ${escapeHtml(String(opts.historical.rev))} · <a href="${escapeHtml(opts.historical.backHref)}">← back to current</a></div>`
    : `<div class="doc-meta">Rendered from ${escapeHtml(sourceName)} · annotation copy — edit the .md source, not this file</div>`;
  // Snapshots don't carry a revision-history section (they're a point in time).
  const historySection = opts.historical ? '' : renderHistorySection(history);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
${meta}
${body}${historySection}
</body>
</html>
`;
}

function convertOne(mdPath, outPath, siblingStems = [], history = []) {
  const text = fs.readFileSync(mdPath, 'utf8');
  const base = path.basename(mdPath);
  const title = firstH1(text, base.replace(/\.md$/i, ''));
  fs.writeFileSync(outPath, render(text, title, base, siblingStems, history), 'utf8');
  console.log(`wrote ${outPath}`);
}

function die(msg) { console.error(msg); process.exit(1); }

function mtime(p) {
  try { return fs.statSync(p).mtimeMs; } catch { return 0; }
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    die('usage: node md-to-html.mjs <in.md> [out.html] | --all <dir> | --log <dir> <artifact.md> <note> <summary>');
  }

  // --log <artifactsDir> <artifact.md> <note> <summary>
  // Append a revision-history entry; used by the /annotate-artifact loop after
  // it applies feedback to the .md.
  if (args[0] === '--log') {
    const [, dir, mdName, note, summary] = args;
    if (!dir || !mdName) die('usage: node md-to-html.mjs --log <dir> <artifact.md> <note> <summary>');
    logHistory(dir, path.basename(mdName), note, summary);
    return;
  }

  if (args[0] === '--all') {
    const rest = args.slice(1);
    const force = rest.includes('--force');
    const dir = rest.find((a) => a !== '--force');
    if (!dir) die('usage: node md-to-html.mjs --all <dir> [--force]');
    const mdFiles = fs.readdirSync(dir)
      .filter((n) => n.toLowerCase().endsWith('.md'))
      .sort()
      .map((n) => path.join(dir, n));
    if (!mdFiles.length) die(`no .md files in ${dir}`);
    const stems = mdFiles.map((p) => path.basename(p).replace(/\.md$/i, ''));
    const history = readHistory(dir);
    const historyMtime = mtime(path.join(dir, HISTORY_FILE));
    for (const p of mdFiles) {
      const out = p.replace(/\.md$/i, '.html');
      // Skip re-gen when the .html is already newer than both the .md and the
      // history file — reopening an unchanged artifact costs nothing.
      if (!force && mtime(out) >= mtime(p) && mtime(out) >= historyMtime) {
        console.log(`skip (up to date) ${out}`);
        continue;
      }
      convertOne(p, out, stems, history[path.basename(p)] ?? []);
    }
    return;
  }

  const mdPath = args[0];
  const outPath = args[1] || mdPath.replace(/\.md$/i, '.html');
  const history = readHistory(path.dirname(mdPath));
  convertOne(mdPath, outPath, [], history[path.basename(mdPath)] ?? []);
}

main();
