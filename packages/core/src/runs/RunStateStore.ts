/**
 * Persistence for {@link RunState}.
 *
 * Default layout (filesystem backend):
 *   <workspace>/.aidlc/runs/<runId>.json
 *
 * The store is intentionally dumb — it reads/writes state, validates the
 * schemaVersion, and that's it. All state-machine logic lives in
 * {@link PipelineRunner}.
 *
 * ## Pluggable backends
 *
 * `RunStateStore` is a static facade that delegates to a {@link RunStateBackend}
 * instance. The default backend is {@link FileRunStateStore}, which preserves
 * the historical behaviour byte-for-byte (JSON files under `.aidlc/runs/`).
 *
 * The seam exists so alternative backends can be swapped in without touching
 * any of the ~60 call sites that use the static API — e.g. a future
 * git-backed store that commits run state to the repo for zero-server,
 * multi-user sync. Swap via {@link RunStateStore.setBackend}; restore the
 * default with {@link RunStateStore.resetBackend}.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { RunState } from './RunState';

const RUNS_DIR = path.join('.aidlc', 'runs');

/**
 * Filesystem-safe id check — same rules as preset ids: lowercase letters,
 * digits, dashes, underscores, plus a leading letter or digit. Epic keys
 * like `EPIC-2100` need uppercase, so we widen to `[A-Za-z0-9._-]`.
 */
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Persistence contract for run state. Backends are stateless with respect to
 * the workspace — every method takes an explicit `workspaceRoot` — so a single
 * instance can serve any number of workspaces, exactly like the original
 * static store.
 */
export interface RunStateBackend {
  /** Resolve the runs directory for a given workspace root. */
  dir(workspaceRoot: string): string;
  /** Resolve the storage path/handle for a specific run. */
  file(workspaceRoot: string, runId: string): string;
  /** List all runs (sorted by updatedAt desc). Tolerates a missing store. */
  list(workspaceRoot: string): RunState[];
  /** Load one run, or `null` if it does not exist / is unreadable. */
  load(workspaceRoot: string, runId: string): RunState | null;
  /** Persist one run. Stamps `updatedAt` at write time. */
  save(workspaceRoot: string, state: RunState): void;
  /** Remove one run. No-op if it does not exist. */
  delete(workspaceRoot: string, runId: string): void;
}

/**
 * Assert a runId is filesystem-safe, throwing the canonical error otherwise.
 * Shared by every backend that maps a runId onto a `<id>.json` filename.
 */
export function assertRunId(runId: string): void {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error(`Invalid runId "${runId}" — must match ${RUN_ID_PATTERN}`);
  }
}

/** Serialize a run to the canonical on-disk form (2-space pretty JSON). */
export function serializeRunState(state: RunState): string {
  return JSON.stringify(state, null, 2);
}

/**
 * Parse and schema-validate a single run file at `filePath`. Returns `null`
 * for a missing file, unparseable JSON, or a mismatched schemaVersion —
 * never throws. Shared read path for the file and git backends.
 */
export function readRunFile(filePath: string): RunState | null {
  if (!fs.existsSync(filePath)) { return null; }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (parsed && parsed.schemaVersion === 1) { return parsed as RunState; }
    return null;
  } catch { return null; }
}

/**
 * Read every valid `*.json` run in `dir`, skipping corrupt/non-matching
 * files, sorted by `updatedAt` descending. Tolerates a missing directory.
 */
export function readRunsDir(dir: string): RunState[] {
  if (!fs.existsSync(dir)) { return []; }
  const out: RunState[] = [];
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith('.json')) { continue; }
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf8'));
      if (parsed && parsed.schemaVersion === 1 && typeof parsed.runId === 'string') {
        out.push(parsed as RunState);
      }
    } catch { /* skip corrupt run files — surface as warning when picked */ }
  }
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out;
}

/**
 * Default filesystem backend. This is the original {@link RunStateStore}
 * implementation, moved verbatim onto an instance so it can be swapped.
 */
export class FileRunStateStore implements RunStateBackend {
  dir(workspaceRoot: string): string {
    return path.join(workspaceRoot, RUNS_DIR);
  }

  file(workspaceRoot: string, runId: string): string {
    assertRunId(runId);
    return path.join(this.dir(workspaceRoot), `${runId}.json`);
  }

  list(workspaceRoot: string): RunState[] {
    return readRunsDir(this.dir(workspaceRoot));
  }

  load(workspaceRoot: string, runId: string): RunState | null {
    return readRunFile(this.file(workspaceRoot, runId));
  }

  save(workspaceRoot: string, state: RunState): void {
    const dir = this.dir(workspaceRoot);
    fs.mkdirSync(dir, { recursive: true });
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(this.file(workspaceRoot, state.runId), serializeRunState(state), 'utf8');
  }

  delete(workspaceRoot: string, runId: string): void {
    const p = this.file(workspaceRoot, runId);
    if (fs.existsSync(p)) { fs.unlinkSync(p); }
  }
}

/** The default backend instance the static facade delegates to. */
const DEFAULT_BACKEND: RunStateBackend = new FileRunStateStore();

/**
 * Static facade over the active {@link RunStateBackend}.
 *
 * Kept as a static API for backwards compatibility: every existing call site
 * (`RunStateStore.load(...)`, `RunStateStore.save(...)`, …) keeps working
 * unchanged. The default backend is {@link FileRunStateStore}; behaviour is
 * identical to the pre-refactor store unless a caller opts in via
 * {@link RunStateStore.setBackend}.
 */
export class RunStateStore {
  private static backend: RunStateBackend = DEFAULT_BACKEND;

  /**
   * Swap the active backend (e.g. a git-backed store). Returns the previously
   * active backend so callers can restore it. Intended for adapters and tests.
   */
  static setBackend(backend: RunStateBackend): RunStateBackend {
    const previous = RunStateStore.backend;
    RunStateStore.backend = backend;
    return previous;
  }

  /** Restore the default {@link FileRunStateStore} backend. */
  static resetBackend(): void {
    RunStateStore.backend = DEFAULT_BACKEND;
  }

  /** The currently active backend. */
  static getBackend(): RunStateBackend {
    return RunStateStore.backend;
  }

  /** Resolve the runs directory for a given workspace root. */
  static dir(workspaceRoot: string): string {
    return RunStateStore.backend.dir(workspaceRoot);
  }

  /** Resolve the storage path/handle for a specific run. */
  static file(workspaceRoot: string, runId: string): string {
    return RunStateStore.backend.file(workspaceRoot, runId);
  }

  /** List all runs (sorted by updatedAt desc). Tolerates a missing store. */
  static list(workspaceRoot: string): RunState[] {
    return RunStateStore.backend.list(workspaceRoot);
  }

  static load(workspaceRoot: string, runId: string): RunState | null {
    return RunStateStore.backend.load(workspaceRoot, runId);
  }

  static save(workspaceRoot: string, state: RunState): void {
    RunStateStore.backend.save(workspaceRoot, state);
  }

  static delete(workspaceRoot: string, runId: string): void {
    RunStateStore.backend.delete(workspaceRoot, runId);
  }
}

export { RUN_ID_PATTERN };
