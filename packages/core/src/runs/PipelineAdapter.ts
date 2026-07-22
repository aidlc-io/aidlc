/**
 * aidlc-autopilot L3: context-driven pipeline adaptation.
 *
 * After {@link assemblePipeline} builds a right-sized pipeline from a recipe,
 * the adapter tailors it to *this* epic's context — inserting a phase the work
 * clearly needs (e.g. `prototype` for UI work with no design) or dropping one
 * it doesn't. This is the "superpower" step: the plan bends to the project,
 * not the other way round.
 *
 * Same split as {@link TaskClassifier}: core owns only the **contract**
 * ({@link buildAdaptationPrompt} + {@link parseAdaptationVerdict}) plus the
 * deterministic {@link applyAdaptation}; the caller (extension / CLI) runs
 * `claude --print` and feeds the output back. Core stays pure (no
 * child_process) and every piece is unit-testable with canned responses.
 *
 * SAFETY: the LLM never authors raw pipeline YAML. It may only pick phase
 * names from a fixed **catalog** of steps that already exist (with real agents
 * + skills) elsewhere in the workspace — exactly like the classifier picks
 * from a fixed recipe menu. `applyAdaptation` then re-runs the workspace
 * cross-ref check, so an adaptation that would dangle an agent is rejected.
 */

import { z } from 'zod';
import {
  type WorkspaceConfig,
  type PipelineConfig,
  type PipelineStepConfig,
  normalizeStep,
  stepDagId,
  collectWorkspaceRefIssues,
} from '../schema/WorkspaceSchema';

export class PipelineAdaptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PipelineAdaptError';
  }
}

/** One phase the adapter may add — a real, runnable step drawn from the workspace. */
export interface PhaseCatalogEntry {
  /** DAG id (step `name` ?? `agent`) — the handle the LLM and depends_on use. */
  phase: string;
  agent: string;
  skills: string[];
  /** The full step to splice in when this phase is added. */
  step: PipelineStepConfig;
}

export interface AdaptationVerdict {
  /** Phases to insert. `after` names an existing phase this should follow. */
  add: Array<{ phase: string; after?: string; reason: string }>;
  /** Phases (by dag id) to drop from the base pipeline. */
  remove: Array<{ phase: string; reason: string }>;
  /** One-line justification, shown to the user before they accept. */
  reasoning: string;
}

/**
 * Union of every step across the workspace's pipelines, keyed by DAG id (first
 * definition wins). This is the fixed menu the adapter may add from — each
 * entry is a step that already resolves to a real agent + skills, so splicing
 * it in can't dangle a reference.
 */
export function buildPhaseCatalog(config: WorkspaceConfig): Map<string, PhaseCatalogEntry> {
  const catalog = new Map<string, PhaseCatalogEntry>();
  for (const pipeline of config.pipelines) {
    for (const raw of pipeline.steps) {
      const id = stepDagId(raw);
      if (catalog.has(id)) { continue; }
      const norm = normalizeStep(raw);
      catalog.set(id, {
        phase: id,
        agent: norm.agent,
        skills: norm.skills ?? [],
        step: raw,
      });
    }
  }
  return catalog;
}

// ── LLM contract ───────────────────────────────────────────────────

const VerdictSchema = z.object({
  add: z
    .array(z.object({ phase: z.string().min(1), after: z.string().optional(), reason: z.string().min(1) }))
    .default([]),
  remove: z
    .array(z.object({ phase: z.string().min(1), reason: z.string().min(1) }))
    .default([]),
  reasoning: z.string().min(1),
});

/**
 * System prompt for the adaptation LLM. Paired with the epic scope + collected
 * context as the user message. The model sees the pipeline it's adapting and
 * the fixed catalog of phases it may add, and returns add/remove decisions.
 */
export function buildAdaptationPrompt(
  base: PipelineConfig,
  catalog: Map<string, PhaseCatalogEntry>,
): string {
  const current = base.steps.map((s) => stepDagId(s));
  const currentSet = new Set(current);
  const addable = [...catalog.values()].filter((e) => !currentSet.has(e.phase));

  const addableMenu = addable.length > 0
    ? addable.map((e) => `  - "${e.phase}" (agent: ${e.agent}${e.skills.length ? `, skills: ${e.skills.join(', ')}` : ''})`).join('\n')
    : '  (none — every catalog phase is already in the pipeline)';

  return [
    'You are a software delivery planner. A base pipeline has been assembled',
    'for an epic. Adapt it to the epic — add a phase the work clearly needs, or',
    'remove one it clearly does not. Change nothing when the pipeline already',
    'fits: prefer an empty add/remove over speculative edits.',
    '',
    `Current pipeline phases (in order): ${current.join(' → ')}`,
    '',
    'Phases you MAY add (only these — you cannot invent new ones):',
    addableMenu,
    '',
    'Guidance:',
    '  - Add "prototype" only for user-facing UI work that has no design yet.',
    '  - Add a discovery/spec phase when requirements are unclear.',
    '  - Remove a phase only when the scope plainly excludes it.',
    '  - "after" must name a phase already in the current pipeline.',
    '',
    'Respond with ONLY a JSON object, no prose, no markdown fences:',
    '{"add": [{"phase": "<catalog phase>", "after": "<current phase>", "reason": "<one sentence>"}], '
      + '"remove": [{"phase": "<current phase>", "reason": "<one sentence>"}], '
      + '"reasoning": "<one sentence overall>"}',
  ].join('\n');
}

/**
 * Parse + validate an LLM adaptation response. Tolerates surrounding prose /
 * ```json fences. Rejects any `add` phase not in the catalog (or already
 * present) and any `remove` phase not currently in the pipeline — so a
 * hallucinated phase can never reach {@link applyAdaptation}.
 */
export function parseAdaptationVerdict(
  raw: string,
  base: PipelineConfig,
  catalog: Map<string, PhaseCatalogEntry>,
): AdaptationVerdict {
  const json = extractJsonObject(raw);
  if (!json) {
    throw new PipelineAdaptError(`Adaptation response contained no JSON object:\n${raw.slice(0, 200)}`);
  }
  const parsed = VerdictSchema.safeParse(json);
  if (!parsed.success) {
    throw new PipelineAdaptError(
      `Adaptation response failed schema: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    );
  }

  const current = new Set(base.steps.map((s) => stepDagId(s)));
  // Drop decisions that don't hold against the real pipeline/catalog rather
  // than throwing — a partially-valid adaptation is still useful, and the LLM
  // occasionally names a phase that's already present.
  const add = parsed.data.add.filter((a) => catalog.has(a.phase) && !current.has(a.phase));
  const remove = parsed.data.remove.filter((r) => current.has(r.phase));
  return { add, remove, reasoning: parsed.data.reasoning };
}

/**
 * Apply a verdict to the base pipeline, returning a new {@link PipelineConfig}.
 * Removed phases are dropped; added phases are spliced in after their `after`
 * anchor (or appended) with `depends_on` wired to that anchor so ordering
 * holds in DAG pipelines. Re-runs the workspace cross-ref check and throws
 * {@link PipelineAdaptError} if the result would dangle an agent/skill.
 */
export function applyAdaptation(
  base: PipelineConfig,
  verdict: AdaptationVerdict,
  catalog: Map<string, PhaseCatalogEntry>,
  config: WorkspaceConfig,
): PipelineConfig {
  const removed = new Set(verdict.remove.map((r) => r.phase));
  // Keep surviving base steps as-is (they're never mutated — added steps are
  // built fresh below and spliced in).
  const steps: PipelineStepConfig[] = base.steps.filter((s) => !removed.has(stepDagId(s)));

  // Splice each added phase in after its anchor (or append). Wire depends_on to
  // the anchor so a DAG pipeline keeps the new phase in sequence rather than
  // racing it against the roots.
  for (const a of verdict.add) {
    const entry = catalog.get(a.phase);
    if (!entry) { continue; }
    const present = new Set(steps.map((s) => stepDagId(s)));
    const anchor = a.after && present.has(a.after) ? a.after : undefined;

    const norm = normalizeStep(entry.step);
    const usesDag = steps.some((s) => normalizeStep(s).depends_on.length > 0);
    const step: Record<string, unknown> = {
      agent: norm.agent,
      name: norm.name ?? a.phase,
      enabled: norm.enabled,
      produces: norm.produces,
      requires: norm.requires,
      depends_on: anchor ? [anchor] : (usesDag && steps.length > 0 ? [stepDagId(steps[steps.length - 1])] : []),
      auto_review: norm.auto_review,
      human_review: norm.human_review,
    };
    if (norm.skills && norm.skills.length > 0) { step.skills = norm.skills; }
    if (norm.auto_review_runner) { step.auto_review_runner = norm.auto_review_runner; }

    const insertAt = anchor
      ? steps.findIndex((s) => stepDagId(s) === anchor) + 1
      : steps.length;
    steps.splice(insertAt, 0, step as PipelineStepConfig);
  }

  const adapted: PipelineConfig = { id: base.id, steps, on_failure: base.on_failure };

  // Fatal cross-ref check, scoped to the pipeline we just built (mirrors
  // assemblePipeline): splice it into a throwaway config so the same
  // agent/skill resolution runs.
  const refIssues = collectWorkspaceRefIssues({
    ...config,
    pipelines: [adapted],
    recipes: [],
  }).filter((i) => i.code === 'unknown-agent' || i.code === 'unknown-step-skill');
  if (refIssues.length > 0) {
    throw new PipelineAdaptError(
      `Adapted pipeline "${adapted.id}" has unresolved references:\n` +
        refIssues.map((i) => `  - ${i.message}`).join('\n'),
    );
  }

  return adapted;
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
