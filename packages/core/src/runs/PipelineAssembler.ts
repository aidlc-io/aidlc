/**
 * Recipe → pipeline assembler.
 *
 * Turns a {@link RecipeConfig} (a named, ordered subset of an existing
 * pipeline's steps, keyed to a task type) into a concrete
 * {@link PipelineConfig} ready to hand to {@link startRun}.
 *
 * Design — borrowed from CI/CD template engines (Harness step/stage
 * templates): the *structure* is deterministic (recipe picks steps from a
 * source pipeline that already wires real agents + skills), while only the
 * *selection* varies per task. The LLM that classifies a task into a recipe
 * id never authors raw pipeline YAML, so its output can't break the schema.
 *
 * What assembly does:
 *   1. Resolve the recipe + its source pipeline.
 *   2. Select the listed steps, in recipe order.
 *   3. Prune each step's `depends_on` to references that survived selection —
 *      a step that depended on an excluded upstream falls back to a DAG root
 *      (or, if no step uses depends_on, the runner's legacy sequential mode).
 *   4. Cross-ref check the result (agents/skills must resolve) — fatal here,
 *      because an assembled pipeline with a dangling agent would crash the
 *      runner at dispatch.
 */

import {
  type WorkspaceConfig,
  type PipelineConfig,
  type PipelineStepConfig,
  type RecipeConfig,
  normalizeStep,
  stepDagId,
  collectWorkspaceRefIssues,
} from '../schema/WorkspaceSchema';

export class PipelineAssembleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PipelineAssembleError';
  }
}

export interface AssembleOptions {
  /** Recipe id to assemble. */
  recipeId: string;
  /** id for the freshly built pipeline. Defaults to the recipe id. */
  pipelineId?: string;
}

/**
 * Build a {@link PipelineConfig} from a recipe defined in `config.recipes`.
 *
 * Throws {@link PipelineAssembleError} when the recipe, its source pipeline,
 * or any listed step is missing, or when the resulting pipeline references an
 * agent/skill the workspace doesn't define.
 */
export function assemblePipeline(
  config: WorkspaceConfig,
  opts: AssembleOptions,
): PipelineConfig {
  const recipe = config.recipes.find((r) => r.id === opts.recipeId);
  if (!recipe) {
    const available = config.recipes.map((r) => r.id).join(', ') || '(none defined)';
    throw new PipelineAssembleError(
      `Recipe "${opts.recipeId}" not found. Available recipes: ${available}`,
    );
  }

  const source = resolveSource(config, recipe);

  // Index source steps by their DAG identity (name ?? agent) so recipe.steps
  // and depends_on resolve against the same key the runner uses.
  const byId = new Map<string, PipelineStepConfig>();
  for (const step of source.steps) {
    byId.set(stepDagId(step), step);
  }

  const missing = recipe.steps.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new PipelineAssembleError(
      `Recipe "${recipe.id}" references step(s) not in pipeline "${source.id}": ` +
        `${missing.join(', ')}. Available: ${[...byId.keys()].join(', ')}`,
    );
  }

  const selected = new Set(recipe.steps);

  // Re-link `depends_on` across excluded steps. A naive filter would drop a
  // dependency whose intermediate was excluded (e.g. recipe [plan, implement]
  // where implement → design → plan): implement would lose its edge and run
  // in parallel with plan. Instead we walk up through excluded steps to the
  // nearest *selected* ancestors, preserving ordering. Memoized; the visited
  // guard keeps a malformed cyclic source pipeline from looping forever.
  const depsById = new Map<string, string[]>();
  for (const [id, step] of byId) { depsById.set(id, normalizeStep(step).depends_on); }
  const resolvedCache = new Map<string, string[]>();
  const resolveDeps = (id: string, visiting: Set<string>): string[] => {
    if (resolvedCache.has(id)) { return resolvedCache.get(id)!; }
    const acc = new Set<string>();
    for (const dep of depsById.get(id) ?? []) {
      if (visiting.has(dep)) { continue; } // cycle guard
      if (selected.has(dep)) {
        acc.add(dep);
      } else {
        const next = new Set(visiting).add(dep);
        for (const ancestor of resolveDeps(dep, next)) { acc.add(ancestor); }
      }
    }
    const result = [...acc];
    resolvedCache.set(id, result);
    return result;
  };

  const steps = recipe.steps.map((id) => {
    const norm = normalizeStep(byId.get(id)!);
    const depends_on = resolveDeps(id, new Set([id]));
    const step: Record<string, unknown> = {
      agent: norm.agent,
      name: norm.name ?? id,
      enabled: norm.enabled,
      produces: norm.produces,
      requires: norm.requires,
      depends_on,
      auto_review: norm.auto_review,
      human_review: norm.human_review,
    };
    if (norm.skills && norm.skills.length > 0) { step.skills = norm.skills; }
    if (norm.auto_review_runner) { step.auto_review_runner = norm.auto_review_runner; }
    return step as PipelineStepConfig;
  });

  const assembled: PipelineConfig = {
    id: opts.pipelineId ?? recipe.id,
    steps,
    on_failure: source.on_failure,
  };

  // Fatal cross-ref check, scoped to the pipeline we just built. We splice it
  // into a throwaway config so collectWorkspaceRefIssues can reuse the same
  // agent/skill resolution it does for the whole workspace.
  const refIssues = collectWorkspaceRefIssues({
    ...config,
    pipelines: [assembled],
    recipes: [],
  }).filter((i) => i.code === 'unknown-agent' || i.code === 'unknown-step-skill');
  if (refIssues.length > 0) {
    throw new PipelineAssembleError(
      `Recipe "${recipe.id}" assembled a pipeline with unresolved references:\n` +
        refIssues.map((i) => `  - ${i.message}`).join('\n'),
    );
  }

  return assembled;
}

/**
 * Pick the id for a pipeline assembled from a recipe — the single naming
 * convention shared by the CLI and the extension so both produce the same id
 * for the same inputs.
 *
 *   - With an `epicId` (UI "Start epic", CLI `epic start`): name the pipeline
 *     after the epic (`CPD-1356`), falling back to `<epicId>-<recipeId>` then
 *     `<epicId>-<recipeId>-N` when taken — keeps a 1:1 epic↔pipeline link.
 *   - Without one (CLI `pipeline generate` / `classify --generate`): name it
 *     after the recipe (`small-feature`), falling back to `<recipeId>-N`.
 */
export function recipePipelineId(opts: {
  recipeId: string;
  epicId?: string;
  taken: Set<string> | ReadonlySet<string>;
}): string {
  const { recipeId, epicId, taken } = opts;
  const candidates = epicId
    ? [epicId, `${epicId}-${recipeId}`]
    : [recipeId];
  for (const c of candidates) {
    if (!taken.has(c)) { return c; }
  }
  const base = candidates[candidates.length - 1];
  for (let n = 2; ; n++) {
    const c = `${base}-${n}`;
    if (!taken.has(c)) { return c; }
  }
}

function resolveSource(config: WorkspaceConfig, recipe: RecipeConfig): PipelineConfig {
  if (recipe.from) {
    const found = config.pipelines.find((p) => p.id === recipe.from);
    if (!found) {
      const available = config.pipelines.map((p) => p.id).join(', ') || '(none)';
      throw new PipelineAssembleError(
        `Recipe "${recipe.id}" draws from pipeline "${recipe.from}" which is not defined. ` +
          `Available pipelines: ${available}`,
      );
    }
    return found;
  }
  const first = config.pipelines[0];
  if (!first) {
    throw new PipelineAssembleError(
      `Recipe "${recipe.id}" has no source pipeline and the workspace defines none.`,
    );
  }
  return first;
}
