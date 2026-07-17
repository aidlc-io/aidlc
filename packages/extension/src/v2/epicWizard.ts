/**
 * Start Epic wizard — `aidlc.startEpic`.
 *
 * An "epic" is a *run instance* of a pipeline (or single agent) bound to
 * concrete project-specific values:
 *
 *   workspace.yaml (static)         epic state (per-run)
 *   ─────────────────────────       ───────────────────────────────
 *   agents declare capabilities  →  inputs supply concrete values
 *   pipelines declare step order →  state tracks current step / status
 *
 * Phase A (this file) only writes the state files — no auto-execution.
 * After the wizard, the user invokes the first slash command in their
 * Claude CLI to actually run the agent. Phase B will auto-trigger; Phase
 * C will wire status updates back into state.json.
 *
 * Layout written to disk (rooted at `state.root` from workspace.yaml,
 * default `docs/epics/`):
 *
 *   <root>/<EPIC-ID>/state.json    — pipeline + step status
 *   <root>/<EPIC-ID>/inputs.json   — capability → user-supplied value
 *   <root>/<EPIC-ID>/artifacts/    — empty; agents write outputs here later
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import {
  stepAgentId,
  startRun,
  RunStateStore,
  validateWorkspace,
  assemblePipeline,
  PipelineAssembleError,
  heuristicClassify,
  builtinProfiles,
  DEFAULT_PROFILE_ID,
  WORKSPACE_FILENAME,
  type TaskTypeVerdict,
  type RecipeConfig,
} from '@aidlc/core';
import type { PipelineConfig } from '@aidlc/core';

import { readYaml, writeYaml, existingIds, type YamlDocument } from './yamlIO';

// ── Types ───────────────────────────────────────────────────────────────

interface RunTarget {
  /**
   * `recipe` is resolved into a concrete `pipeline` (named after the epic)
   * during the wizard — see `materializeRecipe`. The runner never sees it.
   */
  kind: 'pipeline' | 'agent' | 'recipe';
  id: string;
  /** Ordered list of agent ids that will execute. Filled after assembly for recipes. */
  agents: string[];
  /** Set when kind === 'recipe': the recipe id to assemble from. */
  recipeId?: string;
}

interface EpicState {
  id: string;
  title: string;
  description: string;
  pipeline: string | null;
  agent: string | null;
  agents: string[];
  currentStep: number;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  createdAt: string;
  stepStates: Array<{
    agent: string;
    status: 'pending' | 'in_progress' | 'done' | 'failed';
    startedAt: string | null;
    finishedAt: string | null;
  }>;
}

// ── Capability prompts ──────────────────────────────────────────────────

interface CapabilityPrompt {
  prompt: string;
  placeholder: string;
  defaultValue?: string;
}

const CAPABILITY_PROMPTS: Record<string, CapabilityPrompt> = {
  'jira':          { prompt: 'Jira ticket key or URL',                    placeholder: 'PROJ-123 or https://acme.atlassian.net/browse/PROJ-123' },
  'figma':         { prompt: 'Figma file URL or file key',                placeholder: 'https://www.figma.com/file/abc123/...' },
  'core-business': { prompt: 'Path to core business docs (relative)',     placeholder: 'docs/core', defaultValue: 'docs/core' },
  'github':        { prompt: 'GitHub repo or PR URL',                     placeholder: 'owner/repo or https://github.com/owner/repo/pull/42' },
  'slack':         { prompt: 'Slack channel or thread URL',               placeholder: '#engineering or https://slack.com/...' },
  'files':         { prompt: 'Files glob (relative to project root)',     placeholder: 'src/**/*.ts' },
  'web':           { prompt: 'URLs to fetch (comma-separated, optional)', placeholder: 'https://example.com/...' },
};

// ── Main wizard ─────────────────────────────────────────────────────────

export async function startEpicCommand(): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    void vscode.window.showWarningMessage('AIDLC: Open a project first.');
    return;
  }

  const doc = readYaml(root);
  if (!doc) {
    const choice = await vscode.window.showWarningMessage(
      'AIDLC: No workspace.yaml in this project. Load a template first?',
      'Load Template', 'Init Sample',
    );
    if (choice === 'Load Template') {
      await vscode.commands.executeCommand('aidlc.applyPreset');
    } else if (choice === 'Init Sample') {
      await vscode.commands.executeCommand('aidlc.initWorkspace');
    }
    return;
  }

  if (doc.agents.length === 0) {
    void vscode.window.showWarningMessage(
      'AIDLC: No agents in workspace.yaml. Add an agent before starting an epic.',
    );
    return;
  }

  let target = await pickTarget(doc);
  if (!target) { return; }

  // Scaffold-tier SDLC standard pick (GH-69 P3): only when the workspace hasn't
  // chosen one yet, so it's asked once at scaffold time (like the recipe pick),
  // never nags on later epics. Whatever is chosen — including `none` on skip —
  // is persisted to workspace.yaml so the question isn't repeated.
  if (doc.standard === undefined) {
    const std = await pickScaffoldStandard();
    doc.standard = std; // chosen id, or 'none' when skipped/dismissed
    writeYaml(root, doc);
  }

  const epicRoot = readEpicRoot(doc);
  const epicId = await pickEpicId(root, epicRoot);
  if (!epicId) { return; }

  // Materialize a recipe target into a concrete pipeline named after the epic
  // (so the run + workspace.yaml stay traceable), then continue as a pipeline.
  if (target.kind === 'recipe' && target.recipeId) {
    const materialized = materializeRecipe(root, doc, target.recipeId, epicId);
    if (!materialized) { return; }
    target = materialized;
  }

  const title = await vscode.window.showInputBox({
    prompt: 'Epic title (optional)',
    placeHolder: 'e.g. "Add user profile page"',
    ignoreFocusOut: true,
  });
  if (title === undefined) { return; }

  const description = await vscode.window.showInputBox({
    prompt: 'Description (optional)',
    placeHolder: 'One-line summary of what this epic delivers',
    ignoreFocusOut: true,
  });
  if (description === undefined) { return; }

  const capabilities = collectCapabilities(doc, target);
  const inputs: Record<string, string> = {};
  for (const cap of capabilities) {
    const value = await promptCapability(cap);
    if (value === undefined) { return; }
    if (value !== '') { inputs[cap] = value; }
  }

  const epicDir = path.resolve(root, epicRoot, epicId);
  if (fs.existsSync(epicDir)) {
    const overwrite = await vscode.window.showWarningMessage(
      `${path.relative(root, epicDir)} already exists. Overwrite the state files?`,
      'Overwrite', 'Cancel',
    );
    if (overwrite !== 'Overwrite') { return; }
  }

  fs.mkdirSync(epicDir, { recursive: true });
  fs.mkdirSync(path.join(epicDir, 'artifacts'), { recursive: true });

  const state: EpicState = {
    id: epicId,
    title: title.trim(),
    description: description.trim(),
    pipeline: target.kind === 'pipeline' ? target.id : null,
    agent: target.kind === 'agent' ? target.id : null,
    agents: target.agents,
    currentStep: 0,
    status: 'pending',
    createdAt: new Date().toISOString(),
    stepStates: target.agents.map((a) => ({
      agent: a, status: 'pending', startedAt: null, finishedAt: null,
    })),
  };

  fs.writeFileSync(path.join(epicDir, 'state.json'), JSON.stringify(state, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(epicDir, 'inputs.json'), JSON.stringify(inputs, null, 2) + '\n', 'utf8');

  // When the epic is bound to a pipeline, also scaffold a RunState so the
  // Epics panel can render per-step action buttons (Mark step done / Run
  // auto-review / Approve / Reject / Rerun). Convention: runId === epicId.
  // Without this, RunStateStore.load returns null and the gate UI stays
  // hidden, leaving the epic stuck on read-only step circles.
  if (target.kind === 'pipeline') {
    const pipelineCfg = (doc.pipelines as PipelineConfig[] | undefined)?.find(
      (p) => p.id === target.id,
    );
    if (pipelineCfg && Array.isArray(pipelineCfg.steps) && pipelineCfg.steps.length > 0) {
      const existingRun = RunStateStore.load(root, epicId);
      if (!existingRun) {
        try {
          const runState = startRun({
            runId: epicId,
            pipeline: pipelineCfg,
            context: { epic: epicId, ...inputs },
          });
          RunStateStore.save(root, runState);
        } catch (err) {
          // Don't fail the whole wizard on run creation — surface a warning
          // and let the user click "Start pipeline run" from the sidebar
          // later.
          void vscode.window.showWarningMessage(
            `Epic created, but pipeline run could not be scaffolded: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }

  const firstAgent = target.agents[0];
  const slash = findSlashCommand(doc, firstAgent, target);
  const cmdHint = slash ? `\`${slash} ${epicId}\`` : `\`/${firstAgent} ${epicId}\` (or invoke agent manually)`;

  const choice = await vscode.window.showInformationMessage(
    `Started ${epicId}. Run ${cmdHint} in the Claude CLI to begin.`,
    'Open Claude CLI', 'Open state.json',
  );
  if (choice === 'Open Claude CLI') {
    await vscode.commands.executeCommand('aidlc.openClaudeTerminal');
  } else if (choice === 'Open state.json') {
    const docOpen = await vscode.workspace.openTextDocument(path.join(epicDir, 'state.json'));
    await vscode.window.showTextDocument(docOpen, { preview: false });
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Scaffold-tier SDLC-standard dropdown (GH-69 P3). Returns the chosen profile
 * id; a dismissed picker (Escape) resolves to the default (`none`) per the
 * agreed "Escape = none" behavior, so the caller persists a decision either way
 * and never re-asks. `hybrid` is pre-marked as recommended.
 */
async function pickScaffoldStandard(): Promise<string> {
  const items: Array<vscode.QuickPickItem & { id: string }> = builtinProfiles().map((p) => ({
    label: p.id === 'hybrid' ? `${p.name} $(star-full)` : p.name,
    description: p.id === 'hybrid' ? `${p.id} · recommended` : p.id,
    detail: p.description,
    id: p.id,
  }));
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Which SDLC standard for this workspace? (Esc = none — nothing enforced)',
    matchOnDescription: true,
    matchOnDetail: true,
    ignoreFocusOut: true,
  });
  return picked?.id ?? DEFAULT_PROFILE_ID;
}

async function pickTarget(doc: YamlDocument): Promise<RunTarget | undefined> {
  const items: Array<vscode.QuickPickItem & { target: RunTarget }> = [];

  // Recipes (if any) get a "suggest from description" entry at the very top —
  // the auto-generate path. Read leniently so a slightly-off workspace still
  // shows the manual pipeline/agent options below.
  const recipes = readRecipes(doc);
  if (recipes.length > 0) {
    items.push({
      label: '$(sparkle) Suggest pipeline from task description',
      description: `${recipes.length} recipes`,
      detail: 'Classify a brief → right-sized pipeline (auto-generated)',
      target: { kind: 'recipe', id: '', agents: [] },
    });
  }

  for (const p of doc.pipelines) {
    const id = String(p.id);
    const steps = Array.isArray(p.steps) ? (p.steps as unknown[]).map(stepAgentId) : [];
    items.push({
      label: `$(list-ordered) ${id}`,
      description: `${steps.length} agents`,
      detail: steps.join(' → '),
      target: { kind: 'pipeline', id, agents: steps },
    });
  }

  for (const a of doc.agents) {
    const id = String(a.id);
    const name = typeof a.name === 'string' ? a.name : id;
    items.push({
      label: `$(person) ${id}`,
      description: 'single agent',
      detail: name,
      target: { kind: 'agent', id, agents: [id] },
    });
  }

  if (items.length === 0) { return undefined; }

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Pick a pipeline or single agent to run',
    matchOnDetail: true,
    ignoreFocusOut: true,
  });
  if (!picked) { return undefined; }

  // The "suggest" entry opens the brief → classify → pick-recipe sub-flow.
  // It returns a `recipe` target; startEpicCommand materializes it into a
  // concrete pipeline once the epic id is known.
  if (picked.target.kind === 'recipe' && picked.target.id === '') {
    const recipeId = await pickRecipe(recipes);
    if (!recipeId) { return undefined; }
    return { kind: 'recipe', id: recipeId, recipeId, agents: [] };
  }

  return picked.target;
}

/**
 * Assemble `recipeId` into a concrete pipeline, append it to workspace.yaml
 * (named after the epic, deduped if needed), and return it as a pipeline
 * target. Returns undefined + surfaces an error on any failure.
 */
function materializeRecipe(
  root: string,
  doc: YamlDocument,
  recipeId: string,
  epicId: string,
): RunTarget | undefined {
  let config;
  try {
    config = validateWorkspace(doc, `.aidlc/${WORKSPACE_FILENAME}`);
  } catch (err) {
    void vscode.window.showErrorMessage(
      `AIDLC: workspace.yaml is invalid — cannot generate from recipe: ${err instanceof Error ? err.message : String(err)}`,
    );
    return undefined;
  }

  // Name the pipeline after the epic; fall back to `<epic>-<recipe>` if taken.
  const taken = existingIds(doc.pipelines);
  const pipelineId = taken.has(epicId) ? `${epicId}-${recipeId}` : epicId;
  if (taken.has(pipelineId)) {
    void vscode.window.showErrorMessage(
      `AIDLC: pipeline "${pipelineId}" already exists. Remove it or pick a different epic id.`,
    );
    return undefined;
  }

  let pipeline;
  try {
    pipeline = assemblePipeline(config, { recipeId, pipelineId });
  } catch (err) {
    if (err instanceof PipelineAssembleError) {
      void vscode.window.showErrorMessage(`AIDLC: ${err.message}`);
      return undefined;
    }
    throw err;
  }

  doc.pipelines.push(pipeline as unknown as Record<string, unknown>);
  try {
    validateWorkspace(doc, `.aidlc/${WORKSPACE_FILENAME}`);
  } catch (err) {
    void vscode.window.showErrorMessage(
      `AIDLC: generated pipeline failed validation — not written: ${err instanceof Error ? err.message : String(err)}`,
    );
    return undefined;
  }
  writeYaml(root, doc);

  const agents = pipeline.steps.map(stepAgentId);
  void vscode.window.showInformationMessage(
    `Generated pipeline \`${pipelineId}\` from recipe \`${recipeId}\`: ${agents.join(' → ')}`,
  );
  return { kind: 'pipeline', id: pipelineId, agents };
}

/** Parse `recipes:` leniently (no full schema validation) for the menu. */
function readRecipes(doc: YamlDocument): RecipeConfig[] {
  const raw = (doc as { recipes?: unknown }).recipes;
  if (!Array.isArray(raw)) { return []; }
  return raw.filter(
    (r): r is RecipeConfig =>
      !!r && typeof r === 'object' &&
      typeof (r as RecipeConfig).id === 'string' &&
      Array.isArray((r as RecipeConfig).steps),
  );
}

/**
 * Prompt for a task brief, run the heuristic classifier, and let the user
 * confirm the suggested recipe (floated to the top + starred) or pick another.
 * Returns the chosen recipe id, or undefined on cancel.
 */
async function pickRecipe(recipes: RecipeConfig[]): Promise<string | undefined> {
  const brief = await vscode.window.showInputBox({
    prompt: 'Describe the task (optional — used to suggest a recipe)',
    placeHolder: 'e.g. Fix crash when exporting billing report to CSV',
    ignoreFocusOut: true,
  });
  if (brief === undefined) { return undefined; }

  let verdict: TaskTypeVerdict | undefined;
  if (brief.trim()) {
    try { verdict = heuristicClassify(brief, recipes); } catch { /* ignore */ }
  }

  const items = recipes.map((r) => ({
    label: r.id,
    description: r.id === verdict?.recipeId
      ? `★ suggested · ${verdict.confidence}${r.description ? ` · ${r.description}` : ''}`
      : (r.description ?? ''),
    detail: r.steps.join(' → '),
  }));
  if (verdict) {
    const i = items.findIndex((it) => it.label === verdict!.recipeId);
    if (i > 0) { items.unshift(items.splice(i, 1)[0]); }
  }

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: verdict
      ? `Suggested: ${verdict.recipeId} (${verdict.reasoning}) — confirm or pick another`
      : 'Pick a task-type recipe',
    matchOnDetail: true,
    ignoreFocusOut: true,
  });
  return pick?.label;
}

function readEpicRoot(doc: YamlDocument): string {
  const state = doc.state as Record<string, unknown> | undefined;
  if (state && typeof state.root === 'string' && state.root.trim()) {
    return state.root;
  }
  return 'docs/epics';
}

/**
 * Suggest the next sequential epic id by scanning existing folders under
 * the epic root. Falls back to EPIC-001 when none exist.
 */
async function pickEpicId(workspaceRoot: string, epicRoot: string): Promise<string | undefined> {
  const dir = path.resolve(workspaceRoot, epicRoot);
  let next = 1;
  if (fs.existsSync(dir)) {
    const existing = fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const numbered = existing
      .map((n) => n.match(/^EPIC-(\d+)$/i))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => parseInt(m[1], 10));
    if (numbered.length > 0) { next = Math.max(...numbered) + 1; }
  }

  const suggested = `EPIC-${String(next).padStart(3, '0')}`;
  const id = await vscode.window.showInputBox({
    prompt: 'Epic id',
    placeHolder: 'e.g. EPIC-001 (uppercase + dashes + digits)',
    value: suggested,
    ignoreFocusOut: true,
    validateInput: (v) => {
      const t = v.trim();
      if (!t) { return 'Required'; }
      if (!/^[A-Z][A-Z0-9-]*$/.test(t)) {
        return 'Uppercase letters / digits / dashes only — must start with a letter';
      }
      return null;
    },
  });
  return id?.trim();
}

/**
 * Collect the de-duplicated set of capabilities across all agents we're
 * about to run, preserving first-seen order so the user is asked in a
 * predictable sequence.
 */
function collectCapabilities(doc: YamlDocument, target: RunTarget): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const agentId of target.agents) {
    const agent = doc.agents.find((a) => String(a.id) === agentId);
    if (!agent) { continue; }
    const caps = Array.isArray(agent.capabilities) ? (agent.capabilities as unknown[]) : [];
    for (const c of caps) {
      const id = String(c);
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

async function promptCapability(cap: string): Promise<string | undefined> {
  const meta = CAPABILITY_PROMPTS[cap];
  const prompt = meta?.prompt ?? `Value for capability \`${cap}\``;
  const placeholder = meta?.placeholder ?? 'Enter the value to bind, or leave blank to skip';
  const value = await vscode.window.showInputBox({
    title: `Capability: ${cap}`,
    prompt,
    placeHolder: placeholder,
    value: meta?.defaultValue ?? '',
    ignoreFocusOut: true,
  });
  return value?.trim();
}

/**
 * Find the slash command (if any) that invokes the given agent OR the
 * pipeline target — used to suggest the right command at the end of the
 * wizard so the user doesn't have to remember the syntax.
 */
function findSlashCommand(doc: YamlDocument, firstAgentId: string, target: RunTarget): string | null {
  for (const c of doc.slash_commands) {
    if (target.kind === 'pipeline' && (c as { pipeline?: unknown }).pipeline === target.id) {
      return String(c.name);
    }
    if (target.kind === 'agent' && (c as { agent?: unknown }).agent === target.id) {
      return String(c.name);
    }
  }
  // Fallback: a slash command that points at the first agent of the pipeline.
  for (const c of doc.slash_commands) {
    if ((c as { agent?: unknown }).agent === firstAgentId) { return String(c.name); }
  }
  return null;
}
