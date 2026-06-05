/**
 * `aidlc monitor` — set up and inspect agent observability via
 * agents-observe (https://github.com/simple10/agents-observe).
 *
 * agents-observe is a standalone Claude Code plugin: once installed via
 * `claude plugin install`, it registers its own lifecycle hooks (through the
 * plugin's hooks.json, scoped by ${CLAUDE_PLUGIN_ROOT}) and autostarts its
 * server on SessionStart. We deliberately do NOT hand-merge hook commands
 * into ~/.claude/settings.json — that would duplicate the plugin's hooks and
 * risk clobbering other plugins (e.g. claude-token-monitor). The only
 * settings.json change we make is pinning a stable data dir via the `env`
 * key so the SQLite db survives plugin upgrades.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync, exec, spawn } from 'child_process';
import { Command } from 'commander';
import chalk from 'chalk';

const OBSERVE_PORT = 4981;
const OBSERVE_HOST = '127.0.0.1';
const OBSERVE_BASE = `http://${OBSERVE_HOST}:${OBSERVE_PORT}`;
const HEALTH_URL = `${OBSERVE_BASE}/api/health`;
const STATS_URL = `${OBSERVE_BASE}/api/db/stats`;
const DASHBOARD_URL = `http://localhost:${OBSERVE_PORT}`;
const DATA_ENV_KEY = 'AGENTS_OBSERVE_LOCAL_DATA_ROOT';

/** Stable data dir that survives plugin upgrades (db lives at <dir>/data/observe.db). */
function aidlcDataDir(): string {
  return path.join(os.homedir(), '.aidlc', 'observe-data');
}

function settingsPath(): string {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

/** Detect whether the agents-observe Claude Code plugin is installed. */
function detectPlugin(): { installed: boolean; detail: string } {
  // 1) Authoritative: ask the claude CLI.
  try {
    const out = execSync('claude plugin list', {
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (/agents-observe/i.test(out)) {
      return { installed: true, detail: 'claude plugin list' };
    }
    // claude answered but the plugin isn't there.
    return { installed: false, detail: 'not in `claude plugin list`' };
  } catch {
    // `claude plugin list` unavailable (older CLI) — fall through to fs scan.
  }

  // 2) Fallback: look for the plugin on disk under ~/.claude/plugins.
  const pluginsRoot = path.join(os.homedir(), '.claude', 'plugins');
  try {
    const hit = scanForPlugin(pluginsRoot, 3);
    if (hit) return { installed: true, detail: hit };
  } catch {
    /* ignore */
  }
  return { installed: false, detail: 'no plugin dir found under ~/.claude/plugins' };
}

/** Shallow recursive scan for a dir/file whose name contains "agents-observe". */
function scanForPlugin(dir: string, depth: number): string | null {
  if (depth < 0 || !fs.existsSync(dir)) return null;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    if (/agents-observe/i.test(e.name)) return path.join(dir, e.name);
    if (e.isDirectory()) {
      const found = scanForPlugin(path.join(dir, e.name), depth - 1);
      if (found) return found;
    }
  }
  return null;
}

interface ObserveStatus {
  serverUp: boolean;
  version: string | null;
  runtime: string | null;
  activeConsumers: number | null;
  activeClients: number | null;
  sessionCount: number | null;
  eventCount: number | null;
  error?: string;
}

function offline(error?: string): ObserveStatus {
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

/**
 * Probe the observe server. Verified against agents-observe 0.9.11:
 *   GET /api/health   → { ok, version, runtime, activeConsumers, activeClients }
 *   GET /api/db/stats → { sessionCount, eventCount }
 */
async function fetchStatus(timeoutMs = 4000): Promise<ObserveStatus> {
  let health: Record<string, unknown>;
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return offline(`HTTP ${res.status}`);
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || body.ok !== true) return offline('health not ok');
    health = body;
  } catch (e) {
    return offline(e instanceof Error ? e.message : String(e));
  }

  let stats: Record<string, unknown> = {};
  try {
    const res = await fetch(STATS_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (res.ok) stats = ((await res.json().catch(() => null)) as Record<string, unknown>) ?? {};
  } catch {
    /* ignore — counts stay null */
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

const RUNTIME_ENV_KEY = 'AGENTS_OBSERVE_RUNTIME';

function hasDocker(): boolean {
  try {
    execSync(process.platform === 'win32' ? 'where docker' : 'which docker', {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

/** A dir is a launchable agents-observe install if it has both entrypoints. */
function isPluginRoot(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, 'start.mjs')) &&
    fs.existsSync(path.join(dir, 'hooks', 'scripts', 'observe_cli.mjs'))
  );
}

/** Bounded recursive scan collecting agents-observe install roots. */
function collectPluginRoots(dir: string, depth: number, out: string[]): void {
  if (depth < 0 || !fs.existsSync(dir)) return;
  if (isPluginRoot(dir)) {
    out.push(dir);
    return; // don't descend into a found install
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) collectPluginRoots(path.join(dir, e.name), depth - 1, out);
  }
}

/**
 * Resolve the agents-observe plugin dir we can launch the server from.
 * Prefers the highest-versioned cache install (e.g.
 * cache/agents-observe/agents-observe/0.9.11), falls back to the
 * marketplace source clone. Returns null if none found.
 */
function resolvePluginRoot(): string | null {
  const pluginsRoot = path.join(os.homedir(), '.claude', 'plugins');
  const roots: string[] = [];
  collectPluginRoots(path.join(pluginsRoot, 'cache'), 4, roots);
  const marketplace = path.join(pluginsRoot, 'marketplaces', 'agents-observe');
  if (isPluginRoot(marketplace)) roots.push(marketplace);
  if (roots.length === 0) return null;
  // Prefer versioned cache installs over the marketplace clone, and higher
  // version dirs over lower ones (numeric compare on the trailing dir name).
  roots.sort((a, b) => {
    const aCache = a.includes(`${path.sep}cache${path.sep}`) ? 1 : 0;
    const bCache = b.includes(`${path.sep}cache${path.sep}`) ? 1 : 0;
    if (aCache !== bCache) return bCache - aCache;
    return path.basename(b).localeCompare(path.basename(a), undefined, { numeric: true });
  });
  return roots[0];
}

/** Spawn a child inheriting stdio; resolve with its exit code. */
function spawnInherit(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'inherit', env });
    child.on('error', () => resolve(1));
    child.on('close', (code) => resolve(code ?? 0));
  });
}

/**
 * Actually launch the observe server. Branches on Docker availability:
 *   - docker present → plugin's `observe_cli.mjs start` (pull + run container)
 *   - no docker      → plugin's `start.mjs` in local runtime (foreground;
 *                      this terminal becomes the server log window)
 * Returns when the docker container is up, or runs until Ctrl-C in local mode.
 */
async function launchServer(pluginInstalled: boolean): Promise<void> {
  console.log(chalk.bold('\nStarting server'));
  if (!pluginInstalled) {
    console.log(`  ${icon(false)}  cannot start — agents-observe plugin not installed (see above)`);
    return;
  }
  const root = resolvePluginRoot();
  if (!root) {
    console.log(`  ${icon(false)}  plugin launcher not found under ~/.claude/plugins`);
    return;
  }
  const childEnv: NodeJS.ProcessEnv = { ...process.env, [DATA_ENV_KEY]: aidlcDataDir() };

  if (hasDocker()) {
    console.log(`  ${dim('runtime')}  docker — launching container via plugin CLI`);
    const cli = path.join(root, 'hooks', 'scripts', 'observe_cli.mjs');
    await spawnInherit(process.execPath, [cli, 'start'], childEnv);
    return;
  }

  console.log(`  ${dim('runtime')}  local (no docker) — ${dim(path.join(root, 'start.mjs'))}`);
  console.log(dim('     this terminal becomes the server log window; press Ctrl-C to stop.'));
  const depsReady =
    fs.existsSync(path.join(root, 'app', 'server', 'node_modules')) &&
    fs.existsSync(path.join(root, 'app', 'client', 'dist'));
  const args = [path.join(root, 'start.mjs')];
  if (depsReady) {
    args.push('--skip-install');
  } else {
    console.log(dim('     first run: installing deps + building client (may take a few minutes)…'));
  }
  await spawnInherit(process.execPath, args, { ...childEnv, [RUNTIME_ENV_KEY]: 'local' });
}

function readSettings(): Record<string, unknown> {
  const file = settingsPath();
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8') || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

interface EnvChange { key: string; before: string | undefined; after: string }

/**
 * Compute the `env` entries ~/.claude/settings.json should hold for
 * agents-observe. Only ever touches the `env` key — never `hooks`.
 *   - AGENTS_OBSERVE_LOCAL_DATA_ROOT → stable data dir (always).
 *   - AGENTS_OBSERVE_RUNTIME=local → only when Docker is absent AND the user
 *     hasn't already chosen a runtime (so we never override an explicit choice).
 */
function planEnv(): { changes: EnvChange[]; settings: string } {
  const env = (readSettings().env && typeof readSettings().env === 'object'
    ? (readSettings().env as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const desired: Record<string, string> = { [DATA_ENV_KEY]: aidlcDataDir() };
  const runtimeSet = typeof env[RUNTIME_ENV_KEY] === 'string' && env[RUNTIME_ENV_KEY];
  if (!hasDocker() && !runtimeSet) desired[RUNTIME_ENV_KEY] = 'local';

  const changes: EnvChange[] = [];
  for (const [key, after] of Object.entries(desired)) {
    const before = typeof env[key] === 'string' ? (env[key] as string) : undefined;
    if (before !== after) changes.push({ key, before, after });
  }
  return { changes, settings: settingsPath() };
}

function writeEnv(changes: EnvChange[]): void {
  const file = settingsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.mkdirSync(path.join(aidlcDataDir(), 'data'), { recursive: true });

  const data = readSettings();
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`); // single rolling backup
  const env = (data.env && typeof data.env === 'object' ? data.env : {}) as Record<string, unknown>;
  for (const c of changes) env[c.key] = c.after;
  data.env = env;
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

function openInBrowser(url: string): void {
  const cmd =
    process.platform === 'win32' ? `start "" "${url}"` :
    process.platform === 'darwin' ? `open "${url}"` :
    `xdg-open "${url}"`;
  exec(cmd, () => { /* best-effort */ });
}

function dim(s: string): string { return chalk.dim(s); }
function icon(pass: boolean): string { return pass ? chalk.green('✔') : chalk.yellow('•'); }

export function registerMonitor(program: Command): void {
  program
    .command('monitor')
    .description('Check agents-observe install + server, pin its data dir, and print live status')
    .option('--dry-run', 'print the settings.json env change without writing it')
    .option('--open', 'open the dashboard in your browser')
    .option('--start', 'launch the observe server if it is not already running')
    .option('--json', 'emit machine-readable status (no settings.json changes)')
    .action(async (opts: { dryRun?: boolean; open?: boolean; start?: boolean; json?: boolean }) => {
      const plugin = detectPlugin();
      const status = await fetchStatus();

      if (opts.json) {
        const { changes } = planEnv();
        process.stdout.write(JSON.stringify({
          plugin,
          server: status,
          dataDir: aidlcDataDir(),
          dashboard: DASHBOARD_URL,
          dockerAvailable: hasDocker(),
          settingsEnvChanges: changes,
        }, null, 2) + '\n');
        return;
      }

      console.log(chalk.bold('\naidlc monitor') + dim('  ·  agents-observe'));

      // ── Plugin ───────────────────────────────────────────────────────────
      console.log(chalk.bold('\nPlugin'));
      if (plugin.installed) {
        console.log(`  ${icon(true)}  agents-observe installed  ${dim(plugin.detail)}`);
      } else {
        console.log(`  ${icon(false)}  agents-observe not installed  ${dim(plugin.detail)}`);
        console.log(dim('     install:'));
        console.log(dim('       claude plugin marketplace add simple10/agents-observe'));
        console.log(dim('       claude plugin install agents-observe'));
        console.log(dim('     hooks load automatically once installed — no settings.json edits needed.'));
      }

      // ── Settings.json env (data dir + runtime) ────────────────────────────
      console.log(chalk.bold('\nEnvironment (settings.json)'));
      console.log(`  ${dim('data dir')}  ${aidlcDataDir()}  ${dim('(db: ' + path.join(aidlcDataDir(), 'data', 'observe.db') + ')')}`);
      if (!hasDocker()) {
        console.log(`  ${dim('docker')}    not found → runtime pinned to ${chalk.cyan('local')}`);
      }
      const { changes, settings } = planEnv();
      if (changes.length === 0) {
        console.log(`  ${icon(true)}  env already pinned in ${dim(settings)}`);
      } else if (opts.dryRun) {
        console.log(`  ${icon(false)}  would update ${changes.length} env key(s) in ${dim(settings)}`);
        for (const c of changes) {
          console.log(dim(`     env."${c.key}": ${JSON.stringify(c.before)}  →  ${JSON.stringify(c.after)}`));
        }
        console.log(dim('     (dry run — nothing written)'));
      } else {
        writeEnv(changes);
        console.log(`  ${icon(true)}  pinned ${changes.map((c) => c.key).join(', ')} in ${dim(settings)}  ${dim('(backup: settings.json.bak)')}`);
      }

      // ── Server ────────────────────────────────────────────────────────────
      console.log(chalk.bold('\nServer'));
      if (status.serverUp) {
        console.log(`  ${icon(true)}  observe server up  ${dim(OBSERVE_BASE)}  ${dim('v' + (status.version ?? '?') + ' · ' + (status.runtime ?? '?'))}`);
        console.log(`  ${dim('live sessions')}   ${status.activeConsumers ?? dim('?')}`);
        console.log(`  ${dim('sessions (db)')}   ${status.sessionCount ?? dim('?')}`);
        console.log(`  ${dim('events (db)')}     ${status.eventCount ?? dim('?')}`);
        console.log(`  ${dim('dashboard tabs')}  ${status.activeClients ?? dim('?')}`);
        console.log(`  ${dim('dashboard')}       ${DASHBOARD_URL}`);
      } else {
        console.log(`  ${icon(false)}  observe server not reachable on ${dim(OBSERVE_BASE)}  ${dim(status.error ?? '')}`);
        if (plugin.installed) {
          console.log(dim('     the server autostarts on SessionStart — start a Claude Code session,'));
          console.log(dim('     or run it manually from the plugin (see docs/monitoring.md).'));
        }
      }

      // ── Start (optional) ──────────────────────────────────────────────────
      if (opts.start && !opts.dryRun && !status.serverUp) {
        await launchServer(plugin.installed);
      }

      if (opts.open && status.serverUp) {
        openInBrowser(DASHBOARD_URL);
        console.log(dim(`\nopening ${DASHBOARD_URL} …`));
      }
      console.log();
    });
}
