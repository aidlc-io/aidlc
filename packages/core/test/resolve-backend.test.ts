import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';

import {
  resolveRunStateBackend,
  activateRunStateBackend,
  activateBackendFromWorkspace,
  RunStateStore,
  FileRunStateStore,
  GitRunStateStore,
  WorkspaceSchema,
} from '../src';

// activate* mutate the global backend — always restore the default.
afterEach(() => RunStateStore.resetBackend());

function tmpWorkspace(yamlBody: string | null): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-cfg-'));
  if (yamlBody !== null) {
    fs.mkdirSync(path.join(root, '.aidlc'), { recursive: true });
    fs.writeFileSync(path.join(root, '.aidlc', 'workspace.yaml'), yamlBody);
  }
  return root;
}

const BASE = 'version: "1.0"\nname: demo\n';

describe('persistence schema', () => {
  it('is optional and fills defaults when present', () => {
    const parsed = WorkspaceSchema.parse(yaml.load(`${BASE}persistence:\n  backend: git\n`));
    expect(parsed.persistence).toEqual({
      backend: 'git', branch: 'aidlc-state', remote: 'origin', auto_sync: true,
    });
  });

  it('omits persistence entirely when not declared', () => {
    const parsed = WorkspaceSchema.parse(yaml.load(BASE));
    expect(parsed.persistence).toBeUndefined();
  });

  it('rejects an unknown backend', () => {
    const r = WorkspaceSchema.safeParse(yaml.load(`${BASE}persistence:\n  backend: s3\n`));
    expect(r.success).toBe(false);
  });
});

describe('resolveRunStateBackend', () => {
  it('defaults to the file backend when config is absent', () => {
    expect(resolveRunStateBackend(undefined)).toBeInstanceOf(FileRunStateStore);
  });

  it('returns the file backend for backend: file', () => {
    expect(resolveRunStateBackend({ backend: 'file', branch: 'aidlc-state', remote: 'origin', auto_sync: true }))
      .toBeInstanceOf(FileRunStateStore);
  });

  it('returns the git backend for backend: git', () => {
    expect(resolveRunStateBackend({ backend: 'git', branch: 'aidlc-state', remote: 'origin', auto_sync: true }))
      .toBeInstanceOf(GitRunStateStore);
  });
});

describe('activateRunStateBackend', () => {
  it('installs the resolved backend as the active one', () => {
    activateRunStateBackend({ backend: 'git', branch: 'aidlc-state', remote: 'origin', auto_sync: true });
    expect(RunStateStore.getBackend()).toBeInstanceOf(GitRunStateStore);
  });
});

describe('activateBackendFromWorkspace', () => {
  const parse = (t: string) => yaml.load(t);

  it('activates the git backend from a workspace.yaml', () => {
    const root = tmpWorkspace(`${BASE}persistence:\n  backend: git\n  branch: state\n`);
    const backend = activateBackendFromWorkspace(root, parse);
    expect(backend).toBeInstanceOf(GitRunStateStore);
    expect(RunStateStore.getBackend()).toBeInstanceOf(GitRunStateStore);
  });

  it('activates the file backend when persistence is absent', () => {
    const root = tmpWorkspace(BASE);
    expect(activateBackendFromWorkspace(root, parse)).toBeInstanceOf(FileRunStateStore);
  });

  it('leaves the backend untouched and returns null when no workspace.yaml exists', () => {
    const root = tmpWorkspace(null);
    expect(activateBackendFromWorkspace(root, parse)).toBeNull();
    expect(RunStateStore.getBackend()).toBeInstanceOf(FileRunStateStore);
  });

  it('returns null for unparseable YAML rather than throwing', () => {
    const root = tmpWorkspace(':\n  not: [valid');
    expect(activateBackendFromWorkspace(root, parse)).toBeNull();
  });

  it('returns null for a schema-invalid workspace rather than throwing', () => {
    // Missing required `name`.
    const root = tmpWorkspace('version: "1.0"\npersistence:\n  backend: git\n');
    expect(activateBackendFromWorkspace(root, parse)).toBeNull();
    expect(RunStateStore.getBackend()).toBeInstanceOf(FileRunStateStore);
  });
});
