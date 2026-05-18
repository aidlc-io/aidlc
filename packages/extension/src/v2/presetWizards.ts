/**
 * `aidlc.savePreset` and `aidlc.applyPreset` wizards.
 *
 *   savePreset  — capture the current project's workspace.yaml + skill .md
 *                 into a globalStorage preset. Prompts for name/description.
 *
 *   applyPreset — pick from saved presets and scaffold the current project's
 *                 .aidlc/ from it. Confirms before overwriting any file
 *                 that already exists.
 *
 * Both commands target the *active* workspace folder. They warn (not pick a
 * folder) when nothing is open, matching the simplification we did for
 * Init / Show.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { readYaml, writeYaml, type YamlDocument } from './yamlIO';
import { PresetStore, type WorkspacePreset } from './presetStore';
import {
  isBuiltinPreset,
  getBuiltinWorkflow,
  builtinClaudeCommand,
  type BuiltinWorkflow,
} from './builtinPresets';
import {
  isWorkflowGloballyInstalled,
  installWorkflowGlobalsByIds,
} from './globalDefaultsInstaller';
import { resolveTechStackForRoot } from './techStackResolver';
import { detectTechStack } from './techStackDetector';

function getRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function requireRoot(action: string): string | undefined {
  const root = getRoot();
  if (!root) {
    void vscode.window.showWarningMessage(
      `AIDLC: Open a project first — ${action} targets the active workspace folder.`,
    );
    return undefined;
  }
  return root;
}

// ── savePreset ───────────────────────────────────────────────────────────

export async function savePresetCommand(store: PresetStore): Promise<void> {
  const root = requireRoot('Save Preset');
  if (!root) { return; }

  const doc = readYaml(root);
  if (!doc) {
    void vscode.window.showWarningMessage(
      'AIDLC: No .aidlc/workspace.yaml in this project — initialize one before saving as a preset.',
    );
    return;
  }
  if (doc.agents.length === 0 && doc.skills.length === 0 && doc.pipelines.length === 0) {
    const cont = await vscode.window.showWarningMessage(
      'Workspace is empty (0 agents, 0 skills, 0 pipelines). Save anyway?',
      { modal: false },
      'Save', 'Cancel',
    );
    if (cont !== 'Save') { return; }
  }

  const existing = store.list(root);
  const existingIds = new Set(existing.map((p) => p.id));

  const id = await vscode.window.showInputBox({
    prompt: 'Preset id',
    placeHolder: 'e.g. qa-automation (lowercase, dashes ok)',
    value: typeof doc.name === 'string'
      ? doc.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '')
      : '',
    ignoreFocusOut: true,
    validateInput: (v) => {
      const t = v.trim();
      if (!t) { return 'Required'; }
      if (!/^[a-z][a-z0-9-]*$/.test(t)) {
        return 'Lowercase letters / digits / dashes only — must start with a letter';
      }
      if (isBuiltinPreset(t)) {
        return `\`${t}\` is reserved for a built-in preset — pick a different id`;
      }
      return null;
    },
  });
  if (!id) { return; }

  if (existingIds.has(id)) {
    const overwrite = await vscode.window.showWarningMessage(
      `Preset \`${id}\` already exists. Overwrite?`,
      { modal: false },
      'Overwrite', 'Cancel',
    );
    if (overwrite !== 'Overwrite') { return; }
  }

  const name = await vscode.window.showInputBox({
    prompt: 'Display name',
    placeHolder: 'e.g. "QA Automation Pipeline"',
    value: typeof doc.name === 'string' ? doc.name : id,
    ignoreFocusOut: true,
  });
  if (!name || !name.trim()) { return; }

  const description = await vscode.window.showInputBox({
    prompt: 'One-line description (optional)',
    placeHolder: 'e.g. "Cypress → Playwright converter + doc writer"',
    ignoreFocusOut: true,
  });
  if (description === undefined) { return; }

  const preset = PresetStore.buildFromWorkspace(root, doc, {
    id: id.trim(),
    name: name.trim(),
    description: description.trim(),
  });
  store.save(root, preset);

  const skillCount = Object.keys(preset.skillContents).length;
  void vscode.window.showInformationMessage(
    `Saved preset \`${id}\` (${doc.agents.length} agents, ${skillCount} skills, ${doc.pipelines.length} pipelines).`,
  );
}

// ── applyPreset ──────────────────────────────────────────────────────────

/**
 * Apply a preset. When `presetId` is given (sidebar click), skip the quick-
 * pick and apply that one directly. Without it, the command shows the
 * picker (command-palette / Builder button entry points).
 *
 * Apply is now non-destructive — when workspace.yaml already exists the
 * preset's pipelines / agents / skills get merged in alongside whatever's
 * there. The legacy `skipConfirm` parameter is retained so existing
 * callers still compile but is no longer consulted (no prompt to skip).
 */
export async function applyPresetCommand(
  store: PresetStore,
  extensionPath: string,
  presetId?: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _skipConfirm = false,
): Promise<void> {
  const root = requireRoot('Apply Preset');
  if (!root) { return; }

  const presets = store.list(root);
  if (presets.length === 0) {
    const choice = await vscode.window.showInformationMessage(
      'No templates saved yet. Build a workspace first, then use "Save Template" to capture it.',
      'Init Sample Workspace',
    );
    if (choice === 'Init Sample Workspace') {
      void vscode.commands.executeCommand('aidlc.initWorkspace');
    }
    return;
  }

  let preset: WorkspacePreset | undefined;
  if (presetId) {
    preset = presets.find((p) => p.id === presetId);
    if (!preset) {
      void vscode.window.showWarningMessage(
        `AIDLC: template \`${presetId}\` not found. It may have been deleted.`,
      );
      return;
    }
  } else {
    const picked = await vscode.window.showQuickPick(
      presets.map((p) => ({
        label: p.builtin ? `$(verified) ${p.name}` : p.name,
        description: p.builtin ? `${p.id} · built-in` : `${p.id} · project`,
        detail: presetDetailLine(p),
        preset: p,
      })),
      { placeHolder: 'Pick a template to apply', ignoreFocusOut: true, matchOnDetail: true },
    );
    if (!picked) { return; }
    preset = picked.preset;
  }

  // Built-in presets reference agent + skill files in `~/.claude/` written
  // by `globalDefaultsInstaller`. Nothing is pre-installed at activation —
  // ask before dropping ~18 files into the user's global Claude folder so
  // they understand what's happening.
  const builtinWorkflow = getBuiltinWorkflow(preset.id);
  if (builtinWorkflow && !isWorkflowGloballyInstalled(extensionPath, builtinWorkflow.id)) {
    const choice = await vscode.window.showInformationMessage(
      `Template "${builtinWorkflow.name}" needs to install its agents + skills into ` +
        '~/.claude/agents and ~/.claude/skills so workspace.yaml can resolve them. ' +
        'Install now?',
      { modal: false },
      'Install', 'Cancel',
    );
    if (choice !== 'Install') {
      void vscode.window.showInformationMessage(
        'AIDLC: apply cancelled. Run "AIDLC: Install Workflow Globals" later to install on demand.',
      );
      return;
    }
    installWorkflowGlobalsByIds(
      extensionPath,
      [builtinWorkflow.id],
      undefined,
      resolveTechStackForRoot(root),
    );
  }

  const existing = readYaml(root);
  const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name ?? path.basename(root);

  // Apply path splits on whether workspace.yaml already exists:
  //  - No yaml yet → fresh write of the preset (skill files included).
  //  - Yaml exists → merge-append: keep every user-owned entry, add the
  //    preset's new agents / skills / pipelines / slash-commands. Removal
  //    is the X button on each workflow, not "Overwrite". This is the
  //    non-destructive default the user asked for.
  let result: { written: string[]; skipped: string[] };
  let mergeReport: MergeReport | undefined;
  if (!existing) {
    result = PresetStore.applyTo(root, preset, workspaceName, { overwrite: false });
  } else {
    mergeReport = mergePresetIntoYaml(root, existing, preset);
    result = { written: mergeReport.changed ? [path.join(root, '.aidlc', 'workspace.yaml')] : [], skipped: [] };
  }

  // Stamp the detected tech stack into workspace.yaml so subsequent
  // re-installs (and the user reading the file) know which profile shaped
  // the global skill files. Only writes when detection produced something
  // and the field isn't already set.
  ensureTechStackInYaml(root);

  // For built-in workflows, also drop `.claude/commands/<slug>-<phase>.md`
  // so the Claude Code slash commands work without an extra manual step.
  // Merge mode never overwrites existing command files — users can edit
  // their own commands and the apply won't clobber them.
  const builtin = getBuiltinWorkflow(preset.id);
  if (builtin) {
    const epicRoot = readEpicRootFrom(root);
    writeBuiltinClaudeCommands(root, builtin, preset, epicRoot, false);
  }

  if (mergeReport && !mergeReport.changed) {
    void vscode.window.showInformationMessage(
      `\`${preset.id}\` already in workspace.yaml — nothing to add.`,
    );
    return;
  }

  if (result.written.length === 0 && result.skipped.length > 0) {
    void vscode.window.showWarningMessage(
      `Nothing applied — ${result.skipped.length} file(s) already existed and overwrite was off.`,
    );
    return;
  }

  void vscode.window
    .showInformationMessage(
      `Applied preset \`${preset.id}\` (${result.written.length} files written).`,
      'Open Builder',
    )
    .then((choice) => {
      if (choice === 'Open Builder') {
        void vscode.commands.executeCommand('aidlc.openBuilder');
      }
    });
}

// ── deletePreset ─────────────────────────────────────────────────────────

export async function deletePresetCommand(store: PresetStore): Promise<void> {
  const root = requireRoot('Delete Template');
  if (!root) { return; }

  // Only user (project) templates are deletable. Built-ins ship with the
  // extension and stay read-only — re-installing brings them back.
  const userPresets = store.list(root).filter((p) => !p.builtin);
  if (userPresets.length === 0) {
    void vscode.window.showInformationMessage(
      'No project templates to delete (built-in templates are read-only).',
    );
    return;
  }
  const picked = await vscode.window.showQuickPick(
    userPresets.map((p) => ({
      label: p.name,
      description: p.id + ' · project',
      detail: presetDetailLine(p),
      preset: p,
    })),
    { placeHolder: 'Pick a project template to delete', ignoreFocusOut: true },
  );
  if (!picked) { return; }

  const confirm = await vscode.window.showWarningMessage(
    `Delete template \`${picked.preset.id}\` from this project? This cannot be undone.`,
    { modal: false },
    'Delete', 'Cancel',
  );
  if (confirm !== 'Delete') { return; }

  store.delete(root, picked.preset.id);
  void vscode.window.showInformationMessage(`Deleted template \`${picked.preset.id}\`.`);
}

/**
 * Webview-driven save: caller (the React SavePresetModal) supplies
 * id / name / description directly so we skip the chain of inputBoxes and
 * the overwrite warning. Validations the modal already enforces (id pattern,
 * builtin reservation) are re-checked here as a safety net.
 */
export async function savePresetInlineCommand(
  store: PresetStore,
  draft: { id: string; name: string; description: string },
): Promise<void> {
  const root = requireRoot('Save Preset');
  if (!root) { return; }
  const doc = readYaml(root);
  if (!doc) {
    void vscode.window.showWarningMessage(
      'AIDLC: No .aidlc/workspace.yaml in this project — initialize one before saving as a template.',
    );
    return;
  }

  const id = draft.id.trim();
  const name = draft.name.trim();
  const description = draft.description.trim();
  if (!id || !name) { return; }
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    void vscode.window.showWarningMessage(
      `Invalid template id "${id}" — lowercase letters / digits / dashes only.`,
    );
    return;
  }
  if (isBuiltinPreset(id)) {
    void vscode.window.showWarningMessage(
      `"${id}" is reserved for a built-in template — pick a different id.`,
    );
    return;
  }

  const preset = PresetStore.buildFromWorkspace(root, doc, { id, name, description });
  store.save(root, preset);

  const skillCount = Object.keys(preset.skillContents).length;
  void vscode.window.showInformationMessage(
    `Saved template "${id}" (${doc.agents.length} agents, ${skillCount} skills, ${doc.pipelines.length} pipelines).`,
  );
}

/**
 * Read the epic root from `workspace.yaml` if present; defaults to
 * `docs/epics` when no doc / no override is set.
 */
function readEpicRootFrom(root: string): string {
  const doc = readYaml(root);
  if (!doc) { return 'docs/epics'; }
  const state = doc.state as Record<string, unknown> | undefined;
  if (state && typeof state.root === 'string' && state.root.trim()) {
    return state.root;
  }
  return 'docs/epics';
}

/**
 * Write `.claude/commands/<slug>-<phase>.md` for each phase in a built-in
 * preset. Namespacing by workflow slug means multiple presets can coexist
 * in one project without overwriting each other's slash commands.
 * Idempotent — never overwrites an existing command file unless `overwrite`
 * is set, which is wired to the same Overwrite confirmation as workspace.yaml.
 */
function writeBuiltinClaudeCommands(
  root: string,
  workflow: BuiltinWorkflow,
  preset: WorkspacePreset,
  epicRoot: string,
  overwrite: boolean,
): void {
  const commandsDir = path.join(root, '.claude', 'commands');
  fs.mkdirSync(commandsDir, { recursive: true });
  for (const phase of workflow.phases) {
    const nsId = phase.id;
    const commandFile = path.join(commandsDir, `${nsId}.md`);
    if (fs.existsSync(commandFile) && !overwrite) { continue; }
    const skillBody = preset.skillContents[nsId] ?? `# ${phase.name}\n\n${phase.description}\n`;
    fs.writeFileSync(commandFile, builtinClaudeCommand(phase, skillBody, epicRoot), 'utf8');
  }
}

interface MergeReport {
  changed: boolean;
  addedAgents: string[];
  addedSkills: string[];
  addedPipelines: string[];
  addedSlashCommands: string[];
}

/**
 * Non-destructive merge of a preset into an existing `workspace.yaml`.
 *
 * Behavior:
 *  - Agents / skills / slash-commands are appended only when their id isn't
 *    already present — user edits to those entries are preserved verbatim.
 *  - The preset's pipeline is appended unchanged (full step config: name,
 *    skills, depends_on, produces, etc.) when its id isn't already in the
 *    workspace. Existing pipelines with the same id are left alone so the
 *    user's tweaks survive.
 *  - When nothing changed (preset already fully merged), `changed: false`
 *    — caller surfaces that to the user instead of "applied".
 */
function mergePresetIntoYaml(root: string, doc: YamlDocument, preset: WorkspacePreset): MergeReport {
  const report: MergeReport = {
    changed: false,
    addedAgents: [],
    addedSkills: [],
    addedPipelines: [],
    addedSlashCommands: [],
  };

  const existingAgentIds = new Set(doc.agents.map((a) => String(a.id)));
  const existingSkillIds = new Set(doc.skills.map((s) => String(s.id)));
  const existingPipelineIds = new Set(doc.pipelines.map((p) => String(p.id)));
  const existingCmdNames = new Set(doc.slash_commands.map((c) => String(c.name)));

  type YamlAgent = YamlDocument['agents'][number];
  type YamlSkill = YamlDocument['skills'][number];
  type YamlPipeline = YamlDocument['pipelines'][number];
  type YamlSlashCmd = YamlDocument['slash_commands'][number];

  for (const a of (preset.workspace.agents as Array<Record<string, unknown>>) ?? []) {
    const id = String(a.id);
    if (!existingAgentIds.has(id)) {
      doc.agents.push(a as unknown as YamlAgent);
      report.addedAgents.push(id);
    }
  }
  for (const s of (preset.workspace.skills as Array<Record<string, unknown>>) ?? []) {
    const id = String(s.id);
    if (!existingSkillIds.has(id)) {
      doc.skills.push(s as unknown as YamlSkill);
      report.addedSkills.push(id);
    }
  }
  for (const c of (preset.workspace.slash_commands as Array<Record<string, unknown>>) ?? []) {
    const name = String(c.name);
    if (!existingCmdNames.has(name)) {
      doc.slash_commands.push(c as unknown as YamlSlashCmd);
      report.addedSlashCommands.push(name);
    }
  }
  for (const p of (preset.workspace.pipelines as Array<Record<string, unknown>>) ?? []) {
    const id = String(p.id);
    if (!existingPipelineIds.has(id)) {
      doc.pipelines.push(p as unknown as YamlPipeline);
      report.addedPipelines.push(id);
    }
  }

  report.changed =
    report.addedAgents.length > 0 ||
    report.addedSkills.length > 0 ||
    report.addedPipelines.length > 0 ||
    report.addedSlashCommands.length > 0;

  if (report.changed) {
    writeYaml(root, doc);
  }
  return report;
}

/**
 * Append a `tech_stack: [...]` line to workspace.yaml when detection found
 * something and the file doesn't already declare one. Cheap line-append
 * (no YAML re-parse) so we don't fight whatever style the user prefers.
 */
function ensureTechStackInYaml(root: string): void {
  const yamlPath = path.join(root, 'workspace.yaml');
  if (!fs.existsSync(yamlPath)) { return; }
  let body: string;
  try { body = fs.readFileSync(yamlPath, 'utf8'); } catch { return; }
  if (/^[\t ]*tech_stack:/m.test(body)) { return; }
  const detected = detectTechStack(root);
  if (detected.length === 0) { return; }
  const trailing = body.endsWith('\n') ? '' : '\n';
  const comment =
    '# tech_stack drives template filtering for built-in workflows. Edit\n' +
    '# this list (web | mobile | desktop | backend | cli) and re-apply the\n' +
    '# preset to refresh ~/.claude/skills/aidlc-*.md with only the sections\n' +
    '# that match your project.\n';
  const line = `tech_stack: [${detected.join(', ')}]\n`;
  fs.writeFileSync(yamlPath, body + trailing + comment + line, 'utf8');
}

function presetDetailLine(p: WorkspacePreset): string {
  const agents = (p.workspace.agents as unknown[]) ?? [];
  const pipelines = (p.workspace.pipelines as unknown[]) ?? [];
  const counts = [
    `${agents.length} agents`,
    `${Object.keys(p.skillContents).length} skills`,
    `${pipelines.length} pipelines`,
  ].join(' · ');
  const desc = p.description ? ` — ${p.description}` : '';
  return `${counts}${desc}`;
}
