import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentSummary } from '@/lib/types';
import { Modal, ModalFooter, ModalCancelButton, ModalConfirmButton } from './Modal';

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export interface PipelineDraft {
  id: string;
  on_failure: 'stop' | 'continue';
  steps: PipelineStepDraft[];
}

export interface PipelineStepDraft {
  agent: string;
  /** Phase id / slash command name — displayed as the step's primary label. */
  name?: string;
  /** Skills scoped to this step. Subset of the agent's `skills:` array. */
  skills?: string[];
  human_review: boolean;
  auto_review: boolean;
  auto_review_runner?: string;
  /** Phase ids (step.name) this step waits for in DAG mode. Carried verbatim
   *  through the modal so a save round-trip doesn't wipe the DAG shape. The
   *  modal doesn't let the user edit deps yet — the DAG view on the card
   *  is where parallel structure changes happen. */
  depends_on?: string[];
}

interface Props {
  mode: 'add' | 'edit';
  agents: AgentSummary[];
  existingPipelineIds: string[];
  /** Pre-filled values when mode === 'edit'. */
  initial?: PipelineDraft;
  onSubmit: (draft: PipelineDraft) => void;
  onClose: () => void;
}

export function PipelineModal({
  mode,
  agents,
  existingPipelineIds,
  initial,
  onSubmit,
  onClose,
}: Props) {
  const [id, setId] = useState(initial?.id ?? '');
  const [onFailure, setOnFailure] = useState<'stop' | 'continue'>(
    initial?.on_failure ?? 'stop',
  );
  const [steps, setSteps] = useState<PipelineStepDraft[]>(initial?.steps ?? []);
  const idInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Edit mode: id is locked, no obvious target — let the user click. Add mode: focus id.
    if (mode === 'add') {
      idInputRef.current?.focus();
    }
  }, [mode]);

  const trimmedId = id.trim();
  const idError = useMemo(() => {
    // In edit mode the id is locked — skip validation since the user can't change it.
    if (mode === 'edit') { return null; }
    if (!trimmedId) { return 'Pipeline id is required'; }
    if (!ID_PATTERN.test(trimmedId)) {
      return 'Letters, digits, dot, dash, underscore — must start with letter/digit';
    }
    if (existingPipelineIds.includes(trimmedId)) {
      return `Pipeline "${trimmedId}" already exists`;
    }
    return null;
  }, [mode, trimmedId, existingPipelineIds]);

  const stepsError =
    steps.length < 2 ? 'Pick at least 2 agents (a single-step pipeline is just an agent)' : null;

  // DAG mode = at least one step declares `depends_on`. Up/down arrows are
  // hidden in this mode because array order doesn't drive the visual
  // layout — `depends_on` does, and the DAG view on the card is where
  // parallel structure gets edited.
  const isDag = steps.some((s) => (s.depends_on?.length ?? 0) > 0);
  const runnerError = steps.find((s) => s.auto_review && !(s.auto_review_runner ?? '').trim())
    ? 'Auto-review steps need a runner path'
    : null;

  const error = idError || stepsError || runnerError;

  const submit = () => {
    if (error) { return; }
    onSubmit({
      id: trimmedId,
      on_failure: onFailure,
      steps: steps.map((s) => {
        const name = (s.name ?? '').trim();
        return {
          agent: s.agent,
          name: name || undefined,
          skills: s.skills && s.skills.length > 0 ? s.skills : undefined,
          human_review: s.human_review,
          auto_review: s.auto_review,
          auto_review_runner: s.auto_review ? (s.auto_review_runner ?? '').trim() : undefined,
          depends_on: s.depends_on && s.depends_on.length > 0 ? s.depends_on : undefined,
        };
      }),
    });
    onClose();
  };

  const addAgent = (agentId: string) => {
    setSteps((cur) => [...cur, { agent: agentId, human_review: false, auto_review: false }]);
  };
  const removeAt = (i: number) =>
    setSteps((cur) => cur.filter((_, j) => j !== i));
  const moveUp = (i: number) =>
    setSteps((cur) => {
      if (i <= 0) { return cur; }
      const next = cur.slice();
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  const moveDown = (i: number) =>
    setSteps((cur) => {
      if (i >= cur.length - 1) { return cur; }
      const next = cur.slice();
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  const updateAt = (i: number, patch: Partial<PipelineStepDraft>) =>
    setSteps((cur) => cur.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const isEdit = mode === 'edit';
  const title = isEdit ? 'Edit pipeline' : 'Add pipeline';
  const submitLabel = isEdit ? 'Save pipeline' : 'Create pipeline';

  return (
    <Modal title={title} maxWidth="max-w-2xl" onClose={onClose} onSubmit={submit}>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
            Pipeline id
          </label>
          {isEdit ? (
            <div
              className="rounded-md border border-border bg-secondary/40 px-2.5 py-2 font-mono text-[12px] text-foreground/80"
              title="ID is locked in edit mode — active pipeline runs reference it. Delete and recreate to rename."
            >
              {id}
            </div>
          ) : (
            <input
              ref={idInputRef}
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="e.g. full-migration"
              spellCheck={false}
              className="w-full rounded-md border border-border bg-input/50 px-2.5 py-2 font-mono text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          )}
          {!isEdit && idError && trimmedId && (
            <div className="mt-1 text-[10.5px] text-destructive">{idError}</div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
            On failure
          </label>
          <div className="flex gap-2">
            <RadioPill
              checked={onFailure === 'stop'}
              onClick={() => setOnFailure('stop')}
              label="stop"
              hint="Halt on first failure (default)"
            />
            <RadioPill
              checked={onFailure === 'continue'}
              onClick={() => setOnFailure('continue')}
              label="continue"
              hint="Run remaining agents even if one fails"
            />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
              Selected steps
            </span>
            <span className="text-[10px] text-muted-foreground">
              {steps.length} step{steps.length === 1 ? '' : 's'}
            </span>
          </div>
          {steps.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
              Pick agents below to add steps in execution order.
            </div>
          ) : (
            <div className="space-y-1.5">
              {steps.map((s, i) => (
                <StepRow
                  key={`${s.agent}-${i}`}
                  step={s}
                  idx={i}
                  total={steps.length}
                  agents={agents}
                  isDag={isDag}
                  siblingNodeIds={steps
                    .map((o) => (o.name ?? '').trim() || o.agent)
                    .filter((_, j) => j !== i)}
                  onRemove={() => removeAt(i)}
                  onMoveUp={() => moveUp(i)}
                  onMoveDown={() => moveDown(i)}
                  onChange={(patch) => updateAt(i, patch)}
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
            Available agents
          </div>
          {agents.length === 0 ? (
            <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-[11px] text-muted-foreground">
              No agents in workspace.yaml. Add agents first.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {agents.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => addAgent(a.id)}
                  title={a.description ?? ''}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/50 px-2 py-1 font-mono text-[11px] text-foreground hover:border-primary/60 hover:bg-primary/10 hover:text-primary"
                >
                  <Plus className="h-2.5 w-2.5" /> {a.id}
                </button>
              ))}
            </div>
          )}
          <p className="mt-1 text-[10px] italic text-muted-foreground">
            Click to add. Same agent can appear more than once.
          </p>
        </div>

        {error && steps.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[10.5px] text-destructive">
            {error}
          </div>
        )}
      </div>

      <ModalFooter>
        <ModalCancelButton onClick={onClose} />
        <ModalConfirmButton onClick={submit} label={submitLabel} disabled={!!error} />
      </ModalFooter>
    </Modal>
  );
}

function RadioPill({
  checked,
  onClick,
  label,
  hint,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={cn(
        'flex flex-1 items-baseline gap-1.5 rounded-md border px-3 py-2',
        checked
          ? 'border-primary/60 bg-primary/10'
          : 'border-border bg-transparent hover:border-border/80 hover:bg-accent/40',
      )}
    >
      <div
        className={cn(
          'mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border-2',
          checked ? 'border-primary' : 'border-muted-foreground/40',
        )}
      >
        {checked && <div className="h-1.5 w-1.5 rounded-full bg-primary" />}
      </div>
      <div className="text-left">
        <div className="font-mono text-[12px] font-semibold text-foreground">{label}</div>
        <div className="text-[10px] text-muted-foreground">{hint}</div>
      </div>
    </button>
  );
}

function StepRow({
  step,
  idx,
  total,
  agents,
  isDag,
  siblingNodeIds,
  onRemove,
  onMoveUp,
  onMoveDown,
  onChange,
}: {
  step: PipelineStepDraft;
  idx: number;
  total: number;
  agents: AgentSummary[];
  /** When true, the pipeline is a DAG — array order doesn't drive layout,
   *  so up/down arrows are hidden and parallel relationships are surfaced
   *  via a `∥` badge instead. */
  isDag: boolean;
  /** Node ids (name ?? agent) of the other steps — candidates for this
   *  step's `depends_on` (the "Runs after" picker). */
  siblingNodeIds: string[];
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onChange: (patch: Partial<PipelineStepDraft>) => void;
}) {
  // Resolve the agent record so we can surface its model / skill alongside
  // the picker. Falling back to a stub avoids a flicker if the agent was
  // just renamed/deleted in another modal.
  const agentRecord = agents.find((a) => a.id === step.agent);
  const agentSkillIds = agentRecord?.skills ?? (agentRecord?.skill ? [agentRecord.skill] : []);
  const pickedSkills = step.skills ?? [];
  const toggleSkill = (skillId: string) => {
    const next = pickedSkills.includes(skillId)
      ? pickedSkills.filter((s) => s !== skillId)
      : [...pickedSkills, skillId];
    onChange({ skills: next });
  };

  return (
    <div className="rounded-md border border-border bg-secondary/30 p-2">
      <div className="flex items-center gap-2">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-primary/15 font-mono text-[10px] font-bold text-primary">
          {idx + 1}
        </span>
        <input
          type="text"
          value={step.name ?? ''}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="step name (e.g. plan)"
          spellCheck={false}
          title="Step name — also used as the slash command (`/<name>`) and display label."
          className="w-32 rounded-md border border-border bg-card px-2 py-1 font-mono text-[11.5px] font-semibold text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none"
        />
        <select
          value={step.agent}
          onChange={(e) => onChange({ agent: e.target.value, skills: [] })}
          title="Which agent (persona) runs this step"
          className="flex-1 truncate rounded-md border border-border bg-card px-2 py-1 font-mono text-[12px] text-foreground focus:border-primary focus:outline-none"
        >
          {agents.length === 0 && <option value={step.agent}>{step.agent}</option>}
          {!agents.some((a) => a.id === step.agent) && (
            <option value={step.agent}>{step.agent} (missing)</option>
          )}
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.id}</option>
          ))}
        </select>
        <CheckboxPill
          checked={step.human_review}
          onChange={(v) => onChange({ human_review: v })}
          label="Human"
        />
        <CheckboxPill
          checked={step.auto_review}
          onChange={(v) =>
            onChange({
              auto_review: v,
              auto_review_runner:
                v && !step.auto_review_runner
                  ? `.aidlc/scripts/validate-${step.agent}.mjs`
                  : step.auto_review_runner,
            })
          }
          label="Auto"
        />
        {!isDag && (
          <>
            <button
              type="button"
              onClick={onMoveUp}
              disabled={idx === 0}
              title="Move up"
              className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ArrowUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={idx === total - 1}
              title="Move down"
              className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ArrowDown className="h-3 w-3" />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onRemove}
          title="Remove from pipeline"
          className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {/* Runs-after picker — defines the parallel (DAG) structure right here.
          Each step it depends on pushes it one column later; steps that share
          the same dependencies render side-by-side (parallel). Pick nothing to
          make it a starting step. As soon as any step has a dependency the
          pipeline switches to DAG mode and the up/down arrows give way to this. */}
      {siblingNodeIds.length > 0 && (
        <div className="ml-7 mt-1.5">
          <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span className="font-mono opacity-70">∥</span> Runs after
            <span className="font-normal normal-case tracking-normal text-muted-foreground/80">
              (leave empty = parallel from the start)
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {siblingNodeIds.map((dep) => {
              const checked = (step.depends_on ?? []).includes(dep);
              return (
                <button
                  key={dep}
                  type="button"
                  onClick={() => {
                    const cur = step.depends_on ?? [];
                    const next = checked ? cur.filter((d) => d !== dep) : [...cur, dep];
                    onChange({ depends_on: next });
                  }}
                  className={cn(
                    'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10.5px] transition-colors',
                    checked
                      ? 'border-primary/60 bg-primary/15 text-primary'
                      : 'border-border bg-transparent text-foreground hover:border-border/80 hover:bg-accent/40',
                  )}
                >
                  <span
                    className={cn(
                      'inline-grid h-2.5 w-2.5 place-items-center rounded-sm border',
                      checked ? 'border-primary bg-primary' : 'border-muted-foreground/40',
                    )}
                  >
                    {checked && <span className="h-1 w-1 rounded-[1px] bg-primary-foreground" />}
                  </span>
                  {dep}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {/* Skill picker — multi-select scoped to whatever the agent can use.
          Empty list means "agent has no declared skills"; the user can
          still leave the row blank to inherit the agent's full set at
          runtime. */}
      {agentSkillIds.length > 0 && (
        <div className="ml-7 mt-1.5">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Skills <span className="font-normal normal-case tracking-normal text-muted-foreground/80">(pick which the step makes available)</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {agentSkillIds.map((s) => {
              const checked = pickedSkills.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSkill(s)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10.5px] transition-colors',
                    checked
                      ? 'border-primary/60 bg-primary/15 text-primary'
                      : 'border-border bg-transparent text-foreground hover:border-border/80 hover:bg-accent/40',
                  )}
                >
                  <span
                    className={cn(
                      'inline-grid h-2.5 w-2.5 place-items-center rounded-sm border',
                      checked ? 'border-primary bg-primary' : 'border-muted-foreground/40',
                    )}
                  >
                    {checked && <span className="h-1 w-1 rounded-[1px] bg-primary-foreground" />}
                  </span>
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {/* Model / capability summary so the user sees what the
          selected agent actually does without having to leave the modal. */}
      {agentRecord && (agentRecord.model || (agentRecord.integrations && agentRecord.integrations.length > 0) || agentRecord.description) && (
        <div className="ml-7 mt-1.5 space-y-1">
          {agentRecord.description && (
            <div className="text-[10.5px] text-muted-foreground">{agentRecord.description}</div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {agentRecord.model && (
              <span className="inline-flex items-center rounded bg-secondary px-1.5 py-0.5 font-mono text-[9.5px] text-secondary-foreground">
                {agentRecord.model}
              </span>
            )}
            {agentRecord.integrations?.map((c) => (
              <span
                key={c}
                className="inline-flex items-center rounded bg-accent px-1.5 py-0.5 text-[9.5px] text-accent-foreground"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
      {step.auto_review && (
        <div className="ml-7 mt-1.5">
          <input
            type="text"
            value={step.auto_review_runner ?? ''}
            onChange={(e) => onChange({ auto_review_runner: e.target.value })}
            placeholder={`.aidlc/scripts/validate-${step.agent}.mjs`}
            spellCheck={false}
            className="w-full rounded border border-border bg-input/50 px-2 py-1 font-mono text-[10.5px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
      )}
    </div>
  );
}

function CheckboxPill({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider transition-colors',
        checked
          ? 'border-primary/50 bg-primary/15 text-primary'
          : 'border-border bg-transparent text-muted-foreground hover:border-border/80 hover:bg-accent/40',
      )}
    >
      <span
        className={cn(
          'inline-grid h-2.5 w-2.5 place-items-center rounded-sm border',
          checked ? 'border-primary bg-primary' : 'border-muted-foreground/40',
        )}
      >
        {checked && <span className="h-1 w-1 rounded-[1px] bg-primary-foreground" />}
      </span>
      {label}
    </button>
  );
}
