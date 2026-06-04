/**
 * Render a run's history into a shareable Markdown report.
 *
 * Pure function over {@link RunState} (+ optional pipeline for step labels):
 * no filesystem, no clock. The CLI `run report` command writes the string to
 * stdout / a file so a PO can paste it into a PR description or status update.
 *
 * The report summarizes each step's status, revision count, wall-clock
 * duration, LLM cost (when the runner reported it), and the reject reasons /
 * approve comments captured in the step history.
 */

import type { PipelineConfig } from '../schema/WorkspaceSchema';
import type { RunState, StepRecord, StepHistoryEntry } from './RunState';

/** Human-readable duration between two ISO timestamps, e.g. "3m 12s". */
function formatDuration(startISO?: string, endISO?: string): string {
  if (!startISO || !endISO) { return '—'; }
  const ms = Date.parse(endISO) - Date.parse(startISO);
  if (!Number.isFinite(ms) || ms < 0) { return '—'; }
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) { return `${totalSec}s`; }
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) { return sec ? `${min}m ${sec}s` : `${min}m`; }
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin ? `${hr}h ${remMin}m` : `${hr}h`;
}

function formatCost(costUsd?: number): string {
  return typeof costUsd === 'number' ? `$${costUsd.toFixed(4)}` : '—';
}

/** Escape pipe chars so step labels don't break the Markdown table. */
function cell(value: string): string {
  return value.replace(/\|/g, '\\|');
}

/** Render the per-step history (rejects, reruns, approvals) as a bullet list. */
function renderHistory(history: StepHistoryEntry[]): string[] {
  return history.map((h) => {
    switch (h.kind) {
      case 'reject':
        return `  - ✘ rejected (rev ${h.revision})${h.reason ? `: ${h.reason}` : ''}`;
      case 'rerun':
        return `  - ↺ rerun → rev ${h.revision}${h.feedback ? ` (feedback: ${h.feedback})` : ''}`;
      case 'auto_review':
        return `  - 🤖 auto-review ${h.decision} (rev ${h.revision}): ${h.reason}`;
      case 'approve':
        return `  - ✔ approved (rev ${h.revision})`;
      default:
        return '  - (unknown event)';
    }
  });
}

export function renderRunReport(args: {
  state: RunState;
  pipeline?: PipelineConfig;
}): string {
  const { state, pipeline } = args;
  const lines: string[] = [];

  lines.push(`# Run Report: ${state.runId}`);
  lines.push('');
  lines.push(`- **Pipeline:** ${state.pipelineId}`);
  lines.push(`- **Status:** ${state.status}`);
  lines.push(`- **Started:** ${state.startedAt}`);
  lines.push(`- **Updated:** ${state.updatedAt}`);
  lines.push(`- **Total duration:** ${formatDuration(state.startedAt, state.updatedAt)}`);

  const totalCost = state.steps.reduce<number>((sum, s) => sum + (s.costUsd ?? 0), 0);
  if (totalCost > 0) {
    lines.push(`- **Total cost:** $${totalCost.toFixed(4)}`);
  }

  // Context map (skip when empty).
  const contextEntries = Object.entries(state.context);
  if (contextEntries.length > 0) {
    lines.push('');
    lines.push('## Context');
    lines.push('');
    for (const [k, v] of contextEntries) {
      lines.push(`- \`${k}\`: ${v}`);
    }
  }

  // Step summary table.
  lines.push('');
  lines.push('## Steps');
  lines.push('');
  lines.push('| # | Step | Status | Rev | Duration | Cost |');
  lines.push('|---|------|--------|-----|----------|------|');
  for (const step of state.steps) {
    const label = stepLabel(step, pipeline);
    lines.push(
      `| ${step.stepIdx} | ${cell(label)} | ${step.status} | ${step.revision} | ` +
        `${formatDuration(step.startedAt, step.finishedAt)} | ${formatCost(step.costUsd)} |`,
    );
  }

  // Per-step detail: only steps that have something noteworthy
  // (reject reason, feedback, verdict, or >1 revision / history entries).
  const detailed = state.steps.filter(
    (s) =>
      s.rejectReason ||
      s.feedback ||
      s.autoReviewVerdict ||
      (s.history && s.history.length > 0),
  );
  if (detailed.length > 0) {
    lines.push('');
    lines.push('## Step details');
    for (const step of detailed) {
      lines.push('');
      lines.push(`### Step ${step.stepIdx}: ${stepLabel(step, pipeline)}`);
      if (step.feedback) { lines.push(`- **Feedback:** ${step.feedback}`); }
      if (step.rejectReason) { lines.push(`- **Reject reason:** ${step.rejectReason}`); }
      if (step.autoReviewVerdict) {
        lines.push(
          `- **Auto-review:** ${step.autoReviewVerdict.decision} — ${step.autoReviewVerdict.reason}`,
        );
      }
      if (step.history && step.history.length > 0) {
        lines.push('- **History:**');
        lines.push(...renderHistory(step.history));
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

/** Prefer the pipeline step's `name` (phase id), fall back to the agent id. */
function stepLabel(step: StepRecord, pipeline?: PipelineConfig): string {
  const cfg = pipeline?.steps?.[step.stepIdx];
  if (cfg && typeof cfg === 'object' && typeof (cfg as { name?: unknown }).name === 'string') {
    return (cfg as { name: string }).name;
  }
  return step.agent;
}
