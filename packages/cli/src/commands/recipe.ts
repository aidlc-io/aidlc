import { Command } from 'commander';
import chalk from 'chalk';
import { planRecipeMigration } from '@aidlc/core';
import { requireYaml, writeYaml } from '../yamlIO';
import { resolveWorkspaceRoot } from '../workspaceRoot';

export function registerRecipe(program: Command): void {
  const cmd = program.command('recipe').description('Manage task-type recipes in workspace.yaml');

  // ── init ─────────────────────────────────────────────────────────────────
  // Back-fill recipes for a workspace scaffolded before recipes existed, so
  // `aidlc epic start --brief` can suggest a task type. Idempotent: a no-op
  // when recipes are already present.
  cmd
    .command('init')
    .description('Back-fill task-type recipes from the existing pipeline (enables --brief suggestion)')
    .option('--dry-run', 'print what would be added without writing')
    .action((opts: { dryRun?: boolean }, actionCmd: Command) => {
      const root = resolveWorkspaceRoot(actionCmd);
      const doc  = requireYaml(root);

      if (Array.isArray(doc.recipes) && doc.recipes.length > 0) {
        console.log(chalk.dim(`Workspace already has ${doc.recipes.length} recipe(s) — nothing to do.`));
        return;
      }

      const recipes = planRecipeMigration(doc);
      if (!recipes) {
        console.error(chalk.yellow(
          'No recipes could be derived. A pipeline whose steps overlap the built-in\n' +
          'SDLC phases (plan, design, implement, execute-test, …) is required.\n' +
          'Apply the SDLC preset first: aidlc preset apply sdlc',
        ));
        process.exit(1);
      }

      console.log(chalk.bold(`\nDeriving ${recipes.length} recipe(s) from pipeline "${recipes[0].from}":`));
      for (const r of recipes) {
        console.log(`  ${chalk.green(r.id)}  ${chalk.dim(r.steps.join(' → '))}`);
      }

      if (opts.dryRun) {
        console.log(chalk.dim('\n(dry run — workspace.yaml not modified)'));
        return;
      }

      doc.recipes = recipes;
      writeYaml(root, doc);
      console.log(chalk.green(`\n✔ Added ${recipes.length} recipe(s) to workspace.yaml.`));
      console.log(chalk.dim('Now try: aidlc epic start <ID> --brief "<what you want to build>"'));
    });
}
