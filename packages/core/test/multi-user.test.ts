import { describe, it, expect } from 'vitest';

import {
  validateWorkspace,
  checkReviewPolicy,
  assertCanReview,
  assertCanReviewStep,
  gateIdForStep,
  ReviewNotAllowedError,
  claimRun,
  releaseRun,
  isClaimActive,
  emailFromLabel,
  markStepDone,
  approveStep,
  startRun,
  type PipelineConfig,
  type RunState,
  type TeamConfig,
} from '../src';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ── Schema: team block ─────────────────────────────────────────────

describe('team schema', () => {
  it('parses reviewers + defaults require_distinct_reviewer/claim_ttl', () => {
    const config = validateWorkspace(
      {
        version: '1.0',
        name: 'T',
        team: { reviewers: { plan: ['alice@corp.com'] } },
      },
      'memory:test',
    );
    expect(config.team?.reviewers.plan).toEqual(['alice@corp.com']);
    expect(config.team?.require_distinct_reviewer).toBe(true);
    expect(config.team?.claim_ttl_ms).toBe(4 * 60 * 60 * 1000);
  });

  it('is optional — a workspace without team: loads fine', () => {
    const config = validateWorkspace({ version: '1.0', name: 'T' }, 'memory:test');
    expect(config.team).toBeUndefined();
  });
});

// ── Review policy ──────────────────────────────────────────────────

const TEAM: TeamConfig = {
  reviewers: { plan: ['alice@corp.com'], design: ['alice@corp.com', 'bob@corp.com'] },
  require_distinct_reviewer: true,
  claim_ttl_ms: 1000,
};

describe('checkReviewPolicy', () => {
  it('passes when actor is in the allow-list', () => {
    expect(checkReviewPolicy({ team: TEAM, gateId: 'plan', actorEmail: 'alice@corp.com' }).ok).toBe(true);
  });

  it('blocks when actor is not in the allow-list', () => {
    const d = checkReviewPolicy({ team: TEAM, gateId: 'plan', actorEmail: 'bob@corp.com' });
    expect(d.ok).toBe(false);
    if (!d.ok) { expect(d.code).toBe('not_in_reviewers'); }
  });

  it('is case-insensitive on emails', () => {
    expect(checkReviewPolicy({ team: TEAM, gateId: 'plan', actorEmail: 'ALICE@CORP.COM' }).ok).toBe(true);
  });

  it('treats an unlisted gate as unrestricted', () => {
    expect(checkReviewPolicy({ team: TEAM, gateId: 'implement', actorEmail: 'nobody@x.com' }).ok).toBe(true);
  });

  it('hard-locks a gate with an empty reviewer list', () => {
    const team: TeamConfig = { ...TEAM, reviewers: { plan: [] } };
    const d = checkReviewPolicy({ team, gateId: 'plan', actorEmail: 'alice@corp.com' });
    expect(d.ok).toBe(false);
    if (!d.ok) { expect(d.code).toBe('no_reviewers'); }
  });

  it('blocks the author from approving their own work', () => {
    const d = checkReviewPolicy({
      team: TEAM,
      gateId: 'design',
      actorEmail: 'bob@corp.com',
      workerEmail: 'bob@corp.com',
    });
    expect(d.ok).toBe(false);
    if (!d.ok) { expect(d.code).toBe('same_as_author'); }
  });

  it('allows a distinct reviewer even when they also produced other steps', () => {
    expect(
      checkReviewPolicy({ team: TEAM, gateId: 'design', actorEmail: 'alice@corp.com', workerEmail: 'bob@corp.com' }).ok,
    ).toBe(true);
  });

  it('distinct-reviewer can be disabled', () => {
    const team: TeamConfig = { ...TEAM, require_distinct_reviewer: false, reviewers: {} };
    expect(
      checkReviewPolicy({ team, gateId: 'design', actorEmail: 'bob@corp.com', workerEmail: 'bob@corp.com' }).ok,
    ).toBe(true);
  });

  it('no team = no restriction', () => {
    expect(checkReviewPolicy({ team: undefined, gateId: 'plan', actorEmail: '' }).ok).toBe(true);
  });

  it('assertCanReview throws ReviewNotAllowedError', () => {
    expect(() => assertCanReview({ team: TEAM, gateId: 'plan', actorEmail: 'bob@corp.com' }))
      .toThrow(ReviewNotAllowedError);
  });
});

// ── Gate id resolution + step-level assert ─────────────────────────

const PIPELINE: PipelineConfig = {
  id: 'p',
  on_failure: 'stop',
  steps: [
    { agent: 'po', name: 'plan', requires: [], produces: [], human_review: true, auto_review: false, enabled: true },
    { agent: 'tech-lead', name: 'design', requires: [], produces: [], human_review: true, auto_review: false, enabled: true },
  ],
};

describe('gateIdForStep + assertCanReviewStep', () => {
  it('resolves the gate id from a step name', () => {
    expect(gateIdForStep(PIPELINE, 0)).toBe('plan');
    expect(gateIdForStep(PIPELINE, 1)).toBe('design');
    expect(gateIdForStep(PIPELINE, 9)).toBe('');
  });

  it('enforces workedBy from the run state', () => {
    const state = startRun({ runId: 'R', pipeline: PIPELINE, context: {} });
    state.steps[0].workedBy = 'bob@corp.com';
    expect(() =>
      assertCanReviewStep({ team: TEAM, pipeline: PIPELINE, state, stepIdx: 0, actorEmail: 'bob@corp.com' }),
    ).toThrow(ReviewNotAllowedError);
    // alice is allowed and distinct
    expect(() =>
      assertCanReviewStep({ team: TEAM, pipeline: PIPELINE, state, stepIdx: 0, actorEmail: 'alice@corp.com' }),
    ).not.toThrow();
  });
});

// ── Author attribution through the runner ──────────────────────────

describe('author attribution', () => {
  function tmpRoot(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-mu-'));
  }

  it('records workedBy on mark-done and author on approve', () => {
    const root = tmpRoot();
    const state = startRun({ runId: 'R', pipeline: PIPELINE, context: {} });
    const afterWork = markStepDone({ state, pipeline: PIPELINE, workspaceRoot: root, actor: 'Bob@Corp.com' });
    expect(afterWork.steps[0].workedBy).toBe('bob@corp.com'); // lower-cased
    expect(afterWork.steps[0].status).toBe('awaiting_review');

    const afterApprove = approveStep({ state: afterWork, pipeline: PIPELINE, actor: 'Alice <alice@corp.com>' });
    const approveEntry = afterApprove.steps[0].history?.find((h) => h.kind === 'approve');
    expect(approveEntry).toBeDefined();
    if (approveEntry && approveEntry.kind === 'approve') {
      expect(approveEntry.author).toBe('Alice <alice@corp.com>');
    }
  });
});

// ── Claims ─────────────────────────────────────────────────────────

describe('run claims', () => {
  const base: RunState = startRun({ runId: 'R', pipeline: PIPELINE, context: {} });

  it('claims a free run', () => {
    const r = claimRun({ state: base, actor: 'alice@corp.com', now: 1000 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.claim?.by).toBe('alice@corp.com');
      expect(r.refreshed).toBe(false);
    }
  });

  it('refreshes your own claim', () => {
    const first = claimRun({ state: base, actor: 'alice@corp.com', now: 1000 });
    if (!first.ok) { throw new Error('expected ok'); }
    const second = claimRun({ state: first.state, actor: 'ALICE@corp.com', now: 2000 });
    expect(second.ok).toBe(true);
    if (second.ok) { expect(second.refreshed).toBe(true); }
  });

  it('refuses an active claim held by someone else', () => {
    const first = claimRun({ state: base, actor: 'alice@corp.com', ttlMs: 5000, now: 1000 });
    if (!first.ok) { throw new Error('expected ok'); }
    const second = claimRun({ state: first.state, actor: 'bob@corp.com', ttlMs: 5000, now: 2000 });
    expect(second.ok).toBe(false);
    if (!second.ok) { expect(second.heldBy).toBe('alice@corp.com'); }
  });

  it('allows takeover of a stale claim', () => {
    const first = claimRun({ state: base, actor: 'alice@corp.com', ttlMs: 1000, now: 1000 });
    if (!first.ok) { throw new Error('expected ok'); }
    const second = claimRun({ state: first.state, actor: 'bob@corp.com', ttlMs: 1000, now: 5000 });
    expect(second.ok).toBe(true);
  });

  it('force takes over an active claim', () => {
    const first = claimRun({ state: base, actor: 'alice@corp.com', ttlMs: 5000, now: 1000 });
    if (!first.ok) { throw new Error('expected ok'); }
    const second = claimRun({ state: first.state, actor: 'bob@corp.com', ttlMs: 5000, now: 2000, force: true });
    expect(second.ok).toBe(true);
    if (second.ok) { expect(second.state.claim?.by).toBe('bob@corp.com'); }
  });

  it('release drops the claim', () => {
    const first = claimRun({ state: base, actor: 'alice@corp.com', now: 1000 });
    if (!first.ok) { throw new Error('expected ok'); }
    expect(releaseRun(first.state).claim).toBeUndefined();
  });

  it('isClaimActive respects the TTL', () => {
    const claim = { by: 'a', at: new Date(1000).toISOString() };
    expect(isClaimActive(claim, 5000, 2000)).toBe(true);
    expect(isClaimActive(claim, 500, 2000)).toBe(false);
    expect(isClaimActive(undefined, 5000, 2000)).toBe(false);
  });
});

// ── emailFromLabel ─────────────────────────────────────────────────

describe('emailFromLabel', () => {
  it('extracts from Name <email>', () => {
    expect(emailFromLabel('Alice <alice@corp.com>')).toBe('alice@corp.com');
  });
  it('accepts a bare email', () => {
    expect(emailFromLabel('bob@corp.com')).toBe('bob@corp.com');
  });
  it('handles the auto-approve suffix', () => {
    expect(emailFromLabel('Alice <alice@corp.com> (auto-approve)')).toBe('alice@corp.com');
  });
  it('returns empty for a hostname fallback', () => {
    expect(emailFromLabel('my-laptop')).toBe('');
  });
});
