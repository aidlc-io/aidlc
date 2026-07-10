/**
 * `aidlc sync` — pull + push the git-shared AIDLC state so teammates see each
 * other's run transitions, claims, gate approvals, and epic artifacts.
 *
 * AIDLC's multi-user model (Option A) keeps state as plain files in the repo
 * (`.aidlc/runs/*.json`, `.aidlc/memory.json`, `docs/epics/**`). This command
 * is a thin, scoped git wrapper: it stages only those paths, commits them if
 * they changed, then `pull --rebase` + `push`. It never touches source files
 * the user is editing, so it's safe to run mid-work.
 *
 * It shells out to `git` and reports failures verbatim rather than trying to
 * resolve conflicts — a real merge conflict on a run file is a signal two
 * people drove the same run, which the user should see and resolve.
 */

import { execFileSync } from 'child_process';
import { Command } from 'commander';
import chalk from 'chalk';
import { resolveWorkspaceRoot } from '../workspaceRoot';

/** Paths that make up the shared AIDLC state. Staged narrowly on purpose. */
const SYNC_PATHS = ['.aidlc/runs', '.aidlc/memory.json', 'docs/epics'];

function git(root: string, args: string[]): { ok: boolean; out: string } {
  try {
    const out = execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
      .toString()
      .trim();
    return { ok: true, out };
  } catch (err) {
    const e = err as { stderr?: Buffer; stdout?: Buffer; message?: string };
    const out = (e.stderr?.toString() || e.stdout?.toString() || e.message || '').trim();
    return { ok: false, out };
  }
}

export function registerSync(program: Command): void {
  program
    .command('sync')
    .description('Pull + push the git-shared AIDLC state (.aidlc/runs, memory, docs/epics)')
    .option('-m, --message <msg>', 'commit message for local changes', 'chore(aidlc): sync run state')
    .option('--no-push', 'pull/rebase only, do not push')
    .option('--dry-run', 'show what would be staged without committing or pushing')
    .action((opts: { message: string; push: boolean; dryRun?: boolean }, cmd: Command) => {
      const root = resolveWorkspaceRoot(cmd);

      // Must be inside a git work tree.
      if (!git(root, ['rev-parse', '--is-inside-work-tree']).ok) {
        console.error(chalk.red('✘ Not a git repository — `aidlc sync` needs a git-shared workspace.'));
        process.exit(1);
      }

      // Which of the shared paths actually have pending changes?
      const status = git(root, ['status', '--porcelain', '--', ...SYNC_PATHS]);
      const dirty = status.ok && status.out.length > 0;

      if (opts.dryRun) {
        console.log(chalk.bold('aidlc sync --dry-run'));
        console.log(dirty ? status.out : chalk.dim('  (no local changes in shared paths)'));
        return;
      }

      // Commit local state changes (only the shared paths).
      if (dirty) {
        git(root, ['add', '--', ...SYNC_PATHS]);
        const commit = git(root, ['commit', '-m', opts.message, '--', ...SYNC_PATHS]);
        if (commit.ok) {
          console.log(chalk.green('✔') + ' Committed local state changes.');
        } else {
          console.log(chalk.dim('• Nothing to commit in shared paths.'));
        }
      } else {
        console.log(chalk.dim('• No local state changes to commit.'));
      }

      // Pull with rebase so remote transitions interleave cleanly.
      const pull = git(root, ['pull', '--rebase']);
      if (!pull.ok) {
        console.error(chalk.red('✘ git pull --rebase failed:'));
        console.error(chalk.dim(indent(pull.out)));
        console.error(
          chalk.dim(
            '\n  A conflict here usually means two people drove the same run. ' +
            'Resolve it, then `git rebase --continue` and re-run `aidlc sync`.',
          ),
        );
        process.exit(1);
      }
      if (pull.out) { console.log(chalk.dim(indent(pull.out))); }

      if (!opts.push) {
        console.log(chalk.green('✔') + ' Pulled. Skipping push (--no-push).');
        return;
      }

      const push = git(root, ['push']);
      if (!push.ok) {
        console.error(chalk.red('✘ git push failed:'));
        console.error(chalk.dim(indent(push.out)));
        process.exit(1);
      }
      console.log(chalk.green('✔') + ' Synced — local and remote AIDLC state are in step.');
    });
}

function indent(text: string): string {
  return text.split('\n').map((l) => `    ${l}`).join('\n');
}
