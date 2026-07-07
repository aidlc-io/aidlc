/**
 * Webview-side type definitions mirroring the host's @aidlc/core shapes.
 * Copied (not imported) because @aidlc/core targets Node and is bundled
 * into the host. The types are stable enough to keep in sync manually.
 */

export type ThemeMode = 'auto' | 'light' | 'dark';

export type StepStatus =
  | 'pending'
  | 'awaiting_work'
  | 'awaiting_auto_review'
  | 'awaiting_review'
  | 'approved'
  | 'rejected';

export type RunStatus = 'running' | 'completed' | 'failed';

/** Status normalized for the StatusBadge UI component. */
export type UiStatus =
  | 'in_progress'
  | 'done'
  | 'rejected'
  | 'pending'
  | 'awaiting_review'
  | 'awaiting_work'
  /** Step was previously approved but a downstream `requestStepUpdate`
   * reset it to pending — its history is intact, just needs to be redone. */
  | 'awaiting_update';

export interface ArtifactPath {
  path: string;
  exists: boolean;
}

export interface ActiveRun {
  runId: string;
  pipelineId: string;
  currentStepIdx: number;
  totalSteps: number;
  currentAgent: string;
  stepAgents: string[];
  currentStepStatus: StepStatus | string;
  revision: number;
  rejectReason?: string;
  feedback?: string;
  produces: ArtifactPath[];
  requires: ArtifactPath[];
  currentSlashCommand?: string;
}

export interface RecentEpicRef {
  id: string;
  title: string;
  status: string;
  statePath: string;
}

export interface SlashCommandRef {
  name: string;
  target: string;
}

export interface TemplateRef {
  id: string;
  name: string;
  description: string;
}

export interface PipelineRef {
  id: string;
  stepCount: number;
  onFailure: 'stop' | 'continue';
}

export interface SkillTemplateRef {
  id: string;
  description: string;
  /** Coarse grouping used by the AddSkill picker to split a long flat
   *  list into filterable category tabs (general / frontend / backend
   *  / mobile / devops / data / refactor / docs). */
  category: string;
}

export type McpStatus = 'connected' | 'needs_auth' | 'failed' | 'unknown';

export interface McpServerInfo {
  name: string;
  endpoint: string;
  transport: string;
  status: McpStatus;
  statusText: string;
}

export type SuggestionSeverity = 'high' | 'med' | 'low';

export interface CostSuggestion {
  rule: string;
  severity: SuggestionSeverity;
  scope: string;
  evidence: string;
  action: string;
  /** USD; 0 when the rule doesn't quantify a saving. */
  estSavings: number;
}

// ── Token report ──────────────────────────────────────────────────────────
export interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  calls: number;
}

export interface OverviewStats {
  sessions: number;
  projects: number;
  calls: number;
  cacheHitRate: number;
  totalTokens: number;
  totalCost: number;
}

export interface ModelRow extends UsageTotals {
  model: string;
  hitRate: number;
  costShare: number;
}

export interface DailyRow extends UsageTotals {
  date: string;
}

export interface ProjectRow extends UsageTotals {
  project: string;
  displayPath: string;
  lastActive: string;
  costShare: number;
}

export interface HeatmapRow {
  dow: number;
  label: string;
  hours: number[];
  rowTotal: number;
}

export interface TokenReport {
  generatedAt: string;
  windowDays: number;
  overview: OverviewStats;
  byModel: ModelRow[];
  daily: DailyRow[];
  topProjects: ProjectRow[];
  heatmap: HeatmapRow[];
  heatmapPeak: number;
  suggestions: CostSuggestion[];
  estPotentialSavings: number;
}

export interface TokenReportPanelState {
  report: TokenReport | null;
  loading: boolean;
  error: string | null;
  windowDays: number;
}

/** Live snapshot of the agents-observe server, pushed to the Monitor panel. */
export interface AgentObserveStatus {
  serverUp: boolean;
  version: string | null;
  runtime: string | null;
  /** Live consumers — Claude Code sessions currently reporting events. */
  activeConsumers: number | null;
  /** Dashboard browser tabs currently connected. */
  activeClients: number | null;
  /** Total sessions recorded in the db. */
  sessionCount: number | null;
  /** Total events recorded in the db. */
  eventCount: number | null;
  error?: string;
}

/** State for the "Agents" tab of the unified Monitor panel. */
export interface MonitorAgentsState {
  status: AgentObserveStatus;
  dashboardUrl: string;
  dataDir: string;
}

export type MonitorTab = 'tokens' | 'agents' | 'insights';

// ── Session Insights (mirrors src/v2/sessionInsights.ts — keep in sync) ──────

export interface TurnPoint {
  ts: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  contextTokens: number;
  cost: number;
  cumulativeCost: number;
  tools: string[];
}

export interface PromptEntry {
  ts: string;
  text: string;
  source: string | null;
  permissionMode: string | null;
}

export interface HookEvent {
  ts: string;
  subtype: string;
  command: string;
  durationMs: number;
  error: string | null;
}

export interface HookCommandSummary {
  command: string;
  events: string[];
  count: number;
  totalMs: number;
  errorCount: number;
  lastError: string | null;
}

export interface CompactionEvent {
  ts: string;
  preTokens: number | null;
  trigger: string | null;
}

export interface ToolCount {
  name: string;
  count: number;
}

export interface RetrievalSummary {
  byTool: ToolCount[];
  fileReads: number;
  webSearches: number;
  webFetches: number;
  mcpReads: number;
  readPaths: string[];
}

export interface SubagentInsight {
  agentId: string;
  agentType: string | null;
  parentToolUuid: string | null;
  startedAt: string | null;
  endedAt: string | null;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cost: number;
  tools: ToolCount[];
}

export interface SessionTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  cost: number;
}

export interface SessionInsight {
  sessionId: string;
  project: string;
  projectPath: string;
  cwd: string;
  title: string | null;
  gitBranch: string | null;
  version: string | null;
  startedAt: string | null;
  endedAt: string | null;
  totals: SessionTotals;
  cache: { hitRatio: number; readTokens: number; creationTokens: number };
  context: { peakTokens: number; lastTokens: number };
  turns: TurnPoint[];
  prompts: PromptEntry[];
  hooks: HookEvent[];
  hookSummary: HookCommandSummary[];
  compactions: CompactionEvent[];
  fileEdits: number;
  retrieval: RetrievalSummary;
  toolUse: ToolCount[];
  subagents: SubagentInsight[];
}

export interface SessionListItem {
  sessionId: string;
  project: string;
  projectPath: string;
  jsonlPath: string;
  mtimeMs: number;
  sizeBytes: number;
}

/** State for the "Insights" tab of the unified Monitor panel. */
export interface InsightPanelState {
  sessions: SessionListItem[];
  selectedPath: string | null;
  insight: SessionInsight | null;
  loading: boolean;
}

/** Live OTel snapshot (mirrors src/v2/otelReceiver.ts). */
export interface OtelModelRow { model: string; tokens: number; cost: number; }
export interface OtelSnapshot {
  listening: boolean;
  port: number;
  receiving: boolean;
  lastEventAt: number | null;
  tokensByType: Record<string, number>;
  totalTokens: number;
  totalCostUsd: number;
  byModel: OtelModelRow[];
  sessions: number;
  linesAdded: number;
  linesRemoved: number;
  commits: number;
  envConfigured: boolean;
}

export interface SidebarState {
  hasFolder: boolean;
  workspaceName: string;
  configExists: boolean;
  agentsCount: number;
  skillsCount: number;
  pipelinesCount: number;
  epicsCount: number;
  recentEpics: RecentEpicRef[];
  slashCommands: SlashCommandRef[];
  builtinTemplates: TemplateRef[];
  projectTemplates: TemplateRef[];
  activeRuns: ActiveRun[];
  /** Lightweight pipeline list for the inline Start-Run modal. */
  pipelines: PipelineRef[];
  /** All existing run ids (any status) — used by the modal to validate uniqueness. */
  runIds: string[];
  /** True when ~/aidlc-demo-project already exists. The "Load Demo Project"
   * button uses this to pop an inline modal asking re-seed vs open-as-is
   * instead of letting the host show a VS Code notification. */
  demoProjectExists: boolean;
  /** MCP servers Claude is currently connected to. null = first load is in
   * flight, [] = none configured. */
  mcpServers: McpServerInfo[] | null;
  mcpLoading: boolean;
  mcpError: string | null;
}

export type AssetScope = 'project' | 'aidlc' | 'global';

export interface AgentSummary {
  id: string;
  scope: AssetScope;
  filePath: string;
  description?: string;
  /** Primary skill id (first entry) — kept for back-compat. */
  skill?: string;
  /** All skills the agent can use. */
  skills?: string[];
  model?: string;
  integrations?: string[];
  /** Human label of the built-in preset that contributed this entry (e.g. "SDLC Pipeline"). Absent for user-created entries. */
  builtinFrom?: string;
}

export interface SkillSummary {
  id: string;
  scope: AssetScope;
  filePath: string;
  description?: string;
  builtinFrom?: string;
}

export interface PipelineStepSummary {
  agent: string;
  name?: string;
  /** Skills this step makes available to the agent. */
  skills?: string[];
  enabled: boolean;
  produces: string[];
  /** Content markers asserted against the produced files (E1). */
  produces_contains?: string[];
  requires: string[];
  /** Agent ids this step waits for. Non-empty turns the workflow into a DAG. */
  depends_on?: string[];
  human_review: boolean;
  auto_review: boolean;
  auto_review_runner?: string;
  /** Max ms the auto_review validator may run before it's aborted (C2). */
  auto_review_timeout_ms?: number;
}

export interface PipelineSummary {
  id: string;
  steps: PipelineStepSummary[];
  on_failure: 'stop' | 'continue';
  builtin?: boolean;
  /** Human label for built-in pipelines (e.g. "iOS Native Pipeline"). User-defined pipelines leave this undefined. */
  name?: string;
}

/** A task-type recipe surfaced in the Start-Epic modal (mirrors host RecipeSummary). */
export interface RecipeSummary {
  id: string;
  description?: string;
  /** Source pipeline id the recipe draws from. */
  from: string;
  /** Selected step ids, in order. */
  steps: string[];
  /** Resolved agent ids (ordered) — for capability prompts. */
  agents: string[];
}

export interface AutoReviewVerdict {
  decision: 'pass' | 'reject';
  reason: string;
  at: string;
  runner: string;
}

export type StepHistoryEntry =
  | {
      kind: 'reject';
      at: string;
      revision: number;
      reason?: string;
      sentBackToIdx: number;
    }
  | {
      kind: 'rerun';
      at: string;
      revision: number;
      feedback?: string;
    }
  | {
      kind: 'auto_review';
      at: string;
      revision: number;
      decision: 'pass' | 'reject';
      reason: string;
      runner: string;
    }
  | {
      kind: 'approve';
      at: string;
      revision: number;
    }
  | {
      // A /annotate-artifact round that edited the .md, merged from the
      // artifacts folder's `.annotation-history.json` at read time.
      kind: 'annotate';
      at: string;
      revision: number;
      author?: string;
      note?: string;
      summary?: string;
    };

/** Mirror of `epicTokenAttribution.HistoryEventUsage` — kept in sync by hand. */
export interface HistoryEventUsage {
  totalTokens: number;
  cost: number;
  calls: number;
}

/** Mirror of `epicTokenAttribution.StepUsage`. */
export interface StepUsage {
  agent: string;
  startedAt: string | null;
  endedAt: string | null;
  cost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  calls: number;
  history?: HistoryEventUsage[];
}

/** Mirror of `epicTokenAttribution.EpicUsage`. */
export interface EpicUsage {
  total: { cost: number; totalTokens: number; calls: number };
  steps: StepUsage[];
  hasOverlap: boolean;
  computedAt: number;
}

export interface EpicStepDetailFull {
  agent: string;
  /** Phase id / slash command name (e.g. `plan`, `test-plan`) when the
   *  pipeline step carries a separate `name:` distinct from `agent:`. */
  stepName?: string;
  /** Resolved slash command for this step (`/implement` or
   *  `/sdlc-parallel-full-implement`), from workspace.yaml slash_commands. */
  slashCommand?: string;
  /** Basename of the step's first `produces:` path — the file the user
   *  expects to see written by this step (e.g. `PRD.md`). Falls back to
   *  the agent meta artifact when the step doesn't declare one. */
  artifact?: string;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  runStatus: StepStatus | null;
  isCurrentRunStep: boolean;
  rejectReason?: string;
  autoReviewVerdict?: AutoReviewVerdict;
  stepHasAutoReview: boolean;
  stepHasHumanReview: boolean;
  /** Agent ids this step waits for (DAG edges) — empty for sequential. */
  dependsOn?: string[];
  startedAt?: string;
  finishedAt?: string;
  /** Append-only timeline of significant transitions (reject / rerun /
   * auto_review / approve). Surfaced verbatim from the run state. */
  history?: StepHistoryEntry[];
  /** Number of times this step has been rejected (cached count for display). */
  rejectCount?: number;
  /** Carried feedback (from cascade reject blame or manual rerun feedback). */
  feedback?: string;
  /** Token usage attributed to this step. */
  tokenUsage?: StepUsage;
}

export interface EpicSummary {
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
  /** Every non-hidden file in the artifacts folder (all extensions). */
  artifactFiles: string[];
  createdAt: string;
  /** Aggregate token usage for the epic. */
  tokenUsage?: EpicUsage;
}

export interface AgentMeta {
  name: string;
  description: string;
  inputs: string;
  outputs: string;
  artifact: string;
  /** Capability ids declared on the agent (used by Start Epic to ask for run-time bindings). */
  capabilities?: string[];
}

export interface WorkspaceState {
  hasFolder: boolean;
  workspaceName: string;
  configExists: boolean;
  agents: AgentSummary[];
  skills: SkillSummary[];
  pipelines: PipelineSummary[];
  /** Task-type recipes for the Start-Epic modal's auto-generate path. */
  recipes: RecipeSummary[];
  epics: EpicSummary[];
  /** id → display metadata (pulled from workspace.yaml) for the step-detail card. */
  agentMeta: Record<string, AgentMeta>;
  /** id → slash command string (with leading /). First wins on duplicates. */
  slashCommandsByAgent: Record<string, string>;
  /** Counts for the tab badges. */
  agentsCount: number;
  skillsCount: number;
  pipelinesCount: number;
  epicsCount: number;
  /** All existing run ids (any status) — for inline Start-Run modal uniqueness check. */
  runIds: string[];
  /** Built-in skill templates surfaced for the inline AddSkill modal. */
  skillTemplates: SkillTemplateRef[];
  /** The built-in AIDLC SDLC pipeline — used by the Add-pipeline modal's
   *  "Load AIDLC default" button to prefill steps. */
  defaultPipeline?: PipelineSummary;
  /** Suggested next sequential id for the inline Start-Epic modal (e.g. EPIC-007). */
  nextEpicId: string;
  /** All existing epic ids (folders under epicRoot) — for uniqueness check. */
  existingEpicIds: string[];
  requirementRuns?: RequirementRunSummary[];
  /** Initial view to render when the panel first opens. */
  initialView?: WorkspaceView;
  /** Whether testagent.config.yaml exists at the workspace root. */
  testAgentConfigExists?: boolean;
  /** Targets parsed from testagent.config.yaml includes. */
  testAgentTargets?: TestAgentTarget[];
}

export interface TestAgentTarget {
  name: string;
  filePath: string;
  adapter?: string;
  url?: string;
}

export type WorkspaceView = 'builder' | 'epics' | 'analyze' | 'tests';

export type EpicFilter = 'all' | 'in_progress' | 'pending' | 'done' | 'failed';

export interface RequirementRunSummary {
  id: string;           // REQ-001
  createdAt: string;    // human-readable date string
  platform: string;     // jira | github | linear | redmine | local
  parentTask: string;   // parent epic key or blank
  source: string;       // requirements_source value
  status: 'pending' | 'complete';
  taskCount: number | null;
  hasRequirements?: boolean;
}

declare global {
  interface Window {
    __AIDLC_INITIAL_STATE__?: SidebarState | WorkspaceState;
    __AIDLC_INITIAL_THEME__?: ThemeMode;
    __AIDLC_MONITOR_TAB__?: MonitorTab;
    BRAND_ICON_URI?: string;
    EXTENSION_VERSION?: string;
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

export interface VsCodeApi {
  postMessage(message: unknown): void;
  setState<T>(state: T): T;
  getState<T>(): T | undefined;
}

export {};
