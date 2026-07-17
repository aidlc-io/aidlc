/**
 * Zod schema for `.aidlc/workspace.yaml`.
 *
 * Single source of truth for what a valid AIDLC workspace looks like.
 * Everything else in the loader is structurally typed off `WorkspaceConfig`,
 * so adding a field here automatically propagates to the loader, runner,
 * sidebar renderer, etc. — no manual interface duplication.
 *
 * Validation happens at load time. Invalid YAML produces a thrown
 * `WorkspaceValidationError` with the Zod issue list, which the extension
 * surfaces via the Output panel + diagnostics.
 */

import { z } from 'zod';

// ── Skills ─────────────────────────────────────────────────────────

const SkillSchema = z
  .object({
    id: z.string().min(1),
    /** True for skills bundled with @aidlc/core (no path needed). */
    builtin: z.boolean().optional(),
    /** Relative path to a custom .md skill, e.g. ./.aidlc/skills/foo.md */
    path: z.string().optional(),
  })
  .refine((s) => s.builtin || s.path, {
    message: 'Skill must declare either `builtin: true` or `path: ...`',
  });

// ── Agents ─────────────────────────────────────────────────────────

/**
 * What data sources / external services this agent is allowed to read at
 * run time. Capabilities are *declarative permissions*, not concrete values
 * — declaring `jira` means "this agent can read Jira"; the specific ticket
 * key is supplied per-run (e.g. when starting an epic), never baked into
 * workspace.yaml.
 *
 * Phase 1 ships well-known ids: `jira`, `figma`, `core-business`, `github`,
 * `slack`, `files`, `web`. Users can also write any custom string —
 * downstream tooling can match on whatever it understands.
 */
const AgentSchema = z.preprocess(
  // Backwards-compat: legacy YAML uses `skill: <id>`; new form is `skills: [<id>, ...]`.
  // Coerce the old shape into the new one before zod validation runs.
  (raw) => {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const obj = raw as Record<string, unknown>;
      if (obj.skills === undefined && typeof obj.skill === 'string') {
        const { skill, ...rest } = obj;
        return { ...rest, skills: [skill] };
      }
    }
    return raw;
  },
  z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Skill ids — every entry must reference a skill in the workspace `skills` list. */
  skills: z.array(z.string().min(1)).min(1, 'Agent must reference at least one skill'),
  model: z.string().optional(),
  runner: z.enum(['default', 'custom']).default('default'),
  /** Required when runner === 'custom'. Relative path to .js or .ts file. */
  runner_path: z.string().optional(),
  /** Per-agent env overrides (layered over workspace.environment). */
  env: z.record(z.string(), z.string()).optional(),
  /** Read-permissions: which data sources the agent may pull from. */
  capabilities: z.array(z.string().min(1)).optional(),

  // Display-only metadata. The runner ignores these — they exist so the
  // sidebar / Builder / Epics panel can show "what does this step take in,
  // what does it produce" without forcing the user to read the skill .md.
  /** One-line summary shown beneath the agent name. */
  description: z.string().optional(),
  /** Free-form description of what context this agent needs. */
  inputs: z.string().optional(),
  /** Free-form description of what this agent produces. */
  outputs: z.string().optional(),
  /** File path or filename pattern for the artifact this step writes. */
  artifact: z.string().optional(),

  depends_on: z.array(z.string()).optional(),
}).refine(
  (a) => a.runner !== 'custom' || !!a.runner_path,
  { message: 'Agent with `runner: custom` must set `runner_path`' },
));

// ── Slash commands ─────────────────────────────────────────────────

const SlashCommandSchema = z.union([
  z.object({
    name: z.string().regex(/^\//, 'Slash commands must start with `/`'),
    agent: z.string().min(1),
  }),
  z.object({
    name: z.string().regex(/^\//),
    pipeline: z.string().min(1),
  }),
]);

// ── Pipelines ──────────────────────────────────────────────────────

/**
 * A pipeline step is either a bare agent id (legacy form) or an object
 * with gating metadata. The object form lets the pipeline runner enforce
 * artifact preconditions (`requires`), validate produced artifacts
 * (`produces`), pause for an automated validator (`auto_review` +
 * `auto_review_runner`), and pause for human approval (`human_review`).
 *
 * Artifact paths support `{<context-key>}` placeholders that get resolved
 * from the run's context map at execution time — e.g.
 * `docs/epics/{epic}/PRD.md` becomes
 * `docs/epics/EPIC-2100/PRD.md` for a run with `context.epic == "EPIC-2100"`.
 */
const PipelineStepObjectSchema = z
  .object({
    agent: z.string().min(1),
    /** Display name for the step. Falls back to the agent id when omitted. */
    name: z.string().optional(),
    /** Step is part of the pipeline but skipped at run time when false. Defaults to true. */
    enabled: z.boolean().default(true),
    /** Artifact paths the step is expected to produce. Checked after work. */
    produces: z.array(z.string().min(1)).default([]),
    /**
     * Optional content markers asserted against the `produces` files after
     * they pass the existence check. Each marker must appear (plain substring)
     * in at least one produced file, else the step is blocked — catches
     * "file created but empty / missing a required section" without writing a
     * JS auto_review validator. Empty / omitted = existence check only.
     */
    produces_contains: z.array(z.string().min(1)).default([]),
    /**
     * Skills this step makes available to the agent. Multiple ids
     * allowed — Claude picks which one(s) to invoke for this step,
     * scoped to this list. Empty / omitted = inherit the agent's
     * full `skills:` array.
     *
     * Back-compat: legacy YAML can use `skill: <id>` (singular
     * string); the normalizer coerces it into a single-entry array.
     */
    skills: z.array(z.string().min(1)).optional(),
    /** Artifact paths required from upstream. Gate-checked before work AND on Mark step done. */
    requires: z.array(z.string().min(1)).default([]),
    /**
     * Agent ids of upstream steps this step depends on. When non-empty the
     * step stays `pending` until every listed step transitions to `approved`,
     * at which point it auto-opens as `awaiting_work`. Multiple steps with no
     * dependencies start in parallel. Empty / omitted = legacy sequential
     * behavior (auto-opens when the previous step approves).
     */
    depends_on: z.array(z.string().min(1)).default([]),
    /** When true, the runner runs `auto_review_runner` after produces validate, before any human gate. */
    auto_review: z.boolean().default(false),
    /**
     * Path (relative to workspace root, or absolute) to a JS/TS module that
     * exports a default async function `(ctx) => { decision: 'pass'|'reject',
     * reason: string }`. Required when `auto_review: true`.
     */
    auto_review_runner: z.string().optional(),
    /**
     * Max time (ms) the `auto_review_runner` may run before the runner aborts
     * it and records a `reject` verdict. Guards against a validator that hangs
     * (infinite loop, network stall). Defaults to 120_000 when omitted.
     */
    auto_review_timeout_ms: z.number().int().positive().optional(),
    /** When true, the runner pauses for human approval before advancing. */
    human_review: z.boolean().default(false),
  })
  .refine((s) => !s.auto_review || !!s.auto_review_runner, {
    message: 'Step with `auto_review: true` must set `auto_review_runner` (path to a JS/TS validator module).',
    path: ['auto_review_runner'],
  });

const PipelineStepSchema = z.union([
  z.string().min(1),
  PipelineStepObjectSchema,
]);

/**
 * Optional cost ceiling for the autopilot runner (`aidlc run exec`). When set,
 * the runner accumulates each step's LLM cost (reported by the runner as
 * `costUsd`) and stops once a ceiling is crossed. Only enforced by the
 * self-driving `run exec` loop — manual `mark-done` is never gated.
 */
const PipelineBudgetSchema = z.object({
  /** Hard ceiling on total accumulated cost across the whole run, in USD. */
  max_usd: z.number().positive(),
  /** Optional per-step ceiling, in USD. A single step exceeding this trips the guard. */
  max_usd_per_step: z.number().positive().optional(),
  /** What to do when a ceiling is crossed: pause the loop (default) or exit non-zero. */
  on_exceed: z.enum(['pause', 'fail']).default('pause'),
});

const PipelineSchema = z.object({
  id: z.string().min(1),
  steps: z.array(PipelineStepSchema).min(1),
  on_failure: z.enum(['stop', 'continue']).default('stop'),
  budget: PipelineBudgetSchema.optional(),
});

// ── Recipes ────────────────────────────────────────────────────────

/**
 * A recipe is a named, ordered *subset* of an existing pipeline's steps,
 * mapped to a task type (bugfix, small-feature, large-feature, …). It is
 * the "auto-generate the right pipeline per task" primitive: pick a recipe,
 * and {@link assemblePipeline} materializes a fresh pipeline by selecting
 * the listed steps from the source pipeline and pruning their `depends_on`
 * edges down to the selected set.
 *
 * Recipes carry NO agent/skill definitions of their own — `steps` are step
 * *identifiers* (the step's `name`, falling back to its `agent` id, matching
 * how the runner resolves `depends_on`). The agents + skills they reference
 * must already exist in the workspace (seeded by a preset or hand-authored),
 * which {@link collectWorkspaceRefIssues} verifies.
 */
const RecipeSchema = z.object({
  id: z.string().min(1),
  /** One-line summary shown in pickers / `aidlc pipeline recipes`. */
  description: z.string().optional(),
  /**
   * Source pipeline id to draw steps from. Defaults to the workspace's first
   * pipeline when omitted.
   */
  from: z.string().optional(),
  /**
   * Step identifiers to include, in execution order. Each must match a step
   * in the source pipeline by its `name` (or `agent` id when unnamed).
   */
  steps: z.array(z.string().min(1)).min(1, 'Recipe must list at least one step'),
});

export type PipelineStepConfig = z.infer<typeof PipelineStepSchema>;

/** Step in normalized form (object with all defaults applied). */
export interface NormalizedStep {
  agent: string;
  name?: string;
  /** Skill ids this step makes available — overrides the agent's defaults. */
  skills?: string[];
  enabled: boolean;
  produces: string[];
  produces_contains: string[];
  requires: string[];
  /** Agent ids this step waits for before opening — see schema for semantics. */
  depends_on: string[];
  auto_review: boolean;
  auto_review_runner?: string;
  auto_review_timeout_ms?: number;
  human_review: boolean;
}

/**
 * Convert either form of a pipeline step into the normalized object.
 *
 * Defaults are applied defensively here because `normalizeStep` is called on
 * raw YAML loads (e.g. by the Builder webview) that have NOT been routed
 * through `validateWorkspace`, so Zod defaults haven't kicked in. The
 * runtime would otherwise crash on `step.requires.length` when the YAML
 * omitted optional fields.
 */
export function normalizeStep(step: PipelineStepConfig | { agent?: string; [k: string]: unknown }): NormalizedStep {
  if (typeof step === 'string') {
    return {
      agent: step,
      enabled: true,
      produces: [],
      produces_contains: [],
      requires: [],
      depends_on: [],
      auto_review: false,
      human_review: false,
    };
  }
  const obj = step as Record<string, unknown>;
  const requires = Array.isArray(obj.requires) ? (obj.requires as string[]) : [];
  const produces = Array.isArray(obj.produces) ? (obj.produces as string[]) : [];
  const produces_contains = Array.isArray(obj.produces_contains) ? (obj.produces_contains as string[]) : [];
  const depends_on = Array.isArray(obj.depends_on) ? (obj.depends_on as string[]) : [];
  // Coerce legacy singular `skill: <id>` into the new array form so old
  // workspace.yaml files keep working without a hand migration.
  const skills: string[] | undefined = Array.isArray(obj.skills)
    ? (obj.skills as unknown[]).map(String).filter((s) => s.length > 0)
    : typeof obj.skill === 'string' && obj.skill.length > 0
      ? [obj.skill]
      : undefined;
  return {
    agent: typeof obj.agent === 'string' ? obj.agent : '',
    name: typeof obj.name === 'string' ? obj.name : undefined,
    skills,
    enabled: typeof obj.enabled === 'boolean' ? obj.enabled : true,
    produces,
    produces_contains,
    requires,
    depends_on,
    auto_review: obj.auto_review === true,
    auto_review_runner: typeof obj.auto_review_runner === 'string' ? obj.auto_review_runner : undefined,
    auto_review_timeout_ms:
      typeof obj.auto_review_timeout_ms === 'number' && obj.auto_review_timeout_ms > 0
        ? obj.auto_review_timeout_ms
        : undefined,
    human_review: obj.human_review === true,
  };
}

/**
 * Extract the agent id from a pipeline step, accepting both legacy
 * string form and object form. Returns empty string for malformed input
 * so callers don't have to null-check before passing into UI strings.
 */
export function stepAgentId(step: unknown): string {
  if (typeof step === 'string') { return step; }
  if (step && typeof step === 'object' && typeof (step as { agent?: unknown }).agent === 'string') {
    return (step as { agent: string }).agent;
  }
  return '';
}

/**
 * Identity a pipeline step is referenced by in `depends_on` and recipe
 * `steps` lists: the step's `name`, falling back to its `agent` id. Matches
 * exactly how the runner keys the DAG (PipelineRunner `dagId`), so multiple
 * steps backed by the same agent stay distinct when they carry distinct
 * `name`s.
 */
export function stepDagId(step: PipelineStepConfig): string {
  const norm = normalizeStep(step);
  return norm.name ?? norm.agent;
}

// ── Cross-reference validation ─────────────────────────────────────

/** A dangling reference found by {@link collectWorkspaceRefIssues}. */
export interface WorkspaceRefIssue {
  /** Machine-readable category. */
  code:
    | 'unknown-agent'
    | 'unknown-step-skill'
    | 'unknown-agent-skill'
    | 'unknown-recipe-source'
    | 'unknown-recipe-step';
  /** Human-readable, ready to print. */
  message: string;
  /** Dotted path into the workspace, e.g. `pipelines.sdlc-full.steps.design`. */
  path: string;
}

/**
 * Verify that every id-by-reference in the workspace resolves to a definition:
 *
 *   - each agent's `skills` exist in `skills:`
 *   - each pipeline step's `agent` exists in `agents:`
 *   - each pipeline step's per-step `skills` exist in `skills:`
 *   - each recipe's `from` exists in `pipelines:` (when set)
 *   - each recipe's `steps` exist in the source pipeline
 *
 * Returns the issue list (empty = clean). This is intentionally NOT folded
 * into the Zod schema: hand-authored pipelines that predate a referenced
 * agent should warn, not hard-fail at load. Callers decide severity —
 * {@link assemblePipeline} treats issues touching its output as fatal, while
 * the loader surfaces them as warnings.
 */
export function collectWorkspaceRefIssues(config: WorkspaceConfig): WorkspaceRefIssue[] {
  const issues: WorkspaceRefIssue[] = [];
  const agentIds = new Set(config.agents.map((a) => a.id));
  const skillIds = new Set(config.skills.map((s) => s.id));

  for (const agent of config.agents) {
    for (const skill of agent.skills) {
      if (!skillIds.has(skill)) {
        issues.push({
          code: 'unknown-agent-skill',
          message: `Agent "${agent.id}" references skill "${skill}" which is not defined in skills:`,
          path: `agents.${agent.id}.skills`,
        });
      }
    }
  }

  for (const pipeline of config.pipelines) {
    for (const step of pipeline.steps) {
      const norm = normalizeStep(step);
      const id = norm.name ?? norm.agent;
      if (!agentIds.has(norm.agent)) {
        issues.push({
          code: 'unknown-agent',
          message: `Pipeline "${pipeline.id}" step "${id}" references agent "${norm.agent}" which is not defined in agents:`,
          path: `pipelines.${pipeline.id}.steps.${id}`,
        });
      }
      for (const skill of norm.skills ?? []) {
        if (!skillIds.has(skill)) {
          issues.push({
            code: 'unknown-step-skill',
            message: `Pipeline "${pipeline.id}" step "${id}" references skill "${skill}" which is not defined in skills:`,
            path: `pipelines.${pipeline.id}.steps.${id}.skills`,
          });
        }
      }
    }
  }

  const pipelinesById = new Map(config.pipelines.map((p) => [p.id, p]));
  for (const recipe of config.recipes) {
    const source = recipe.from
      ? pipelinesById.get(recipe.from)
      : config.pipelines[0];
    if (!source) {
      issues.push({
        code: 'unknown-recipe-source',
        message: recipe.from
          ? `Recipe "${recipe.id}" draws from pipeline "${recipe.from}" which is not defined in pipelines:`
          : `Recipe "${recipe.id}" has no source pipeline (workspace defines no pipelines:)`,
        path: `recipes.${recipe.id}.from`,
      });
      continue;
    }
    const sourceStepIds = new Set(source.steps.map(stepDagId));
    for (const stepId of recipe.steps) {
      if (!sourceStepIds.has(stepId)) {
        issues.push({
          code: 'unknown-recipe-step',
          message: `Recipe "${recipe.id}" references step "${stepId}" which is not in pipeline "${source.id}". Available: ${[...sourceStepIds].join(', ')}`,
          path: `recipes.${recipe.id}.steps`,
        });
      }
    }
  }

  return issues;
}

// ── Domain state (optional) ────────────────────────────────────────

/**
 * Declares an entity type whose state persists across runs (e.g. epic / ticket
 * / customer). Pipeline runs read + write entity state files; the sidebar
 * renders them via the `state-tree` view type.
 *
 * Layout convention: `<root>/<entity-id>/<status_file>` (one file per entity).
 */
const StateSchema = z.object({
  entity: z.string().min(1),
  root: z.string().min(1),
  status_file: z.string().default('.state.json'),
  /**
   * Free-form schema description — drives Config UI form generation in M3.
   * Phase 1 doesn't enforce field validation; the runner is trusted to write
   * conformant data.
   */
  schema: z.record(z.string(), z.unknown()).optional(),
});

// ── Run-state persistence (optional) ───────────────────────────────

/**
 * Where pipeline **run state** is persisted. Distinct from {@link StateSchema}
 * (domain-entity state). Defaults preserve the historical behaviour: run state
 * is written to local `.aidlc/runs/*.json`.
 *
 * Set `backend: git` to sync run state through a dedicated branch on the git
 * remote the team already uses — zero-server, multi-user. See
 * `GitRunStateStore`.
 */
const PersistenceSchema = z.object({
  /** `file` (default, local JSON) or `git` (shared branch, multi-user). */
  backend: z.enum(['file', 'git']).default('file'),
  /** Git backend: branch that holds run state. */
  branch: z.string().min(1).default('aidlc-state'),
  /** Git backend: remote to sync with. */
  remote: z.string().min(1).default('origin'),
  /** Git backend: pull before reads and rebase+push around writes. */
  auto_sync: z.boolean().default(true),
});

export type PersistenceConfig = z.infer<typeof PersistenceSchema>;

// ── Sidebar views (optional) ───────────────────────────────────────

/**
 * Per-project sidebar layout. Workspaces declare which view types appear
 * in the `aidlcSidebar` panel. If omitted, sidebar shows defaults
 * (agents-list + run-history).
 *
 * View types are enumerated here to keep the contract closed — a new view
 * type means new code in the renderer + a schema bump. (Custom view plugins
 * are explicitly out of scope per design discussion.)
 */
const FileTreeViewSchema = z.object({
  type: z.literal('file-tree'),
  label: z.string().default('Files'),
  /** Glob relative to workspace root, e.g. `docs/epics/*\/*.md`. */
  glob: z.string().min(1),
  /** Group matched files by their parent directory. Default keeps it flat. */
  group_by: z.enum(['parent_dir', 'flat']).default('flat'),
});

const StateTreeViewSchema = z.object({
  type: z.literal('state-tree'),
  /** Reference to `state.entity`. Must match. */
  state: z.string().min(1),
  label: z.string().optional(),
});

const SimpleViewSchema = z.object({
  type: z.enum(['agents-list', 'skills-list', 'run-history', 'pipelines-list']),
  label: z.string().optional(),
});

const SidebarViewSchema = z.discriminatedUnion('type', [
  FileTreeViewSchema,
  StateTreeViewSchema,
  SimpleViewSchema,
]);

const SidebarSchema = z.object({
  views: z.array(SidebarViewSchema).default([]),
});

// ── Top-level workspace ────────────────────────────────────────────

export const WorkspaceSchema = z.object({
  /** Schema version — bump on breaking changes. Currently always "1.0". */
  version: z.string().min(1),
  /** Human-readable workspace name. Shown in the sidebar header. */
  name: z.string().min(1),

  /**
   * The active SDLC compliance profile (GH-69). Selects, in one value, the
   * enforced artifact sections + validator rules + per-phase persona/skill.
   * Built-ins: `none` | `agile-lite` | `hybrid` | `iso-ieee`; a custom value
   * must have a manifest at `.aidlc/profiles/<value>.yaml`. Unset ⇒ `none`
   * (backward-compatible — nothing enforced, no opinion composed).
   *
   * Kept a free string (not an enum) so custom profiles validate here; the
   * value is checked against built-ins + on-disk manifests at resolution time
   * (see `resolveStandard`), which throws on an unknown id.
   */
  standard: z.string().min(1).optional(),

  agents: z.array(AgentSchema).default([]),
  skills: z.array(SkillSchema).default([]),
  /** Workspace-wide environment, layered under per-agent env. */
  environment: z.record(z.string(), z.string()).default({}),
  slash_commands: z.array(SlashCommandSchema).default([]),
  pipelines: z.array(PipelineSchema).default([]),
  /** Task-type → pipeline recipes. See {@link RecipeSchema}. */
  recipes: z.array(RecipeSchema).default([]),

  state: StateSchema.optional(),
  /** Where run state is persisted (file | git). Defaults to local file. */
  persistence: PersistenceSchema.optional(),
  sidebar: SidebarSchema.optional(),
});

export type WorkspaceConfig = z.infer<typeof WorkspaceSchema>;
export type AgentConfig = z.infer<typeof AgentSchema>;
export type SkillConfig = z.infer<typeof SkillSchema>;
export type SlashCommandConfig = z.infer<typeof SlashCommandSchema>;
export type PipelineConfig = z.infer<typeof PipelineSchema>;
export type PipelineBudget = z.infer<typeof PipelineBudgetSchema>;
export type RecipeConfig = z.infer<typeof RecipeSchema>;
export type StateConfig = z.infer<typeof StateSchema>;
export type SidebarConfig = z.infer<typeof SidebarSchema>;
export type SidebarView = z.infer<typeof SidebarViewSchema>;

/** Thrown by WorkspaceLoader when YAML doesn't conform to WorkspaceSchema. */
export class WorkspaceValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: z.core.$ZodIssue[],
    public readonly path: string,
  ) {
    super(`[workspace ${path}] ${message}`);
    this.name = 'WorkspaceValidationError';
  }
}

/**
 * Validate a parsed YAML object against the schema.
 * Throws WorkspaceValidationError with the issue list on failure.
 */
export function validateWorkspace(raw: unknown, path: string): WorkspaceConfig {
  const result = WorkspaceSchema.safeParse(raw);
  if (!result.success) {
    const summary = result.error.issues
      .slice(0, 5)
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new WorkspaceValidationError(
      `Invalid workspace.yaml:\n${summary}`,
      result.error.issues,
      path,
    );
  }
  return result.data;
}
