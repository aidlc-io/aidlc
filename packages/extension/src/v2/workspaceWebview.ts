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
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** Diagnostics for the recipe classifier / requirement loader (Output → "AIDLC Recipe"). */
let recipeLog: vscode.OutputChannel | undefined;
function rlog(msg: string): void {
  if (!recipeLog) { recipeLog = vscode.window.createOutputChannel('AIDLC Recipe'); }
  recipeLog.appendLine(msg);
}

/**
 * Run the `claude` CLI headlessly with stdin CLOSED. Closing stdin (`'ignore'`)
 * is essential: with an open-but-empty stdin pipe, `claude --print` waits ~3s
 * for piped input and prints a "no stdin data received" warning that pollutes
 * output. Mirrors DefaultRunner's stdio. Resolves stdout on exit 0; rejects
 * with `{ stderr }` attached otherwise (or on timeout).
 */
function runClaude(
  args: string[],
  opts: { cwd: string; timeoutMs: number; onChunk?: (chunk: string) => void },
): Promise<string> {
  return new Promise((resolve, reject) => {
    // VS Code launched from the Dock has a minimal PATH (no node/npx/claude
    // from nvm/homebrew), which makes `claude` (and the stdio MCP servers it
    // spawns) fail. Augment PATH with the common install locations.
    const extraPath = ['/opt/homebrew/bin', '/usr/local/bin', `${process.env.HOME ?? ''}/.local/bin`]
      .filter(Boolean)
      .join(':');
    const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${process.env.PATH ?? ''}:${extraPath}` };
    // Use the user's own `claude` login (claude.ai subscription), not any
    // inherited API key / session vars — a stale or scoped ANTHROPIC_API_KEY
    // (e.g. inherited when VS Code is launched from a Claude Code session)
    // makes the spawned CLI fail with "Invalid API key".
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
    delete env.ANTHROPIC_BASE_URL;
    delete env.CLAUDE_CODE_ENTRYPOINT;
    delete env.CLAUDE_CODE_SESSION_ID;
    delete env.CLAUDE_CODE_EXECPATH;
    const proc = spawn('claude', args, { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'], env });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('Timed out waiting for the source (the MCP may be slow or unavailable).'));
    }, opts.timeoutMs);
    proc.stdout.on('data', (d: Buffer) => {
      const s = d.toString('utf8');
      out += s;
      opts.onChunk?.(s);
    });
    proc.stderr.on('data', (d: Buffer) => { err += d.toString('utf8'); });
    proc.on('error', (e) => { clearTimeout(timer); rlog(`[runClaude] spawn error: ${String(e)}`); reject(e); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      rlog(`[runClaude] exit=${code}\n  stdout: ${out.trim().slice(0, 600)}\n  stderr: ${err.trim().slice(0, 600)}`);
      if (code === 0) { resolve(out); }
      else { reject(Object.assign(new Error(`claude exited ${code}`), { stderr: err, stdout: out })); }
    });
  });
}

/**
 * Per-source "how to fetch" actions for the `claude` CLI. Claude uses whatever
 * MCP integrations the user has configured (Atlassian, GitHub, Google Drive,
 * web fetch) to retrieve the content. The analysis/JSON spec is appended by
 * {@link WorkspaceWebview.loadRequirementForWebview}.
 */
/** Human label per requirement source, for user-facing messages. */
const SOURCE_LABEL: Record<string, string> = {
  jira: 'Jira', github: 'GitHub', drive: 'Google Drive', url: 'web',
};

const REQUIREMENT_FETCH_ACTION: Record<string, string> = {
  jira:
    'Read the SINGLE Jira issue named in the user message (a key like PROJ-123 or a browse URL): ' +
    'resolve the cloud id if needed, then fetch only that one issue\'s `summary` and `description` fields. ' +
    'Do NOT search, do NOT run JQL, do NOT fetch or enumerate child / linked / related issues, do NOT read files. ' +
    'As soon as you have the summary, STOP and answer — if the description is empty or null, answer immediately ' +
    'using only the summary. Do not look for more context.',
  github:
    'Fetch the GitHub issue or pull request named in the user message (a `owner/repo#123` ref ' +
    'or a github.com URL) using the GitHub CLI via the Bash tool — NOT a web fetch, NOT an MCP tool. ' +
    'Parse the owner, repo and number from the ref, then run exactly one command: ' +
    '`gh issue view <number> --repo <owner>/<repo> --json title,body` ' +
    '(use `gh pr view` instead when the URL path contains /pull/). ' +
    'If that command errors, output NO_CONTENT. Do not browse the web, do not enumerate other issues.',
  drive:
    'Make ONE Google Drive tool call to read only the document named in the user message (a Drive URL or file id).',
  url:
    'Fetch the URL in the user message once and read its main content (the requirement / spec). Do not crawl other pages.',
};

/** Parse a GitHub issue/PR reference (`owner/repo#123` or a github.com URL). */
function parseGithubRef(ref: string): { owner: string; repo: string; num: string; kind: 'issue' | 'pr' } | null {
  const short = ref.trim().match(/^([\w.-]+)\/([\w.-]+)#(\d+)$/);
  if (short) { return { owner: short[1], repo: short[2], num: short[3], kind: 'issue' }; }
  const url = ref.match(/github\.com\/([\w.-]+)\/([\w.-]+)\/(issues|pull)\/(\d+)/);
  if (url) { return { owner: url[1], repo: url[2], num: url[4], kind: url[3] === 'pull' ? 'pr' : 'issue' }; }
  return null;
}

/**
 * Fetch a GitHub issue/PR directly with the `gh` CLI (host-side, ~1s) instead
 * of routing through the agentic `claude` loop — there's no GitHub claude.ai
 * connector, so the agent would otherwise wander for a minute+. Requires `gh`
 * on PATH + an authenticated login (the extension host inherits the user env).
 */
async function fetchGithubViaGh(ref: string): Promise<{ title: string; body: string; num: string }> {
  const p = parseGithubRef(ref);
  if (!p) {
    throw new Error('Could not parse a GitHub `owner/repo#123` ref or issue/PR URL from the input.');
  }
  const extraPath = ['/opt/homebrew/bin', '/usr/local/bin', `${process.env.HOME ?? ''}/.local/bin`]
    .filter(Boolean).join(':');
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${process.env.PATH ?? ''}:${extraPath}` };
  const { stdout } = await execFileAsync(
    'gh',
    [p.kind === 'pr' ? 'pr' : 'issue', 'view', p.num, '--repo', `${p.owner}/${p.repo}`, '--json', 'title,body'],
    { env, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
  );
  const j = JSON.parse(stdout) as { title?: string; body?: string };
  return { title: String(j.title ?? ''), body: String(j.body ?? ''), num: p.num };
}

/**
 * Surface the useful part of a `claude` failure. In `--print` mode Claude
 * often writes the real error to stdout, so check both streams before falling
 * back to the bare "claude exited N" message.
 */
function describeExecError(err: unknown): string {
  const e = err as { stderr?: unknown; stdout?: unknown; message?: unknown };
  const stderr = typeof e?.stderr === 'string' ? e.stderr.trim() : '';
  const stdout = typeof e?.stdout === 'string' ? e.stdout.trim() : '';
  const detail = stderr || stdout;
  if (detail) {
    return detail.split('\n').filter(Boolean).slice(-4).join(' ').slice(0, 500);
  }
  const msg = typeof e?.message === 'string' ? e.message : String(err);
  if (msg.includes('ENOENT')) { return '`claude` CLI not found on PATH.'; }
  return msg.slice(0, 400);
}

import * as jsYaml from 'js-yaml';
import { readYaml, writeYaml, type YamlDocument } from './yamlIO';
import {
  WORKSPACE_DIR,
  WORKSPACE_FILENAME,
  stepAgentId,
  stepDagId,
  normalizeStep,
  discoverAssets,
  RunStateStore,
  startRun,
  targetPath,
  validateWorkspace,
  assemblePipeline,
  recipePipelineId,
  PipelineAssembleError,
  heuristicClassify,
  buildClassificationPrompt,
  parseClassificationVerdict,
  slugEpicId,
  scaffoldEpic,
  EpicScaffoldError,
  installAnnotationTools,
  setEpicMemoryHook,
  isEpicMemoryHookEnabled,
} from '@aidlc/core';
import { SKILL_TEMPLATES } from './skillTemplates';
import {
  loadBuiltinPreset,
  planRecipeMigration,
  getBuiltinPipelineSummary,
  getBuiltinArtifactTemplates,
  getBuiltinWorkflowByPipelineId,
  getAllBuiltinPipelineSummaries,
  getBuiltinRecipeSummaries,
  resolvePrimaryStack,
  builtinClaudeCommand,
  pipelineCommandId,
  writeBuiltinAutoReviewValidators,
  BUILTIN_WORKFLOWS,
} from './builtinPresets';
import { resolveTechStackForRoot } from './techStackResolver';
import { artifactLookupKeys } from './techStackDetector';
import { uninstallWorkflowGlobalsByIds, installWorkflowGlobalsByIds } from './globalDefaultsInstaller';
import { PresetStore } from './presetStore';
import type {
  PipelineStepConfig,
  AssetScope,
  DiscoveredAsset,
  PipelineConfig,
  RecipeConfig,
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
import { scaffoldRequirementAnalysis } from './requirementWizard';
import { missingBundleHtml } from './webviewBundleGuard';
import { writeEpicsDirToYaml, DEFAULT_EPICS_DIR } from './epicsDirSync';

// ── Shared helper: open/reuse the Claude terminal and send a slash command ───

const CLAUDE_TERMINAL_NAME = 'AIDLC · Claude';

/**
 * Open (or reuse) the Claude REPL terminal and run `slash` immediately.
 *
 * Always sends `claude '<slash>'` rather than the bare slash command.
 * This handles two cases safely:
 *   - Terminal exists but claude already exited (zsh is active) → `claude 'cmd'`
 *     boots a new claude session and runs the command as the first message.
 *   - No terminal yet → create one, wait for shell integration, then run.
 *
 * The previous approach of `sendText(slash, true)` to an existing terminal
 * broke when claude had exited — zsh received the slash as a file path.
 */
function runSlashCommandInClaude(slash: string, root: string): void {
  const escaped = slash.replace(/'/g, "'\\''");
  const oneShot = `claude '${escaped}'`;

  const existing = vscode.window.terminals.find((t) => t.name === CLAUDE_TERMINAL_NAME);
  if (existing) {
    existing.show(false);
    // Send `claude 'slash'` — works whether claude is running or not:
    // - Shell prompt: starts claude with slash as the first message.
    // - Claude REPL: unlikely during a fresh analyze submit, but harmless.
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

// ── Webview-side type shapes (must mirror src/webview/lib/types.ts) ───────

type WorkspaceView = 'builder' | 'epics' | 'analyze' | 'tests';

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

/** A task-type recipe surfaced to the Start-Epic modal. */
interface RecipeSummary {
  id: string;
  description?: string;
  /** Source pipeline id the recipe draws from (resolved; first pipeline if unset). */
  from: string;
  /** Selected step ids, in order. */
  steps: string[];
  /** Resolved agent ids (ordered) for capability prompts in the modal. */
  agents: string[];
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
  /** Skill entries to register for the agent. Built-in agents bring their
   *  real preset skills (e.g. aidlc-prd, aidlc-implement); custom file-based
   *  agents get a single synthesized `<id>-skill` pointing at their persona. */
  skills: Array<{ id: string; path: string }>;
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
  /** True for folders with no state.json/pipeline, synthesized from artifacts. */
  artifactsOnly?: boolean;
  /** Aggregate token usage for the epic. */
  tokenUsage?: EpicTokenUsage;
}

interface RequirementRunSummary {
  id: string;
  createdAt: string;
  platform: string;
  parentTask: string;
  source: string;
  status: 'pending' | 'complete';
  taskCount: number | null;
  hasRequirements?: boolean;
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
  recipes: RecipeSummary[];
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
  /** Built-in AIDLC SDLC pipeline — prefilled by the Add-pipeline modal. */
  defaultPipeline?: PipelineSummary;
  /** Suggested next sequential id for the inline Start-Epic modal. */
  nextEpicId: string;
  /** All existing epic ids (folders under epicRoot) — for uniqueness check. */
  existingEpicIds: string[];
  requirementRuns?: RequirementRunSummary[];
  initialView?: WorkspaceView;
  testAgentConfigExists?: boolean;
  testAgentTargets?: { name: string; filePath: string; adapter?: string; url?: string }[];
  /** Whether the epic-memory auto-load hook is enabled in ~/.claude/settings.json. */
  epicMemoryHookEnabled: boolean;
  /** Current epics directory (relative path from project root). */
  epicsDir: string;
}

const SKILL_TEMPLATE_REFS: SkillTemplateRef[] = SKILL_TEMPLATES.map((t) => ({
  id: t.id,
  description: t.description,
  category: t.category,
}));

// ── State builders ────────────────────────────────────────────────────────

/**
 * Resolve a raw recipe entry into a {@link RecipeSummary}, mapping its step
 * ids to the source pipeline's agent ids (in recipe order). Returns null when
 * the recipe is malformed or its source pipeline is missing — those surface
 * as load-time warnings elsewhere, not in the picker.
 */
function buildRecipeSummary(
  r: Partial<RecipeConfig>,
  pipelines: PipelineConfig[],
): RecipeSummary | null {
  if (!r || typeof r.id !== 'string' || !Array.isArray(r.steps)) { return null; }
  const source = r.from
    ? pipelines.find((p) => String(p.id) === r.from)
    : pipelines[0];
  if (!source || !Array.isArray(source.steps)) { return null; }
  const agentByStep = new Map<string, string>();
  for (const raw of source.steps as PipelineStepConfig[]) {
    agentByStep.set(stepDagId(raw), stepAgentId(raw));
  }
  const agents = r.steps
    .map((id) => agentByStep.get(id))
    .filter((a): a is string => typeof a === 'string');
  return {
    id: r.id,
    description: typeof r.description === 'string' ? r.description : undefined,
    from: String(source.id),
    steps: r.steps,
    agents,
  };
}

function buildState(initialView: WorkspaceView): WorkspaceState {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return {
      hasFolder: false,
      workspaceName: '',
      configExists: false,
      agents: [], skills: [], pipelines: [], recipes: [], epics: [],
      agentMeta: {}, slashCommandsByAgent: {},
      agentsCount: 0, skillsCount: 0, pipelinesCount: 0, epicsCount: 0,
      runIds: [],
      skillTemplates: SKILL_TEMPLATE_REFS,
      nextEpicId: 'EPIC-001',
      existingEpicIds: [],
      requirementRuns: [],
      initialView,
      testAgentConfigExists: false,
      testAgentTargets: [],
      epicMemoryHookEnabled: isEpicMemoryHookEnabled(os.homedir()),
      epicsDir: DEFAULT_EPICS_DIR,
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
    // No workspace yet: still offer the built-in common pipeline + Auto recipes
    // in Start Epic. Picking either materializes the workspace at Start time
    // (ensureBuiltinInWorkspace), so the user skips a separate "init" step.
    const builtinPipelines: PipelineSummary[] = getAllBuiltinPipelineSummaries().map((p) => ({
      id: p.id,
      name: p.name,
      builtin: true,
      on_failure: p.on_failure,
      steps: p.steps.map((s) => ({
        agent: s.agent, name: s.name, skills: s.skills, enabled: s.enabled,
        produces: s.produces, requires: s.requires, depends_on: s.depends_on,
        human_review: s.human_review, auto_review: s.auto_review,
      })),
    }));
    return {
      hasFolder: true,
      workspaceName: folder.name,
      configExists: false,
      agents, skills,
      pipelines: builtinPipelines,
      recipes: getBuiltinRecipeSummaries(),
      epics,
      agentMeta, slashCommandsByAgent,
      agentsCount: agents.length,
      skillsCount: skills.length,
      pipelinesCount: builtinPipelines.length,
      epicsCount: epics.length,
      runIds: listRunIds(root),
      skillTemplates: SKILL_TEMPLATE_REFS,
      nextEpicId: suggestNextEpicId(epicIds0),
      existingEpicIds: epicIds0,
      requirementRuns: scanRequirementRuns(root),
      initialView,
      ...(() => { const ta = readTestAgentTargets(root); return { testAgentConfigExists: ta.exists, testAgentTargets: ta.targets }; })(),
      epicMemoryHookEnabled: isEpicMemoryHookEnabled(os.homedir()),
      epicsDir: DEFAULT_EPICS_DIR,
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
            produces_contains: norm.produces_contains,
            requires: norm.requires,
            depends_on: norm.depends_on,
            human_review: norm.human_review,
            auto_review: norm.auto_review,
            auto_review_runner: norm.auto_review_runner,
            auto_review_timeout_ms: norm.auto_review_timeout_ms,
          };
        })
      : [],
  }));

  // Recipes → summaries, resolving each to its source pipeline's agents so
  // the modal can show step count + capability prompts without re-deriving.
  const recipes: RecipeSummary[] = (Array.isArray(doc.recipes) ? doc.recipes : [])
    .map((r) => buildRecipeSummary(r as Partial<RecipeConfig>, doc.pipelines as PipelineConfig[]))
    .filter((r): r is RecipeSummary => r !== null);
  rlog(`[state] ${folder.name}: recipes=${recipes.length} (raw=${Array.isArray(doc.recipes) ? doc.recipes.length : 0}), pipelines=${pipelines.length}`);

  const epicRoot = readEpicRoot(doc);
  const epicIds = listEpicIdsFromDir(root, epicRoot);

  return {
    hasFolder: true,
    workspaceName: folder.name,
    configExists: true,
    agents, skills, pipelines, recipes, epics,
    agentMeta, slashCommandsByAgent,
    agentsCount: agents.length,
    skillsCount: skills.length,
    pipelinesCount: pipelines.length,
    epicsCount: epics.length,
    runIds: listRunIds(root),
    skillTemplates: SKILL_TEMPLATE_REFS,
    defaultPipeline: BUILTIN_WORKFLOWS[0]
      ? getBuiltinPipelineSummary(BUILTIN_WORKFLOWS[0])
      : undefined,
    nextEpicId: suggestNextEpicId(epicIds),
    existingEpicIds: epicIds,
    requirementRuns: scanRequirementRuns(root),
    initialView,
    ...(() => { const ta = readTestAgentTargets(root); return { testAgentConfigExists: ta.exists, testAgentTargets: ta.targets }; })(),
    epicMemoryHookEnabled: isEpicMemoryHookEnabled(os.homedir()),
    epicsDir: epicRoot,
  };
}

function scanRequirementRuns(root: string): RequirementRunSummary[] {
  const dir = path.join(root, 'docs', 'task-breakdowns');
  if (!fs.existsSync(dir)) { return []; }
  const results: RequirementRunSummary[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || !/^REQ-\d+$/i.test(e.name)) { continue; }
      const runDir = path.join(dir, e.name);
      const inputsPath = path.join(runDir, 'inputs.json');
      if (!fs.existsSync(inputsPath)) { continue; }
      let inputs: Record<string, string> = {};
      try { inputs = JSON.parse(fs.readFileSync(inputsPath, 'utf8')) as Record<string, string>; } catch { continue; }
      const tasksJsonPath = path.join(runDir, 'tasks.json');
      const tasksMdPath = path.join(runDir, 'tasks.md');
      const reqMdPath = path.join(runDir, 'requirements.md');
      const hasTasks = fs.existsSync(tasksJsonPath) || fs.existsSync(tasksMdPath);
      const hasRequirements = fs.existsSync(reqMdPath);
      let taskCount: number | null = null;
      if (fs.existsSync(tasksJsonPath)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(tasksJsonPath, 'utf8')) as unknown[];
          taskCount = Array.isArray(parsed) ? parsed.length : null;
        } catch { /* ignore */ }
      }
      const stat = fs.statSync(inputsPath);
      const createdAt = stat.mtime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      results.push({
        id: e.name,
        createdAt,
        platform: inputs.task_platform ?? 'local',
        parentTask: inputs.parent_task ?? '',
        source: inputs.requirements_source ?? '',
        status: hasTasks ? 'complete' : 'pending',
        taskCount,
        hasRequirements,
      });
    }
  } catch { /* ignore */ }
  return results.reverse();
}

function readTestAgentTargets(root: string): { exists: boolean; targets: { name: string; filePath: string; adapter?: string; url?: string }[] } {
  const configPath = path.join(root, 'testagent.config.yaml');
  if (!fs.existsSync(configPath)) { return { exists: false, targets: [] }; }
  try {
    const doc = jsYaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    const rawIncludes = Array.isArray(doc?.targets) ? (doc.targets as unknown[]) : [];
    const targets: { name: string; filePath: string; adapter?: string; url?: string }[] = [];
    for (const entry of rawIncludes) {
      const include = (entry as { include?: unknown }).include;
      if (typeof include !== 'string') { continue; }
      const dir = path.join(root, path.dirname(include));
      const ext = path.basename(include).replace(/^\*/, '');
      if (!fs.existsSync(dir)) { continue; }
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith(ext)) { continue; }
        const filePath = path.join(dir, file);
        try {
          const td = jsYaml.load(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
          targets.push({
            name: typeof td?.name === 'string' ? td.name : path.basename(file, ext),
            filePath,
            adapter: typeof td?.adapter === 'string' ? td.adapter : undefined,
            url: typeof td?.url === 'string' ? td.url : undefined,
          });
        } catch {
          targets.push({ name: path.basename(file, ext), filePath });
        }
      }
    }
    return { exists: true, targets };
  } catch {
    return { exists: true, targets: [] };
  }
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
      slashCommand: s.slashCommand,
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
    artifactsOnly: e.artifactsOnly,
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

/** Render an epic-memory.json object as a readable Markdown digest. */
function formatEpicMemoryMarkdown(mem: Record<string, unknown>, epicId: string): string {
  const esc = (v: unknown) => String(v ?? '');
  const entries = Array.isArray(mem.entries) ? (mem.entries as Array<Record<string, unknown>>) : [];
  const reflections = Array.isArray(mem.reflections) ? (mem.reflections as Array<Record<string, unknown>>) : [];
  const lines: string[] = [`# Epic memory — ${esc(mem.epic) || epicId}`];
  if (mem.updatedAt) { lines.push('', `_updated ${esc(mem.updatedAt)}_`); }
  if (mem.summary) { lines.push('', '## Summary', '', esc(mem.summary)); }
  if (entries.length) {
    lines.push('', '## Context & decisions', '');
    for (const e of entries) {
      const who = [e.author, e.at].filter(Boolean).map(esc).join(', ');
      lines.push(`- **[${esc(e.kind) || 'note'}]** ${esc(e.text)}${who ? `  \n  _— ${who}_` : ''}`);
    }
  }
  if (reflections.length) {
    lines.push('', '## Reflections — prompt/work better next time', '');
    for (const r of reflections) {
      const who = [r.author, r.at].filter(Boolean).map(esc).join(', ');
      lines.push(`- ${esc(r.text)}${who ? `  \n  _— ${who}_` : ''}`);
    }
  }
  if (entries.length === 0 && reflections.length === 0 && !mem.summary) {
    lines.push('', '_(empty — add entries with `/epic-context` while working the epic)_');
  }
  return lines.join('\n') + '\n';
}

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

  static openAnalyze(extensionUri: vscode.Uri): void {
    WorkspaceWebview.show(extensionUri, 'analyze');
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

      const breakdownPattern = new vscode.RelativePattern(
        vscode.Uri.file(root),
        'docs/task-breakdowns/**',
      );
      const breakdownWatcher = vscode.workspace.createFileSystemWatcher(breakdownPattern);
      breakdownWatcher.onDidChange(refresh, null, this.disposables);
      breakdownWatcher.onDidCreate(refresh, null, this.disposables);
      breakdownWatcher.onDidDelete(refresh, null, this.disposables);
      this.disposables.push(breakdownWatcher);
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

  /**
   * Start the full /annotate-artifact review loop for an artifact in one click.
   *
   * Opens a Claude Code terminal running `claude "/annotate-artifact <epic> <file>"`.
   * The skill (installed into ~/.claude on activation) renders the .md to HTML,
   * opens it in the vendored annotron, then *polls* for the user's annotations,
   * applies them back to the .md, logs a revision, and re-renders. Polling is the
   * receiving half the extension itself can't do — it isn't the agent — which is
   * why the button hands off to Claude rather than just opening annotron. Markdown
   * stays canonical.
   *
   * Requires the `claude` CLI on the terminal's PATH (AIDLC users have it). If it
   * isn't installed the terminal shows the error; the user can still run the
   * renderer + annotron by hand.
   */
  private annotateArtifact(epicDir: string, filename: string): void {
    const epicId = path.basename(epicDir);
    const skillCmd = `/annotate-artifact ${epicId} ${filename}`;
    const termName = `AIDLC · Annotate: ${epicId}/${filename}`;

    // Reuse the terminal only if a loop is still *live* for this artifact.
    // A terminal whose Claude process already exited keeps its name in the
    // panel; reusing it would just re-focus a dead shell and never re-run the
    // command (the reported "click does nothing once the HTML already exists"
    // bug). exitStatus is defined once the process has ended → treat as stale.
    const existing = vscode.window.terminals.find((t) => t.name === termName);
    if (existing) {
      if (existing.exitStatus === undefined) { existing.show(false); return; }
      existing.dispose();
    }

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const cwd = root && fs.existsSync(root) ? root : epicDir;
    const terminal = vscode.window.createTerminal({
      name: termName,
      cwd,
      iconPath: new vscode.ThemeIcon('comment-discussion'),
      location: vscode.TerminalLocation.Panel,
      // oh-my-zsh's weekly update prompt can swallow the launch command before
      // shell integration installs — disable it for this terminal only.
      env: { DISABLE_AUTO_UPDATE: 'true', DISABLE_UPDATE_PROMPT: 'true' },
    });
    terminal.show(false);

    // Prefer shell integration; fall back to sendText for shells without it.
    // Mirrors aidlc.openClaudeTerminal.
    const launch = `claude ${JSON.stringify(skillCmd)}`;
    let sent = false;
    const integ = vscode.window.onDidChangeTerminalShellIntegration((e) => {
      if (e.terminal === terminal && e.shellIntegration && !sent) {
        sent = true;
        e.shellIntegration.executeCommand(launch);
        integ.dispose();
      }
    });
    this.disposables.push(integ);
    setTimeout(() => {
      if (!sent) { sent = true; terminal.sendText(launch, true); integ.dispose(); }
    }, 2000);

    void vscode.window.showInformationMessage(
      `Đang mở vòng annotate cho ${filename}: Claude sẽ render + mở annotron rồi tự nhận feedback và sửa .md. ` +
        `(Cần Claude CLI. Chưa có thì chạy “${skillCmd}” trong Claude Code.)`,
    );
  }

  /**
   * Show an epic's memory digest (docs/epics/<epic>/epic-memory.json) as a
   * rendered Markdown preview so anyone can read the shared context (summary,
   * decisions/constraints, reflections) without opening raw JSON.
   */
  private async openEpicMemory(epicDir: string): Promise<void> {
    const p = path.join(epicDir, 'epic-memory.json');
    if (!fs.existsSync(p)) {
      void vscode.window.showInformationMessage(
        `Epic này chưa có memory. Chạy /epic-context ${path.basename(epicDir)} trong Claude Code để bắt đầu tích luỹ context.`,
      );
      return;
    }
    let mem: Record<string, unknown>;
    try {
      mem = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      void vscode.window.showErrorMessage(`epic-memory.json không đọc được (JSON lỗi): ${p}`);
      return;
    }
    const md = formatEpicMemoryMarkdown(mem, path.basename(epicDir));
    const doc = await vscode.workspace.openTextDocument({ content: md, language: 'markdown' });
    await vscode.window.showTextDocument(doc, { preview: true });
    await vscode.commands.executeCommand('markdown.showPreview', doc.uri);
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
        if (v === 'builder' || v === 'epics' || v === 'analyze' || v === 'tests') { this.currentView = v; }
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
      case 'openAnalyzeView':
        this.setView('analyze');
        return;

      case 'openTestAgentsView':
        this.setView('tests');
        return;

      case 'runTestAgent': {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) { void vscode.window.showWarningMessage('AIDLC: Open a project folder first.'); return; }
        const command = String(msg.command ?? 'run');
        const target = typeof msg.target === 'string' && msg.target ? msg.target : undefined;
        const args = [command, ...(target ? [target] : [])].join(' ');
        const term = vscode.window.createTerminal({ name: `ata ${args}`, cwd: root });
        term.show();
        term.sendText(`ata ${args}`);
        return;
      }

      case 'openTestAgentConfig': {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) { return; }
        const cfgPath = path.join(root, 'testagent.config.yaml');
        if (!fs.existsSync(cfgPath)) { void vscode.window.showWarningMessage('testagent.config.yaml not found.'); return; }
        const doc = await vscode.workspace.openTextDocument(cfgPath);
        await vscode.window.showTextDocument(doc, { preview: false });
        return;
      }

      case 'openTargetConfig': {
        const filePath = String(msg.filePath ?? '');
        if (!filePath || !fs.existsSync(filePath)) { void vscode.window.showWarningMessage('Target config file not found.'); return; }
        const tdoc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(tdoc, { preview: false });
        return;
      }

      case 'openExternalUrl': {
        const url = String(msg.url ?? '');
        if (url) { await vscode.env.openExternal(vscode.Uri.parse(url)); }
        return;
      }
      case 'openRequirementRun': {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const rId = String(msg.runId ?? '');
        if (!root || !rId) { return; }
        const runDir = path.join(root, 'docs', 'task-breakdowns', rId);
        const fileArg = String(msg.file ?? '');
        const candidates = fileArg === 'requirements'
          ? ['requirements.md', 'inputs.json']
          : ['tasks.md', 'tasks.json', 'inputs.json'];
        let target: string | undefined;
        for (const f of candidates) {
          const p = path.join(runDir, f);
          if (fs.existsSync(p)) { target = p; break; }
        }
        if (!target) { return; }
        const doc = await vscode.workspace.openTextDocument(target);
        await vscode.window.showTextDocument(doc, { preview: false });
        return;
      }
      case 'startAnalyzeRequirements': {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) { void vscode.window.showWarningMessage('AIDLC: Open a project folder first.'); return; }
        // scaffoldRequirementAnalysis imported statically at top of file
        const runId = await scaffoldRequirementAnalysis(root, this.extensionUri.fsPath, {
          source: String(msg.source ?? ''),
          platform: String(msg.platform ?? 'local'),
          parentTask: String(msg.parentTask ?? ''),
          instruction: String(msg.instruction ?? ''),
          detailLevel: msg.detailLevel === 'brief' ? 'brief' : 'detailed',
          extraProjects: Array.isArray(msg.extraProjects) ? msg.extraProjects as Array<{type:string;ref:string;label:string}> : undefined,
          businessContext: typeof msg.businessContext === 'string' ? msg.businessContext : undefined,
          itsContext: typeof msg.itsContext === 'string' ? msg.itsContext : undefined,
        });
        if (!runId) { return; }
        this.refresh();
        runSlashCommandInClaude(`/analyze-requirements ${runId}`, root);
        return;
      }
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
          await openFolder(picked[0]);
        }
        return;
      }
      case 'startEpicPickProject': {
        const picked = await vscode.window.showOpenDialog({
          canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
          openLabel: 'Select project for epic',
          title: 'Pick the project folder where the epic will be created',
        });
        if (!picked || picked.length === 0) { return; }
        await openFolder(picked[0]);
        return;
      }
      case 'loadEpicsFromFolder': {
        const picked = await vscode.window.showOpenDialog({
          canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
          openLabel: 'Select epics folder',
          title: 'Select a folder containing epics (e.g. docs/epics from another project)',
        });
        if (!picked || picked.length === 0) { return; }
        const epicsFolder = picked[0].fsPath;
        // Walk up to find the project root (has .aidlc/workspace.yaml).
        let projectRoot: string | null = null;
        let dir = path.dirname(epicsFolder);
        for (let i = 0; i < 10; i++) {
          if (fs.existsSync(path.join(dir, WORKSPACE_DIR, WORKSPACE_FILENAME))) {
            projectRoot = dir;
            break;
          }
          const parent = path.dirname(dir);
          if (parent === dir) { break; }
          dir = parent;
        }
        if (projectRoot) {
          // Found a project — open it and set the epics dir relative to it.
          const rel = path.relative(projectRoot, epicsFolder);
          // Pre-write the epics dir so it's ready when the project opens.
          writeEpicsDirToYaml(projectRoot, rel);
          await openFolder(vscode.Uri.file(projectRoot));
        } else {
          // No project found — open the epics folder's parent as the workspace
          // and set the epics dir to point at the selected folder.
          const parent = path.dirname(epicsFolder);
          const rel = path.basename(epicsFolder);
          await openFolder(vscode.Uri.file(parent));
          // Note: the workspace.yaml may not exist yet; the setting will be
          // picked up on next activation via the VS Code setting.
          const EPICS_DIR_KEY = 'aidlc.workspace.epicsDirectory';
          void vscode.workspace.getConfiguration()
            .update(EPICS_DIR_KEY, rel, vscode.ConfigurationTarget.Workspace);
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
      case 'openHtmlFile': {
        // Read-only view of the rendered artifact — open the .html in the
        // browser (rendered), not the editor (raw source).
        const epicDir = String(msg.epicDir ?? '');
        const filename = String(msg.filename ?? '');
        if (!epicDir || !filename) { return; }
        const filePath = path.join(epicDir, 'artifacts', filename);
        if (!fs.existsSync(filePath)) {
          void vscode.window.showInformationMessage(
            `Chưa có bản HTML cho artifact này. Bấm “Feedback” để render rồi mở annotron.`,
          );
          return;
        }
        await vscode.env.openExternal(vscode.Uri.file(filePath));
        return;
      }
      case 'annotateArtifact': {
        const epicDir = String(msg.epicDir ?? '');
        const filename = String(msg.filename ?? '');
        if (!epicDir || !filename) { return; }
        this.annotateArtifact(epicDir, filename);
        return;
      }
      case 'openEpicMemory': {
        const epicDir = String(msg.epicDir ?? '');
        if (!epicDir) { return; }
        await this.openEpicMemory(epicDir);
        return;
      }
      case 'changeEpicsDir': {
        const newDir = String(msg.dir ?? '').trim();
        if (!newDir) { return; }
        const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!wsRoot) { return; }
        writeEpicsDirToYaml(wsRoot, newDir);
        // Also update the VS Code setting so the bidirectional sync stays consistent.
        const EPICS_DIR_KEY = 'aidlc.workspace.epicsDirectory';
        void vscode.workspace.getConfiguration()
          .update(EPICS_DIR_KEY, newDir, vscode.ConfigurationTarget.Workspace);
        this.refresh();
        return;
      }
      case 'browseEpicsDir': {
        const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!wsRoot) { return; }
        const picked = await vscode.window.showOpenDialog({
          canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
          defaultUri: vscode.Uri.file(wsRoot),
          openLabel: 'Select epics directory',
        });
        if (!picked || picked.length === 0) { return; }
        const abs = picked[0].fsPath;
        // Use relative path when inside the workspace, absolute otherwise.
        const rel = path.relative(wsRoot, abs);
        const dir = rel.startsWith('..') || path.isAbsolute(rel) ? abs : rel;
        writeEpicsDirToYaml(wsRoot, dir);
        const EPICS_DIR_KEY = 'aidlc.workspace.epicsDirectory';
        void vscode.workspace.getConfiguration()
          .update(EPICS_DIR_KEY, dir, vscode.ConfigurationTarget.Workspace);
        this.refresh();
        return;
      }
      case 'toggleEpicMemoryHook': {
        const enabled = msg.enabled === true;
        // Enabling needs the hook script present under ~/.claude/tools.
        if (enabled) {
          try { installAnnotationTools(this.extensionUri.fsPath); } catch { /* best-effort */ }
        }
        const r = setEpicMemoryHook(enabled, os.homedir());
        void vscode.window.showInformationMessage(
          enabled
            ? 'Epic-memory hook enabled — prompts that mention an epic auto-load its memory.'
            : 'Epic-memory hook disabled.',
        );
        void r;
        this.refresh();
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
      case 'verifyRun':
      case 'runReport':
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
      case 'loadDefaultPipelineAssets': {
        // "Load AIDLC default" in the Add-pipeline modal prefills steps that
        // reference the built-in agents/skills — make sure those exist so they
        // don't show up as "(missing)". Installs the SDLC workflow's global
        // agent + skill files (~/.claude); a refresh re-surfaces them.
        const builtin = BUILTIN_WORKFLOWS[0];
        if (builtin) {
          installWorkflowGlobalsByIds(this.extensionUri.fsPath, [builtin.id]);
          this.refresh();
        }
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
      case 'classifyBrief': {
        // Webview asks the host to classify a requirement into a recipe (the
        // classifier lives in @aidlc/core, which the webview can't bundle).
        void this.classifyBriefForWebview(String(msg.brief ?? ''));
        return;
      }
      case 'loadRequirement': {
        // Fetch a requirement from an external source (Jira / GitHub / Drive /
        // URL) via the `claude` CLI's MCP integrations.
        void this.loadRequirementForWebview(String(msg.source ?? ''), String(msg.ref ?? ''));
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
      case 'pickFolder': {
        const requestId = String(msg.requestId ?? '');
        if (!requestId) { return; }
        const picked = await vscode.window.showOpenDialog({
          canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
          openLabel: 'Select project folder',
        });
        const folderPath = picked && picked.length > 0 ? picked[0].fsPath : null;
        void this.panel.webview.postMessage({ type: 'pickFolder:reply', requestId, folderPath });
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
      // Gate fields from the inline modal. Only applied on the inline path;
      // the QuickPick path leaves the existing values (preserved via prevObj).
      if (inlineConfig) {
        const pc = Array.isArray(inlineConfig.produces_contains)
          ? (inlineConfig.produces_contains as unknown[]).map(String).filter((s) => s.length > 0)
          : [];
        if (pc.length > 0) { obj.produces_contains = pc; } else { delete obj.produces_contains; }

        const t = inlineConfig.auto_review_timeout_ms;
        if (draft.auto_review && typeof t === 'number' && Number.isFinite(t) && t > 0) {
          obj.auto_review_timeout_ms = Math.floor(t);
        } else {
          delete obj.auto_review_timeout_ms;
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
      // Merge recipes too so the Auto classifier works after scaffolding.
      const presetRecipes = (preset.workspace as { recipes?: Array<Record<string, unknown>> }).recipes ?? [];
      if (presetRecipes.length) {
        const docRecipes = (doc as { recipes?: Array<Record<string, unknown>> }).recipes ?? [];
        const existingRecipeIds = new Set(docRecipes.map((r) => String(r.id)));
        for (const r of presetRecipes) {
          if (!existingRecipeIds.has(String(r.id))) { docRecipes.push(r); }
        }
        (doc as { recipes?: Array<Record<string, unknown>> }).recipes = docRecipes;
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
      // File is namespaced by pipeline so multiple pipelines can reuse phase
      // names without colliding; the composed body is still keyed by phase id.
      const commandFile = path.join(commandsDir, `${pipelineCommandId(builtin.pipelineId, phase.id)}.md`);
      if (!fs.existsSync(commandFile)) {
        const skillBody = preset.skillContents[phase.id] ?? `# ${phase.name}\n\n${phase.description}\n`;
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
    // Resolve the project's tech stack once: `stacks` drives `{{#if}}` block
    // rendering (secondary stacks survive), `lookupKeys` picks the most
    // specific base template (e.g. implement.web-react.md → implement.web.md →
    // implement.md). Pure file reads + string ops — safe on this refresh path.
    const stacks = resolveTechStackForRoot(root);
    const lookupKeys = artifactLookupKeys(root, resolvePrimaryStack(stacks));
    for (const p of doc.pipelines) {
      const pId = String(p.id);
      const workflow = getBuiltinWorkflowByPipelineId(pId);
      if (!workflow) { continue; }
      const dir = path.join(root, WORKSPACE_DIR, 'aidlc-templates', pId);
      fs.mkdirSync(dir, { recursive: true });
      const templates = getBuiltinArtifactTemplates(this.extensionUri.fsPath, workflow, { stacks, lookupKeys });
      for (const [fileName, content] of Object.entries(templates)) {
        const dest = path.join(dir, fileName);
        if (!fs.existsSync(dest)) { fs.writeFileSync(dest, content, 'utf8'); }
      }
    }

    // Back-fill recipes for workspaces scaffolded before recipes existed, so
    // the Start-Epic "Auto" task-type suggestion has something to classify
    // against. Idempotent: planRecipeMigration returns null once recipes exist.
    const recipes = planRecipeMigration(doc as { recipes?: unknown; pipelines?: unknown });
    if (recipes) {
      (doc as { recipes?: unknown }).recipes = recipes;
      writeYaml(root, doc);
      rlog(`[migrate] back-filled ${recipes.length} recipe(s) from pipeline "${recipes[0].from}"`);
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
  /**
   * Assemble `recipeId` into a concrete pipeline named after the epic, append
   * it to workspace.yaml, and return the new pipeline id (or null on failure,
   * with a surfaced warning). Mirrors the wizard's `materializeRecipe`.
   */
  private assembleRecipeForEpic(root: string, recipeId: string, epicId: string): string | null {
    const doc = readYaml(root);
    if (!doc) {
      void vscode.window.showWarningMessage('AIDLC: no workspace.yaml — initialize first.');
      return null;
    }
    let config;
    try {
      config = validateWorkspace(doc, '.aidlc/workspace.yaml');
    } catch (err) {
      void vscode.window.showErrorMessage(
        `AIDLC: workspace.yaml is invalid — cannot generate from recipe: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }

    const taken = new Set((doc.pipelines as Array<{ id?: unknown }>).map((p) => String(p.id)));
    // Shared naming convention (core) so the CLI's `epic start` lands the same id.
    const pipelineId = recipePipelineId({ recipeId, epicId, taken });

    let pipeline;
    try {
      pipeline = assemblePipeline(config, { recipeId, pipelineId });
    } catch (err) {
      if (err instanceof PipelineAssembleError) {
        void vscode.window.showErrorMessage(`AIDLC: ${err.message}`);
        return null;
      }
      throw err;
    }

    doc.pipelines.push(pipeline as unknown as Record<string, unknown>);
    try {
      validateWorkspace(doc, '.aidlc/workspace.yaml');
    } catch (err) {
      void vscode.window.showErrorMessage(
        `AIDLC: generated pipeline failed validation — not written: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
    writeYaml(root, doc);
    return pipelineId;
  }

  /**
   * Read + analyze a requirement brief and post the chosen recipe back to the
   * webview (`recipeSuggestion`). Uses the `claude` CLI to actually understand
   * the requirement, falling back to the keyword heuristic when Claude isn't
   * available / times out / returns unparseable output. Silent on empty brief
   * / no recipes.
   */
  private async classifyBriefForWebview(brief: string): Promise<void> {
    const root = this.getRootOrWarn();
    if (!root || !brief.trim()) { return; }
    // Recipes to classify against. Prefer the workspace's own recipes, but fall
    // back to the built-ins when there's no workspace.yaml yet (or it predates
    // recipes). The Start Epic modal already offers the built-in recipes in this
    // case (getStateForWebview), so without this fallback the Auto row would
    // spin on "analyzing" forever — classifyBrief is fired but no recipeSuggestion
    // ever comes back. The built-ins are materialized into the workspace at Start.
    const doc = readYaml(root);
    let config: ReturnType<typeof validateWorkspace> | undefined;
    if (doc) { try { config = validateWorkspace(doc, '.aidlc/workspace.yaml'); } catch { /* fall back */ } }
    const recipes: RecipeConfig[] = config && config.recipes.length > 0
      ? config.recipes
      : getBuiltinRecipeSummaries();
    if (recipes.length === 0) { return; }

    const post = (
      v: { recipeId: string; confidence: string; reasoning: string; title?: string; epicId?: string },
      source: string,
    ) => {
      void this.panel.webview.postMessage({
        type: 'recipeSuggestion',
        recipeId: v.recipeId,
        confidence: v.confidence,
        reasoning: v.reasoning,
        title: v.title ?? '',
        epicId: v.epicId ?? '',
        source,
        brief,
      });
    };

    // 1) Instant heuristic so a recipe shows up immediately (no dead wait while
    //    the LLM thinks). The keyword classify is local + synchronous.
    try {
      post(heuristicClassify(brief, recipes), 'heuristic');
    } catch { /* no-op — fall through to the LLM attempt */ }

    // 2) LLM refine: analyze the requirement → recipe + suggested title + epic
    //    id, and overwrite the provisional pick when it lands. Same
    //    prompt/parser the CLI uses (core) so both pick consistently.
    try {
      const system = buildClassificationPrompt(recipes);
      // Neutral cwd: classification needs no MCP at all, so don't pay the
      // project MCP boot cost (npx sdlc / ast-graph) for it.
      const stdout = await runClaude(
        ['--print', '--append-system-prompt', system, brief],
        { cwd: os.tmpdir(), timeoutMs: 60_000 },
      );
      const verdict = parseClassificationVerdict(stdout, recipes);
      post({
        recipeId: verdict.recipeId,
        confidence: verdict.confidence,
        reasoning: verdict.reasoning,
        title: verdict.title ?? '',
        epicId: verdict.epicId ?? '',
      }, 'llm');
    } catch { /* keep the heuristic suggestion already posted */ }
  }

  /**
   * Fetch a requirement from an external source via the `claude` CLI (which
   * carries the user's MCP integrations), then analyze it into a title +
   * summary + suggested recipe, and post it back (`requirementLoaded`) so the
   * modal can auto-fill the epic. Errors come back as `requirementLoadError`
   * with the real stderr so the user can see why (e.g. the source's MCP isn't
   * available to the CLI).
   *
   * Uses `--dangerously-skip-permissions` so MCP tool calls aren't blocked by
   * the non-interactive permission prompt (which would otherwise hang/fail).
   */
  private async loadRequirementForWebview(source: string, ref: string): Promise<void> {
    const root = this.getRootOrWarn();
    if (!root || !ref.trim()) { return; }
    // NOTE: do NOT gate on workspace.yaml here. Fetching a requirement (Jira /
    // GitHub / Drive / URL) only needs `root` as the claude cwd + `ref` — it
    // never reads the workspace doc. A no-workspace project is exactly when the
    // user loads a requirement to scaffold one, so an early `if (!doc) return`
    // left the modal spinning on "Fetching…" until the 110s watchdog (the doc
    // was never used past the guard anyway).

    // GitHub: fetch directly with `gh` (host-side, ~1s) — there's no GitHub
    // connector, so the agentic path would wander for a minute+. Drop the raw
    // body straight into the description; classification runs off it after.
    if (source === 'github') {
      void this.panel.webview.postMessage({ type: 'requirementLoadStart', source, ref });
      try {
        rlog(`[github] gh fetch "${ref}" (host-side, no claude)`);
        const gh = await fetchGithubViaGh(ref);
        const summary = `${gh.title ? `${gh.title}\n\n` : ''}${gh.body}`.trim();
        rlog(`[github] gh ok — ${summary.length} chars`);
        if (!summary) { throw new Error('That GitHub issue/PR has no body to load.'); }
        void this.panel.webview.postMessage({ type: 'requirementChunk', source, ref, chunk: summary });
        void this.panel.webview.postMessage({
          type: 'requirementLoaded', source, ref, epicId: `GH-${gh.num}`, summary,
        });
      } catch (err) {
        const e = err as { code?: unknown; message?: unknown };
        const message = String(e?.code) === 'ENOENT'
          ? 'GitHub CLI (`gh`) not found on PATH — install it (and run `gh auth login`), or paste the issue text instead.'
          : describeExecError(err);
        void this.panel.webview.postMessage({ type: 'requirementLoadError', source, ref, message });
      }
      return;
    }

    // Fetch + summarize ONLY — recipe classification is decoupled (it runs
    // afterwards off the filled description), so the text shows up as soon as
    // Claude starts writing instead of waiting on the whole analysis.
    const action = REQUIREMENT_FETCH_ACTION[source] ?? REQUIREMENT_FETCH_ACTION.url;
    const system =
      `You fetch and summarize software requirements. ${action}\n\n` +
      `Write a concise plain-text summary of the requirement (2-5 sentences, ` +
      `the key intent + scope). Output ONLY the summary prose — no JSON, no ` +
      `markdown headers, no preamble like "Here is". ` +
      `If you cannot read the source for ANY reason — the tool / connector / MCP ` +
      `is unavailable or not authenticated, access is denied, or the item has no ` +
      `usable content — output EXACTLY the single token NO_CONTENT and nothing ` +
      `else. Do NOT apologize, do NOT explain why, do NOT ask the user to paste ` +
      `a URL or the text, do NOT ask any question. Just NO_CONTENT.`;

    // Tell the webview to clear the field and start streaming into it.
    void this.panel.webview.postMessage({ type: 'requirementLoadStart', source, ref });

    try {
      // Must run in the workspace root: the claude.ai connectors (Atlassian /
      // Drive) are enabled per-project, so a neutral cwd has no Jira tool. This
      // does mean the project's other MCP servers boot too — unavoidable.
      rlog(`[${source}] claude fetch "${ref}" (cwd=root, max-turns 12)`);
      // Stream stdout chunks straight into the description as they arrive.
      const stdout = await runClaude(
        ['--print', '--dangerously-skip-permissions', '--max-turns', '12', '--append-system-prompt', system, ref],
        {
          cwd: root,
          timeoutMs: 90_000,
          onChunk: (chunk) => {
            void this.panel.webview.postMessage({ type: 'requirementChunk', source, ref, chunk });
          },
        },
      );

      const raw = stdout.trim();
      const lower = raw.toLowerCase();
      // The summary sources are claude.ai *connectors* (Atlassian/GitHub/Drive),
      // authenticated interactively in the user's Claude session — a freshly
      // spawned headless `claude` often can't reach them. Despite the NO_CONTENT
      // instruction, it sometimes apologizes + asks the user to paste instead.
      // Catch the common refusal shapes (anywhere in the output) and fail fast +
      // clearly instead of streaming the apology in as if it were the requirement.
      // High-precision phrases only — a real 2-5 sentence requirement summary
      // shouldn't contain these (e.g. "provide the export button" won't match the
      // paste-the-<source> pattern, which requires jira/issue/url/ticket nearby).
      const refusalSignals: RegExp[] = [
        /\bno access to (jira|github|drive|the (jira|atlassian|github|drive|connector))/,
        /\bnot connected\b/, /\bisn'?t connected\b/,
        /\bcannot authenticate\b/, /\bcan'?t authenticate\b/, /\bnot authenticated\b/,
        // First-person inability: "I don't have access to…", "I can't reach…", "I'm unable to fetch…"
        /\bi(?:'m| am)?\s+(can'?t|cannot|could ?n'?t|do(?:n'?t| not)\s+have|am unable to|was unable to|unable to)\b.{0,40}\b(access|fetch|retrieve|reach|read|load|get|connect|tool|connector|mcp|jira|issue|ticket)/,
        /\bunable to (access|fetch|retrieve|reach|read|load|connect)/,
        // "the tool/connector/server/integration … (aren't|isn't|not) (currently) available/connected/authenticated"
        /\b(tool|connector|server|integration|mcp)s?\b.{0,40}\b(aren'?t|isn'?t|is ?not|are ?not|not|un)\s*(currently\s+)?(available|connected|accessible|authenticated|reachable|enabled)/,
        // "may need authentication", "needs to be authenticated"
        /\b(may |might |it |that )?needs?\s+(to be )?(authenticat|to authenticat|sign|log)/,
        // The assistant asking the user to help it fetch
        /\bcould you (either|please)\b/,
        /\b(paste|copy[- ]?paste|share|provide)\b.{0,20}\b(jira|issue|url|link|ticket|requirement|summary|description)\b/,
      ];
      const connectorIssue = refusalSignals.some((re) => re.test(lower));
      const hitMaxTurns = /reached max turns|max turns/.test(lower);
      const noContent = !raw || /\bno_content\b/i.test(raw);
      if (connectorIssue || hitMaxTurns || noContent || /^error[:\s]/i.test(raw)) {
        const label = SOURCE_LABEL[source] ?? 'source';
        // The auto-fetch runs a headless `claude`, which only loads MCP servers
        // from the CLI config (user/project scope) — NOT the claude.ai *app*
        // connectors (those are interactive-only). So a working connector in the
        // chat doesn't mean the headless fetch can see it. The fix is to add an
        // CLI-scoped, OAuth-authenticated MCP server (no API token needed).
        const enableHint = `Couldn't reach ${label}: the auto-fetch runs a headless \`claude\`, which only uses MCP servers in your CLI config — not the claude.ai app connectors. `
          + `Add + authenticate a CLI-scoped ${label} MCP server once (run \`claude\` here → \`/mcp\` → authenticate; OAuth, no API token), then retry — or just paste the requirement text below.`;
        throw new Error(
          connectorIssue || noContent
            ? enableHint
            : hitMaxTurns
              ? `Claude hit its step limit before reading the ${label} item — try again, or paste the text.`
              : `Could not read the ${label} item. Paste the requirement text instead.`,
        );
      }

      // Natural epic id per source: Jira key (LH-50732), GitHub issue (GH-123),
      // else a slug derived from the summary's first line.
      let suggestedEpicId = '';
      if (source === 'jira') {
        suggestedEpicId = ref.match(/([A-Z][A-Z0-9]+-\d+)/)?.[1] ?? '';
      } else if (source === 'github') {
        const n = ref.match(/#(\d+)|\/(?:issues|pull)\/(\d+)/);
        suggestedEpicId = n ? `GH-${n[1] ?? n[2]}` : '';
      }
      if (!suggestedEpicId) { suggestedEpicId = slugEpicId(raw.split('\n')[0] ?? ''); }

      // Done: the description is already filled by the streamed chunks. The
      // webview now runs the standard classify pass on it (recipe + title).
      void this.panel.webview.postMessage({
        type: 'requirementLoaded',
        source,
        ref,
        epicId: suggestedEpicId,
        summary: raw,
      });
    } catch (err) {
      void this.panel.webview.postMessage({
        type: 'requirementLoadError',
        source,
        ref,
        message: describeExecError(err),
      });
    }
  }

  private async startEpicInline(draft: Record<string, unknown>): Promise<void> {
    const root = this.getRootOrWarn();
    if (!root) { return; }

    const targetRaw = draft.target as Record<string, unknown> | undefined;
    const epicId = String(draft.epicId ?? '').trim();
    if (!targetRaw || !epicId) { return; }
    let targetKind = String(targetRaw.kind ?? '');
    let targetId = String(targetRaw.id ?? '').trim();
    if (!targetId) { return; }
    if (targetKind !== 'pipeline' && targetKind !== 'agent' && targetKind !== 'recipe') { return; }

    // Recipe target → assemble a right-sized pipeline named after the epic,
    // write it to workspace.yaml, then continue as a normal pipeline.
    if (targetKind === 'recipe') {
      // Empty project: materialize the built-in workspace (agents/skills/
      // pipeline/recipes) so the recipe has a source pipeline to draw from.
      const existing = readYaml(root) as { recipes?: Array<{ id?: unknown }> } | null;
      const hasRecipe = Array.isArray(existing?.recipes)
        && existing.recipes.some((r) => String(r.id) === targetId);
      if (!hasRecipe) {
        const wf = BUILTIN_WORKFLOWS.find((w) => (w.recipes ?? []).some((r) => r.id === targetId));
        if (wf) { this.ensureBuiltinInWorkspace(root, wf); }
      }
      const generated = this.assembleRecipeForEpic(root, targetId, epicId);
      if (!generated) { return; }
      targetKind = 'pipeline';
      targetId = generated;
    }

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

    const pipelineCfg = targetKind === 'pipeline'
      ? (doc.pipelines as PipelineConfig[] | undefined)?.find((p) => p.id === targetId)
      : undefined;

    // Scaffold the epic on disk via the shared core helper — same folder
    // layout / state.json / RunState the CLI's `epic start` produces.
    try {
      scaffoldEpic({
        workspaceRoot: root,
        doc,
        epicId,
        title,
        description,
        target: { kind: targetKind as 'pipeline' | 'agent', id: targetId },
        agents,
        inputs,
        pipeline: pipelineCfg,
      });
    } catch (err) {
      if (err instanceof EpicScaffoldError) {
        void vscode.window.showWarningMessage(`AIDLC: ${err.message}`);
        return;
      }
      void vscode.window.showWarningMessage(
        `Epic could not be scaffolded: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
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
  /**
   * Map of every built-in workflow agent (aidlc-po, aidlc-qa, …) to its
   * preset definition: the agent entry with its real `skills:` array plus the
   * matching skill `{id, path}` entries. Used so auto-syncing a built-in agent
   * into workspace.yaml writes its true skills (aidlc-prd, aidlc-implement, …)
   * instead of a synthesized `<id>-skill`.
   */
  private builtinAgentDefinitions(): Map<string, { agent: SyncedAgentPlan['agent']; skills: Array<{ id: string; path: string }> }> {
    const m = new Map<string, { agent: SyncedAgentPlan['agent']; skills: Array<{ id: string; path: string }> }>();
    for (const wf of BUILTIN_WORKFLOWS) {
      let preset;
      try { preset = loadBuiltinPreset(this.extensionUri.fsPath, wf); } catch { continue; }
      const ws = preset.workspace as {
        agents?: Array<Record<string, unknown>>;
        skills?: Array<Record<string, unknown>>;
      };
      const skillById = new Map<string, { id: string; path: string }>();
      for (const s of ws.skills ?? []) {
        const sid = String(s.id ?? '');
        if (sid) { skillById.set(sid, { id: sid, path: String(s.path ?? '') }); }
      }
      for (const a of ws.agents ?? []) {
        const aid = String(a.id ?? '');
        if (!aid || m.has(aid)) { continue; }
        const skillIds = Array.isArray(a.skills) ? (a.skills as unknown[]).map(String) : [];
        const skills = skillIds
          .map((sid) => skillById.get(sid))
          .filter((x): x is { id: string; path: string } => Boolean(x));
        m.set(aid, {
          agent: {
            id: aid,
            name: typeof a.name === 'string' ? a.name : aid,
            skills: skillIds,
            model: typeof a.model === 'string' ? a.model : undefined,
            description: typeof a.description === 'string' ? a.description : undefined,
            capabilities: Array.isArray(a.capabilities) ? (a.capabilities as unknown[]).map(String) : undefined,
          },
          skills,
        });
      }
    }
    return m;
  }

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

    // Built-in agent definitions keyed by agent id (aidlc-po, aidlc-qa, …).
    // These carry the agent's REAL skills (aidlc-prd, aidlc-implement, …) +
    // the matching skill entries, so syncing a built-in agent doesn't invent
    // a bogus `<id>-skill`.
    const builtinAgentDefs = this.builtinAgentDefinitions();

    const added: SyncedAgentPlan[] = [];
    const plannedIds = new Set<string>();

    for (const raw of stepsRaw) {
      if (!raw || typeof raw !== 'object') { continue; }
      const id = String((raw as Record<string, unknown>).agent ?? '').trim();
      if (!id) { return { ok: false, missing: '' }; }
      if (existing.has(id) || plannedIds.has(id)) { continue; }

      // Prefer the built-in definition (real skills) over the generic
      // file-based synthesis.
      const builtinDef = builtinAgentDefs.get(id);
      if (builtinDef) {
        added.push({ agent: builtinDef.agent, skills: builtinDef.skills });
        plannedIds.add(id);
        continue;
      }

      const file = byId.get(id);
      if (!file) { return { ok: false, missing: id }; }

      // Custom file-based agent: synthesize a single skill pointing at its
      // persona file so the runner can load the prompt.
      const fm = parseAgentFrontmatter(file.filePath);
      const skillId = `${id}-skill`;
      added.push({
        agent: {
          id,
          name: id,
          skills: [skillId],
          model: fm.model,
          capabilities: fm.tools,
          description: fm.description,
        },
        skills: [{ id: skillId, path: this.relPathFor(root, file.filePath) }],
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
      for (const sk of plan.skills) {
        if (!skillIds.has(sk.id)) {
          doc.skills.push({ id: sk.id, path: sk.path });
          skillIds.add(sk.id);
        }
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

    // Preserve fields the step modal doesn't edit (requires/produces and the
    // gate fields with no UI yet: produces_contains, auto_review_timeout_ms)
    // from the existing pipeline by agent id — first occurrence consumed per
    // match so duplicate-agent steps still pair up with their original
    // entries in order. Without this, re-saving a pipeline through the
    // builder would silently drop hand-authored fields.
    const oldByAgent = new Map<
      string,
      Array<{
        requires: string[];
        produces: string[];
        produces_contains: string[];
        auto_review_timeout_ms?: number;
      }>
    >();
    if (Array.isArray(pipeline.steps)) {
      for (const raw of pipeline.steps as PipelineStepConfig[]) {
        const norm = normalizeStep(raw);
        const arr = oldByAgent.get(norm.agent) ?? [];
        arr.push({
          requires: norm.requires,
          produces: norm.produces,
          produces_contains: norm.produces_contains,
          auto_review_timeout_ms: norm.auto_review_timeout_ms,
        });
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
      // Round-trip gate fields that have no modal UI yet, so editing a
      // pipeline doesn't discard hand-authored values.
      if (carry?.produces_contains && carry.produces_contains.length > 0) {
        step.produces_contains = carry.produces_contains;
      }
      if (typeof carry?.auto_review_timeout_ms === 'number') {
        step.auto_review_timeout_ms = carry.auto_review_timeout_ms;
      }
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

      // `.claude/commands/<pipeline>-<phase>.md` files for phases no longer
      // referenced by any remaining pipeline. Namespaced by this pipeline id
      // so we only delete this pipeline's command files. Stashed for FS cleanup.
      const removeCmdIds = new Set<string>(
        [...myPhaseIds]
          .filter((pid) => !neededStepNames.has(pid))
          .map((pid) => pipelineCommandId(id, pid)),
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
    // Cache-bust by the bundle's mtime: the webview otherwise serves a stale
    // cached workspace.js after a rebuild (same URI → old JS keeps running).
    const bust = (p: string): string => {
      try { return `?v=${Math.floor(fs.statSync(p).mtimeMs).toString(36)}`; } catch { return ''; }
    };
    const cssPath = vscode.Uri.joinPath(assetsRoot, 'styles.css');
    const entryPath = vscode.Uri.joinPath(assetsRoot, 'workspace.js');
    const cssUri = webview.asWebviewUri(cssPath).toString() + bust(cssPath.fsPath);
    const entryUri = webview.asWebviewUri(entryPath).toString() + bust(entryPath.fsPath);

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

/**
 * Open a folder in VS Code. If a project is already open, ask whether to
 * reuse the current window or open a new one; otherwise reuse silently.
 */
async function openFolder(uri: vscode.Uri): Promise<void> {
  const hasProject = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
  let forceNew = false;
  if (hasProject) {
    const choice = await vscode.window.showQuickPick(
      [
        { label: '$(window) Current window', value: 'current', description: 'Replace the current project' },
        { label: '$(empty-window) New window', value: 'new', description: 'Keep the current project open' },
      ],
      { title: 'Open project in…', placeHolder: 'Current window or new window?' },
    );
    if (!choice) { return; } // cancelled
    forceNew = choice.value === 'new';
  }
  await vscode.commands.executeCommand(
    'vscode.openFolder', uri, forceNew ? { forceNewWindow: true } : { forceReuseWindow: true },
  );
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) { out += chars[Math.floor(Math.random() * chars.length)]; }
  return out;
}
