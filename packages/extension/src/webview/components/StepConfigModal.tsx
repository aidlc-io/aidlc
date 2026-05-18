import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { AgentSummary, PipelineStepSummary } from '@/lib/types';
import { Modal, ModalFooter, ModalCancelButton, ModalConfirmButton } from './Modal';

export interface StepConfigDraft {
  enabled: boolean;
  requires: string[];
  produces: string[];
  /** Subset of the agent's `skills:` array — which skills this step makes
   *  available to the persona. Omitted when no skills are picked. */
  skills: string[];
  human_review: boolean;
  auto_review: boolean;
  auto_review_runner?: string;
}

interface Props {
  pipelineId: string;
  idx: number;
  step: PipelineStepSummary;
  /** Agents available in the workspace — used to scope the skill picker to
   *  whatever the step's agent (persona) declares it can do. */
  agents: AgentSummary[];
  onSubmit: (config: StepConfigDraft) => void;
  onClose: () => void;
}

export function StepConfigModal({ pipelineId, idx, step, agents, onSubmit, onClose }: Props) {
  const [enabled, setEnabled] = useState(step.enabled);
  const [requires, setRequires] = useState((step.requires ?? []).join('\n'));
  const [produces, setProduces] = useState((step.produces ?? []).join('\n'));
  const [humanReview, setHumanReview] = useState(step.human_review);
  const [autoReview, setAutoReview] = useState(step.auto_review);
  const [runner, setRunner] = useState(step.auto_review_runner ?? '');
  const [pickedSkills, setPickedSkills] = useState<string[]>(step.skills ?? []);
  const firstInputRef = useRef<HTMLTextAreaElement>(null);

  const agentRecord = useMemo(() => agents.find((a) => a.id === step.agent), [agents, step.agent]);
  const agentSkillIds = useMemo(
    () => agentRecord?.skills ?? (agentRecord?.skill ? [agentRecord.skill] : []),
    [agentRecord],
  );
  const toggleSkill = (skillId: string) => {
    setPickedSkills((prev) =>
      prev.includes(skillId) ? prev.filter((s) => s !== skillId) : [...prev, skillId],
    );
  };

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  const splitLines = (s: string): string[] =>
    s
      .split(/[\n,]/)
      .map((x) => x.trim())
      .filter((x) => x.length > 0);

  const runnerError =
    autoReview && !runner.trim() ? 'Required when auto_review is on' : null;
  const canSubmit = !runnerError;

  const submit = () => {
    if (!canSubmit) { return; }
    onSubmit({
      enabled,
      requires: splitLines(requires),
      produces: splitLines(produces),
      skills: pickedSkills,
      human_review: humanReview,
      auto_review: autoReview,
      auto_review_runner: autoReview ? runner.trim() : undefined,
    });
    onClose();
  };

  return (
    <Modal
      title={`Step ${idx + 1} config`}
      subtitle={
        <>
          Pipeline <span className="font-mono text-foreground/80">{pipelineId}</span> ·{' '}
          agent <span className="font-mono text-foreground/80">{step.agent}</span>
        </>
      }
      maxWidth="max-w-xl"
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="space-y-4">
        <Toggle
          checked={enabled}
          onChange={setEnabled}
          label="Enabled"
          help="Step runs as part of the pipeline. When off, the runner skips it but the YAML entry stays."
        />

        <div>
          <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
            Requires <span className="font-normal normal-case tracking-normal">(one path per line, or comma-separated)</span>
          </label>
          <textarea
            ref={firstInputRef}
            value={requires}
            onChange={(e) => setRequires(e.target.value)}
            placeholder="e.g. docs/epics/{epic}/PRD.md"
            rows={2}
            spellCheck={false}
            className="w-full resize-none rounded-md border border-border bg-input/50 px-2.5 py-2 font-mono text-[11.5px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <p className="mt-1 text-[10px] italic text-muted-foreground">
            Upstream artifacts the step is gated on. Use <code className="font-mono">{`{epic}`}</code>{' '}
            for run context.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
            Produces <span className="font-normal normal-case tracking-normal">(one path per line, or comma-separated)</span>
          </label>
          <textarea
            value={produces}
            onChange={(e) => setProduces(e.target.value)}
            placeholder="e.g. docs/epics/{epic}/TECH-DESIGN.md"
            rows={2}
            spellCheck={false}
            className="w-full resize-none rounded-md border border-border bg-input/50 px-2.5 py-2 font-mono text-[11.5px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <p className="mt-1 text-[10px] italic text-muted-foreground">
            Output artifacts the step writes. Existence is validated when the user marks the step done.
          </p>
        </div>

        {/* Skill picker — multi-select scoped to the step's agent. Empty
            list means the agent declares no skills in workspace.yaml — the
            row hides itself so the modal stays compact. */}
        {agentSkillIds.length > 0 && (
          <div>
            <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
              Skills <span className="font-normal normal-case tracking-normal">(pick which skills this step makes available to <span className="font-mono">{step.agent}</span>)</span>
            </label>
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
            <p className="mt-1 text-[10px] italic text-muted-foreground">
              Leave empty to inherit the agent's full skill set at runtime.
            </p>
          </div>
        )}

        <Toggle
          checked={humanReview}
          onChange={setHumanReview}
          label="Human review"
          help="Pause for manual approval after the step is marked done. When off, the step auto-advances."
        />

        <Toggle
          checked={autoReview}
          onChange={setAutoReview}
          label="Auto review"
          help="Run a JS/TS validator after produces validate, before any human gate."
        />

        {autoReview && (
          <div>
            <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
              Auto review runner
            </label>
            <input
              type="text"
              value={runner}
              onChange={(e) => setRunner(e.target.value)}
              placeholder={`.aidlc/scripts/validate-${step.agent}.mjs`}
              spellCheck={false}
              className="w-full rounded-md border border-border bg-input/50 px-2.5 py-2 font-mono text-[11.5px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            {runnerError && (
              <div className="mt-1 text-[10.5px] text-destructive">{runnerError}</div>
            )}
          </div>
        )}
      </div>

      <ModalFooter>
        <ModalCancelButton onClick={onClose} />
        <ModalConfirmButton onClick={submit} label="Save" disabled={!canSubmit} />
      </ModalFooter>
    </Modal>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  help,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  help: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-md border border-border bg-secondary/30 px-3 py-2.5 text-left hover:bg-accent/40"
    >
      <div
        className={cn(
          'mt-0.5 flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors',
          checked ? 'bg-primary' : 'bg-muted',
        )}
      >
        <div
          className={cn(
            'h-3 w-3 rounded-full bg-background transition-transform',
            checked ? 'translate-x-3' : 'translate-x-0',
          )}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-foreground">{label}</div>
        <div className="text-[10.5px] text-muted-foreground">{help}</div>
      </div>
    </button>
  );
}
