import { Play, FileText, Settings, Terminal } from 'lucide-react';
import { postMessage } from '@/lib/bridge';
import type { WorkspaceState, TestAgentTarget } from '@/lib/types';

const PIPELINE_STEPS = [
  { id: 'explore',  label: 'Explore',  sub: 'observe target',    gate: false },
  { id: 'plan',     label: 'Plan',     sub: 'LLM → test plan',   gate: false },
  { id: 'confirm',  label: 'Confirm ✓', sub: 'human gate',        gate: true  },
  { id: 'generate', label: 'Generate', sub: 'specs + POMs',       gate: false },
  { id: 'execute',  label: 'Execute',  sub: 'stability gate',     gate: false },
  { id: 'heal',     label: 'Heal',     sub: 're-observe · retry', gate: false },
  { id: 'verdict',  label: 'Verdict',  sub: 'pass / fail',        gate: true  },
];

export function TestAgentView({ state }: { state: WorkspaceState }) {
  const configured = state.testAgentConfigExists ?? false;
  const targets = state.testAgentTargets ?? [];

  if (!configured) {
    return <SetupPrompt />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Test Agent</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">AI-powered E2E tests via aidlc-testagent</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => postMessage({ type: 'openTestAgentConfig' })}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Open testagent.config.yaml"
          >
            <Settings className="h-3.5 w-3.5" />
            Config
          </button>
          <button
            type="button"
            onClick={() => postMessage({ type: 'runTestAgent', command: 'validate' })}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            Validate all
          </button>
        </div>
      </div>

      {/* Pipeline diagram */}
      <div className="overflow-x-auto rounded-md border border-border bg-card px-5 py-4">
        <div className="flex items-start min-w-max">
          {PIPELINE_STEPS.map((step, i) => (
            <div key={step.id} className="flex items-start">
              <div className="flex flex-col items-center gap-1.5">
                <div className={`rounded-xl border px-3.5 py-1.5 text-xs font-medium whitespace-nowrap ${
                  step.gate
                    ? 'border-orange-400/60 bg-orange-50 text-orange-600 dark:border-orange-500/40 dark:bg-orange-950/30 dark:text-orange-400'
                    : 'border-border bg-background text-foreground'
                }`}>
                  {step.label}
                </div>
                <span className={`text-[10px] whitespace-nowrap ${
                  step.gate ? 'font-mono text-orange-500/80 dark:text-orange-400/70' : 'text-muted-foreground/60'
                }`}>
                  {step.sub}
                </span>
              </div>
              {i < PIPELINE_STEPS.length - 1 && (
                <span className="mt-2 px-2 text-sm text-muted-foreground/30">→</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Target list */}
      {targets.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center">
          <p className="text-xs text-muted-foreground">No targets found in testagent.config.yaml</p>
          <button
            type="button"
            onClick={() => postMessage({ type: 'openTestAgentConfig' })}
            className="mt-3 text-xs text-primary underline-offset-2 hover:underline"
          >
            Open config
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {targets.map((target) => (
            <TargetCard key={target.name} target={target} />
          ))}
        </div>
      )}
    </div>
  );
}

function TargetCard({ target }: { target: TestAgentTarget }) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <span className="text-sm font-medium text-foreground">{target.name}</span>
          {target.url && (
            <p className="text-xs text-muted-foreground truncate">{target.url}</p>
          )}
          {target.adapter && (
            <span className="inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {target.adapter}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => postMessage({ type: 'openTargetConfig', filePath: target.filePath })}
          className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title="Edit target config"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => postMessage({ type: 'runTestAgent', command: 'plan', target: target.name })}
          className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-muted-foreground border border-border hover:bg-accent hover:text-foreground transition-colors"
        >
          <FileText className="h-3 w-3" />
          Plan
        </button>
        <button
          type="button"
          onClick={() => postMessage({ type: 'runTestAgent', command: 'run', target: target.name })}
          className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Play className="h-3 w-3" />
          Run
        </button>
      </div>
    </div>
  );
}

function SetupPrompt() {
  return (
    <div className="rounded-md border border-dashed border-border bg-surface/50 p-6 text-center">
      <Terminal className="mx-auto h-8 w-8 text-muted-foreground" />
      <h2 className="mt-3 text-sm font-bold text-foreground">Test Agent not configured</h2>
      <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
        Create{' '}
        <code className="rounded bg-muted px-1 font-mono">testagent.config.yaml</code>
        {' '}in your project root to get started.
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <button
          type="button"
          onClick={() => postMessage({ type: 'runTestAgent', command: 'config' })}
          className="rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Run ata config
        </button>
        <button
          type="button"
          onClick={() => postMessage({ type: 'openExternalUrl', url: 'https://github.com/aidlc-io/aidlc-testagent#quickstart' })}
          className="rounded-md border border-border bg-card px-3.5 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Quickstart docs
        </button>
      </div>
    </div>
  );
}
