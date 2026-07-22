import { describe, it, expect } from 'vitest';
import { generatePlan, renderPlanMarkdown } from '../src';
import type { EpicContext } from '../src';
import type { PipelineConfig } from '../src';

const ctx = (scope: string): EpicContext => ({
  epic: 'TEST-1',
  scope,
  codebase_paths: ['src', 'packages'],
  its_location: ['tests'],
  createdAt: '2026-07-22T00:00:00.000Z',
});

const pipeline = (): PipelineConfig => ({
  id: 'test-pipeline',
  on_failure: 'stop',
  steps: [
    { name: 'plan', agent: 'aidlc-po', skills: ['aidlc-prd'], enabled: true,
      produces: [], produces_contains: [], requires: [], depends_on: [],
      auto_review: false, human_review: true },
    { name: 'implement', agent: 'aidlc-developer', skills: ['aidlc-implement'], enabled: true,
      produces: [], produces_contains: [], requires: [], depends_on: ['plan'],
      auto_review: false, human_review: true },
  ],
} as unknown as PipelineConfig);

const workspace = {
  agents: [
    { id: 'aidlc-po', skills: ['aidlc-prd'] },
    { id: 'aidlc-developer', skills: ['aidlc-implement'] },
  ],
};

describe('generatePlan', () => {
  it('infers simple complexity for a CRUD form scope', () => {
    const plan = generatePlan('TEST-1', ctx('Add a simple login form'), pipeline(), workspace);
    expect(plan.scope_complexity).toBe('simple');
    expect(plan.total_agent_count).toBe(2); // 2 phases * 1 agent
  });

  it('infers complex complexity for a refactor/system scope', () => {
    const plan = generatePlan('TEST-1', ctx('Refactor the microservice system architecture'), pipeline(), workspace);
    expect(plan.scope_complexity).toBe('complex');
    expect(plan.total_agent_count).toBeGreaterThan(2);
  });

  it('infers medium complexity for a generic scope', () => {
    const plan = generatePlan('TEST-1', ctx('Add notification delivery'), pipeline(), workspace);
    expect(plan.scope_complexity).toBe('medium');
  });

  it('maps each pipeline step to a phase with the right agent + skills', () => {
    const plan = generatePlan('TEST-1', ctx('Add a form'), pipeline(), workspace);
    expect(plan.phases.map((p) => p.name)).toEqual(['plan', 'implement']);
    expect(plan.phases[0].agents[0].agent_id).toBe('aidlc-po');
    expect(plan.phases[0].agents[0].skills).toEqual(['aidlc-prd']);
  });

  it('splits scope on "and" into separate tasks', () => {
    const plan = generatePlan('TEST-1', ctx('Add authentication and admin dashboard'), pipeline(), workspace);
    expect(plan.tasks.length).toBe(2);
    expect(plan.tasks[0].description).toContain('authentication');
    expect(plan.tasks[1].description).toContain('admin dashboard');
  });

  it('estimates a timeline string', () => {
    const plan = generatePlan('TEST-1', ctx('Add a form'), pipeline(), workspace);
    expect(plan.estimated_timeline).toMatch(/day|week/);
  });

  it('normalizes bare-string steps', () => {
    const strPipeline = {
      id: 'p', on_failure: 'stop', steps: ['plan', 'implement'],
    } as unknown as PipelineConfig;
    const plan = generatePlan('TEST-1', ctx('Add a form'), strPipeline, workspace);
    expect(plan.phases.map((p) => p.name)).toEqual(['plan', 'implement']);
  });
});

describe('discovery step', () => {
  it('always includes a discovery step', () => {
    const plan = generatePlan('TEST-1', ctx('Add a form'), pipeline(), workspace);
    expect(plan.discovery).toBeDefined();
    expect(Array.isArray(plan.discovery.gathered)).toBe(true);
    expect(Array.isArray(plan.discovery.open_questions)).toBe(true);
  });

  it('reports gathered context when spec/codebase/tests are present', () => {
    const plan = generatePlan('TEST-1', ctx('Add a form'), pipeline(), workspace);
    expect(plan.discovery.gathered.some((g) => g.includes('Codebase'))).toBe(true);
    expect(plan.discovery.gathered.some((g) => g.includes('Test'))).toBe(true);
  });

  it('raises open questions when context is missing', () => {
    const bare: EpicContext = { epic: 'X', scope: 'Add a form', createdAt: '2026-07-22T00:00:00.000Z' };
    const plan = generatePlan('X', bare, pipeline(), workspace);
    expect(plan.discovery.open_questions.length).toBeGreaterThan(0);
  });

  it('detects a discovery gate when a step carries the discovery-gate skill', () => {
    const gated = {
      id: 'p', on_failure: 'stop',
      steps: [{ name: 'plan', agent: 'aidlc-po', skills: ['aidlc-prd', 'aidlc-discovery-gate'],
        enabled: true, produces: [], produces_contains: [], requires: [], depends_on: [],
        auto_review: false, human_review: true }],
    } as unknown as PipelineConfig;
    const plan = generatePlan('X', ctx('Add a form'), gated, workspace);
    expect(plan.discovery.gate_present).toBe(true);
  });
});

describe('prototype suggestion', () => {
  it('suggests a prototype phase for UI scope with no design and no prototype step', () => {
    const plan = generatePlan('X', ctx('Add a new dashboard screen'), pipeline(), workspace);
    expect(plan.suggestions.some((s) => s.phase === 'prototype')).toBe(true);
  });

  it('does NOT suggest prototype when a design_url already exists', () => {
    const withDesign: EpicContext = { ...ctx('Add a dashboard screen'), design_url: 'artifacts/PROTOTYPE.md' };
    const plan = generatePlan('X', withDesign, pipeline(), workspace);
    expect(plan.suggestions.some((s) => s.phase === 'prototype')).toBe(false);
  });

  it('does NOT suggest prototype when the pipeline already has a prototype step', () => {
    const withProto = {
      id: 'p', on_failure: 'stop',
      steps: [
        { name: 'prototype', agent: 'aidlc-designer', skills: ['aidlc-prototype'], enabled: true,
          produces: [], produces_contains: [], requires: [], depends_on: [],
          auto_review: false, human_review: true },
      ],
    } as unknown as PipelineConfig;
    const plan = generatePlan('X', ctx('Add a dashboard screen'), withProto, workspace);
    expect(plan.suggestions.some((s) => s.phase === 'prototype')).toBe(false);
  });

  it('does NOT suggest prototype for non-UI scope', () => {
    const plan = generatePlan('X', ctx('Add a data export cron job'), pipeline(), workspace);
    expect(plan.suggestions.some((s) => s.phase === 'prototype')).toBe(false);
  });
});

describe('renderPlanMarkdown', () => {
  it('renders scope, complexity, timeline, phases, and tasks', () => {
    const plan = generatePlan('TEST-1', ctx('Add authentication and dashboard'), pipeline(), workspace);
    const md = renderPlanMarkdown(plan);
    expect(md).toContain('# aidlc-autopilot Plan: TEST-1');
    expect(md).toContain('Complexity:');
    expect(md).toContain('Timeline:');
    expect(md).toContain('## Phases');
    expect(md).toContain('## Tasks');
    expect(md).toContain('aidlc-po');
  });
});
