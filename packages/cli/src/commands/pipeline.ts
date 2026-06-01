import { execFileSync } from 'child_process';
import { Command } from 'commander';
import chalk from 'chalk';
import {
  validateWorkspace,
  assemblePipeline,
  recipePipelineId,
  PipelineAssembleError,
  heuristicClassify,
  buildClassificationPrompt,
  parseClassificationVerdict,
  type TaskTypeVerdict,
} from '@aidlc/core';
import { requireYaml, writeYaml, existingIds } from '../yamlIO';
import { resolveWorkspaceRoot } from '../workspaceRoot';

export function registerPipeline(program: Command): void {
  const cmd = program.command('pipeline').description('Manage pipelines in workspace.yaml');

  // ── add ────────────────────────────────────────────────────────────────────
  cmd
    .command('add')
    .description('Add a new pipeline')
    .requiredOption('--id <id>', 'unique pipeline id (e.g. full-review)')
    .requiredOption('--steps <agents>',
      'comma-separated agent ids in order (e.g. planner,coder,reviewer)')
    .option('--human-review', 'mark every step as requiring human review before advancing')
    .option('--on-failure <mode>', '"stop" or "continue" on step failure', 'stop')
    .option('--produces <paths>',
      'comma-separated artifact path templates per step, colon-separated per step\n' +
      '  e.g. "docs/{epic}/PRD.md:docs/{epic}/TECH.md" — one section per step')
    .action((opts: {
      id: string; steps: string;
      humanReview?: boolean; onFailure: string; produces?: string;
    }, actionCmd: Command) => {
      const root = resolveWorkspaceRoot(actionCmd);
      const doc  = requireYaml(root);

      if (existingIds(doc.pipelines).has(opts.id)) {
        console.error(chalk.red(`Pipeline "${opts.id}" already exists.`));
        process.exit(1);
      }

      const stepIds    = opts.steps.split(',').map(s => s.trim()).filter(Boolean);
      const agentIds   = existingIds(doc.agents);
      const unknown    = stepIds.filter(id => !agentIds.has(id));
      if (unknown.length > 0) {
        console.error(chalk.red(`Unknown agent(s): ${unknown.join(', ')}`));
        if (agentIds.size > 0) {
          console.error(chalk.dim(`Available agents: ${[...agentIds].join(', ')}`));
        } else {
          console.error(chalk.dim('Run: aidlc agent add --id <id> --name <n> --skill <s>'));
        }
        process.exit(1);
      }

      // Parse per-step produces (colon-separated artifact path templates)
      const producesPerStep: string[][] = [];
      if (opts.produces) {
        const sections = opts.produces.split(':');
        for (const section of sections) {
          producesPerStep.push(section.split(',').map(s => s.trim()).filter(Boolean));
        }
      }

      const steps = stepIds.map((agent, i) => {
        const hasMeta = (producesPerStep[i]?.length ?? 0) > 0 || opts.humanReview;
        if (!hasMeta) { return agent; }   // write clean string when no metadata
        const step: Record<string, unknown> = { agent };
        if (producesPerStep[i]?.length) { step.produces = producesPerStep[i]; }
        if (opts.humanReview) { step.human_review = true; }
        return step;
      });

      const pipeline: Record<string, unknown> = {
        id: opts.id,
        steps,
        on_failure: opts.onFailure,
      };

      doc.pipelines.push(pipeline);

      try {
        validateWorkspace(doc, '.aidlc/workspace.yaml');
      } catch (err) {
        console.error(chalk.red('Validation failed — workspace.yaml not written:'));
        console.error(chalk.dim(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }

      writeYaml(root, doc);
      console.log(chalk.green('✔') + ` Added pipeline ${chalk.bold(opts.id)}`);
      console.log(chalk.dim(`  Steps: ${stepIds.join(' → ')}`));
    });

  // ── recipes ──────────────────────────────────────────────────────────────────
  cmd
    .command('recipes')
    .description('List the task-type recipes available for `pipeline generate`')
    .option('--json', 'Output raw JSON')
    .action((opts: { json?: boolean }, actionCmd: Command) => {
      const doc = requireYaml(resolveWorkspaceRoot(actionCmd));
      const recipes = Array.isArray(doc.recipes)
        ? (doc.recipes as Array<Record<string, unknown>>) : [];
      if (opts.json) { console.log(JSON.stringify(recipes, null, 2)); return; }

      if (recipes.length === 0) {
        console.log(chalk.dim('No recipes defined. Apply a built-in preset, or add a `recipes:` block to workspace.yaml.'));
        return;
      }
      for (const r of recipes) {
        const steps = Array.isArray(r.steps) ? (r.steps as string[]).join(chalk.dim(' → ')) : '';
        console.log(`  ${chalk.bold(String(r.id))}  ${steps}`);
        if (r.description) { console.log(chalk.dim(`    ${String(r.description)}`)); }
      }
      console.log(chalk.dim(`\n${recipes.length} recipe${recipes.length !== 1 ? 's' : ''}`));
    });

  // ── classify ─────────────────────────────────────────────────────────────────
  cmd
    .command('classify <brief...>')
    .description('Classify a requirement brief into a task-type recipe')
    .option('--llm', 'use the `claude` CLI to classify (falls back to heuristic on failure)')
    .option('--generate', 'also assemble + add the chosen recipe as a pipeline')
    .option('--id <id>', 'pipeline id when --generate is set (defaults to the recipe id, or the epic id with --epic)')
    .option('--epic <id>', 'name the generated pipeline after this epic (same convention as the extension)')
    .option('--json', 'output the verdict as JSON')
    .action((briefParts: string[], opts: {
      llm?: boolean; generate?: boolean; id?: string; epic?: string; json?: boolean;
    }, actionCmd: Command) => {
      const root  = resolveWorkspaceRoot(actionCmd);
      const doc   = requireYaml(root);
      const brief = briefParts.join(' ').trim();

      let config;
      try {
        config = validateWorkspace(doc, '.aidlc/workspace.yaml');
      } catch (err) {
        console.error(chalk.red('workspace.yaml is invalid:'));
        console.error(chalk.dim(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }

      if (config.recipes.length === 0) {
        console.error(chalk.red('No recipes defined. Apply a preset that ships recipes, or add a `recipes:` block.'));
        process.exit(1);
      }

      let verdict: TaskTypeVerdict;
      if (opts.llm) {
        verdict = classifyWithLlm(brief, config.recipes) ?? heuristicClassify(brief, config.recipes);
      } else {
        verdict = heuristicClassify(brief, config.recipes);
      }

      if (opts.json) { console.log(JSON.stringify(verdict, null, 2)); }
      else {
        const conf = verdict.confidence === 'high' ? chalk.green(verdict.confidence)
          : verdict.confidence === 'medium' ? chalk.yellow(verdict.confidence)
          : chalk.red(verdict.confidence);
        console.log(`${chalk.bold(verdict.recipeId)}  ${chalk.dim(`(${conf}, ${verdict.source})`)}`);
        console.log(chalk.dim(`  ${verdict.reasoning}`));
      }

      if (!opts.generate) { return; }

      const pipelineId = opts.id
        ?? recipePipelineId({ recipeId: verdict.recipeId, epicId: opts.epic, taken: existingIds(doc.pipelines) });
      if (existingIds(doc.pipelines).has(pipelineId)) {
        console.error(chalk.red(`\nPipeline "${pipelineId}" already exists. Pass --id <newId>.`));
        process.exit(1);
      }
      let pipeline;
      try {
        pipeline = assemblePipeline(config, { recipeId: verdict.recipeId, pipelineId });
      } catch (err) {
        if (err instanceof PipelineAssembleError) {
          console.error(chalk.red('\nAssembly failed: ') + chalk.dim(err.message));
          process.exit(1);
        }
        throw err;
      }
      doc.pipelines.push(pipeline as unknown as Record<string, unknown>);
      try {
        validateWorkspace(doc, '.aidlc/workspace.yaml');
      } catch (err) {
        console.error(chalk.red('\nValidation failed — not written:'));
        console.error(chalk.dim(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
      writeYaml(root, doc);
      const steps = pipeline.steps
        .map((s) => (typeof s === 'string' ? s : String((s as { name?: string; agent?: string }).name ?? (s as { agent?: string }).agent ?? '?')))
        .join(' → ');
      console.log(chalk.green('\n✔') + ` Generated pipeline ${chalk.bold(pipelineId)}`);
      console.log(chalk.dim(`  Steps: ${steps}`));
    });

  // ── generate ─────────────────────────────────────────────────────────────────
  cmd
    .command('generate')
    .description('Assemble a pipeline from a task-type recipe and add it to workspace.yaml')
    .requiredOption('--recipe <id>', 'recipe id (see `aidlc pipeline recipes`)')
    .option('--id <id>', 'id for the generated pipeline (defaults to the recipe id)')
    .option('--epic <id>', 'name the generated pipeline after this epic (same convention as the extension)')
    .option('--from <pipelineId>', 'override the recipe\'s source pipeline')
    .option('--dry-run', 'print the assembled pipeline without writing workspace.yaml')
    .action((opts: {
      recipe: string; id?: string; epic?: string; from?: string; dryRun?: boolean;
    }, actionCmd: Command) => {
      const root = resolveWorkspaceRoot(actionCmd);
      const doc  = requireYaml(root);

      // Validate the current workspace so the assembler gets a typed config.
      let config;
      try {
        config = validateWorkspace(doc, '.aidlc/workspace.yaml');
      } catch (err) {
        console.error(chalk.red('Current workspace.yaml is invalid — fix it before generating:'));
        console.error(chalk.dim(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }

      // `--from` overrides the recipe's declared source for this run only.
      if (opts.from) {
        const recipe = config.recipes.find((r) => r.id === opts.recipe);
        if (recipe) { recipe.from = opts.from; }
      }

      const pipelineId = opts.id
        ?? recipePipelineId({ recipeId: opts.recipe, epicId: opts.epic, taken: existingIds(doc.pipelines) });
      let pipeline;
      try {
        pipeline = assemblePipeline(config, { recipeId: opts.recipe, pipelineId });
      } catch (err) {
        if (err instanceof PipelineAssembleError) {
          console.error(chalk.red('Could not assemble pipeline:'));
          console.error(chalk.dim(err.message));
          process.exit(1);
        }
        throw err;
      }

      const steps = pipeline.steps
        .map((s) => (typeof s === 'string' ? s : String((s as { name?: string; agent?: string }).name ?? (s as { agent?: string }).agent ?? '?')))
        .join(' → ');

      if (opts.dryRun) {
        console.log(chalk.bold(`\n${pipeline.id}`) + chalk.dim('  (dry run — not written)'));
        console.log(`  ${steps}\n`);
        return;
      }

      if (existingIds(doc.pipelines).has(pipeline.id)) {
        console.error(chalk.red(`Pipeline "${pipeline.id}" already exists. Pass --id <newId> to pick another name.`));
        process.exit(1);
      }

      doc.pipelines.push(pipeline as unknown as Record<string, unknown>);

      try {
        validateWorkspace(doc, '.aidlc/workspace.yaml');
      } catch (err) {
        console.error(chalk.red('Validation failed — workspace.yaml not written:'));
        console.error(chalk.dim(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }

      writeYaml(root, doc);
      console.log(chalk.green('✔') + ` Generated pipeline ${chalk.bold(pipeline.id)} from recipe ${chalk.bold(opts.recipe)}`);
      console.log(chalk.dim(`  Steps: ${steps}`));
    });

  // ── list ───────────────────────────────────────────────────────────────────
  cmd
    .command('list')
    .description('List all pipelines')
    .option('--json', 'Output raw JSON')
    .action((opts: { json?: boolean }, actionCmd: Command) => {
      const doc = requireYaml(resolveWorkspaceRoot(actionCmd));
      if (opts.json) { console.log(JSON.stringify(doc.pipelines, null, 2)); return; }

      if (doc.pipelines.length === 0) {
        console.log(chalk.dim('No pipelines defined. Run: aidlc pipeline add --id <id> --steps agent1,agent2'));
        return;
      }
      for (const p of doc.pipelines) {
        const steps = Array.isArray(p.steps)
          ? (p.steps as Array<Record<string, unknown>>)
            .map(s => typeof s === 'string' ? s : String(s.agent ?? '?'))
            .join(chalk.dim(' → '))
          : chalk.dim('(no steps)');
        console.log(`  ${chalk.bold(String(p.id))}  ${steps}`);
      }
      console.log(chalk.dim(`\n${doc.pipelines.length} pipeline${doc.pipelines.length !== 1 ? 's' : ''}`));
    });

  // ── show ───────────────────────────────────────────────────────────────────
  cmd
    .command('show <id>')
    .description('Show full pipeline definition')
    .action((id: string, _opts: unknown, actionCmd: Command) => {
      const doc      = requireYaml(resolveWorkspaceRoot(actionCmd));
      const pipeline = doc.pipelines.find(p => p.id === id);
      if (!pipeline) {
        console.error(chalk.red(`Pipeline "${id}" not found.`));
        process.exit(1);
      }

      console.log(chalk.bold(`\n${id}`));
      const steps = Array.isArray(pipeline.steps)
        ? (pipeline.steps as Array<Record<string, unknown>>)
        : [];
      steps.forEach((step, i) => {
        const agent   = typeof step === 'string' ? step : String(step.agent ?? '?');
        const review  = step.human_review ? chalk.yellow(' [review]') : '';
        const prod    = Array.isArray(step.produces) && step.produces.length
          ? chalk.dim(` → ${(step.produces as string[]).join(', ')}`) : '';
        console.log(`  ${chalk.dim(String(i + 1) + '.')} ${chalk.bold(agent)}${review}${prod}`);
      });
      console.log();
    });

  // ── remove ─────────────────────────────────────────────────────────────────
  cmd
    .command('remove <id>')
    .description('Remove a pipeline from workspace.yaml')
    .action((id: string, _opts: unknown, actionCmd: Command) => {
      const root = resolveWorkspaceRoot(actionCmd);
      const doc  = requireYaml(root);
      const before = doc.pipelines.length;
      doc.pipelines = doc.pipelines.filter(p => p.id !== id);
      if (doc.pipelines.length === before) {
        console.error(chalk.red(`Pipeline "${id}" not found.`));
        process.exit(1);
      }
      writeYaml(root, doc);
      console.log(chalk.green('✔') + ` Removed pipeline ${chalk.bold(id)}`);
    });
}

/**
 * Classify via the `claude` CLI (same invocation shape the runner uses:
 * `claude --print --append-system-prompt <system> <brief>`). Returns the
 * parsed verdict, or null on any failure (binary missing, timeout, bad JSON)
 * so the caller can fall back to the heuristic.
 */
export function classifyWithLlm(
  brief: string,
  recipes: Parameters<typeof buildClassificationPrompt>[0],
): TaskTypeVerdict | null {
  try {
    const system = buildClassificationPrompt(recipes);
    const out = execFileSync(
      'claude',
      ['--print', '--append-system-prompt', system, brief],
      { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return parseClassificationVerdict(out, recipes);
  } catch (err) {
    console.error(chalk.yellow('  (LLM classify failed, using heuristic): ') +
      chalk.dim(err instanceof Error ? err.message.split('\n')[0] : String(err)));
    return null;
  }
}
