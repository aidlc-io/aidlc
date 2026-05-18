/**
 * Installs the extension's bundled persona + skill defaults into the user's
 * global Claude folder (`~/.claude/agents/`, `~/.claude/skills/`) so the
 * built-in workflows are self-contained — no dependency on external content
 * trees like `~/.cache/cf-sdlc-pipeline/`.
 *
 * Naming
 * ------
 * Every file is prefixed with `aidlc-<workflowId>-` so the 8 built-in
 * workflows can coexist without colliding (each workflow has its own `po`,
 * `tech-lead`, …). This also keeps cf-sdlc-pipeline's existing symlinks at
 * `~/.claude/agents/{po,tech-lead,…}.md` untouched — we never overwrite a
 * file we didn't install.
 *
 * Idempotency
 * -----------
 * Each installed file starts with a one-line marker:
 *
 *   <!-- AIDLC extension built-in — workflow: <id>, kind: agent|skill, id: <id> -->
 *
 * - Missing file → write fresh.
 * - File present with our marker → re-write (lets the user pull updates by
 *   reinstalling/reloading the extension).
 * - File present without our marker → skip (user-owned, leave alone).
 *
 * UI side: `detectBuiltinSource()` in workspaceWebview reads the marker so
 * each entry gets the "BUILT-IN" badge + "from <workflow.name>" subtitle.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { BUILTIN_WORKFLOWS, type BuiltinWorkflow } from './builtinPresets';

const MARKER_PREFIX = '<!-- AIDLC extension built-in';

interface InstallReport {
  workflow: string;
  written: string[];
  skipped: string[];
}

/**
 * Default workflow ids installed on activation. Only the stack-neutral SDLC
 * pipeline ships globally by default — additional workflows are opt-in via
 * `aidlc.installWorkflowGlobals` (multi-pick) or auto-installed when the
 * user applies the matching preset.
 *
 * Rationale: installing all 8 workflows globally on every activation
 * polluted `~/.claude/agents/` + `~/.claude/skills/` with ~144 files per
 * user, most of which they never touch.
 */
export const DEFAULT_GLOBAL_WORKFLOW_IDS: readonly string[] = ['sdlc-pipeline'];

/**
 * Install the *default* built-in workflows under `~/.claude/agents/` and
 * `~/.claude/skills/`. Safe to run on every activation — the marker check
 * makes it a no-op when nothing changed. Non-default workflows install on
 * demand via `installWorkflowGlobalsById`.
 */
export function installGlobalDefaults(extensionPath: string, log?: (msg: string) => void): InstallReport[] {
  return installWorkflowGlobalsByIds(extensionPath, DEFAULT_GLOBAL_WORKFLOW_IDS, log);
}

/**
 * Install a specific set of built-in workflows by id. Skips unknown ids
 * silently. Used by `aidlc.installWorkflowGlobals` and by the apply-preset
 * confirmation flow that asks the user before dropping a workflow's files
 * into global.
 */
export function installWorkflowGlobalsByIds(
  extensionPath: string,
  workflowIds: readonly string[],
  log?: (msg: string) => void,
): InstallReport[] {
  const reports: InstallReport[] = [];
  for (const id of workflowIds) {
    const workflow = BUILTIN_WORKFLOWS.find((w) => w.id === id);
    if (!workflow) { continue; }
    reports.push(installWorkflow(extensionPath, workflow, log));
  }
  return reports;
}

/**
 * Check whether a workflow's bundled agents + skills are present under
 * `~/.claude/`. Returns `true` only when *every* expected source file has
 * a matching `aidlc-<workflow>-<id>.md` installed — partial installs (e.g.
 * the user deleted one file) count as not installed so the apply-preset
 * prompt re-offers the install.
 */
export function isWorkflowGloballyInstalled(extensionPath: string, workflowId: string): boolean {
  const workflow = BUILTIN_WORKFLOWS.find((w) => w.id === workflowId);
  if (!workflow) { return false; }
  const home = os.homedir();
  const workflowDir = path.join(extensionPath, 'templates', workflow.templatesDir);
  const workflowIdLocal = workflow.id;
  return (
    kindInstalled('agents', path.join(home, '.claude', 'agents')) &&
    kindInstalled('skills', path.join(home, '.claude', 'skills'))
  );

  function kindInstalled(kind: 'agents' | 'skills', destDir: string): boolean {
    const srcDir = path.join(workflowDir, kind);
    if (!fs.existsSync(srcDir)) { return true; }
    for (const file of fs.readdirSync(srcDir)) {
      if (!file.endsWith('.md')) { continue; }
      const id = file.slice(0, -3);
      const targetName = `aidlc-${workflowIdLocal}-${id}.md`;
      if (!fs.existsSync(path.join(destDir, targetName))) { return false; }
    }
    return true;
  }
}

function installWorkflow(
  extensionPath: string,
  workflow: BuiltinWorkflow,
  log?: (msg: string) => void,
): InstallReport {
  const report: InstallReport = { workflow: workflow.id, written: [], skipped: [] };
  const home = os.homedir();
  const workflowDir = path.join(extensionPath, 'templates', workflow.templatesDir);

  copyKind('agents', path.join(home, '.claude', 'agents'));
  copyKind('skills', path.join(home, '.claude', 'skills'));

  if (log && (report.written.length || report.skipped.length)) {
    log(
      `globalDefaults[${workflow.id}]: wrote ${report.written.length}, skipped ${report.skipped.length}`,
    );
  }
  return report;

  function copyKind(kind: 'agents' | 'skills', destDir: string): void {
    const srcDir = path.join(workflowDir, kind);
    if (!fs.existsSync(srcDir)) { return; }
    fs.mkdirSync(destDir, { recursive: true });

    for (const file of fs.readdirSync(srcDir)) {
      if (!file.endsWith('.md')) { continue; }
      const id = file.slice(0, -3);
      const targetName = `aidlc-${workflow.id}-${id}.md`;
      const targetPath = path.join(destDir, targetName);
      const sourceBody = fs.readFileSync(path.join(srcDir, file), 'utf8');
      const stamped = stampMarker(sourceBody, workflow.id, kind === 'agents' ? 'agent' : 'skill', id);

      if (!fs.existsSync(targetPath)) {
        fs.writeFileSync(targetPath, stamped, 'utf8');
        report.written.push(targetName);
        continue;
      }

      // Existing file — read first line; only overwrite if it's ours.
      const existing = readFirstLine(targetPath);
      if (existing.startsWith(MARKER_PREFIX)) {
        fs.writeFileSync(targetPath, stamped, 'utf8');
        report.written.push(targetName);
      } else {
        report.skipped.push(targetName);
      }
    }
  }
}

function stampMarker(body: string, workflowId: string, kind: 'agent' | 'skill', id: string): string {
  const marker = `${MARKER_PREFIX} — workflow: ${workflowId}, kind: ${kind}, id: ${id} -->\n`;
  // If the source itself starts with our marker (shouldn't happen for bundled
  // templates, but be defensive), drop the old one before re-stamping.
  const stripped = body.startsWith(MARKER_PREFIX)
    ? body.slice(body.indexOf('\n') + 1)
    : body;
  return marker + stripped;
}

function readFirstLine(filePath: string): string {
  try {
    const buf = fs.readFileSync(filePath, 'utf8');
    const nl = buf.indexOf('\n');
    return nl === -1 ? buf : buf.slice(0, nl);
  } catch {
    return '';
  }
}

interface UninstallReport {
  workflow: string;
  removed: string[];
  skipped: string[];
}

/**
 * Remove a workflow's bundled files from `~/.claude/agents` and
 * `~/.claude/skills`. Only deletes files that still carry the AIDLC marker
 * — anything the user replaced or hand-edited (marker overwritten) is
 * preserved. Missing files are silently ignored so re-running is safe.
 */
export function uninstallWorkflowGlobalsByIds(
  workflowIds: readonly string[],
  log?: (msg: string) => void,
): UninstallReport[] {
  const reports: UninstallReport[] = [];
  const home = os.homedir();
  for (const id of workflowIds) {
    const workflow = BUILTIN_WORKFLOWS.find((w) => w.id === id);
    if (!workflow) { continue; }
    const report: UninstallReport = { workflow: workflow.id, removed: [], skipped: [] };
    removeKind(path.join(home, '.claude', 'agents'));
    removeKind(path.join(home, '.claude', 'skills'));
    if (log && (report.removed.length || report.skipped.length)) {
      log(
        `globalDefaults[${workflow.id}]: removed ${report.removed.length}, skipped ${report.skipped.length}`,
      );
    }
    reports.push(report);

    function removeKind(destDir: string): void {
      if (!fs.existsSync(destDir)) { return; }
      const prefix = `aidlc-${workflow!.id}-`;
      for (const file of fs.readdirSync(destDir)) {
        if (!file.startsWith(prefix) || !file.endsWith('.md')) { continue; }
        const fullPath = path.join(destDir, file);
        const firstLine = readFirstLine(fullPath);
        if (firstLine.startsWith(MARKER_PREFIX)) {
          try { fs.unlinkSync(fullPath); report.removed.push(file); }
          catch { report.skipped.push(file); }
        } else {
          report.skipped.push(file);
        }
      }
    }
  }
  return reports;
}

/**
 * Look up the human label of the workflow that produced this global-scope
 * file. Returns undefined if the file isn't ours.
 *
 * Reads the first 200 bytes only — the marker always sits on line 1.
 */
export function detectGlobalBuiltinSource(filePath: string): string | undefined {
  try {
    const head = fs.readFileSync(filePath, 'utf8').slice(0, 200);
    const m = head.match(/<!-- AIDLC extension built-in — workflow:\s*([^,\s]+)/);
    if (!m) { return undefined; }
    const workflow = BUILTIN_WORKFLOWS.find((w) => w.id === m[1]);
    return workflow?.name ?? m[1];
  } catch {
    return undefined;
  }
}
