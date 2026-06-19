import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { Command } from 'commander';
import chalk from 'chalk';
import {
  WorkspaceLoader,
  WorkspaceNotFoundError,
  RunStateStore,
  isInsideClaudeCodeSession,
  hasClaudeLogin,
  buildClaudeSpawnEnv,
} from '@aidlc/core';
import { resolveWorkspaceRoot } from '../workspaceRoot';

interface Check {
  label: string;
  pass: boolean;
  info?: string;
}

function ok(label: string, info?: string): Check   { return { label, pass: true,  info }; }
function fail(label: string, info?: string): Check  { return { label, pass: false, info }; }

/** Claude Code reads flags like CLAUDE_CODE_USE_BEDROCK=1 as truthy on presence. */
function envTruthy(v: string | undefined): boolean {
  return !!v && v !== '0' && v.toLowerCase() !== 'false';
}

/**
 * Determine which auth mode Claude (and therefore AIDLC) will use — and report
 * it the way AIDLC actually behaves. Bedrock / Vertex win first (their env is
 * never stripped). Then a `claude login`: AIDLC strips an inherited
 * ANTHROPIC_* key whenever a login exists (see buildClaudeSpawnEnv), so login
 * is what runs even if a stale key sits in the shell. A bare API key / token is
 * only the effective auth when there is no login to prefer.
 */
function detectAuth(claudeBin: string): Check {
  const e = process.env;

  if (envTruthy(e.CLAUDE_CODE_USE_BEDROCK)) {
    const region = e.AWS_REGION || e.AWS_DEFAULT_REGION;
    const cred =
      e.AWS_PROFILE ? `profile ${e.AWS_PROFILE}` :
      (e.AWS_ACCESS_KEY_ID || e.AWS_SESSION_TOKEN) ? 'AWS env credentials' :
      'AWS default credential chain';
    return ok('Auth: AWS Bedrock', [cred, region && `region ${region}`].filter(Boolean).join(', '));
  }

  if (envTruthy(e.CLAUDE_CODE_USE_VERTEX)) {
    const region = e.CLOUD_ML_REGION || e.VERTEX_REGION;
    const project = e.ANTHROPIC_VERTEX_PROJECT_ID;
    const info = [project && `project ${project}`, region && `region ${region}`].filter(Boolean).join(', ');
    return ok('Auth: Google Vertex AI', info || undefined);
  }

  // Prefer a `claude login` over any inherited key — AIDLC strips the key when a
  // login exists so the OAuth session is used (avoids "Invalid API key" from a
  // stale/scoped shell key). Cheap offline check: ~/.claude.json `oauthAccount`.
  if (hasClaudeLogin()) {
    const shadowed = !!e.ANTHROPIC_API_KEY;
    return ok('Auth: claude login (claude.ai / OAuth)',
      shadowed ? 'inherited ANTHROPIC_API_KEY ignored in favor of login' : 'no ANTHROPIC_API_KEY needed');
  }

  // No login. Inside a Claude Code session the inherited key is ephemeral and
  // gets stripped too, so don't report it. Otherwise a deliberately-set key /
  // token is the real (and kept) auth.
  const ephemeralKey = isInsideClaudeCodeSession();

  if (e.ANTHROPIC_API_KEY && !ephemeralKey) {
    return ok('Auth: ANTHROPIC_API_KEY set');
  }

  if (e.ANTHROPIC_AUTH_TOKEN && !ephemeralKey) {
    return ok('Auth: ANTHROPIC_AUTH_TOKEN set', e.ANTHROPIC_BASE_URL ? `base_url ${e.ANTHROPIC_BASE_URL}` : undefined);
  }

  // Last resort — the login marker may be absent for some setups (enterprise
  // SSO, relocated config). `claude config list` exits 0 only when claude can
  // actually reach a model, so a success here still means "auth works".
  if (claudeBin) {
    try {
      execSync('claude config list', {
        encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'],
        env: buildClaudeSpawnEnv(),
      });
      return ok('Auth: claude login (claude.ai / OAuth)', 'no ANTHROPIC_API_KEY needed');
    } catch {
      return fail('Not authenticated',
        'use one of: claude login · ANTHROPIC_API_KEY · CLAUDE_CODE_USE_BEDROCK · CLAUDE_CODE_USE_VERTEX');
    }
  }

  return fail('Not authenticated',
    'install claude + run `claude login`, or set ANTHROPIC_API_KEY / CLAUDE_CODE_USE_BEDROCK / CLAUDE_CODE_USE_VERTEX');
}

function printSection(title: string, checks: Check[]): void {
  console.log(chalk.bold(`\n${title}`));
  for (const c of checks) {
    const icon   = c.pass ? chalk.green('✔') : chalk.red('✘');
    const detail = c.info ? chalk.dim(`  ${c.info}`) : '';
    console.log(`  ${icon}  ${c.label}${detail}`);
  }
}

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Validate workspace, claude binary, env, skills, and run state files')
    .option('--json', 'Output all checks as JSON (exit 1 still signals failures)')
    .action((opts: { json?: boolean }, cmd: Command) => {
      const root = resolveWorkspaceRoot(cmd);
      const json = !!opts.json;

      // Collect every section so --json can emit the whole report at the end.
      // In human mode emitSection prints immediately, preserving the live feel.
      const sections: Array<{ title: string; checks: Check[] }> = [];
      const emitSection = (title: string, checks: Check[]): void => {
        sections.push({ title, checks });
        if (!json) { printSection(title, checks); }
      };

      if (!json) {
        console.log(chalk.bold('\naidlc doctor'));
        console.log(chalk.dim(`workspace: ${root}\n`));
      }

      // ── Workspace ────────────────────────────────────────────────────────
      const wsChecks: Check[] = [];
      // Declared here (not inside the `if (ws)` block) so the summary
      // aggregation below can count skill/runner failures — otherwise a broken
      // skill path is printed in red but doctor still exits 0.
      const skillChecks: Check[] = [];
      let ws: Awaited<ReturnType<typeof WorkspaceLoader.load>> | null = null;

      const wsPath = path.join(root, '.aidlc', 'workspace.yaml');
      if (!fs.existsSync(wsPath)) {
        wsChecks.push(fail('.aidlc/workspace.yaml exists', 'run: aidlc init'));
      } else {
        wsChecks.push(ok('.aidlc/workspace.yaml exists'));
        try {
          ws = WorkspaceLoader.load(root);
          const c = ws.config;
          wsChecks.push(ok('workspace.yaml parses & validates',
            `${c.agents.length} agent${c.agents.length !== 1 ? 's' : ''}, ` +
            `${c.skills.length} skill${c.skills.length !== 1 ? 's' : ''}, ` +
            `${c.pipelines.length} pipeline${c.pipelines.length !== 1 ? 's' : ''}`));
        } catch (err) {
          wsChecks.push(fail('workspace.yaml parses & validates',
            err instanceof Error ? err.message : String(err)));
        }
      }

      emitSection('Workspace', wsChecks);

      // ── Claude binary ─────────────────────────────────────────────────────
      const claudeChecks: Check[] = [];

      let claudeBin = '';
      try {
        claudeBin = execSync('which claude', { encoding: 'utf8', timeout: 5000 }).trim();
        claudeChecks.push(ok('claude binary on PATH', claudeBin));
      } catch {
        claudeChecks.push(fail('claude binary on PATH',
          'install: https://github.com/anthropics/claude-code'));
      }

      if (claudeBin) {
        try {
          const version = execSync('claude --version', {
            encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'],
          }).trim();
          claudeChecks.push(ok(`claude --version`, version.split('\n')[0]));
        } catch {
          claudeChecks.push(fail('claude --version returned error',
            'try: claude --version in a terminal'));
        }
      }

      // Auth: AIDLC just shells out to `claude`, so any auth mode Claude Code
      // itself supports is valid here. Recognize them all — Bedrock / Vertex /
      // gateway-token / raw API key — before falling back to the user's own
      // `claude login`, so users on AWS Bedrock (etc.) aren't wrongly told
      // they're "Not authenticated" (issue #55).
      claudeChecks.push(detectAuth(claudeBin));

      emitSection('Claude', claudeChecks);

      // ── Skills ────────────────────────────────────────────────────────────
      if (ws) {
        for (const skill of ws.config.skills) {
          if (skill.builtin) {
            // SkillLoader will validate; for now mark as assumed-ok
            skillChecks.push(ok(`skill "${skill.id}"`, 'builtin'));
          } else if (skill.path) {
            const absPath = path.resolve(root, skill.path);
            if (fs.existsSync(absPath)) {
              skillChecks.push(ok(`skill "${skill.id}"`, skill.path));
            } else {
              skillChecks.push(fail(`skill "${skill.id}"`,
                `file not found: ${skill.path}`));
            }
          } else {
            skillChecks.push(fail(`skill "${skill.id}"`, 'no path or builtin declared'));
          }
        }

        // Custom runner paths
        for (const agent of ws.config.agents) {
          if (agent.runner === 'custom' && agent.runner_path) {
            const absPath = path.resolve(root, agent.runner_path);
            if (fs.existsSync(absPath)) {
              skillChecks.push(ok(`runner "${agent.id}"`, agent.runner_path));
            } else {
              skillChecks.push(fail(`runner "${agent.id}"`,
                `runner_path not found: ${agent.runner_path}`));
            }
          }
        }

        if (skillChecks.length > 0) {
          emitSection('Skills & runners', skillChecks);
        }
      }

      // ── Run state ────────────────────────────────────────────────────────
      const runChecks: Check[] = [];
      const runsDir = path.join(root, '.aidlc', 'runs');

      if (!fs.existsSync(runsDir)) {
        runChecks.push(ok('.aidlc/runs/', 'no runs yet'));
      } else {
        const allRuns = RunStateStore.list(root);
        const runFiles = fs.readdirSync(runsDir).filter(f => f.endsWith('.json'));
        const corrupt  = runFiles.length - allRuns.length;

        runChecks.push(ok(
          `${allRuns.length} run file${allRuns.length !== 1 ? 's' : ''} readable`,
          corrupt > 0 ? `${corrupt} corrupt file(s) skipped` : undefined,
        ));

        const active = allRuns.filter(r => r.status === 'running');
        if (active.length > 0) {
          runChecks.push(ok(
            `${active.length} active run${active.length !== 1 ? 's' : ''}`,
            active.map(r => r.runId).join(', '),
          ));
        }
      }

      emitSection('Runs', runChecks);

      // ── Runtime ──────────────────────────────────────────────────────────
      const nodeVersion = process.versions.node;
      const [nodeMajor] = nodeVersion.split('.').map(Number);
      emitSection('Runtime', [
        nodeMajor >= 18
          ? ok(`Node.js ${nodeVersion}`)
          : fail(`Node.js ${nodeVersion}`, 'upgrade to Node.js 18+'),
      ]);

      // ── Summary ───────────────────────────────────────────────────────────
      // Aggregate across every collected section so no check (incl. skills,
      // runners, runtime) is silently excluded from the exit code.
      const failures = sections.flatMap(s => s.checks).filter(c => !c.pass);

      if (json) {
        console.log(JSON.stringify({
          ok: failures.length === 0,
          failures: failures.length,
          sections,
        }, null, 2));
        if (failures.length > 0) { process.exit(1); }
        return;
      }

      console.log();
      if (failures.length === 0) {
        console.log(chalk.green('✔ All checks passed.'));
      } else {
        console.log(chalk.yellow(`⚠ ${failures.length} check${failures.length !== 1 ? 's' : ''} failed — see above.`));
        process.exit(1);
      }
      console.log();
    });
}
