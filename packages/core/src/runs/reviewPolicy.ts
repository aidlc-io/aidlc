/**
 * Reviewer-gate policy for git-shared, multi-user workspaces.
 *
 * A pure decision layer over `workspace.team` (see {@link TeamConfig}). It
 * answers one question: "may this git identity approve this gate?" — enforcing
 * two, independent rules:
 *
 *   1. Allow-list — `team.reviewers[gateId]` restricts who may approve a gate.
 *      A gate absent from the map is unrestricted. An empty list is a hard
 *      lock (nobody may approve).
 *   2. Distinct reviewer — when `team.require_distinct_reviewer` is true, the
 *      person who produced the work (`step.workedBy`) may not approve it.
 *
 * Enforcement is advisory client-side (the CLI calls {@link assertCanReview}
 * before approving) and can be made authoritative on the git remote by the
 * sample `aidlc-gate-check` GitHub Action, which re-runs the same policy
 * against the approving commit's author.
 */

import type { PipelineConfig, TeamConfig } from '../schema/WorkspaceSchema';
import { stepDagId } from '../schema/WorkspaceSchema';
import type { RunState } from './RunState';

export type ReviewDenyCode = 'not_in_reviewers' | 'no_reviewers' | 'same_as_author';

/** Thrown by {@link assertCanReview} when a reviewer is not permitted. */
export class ReviewNotAllowedError extends Error {
  constructor(
    message: string,
    public readonly code: ReviewDenyCode,
    public readonly gateId: string,
  ) {
    super(message);
    this.name = 'ReviewNotAllowedError';
  }
}

/**
 * Gate id for a step index — the step's `name`, falling back to its `agent`
 * id, matching how the runner and recipes key steps (`stepDagId`). Returns
 * '' when the index is out of range so callers can treat it as unrestricted.
 */
export function gateIdForStep(pipeline: PipelineConfig, stepIdx: number): string {
  const step = pipeline.steps[stepIdx];
  return step ? stepDagId(step) : '';
}

export interface ReviewCheckArgs {
  /** Workspace team policy. Absent = no multi-user restriction at all. */
  team?: TeamConfig;
  /** Gate id being approved (see {@link gateIdForStep}). */
  gateId: string;
  /** Lower-cased git email of the person approving. */
  actorEmail: string;
  /** Lower-cased git email of whoever produced the work (`step.workedBy`), if known. */
  workerEmail?: string;
}

export type ReviewDecision =
  | { ok: true }
  | { ok: false; code: ReviewDenyCode; message: string };

/**
 * Pure policy check. Returns a decision object rather than throwing so the
 * CI checker and the CLI can share it. {@link assertCanReview} wraps this to
 * throw for the imperative call sites.
 */
export function checkReviewPolicy(args: ReviewCheckArgs): ReviewDecision {
  const { team, gateId, actorEmail, workerEmail } = args;
  if (!team) { return { ok: true }; }

  const actor = actorEmail.trim().toLowerCase();

  // Rule 1 — allow-list (only when this gate declares one).
  const list = team.reviewers[gateId];
  if (list !== undefined) {
    if (list.length === 0) {
      return {
        ok: false,
        code: 'no_reviewers',
        message: `Gate "${gateId}" is locked — team.reviewers["${gateId}"] is empty, so no one may approve it.`,
      };
    }
    const allowed = list.map((e) => e.trim().toLowerCase());
    if (!actor || !allowed.includes(actor)) {
      return {
        ok: false,
        code: 'not_in_reviewers',
        message:
          `"${actorEmail || '(no git email)'}" is not allowed to approve gate "${gateId}". ` +
          `Allowed: ${allowed.join(', ')}.`,
      };
    }
  }

  // Rule 2 — distinct reviewer (applies to every gate when enabled).
  if (team.require_distinct_reviewer && workerEmail) {
    const worker = workerEmail.trim().toLowerCase();
    if (actor && worker && actor === worker) {
      return {
        ok: false,
        code: 'same_as_author',
        message:
          `"${actorEmail}" produced the work for gate "${gateId}" and cannot approve it themselves ` +
          `(team.require_distinct_reviewer). A different reviewer must approve.`,
      };
    }
  }

  return { ok: true };
}

/** Throwing wrapper over {@link checkReviewPolicy} for imperative call sites. */
export function assertCanReview(args: ReviewCheckArgs): void {
  const decision = checkReviewPolicy(args);
  if (!decision.ok) {
    throw new ReviewNotAllowedError(decision.message, decision.code, args.gateId);
  }
}

/**
 * Convenience: resolve gate id + worker email for a run's step and check the
 * policy in one call. `actorEmail` is the person attempting the approval.
 */
export function assertCanReviewStep(args: {
  team?: TeamConfig;
  pipeline: PipelineConfig;
  state: RunState;
  stepIdx: number;
  actorEmail: string;
}): void {
  const { team, pipeline, state, stepIdx, actorEmail } = args;
  assertCanReview({
    team,
    gateId: gateIdForStep(pipeline, stepIdx),
    actorEmail,
    workerEmail: state.steps[stepIdx]?.workedBy,
  });
}
