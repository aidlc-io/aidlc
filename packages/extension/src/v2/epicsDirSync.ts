/**
 * Pure helpers for reading / writing the epics directory (`state.root`)
 * in workspace.yaml. No VS Code dependency — safe to import from tests.
 *
 * The VS Code glue (setting sync, config listener) lives in extension.ts.
 */

import { readYaml, writeYaml } from './yamlIO';

export const DEFAULT_EPICS_DIR = 'docs/epics';

/**
 * Read `state.root` from workspace.yaml. Returns the default when the
 * file is missing or the field is absent.
 */
export function readEpicsDirFromYaml(workspaceRoot: string): string {
  const doc = readYaml(workspaceRoot);
  if (!doc) { return DEFAULT_EPICS_DIR; }
  const state = doc.state as Record<string, unknown> | undefined;
  if (state && typeof state.root === 'string' && state.root.trim()) {
    return state.root;
  }
  return DEFAULT_EPICS_DIR;
}

/**
 * Write `state.root` in workspace.yaml. No-op when workspace.yaml
 * doesn't exist (nothing to update).
 */
export function writeEpicsDirToYaml(workspaceRoot: string, dir: string): void {
  const doc = readYaml(workspaceRoot);
  if (!doc) { return; }
  if (!doc.state) { doc.state = {}; }
  (doc.state as Record<string, unknown>).root = dir;
  writeYaml(workspaceRoot, doc);
}
