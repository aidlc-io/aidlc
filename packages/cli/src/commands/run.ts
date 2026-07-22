import * as fs from 'fs';
import { Command } from 'commander';
import chalk from 'chalk';
import {
  WorkspaceLoader,
  RunStateStore,
  startRun,
  markStepDone,
  approveStep,
  rejectStep,
  rerunStep,
  requestStepUpdate,
  checkBudget,
  verifyRun,
  renderRunReport,
  runAutoReview,
  submitAutoReviewVerdict,
  PipelineRunError,
  RUN_ID_PATTERN,
  runExecLoop,
  type ExecOutcome,
  type ExecHooks,
  type RunState,
  type PipelineConfig,
} from '@aidlc/core';
import { resolveWorkspaceRoot } from '../workspaceRoot';
import { info, setQuiet } from '../output';
import {
  requireRun,
  requirePipeline,
  requirePipelineForRun,
  requireStepIdx,
  printRunSummary,
  resolveContext,
  collectOption,
  loadAgentSkills,
  formatSkillsList,
} from '../runHelpers';

export function registerRun(program: Command): void {
  const cmd = program
    .command('run')
    .description('Manage pipeline runs');

  // ── start ──────────────────────────────────────────────────────────────────
  cmd
    .command('start <pipelineId>')
    .description('Start a new pipeline run')
    .option('--id <runId>',          'run id (default: <pipeline>-<timestamp>)')
    .option('--context <pairs>',     'context key=value pairs (repeatable; each may be comma-separated)', collectOption, [])
    .option('--context-file <path>', 'read context from a JSON object or key=value lines file')
    .action((pipelineId: string, opts: { id?: string; context?: string[]; contextFile?: string }, actionCmd: Command) => {
      const root     = resolveWorkspaceRoot(actionCmd);
      const runId    = opts.id ?? `${pipelineId}-${Date.now()}`;
      const context  = resolveContext(opts);

      if (!RUN_ID_PATTERN.test(runId)) {
        console.error(chalk.red(`Invalid run id "${runId}" — use letters, digits, dots, dashes, underscores.`));
        process.exit(1);
      }

      if (RunStateStore.load(root, runId)) {
        console.error(chalk.red(`Run "${runId}" already exists. Use a different --id.`));
        process.exit(1);
      }

      const { pipeline } = requirePipeline(root, pipelineId);

      let state;
      try {
        state = startRun({ runId, pipeline, context });
      } catch (err) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }

      RunStateStore.save(root, state);
      console.log(chalk.green('✔') + ` Started run ${chalk.bold(runId)}`);
      printRunSummary(state);
      const first = state.steps[0];
      if (first) {
        console.log(chalk.dim(`  Current step: ${chalk.bold(first.agent)} — awaiting_work`));
        console.log(chalk.dim(`  When done: aidlc run mark-done ${runId}`));
      }
    });

  // ── mark-done ──────────────────────────────────────────────────────────────
  cmd
    .command('mark-done <runId>')
    .description('Mark the current step done (validates produces paths, then advances or awaits review)')
    .action((runId: string, _opts: unknown, actionCmd: Command) => {
      const root     = resolveWorkspaceRoot(actionCmd);
      const state    = requireRun(root, runId);
      const pipeline = requirePipelineForRun(root, state);

      let next;
      try {
        next = markStepDone({ state, pipeline, workspaceRoot: root });
      } catch (err) {
        if (err instanceof PipelineRunError && err.missing?.length) {
          console.error(chalk.red('Missing artifacts — step not marked done:'));
          for (const m of err.missing) { console.error(chalk.dim(`  ✘ ${m}`)); }
          console.error(chalk.dim('\nProduce the files above, then retry: aidlc run mark-done ' + runId));
        } else {
          console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        }
        process.exit(1);
      }

      RunStateStore.save(root, next);
      const prevStatus = state.steps[state.currentStepIdx].status;
      const step = next.steps[state.currentStepIdx];
      if (step.status === prevStatus) {
        // Idempotent no-op: step was already marked done in this revision.
        console.log(chalk.dim(`• Step "${step.agent}" is already ${step.status} — nothing to do.`));
      } else if (step.status === 'awaiting_review') {
        console.log(chalk.cyan('✔') + ` Step "${step.agent}" is now ${chalk.cyan('awaiting_review')}`);
        console.log(chalk.dim(`  Approve: aidlc run approve ${runId}`));
        console.log(chalk.dim(`  Reject:  aidlc run reject ${runId} --reason "..."`));
      } else {
        console.log(chalk.green('✔') + ` Step "${step.agent}" auto-approved, advancing…`);
        printRunSummary(next);
      }
    });

  // ── approve ────────────────────────────────────────────────────────────────
  cmd
    .command('approve <runId>')
    .description('Approve the current awaiting_review step')
    .option('--comment <text>', 'Optional comment recorded on the step')
    .action((runId: string, opts: { comment?: string }, actionCmd: Command) => {
      const root     = resolveWorkspaceRoot(actionCmd);
      const state    = requireRun(root, runId);
      const pipeline = requirePipelineForRun(root, state);

      let next;
      try {
        next = approveStep({ state, pipeline });
      } catch (err) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }

      // Attach comment to the approved step record if supplied
      if (opts.comment) {
        next.steps[state.currentStepIdx].feedback = opts.comment;
      }

      RunStateStore.save(root, next);
      const approvedStep = state.steps[state.currentStepIdx];
      console.log(chalk.green('✔') + ` Approved "${approvedStep.agent}"`);
      printRunSummary(next);

      if (next.status === 'completed') {
        console.log(chalk.green('🎉 Run completed — all steps approved.'));
      }
    });

  // ── reject ─────────────────────────────────────────────────────────────────
  cmd
    .command('reject <runId>')
    .description('Reject the current awaiting_review step')
    .requiredOption('--reason <text>', 'Why the step was rejected')
    .action((runId: string, opts: { reason: string }, actionCmd: Command) => {
      const root  = resolveWorkspaceRoot(actionCmd);
      const state = requireRun(root, runId);

      let next;
      try {
        next = rejectStep({ state, reason: opts.reason });
      } catch (err) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }

      RunStateStore.save(root, next);
      const step = state.steps[state.currentStepIdx];
      console.log(chalk.red('✘') + ` Rejected "${step.agent}"`);
      console.log(chalk.dim(`  Reason: ${opts.reason}`));
      console.log(chalk.dim(`  Rerun:  aidlc run rerun ${runId} [--feedback "..."]`));
    });

  // ── rerun ──────────────────────────────────────────────────────────────────
  cmd
    .command('rerun <runId>')
    .description('Retry the current rejected step (bumps revision, resets to awaiting_work)')
    .option('--feedback <text>', 'Notes for the next attempt (stored on the step)')
    .action((runId: string, opts: { feedback?: string }, actionCmd: Command) => {
      const root  = resolveWorkspaceRoot(actionCmd);
      const state = requireRun(root, runId);

      let next;
      try {
        next = rerunStep({ state, feedback: opts.feedback });
      } catch (err) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }

      RunStateStore.save(root, next);
      const step = next.steps[next.currentStepIdx];
      console.log(chalk.yellow('↺') + ` Rerunning "${step.agent}" (rev ${step.revision})`);
      if (opts.feedback) { console.log(chalk.dim(`  Feedback: ${opts.feedback}`)); }
      console.log(chalk.dim(`  When done: aidlc run mark-done ${runId}`));
    });

  // ── request-update ───────────────────────────────────────────────────────────
  cmd
    .command('request-update <runId> <step>')
    .description(
      'Reopen an already-approved step for changes (bumps revision, resets downstream).\n' +
      '  <step> can be a 0-based index or an agent id. Mirrors the extension\'s "Request update".',
    )
    .option('--feedback <text>', 'Notes for the next attempt (stored on the step)')
    .action((runId: string, step: string, opts: { feedback?: string }, actionCmd: Command) => {
      const root     = resolveWorkspaceRoot(actionCmd);
      const state    = requireRun(root, runId);
      const pipeline = requirePipelineForRun(root, state);
      const stepIdx  = requireStepIdx(state, step);

      let next;
      try {
        next = requestStepUpdate({ state, pipeline, stepIdx, feedback: opts.feedback });
      } catch (err) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }

      RunStateStore.save(root, next);
      const target = next.steps[stepIdx];
      console.log(chalk.yellow('↻') + ` Reopened "${target.agent}" for update (rev ${target.revision})`);
      if (opts.feedback) { console.log(chalk.dim(`  Feedback: ${opts.feedback}`)); }
      console.log(chalk.dim(`  When done: aidlc run mark-done ${runId}`));
      printRunSummary(next);
    });

  // ── delete ─────────────────────────────────────────────────────────────────
  cmd
    .command('delete <runId>')
    .description('Delete a run state file')
    .option('--force', 'Skip confirmation for running/active runs')
    .action((runId: string, opts: { force?: boolean }, actionCmd: Command) => {
      const root  = resolveWorkspaceRoot(actionCmd);
      const state = requireRun(root, runId);

      if (state.status === 'running' && !opts.force) {
        console.error(chalk.yellow(`Run "${runId}" is still running. Use --force to delete anyway.`));
        process.exit(1);
      }

      RunStateStore.delete(root, runId);
      console.log(chalk.green('✔') + ` Deleted run ${chalk.bold(runId)}`);
    });

  // ── open ───────────────────────────────────────────────────────────────────
  cmd
    .command('open <runId>')
    .description('Print the run state JSON (pipe into jq, open in editor, etc.)')
    .option('--path', 'Print the file path only instead of the JSON content')
    .action((runId: string, opts: { path?: boolean }, actionCmd: Command) => {
      const root  = resolveWorkspaceRoot(actionCmd);
      const state = requireRun(root, runId);

      if (opts.path) {
        console.log(RunStateStore.file(root, runId));
        return;
      }
      console.log(JSON.stringify(state, null, 2));
    });

  // ── exec ───────────────────────────────────────────────────────────────────
  cmd
    .command('exec <runId>')
    .description(
      'Execute the current step by spawning the claude CLI, then auto-advance.\n' +
      '  Streams output live. Stops at human_review steps unless --auto-approve.\n' +
      '  Exit codes: 0 completed (or stopped at --until), 2 paused on a gate\n' +
      '  (awaiting review / rejected / budget), 1 error. --require-complete maps\n' +
      '  any non-completed outcome to 1 for CI gating.',
    )
    .option('--until <step>',     'Stop after this step completes (index or agent id)')
    .option('--auto-approve',     'Also auto-approve human_review steps without pausing')
    .option('--require-complete', 'Exit 1 unless the run reaches completed (for CI gating)')
    .option('--json',             'Suppress decorative output; print a final JSON summary to stdout (claude stream goes to stderr)')
    .option('--message <text>',   'Override the user message sent to claude (default: context pairs)')
    .option('--dry-run',          'Print the assembled prompt without spawning claude')
    .action(async (runId: string, opts: {
      until?: string; autoApprove?: boolean; requireComplete?: boolean; json?: boolean; message?: string; dryRun?: boolean;
    }, actionCmd: Command) => {
      const root = resolveWorkspaceRoot(actionCmd);
      // In --json mode decorative stdout is silenced so the only thing on stdout
      // is the final summary object — pipe it straight into jq.
      if (opts.json) { setQuiet(true); }
      const outcome = await execLoop(root, runId, opts);
      const code = execExitCode(outcome, !!opts.requireComplete);
      if (opts.json) {
        const final = RunStateStore.load(root, runId);
        process.stdout.write(JSON.stringify(execSummary(runId, outcome, code, final), null, 2) + '\n');
      }
      process.exit(code);
    });

  // ── verify ─────────────────────────────────────────────────────────────────
  cmd
    .command('verify <runId>')
    .description('Re-check each step\'s recorded artifacts still exist (and pass produces_contains). Read-only drift check.')
    .option('--json', 'Output the drift report as JSON (exit 1 still signals drift)')
    .action((runId: string, opts: { json?: boolean }, actionCmd: Command) => {
      const root     = resolveWorkspaceRoot(actionCmd);
      const state    = requireRun(root, runId);
      const pipeline = requirePipelineForRun(root, state);

      const report = verifyRun({ state, pipeline, workspaceRoot: root });

      if (opts.json) {
        console.log(JSON.stringify({ runId, ...report }, null, 2));
        if (!report.ok) { process.exit(1); }
        return;
      }

      if (report.ok) {
        console.log(chalk.green('✔') + ` No drift — ${report.checked} step(s) with artifacts verified.`);
        return;
      }

      console.error(chalk.red('✘') + ` Drift detected in ${report.drift.length} of ${report.checked} step(s):`);
      for (const d of report.drift) {
        console.error(chalk.yellow(`\n  Step ${d.stepIdx} (${d.agent}) — ${d.status}`));
        for (const m of d.missing)        { console.error(chalk.dim(`    ✘ missing file:   ${m}`)); }
        for (const m of d.missingMarkers) { console.error(chalk.dim(`    ✘ missing content: ${m}`)); }
      }
      process.exit(1);
    });

  // ── report ─────────────────────────────────────────────────────────────────
  cmd
    .command('report <runId>')
    .description('Render the run history as Markdown (steps, revisions, durations, reject reasons, cost).')
    .option('--format <fmt>', 'Output format: md (default) | json', 'md')
    .option('--output <file>', 'Write to a file instead of stdout')
    .action((runId: string, opts: { format?: string; output?: string }, actionCmd: Command) => {
      const root     = resolveWorkspaceRoot(actionCmd);
      const state    = requireRun(root, runId);
      const pipeline = requirePipelineForRun(root, state);

      const fmt = (opts.format ?? 'md').toLowerCase();
      let out: string;
      if (fmt === 'json') {
        out = JSON.stringify(state, null, 2);
      } else if (fmt === 'md' || fmt === 'markdown') {
        out = renderRunReport({ state, pipeline });
      } else {
        console.error(chalk.red(`Unknown --format "${opts.format}". Use "md" or "json".`));
        process.exit(1);
        return;
      }

      if (opts.output) {
        fs.writeFileSync(opts.output, out, 'utf8');
        console.log(chalk.green('✔') + ` Wrote report to ${opts.output}`);
      } else {
        console.log(out);
      }
    });
}

// ── Exec internals ────────────────────────────────────────────────────────────

// The exec loop itself now lives in @aidlc/core (`runExecLoop`) so the VS Code
// extension can drive runs too. This file only maps the engine's I/O hooks
// back to the CLI's chalk output + exit codes.

/**
 * 0 = run completed (or deliberately stopped at --until); 2 = paused on a gate
 * (awaiting human review / rejected / budget); 1 = error. --require-complete
 * collapses every non-`completed` outcome to 1 so naive `cmd && next` chains
 * fail when the pipeline didn't finish.
 */
function execExitCode(outcome: ExecOutcome, requireComplete: boolean): number {
  if (outcome.kind === 'error') { return 1; }
  if (outcome.kind === 'completed') { return 0; }
  if (outcome.kind === 'dry_run') { return 0; } // a preview, never a CI failure
  if (requireComplete) { return 1; }
  if (outcome.kind === 'until') { return 0; }
  return 2; // awaiting_review | rejected | budget_pause
}

/** Machine-readable result of an exec run, printed under `--json`. */
function execSummary(runId: string, outcome: ExecOutcome, exitCode: number, state: RunState | null) {
  const steps = (state?.steps ?? []).map((s, idx) => ({
    idx,
    agent: s.agent,
    status: s.status,
    revision: s.revision,
    costUsd: s.costUsd ?? null,
  }));
  const totalCostUsd = steps.reduce((sum, s) => sum + (s.costUsd ?? 0), 0);
  return {
    runId,
    outcome: outcome.kind,
    exitCode,
    runStatus: state?.status ?? null,
    currentStepIdx: state?.currentStepIdx ?? null,
    totalCostUsd: totalCostUsd || null,
    steps,
  };
}

async function execLoop(
  root: string,
  runId: string,
  opts: { until?: string; autoApprove?: boolean; json?: boolean; message?: string; dryRun?: boolean },
): Promise<ExecOutcome> {
  // Resolve --until against the initial state (keeps the CLI's nice not-found
  // error + exit). The engine reloads state each iteration on its own.
  const initialState = requireRun(root, runId);
  const untilIdx = opts.until !== undefined ? requireStepIdx(initialState, opts.until) : -1;

  // In --json mode claude's stream goes to stderr so stdout stays clean for
  // the final summary object.
  const claudeOut = opts.json ? process.stderr : process.stdout;

  return runExecLoop(
    root,
    runId,
    { untilIdx, autoApprove: opts.autoApprove, message: opts.message, dryRun: opts.dryRun },
    cliExecHooks(runId, claudeOut),
  );
}

/**
 * Map the core engine's I/O hooks back to the CLI's chalk output — the exact
 * lines the inline loop printed before `runExecLoop` was extracted into core.
 */
function cliExecHooks(runId: string, claudeOut: NodeJS.WriteStream): ExecHooks {
  const sep = (): void => info(chalk.dim('─'.repeat(60)));
  return {
    onOutput: (chunk) => claudeOut.write(chunk),
    onErrorOutput: (chunk) => process.stderr.write(chalk.dim(chunk)),

    onRunCompleted: () => info(chalk.green('\n🎉 Run completed — all steps approved.')),
    onRunFailed: (reason) => console.error(chalk.red(`\n${reason}`)),

    onStepStart: (e) => {
      info(chalk.bold(`\n▶  Step ${e.stepIdx}: ${e.agent}`) + chalk.dim(` (rev ${e.revision})`));
      info(chalk.dim(`   skills: ${e.skills.join(', ')}  model: ${e.model ?? 'claude-sonnet-4-5'}`));
      if (e.context) { info(chalk.dim(`   context: ${e.context}`)); }
      sep();
    },
    onStepResult: (e) => {
      sep();
      if (e.status === 'awaiting_auto_review') {
        info(chalk.cyan(`\n✔  Step "${e.agent}" done — auto-review pending.`));
      } else if (e.status === 'awaiting_review') {
        info(chalk.cyan(`\n✔  Step "${e.agent}" done — awaiting review.`));
      } else {
        info(chalk.green(`\n✔  Step "${e.agent}" approved.`));
      }
      if (typeof e.costUsd === 'number') { info(chalk.dim(`   cost: $${e.costUsd.toFixed(4)}`)); }
    },
    onStepFailed: (e) => {
      if (e.missing?.length) {
        console.error(chalk.red('\n✘  Step completed but missing expected artifacts:'));
        for (const m of e.missing) { console.error(chalk.dim(`   ✘ ${m}`)); }
        console.error(chalk.dim('\n   Produce the files above, then: aidlc run mark-done ' + runId));
      } else {
        console.error(chalk.red(`\n✘  ${e.message ?? `Step "${e.agent}" failed.`}`));
        console.error(chalk.dim('   Fix the issue then retry: aidlc run exec ' + runId));
      }
    },

    onAwaitingReview: (e) => {
      info(chalk.cyan(`\n⏸  Step "${e.agent}" is awaiting human review.`));
      info(chalk.dim(`  Approve: aidlc run approve ${e.runId}`));
      info(chalk.dim(`  Reject:  aidlc run reject ${e.runId} --reason "..."`));
    },
    onRejected: (e) => {
      info(chalk.red(`\n✘  Step "${e.agent}" was rejected.`));
      info(chalk.dim(`  Rerun: aidlc run rerun ${e.runId} [--feedback "..."]`));
    },

    onAutoReviewStart: (e) => info(chalk.bold(`\n🔍  Auto-review: "${e.agent}"`)),
    onAutoReviewResult: (e) => {
      if (e.decision === 'pass') {
        info(chalk.green('✔  Auto-review passed') + chalk.dim(` — ${e.reason}`));
      } else {
        info(chalk.red('✘  Auto-review rejected') + chalk.dim(` — ${e.reason}`));
        info(chalk.dim(`  Fix the issue, then: aidlc run rerun ${e.runId} [--feedback "..."]`));
      }
    },
    onAutoApproved: (e) => info(chalk.green(`✔  Auto-approved "${e.agent}" (--auto-approve)`)),

    onBudget: (e) => {
      if (!e.ok) {
        const scope = e.exceeded === 'step' ? 'per-step' : 'total';
        info(chalk.yellow(`\n⚠  Budget exceeded (${scope}): spent $${e.spent.toFixed(4)}, limit $${e.limit.toFixed(2)}.`));
        if (e.onExceed !== 'fail') {
          info(chalk.dim(`  Paused. Raise the budget in workspace.yaml or resume: aidlc run exec ${e.runId}`));
        }
      } else {
        info(chalk.dim(`  budget: $${e.spent.toFixed(4)} / $${e.limit.toFixed(2)}`));
      }
    },

    onUntilStop: (e) => info(chalk.dim(`\nStopped at step ${e.untilIdx} as requested.`)),

    onDryRunPreview: (e) => {
      info(chalk.bold(`\n── System prompt (skills: ${e.skills}) ──`));
      info(chalk.dim(e.skillText));
      info(chalk.bold('\n── User message ───────────────────────────────────────'));
      info(e.userMessage || chalk.dim('(empty)'));
      info(chalk.bold('\n── Env vars ───────────────────────────────────────────'));
      for (const [k, v] of Object.entries(e.env)) {
        const masked = k.toLowerCase().includes('key') || k.toLowerCase().includes('token') ? '***' : v;
        info(chalk.dim(`  ${k}=${masked}`));
      }
      info();
    },
  };
}

