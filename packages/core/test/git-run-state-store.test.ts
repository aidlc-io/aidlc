import { describe, it, expect, beforeEach } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { GitRunStateStore, type RunState } from '../src';

// Deterministic git identity so commits don't depend on the host's config.
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Tester', GIT_AUTHOR_EMAIL: 'test@aidlc',
  GIT_COMMITTER_NAME: 'Tester', GIT_COMMITTER_EMAIL: 'test@aidlc',
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
};

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: GIT_ENV, stdio: ['ignore', 'pipe', 'pipe'] });
}

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeState(runId: string, overrides: Partial<RunState> = {}): RunState {
  return {
    schemaVersion: 1,
    runId,
    pipelineId: 'p1',
    context: {},
    startedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    currentStepIdx: 0,
    status: 'in_progress',
    steps: [],
    ...overrides,
  } as RunState;
}

/** A bare remote seeded with a `main` branch (a repo that already has code). */
function seededBareRemote(): string {
  const root = tmp('aidlc-git-');
  const remote = path.join(root, 'remote.git');
  const seed = path.join(root, 'seed');
  git(['init', '-q', '--bare', remote], root);
  git(['init', '-q', seed], root);
  fs.writeFileSync(path.join(seed, 'file.txt'), 'code');
  git(['add', '.'], seed);
  git(['commit', '-qm', 'init'], seed);
  git(['branch', '-M', 'main'], seed);
  git(['remote', 'add', 'origin', remote], seed);
  git(['push', '-q', 'origin', 'main'], seed);
  return remote;
}

function clone(remote: string, into: string): string {
  const dir = path.join(path.dirname(remote), into);
  git(['clone', '-q', remote, dir], path.dirname(remote));
  return dir;
}

function newStore(): GitRunStateStore {
  // Inject the same git identity used by the harness above.
  return new GitRunStateStore({ git: (args, cwd) => git(args, cwd) });
}

describe('GitRunStateStore — multi-user sync through a shared remote', () => {
  it('propagates a run from user A to user B via the aidlc-state branch', () => {
    const remote = seededBareRemote();
    const userA = clone(remote, 'userA');
    const userB = clone(remote, 'userB');
    const storeA = newStore();
    const storeB = newStore();

    // A creates a run — bootstraps the orphan branch and pushes it.
    storeA.save(userA, makeState('run1', { context: { epic: 'run1' } }));

    // B, on a different clone, sees it after its own read syncs.
    const seenByB = storeB.load(userB, 'run1');
    expect(seenByB).not.toBeNull();
    expect(seenByB!.context).toEqual({ epic: 'run1' });

    // B adds a second run and pushes.
    storeB.save(userB, makeState('run2'));

    // A now sees both runs.
    expect(storeA.list(userA).map((r) => r.runId).sort()).toEqual(['run1', 'run2']);

    // State lives on the dedicated branch, isolated from code (main).
    const branches = git(['branch', '-a'], userA);
    expect(branches).toContain('aidlc-state');
    // The code branch is untouched — no run json leaked onto main's tree.
    expect(fs.existsSync(path.join(userA, 'runs'))).toBe(false);
  });

  it('delete on one clone removes the run on the other', () => {
    const remote = seededBareRemote();
    const userA = clone(remote, 'userA');
    const userB = clone(remote, 'userB');
    const storeA = newStore();
    const storeB = newStore();

    storeA.save(userA, makeState('doomed'));
    expect(storeB.load(userB, 'doomed')).not.toBeNull();

    storeB.delete(userB, 'doomed');
    expect(storeA.load(userA, 'doomed')).toBeNull();
    expect(storeA.list(userA)).toEqual([]);
  });

  it('records an append-only audit trail in git history', () => {
    const remote = seededBareRemote();
    const userA = clone(remote, 'userA');
    const store = newStore();
    store.save(userA, makeState('audited'));

    const log = git(['log', '--format=%s', 'aidlc-state'], userA);
    expect(log).toContain('aidlc: save run audited');
    expect(log).toContain('aidlc: init state branch');
  });
});

describe('GitRunStateStore — local-only (no remote configured)', () => {
  let repo: string;
  let store: GitRunStateStore;

  beforeEach(() => {
    // A plain repo with no `origin` — degrades to commit-only, still durable.
    repo = tmp('aidlc-git-local-');
    git(['init', '-q', repo], path.dirname(repo));
    fs.writeFileSync(path.join(repo, 'file.txt'), 'code');
    git(['add', '.'], repo);
    git(['commit', '-qm', 'init'], repo);
    store = newStore();
  });

  it('save → load round-trips without any remote', () => {
    store.save(repo, makeState('local1', { context: { k: 'v' } }));
    expect(store.load(repo, 'local1')!.context).toEqual({ k: 'v' });
  });

  it('commits each change even offline', () => {
    store.save(repo, makeState('local1'));
    store.save(repo, makeState('local2'));
    const log = git(['log', '--format=%s', 'aidlc-state'], repo);
    expect(log).toContain('aidlc: save run local1');
    expect(log).toContain('aidlc: save run local2');
  });

  it('list reflects saves and deletes', () => {
    store.save(repo, makeState('a'));
    store.save(repo, makeState('b'));
    expect(store.list(repo).map((r) => r.runId).sort()).toEqual(['a', 'b']);
    store.delete(repo, 'a');
    expect(store.list(repo).map((r) => r.runId)).toEqual(['b']);
  });

  it('load returns null for an unknown run', () => {
    store.save(repo, makeState('exists'));
    expect(store.load(repo, 'missing')).toBeNull();
  });

  it('rejects unsafe run ids', () => {
    expect(() => store.file(repo, '../escape')).toThrow(/Invalid runId/);
  });
});
