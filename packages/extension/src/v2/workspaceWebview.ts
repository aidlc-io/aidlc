/**
 * Unified Workspace webview — replaces the previous Builder + Epics panels
 * with a single React-rendered surface. The user navigates between Builder
 * and Epics views via the in-panel pill nav; the host treats both VS Code
 * commands (`aidlc.openBuilder`, `aidlc.openEpicsList`) as `show()` calls
 * with different `initialView` arguments.
 *
 * Visual rendering lives in `src/webview/workspace/main.tsx` (compiled to
 * `out/webviews/workspace.js` by vite). This file owns:
 *   - state aggregation (agents / skills / pipelines / epics)
 *   - message routing (mutation helpers + delegation to commands)
 *   - HTML shell that loads the React bundle with CSP nonce
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

import { readYaml, writeYaml, type YamlDocument } from './yamlIO';
import {
  WORKSPACE_DIR,
  WORKSPACE_FILENAME,
  stepAgentId,
  normalizeStep,
  discoverAssets,
  RunStateStore,
  startRun,
  targetPath,
} from '@aidlc/core';
import { SKILL_TEMPLATES } from './skillTemplates';
import {
  loadBuiltinPreset,
  getBuiltinPipelineSummary,
  getBuiltinArtifactTemplates,
  getBuiltinWorkflowByPipelineId,
  builtinClaudeCommand,
  writeBuiltinAutoReviewValidators,
  BUILTIN_WORKFLOWS,
} from './builtinPresets';
import { uninstallWorkflowGlobalsByIds } from './globalDefaultsInstaller';
import { PresetStore } from './presetStore';
import type {
  PipelineStepConfig,
  AssetScope,
  DiscoveredAsset,
  PipelineConfig,
  StepStatus,
  AutoReviewVerdict,
  StepHistoryEntry,
} from '@aidlc/core';
import { promptStepConfig, type PipelineStepConfigDraft } from './wizards';
import {
  listEpics,
  enrichEpicsWithUsage,
  mirrorRunStateToEpic,
  type EpicSummary as CoreEpicSummary,
} from './epicsList';
import { themeManager } from './themeManager';
import {
  rejectStepInlineCommand,
  rerunStepInlineCommand,
  requestStepUpdateInlineCommand,
  startPipelineRunInlineCommand,
} from './runCommands';
import { pickAndReadTextFile } from './pickAndReadTextFile';
import { missingBundleHtml } from './webviewBundleGuard';

// ── Webview-side type shapes (must mirror src/webview/lib/types.ts) ───────

type WorkspaceView = 'builder' | 'epics';

interface AgentSummary {
  id: string;
  scope: AssetScope;
  filePath: string;
  description?: string;
  skill?: string;
  skills?: string[];
  model?: string;
  integrations?: string[];
  /** Human label of the built-in preset that contributed this entry (e.g. "SDLC Pipeline"). Absent for user-created entries. */
  builtinFrom?: string;
}

interface SkillSummary {
  id: string;
  scope: AssetScope;
  filePath: string;
  description?: string;
  builtinFrom?: string;
}

interface PipelineStepSummary {
  agent: string;
  name?: string;
  skills?: string[];
  enabled: boolean;
  produces: string[];
  requires: string[];
  depends_on?: string[];
  human_review: boolean;
  auto_review: boolean;
  auto_review_runner?: string;
}

interface PipelineSummary {
  id: string;
  steps: PipelineStepSummary[];
  on_failure: 'stop' | 'continue';
  builtin?: boolean;
  name?: string;
}

interface AgentMeta {
  name: string;
  description: string;
  inputs: string;
  outputs: string;
  artifact: string;
  capabilities?: string[];
}

/**
 * Pending workspace.yaml addition computed from a file-based agent
 * (project / global scope) before the pipeline that references it is
 * written. `ensureWorkspaceAgentsForSteps` plans these, `applySyncedAgents`
 * commits them inside the same `mutateYaml` block as the pipeline push.
 */
interface SyncedAgentPlan {
  agent: {
    id: string;
    name: string;
    skills: string[];
    model?: string;
    description?: string;
    capabilities?: string[];
  };
  skill: { id: string; path: string };
}

interface EpicStepDetailFull {
  agent: string;
  /** Optional phase id (= slash command name) for built-in pipelines. */
  stepName?: string;
  /** Step's artifact filename (basename of `produces[0]`). Empty when the
   *  step's output is a non-file artifact (branch / tag). */
  artifact?: string;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  runStatus: StepStatus | null;
  isCurrentRunStep: boolean;
  rejectReason?: string;
  autoReviewVerdict?: AutoReviewVerdict;
  stepHasAutoReview: boolean;
  stepHasHumanReview: boolean;
  dependsOn?: string[];
  startedAt?: string;
  finishedAt?: string;
  history?: StepHistoryEntry[];
  rejectCount?: number;
  feedback?: string;
  /** Token usage attributed to this step (cost + token totals). */
  tokenUsage?: EpicStepTokenUsage;
}

interface EpicStepTokenUsage {
  cost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  calls: number;
  /** Per history-entry usage, parallel to StepHistory entries. */
  history?: Array<{ totalTokens: number; cost: number; calls: number }>;
}

interface EpicTokenUsage {
  total: { cost: number; totalTokens: number; calls: number };
  hasOverlap: boolean;
}

interface EpicSummaryUi {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  progress: number;
  statePath: string;
  stepDetails: EpicStepDetailFull[];
  currentStep: number;
  pipeline: string | null;
  agent: string | null;
  runId: string | null;
  inputs: Record<string, string>;
  epicDir: string;
  existingArtifacts: string[];
  createdAt: string;
  /** Aggregate token usage for the epic. */
  tokenUsage?: EpicTokenUsage;
}

interface SkillTemplateRef {
  id: string;
  description: string;
  /** Category used by the AddSkill modal to split the picker into tabs. */
  category: string;
}

interface WorkspaceState {
  hasFolder: boolean;
  workspaceName: string;
  configExists: boolean;
  agents: AgentSummary[];
  skills: SkillSummary[];
  pipelines: PipelineSummary[];
  epics: EpicSummaryUi[];
  agentMeta: Record<string, AgentMeta>;
  slashCommandsByAgent: Record<string, string>;
  agentsCount: number;
  skillsCount: number;
  pipelinesCount: number;
  epicsCount: number;
  /** All existing run ids (any status) — for inline Start-Run modal uniqueness check. */
  runIds: string[];
  /** Built-in skill templates surfaced for the inline AddSkill modal. */
  skillTemplates: SkillTemplateRef[];
  /** Suggested next sequential id for the inline Start-Epic modal. */
  nextEpicId: string;
  /** All existing epic ids (folders under epicRoot) — for uniqueness check. */
  existingEpicIds: string[];
  initialView?: WorkspaceView;
}

const SKILL_TEMPLATE_REFS: SkillTemplateRef[] = SKILL_TEMPLATES.map((t) => ({
  id: t.id,
  description: t.description,
  category: t.category,
}));

// ── State builders ────────────────────────────────────────────────────────

function buildState(initialView: WorkspaceView): WorkspaceState {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return {
      hasFolder: false,
      workspaceName: '',
      configExists: false,
      agents: [], skills: [], pipelines: [], epics: [],
      agentMeta: {}, slashCommandsByAgent: {},
      agentsCount: 0, skillsCount: 0, pipelinesCount: 0, epicsCount: 0,
      runIds: [],
      skillTemplates: SKILL_TEMPLATE_REFS,
      nextEpicId: 'EPIC-001',
      existingEpicIds: [],
      initialView,
    };
  }

  const root = folder.uri.fsPath;
  const doc = readYaml(root);
  const discovered = discoverAssets(root);

  // agent display metadata + slash commands — only AIDLC agents have these
  // since they're declared in workspace.yaml.
  const agentMeta: Record<string, AgentMeta> = {};
  const slashCommandsByAgent: Record<string, string> = {};
  if (doc) {
    for (const a of doc.agents) {
      const id = String(a.id);
      const capsRaw = Array.isArray(a.capabilities) ? (a.capabilities as unknown[]) : [];
      const capabilities = capsRaw.map(String).filter((c) => c);
      agentMeta[id] = {
        name: typeof a.name === 'string' ? a.name : id,
        description: typeof a.description === 'string' ? a.description : '',
        inputs: typeof a.inputs === 'string' ? a.inputs : '',
        outputs: typeof a.outputs === 'string' ? a.outputs : '',
        artifact: typeof a.artifact === 'string' ? a.artifact : '',
        capabilities: capabilities.length > 0 ? capabilities : undefined,
      };
    }
    for (const c of doc.slash_commands) {
      const agent = (c as { agent?: unknown }).agent;
      if (typeof c.name === 'string' && typeof agent === 'string' && !slashCommandsByAgent[agent]) {
        slashCommandsByAgent[agent] = c.name;
      }
    }
  }

  const epics = listEpics(root, doc).map((e) => toEpicSummaryUi(e));

  // No auto-injection: the Domain dropdown only shows pipelines that are
  // actually declared in workspace.yaml. Users add built-ins via the
  // sidebar's Workflows section ("Load Template"). Without this, deleting
  // a built-in pipeline would silently re-appear on the next refresh
  // because BUILTIN_WORKFLOWS would re-inject it.

  if (!doc) {
    const agents = mergeAgents(null, root, discovered.agents);
    const skills = mergeSkills(null, root, discovered.skills);
    const epicIds0 = listEpicIdsFromDir(root, 'docs/epics');
    return {
      hasFolder: true,
      workspaceName: folder.name,
      configExists: false,
      agents, skills,
      pipelines: [],
      epics,
      agentMeta, slashCommandsByAgent,
      agentsCount: agents.length,
      skillsCount: skills.length,
      pipelinesCount: 0,
      epicsCount: epics.length,
      runIds: listRunIds(root),
      skillTemplates: SKILL_TEMPLATE_REFS,
      nextEpicId: suggestNextEpicId(epicIds0),
      existingEpicIds: epicIds0,
      initialView,
    };
  }

  const agents = mergeAgents(doc, root, discovered.agents);
  const skills = mergeSkills(doc, root, discovered.skills);
  const pipelines: PipelineSummary[] = doc.pipelines.map((p) => ({
    id: String(p.id),
    on_failure: p.on_failure === 'continue' ? 'continue' : 'stop',
    builtin: BUILTIN_WORKFLOWS.some((w) => w.pipelineId === String(p.id)),
    steps: Array.isArray(p.steps)
      ? (p.steps as PipelineStepConfig[]).map((raw) => {
          const norm = normalizeStep(raw);
          return {
            agent: norm.agent,
            name: norm.name,
            skills: norm.skills,
            enabled: norm.enabled,
            produces: norm.produces,
            requires: norm.requires,
            depends_on: norm.depends_on,
            human_review: norm.human_review,
            auto_review: norm.auto_review,
            auto_review_runner: norm.auto_review_runner,
          };
        })
      : [],
  }));

  const epicRoot = readEpicRoot(doc);
  const epicIds = listEpicIdsFromDir(root, epicRoot);

  return {
    hasFolder: true,
    workspaceName: folder.name,
    configExists: true,
    agents, skills, pipelines, epics,
    agentMeta, slashCommandsByAgent,
    agentsCount: agents.length,
    skillsCount: skills.length,
    pipelinesCount: pipelines.length,
    epicsCount: epics.length,
    runIds: listRunIds(root),
    skillTemplates: SKILL_TEMPLATE_REFS,
    nextEpicId: suggestNextEpicId(epicIds),
    existingEpicIds: epicIds,
    initialView,
  };
}

function listRunIds(root: string): string[] {
  try {
    return RunStateStore.list(root).map((r) => r.runId);
  } catch {
    return [];
  }
}

function readEpicRoot(doc: { state?: unknown }): string {
  const state = doc.state as Record<string, unknown> | undefined;
  if (state && typeof state.root === 'string' && state.root.trim()) {
    return state.root;
  }
  return 'docs/epics';
}

function listEpicIdsFromDir(workspaceRoot: string, epicRoot: string): string[] {
  const dir = path.resolve(workspaceRoot, epicRoot);
  if (!fs.existsSync(dir)) { return []; }
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function suggestNextEpicId(existing: string[]): string {
  const numbered = existing
    .map((n) => n.match(/^EPIC-(\d+)$/i))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => parseInt(m[1], 10));
  const next = numbered.length > 0 ? Math.max(...numbered) + 1 : 1;
  return `EPIC-${String(next).padStart(3, '0')}`;
}

/**
 * Mutates `state.epics` to fill in `tokenUsage` (epic + per-step) using
 * `enrichEpicsWithUsage` against the current workspace's run states. Cheap
 * on cache hit; safe to fire on every refresh.
 */
async function mergeEpicTokenUsageInto(state: WorkspaceState): Promise<void> {
  if (!state.epics || state.epics.length === 0) return;
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return;
  const root = folder.uri.fsPath;
  let summaries: CoreEpicSummary[];
  try {
    summaries = listEpics(root, readYaml(root));
  } catch { return; }
  try {
    await enrichEpicsWithUsage(root, summaries);
  } catch { return; }
  const byId = new Map(summaries.map((s) => [s.id, s]));
  for (const epic of state.epics) {
    const e = byId.get(epic.id);
    if (!e) continue;
    if (e.tokenUsage) {
      epic.tokenUsage = { total: e.tokenUsage.total, hasOverlap: e.tokenUsage.hasOverlap };
    }
    for (let i = 0; i < epic.stepDetails.length && i < e.stepDetails.length; i++) {
      const su = e.stepDetails[i].tokenUsage;
      if (!su) continue;
      epic.stepDetails[i].tokenUsage = {
        cost: su.cost,
        totalTokens: su.totalTokens,
        inputTokens: su.inputTokens,
        outputTokens: su.outputTokens,
        cacheReadTokens: su.cacheReadTokens,
        cacheWriteTokens: su.cacheWriteTokens,
        calls: su.calls,
        history: su.history?.map((h) => ({
          totalTokens: h.totalTokens, cost: h.cost, calls: h.calls,
        })),
      };
    }
  }
}

function toEpicSummaryUi(e: CoreEpicSummary): EpicSummaryUi {
  const total = e.stepDetails.length || 1;
  const done = e.stepDetails.filter((s) => s.status === 'done').length;
  const progress = Math.round((done / total) * 100);
  const epicDir = e.epicDir;
  const artifactsDir = path.join(epicDir, 'artifacts');
  let existingArtifacts: string[] = [];
  if (fs.existsSync(artifactsDir)) {
    try {
      existingArtifacts = fs.readdirSync(artifactsDir).filter((n) => !n.startsWith('.'));
    } catch { /* ignore */ }
  }
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    status: e.status,
    progress,
    statePath: e.statePath,
    stepDetails: e.stepDetails.map((s) => ({
      agent: s.agent,
      stepName: s.name,
      artifact: s.artifact,
      status: s.status,
      runStatus: s.runStatus,
      isCurrentRunStep: s.isCurrentRunStep,
      rejectReason: s.rejectReason,
      autoReviewVerdict: s.autoReviewVerdict,
      stepHasAutoReview: s.stepHasAutoReview,
      stepHasHumanReview: s.stepHasHumanReview,
      dependsOn: s.dependsOn,
      startedAt: s.startedAt ?? undefined,
      finishedAt: s.finishedAt ?? undefined,
      history: s.history,
      rejectCount: s.rejectCount,
      feedback: s.feedback,
      tokenUsage: s.tokenUsage
        ? {
            cost: s.tokenUsage.cost,
            totalTokens: s.tokenUsage.totalTokens,
            inputTokens: s.tokenUsage.inputTokens,
            outputTokens: s.tokenUsage.outputTokens,
            cacheReadTokens: s.tokenUsage.cacheReadTokens,
            cacheWriteTokens: s.tokenUsage.cacheWriteTokens,
            calls: s.tokenUsage.calls,
            history: s.tokenUsage.history?.map((h) => ({
              totalTokens: h.totalTokens, cost: h.cost, calls: h.calls,
            })),
          }
        : undefined,
    })),
    currentStep: e.currentStep,
    pipeline: e.pipeline,
    agent: e.agent,
    runId: e.runId,
    inputs: e.inputs,
    epicDir,
    existingArtifacts,
    createdAt: e.createdAt,
    tokenUsage: e.tokenUsage
      ? { total: e.tokenUsage.total, hasOverlap: e.tokenUsage.hasOverlap }
      : undefined,
  };
}

function extractSkillIds(a: Record<string, unknown>): string[] {
  if (Array.isArray(a.skills)) {
    return (a.skills as unknown[]).map(String).filter(Boolean);
  }
  if (typeof a.skill === 'string' && a.skill.length > 0) { return [a.skill]; }
  return [];
}

/**
 * Cheap built-in-preset detector. Recognizes two markers we write at the
 * very top of generated content:
 *
 * 1. `<!-- Composed by AIDLC Flow built-in preset "<id>" — phase: <phase> -->`
 *    — written by `composeSkill()` into each `.aidlc/skills/<phase>.md`.
 * 2. `<!-- AIDLC extension built-in — workflow: <id>, kind: agent|skill, id: <id> -->`
 *    — written by `globalDefaultsInstaller` into `~/.claude/agents/`
 *    and `~/.claude/skills/`.
 *
 * Returns the workflow's human name ("SDLC Pipeline", "iOS Native Pipeline", …)
 * so the UI can render "from <name>" subtitles and BUILT-IN badges.
 */
function detectBuiltinSource(filePath: string): string | undefined {
  if (!filePath || !fs.existsSync(filePath)) { return undefined; }
  try {
    const head = fs.readFileSync(filePath, 'utf8').slice(0, 200);
    const composed = head.match(/<!-- Composed by AIDLC Flow built-in preset "([^"]+)"/);
    const installed = head.match(/<!-- AIDLC extension built-in — workflow:\s*([^,\s]+)/);
    const id = composed?.[1] ?? installed?.[1];
    if (!id) { return undefined; }
    const workflow = BUILTIN_WORKFLOWS.find((w) => w.id === id);
    return workflow?.name ?? id;
  } catch { return undefined; }
}

function mergeAgents(doc: YamlDocument | null, root: string, discovered: DiscoveredAsset[]): AgentSummary[] {
  const out: AgentSummary[] = [];

  // Workspace.yaml owns the persona ↔ skills binding for AIDLC personas, but
  // the same persona shows up in the Agents tab (and the AddPipeline picker)
  // as a project/global `.md` file. Build a lookup so file-based entries
  // inherit their `skills:` array — the picker hides the AIDLC scope, so
  // without this overlay the per-step skill picker would be empty.
  const yamlSkillsById = new Map<string, string[]>();
  if (doc) {
    for (const a of doc.agents) {
      const skills = extractSkillIds(a);
      if (skills.length > 0) { yamlSkillsById.set(String(a.id), skills); }
    }
  }

  for (const a of discovered.filter((x) => x.scope === 'project')) {
    const fm = parseAgentFrontmatter(a.filePath);
    const yamlSkills = yamlSkillsById.get(a.id);
    out.push({
      id: a.id,
      scope: 'project',
      filePath: a.filePath,
      description: fm.description,
      model: fm.model,
      integrations: fm.tools,
      skill: yamlSkills?.[0],
      skills: yamlSkills,
      builtinFrom: detectBuiltinSource(a.filePath),
    });
  }
  if (doc) {
    // Pre-index workspace.yaml skill declarations by id so we can resolve
    // each agent's primary-skill path (built-in presets now reference
    // `~/.claude/skills/aidlc-<workflow>-<phase>.md`, not `.aidlc/skills/`).
    const skillPathById = new Map<string, string>();
    for (const s of doc.skills) {
      const sid = String(s.id);
      const p = typeof s.path === 'string' ? s.path : '';
      if (!p) { continue; }
      const expanded = expandHomePath(p);
      skillPathById.set(sid, path.isAbsolute(expanded) ? expanded : path.resolve(root, expanded));
    }

    for (const a of doc.agents) {
      const id = String(a.id);
      const skills = extractSkillIds(a);
      // Agents inherit `builtinFrom` from their primary skill — read the marker
      // off whichever .md the skill declaration points at (legacy `.aidlc/skills/`
      // or new `~/.claude/skills/aidlc-*`).
      const primarySkillPath = skillPathById.get(skills[0] ?? id)
        ?? path.join(root, WORKSPACE_DIR, 'skills', `${skills[0] ?? id}.md`);
      out.push({
        id,
        scope: 'aidlc',
        filePath: '',
        description: typeof a.description === 'string' ? a.description : (typeof a.name === 'string' ? a.name : undefined),
        skill: skills[0],
        skills,
        model: typeof a.model === 'string' ? a.model : undefined,
        integrations: Array.isArray(a.capabilities)
          ? (a.capabilities as unknown[]).map(String)
          : undefined,
        builtinFrom: detectBuiltinSource(primarySkillPath),
      });
    }
  }
  for (const a of discovered.filter((x) => x.scope === 'global')) {
    const fm = parseAgentFrontmatter(a.filePath);
    const yamlSkills = yamlSkillsById.get(a.id);
    out.push({
      id: a.id,
      scope: 'global',
      filePath: a.filePath,
      description: fm.description,
      model: fm.model,
      integrations: fm.tools,
      skill: yamlSkills?.[0],
      skills: yamlSkills,
      builtinFrom: detectBuiltinSource(a.filePath),
    });
  }
  return out;
}

/**
 * Pull `description`, `model`, and `tools` out of a Claude-native agent
 * `.md` file's YAML frontmatter. Hand-rolled parser (no yaml dep needed
 * for the three fields we care about) — reads only the first 4 KB and
 * stops at the closing `---`.
 *
 * `tools` accepts either an inline array (`[files, jira]`) or a bullet
 * list under the key. Unknown fields are ignored.
 */
function parseAgentFrontmatter(filePath: string): {
  description?: string;
  model?: string;
  tools?: string[];
} {
  if (!filePath || !fs.existsSync(filePath)) { return {}; }
  let raw: string;
  try { raw = fs.readFileSync(filePath, 'utf8').slice(0, 4096); }
  catch { return {}; }
  // First line that isn't whitespace/marker should be `---`.
  const m = raw.match(/^(?:<!--[^\n]*-->\s*\n)?---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) { return {}; }
  const block = m[1];

  const out: { description?: string; model?: string; tools?: string[] } = {};
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fmKey = line.match(/^(\w+)\s*:\s*(.*)$/);
    if (!fmKey) { continue; }
    const key = fmKey[1].toLowerCase();
    const value = fmKey[2].trim();
    if (key === 'description') {
      out.description = stripFrontmatterQuotes(value);
    } else if (key === 'model') {
      out.model = stripFrontmatterQuotes(value);
    } else if (key === 'tools') {
      if (value.startsWith('[') && value.endsWith(']')) {
        out.tools = value.slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      } else if (!value) {
        // YAML list form: collect indented `- item` lines.
        const items: string[] = [];
        for (let j = i + 1; j < lines.length; j++) {
          const m2 = lines[j].match(/^\s*-\s+(.+)$/);
          if (!m2) { break; }
          items.push(m2[1].trim().replace(/^['"]|['"]$/g, ''));
        }
        if (items.length > 0) { out.tools = items; }
      }
    }
  }
  return out;
}

function stripFrontmatterQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Rewrite a Claude-native agent `.md` file's YAML frontmatter. Each key in
 * `updates` either overwrites the existing field, removes it (when value is
 * an explicit empty array for `tools`), or leaves it alone (`undefined`).
 *
 * The body — everything after the closing `---` — is preserved byte-for-byte.
 * If the file has no frontmatter, one is prepended.
 *
 * Used by `editAgentInline` so the modal save round-trips through the
 * same fields `parseAgentFrontmatter` reads back.
 */
function rewriteAgentFrontmatter(
  raw: string,
  updates: {
    name?: string;
    description?: string;
    model?: string;
    tools?: string[];
  },
): string {
  const m = raw.match(/^(?:<!--[^\n]*-->\s*\n)?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const existing: Record<string, string> = {};
  const existingTools: { value: string[] | null } = { value: null };
  let body = raw;
  if (m) {
    body = raw.slice(m[0].length);
    const lines = m[1].split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const kv = line.match(/^(\w+)\s*:\s*(.*)$/);
      if (!kv) { continue; }
      const key = kv[1];
      const value = kv[2].trim();
      if (key === 'tools') {
        if (value.startsWith('[') && value.endsWith(']')) {
          existingTools.value = value.slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
        } else if (!value) {
          const items: string[] = [];
          let j = i + 1;
          while (j < lines.length) {
            const item = lines[j].match(/^\s*-\s+(.+)$/);
            if (!item) { break; }
            items.push(item[1].trim().replace(/^['"]|['"]$/g, ''));
            j++;
          }
          if (items.length > 0) { existingTools.value = items; }
          i = j - 1;
        }
      } else {
        existing[key] = value;
      }
    }
  }

  const merged: Record<string, string> = { ...existing };
  if (updates.name !== undefined) { merged.name = updates.name; }
  if (updates.description !== undefined) { merged.description = updates.description; }
  if (updates.model !== undefined) { merged.model = updates.model; }
  const finalTools = updates.tools ?? existingTools.value ?? null;

  // Emit in a stable order: name, description, model, tools, then any
  // other keys we preserved (e.g. user-added frontmatter).
  const orderedKeys = ['name', 'description', 'model'];
  const lines: string[] = ['---'];
  for (const k of orderedKeys) {
    if (merged[k] !== undefined && merged[k] !== '') {
      lines.push(`${k}: ${merged[k]}`);
    }
  }
  for (const [k, v] of Object.entries(merged)) {
    if (orderedKeys.includes(k)) { continue; }
    if (v) { lines.push(`${k}: ${v}`); }
  }
  if (finalTools && finalTools.length > 0) {
    lines.push(`tools: [${finalTools.join(', ')}]`);
  }
  lines.push('---', '');
  const bodyTrimmed = body.replace(/^\r?\n+/, '');
  return `${lines.join('\n')}\n${bodyTrimmed}`;
}

function expandHomePath(p: string): string {
  if (p.startsWith('~/')) { return path.join(os.homedir(), p.slice(2)); }
  return p;
}

function mergeSkills(
  doc: YamlDocument | null,
  root: string,
  discovered: DiscoveredAsset[],
): SkillSummary[] {
  const out: SkillSummary[] = [];
  for (const s of discovered.filter((x) => x.scope === 'project')) {
    out.push({ id: s.id, scope: 'project', filePath: s.filePath, builtinFrom: detectBuiltinSource(s.filePath) });
  }
  if (doc) {
    for (const s of doc.skills) {
      const id = String(s.id);
      if (s.builtin) {
        out.push({ id, scope: 'aidlc', filePath: '', description: 'builtin' });
        continue;
      }
      const skillPath = typeof s.path === 'string' ? s.path : undefined;
      const expanded = skillPath ? expandHomePath(skillPath) : '';
      const abs = expanded
        ? (path.isAbsolute(expanded) ? expanded : path.resolve(root, expanded))
        : '';
      out.push({ id, scope: 'aidlc', filePath: abs, builtinFrom: detectBuiltinSource(abs) });
    }
  }
  for (const s of discovered.filter((x) => x.scope === 'global')) {
    out.push({ id: s.id, scope: 'global', filePath: s.filePath, builtinFrom: detectBuiltinSource(s.filePath) });
  }
  return out;
}

// ── Singleton panel ───────────────────────────────────────────────────────

export class WorkspaceWebview {
  static current: WorkspaceWebview | undefined;
  private disposables: vscode.Disposable[] = [];
  private currentView: WorkspaceView;

  static show(extensionUri: vscode.Uri, initialView: WorkspaceView = 'builder'): void {
    const column = vscode.ViewColumn.One;
    if (WorkspaceWebview.current) {
      WorkspaceWebview.current.panel.reveal(column);
      WorkspaceWebview.current.setView(initialView);
      WorkspaceWebview.current.refresh();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'aidlc.workspace',
      'AIDLC Workspace',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    );
    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icon.svg');
    WorkspaceWebview.current = new WorkspaceWebview(panel, extensionUri, initialView);
  }

  /**
   * Open the workspace panel on the Epics view and ask the React side to pop
   * the StartEpicModal. Used by the sidebar's "Start Epic" button so the user
   * gets the inline experience instead of a chain of VS Code dialogs.
   */
  static triggerStartEpic(extensionUri: vscode.Uri): void {
    WorkspaceWebview.show(extensionUri, 'epics');
    void WorkspaceWebview.current?.panel.webview.postMessage({ type: 'triggerStartEpic' });
  }

  /**
   * Open the Builder panel and select one of its internal tabs
   * (workflows / agents / skills / epics). Used by the sidebar stat tiles
   * so a count doubles as a deep link into the matching tab.
   */
  static openBuilderTab(extensionUri: vscode.Uri, tab: string): void {
    WorkspaceWebview.show(extensionUri, 'builder');
    void WorkspaceWebview.current?.panel.webview.postMessage({ type: 'setBuilderTab', tab });
  }

  /**
   * Re-build + push state to the open Builder panel, if any. Used by
   * install/uninstall workflow-globals commands so the Domain dropdown
   * reflects the new set of installed workflows without a manual reload.
   * No-op when the panel isn't open.
   */
  static refreshCurrent(): void {
    WorkspaceWebview.current?.refresh();
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    initialView: WorkspaceView,
  ) {
    this.currentView = initialView;
    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables,
    );
    this.disposables.push(themeManager.register(this.panel.webview));

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) {
      const refresh = () => this.refresh();

      const yamlPattern = new vscode.RelativePattern(
        vscode.Uri.file(path.join(root, WORKSPACE_DIR)),
        WORKSPACE_FILENAME,
      );
      const yamlWatcher = vscode.workspace.createFileSystemWatcher(yamlPattern);
      yamlWatcher.onDidChange(refresh, null, this.disposables);
      yamlWatcher.onDidCreate(refresh, null, this.disposables);
      yamlWatcher.onDidDelete(refresh, null, this.disposables);
      this.disposables.push(yamlWatcher);

      const statePattern = new vscode.RelativePattern(vscode.Uri.file(root), '**/state.json');
      const stateWatcher = vscode.workspace.createFileSystemWatcher(statePattern);
      stateWatcher.onDidChange(refresh, null, this.disposables);
      stateWatcher.onDidCreate(refresh, null, this.disposables);
      stateWatcher.onDidDelete(refresh, null, this.disposables);
      this.disposables.push(stateWatcher);

      const runsPattern = new vscode.RelativePattern(vscode.Uri.file(root), '.aidlc/runs/*.json');
      const runsWatcher = vscode.workspace.createFileSystemWatcher(runsPattern);
      runsWatcher.onDidChange(refresh, null, this.disposables);
      runsWatcher.onDidCreate(refresh, null, this.disposables);
      runsWatcher.onDidDelete(refresh, null, this.disposables);
      this.disposables.push(runsWatcher);

      // Artifacts dir under each epic — refresh when the agent writes a
      // produced file. Without this, "PRD.md · not produced yet" stays
      // stale until the user triggers another refresh manually.
      const artifactsPattern = new vscode.RelativePattern(
        vscode.Uri.file(root),
        '**/artifacts/**',
      );
      const artifactsWatcher = vscode.workspace.createFileSystemWatcher(artifactsPattern);
      artifactsWatcher.onDidChange(refresh, null, this.disposables);
      artifactsWatcher.onDidCreate(refresh, null, this.disposables);
      artifactsWatcher.onDidDelete(refresh, null, this.disposables);
      this.disposables.push(artifactsWatcher);
    }

    this.refresh();
  }

  refresh(): void {
    void this.refreshAsync();
  }

  private async refreshAsync(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) { this.ensureWorkflowTemplates(root); }
    const state = buildState(this.currentView);
    await mergeEpicTokenUsageInto(state);
    void this.panel.webview.postMessage({ type: 'state', state });
  }

  setView(view: WorkspaceView): void {
    this.currentView = view;
    void this.panel.webview.postMessage({ type: 'setView', view });
  }

  private dispose(): void {
    WorkspaceWebview.current = undefined;
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) { d.dispose(); }
    }
  }

  // ── Message routing ─────────────────────────────────────────────────────

  private async handleMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
    switch (msg.type) {
      case 'ready':
        this.refresh();
        return;

      case 'setTheme': {
        const mode = String(msg.mode ?? '');
        if (mode === 'auto' || mode === 'light' || mode === 'dark') {
          await themeManager.set(mode);
        }
        return;
      }

      case 'setView': {
        const v = msg.view;
        if (v === 'builder' || v === 'epics') { this.currentView = v; }
        return;
      }

      // Delegations
      case 'init': {
        const workflowId = typeof msg.workflowId === 'string' ? msg.workflowId : undefined;
        await vscode.commands.executeCommand('aidlc.initWorkspace', workflowId);
        return;
      }
      case 'applyPreset':  await vscode.commands.executeCommand('aidlc.applyPreset');   return;
      case 'initSdlcPreset':
        await vscode.commands.executeCommand('aidlc.applyPreset', 'sdlc-parallel-pipeline', true);
        return;
      case 'savePreset':   await vscode.commands.executeCommand('aidlc.savePreset');    return;
      case 'startEpic':    await vscode.commands.executeCommand('aidlc.startEpic');     return;
      case 'addAgent':     await vscode.commands.executeCommand('aidlc.addAgent');      return;
      case 'addSkill':     await vscode.commands.executeCommand('aidlc.addSkill');      return;
      case 'addPipeline':  await vscode.commands.executeCommand('aidlc.addPipeline');   return;
      case 'openClaude':   await vscode.commands.executeCommand('aidlc.openClaudeTerminal'); return;
      case 'openEpicsList':
        // Same-panel switch — don't re-execute the command (avoid recursion).
        this.setView('epics');
        return;
      case 'openBuilder':
        this.setView('builder');
        return;
      case 'openAddPipeline':
        // Switch to the Builder and pop its inline Add-pipeline modal. Used by
        // the Start-Epic modal's "Create new pipeline" button.
        this.setView('builder');
        void this.panel.webview.postMessage({ type: 'triggerAddPipeline' });
        return;
      case 'openProject': {
        const picked = await vscode.window.showOpenDialog({
          canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
          openLabel: 'Open project',
        });
        if (picked && picked.length > 0) {
          await vscode.commands.executeCommand(
            'vscode.openFolder', picked[0], { forceNewWindow: false },
          );
        }
        return;
      }
      case 'loadDemoProject':
        await vscode.commands.executeCommand('aidlc.loadDemoProject');
        return;
      case 'startPipelineRun':
        await vscode.commands.executeCommand('aidlc.startPipelineRun');
        return;

      // File-opening
      case 'openYaml': {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) { return; }
        const yp = path.join(root, WORKSPACE_DIR, WORKSPACE_FILENAME);
        if (!fs.existsSync(yp)) { return; }
        const doc = await vscode.workspace.openTextDocument(yp);
        await vscode.window.showTextDocument(doc, { preview: false });
        return;
      }
      case 'openSkill':
      case 'openAgent': {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const targetPathArg = String(msg.filePath ?? msg.path ?? '');
        if (!targetPathArg) { return; }
        const abs = path.isAbsolute(targetPathArg)
          ? targetPathArg
          : (root ? path.resolve(root, targetPathArg) : targetPathArg);
        if (!fs.existsSync(abs)) {
          void vscode.window.showWarningMessage(`File not found: ${targetPathArg}`);
          return;
        }
        const doc = await vscode.workspace.openTextDocument(abs);
        await vscode.window.showTextDocument(doc, { preview: false });
        return;
      }
      case 'openEpicState': {
        const statePath = String(msg.path ?? '');
        if (!statePath || !fs.existsSync(statePath)) { return; }
        const doc = await vscode.workspace.openTextDocument(statePath);
        await vscode.window.showTextDocument(doc, { preview: false });
        return;
      }
      case 'openInputsJson': {
        const epicDir = String(msg.epicDir ?? '');
        if (!epicDir) { return; }
        const p = path.join(epicDir, 'inputs.json');
        if (!fs.existsSync(p)) { return; }
        const doc = await vscode.workspace.openTextDocument(p);
        await vscode.window.showTextDocument(doc, { preview: false });
        return;
      }
      case 'revealArtifacts': {
        const epicDir = String(msg.epicDir ?? '');
        if (!epicDir) { return; }
        const artifactsDir = path.join(epicDir, 'artifacts');
        if (!fs.existsSync(artifactsDir)) { return; }
        await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(artifactsDir));
        return;
      }
      case 'openArtifactFile': {
        const epicDir = String(msg.epicDir ?? '');
        const filename = String(msg.filename ?? '');
        if (!epicDir || !filename) { return; }
        const filePath = path.join(epicDir, 'artifacts', filename);
        if (!fs.existsSync(filePath)) { return; }
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc, { preview: false });
        return;
      }
      case 'copyCommand': {
        const cmd = String(msg.command ?? '');
        if (!cmd) { return; }
        await vscode.env.clipboard.writeText(cmd);
        void vscode.window.setStatusBarMessage(`Copied ${cmd} to clipboard`, 2000);
        return;
      }

      // Pipeline-run state machine
      case 'markStepDone':
      case 'runAutoReview':
      case 'approveStep':
      case 'rejectStep':
      case 'rerunStep':
      case 'openRunState': {
        const runId = String(msg.runId ?? '');
        const cmd = `aidlc.${msg.type}`;
        const stepIdx = typeof msg.stepIdx === 'number' && Number.isInteger(msg.stepIdx)
          ? msg.stepIdx
          : undefined;
        await vscode.commands.executeCommand(cmd, runId || undefined, stepIdx);
        return;
      }
      case 'deleteRun': {
        const runId = String(msg.runId ?? '');
        // confirmed: webview already showed an inline ConfirmModal, skip the
        // VS Code warning dialog. Falsy for command-palette invocations.
        await vscode.commands.executeCommand(
          'aidlc.deleteRun',
          runId || undefined,
          msg.confirmed === true,
        );
        return;
      }
      case 'rejectStepInline': {
        const runId = String(msg.runId ?? '');
        const reason = String(msg.reason ?? '');
        const targetIdx = Number(msg.targetIdx);
        const stepIdx = typeof msg.stepIdx === 'number' && Number.isInteger(msg.stepIdx)
          ? msg.stepIdx
          : undefined;
        if (!runId || !Number.isInteger(targetIdx)) { return; }
        await rejectStepInlineCommand(runId, reason, targetIdx, stepIdx);
        return;
      }
      case 'startRunInline': {
        const pipelineId = String(msg.pipelineId ?? '');
        const runId = String(msg.runId ?? '');
        if (!pipelineId || !runId) { return; }
        await startPipelineRunInlineCommand(pipelineId, runId);
        return;
      }
      case 'addPipelineInline': {
        const draft = msg.draft;
        if (!draft || typeof draft !== 'object') { return; }
        await this.addPipelineInline(draft as Record<string, unknown>);
        return;
      }
      case 'editPipelineInline': {
        const id = String(msg.id ?? '');
        const draft = msg.draft;
        if (!id || !draft || typeof draft !== 'object') { return; }
        await this.editPipelineInline(id, draft as Record<string, unknown>);
        return;
      }
      case 'addSkillInline': {
        const draft = msg.draft;
        if (!draft || typeof draft !== 'object') { return; }
        await this.addSkillInline(draft as Record<string, unknown>);
        return;
      }
      case 'addAgentInline': {
        const draft = msg.draft;
        if (!draft || typeof draft !== 'object') { return; }
        await this.addAgentInline(draft as Record<string, unknown>);
        return;
      }
      case 'editAgentInline': {
        const draft = msg.draft;
        if (!draft || typeof draft !== 'object') { return; }
        await this.editAgentInline(draft as Record<string, unknown>);
        return;
      }
      case 'startEpicInline': {
        const draft = msg.draft;
        if (!draft || typeof draft !== 'object') { return; }
        await this.startEpicInline(draft as Record<string, unknown>);
        return;
      }
      case 'rerunStepInline': {
        const runId = String(msg.runId ?? '');
        const feedback = String(msg.feedback ?? '');
        const stepIdx = typeof msg.stepIdx === 'number' && Number.isInteger(msg.stepIdx)
          ? msg.stepIdx
          : undefined;
        if (!runId) { return; }
        await rerunStepInlineCommand(runId, feedback, stepIdx);
        return;
      }
      case 'runStepWithFeedback': {
        const slash = String(msg.slashCommand ?? '');
        const runId = String(msg.runId ?? '');
        const feedback = String(msg.feedback ?? '');
        if (!slash || !runId) { return; }
        await vscode.commands.executeCommand(
          'aidlc.runStepWithFeedback',
          slash,
          runId,
          feedback,
        );
        return;
      }
      case 'requestStepUpdate': {
        const runId = String(msg.runId ?? '');
        const stepIdx = Number(msg.stepIdx);
        const feedback = String(msg.feedback ?? '');
        if (!runId || !Number.isInteger(stepIdx)) { return; }
        await requestStepUpdateInlineCommand(runId, stepIdx, feedback);
        return;
      }
      case 'savePresetInline': {
        const draft = msg.draft;
        if (!draft || typeof draft !== 'object') { return; }
        await vscode.commands.executeCommand('aidlc.savePresetInline', draft);
        return;
      }
      case 'pickAndReadFile': {
        const requestId = String(msg.requestId ?? '');
        if (!requestId) { return; }
        const reply = await pickAndReadTextFile(requestId);
        void this.panel.webview.postMessage({ type: 'pickAndReadFile:reply', ...reply });
        return;
      }
      case 'startPipelineRunForEpic': {
        const epicId = String(msg.epicId ?? '').trim();
        const pipelineId = String(msg.pipelineId ?? '').trim();
        if (!epicId || !pipelineId) { return; }
        await this.startPipelineRunForEpic(epicId, pipelineId);
        return;
      }

      // Pipeline / asset mutations
      case 'reorderStep':
        await this.reorderStep(
          String(msg.pipelineId ?? ''),
          Number(msg.fromIdx ?? -1),
          Number(msg.toIdx ?? -1),
        );
        return;
      case 'addStepToPipeline': {
        const pipelineId = String(msg.pipelineId ?? '');
        const agentId = typeof msg.agentId === 'string' ? msg.agentId : undefined;
        const stepName = typeof msg.stepName === 'string' ? msg.stepName : undefined;
        await this.addStepToPipeline(pipelineId, agentId, stepName);
        return;
      }
      case 'addParallelStep': {
        const pipelineId = String(msg.pipelineId ?? '');
        const agentId = typeof msg.agentId === 'string' ? msg.agentId : undefined;
        const stepName = typeof msg.stepName === 'string' ? msg.stepName : undefined;
        const parallelToAgent =
          typeof msg.parallelToAgent === 'string' ? msg.parallelToAgent : '';
        if (!pipelineId || !agentId || !parallelToAgent) { return; }
        await this.addParallelStep(pipelineId, parallelToAgent, agentId, stepName);
        return;
      }
      case 'deleteStep':
        await this.deleteStep(String(msg.pipelineId ?? ''), Number(msg.idx ?? -1));
        return;
      case 'editStepConfig': {
        const inlineConfig =
          msg.config && typeof msg.config === 'object'
            ? (msg.config as Record<string, unknown>)
            : undefined;
        await this.editStepConfig(
          String(msg.pipelineId ?? ''),
          Number(msg.idx ?? -1),
          inlineConfig,
        );
        return;
      }
      case 'deleteAgent':
        await this.deleteItem('agents', String(msg.id ?? ''), msg.confirmed === true);
        return;
      case 'deleteSkill':
        await this.deleteItem('skills', String(msg.id ?? ''), msg.confirmed === true);
        return;
      case 'deletePipeline':
        await this.deletePipeline(String(msg.id ?? ''), msg.confirmed === true);
        return;
      case 'renameAgent':
        await this.renameItem(
          'agents',
          String(msg.id ?? ''),
          typeof msg.newId === 'string' ? msg.newId : undefined,
        );
        return;
      case 'renameSkill':
        await this.renameItem(
          'skills',
          String(msg.id ?? ''),
          typeof msg.newId === 'string' ? msg.newId : undefined,
        );
        return;
      case 'renamePipeline':
        await this.renameItem(
          'pipelines',
          String(msg.id ?? ''),
          typeof msg.newId === 'string' ? msg.newId : undefined,
        );
        return;
      case 'duplicateAgent': await this.duplicateItem('agents', String(msg.id ?? '')); return;
      case 'duplicateSkill': await this.duplicateItem('skills', String(msg.id ?? '')); return;
      case 'duplicatePipeline': await this.duplicateItem('pipelines', String(msg.id ?? '')); return;
      case 'togglePipelineFailure':
        await this.togglePipelineFailure(String(msg.pipelineId ?? ''));
        return;
      case 'runPipeline':
        await vscode.commands.executeCommand(
          'aidlc.startPipelineRun',
          String(msg.pipelineId ?? ''),
        );
        return;
      case 'agentMenu': {
        // Simple action picker — replaces the kebab menu in the React card.
        const id = String(msg.id ?? '');
        const filePath = String(msg.filePath ?? '');
        if (!id) { return; }
        const pick = await vscode.window.showQuickPick(
          [
            { label: 'Open file', value: 'open', detail: filePath },
            { label: 'Rename', value: 'rename' },
            { label: 'Duplicate', value: 'duplicate' },
            { label: 'Delete', value: 'delete' },
          ],
          { placeHolder: `Agent ${id}` },
        );
        if (!pick) { return; }
        if (pick.value === 'open' && filePath) {
          const doc = await vscode.workspace.openTextDocument(filePath);
          await vscode.window.showTextDocument(doc, { preview: false });
        } else if (pick.value === 'rename') {
          await this.renameItem('agents', id);
        } else if (pick.value === 'duplicate') {
          await this.duplicateItem('agents', id);
        } else if (pick.value === 'delete') {
          await this.deleteItem('agents', id);
        }
        return;
      }
    }
  }

  // ── Mutation helpers ────────────────────────────────────────────────────

  private getRootOrWarn(): string | undefined {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) { void vscode.window.showWarningMessage('AIDLC: no folder open.'); }
    return root;
  }

  private mutateYaml(fn: (doc: YamlDocument) => boolean | void): void {
    const root = this.getRootOrWarn();
    if (!root) { return; }
    const doc = readYaml(root);
    if (!doc) {
      void vscode.window.showWarningMessage('AIDLC: no workspace.yaml — initialize first.');
      return;
    }
    const dirty = fn(doc);
    if (dirty !== false) {
      writeYaml(root, doc);
      this.refresh();
    }
  }

  private async reorderStep(pipelineId: string, fromIdx: number, toIdx: number): Promise<void> {
    if (!pipelineId || fromIdx < 0 || toIdx < 0) { return; }
    this.mutateYaml((doc) => {
      const p = doc.pipelines.find((x) => x.id === pipelineId);
      if (!p || !Array.isArray(p.steps)) { return false; }
      const steps = p.steps as PipelineStepConfig[];
      if (fromIdx >= steps.length || toIdx >= steps.length) { return false; }
      const [moved] = steps.splice(fromIdx, 1);
      steps.splice(toIdx, 0, moved);
    });
  }

  private async deleteStep(pipelineId: string, idx: number): Promise<void> {
    if (!pipelineId || idx < 0) { return; }
    this.mutateYaml((doc) => {
      const p = doc.pipelines.find((x) => x.id === pipelineId);
      if (!p || !Array.isArray(p.steps)) { return false; }
      const steps = p.steps as PipelineStepConfig[];
      if (idx >= steps.length) { return false; }

      // Capture the deleted step's agent + its own deps before splicing so
      // we can rewire any child step's `depends_on`. The goal: preserve the
      // visual DAG layout — children of the removed step should stay at the
      // same column they were in before deletion. Achieve that by picking a
      // "sibling" of the deleted step (a step with the *same* dependency
      // set), so the child ends up at the same level. Fall back to the
      // deleted step's own deps when no sibling exists.
      const removed = steps[idx];
      const stepAgent = (s: PipelineStepConfig): string =>
        typeof s === 'string'
          ? s
          : typeof (s as { agent?: unknown }).agent === 'string'
            ? (s as { agent: string }).agent
            : '';
      const stepDeps = (s: PipelineStepConfig): string[] => {
        if (typeof s === 'string') { return []; }
        const d = (s as { depends_on?: unknown }).depends_on;
        return Array.isArray(d) ? d.map(String) : [];
      };
      const removedAgent = stepAgent(removed);
      const removedDeps = stepDeps(removed);

      steps.splice(idx, 1);
      if (!removedAgent) { return; }

      const setsEqual = (a: string[], b: string[]): boolean => {
        if (a.length !== b.length) { return false; }
        const sa = new Set(a);
        for (const x of b) { if (!sa.has(x)) { return false; } }
        return true;
      };
      const siblings = steps
        .filter((s) => setsEqual(stepDeps(s), removedDeps))
        .map(stepAgent)
        .filter((a) => a && a !== removedAgent);
      const replacement = siblings.length > 0 ? siblings.slice(0, 1) : removedDeps;

      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        if (typeof s === 'string') { continue; }
        const obj = s as { depends_on?: unknown };
        const deps = Array.isArray(obj.depends_on) ? obj.depends_on.map(String) : [];
        if (!deps.includes(removedAgent)) { continue; }
        const rewired = Array.from(new Set(
          deps.flatMap((d) => (d === removedAgent ? replacement : [d])),
        ));
        if (rewired.length > 0) {
          obj.depends_on = rewired;
        } else {
          delete obj.depends_on;
        }
      }
    });
  }

  private async editStepConfig(
    pipelineId: string,
    idx: number,
    /** Webview already collected the new config via inline StepConfigModal —
     * apply it directly and skip promptStepConfig's QuickPick chain. */
    inlineConfig?: Record<string, unknown>,
  ): Promise<void> {
    if (!pipelineId || idx < 0) { return; }
    const root = this.getRootOrWarn();
    if (!root) { return; }
    const doc = readYaml(root);
    if (!doc) { return; }
    const pipeline = doc.pipelines.find((x) => x.id === pipelineId);
    if (!pipeline || !Array.isArray(pipeline.steps) || idx >= pipeline.steps.length) {
      void vscode.window.showWarningMessage(`Step #${idx + 1} not found in \`${pipelineId}\`.`);
      return;
    }
    const raw = pipeline.steps[idx] as PipelineStepConfig;
    const norm = normalizeStep(raw);
    let draft: PipelineStepConfigDraft;
    // `inlineSkills` is `undefined` when the QuickPick path runs (it doesn't
    // touch skills), and the existing step.skills get preserved via prevObj.
    // An empty array from the inline path means "clear all skills".
    let inlineSkills: string[] | undefined;
    // `depends_on` edited via the modal's "Runs after" picker. Undefined on the
    // QuickPick path → preserve the existing edges; an array (incl. empty)
    // replaces them, letting the user reposition or root a node.
    let inlineDeps: string[] | undefined;
    if (inlineConfig) {
      const requires = Array.isArray(inlineConfig.requires)
        ? (inlineConfig.requires as unknown[]).map(String)
        : [];
      const produces = Array.isArray(inlineConfig.produces)
        ? (inlineConfig.produces as unknown[]).map(String)
        : [];
      if (Array.isArray(inlineConfig.skills)) {
        inlineSkills = (inlineConfig.skills as unknown[]).map(String).filter((s) => s.length > 0);
      }
      if (Array.isArray(inlineConfig.depends_on)) {
        inlineDeps = (inlineConfig.depends_on as unknown[]).map(String).filter((s) => s.length > 0);
      }
      const runnerRaw = inlineConfig.auto_review_runner;
      draft = {
        agent: norm.agent,
        enabled: inlineConfig.enabled === true,
        requires,
        produces,
        human_review: inlineConfig.human_review === true,
        auto_review: inlineConfig.auto_review === true,
        auto_review_runner:
          inlineConfig.auto_review === true && typeof runnerRaw === 'string' && runnerRaw.trim()
            ? runnerRaw.trim()
            : undefined,
      };
    } else {
      const result = await promptStepConfig(norm.agent, {
        enabled: norm.enabled,
        requires: norm.requires,
        produces: norm.produces,
        human_review: norm.human_review,
        auto_review: norm.auto_review,
        auto_review_runner: norm.auto_review_runner,
      });
      if (!result) { return; }
      draft = result;
    }
    this.mutateYaml((d) => {
      const p = d.pipelines.find((x) => x.id === pipelineId);
      if (!p || !Array.isArray(p.steps) || idx >= p.steps.length) { return false; }
      // Preserve `depends_on` (and any other untouched fields like
      // `name`) on the existing step — the config modal manages gate
      // flags + artifact paths only. Rebuilding the step object from
      // scratch wipes DAG edges and collapses the visual layout.
      const prev = p.steps[idx];
      const prevObj: Record<string, unknown> =
        typeof prev === 'object' && prev !== null ? { ...(prev as Record<string, unknown>) } : {};
      const obj: Record<string, unknown> = {
        ...prevObj,
        agent: draft.agent,
        enabled: draft.enabled,
        requires: draft.requires,
        produces: draft.produces,
        human_review: draft.human_review,
        auto_review: draft.auto_review,
      };
      if (draft.auto_review && draft.auto_review_runner) {
        obj.auto_review_runner = draft.auto_review_runner;
      } else {
        delete obj.auto_review_runner;
      }
      // `inlineSkills` is set only on the inline edit path — preserve
      // `step.skills` from `prevObj` when QuickPick (no skills field) was used.
      if (inlineSkills !== undefined) {
        if (inlineSkills.length > 0) {
          obj.skills = inlineSkills;
          delete obj.skill;
        } else {
          delete obj.skills;
          delete obj.skill;
        }
      }
      // Same for `depends_on` — the inline modal sends the full edge set;
      // an empty array roots the step (drops it to the first column).
      if (inlineDeps !== undefined) {
        if (inlineDeps.length > 0) {
          obj.depends_on = inlineDeps;
        } else {
          delete obj.depends_on;
        }
      }
      p.steps[idx] = obj as unknown as PipelineStepConfig;
    });
  }

  /**
   * Apply the AddSkillModal draft: write the .md file at the scope-target
   * path and (for aidlc) register it in workspace.yaml. No overwrite — if
   * the file already exists we surface a warning and abort. Webview's
   * `takenIds` should prevent collisions in normal use.
   */
  private async addSkillInline(draft: Record<string, unknown>): Promise<void> {
    const root = this.getRootOrWarn();
    if (!root) { return; }
    const doc = readYaml(root);
    if (!doc) {
      void vscode.window.showWarningMessage('AIDLC: no workspace.yaml — initialize first.');
      return;
    }

    const scope = draft.scope as AssetScope;
    const id = String(draft.id ?? '').trim();
    const sourceRaw = draft.source as Record<string, unknown> | undefined;
    if (!id || !sourceRaw) { return; }
    if (scope !== 'project' && scope !== 'aidlc' && scope !== 'global') { return; }

    let content = '';
    let openInEditor = false;
    const kind = String(sourceRaw.kind ?? '');
    if (kind === 'template') {
      const tplId = String(sourceRaw.templateId ?? '');
      const tpl = SKILL_TEMPLATES.find((t) => t.id === tplId);
      if (!tpl) {
        void vscode.window.showWarningMessage(`Skill template "${tplId}" not found.`);
        return;
      }
      content = tpl.content;
    } else if (kind === 'paste') {
      content = String(sourceRaw.content ?? '');
      if (!content.trim()) { return; }
    } else if (kind === 'blank') {
      content = `# ${id}\n\n<!-- Write the system prompt for this skill here. -->\n`;
      openInEditor = true;
    } else {
      return;
    }

    const skillPath = targetPath(root, scope, 'skill', id);
    if (fs.existsSync(skillPath)) {
      void vscode.window.showWarningMessage(
        `Skill file already exists at ${path.relative(root, skillPath) || skillPath}. Delete it first.`,
      );
      return;
    }
    fs.mkdirSync(path.dirname(skillPath), { recursive: true });
    fs.writeFileSync(skillPath, content, 'utf8');

    if (scope === 'aidlc') {
      this.mutateYaml((d) => {
        d.skills.push({ id, path: `./.aidlc/skills/${id}.md` });
      });
    }

    if (openInEditor || kind === 'template') {
      const docOpen = await vscode.workspace.openTextDocument(skillPath);
      await vscode.window.showTextDocument(docOpen, { preview: false });
    }

    const yamlNote = scope === 'aidlc' ? ' + workspace.yaml' : '';
    void vscode.window.showInformationMessage(
      `Skill "${id}" added (${scope})${yamlNote}.`,
    );
  }

  /**
   * Apply the AddAgentModal draft. AIDLC scope appends to workspace.yaml
   * `agents:`. Project / global scopes write a Claude Code-native .md file
   * with frontmatter + the picked skills inlined as a starter prompt.
   */
  private async addAgentInline(draft: Record<string, unknown>): Promise<void> {
    const root = this.getRootOrWarn();
    if (!root) { return; }
    const doc = readYaml(root);
    if (!doc) {
      void vscode.window.showWarningMessage('AIDLC: no workspace.yaml — initialize first.');
      return;
    }

    const scope = draft.scope as AssetScope;
    const id = String(draft.id ?? '').trim();
    const name = String(draft.name ?? '').trim();
    const skillsRaw = Array.isArray(draft.skills) ? (draft.skills as unknown[]) : [];
    const skills = skillsRaw.map(String).filter((s) => s);
    if (!id || !name) { return; }
    if (scope !== 'project' && scope !== 'aidlc' && scope !== 'global') { return; }

    const yamlSkillIds = new Set(doc.skills.map((s) => String(s.id)));
    for (const s of skills) {
      if (!yamlSkillIds.has(s)) {
        void vscode.window.showWarningMessage(
          `Skill "${s}" not declared in workspace.yaml.`,
        );
        return;
      }
    }

    // Common fields surfaced by the modal across every scope.
    const model = String(draft.model ?? '').trim();
    const description = String(draft.description ?? '').trim();
    const capsRaw = Array.isArray(draft.capabilities) ? (draft.capabilities as unknown[]) : [];
    const capabilities = capsRaw.map(String).filter((c) => c);

    if (scope === 'aidlc') {
      if (!model) { return; }
      const envObj = draft.env && typeof draft.env === 'object'
        ? (draft.env as Record<string, unknown>)
        : {};
      const env: Record<string, string> = {};
      for (const [k, v] of Object.entries(envObj)) { env[k] = String(v); }

      const agent: Record<string, unknown> = { id, name, skills, model };
      if (description) { agent.description = description; }
      if (Object.keys(env).length > 0) { agent.env = env; }
      if (capabilities.length > 0) { agent.capabilities = capabilities; }

      this.mutateYaml((d) => {
        d.agents.push(agent);
      });

      void vscode.window.showInformationMessage(
        `Agent "${id}" added (aidlc · skills: ${skills.join(', ')}, model: ${model}).`,
      );
      return;
    }

    // project / global: write Claude-native .md. Frontmatter now carries
    // the same fields surfaced in the modal — model + tools (capabilities)
    // — so the user's choices flow through into Claude Code's native
    // agent format instead of being silently dropped.
    const effectiveDescription = description || `${name} agent.`;
    const agentPath = targetPath(root, scope, 'agent', id);
    if (fs.existsSync(agentPath)) {
      void vscode.window.showWarningMessage(
        `Agent file already exists at ${path.relative(root, agentPath) || agentPath}. Delete it first.`,
      );
      return;
    }

    const sections: string[] = [];
    for (const skillId of skills) {
      sections.push(`<!-- ── Skill: ${skillId} ── -->`);
      const decl = doc.skills.find((s) => String(s.id) === skillId);
      const declPath = decl && typeof decl.path === 'string' ? decl.path : '';
      let inlined: string | null = null;
      if (declPath) {
        const resolved = path.isAbsolute(declPath) ? declPath : path.resolve(root, declPath);
        if (fs.existsSync(resolved)) {
          const raw = fs.readFileSync(resolved, 'utf8');
          inlined = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
        }
      }
      sections.push(
        inlined ?? `<!-- TODO: paste content for skill "${skillId}" — file not found -->`,
      );
      sections.push('');
    }

    // Build the YAML frontmatter. `model` and `tools` are Claude Code
    // native frontmatter fields; surfacing them here means the agent file
    // honors the user's modal choices instead of silently dropping them.
    const frontmatterLines = [
      '---',
      `name: ${name}`,
      `description: ${effectiveDescription}`,
    ];
    if (model) { frontmatterLines.push(`model: ${model}`); }
    if (capabilities.length > 0) {
      frontmatterLines.push(`tools: [${capabilities.join(', ')}]`);
    }
    frontmatterLines.push('---', '');
    const content = `${frontmatterLines.join('\n')}\n${sections.join('\n').trimEnd()}\n`;

    fs.mkdirSync(path.dirname(agentPath), { recursive: true });
    fs.writeFileSync(agentPath, content, 'utf8');

    const docOpen = await vscode.workspace.openTextDocument(agentPath);
    await vscode.window.showTextDocument(docOpen, { preview: false });

    void vscode.window.showInformationMessage(
      `Agent "${id}" added (${scope} · skills: ${skills.join(', ')}).`,
    );
  }

  /**
   * Apply the EditAgentModal draft. Supports both file-based scopes
   * (project/global — rewrite YAML frontmatter, preserve body) and the
   * AIDLC scope (mutate workspace.yaml entry). The id is locked by the
   * modal so this never has to handle renames — use `renameAgent` for that.
   */
  private async editAgentInline(draft: Record<string, unknown>): Promise<void> {
    const root = this.getRootOrWarn();
    if (!root) { return; }

    const id = String(draft.id ?? '').trim();
    const scope = draft.scope as AssetScope;
    if (!id || (scope !== 'project' && scope !== 'aidlc' && scope !== 'global')) { return; }

    const name = String(draft.name ?? '').trim();
    const description = String(draft.description ?? '').trim();
    const model = String(draft.model ?? '').trim();
    const capsRaw = Array.isArray(draft.capabilities) ? (draft.capabilities as unknown[]) : [];
    const capabilities = capsRaw.map(String).filter((c) => c);
    // `skills` is only present on edits that opened the modal post-v2 —
    // older payloads omit the field, which we read as "leave skills alone".
    const skillsProvided = Array.isArray(draft.skills);
    const skills = skillsProvided
      ? (draft.skills as unknown[]).map(String).filter((s) => s.length > 0)
      : [];

    if (scope === 'aidlc') {
      this.mutateYaml((doc) => {
        const agent = doc.agents.find((a) => String(a.id) === id);
        if (!agent) { return false; }
        if (name) { agent.name = name; }
        if (description) {
          agent.description = description;
        } else {
          delete agent.description;
        }
        if (model) { agent.model = model; }
        if (capabilities.length > 0) {
          agent.capabilities = capabilities;
        } else {
          delete agent.capabilities;
        }
        if (skillsProvided) {
          if (skills.length > 0) {
            agent.skills = skills;
            delete (agent as Record<string, unknown>).skill;
          } else {
            delete (agent as Record<string, unknown>).skills;
            delete (agent as Record<string, unknown>).skill;
          }
        }
      });
      void vscode.window.showInformationMessage(`Agent "${id}" updated.`);
      return;
    }

    // project / global: rewrite the .md file's frontmatter, keep body intact.
    const agentPath = targetPath(root, scope, 'agent', id);
    if (!fs.existsSync(agentPath)) {
      void vscode.window.showWarningMessage(
        `Agent file not found at ${path.relative(root, agentPath) || agentPath}.`,
      );
      return;
    }
    const raw = fs.readFileSync(agentPath, 'utf8');
    const updated = rewriteAgentFrontmatter(raw, {
      name: name || undefined,
      description: description || undefined,
      model: model || undefined,
      tools: capabilities.length > 0 ? capabilities : undefined,
    });
    fs.writeFileSync(agentPath, updated, 'utf8');

    // Persona ↔ skill binding lives in workspace.yaml's AIDLC layer (the
    // agent frontmatter has no `skills:` field), so write it there even
    // for file-based agents. Idempotent — creates the entry on first edit,
    // updates it thereafter.
    if (skillsProvided) {
      this.mutateYaml((doc) => {
        const existing = doc.agents.find((a) => String(a.id) === id);
        if (skills.length === 0) {
          if (existing) {
            delete (existing as Record<string, unknown>).skills;
            delete (existing as Record<string, unknown>).skill;
          }
          return;
        }
        if (existing) {
          (existing as Record<string, unknown>).skills = skills;
          delete (existing as Record<string, unknown>).skill;
        } else {
          const entry: Record<string, unknown> = { id, skills };
          if (name) { entry.name = name; }
          if (description) { entry.description = description; }
          if (model) { entry.model = model; }
          if (capabilities.length > 0) { entry.capabilities = capabilities; }
          doc.agents.push(entry as unknown as YamlDocument['agents'][number]);
        }
      });
    }
    void vscode.window.showInformationMessage(`Agent "${id}" updated.`);
  }

  /**
   * Ensure a built-in workflow preset is installed in this workspace. If
   * workspace.yaml doesn't exist, applies the full preset. If it exists but
   * lacks the workflow's pipeline, merges agents/skills/pipeline/slash_commands
   * non-destructively.
   *
   * Used at Start-Epic time when the selected pipeline is one of the
   * auto-injected built-ins from `BUILTIN_WORKFLOWS` — without this, the run
   * would fail because the pipeline id appears in the UI but the agent/skill
   * files weren't materialized on disk.
   */
  private ensureBuiltinInWorkspace(root: string, workflow: { id: string; pipelineId: string }): void {
    const doc = readYaml(root);
    if (doc?.pipelines.some((p) => String(p.id) === workflow.pipelineId)) { return; }

    const builtin = BUILTIN_WORKFLOWS.find((w) => w.id === workflow.id);
    if (!builtin) { return; }
    const preset = loadBuiltinPreset(this.extensionUri.fsPath, builtin);
    const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name ?? path.basename(root);

    if (!doc) {
      PresetStore.applyTo(root, preset, workspaceName);
    } else {
      // workspace.yaml exists — merge preset content in without overwriting existing config.
      // Skill content itself lives in `~/.claude/skills/aidlc-<workflow>-<phase>.md`
      // (installed by globalDefaultsInstaller), so we no longer drop a second
      // copy under `.aidlc/skills/`.

      const existingAgentIds = new Set(doc.agents.map((a) => String(a.id)));
      const existingSkillIds = new Set(doc.skills.map((s) => String(s.id)));
      const existingCmds = new Set(doc.slash_commands.map((c) => String(c.name)));

      for (const a of (preset.workspace.agents as Array<Record<string, unknown>>) ?? []) {
        if (!existingAgentIds.has(String(a.id))) { doc.agents.push(a); }
      }
      for (const s of (preset.workspace.skills as Array<Record<string, unknown>>) ?? []) {
        if (!existingSkillIds.has(String(s.id))) { doc.skills.push(s); }
      }
      for (const c of (preset.workspace.slash_commands as Array<Record<string, unknown>>) ?? []) {
        if (!existingCmds.has(String(c.name))) { doc.slash_commands.push(c); }
      }
      const builtinSteps = getBuiltinPipelineSummary(builtin).steps.map((s) => {
        const step: Record<string, unknown> = {
          agent: s.agent,
          enabled: true,
          requires: [],
          produces: [],
          human_review: s.human_review,
          auto_review: s.auto_review,
        };
        if (s.auto_review && s.auto_review_runner) { step.auto_review_runner = s.auto_review_runner; }
        return step;
      });
      doc.pipelines.push({
        id: workflow.pipelineId,
        steps: builtinSteps,
        on_failure: 'stop',
      });

      writeYaml(root, doc);
    }

    // Create .claude/commands/<slug>-<phase>.md so each slash command is wired
    // as a real Claude Code command. Namespacing keeps two presets' slash
    // commands distinct in the same project.
    const freshDoc = readYaml(root);
    const epicRoot = freshDoc
      ? (() => {
          const state = freshDoc.state as Record<string, unknown> | undefined;
          return typeof state?.root === 'string' ? state.root : 'docs/epics';
        })()
      : 'docs/epics';

    const commandsDir = path.join(root, '.claude', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });
    for (const phase of builtin.phases) {
      const nsId = phase.id;
      const commandFile = path.join(commandsDir, `${nsId}.md`);
      if (!fs.existsSync(commandFile)) {
        const skillBody = preset.skillContents[nsId] ?? `# ${phase.name}\n\n${phase.description}\n`;
        fs.writeFileSync(commandFile, builtinClaudeCommand(phase, skillBody, epicRoot), 'utf8');
      }
    }

    // Scaffold the JS auto-review runner(s) for the implement step's
    // auto-review if missing. The core AutoReviewer loads these via dynamic
    // import and expects a default-exported function — a shell script can't be
    // imported, so the runner is a `.mjs` module, not `.sh` (issue #27). Each
    // workflow can ship its own `templates/<dir>/validators/ci.mjs`; falls back
    // to the generic SDLC validator when not customized.
    writeBuiltinAutoReviewValidators(this.extensionUri.fsPath, root, builtin);

    // Drop bundled artifact templates for this workflow so the epic's
    // artifacts/ folder gets a structured starting point on the very first run.
    this.ensureWorkflowTemplates(root);
  }

  /**
   * Ensure artifact templates exist for every known pipeline in this workspace.
   *
   * - SDLC (built-in): writes bundled templates from `templates/sdlc/artifacts/`
   *   to `.aidlc/aidlc-templates/sdlc-full/` — idempotent, no file I/O if
   *   files already exist.
   * - Custom pipelines: templates are generated by `generatePipelineTemplates`
   *   at pipeline-creation time; this method just ensures the directory exists.
   *
   * Called on every panel refresh so templates are always available before
   * the user starts an epic.
   */
  private ensureWorkflowTemplates(root: string): void {
    // For every built-in pipeline present in workspace.yaml, drop the
    // bundled artifact templates into `.aidlc/aidlc-templates/<pipelineId>/`.
    // No special-casing — every workflow extracts on first apply, idempotent
    // on subsequent panel refreshes.
    const doc = readYaml(root);
    if (!doc) { return; }
    for (const p of doc.pipelines) {
      const pId = String(p.id);
      const workflow = getBuiltinWorkflowByPipelineId(pId);
      if (!workflow) { continue; }
      const dir = path.join(root, WORKSPACE_DIR, 'aidlc-templates', pId);
      fs.mkdirSync(dir, { recursive: true });
      const templates = getBuiltinArtifactTemplates(this.extensionUri.fsPath, workflow);
      for (const [fileName, content] of Object.entries(templates)) {
        const dest = path.join(dir, fileName);
        if (!fs.existsSync(dest)) { fs.writeFileSync(dest, content, 'utf8'); }
      }
    }
  }

  /**
   * Apply the StartEpicModal draft. Mirrors `startEpicCommand`:
   * - writes <epicRoot>/<id>/state.json + inputs.json + artifacts/.
   * - when target is a pipeline, scaffolds a RunState (runId === epicId) so
   *   the gate UI lights up immediately.
   *
   * Refuses to overwrite an existing epic dir — the modal's existingEpicIds
   * already blocks collisions in normal use; this is the safety net.
   */
  private async startEpicInline(draft: Record<string, unknown>): Promise<void> {
    const root = this.getRootOrWarn();
    if (!root) { return; }

    const targetRaw = draft.target as Record<string, unknown> | undefined;
    const epicId = String(draft.epicId ?? '').trim();
    if (!targetRaw || !epicId) { return; }
    const targetKind = String(targetRaw.kind ?? '');
    const targetId = String(targetRaw.id ?? '').trim();
    if (!targetId) { return; }
    if (targetKind !== 'pipeline' && targetKind !== 'agent') { return; }

    // Auto-scaffold agents/skills/workspace.yaml when a built-in pipeline is
    // selected — covers SDLC plus the 7 stack-specialized workflows.
    if (targetKind === 'pipeline') {
      const builtinWorkflow = getBuiltinWorkflowByPipelineId(targetId);
      if (builtinWorkflow) { this.ensureBuiltinInWorkspace(root, builtinWorkflow); }
    }

    const doc = readYaml(root);
    if (!doc) {
      void vscode.window.showWarningMessage('AIDLC: no workspace.yaml — initialize first.');
      return;
    }

    const title = String(draft.title ?? '').trim();
    const description = String(draft.description ?? '').trim();
    const inputsRaw = draft.inputs && typeof draft.inputs === 'object'
      ? (draft.inputs as Record<string, unknown>)
      : {};
    const inputs: Record<string, string> = {};
    for (const [k, v] of Object.entries(inputsRaw)) {
      if (typeof v === 'string' && v.trim()) { inputs[k] = v; }
    }

    let agents: string[] = [];
    if (targetKind === 'pipeline') {
      const p = (doc.pipelines as PipelineConfig[] | undefined)?.find(
        (x) => x.id === targetId,
      );
      if (!p) {
        void vscode.window.showWarningMessage(`Pipeline "${targetId}" not found.`);
        return;
      }
      agents = Array.isArray(p.steps) ? (p.steps as unknown[]).map(stepAgentId) : [];
    } else {
      const a = doc.agents.find((x) => String(x.id) === targetId);
      if (!a) {
        void vscode.window.showWarningMessage(`Agent "${targetId}" not found.`);
        return;
      }
      agents = [targetId];
    }
    if (agents.length === 0) {
      void vscode.window.showWarningMessage(`Target "${targetId}" has no agents.`);
      return;
    }

    const epicRoot = readEpicRoot(doc);
    const epicDir = path.resolve(root, epicRoot, epicId);
    if (fs.existsSync(epicDir)) {
      void vscode.window.showWarningMessage(
        `Epic dir already exists at ${path.relative(root, epicDir) || epicDir}. Delete it first.`,
      );
      return;
    }

    fs.mkdirSync(epicDir, { recursive: true });
    const artifactsDir = path.join(epicDir, 'artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });

    // Copy artifact templates from .aidlc/aidlc-templates/<pipelineId>/ into
    // the epic's artifacts/ folder so Claude has a structured starting point.
    if (targetKind === 'pipeline') {
      const templatesDir = path.join(root, WORKSPACE_DIR, 'aidlc-templates', targetId);
      if (fs.existsSync(templatesDir)) {
        for (const fileName of fs.readdirSync(templatesDir)) {
          const src = path.join(templatesDir, fileName);
          const dest = path.join(artifactsDir, fileName);
          if (!fs.existsSync(dest)) { fs.copyFileSync(src, dest); }
        }
      }
    }

    const state = {
      id: epicId,
      title,
      description,
      pipeline: targetKind === 'pipeline' ? targetId : null,
      agent: targetKind === 'agent' ? targetId : null,
      agents,
      currentStep: 0,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
      stepStates: agents.map((a) => ({
        agent: a,
        status: 'pending' as const,
        startedAt: null,
        finishedAt: null,
      })),
    };

    fs.writeFileSync(
      path.join(epicDir, 'state.json'),
      JSON.stringify(state, null, 2) + '\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(epicDir, 'inputs.json'),
      JSON.stringify(inputs, null, 2) + '\n',
      'utf8',
    );

    if (targetKind === 'pipeline') {
      const pipelineCfg = (doc.pipelines as PipelineConfig[] | undefined)?.find(
        (p) => p.id === targetId,
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
            mirrorRunStateToEpic(root, runState, doc);
          } catch (err) {
            void vscode.window.showWarningMessage(
              `Epic created, but pipeline run could not be scaffolded: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }
    }

    void vscode.window.showInformationMessage(
      `Started epic "${epicId}" — ${agents[0]}. Run /${agents[0]} ${epicId} in Claude to begin.`,
    );
    this.refresh();
  }

  /**
   * Build a pipeline from the React `AddPipelineModal` payload — bypasses
   * the legacy QuickPick wizard chain. Validates id, agents, and runner
   * paths server-side; surfaces issues as a warning and aborts.
   */
  /**
   * Resolve every step's `agent` id. If the id is already in workspace.yaml
   * `agents:` we accept it. If not, look it up in the discovered
   * project/global agent files — when found, plan an auto-sync entry so
   * the runner can resolve the agent later. Returns the missing id when
   * neither lookup succeeds.
   *
   * Doesn't mutate `doc` — caller applies `added` via `applySyncedAgents`
   * inside its own `mutateYaml` block so the write is atomic with the
   * pipeline push.
   */
  private ensureWorkspaceAgentsForSteps(
    root: string,
    doc: YamlDocument,
    stepsRaw: unknown[],
  ):
    | { ok: true; added: SyncedAgentPlan[] }
    | { ok: false; missing: string }
  {
    const existing = new Set(doc.agents.map((a) => String(a.id)));
    const discovered = discoverAssets(root).agents;
    const byId = new Map<string, DiscoveredAsset>();
    for (const a of discovered) { byId.set(a.id, a); }

    const added: SyncedAgentPlan[] = [];
    const plannedIds = new Set<string>();

    for (const raw of stepsRaw) {
      if (!raw || typeof raw !== 'object') { continue; }
      const id = String((raw as Record<string, unknown>).agent ?? '').trim();
      if (!id) { return { ok: false, missing: '' }; }
      if (existing.has(id) || plannedIds.has(id)) { continue; }
      const file = byId.get(id);
      if (!file) { return { ok: false, missing: id }; }

      const fm = parseAgentFrontmatter(file.filePath);
      const skillId = `${id}-skill`;
      added.push({
        agent: {
          id,
          name: fm.description ? id : id,
          skills: [skillId],
          model: fm.model,
          capabilities: fm.tools,
          description: fm.description,
        },
        skill: {
          id: skillId,
          // Reference the persona file directly — the runner uses
          // `skills:` paths to load the prompt at dispatch time.
          path: this.relPathFor(root, file.filePath),
        },
      });
      plannedIds.add(id);
    }
    return { ok: true, added };
  }

  /**
   * Append the planned `agents:` + `skills:` entries from
   * `ensureWorkspaceAgentsForSteps` onto `doc`. Idempotent — skips ids
   * already present in case mutateYaml re-read the doc between plan +
   * apply.
   */
  private applySyncedAgents(doc: YamlDocument, added: SyncedAgentPlan[]): void {
    const agentIds = new Set(doc.agents.map((a) => String(a.id)));
    const skillIds = new Set(doc.skills.map((s) => String(s.id)));
    for (const plan of added) {
      if (!agentIds.has(plan.agent.id)) {
        const agent: Record<string, unknown> = {
          id: plan.agent.id,
          name: plan.agent.name,
          skills: plan.agent.skills,
        };
        if (plan.agent.model) { agent.model = plan.agent.model; }
        if (plan.agent.description) { agent.description = plan.agent.description; }
        if (plan.agent.capabilities && plan.agent.capabilities.length > 0) {
          agent.capabilities = plan.agent.capabilities;
        }
        doc.agents.push(agent);
        agentIds.add(plan.agent.id);
      }
      if (!skillIds.has(plan.skill.id)) {
        doc.skills.push({ id: plan.skill.id, path: plan.skill.path });
        skillIds.add(plan.skill.id);
      }
    }
  }

  /**
   * Best-effort path normalization for workspace.yaml `skills[].path`.
   * Files under the workspace get a project-relative path; absolute paths
   * outside (e.g. `~/.claude/agents/aidlc-po.md`) keep the `~/` form so
   * the YAML stays portable across machines.
   */
  private relPathFor(root: string, abs: string): string {
    const home = os.homedir();
    if (abs.startsWith(home)) { return '~' + abs.slice(home.length); }
    const rel = path.relative(root, abs);
    return rel && !rel.startsWith('..') ? rel : abs;
  }

  private async addPipelineInline(draft: Record<string, unknown>): Promise<void> {
    const root = this.getRootOrWarn();
    if (!root) { return; }
    const doc = readYaml(root);
    if (!doc) {
      void vscode.window.showWarningMessage('AIDLC: no workspace.yaml — initialize first.');
      return;
    }

    const id = String(draft.id ?? '').trim();
    const onFailure: 'stop' | 'continue' =
      draft.on_failure === 'continue' ? 'continue' : 'stop';
    const stepsRaw = Array.isArray(draft.steps) ? (draft.steps as unknown[]) : [];

    if (!id) {
      void vscode.window.showWarningMessage('Pipeline id is required.');
      return;
    }
    if (doc.pipelines.some((p) => p.id === id)) {
      void vscode.window.showWarningMessage(`Pipeline "${id}" already exists.`);
      return;
    }
    if (stepsRaw.length === 0) {
      void vscode.window.showWarningMessage('Pipeline needs at least one step.');
      return;
    }

    // Resolve every step's agent id. Steps referencing file-based agents
    // (project / global scope) won't have a matching workspace.yaml entry
    // yet — auto-sync one from the persona .md frontmatter so the runner
    // can dispatch them. Aborts only when an id is neither in workspace
    // nor in the discovered file set.
    const sync = this.ensureWorkspaceAgentsForSteps(root, doc, stepsRaw);
    if (!sync.ok) {
      void vscode.window.showWarningMessage(
        `Step references unknown agent "${sync.missing}". Aborting.`,
      );
      return;
    }
    const steps: unknown[] = [];
    for (const raw of stepsRaw) {
      if (!raw || typeof raw !== 'object') { continue; }
      const r = raw as Record<string, unknown>;
      const agent = String(r.agent ?? '').trim();
      const stepName = typeof r.name === 'string' ? r.name.trim() : '';
      const skillsArr = Array.isArray(r.skills)
        ? (r.skills as unknown[]).map(String).filter((s) => s.length > 0)
        : [];
      const dependsOnArr = Array.isArray(r.depends_on)
        ? (r.depends_on as unknown[]).map(String).filter((s) => s.length > 0)
        : [];
      const human_review = r.human_review === true;
      const auto_review = r.auto_review === true;
      const runner = typeof r.auto_review_runner === 'string' ? r.auto_review_runner.trim() : '';
      if (auto_review && !runner) {
        void vscode.window.showWarningMessage(
          `Step "${agent}": auto_review is on but runner path is empty.`,
        );
        return;
      }
      const step: Record<string, unknown> = {
        agent,
        enabled: true,
        requires: [],
        produces: [],
        human_review,
        auto_review,
      };
      if (stepName) { step.name = stepName; }
      if (skillsArr.length > 0) { step.skills = skillsArr; }
      // Parallel structure defined via the modal's "Runs after" picker.
      if (dependsOnArr.length > 0) { step.depends_on = dependsOnArr; }
      if (auto_review) { step.auto_review_runner = runner; }
      steps.push(step);
    }

    this.mutateYaml((d) => {
      // Re-apply the synced workspace.yaml additions on the fresh doc this
      // mutateYaml session reads back from disk. Otherwise the write below
      // would clobber the entries `ensureWorkspaceAgentsForSteps` added on
      // the stale `doc` it received.
      this.applySyncedAgents(d, sync.added);
      d.pipelines.push({ id, steps, on_failure: onFailure });
    });

    void vscode.window.showInformationMessage(
      `Pipeline "${id}" added: ${steps
        .map((s) => (s as { agent: string }).agent)
        .join(' → ')}`,
    );

    // Generate artifact templates immediately so they exist before the user
    // starts an epic. Refresh fires after generation completes.
    await this.generatePipelineTemplates(root, id, steps as Array<{ agent: string }>);
    this.refresh();
  }

  /**
   * Use the local `claude` CLI (already authenticated) to generate a per-step
   * artifact template for a custom pipeline. Reads each step's agent description
   * + linked skill content, passes it to `claude -p` and writes the result to
   * `.aidlc/aidlc-templates/<pipelineId>/<stepAgent>.md`.
   *
   * Runs asynchronously after the pipeline is saved — failures are surfaced as
   * a VS Code warning rather than blocking the pipeline creation flow.
   */
  private async generatePipelineTemplates(
    root: string,
    pipelineId: string,
    steps: Array<{ agent: string }>,
  ): Promise<void> {
    const doc = readYaml(root);
    if (!doc) { return; }

    const templatesDir = path.join(root, WORKSPACE_DIR, 'aidlc-templates', pipelineId);
    fs.mkdirSync(templatesDir, { recursive: true });

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Generating artifact templates for pipeline "${pipelineId}"…`,
        cancellable: false,
      },
      async (progress) => {
        const total = steps.length;
        let done = 0;

        for (const step of steps) {
          const agentId = step.agent;
          const destFile = path.join(templatesDir, `${agentId}.md`);
          if (fs.existsSync(destFile)) { done++; continue; }

          // Collect agent + skill context.
          const agentDecl = doc.agents.find((a) => String(a.id) === agentId) as Record<string, unknown> | undefined;
          const agentDesc = agentDecl?.description ?? agentId;
          const skillIds: string[] = Array.isArray(agentDecl?.skills)
            ? (agentDecl!.skills as string[])
            : typeof agentDecl?.skill === 'string'
              ? [agentDecl.skill as string]
              : [];

          const skillBodies: string[] = [];
          for (const skillId of skillIds) {
            const decl = doc.skills.find((s) => String(s.id) === skillId) as Record<string, unknown> | undefined;
            const declPath = typeof decl?.path === 'string' ? decl.path : '';
            if (declPath) {
              const resolved = path.isAbsolute(declPath) ? declPath : path.resolve(root, declPath);
              if (fs.existsSync(resolved)) {
                skillBodies.push(fs.readFileSync(resolved, 'utf8'));
              }
            }
          }

          const prompt = [
            'You are an SDLC assistant. Given this agent\'s role, generate a concise markdown artifact template that Claude should fill in when it runs this step.',
            'Use placeholder text and structured sections (headers, tables, checklists) appropriate to the agent\'s deliverable.',
            'Output ONLY the markdown — no explanation, no code fences around the whole response.',
            '',
            `Agent: ${agentId}`,
            `Description: ${agentDesc}`,
            skillBodies.length > 0
              ? `\nSkill content:\n---\n${skillBodies.join('\n---\n')}`
              : '',
          ].filter(Boolean).join('\n');

          try {
            const { stdout } = await execFileAsync('claude', ['-p', prompt], {
              cwd: root,
              maxBuffer: 2 * 1024 * 1024,
              timeout: 60_000,
            });
            if (stdout.trim()) {
              fs.writeFileSync(destFile, stdout.trim() + '\n', 'utf8');
            }
          } catch {
            // Non-fatal — epic can still start without a pre-generated template.
          }

          done++;
          progress.report({ increment: (done / total) * 100, message: `${done}/${total}` });
        }
      },
    );

    void vscode.window.showInformationMessage(
      `Artifact templates ready at .aidlc/aidlc-templates/${pipelineId}/`,
    );
  }

  /**
   * Apply edits from the React `PipelineModal` (edit mode). Replaces the
   * pipeline's `steps` and `on_failure` while preserving each existing step's
   * `requires` / `produces` (which the modal does not expose — those still
   * live on the per-step gear-icon flow). Matching is by agent id, first
   * occurrence — good enough for typical reorder + toggle workflows.
   */
  private async editPipelineInline(
    id: string,
    draft: Record<string, unknown>,
  ): Promise<void> {
    const root = this.getRootOrWarn();
    if (!root) { return; }
    const doc = readYaml(root);
    if (!doc) { return; }

    const pipeline = doc.pipelines.find((p) => p.id === id);
    if (!pipeline) {
      void vscode.window.showWarningMessage(`Pipeline "${id}" not found.`);
      return;
    }

    const onFailure: 'stop' | 'continue' =
      draft.on_failure === 'continue' ? 'continue' : 'stop';
    const stepsRaw = Array.isArray(draft.steps) ? (draft.steps as unknown[]) : [];
    if (stepsRaw.length === 0) {
      void vscode.window.showWarningMessage('Pipeline needs at least one step.');
      return;
    }

    // Auto-sync workspace.yaml entries for any file-based agents the user
    // picked. Same mechanism as `addPipelineInline` — without this an
    // edit that swaps to a project/global agent would abort here even
    // though the agent file exists.
    const sync = this.ensureWorkspaceAgentsForSteps(root, doc, stepsRaw);
    if (!sync.ok) {
      void vscode.window.showWarningMessage(
        `Step references unknown agent "${sync.missing}". Aborting.`,
      );
      return;
    }

    // Preserve requires/produces from the existing pipeline by agent id —
    // first occurrence consumed per match so duplicate-agent steps still
    // pair up with their original entries in order.
    const oldByAgent = new Map<string, Array<{ requires: string[]; produces: string[] }>>();
    if (Array.isArray(pipeline.steps)) {
      for (const raw of pipeline.steps as PipelineStepConfig[]) {
        const norm = normalizeStep(raw);
        const arr = oldByAgent.get(norm.agent) ?? [];
        arr.push({ requires: norm.requires, produces: norm.produces });
        oldByAgent.set(norm.agent, arr);
      }
    }

    const newSteps: unknown[] = [];
    for (const raw of stepsRaw) {
      if (!raw || typeof raw !== 'object') { continue; }
      const r = raw as Record<string, unknown>;
      const agent = String(r.agent ?? '').trim();
      const stepName = typeof r.name === 'string' ? r.name.trim() : '';
      const skillsArr = Array.isArray(r.skills)
        ? (r.skills as unknown[]).map(String).filter((s) => s.length > 0)
        : [];
      const dependsOnArr = Array.isArray(r.depends_on)
        ? (r.depends_on as unknown[]).map(String).filter((s) => s.length > 0)
        : [];
      const human_review = r.human_review === true;
      const auto_review = r.auto_review === true;
      const runner = typeof r.auto_review_runner === 'string' ? r.auto_review_runner.trim() : '';
      if (auto_review && !runner) {
        void vscode.window.showWarningMessage(
          `Step "${agent}": auto_review is on but runner path is empty.`,
        );
        return;
      }

      const carry = oldByAgent.get(agent)?.shift();
      const step: Record<string, unknown> = {
        agent,
        enabled: true,
        requires: carry?.requires ?? [],
        produces: carry?.produces ?? [],
        human_review,
        auto_review,
      };
      if (stepName) { step.name = stepName; }
      if (skillsArr.length > 0) { step.skills = skillsArr; }
      // Carry DAG edges. The modal doesn't let the user edit deps, but a
      // save-without-deps would silently flatten the workflow's columns,
      // so we round-trip whatever the webview sent.
      if (dependsOnArr.length > 0) { step.depends_on = dependsOnArr; }
      if (auto_review) { step.auto_review_runner = runner; }
      newSteps.push(step);
    }

    this.mutateYaml((d) => {
      // Commit synced agents/skills in the same write that updates the
      // pipeline, so the runner never sees a step referencing an agent
      // that hasn't been added yet.
      this.applySyncedAgents(d, sync.added);
      const p = d.pipelines.find((x) => x.id === id);
      if (!p) { return false; }
      p.steps = newSteps;
      p.on_failure = onFailure;
    });

    void vscode.window.showInformationMessage(
      `Pipeline "${id}" updated: ${newSteps
        .map((s) => (s as { agent: string }).agent)
        .join(' → ')}`,
    );
  }

  /**
   * Append a new step that runs in parallel with an existing step: clone
   * the source step's `depends_on` so the new step lands at the same DAG
   * level. The new step is appended to `pipeline.steps[]`; DAG column
   * placement is driven by `depends_on`, not array order, so it'll render
   * next to the source step.
   *
   * Verifies the chosen agent exists in workspace.yaml. No-op if the source
   * agent isn't in the pipeline (shouldn't happen via UI, defensive).
   */
  private async addParallelStep(
    pipelineId: string,
    parallelToAgent: string,
    agentId: string,
    stepName?: string,
  ): Promise<void> {
    if (!pipelineId || !parallelToAgent || !agentId) { return; }
    const root = this.getRootOrWarn();
    if (!root) { return; }
    const doc = readYaml(root);
    if (!doc) { return; }
    if (!doc.agents.some((a) => String(a.id) === agentId)) {
      void vscode.window.showWarningMessage(
        `Agent "${agentId}" not found in workspace.yaml. Add it before placing it in a pipeline.`,
      );
      return;
    }

    // Duplicate agent ids are allowed — multiple steps can share one agent
    // with different skills / step names (e.g. several QA phases). DAG edges
    // reference each step's *node id* (`name ?? agent`), not the bare agent,
    // so duplicates stay distinct as long as their names differ. The picker
    // requires a unique step name, which guarantees that.
    const pipeline = doc.pipelines.find((x) => x.id === pipelineId);
    if (!pipeline || !Array.isArray(pipeline.steps)) { return; }

    this.mutateYaml((mdoc) => {
      const pipeline = mdoc.pipelines.find((x) => x.id === pipelineId);
      if (!pipeline || !Array.isArray(pipeline.steps)) { return false; }
      const steps = pipeline.steps as PipelineStepConfig[];

      const stepAgent = (s: PipelineStepConfig): string =>
        typeof s === 'string'
          ? s
          : typeof (s as { agent?: unknown }).agent === 'string'
            ? (s as { agent: string }).agent
            : '';
      const stepNameOf = (s: PipelineStepConfig): string | undefined =>
        typeof s === 'object' && s && typeof (s as { name?: unknown }).name === 'string'
          ? (s as { name: string }).name
          : undefined;
      // Node id keys the DAG (matches PipelineCard + addStepToPipeline).
      const stepNodeId = (s: PipelineStepConfig): string => stepNameOf(s) ?? stepAgent(s);
      const stepDeps = (s: PipelineStepConfig): string[] => {
        if (typeof s === 'string') { return []; }
        const d = (s as { depends_on?: unknown }).depends_on;
        return Array.isArray(d) ? d.map(String) : [];
      };

      // Auto-upgrade linear → DAG when needed. A pipeline with no
      // `depends_on` edges is "linear" — execution order is the array
      // index. If we just append a parallel step there with empty deps,
      // every existing step still has empty deps too, so `hasDagShape`
      // stays false and the UI keeps rendering as a linear chain — the
      // parallel relationship the user just created would be invisible.
      // Fix: when a linear pipeline gains its first parallel step, inflate
      // each existing step's `depends_on` from positional order so the
      // chain becomes an explicit DAG. Chaining keys by node id so the
      // edges line up with the visual nodes (and survive duplicate agents).
      const usesDag = steps.some((s) => stepDeps(s).length > 0);
      if (!usesDag) {
        let prevNodeId = '';
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          const agent = stepAgent(s);
          if (!agent) { continue; }
          const name = stepNameOf(s);
          const inflated: Record<string, unknown> = {
            agent,
            enabled: typeof s === 'string'
              ? true
              : (s as { enabled?: unknown }).enabled !== false,
            requires: typeof s === 'string'
              ? []
              : Array.isArray((s as { requires?: unknown }).requires)
                ? ((s as { requires: unknown[] }).requires as unknown[])
                : [],
            produces: typeof s === 'string'
              ? []
              : Array.isArray((s as { produces?: unknown }).produces)
                ? ((s as { produces: unknown[] }).produces as unknown[])
                : [],
            human_review: typeof s === 'string'
              ? true
              : (s as { human_review?: unknown }).human_review !== false,
            auto_review: typeof s !== 'string'
              && (s as { auto_review?: unknown }).auto_review === true,
          };
          // Preserve name + skills so inflation doesn't wipe them.
          if (name) { inflated.name = name; }
          const skills = typeof s === 'object' && s && Array.isArray((s as { skills?: unknown }).skills)
            ? ((s as { skills: unknown[] }).skills as unknown[])
            : undefined;
          if (skills && skills.length > 0) { inflated.skills = skills; }
          const runner = typeof s === 'string'
            ? undefined
            : (s as { auto_review_runner?: unknown }).auto_review_runner;
          if (typeof runner === 'string') { inflated.auto_review_runner = runner; }
          if (i > 0 && prevNodeId) { inflated.depends_on = [prevNodeId]; }
          steps[i] = inflated as unknown as PipelineStepConfig;
          prevNodeId = name ?? agent;
        }
      }

      // `parallelToAgent` carries the source step's node id (the webview
      // sends `name ?? agent`). Match on node id so the right step is found
      // even when its agent appears more than once.
      const source = steps.find((s) => stepNodeId(s) === parallelToAgent);
      if (!source) { return false; }
      const sourceDeps = stepDeps(source);

      const newStep: Record<string, unknown> = {
        agent: agentId,
        enabled: true,
        requires: [],
        produces: [],
        human_review: true,
        auto_review: false,
      };
      const name = (stepName ?? '').trim();
      if (name && name !== agentId) { newStep.name = name; }
      if (sourceDeps.length > 0) { newStep.depends_on = sourceDeps; }
      steps.push(newStep as unknown as PipelineStepConfig);
    });
  }

  private async addStepToPipeline(pipelineId: string, agentIdArg?: string, stepNameArg?: string): Promise<void> {
    if (!pipelineId) { return; }
    const root = this.getRootOrWarn();
    if (!root) { return; }
    const doc = readYaml(root);
    if (!doc) { return; }
    if (doc.agents.length === 0) {
      const choice = await vscode.window.showWarningMessage(
        'No agents declared yet — add one before chaining steps.',
        'Add Agent',
      );
      if (choice === 'Add Agent') {
        await vscode.commands.executeCommand('aidlc.addAgent');
      }
      return;
    }
    const pipeline = doc.pipelines.find((x) => x.id === pipelineId);
    if (!pipeline) { return; }

    let chosenId: string | undefined;
    if (agentIdArg) {
      // Webview already showed an inline StepPickerModal — trust the choice
      // but verify the agent still exists in workspace.yaml.
      if (doc.agents.some((a) => String(a.id) === agentIdArg)) {
        chosenId = agentIdArg;
      }
    } else {
      const currentSteps = Array.isArray(pipeline.steps)
        ? pipeline.steps.map(stepAgentId)
        : [];
      const picked = await vscode.window.showQuickPick(
        doc.agents.map((a) => {
          const id = String(a.id);
          const name = typeof a.name === 'string' ? a.name : id;
          const inPipeline = currentSteps.includes(id);
          return {
            label: id,
            description: name,
            detail: inPipeline ? '· already in pipeline (will duplicate)' : '',
            id,
          };
        }),
        { placeHolder: `Append a step to \`${pipelineId}\``, ignoreFocusOut: true, matchOnDetail: true },
      );
      chosenId = picked?.id;
    }
    if (!chosenId) { return; }
    this.mutateYaml((d) => {
      const p = d.pipelines.find((x) => x.id === pipelineId);
      if (!p) { return false; }
      const steps = Array.isArray(p.steps) ? (p.steps as PipelineStepConfig[]) : [];

      // Append semantics:
      //   sequential pipeline (no depends_on anywhere) → bare string, runner
      //     advances by index.
      //   DAG pipeline → new step must depend on the current leaves
      //     (steps nobody else depends on) so it lands *after* them in the
      //     visual flow. Otherwise it gets no deps and lands at level 0
      //     parallel with the roots.
      // Node id keys the DAG: a step's `name` when present, else its agent id
      // (matches PipelineCard.computeDagLevels). `depends_on` references these
      // ids, so leaf detection must compare against node ids, not agent ids.
      const normalized = steps.map((s) => {
        if (typeof s === 'string') { return { nodeId: s, deps: [] as string[] }; }
        const obj = s as { agent?: unknown; name?: unknown; depends_on?: unknown };
        const deps = Array.isArray(obj.depends_on) ? obj.depends_on.map(String) : [];
        const agent = typeof obj.agent === 'string' ? obj.agent : '';
        const nodeId = typeof obj.name === 'string' && obj.name ? obj.name : agent;
        return { nodeId, deps };
      });
      const usesDag = normalized.some((n) => n.deps.length > 0);

      // The step name (chosen first in the picker) becomes the node label and
      // the id `depends_on` references. Fall back to the agent id when blank.
      const name = (stepNameArg ?? '').trim();

      if (!usesDag) {
        // A named step can't be a bare string — emit an object so the name
        // survives. Unnamed (or name === agent) keeps the compact string form.
        if (name && name !== chosenId) {
          steps.push({ agent: chosenId!, name } as unknown as PipelineStepConfig);
        } else {
          steps.push(chosenId!);
        }
      } else {
        const referenced = new Set<string>();
        for (const n of normalized) {
          for (const d of n.deps) { referenced.add(d); }
        }
        // Leaves = node ids nobody depends on → the new step lands after them.
        const leaves = normalized
          .map((n) => n.nodeId)
          .filter((id) => id && !referenced.has(id));
        const newStep: Record<string, unknown> = {
          agent: chosenId!,
          enabled: true,
          requires: [],
          produces: [],
          human_review: true,
          auto_review: false,
        };
        if (name && name !== chosenId) { newStep.name = name; }
        if (leaves.length > 0) { newStep.depends_on = leaves; }
        steps.push(newStep as unknown as PipelineStepConfig);
      }
      p.steps = steps;
    });
  }

  /**
   * Delete a pipeline. For built-in workflows this is a full uninstall:
   * remove the pipeline itself, the workspace.yaml agents / skills /
   * slash_commands that the preset created, the `.claude/commands/<slug>-*.md`
   * files, and the global `~/.claude/agents` + `~/.claude/skills` files.
   * User pipelines fall through to the plain `deleteItem` path which only
   * touches workspace.yaml.
   */
  private async deletePipeline(id: string, skipConfirm = false): Promise<void> {
    if (!id) { return; }
    const builtin = getBuiltinWorkflowByPipelineId(id);
    if (!builtin) {
      await this.deleteItem('pipelines', id, skipConfirm);
      return;
    }

    if (!skipConfirm) {
      const confirm = await vscode.window.showWarningMessage(
        `Delete workflow \`${id}\` and uninstall its unused agents/skills from ~/.claude/?`,
        { modal: true }, 'Delete', 'Cancel',
      );
      if (confirm !== 'Delete') { return; }
    }

    // What this built-in owns, in the *same id-spaces* workspace.yaml uses:
    //   agents → `aidlc-<persona>`, skills → `aidlc-<…>`, slash → `/<phase>`.
    // (The previous version compared bare phase ids against agent/skill ids,
    // which never overlap — so agents + skills were never actually removed
    // and lingered in the counts after the pipeline was deleted.) Derive the
    // owned ids from the generated preset so this stays correct regardless of
    // how skill ids are computed.
    const preset = loadBuiltinPreset(this.extensionUri.fsPath, builtin);
    const ws = preset.workspace as {
      agents?: Array<{ id?: unknown }>;
      skills?: Array<{ id?: unknown }>;
      slash_commands?: Array<{ name?: unknown }>;
    };
    const ownedAgentIds = new Set((ws.agents ?? []).map((a) => String(a.id ?? '')));
    const ownedSkillIds = new Set((ws.skills ?? []).map((s) => String(s.id ?? '')));
    const ownedSlashNames = new Set((ws.slash_commands ?? []).map((c) => String(c.name ?? '')));
    // Phase ids own the `.claude/commands/<phase>.md` files + the step names
    // remaining pipelines reference.
    const myPhaseIds = new Set(builtin.phases.map((p) => p.id));

    this.mutateYaml((doc) => {
      // Sharing-aware: collect what *other* pipelines still reference so a
      // shared agent/skill (used by another applied pipeline) survives.
      const neededAgents = new Set<string>();
      const neededSkills = new Set<string>();
      const neededStepNames = new Set<string>();
      for (const p of doc.pipelines) {
        if (String(p.id) === id) { continue; }
        for (const step of (p.steps ?? []) as Array<string | Record<string, unknown>>) {
          if (typeof step === 'string') { neededAgents.add(step); neededStepNames.add(step); continue; }
          const agent = typeof step.agent === 'string' ? step.agent : '';
          if (agent) { neededAgents.add(agent); }
          const stepName = typeof step.name === 'string' ? step.name : agent;
          if (stepName) { neededStepNames.add(stepName); }
          if (Array.isArray(step.skills)) {
            for (const s of step.skills) { neededSkills.add(String(s)); }
          }
        }
      }

      doc.agents = doc.agents.filter(
        (a) => !(ownedAgentIds.has(String(a.id)) && !neededAgents.has(String(a.id))),
      );
      doc.skills = doc.skills.filter(
        (s) => !(ownedSkillIds.has(String(s.id)) && !neededSkills.has(String(s.id))),
      );
      doc.slash_commands = doc.slash_commands.filter((c) => {
        const name = String(c.name);
        const agent = typeof (c as { agent?: unknown }).agent === 'string'
          ? (c as { agent: string }).agent : '';
        // Drop an owned slash command only when the agent it points at is
        // being removed (i.e. no remaining pipeline still needs that agent).
        return !(ownedSlashNames.has(name) && agent !== '' && !neededAgents.has(agent));
      });
      doc.pipelines = doc.pipelines.filter((p) => String(p.id) !== id);

      // `.claude/commands/<phase>.md` files for phases no longer referenced
      // by any remaining pipeline. Stashed for the FS cleanup below.
      const removeCmdIds = new Set<string>(
        [...myPhaseIds].filter((pid) => !neededStepNames.has(pid)),
      );
      Object.assign(this, { _lastDeletePhaseIds: removeCmdIds });
    });

    const toRemove: Set<string> = (this as unknown as { _lastDeletePhaseIds?: Set<string> })
      ._lastDeletePhaseIds ?? new Set();

    const root = this.getRootOrWarn();
    if (root) {
      const commandsDir = path.join(root, '.claude', 'commands');
      if (fs.existsSync(commandsDir)) {
        for (const file of fs.readdirSync(commandsDir)) {
          if (!file.endsWith('.md')) { continue; }
          const cmdId = file.slice(0, -3);
          if (toRemove.has(cmdId)) {
            try { fs.unlinkSync(path.join(commandsDir, file)); } catch { /* non-fatal */ }
          }
        }
      }
    }

    // Overlap source = workflows still applied in workspace.yaml after the
    // delete. If the user removes their only applied pipeline, every file
    // gets cleaned up — even shared ones — because nothing else needs them.
    // Falling back to "any globally-installed workflow" would over-preserve
    // (the parallel + sequential workflows share `templates/sdlc/`, so each
    // sees the other as installed even when neither is applied).
    const root2 = this.getRootOrWarn();
    const remainingPipelines = root2 ? (readYaml(root2)?.pipelines ?? []) : [];
    const preserveWorkflowIds = remainingPipelines
      .map((p) => getBuiltinWorkflowByPipelineId(String(p.id))?.id)
      .filter((id): id is string => Boolean(id));
    uninstallWorkflowGlobalsByIds(
      [builtin.id],
      undefined,
      this.extensionUri.fsPath,
      preserveWorkflowIds,
    );
    this.refresh();
  }

  private async deleteItem(
    field: 'agents' | 'skills' | 'pipelines',
    id: string,
    /** Webview already confirmed via inline modal — skip the VS Code dialog. */
    skipConfirm = false,
  ): Promise<void> {
    if (!id) { return; }
    if (!skipConfirm) {
      const confirm = await vscode.window.showWarningMessage(
        `Delete ${field.replace(/s$/, '')} \`${id}\`?`,
        { modal: true }, 'Delete', 'Cancel',
      );
      if (confirm !== 'Delete') { return; }
    }
    this.mutateYaml((doc) => {
      const arr = doc[field];
      if (!Array.isArray(arr)) { return false; }
      const idx = arr.findIndex((x) => x.id === id);
      if (idx < 0) { return false; }
      arr.splice(idx, 1);
    });
  }

  private async renameItem(
    field: 'agents' | 'skills' | 'pipelines',
    id: string,
    /** Webview already prompted via inline RenameModal — use this directly
     * and skip the VS Code input box. Falsy for command-palette flows. */
    newIdArg?: string,
  ): Promise<void> {
    if (!id) { return; }
    let newId = newIdArg;
    if (!newId) {
      newId = await vscode.window.showInputBox({
        prompt: `New ID for ${field.replace(/s$/, '')} \`${id}\``,
        value: id,
        validateInput: (v) => v && v.trim() ? null : 'ID cannot be empty',
      });
    }
    const trimmed = newId?.trim();
    if (!trimmed || trimmed === id) { return; }
    this.mutateYaml((doc) => {
      const arr = doc[field];
      if (!Array.isArray(arr)) { return false; }
      const item = arr.find((x) => x.id === id);
      if (!item) { return false; }
      if (arr.some((x) => x.id === trimmed)) { return false; }
      item.id = trimmed;
      // Renaming a pipeline must carry its live references along — slash
      // commands point at the pipeline by id, so leaving them stale would
      // silently break `/start-epic`-style entry points.
      if (field === 'pipelines' && Array.isArray(doc.slash_commands)) {
        for (const cmd of doc.slash_commands as Array<{ pipeline?: unknown }>) {
          if (cmd.pipeline === id) { cmd.pipeline = trimmed; }
        }
      }
    });
  }

  private async duplicateItem(field: 'agents' | 'skills' | 'pipelines', id: string): Promise<void> {
    if (!id) { return; }
    this.mutateYaml((doc) => {
      const arr = doc[field];
      if (!Array.isArray(arr)) { return false; }
      const item = arr.find((x) => x.id === id);
      if (!item) { return false; }
      const newId = id + '-copy';
      const suffix = arr.filter((x) => String(x.id).startsWith(newId)).length;
      const finalId = suffix === 0 ? newId : newId + '-' + suffix;
      const clone = JSON.parse(JSON.stringify(item));
      clone.id = finalId;
      const idx = arr.findIndex((x) => x.id === id);
      arr.splice(idx + 1, 0, clone);
    });
  }

  private async togglePipelineFailure(pipelineId: string): Promise<void> {
    if (!pipelineId) { return; }
    this.mutateYaml((doc) => {
      const p = doc.pipelines.find((x) => x.id === pipelineId);
      if (!p) { return false; }
      p.on_failure = p.on_failure === 'continue' ? 'stop' : 'continue';
    });
  }

  private async startPipelineRunForEpic(epicId: string, pipelineId: string): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) { return; }
    const doc = readYaml(root);
    if (!doc) {
      void vscode.window.showWarningMessage('AIDLC: no workspace.yaml found.');
      return;
    }
    const pipeline = (doc.pipelines as PipelineConfig[] | undefined)?.find((p) => p.id === pipelineId);
    if (!pipeline) {
      void vscode.window.showWarningMessage(`Pipeline "${pipelineId}" not found.`);
      return;
    }
    const existing = RunStateStore.load(root, epicId);
    if (existing) {
      void vscode.window.showInformationMessage(
        `Run "${epicId}" already exists (status: ${existing.status}).`,
      );
      return;
    }
    const epic = listEpics(root, doc).find((x) => x.id === epicId);
    const context: Record<string, string> = { epic: epicId };
    if (epic) {
      try {
        const inputsPath = path.join(epic.epicDir, 'inputs.json');
        if (fs.existsSync(inputsPath)) {
          const parsed = JSON.parse(fs.readFileSync(inputsPath, 'utf8'));
          if (parsed && typeof parsed === 'object') {
            for (const [k, v] of Object.entries(parsed)) {
              if (typeof v === 'string') { context[k] = v; }
            }
          }
        }
      } catch { /* ignore */ }
    }
    try {
      const runState = startRun({ runId: epicId, pipeline, context });
      RunStateStore.save(root, runState);
      mirrorRunStateToEpic(root, runState, readYaml(root));
      void vscode.window.showInformationMessage(
        `Pipeline run "${epicId}" started — current step: ${runState.steps[runState.currentStepIdx].agent}.`,
      );
      this.refresh();
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Failed to start pipeline run: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── HTML shell ──────────────────────────────────────────────────────────

  private getHtml(): string {
    const nonce = makeNonce();
    const webview = this.panel.webview;
    const cspSource = webview.cspSource;
    const fallback = missingBundleHtml(this.extensionUri.fsPath, 'workspace.js', cspSource, nonce);
    if (fallback) { return fallback; }
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) { this.ensureWorkflowTemplates(root); }
    const initialState = buildState(this.currentView);
    const initialTheme = themeManager.current;

    const assetsRoot = vscode.Uri.joinPath(this.extensionUri, 'out', 'webviews');
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'styles.css')).toString();
    const entryUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'workspace.js')).toString();

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none';
           img-src ${cspSource} https: data:;
           font-src ${cspSource} https: data:;
           style-src ${cspSource} 'unsafe-inline';
           script-src 'nonce-${nonce}' ${cspSource};">
<title>AIDLC Workspace</title>
<link rel="stylesheet" href="${cssUri}">
</head>
<body>
<div id="app"></div>
<script nonce="${nonce}">
window.__AIDLC_INITIAL_STATE__ = ${JSON.stringify(initialState)};
window.__AIDLC_INITIAL_THEME__ = ${JSON.stringify(initialTheme)};
</script>
<script type="module" nonce="${nonce}" src="${entryUri}"></script>
</body>
</html>`;
  }
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) { out += chars[Math.floor(Math.random() * chars.length)]; }
  return out;
}
