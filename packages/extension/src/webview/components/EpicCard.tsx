import { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Check,
  X,
  Inbox,
  Outdent,
  FileText,
  Terminal,
  Copy,
  Bot,
  User,
  ExternalLink,
  Highlighter,
  Brain,
  Folder,
  FolderOpen,
  Github,
  Play,
  History,
  RefreshCw,
  Zap,
  AlertTriangle,
  ShieldCheck,
  ClipboardList,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  EpicSummary,
  EpicStepDetailFull,
  AgentMeta,
  StepHistoryEntry,
  StepStatus,
  UiStatus,
} from '@/lib/types';
import { StatusBadge } from './StatusBadge';
import { RejectModal } from './RejectModal';
import { RerunModal } from './RerunModal';
import { RunWithFeedbackModal } from './RunWithFeedbackModal';
import { RequestUpdateModal } from './RequestUpdateModal';
import { DeleteEpicModal } from './DeleteEpicModal';
import { postMessage } from '@/lib/bridge';

function fmtCost(c: number): string {
  if (c >= 100) return `$${c.toFixed(0)}`;
  if (c >= 10) return `$${c.toFixed(1)}`;
  return `$${c.toFixed(2)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function epicUiStatus(status: EpicSummary['status']): UiStatus {
  switch (status) {
    case 'in_progress':
      return 'in_progress';
    case 'done':
      return 'done';
    case 'failed':
      return 'rejected';
    default:
      return 'pending';
  }
}

function runStatusUi(status: StepStatus | null): UiStatus | null {
  if (!status || status === 'pending' || status === 'approved') { return null; }
  if (status === 'awaiting_work') { return 'awaiting_work'; }
  if (status === 'awaiting_auto_review' || status === 'awaiting_review') { return 'awaiting_review'; }
  if (status === 'rejected') { return 'rejected'; }
  return null;
}

const STEP_LABEL: Record<EpicStepDetailFull['status'], string> = {
  pending: 'pending',
  in_progress: 'in progress',
  done: 'done',
  failed: 'failed',
};

interface Props {
  epic: EpicSummary;
  agentMeta: Record<string, AgentMeta>;
  slashCommandsByAgent: Record<string, string>;
}

export function EpicCard({ epic, agentMeta, slashCommandsByAgent }: Props) {
  const [expanded, setExpanded] = useState<boolean>(false);
  const [focusedIdx, setFocusedIdx] = useState<number>(epic.currentStep ?? 0);
  const ui = epicUiStatus(epic.status);
  const total = epic.stepDetails.length;
  const done = epic.stepDetails.filter((s) => s.status === 'done').length;
  const focused = total > 0 ? epic.stepDetails[focusedIdx] : null;
  const inputKeys = Object.keys(epic.inputs || {});

  return (
    <div className="group relative rounded-lg border border-border bg-card transition-all hover:border-primary/30">
      <div
        className={cn(
          'absolute left-0 top-0 h-full w-0.5 rounded-l-lg',
          epic.status === 'in_progress' && 'bg-primary',
          epic.status === 'done' && 'bg-success',
          epic.status === 'failed' && 'bg-destructive',
          epic.status === 'pending' && 'bg-muted-foreground',
        )}
      />

      <div className="flex items-center justify-between gap-3 px-5 py-3.5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="shrink-0 font-mono text-xs font-bold text-primary">{epic.id}</span>
          <span className="truncate text-sm text-foreground">{epic.title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  epic.status === 'done' ? 'bg-success' : 'bg-primary',
                )}
                style={{ width: `${epic.progress}%` }}
              />
            </div>
            <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
              {epic.progress}%
            </span>
          </div>
          {epic.tokenUsage && epic.tokenUsage.total.calls > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground"
              title={
                `${fmtTokens(epic.tokenUsage.total.totalTokens)} tokens · ${epic.tokenUsage.total.calls} calls · ${fmtCost(epic.tokenUsage.total.cost)} API equiv` +
                (epic.tokenUsage.hasOverlap ? ' · ⚠ overlaps with another run in this project — totals may double-count' : '')
              }
            >
              <Zap className="h-3 w-3" />
              {fmtTokens(epic.tokenUsage.total.totalTokens)}
              {epic.tokenUsage.hasOverlap && (
                <AlertTriangle className="h-3 w-3 text-warning" aria-label="Overlap warning" />
              )}
            </span>
          )}
          <StatusBadge status={ui} />
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded p-1 text-muted-foreground hover:bg-accent"
            aria-label={expanded ? 'Collapse epic' : 'Expand epic'}
          >
            <ChevronRight
              className={cn('h-4 w-4 transition-transform', expanded && 'rotate-90')}
            />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-border px-5 py-4">
          <EpicDescription epic={epic} />

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            {epic.pipeline && (
              <span>
                Pipeline:{' '}
                <strong className="text-foreground">{epic.pipeline}</strong>
              </span>
            )}
            {!epic.pipeline && epic.agent && (
              <span>
                Agent: <strong className="text-foreground">{epic.agent}</strong>
              </span>
            )}
            {epic.artifactsOnly && (
              <span
                title="No pipeline binding — this epic's steps were derived from the .md files in its artifacts/ folder."
                className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                Artifacts only
              </span>
            )}
            {total > 0 && (
              <span>
                · <strong className="text-foreground">{done}/{total}</strong> steps done
              </span>
            )}
            {epic.createdAt && (
              <span>
                · Started{' '}
                <strong className="text-foreground">{epic.createdAt.slice(0, 10)}</strong>
              </span>
            )}
            {epic.runId && (
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  title="Re-check this run's produced artifacts still exist and pass content assertions"
                  onClick={() => postMessage({ type: 'verifyRun', runId: epic.runId! })}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <ShieldCheck className="h-3 w-3" />
                  Verify
                </button>
                <button
                  type="button"
                  title="Render this run's history as a shareable Markdown report"
                  onClick={() => postMessage({ type: 'runReport', runId: epic.runId! })}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <ClipboardList className="h-3 w-3" />
                  Report
                </button>
              </div>
            )}
          </div>

          {total > 0 && (
            <Stepper
              steps={epic.stepDetails}
              currentStep={epic.currentStep}
              focusedIdx={focusedIdx}
              onFocus={setFocusedIdx}
            />
          )}

          {focused && (
            <StepDetail
              epic={epic}
              focusedIdx={focusedIdx}
              focused={focused}
              meta={agentMeta[focused.agent]}
              slashCommand={
                // Use the host-resolved command (matched against the actual
                // workspace.yaml slash_commands — bare `/implement` or
                // namespaced `/sdlc-parallel-full-implement`), so it always
                // points at a command file that exists. Fall back to the
                // by-agent table for steps without a name.
                focused.slashCommand ?? slashCommandsByAgent[focused.agent]
              }
            />
          )}

          {inputKeys.length > 0 && (
            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Inputs
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-1 font-mono text-[11px]">
                {inputKeys.filter((k) => k !== 'extra_projects').map((k) => (
                  <Frag key={k} keyName={k} value={epic.inputs[k]} />
                ))}
              </div>
              {epic.inputs.extra_projects && (
                <ExtraProjectsList raw={epic.inputs.extra_projects} />
              )}
            </div>
          )}

          <EpicActions epic={epic} hasInputs={inputKeys.length > 0} />
        </div>
      )}
    </div>
  );
}

/**
 * Epic description. When the full requirement lives in an `init-requirement.md`
 * (or similarly named) artifact, keep the card concise by showing a link to
 * open that file instead of dumping the text inline. Falls back to the plain
 * description when no such file exists.
 */
function EpicDescription({ epic }: { epic: EpicSummary }) {
  const reqFile = epic.existingArtifacts.find((f) =>
    /init.?requirements?.*\.md$/i.test(f),
  );
  if (reqFile) {
    return (
      <button
        type="button"
        onClick={() =>
          postMessage({ type: 'openArtifactFile', epicDir: epic.epicDir, filename: reqFile })
        }
        className="inline-flex w-fit items-center gap-1.5 rounded border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary transition-colors hover:border-primary/50 hover:bg-primary/20"
        title={`Open ${reqFile}`}
      >
        <FileText className="h-3 w-3" />
        {reqFile}
      </button>
    );
  }
  const desc = (epic.description ?? '').trim();
  if (!desc) { return null; }
  return (
    <p className="text-xs italic leading-relaxed text-muted-foreground">{desc}</p>
  );
}

function Frag({ keyName, value }: { keyName: string; value: string }) {
  return (
    <>
      <span className="text-muted-foreground">{keyName}</span>
      <span className="break-all text-foreground">{value}</span>
    </>
  );
}

function ExtraProjectsList({ raw }: { raw: string }) {
  let projects: Array<{ type: string; ref: string; label: string; mode?: string }> = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) { projects = parsed; }
  } catch { /* raw JSON string — try wrapping */ }
  if (projects.length === 0) { return null; }
  return (
    <div className="mt-2">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Extra Projects
      </div>
      <div className="space-y-1">
        {projects.map((p, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-card/50 px-2.5 py-1.5 text-[11px]">
            {p.type === 'github'
              ? <Github className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              : <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            <span className="font-mono text-[10.5px] text-foreground truncate" title={p.ref}>{p.ref}</span>
            <span className={cn(
              'ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase',
              p.mode === 'workspace' ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                : p.mode === 'clone' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                : 'bg-muted text-muted-foreground',
            )}>
              {p.mode === 'workspace' ? 'workspace' : p.mode === 'clone' ? 'cloned' : 'ref'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stepper({
  steps,
  currentStep,
  focusedIdx,
  onFocus,
}: {
  steps: EpicStepDetailFull[];
  currentStep: number;
  focusedIdx: number;
  onFocus: (idx: number) => void;
}) {
  const isDag = steps.some((s) => (s.dependsOn?.length ?? 0) > 0);
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-surface/50 p-3">
      {isDag ? (
        <DagStepper steps={steps} currentStep={currentStep} focusedIdx={focusedIdx} onFocus={onFocus} />
      ) : (
        <LinearStepper steps={steps} currentStep={currentStep} focusedIdx={focusedIdx} onFocus={onFocus} />
      )}
    </div>
  );
}

function LinearStepper({
  steps,
  currentStep,
  focusedIdx,
  onFocus,
}: {
  steps: EpicStepDetailFull[];
  currentStep: number;
  focusedIdx: number;
  onFocus: (idx: number) => void;
}) {
  return (
    <div className="flex min-w-max items-start justify-center gap-0">
      {steps.map((step, i) => (
        <div key={`${step.agent}-${i}`} className="flex items-center">
          {i > 0 && (
            <div
              className={cn(
                'h-0.5 w-10',
                step.status === 'done' || steps[i - 1].status === 'done'
                  ? 'bg-primary'
                  : 'bg-border',
              )}
            />
          )}
          <StepperNode
            step={step}
            idx={i}
            isCurrent={i === currentStep}
            isFocused={i === focusedIdx}
            onFocus={() => onFocus(i)}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * DAG stepper: same level-bucketed layout used in the Builder's PipelineCard
 * so the user sees the parallel branches their pipeline actually has. Each
 * column is one DAG level; column connectors are drawn between adjacent
 * columns. Steps at the same level stack vertically.
 */
function DagStepper({
  steps,
  currentStep,
  focusedIdx,
  onFocus,
}: {
  steps: EpicStepDetailFull[];
  currentStep: number;
  focusedIdx: number;
  onFocus: (idx: number) => void;
}) {
  const levels = computeEpicDagLevels(steps);
  // Level-based numbering: single occupant → "3", parallels → "2.1", "2.2".
  const labelByIdx = new Map<number, string>();
  levels.forEach((column, colIdx) => {
    const lvl = colIdx + 1;
    if (column.length === 1) {
      labelByIdx.set(column[0].idx, String(lvl));
    } else {
      column.forEach((entry, sub) => {
        labelByIdx.set(entry.idx, `${lvl}.${sub + 1}`);
      });
    }
  });
  return (
    <div className="flex min-w-max items-stretch justify-center gap-0">
      {levels.map((column, colIdx) => (
        <div key={colIdx} className="flex items-stretch">
          <div className="flex flex-col items-center justify-center gap-2 self-center">
            {column.map(({ step, idx }) => (
              <StepperNode
                key={`${step.agent}-${idx}`}
                step={step}
                idx={idx}
                label={labelByIdx.get(idx) ?? String(idx + 1)}
                isCurrent={idx === currentStep}
                isFocused={idx === focusedIdx}
                onFocus={() => onFocus(idx)}
              />
            ))}
          </div>
          {colIdx < levels.length - 1 && (
            <div className="flex flex-col justify-center px-1">
              <div className="h-0.5 w-8 bg-border" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function computeEpicDagLevels(
  steps: EpicStepDetailFull[],
): Array<Array<{ step: EpicStepDetailFull; idx: number }>> {
  // Same fix as PipelineCard.computeDagLevels — DAG edges reference phase
  // ids (step.name) when present, falling back to step.agent for legacy.
  const dagId = (s: EpicStepDetailFull): string => s.stepName ?? s.agent;
  const stepById = new Map<string, { step: EpicStepDetailFull; idx: number }>();
  steps.forEach((step, idx) => { stepById.set(dagId(step), { step, idx }); });

  const memo = new Map<string, number>();
  const computing = new Set<string>();
  const levelOf = (id: string): number => {
    if (memo.has(id)) { return memo.get(id)!; }
    if (computing.has(id)) { return 0; }
    computing.add(id);
    const entry = stepById.get(id);
    const deps = (entry?.step.dependsOn ?? []).filter((d) => stepById.has(d));
    const level = deps.length === 0 ? 0 : Math.max(...deps.map(levelOf)) + 1;
    computing.delete(id);
    memo.set(id, level);
    return level;
  };

  const buckets: Array<Array<{ step: EpicStepDetailFull; idx: number }>> = [];
  steps.forEach((step, idx) => {
    const lvl = levelOf(dagId(step));
    if (!buckets[lvl]) { buckets[lvl] = []; }
    buckets[lvl].push({ step, idx });
  });
  return buckets;
}

function StepperNode({
  step,
  idx,
  label,
  isCurrent,
  isFocused,
  onFocus,
}: {
  step: EpicStepDetailFull;
  idx: number;
  /** Optional display label — DAG mode passes `<level>.<n>`, linear mode lets us fall back to `idx + 1`. */
  label?: string;
  isCurrent: boolean;
  isFocused: boolean;
  onFocus: () => void;
}) {
  // Pending step that carries history was previously approved and got reset
  // by a downstream Request-Update — surface that as a warning-tinted state
  // separate from never-touched pending.
  const isAwaitingUpdate = step.status === 'pending' && (step.history ?? []).length > 0;
  const inner =
    step.status === 'done'
      ? <Check className="h-3.5 w-3.5" />
      : step.status === 'failed'
        ? <X className="h-3.5 w-3.5" />
        : (label ?? String(idx + 1));
  return (
    <button
      type="button"
      onClick={onFocus}
      className="group flex flex-col items-center gap-1 px-1"
      title={`${step.stepName ?? step.agent}${step.stepName && step.stepName !== step.agent ? ` · agent ${step.agent}` : ''} — ${isAwaitingUpdate ? 'awaiting update' : STEP_LABEL[step.status]}`}
    >
      <div
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold transition-all',
          step.status === 'done' && 'bg-primary text-primary-foreground',
          step.status === 'in_progress' &&
            'bg-warning text-warning-foreground shadow-[0_0_14px_color-mix(in_oklab,var(--color-warning)_40%,transparent)]',
          step.status === 'failed' && 'bg-destructive text-destructive-foreground',
          step.status === 'pending' && !isAwaitingUpdate &&
            'border-2 border-border bg-card text-muted-foreground',
          isAwaitingUpdate &&
            'border-2 border-warning/60 bg-warning/10 text-warning',
          isCurrent && 'scale-110',
          isFocused && 'ring-4 ring-primary/30',
        )}
      >
        {inner}
      </div>
      <span
        className={cn(
          'max-w-[80px] truncate text-center text-[9px] font-bold uppercase tracking-wider',
          isFocused
            ? 'text-primary'
            : step.status === 'done' || step.status === 'in_progress'
              ? 'text-foreground'
              : 'text-muted-foreground',
        )}
      >
        {step.stepName ?? step.agent}
      </span>
    </button>
  );
}

function StepDetail({
  epic,
  focusedIdx,
  focused,
  meta,
  slashCommand,
}: {
  epic: EpicSummary;
  focusedIdx: number;
  focused: EpicStepDetailFull;
  meta: AgentMeta | undefined;
  slashCommand: string | undefined;
}) {
  const total = epic.stepDetails.length;
  const ui = (() => {
    if (focused.status === 'done') { return 'done' as const; }
    if (focused.status === 'in_progress') { return 'in_progress' as const; }
    if (focused.status === 'failed') { return 'rejected' as const; }
    // Pending step that carries history was previously approved and got
    // reset by a downstream Request-Update — flag it so the user can tell
    // it apart from a never-touched step.
    if ((focused.history ?? []).length > 0) { return 'awaiting_update' as const; }
    return 'pending' as const;
  })();
  const m = meta ?? { name: focused.agent, description: '', inputs: '', outputs: '', artifact: '' };
  // Step-level artifact (from `produces[0]` on the pipeline step) wins over
  // the persona's default — one persona handles multiple phases that each
  // emit different files, so the step is the authoritative source.
  const artifactName = focused.artifact || m.artifact || '';
  const artifactExists = artifactName ? epic.existingArtifacts.includes(artifactName) : false;
  // The annotation loop renders `<file>.md` → `<file>.html`. Offer a plain
  // "Open HTML" (read-only) only once that render exists; before then, the
  // Feedback action is what creates it.
  const htmlName = artifactName ? artifactName.replace(/\.md$/i, '') + '.html' : '';
  const htmlExists = htmlName ? epic.existingArtifacts.includes(htmlName) : false;
  const [artifactMenuOpen, setArtifactMenuOpen] = useState(false);

  const accent = (() => {
    switch (focused.status) {
      case 'in_progress':
        return 'border-l-warning';
      case 'done':
        return 'border-l-success';
      case 'failed':
        return 'border-l-destructive';
      default:
        return 'border-l-border';
    }
  })();

  return (
    <div className={cn('rounded-md border border-border border-l-[3px] bg-surface/50 p-4', accent)}>
      <div className="flex items-baseline gap-2.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Step {focusedIdx + 1}/{total}
        </span>
        <span className="flex-1 truncate text-sm font-bold text-foreground">{focused.stepName ?? m.name}</span>
        <StatusBadge status={ui} />
      </div>

      {m.description && (
        <p className="mt-2 text-[11.5px] italic leading-relaxed text-muted-foreground">
          {m.description}
        </p>
      )}

      {focused.tokenUsage && focused.tokenUsage.calls > 0 && (
        <div
          className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground"
          title={`${fmtCost(focused.tokenUsage.cost)} API equivalent (subscription users don't pay this)`}
        >
          <span className="inline-flex items-center gap-1 font-medium tabular-nums text-foreground">
            <Zap className="h-3 w-3" />
            {fmtTokens(focused.tokenUsage.totalTokens)} tok
          </span>
          <span>· {focused.tokenUsage.calls} calls</span>
          <span>
            · in <strong className="text-foreground">{fmtTokens(focused.tokenUsage.inputTokens)}</strong>
          </span>
          <span>
            · out <strong className="text-foreground">{fmtTokens(focused.tokenUsage.outputTokens)}</strong>
          </span>
          <span>
            · cache rd <strong className="text-foreground">{fmtTokens(focused.tokenUsage.cacheReadTokens)}</strong>
          </span>
          <span>
            · cache wr <strong className="text-foreground">{fmtTokens(focused.tokenUsage.cacheWriteTokens)}</strong>
          </span>
        </div>
      )}

      <div className="mt-3 grid grid-cols-[110px_1fr] gap-x-4 gap-y-1.5 text-[11.5px]">
        <DetailLabel icon={<Inbox className="h-3 w-3" />} text="Input" />
        <DetailValue empty={!m.inputs}>{m.inputs || '—'}</DetailValue>

        <DetailLabel icon={<Outdent className="h-3 w-3" />} text="Output" />
        <DetailValue empty={!m.outputs}>{m.outputs || '—'}</DetailValue>

        <DetailLabel icon={<FileText className="h-3 w-3" />} text="Artifact" />
        {artifactName ? (
          artifactExists ? (
            <div className="relative w-fit">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setArtifactMenuOpen((v) => !v);
                }}
                className="inline-flex w-fit items-center gap-1 rounded border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary transition-colors hover:border-primary/50 hover:bg-primary/20"
                title={`Open ${artifactName}`}
              >
                <span>{artifactName}</span>
                <ChevronDown className={cn('h-2.5 w-2.5 opacity-70 transition-transform', artifactMenuOpen && 'rotate-180')} />
              </button>
              {artifactMenuOpen && (
                <>
                  {/* click-away backdrop */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={(e) => { e.stopPropagation(); setArtifactMenuOpen(false); }}
                  />
                  <div className="absolute left-0 top-full z-20 mt-1 min-w-[210px] overflow-hidden rounded-md border border-border bg-card shadow-lg">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setArtifactMenuOpen(false);
                        postMessage({ type: 'openArtifactFile', epicDir: epic.epicDir, filename: artifactName });
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-foreground hover:bg-accent"
                    >
                      <FileText className="h-3 w-3 text-muted-foreground" />
                      <span>Open Markdown</span>
                    </button>
                    {htmlExists && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setArtifactMenuOpen(false);
                          postMessage({ type: 'openHtmlFile', epicDir: epic.epicDir, filename: htmlName });
                        }}
                        className="flex w-full items-center gap-2 border-t border-border px-3 py-1.5 text-left text-[11px] text-foreground hover:bg-accent"
                        title="Open the rendered HTML in your browser (read-only)"
                      >
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        <span>Open HTML</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setArtifactMenuOpen(false);
                        postMessage({ type: 'annotateArtifact', epicDir: epic.epicDir, filename: artifactName });
                      }}
                      className="flex w-full items-center gap-2 border-t border-border px-3 py-1.5 text-left text-[11px] text-foreground hover:bg-accent"
                      title={
                        htmlExists
                          ? 'Open the HTML in annotron and start the feedback loop (edits the .md)'
                          : 'Render to HTML, open in annotron, and start the feedback loop (edits the .md)'
                      }
                    >
                      <Highlighter className="h-3 w-3 text-primary" />
                      <span>Feedback</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div
              className="inline-flex w-fit items-center rounded border border-border bg-muted/50 px-2 py-0.5 font-mono text-[11px] italic text-muted-foreground opacity-70"
              title="File not produced yet — will land in artifacts/ when this step runs"
            >
              {artifactName} · not produced yet
            </div>
          )
        ) : (
          <div className="font-mono text-[11px] italic text-muted-foreground">—</div>
        )}

        {slashCommand && (
          <>
            <DetailLabel icon={<Terminal className="h-3 w-3" />} text="Command" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                postMessage({ type: 'copyCommand', command: slashCommand });
              }}
              title="Click to copy — paste into Claude to run this step"
              className="inline-flex w-fit items-center gap-1.5 rounded border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary transition-colors hover:border-primary/50 hover:bg-primary/20"
            >
              <span>{slashCommand}</span>
              <Copy className="h-2.5 w-2.5 opacity-70" />
            </button>
          </>
        )}
      </div>

      <RunGate
        epic={epic}
        focused={focused}
        focusedIdx={focusedIdx}
        slashCommand={slashCommand}
        artifactExists={artifactExists}
      />
      <RequestUpdateAction epic={epic} focused={focused} focusedIdx={focusedIdx} />
      <StepHistory step={focused} />
    </div>
  );
}

function DetailLabel({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
      {icon}
      <span>{text}</span>
    </div>
  );
}

function RequestUpdateAction({
  epic,
  focused,
  focusedIdx,
}: {
  epic: EpicSummary;
  focused: EpicStepDetailFull;
  focusedIdx: number;
}) {
  const [open, setOpen] = useState(false);
  // Only show for steps the run-state machine considers "approved" — that's
  // what `requestStepUpdate` accepts. A done-from-state.json with no
  // matching run record can't be rewound by the runner.
  if (!epic.runId || focused.runStatus !== 'approved') { return null; }
  // Count downstream approved + in-flight steps so the modal can show the
  // blast radius accurately.
  const downstreamCount = epic.stepDetails
    .slice(focusedIdx + 1)
    .filter((s) => s.runStatus === 'approved' || s.isCurrentRunStep).length;
  return (
    <div className="mt-3 flex items-center justify-between rounded-md border border-dashed border-warning/40 bg-warning/5 px-3 py-2 text-[11px]">
      <div className="text-muted-foreground">
        Requirements changed?{' '}
        <span className="text-foreground/80">Reopen this step</span> to redo it
        {downstreamCount > 0 && (
          <> + reset {downstreamCount} downstream</>
        )}.
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-warning/50 bg-warning/15 px-2 py-1 text-[10.5px] font-semibold text-warning hover:border-warning hover:bg-warning/25"
      >
        <RefreshCw className="h-2.5 w-2.5" /> Request update
      </button>
      {open && (
        <RequestUpdateModal
          agent={focused.agent}
          runId={epic.runId}
          stepIdx={focusedIdx}
          downstreamCount={downstreamCount}
          onSubmit={(feedback) =>
            postMessage({
              type: 'requestStepUpdate',
              runId: epic.runId!,
              stepIdx: focusedIdx,
              feedback,
            })
          }
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function StepHistory({ step }: { step: EpicStepDetailFull }) {
  const [open, setOpen] = useState(false);
  const entries = step.history ?? [];
  if (entries.length === 0) { return null; }

  const rejectCount = step.rejectCount ?? 0;
  const rerunCount = entries.filter((e) => e.kind === 'rerun').length;
  const annotateCount = entries.filter((e) => e.kind === 'annotate').length;
  const lastReject = [...entries].reverse().find((e) => e.kind === 'reject') as
    | (StepHistoryEntry & { kind: 'reject' })
    | undefined;

  const summary = [
    rejectCount > 0 && `rejected ${rejectCount}×`,
    rerunCount > 0 && `rerun ${rerunCount}×`,
    annotateCount > 0 && `annotated ${annotateCount}×`,
    !rejectCount && entries.some((e) => e.kind === 'approve') && 'approved',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="mt-3 rounded-md border border-border bg-secondary/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] hover:bg-accent/40"
      >
        {open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        <History className="h-3 w-3 text-muted-foreground" />
        <span className="font-bold uppercase tracking-wider text-muted-foreground">
          History
        </span>
        <span className="text-muted-foreground/80">· {entries.length} entries</span>
        {summary && <span className="text-muted-foreground/80">· {summary}</span>}
        {lastReject?.reason && !open && (
          <span className="ml-auto truncate font-mono text-[10.5px] text-destructive/80 max-w-[55%]">
            ↳ {lastReject.reason}
          </span>
        )}
      </button>

      {open && (
        <ol className="border-t border-border/60 px-3 py-2 space-y-1.5 text-[10.5px]">
          {entries.map((e, i) => {
            const segUsage = step.tokenUsage?.history?.[i];
            return (
              <li key={i} className="flex items-start gap-2">
                <HistoryIcon kind={e.kind} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <HistoryLabel entry={e} />
                    <span className="text-[9.5px] text-muted-foreground tabular-nums">
                      rev {e.revision}
                    </span>
                    {segUsage && segUsage.calls > 0 && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[9.5px] tabular-nums text-muted-foreground"
                        title={`${fmtTokens(segUsage.totalTokens)} tokens · ${segUsage.calls} calls · ${fmtCost(segUsage.cost)} API equiv — consumed in the segment leading to this event`}
                      >
                        <Zap className="h-2.5 w-2.5" />
                        {fmtTokens(segUsage.totalTokens)}
                      </span>
                    )}
                    <span className="ml-auto text-[9.5px] text-muted-foreground/80">
                      {fmtTime(e.at)}
                    </span>
                  </div>
                  <HistoryBody entry={e} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function HistoryIcon({ kind }: { kind: StepHistoryEntry['kind'] }) {
  switch (kind) {
    case 'reject':
      return <X className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />;
    case 'rerun':
      return <RefreshCw className="mt-0.5 h-3 w-3 shrink-0 text-warning" />;
    case 'auto_review':
      return <Bot className="mt-0.5 h-3 w-3 shrink-0 text-info" />;
    case 'approve':
      return <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" />;
    case 'annotate':
      return <Highlighter className="mt-0.5 h-3 w-3 shrink-0 text-primary" />;
  }
}

function HistoryLabel({ entry }: { entry: StepHistoryEntry }) {
  switch (entry.kind) {
    case 'reject':
      return (
        <span className="font-semibold text-destructive">
          Rejected
          {entry.sentBackToIdx !== undefined && (
            <span className="ml-1 font-normal text-muted-foreground">
              → step {entry.sentBackToIdx + 1}
            </span>
          )}
        </span>
      );
    case 'rerun':
      return <span className="font-semibold text-warning">Rerun</span>;
    case 'auto_review':
      return (
        <span className={cn('font-semibold', entry.decision === 'pass' ? 'text-success' : 'text-destructive')}>
          Auto-review {entry.decision === 'pass' ? '✓ pass' : '✕ reject'}
        </span>
      );
    case 'approve':
      return <span className="font-semibold text-success">Approved</span>;
    case 'annotate':
      return (
        <span className="font-semibold text-primary">
          Annotated
          <span className="ml-1 font-normal text-muted-foreground">.md edited</span>
        </span>
      );
  }
}

function HistoryBody({ entry }: { entry: StepHistoryEntry }) {
  switch (entry.kind) {
    case 'reject':
      return entry.reason ? (
        <div className="font-mono text-foreground/80">↳ {entry.reason}</div>
      ) : null;
    case 'rerun':
      return entry.feedback ? (
        <div className="font-mono text-muted-foreground">↳ {entry.feedback}</div>
      ) : null;
    case 'auto_review':
      return (
        <div className="font-mono text-foreground/80">
          ↳ {entry.reason}
        </div>
      );
    case 'approve':
      return null;
    case 'annotate':
      return (
        <div className="space-y-0.5">
          {entry.note && <div className="font-mono text-foreground/80">↳ {entry.note}</div>}
          {entry.summary && <div className="text-muted-foreground">✎ {entry.summary}</div>}
          {entry.author && <div className="text-muted-foreground/70">by {entry.author}</div>}
        </div>
      );
  }
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) { return iso; }
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function DetailValue({ children, empty }: { children: React.ReactNode; empty?: boolean }) {
  return (
    <div className={cn('leading-relaxed', empty ? 'text-muted-foreground italic' : 'text-foreground')}>
      {children}
    </div>
  );
}

function RunGate({
  epic,
  focused,
  focusedIdx,
  slashCommand,
  artifactExists,
}: {
  epic: EpicSummary;
  focused: EpicStepDetailFull;
  focusedIdx: number;
  slashCommand: string | undefined;
  artifactExists: boolean;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rerunOpen, setRerunOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  if (!epic.runId) { return null; }
  // DAG pipelines may have several active steps; instead of gating on a
  // single "current" cursor, accept any focused step that's in an actionable
  // status. runStatusUi already filters out pending / approved.
  const ui = runStatusUi(focused.runStatus);
  if (!ui) { return null; }

  const status = focused.runStatus!;
  const labels: Record<string, string> = {
    awaiting_work: 'Awaiting work',
    awaiting_auto_review: 'Awaiting auto-review',
    awaiting_review: 'Awaiting human review',
    rejected: 'Rejected',
  };
  const messages: Record<string, string> = {
    awaiting_work: 'Run the agent externally, then mark this step done to advance.',
    awaiting_auto_review: 'Auto-reviewer pending. Run it to validate this step.',
    awaiting_review:
      'Step is paused for your approval. Approve to advance, reject to send back.',
    rejected: 'This step was rejected. Rerun to bump revision and try again.',
  };

  const cls = (() => {
    if (status === 'awaiting_work') {
      return 'bg-primary/5 border-primary/30 text-primary';
    }
    if (status === 'awaiting_auto_review' || status === 'awaiting_review') {
      return 'bg-warning/10 border-warning/40 text-warning';
    }
    if (status === 'rejected') {
      return 'bg-destructive/5 border-destructive/40 text-destructive';
    }
    return 'bg-muted border-border text-muted-foreground';
  })();

  const gates: string[] = [];
  if (focused.stepHasAutoReview) { gates.push('🤖 auto-review'); }
  if (focused.stepHasHumanReview) { gates.push('👤 human review'); }

  return (
    <div className={cn('mt-4 space-y-2 rounded-md border p-3 text-[11.5px]', cls)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[9.5px] font-bold uppercase tracking-wider">
          {labels[status] ?? status}
        </span>
        <span className="flex-1 text-foreground/80">{messages[status]}</span>
      </div>

      {status === 'rejected' && focused.rejectReason && (
        <div className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 font-mono text-[10.5px] text-destructive">
          ↳ {focused.rejectReason}
        </div>
      )}

      {status === 'awaiting_work' && focused.feedback && (
        <div className="rounded border border-warning/40 bg-warning/10 px-2 py-1 font-mono text-[10.5px] text-warning">
          ↳ {focused.feedback}
        </div>
      )}

      {focused.autoReviewVerdict && (
        <div
          className={cn(
            'rounded border px-2 py-1.5 text-[11px]',
            focused.autoReviewVerdict.decision === 'pass'
              ? 'border-success/30 bg-success/10'
              : 'border-destructive/40 bg-destructive/10',
          )}
        >
          <div
            className={cn(
              'flex items-center gap-1 font-semibold',
              focused.autoReviewVerdict.decision === 'pass' ? 'text-success' : 'text-destructive',
            )}
          >
            {focused.autoReviewVerdict.decision === 'pass' ? (
              <Bot className="h-3 w-3" />
            ) : (
              <Bot className="h-3 w-3" />
            )}
            <span>
              Auto-review:{' '}
              {focused.autoReviewVerdict.decision === 'pass' ? '✓ pass' : '✕ reject'}
            </span>
          </div>
          {focused.autoReviewVerdict.reason && (
            <div className="text-foreground/80">{focused.autoReviewVerdict.reason}</div>
          )}
        </div>
      )}

      {gates.length > 0 ? (
        <div className="text-[10.5px] italic text-foreground/70">
          Gates after Mark done: {gates.join(' → ')}
        </div>
      ) : status === 'awaiting_work' ? (
        <div className="text-[10.5px] italic text-muted-foreground">
          No review gates configured — Mark done will auto-approve and advance.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {status === 'awaiting_work' && (
          <>
            {slashCommand && (() => {
              const hasFeedback = !!focused.feedback;
              return (
                <GateButton
                  variant="approve"
                  onClick={() => {
                    if (hasFeedback) {
                      setRunOpen(true);
                    } else {
                      postMessage({
                        type: 'runStepWithFeedback',
                        runId: epic.runId!,
                        slashCommand,
                        feedback: '',
                      });
                    }
                  }}
                >
                  <Play className="h-3 w-3" />
                  {hasFeedback ? 'Update with feedback' : 'Run with Claude'}
                </GateButton>
              );
            })()}
            <GateButton
              variant="primary"
              onClick={() => postMessage({ type: 'markStepDone', runId: epic.runId!, stepIdx: focusedIdx })}
            >
              Mark step done
            </GateButton>
          </>
        )}
        {status === 'awaiting_auto_review' && (
          <GateButton
            variant="primary"
            onClick={() => postMessage({ type: 'runAutoReview', runId: epic.runId!, stepIdx: focusedIdx })}
          >
            Run auto-review
          </GateButton>
        )}
        {status === 'awaiting_review' && (
          <>
            <GateButton
              variant="approve"
              onClick={() => postMessage({ type: 'approveStep', runId: epic.runId!, stepIdx: focusedIdx })}
            >
              <Check className="h-3 w-3" /> Approve
            </GateButton>
            <GateButton
              variant="reject"
              onClick={() => setRejectOpen(true)}
            >
              <X className="h-3 w-3" /> Reject
            </GateButton>
          </>
        )}
        {status === 'rejected' && (
          <GateButton variant="primary" onClick={() => setRerunOpen(true)}>
            Rerun
          </GateButton>
        )}
      </div>

      {rejectOpen && epic.runId && (
        <RejectModal
          runId={epic.runId}
          currentStepIdx={focusedIdx}
          stepAgents={epic.stepDetails.map((d) => d.agent)}
          onClose={() => setRejectOpen(false)}
        />
      )}
      {rerunOpen && epic.runId && (
        <RerunModal
          runId={epic.runId}
          agent={focused.agent}
          rejectReason={focused.rejectReason}
          onSubmit={(feedback) =>
            postMessage({ type: 'rerunStepInline', runId: epic.runId!, feedback, stepIdx: focusedIdx })
          }
          onClose={() => setRerunOpen(false)}
        />
      )}
      {runOpen && epic.runId && slashCommand && (
        <RunWithFeedbackModal
          agent={focused.agent}
          runId={epic.runId}
          slashCommand={slashCommand}
          carriedFeedback={focused.feedback}
          onSubmit={(feedback) =>
            postMessage({
              type: 'runStepWithFeedback',
              runId: epic.runId!,
              slashCommand,
              feedback,
            })
          }
          onClose={() => setRunOpen(false)}
        />
      )}
    </div>
  );
}

function GateButton({
  children,
  variant,
  onClick,
}: {
  children: React.ReactNode;
  variant: 'primary' | 'approve' | 'reject';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10.5px] font-semibold transition-colors',
        variant === 'primary' &&
          'border-primary/40 bg-primary/15 text-primary hover:border-primary/60 hover:bg-primary/25',
        variant === 'approve' &&
          'border-success/40 bg-success/15 text-success hover:border-success/60 hover:bg-success/25',
        variant === 'reject' &&
          'border-destructive/40 bg-destructive/15 text-destructive hover:border-destructive/60 hover:bg-destructive/25',
      )}
    >
      {children}
    </button>
  );
}

function EpicActions({ epic, hasInputs }: { epic: EpicSummary; hasInputs: boolean }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
      {!epic.runId && epic.pipeline && (
        <button
          type="button"
          onClick={() =>
            postMessage({
              type: 'startPipelineRunForEpic',
              epicId: epic.id,
              pipelineId: epic.pipeline,
            })
          }
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
        >
          <Play className="h-3 w-3" />
          Start pipeline run
        </button>
      )}
      {epic.statePath && (
        <button
          type="button"
          onClick={() => postMessage({ type: 'openEpicState', path: epic.statePath })}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <FileText className="h-3 w-3" />
          Open state.json
        </button>
      )}
      {hasInputs && (
        <button
          type="button"
          onClick={() => postMessage({ type: 'openInputsJson', epicDir: epic.epicDir })}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <FileText className="h-3 w-3" />
          Open inputs.json
        </button>
      )}
      <button
        type="button"
        onClick={() => postMessage({ type: 'revealArtifacts', epicDir: epic.epicDir })}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Folder className="h-3 w-3" />
        Reveal artifacts
      </button>
      <button
        type="button"
        onClick={() => postMessage({ type: 'openEpicMemory', epicDir: epic.epicDir })}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        title="View this epic's memory digest (decisions, constraints, reflections) — shared context to continue the epic cheaply"
      >
        <Brain className="h-3 w-3" />
        Memory
      </button>
      <button
        type="button"
        onClick={() => setDeleteOpen(true)}
        className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-[11px] text-destructive hover:border-destructive/60 hover:bg-destructive/15"
        title="Delete this epic — removes the run state, optionally the docs/epics folder too"
      >
        <Trash2 className="h-3 w-3" />
        Delete
      </button>
      {deleteOpen && (
        <DeleteEpicModal
          epicId={epic.id}
          epicDir={epic.epicDir}
          hasRun={!!epic.runId}
          onConfirm={(deleteFolder) =>
            postMessage({
              type: 'deleteEpic',
              epicId: epic.id,
              runId: epic.runId ?? undefined,
              deleteFolder,
              confirmed: true,
            })
          }
          onClose={() => setDeleteOpen(false)}
        />
      )}
    </div>
  );
}

// Suppress unused-import warnings for icons that are conditionally referenced.
const _ICONS = { ChevronDown, User };
void _ICONS;
