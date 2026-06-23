import { useState, useRef } from 'react';
import { FileUp, Link, FileText, Loader2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Modal, ModalFooter, ModalCancelButton, ModalConfirmButton } from './Modal';
import { postMessage } from '@/lib/bridge';
import { pickAndReadFile } from '@/lib/pickFile';

// ── Types ────────────────────────────────────────────────────────────────────

type SourceTab = 'text' | 'file' | 'url';
export type AnalyzePlatform = 'jira' | 'github' | 'linear' | 'redmine' | 'local';

const PLATFORMS: { id: AnalyzePlatform; label: string }[] = [
  { id: 'jira',    label: 'Jira' },
  { id: 'github',  label: 'GitHub' },
  { id: 'linear',  label: 'Linear' },
  { id: 'redmine', label: 'Redmine' },
  { id: 'local',   label: 'Local' },
];

interface ParentMeta {
  placeholder: string;
  filledHint: string;
}

const PARENT_META: Record<AnalyzePlatform, ParentMeta> = {
  jira: {
    placeholder: 'PROJ-100 or https://acme.atlassian.net/browse/PROJ-100',
    filledHint: 'Tasks will be auto-created as children of this epic. The analysis summary is added as an epic comment.',
  },
  github: {
    placeholder: 'owner/repo or owner/repo#42 (milestone number)',
    filledHint: 'Issues will be created in this repo, optionally assigned to the milestone.',
  },
  linear: {
    placeholder: 'Project or cycle name / URL',
    filledHint: 'Issues will be created under this Linear project or cycle.',
  },
  redmine: {
    placeholder: '42 (parent issue number, optional)',
    filledHint: 'A CSV for Redmine import will be generated with this issue as parent.',
  },
  local: {
    placeholder: 'v2.0 or feature-name (optional label)',
    filledHint: 'Used as a label in the exported tasks.md file.',
  },
};

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

export function AnalyzeRequirementsModal({ onClose }: Props) {
  const [tab, setTab] = useState<SourceTab>('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const [platform, setPlatform] = useState<AnalyzePlatform>('jira');
  const [parentTask, setParentTask] = useState('');
  const [detailLevel, setDetailLevel] = useState<'detailed' | 'brief'>('detailed');

  const urlRef = useRef<HTMLInputElement>(null);

  // ── File picker ────────────────────────────────────────────────────────────
  const pickFile = async () => {
    setLoadingFile(true);
    setFileError(null);
    try {
      const result = await pickAndReadFile();
      if (!result) { return; }
      setFileContent(result.content);
      setFileName(result.fileName);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingFile(false);
    }
  };

  // ── Source resolution ──────────────────────────────────────────────────────
  const resolveSource = (): string | null => {
    if (tab === 'text') { return text.trim() ? `inline:${text.trim()}` : null; }
    if (tab === 'file') { return fileContent ? `inline:${fileContent}` : null; }
    if (tab === 'url') { return url.trim() || null; }
    return null;
  };

  const urlValid = (): boolean => {
    if (tab !== 'url') { return true; }
    try { new URL(url.trim()); return true; } catch { return false; }
  };

  const isValid = (): boolean => !!resolveSource() && urlValid();

  // ── Submit ─────────────────────────────────────────────────────────────────
  const submit = () => {
    if (!isValid()) { return; }
    postMessage({
      type: 'startAnalyzeRequirements',
      source: resolveSource()!,
      platform,
      parentTask: parentTask.trim(),
      detailLevel,
    });
    onClose();
  };

  const meta = PARENT_META[platform];
  const hasParent = parentTask.trim().length > 0;

  return (
    <Modal
      title="Analyze Requirements"
      subtitle="Scan requirements, break them into tasks, and publish to Jira / GitHub / Linear"
      maxWidth="max-w-xl"
      onClose={onClose}
      onSubmit={submit}
      closeOnBackdrop={false}
    >
      <div className="space-y-4 pb-1">

        {/* ── Source ─────────────────────────────────────────────────────── */}
        <div>
          <label className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
            Requirements source
          </label>

          {/* Tab strip */}
          <div className="mb-2 flex gap-0.5 rounded-md border border-border bg-muted/30 p-0.5">
            {([
              { id: 'text' as const, label: 'Text / paste', Icon: FileText },
              { id: 'file' as const, label: 'File',         Icon: FileUp   },
              { id: 'url'  as const, label: 'URL',           Icon: Link     },
            ]).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-[11px] font-medium transition-colors',
                  tab === id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3 w-3 shrink-0" />
                {label}
              </button>
            ))}
          </div>

          {/* Text / paste */}
          {tab === 'text' && (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              rows={7}
              placeholder={'Paste or type requirements here…\n\nExample: "Users should log in with email & password. Sessions expire after 7 days. Password reset via email."'}
              className="w-full resize-y rounded-md border border-border bg-input/50 px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          )}

          {/* File */}
          {tab === 'file' && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={pickFile}
                disabled={loadingFile}
                className="flex items-center gap-2 rounded-md border border-dashed border-border bg-input/30 px-4 py-4 text-[11.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {loadingFile
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <FileUp className="h-4 w-4" />}
                {fileName || 'Pick a file (md, txt, pdf, docx…)'}
              </button>
              {fileError && <div className="text-[10.5px] text-destructive">{fileError}</div>}
              {fileContent && !fileError && (
                <div className="rounded-md border border-border bg-muted/30 px-2.5 py-2 text-[10.5px] text-muted-foreground">
                  ✓ {fileName} loaded — {fileContent.length.toLocaleString()} chars
                </div>
              )}
            </div>
          )}

          {/* URL */}
          {tab === 'url' && (
            <div>
              <input
                ref={urlRef}
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoFocus
                placeholder="https://docs.example.com/requirements"
                className="w-full rounded-md border border-border bg-input/50 px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
              {url && !urlValid() && (
                <div className="mt-1 text-[10.5px] text-destructive">Enter a valid URL (http:// or https://)</div>
              )}
            </div>
          )}
        </div>

        {/* ── Platform ───────────────────────────────────────────────────── */}
        <div>
          <label className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
            Create tasks on
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PLATFORMS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setPlatform(id)}
                className={cn(
                  'rounded-full border px-3 py-1 text-[11px] font-medium transition-colors',
                  platform === id
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Parent task ─────────────────────────────────────────────────── */}
        <div>
          <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
            Parent epic / task{' '}
            <span className="font-normal normal-case tracking-normal text-muted-foreground/70">
              (optional)
            </span>
          </label>
          <input
            type="text"
            value={parentTask}
            onChange={(e) => setParentTask(e.target.value)}
            placeholder={meta.placeholder}
            className="w-full rounded-md border border-border bg-input/50 px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {hasParent
              ? meta.filledHint
              : 'Leave blank — the generated task list will be shown first so you can choose where to publish'}
          </p>
        </div>

        {/* ── Detail level ────────────────────────────────────────────────── */}
        <div>
          <label className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
            Detail level
          </label>
          <div className="flex gap-2">
            {([
              { id: 'detailed' as const, label: 'Detailed', desc: 'Acceptance criteria + story points' },
              { id: 'brief'    as const, label: 'Brief',    desc: 'Titles + one-line descriptions'     },
            ]).map(({ id, label, desc }) => (
              <button
                key={id}
                type="button"
                onClick={() => setDetailLevel(id)}
                className={cn(
                  'flex-1 rounded-md border px-3 py-2 text-left transition-colors',
                  detailLevel === id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <div className="text-[11px] font-semibold">{label}</div>
                <div className="text-[10px] opacity-80">{desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Jira auto-create notice ──────────────────────────────────────── */}
        {platform === 'jira' && hasParent && (
          <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <p className="text-[10.5px] text-primary">
              After analysis, tasks will be auto-created on Jira under{' '}
              <span className="font-mono font-semibold">{parentTask.trim()}</span>. Stories for features, Testing type for QA tasks. The full analysis will be added as a comment on the epic.
            </p>
          </div>
        )}
      </div>

      <ModalFooter>
        <ModalCancelButton onClick={onClose} />
        <ModalConfirmButton
          onClick={submit}
          label="Analyze & create tasks"
          disabled={!isValid()}
        />
      </ModalFooter>
    </Modal>
  );
}
