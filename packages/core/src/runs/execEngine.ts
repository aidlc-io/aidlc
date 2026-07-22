/**
 * aidlc-autopilot: unattended pipeline execution engine.
 *
 * The loop that drives a run to completion by spawning the agent runner for
 * each `awaiting_work` step, marking it done, running auto-review, and
 * auto-advancing — pausing at human-review / rejection / budget ceilings.
 *
 * Ported out of the CLI (`aidlc run exec`) so BOTH the CLI and the VS Code
 * extension can drive a run with their own presentation. All I/O — the claude
 * stream, decorative logging, progress — flows through {@link ExecHooks}, so
 * this module stays pure (no chalk, no console, no process.exit) and unit-
 * testable. The CLI maps the hooks back to its chalk output; the extension
 * maps them to a progress panel.
 */

import { WorkspaceLoader } from '../loader/WorkspaceLoader';
import { RunStateStore } from './RunStateStore';
import {
  markStepDone,
  approveStep,
  submitAutoReviewVerdict,
  PipelineRunError,
} from './PipelineRunner';
import { runAutoReview } from './AutoReviewer';
import { checkBudget } from './budget';
import type { RunState } from './RunState';
import type { PipelineConfig, AgentConfig } from '../schema/WorkspaceSchema';

/**
 * Why the loop stopped. Callers map this to an exit code (CLI) or a final
 * status message (extension). `completed` / `until` are clean stops; the rest
 * are gates a human must clear.
 */
export type ExecOutcome =
  | { kind: 'completed' }
  | { kind: 'until' }
  | { kind: 'dry_run' }
  | { kind: 'awaiting_review' }
  | { kind: 'rejected' }
  | { kind: 'budget_pause' }
  | { kind: 'error' };

/** Options controlling one exec loop. Mirrors the CLI's `run exec` flags. */
export interface ExecOptions {
  /** Stop after this step index completes; -1 (default) = run to the end. */
  untilIdx?: number;
  /** Auto-approve human_review steps instead of pausing at them. */
  autoApprove?: boolean;
  /** Override the user message sent to claude (default: context pairs). */
  message?: string;
  /** Preview the current step's prompt without spawning claude, then stop. */
  dryRun?: boolean;
}

/**
 * Presentation callbacks. All optional — a caller implements only what it
 * renders. The engine calls these instead of writing to a console, so the
 * same loop backs the CLI (chalk) and the extension (panel).
 */
export interface ExecHooks {
  /** Live claude stdout stream. */
  onOutput?(chunk: string): void;
  /** Live claude stderr stream. */
  onErrorOutput?(chunk: string): void;
  /** Run reached `completed` — every step approved. */
  onRunCompleted?(): void;
  /** Terminal failure (run failed / disappeared / unexpected step status). */
  onRunFailed?(reason: string): void;
  /** A step is about to execute. */
  onStepStart?(e: {
    stepIdx: number; agent: string; revision: number;
    skills: string[]; model?: string; context?: string;
  }): void;
  /** A step finished `markStepDone` and transitioned. */
  onStepResult?(e: {
    stepIdx: number; agent: string; status: string; costUsd?: number;
  }): void;
  /** The runner exited non-zero, or `markStepDone` rejected the artifacts. */
  onStepFailed?(e: {
    stepIdx: number; agent: string; missing?: string[]; message?: string;
  }): void;
  /** Loop paused at a human_review gate. */
  onAwaitingReview?(e: { agent: string; runId: string }): void;
  /** Loop paused because the current step was rejected. */
  onRejected?(e: { agent: string; runId: string }): void;
  /** Auto-review validator is about to run. */
  onAutoReviewStart?(e: { agent: string }): void;
  /** Auto-review verdict landed. */
  onAutoReviewResult?(e: {
    agent: string; decision: 'pass' | 'reject'; reason: string; runId: string;
  }): void;
  /** A human_review step was auto-approved (--auto-approve). */
  onAutoApproved?(e: { agent: string }): void;
  /** Budget verdict after a step ran. */
  onBudget?(e: {
    spent: number; limit: number; ok: boolean;
    exceeded?: 'step' | 'total'; onExceed?: string; runId: string;
  }): void;
  /** Stopped at the --until boundary. */
  onUntilStop?(e: { untilIdx: number }): void;
  /** Dry-run: assembled prompt preview (no claude spawned). */
  onDryRunPreview?(e: {
    skills: string; skillText: string; userMessage: string;
    env: Record<string, string>;
  }): void;
}

/** Load the pipeline backing a run, or null if the workspace/pipeline is gone. */
function loadPipelineForRun(root: string, state: RunState): PipelineConfig | null {
  try {
    const ws = WorkspaceLoader.load(root);
    return ws.config.pipelines.find((p) => p.id === state.pipelineId) ?? null;
  } catch {
    return null;
  }
}

/**
 * Run the exec loop for `runId` until it completes or hits a gate. Pure over
 * I/O — everything observable goes through `hooks`; the return value is the
 * reason it stopped.
 */
export async function runExecLoop(
  root: string,
  runId: string,
  opts: ExecOptions,
  hooks: ExecHooks = {},
): Promise<ExecOutcome> {
  const untilIdx = opts.untilIdx ?? -1;

  const initialState = RunStateStore.load(root, runId);
  if (!initialState) {
    hooks.onRunFailed?.(`Run "${runId}" not found.`);
    return { kind: 'error' };
  }

  // Cost ceiling resolved once — only the autopilot loop enforces it (manual
  // mark-done is never gated).
  const initialPipeline = loadPipelineForRun(root, initialState);
  if (!initialPipeline) {
    hooks.onRunFailed?.(`Pipeline "${initialState.pipelineId}" not found in workspace.yaml.`);
    return { kind: 'error' };
  }
  const budget = initialPipeline.budget;

  while (true) {
    // Reload fresh state each iteration so concurrent edits (extension, other
    // CLI) are picked up.
    const state = RunStateStore.load(root, runId);
    if (!state) {
      hooks.onRunFailed?.(`Run "${runId}" disappeared.`);
      return { kind: 'error' };
    }

    if (state.status === 'completed') {
      hooks.onRunCompleted?.();
      return { kind: 'completed' };
    }
    if (state.status === 'failed') {
      hooks.onRunFailed?.('Run failed.');
      return { kind: 'error' };
    }

    const step = state.steps[state.currentStepIdx];

    // Auto-review gate: run the step's auto_review_runner validator headlessly.
    if (step.status === 'awaiting_auto_review') {
      const proceed = await runAutoReviewStep(root, runId, hooks);
      if (!proceed) { return { kind: 'error' }; }
      continue;
    }

    // Human review — pause unless auto-approving.
    if (step.status === 'awaiting_review') {
      if (opts.autoApprove) {
        await autoApproveStep(root, state, hooks);
        continue;
      }
      hooks.onAwaitingReview?.({ agent: step.agent, runId });
      return { kind: 'awaiting_review' };
    }

    if (step.status === 'rejected') {
      hooks.onRejected?.({ agent: step.agent, runId });
      return { kind: 'rejected' };
    }

    if (step.status !== 'awaiting_work') {
      hooks.onRunFailed?.(`Unexpected step status "${step.status}" — cannot exec.`);
      return { kind: 'error' };
    }

    // Execute the current step.
    const success = await execStep(root, state, runId, opts, hooks);
    if (!success) { return { kind: 'error' }; }

    // Dry-run previews a single step's prompt and never advances.
    if (opts.dryRun) { return { kind: 'dry_run' }; }

    // Budget guard — sum per-step cost from the just-saved state.
    if (budget) {
      const after = RunStateStore.load(root, runId);
      const stepCosts = after ? after.steps.map((s) => s.costUsd) : [];
      const lastStepCost = after?.steps[state.currentStepIdx]?.costUsd;
      const verdict = checkBudget({ stepCosts, budget, lastStepCost });
      if (!verdict.ok) {
        hooks.onBudget?.({
          spent: verdict.spent, limit: verdict.limit, ok: false,
          exceeded: verdict.exceeded, onExceed: budget.on_exceed, runId,
        });
        return budget.on_exceed === 'fail'
          ? { kind: 'error' }
          : { kind: 'budget_pause' };
      }
      hooks.onBudget?.({ spent: verdict.spent, limit: budget.max_usd, ok: true, runId });
    }

    // --until boundary. `state.currentStepIdx` is the step that just ran.
    if (untilIdx >= 0 && state.currentStepIdx >= untilIdx) {
      hooks.onUntilStop?.({ untilIdx });
      return { kind: 'until' };
    }
  }
}

/** Skill text for an agent — concatenated when it declares multiple skills. */
function loadAgentSkills(ws: ReturnType<typeof WorkspaceLoader.load>, agent: AgentConfig): string {
  return agent.skills.map((id) => ws.skills.load(id)).join('\n\n---\n\n');
}

/** Execute one `awaiting_work` step: spawn the runner, then mark it done. */
async function execStep(
  root: string,
  state: RunState,
  runId: string,
  opts: ExecOptions,
  hooks: ExecHooks,
): Promise<boolean> {
  const stepIdx = state.currentStepIdx;
  const stepRec = state.steps[stepIdx];
  const agentId = stepRec.agent;

  let ws;
  try {
    ws = WorkspaceLoader.load(root);
  } catch (err) {
    hooks.onStepFailed?.({ stepIdx, agent: agentId, message: `Failed to load workspace: ${errMsg(err)}` });
    return false;
  }

  const pipeline = ws.config.pipelines.find((p) => p.id === state.pipelineId);
  if (!pipeline) {
    hooks.onStepFailed?.({ stepIdx, agent: agentId, message: `Pipeline "${state.pipelineId}" not found in workspace.yaml.` });
    return false;
  }

  const agent = ws.config.agents.find((a) => a.id === agentId);
  if (!agent) {
    hooks.onStepFailed?.({ stepIdx, agent: agentId, message: `Agent "${agentId}" not found in workspace.yaml.` });
    return false;
  }

  let skillText: string;
  try {
    skillText = loadAgentSkills(ws, agent);
  } catch (err) {
    hooks.onStepFailed?.({ stepIdx, agent: agentId, message: `Failed to load skills for agent "${agentId}": ${errMsg(err)}` });
    return false;
  }

  const env = ws.envResolver.resolveLayered(ws.config.environment ?? {}, agent.env ?? {});

  // claude --print always needs a non-empty prompt: explicit message → context
  // pairs → agent name fallback.
  const contextStr = Object.entries(state.context).map(([k, v]) => `${k}=${v}`).join(' ');
  const userMessage = opts.message ?? (contextStr || `Execute step: ${agentId}`);

  if (opts.dryRun) {
    hooks.onDryRunPreview?.({
      skills: agent.skills.join(', '),
      skillText,
      userMessage,
      env,
    });
    return true;
  }

  hooks.onStepStart?.({
    stepIdx, agent: agentId, revision: stepRec.revision,
    skills: agent.skills, model: agent.model, context: userMessage,
  });

  const runner = ws.runners.resolve(agent);
  const result = await runner.run({
    skill: skillText,
    env,
    args: userMessage ? [userMessage] : [],
    workspaceRoot: root,
    onOutput: (chunk) => hooks.onOutput?.(chunk),
    onError: (chunk) => hooks.onErrorOutput?.(chunk),
    claude: null,
  });

  if (!result.success) {
    hooks.onStepFailed?.({ stepIdx, agent: agentId, message: `Step "${agentId}" failed (non-zero exit).` });
    return false;
  }

  // markStepDone validates produces paths, then transitions.
  let next: RunState;
  try {
    const freshState = RunStateStore.load(root, runId)!;
    // Record cost before the transition so the budget guard can sum it and it
    // survives the reload-each-iteration loop.
    if (typeof result.costUsd === 'number') {
      freshState.steps[stepIdx].costUsd = result.costUsd;
    }
    next = markStepDone({ state: freshState, pipeline, workspaceRoot: root });
  } catch (err) {
    if (err instanceof PipelineRunError && err.missing?.length) {
      hooks.onStepFailed?.({ stepIdx, agent: agentId, missing: err.missing });
    } else {
      hooks.onStepFailed?.({ stepIdx, agent: agentId, message: errMsg(err) });
    }
    return false;
  }

  RunStateStore.save(root, next);

  const doneStep = next.steps[stepIdx];
  hooks.onStepResult?.({
    stepIdx, agent: agentId, status: doneStep.status, costUsd: result.costUsd,
  });
  return true;
}

/** Run the auto-review validator for the current step and submit its verdict. */
async function runAutoReviewStep(root: string, runId: string, hooks: ExecHooks): Promise<boolean> {
  const state = RunStateStore.load(root, runId);
  if (!state) {
    hooks.onRunFailed?.(`Run "${runId}" disappeared.`);
    return false;
  }
  const pipeline = loadPipelineForRun(root, state);
  if (!pipeline) {
    hooks.onRunFailed?.(`Pipeline "${state.pipelineId}" not found in workspace.yaml.`);
    return false;
  }
  const step = state.steps[state.currentStepIdx];
  hooks.onAutoReviewStart?.({ agent: step.agent });

  let verdict;
  try {
    verdict = await runAutoReview({ workspaceRoot: root, state, pipeline });
  } catch (err) {
    // Config-level failure (missing/unloadable runner). Validator errors are
    // already converted to a reject verdict inside runAutoReview.
    hooks.onStepFailed?.({ stepIdx: state.currentStepIdx, agent: step.agent, message: `Auto-review could not run: ${errMsg(err)}` });
    return false;
  }

  let next: RunState;
  try {
    next = submitAutoReviewVerdict({ state, pipeline, verdict });
  } catch (err) {
    hooks.onStepFailed?.({ stepIdx: state.currentStepIdx, agent: step.agent, message: errMsg(err) });
    return false;
  }

  RunStateStore.save(root, next);
  hooks.onAutoReviewResult?.({
    agent: step.agent, decision: verdict.decision, reason: verdict.reason, runId,
  });
  return true;
}

/** Auto-approve a human_review step (--auto-approve). */
async function autoApproveStep(root: string, state: RunState, hooks: ExecHooks): Promise<void> {
  const ws = WorkspaceLoader.load(root);
  const pipeline = ws.config.pipelines.find((p) => p.id === state.pipelineId)!;
  const next = approveStep({ state, pipeline });
  RunStateStore.save(root, next);
  hooks.onAutoApproved?.({ agent: state.steps[state.currentStepIdx].agent });
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
