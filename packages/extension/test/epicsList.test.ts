import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listEpics } from '../src/v2/epicsList';

/**
 * Regression coverage for issue #57: a step showed "IN PROGRESS" with no
 * "Mark step done" affordance because the run-state overlay was keyed by
 * agent id. When one persona (e.g. `qa`) owns several pipeline steps, the
 * last-writer-wins map collapsed them, so a mid-pipeline `awaiting_work`
 * step inherited a trailing step's `pending` status and lost its button.
 * The overlay is now keyed by step index.
 */
describe('listEpics run-state overlay with a multi-step agent', () => {
  let root: string;
  const epicId = 'EPIC-1';

  const doc = {
    state: { root: 'docs/epics' },
    slash_commands: [{ name: '/pl-test-plan' }],
    pipelines: [
      {
        id: 'pl',
        steps: [
          { agent: 'po', name: 'plan' },
          { agent: 'arch', name: 'design' },
          { agent: 'qa', name: 'test-plan', produces: ['docs/{epic}/TEST-PLAN.md'] },
          { agent: 'qa', name: 'generate-test-cases' },
          { agent: 'qa', name: 'execute-test' },
        ],
      },
    ],
  } as unknown as Parameters<typeof listEpics>[1];

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-epicslist-'));
    const epicDir = path.join(root, 'docs', 'epics', epicId);
    fs.mkdirSync(epicDir, { recursive: true });
    fs.mkdirSync(path.join(root, '.aidlc', 'runs'), { recursive: true });

    fs.writeFileSync(
      path.join(epicDir, 'state.json'),
      JSON.stringify({
        id: epicId,
        title: 'Test',
        pipeline: 'pl',
        currentStep: 2,
        status: 'in_progress',
        stepStates: [
          { agent: 'po', status: 'done' },
          { agent: 'arch', status: 'done' },
          { agent: 'qa', status: 'in_progress' },
          { agent: 'qa', status: 'pending' },
          { agent: 'qa', status: 'pending' },
        ],
      }),
    );

    const mkStep = (stepIdx: number, agent: string, status: string) => ({
      stepIdx,
      agent,
      revision: 1,
      status,
      artifactsProduced: [],
    });
    fs.writeFileSync(
      path.join(root, '.aidlc', 'runs', `${epicId}.json`),
      JSON.stringify({
        schemaVersion: 1,
        runId: epicId,
        pipelineId: 'pl',
        context: { epic: epicId },
        startedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        currentStepIdx: 2,
        status: 'running',
        steps: [
          mkStep(0, 'po', 'approved'),
          mkStep(1, 'arch', 'approved'),
          mkStep(2, 'qa', 'awaiting_work'),
          mkStep(3, 'qa', 'pending'),
          mkStep(4, 'qa', 'pending'),
        ],
      }),
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('resolves each repeated-agent step independently by index', () => {
    const epic = listEpics(root, doc).find((e) => e.id === epicId);
    expect(epic).toBeDefined();
    const steps = epic!.stepDetails;

    // The genuinely-active qa step keeps its actionable status (drives the
    // "Mark step done" button) instead of inheriting a trailing qa step.
    expect(steps[2].agent).toBe('qa');
    expect(steps[2].runStatus).toBe('awaiting_work');
    expect(steps[2].isCurrentRunStep).toBe(true);

    // Later qa steps stay pending and are not flagged current.
    expect(steps[3].runStatus).toBe('pending');
    expect(steps[4].runStatus).toBe('pending');
    expect(steps[3].isCurrentRunStep).toBe(false);
    expect(steps[4].isCurrentRunStep).toBe(false);

    // Earlier single-agent steps are unaffected.
    expect(steps[0].runStatus).toBe('approved');
    expect(steps[1].runStatus).toBe('approved');
  });
});

/**
 * Coverage for the artifacts-only fallback: a folder with no `state.json`
 * (no pipeline binding) is no longer silently skipped — it's synthesized into
 * an epic straight from the `.md` files in its `artifacts/` folder, mirroring
 * cf-aidlc-dashboard's `pipelineId: 'artifacts'` behavior.
 */
describe('listEpics artifacts-only fallback (no state.json)', () => {
  let root: string;

  const write = (rel: string, body: string) => {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-epicslist-artifacts-'));
    // An epic folder with artifacts but NO state.json, in lifecycle-shuffled order.
    write('docs/epics/LOOSE-1/artifacts/TECH-DESIGN.md', '---\nstatus: draft\n---\n# Design\n');
    write('docs/epics/LOOSE-1/artifacts/PRD.md', '---\nstatus: approved\n---\n# PRD\n');
    write('docs/epics/LOOSE-1/artifacts/.annotation-history.json', '{}');
    // A folder with neither state.json nor artifacts — must stay skipped.
    fs.mkdirSync(path.join(root, 'docs', 'epics', 'EMPTY'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('synthesizes an epic from artifact .md files, ordered by lifecycle', () => {
    const epics = listEpics(root, { state: { root: 'docs/epics' } } as unknown as Parameters<typeof listEpics>[1]);

    // The empty folder is skipped; only the artifacts-bearing one appears.
    expect(epics.map((e) => e.id)).toEqual(['LOOSE-1']);

    const epic = epics[0];
    expect(epic.artifactsOnly).toBe(true);
    expect(epic.pipeline).toBeNull();
    expect(epic.statePath).toBe('');

    // PRD sorts before TECH-DESIGN (lifecycle), dotfiles are excluded.
    expect(epic.stepDetails.map((s) => s.artifact)).toEqual(['PRD.md', 'TECH-DESIGN.md']);

    // Status is read from each artifact's own frontmatter.
    expect(epic.stepDetails[0].status).toBe('done');       // approved
    expect(epic.stepDetails[1].status).toBe('in_progress'); // draft
    expect(epic.status).toBe('in_progress');
  });
});
