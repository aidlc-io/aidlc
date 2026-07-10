/**
 * Git-native backend for {@link RunState} — zero-server, multi-user sync.
 *
 * Instead of a central server, run state lives on a dedicated branch
 * (default `aidlc-state`) that is checked out into a hidden **git worktree**
 * under the workspace (default `.aidlc/.state`). Every `save`/`delete` is
 * committed, and — when a remote is configured and `autoSync` is on —
 * rebased onto and pushed to the shared remote. Teammates on other machines
 * pull that same branch, so state converges through git itself, using the
 * remote (GitHub/GitLab/…) the team already pays for.
 *
 * Why a dedicated branch + worktree:
 *  - **Isolation**: state commits never touch the user's code branch, index,
 *    or HEAD — the worktree has its own checkout of `aidlc-state`.
 *  - **Audit trail for free**: `git log aidlc-state` is an append-only,
 *    optionally-signed record of who changed which run and when.
 *  - **Conflict handling for free**: one file per run means concurrent edits
 *    to *different* runs merge cleanly; a genuine same-run race surfaces as a
 *    rebase conflict rather than a silent overwrite.
 *
 * This is an opt-in backend — the default remains {@link FileRunStateStore}.
 * Activate with `RunStateStore.setBackend(new GitRunStateStore())`.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import type { RunState } from './RunState';
import type { RunStateBackend } from './RunStateStore';
import {
  assertRunId,
  readRunFile,
  readRunsDir,
  serializeRunState,
} from './RunStateStore';

/** Runs a git subcommand and returns stdout. Injectable for tests. */
export type GitExec = (args: string[], cwd: string) => string;

const defaultGitExec: GitExec = (args, cwd) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

export interface GitRunStateStoreOptions {
  /** Branch that holds run state. Default `aidlc-state`. */
  branch?: string;
  /** Remote to sync with. Default `origin`. */
  remote?: string;
  /** Worktree location, relative to the workspace root. Default `.aidlc/.state`. */
  worktreeSubdir?: string;
  /** Runs directory inside the worktree. Default `runs`. */
  runsSubdir?: string;
  /**
   * Pull before reads and rebase+push around writes. Default `true`. When a
   * workspace has no matching remote this degrades to a local-commit-only
   * store (still a full audit trail, just single-machine).
   */
  autoSync?: boolean;
  /** Git executor override (tests inject a recording/fake runner). */
  git?: GitExec;
}

export class GitRunStateStore implements RunStateBackend {
  private readonly branch: string;
  private readonly remote: string;
  private readonly worktreeSubdir: string;
  private readonly runsSubdir: string;
  private readonly autoSync: boolean;
  private readonly git: GitExec;

  /** Workspaces whose worktree this instance has already ensured, memoized. */
  private readonly ready = new Set<string>();

  constructor(opts: GitRunStateStoreOptions = {}) {
    this.branch = opts.branch ?? 'aidlc-state';
    this.remote = opts.remote ?? 'origin';
    this.worktreeSubdir = opts.worktreeSubdir ?? path.join('.aidlc', '.state');
    this.runsSubdir = opts.runsSubdir ?? 'runs';
    this.autoSync = opts.autoSync ?? true;
    this.git = opts.git ?? defaultGitExec;
  }

  /** Absolute path to the state worktree for a workspace. */
  private worktree(workspaceRoot: string): string {
    return path.join(workspaceRoot, this.worktreeSubdir);
  }

  dir(workspaceRoot: string): string {
    return path.join(this.worktree(workspaceRoot), this.runsSubdir);
  }

  file(workspaceRoot: string, runId: string): string {
    assertRunId(runId);
    return path.join(this.dir(workspaceRoot), `${runId}.json`);
  }

  list(workspaceRoot: string): RunState[] {
    this.ensureWorktree(workspaceRoot);
    this.pull(workspaceRoot);
    return readRunsDir(this.dir(workspaceRoot));
  }

  load(workspaceRoot: string, runId: string): RunState | null {
    this.ensureWorktree(workspaceRoot);
    this.pull(workspaceRoot);
    return readRunFile(this.file(workspaceRoot, runId));
  }

  save(workspaceRoot: string, state: RunState): void {
    this.ensureWorktree(workspaceRoot);
    this.pull(workspaceRoot);
    const runsDir = this.dir(workspaceRoot);
    fs.mkdirSync(runsDir, { recursive: true });
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(this.file(workspaceRoot, state.runId), serializeRunState(state), 'utf8');
    this.commit(workspaceRoot, `aidlc: save run ${state.runId}`);
    this.push(workspaceRoot);
  }

  delete(workspaceRoot: string, runId: string): void {
    this.ensureWorktree(workspaceRoot);
    this.pull(workspaceRoot);
    const p = this.file(workspaceRoot, runId);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      this.commit(workspaceRoot, `aidlc: delete run ${runId}`);
      this.push(workspaceRoot);
    }
  }

  // ── git plumbing ──────────────────────────────────────────────────

  /** Run git in the workspace root (main clone). Throws on git failure. */
  private inRepo(workspaceRoot: string, args: string[]): string {
    return this.git(args, workspaceRoot);
  }

  /** Run git in the state worktree. Throws on git failure. */
  private inWorktree(workspaceRoot: string, args: string[]): string {
    return this.git(args, this.worktree(workspaceRoot));
  }

  /** Best-effort git — swallows failures (offline pushes, absent branches). */
  private trySilently(cwd: string, args: string[]): boolean {
    try { this.git(args, cwd); return true; } catch { return false; }
  }

  /** True when the configured remote exists in this workspace. */
  private hasRemote(workspaceRoot: string): boolean {
    return this.trySilently(workspaceRoot, ['remote', 'get-url', this.remote]);
  }

  /**
   * Create the state worktree if missing, bootstrapping the branch:
   *  - remote already has it  → check it out tracking `remote/branch`
   *  - only local has it      → check that out
   *  - nobody has it          → orphan branch, empty root commit, push -u
   */
  private ensureWorktree(workspaceRoot: string): void {
    if (this.ready.has(workspaceRoot)) { return; }
    const wt = this.worktree(workspaceRoot);
    if (fs.existsSync(path.join(wt, '.git'))) { this.ready.add(workspaceRoot); return; }

    fs.mkdirSync(path.dirname(wt), { recursive: true });

    const online = this.hasRemote(workspaceRoot);
    if (online) { this.trySilently(workspaceRoot, ['fetch', this.remote]); }

    const remoteHas = online && this.trySilently(
      workspaceRoot, ['show-ref', '--verify', '--quiet', `refs/remotes/${this.remote}/${this.branch}`],
    );
    const localHas = this.trySilently(
      workspaceRoot, ['show-ref', '--verify', '--quiet', `refs/heads/${this.branch}`],
    );

    if (remoteHas) {
      this.inRepo(workspaceRoot, ['worktree', 'add', '-B', this.branch, wt, `${this.remote}/${this.branch}`]);
    } else if (localHas) {
      this.inRepo(workspaceRoot, ['worktree', 'add', wt, this.branch]);
    } else {
      this.inRepo(workspaceRoot, ['worktree', 'add', '--orphan', '-b', this.branch, wt]);
      this.inWorktree(workspaceRoot, ['commit', '--allow-empty', '-m', 'aidlc: init state branch']);
      if (online) {
        this.trySilently(wt, ['push', '-u', this.remote, this.branch]);
      }
    }
    this.ready.add(workspaceRoot);
  }

  /** Rebase local state onto the remote branch, if syncing and online. */
  private pull(workspaceRoot: string): void {
    if (!this.autoSync || !this.hasRemote(workspaceRoot)) { return; }
    this.trySilently(this.worktree(workspaceRoot), ['pull', '--rebase', this.remote, this.branch]);
  }

  /** Commit staged + unstaged run changes in the worktree, if any. */
  private commit(workspaceRoot: string, message: string): void {
    this.inWorktree(workspaceRoot, ['add', '-A']);
    const dirty = this.inWorktree(workspaceRoot, ['status', '--porcelain']).trim();
    if (dirty.length === 0) { return; }
    this.inWorktree(workspaceRoot, ['commit', '-m', message]);
  }

  /** Push the state branch, if syncing and online. Rebases first to avoid rejects. */
  private push(workspaceRoot: string): void {
    if (!this.autoSync || !this.hasRemote(workspaceRoot)) { return; }
    this.trySilently(this.worktree(workspaceRoot), ['pull', '--rebase', this.remote, this.branch]);
    this.trySilently(this.worktree(workspaceRoot), ['push', this.remote, this.branch]);
  }
}
