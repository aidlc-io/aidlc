/**
 * Cost ceiling check for the `aidlc run exec` autopilot loop.
 *
 * Pure function over already-accumulated per-step costs + the pipeline's
 * optional `budget`. The CLI loop calls this after each step and acts on the
 * verdict (pause / fail). Kept side-effect free so it's unit-testable without
 * spawning claude.
 */

import type { PipelineBudget } from '../schema/WorkspaceSchema';

export interface BudgetCheckArgs {
  /** Per-step costs in USD; entries that haven't run yet are undefined/0. */
  stepCosts: Array<number | undefined>;
  /** The pipeline's budget config, if any. */
  budget?: PipelineBudget;
  /** Cost of the step that just ran, in USD (for the per-step ceiling check). */
  lastStepCost?: number;
}

export type BudgetVerdict =
  | { ok: true; spent: number }
  | { ok: false; exceeded: 'step' | 'total'; spent: number; limit: number };

/**
 * Returns `{ ok: true, spent }` when under budget (or no budget configured),
 * otherwise `{ ok: false, exceeded, spent, limit }`. The per-step ceiling is
 * checked first so the message points at the immediate cause.
 */
export function checkBudget(args: BudgetCheckArgs): BudgetVerdict {
  const { stepCosts, budget, lastStepCost } = args;
  const spent = stepCosts.reduce<number>((sum, c) => sum + (c ?? 0), 0);

  if (!budget) { return { ok: true, spent }; }

  if (
    budget.max_usd_per_step !== undefined &&
    lastStepCost !== undefined &&
    lastStepCost > budget.max_usd_per_step
  ) {
    return { ok: false, exceeded: 'step', spent, limit: budget.max_usd_per_step };
  }

  if (spent > budget.max_usd) {
    return { ok: false, exceeded: 'total', spent, limit: budget.max_usd };
  }

  return { ok: true, spent };
}
