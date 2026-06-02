import { describe, it, expect } from 'vitest';
import { checkBudget } from '../src';
import type { PipelineBudget } from '../src';

describe('checkBudget', () => {
  it('always ok when no budget is configured', () => {
    const v = checkBudget({ stepCosts: [1, 2, 3], budget: undefined, lastStepCost: 3 });
    expect(v.ok).toBe(true);
    if (v.ok) { expect(v.spent).toBe(6); }
  });

  it('ok while total is under max_usd', () => {
    const budget: PipelineBudget = { max_usd: 5, on_exceed: 'pause' };
    const v = checkBudget({ stepCosts: [1, 2], budget, lastStepCost: 2 });
    expect(v.ok).toBe(true);
  });

  it('trips on cumulative total over max_usd', () => {
    const budget: PipelineBudget = { max_usd: 5, on_exceed: 'pause' };
    const v = checkBudget({ stepCosts: [3, 2.5], budget, lastStepCost: 2.5 });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.exceeded).toBe('total');
      expect(v.spent).toBeCloseTo(5.5);
      expect(v.limit).toBe(5);
    }
  });

  it('trips on per-step ceiling even when total is fine, and reports step first', () => {
    const budget: PipelineBudget = { max_usd: 100, max_usd_per_step: 1.5, on_exceed: 'fail' };
    const v = checkBudget({ stepCosts: [0.5, 2], budget, lastStepCost: 2 });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.exceeded).toBe('step');
      expect(v.limit).toBe(1.5);
    }
  });

  it('treats undefined step costs as zero', () => {
    const budget: PipelineBudget = { max_usd: 5, on_exceed: 'pause' };
    const v = checkBudget({ stepCosts: [undefined, 1, undefined], budget, lastStepCost: 1 });
    expect(v.ok).toBe(true);
    if (v.ok) { expect(v.spent).toBe(1); }
  });
});
