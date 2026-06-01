/**
 * Task-type classifier: requirement text → recipe id.
 *
 * The "pick the right pipeline for this task" front door. Given a free-text
 * brief (a Jira summary, an epic description) it decides which {@link
 * RecipeConfig} best fits, so the assembler can build a right-sized pipeline.
 *
 * Two strategies, same {@link TaskTypeVerdict} output:
 *
 *   - {@link heuristicClassify} — deterministic keyword signals. No network,
 *     instant, unit-testable. The default + the offline fallback.
 *   - LLM — for nuanced briefs. Core only owns the *contract*
 *     ({@link buildClassificationPrompt} + {@link parseClassificationVerdict});
 *     the caller (CLI / extension) runs `claude --print` and feeds the output
 *     back in. Keeps core pure (no child_process) and the LLM path testable
 *     by parsing canned responses.
 */

import { z } from 'zod';
import type { RecipeConfig } from '../schema/WorkspaceSchema';

export type Confidence = 'high' | 'medium' | 'low';

export interface TaskTypeVerdict {
  /** Chosen recipe id — guaranteed to exist in the workspace's recipes. */
  recipeId: string;
  confidence: Confidence;
  /** One-line justification, shown to the user before they accept. */
  reasoning: string;
  /** Which strategy produced this verdict. */
  source: 'heuristic' | 'llm';
  /**
   * Short imperative title suggested from the brief (LLM only — the heuristic
   * leaves it undefined). UI auto-fills the epic title with it.
   */
  title?: string;
  /**
   * Suggested epic id slug derived from the brief (LLM only), already
   * normalized via {@link slugEpicId}. UI auto-fills the epic id with it.
   */
  epicId?: string;
}

/**
 * Normalize a free-text string into a workspace-safe epic id slug:
 * UPPERCASE, dashes for separators, max 24 chars, must start with a letter.
 * Returns '' when nothing usable remains (caller falls back to its default).
 * Shared by the CLI and the extension so both derive the same id from the
 * same brief.
 */
export function slugEpicId(raw: string): string {
  const slug = (raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/g, '');
  // Must start with a letter to satisfy the id pattern.
  return /^[A-Z]/.test(slug) ? slug : '';
}

/**
 * Canonical task-type labels the heuristic detects. These match the ids the
 * built-in SDLC preset ships, but classification degrades gracefully when a
 * workspace defines a different recipe set (see {@link resolveToRecipe}).
 */
type CanonicalType =
  | 'bugfix'
  | 'refactor'
  | 'spike'
  | 'large-feature'
  | 'feature-parallel'
  | 'small-feature';

/**
 * Keyword signals per canonical type, checked in priority order. Order
 * matters: a "refactor to fix a bug" brief hits `bugfix` first by intent.
 * Word-boundary matched so "debugging" doesn't trip "bug".
 */
const SIGNALS: Array<{ type: CanonicalType; words: RegExp }> = [
  { type: 'spike', words: /\b(spike|investigate|research|explore|poc|prototype|feasibility|evaluate|proof of concept)\b/ },
  { type: 'bugfix', words: /\b(bug|bugfix|fix|hotfix|regression|crash|broken|defect|incorrect|wrong|error|fails?|failing)\b/ },
  { type: 'refactor', words: /\b(refactor|refactoring|cleanup|clean up|restructure|reorganize|rename|tech debt|technical debt|simplify|extract|migrate|migration)\b/ },
  { type: 'large-feature', words: /\b(epic|major|overhaul|rewrite|redesign|end-to-end|multiple (modules|services|components)|across (modules|services)|large|complex)\b/ },
  // Parallel intent: QA running alongside engineering, or explicit concurrency.
  { type: 'feature-parallel', words: /\b(parallel|in parallel|concurrent|concurrently|simultaneous|simultaneously|qa track|alongside)\b/ },
  { type: 'small-feature', words: /\b(add|implement|introduce|support|new feature|feature|enhance|enhancement|extend|build)\b/ },
];

/**
 * Fallback chain per canonical type: the first id that exists in the
 * workspace wins. Keeps classification pointing at a real recipe even when a
 * workspace ships a reduced recipe set (e.g. no `feature-parallel`).
 */
const FALLBACKS: Record<CanonicalType, string[]> = {
  bugfix: ['bugfix', 'small-feature'],
  refactor: ['refactor', 'small-feature'],
  spike: ['spike', 'small-feature'],
  'large-feature': ['large-feature', 'feature-parallel', 'small-feature'],
  'feature-parallel': ['feature-parallel', 'large-feature', 'small-feature'],
  'small-feature': ['small-feature'],
};

/**
 * Classify a brief with deterministic keyword heuristics. Always returns a
 * verdict — when no signal matches it falls back to the workspace's preferred
 * default (`small-feature` if present, else the first recipe) at low
 * confidence.
 */
export function heuristicClassify(brief: string, recipes: RecipeConfig[]): TaskTypeVerdict {
  if (recipes.length === 0) {
    throw new Error('Cannot classify: workspace defines no recipes.');
  }
  const text = ` ${brief.toLowerCase()} `;

  const hits: CanonicalType[] = [];
  for (const { type, words } of SIGNALS) {
    if (words.test(text)) { hits.push(type); }
  }

  if (hits.length === 0) {
    const fallback = resolveToRecipe('small-feature', recipes);
    return {
      recipeId: fallback,
      confidence: 'low',
      reasoning: 'No strong task-type signal found; defaulted.',
      source: 'heuristic',
    };
  }

  const top = hits[0];
  const recipeId = resolveToRecipe(top, recipes);
  // High when the winning signal is unambiguous (only one type matched OR the
  // top is a high-specificity type); medium when several types competed.
  const confidence: Confidence = hits.length === 1 ? 'high' : 'medium';
  const matchedExactly = recipes.some((r) => r.id === top);
  return {
    recipeId,
    confidence,
    reasoning: matchedExactly
      ? `Matched task type "${top}"${hits.length > 1 ? ` (over ${hits.slice(1).join(', ')})` : ''}.`
      : `Matched task type "${top}", mapped to closest recipe "${recipeId}".`,
    source: 'heuristic',
  };
}

/**
 * Map a canonical type to an actual recipe id in the workspace. Exact id match
 * wins; otherwise fall back to `small-feature`, then the first recipe — so
 * classification never points at a recipe that doesn't exist.
 */
function resolveToRecipe(type: CanonicalType, recipes: RecipeConfig[]): string {
  const ids = new Set(recipes.map((r) => r.id));
  for (const candidate of FALLBACKS[type]) {
    if (ids.has(candidate)) { return candidate; }
  }
  return recipes[0].id;
}

// ── LLM contract ───────────────────────────────────────────────────

const VerdictSchema = z.object({
  recipeId: z.string().min(1),
  confidence: z.enum(['high', 'medium', 'low']),
  reasoning: z.string().min(1),
  // Optional UI-oriented suggestions — the classifier may also name the epic.
  title: z.string().optional(),
  epicId: z.string().optional(),
});

/**
 * System prompt for the LLM classifier. Paired with the brief as the user
 * message (mirrors the runner's `claude --print --append-system-prompt`).
 *
 * Always asks for a suggested `title` + `epicId` too so the UI can auto-fill
 * the epic from the same single round-trip. Non-UI callers (CLI) simply ignore
 * those fields — but the prompt stays the single source of truth.
 */
export function buildClassificationPrompt(recipes: RecipeConfig[]): string {
  const menu = recipes
    .map((r) => `  - "${r.id}": ${r.description ?? '(no description)'} [steps: ${r.steps.join(' → ')}]`)
    .join('\n');
  return [
    'You are a software task classifier. Given a requirement / epic brief,',
    'pick the single best-fitting pipeline recipe from the list below.',
    '',
    'Available recipes (id: description [steps]):',
    menu,
    '',
    'Respond with ONLY a JSON object, no prose, no markdown fences:',
    '{"recipeId": "<one of the ids above>", "confidence": "high|medium|low", '
      + '"reasoning": "<one sentence>", "title": "<short imperative title>", '
      + '"epicId": "<UPPERCASE-WITH-DASHES slug from the brief, max 24 chars, e.g. EULA-ACCEPTANCE-GATE>"}',
    '',
    'Prefer the smallest recipe that covers the work. A bug fix is not a feature.',
  ].join('\n');
}

/**
 * Parse + validate an LLM classification response into a {@link TaskTypeVerdict}.
 * Tolerates surrounding prose / ```json fences. Throws when no valid JSON is
 * found or when the chosen `recipeId` isn't one of the workspace's recipes.
 * `title` / `epicId` are carried through when present (epicId normalized).
 */
export function parseClassificationVerdict(raw: string, recipes: RecipeConfig[]): TaskTypeVerdict {
  const ids = new Set(recipes.map((r) => r.id));
  const json = extractJsonObject(raw);
  if (!json) {
    throw new Error(`Classifier response contained no JSON object:\n${raw.slice(0, 200)}`);
  }
  const parsed = VerdictSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Classifier response failed schema: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }
  if (!ids.has(parsed.data.recipeId)) {
    throw new Error(
      `Classifier chose unknown recipe "${parsed.data.recipeId}". Available: ${[...ids].join(', ')}`,
    );
  }
  const { title, epicId, ...rest } = parsed.data;
  const verdict: TaskTypeVerdict = { ...rest, source: 'llm' };
  const cleanTitle = title?.trim();
  if (cleanTitle) { verdict.title = cleanTitle; }
  const slug = slugEpicId(epicId ?? '');
  if (slug) { verdict.epicId = slug; }
  return verdict;
}

/** Pull the first balanced `{...}` object out of free text. */
function extractJsonObject(raw: string): unknown {
  const start = raw.indexOf('{');
  if (start === -1) { return null; }
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) { esc = false; }
      else if (ch === '\\') { esc = true; }
      else if (ch === '"') { inStr = false; }
      continue;
    }
    if (ch === '"') { inStr = true; }
    else if (ch === '{') { depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(raw.slice(start, i + 1)); }
        catch { return null; }
      }
    }
  }
  return null;
}
