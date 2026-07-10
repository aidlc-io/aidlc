/**
 * `aidlc gate-check` — authoritative reviewer-policy enforcement for CI.
 *
 * The CLI's `run approve` guard is advisory: it runs on the approver's machine
 * and can be bypassed by hand-editing a run JSON. This command re-validates the
 * *recorded* approvals in every run against `team.reviewers`, so a git remote
 * can enforce author≠reviewer and the allow-list even for commits that skipped
 * the CLI. Wire it into the sample `.github/workflows/aidlc-gate-check.yml`.
 *
 * For each run's every step, the most recent `approve` history entry is
 * checked: its recorded `author` email must satisfy the same policy the CLI
 * applied. Exit code: 0 = clean (or no `team:` block), 1 = at least one
 * violation.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  RunStateStore,
  checkReviewPolicy,
  gateIdForStep,
  emailFromLabel,
  type PipelineConfig,
  type RunState,
  type StepHistoryEntry,
} from '@aidlc/core';
import { resolveWorkspaceRoot } from '../workspaceRoot';
import { loadTeamConfig, requirePipeline } from '../runHelpers';

interface Violation {
  runId: string;
  gateId: string;
  message: string;
}

function latestApprove(history: StepHistoryEntry[] | undefined): Extract<StepHistoryEntry, { kind: 'approve' }> | undefined {
  if (!history) { return undefined; }
  for (let i = history.length - 1; i >= 0; i--) {
    const e = history[i];
    if (e.kind === 'approve') { return e; }
  }
  return undefined;
}

export function registerGateCheck(program: Command): void {
  program
    .command('gate-check')
    .description('Validate recorded gate approvals against team.reviewers (CI enforcement)')
    .option('--json', 'output violations as JSON')
    .action((opts: { json?: boolean }, cmd: Command) => {
      const root = resolveWorkspaceRoot(cmd);
      const team = loadTeamConfig(root);

      // No policy = nothing to enforce.
      if (!team) {
        if (opts.json) { console.log(JSON.stringify({ ok: true, violations: [] })); }
        else { console.log(chalk.dim('No `team:` block in workspace.yaml — nothing to enforce.')); }
        return;
      }

      const runs = RunStateStore.list(root);
      const violations: Violation[] = [];
      const pipelineCache = new Map<string, PipelineConfig | null>();

      const getPipeline = (state: RunState): PipelineConfig | null => {
        if (!pipelineCache.has(state.pipelineId)) {
          try {
            pipelineCache.set(state.pipelineId, requirePipeline(root, state.pipelineId).pipeline);
          } catch {
            pipelineCache.set(state.pipelineId, null);
          }
        }
        return pipelineCache.get(state.pipelineId) ?? null;
      };

      for (const state of runs) {
        const pipeline = getPipeline(state);
        if (!pipeline) { continue; }
        state.steps.forEach((step, idx) => {
          const approve = latestApprove(step.history);
          if (!approve) { return; }
          const gateId = gateIdForStep(pipeline, idx);
          const decision = checkReviewPolicy({
            team,
            gateId,
            actorEmail: emailFromLabel(approve.author ?? ''),
            workerEmail: step.workedBy,
          });
          if (!decision.ok) {
            violations.push({
              runId: state.runId,
              gateId,
              message: `${decision.message} (approved by "${approve.author ?? 'unknown'}")`,
            });
          }
        });
      }

      if (opts.json) {
        console.log(JSON.stringify({ ok: violations.length === 0, violations }, null, 2));
      } else if (violations.length === 0) {
        console.log(chalk.green('✔') + ` gate-check passed — ${runs.length} run(s), no reviewer-policy violations.`);
      } else {
        console.error(chalk.red(`✘ gate-check found ${violations.length} violation(s):`));
        for (const v of violations) {
          console.error(chalk.red(`  - [${v.runId}] gate "${v.gateId}": ${v.message}`));
        }
      }
      if (violations.length > 0) { process.exit(1); }
    });
}
