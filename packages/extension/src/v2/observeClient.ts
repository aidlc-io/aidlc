/**
 * Thin client for the agents-observe server
 * (https://github.com/simple10/agents-observe).
 *
 * agents-observe runs a local server (default :4981) that the Claude Code
 * plugin posts hook events to, and serves a React dashboard. We only read
 * from it — never write. Everything fails soft: if the server is off we return
 * a `serverUp: false` snapshot rather than throwing, so the status bar can stay
 * silent (no error popups).
 *
 * Endpoints were verified against agents-observe 0.9.11:
 *   GET /api/health    → { ok, version, runtime, dbPath, activeConsumers, activeClients }
 *   GET /api/db/stats  → { dbPath, sizeBytes, sessionCount, eventCount }
 * (There is no /api/status; the server also auto-shuts-down when idle, so
 * "off" is a normal, expected state between Claude Code sessions.)
 */

export const OBSERVE_PORT = 4981;
export const OBSERVE_HOST = '127.0.0.1';
export const OBSERVE_BASE = `http://${OBSERVE_HOST}:${OBSERVE_PORT}`;
export const HEALTH_URL = `${OBSERVE_BASE}/api/health`;
export const STATS_URL = `${OBSERVE_BASE}/api/db/stats`;
/** Browser/iframe-facing URL — uses localhost to match the dashboard's own links. */
export const DASHBOARD_URL = `http://localhost:${OBSERVE_PORT}`;

export interface ObserveStatus {
  serverUp: boolean;
  version: string | null;
  runtime: string | null;
  /** Live consumers (Claude Code sessions currently reporting events). */
  activeConsumers: number | null;
  /** Dashboard browser tabs currently connected. */
  activeClients: number | null;
  /** Total sessions recorded in the db. */
  sessionCount: number | null;
  /** Total events recorded in the db. */
  eventCount: number | null;
  error?: string;
}

export function offlineStatus(error?: string): ObserveStatus {
  return {
    serverUp: false,
    version: null,
    runtime: null,
    activeConsumers: null,
    activeClients: null,
    sessionCount: null,
    eventCount: null,
    error,
  };
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export async function fetchObserveStatus(timeoutMs = 4000): Promise<ObserveStatus> {
  let health: Record<string, unknown>;
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return offlineStatus(`HTTP ${res.status}`);
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || body.ok !== true) return offlineStatus('health not ok');
    health = body;
  } catch (e) {
    return offlineStatus(e instanceof Error ? e.message : String(e));
  }

  // Best-effort totals; never let a stats hiccup mark the server down.
  let stats: Record<string, unknown> = {};
  try {
    const res = await fetch(STATS_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (res.ok) stats = ((await res.json().catch(() => null)) as Record<string, unknown>) ?? {};
  } catch {
    /* ignore — counts just stay null */
  }

  return {
    serverUp: true,
    version: typeof health.version === 'string' ? health.version : null,
    runtime: typeof health.runtime === 'string' ? health.runtime : null,
    activeConsumers: num(health.activeConsumers),
    activeClients: num(health.activeClients),
    sessionCount: num(stats.sessionCount),
    eventCount: num(stats.eventCount),
  };
}
