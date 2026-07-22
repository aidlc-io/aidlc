/**
 * Markdown → HTML renderer for annotron's Markdown mode.
 *
 * Uses `markdown-it` for the prose and `merslim` (a slim, zero-runtime mermaid
 * renderer) to turn ```mermaid fenced blocks into self-contained inline SVG at
 * render time — so architecture docs with UML/flow/sequence/… diagrams render
 * without any client-side diagram runtime. Types merslim can't lay out headless
 * (sequence, state, mindmap) fall back to its Unicode ASCII rendering; anything
 * unparseable falls back to the raw fenced source.
 */
import MarkdownIt from 'markdown-it';
import {
  parseToIR,
  flowchartToSvg, classToSvg, erToSvg,
  buildPieSvg, buildQuadrantSvg, buildJourneySvg, buildGanttSvg,
  buildTimelineSvg, buildC4Svg, buildArchitectureSvg, buildGitGraphSvg,
} from 'merslim';

// merslim IR type → one-call SVG builder (only the types that lay out headless).
const SVG_BUILDERS = {
  flowchart: flowchartToSvg,
  class: classToSvg,
  er: erToSvg,
  pie: buildPieSvg,
  quadrant: buildQuadrantSvg,
  journey: buildJourneySvg,
  gantt: buildGanttSvg,
  timeline: buildTimelineSvg,
  c4: buildC4Svg,
  architecture: buildArchitectureSvg,
  gitgraph: buildGitGraphSvg,
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function renderDiagram(src) {
  try {
    const r = await parseToIR(src);
    if (r && r.ok) {
      const build = SVG_BUILDERS[r.type];
      if (build) {
        try {
          const svg = build(r.ir, { dark: false });
          if (typeof svg === 'string' && svg.includes('<svg')) {
            return `<figure class="mmd-diagram" data-mmd-type="${escapeHtml(r.type)}">${svg}</figure>`;
          }
        } catch { /* fall through to client-side mermaid */ }
      }
    }
  } catch { /* fall through to client-side mermaid */ }
  // merslim has no headless SVG builder for this type (sequence / state /
  // mindmap) or the build failed. Hand the raw source to mermaid.js in the
  // browser instead of the old ASCII fallback, so EVERY diagram renders as a
  // real diagram — matching the mermaid extension. wrapDocument injects the
  // mermaid runtime whenever any of these client blocks are present.
  return `<pre class="mermaid mmd-client">${escapeHtml(src)}</pre>`;
}

const isMermaidFence = (info) => (info || '').trim().split(/\s+/)[0].toLowerCase() === 'mermaid';

function slugify(text) {
  return (text || '').toLowerCase().trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/** Render Markdown text to a full, self-contained HTML document. */
export async function renderMarkdown(mdText, { title = 'Markdown' } = {}) {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: true, breaks: false });

  // Extract headings for outline
  const headings = [];
  const headingLevels = /^h([1-6])$/i;

  // Pre-render every mermaid block (async), keyed by its source.
  const tokens = md.parse(mdText || '', {});
  const diagrams = new Map();
  for (const t of tokens) {
    if (t.type === 'fence' && isMermaidFence(t.info) && !diagrams.has(t.content)) {
      diagrams.set(t.content, await renderDiagram(t.content));
    }
  }

  const defaultFence = md.renderer.rules.fence
    || ((toks, idx, options, env, self) => self.renderToken(toks, idx, options));
  md.renderer.rules.fence = (toks, idx, options, env, self) => {
    const t = toks[idx];
    if (isMermaidFence(t.info) && diagrams.has(t.content)) return diagrams.get(t.content);
    return defaultFence(toks, idx, options, env, self);
  };

  // Override heading renderer to extract headings and add IDs
  const defaultHeading = md.renderer.rules.heading_open
    || ((toks, idx, options, env, self) => self.renderToken(toks, idx, options));
  md.renderer.rules.heading_open = (toks, idx, options, env, self) => {
    const token = toks[idx];
    const match = token.tag.match(headingLevels);
    if (match) {
      const level = parseInt(match[1], 10);
      // Find the heading text from the next token
      const nextToken = toks[idx + 1];
      if (nextToken && nextToken.type === 'inline' && nextToken.content) {
        const text = nextToken.content;
        const id = slugify(text);
        token.attrSet('id', id);
        headings.push({ level, text, id });
      }
    }
    return defaultHeading(toks, idx, options, env, self);
  };

  const body = md.renderer.render(tokens, md.options, {});
  // Load the mermaid runtime only when a diagram fell back to client rendering.
  const needsMermaid = body.includes('class="mermaid');
  return wrapDocument(body, title, headings, needsMermaid);
}

function wrapDocument(bodyHtml, title, headings = [], needsMermaid = false) {
  const headingsJson = escapeHtml(JSON.stringify(headings));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="headings-data" content="${headingsJson}">
<title>${escapeHtml(title)}</title>
<style>
  :root { --ink:#1f2430; --muted:#6b7280; --line:#e6e8ee; --accent:#2741F1; --code-bg:#f5f6fa; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; color: var(--ink);
    font: 16px/1.75 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  .md { max-width: 820px; margin: 0 auto; padding: 48px 32px 120px; }
  .md h1 { font-size: 2rem; font-weight: 700; letter-spacing: -.02em; margin: 0 0 .4em; line-height: 1.2; }
  .md h2 { font-size: 1.5rem; font-weight: 650; margin: 1.8em 0 .5em; padding-bottom: .3em; border-bottom: 1px solid var(--line); }
  .md h3 { font-size: 1.2rem; font-weight: 650; margin: 1.5em 0 .4em; }
  .md h4 { font-size: 1.02rem; font-weight: 650; margin: 1.3em 0 .3em; }
  .md p { margin: 0 0 1em; }
  .md a { color: var(--accent); text-decoration: none; }
  .md a:hover { text-decoration: underline; }
  .md ul, .md ol { margin: 0 0 1em; padding-left: 1.6em; }
  .md li { margin: .3em 0; }
  .md blockquote { margin: 1em 0; padding: .6em 1.1em; border-left: 3px solid #d88689;
    background: #faf7f7; color: var(--muted); border-radius: 0 8px 8px 0; }
  .md code { background: var(--code-bg); border-radius: 5px; padding: .12em .4em; font-size: .88em;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .md pre { background: var(--code-bg); border: 1px solid var(--line); border-radius: 10px;
    padding: 14px 16px; overflow: auto; margin: 0 0 1.2em; }
  .md pre code { background: none; padding: 0; font-size: .86em; line-height: 1.6; }
  .md table { border-collapse: collapse; width: 100%; margin: 0 0 1.2em; font-size: .95em; }
  .md th, .md td { text-align: left; padding: 8px 12px; border: 1px solid var(--line); vertical-align: top; }
  .md th { background: #f7f8fb; font-weight: 650; }
  .md hr { border: none; border-top: 1px solid var(--line); margin: 2em 0; }
  .md img { max-width: 100%; }
  /* diagrams */
  .md .mmd-diagram { margin: 1.4em 0; padding: 16px; border: 1px solid var(--line); border-radius: 12px;
    background: #fcfcfe; text-align: center; overflow-x: auto; }
  .md .mmd-diagram svg { max-width: 100%; height: auto; }
  .md .mmd-ascii { background: #0f1420; color: #cfe3ff; border: none;
    font-family: ui-monospace, Menlo, monospace; line-height: 1.35; }
  .md .mmd-raw { border-style: dashed; }
  /* client-side mermaid fallback (sequence / state / mindmap) */
  .md .mermaid { margin: 1.4em 0; padding: 16px; border: 1px solid var(--line);
    border-radius: 12px; background: #fcfcfe; text-align: center; overflow-x: auto; }
  .md .mermaid svg { max-width: 100%; height: auto; }
  /* raw source shown only until mermaid replaces it (avoids a flash of code) */
  .md .mermaid:not([data-processed]) { color: var(--muted); text-align: left;
    font: .82em/1.5 ui-monospace, Menlo, monospace; white-space: pre-wrap; }
</style>
</head>
<body>
  <article class="md">
${bodyHtml}
  </article>
${needsMermaid ? `  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: false, theme: 'default' });
    // Render the fenced blocks merslim couldn't lay out headless.
    mermaid.run({ querySelector: '.mermaid' }).catch((e) => console.error('mermaid render failed', e));
  </script>` : ''}
</body>
</html>`;
}
