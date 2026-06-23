import { useState, useRef } from 'react';
import {
  FileUp, Link, FileText, Loader2, Info, Plus, Clock, CheckCircle2,
  CircleDashed, ExternalLink, FolderOpen, Github, ChevronDown, ChevronRight,
  X, Building2, Ticket, Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { postMessage, onHostMessage } from '@/lib/bridge';
import { pickAndReadFile } from '@/lib/pickFile';
import type { WorkspaceState, RequirementRunSummary } from '@/lib/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type SourceTab = 'text' | 'file' | 'url';
export type AnalyzePlatform = 'jira' | 'github' | 'linear' | 'redmine' | 'local';

interface ExtraProject {
  type: 'local' | 'github';
  ref: string;   // local path or GitHub owner/repo or URL
  label: string; // display name
}

// ── Constants ────────────────────────────────────────────────────────────────

const PLATFORMS: { id: AnalyzePlatform; label: string }[] = [
  { id: 'jira', label: 'Jira' }, { id: 'github', label: 'GitHub' },
  { id: 'linear', label: 'Linear' }, { id: 'redmine', label: 'Redmine' },
  { id: 'local', label: 'Local' },
];

const PARENT_META: Record<AnalyzePlatform, { placeholder: string; hint: string }> = {
  jira:    { placeholder: 'PROJ-100 or https://acme.atlassian.net/browse/PROJ-100', hint: 'Tasks auto-created as children; analysis added as epic comment.' },
  github:  { placeholder: 'owner/repo or owner/repo#42 (milestone)', hint: 'Issues created in this repo, optionally assigned to milestone.' },
  linear:  { placeholder: 'Project / cycle name or URL', hint: 'Issues created under this Linear project or cycle.' },
  redmine: { placeholder: '42 (parent issue number, optional)', hint: 'A CSV for Redmine import will be generated.' },
  local:   { placeholder: 'v2.0 or feature-name (optional label)', hint: 'Used as a label in the exported tasks.md file.' },
};

const PLATFORM_ICON: Record<AnalyzePlatform, string> = {
  jira: 'J', github: 'GH', linear: 'L', redmine: 'R', local: '—',
};

// ── Webview-side pickFolder helper (mirrors pickAndReadFile pattern) ──────────

let _pfCounter = 0;
function pickFolder(): Promise<string | null> {
  return new Promise((resolve) => {
    const requestId = `pfolder-${Date.now().toString(36)}-${++_pfCounter}`;
    const off = onHostMessage((msg) => {
      if (msg.type !== 'pickFolder:reply' || msg.requestId !== requestId) { return; }
      off();
      resolve(typeof msg.folderPath === 'string' && msg.folderPath ? msg.folderPath : null);
    });
    postMessage({ type: 'pickFolder', requestId });
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <label className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
      {children}
      {optional && <span className="ml-1 font-normal normal-case tracking-normal text-muted-foreground/70">(optional)</span>}
    </label>
  );
}

/** Collapsible card used by Analysis Basis items. */
function BasisCard({
  icon: Icon, title, description, enabled, onToggle, children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('rounded-lg border transition-colors', enabled ? 'border-primary/40 bg-primary/5' : 'border-border bg-card')}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <div className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded', enabled ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground')}>
          <Icon className="h-3 w-3" />
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn('text-[11px] font-semibold', enabled ? 'text-primary' : 'text-foreground')}>{title}</div>
          <div className="text-[10px] text-muted-foreground">{description}</div>
        </div>
        {enabled ? <ChevronDown className="h-3.5 w-3.5 text-primary" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {enabled && (
        <div className="border-t border-primary/20 px-3 pb-3 pt-2.5">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Main form ────────────────────────────────────────────────────────────────

function AnalyzeForm({ workspaceName }: { workspaceName: string }) {
  // Requirements source
  const [tab, setTab] = useState<SourceTab>('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Project context
  const [extraProjects, setExtraProjects] = useState<ExtraProject[]>([]);
  const [addingProjectType, setAddingProjectType] = useState<'local' | 'github' | null>(null);
  const [githubInput, setGithubInput] = useState('');
  const [loadingFolder, setLoadingFolder] = useState(false);

  // Analysis basis
  const [businessEnabled, setBusinessEnabled] = useState(false);
  const [businessContext, setBusinessContext] = useState('');
  const [itsEnabled, setItsEnabled] = useState(false);
  const [itsContext, setItsContext] = useState('');

  // Task creation
  const [platform, setPlatform] = useState<AnalyzePlatform>('jira');
  const [parentTask, setParentTask] = useState('');
  const [instruction, setInstruction] = useState('');
  const [detailLevel, setDetailLevel] = useState<'detailed' | 'brief'>('detailed');

  const [submitted, setSubmitted] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);

  // ── Source helpers ──────────────────────────────────────────────────────────

  const pickFile = async () => {
    setLoadingFile(true); setFileError(null);
    try {
      const result = await pickAndReadFile();
      if (!result) { return; }
      setFileContent(result.content); setFileName(result.fileName);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : String(err));
    } finally { setLoadingFile(false); }
  };

  const resolveSource = (): string | null => {
    if (tab === 'text') { return text.trim() ? `inline:${text.trim()}` : null; }
    if (tab === 'file') { return fileContent ? `inline:${fileContent}` : null; }
    if (tab === 'url') { return url.trim() || null; }
    return null;
  };

  const urlValid = () => {
    if (tab !== 'url') { return true; }
    try { new URL(url.trim()); return true; } catch { return false; }
  };

  // ── Extra project helpers ───────────────────────────────────────────────────

  const addLocalProject = async () => {
    setLoadingFolder(true);
    try {
      const folderPath = await pickFolder();
      if (!folderPath) { return; }
      const label = folderPath.split('/').filter(Boolean).pop() ?? folderPath;
      setExtraProjects((prev) => [...prev, { type: 'local', ref: folderPath, label }]);
    } finally { setLoadingFolder(false); setAddingProjectType(null); }
  };

  const addGithubProject = () => {
    const raw = githubInput.trim();
    if (!raw) { return; }
    // Normalize: accept owner/repo or full URL
    let ref = raw;
    const m = raw.match(/github\.com\/([^/]+\/[^/]+)/);
    if (m) { ref = m[1]; }
    const label = ref.split('/').pop() ?? ref;
    setExtraProjects((prev) => [...prev, { type: 'github', ref, label }]);
    setGithubInput(''); setAddingProjectType(null);
  };

  const removeProject = (idx: number) => {
    setExtraProjects((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const isValid = () => !!resolveSource() && urlValid();

  const submit = () => {
    if (!isValid()) { return; }
    postMessage({
      type: 'startAnalyzeRequirements',
      source: resolveSource()!,
      platform,
      parentTask: parentTask.trim(),
      instruction: instruction.trim(),
      detailLevel,
      extraProjects: extraProjects.length > 0 ? extraProjects : undefined,
      businessContext: businessEnabled && businessContext.trim() ? businessContext.trim() : undefined,
      itsContext: itsEnabled && itsContext.trim() ? itsContext.trim() : undefined,
    });
    setSubmitted(true);
    setText(''); setUrl(''); setFileContent(''); setFileName('');
    setParentTask(''); setInstruction(''); setExtraProjects([]);
    setBusinessEnabled(false); setBusinessContext('');
    setItsEnabled(false); setItsContext('');
  };

  const meta = PARENT_META[platform];
  const hasParent = parentTask.trim().length > 0;

  // ── Success state ───────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card/60 p-6 text-center">
        <CheckCircle2 className="h-8 w-8 text-primary" />
        <div>
          <p className="text-sm font-semibold text-foreground">Analysis started</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Claude CLI has been opened and the analysis command is running.
          </p>
        </div>
        <button type="button" onClick={() => setSubmitted(false)}
          className="mt-1 text-[11px] text-primary underline underline-offset-2 hover:text-primary/80">
          New analysis
        </button>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── 1. Requirements source ──────────────────────────────────────────── */}
      <div>
        <SectionLabel>Requirements source</SectionLabel>
        <div className="mb-2 flex gap-0.5 rounded-md border border-border bg-muted/30 p-0.5">
          {([
            { id: 'text' as const, label: 'Text / paste', Icon: FileText },
            { id: 'file' as const, label: 'File',         Icon: FileUp   },
            { id: 'url'  as const, label: 'URL',          Icon: Link     },
          ]).map(({ id, label, Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={cn('flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-[11px] font-medium transition-colors',
                tab === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              <Icon className="h-3 w-3 shrink-0" />{label}
            </button>
          ))}
        </div>
        {tab === 'text' && (
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
            placeholder={'Paste or type requirements here…\n\nExample: "Users should be able to log in with email & password. Sessions expire after 7 days."'}
            className="w-full resize-y rounded-md border border-border bg-input/50 px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40" />
        )}
        {tab === 'file' && (
          <div className="flex flex-col gap-2">
            <button type="button" onClick={pickFile} disabled={loadingFile}
              className="flex items-center gap-2 rounded-md border border-dashed border-border bg-input/30 px-4 py-4 text-[11.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50">
              {loadingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {fileName || 'Pick a file (md, txt, pdf, docx…)'}
            </button>
            {fileError && <div className="text-[10.5px] text-destructive">{fileError}</div>}
            {fileContent && !fileError && (
              <div className="rounded-md border border-border bg-muted/30 px-2.5 py-2 text-[10.5px] text-muted-foreground">
                ✓ {fileName} — {fileContent.length.toLocaleString()} chars
              </div>
            )}
          </div>
        )}
        {tab === 'url' && (
          <div>
            <input ref={urlRef} type="url" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus
              placeholder="https://docs.example.com/requirements"
              className="w-full rounded-md border border-border bg-input/50 px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40" />
            {url && !urlValid() && <div className="mt-1 text-[10.5px] text-destructive">Enter a valid URL (http:// or https://)</div>}
          </div>
        )}
      </div>

      {/* ── 2. Project context ──────────────────────────────────────────────── */}
      <div>
        <SectionLabel>Project context</SectionLabel>
        <div className="space-y-1.5">
          {/* Current project (always shown) */}
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2">
            <Layers className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="flex-1 text-[11px] font-medium text-foreground">
              {workspaceName || 'Current workspace'}
            </span>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-bold uppercase text-primary">current</span>
          </div>

          {/* Extra projects */}
          {extraProjects.map((p, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2">
              {p.type === 'github'
                ? <Github className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                : <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              <span className="flex-1 truncate font-mono text-[10.5px] text-foreground" title={p.ref}>{p.ref}</span>
              <button type="button" onClick={() => removeProject(i)}
                className="rounded p-0.5 text-muted-foreground hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}

          {/* Add project inline inputs */}
          {addingProjectType === 'github' && (
            <div className="flex gap-1.5">
              <input value={githubInput} onChange={(e) => setGithubInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { addGithubProject(); } if (e.key === 'Escape') { setAddingProjectType(null); } }}
                autoFocus placeholder="owner/repo or github.com URL"
                className="flex-1 rounded-md border border-border bg-input/50 px-2.5 py-1.5 text-[12px] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40" />
              <button type="button" onClick={addGithubProject}
                className="rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90">Add</button>
              <button type="button" onClick={() => setAddingProjectType(null)}
                className="rounded-md border border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-accent">✕</button>
            </div>
          )}

          {/* Add project buttons */}
          {addingProjectType === null && (
            <div className="flex gap-1.5 pt-0.5">
              <button type="button" onClick={addLocalProject} disabled={loadingFolder}
                className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-[10.5px] text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:opacity-50">
                {loadingFolder ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderOpen className="h-3 w-3" />}
                Add local project
              </button>
              <button type="button" onClick={() => setAddingProjectType('github')}
                className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-[10.5px] text-muted-foreground hover:border-primary/40 hover:text-foreground">
                <Github className="h-3 w-3" />Add GitHub repo
              </button>
            </div>
          )}
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Claude will read the current project's structure. Add more codebases to cross-reference during analysis.
        </p>
      </div>

      {/* ── 3. Analysis basis ───────────────────────────────────────────────── */}
      <div>
        <SectionLabel optional>Analysis basis</SectionLabel>
        <div className="space-y-2">

          {/* Core business context */}
          <BasisCard
            icon={Building2}
            title="Core business context"
            description="Company mission, domain rules, product strategy, glossary"
            enabled={businessEnabled}
            onToggle={() => setBusinessEnabled((v) => !v)}
          >
            <p className="mb-2 text-[10px] text-muted-foreground">
              Paste a summary, link to a Confluence page, or add a file URL. Claude will use this to align tasks with business goals.
            </p>
            <textarea value={businessContext} onChange={(e) => setBusinessContext(e.target.value)} rows={3}
              placeholder={'Inline summary, or paste a URL to a doc / Confluence page.\n\nExample: "We are a B2B SaaS platform for creative agencies. Core constraint: multi-tenant data isolation."'}
              className="w-full resize-y rounded-md border border-border bg-input/50 px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40" />
          </BasisCard>

          {/* Existing ITS issues */}
          <BasisCard
            icon={Ticket}
            title="Existing ITS issues"
            description="Link to Jira project, Linear team, or GitHub issues to avoid duplicates"
            enabled={itsEnabled}
            onToggle={() => setItsEnabled((v) => !v)}
          >
            <p className="mb-2 text-[10px] text-muted-foreground">
              Claude will read existing issues to avoid duplicates and align with in-progress work.
            </p>
            <input value={itsContext} onChange={(e) => setItsContext(e.target.value)}
              placeholder="https://acme.atlassian.net/jira/software/projects/PROJ/boards  or  owner/repo  or  linear.app/team/…"
              className="w-full rounded-md border border-border bg-input/50 px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40" />
          </BasisCard>
        </div>
      </div>

      {/* ── 4. Create tasks on ──────────────────────────────────────────────── */}
      <div>
        <SectionLabel>Create tasks on</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {PLATFORMS.map(({ id, label }) => (
            <button key={id} type="button" onClick={() => setPlatform(id)}
              className={cn('rounded-full border px-3 py-1 text-[11px] font-medium transition-colors',
                platform === id ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground')}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 5. Parent epic / task ───────────────────────────────────────────── */}
      <div>
        <SectionLabel optional>Parent epic / task</SectionLabel>
        <input type="text" value={parentTask} onChange={(e) => setParentTask(e.target.value)}
          placeholder={meta.placeholder}
          className="w-full rounded-md border border-border bg-input/50 px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40" />
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {hasParent ? meta.hint : 'Leave blank — task list will be shown first so you can choose where to publish'}
        </p>
      </div>

      {/* Jira auto-create notice */}
      {platform === 'jira' && hasParent && (
        <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <p className="text-[10.5px] text-primary">
            After analysis, tasks will be auto-created on Jira under{' '}
            <span className="font-mono font-semibold">{parentTask.trim()}</span>. Stories for features, Testing type for QA tasks. The full analysis is added as a comment on the epic.
          </p>
        </div>
      )}

      {/* ── 6. Instructions ─────────────────────────────────────────────────── */}
      <div>
        <SectionLabel optional>Instructions</SectionLabel>
        <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={3}
          placeholder={'Sprint assignments, naming conventions, post-creation actions…\n"Add to Sprint 2. Tag backend tasks with the api label. Add a comment after creating each Jira task."'}
          className="w-full resize-y rounded-md border border-border bg-input/50 px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40" />
      </div>

      {/* ── 7. Detail level ─────────────────────────────────────────────────── */}
      <div>
        <SectionLabel>Detail level</SectionLabel>
        <div className="flex gap-2">
          {([
            { id: 'detailed' as const, label: 'Detailed', desc: 'Acceptance criteria + story points' },
            { id: 'brief'    as const, label: 'Brief',    desc: 'Titles + one-line descriptions' },
          ]).map(({ id, label, desc }) => (
            <button key={id} type="button" onClick={() => setDetailLevel(id)}
              className={cn('flex-1 rounded-md border px-3 py-2 text-left transition-colors',
                detailLevel === id ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground')}>
              <div className="text-[11px] font-semibold">{label}</div>
              <div className="text-[10px] opacity-80">{desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Submit ──────────────────────────────────────────────────────────── */}
      <div className="flex justify-end pt-1">
        <button type="button" onClick={submit} disabled={!isValid()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40">
          <Plus className="h-3.5 w-3.5" />
          Analyze &amp; create tasks
        </button>
      </div>
    </div>
  );
}

// ── Recent runs list ──────────────────────────────────────────────────────────

function RunCard({ run }: { run: RequirementRunSummary }) {
  const open = () => postMessage({ type: 'openRequirementRun', runId: run.id });
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5 hover:bg-accent/40 transition-colors">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[9px] font-bold text-primary">
        {PLATFORM_ICON[run.platform as AnalyzePlatform] ?? run.platform.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-semibold text-foreground">{run.id}</span>
          {run.parentTask && <span className="truncate font-mono text-[10px] text-muted-foreground">{run.parentTask}</span>}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <Clock className="h-2.5 w-2.5 shrink-0" />
          <span>{run.createdAt}</span>
          {run.taskCount !== null && <><span>·</span><span>{run.taskCount} tasks</span></>}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {run.status === 'complete' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" /> : <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" />}
        {run.hasRequirements && (
          <button
            type="button"
            onClick={() => postMessage({ type: 'openRequirementRun', runId: run.id, file: 'requirements' })}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Open requirements.md"
          >
            <FileText className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={open}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Open tasks.md"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function AnalyzeView({ state }: { state: WorkspaceState }) {
  const runs = state.requirementRuns ?? [];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Requirement Analysis</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Scan requirements · break into tasks · publish to Jira / GitHub / Linear
        </p>
      </div>
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        <div className="min-w-0 flex-1 rounded-xl border border-border bg-card/50 p-5">
          <h2 className="mb-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">New Analysis</h2>
          <AnalyzeForm workspaceName={state.workspaceName} />
        </div>
        <div className="w-full lg:w-72 xl:w-80 shrink-0">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Recent Analyses{runs.length > 0 && <span className="ml-1.5 text-muted-foreground/60">({runs.length})</span>}
          </h2>
          {runs.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-surface/50 p-4 text-center text-[11px] text-muted-foreground">
              No analyses yet. Fill in the form to get started.
            </div>
          ) : (
            <div className="space-y-2">{runs.map((r) => <RunCard key={r.id} run={r} />)}</div>
          )}
        </div>
      </div>
    </div>
  );
}
