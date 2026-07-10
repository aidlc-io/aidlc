/**
 * `aidlc memory` — cross-epic memory curator.
 *
 *   aidlc memory rollup   read every docs/epics/*\/epic-memory.json and fold
 *                         standing constraints / decisions / reflections into
 *                         .aidlc/memory.json (project-level memory)
 *   aidlc memory show     print the current project memory as Markdown
 *
 * Per-epic memory already optimizes working *within* one epic (the epic-memory
 * hook auto-injects it). This lifts that knowledge to the whole project so a
 * new epic starts aware of the team's standing constraints — fewer tokens
 * re-deriving context, fewer repeated mistakes.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  rollupProjectMemory,
  loadProjectMemory,
  renderProjectMemory,
} from '@aidlc/core';
import { resolveWorkspaceRoot } from '../workspaceRoot';

export function registerMemory(program: Command): void {
  const cmd = program
    .command('memory')
    .description('Cross-epic memory: roll per-epic digests up into project-level memory');

  cmd
    .command('rollup')
    .description('Aggregate docs/epics/*/epic-memory.json into .aidlc/memory.json')
    .option('--json', 'print the resulting rollup as JSON')
    .action((opts: { json?: boolean }, actionCmd: Command) => {
      const root = resolveWorkspaceRoot(actionCmd);
      const { memory, path } = rollupProjectMemory(root);
      if (opts.json) {
        console.log(JSON.stringify(memory, null, 2));
        return;
      }
      console.log(chalk.green('✔') + ` Rolled up ${memory.epics.length} epic(s) → ${chalk.dim(path)}`);
      console.log(
        chalk.dim(
          `  ${memory.constraints.length} constraint(s), ` +
          `${memory.decisions.length} decision(s), ` +
          `${memory.reflections.length} reflection(s).`,
        ),
      );
    });

  cmd
    .command('show')
    .description('Print the current project memory (.aidlc/memory.json)')
    .option('--json', 'print raw JSON instead of Markdown')
    .action((opts: { json?: boolean }, actionCmd: Command) => {
      const root = resolveWorkspaceRoot(actionCmd);
      const memory = loadProjectMemory(root);
      if (!memory) {
        console.log(chalk.dim('No project memory yet. Run: aidlc memory rollup'));
        return;
      }
      console.log(opts.json ? JSON.stringify(memory, null, 2) : renderProjectMemory(memory));
    });
}
