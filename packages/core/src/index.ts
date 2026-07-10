// AIDLC core — public exports.
//
// This package is pure TypeScript. No `import 'vscode'`. The extension layer
// (packages/extension) imports from here; the core has zero knowledge of the
// VS Code API and runs identically inside the extension host, a CLI, or a
// future test harness / cloud worker.

export {
  WorkspaceSchema,
  validateWorkspace,
  WorkspaceValidationError,
  normalizeStep,
  stepAgentId,
  stepDagId,
  collectWorkspaceRefIssues,
} from './schema/WorkspaceSchema';
export type {
  WorkspaceConfig,
  AgentConfig,
  SkillConfig,
  SlashCommandConfig,
  PipelineConfig,
  PipelineBudget,
  PipelineStepConfig,
  RecipeConfig,
  NormalizedStep,
  StateConfig,
  PersistenceConfig,
  SidebarConfig,
  SidebarView,
  WorkspaceRefIssue,
} from './schema/WorkspaceSchema';

export {
  assemblePipeline,
  recipePipelineId,
  PipelineAssembleError,
} from './runs/PipelineAssembler';
export type { AssembleOptions } from './runs/PipelineAssembler';

export {
  heuristicClassify,
  buildClassificationPrompt,
  parseClassificationVerdict,
  slugEpicId,
} from './runs/TaskClassifier';
export type { TaskTypeVerdict, Confidence } from './runs/TaskClassifier';

export {
  scaffoldEpic,
  mirrorRunStateToEpic,
  mapStepStatusToEpic,
  epicsRoot,
  EpicScaffoldError,
} from './runs/EpicScaffold';
export type {
  EpicStatus,
  ScaffoldEpicArgs,
  ScaffoldEpicResult,
} from './runs/EpicScaffold';

export {
  WorkspaceLoader,
  WorkspaceNotFoundError,
  WorkspaceParseError,
  WORKSPACE_FILENAME,
  WORKSPACE_DIR,
} from './loader/WorkspaceLoader';
export type {
  LoadedWorkspace,
  WorkspaceLoaderOptions,
} from './loader/WorkspaceLoader';

export {
  EnvResolver,
  EnvVarMissingError,
} from './loader/EnvResolver';
export type { EnvResolverOptions } from './loader/EnvResolver';

export {
  SkillLoader,
  SkillNotFoundError,
} from './loader/SkillLoader';
export type { SkillLoaderOptions } from './loader/SkillLoader';

export {
  discoverAssets,
  scopePaths,
  targetPath,
} from './loader/AssetDiscovery';
export type {
  AssetScope,
  AssetKind,
  DiscoveredAsset,
  DiscoveryResult,
} from './loader/AssetDiscovery';

export { RunnerRegistry } from './runner/RunnerRegistry';
export { DefaultRunner } from './runner/DefaultRunner';
export type { DefaultRunnerOptions } from './runner/DefaultRunner';
export { isInsideClaudeCodeSession, hasClaudeLogin, buildClaudeSpawnEnv } from './runner/claudeEnv';
export {
  CustomRunnerLoader,
  validateRunnerExport,
} from './runner/CustomRunnerLoader';
export {
  RunnerValidationError,
} from './runner/types';
export type {
  AidlcRunner,
  RunnerContext,
  RunnerResult,
  ClaudeCliWrapper,
} from './runner/types';

// ── Pipeline runs (phase 1) ────────────────────────────────────────
export { RunStateStore, FileRunStateStore, RUN_ID_PATTERN } from './runs/RunStateStore';
export type { RunStateBackend } from './runs/RunStateStore';
export { GitRunStateStore } from './runs/GitRunStateStore';
export type { GitRunStateStoreOptions, GitExec } from './runs/GitRunStateStore';
export {
  resolveRunStateBackend,
  activateRunStateBackend,
  activateBackendFromWorkspace,
} from './runs/resolveBackend';
export {
  startRun,
  canStartStep,
  markStepDone,
  approveStep,
  rejectStep,
  rerunStep,
  requestStepUpdate,
  submitAutoReviewVerdict,
  PipelineRunError,
} from './runs/PipelineRunner';
export { checkBudget } from './runs/budget';
export type { BudgetCheckArgs, BudgetVerdict } from './runs/budget';
export { verifyRun } from './runs/verifyRun';
export type { VerifyReport, StepDrift } from './runs/verifyRun';
export { renderRunReport } from './runs/runReport';
export { runAutoReview, AutoReviewerError } from './runs/AutoReviewer';
export type { AutoReviewerContext, AutoReviewerFn } from './runs/AutoReviewer';
export { resolvePath } from './runs/RunState';
export type {
  RunState,
  StepRecord,
  StepStatus,
  RunStatus,
  AutoReviewVerdict,
  StepHistoryEntry,
} from './runs/RunState';

// ── Built-in workflow presets (shared by extension + CLI) ──────────
export {
  BUILTIN_WORKFLOWS,
  PHASES,
  pipelineCommandId,
  builtinTemplatesRoot,
  workflowSlug,
  getBuiltinWorkflow,
  getBuiltinWorkflowByPipelineId,
  getBuiltinPipelineSummary,
  getSdlcBuiltinPipelineSummary,
  getAllBuiltinPipelineSummaries,
  getBuiltinRecipeSummaries,
  planRecipeMigration,
  loadBuiltinPreset,
  loadAllBuiltinPresets,
  builtinClaudeCommand,
  sdlcClaudeCommand,
  phaseArtifactFileName,
  getBuiltinArtifactTemplates,
  getSdlcArtifactTemplates,
  resolvePrimaryStack,
  writeBuiltinAutoReviewValidators,
  BUILTIN_PRESET_IDS,
  isBuiltinPreset,
} from './presets/builtinWorkflows';
export type { BuiltinWorkflow, WorkspacePreset as BuiltinWorkspacePreset, WorkspaceRecipe, ArtifactTemplateOptions } from './presets/builtinWorkflows';

// Global ~/.claude install of built-in agent/skill files (shared by ext + CLI).
export {
  installGlobalDefaults,
  installWorkflowGlobalsByIds,
  isWorkflowGloballyInstalled,
  uninstallWorkflowGlobalsByIds,
  detectGlobalBuiltinSource,
  DEFAULT_GLOBAL_WORKFLOW_IDS,
} from './presets/globalDefaults';
export { renderTemplate } from './presets/templateRenderer';
// Annotation + epic-memory tooling install (shared by ext + CLI).
export {
  installAnnotationTools,
  isEpicMemoryHookEnabled,
  setEpicMemoryHook,
} from './presets/annotationTools';
export type { AnnotationToolsReport } from './presets/annotationTools';

// Shared help/knowledge content for `ask` + `guide` (CLI + extension).
export { AIDLC_KNOWLEDGE, AIDLC_CLI_GUIDE_TEXT } from './help/aidlcGuide';

export const AIDLC_CORE_VERSION = '0.1.0';
