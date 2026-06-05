/**
 * "Agents" tab of the unified Monitor panel — surfaces the agents-observe
 * server (https://github.com/simple10/agents-observe).
 *
 * Layout (per design): a compact live summary on top (sessions / running
 * sessions / events, polled from /api/health + /api/db/stats by the host) and the full
 * React dashboard embedded as an iframe below. When the server is off we show
 * a "Start Monitor" action instead of the iframe — never an error popup.
 */
import { ExternalLink, RefreshCw, Loader2, Play, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MonitorAgentsState } from '@/lib/types';
import { postMessage } from '@/lib/bridge';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-mono text-sm text-foreground">{value}</span>
    </div>
  );
}

export function AgentsView({ state }: { state: MonitorAgentsState | null }) {
  if (!state) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connecting to agents-observe…
      </div>
    );
  }

  const { status, dashboardUrl, dataDir } = state;
  const up = status.serverUp;

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      {/* ── Summary bar ──────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-6 rounded-md border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-block h-2.5 w-2.5 rounded-full',
              up ? 'bg-green-500' : 'bg-muted-foreground/40',
            )}
          />
          <span className="text-sm font-medium text-foreground">
            {up ? 'Server online' : 'Server off'}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">{dashboardUrl}</span>
        </div>

        {up && (
          <>
            <Stat label="Live sessions" value={status.activeConsumers != null ? String(status.activeConsumers) : '—'} />
            <Stat label="Sessions (total)" value={status.sessionCount != null ? String(status.sessionCount) : '—'} />
            <Stat label="Events" value={status.eventCount != null ? String(status.eventCount) : '—'} />
            <Stat label="Dashboard tabs" value={status.activeClients != null ? String(status.activeClients) : '—'} />
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => postMessage({ type: 'refreshAgents' })}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-secondary"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          {up ? (
            <button
              onClick={() => postMessage({ type: 'openExternal' })}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:opacity-90"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open full dashboard
            </button>
          ) : (
            <button
              onClick={() => postMessage({ type: 'startMonitor' })}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:opacity-90"
            >
              <Play className="h-3.5 w-3.5" /> Start Monitor
            </button>
          )}
        </div>
      </div>

      {/* ── Embedded dashboard / off-state ───────────────────────────── */}
      {up ? (
        <div className="overflow-hidden rounded-md border border-border">
          <iframe
            title="agents-observe dashboard"
            src={dashboardUrl}
            className="h-[70vh] w-full bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>
      ) : (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-card/40 p-8 text-center">
          <Activity className="h-8 w-8 text-muted-foreground/60" />
          <div className="text-sm font-medium text-foreground">agents-observe isn’t running</div>
          <p className="max-w-md text-xs text-muted-foreground">
            The observe server (default <span className="font-mono">:4981</span>) isn’t reachable.
            It autostarts when a Claude Code session begins with the{' '}
            <span className="font-mono">agents-observe</span> plugin installed. Click{' '}
            <span className="font-medium">Start Monitor</span> to run the setup check in a terminal.
          </p>
          <button
            onClick={() => postMessage({ type: 'startMonitor' })}
            className="mt-1 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90"
          >
            <Play className="h-3.5 w-3.5" /> Start Monitor
          </button>
        </div>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">
        Data dir: <span className="font-mono">{dataDir}</span>
        {' · '}
        If the embedded view stays blank, the dashboard may block embedding — use{' '}
        <span className="font-medium">Open full dashboard</span>.
      </p>
    </div>
  );
}
