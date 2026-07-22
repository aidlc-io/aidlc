import { describe, it, expect } from 'vitest';
import {
  buildPhaseCatalog,
  parseAdaptationVerdict,
  applyAdaptation,
  buildAdaptationPrompt,
  PipelineAdaptError,
} from '../src/runs/PipelineAdapter';
import type { WorkspaceConfig, PipelineConfig } from '../src/schema/WorkspaceSchema';

// A workspace whose source pipeline defines the full phase catalog (each step
// wires a real agent + skill), plus a smaller "base" pipeline the adapter
// tailors.
function makeConfig(): WorkspaceConfig {
  return {
    version: '1.0',
    agents: [
      { id: 'po', skills: ['prd'] },
      { id: 'designer', skills: ['proto'] },
      { id: 'dev', skills: ['impl'] },
    ],
    skills: [
      { id: 'prd', path: '~/prd.md' },
      { id: 'proto', path: '~/proto.md' },
      { id: 'impl', path: '~/impl.md' },
    ],
    environment: {},
    slash_commands: [],
    recipes: [],
    pipelines: [
      {
        id: 'full',
        steps: [
          { name: 'plan', agent: 'po', skills: ['prd'] },
          { name: 'prototype', agent: 'designer', skills: ['proto'] },
          { name: 'implement', agent: 'dev', skills: ['impl'] },
        ],
        on_failure: 'stop',
      },
    ],
  } as unknown as WorkspaceConfig;
}

const BASE: PipelineConfig = {
  id: 'EPIC-1',
  steps: [
    { name: 'plan', agent: 'po', skills: ['prd'] },
    { name: 'implement', agent: 'dev', skills: ['impl'] },
  ],
  on_failure: 'stop',
} as unknown as PipelineConfig;

describe('buildPhaseCatalog', () => {
  it('collects every step across pipelines, keyed by dag id', () => {
    const cat = buildPhaseCatalog(makeConfig());
    expect([...cat.keys()].sort()).toEqual(['implement', 'plan', 'prototype']);
    expect(cat.get('prototype')?.agent).toBe('designer');
  });
});

describe('parseAdaptationVerdict', () => {
  const cfg = makeConfig();
  const catalog = buildPhaseCatalog(cfg);

  it('keeps only addable catalog phases and removable current phases', () => {
    const raw = JSON.stringify({
      add: [
        { phase: 'prototype', after: 'plan', reason: 'UI, no design' },
        { phase: 'nonexistent', reason: 'hallucinated' },   // dropped: not in catalog
        { phase: 'plan', reason: 'already present' },        // dropped: already in base
      ],
      remove: [
        { phase: 'implement', reason: 'spike only' },
        { phase: 'design', reason: 'not present' },          // dropped: not in base
      ],
      reasoning: 'tailored',
    });
    const v = parseAdaptationVerdict(raw, BASE, catalog);
    expect(v.add.map((a) => a.phase)).toEqual(['prototype']);
    expect(v.remove.map((r) => r.phase)).toEqual(['implement']);
  });

  it('tolerates prose / code fences around the JSON', () => {
    const raw = 'Here you go:\n```json\n{"add":[],"remove":[],"reasoning":"fits"}\n```';
    const v = parseAdaptationVerdict(raw, BASE, catalog);
    expect(v.add).toEqual([]);
    expect(v.reasoning).toBe('fits');
  });

  it('throws when no JSON object is present', () => {
    expect(() => parseAdaptationVerdict('no json here', BASE, catalog)).toThrow(PipelineAdaptError);
  });
});

describe('applyAdaptation', () => {
  const cfg = makeConfig();
  const catalog = buildPhaseCatalog(cfg);

  it('inserts an added phase after its anchor', () => {
    const adapted = applyAdaptation(
      BASE,
      { add: [{ phase: 'prototype', after: 'plan', reason: 'UI' }], remove: [], reasoning: 'x' },
      catalog,
      cfg,
    );
    const order = adapted.steps.map((s) => (s as { name?: string }).name);
    expect(order).toEqual(['plan', 'prototype', 'implement']);
  });

  it('removes a dropped phase', () => {
    const adapted = applyAdaptation(
      BASE,
      { add: [], remove: [{ phase: 'implement', reason: 'spike' }], reasoning: 'x' },
      catalog,
      cfg,
    );
    expect(adapted.steps.map((s) => (s as { name?: string }).name)).toEqual(['plan']);
  });

  it('appends when no valid anchor is given', () => {
    const adapted = applyAdaptation(
      BASE,
      { add: [{ phase: 'prototype', reason: 'UI' }], remove: [], reasoning: 'x' },
      catalog,
      cfg,
    );
    expect(adapted.steps.map((s) => (s as { name?: string }).name)).toEqual(['plan', 'implement', 'prototype']);
  });

  it('produces a valid prompt mentioning addable phases', () => {
    const prompt = buildAdaptationPrompt(BASE, catalog);
    expect(prompt).toContain('prototype');
    expect(prompt).toContain('plan → implement');
  });
});
