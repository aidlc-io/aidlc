import { useState, useCallback } from 'react';
import {
  Bot,
  GitBranch,
  Zap,
  Layers,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Beaker,
  FileCode2,
  Play,
  X,
  Sparkles,
  Diamond,
  RefreshCw,
  Plug,
  Loader2,
  HelpCircle,
  ListTree,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  SidebarState,
  RecentEpicRef,
  TemplateRef,
  McpServerInfo,
} from '@/lib/types';
import { ConfirmModal } from './ConfirmModal';
import { SavePresetModal } from './SavePresetModal';
import { LoadDemoModal } from './LoadDemoModal';
import { ThemeToggle } from './ThemeToggle';
import { postMessage, getPersistedUi, setPersistedUi } from '@/lib/bridge';

interface CollapseState {
  recentEpics: boolean;
  workflows: boolean;
  mcpServers: boolean;
}

interface PersistedUi {
  collapsed?: Partial<CollapseState>;
}

const DEFAULT_COLLAPSED: CollapseState = {
  recentEpics: false,
  workflows: false,
  mcpServers: true,
};

export function AppSidebar({ state }: { state: SidebarState | null }) {
  const seed = (getPersistedUi<PersistedUi>() ?? {});
  const [collapsed, setCollapsed] = useState<CollapseState>({
    ...DEFAULT_COLLAPSED,
    ...(seed.collapsed ?? {}),
  });
  const persist = useCallback(
    (next: { collapsed?: CollapseState }) => {
      const merged: PersistedUi = {
        collapsed: next.collapsed ?? collapsed,
      };
      setPersistedUi(merged);
    },
    [collapsed],
  );

  const toggleSection = (key: keyof CollapseState) => {
    const next = { ...collapsed, [key]: !collapsed[key] };
    setCollapsed(next);
    persist({ collapsed: next });
  };

  if (!state) {
    return (
      <aside className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          Loading…
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <BrandIcon />
          <div className="min-w-0">
            <h2 className="text-[11px] font-bold tracking-widest uppercase">AIDLC</h2>
            <p className="truncate text-[10px] text-muted-foreground">Agent workflow runner</p>
          </div>
        </div>
        <ThemeToggle />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        <AskButton />
        {!state.hasFolder ? (
          <EmptyNoFolder demoProjectExists={state.demoProjectExists} />
        ) : (
          <>
            <ProjectBar workspaceName={state.workspaceName} configExists={state.configExists} />
            {state.configExists && (
              <button
                type="button"
                onClick={() => postMessage({ type: 'openYaml' })}
                className="flex w-full items-center gap-2 rounded-md border border-border bg-card/50 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <FileCode2 className="h-3.5 w-3.5" />
                <span>Open workspace.yaml</span>
              </button>
            )}

            {!state.configExists && (
              <div className="rounded-md border border-dashed border-border bg-surface/50 p-3 text-[11px] text-muted-foreground leading-relaxed">
                No <code className="rounded bg-primary/10 px-1 py-0.5 font-mono text-primary">workspace.yaml</code> yet — open the Builder from the title bar to scaffold one.
              </div>
            )}

            {/* Analyze Requirements — always visible when a folder is open */}
            <button
              type="button"
              onClick={() => postMessage({ type: 'openAnalyzeView' })}
              className="flex w-full items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <ListTree className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Analyze Requirements</span>
              <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-50" />
            </button>

            {state.configExists && (
              <>
                <button
                  type="button"
                  onClick={() => postMessage({ type: 'requestStartEpic' })}
                  className="flex w-full items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>Start Epic</span>
                  <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-70" />
                </button>

                <StatsGrid state={state} />

                {state.recentEpics.length > 0 && (
                  <RecentEpicsSection
                    epics={state.recentEpics}
                    epicsCount={state.epicsCount}
                    collapsed={collapsed.recentEpics}
                    onToggle={() => toggleSection('recentEpics')}
                  />
                )}
              </>
            )}

            <WorkflowsSection
              builtins={state.builtinTemplates}
              project={state.projectTemplates}
              configExists={state.configExists}
              workspaceName={state.workspaceName}
              collapsed={collapsed.workflows}
              onToggle={() => toggleSection('workflows')}
            />

            <McpServersSection
              servers={state.mcpServers}
              loading={state.mcpLoading}
              error={state.mcpError}
              collapsed={collapsed.mcpServers}
              onToggle={() => toggleSection('mcpServers')}
            />
          </>
        )}
      </div>

      <Footer hasFolder={state.hasFolder} />

    </aside>
  );
}

function AskButton() {
  // Always visible — the whole point is helping users understand the
  // extension and how to set it up, which matters most *before* a workspace
  // exists. Routes to the host `aidlc.ask` command (prompts → claude → preview).
  return (
    <button
      type="button"
      onClick={() => postMessage({ type: 'askAidlc' })}
      title="Ask Claude about AIDLC — what it does, how to set it up"
      className="flex w-full items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
    >
      <HelpCircle className="h-3.5 w-3.5" />
      <span>Ask AIDLC</span>
      <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-70" />
    </button>
  );
}

function BrandIcon() {
  const uri = typeof window !== 'undefined' ? window.BRAND_ICON_URI : undefined;
  if (uri) {
    return (
      <img
        src={uri}
        alt="AIDLC"
        className="h-7 w-7 shrink-0 rounded-md object-cover shadow-md shadow-primary/20"
      />
    );
  }
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
      <Bot className="h-3.5 w-3.5" />
    </div>
  );
}

function ProjectBar({
  workspaceName,
  configExists,
}: {
  workspaceName: string;
  configExists: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => postMessage({ type: 'openBuilder' })}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          postMessage({ type: 'openBuilder' });
        }
      }}
      className="group flex cursor-pointer items-center gap-2 rounded-md border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 px-3 py-2 transition-all hover:border-primary/40 hover:from-primary/20 hover:to-primary/10"
      title="Click to open Builder"
    >
      <Layers className="h-3.5 w-3.5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-bold tracking-wide text-primary">{workspaceName}</div>
        {!configExists && (
          <div className="text-[10px] text-muted-foreground">no workspace.yaml</div>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          postMessage({ type: 'openProject' });
        }}
        title="Switch project"
        className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-primary/20 hover:text-primary"
      >
        <FolderOpen className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          postMessage({ type: 'closeProject' });
        }}
        title="Close project"
        className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function EmptyNoFolder({ demoProjectExists }: { demoProjectExists: boolean }) {
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const onLoadDemo = () => {
    if (demoProjectExists) {
      // Pop the inline picker — replaces the VS Code notification chrome
      // that the host would otherwise show when the dir already exists.
      setDemoModalOpen(true);
    } else {
      // Fresh install — just create + open. No prompt needed.
      postMessage({ type: 'loadDemoProject' });
    }
  };
  return (
    <div className="rounded-md border border-dashed border-border bg-surface/50 p-4 text-center">
      <h3 className="mb-1.5 text-xs font-bold tracking-wide">No project open</h3>
      <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
        Open a folder to start building agents and workflows — or load the demo project.
      </p>
      <button
        type="button"
        onClick={() => postMessage({ type: 'openProject' })}
        className="flex w-full items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <FolderOpen className="h-3.5 w-3.5" />
        <span>Open Project</span>
        <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-70" />
      </button>
      <button
        type="button"
        onClick={onLoadDemo}
        className="mt-2 flex w-full items-center gap-2 rounded-md border border-border bg-card/50 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Beaker className="h-3.5 w-3.5" />
        <span>Load Demo Project</span>
      </button>
      {demoModalOpen && (
        <LoadDemoModal
          onChoose={(mode) => postMessage({ type: 'loadDemoProject', mode })}
          onClose={() => setDemoModalOpen(false)}
        />
      )}
    </div>
  );
}

function StatsGrid({ state }: { state: SidebarState }) {
  // Each tile doubles as navigation: Agents/Skills/Flows deep-link into the
  // matching Builder tab, while Epics opens the dedicated top-level Epics view
  // (the Builder no longer has an Epics tab).
  const stats: { label: string; value: number; onClick: () => void }[] = [
    {
      label: 'Agents',
      value: state.agentsCount,
      onClick: () => postMessage({ type: 'openBuilderTab', tab: 'agents' }),
    },
    {
      label: 'Skills',
      value: state.skillsCount,
      onClick: () => postMessage({ type: 'openBuilderTab', tab: 'skills' }),
    },
    {
      label: 'Flows',
      value: state.pipelinesCount,
      onClick: () => postMessage({ type: 'openBuilderTab', tab: 'workflows' }),
    },
    {
      label: 'Epics',
      value: state.epicsCount,
      onClick: () => postMessage({ type: 'openEpicsList' }),
    },
  ];
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {stats.map((s) => (
        <button
          key={s.label}
          type="button"
          onClick={s.onClick}
          title={`Open ${s.label}`}
          className="flex flex-col items-center gap-0.5 rounded-md border border-border bg-card/50 px-1 py-2 transition-colors hover:border-primary/40 hover:bg-accent"
        >
          <span className="font-mono text-base font-bold tabular-nums text-primary leading-none">
            {s.value}
          </span>
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
            {s.label}
          </span>
        </button>
      ))}
    </div>
  );
}

function SectionHeader({
  label,
  collapsed,
  onToggle,
  trailing,
}: {
  label: string;
  collapsed: boolean;
  onToggle: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex flex-1 items-center gap-1.5 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
      >
        <ChevronDown
          className={cn('h-3 w-3 transition-transform', collapsed && '-rotate-90')}
        />
        <span>{label}</span>
      </button>
      {trailing}
    </div>
  );
}

function RecentEpicsSection({
  epics,
  epicsCount,
  collapsed,
  onToggle,
}: {
  epics: RecentEpicRef[];
  epicsCount: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <SectionHeader
        label="Recent Epics"
        collapsed={collapsed}
        onToggle={onToggle}
        trailing={
          <button
            type="button"
            onClick={() => postMessage({ type: 'openEpicsList' })}
            className="text-[10px] text-muted-foreground hover:text-primary"
          >
            All {epicsCount} →
          </button>
        }
      />
      {!collapsed && (
        <div className="mt-1.5 space-y-1">
          {epics.map((e) => (
            <div
              key={e.id}
              role="button"
              tabIndex={0}
              onClick={() => postMessage({ type: 'openEpicState', path: e.statePath })}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault();
                  postMessage({ type: 'openEpicState', path: e.statePath });
                }
              }}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card/50 px-2.5 py-1.5 text-[11px] transition-colors hover:bg-accent"
            >
              <EpicDot status={e.status} />
              <span className="font-mono text-[10px] font-bold text-primary truncate">{e.id}</span>
              {e.title && (
                <span className="truncate text-muted-foreground">· {e.title}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EpicDot({ status }: { status: string }) {
  const cls = (() => {
    switch (status) {
      case 'in_progress':
        return 'bg-warning shadow-[0_0_4px_var(--color-warning)]';
      case 'done':
        return 'bg-success';
      case 'failed':
        return 'bg-destructive';
      default:
        return 'bg-muted-foreground/40';
    }
  })();
  return <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', cls)} />;
}

function McpServersSection({
  servers,
  loading,
  error,
  collapsed,
  onToggle,
}: {
  servers: McpServerInfo[] | null;
  loading: boolean;
  error: string | null;
  collapsed: boolean;
  onToggle: () => void;
}) {
  // Show counts in the header so users can glance the connected total
  // without expanding. servers === null means the list hasn't loaded yet.
  const total = servers?.length ?? 0;
  const connected = servers?.filter((s) => s.status === 'connected').length ?? 0;
  return (
    <div>
      <SectionHeader
        label="MCP servers"
        collapsed={collapsed}
        onToggle={onToggle}
        trailing={
          <div className="flex items-center gap-1.5">
            {servers && (
              <span className="text-[10px] text-muted-foreground">
                {connected}/{total}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                postMessage({ type: 'refreshMcp' });
              }}
              title="Re-run claude mcp list"
              className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </button>
          </div>
        }
      />
      {!collapsed && (
        <div className="mt-1.5 space-y-1">
          {error && (
            <div className="rounded border-l-2 border-destructive bg-destructive/5 px-2 py-1.5 text-[10px] text-muted-foreground">
              {error}
            </div>
          )}
          {servers === null && !error && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Querying claude mcp list…</span>
            </div>
          )}
          {servers && servers.length === 0 && !error && (
            <div className="px-2.5 py-1.5 text-[10px] text-muted-foreground">
              No MCP servers configured.
            </div>
          )}
          {servers?.map((s) => <McpRow key={s.name} server={s} />)}
        </div>
      )}
    </div>
  );
}

const MCP_DOT: Record<McpServerInfo['status'], string> = {
  connected: 'bg-success shadow-[0_0_4px_var(--color-success)]',
  needs_auth: 'bg-warning',
  failed: 'bg-destructive',
  unknown: 'bg-muted-foreground/40',
};

function McpRow({ server }: { server: McpServerInfo }) {
  const titleParts = [server.statusText];
  if (server.transport) { titleParts.push(server.transport); }
  if (server.endpoint) { titleParts.push(server.endpoint); }
  return (
    <div
      className="flex items-center gap-2 rounded-md border border-border bg-card/50 px-2.5 py-1.5 text-[11px]"
      title={titleParts.join(' · ')}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', MCP_DOT[server.status])} />
      <Plug className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="truncate font-medium text-foreground">{server.name}</span>
      <span className="ml-auto shrink-0 truncate text-[9px] uppercase tracking-wider text-muted-foreground">
        {server.status === 'needs_auth' ? 'auth' : server.status}
      </span>
    </div>
  );
}


function WorkflowsSection({
  builtins,
  project,
  configExists,
  workspaceName,
  collapsed,
  onToggle,
}: {
  builtins: TemplateRef[];
  project: TemplateRef[];
  configExists: boolean;
  workspaceName: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [pendingApply, setPendingApply] = useState<TemplateRef | null>(null);

  if (builtins.length === 0 && project.length === 0 && !configExists) { return null; }

  const onApplyClick = (template: TemplateRef) => {
    if (configExists) {
      setPendingApply(template);
    } else {
      postMessage({ type: 'applyTemplate', id: template.id, skipConfirm: true });
    }
  };

  return (
    <div>
      <SectionHeader label="Workflows" collapsed={collapsed} onToggle={onToggle} />
      {!collapsed && (
        <div className="mt-1.5 space-y-1.5">
          {configExists && (
            <button
              type="button"
              onClick={() => setSaveOpen(true)}
              className="flex w-full items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <Diamond className="h-3 w-3" />
              <span>Save current as template</span>
            </button>
          )}
          {builtins.length > 0 && (
            <>
              <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                Common
              </div>
              {builtins.map((t) => (
                <TemplateRow key={t.id} template={t} builtin onApply={onApplyClick} />
              ))}
            </>
          )}
          {project.length > 0 && (
            <>
              <div className="mt-2 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                Custom
              </div>
              {project.map((t) => (
                <TemplateRow key={t.id} template={t} builtin={false} onApply={onApplyClick} />
              ))}
            </>
          )}
        </div>
      )}

      {saveOpen && (
        <SavePresetModal
          existingProjectIds={project.map((p) => p.id)}
          builtinIds={builtins.map((b) => b.id)}
          defaultId={workspaceName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '')}
          defaultName={workspaceName}
          onSubmit={(draft) => postMessage({ type: 'savePresetInline', draft })}
          onClose={() => setSaveOpen(false)}
        />
      )}
      {pendingApply && (
        <ConfirmModal
          title="Apply template"
          danger
          confirmLabel="Overwrite & apply"
          message={
            <>
              This project already has <span className="font-mono">.aidlc/workspace.yaml</span>.
              Overwrite with template <span className="font-mono">{pendingApply.id}</span>?
            </>
          }
          onConfirm={() =>
            postMessage({ type: 'applyTemplate', id: pendingApply.id, skipConfirm: true })
          }
          onClose={() => setPendingApply(null)}
        />
      )}
    </div>
  );
}

function TemplateRow({
  template,
  builtin,
  onApply,
}: {
  template: TemplateRef;
  builtin: boolean;
  onApply: (template: TemplateRef) => void;
}) {
  const Icon = builtin ? Sparkles : Diamond;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onApply(template)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onApply(template);
        }
      }}
      title={`Apply template ${template.id}`}
      className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card/50 px-2.5 py-1.5 text-[11px] transition-colors hover:bg-accent"
    >
      <Icon className="h-3 w-3 shrink-0 text-primary opacity-80" />
      <span className="shrink-0 font-semibold text-primary truncate max-w-[40%]">
        {template.name}
      </span>
      <span className="truncate text-muted-foreground">· {template.description || template.id}</span>
    </div>
  );
}

function Footer({ hasFolder }: { hasFolder: boolean }) {
  const v = typeof window !== 'undefined' ? window.EXTENSION_VERSION : undefined;
  return (
    <div className="border-t border-sidebar-border px-3 py-2 text-center text-[10px] text-muted-foreground">
      {v && <span className="font-mono">v{v}</span>}
      {v && hasFolder && <span className="mx-1.5">·</span>}
      {hasFolder ? (
        <>
          <button
            type="button"
            onClick={() => postMessage({ type: 'openBuilder' })}
            className="hover:text-primary"
          >
            Builder
          </button>
          <span className="mx-1.5">·</span>
          <button
            type="button"
            onClick={() => postMessage({ type: 'refresh' })}
            className="hover:text-primary"
          >
            <RefreshCw className="inline h-2.5 w-2.5 align-text-bottom" /> Refresh
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => postMessage({ type: 'openProject' })}
          className="hover:text-primary"
        >
          Open Project
        </button>
      )}
    </div>
  );
}

// Suppress unused-import warning when GitBranch / Zap are not directly used
// (they may be used by future stat icons; keeping references to avoid churn).
const _ICON_REFS = { GitBranch, Zap };
void _ICON_REFS;
