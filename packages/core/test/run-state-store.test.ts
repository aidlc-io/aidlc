import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  RunStateStore,
  FileRunStateStore,
  RUN_ID_PATTERN,
  type RunStateBackend,
  type RunState,
} from '../src';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-store-'));
}

function makeState(overrides: Partial<RunState> = {}): RunState {
  return {
    schemaVersion: 1,
    runId: 'CPD-1',
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

// Always restore the default backend so a failing test can't leak a fake
// backend into the rest of the suite.
afterEach(() => RunStateStore.resetBackend());

describe('FileRunStateStore — unchanged filesystem behaviour', () => {
  let store: FileRunStateStore;
  beforeEach(() => { store = new FileRunStateStore(); });

  it('save → load round-trips the state', () => {
    const root = tmpRoot();
    const state = makeState({ runId: 'CPD-1', context: { epic: 'CPD-1' } });
    store.save(root, state);
    const loaded = store.load(root, 'CPD-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.runId).toBe('CPD-1');
    expect(loaded!.context).toEqual({ epic: 'CPD-1' });
  });

  it('writes to <root>/.aidlc/runs/<id>.json as pretty JSON', () => {
    const root = tmpRoot();
    store.save(root, makeState({ runId: 'ABC-9' }));
    const expected = path.join(root, '.aidlc', 'runs', 'ABC-9.json');
    expect(fs.existsSync(expected)).toBe(true);
    expect(store.file(root, 'ABC-9')).toBe(expected);
    expect(store.dir(root)).toBe(path.join(root, '.aidlc', 'runs'));
    // 2-space indented JSON, exactly like the original store.
    expect(fs.readFileSync(expected, 'utf8')).toContain('\n  "runId": "ABC-9"');
  });

  it('stamps updatedAt at save time', () => {
    const root = tmpRoot();
    const before = new Date().toISOString();
    const state = makeState({ updatedAt: '2000-01-01T00:00:00.000Z' });
    store.save(root, state);
    // save mutates the in-memory object and persists the fresh stamp.
    expect(state.updatedAt >= before).toBe(true);
    expect(store.load(root, state.runId)!.updatedAt).toBe(state.updatedAt);
  });

  it('list() returns [] when the runs dir is missing', () => {
    expect(store.list(tmpRoot())).toEqual([]);
  });

  it('list() sorts by updatedAt descending', () => {
    const root = tmpRoot();
    store.save(root, makeState({ runId: 'old', updatedAt: '2026-01-01T00:00:00.000Z' }));
    store.save(root, makeState({ runId: 'new', updatedAt: '2026-06-01T00:00:00.000Z' }));
    // save() re-stamps updatedAt, so overwrite the files directly to control order.
    const dir = path.join(root, '.aidlc', 'runs');
    fs.writeFileSync(path.join(dir, 'old.json'), JSON.stringify(makeState({ runId: 'old', updatedAt: '2026-01-01T00:00:00.000Z' })));
    fs.writeFileSync(path.join(dir, 'new.json'), JSON.stringify(makeState({ runId: 'new', updatedAt: '2026-06-01T00:00:00.000Z' })));
    expect(store.list(root).map((r) => r.runId)).toEqual(['new', 'old']);
  });

  it('delete() removes the run and is a no-op when absent', () => {
    const root = tmpRoot();
    store.save(root, makeState({ runId: 'gone' }));
    store.delete(root, 'gone');
    expect(store.load(root, 'gone')).toBeNull();
    expect(() => store.delete(root, 'gone')).not.toThrow();
  });

  it('load() returns null for a missing run', () => {
    expect(store.load(tmpRoot(), 'nope')).toBeNull();
  });

  it('load() returns null for a wrong schemaVersion', () => {
    const root = tmpRoot();
    const dir = path.join(root, '.aidlc', 'runs');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'v2.json'), JSON.stringify({ schemaVersion: 2, runId: 'v2' }));
    expect(store.load(root, 'v2')).toBeNull();
  });

  it('list() skips corrupt / non-json / wrong-version files', () => {
    const root = tmpRoot();
    const dir = path.join(root, '.aidlc', 'runs');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'good.json'), JSON.stringify(makeState({ runId: 'good' })));
    fs.writeFileSync(path.join(dir, 'corrupt.json'), '{ not valid json');
    fs.writeFileSync(path.join(dir, 'v2.json'), JSON.stringify({ schemaVersion: 2, runId: 'v2' }));
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignore me');
    expect(store.list(root).map((r) => r.runId)).toEqual(['good']);
  });

  it('file() rejects ids that violate RUN_ID_PATTERN', () => {
    const root = tmpRoot();
    expect(() => store.file(root, '../escape')).toThrow(/Invalid runId/);
    expect(() => store.file(root, 'has space')).toThrow(/Invalid runId/);
    expect(RUN_ID_PATTERN.test('EPIC-2100')).toBe(true);
  });
});

describe('RunStateStore static facade', () => {
  it('delegates to a default FileRunStateStore (identical behaviour)', () => {
    const root = tmpRoot();
    RunStateStore.save(root, makeState({ runId: 'CPD-2' }));
    // Same bytes on disk as the instance store would produce.
    const viaStatic = fs.readFileSync(path.join(root, '.aidlc', 'runs', 'CPD-2.json'), 'utf8');
    expect(RunStateStore.load(root, 'CPD-2')!.runId).toBe('CPD-2');
    expect(RunStateStore.getBackend()).toBeInstanceOf(FileRunStateStore);
    expect(viaStatic).toContain('"runId": "CPD-2"');
  });

  it('setBackend routes every static method to the active backend', () => {
    const calls: string[] = [];
    const fake: RunStateBackend = {
      dir: (r) => { calls.push('dir'); return `${r}/x`; },
      file: (r, id) => { calls.push(`file:${id}`); return `${r}/${id}`; },
      list: () => { calls.push('list'); return []; },
      load: () => { calls.push('load'); return null; },
      save: () => { calls.push('save'); },
      delete: () => { calls.push('delete'); },
    };
    const previous = RunStateStore.setBackend(fake);
    expect(previous).toBeInstanceOf(FileRunStateStore);
    expect(RunStateStore.getBackend()).toBe(fake);

    RunStateStore.dir('/w');
    RunStateStore.file('/w', 'r1');
    RunStateStore.list('/w');
    RunStateStore.load('/w', 'r1');
    RunStateStore.save('/w', makeState());
    RunStateStore.delete('/w', 'r1');

    expect(calls).toEqual(['dir', 'file:r1', 'list', 'load', 'save', 'delete']);
  });

  it('resetBackend restores the default file backend', () => {
    const fake = { dir: () => '', file: () => '', list: () => [], load: () => null, save: () => {}, delete: () => {} };
    RunStateStore.setBackend(fake);
    RunStateStore.resetBackend();
    expect(RunStateStore.getBackend()).toBeInstanceOf(FileRunStateStore);

    // Real persistence works again after reset.
    const root = tmpRoot();
    RunStateStore.save(root, makeState({ runId: 'after-reset' }));
    expect(RunStateStore.load(root, 'after-reset')!.runId).toBe('after-reset');
  });

  it('a swapped backend fully replaces filesystem persistence', () => {
    const mem = new Map<string, RunState>();
    RunStateStore.setBackend({
      dir: () => 'mem',
      file: (_r, id) => `mem:${id}`,
      list: () => [...mem.values()],
      load: (_r, id) => mem.get(id) ?? null,
      save: (_r, s) => { mem.set(s.runId, s); },
      delete: (_r, id) => { mem.delete(id); },
    });
    const root = tmpRoot();
    RunStateStore.save(root, makeState({ runId: 'in-memory' }));
    // Nothing hit the disk.
    expect(fs.existsSync(path.join(root, '.aidlc', 'runs'))).toBe(false);
    expect(RunStateStore.load(root, 'in-memory')!.runId).toBe('in-memory');
    expect(RunStateStore.list(root).map((r) => r.runId)).toEqual(['in-memory']);
  });
});
