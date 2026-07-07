/**
 * Installs the annotation + epic-memory tooling into the user's global Claude
 * folder so `/annotate-artifact` and `/epic-context` work out of the box in any
 * project — no `python`, no `pip install`, no global `annotron`, just `node`
 * (which Claude Code already requires).
 *
 * What lands where (all under `~/.claude/`):
 *   tools/md-to-html.mjs               — zero-dep Node renderer (marked vendored)
 *   tools/vendor/marked.esm.mjs        — vendored markdown lib
 *   tools/epic-memory.mjs              — per-epic memory CLI (zero-dep)
 *   tools/annotron/{bin,src,…}         — vendored annotron (zero-dep)
 *   skills/annotate-artifact/SKILL.md  — the review-loop skill (marker-stamped)
 *   skills/epic-context/SKILL.md       — the epic-memory skill (marker-stamped)
 *
 * Sources are the extension's own bundled copies (`copy:tools` + `copy:annotron`
 * put them there at build time). The tools are ours and versioned with the
 * extension, so they're overwritten every activation. Skills are marker-stamped
 * and only overwritten if they're ours — a hand-edited file (no marker) is left
 * alone.
 *
 * It does NOT touch the user's settings.json — permissions stay under the user's
 * control (the skill documents the allows to add if you want the loop prompt-free).
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

export function installAnnotationTools(extensionPath: string, log?: (msg: string) => void): void {
  const home = os.homedir();
  const toolsDest = path.join(home, '.claude', 'tools');
  const skillsDest = path.join(home, '.claude', 'skills');

  const rendererSrc = path.join(extensionPath, 'tools', 'md-to-html.mjs');
  const markedSrc = path.join(extensionPath, 'tools', 'vendor', 'marked.esm.mjs');
  const epicMemorySrc = path.join(extensionPath, 'tools', 'epic-memory.mjs');
  const annotronSrc = path.join(extensionPath, 'vendor', 'annotron');
  // Skill source → skill name. Claude Code discovers personal skills as
  // `~/.claude/skills/<name>/SKILL.md` (directory form), NOT flat `.md` files —
  // so the name is the directory and the file is always SKILL.md.
  const skills: Array<[string, string]> = [
    [path.join(extensionPath, 'assets', 'annotate-artifact.skill.md'), 'annotate-artifact'],
    [path.join(extensionPath, 'assets', 'epic-context.skill.md'), 'epic-context'],
  ];

  // If the bundle is incomplete (e.g. a partial build), do nothing rather than
  // install a half-working tool.
  const required = [rendererSrc, markedSrc, epicMemorySrc, annotronSrc, ...skills.map(([s]) => s)];
  for (const p of required) {
    if (!fs.existsSync(p)) {
      log?.(`annotationTools: missing bundled source ${p} — skipping install`);
      return;
    }
  }

  fs.mkdirSync(path.join(toolsDest, 'vendor'), { recursive: true });
  fs.mkdirSync(skillsDest, { recursive: true });

  copyFile(rendererSrc, path.join(toolsDest, 'md-to-html.mjs'));
  copyFile(markedSrc, path.join(toolsDest, 'vendor', 'marked.esm.mjs'));
  copyFile(epicMemorySrc, path.join(toolsDest, 'epic-memory.mjs'));
  copyDir(annotronSrc, path.join(toolsDest, 'annotron'));

  for (const [src, name] of skills) {
    installSkill(src, path.join(skillsDest, name), name, log);
    // Migrate away from the earlier (broken) flat-file form that Claude Code
    // never registered as a skill.
    removeIfOurs(path.join(skillsDest, `aidlc-${name}.md`), log);
  }

  log?.(`annotationTools: installed renderer + annotron + epic-memory + skills into ${path.join(home, '.claude')}`);
}

function installSkill(src: string, destDir: string, name: string, log?: (msg: string) => void): void {
  const body = fs.readFileSync(src, 'utf8');
  // Frontmatter stays on line 1; marker appended at the end.
  const stamped = `${body.replace(/\s*$/, '')}\n\n${SKILL_MARKER}\n`;
  const dest = path.join(destDir, 'SKILL.md');

  if (fs.existsSync(dest)) {
    const existing = fs.readFileSync(dest, 'utf8');
    if (!existing.includes(SKILL_MARKER_KEY)) {
      log?.(`annotationTools: skill ${name} exists and is user-owned — leaving it alone`);
      return; // never clobber a hand-authored skill
    }
  }
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(dest, stamped, 'utf8');
}

/** Remove a file only if it carries our ownership marker (never a user's). */
function removeIfOurs(filePath: string, log?: (msg: string) => void): void {
  try {
    if (!fs.existsSync(filePath)) { return; }
    if (fs.readFileSync(filePath, 'utf8').includes(SKILL_MARKER_KEY)) {
      fs.unlinkSync(filePath);
      log?.(`annotationTools: removed stale ${path.basename(filePath)}`);
    }
  } catch { /* best-effort cleanup */ }
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
