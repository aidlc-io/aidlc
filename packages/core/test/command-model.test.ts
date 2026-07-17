import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  CANONICAL_PHASES,
  CANONICAL_PHASE_IDS,
  BACKBONE_COMMAND_ID,
  isCanonicalPhase,
  shortcutCommandId,
  resolveComposition,
  nextEligiblePhase,
  unprovisionedPhases,
  backboneCommandDoc,
  shortcutCommandDoc,
  writeTwoLayerCommands,
  provisionShortcutDocs,
} from '../src/presets/commandModel';
import { validateWorkspace, type WorkspaceConfig } from '../src/schema/WorkspaceSchema';
import type { RunState, StepStatus } from '../src/runs/RunState';
import type { PipelineConfig } from '../src/schema/WorkspaceSchema';

// ── fixtures ───────────────────────────────────────────────────────

/** A workspace with two pipelines that wire `design` to DIFFERENT agents. */
function twoPipelineConfig(): WorkspaceConfig {
  return validateWorkspace(
    {
      version: '1.0',
      name: 'two',
      agents: [
        { id: 'po', name: 'PO', skills: ['prd'] },
        { id: 'tech-lead', name: 'TL', skills: ['tech-design'] },
        { id: 'security', name: 'Sec', skills: ['sec-review'] },
      ],
      skills: [
        { id: 'prd', builtin: true },
        { id: 'tech-design', builtin: true },
        { id: 'sec-review', builtin: true },
      ],
      pipelines: [
        {
          id: 'alpha',
          steps: [
            { agent: 'po', name: 'plan', skills: ['prd'] },
            { agent: 'tech-lead', name: 'design', skills: ['tech-design'], depends_on: ['plan'] },
          ],
        },
        {
          id: 'beta',
          steps: [
            // `design` here is wired to a different agent + no per-step skills
            // (should fall back to the agent's skills).
            { agent: 'security', name: 'design' },
            { agent: 'po', name: 'security-review' }, // non-canonical phase
          ],
        },
      ],
    },
    'memory:test',
  );
}

function runState(pipelineId: string, statuses: StepStatus[]): RunState {
  return {
    schemaVersion: 1,
    runId: 'r1',
    pipelineId,
    context: { epic: 'GH-1' },
    startedAt: 't',
    updatedAt: 't',
    currentStepIdx: 0,
    status: 'running',
    steps: statuses.map((status, i) => ({
      stepIdx: i,
      agent: 'x',
      revision: 1,
      status,
      artifactsProduced: [],
    })),
  } as RunState;
}

// ── tests ──────────────────────────────────────────────────────────

describe('commandModel — canonical phases (GH-71)', () => {
  it('includes the two new first-class phases unit-test + benchmark', () => {
    expect(CANONICAL_PHASE_IDS).toContain('unit-test');
    expect(CANONICAL_PHASE_IDS).toContain('benchmark');
    expect(isCanonicalPhase('plan')).toBe(true);
    expect(isCanonicalPhase('security-review')).toBe(false);
  });

  it('shortcut command id has NO pipeline prefix (the whole point of GH-71)', () => {
    expect(shortcutCommandId('plan')).toBe('plan');
    expect(shortcutCommandId('design')).toBe('design');
  });
});

describe('commandModel — resolveComposition (epic → pipeline → phase)', () => {
  it('resolves agent + skills from the pipeline step', () => {
    const c = resolveComposition(twoPipelineConfig(), 'alpha', 'plan');
    expect(c.found).toBe(true);
    expect(c.agent).toBe('po');
    expect(c.skills).toEqual(['prd']);
  });

  it('two pipelines reusing a phase name resolve to DIFFERENT wiring', () => {
    const cfg = twoPipelineConfig();
    const a = resolveComposition(cfg, 'alpha', 'design');
    const b = resolveComposition(cfg, 'beta', 'design');
    expect(a.agent).toBe('tech-lead');
    expect(b.agent).toBe('security');
    expect(a.agent).not.toBe(b.agent);
  });

  it('falls back to the agent’s skills when the step omits per-step skills', () => {
    // beta.design has no `skills:` → should inherit agent `security`'s skills.
    const c = resolveComposition(twoPipelineConfig(), 'beta', 'design');
    expect(c.skills).toEqual(['sec-review']);
  });

  it('returns found:false for a phase the pipeline does not have (drives no-op msg)', () => {
    expect(resolveComposition(twoPipelineConfig(), 'alpha', 'benchmark').found).toBe(false);
    expect(resolveComposition(twoPipelineConfig(), 'nope', 'plan').found).toBe(false);
  });
});

describe('commandModel — nextEligiblePhase (/aidlc <epic> with no phase)', () => {
  const pipeline: PipelineConfig = {
    id: 'alpha',
    on_failure: 'stop',
    steps: [
      { agent: 'po', name: 'plan' },
      { agent: 'tech-lead', name: 'design', depends_on: ['plan'] },
    ] as unknown as PipelineConfig['steps'],
  };

  it('returns an awaiting_work step first', () => {
    const next = nextEligiblePhase(runState('alpha', ['awaiting_work', 'pending']), pipeline);
    expect(next).toEqual({ index: 0, phaseId: 'plan', reason: 'awaiting_work' });
  });

  it('returns a rejected step so it gets reworked', () => {
    const next = nextEligiblePhase(runState('alpha', ['rejected', 'pending']), pipeline);
    expect(next?.reason).toBe('rejected');
  });

  it('unblocks a pending step once its dependency is approved', () => {
    const next = nextEligiblePhase(runState('alpha', ['approved', 'pending']), pipeline);
    expect(next).toEqual({ index: 1, phaseId: 'design', reason: 'unblocked' });
  });

  it('does NOT unblock a pending step whose dependency is not approved', () => {
    // plan is awaiting_review (not approved) → design stays blocked, and plan
    // itself is not an actionable "run" state → null.
    const next = nextEligiblePhase(runState('alpha', ['awaiting_review', 'pending']), pipeline);
    expect(next).toBeNull();
  });

  it('returns null when everything is approved', () => {
    expect(nextEligiblePhase(runState('alpha', ['approved', 'approved']), pipeline)).toBeNull();
  });
});

describe('commandModel — unprovisionedPhases (auto-provision popup)', () => {
  it('surfaces pipeline phases not in the canonical shortcut set', () => {
    // `security-review` in pipeline beta is not canonical.
    expect(unprovisionedPhases(twoPipelineConfig())).toEqual(['security-review']);
  });

  it('returns empty when every phase is canonical', () => {
    const cfg = validateWorkspace(
      {
        version: '1.0',
        name: 'x',
        agents: [{ id: 'po', name: 'PO', skills: ['prd'] }],
        skills: [{ id: 'prd', builtin: true }],
        pipelines: [{ id: 'p', steps: [{ agent: 'po', name: 'plan' }] }],
      },
      'memory:test',
    );
    expect(unprovisionedPhases(cfg)).toEqual([]);
  });
});

describe('commandModel — command docs + writer', () => {
  it('backbone doc documents runtime resolution + structural contract', () => {
    const doc = backboneCommandDoc('docs/epics');
    expect(doc).toContain('/aidlc <epic> [phase]');
    expect(doc).toContain('next eligible phase');
    expect(doc).toContain('state.json');
    expect(doc).toContain('artifacts/');
    expect(doc).toContain('Mark step done');
  });

  it('shortcut doc fixes the phase and handles the missing-step case', () => {
    const plan = CANONICAL_PHASES.find((p) => p.id === 'plan')!;
    const doc = shortcutCommandDoc(plan);
    expect(doc).toContain('/plan <epic>');
    expect(doc).toContain('has no `plan` phase'); // no-op path
    expect(doc).toContain('PRD.md');
  });

  it('provisionShortcutDocs generates a runnable shell for a non-canonical phase', () => {
    const docs = provisionShortcutDocs(['security-review']);
    expect(docs['security-review']).toContain('/security-review <epic>');
  });

  describe('writeTwoLayerCommands', () => {
    let root: string;
    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-cmds-'));
    });
    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    it('writes the backbone + one file per canonical phase', () => {
      const res = writeTwoLayerCommands(root);
      const dir = path.join(root, '.claude', 'commands');
      expect(fs.existsSync(path.join(dir, `${BACKBONE_COMMAND_ID}.md`))).toBe(true);
      for (const id of CANONICAL_PHASE_IDS) {
        expect(fs.existsSync(path.join(dir, `${id}.md`))).toBe(true);
      }
      expect(res.written).toHaveLength(CANONICAL_PHASE_IDS.length + 1);
      // No pipeline prefix anywhere in the filenames.
      expect(fs.existsSync(path.join(dir, 'sdlc-parallel-full-plan.md'))).toBe(false);
    });

    it('is idempotent — a second call skips existing files', () => {
      writeTwoLayerCommands(root);
      const res2 = writeTwoLayerCommands(root);
      expect(res2.written).toEqual([]);
      expect(res2.skipped).toHaveLength(CANONICAL_PHASE_IDS.length + 1);
    });

    it('overwrite:true rewrites existing files', () => {
      writeTwoLayerCommands(root);
      const res = writeTwoLayerCommands(root, { overwrite: true });
      expect(res.written).toHaveLength(CANONICAL_PHASE_IDS.length + 1);
      expect(res.skipped).toEqual([]);
    });
  });
});
