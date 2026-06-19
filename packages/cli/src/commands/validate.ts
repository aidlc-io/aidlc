import { Command } from 'commander';
import chalk from 'chalk';
import {
  WorkspaceLoader,
  WorkspaceNotFoundError,
  WorkspaceParseError,
  WorkspaceValidationError,
  collectWorkspaceRefIssues,
} from '@aidlc/core';
import { resolveWorkspaceRoot } from '../workspaceRoot';

export function registerValidate(program: Command): void {
  program
    .command('validate')
    .description('Validate .aidlc/workspace.yaml against the schema (and cross-reference check)')
    .option('--strict', 'Treat dangling cross-references (unknown agent/skill/recipe) as failures')
    .option('--json', 'Output the validation result as JSON')
    .action(async (opts: { strict?: boolean; json?: boolean }, cmd: Command) => {
      const root = resolveWorkspaceRoot(cmd);
      try {
        const ws = await WorkspaceLoader.load(root);
        const c = ws.config;

        // Schema validity ≠ referential integrity. The Zod schema accepts a
        // pipeline step that names an agent which doesn't exist yet (so
        // hand-authored configs don't hard-fail mid-edit). Surface those as
        // warnings here, and let --strict callers (CI) fail on them.
        const refIssues = collectWorkspaceRefIssues(c);
        const ok = refIssues.length === 0 || !opts.strict;

        if (opts.json) {
          console.log(JSON.stringify({
            ok,
            configPath: ws.configPath,
            counts: { agents: c.agents.length, skills: c.skills.length, pipelines: c.pipelines.length },
            refIssues,
          }, null, 2));
          if (!ok) { process.exit(1); }
          return;
        }

        console.log(`workspace.yaml OK (${ws.configPath})`);
        console.log(`  agents:    ${c.agents.length}`);
        console.log(`  skills:    ${c.skills.length}`);
        console.log(`  pipelines: ${c.pipelines.length}`);

        if (refIssues.length > 0) {
          const label = opts.strict ? chalk.red : chalk.yellow;
          console.error(
            label(`\n${refIssues.length} cross-reference issue${refIssues.length !== 1 ? 's' : ''}:`),
          );
          for (const issue of refIssues) {
            console.error(label(`  - ${issue.path}: ${issue.message}`));
          }
          if (opts.strict) {
            process.exit(1);
          }
          console.error(chalk.dim('  (warnings only — re-run with --strict to fail on these)'));
        }
      } catch (err) {
        if (opts.json) {
          const out = errToJson(err);
          if (out === null) { throw err; }
          console.log(JSON.stringify({ ok: false, ...out }, null, 2));
          process.exit(1);
        }
        if (err instanceof WorkspaceNotFoundError) {
          console.error(err.message);
        } else if (err instanceof WorkspaceParseError) {
          console.error(`workspace.yaml parse error: ${err.message}`);
        } else if (err instanceof WorkspaceValidationError) {
          console.error('workspace.yaml validation failed:');
          for (const issue of err.issues) {
            console.error(`  - ${issue.path.join('.') || '<root>'}: ${issue.message}`);
          }
        } else {
          throw err;
        }
        process.exit(1);
      }
    });
}

/** Map a load/validation error to a JSON-serialisable shape, or null if unknown. */
function errToJson(err: unknown): { error: { type: string; message: string; issues?: unknown[] } } | null {
  if (err instanceof WorkspaceNotFoundError) {
    return { error: { type: 'not-found', message: err.message } };
  }
  if (err instanceof WorkspaceParseError) {
    return { error: { type: 'parse', message: err.message } };
  }
  if (err instanceof WorkspaceValidationError) {
    return {
      error: {
        type: 'schema',
        message: 'workspace.yaml validation failed',
        issues: err.issues.map((i) => ({ path: i.path.join('.') || '<root>', message: i.message })),
      },
    };
  }
  return null;
}
