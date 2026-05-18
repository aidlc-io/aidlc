import { useState } from 'react';
import { Sparkles, FileText, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Modal, ModalFooter, ModalCancelButton, ModalConfirmButton } from './Modal';

interface Option {
  workflowId: string | null;
  title: string;
  badge?: string;
  description: string;
  bullets: string[];
  icon: React.ReactNode;
}

const OPTIONS: Option[] = [
  {
    workflowId: 'sdlc-parallel-pipeline',
    title: 'SDLC Parallel Pipeline',
    badge: 'Recommended',
    description:
      'Engineering + QA tracks run concurrently. Best for team flows where Test Plan and Test Cases parallel Tech Design and Implement.',
    bullets: [
      'plan → design ∥ test-plan → implement ∥ generate-test-cases → execute-test → release → doc-sync',
      '8 steps, DAG shape (multiple in flight at once)',
      'Shares agents/skills with the sequential workflow',
    ],
    icon: <Sparkles className="h-4 w-4" />,
  },
  {
    workflowId: 'sdlc-pipeline',
    title: 'SDLC Pipeline',
    description:
      'Classic linear SDLC — one step at a time. Simpler to follow; good for solo flows or small epics.',
    bullets: [
      'plan → design → test-plan → implement → review → execute-test → release → monitor → doc-sync',
      '9 steps, strictly sequential',
      'Familiar shape, no parallelism to reason about',
    ],
    icon: <GitBranch className="h-4 w-4" />,
  },
  {
    workflowId: null,
    title: 'Empty workspace',
    description:
      'Start from scratch. Scaffold an empty workspace.yaml and wire up agents / skills / pipelines yourself.',
    bullets: [
      'Useful when you need a custom shape from day one',
      'Add a pipeline later via the Workflows tab',
    ],
    icon: <FileText className="h-4 w-4" />,
  },
];

export function InitWorkflowModal({
  onPick,
  onClose,
}: {
  onPick: (workflowId: string | null) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string | null | undefined>(OPTIONS[0].workflowId);
  const chosen = OPTIONS.find((o) => o.workflowId === selected) ?? OPTIONS[0];

  const submit = () => {
    onPick(chosen.workflowId);
    onClose();
  };

  return (
    <Modal
      title="Initialize AIDLC workspace"
      subtitle="Pick a starting workflow. You can edit, add, or delete steps afterwards."
      onClose={onClose}
      onSubmit={submit}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-2">
        {OPTIONS.map((opt) => {
          const isSelected = opt.workflowId === selected;
          return (
            <button
              key={opt.title}
              type="button"
              onClick={() => setSelected(opt.workflowId)}
              className={cn(
                'flex w-full items-start gap-3 rounded-lg border-2 p-3.5 text-left transition-all',
                isSelected
                  ? 'border-primary/60 bg-primary/5'
                  : 'border-border bg-card hover:border-primary/30 hover:bg-accent/40',
              )}
            >
              <div
                className={cn(
                  'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2',
                  isSelected ? 'border-primary' : 'border-muted-foreground/40',
                )}
              >
                {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-primary" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                    <span className="text-primary">{opt.icon}</span>
                    {opt.title}
                  </span>
                  {opt.badge && (
                    <span className="inline-flex items-center rounded-full border border-warning/40 bg-warning/15 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-warning">
                      {opt.badge}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground">{opt.description}</p>
                <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground/85">
                  {opt.bullets.map((b, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span aria-hidden className="select-none text-muted-foreground/60">
                        •
                      </span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </button>
          );
        })}
      </div>
      <ModalFooter>
        <ModalCancelButton onClick={onClose} />
        <ModalConfirmButton
          onClick={submit}
          label={chosen.workflowId ? 'Apply workflow' : 'Create empty workspace'}
        />
      </ModalFooter>
    </Modal>
  );
}
