import { describe, it, expect } from 'vitest';

import {
  BUILTIN_WORKFLOWS,
  loadBuiltinPreset,
  getBuiltinRecipeSummaries,
  validateWorkspace,
  assemblePipeline,
  recipePipelineId,
  heuristicClassify,
  PipelineAssembleError,
  type WorkspaceConfig,
  type RecipeConfig,
} from '../src';

/**
 * End-to-end coverage for the Start Epic → recipe path that every entry point
 * (Builder button, Epics tab, navbar "Start Epic") funnels through once a
 * workspace.yaml exists:
 *
 *   classifyBriefForWebview → recipeId  →  startEpicInline
 *     → assembleRecipeForEpic → assemblePipeline(config, { recipeId, pipelineId })
 *
 * The webview methods live in the (untestable, vscode-bound) extension, but the
 * load-bearing logic is all core: build the built-in workspace exactly as the
 * extension materializes it, then prove every recipe the classifier can pick
 * assembles into a valid, named pipeline. If any built-in recipe stopped being
 * assemblable, Start Epic would surface "cannot generate from recipe" — these
 * pin that contract.
 *
 * loadBuiltinPreset composes the workspace structure in-memory; only skill
 * markdown is read from disk (with placeholder fallbacks), so a bogus extension
 * path is fine here — we only assert on structure, not skill bodies.
 */
function builtinWorkspace(workflow = BUILTIN_WORKFLOWS[0]): WorkspaceConfig {
  const preset = loadBuiltinPreset('/nonexistent-extension-path', workflow);
  return validateWorkspace(
    { name: workflow.name, ...preset.workspace },
    `${workflow.id}/workspace.yaml`,
  );
}

describe('Start Epic → recipe materialization (built-in workspace)', () => {
  it('builds a valid workspace from every built-in workflow', () => {
    for (const wf of BUILTIN_WORKFLOWS) {
      const config = builtinWorkspace(wf);
      expect(config.pipelines.length).toBeGreaterThan(0);
      expect(config.recipes.length).toBeGreaterThan(0);
    }
  });

  it('assembles a named pipeline for every recipe in every built-in workflow', () => {
    for (const wf of BUILTIN_WORKFLOWS) {
      const config = builtinWorkspace(wf);
      const taken = new Set(config.pipelines.map((p) => String(p.id)));
      for (const recipe of config.recipes) {
        const pipelineId = recipePipelineId({ recipeId: recipe.id, epicId: 'CPD-1', taken });
        const assembled = assemblePipeline(config, { recipeId: recipe.id, pipelineId });
        // Named after the epic (first pick), and non-empty.
        expect(assembled.id).toBe(pipelineId);
        expect(assembled.steps.length).toBeGreaterThan(0);
        // Every assembled step's agent must be a real workspace agent (the
        // assembler throws on unresolved refs, but assert it explicitly).
        const agentIds = new Set(config.agents.map((a) => String(a.id)));
        for (const step of assembled.steps as Array<{ agent: string }>) {
          expect(agentIds.has(step.agent)).toBe(true);
        }
      }
    }
  });

  it('every recipe id exposed to the modal resolves to an assemblable recipe', () => {
    // getBuiltinRecipeSummaries() is exactly what the modal renders + what the
    // no-workspace classifier falls back to. Each id must map to a workspace
    // recipe that assembles — otherwise the Auto pick would dead-end on submit.
    const config = builtinWorkspace();
    const recipeIds = new Set(config.recipes.map((r) => r.id));
    for (const summary of getBuiltinRecipeSummaries()) {
      expect(recipeIds.has(summary.id)).toBe(true);
    }
  });

  it('a classifier verdict assembles end-to-end (brief → recipe → pipeline)', () => {
    const config = builtinWorkspace();
    const recipes = config.recipes as RecipeConfig[];
    for (const brief of [
      'Fix the null pointer crash in the export job',
      'Add a CSV export button to the reports page',
      'Refactor the billing module to remove duplication',
      'Investigate whether we can move to event sourcing',
    ]) {
      const verdict = heuristicClassify(brief, recipes);
      // The picked recipe must exist and assemble without throwing.
      const taken = new Set(config.pipelines.map((p) => String(p.id)));
      const pipelineId = recipePipelineId({ recipeId: verdict.recipeId, epicId: 'CPD-9', taken });
      expect(() => assemblePipeline(config, { recipeId: verdict.recipeId, pipelineId })).not.toThrow();
    }
  });

  it('a recipe id collision falls back to <epic>-<recipe> without clobbering', () => {
    // Mirrors the extension: when the epic id is already a pipeline id, the
    // assembled pipeline must take a distinct name rather than overwrite.
    const config = builtinWorkspace();
    const firstRecipe = config.recipes[0].id;
    const taken = new Set(config.pipelines.map((p) => String(p.id)));
    taken.add('CPD-1'); // pretend a pipeline named after the epic already exists
    const pipelineId = recipePipelineId({ recipeId: firstRecipe, epicId: 'CPD-1', taken });
    expect(pipelineId).not.toBe('CPD-1');
    expect(pipelineId.startsWith('CPD-1-')).toBe(true);
    expect(() => assemblePipeline(config, { recipeId: firstRecipe, pipelineId })).not.toThrow();
  });

  it('rejects an unknown recipe (the assembler is the safety net)', () => {
    const config = builtinWorkspace();
    expect(() => assemblePipeline(config, { recipeId: 'does-not-exist' }))
      .toThrow(PipelineAssembleError);
  });
});
