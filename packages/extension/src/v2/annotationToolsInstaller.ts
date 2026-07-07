/**
 * Installs the annotation tooling into the user's global Claude folder so the
 * `/annotate-artifact` review loop works out of the box in any project — no
 * `python`, no `pip install`, no global `annotron`, just `node` (which Claude
 * Code already requires).
 *
 * What lands where (all under `~/.claude/`):
 *   tools/md-to-html.mjs            — zero-dep Node renderer (marked vendored)
 *   tools/vendor/marked.esm.mjs     — vendored markdown lib
 *   tools/annotron/{bin,src,…}      — vendored annotron (zero-dep)
 *   skills/aidlc-annotate-artifact.md — the review-loop skill (marker-stamped)
 *
 * Sources are the extension's own bundled copies (`copy:tools` + `copy:annotron`
 * put them there at build time). The renderer + annotron are ours and versioned
 * with the extension, so they're overwritten every activation. The skill is
 * marker-stamped and only overwritten if it's ours — a hand-edited file (no
 * marker) is left alone.
 *
 * Safe to call on every activation; wrap the call in try/catch so a filesystem
 * hiccup never blocks the extension from starting.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Ownership marker. MUST NOT go on line 1 — the skill's YAML frontmatter has to
// start at line 1 or Claude Code won't register the skill. So it lives at the
// end of the file and ownership is detected with a substring check.
const SKILL_MARKER = '<!-- AIDLC annotation tool — reinstalled by the AIDLC extension; hand edits are overwritten -->';
const SKILL_MARKER_KEY = 'AIDLC annotation tool';
const SKILL_TARGET = 'aidlc-annotate-artifact.md';

export function installAnnotationTools(extensionPath: string, log?: (msg: string) => void): void {
  const home = os.homedir();
  const toolsDest = path.join(home, '.claude', 'tools');
  const skillsDest = path.join(home, '.claude', 'skills');

  const rendererSrc = path.join(extensionPath, 'tools', 'md-to-html.mjs');
  const markedSrc = path.join(extensionPath, 'tools', 'vendor', 'marked.esm.mjs');
  const annotronSrc = path.join(extensionPath, 'vendor', 'annotron');
  const skillSrc = path.join(extensionPath, 'assets', 'annotate-artifact.skill.md');

  // If the bundle is incomplete (e.g. a partial build), do nothing rather than
  // install a half-working tool.
  for (const p of [rendererSrc, markedSrc, annotronSrc, skillSrc]) {
    if (!fs.existsSync(p)) {
      log?.(`annotationTools: missing bundled source ${p} — skipping install`);
      return;
    }
  }

  fs.mkdirSync(path.join(toolsDest, 'vendor'), { recursive: true });
  fs.mkdirSync(skillsDest, { recursive: true });

  copyFile(rendererSrc, path.join(toolsDest, 'md-to-html.mjs'));
  copyFile(markedSrc, path.join(toolsDest, 'vendor', 'marked.esm.mjs'));
  copyDir(annotronSrc, path.join(toolsDest, 'annotron'));

  installSkill(skillSrc, path.join(skillsDest, SKILL_TARGET), log);

  log?.(`annotationTools: installed renderer + annotron + /annotate-artifact into ${path.join(home, '.claude')}`);
}

function installSkill(src: string, dest: string, log?: (msg: string) => void): void {
  const body = fs.readFileSync(src, 'utf8');
  // Frontmatter stays on line 1; marker appended at the end.
  const stamped = `${body.replace(/\s*$/, '')}\n\n${SKILL_MARKER}\n`;

  if (fs.existsSync(dest)) {
    const existing = fs.readFileSync(dest, 'utf8');
    if (!existing.includes(SKILL_MARKER_KEY)) {
      log?.(`annotationTools: ${SKILL_TARGET} exists and is user-owned — leaving it alone`);
      return; // never clobber a hand-authored skill
    }
  }
  fs.writeFileSync(dest, stamped, 'utf8');
}

function copyFile(src: string, dest: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}
