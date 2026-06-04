import { describe, it, expect } from 'vitest';

import {
  heuristicClassify,
  buildClassificationPrompt,
  parseClassificationVerdict,
  getBuiltinRecipeSummaries,
  type RecipeConfig,
} from '../src';

const RECIPES: RecipeConfig[] = [
  { id: 'bugfix', description: 'fix + verify', steps: ['implement', 'execute-test'] },
  { id: 'small-feature', description: 'plan, build, verify', steps: ['plan', 'implement', 'execute-test'] },
  { id: 'refactor', description: 'design-led change', steps: ['design', 'implement', 'execute-test'] },
  { id: 'feature-parallel', description: 'QA parallel to eng', steps: ['plan', 'design', 'test-plan', 'implement', 'execute-test'] },
  { id: 'large-feature', description: 'full SDLC', steps: ['plan', 'design', 'test-plan', 'implement', 'execute-test'] },
  { id: 'spike', description: 'explore', steps: ['plan'] },
];

describe('heuristicClassify', () => {
  it('routes a bug brief to bugfix', () => {
    const v = heuristicClassify('Fix crash when exporting billing report to CSV', RECIPES);
    expect(v.recipeId).toBe('bugfix');
    expect(v.source).toBe('heuristic');
  });

  it('routes a refactor brief to refactor', () => {
    expect(heuristicClassify('Refactor the auth module to remove tech debt', RECIPES).recipeId).toBe('refactor');
  });

  it('routes an exploration brief to spike', () => {
    expect(heuristicClassify('Investigate feasibility of offline sync', RECIPES).recipeId).toBe('spike');
  });

  it('routes a plain feature brief to small-feature', () => {
    expect(heuristicClassify('Add a dark-mode toggle to settings', RECIPES).recipeId).toBe('small-feature');
  });

  it('routes a big brief to large-feature', () => {
    expect(heuristicClassify('Major rewrite of the rendering pipeline across multiple modules', RECIPES).recipeId).toBe('large-feature');
  });

  it('prioritizes bugfix intent over the word "feature"', () => {
    // "feature" appears but the dominant intent is fixing a defect.
    expect(heuristicClassify('Fix broken feature flag evaluation', RECIPES).recipeId).toBe('bugfix');
  });

  it('does not trip on substrings like "debugging"', () => {
    // No 'bug' word-boundary match; falls through to feature.
    const v = heuristicClassify('Add debugging output to the logger', RECIPES);
    expect(v.recipeId).toBe('small-feature');
  });

  it('routes an explicitly parallel brief to feature-parallel', () => {
    const v = heuristicClassify('Build the import feature with QA running in parallel', RECIPES);
    expect(v.recipeId).toBe('feature-parallel');
  });

  it('maps feature-parallel to large-feature when no parallel recipe exists', () => {
    const noParallel: RecipeConfig[] = [
      { id: 'small-feature', steps: ['plan', 'implement'] },
      { id: 'large-feature', steps: ['plan', 'design', 'implement'] },
    ];
    expect(heuristicClassify('Run tests concurrently with implementation', noParallel).recipeId).toBe('large-feature');
  });

  it('falls back to low confidence when no signal matches', () => {
    const v = heuristicClassify('xyzzy plugh', RECIPES);
    expect(v.confidence).toBe('low');
    expect(v.recipeId).toBe('small-feature');
  });

  it('resolves to first recipe when the canonical type is absent', () => {
    const limited: RecipeConfig[] = [{ id: 'only', steps: ['implement'] }];
    expect(heuristicClassify('Fix a bug', limited).recipeId).toBe('only');
  });

  it('throws when there are no recipes', () => {
    expect(() => heuristicClassify('anything', [])).toThrow(/no recipes/);
  });
});

// The Start Epic modal classifies against the built-in recipes when a project
// has no workspace.yaml yet (workspaceWebview.classifyBriefForWebview falls back
// to getBuiltinRecipeSummaries()). If the built-ins weren't a usable classifier
// input, the Auto row would spin on "analyzing" forever. These pin that contract.
describe('built-in recipes as a classification target (no-workspace fallback)', () => {
  const builtins = getBuiltinRecipeSummaries() as unknown as RecipeConfig[];

  it('ships at least one built-in recipe to classify against', () => {
    expect(builtins.length).toBeGreaterThan(0);
  });

  it('heuristicClassify always returns a recipe id that exists in the built-ins', () => {
    const ids = new Set(builtins.map((r) => r.id));
    for (const brief of [
      'Fix crash when exporting billing report to CSV',
      'Add a dark-mode toggle to settings',
      'Refactor the auth module to remove tech debt',
      'Investigate feasibility of offline sync',
      'xyzzy plugh',
    ]) {
      const v = heuristicClassify(brief, builtins);
      expect(ids.has(v.recipeId)).toBe(true);
    }
  });

  it('an LLM verdict picking a built-in recipe parses cleanly', () => {
    const id = builtins[0].id;
    const v = parseClassificationVerdict(
      `{"recipeId":"${id}","confidence":"high","reasoning":"x"}`,
      builtins,
    );
    expect(v.recipeId).toBe(id);
  });
});

describe('LLM contract', () => {
  it('builds a prompt listing every recipe', () => {
    const p = buildClassificationPrompt(RECIPES);
    expect(p).toContain('"bugfix"');
    expect(p).toContain('"large-feature"');
    expect(p).toContain('JSON');
  });

  it('parses a clean JSON verdict', () => {
    const v = parseClassificationVerdict('{"recipeId":"bugfix","confidence":"high","reasoning":"it is a bug"}', RECIPES);
    expect(v.recipeId).toBe('bugfix');
    expect(v.source).toBe('llm');
  });

  it('tolerates prose and markdown fences around the JSON', () => {
    const raw = 'Sure!\n```json\n{"recipeId":"refactor","confidence":"medium","reasoning":"cleanup"}\n```\nDone.';
    expect(parseClassificationVerdict(raw, RECIPES).recipeId).toBe('refactor');
  });

  it('rejects a verdict choosing an unknown recipe', () => {
    expect(() => parseClassificationVerdict('{"recipeId":"ghost","confidence":"high","reasoning":"x"}', RECIPES))
      .toThrow(/unknown recipe/);
  });

  it('throws when no JSON object is present', () => {
    expect(() => parseClassificationVerdict('I think this is a bugfix.', RECIPES)).toThrow(/no JSON/);
  });
});
