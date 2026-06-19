import { Command } from 'commander';
import chalk from 'chalk';
import {
  BUILTIN_WORKFLOWS,
  DEFAULT_GLOBAL_WORKFLOW_IDS,
  installWorkflowGlobalsByIds,
  uninstallWorkflowGlobalsByIds,
  isWorkflowGloballyInstalled,
} from '@aidlc/core';
import { cliTemplatesRoot } from '../templatesRoot';

/**
 * Manage the built-in workflow agents + skills installed under `~/.claude/`.
 * The extension exposes install/uninstall as palette commands; this gives the
 * same control from the terminal — notably `uninstall`, which had no CLI path
 * (run it before removing the extension to clean up global files).
 */
export function registerGlobals(program: Command): void {
  const cmd = program
    .command('globals')
    .description('Install / uninstall built-in workflow agents + skills under ~/.claude/');

  // ── status ────────────────────────────────────────────────────────────────
  cmd
    .command('status')
    .description('Show which built-in workflows are installed globally')
    .option('--json', 'Output raw JSON')
    .action((opts: { json?: boolean }) => {
      const root = cliTemplatesRoot();
      const rows = BUILTIN_WORKFLOWS.map((w) => ({
        id: w.id,
        name: w.name,
        installed: isWorkflowGloballyInstalled(root, w.id),
      }));

      if (opts.json) {
        console.log(JSON.stringify(rows, null, 2));
        return;
      }

      console.log(chalk.bold('\nBuilt-in workflow globals (~/.claude/)'));
      for (const r of rows) {
        const mark = r.installed ? chalk.green('✔ installed') : chalk.dim('· not installed');
        console.log(`  ${chalk.cyan(r.id.padEnd(24))} ${mark}`);
      }
      console.log();
    });

  // ── install ─────────────────────────────────────────────────────────────────
  cmd
    .command('install [ids...]')
    .description('Install built-in workflow globals (default: the standard workflows)')
    .action((ids: string[]) => {
      const root      = cliTemplatesRoot();
      const targetIds = ids.length > 0 ? ids : [...DEFAULT_GLOBAL_WORKFLOW_IDS];
      const known     = new Set(BUILTIN_WORKFLOWS.map((w) => w.id));
      const unknown   = targetIds.filter((id) => !known.has(id));
      if (unknown.length > 0) {
        console.error(chalk.red(`Unknown workflow id(s): ${unknown.join(', ')}`));
        console.error(chalk.dim(`Known: ${[...known].join(', ')}`));
        process.exit(1);
      }

      const reports = installWorkflowGlobalsByIds(root, targetIds);
      for (const r of reports) {
        console.log(
          chalk.green('✔') +
          ` ${chalk.bold(r.workflow)} — wrote ${r.written.length}, skipped ${r.skipped.length}`,
        );
      }
      console.log(chalk.dim('  Files live under ~/.claude/agents and ~/.claude/skills'));
    });

  // ── uninstall ─────────────────────────────────────────────────────────────────
  cmd
    .command('uninstall [ids...]')
    .description('Remove AIDLC-installed workflow globals (preserves files shared by other installed workflows)')
    .action((ids: string[]) => {
      const root      = cliTemplatesRoot();
      const targetIds = ids.length > 0 ? ids : [...DEFAULT_GLOBAL_WORKFLOW_IDS];

      // extensionPath scopes removal to each workflow's own files and preserves
      // files still needed by other globally-installed workflows.
      const reports = uninstallWorkflowGlobalsByIds(targetIds, undefined, root);
      let removed = 0;
      for (const r of reports) {
        removed += r.removed.length;
        console.log(
          chalk.yellow('↓') +
          ` ${chalk.bold(r.workflow)} — removed ${r.removed.length}, kept ${r.skipped.length}`,
        );
      }
      if (removed === 0) {
        console.log(chalk.dim('  Nothing to remove (no AIDLC-marked global files matched).'));
      }
    });
}
