/**
 * Tech-stack-aware template renderer for AIDLC skill / agent markdown.
 *
 * Templates use `{{#if STACK}}…{{/if}}` blocks where STACK is a tech-stack
 * id (web, mobile, desktop, backend, cli). At install time the renderer is
 * called with the project's detected stack set; blocks whose STACK isn't
 * picked are stripped (including the surrounding `{{#if}}` / `{{/if}}`
 * lines), so the user only sees sections relevant to their codebase.
 *
 * Syntax (kept tiny on purpose):
 *
 *   {{#if web}}
 *   ...web-only content...
 *   {{/if}}
 *
 *   {{#unless cli}}
 *   ...content shown for everything except CLI projects...
 *   {{/unless}}
 *
 *   {{#any web,mobile,desktop}}
 *   ...content shown when at least one of those stacks is picked...
 *   {{/any}}
 *
 * Tags must each sit on their own line — the renderer strips the entire
 * line they appear on so the surrounding markdown stays clean (no orphan
 * blank lines from stripped `{{#if}}` markers).
 *
 * When `stacks` is `null` the renderer returns the body untouched. This
 * lets call sites opt out (or run in "unknown stack — show everything"
 * mode) without a second code path.
 */

const IF_OPEN = /^\s*\{\{#if\s+([a-zA-Z][a-zA-Z0-9_-]*)\}\}\s*$/;
const IF_CLOSE = /^\s*\{\{\/if\}\}\s*$/;
const UNLESS_OPEN = /^\s*\{\{#unless\s+([a-zA-Z][a-zA-Z0-9_-]*)\}\}\s*$/;
const UNLESS_CLOSE = /^\s*\{\{\/unless\}\}\s*$/;
const ANY_OPEN = /^\s*\{\{#any\s+([a-zA-Z0-9_,\s-]+)\}\}\s*$/;
const ANY_CLOSE = /^\s*\{\{\/any\}\}\s*$/;

type BlockKind = 'if' | 'unless' | 'any';
interface BlockFrame {
  kind: BlockKind;
  /** True when the block's content should be emitted, false to drop it. */
  emit: boolean;
}

/**
 * Render `body` against the picked `stacks`. Returns the filtered body.
 * Unknown tags (typo in the template) are left in place so they fail loud
 * during review rather than silently disappearing.
 */
export function renderTemplate(body: string, stacks: readonly string[] | null): string {
  if (stacks === null) { return body; }
  const picked = new Set(stacks);

  const out: string[] = [];
  const stack: BlockFrame[] = [];
  const lines = body.split(/\r?\n/);

  const shouldEmit = (): boolean => stack.every((f) => f.emit);

  for (const line of lines) {
    let m: RegExpMatchArray | null;
    if ((m = line.match(IF_OPEN))) {
      stack.push({ kind: 'if', emit: picked.has(m[1]) });
      continue;
    }
    if (IF_CLOSE.test(line)) {
      const top = stack[stack.length - 1];
      if (top?.kind === 'if') { stack.pop(); continue; }
      // Mismatched close — pass through so the template author notices.
      if (shouldEmit()) { out.push(line); }
      continue;
    }
    if ((m = line.match(UNLESS_OPEN))) {
      stack.push({ kind: 'unless', emit: !picked.has(m[1]) });
      continue;
    }
    if (UNLESS_CLOSE.test(line)) {
      const top = stack[stack.length - 1];
      if (top?.kind === 'unless') { stack.pop(); continue; }
      if (shouldEmit()) { out.push(line); }
      continue;
    }
    if ((m = line.match(ANY_OPEN))) {
      const ids = m[1].split(',').map((s) => s.trim()).filter(Boolean);
      stack.push({ kind: 'any', emit: ids.some((id) => picked.has(id)) });
      continue;
    }
    if (ANY_CLOSE.test(line)) {
      const top = stack[stack.length - 1];
      if (top?.kind === 'any') { stack.pop(); continue; }
      if (shouldEmit()) { out.push(line); }
      continue;
    }
    if (shouldEmit()) { out.push(line); }
  }

  // Collapse any triple-or-more consecutive blank lines that the strip may
  // have left behind. Keep single blank separators intact.
  return collapseBlankRuns(out.join('\n'));
}

function collapseBlankRuns(s: string): string {
  return s.replace(/\n{3,}/g, '\n\n');
}
