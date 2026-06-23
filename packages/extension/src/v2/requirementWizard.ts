/**
 * Analyze Requirements wizard — `aidlc.analyzeRequirements`.
 *
 * Two entry points share a common `scaffoldRequirementAnalysis` core:
 *   - `analyzeRequirementsCommand`  — VS Code QuickPick flow (command palette)
 *   - `scaffoldRequirementAnalysis` — called directly by sidebarWebview when
 *     the modal submits pre-collected inputs
 *
 * State layout written to disk:
 *   <project>/docs/task-breakdowns/
 *     REQ-001/
 *       inputs.json      — context for the Claude skill
 *       tasks.md         — written by Claude after the skill runs
 *       tasks.json       — machine-readable task list
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// ── Shared types ─────────────────────────────────────────────────────────────

export interface RequirementInputs {
  source: string;           // file path, URL, or "inline:<text>"
  platform: string;         // jira | github | linear | redmine | local
  parentTask: string;       // empty = list tasks first
  detailLevel: 'detailed' | 'brief';
  projectKey?: string;      // Jira project key (auto-derived if omitted)
  instruction?: string;     // custom guidance: sprint, naming rules, post-creation actions
  extraProjects?: Array<{ type: string; ref: string; label: string }>;
  businessContext?: string;  // inline text, URL, or file path
  itsContext?: string;       // URL/query to existing ITS issues
}

// ── Platform metadata ────────────────────────────────────────────────────────

interface PlatformMeta {
  label: string;
  icon: string;
  parentHint: string;
  parentPlaceholder: string;
  parentOptional?: boolean;
  projectKeyHint?: string;
  projectKeyPlaceholder?: string;
}

const PLATFORMS: Record<string, PlatformMeta> = {
  jira: {
    label: 'Jira',
    icon: '$(issue-opened)',
    parentHint: 'Jira epic key or URL (parent for all created issues)',
    parentPlaceholder: 'PROJ-100 or https://acme.atlassian.net/browse/PROJ-100',
    projectKeyHint: 'Jira project key (letters only)',
    projectKeyPlaceholder: 'PROJ',
  },
  github: {
    label: 'GitHub Issues',
    icon: '$(github)',
    parentHint: 'GitHub repo, optionally with milestone number',
    parentPlaceholder: 'owner/repo or owner/repo#42',
  },
  linear: {
    label: 'Linear',
    icon: '$(symbol-structure)',
    parentHint: 'Linear project or cycle name / URL',
    parentPlaceholder: 'my-project or https://linear.app/team/project/...',
  },
  redmine: {
    label: 'Redmine (CSV export)',
    icon: '$(export)',
    parentHint: 'Redmine parent issue number (optional)',
    parentPlaceholder: '42 — leave blank for root-level tasks',
    parentOptional: true,
  },
  local: {
    label: 'Local export only (Markdown + JSON)',
    icon: '$(file-text)',
    parentHint: 'Group label or milestone name for the breakdown file (optional)',
    parentPlaceholder: 'v2.0 or my-feature — leave blank to skip',
    parentOptional: true,
  },
};

const BREAKDOWN_ROOT = 'docs/task-breakdowns';

// ── Shared scaffold (called by both wizard and sidebar handler) ───────────────

/**
 * Writes the REQ-NNN state files and installs the skill.
 * Returns the generated run ID (e.g. "REQ-001"), or `null` on error.
 */
export async function scaffoldRequirementAnalysis(
  root: string,
  extensionPath: string,
  inputs: RequirementInputs,
): Promise<string | null> {
  if (!inputs.source.trim()) { return null; }

  // Derive Jira project key from parent if not provided
  let projectKey = inputs.projectKey;
  if (inputs.platform === 'jira' && !projectKey && inputs.parentTask) {
    const m = inputs.parentTask.trim().match(/^([A-Z][A-Z0-9_]+)-\d+/);
    if (m) { projectKey = m[1]; }
  }

  const runId = nextRunId(root);
  const breakdownDir = path.resolve(root, BREAKDOWN_ROOT, runId);

  try {
    fs.mkdirSync(breakdownDir, { recursive: true });

    const payload: Record<string, string> = {
      requirements_source: inputs.source,
      task_platform: inputs.platform,
      parent_task: inputs.parentTask,
      detail_level: inputs.detailLevel,
    };
    if (projectKey) { payload.project_key = projectKey; }
    if (inputs.instruction?.trim()) { payload.custom_instructions = inputs.instruction.trim(); }
    if (inputs.extraProjects && inputs.extraProjects.length > 0) {
      payload.extra_projects = JSON.stringify(inputs.extraProjects);
    }
    if (inputs.businessContext?.trim()) { payload.business_context = inputs.businessContext.trim(); }
    if (inputs.itsContext?.trim()) { payload.its_context = inputs.itsContext.trim(); }

    fs.writeFileSync(
      path.join(breakdownDir, 'inputs.json'),
      JSON.stringify(payload, null, 2) + '\n',
      'utf8',
    );
  } catch (err) {
    void vscode.window.showErrorMessage(
      `AIDLC: Could not write breakdown state — ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }

  ensureSkillInstalled(root, extensionPath);
  return runId;
}

// ── VS Code QuickPick wizard ─────────────────────────────────────────────────

export async function analyzeRequirementsCommand(extensionPath: string): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    void vscode.window.showWarningMessage('AIDLC: Open a project folder first.');
    return;
  }

  // ── 1. Requirements source ─────────────────────────────────────────────────

  interface SourceItem extends vscode.QuickPickItem { value: 'file' | 'url' | 'text'; }
  const sourcePick = await vscode.window.showQuickPick<SourceItem>([
    { label: '$(file) File',        description: 'Pick a file in this project',          value: 'file' },
    { label: '$(link) URL',         description: 'Fetch from a web URL',                 value: 'url'  },
    { label: '$(edit) Paste text',  description: 'Enter or paste requirements directly', value: 'text' },
  ], { placeHolder: 'Where are the requirements?', ignoreFocusOut: true });
  if (!sourcePick) { return; }

  let requirementsSource: string;

  if (sourcePick.value === 'file') {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
      filters: { 'Documents': ['md', 'txt', 'pdf', 'docx', 'rst', 'html'], 'All files': ['*'] },
      openLabel: 'Select requirements file',
    });
    if (!uris || uris.length === 0) { return; }
    requirementsSource = path.relative(root, uris[0].fsPath);
  } else if (sourcePick.value === 'url') {
    const url = await vscode.window.showInputBox({
      title: 'Requirements URL', prompt: 'Enter the URL containing the requirements',
      placeHolder: 'https://docs.example.com/requirements', ignoreFocusOut: true,
      validateInput: (v) => {
        if (!v.trim()) { return 'URL is required'; }
        try { new URL(v.trim()); return null; } catch { return 'Enter a valid URL'; }
      },
    });
    if (url === undefined) { return; }
    requirementsSource = url.trim();
  } else {
    const text = await vscode.window.showInputBox({
      title: 'Requirements text', prompt: 'Paste or type the key requirements',
      placeHolder: 'Users should be able to log in with email and password…',
      ignoreFocusOut: true,
      validateInput: (v) => (!v.trim() ? 'At least a brief description is required' : null),
    });
    if (text === undefined) { return; }
    requirementsSource = `inline:${text.trim()}`;
  }

  // ── 2. Target platform ─────────────────────────────────────────────────────

  interface PlatformItem extends vscode.QuickPickItem { value: string; }
  const platformPick = await vscode.window.showQuickPick<PlatformItem>(
    Object.entries(PLATFORMS).map(([value, m]) => ({ label: `${m.icon} ${m.label}`, value })),
    { placeHolder: 'Where should the tasks be created?', ignoreFocusOut: true },
  );
  if (!platformPick) { return; }

  const platform = platformPick.value;
  const platformMeta = PLATFORMS[platform];

  // ── 3. Parent epic / task reference ───────────────────────────────────────

  const parentTask = await vscode.window.showInputBox({
    title: `${platformMeta.label} — parent epic / task`,
    prompt: platformMeta.parentHint + ' (leave blank to list tasks first)',
    placeHolder: platformMeta.parentPlaceholder,
    ignoreFocusOut: true,
  });
  if (parentTask === undefined) { return; }

  // ── 4. Jira: derive / prompt project key ──────────────────────────────────

  let projectKey: string | undefined;
  if (platform === 'jira' && platformMeta.projectKeyHint) {
    const derived = parentTask.trim().match(/^([A-Z][A-Z0-9_]+)-\d+/)?.[1];
    if (!derived && parentTask.trim()) {
      const input = await vscode.window.showInputBox({
        title: 'Jira project key', prompt: platformMeta.projectKeyHint,
        placeHolder: platformMeta.projectKeyPlaceholder ?? 'PROJ', ignoreFocusOut: true,
        validateInput: (v) => {
          if (!v.trim()) { return 'Required'; }
          if (!/^[A-Z][A-Z0-9_]*$/.test(v.trim())) { return 'Uppercase letters and digits only'; }
          return null;
        },
      });
      if (input === undefined) { return; }
      projectKey = input.trim();
    } else {
      projectKey = derived;
    }
  }

  // ── 5. Detail level ────────────────────────────────────────────────────────

  interface DetailItem extends vscode.QuickPickItem { value: 'detailed' | 'brief'; }
  const detailPick = await vscode.window.showQuickPick<DetailItem>([
    { label: '$(list-unordered) Detailed', description: 'Acceptance criteria + story points', value: 'detailed' },
    { label: '$(dash) Brief',              description: 'Titles + one-line descriptions',     value: 'brief'    },
  ], { placeHolder: 'How detailed should the task breakdown be?', ignoreFocusOut: true });
  if (!detailPick) { return; }

  // ── 6. Confirm before scaffolding ─────────────────────────────────────────

  const sourceLabel = requirementsSource.startsWith('inline:')
    ? 'inline text'
    : requirementsSource;
  const parentLabel = parentTask.trim() || '(none — tasks will be listed first)';
  const confirmed = await vscode.window.showInformationMessage(
    `Analyze requirements?\n  Source: ${sourceLabel}\n  Platform: ${platformMeta.label}\n  Parent: ${parentLabel}`,
    { modal: true },
    'Analyze',
  );
  if (confirmed !== 'Analyze') { return; }

  // ── 7. Scaffold ────────────────────────────────────────────────────────────

  const runId = await scaffoldRequirementAnalysis(root, extensionPath, {
    source: requirementsSource,
    platform,
    parentTask: parentTask.trim(),
    detailLevel: detailPick.value,
    projectKey,
  });
  if (!runId) { return; }

  const slash = `/analyze-requirements ${runId}`;
  runSlashCommandInClaude(slash, root);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CLAUDE_TERMINAL_NAME = 'AIDLC · Claude';

function runSlashCommandInClaude(slash: string, root: string): void {
  const escaped = slash.replace(/'/g, "'\\''");
  const oneShot = `claude '${escaped}'`;

  const existing = vscode.window.terminals.find((t) => t.name === CLAUDE_TERMINAL_NAME);
  if (existing) {
    existing.show(false);
    existing.sendText(oneShot, true);
    return;
  }

  const cwd = fs.existsSync(root) ? root : undefined;
  const terminal = vscode.window.createTerminal({
    name: CLAUDE_TERMINAL_NAME,
    cwd,
    iconPath: new vscode.ThemeIcon('rocket'),
    location: vscode.TerminalLocation.Panel,
    env: { DISABLE_AUTO_UPDATE: 'true', DISABLE_UPDATE_PROMPT: 'true' },
  });
  terminal.show(false);
  let sent = false;
  const integ = vscode.window.onDidChangeTerminalShellIntegration((e) => {
    if (e.terminal === terminal && e.shellIntegration && !sent) {
      sent = true;
      e.shellIntegration.executeCommand(oneShot);
      integ.dispose();
    }
  });
  setTimeout(() => {
    if (!sent) { sent = true; terminal.sendText(oneShot, true); integ.dispose(); }
  }, 2000);
}

function nextRunId(root: string): string {
  const dir = path.resolve(root, BREAKDOWN_ROOT);
  let next = 1;
  if (fs.existsSync(dir)) {
    const numbers = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name.match(/^REQ-(\d+)$/i))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => parseInt(m[1], 10));
    if (numbers.length > 0) { next = Math.max(...numbers) + 1; }
  }
  return `REQ-${String(next).padStart(3, '0')}`;
}

function ensureSkillInstalled(root: string, extensionPath: string): void {
  const commandsDir = path.join(root, '.claude', 'commands');
  const dest = path.join(commandsDir, 'analyze-requirements.md');
  if (fs.existsSync(dest)) { return; }

  const src = path.join(extensionPath, 'templates', 'sdlc', 'skills', 'analyze-requirements.md');
  if (!fs.existsSync(src)) { return; }

  fs.mkdirSync(commandsDir, { recursive: true });
  fs.copyFileSync(src, dest);
}
