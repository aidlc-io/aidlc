import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  startRun,
  markStepDone,
  approveStep,
  rejectStep,
  rerunStep,
  verifyRun,
  renderRunReport,
  type PipelineConfig,
  type RunState,
} from '../src';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-verify-'));
}

function touch(root: string, rel: string, content = 'x'.repeat(20)): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

const PIPELINE: PipelineConfig = {
  id: 'p1',
  on_failure: 'stop',
  steps: [
    {
      agent: 'po',
      name: 'plan',
      requires: [],
      produces: ['docs/{epic}/PRD.md'],
      produces_contains: ['## Acceptance Criteria'],
      human_review: true,
      auto_review: false,
      enabled: true,
    },
    {
      agent: 'tech-lead',
      name: 'design',
      requires: ['docs/{epic}/PRD.md'],
      produces: ['docs/{epic}/TECH-DESIGN.md'],
      human_review: true,
      auto_review: false,
      enabled: true,
    },
  ],
};

/** Drive a run to completion (both steps produced + approved). */
function completeRun(root: string): RunState {
  touch(root, 'docs/E-1/PRD.md', '# PRD\n## Acceptance Criteria\n- works');
  let state = startRun({ runId: 'R-1', pipeline: PIPELINE, context: { epic: 'E-1' } });
  state = markStepDone({ state, pipeline: PIPELINE, workspaceRoot: root });
  state = approveStep({ state, pipeline: PIPELINE });
  touch(root, 'docs/E-1/TECH-DESIGN.md', '# Design');
  state = markStepDone({ state, pipeline: PIPELINE, workspaceRoot: root });
  state = approveStep({ state, pipeline: PIPELINE });
  return state;
}

describe('verifyRun — post-run drift check', () => {
  let root: string;
  beforeEach(() => { root = tmpRoot(); });

  it('reports ok when every recorded artifact still exists and passes markers', () => {
    const state = completeRun(root);
    const report = verifyRun({ state, pipeline: PIPELINE, workspaceRoot: root });
    expect(report.ok).toBe(true);
    expect(report.checked).toBe(2);
    expect(report.drift).toHaveLength(0);
  });

  it('detects a deleted artifact', () => {
    const state = completeRun(root);
    fs.rmSync(path.join(root, 'docs/E-1/TECH-DESIGN.md'));
    const report = verifyRun({ state, pipeline: PIPELINE, workspaceRoot: root });
    expect(report.ok).toBe(false);
    expect(report.drift).toHaveLength(1);
    expect(report.drift[0].agent).toBe('tech-lead');
    expect(report.drift[0].missing).toEqual(['docs/E-1/TECH-DESIGN.md']);
  });

  it('detects content drift when a produces_contains marker is gutted', () => {
    const state = completeRun(root);
    // Overwrite the PRD so the required section is gone.
    touch(root, 'docs/E-1/PRD.md', '# PRD\n(empty)');
    const report = verifyRun({ state, pipeline: PIPELINE, workspaceRoot: root });
    expect(report.ok).toBe(false);
    const drift = report.drift.find((d) => d.agent === 'po');
    expect(drift?.missingMarkers).toEqual(['## Acceptance Criteria']);
    expect(drift?.missing).toHaveLength(0);
  });

  it('skips steps that produced nothing', () => {
    touch(root, 'docs/E-1/PRD.md', '# PRD\n## Acceptance Criteria');
    let state = startRun({ runId: 'R-2', pipeline: PIPELINE, context: { epic: 'E-1' } });
    state = markStepDone({ state, pipeline: PIPELINE, workspaceRoot: root });
    // Only step 0 produced; step 1 still pending.
    const report = verifyRun({ state, pipeline: PIPELINE, workspaceRoot: root });
    expect(report.checked).toBe(1);
    expect(report.ok).toBe(true);
  });
});

describe('renderRunReport — markdown', () => {
  let root: string;
  beforeEach(() => { root = tmpRoot(); });

  it('renders a header, context, and a step table', () => {
    const state = completeRun(root);
    const md = renderRunReport({ state, pipeline: PIPELINE });
    expect(md).toContain('# Run Report: R-1');
    expect(md).toContain('- **Pipeline:** p1');
    expect(md).toContain('- **Status:** completed');
    expect(md).toContain('`epic`: E-1');
    expect(md).toContain('| # | Step | Status | Rev | Duration | Cost |');
    // Uses the pipeline step `name` as label, not the agent id.
    expect(md).toContain('| 0 | plan | approved | 1 |');
    expect(md).toContain('| 1 | design | approved | 1 |');
  });

  it('captures reject reasons and rerun history in step details', () => {
    touch(root, 'docs/E-1/PRD.md', '# PRD\n## Acceptance Criteria');
    let state = startRun({ runId: 'R-3', pipeline: PIPELINE, context: { epic: 'E-1' } });
    state = markStepDone({ state, pipeline: PIPELINE, workspaceRoot: root });
    state = rejectStep({ state, reason: 'missing scope section' });
    state = rerunStep({ state, feedback: 'add scope' });
    const md = renderRunReport({ state, pipeline: PIPELINE });
    expect(md).toContain('## Step details');
    expect(md).toContain('missing scope section');
    expect(md).toContain('add scope');
  });

  it('shows total cost when any step reported it', () => {
    const state = completeRun(root);
    state.steps[0].costUsd = 0.12;
    state.steps[1].costUsd = 0.34;
    const md = renderRunReport({ state, pipeline: PIPELINE });
    expect(md).toContain('- **Total cost:** $0.4600');
  });
});
