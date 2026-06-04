/**
 * Built-in workflow presets.
 *
 * The implementation now lives in `@aidlc/core` (`presets/builtinWorkflows`)
 * so the CLI and the extension share one source of truth for the SDLC
 * pipeline shape, phase definitions, command naming, and preset composition.
 *
 * This module is a thin re-export kept so the extension's existing import
 * sites (`./builtinPresets`) keep working unchanged. The template `.md` files
 * still ship with the extension under `templates/`, and `loadBuiltinPreset`
 * reads them via the `extensionPath` argument the callers already pass.
 */
export {
  BUILTIN_WORKFLOWS,
  PHASES,
  pipelineCommandId,
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
} from '@aidlc/core';
export type { BuiltinWorkflow } from '@aidlc/core';
