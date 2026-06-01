import { useState } from 'react';
import {
  Play,
  Plus,
  Pencil,
  Copy,
  X,
  ArrowUp,
  ArrowDown,
  Settings,
  Bot,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PipelineSummary, PipelineStepSummary, AgentSummary } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import { ConfirmModal } from './ConfirmModal';
import { StepPickerModal } from './StepPickerModal';
import { StartRunModal } from './StartRunModal';
import { StepConfigModal } from './StepConfigModal';
import { PipelineModal, type PipelineDraft } from './PipelineModal';
import { KebabMenu } from './AgentCard';
import { RenameModal } from './RenameModal';

export function PipelineCard({
  pipeline,
  agents,
  runIds,
  allPipelineIds,
}: {
  pipeline: PipelineSummary;
  agents: AgentSummary[];
  runIds: string[];
  /** Every workflow id in the workspace — used to validate a rename target. */
  allPipelineIds: string[];
}) {
  const total = pipeline.steps.length;
  const [dragSrc, setDragSrc] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // When the user opens the picker via a node's "+ parallel" button we
  // remember which agent to clone deps from, so the new step lands at the
  // same DAG level as the source. null = plain append (next column).
  const [parallelToAgent, setParallelToAgent] = useState<string | null>(null);
  const [runOpen, setRunOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);

  const initialDraft: PipelineDraft = {
    id: pipeline.id,
    on_failure: pipeline.on_failure,
    steps: pipeline.steps.map((s) => ({
      agent: s.agent,
      name: s.name,
      skills: s.skills,
      human_review: s.human_review,
      auto_review: s.auto_review,
      auto_review_runner: s.auto_review_runner,
      // Carry DAG edges through the modal so a save round-trip preserves
      // the parallel layout — the modal doesn't let the user edit deps,
      // but it must not silently flatten them either.
      depends_on: s.depends_on,
    })),
  };
  return (
    <div className="group rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <div className="font-mono text-xs font-bold text-primary">{pipeline.id}</div>
        <span className="text-[10px] text-muted-foreground">{total} steps</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setRunOpen(true)}
          title="Start a pipeline run for this workflow"
          className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary hover:border-primary/60 hover:bg-primary/25"
        >
          <Play className="h-2.5 w-2.5" />
          Run
        </button>
        <button
          type="button"
          onClick={() => postMessage({ type: 'togglePipelineFailure', pipelineId: pipeline.id })}
          title="Click to toggle on_failure between stop and continue"
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
            pipeline.on_failure === 'stop'
              ? 'border-warning/40 bg-warning/15 text-warning'
              : 'border-border bg-secondary text-muted-foreground',
          )}
        >
          on_failure: {pipeline.on_failure}
        </button>
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          title="Edit workflow"
          className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          title="Delete workflow"
          className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <KebabMenu
          items={[
            {
              label: 'Rename',
              icon: <Pencil className="h-3 w-3" />,
              onSelect: () => setRenameOpen(true),
            },
            {
              label: 'Duplicate',
              icon: <Copy className="h-3 w-3" />,
              action: 'duplicatePipeline',
            },
          ]}
          payload={{ id: pipeline.id }}
        />
      </div>

      {hasDagShape(pipeline) ? (
        <DagFlow
          pipeline={pipeline}
          agents={agents}
          dragSrc={dragSrc}
          dragOver={dragOver}
          onDragSrc={setDragSrc}
          onDragOver={setDragOver}
          onAppend={() => { setParallelToAgent(null); setPickerOpen(true); }}
          onAddParallel={(agent) => { setParallelToAgent(agent); setPickerOpen(true); }}
        />
      ) : (
        <div className="flex items-center gap-1 overflow-x-auto py-3">
          {pipeline.steps.map((step, i) => (
            <FlowNode
              key={`${pipeline.id}-${i}-${step.agent}`}
              step={step}
              idx={i}
              total={total}
              pipelineId={pipeline.id}
              agents={agents}
              onAddParallel={() => { setParallelToAgent(step.agent); setPickerOpen(true); }}
              isDragging={dragSrc === i}
              isDragOver={dragOver === i && dragSrc !== null && dragSrc !== i}
              onDragStart={() => setDragSrc(i)}
              onDragEnd={() => {
                setDragSrc(null);
                setDragOver(null);
              }}
              onDragEnter={() => {
                if (dragSrc !== null && dragSrc !== i) setDragOver(i);
              }}
              onDrop={() => {
                if (dragSrc !== null && dragSrc !== i) {
                  postMessage({
                    type: 'reorderStep',
                    pipelineId: pipeline.id,
                    fromIdx: dragSrc,
                    toIdx: i,
                  });
                }
                setDragSrc(null);
                setDragOver(null);
              }}
            />
          ))}
          <button
            type="button"
            onClick={() => { setParallelToAgent(null); setPickerOpen(true); }}
            title="Append a step to this workflow"
            className="ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-dashed border-primary/40 bg-primary/5 text-primary transition-all hover:scale-110 hover:border-primary/70 hover:border-solid hover:bg-primary/15"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}

      {deleteOpen && (
        <ConfirmModal
          title="Delete workflow"
          danger
          confirmLabel="Delete"
          message={
            pipeline.builtin ? (
              <>
                Delete workflow <span className="font-mono">{pipeline.id}</span>?{' '}
                This removes its agents, skills, and slash commands from{' '}
                <span className="font-mono">workspace.yaml</span>, deletes the{' '}
                <span className="font-mono">.claude/commands/</span> files, and uninstalls
                the agent + skill files from <span className="font-mono">~/.claude/</span>.
                Existing runs are kept.
              </>
            ) : (
              <>
                Delete workflow <span className="font-mono">{pipeline.id}</span> from{' '}
                <span className="font-mono">workspace.yaml</span>? Existing runs are kept.
              </>
            )
          }
          onConfirm={() =>
            postMessage({ type: 'deletePipeline', id: pipeline.id, confirmed: true })
          }
          onClose={() => setDeleteOpen(false)}
        />
      )}
      {pickerOpen && (
        <StepPickerModal
          pipelineId={pipeline.id}
          agents={agents}
          existingAgentIds={pipeline.steps.map((s) => s.agent)}
          existingStepNames={pipeline.steps.map((s) => s.name ?? s.agent)}
          onPick={(agentId, stepName) => {
            if (parallelToAgent) {
              postMessage({
                type: 'addParallelStep',
                pipelineId: pipeline.id,
                parallelToAgent,
                agentId,
                stepName,
              });
            } else {
              postMessage({ type: 'addStepToPipeline', pipelineId: pipeline.id, agentId, stepName });
            }
          }}
          onClose={() => { setPickerOpen(false); setParallelToAgent(null); }}
        />
      )}
      {runOpen && (
        <StartRunModal
          pipelines={[
            {
              id: pipeline.id,
              stepCount: pipeline.steps.length,
              onFailure: pipeline.on_failure,
            },
          ]}
          preselectedPipelineId={pipeline.id}
          existingRunIds={runIds}
          onStart={(pipelineId, runId) =>
            postMessage({ type: 'startRunInline', pipelineId, runId })
          }
          onClose={() => setRunOpen(false)}
        />
      )}
      {editOpen && (
        <PipelineModal
          mode="edit"
          agents={agents}
          existingPipelineIds={[]}
          initial={initialDraft}
          onSubmit={(draft) =>
            postMessage({ type: 'editPipelineInline', id: pipeline.id, draft })
          }
          onClose={() => setEditOpen(false)}
        />
      )}
      {renameOpen && (
        <RenameModal
          kind="workflow"
          currentId={pipeline.id}
          existingIds={allPipelineIds}
          onRename={(newId) =>
            postMessage({ type: 'renamePipeline', id: pipeline.id, newId })
          }
          onClose={() => setRenameOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * True when at least one step declares a `depends_on` edge — caller renders
 * the workflow as a DAG instead of the linear arrow chain.
 */
function hasDagShape(pipeline: PipelineSummary): boolean {
  return pipeline.steps.some((s) => (s.depends_on?.length ?? 0) > 0);
}

/**
 * Strip the `aidlc-` namespace prefix when displaying built-in identifiers
 * inside the cramped DAG node chips. The full id stays in the surrounding
 * `title=` tooltip so users can still see the resolved workspace.yaml id.
 */
function stripAidlcPrefix(id: string): string {
  return id.startsWith('aidlc-') ? id.slice('aidlc-'.length) : id;
}

/**
 * DAG renderer: steps are bucketed into columns by longest path from any
 * root, then within a column stacked vertically. Connectors are drawn as
 * thin lines between adjacent columns so a parallel branch is visually
 * obvious (Tech Design || Test Plan in the parallel SDLC workflow).
 *
 * Drag/drop and the per-step gear / up / down / delete controls behave
 * like the linear flow (they edit `pipeline.steps[]` array order or its
 * step config). Drag/drop reorders the array index — visual column
 * position is driven by `depends_on`, so dragging changes serialization
 * order but not the DAG layout itself.
 */
function DagFlow({
  pipeline,
  agents,
  dragSrc,
  dragOver,
  onDragSrc,
  onDragOver,
  onAppend,
  onAddParallel,
}: {
  pipeline: PipelineSummary;
  agents: AgentSummary[];
  dragSrc: number | null;
  dragOver: number | null;
  onDragSrc: (idx: number | null) => void;
  onDragOver: (idx: number | null) => void;
  onAppend: () => void;
  onAddParallel: (agent: string) => void;
}) {
  const levels = computeDagLevels(pipeline);
  const total = pipeline.steps.length;
  // Build display labels keyed by step idx: single occupant of a level →
  // bare number ("3"); multiple parallel occupants → "<level>.<n>" so the
  // parallel relationship is readable at a glance ("2.1", "2.2").
  const labelByIdx = new Map<number, string>();
  levels.forEach((column, colIdx) => {
    const levelNum = colIdx + 1;
    if (column.length === 1) {
      labelByIdx.set(column[0].idx, String(levelNum));
    } else {
      column.forEach((entry, subIdx) => {
        labelByIdx.set(entry.idx, `${levelNum}.${subIdx + 1}`);
      });
    }
  });

  return (
    <div className="overflow-x-auto py-3">
      <div className="flex min-w-max items-stretch gap-3">
        {levels.map((column, colIdx) => (
          <div key={colIdx} className="flex items-stretch">
            <div className="flex flex-col gap-2 self-center">
              {column.map(({ step, idx }) => (
                <DagNode
                  key={`${pipeline.id}-${idx}`}
                  step={step}
                  idx={idx}
                  label={labelByIdx.get(idx) ?? String(idx + 1)}
                  total={total}
                  pipelineId={pipeline.id}
                  agents={agents}
                  onAddParallel={() => onAddParallel(step.agent)}
                  isDragging={dragSrc === idx}
                  isDragOver={dragOver === idx && dragSrc !== null && dragSrc !== idx}
                  onDragStart={() => onDragSrc(idx)}
                  onDragEnd={() => { onDragSrc(null); onDragOver(null); }}
                  onDragEnter={() => {
                    if (dragSrc !== null && dragSrc !== idx) { onDragOver(idx); }
                  }}
                  onDrop={() => {
                    if (dragSrc !== null && dragSrc !== idx) {
                      postMessage({
                        type: 'reorderStep',
                        pipelineId: pipeline.id,
                        fromIdx: dragSrc,
                        toIdx: idx,
                      });
                    }
                    onDragSrc(null); onDragOver(null);
                  }}
                />
              ))}
            </div>
            {colIdx < levels.length - 1 && (
              <div className="flex flex-col justify-center px-1">
                <div className="h-0.5 w-5 rounded-full bg-gradient-to-r from-primary/50 to-primary/20" />
              </div>
            )}
          </div>
        ))}
        <div className="flex flex-col justify-center pl-2">
          <button
            type="button"
            onClick={onAppend}
            title="Append a step to this workflow"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-dashed border-primary/40 bg-primary/5 text-primary transition-all hover:scale-110 hover:border-primary/70 hover:border-solid hover:bg-primary/15"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Assign each step to a "level" — its longest dependency chain length from
 * any root. Steps in the same level have no dependency relationship and
 * render side-by-side. Steps with edges pointing to missing agent ids
 * (orphaned) get level 0 as a fallback so they still show up.
 */
function computeDagLevels(pipeline: PipelineSummary): Array<Array<{ step: PipelineStepSummary; idx: number }>> {
  // Key the DAG by step `name` (phase id) when available — multiple
  // steps can share the same `agent` (e.g. three QA phases all backed
  // by `aidlc-qa`), so keying by agent collapses them onto one node
  // and breaks `depends_on` lookups that reference phase ids.
  const dagId = (s: PipelineStepSummary): string => s.name ?? s.agent;
  const stepById = new Map<string, { step: PipelineStepSummary; idx: number }>();
  pipeline.steps.forEach((step, idx) => { stepById.set(dagId(step), { step, idx }); });

  const memo = new Map<string, number>();
  const computing = new Set<string>();
  const levelOf = (id: string): number => {
    if (memo.has(id)) { return memo.get(id)!; }
    if (computing.has(id)) { return 0; } // cycle — treat as root
    computing.add(id);
    const entry = stepById.get(id);
    const deps = entry?.step.depends_on?.filter((d) => stepById.has(d)) ?? [];
    const level = deps.length === 0 ? 0 : Math.max(...deps.map(levelOf)) + 1;
    computing.delete(id);
    memo.set(id, level);
    return level;
  };

  const buckets: Array<Array<{ step: PipelineStepSummary; idx: number }>> = [];
  pipeline.steps.forEach((step, idx) => {
    const lvl = levelOf(dagId(step));
    if (!buckets[lvl]) { buckets[lvl] = []; }
    buckets[lvl].push({ step, idx });
  });
  return buckets;
}

/**
 * DAG-mode step node. Same controls as `FlowNode` (settings / up / down /
 * delete / drag handles) but rendered without the trailing arrow connector
 * — connectors in DAG mode are drawn between columns by `DagFlow`.
 */
function DagNode({
  step,
  idx,
  label,
  total,
  pipelineId,
  agents,
  onAddParallel,
  isDragging,
  isDragOver,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDrop,
}: {
  step: PipelineStepSummary;
  idx: number;
  /** Display number — bare level for single steps ("3"), `<level>.<n>` for parallels ("2.1"). */
  label: string;
  total: number;
  pipelineId: string;
  agents: AgentSummary[];
  onAddParallel: () => void;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragEnter: () => void;
  onDrop: () => void;
}) {
  const [configOpen, setConfigOpen] = useState(false);
  return (
    <>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        onDragEnter={onDragEnter}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDrop();
        }}
        className={cn(
          'group relative flex w-[200px] cursor-grab flex-col gap-1.5 rounded-lg border-2 bg-gradient-to-br from-primary/5 to-transparent p-2 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:from-primary/10 active:cursor-grabbing',
          step.enabled ? 'border-primary/25' : 'border-dashed border-primary/20 opacity-60',
          isDragging && 'opacity-35',
          isDragOver && '-translate-y-0.5 border-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.35)]',
        )}
      >
        <div className="flex items-start gap-2 pr-1">
          <span className="mt-px shrink-0 font-mono text-[9.5px] text-muted-foreground">
            {label}
          </span>
          <span
            className="flex-1 break-words font-mono text-[11.5px] font-bold leading-tight text-primary"
            title={step.name && step.name !== step.agent ? `phase ${step.name} · agent ${step.agent}` : step.agent}
          >
            {/* Built-in pipelines split phase ↔ persona: show the phase
                label primarily (e.g. `plan`), keep the persona id in the
                tooltip + the meta row below the node. */}
            {step.name ?? step.agent}
          </span>
        </div>
        {/* Hover toolbar — absolute overlay so it doesn't steal layout
            width from the step label when hidden (label was truncating to
            single chars because `opacity-0` icons were still reserving
            space). Sits flush with the top-right corner of the card. */}
        <div className="absolute right-1 top-1 z-10 flex gap-0.5 rounded bg-card/95 px-0.5 py-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
          <NodeIcon
            title={`Add a step in parallel with ${step.name ?? step.agent} (same DAG level)`}
            onClick={onAddParallel}
          >
            <Plus className="h-2.5 w-2.5" />
          </NodeIcon>
          <NodeIcon
            title="Configure step (human review, auto review, requires, produces)"
            onClick={() => setConfigOpen(true)}
          >
            <Settings className="h-2.5 w-2.5" />
          </NodeIcon>
          {idx > 0 && (
            <NodeIcon
              title="Move up (changes array order; DAG layout is driven by depends_on)"
              onClick={() =>
                postMessage({ type: 'reorderStep', pipelineId, fromIdx: idx, toIdx: idx - 1 })
              }
            >
              <ArrowUp className="h-2.5 w-2.5" />
            </NodeIcon>
          )}
          {idx < total - 1 && (
            <NodeIcon
              title="Move down (changes array order; DAG layout is driven by depends_on)"
              onClick={() =>
                postMessage({ type: 'reorderStep', pipelineId, fromIdx: idx, toIdx: idx + 1 })
              }
            >
              <ArrowDown className="h-2.5 w-2.5" />
            </NodeIcon>
          )}
          <NodeIcon
            title="Remove from workflow"
            danger
            onClick={() => postMessage({ type: 'deleteStep', pipelineId, idx })}
          >
            <X className="h-2.5 w-2.5" />
          </NodeIcon>
        </div>
        {(step.agent || (step.skills && step.skills.length > 0) || step.auto_review || step.human_review) && (
          <div className="flex flex-wrap gap-1">
            {step.agent && (
              <Badge title={`Agent (persona) — ${step.agent}`}>
                <span className="opacity-60">agent:</span>&nbsp;{stripAidlcPrefix(step.agent)}
              </Badge>
            )}
            {step.skills?.filter((s: string) => s !== step.name && s !== `aidlc-${step.name}`).map((s: string) => (
              <Badge key={s} title={`Skill — ${s}`}>
                <span className="opacity-60">skill:</span>&nbsp;{stripAidlcPrefix(s)}
              </Badge>
            ))}
            {step.auto_review && (
              <Badge
                color="info"
                title={`auto_review: true${step.auto_review_runner ? ` — runs ${step.auto_review_runner}` : ''}`}
              >
                <Bot className="mr-0.5 inline h-2.5 w-2.5" /> auto
              </Badge>
            )}
            {step.human_review && (
              <Badge
                color="warning"
                title="human_review: true — pauses for approve/reject after the step is marked done"
              >
                <User className="mr-0.5 inline h-2.5 w-2.5" /> human
              </Badge>
            )}
          </div>
        )}
      </div>
      {configOpen && (
        <StepConfigModal
          pipelineId={pipelineId}
          idx={idx}
          step={step}
          agents={agents}
          onSubmit={(config) =>
            postMessage({ type: 'editStepConfig', pipelineId, idx, config })
          }
          onClose={() => setConfigOpen(false)}
        />
      )}
    </>
  );
}

function FlowNode({
  step,
  idx,
  total,
  pipelineId,
  agents,
  onAddParallel,
  isDragging,
  isDragOver,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDrop,
}: {
  step: PipelineStepSummary;
  idx: number;
  total: number;
  pipelineId: string;
  agents: AgentSummary[];
  /** Opens the step picker; result is added in parallel with this step. */
  onAddParallel: () => void;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragEnter: () => void;
  onDrop: () => void;
}) {
  const requires = step.requires.length;
  const produces = step.produces.length;
  const [configOpen, setConfigOpen] = useState(false);
  return (
    <>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        onDragEnter={onDragEnter}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDrop();
        }}
        className={cn(
          'group relative flex min-w-[150px] max-w-[240px] shrink-0 cursor-grab flex-col gap-1.5 rounded-lg border-2 bg-gradient-to-br from-primary/5 to-transparent p-2 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:from-primary/10 active:cursor-grabbing',
          step.enabled
            ? 'border-primary/25'
            : 'border-dashed border-primary/20 opacity-60',
          isDragging && 'opacity-35',
          isDragOver && '-translate-y-0.5 border-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.35)]',
        )}
      >
        <div className="flex items-center gap-2">
          <span className="w-3.5 shrink-0 font-mono text-[9.5px] text-muted-foreground">
            {idx + 1}
          </span>
          <span
            className="flex-1 truncate font-mono text-[11.5px] font-bold text-primary"
            title={step.name && step.name !== step.agent ? `phase ${step.name} · agent ${step.agent}` : step.agent}
          >
            {step.name ?? step.agent}
          </span>
          <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <NodeIcon
              title={`Add a step in parallel with ${step.name ?? step.agent} (turns the workflow into a DAG)`}
              onClick={onAddParallel}
            >
              <Plus className="h-2.5 w-2.5" />
            </NodeIcon>
            <NodeIcon
              title="Configure step (human review, auto review, requires, produces)"
              onClick={() => setConfigOpen(true)}
            >
              <Settings className="h-2.5 w-2.5" />
            </NodeIcon>
            {idx > 0 && (
              <NodeIcon
                title="Move up"
                onClick={() =>
                  postMessage({ type: 'reorderStep', pipelineId, fromIdx: idx, toIdx: idx - 1 })
                }
              >
                <ArrowUp className="h-2.5 w-2.5" />
              </NodeIcon>
            )}
            {idx < total - 1 && (
              <NodeIcon
                title="Move down"
                onClick={() =>
                  postMessage({ type: 'reorderStep', pipelineId, fromIdx: idx, toIdx: idx + 1 })
                }
              >
                <ArrowDown className="h-2.5 w-2.5" />
              </NodeIcon>
            )}
            <NodeIcon
              title="Remove from workflow"
              danger
              onClick={() => postMessage({ type: 'deleteStep', pipelineId, idx })}
            >
              <X className="h-2.5 w-2.5" />
            </NodeIcon>
          </div>
        </div>

        {(step.agent || (step.skills && step.skills.length > 0) || requires > 0 || produces > 0 || step.auto_review || step.human_review || !step.enabled) && (
          <div className="flex flex-wrap gap-1">
            {step.agent && (
              <Badge title={`Agent (persona) — ${step.agent}`}>
                <span className="opacity-60">agent:</span>&nbsp;{stripAidlcPrefix(step.agent)}
              </Badge>
            )}
            {step.skills?.filter((s: string) => s !== step.name && s !== `aidlc-${step.name}`).map((s: string) => (
              <Badge key={s} title={`Skill — ${s}`}>
                <span className="opacity-60">skill:</span>&nbsp;{stripAidlcPrefix(s)}
              </Badge>
            ))}
            {!step.enabled && (
              <Badge title="enabled: false — runner skips this step">disabled</Badge>
            )}
            {requires > 0 && (
              <Badge title={`${requires} upstream artifact path(s) the step is gated on`}>
                ⤴ {requires} req
              </Badge>
            )}
            {produces > 0 && (
              <Badge title={`${produces} artifact path(s) this step writes`}>
                ⤵ {produces} out
              </Badge>
            )}
            {step.auto_review && (
              <Badge
                color="info"
                title={`auto_review: true${step.auto_review_runner ? ` — runs ${step.auto_review_runner}` : ''}`}
              >
                <Bot className="mr-0.5 inline h-2.5 w-2.5" /> auto
              </Badge>
            )}
            {step.human_review && (
              <Badge
                color="warning"
                title="human_review: true — pauses for approve/reject after the step is marked done"
              >
                <User className="mr-0.5 inline h-2.5 w-2.5" /> human
              </Badge>
            )}
          </div>
        )}
      </div>
      {idx < total - 1 && (
        <div className="relative h-0.5 w-6 shrink-0 rounded-full bg-gradient-to-r from-primary/55 to-primary/20">
          <span
            aria-hidden
            className="absolute -right-px top-1/2 -translate-y-1/2 border-y-[5px] border-l-[7px] border-y-transparent border-l-primary/45"
          />
        </div>
      )}
      {configOpen && (
        <StepConfigModal
          pipelineId={pipelineId}
          idx={idx}
          step={step}
          agents={agents}
          onSubmit={(config) =>
            postMessage({ type: 'editStepConfig', pipelineId, idx, config })
          }
          onClose={() => setConfigOpen(false)}
        />
      )}
    </>
  );
}

function NodeIcon({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'grid h-5 w-5 place-items-center rounded text-muted-foreground transition-colors',
        danger
          ? 'hover:bg-destructive/15 hover:text-destructive'
          : 'hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function Badge({
  children,
  title,
  color,
}: {
  children: React.ReactNode;
  title: string;
  color?: 'info' | 'warning';
}) {
  return (
    <span
      title={title}
      className={cn(
        'whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[9.5px]',
        color === 'info' && 'border-info/30 bg-info/10 text-info',
        color === 'warning' && 'border-warning/30 bg-warning/10 text-warning',
        !color && 'border-border bg-secondary text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}
