/**
 * Shared helpers for commands that work with RunState and workspace pipelines.
 */

import * as fs from 'fs';
import chalk from 'chalk';
import {
  WorkspaceLoader,
  RunStateStore,
  type RunState,
  type StepRecord,
  type PipelineConfig,
  type AgentConfig,
  type SkillLoader,
  type TeamConfig,
} from '@aidlc/core';

// ── Run loading ───────────────────────────────────────────────────────────────

/** Load a run by id or exit with a clear error. */
export function requireRun(root: string, runId: string): RunState {
  const state = RunStateStore.load(root, runId);
  if (!state) {
    const all = RunStateStore.list(root);
    console.error(chalk.red(`Run "${runId}" not found.`));
    if (all.length > 0) {
      console.error(chalk.dim(`Available runs: ${all.map(r => r.runId).join(', ')}`));
    } else {
      console.error(chalk.dim('No runs yet. Run: aidlc run start <pipelineId>'));
    }
    process.exit(1);
  }
  return state;
}

// ── Workspace + pipeline loading ──────────────────────────────────────────────

/** Load workspace and find a pipeline by id, or exit. */
export function requirePipeline(root: string, pipelineId: string): {
  pipeline: PipelineConfig;
} {
  let ws;
  try {
    ws = WorkspaceLoader.load(root);
  } catch (err) {
    console.error(chalk.red(`Failed to load workspace: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }

  const pipeline = ws.config.pipelines.find(p => p.id === pipelineId);
  if (!pipeline) {
    const ids = ws.config.pipelines.map(p => p.id);
    console.error(chalk.red(`Pipeline "${pipelineId}" not found in workspace.yaml.`));
    if (ids.length > 0) {
      console.error(chalk.dim(`Available: ${ids.join(', ')}`));
    } else {
      console.error(chalk.dim('No pipelines defined. Run: aidlc pipeline add --id <id> --steps ...'));
    }
    process.exit(1);
  }

  return { pipeline };
}

/** Load workspace and find the pipeline that matches a run's pipelineId. */
export function requirePipelineForRun(root: string, state: RunState): PipelineConfig {
  return requirePipeline(root, state.pipelineId).pipeline;
}

/**
 * Load the workspace `team` block (multi-user review policy), or undefined
 * when the workspace has none / fails to load. Non-fatal: a workspace without
 * a `team:` block simply has no reviewer restrictions.
 */
export function loadTeamConfig(root: string): TeamConfig | undefined {
  try {
    return WorkspaceLoader.load(root).config.team;
  } catch {
    return undefined;
  }
}

// ── Step resolution ───────────────────────────────────────────────────────────

/**
 * Resolve `<step>` arg to a step index. Accepts:
 *   - a 0-based integer string: "0", "1", "2"
 *   - an agent id: "reviewer", "planner"
 *
 * Returns -1 when not found (caller decides whether to exit).
 */
export function resolveStepIdx(state: RunState, step: string): number {
  // Try as integer first
  const asInt = parseInt(step, 10);
  if (!isNaN(asInt) && String(asInt) === step) {
    return asInt >= 0 && asInt < state.steps.length ? asInt : -1;
  }
  // Try as agent id
  return state.steps.findIndex(s => s.agent === step);
}

/** Like resolveStepIdx but exits with a clear message on failure. */
export function requireStepIdx(state: RunState, step: string): number {
  const idx = resolveStepIdx(state, step);
  if (idx < 0) {
    const agents = state.steps.map((s, i) => `${i}:${s.agent}`).join(', ');
    console.error(chalk.red(`Step "${step}" not found in run "${state.runId}".`));
    console.error(chalk.dim(`Valid steps (index:agent): ${agents}`));
    process.exit(1);
  }
  return idx;
}

// ── Display helpers ───────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, (s: string) => string> = {
  pending:           chalk.dim,
  awaiting_work:     chalk.yellow,
  awaiting_review:   chalk.cyan,
  approved:          chalk.green,
  rejected:          chalk.red,
};

export function colorStatus(status: string): string {
  const fn = STATUS_COLOR[status] ?? chalk.white;
  return fn(status);
}

export function printRunSummary(state: RunState): void {
  const runColor = state.status === 'completed' ? chalk.green
    : state.status === 'failed' ? chalk.red : chalk.yellow;

  console.log(`\n${chalk.bold(state.runId)}  ${runColor(state.status)}`);
  console.log(chalk.dim(`  pipeline: ${state.pipelineId}`));
  if (Object.keys(state.context).length > 0) {
    const ctx = Object.entries(state.context).map(([k, v]) => `${k}=${v}`).join(', ');
    console.log(chalk.dim(`  context:  ${ctx}`));
  }
  if (state.claim) {
    console.log(chalk.dim(`  claimed:  ${state.claim.by} (${state.claim.at})`));
  }
  console.log();

  state.steps.forEach((step, i) => {
    const isCurrent = i === state.currentStepIdx && state.status === 'running';
    const marker    = isCurrent ? chalk.yellow('▶') : ' ';
    const idxLabel  = chalk.dim(`${i}.`);
    const agent     = isCurrent ? chalk.bold(step.agent) : chalk.dim(step.agent);
    const status    = colorStatus(step.status);
    const rev       = step.revision > 1 ? chalk.dim(` rev${step.revision}`) : '';
    const feedback  = step.feedback    ? chalk.dim(` [feedback: ${step.feedback.slice(0, 40)}]`) : '';
    const reason    = step.rejectReason ? chalk.red(` ✘ ${step.rejectReason.slice(0, 60)}`) : '';
    console.log(`  ${marker} ${idxLabel} ${agent.padEnd(20)} ${status}${rev}${feedback}${reason}`);
  });
  console.log();
}

/** Parse "key=val,key2=val2" into a Record. Empty / whitespace input → {}. */
export function parseContext(raw: string): Record<string, string> {
  if (!raw.trim()) { return {}; }
  const ctx: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    if (!pair.trim()) { continue; }   // tolerate trailing commas / extra whitespace
    const eq = pair.indexOf('=');
    if (eq < 1) {
      console.error(chalk.red(`Invalid context pair "${pair}" — expected key=value`));
      process.exit(1);
    }
    ctx[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return ctx;
}

/** Commander collector — accumulates a repeatable option into an array. */
export function collectOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/**
 * Resolve the full context map from a `--context-file` plus zero or more
 * `--context k=v,k=v` flags. File first (lowest precedence), then each
 * `--context` in order, so a later flag overrides a file key.
 *
 * `--context-file` accepts either a JSON object or `key=value` lines
 * (`#` comments and blank lines ignored) — handy for CI where the context is
 * assembled into a file rather than squeezed onto the command line.
 */
export function resolveContext(opts: { context?: string[]; contextFile?: string }): Record<string, string> {
  const ctx: Record<string, string> = {};

  if (opts.contextFile) {
    let raw: string;
    try {
      raw = fs.readFileSync(opts.contextFile, 'utf8');
    } catch (err) {
      console.error(chalk.red(`Cannot read --context-file "${opts.contextFile}": ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) {
      let obj: unknown;
      try {
        obj = JSON.parse(trimmed);
      } catch (err) {
        console.error(chalk.red(`--context-file "${opts.contextFile}" is not valid JSON: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) { ctx[k] = String(v); }
      } else {
        console.error(chalk.red(`--context-file "${opts.contextFile}" must be a JSON object of key→value.`));
        process.exit(1);
      }
    } else {
      for (const line of raw.split('\n')) {
        const l = line.trim();
        if (!l || l.startsWith('#')) { continue; }
        const eq = l.indexOf('=');
        if (eq < 1) {
          console.error(chalk.red(`Invalid line in --context-file: "${l}" — expected key=value`));
          process.exit(1);
        }
        ctx[l.slice(0, eq).trim()] = l.slice(eq + 1).trim();
      }
    }
  }

  for (const s of opts.context ?? []) {
    Object.assign(ctx, parseContext(s));
  }
  return ctx;
}

// ── Skill helpers ─────────────────────────────────────────────────────────────

/**
 * Load every skill referenced by an agent and concatenate their markdown
 * into a single system prompt. Skills are joined with a horizontal-rule
 * separator so claude treats them as discrete sections. Throws on the
 * first missing skill so callers can decide whether to exit (one-shot
 * commands) or just return a falsy step result (pipeline exec).
 */
export function loadAgentSkills(skills: SkillLoader, agent: AgentConfig): string {
  const parts: string[] = [];
  for (const skillId of agent.skills) {
    parts.push(skills.load(skillId));
  }
  return parts.join('\n\n---\n\n');
}

/** Comma-joined skill ids, for log lines / status messages. */
export function formatSkillsList(agent: AgentConfig): string {
  return agent.skills.join(', ');
}

export type { RunState, StepRecord, PipelineConfig };
