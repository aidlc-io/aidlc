/**
 * Global `~/.claude` install of built-in agent/skill files.
 *
 * The implementation now lives in `@aidlc/core` (`presets/globalDefaults`) so
 * the CLI and extension share it. This is a thin re-export shim kept so the
 * extension's existing import sites (`./globalDefaultsInstaller`) keep working.
 *
 * The extension passes its own `extensionPath` (its build copies `templates/`
 * in); the CLI passes `builtinTemplatesRoot()` from core.
 */
export {
  installGlobalDefaults,
  installWorkflowGlobalsByIds,
  isWorkflowGloballyInstalled,
  uninstallWorkflowGlobalsByIds,
  detectGlobalBuiltinSource,
  DEFAULT_GLOBAL_WORKFLOW_IDS,
} from '@aidlc/core';
