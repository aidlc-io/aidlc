/**
 * Unified "AIDLC Monitor" panel — one screen, two tabs:
 *   • Token Usage — reuses the existing TokenReportView (claude token spend)
 *   • Agents      — agents-observe live summary + embedded dashboard
 *
 * Both tabs live in a single React app so there is exactly one
 * acquireVsCodeApi() owner. The host pushes two independent streams:
 *   { type: 'state', state }        → token report (via useHostState)
 *   { type: 'agentStatus', state }  → agents tab
 */
import { StrictMode, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { TokenReportView } from '../components/TokenReportView';
import { AgentsView } from '../components/AgentsView';
import { useHostState } from '../hooks/useHostState';
import { useThemeBridge } from '../hooks/useThemeBridge';
import { onHostMessage } from '../lib/bridge';
import { cn } from '../lib/utils';
import type { TokenReportPanelState, MonitorAgentsState, MonitorTab } from '../lib/types';
import '../styles.css';

function useAgentsState(): MonitorAgentsState | null {
  const [state, setState] = useState<MonitorAgentsState | null>(null);
  useEffect(
    () =>
      onHostMessage((msg) => {
        if (msg.type === 'agentStatus' && msg.state !== undefined) {
          setState(msg.state as MonitorAgentsState);
        }
      }),
    [],
  );
  return state;
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-secondary text-foreground'
          : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function App() {
  useThemeBridge();
  const tokenState = useHostState<TokenReportPanelState>();
  const agentsState = useAgentsState();

  const initialTab: MonitorTab =
    (typeof window !== 'undefined' && window.__AIDLC_MONITOR_TAB__) || 'tokens';
  const [tab, setTab] = useState<MonitorTab>(initialTab);

  // Host can switch the active tab when re-revealing an already-open panel.
  useEffect(
    () =>
      onHostMessage((msg) => {
        if (msg.type === 'switchTab' && (msg.tab === 'tokens' || msg.tab === 'agents')) {
          setTab(msg.tab);
        }
      }),
    [],
  );

  const agentsBadge = agentsState?.status.serverUp
    ? agentsState.status.activeConsumers ?? 0
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/80 px-6 py-2.5 backdrop-blur-sm">
        <TabButton active={tab === 'tokens'} onClick={() => setTab('tokens')}>
          Token Usage
        </TabButton>
        <TabButton active={tab === 'agents'} onClick={() => setTab('agents')}>
          Agents
          {agentsBadge != null && agentsBadge > 0 && (
            <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
              {agentsBadge}
            </span>
          )}
        </TabButton>
      </div>

      {/* Keep both panes mounted (display-toggled) so the token report and the
          embedded dashboard iframe don't reload on every tab switch. */}
      <div className={tab === 'tokens' ? 'block' : 'hidden'}>
        <TokenReportView state={tokenState} />
      </div>
      <div className={tab === 'agents' ? 'block' : 'hidden'}>
        <AgentsView state={agentsState} />
      </div>
    </div>
  );
}

const root = document.getElementById('app');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
