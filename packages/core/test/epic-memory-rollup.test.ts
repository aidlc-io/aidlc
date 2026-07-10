import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  readEpicMemories,
  rollupEpicMemories,
  rollupProjectMemory,
  loadProjectMemory,
  renderProjectMemory,
  type EpicMemorySource,
} from '../src';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-mem-'));
}

function writeEpicMemory(root: string, epic: string, mem: unknown): void {
  const dir = path.join(root, 'docs', 'epics', epic);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'epic-memory.json'), JSON.stringify(mem, null, 2));
}

describe('rollupEpicMemories (pure)', () => {
  it('aggregates constraints/decisions/reflections across epics', () => {
    const sources: EpicMemorySource[] = [
      {
        epic: 'EPIC-1',
        memory: {
          epic: 'EPIC-1',
          entries: [
            { kind: 'constraint', text: 'Always use lib X', author: 'alice' },
            { kind: 'decision', text: 'Chose Postgres' },
            { kind: 'note', text: 'ignore me' },
          ],
          reflections: [{ text: 'Prompt with file paths, not contents' }],
        },
      },
      {
        epic: 'EPIC-2',
        memory: {
          epic: 'EPIC-2',
          entries: [{ kind: 'constraint', text: 'Never touch module Y' }],
          reflections: [],
        },
      },
    ];
    const rolled = rollupEpicMemories(sources, '2026-01-01T00:00:00Z');
    expect(rolled.epics).toEqual(['EPIC-1', 'EPIC-2']);
    expect(rolled.constraints.map((c) => c.text)).toEqual(['Always use lib X', 'Never touch module Y']);
    expect(rolled.decisions.map((d) => d.text)).toEqual(['Chose Postgres']);
    expect(rolled.reflections).toHaveLength(1);
    expect(rolled.constraints[0].epic).toBe('EPIC-1');
  });

  it('de-duplicates by normalized text (first epic wins)', () => {
    const sources: EpicMemorySource[] = [
      { epic: 'EPIC-1', memory: { epic: 'EPIC-1', entries: [{ kind: 'constraint', text: 'Use lib X' }] } },
      { epic: 'EPIC-2', memory: { epic: 'EPIC-2', entries: [{ kind: 'constraint', text: '  use   lib x ' }] } },
    ];
    const rolled = rollupEpicMemories(sources);
    expect(rolled.constraints).toHaveLength(1);
    expect(rolled.constraints[0].epic).toBe('EPIC-1');
  });

  it('skips empty/whitespace text', () => {
    const rolled = rollupEpicMemories([
      { epic: 'E', memory: { epic: 'E', entries: [{ kind: 'constraint', text: '   ' }], reflections: [{ text: '' }] } },
    ]);
    expect(rolled.constraints).toHaveLength(0);
    expect(rolled.reflections).toHaveLength(0);
  });
});

describe('readEpicMemories + rollupProjectMemory (filesystem)', () => {
  it('reads per-epic files and writes .aidlc/memory.json', () => {
    const root = tmpRoot();
    writeEpicMemory(root, 'EPIC-1', {
      entries: [{ kind: 'constraint', text: 'Standing rule' }],
      reflections: [{ text: 'A reflection' }],
    });
    writeEpicMemory(root, 'EPIC-2', { entries: [{ kind: 'decision', text: 'A decision' }] });

    const sources = readEpicMemories(root);
    expect(sources).toHaveLength(2);

    const { memory, path: outPath } = rollupProjectMemory(root);
    expect(fs.existsSync(outPath)).toBe(true);
    expect(outPath).toContain(path.join('.aidlc', 'memory.json'));
    expect(memory.constraints).toHaveLength(1);
    expect(memory.decisions).toHaveLength(1);

    const loaded = loadProjectMemory(root);
    expect(loaded?.constraints[0].text).toBe('Standing rule');
  });

  it('tolerates a missing epics dir', () => {
    const root = tmpRoot();
    expect(readEpicMemories(root)).toEqual([]);
    const { memory } = rollupProjectMemory(root);
    expect(memory.epics).toEqual([]);
  });

  it('skips corrupt epic-memory.json', () => {
    const root = tmpRoot();
    const dir = path.join(root, 'docs', 'epics', 'EPIC-BAD');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'epic-memory.json'), '{ not json');
    expect(readEpicMemories(root)).toEqual([]);
  });

  it('renders Markdown', () => {
    const md = renderProjectMemory({
      schemaVersion: 1,
      generatedAt: '2026-01-01T00:00:00Z',
      epics: ['EPIC-1'],
      constraints: [{ text: 'Use lib X', epic: 'EPIC-1', author: 'alice' }],
      decisions: [],
      reflections: [],
    });
    expect(md).toContain('# Project memory');
    expect(md).toContain('Standing constraints');
    expect(md).toContain('Use lib X');
  });
});
