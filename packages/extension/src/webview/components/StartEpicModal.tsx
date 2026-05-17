import { useEffect, useMemo, useRef, useState } from 'react';
import { ListOrdered, ChevronRight, FileUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentMeta, PipelineSummary } from '@/lib/types';
import { Modal, ModalFooter, ModalCancelButton, ModalConfirmButton } from './Modal';
import { pickAndReadFile } from '@/lib/pickFile';

const ID_PATTERN = /^[A-Z][A-Z0-9-]*$/;

interface CapabilityPrompt {
  prompt: string;
  placeholder: string;
  defaultValue?: string;
}

const CAPABILITY_PROMPTS: Record<string, CapabilityPrompt> = {
  jira: { prompt: 'Jira ticket key or URL', placeholder: 'PROJ-123 or https://acme.atlassian.net/browse/PROJ-123' },
  figma: { prompt: 'Figma file URL or file key', placeholder: 'https://www.figma.com/file/abc123/...' },
  'core-business': { prompt: 'Path to core business docs (relative)', placeholder: 'docs/core', defaultValue: 'docs/core' },
  github: { prompt: 'GitHub repo or PR URL', placeholder: 'owner/repo or https://github.com/owner/repo/pull/42' },
  slack: { prompt: 'Slack channel or thread URL', placeholder: '#engineering or https://slack.com/...' },
  files: { prompt: 'Files glob (relative to project root)', placeholder: 'src/**/*.ts' },
  web: { prompt: 'URLs to fetch (comma-separated, optional)', placeholder: 'https://example.com/...' },
};

export type EpicTargetKind = 'pipeline' | 'agent';

export interface StartEpicDraft {
  target: { kind: EpicTargetKind; id: string };
  epicId: string;
  title: string;
  description: string;
  inputs: Record<string, string>;
}

interface Props {
  pipelines: PipelineSummary[];
  agentMeta: Record<string, AgentMeta>;
  nextEpicId: string;
  existingEpicIds: string[];
  onSubmit: (draft: StartEpicDraft) => void;
  onClose: () => void;
}

export function StartEpicModal({
  pipelines,
  agentMeta,
  nextEpicId,
  existingEpicIds,
  onSubmit,
  onClose,
}: Props) {
  const [pipelineId, setPipelineId] = useState<string>(pipelines[0]?.id ?? '');
  const [epicId, setEpicId] = useState(nextEpicId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const idInputRef = useRef<HTMLInputElement>(null);
  const [descLoading, setDescLoading] = useState(false);
  const [descLoadInfo, setDescLoadInfo] = useState<{
    kind: 'loaded' | 'error';
    text: string;
  } | null>(null);

  const onLoadDescriptionFromFile = async () => {
    setDescLoading(true);
    setDescLoadInfo(null);
    try {
      const result = await pickAndReadFile();
      if (!result) { return; }
      setDescription(result.content);
      setDescLoadInfo({
        kind: 'loaded',
        text: `Loaded ${result.fileName} (${formatBytes(result.byteLength)})`,
      });
    } catch (err) {
      setDescLoadInfo({
        kind: 'error',
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDescLoading(false);
    }
  };

  useEffect(() => {
    idInputRef.current?.focus();
    idInputRef.current?.select();
  }, []);

  const capabilities = useMemo<string[]>(() => {
    const targetAgents = pipelines.find((p) => p.id === pipelineId)?.steps.map((s) => s.agent) ?? [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const a of targetAgents) {
      const caps = agentMeta[a]?.capabilities ?? [];
      for (const c of caps) {
        if (!seen.has(c)) {
          seen.add(c);
          out.push(c);
        }
      }
    }
    return out;
  }, [pipelineId, pipelines, agentMeta]);

  useEffect(() => {
    setInputs((cur) => {
      const next = { ...cur };
      let changed = false;
      for (const cap of capabilities) {
        if (!(cap in next)) {
          const def = CAPABILITY_PROMPTS[cap]?.defaultValue ?? '';
          if (def) {
            next[cap] = def;
            changed = true;
          }
        }
      }
      return changed ? next : cur;
    });
  }, [capabilities]);

  const trimmedId = epicId.trim();
  const idError = useMemo(() => {
    if (!trimmedId) { return 'Epic id is required'; }
    if (!ID_PATTERN.test(trimmedId)) {
      return 'Uppercase letters / digits / dashes only — must start with a letter';
    }
    if (existingEpicIds.includes(trimmedId)) {
      return `Epic "${trimmedId}" already exists`;
    }
    return null;
  }, [trimmedId, existingEpicIds]);

  const targetError = !pipelineId ? 'Pick a pipeline' : null;

  const error = idError || targetError;

  const submit = () => {
    if (error) { return; }
    const cleanInputs: Record<string, string> = {};
    for (const cap of capabilities) {
      const v = (inputs[cap] ?? '').trim();
      if (v) { cleanInputs[cap] = v; }
    }
    onSubmit({
      target: { kind: 'pipeline', id: pipelineId },
      epicId: trimmedId,
      title: title.trim(),
      description: description.trim(),
      inputs: cleanInputs,
    });
    onClose();
  };

  return (
    <Modal title="Start epic" maxWidth="max-w-2xl" onClose={onClose} onSubmit={submit}>
      <div className="space-y-4">
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
            <ListOrdered className="h-3 w-3" />
            Workflow
          </label>
          <div className="max-h-44 overflow-y-auto rounded-md border border-border">
            {pipelines.length === 0 ? (
              <NoPipelines />
            ) : (
              pipelines.map((p) => {
                const steps = p.steps.map((s) => s.name ?? s.agent);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPipelineId(p.id)}
                    className={cn(
                      'flex w-full flex-col items-start gap-0.5 border-b border-border/50 px-2.5 py-1.5 text-left last:border-b-0',
                      pipelineId === p.id ? 'bg-primary/10' : 'hover:bg-accent/40',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] font-medium text-foreground">
                        {p.id}
                      </span>
                      {p.builtin && (
                        <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
                          built-in
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {steps.length} step{steps.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="truncate text-[10.5px] text-muted-foreground">
                      {steps.join(' → ')}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
              Epic id
            </label>
            <input
              ref={idInputRef}
              type="text"
              value={epicId}
              onChange={(e) => setEpicId(e.target.value)}
              placeholder="EPIC-001"
              spellCheck={false}
              disabled={pipelines.length === 0}
              className="w-full rounded-md border border-border bg-input/50 px-2.5 py-2 font-mono text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
            />
            {idError && trimmedId && (
              <div className="mt-1 text-[10.5px] text-destructive">{idError}</div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
              Title <span className="font-normal normal-case tracking-normal text-muted-foreground/80">(optional)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='e.g. "Add user profile page"'
              disabled={pipelines.length === 0}
              className="w-full rounded-md border border-border bg-input/50 px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
            />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <label className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
              Description / requirement <span className="font-normal normal-case tracking-normal text-muted-foreground/80">(optional)</span>
            </label>
            <button
              type="button"
              onClick={onLoadDescriptionFromFile}
              disabled={descLoading || pipelines.length === 0}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              title="Load contents of a text/markdown file into the description"
            >
              {descLoading ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ) : (
                <FileUp className="h-2.5 w-2.5" />
              )}
              <span>Load from file…</span>
            </button>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Paste a requirement / PRD, or load it from a file. The text is snapshotted into the epic at submit time."
            rows={5}
            disabled={pipelines.length === 0}
            className="w-full resize-y rounded-md border border-border bg-input/50 px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
          />
          {descLoadInfo && (
            <div
              className={cn(
                'mt-1 text-[10px]',
                descLoadInfo.kind === 'loaded'
                  ? 'text-muted-foreground'
                  : 'text-destructive',
              )}
            >
              {descLoadInfo.text}
            </div>
          )}
        </div>

        {capabilities.length > 0 && (
          <div>
            <div className="mb-1 flex items-baseline gap-1.5">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                Capability inputs
              </span>
              <span className="text-[10px] text-muted-foreground">
                ({capabilities.length} from pipeline)
              </span>
            </div>
            <div className="space-y-2">
              {capabilities.map((cap) => {
                const meta = CAPABILITY_PROMPTS[cap];
                return (
                  <div key={cap}>
                    <div className="mb-0.5 flex items-baseline gap-1.5">
                      <span className="font-mono text-[10.5px] font-medium text-primary">{cap}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {meta?.prompt ?? `Value for capability \`${cap}\``}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={inputs[cap] ?? ''}
                      onChange={(e) =>
                        setInputs((cur) => ({ ...cur, [cap]: e.target.value }))
                      }
                      placeholder={meta?.placeholder ?? 'Value, or leave blank to skip'}
                      className="w-full rounded-md border border-border bg-input/50 px-2.5 py-1.5 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <ModalFooter>
        <ModalCancelButton onClick={onClose} />
        <ModalConfirmButton onClick={submit} label="Start epic" disabled={!!error} />
      </ModalFooter>
    </Modal>
  );
}

function NoPipelines() {
  return (
    <div className="flex items-center gap-2 p-3 text-[11px] text-muted-foreground">
      <ChevronRight className="h-3 w-3 shrink-0" />
      <span>No pipelines available. Go to the <strong>Builder</strong> tab to create one.</span>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) { return `${n} B`; }
  if (n < 1024 * 1024) { return `${(n / 1024).toFixed(1)} KB`; }
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
