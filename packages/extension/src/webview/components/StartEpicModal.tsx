import { useEffect, useMemo, useRef, useState } from 'react';
import { ListOrdered, ChevronRight, FileUp, Loader2, Sparkles, Plus, Wand2, DownloadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentMeta, PipelineSummary, RecipeSummary } from '@/lib/types';
import { Modal, ModalFooter, ModalCancelButton, ModalConfirmButton } from './Modal';
import { pickAndReadFile } from '@/lib/pickFile';
import { postMessage, onHostMessage } from '@/lib/bridge';

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

export type EpicTargetKind = 'pipeline' | 'agent' | 'recipe';

type ExternalSource = 'jira' | 'github' | 'drive' | 'url';

const EXTERNAL_SOURCES: { id: ExternalSource; label: string; placeholder: string }[] = [
  { id: 'jira', label: 'Jira', placeholder: 'PROJ-123 or https://acme.atlassian.net/browse/PROJ-123' },
  { id: 'github', label: 'GitHub', placeholder: 'owner/repo#123 or https://github.com/owner/repo/pull/42' },
  { id: 'drive', label: 'Drive', placeholder: 'https://docs.google.com/document/d/… or file id' },
  { id: 'url', label: 'URL', placeholder: 'https://… (spec / requirement page)' },
];

export interface StartEpicDraft {
  target: { kind: EpicTargetKind; id: string };
  epicId: string;
  title: string;
  description: string;
  inputs: Record<string, string>;
}

interface Props {
  pipelines: PipelineSummary[];
  recipes: RecipeSummary[];
  agentMeta: Record<string, AgentMeta>;
  nextEpicId: string;
  existingEpicIds: string[];
  onSubmit: (draft: StartEpicDraft) => void;
  onClose: () => void;
}

/**
 * What the user picked in the WORKFLOW section:
 *   - `auto`     → let the classifier suggest a recipe from the task description.
 *   - `pipeline` → a concrete pipeline (user-defined or built-in AIDLC).
 * An `auto` selection resolves to a recipe target at submit time via the
 * current {@link Suggestion}.
 */
type Selection = { kind: 'auto' } | { kind: 'pipeline'; id: string };

interface Suggestion {
  recipeId: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  /** `llm` = Claude analyzed the requirement; `heuristic` = keyword fallback. */
  source: 'llm' | 'heuristic';
}

export function StartEpicModal({
  pipelines,
  recipes,
  agentMeta,
  nextEpicId,
  existingEpicIds,
  onSubmit,
  onClose,
}: Props) {
  const [selected, setSelected] = useState<Selection>(
    recipes.length > 0
      ? { kind: 'auto' }
      : pipelines[0]
        ? { kind: 'pipeline', id: pipelines[0].id }
        : { kind: 'auto' },
  );
  // Start empty (nextEpicId is shown only as a placeholder). A pre-filled
  // "EPIC-100" looks like a Jira key and would trigger auto-analysis on open.
  const [epicId, setEpicId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const idInputRef = useRef<HTMLInputElement>(null);
  const [descLoading, setDescLoading] = useState(false);
  const [descLoadInfo, setDescLoadInfo] = useState<{ kind: 'loaded' | 'error'; text: string } | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [classifying, setClassifying] = useState(false);
  // External requirement loading (Jira / GitHub / Drive / URL via Claude MCP).
  const [loadSource, setLoadSource] = useState<ExternalSource | null>(null);
  const [loadRef, setLoadRef] = useState('');
  const [loadingExternal, setLoadingExternal] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const hasWorkflows = pipelines.length > 0 || recipes.length > 0;
  const userPipelines = useMemo(() => pipelines.filter((p) => !p.builtin), [pipelines]);
  const aidlcPipelines = useMemo(() => pipelines.filter((p) => p.builtin), [pipelines]);

  // Live mirrors of the inputs so the (deps-frozen) host-message listener can
  // tell whether an async analysis result is still relevant or stale.
  const epicIdRef = useRef(epicId);
  const descriptionRef = useRef(description);
  useEffect(() => { epicIdRef.current = epicId; }, [epicId]);
  useEffect(() => { descriptionRef.current = description; }, [description]);
  // The signal the auto-classifier last acted on — set it when we fill the
  // description programmatically (from a load) so it doesn't re-analyze.
  const lastAnalyzed = useRef('');
  // The ref of the in-flight external load. Streamed chunks / results carry
  // their ref; we drop any that don't match (the user moved on to another).
  const activeLoadRef = useRef('');

  // Suggestion is deliberate, not per-keystroke: classify only once there's
  // real requirement content — when the user clicks "Suggest", or right after
  // content loads from a file / Jira.
  const requestSuggestion = (brief: string) => {
    if (recipes.length === 0 || !brief.trim()) { return; }
    setClassifying(true);
    postMessage({ type: 'classifyBrief', brief });
  };

  const onLoadDescriptionFromFile = async () => {
    setDescLoading(true);
    setDescLoadInfo(null);
    try {
      const result = await pickAndReadFile();
      if (!result) { return; }
      setDescription(result.content);
      setDescLoadInfo({ kind: 'loaded', text: `Loaded ${result.fileName} (${formatBytes(result.byteLength)})` });
      // Real requirement content just arrived → suggest a recipe.
      requestSuggestion(result.content);
    } catch (err) {
      setDescLoadInfo({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setDescLoading(false);
    }
  };

  useEffect(() => {
    idInputRef.current?.focus();
    idInputRef.current?.select();
  }, []);

  // Workflows can arrive async (e.g. after applying the preset). Keep the
  // selection valid: fall back to a pipeline when `auto` has no recipes, or
  // fill in a pipeline id once one exists.
  useEffect(() => {
    if (selected.kind === 'auto' && recipes.length === 0 && pipelines[0]) {
      setSelected({ kind: 'pipeline', id: pipelines[0].id });
    } else if (selected.kind === 'pipeline' && !selected.id && pipelines[0]) {
      setSelected({ kind: 'pipeline', id: pipelines[0].id });
    }
  }, [pipelines, recipes, selected]);

  // Host messages: classifier verdict + external requirement loads.
  useEffect(() => {
    return onHostMessage((m) => {
      if (m.type === 'recipeSuggestion') {
        setClassifying(false);
        // Ignore a verdict for a brief the user has since edited.
        if (m.brief !== undefined && String(m.brief).trim() !== descriptionRef.current.trim()) { return; }
        const recipeId = String(m.recipeId ?? '');
        if (!recipeId || !recipes.some((r) => r.id === recipeId)) { return; }
        setSuggestion({
          recipeId,
          confidence: (m.confidence as Suggestion['confidence']) ?? 'low',
          reasoning: String(m.reasoning ?? ''),
          source: m.source === 'llm' ? 'llm' : 'heuristic',
        });
        // Also suggest an epic id + title from the description (don't clobber
        // what the user already typed).
        const sugId = String(m.epicId ?? '');
        if (sugId && ID_PATTERN.test(sugId)) { setEpicId((cur) => (cur.trim() ? cur : sugId)); }
        const sugTitle = String(m.title ?? '');
        if (sugTitle) { setTitle((cur) => (cur.trim() ? cur : sugTitle)); }
        return;
      }
      // Streamed external load: clear → append chunks → finalize. Drop messages
      // for a ref the user has moved past (started another load / edited).
      if (m.type === 'requirementLoadStart') {
        if (String(m.ref ?? '').trim() !== activeLoadRef.current) { return; }
        setDescription('');
        return;
      }
      if (m.type === 'requirementChunk') {
        if (String(m.ref ?? '').trim() !== activeLoadRef.current) { return; }
        const chunk = String(m.chunk ?? '');
        if (chunk) { setDescription((d) => d + chunk); }
        return;
      }
      if (m.type === 'requirementLoaded') {
        if (String(m.ref ?? '').trim() !== activeLoadRef.current) { return; }
        setLoadingExternal(false);
        setLoadSource(null);
        setLoadRef('');
        const loadedEpicId = String(m.epicId ?? '');
        if (loadedEpicId && ID_PATTERN.test(loadedEpicId)) {
          setEpicId((cur) => (cur.trim() ? cur : loadedEpicId));
        }
        setDescLoadInfo({ kind: 'loaded', text: `Loaded from ${String(m.source ?? '')}` });
        // Deliberately do NOT set lastAnalyzed: the description is now filled,
        // so the auto-fire effect classifies it for a recipe (+ title/epicId).
        activeLoadRef.current = '';
        return;
      }
      if (m.type === 'requirementLoadError') {
        if (String(m.ref ?? '').trim() !== activeLoadRef.current) { return; }
        setLoadingExternal(false);
        setDescription('');        // drop the partial stream
        activeLoadRef.current = '';
        setLoadError(String(m.message ?? 'Failed to load requirement.'));
        return;
      }
    });
  }, [recipes]);

  // Kick off an external fetch. The summary streams into the description; the
  // recipe is classified separately once it lands (see the auto-fire effect),
  // so the text shows up without waiting on the analysis.
  const startLoad = (source: ExternalSource, ref: string) => {
    const r = ref.trim();
    if (!r) { return; }
    activeLoadRef.current = r;
    setLoadingExternal(true);
    setLoadError(null);
    setSuggestion(null);
    setDescription('');
    postMessage({ type: 'loadRequirement', source, ref: r });
  };

  const loadFromSource = () => {
    if (!loadSource || !loadRef.trim()) { return; }
    startLoad(loadSource, loadRef.trim());
  };

  // Auto mode is hands-off: once "Auto" is selected, analyze whatever signal is
  // available (a Jira-key epic id, a URL or brief in the description) and
  // auto-select the recipe — no button press. Debounced; fires once per signal.
  useEffect(() => {
    if (selected.kind !== 'auto' || recipes.length === 0) { return; }
    if (classifying || loadingExternal) { return; }
    const key = epicId.trim();
    const desc = description.trim();
    const isJiraKey = /^[A-Z][A-Z0-9]*-\d+$/.test(key);
    // Only fetch a URL when the description IS just that URL (a pasted link).
    // A summary that merely *mentions* URLs should be classified, not re-fetched.
    const isBareUrl = /^https?:\/\/\S+$/.test(desc);

    let signal = '';
    let fire = () => {};
    if (isBareUrl) {
      signal = `url:${desc}`;
      fire = () => startLoad('url', desc);
    } else if (desc) {
      signal = `brief:${desc}`;
      fire = () => requestSuggestion(desc);
    } else if (isJiraKey) {
      signal = `jira:${key}`;
      fire = () => startLoad('jira', key);
    }
    if (!signal || signal === lastAnalyzed.current) { return; }
    const t = setTimeout(() => { lastAnalyzed.current = signal; fire(); }, 800);
    return () => clearTimeout(t);
  }, [selected, epicId, description, recipes.length, classifying, loadingExternal]);

  const effectiveRecipeId = selected.kind === 'auto' ? suggestion?.recipeId : undefined;

  const selectedAgents = useMemo<string[]>(() => {
    if (selected.kind === 'pipeline') {
      return pipelines.find((p) => p.id === selected.id)?.steps.map((s) => s.agent) ?? [];
    }
    return effectiveRecipeId
      ? recipes.find((r) => r.id === effectiveRecipeId)?.agents ?? []
      : [];
  }, [selected, effectiveRecipeId, pipelines, recipes]);

  const capabilities = useMemo<string[]>(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const a of selectedAgents) {
      for (const c of agentMeta[a]?.capabilities ?? []) {
        if (!seen.has(c)) { seen.add(c); out.push(c); }
      }
    }
    return out;
  }, [selectedAgents, agentMeta]);

  useEffect(() => {
    setInputs((cur) => {
      const next = { ...cur };
      let changed = false;
      for (const cap of capabilities) {
        if (!(cap in next)) {
          const def = CAPABILITY_PROMPTS[cap]?.defaultValue ?? '';
          if (def) { next[cap] = def; changed = true; }
        }
      }
      return changed ? next : cur;
    });
  }, [capabilities]);

  // Empty field falls back to the suggested next id (shown as placeholder).
  const effectiveId = epicId.trim() || nextEpicId;
  const trimmedId = epicId.trim();
  const idError = useMemo(() => {
    if (!effectiveId) { return 'Epic id is required'; }
    if (!ID_PATTERN.test(effectiveId)) {
      return 'Uppercase letters / digits / dashes only — must start with a letter';
    }
    if (existingEpicIds.includes(effectiveId)) { return `Epic "${effectiveId}" already exists`; }
    return null;
  }, [effectiveId, existingEpicIds]);

  const targetError = selected.kind === 'pipeline'
    ? (!selected.id ? 'Pick a pipeline' : null)
    : (!effectiveRecipeId ? 'Add a task description and click “Suggest recipe”, or pick a pipeline' : null);
  const error = idError || targetError;

  const submit = () => {
    if (error) { return; }
    const cleanInputs: Record<string, string> = {};
    for (const cap of capabilities) {
      const v = (inputs[cap] ?? '').trim();
      if (v) { cleanInputs[cap] = v; }
    }
    const target = selected.kind === 'auto'
      ? { kind: 'recipe' as const, id: effectiveRecipeId! }
      : { kind: 'pipeline' as const, id: selected.id };
    onSubmit({
      target,
      epicId: effectiveId,
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
          <div className="max-h-56 overflow-y-auto rounded-md border border-border">
            {!hasWorkflows ? (
              <NoPipelines onClose={onClose} />
            ) : (
              <>
                {recipes.length > 0 && (
                  <AutoRow
                    active={selected.kind === 'auto'}
                    classifying={classifying || loadingExternal}
                    suggestion={suggestion}
                    recipes={recipes}
                    onClick={() => setSelected({ kind: 'auto' })}
                  />
                )}
                {userPipelines.length > 0 && (
                  <GroupHeader label="Your pipelines" />
                )}
                {userPipelines.map((p) => {
                  const steps = p.steps.map((s) => s.name ?? s.agent);
                  return (
                    <WorkflowRow
                      key={`p:${p.id}`}
                      id={p.id}
                      active={selected.kind === 'pipeline' && selected.id === p.id}
                      stepCount={steps.length}
                      steps={steps}
                      onClick={() => setSelected({ kind: 'pipeline', id: p.id })}
                    />
                  );
                })}
                {aidlcPipelines.length > 0 && (
                  <GroupHeader label="AIDLC pipelines (built-in)" />
                )}
                {aidlcPipelines.map((p) => {
                  const steps = p.steps.map((s) => s.name ?? s.agent);
                  return (
                    <WorkflowRow
                      key={`p:${p.id}`}
                      id={p.id}
                      active={selected.kind === 'pipeline' && selected.id === p.id}
                      badge="built-in"
                      stepCount={steps.length}
                      steps={steps}
                      onClick={() => setSelected({ kind: 'pipeline', id: p.id })}
                    />
                  );
                })}
              </>
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
              placeholder={nextEpicId || 'EPIC-001'}
              spellCheck={false}
              disabled={!hasWorkflows}
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
              disabled={!hasWorkflows}
              className="w-full rounded-md border border-border bg-input/50 px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
            />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <label className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
              Description / requirement <span className="font-normal normal-case tracking-normal text-muted-foreground/80">(optional)</span>
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onLoadDescriptionFromFile}
                disabled={descLoading || !hasWorkflows}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                title="Load contents of a text/markdown file into the description"
              >
                {descLoading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <FileUp className="h-2.5 w-2.5" />}
                <span>Load from file…</span>
              </button>
              {EXTERNAL_SOURCES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setLoadSource(s.id);
                    // Jira key is usually the epic id the user already typed — prefill it.
                    setLoadRef(s.id === 'jira' ? epicId.trim() : '');
                    setLoadError(null);
                  }}
                  disabled={!hasWorkflows}
                  className={cn(
                    'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] hover:bg-accent hover:text-foreground disabled:opacity-50',
                    loadSource === s.id ? 'bg-accent text-foreground' : 'text-muted-foreground',
                  )}
                  title={`Load the requirement from ${s.label} (via Claude's MCP integration)`}
                >
                  <DownloadCloud className="h-2.5 w-2.5" />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          </div>
          {loadSource && (
            <div className="mb-1.5 flex items-center gap-1.5">
              <input
                type="text"
                value={loadRef}
                autoFocus
                onChange={(e) => setLoadRef(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); loadFromSource(); } }}
                placeholder={EXTERNAL_SOURCES.find((s) => s.id === loadSource)?.placeholder}
                className="flex-1 rounded-md border border-border bg-input/50 px-2.5 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
              <button
                type="button"
                onClick={loadFromSource}
                disabled={loadingExternal || !loadRef.trim()}
                className="flex items-center gap-1 rounded-md border border-primary/40 bg-primary/15 px-2.5 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/25 disabled:opacity-40"
              >
                {loadingExternal ? <Loader2 className="h-3 w-3 animate-spin" /> : <DownloadCloud className="h-3 w-3" />}
                <span>{loadingExternal ? 'Loading…' : 'Load'}</span>
              </button>
              <button
                type="button"
                onClick={() => { setLoadSource(null); setLoadError(null); }}
                className="rounded px-1.5 py-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          )}
          {loadError && (
            <div className="mb-1.5 text-[10px] text-destructive">{loadError}</div>
          )}
          <textarea
            value={description}
            onChange={(e) => { setDescription(e.target.value); if (suggestion) { setSuggestion(null); } }}
            placeholder="Paste a requirement / PRD, or load it from a file. The text is snapshotted into the epic at submit time."
            rows={5}
            disabled={!hasWorkflows}
            className="w-full resize-y rounded-md border border-border bg-input/50 px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
          />
          {suggestion && recipes.length > 0 && (
            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-primary">
              <Wand2 className="h-2.5 w-2.5 shrink-0" />
              <span>
                Suggested recipe <span className="font-mono font-semibold">{suggestion.recipeId}</span>
                {' '}<span className="text-muted-foreground">
                  ({suggestion.confidence} · {suggestion.source === 'llm' ? 'analyzed' : 'keyword'}) — {suggestion.reasoning}
                </span>
              </span>
            </div>
          )}
          {descLoadInfo && (
            <div
              className={cn(
                'mt-1 text-[10px]',
                descLoadInfo.kind === 'loaded' ? 'text-muted-foreground' : 'text-destructive',
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
                ({capabilities.length} from {selected.kind})
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
                      onChange={(e) => setInputs((cur) => ({ ...cur, [cap]: e.target.value }))}
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

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="border-b border-border/50 bg-muted/30 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
      {label}
    </div>
  );
}

/** Rotating status lines shown while the classifier is working. */
const ANALYZING_STEPS = [
  'Reading the requirement…',
  'Understanding the context…',
  'Detecting the task type…',
  'Sizing the work (bug / feature / spike…)',
  'Matching the right pipeline…',
  'Almost there — finalizing the recipe…',
];

/**
 * The "auto-classify → suggest a recipe" workflow option. Selecting it makes
 * the epic use whichever recipe the classifier picks from the description.
 */
function AutoRow({
  active, classifying, suggestion, recipes, onClick,
}: {
  active: boolean;
  classifying: boolean;
  suggestion: Suggestion | null;
  recipes: RecipeSummary[];
  onClick: () => void;
}) {
  const recipe = suggestion ? recipes.find((r) => r.id === suggestion.recipeId) : undefined;

  // Rotate through the analyzing steps so the user can see it's actively
  // working (the host gives us no real progress events, so these are paced
  // hints). Reset to the first step whenever a new analysis starts.
  const [stepIdx, setStepIdx] = useState(0);
  useEffect(() => {
    if (!classifying) { setStepIdx(0); return; }
    const t = setInterval(() => {
      setStepIdx((i) => Math.min(i + 1, ANALYZING_STEPS.length - 1));
    }, 1400);
    return () => clearInterval(t);
  }, [classifying]);

  const sub = suggestion && recipe
    ? `→ ${suggestion.recipeId} (${suggestion.confidence}) · ${recipe.steps.join(' → ')}`
    : 'Enter an epic id (Jira key), a URL, or a description — I\'ll pick the pipeline automatically.';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex w-full flex-col items-start gap-0.5 overflow-hidden border-b border-border/50 px-2.5 py-2 text-left last:border-b-0 transition-colors',
        classifying
          ? 'bg-primary/10 ring-1 ring-inset ring-primary/50'
          : active ? 'bg-primary/10' : 'hover:bg-accent/40',
      )}
    >
      <div className="flex items-center gap-2">
        {classifying
          ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          : <Wand2 className="h-3 w-3 text-primary" />}
        <span className="text-[12px] font-medium text-foreground">Auto — suggest from task</span>
        {classifying ? (
          <span className="flex items-center gap-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Analyzing
          </span>
        ) : (
          <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            classifier
          </span>
        )}
      </div>
      {classifying ? (
        <div className="flex items-center gap-1.5 text-[10.5px] font-medium text-primary">
          <span>{ANALYZING_STEPS[stepIdx]}</span>
        </div>
      ) : (
        <div className="truncate text-[10.5px] text-muted-foreground">{sub}</div>
      )}
      {classifying && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-primary/15">
          <span className="block h-full w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
        </span>
      )}
    </button>
  );
}

function WorkflowRow({
  id, active, badge, suggested, stepCount, steps, description, onClick,
}: {
  id: string;
  active: boolean;
  badge?: string;
  suggested?: 'high' | 'medium' | 'low';
  stepCount: number;
  steps: string[];
  description?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full flex-col items-start gap-0.5 border-b border-border/50 px-2.5 py-1.5 text-left last:border-b-0',
        active ? 'bg-primary/10' : 'hover:bg-accent/40',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[12px] font-medium text-foreground">{id}</span>
        {badge && (
          <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
            {badge}
          </span>
        )}
        {suggested && (
          <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            ★ suggested · {suggested}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground">
          {stepCount} step{stepCount === 1 ? '' : 's'}
        </span>
      </div>
      {description && (
        <div className="truncate text-[10px] text-muted-foreground/90">{description}</div>
      )}
      <div className="truncate text-[10.5px] text-muted-foreground">{steps.join(' → ')}</div>
    </button>
  );
}

function NoPipelines({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col gap-2.5 p-3">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <ChevronRight className="h-3 w-3 shrink-0" />
        <span>No pipelines yet. Load the built-in SDLC pipeline or create your own.</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => postMessage({ type: 'initSdlcPreset' })}
          title="Apply the built-in AIDLC SDLC pipeline (installs its agents + skills). It'll appear here once applied."
          className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/15 px-3 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:border-primary/60 hover:bg-primary/25"
        >
          <Sparkles className="h-3 w-3" />
          Load SDLC pipeline example
        </button>
        <button
          type="button"
          onClick={() => {
            postMessage({ type: 'openAddPipeline' });
            onClose();
          }}
          title="Open the Add-pipeline form to build a custom workflow"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Plus className="h-3 w-3" />
          Create new pipeline
        </button>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) { return `${n} B`; }
  if (n < 1024 * 1024) { return `${(n / 1024).toFixed(1)} KB`; }
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
