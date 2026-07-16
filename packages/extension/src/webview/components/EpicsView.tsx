import { useEffect, useState, useMemo } from 'react';
import { Plus, Brain, FolderOpen, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkspaceState, EpicSummary, EpicFilter } from '@/lib/types';
import { EpicCard } from './EpicCard';
import { StartEpicModal } from './StartEpicModal';
import { postMessage, onHostMessage } from '@/lib/bridge';

const FILTERS: { id: EpicFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'pending', label: 'Pending' },
  { id: 'done', label: 'Done' },
  { id: 'failed', label: 'Failed' },
];

function matches(epic: EpicSummary, filter: EpicFilter): boolean {
  if (filter === 'all') { return true; }
  return epic.status === filter;
}

export function EpicsView({ state }: { state: WorkspaceState }) {
  const [filter, setFilter] = useState<EpicFilter>('all');
  const [startEpicOpen, setStartEpicOpen] = useState(false);

  useEffect(() => {
    return onHostMessage((msg) => {
      if (msg.type === 'triggerStartEpic') {
        setStartEpicOpen(true);
      }
    });
  }, []);

  const counts = useMemo(() => {
    const out: Record<EpicFilter, number> = {
      all: state.epics.length,
      in_progress: 0,
      pending: 0,
      done: 0,
      failed: 0,
    };
    for (const e of state.epics) { out[e.status] = (out[e.status] ?? 0) + 1; }
    return out;
  }, [state.epics]);

  const visible = useMemo(
    () => state.epics.filter((e) => matches(e, filter)),
    [state.epics, filter],
  );

  const [editingDir, setEditingDir] = useState(false);
  const [dirDraft, setDirDraft] = useState(state.epicsDir);

  useEffect(() => { setDirDraft(state.epicsDir); }, [state.epicsDir]);

  const commitDirChange = () => {
    const val = dirDraft.trim();
    if (val && val !== state.epicsDir) {
      postMessage({ type: 'changeEpicsDir', dir: val });
    }
    setEditingDir(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">AIDLC Epics</h1>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <FolderOpen className="h-3 w-3 shrink-0" />
            {editingDir ? (
              <span className="flex items-center gap-1">
                <input
                  type="text"
                  value={dirDraft}
                  autoFocus
                  onChange={(e) => setDirDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitDirChange(); }
                    if (e.key === 'Escape') { setEditingDir(false); setDirDraft(state.epicsDir); }
                  }}
                  onBlur={commitDirChange}
                  className="w-40 rounded border border-border bg-input/50 px-1.5 py-0.5 font-mono text-[11px] text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <span className="font-mono text-[11px]">{state.epicsDir}</span>
                <button
                  type="button"
                  onClick={() => setEditingDir(true)}
                  title="Edit epics directory"
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
                <button
                  type="button"
                  onClick={() => postMessage({ type: 'browseEpicsDir' })}
                  title="Browse for epics directory"
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <FolderOpen className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              postMessage({ type: 'toggleEpicMemoryHook', enabled: !state.epicMemoryHookEnabled })
            }
            title={
              state.epicMemoryHookEnabled
                ? 'Epic-memory auto-load is ON — prompts mentioning an epic auto-load its memory. Click to turn off.'
                : 'Turn ON epic-memory auto-load — a Claude Code hook injects an epic’s memory whenever a prompt refers to it.'
            }
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors',
              state.epicMemoryHookEnabled
                ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            <Brain className="h-3.5 w-3.5" />
            Memory auto-load: {state.epicMemoryHookEnabled ? 'On' : 'Off'}
          </button>
          <button
            type="button"
            onClick={() => setStartEpicOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Start Epic
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              filter === f.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-accent',
            )}
          >
            {f.label}
            <span
              className={cn(
                'text-[10px] tabular-nums',
                filter === f.id ? 'text-primary-foreground/70' : 'text-muted-foreground',
              )}
            >
              {counts[f.id]}
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-surface/50 p-6 text-center text-xs text-muted-foreground">
          {filter === 'all' ? 'No epics yet.' : `No ${filter.replace('_', ' ')} epics.`}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((e) => (
            <EpicCard
              key={e.id}
              epic={e}
              agentMeta={state.agentMeta}
              slashCommandsByAgent={state.slashCommandsByAgent}
            />
          ))}
        </div>
      )}

      {startEpicOpen && (
        <StartEpicModal
          pipelines={state.pipelines}
          recipes={state.recipes ?? []}
          agentMeta={state.agentMeta}
          nextEpicId={state.nextEpicId}
          existingEpicIds={state.existingEpicIds}
          epicsDir={state.epicsDir}
          isFirstEpic={state.epics.length === 0}
          onSubmit={(draft) => postMessage({ type: 'startEpicInline', draft })}
          onClose={() => setStartEpicOpen(false)}
        />
      )}
    </div>
  );
}
