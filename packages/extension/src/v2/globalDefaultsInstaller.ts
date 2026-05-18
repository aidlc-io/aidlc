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
import { renderTemplate } from './templateRenderer';

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
export function installGlobalDefaults(
  extensionPath: string,
  log?: (msg: string) => void,
  techStack?: readonly string[] | null,
): InstallReport[] {
  return installWorkflowGlobalsByIds(extensionPath, DEFAULT_GLOBAL_WORKFLOW_IDS, log, techStack);
}

/**
 * Install a specific set of built-in workflows by id. Skips unknown ids
 * silently. Used by `aidlc.installWorkflowGlobals` and by the apply-preset
 * confirmation flow that asks the user before dropping a workflow's files
 * into global.
 *
 * `techStack` filters skill / agent bodies through the template renderer so
 * users only see sections that match their project. Pass `null` (or omit)
 * to write the full generic template — the right call when no workspace
 * is open or detection couldn't make up its mind.
 */
export function installWorkflowGlobalsByIds(
  extensionPath: string,
  workflowIds: readonly string[],
  log?: (msg: string) => void,
  techStack: readonly string[] | null = null,
): InstallReport[] {
  const reports: InstallReport[] = [];
  for (const id of workflowIds) {
    const workflow = BUILTIN_WORKFLOWS.find((w) => w.id === id);
    if (!workflow) { continue; }
    reports.push(installWorkflow(extensionPath, workflow, log, techStack));
  }
  return reports;
}

/**
 * Check whether a workflow's bundled agents + skills are present under
 * `~/.claude/`. Returns `true` only when *every* expected source file has
 * a matching `aidlc-<id>.md` installed. Files are named by source filename,
 * not by workflow, so multiple workflows sharing the same templates folder
 * naturally see the same install state.
 */
export function isWorkflowGloballyInstalled(extensionPath: string, workflowId: string): boolean {
  const workflow = BUILTIN_WORKFLOWS.find((w) => w.id === workflowId);
  if (!workflow) { return false; }
  const home = os.homedir();
  const workflowDir = path.join(extensionPath, 'templates', workflow.templatesDir);
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
      const targetName = `aidlc-${id}.md`;
      if (!fs.existsSync(path.join(destDir, targetName))) { return false; }
    }
    return true;
  }
}

function installWorkflow(
  extensionPath: string,
  workflow: BuiltinWorkflow,
  log?: (msg: string) => void,
  techStack: readonly string[] | null = null,
): InstallReport {
  const report: InstallReport = { workflow: workflow.id, written: [], skipped: [] };
  const home = os.homedir();
  const workflowDir = path.join(extensionPath, 'templates', workflow.templatesDir);

  copyKind('agents', path.join(home, '.claude', 'agents'));
  copyKind('skills', path.join(home, '.claude', 'skills'));

  if (log && (report.written.length || report.skipped.length)) {
    const stackTag = techStack && techStack.length ? ` [stack: ${techStack.join(',')}]` : '';
    log(
      `globalDefaults[${workflow.id}]${stackTag}: wrote ${report.written.length}, skipped ${report.skipped.length}`,
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
      const targetName = `aidlc-${id}.md`;
      const targetPath = path.join(destDir, targetName);
      const rawSource = fs.readFileSync(path.join(srcDir, file), 'utf8');
      // Render `{{#if STACK}}…{{/if}}` blocks before stamping so the marker
      // line stays at the very top regardless of which blocks got stripped.
      const sourceBody = renderTemplate(rawSource, techStack ?? null);
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
 * `~/.claude/skills`.
 *
 * Overlap-aware via `preserveWorkflowIds`: the caller passes the set of
 * other workflows whose files MUST be kept. Files needed by any preserved
 * workflow are skipped, even if the marker check would otherwise let us
 * delete them. The AIDLC marker check still applies — hand-edited files
 * (no marker) are never touched.
 *
 * Missing files are silently ignored so re-running is safe.
 */
export function uninstallWorkflowGlobalsByIds(
  workflowIds: readonly string[],
  log?: (msg: string) => void,
  extensionPath?: string,
  preserveWorkflowIds?: readonly string[],
): UninstallReport[] {
  const reports: UninstallReport[] = [];
  const home = os.homedir();

  // Files needed by workflows that should be preserved. Caller drives the
  // set: pass workflows that remain applied in workspace.yaml. Falls back
  // to "any globally-installed workflow other than the to-remove set" if
  // the caller didn't specify — keeps prior call sites working.
  const removeSet = new Set(workflowIds);
  const preserveSet = new Set<string>();
  if (extensionPath) {
    const preserveIds = preserveWorkflowIds !== undefined
      ? preserveWorkflowIds
      : BUILTIN_WORKFLOWS
          .filter((w) => !removeSet.has(w.id) && isWorkflowGloballyInstalled(extensionPath, w.id))
          .map((w) => w.id);
    for (const id of preserveIds) {
      const other = BUILTIN_WORKFLOWS.find((w) => w.id === id);
      if (!other) { continue; }
      for (const file of expectedSourceFiles(extensionPath, other)) {
        preserveSet.add(file);
      }
    }
  }

  for (const id of workflowIds) {
    const workflow = BUILTIN_WORKFLOWS.find((w) => w.id === id);
    if (!workflow) { continue; }
    const report: UninstallReport = { workflow: workflow.id, removed: [], skipped: [] };

    const filesToCheck = extensionPath
      ? expectedSourceFiles(extensionPath, workflow)
      : null;

    removeKind(path.join(home, '.claude', 'agents'), 'agents');
    removeKind(path.join(home, '.claude', 'skills'), 'skills');

    if (log && (report.removed.length || report.skipped.length)) {
      log(
        `globalDefaults[${workflow.id}]: removed ${report.removed.length}, skipped ${report.skipped.length}`,
      );
    }
    reports.push(report);

    function removeKind(destDir: string, kind: 'agents' | 'skills'): void {
      if (!fs.existsSync(destDir)) { return; }
      for (const file of fs.readdirSync(destDir)) {
        if (!file.startsWith('aidlc-') || !file.endsWith('.md')) { continue; }
        // When we know which files this workflow owns (extensionPath given),
        // skip foreign ones so we don't blindly nuke unrelated AIDLC files.
        if (filesToCheck && !filesToCheck.has(`${kind}/${file}`)) { continue; }
        // Preserve files still needed by another installed workflow.
        if (preserveSet.has(`${kind}/${file}`)) { report.skipped.push(file); continue; }

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
 * Compute the canonical set of installed file names for a workflow's
 * source folder, keyed as `<kind>/aidlc-<id>.md`. Used to drive
 * overlap-aware uninstall and to feed the preserve set.
 */
function expectedSourceFiles(extensionPath: string, workflow: BuiltinWorkflow): Set<string> {
  const result = new Set<string>();
  const workflowDir = path.join(extensionPath, 'templates', workflow.templatesDir);
  for (const kind of ['agents', 'skills'] as const) {
    const srcDir = path.join(workflowDir, kind);
    if (!fs.existsSync(srcDir)) { continue; }
    for (const file of fs.readdirSync(srcDir)) {
      if (!file.endsWith('.md')) { continue; }
      const id = file.slice(0, -3);
      result.add(`${kind}/aidlc-${id}.md`);
    }
  }
  return result;
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
