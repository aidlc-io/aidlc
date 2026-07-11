/**
 * Wire the workspace's `persistence` config to a concrete run-state backend.
 *
 * This is the bridge between `workspace.yaml` and {@link RunStateStore}:
 * surfaces (CLI, extension) call {@link activateBackendFromWorkspace} once at
 * startup, and every subsequent `RunStateStore.*` call routes through the
 * chosen backend. When `persistence` is absent or `backend: file`, the default
 * {@link FileRunStateStore} is used and behaviour is unchanged.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { PersistenceConfig } from '../schema/WorkspaceSchema';
import { WorkspaceSchema } from '../schema/WorkspaceSchema';
import { RunStateStore, FileRunStateStore, type RunStateBackend } from './RunStateStore';
import { GitRunStateStore } from './GitRunStateStore';

/** Canonical location of the workspace manifest, relative to the root. */
const WORKSPACE_CONFIG_REL = path.join('.aidlc', 'workspace.yaml');

/**
 * Build the backend a `persistence` config selects. Undefined config or
 * `backend: file` yields a {@link FileRunStateStore}; `backend: git` yields a
 * {@link GitRunStateStore} carrying the branch/remote/auto_sync settings.
 */
export function resolveRunStateBackend(persistence?: PersistenceConfig): RunStateBackend {
  if (persistence?.backend === 'git') {
    return new GitRunStateStore({
      branch: persistence.branch,
      remote: persistence.remote,
      autoSync: persistence.auto_sync,
    });
  }
  return new FileRunStateStore();
}

/**
 * Set the active backend from a persistence config. Returns the backend it
 * installed. Prefer {@link activateBackendFromWorkspace} unless you already
 * hold the parsed config.
 */
export function activateRunStateBackend(persistence?: PersistenceConfig): RunStateBackend {
  const backend = resolveRunStateBackend(persistence);
  RunStateStore.setBackend(backend);
  return backend;
}

/**
 * Read `<workspaceRoot>/.aidlc/workspace.yaml`, extract its `persistence`
 * block, and activate the matching backend.
 *
 * Defensive by design: a missing file, unparseable YAML, or a schema mismatch
 * leaves the current backend untouched and returns `null` rather than throwing
 * — command-level validation (`aidlc validate`) is where those errors belong,
 * not backend selection. Returns the activated backend on success.
 *
 * `loadYaml` is injected so core stays free of a hard YAML dependency here;
 * callers pass their existing parser (the CLI/extension already depend on
 * js-yaml).
 */
export function activateBackendFromWorkspace(
  workspaceRoot: string,
  loadYaml: (raw: string) => unknown,
): RunStateBackend | null {
  const configPath = path.join(workspaceRoot, WORKSPACE_CONFIG_REL);
  if (!fs.existsSync(configPath)) { return null; }

  let parsed: unknown;
  try {
    parsed = loadYaml(fs.readFileSync(configPath, 'utf8'));
  } catch { return null; }

  const result = WorkspaceSchema.safeParse(parsed);
  if (!result.success) { return null; }

  return activateRunStateBackend(result.data.persistence);
}
