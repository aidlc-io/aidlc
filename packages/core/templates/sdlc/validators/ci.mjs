/**
 * Auto-review runner for the Implement step.
 *
 * AIDLC loads this module after the implement agent finishes — after the
 * step's `produces` are validated, before any human gate — and calls the
 * default export with a context object. Return
 * `{ decision: 'pass' | 'reject', reason }`.
 *
 * Wire your project's CI into `CHECKS` below: each command runs in the
 * workspace root, and a non-zero exit maps to a `reject` verdict so the step
 * does not advance. With no checks configured it passes with a note, so the
 * pipeline still works out of the box.
 *
 * To turn auto-review off for this step instead, set `auto_review: false` on
 * the implement step in `.aidlc/workspace.yaml`.
 *
 * Contract (see packages/core/src/runs/AutoReviewer.ts):
 *   export default async ({ workspaceRoot, state, step, pipeline, paths }) =>
 *     ({ decision: 'pass' | 'reject', reason: string })
 */
import { execSync } from 'node:child_process';

/** Customize for your toolchain — uncomment and adapt. */
const CHECKS = [
  // { name: 'lint',      cmd: 'pnpm lint' },
  // { name: 'typecheck', cmd: 'pnpm typecheck' },
  // { name: 'test',      cmd: 'pnpm test' },
];

export default async function ci({ workspaceRoot }) {
  for (const { name, cmd } of CHECKS) {
    try {
      execSync(cmd, { cwd: workspaceRoot, stdio: 'pipe' });
    } catch (err) {
      const out =
        (err?.stdout?.toString() ?? '') + (err?.stderr?.toString() ?? '');
      return {
        decision: 'reject',
        reason: `CI check "${name}" (\`${cmd}\`) failed:\n${out.trim().slice(-2000)}`,
      };
    }
  }
  return {
    decision: 'pass',
    reason: CHECKS.length
      ? `All ${CHECKS.length} CI check(s) passed.`
      : 'No CI checks configured — add commands to .aidlc/validators/ci.mjs to enforce lint/typecheck/test.',
  };
}
