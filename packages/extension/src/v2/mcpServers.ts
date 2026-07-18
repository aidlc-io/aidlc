/**
 * Discover the MCP servers Claude is currently connected to by spawning
 * `claude mcp list` and parsing stdout. The CLI runs a health check, so
 * the call can take several seconds — callers should treat it as async
 * and show a loading state while waiting.
 *
 * Output format is line-oriented and unstable in detail; we parse what we
 * can and fall back to a raw `unknown` status for lines that don't match.
 *
 *   claude.ai Audible: https://mcp.audible.com/mcp - ✓ Connected
 *   claude.ai Spotify: https://… - ✗ Failed to connect
 *   atlassian: https://mcp.atlassian.com/v1/sse (HTTP) - ! Needs authentication
 */
import { execFile } from 'child_process';

export type McpStatus = 'connected' | 'needs_auth' | 'failed' | 'unknown';

export interface McpServerInfo {
  name: string;
  /** URL for HTTP/SSE servers, command line for stdio. May be empty if parsing failed. */
  endpoint: string;
  /** Transport hint when the CLI prints one (e.g. "HTTP"). Empty otherwise. */
  transport: string;
  status: McpStatus;
  /** Verbatim status text from the CLI ("Connected", "Needs authentication"…). */
  statusText: string;
}

export interface McpListResult {
  servers: McpServerInfo[];
  /** Non-null when the spawn itself failed (claude not on PATH, timeout, etc.). */
  error: string | null;
}

/**
 * Default budget for `claude mcp list`. The CLI health-checks every approved
 * server, so the wall time scales with how many servers are configured and how
 * many are remote / unauthenticated / failing. A busy setup can take 40s+, so
 * the old 20s budget routinely expired and surfaced a misleading error
 * (issue #61). Overridable via the `aidlc.mcp.listTimeoutSeconds` setting.
 */
export const DEFAULT_LIST_TIMEOUT_MS = 90_000;

const LINE_RE = /^(.+?):\s+(\S+)(?:\s+\(([^)]+)\))?\s+-\s+(.+)$/;

export async function loadMcpServers(
  claudeBin = 'claude',
  timeoutMs = DEFAULT_LIST_TIMEOUT_MS,
): Promise<McpListResult> {
  return new Promise((resolve) => {
    execFile(
      claudeBin,
      ['mcp', 'list'],
      { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, env: process.env },
      (err, stdout, stderr) => {
        if (err) {
          resolve(describeSpawnError(err, stdout || '', stderr || '', claudeBin, timeoutMs));
          return;
        }
        resolve({ servers: parseMcpListOutput(stdout), error: null });
      },
    );
  });
}

/** Error object shape Node passes to the `execFile` callback on failure. */
export interface SpawnError extends Error {
  /** `'ENOENT'`, `'ETIMEDOUT'`, … for spawn errors; a numeric exit code otherwise. */
  code?: string | number | null;
  /** `true` when Node killed the child (e.g. because it exceeded `timeout`). */
  killed?: boolean;
  /** Signal used to kill the child; `'SIGTERM'` on a timeout kill. */
  signal?: NodeJS.Signals | null;
}

/**
 * Map an `execFile` failure to an {@link McpListResult}. Exported for testing.
 *
 * Node kills a child that exceeds `timeout` with SIGTERM and sets
 * `err.killed === true` / `err.signal === 'SIGTERM'` — it does **not** set
 * `err.code === 'ETIMEDOUT'` in that case. The original code only checked for
 * the `ETIMEDOUT` code, so a real timeout fell through to `err.message`
 * ("Command failed: claude mcp list") and was reported as an opaque failure
 * (issue #61). We now treat a SIGTERM-kill as a timeout and still return any
 * servers already parsed from partial stdout.
 */
export function describeSpawnError(
  err: SpawnError,
  stdout: string,
  stderr: string,
  claudeBin: string,
  timeoutMs: number,
): McpListResult {
  if (err.code === 'ENOENT') {
    return { servers: [], error: `\`${claudeBin}\` not found on PATH` };
  }
  const timedOut = err.code === 'ETIMEDOUT' || err.killed === true || err.signal === 'SIGTERM';
  if (timedOut) {
    const seconds = Math.round(timeoutMs / 1000);
    return {
      servers: parseMcpListOutput(stdout),
      error:
        `\`${claudeBin} mcp list\` timed out after ${seconds}s. ` +
        'Claude health-checks every configured MCP server; this can be slow with ' +
        'many remote or unauthenticated servers. Increase ' +
        '`aidlc.mcp.listTimeoutSeconds` or remove unused servers.',
    };
  }
  return {
    servers: parseMcpListOutput(stdout),
    error: stderr.trim() || err.message,
  };
}

export function parseMcpListOutput(stdout: string): McpServerInfo[] {
  const out: McpServerInfo[] = [];
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { continue; }
    if (line.startsWith('Checking MCP server health')) { continue; }
    if (line.startsWith('No MCP servers')) { continue; }
    const m = LINE_RE.exec(line);
    if (!m) { continue; }
    const [, name, endpoint, transport, statusText] = m;
    out.push({
      name: name.trim(),
      endpoint: endpoint.trim(),
      transport: (transport ?? '').trim(),
      status: classifyStatus(statusText),
      statusText: statusText.trim(),
    });
  }
  return out;
}

function classifyStatus(text: string): McpStatus {
  const t = text.toLowerCase();
  if (t.includes('connected') && !t.includes('failed')) { return 'connected'; }
  if (t.includes('authentication') || t.includes('auth ')) { return 'needs_auth'; }
  if (t.includes('failed')) { return 'failed'; }
  return 'unknown';
}
