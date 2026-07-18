/**
 * Built-in workspace presets shipped with the extension.
 *
 * Each preset is a self-contained SDLC pipeline (Plan → Design → Test Plan →
 * Implement → Review → Execute Test → Release → Monitor → Doc Sync) where
 * the agent personas, skill instructions, and artifact templates are
 * specialized for a domain (generic SDLC, iOS native, web app, .NET backend,
 * Spring Boot backend, Go backend, Electron desktop, React Native mobile).
 *
 * All presets share the same 9-phase shape (`PHASES`). What differs is the
 * source markdown they load from disk: each workflow has its own
 * `templates/<dir>/{agents,skills,artifacts}/` tree.
 *
 * Each phase's v2 skill is composed at load time from two source files:
 *   - `agents/<persona>.md`  — agent persona (PO, Tech Lead, …)
 *   - `skills/<id>.md`        — slash-command instruction (epic, tech-design, …)
 * The two are joined with a separator so the composed skill is
 * self-contained — applying the preset yields a single .md per phase
 * that doesn't need extra `.claude/agents/*` files to work.
 *
 * Built-in presets carry `builtin: true`. Wizards use that to label them
 * "(built-in)" in pickers and skip them from delete flows.
 */

import * as fs from 'fs';
import * as path from 'path';

import { renderTemplate } from './templateRenderer';

/**
 * A composed preset: the workspace.yaml content + per-skill markdown. Kept
 * structurally loose here (`workspace: Record<string, unknown>`) so core has
 * no dependency on the extension's YAML document type; the extension's
 * stricter `WorkspacePreset` (presetStore) is structurally compatible.
 */
export interface WorkspacePreset {
  formatVersion: 1;
  id: string;
  name: string;
  description: string;
  savedAt: string;
  /** workspace.yaml content (without `name`). */
  workspace: Record<string, unknown>;
  /** Skill markdown content keyed by skill id. */
  skillContents: Record<string, string>;
  /** True for presets shipped with the extension. */
  builtin?: boolean;
}

interface PhaseDef {
  id: string;
  name: string;
  persona: string;        // file under agents/
  /**
   * Skill source files under `skills/` that this step makes available, in
   * order. The FIRST one is the primary instruction composed into the
   * step's slash command; the rest are extra skills attached to the step +
   * agent (e.g. `implement` carries [`implement`, `unit-test`]). Empty =
   * persona-only (falls back to IMPLEMENT_FALLBACK_INSTRUCTIONS). Skill ids
   * are derived from the filename (`aidlc-<file>`) so they match the
   * on-disk files written by globalDefaultsInstaller.
   */
  skillFiles: string[];
  model: string;
  description: string;
  inputs: string;
  outputs: string;
  artifact: string;
  humanReview: boolean;
  autoReview: boolean;
  autoReviewRunner?: string; // path to runner script, required when autoReview is true;
  /**
   * MCP integrations / Claude tools the agent has access to. Surfaced in
   * the AgentCard as `integrations` chips; the runner can opt into MCP
   * tools matching these ids when launching the agent.
   */
  capabilities?: string[];
  /**
   * Agent ids (after namespacing — i.e. `<slug>-<phaseId>`) this phase
   * depends on for DAG pipelines. Empty / omitted = legacy sequential
   * (the runner falls back to "open the next index after approve").
   */
  dependsOn?: string[];
}

/**
 * The single built-in SDLC pipeline — a parallel DAG that ends at
 * execute-test. QA runs concurrently with engineering:
 *
 *     plan → ┬─ design   ─→ implement (+unit-test) ─┐
 *            │                                       ├─→ execute-test (+test-report)
 *            └─ test-plan ─→ generate-test-cases   ─┘
 *
 * Each step's `skillFiles` lists the skills it makes available (first =
 * primary instruction). `implement` carries both `implement` and `unit-test`;
 * `execute-test` carries both `execute-test` and `test-report`.
 */
const PHASES: PhaseDef[] = [
  {
    // `discovery-gate` is a secondary skill (not the primary composed into the
    // command body) — the Plan phase runs it up front when the gate rule fires
    // (≥3 open questions, or any high-impact one), then writes the confirmed
    // choices into PRD.md's `## Discovery decisions` section. It is NOT a phase.
    id: 'plan', name: 'Plan', persona: 'po', skillFiles: ['prd', 'discovery-gate'], model: 'claude-opus-4-7',
    description: 'Scaffold the epic and write the PRD.',
    inputs: 'Jira ticket, business context, Figma designs',
    outputs: 'Epic doc + PRD with measurable acceptance criteria',
    artifact: 'PRD.md',
    humanReview: true, autoReview: false,
    capabilities: ['jira', 'figma', 'core-business', 'web'],
  },
  {
    // GH-77: Prototype phase — propose UI visually (multiple options) before design.
    // Reads PRD (incl. Discovery decisions) to generate UI variants.
    // Uses discovery-gate for method selection + option choice (like #76).
    id: 'prototype', name: 'Prototype', persona: 'designer', skillFiles: ['prototype', 'discovery-gate'], model: 'claude-opus-4-7',
    description: 'Propose the UI visually with multiple design options.',
    inputs: 'PRD + discovery decisions, user preference for design method',
    outputs: 'UI prototype options (HTML) + PROTOTYPE.md with chosen option',
    artifact: 'PROTOTYPE.md',
    humanReview: true, autoReview: false,
    capabilities: ['figma', 'artifact-design', 'web'],
    dependsOn: ['plan'],
  },
  {
    // Design also carries `discovery-gate`: when open questions surface while
    // writing the implementation plan (approach, boundaries, which files, edge
    // cases), it runs the gate instead of asking inline, then finishes
    // TECH-DESIGN.md from the answers.
    id: 'design', name: 'Design', persona: 'tech-lead', skillFiles: ['tech-design', 'discovery-gate'], model: 'claude-opus-4-7',
    description: 'Design the implementation approach.',
    inputs: 'PRD, prototype, existing code, dependency graph',
    outputs: 'Architecture, API contract, DI plan, file impact list',
    artifact: 'TECH-DESIGN.md',
    humanReview: true, autoReview: false,
    capabilities: ['files', 'github', 'core-business'],
    dependsOn: ['prototype'],
  },
  {
    id: 'test-plan', name: 'Test Plan', persona: 'qa', skillFiles: ['test-plan'], model: 'claude-sonnet-4-6',
    description: 'Plan how the feature will be verified.',
    inputs: 'PRD acceptance criteria, tech design, ITS / device matrix',
    outputs: 'Test cases (UT / UI / integration / performance), device matrix',
    artifact: 'TEST-PLAN.md',
    humanReview: true, autoReview: false,
    capabilities: ['files', 'jira', 'core-business', 'its'],
    dependsOn: ['prototype'],
  },
  {
    id: 'implement', name: 'Implement', persona: 'developer', skillFiles: ['implement', 'unit-test'], model: 'claude-sonnet-4-6',
    description: 'Build the feature on a feature branch and write its unit tests.',
    inputs: 'Tech design, test plan, project coding rules',
    outputs: 'Code + unit tests on feature branch, PR opened',
    artifact: 'feature/<EPIC>-<slug>',
    humanReview: true, autoReview: true, autoReviewRunner: '.aidlc/validators/ci.mjs',
    // Developer needs full file access + GitHub for PR / commit operations.
    capabilities: ['files', 'github'],
    dependsOn: ['design'],
  },
  {
    id: 'generate-test-cases', name: 'Generate Test Cases', persona: 'qa',
    skillFiles: ['generate-test-cases'], model: 'claude-sonnet-4-6',
    description: 'Concrete, executable test cases derived from the test plan.',
    inputs: 'Test plan, acceptance criteria',
    outputs: 'Executable test cases (UI/IT scripts, fixtures, data) + TEST-CASES.md',
    artifact: 'TEST-CASES.md',
    humanReview: true, autoReview: false,
    capabilities: ['files', 'jira', 'its'],
    dependsOn: ['test-plan'],
  },
  {
    id: 'execute-test', name: 'Execute Test', persona: 'qa', skillFiles: ['execute-test', 'test-report'], model: 'claude-sonnet-4-6',
    description: 'Run the test cases and write the test report.',
    inputs: 'Feature branch, test plan, test cases, UAT environment',
    outputs: 'Test execution + TEST-REPORT with pass/fail, defects, go/no-go',
    artifact: 'TEST-SCRIPT.md',
    humanReview: true, autoReview: false,
    capabilities: ['files', 'jira', 'its'],
    dependsOn: ['implement', 'generate-test-cases'],
  },
];

/**
 * Per-workflow fallback when `skillFile` is null (the Implement phase). Each
 * workflow can override this string to inject domain-specific implementation
 * conventions (e.g. iOS uses XCTest, Spring Boot uses JUnit 5).
 *
 * The map key is `<workflow.id>`; the special key `default` is used when a
 * workflow doesn't define a custom fallback.
 */
const IMPLEMENT_FALLBACK_INSTRUCTIONS: Record<string, string> = {
  default: `# Implement Phase

You are responsible for translating the approved tech design + test plan
into working code on a feature branch.

**Workflow**

1. Read \`docs/epics/<KEY>/TECH-DESIGN.md\` and \`docs/epics/<KEY>/TEST-PLAN.md\`.
2. Create a feature branch \`feature/<KEY>-<short-slug>\` from main.
3. Implement files listed in the design's File Impact section.
4. Write the unit tests called out in the test plan as you go (test-first
   when reasonable, alongside otherwise — don't skip them).
5. Run the project's lint + typecheck + test commands locally before
   handing off to /review.
6. Open a PR with the body referencing the epic key.

**Style rules**

- Match existing code conventions; don't introduce new patterns unless the
  tech design called for them.
- Keep diffs small and reviewable.
- No silent behavior changes outside the epic scope.
`,
};

/**
 * Built-in workflow descriptor. One entry per domain-specialized pipeline.
 *
 * - `id`            : preset id stored on disk (e.g. `sdlc-pipeline`,
 *                     `ios-native-pipeline`). Used by `aidlc.applyPreset`.
 * - `pipelineId`    : pipeline.id written into workspace.yaml (e.g.
 *                     `sdlc-full`, `ios-native-full`). Used by the runner.
 * - `name`          : human label shown in pickers / panel.
 * - `templatesDir` : sub-folder under `<extension>/templates/` holding the
 *                     `agents/`, `skills/`, `artifacts/` for this workflow.
 * - `description`   : one-liner shown next to the preset name.
 */
/**
 * A task-type recipe: a named, ordered subset of the workflow's phase ids.
 * Seeded into the preset's `recipes:` so `assemblePipeline` (core) can
 * materialize a right-sized pipeline per task without the user hand-editing
 * workspace.yaml. `steps` are phase ids (= step `name`s in the installed
 * pipeline); core prunes/re-links `depends_on` to the selected set.
 */
export interface RecipeDef {
  id: string;
  description: string;
  steps: string[];
}

export interface BuiltinWorkflow {
  id: string;
  pipelineId: string;
  name: string;
  templatesDir: string;
  description: string;
  /**
   * Phase shape for this workflow. Defaults to the sequential SDLC phases.
   * Parallel workflows declare a DAG via per-phase `dependsOn` arrays.
   */
  phases: PhaseDef[];
  /**
   * Task-type recipes carved out of `phases`. Optional — workflows without
   * recipes just install the full pipeline.
   */
  recipes?: RecipeDef[];
}

/**
 * Recipes for the built-in SDLC pipeline, keyed by task type. Each lists a
 * subset of the SDLC phase ids (plan, design, test-plan, implement,
 * generate-test-cases, execute-test) in execution order.
 */
const SDLC_RECIPES: RecipeDef[] = [
  {
    id: 'bugfix',
    description: 'Small fix with verification — implement then run tests.',
    steps: ['implement', 'execute-test'],
  },
  {
    id: 'small-feature',
    description: 'Plan, build, verify. Skips formal design + test-case authoring.',
    steps: ['plan', 'implement', 'execute-test'],
  },
  {
    id: 'refactor',
    description: 'Design-led change with verification, no new PRD.',
    steps: ['design', 'implement', 'execute-test'],
  },
  {
    id: 'ui-feature',
    description: 'UI-focused feature with prototype phase before design.',
    steps: ['plan', 'prototype', 'design', 'implement', 'execute-test'],
  },
  {
    id: 'feature-parallel',
    description: 'Mid-size feature, QA track parallel to engineering (prototype → design ∥ test-plan).',
    steps: ['plan', 'prototype', 'design', 'test-plan', 'implement', 'execute-test'],
  },
  {
    id: 'large-feature',
    description: 'Full SDLC: plan → prototype → design ∥ test-plan → implement → test cases → execute.',
    steps: ['plan', 'prototype', 'design', 'test-plan', 'implement', 'generate-test-cases', 'execute-test'],
  },
  {
    id: 'spike',
    description: 'Exploration only — produce a PRD / findings doc.',
    steps: ['plan'],
  },
];

/**
 * Spec Kit workflow — the spec-driven-development flow from GitHub Spec Kit
 * (github/spec-kit) mapped onto AIDLC phases:
 *
 *     specify → clarify → plan → tasks → analyze → implement
 *
 * "Constitution" (project-level principles) is intentionally NOT a per-epic
 * phase — it belongs to the workspace SDLC standard / profile, matching Spec
 * Kit's own `.specify/memory/constitution.md` which is written once per repo.
 * The `analyze` phase is a consistency cross-check (spec ↔ plan ↔ tasks) and
 * uses `autoReview` so it can gate mechanically before implement.
 */
const SPECKIT_PHASES: PhaseDef[] = [
  {
    id: 'specify', name: 'Specify', persona: 'analyst', skillFiles: ['specify'], model: 'claude-opus-4-7',
    description: 'Turn a feature description into a structured, testable spec.',
    inputs: 'Feature description, business context, Jira ticket, Figma designs',
    outputs: 'SPEC.md — user scenarios, functional requirements, testable acceptance criteria',
    artifact: 'SPEC.md',
    humanReview: true, autoReview: false,
    capabilities: ['jira', 'figma', 'core-business', 'web'],
  },
  {
    id: 'clarify', name: 'Clarify', persona: 'analyst', skillFiles: ['clarify'], model: 'claude-opus-4-7',
    description: 'Surface and resolve underspecified areas of the spec.',
    inputs: 'SPEC.md, open questions',
    outputs: 'SPEC.md updated with a Clarifications section (Q/A pairs resolved)',
    artifact: 'SPEC.md',
    humanReview: true, autoReview: false,
    capabilities: ['core-business', 'web'],
    dependsOn: ['specify'],
  },
  {
    // persona/skill filenames are prefixed `speckit-` where they'd otherwise
    // collide with the SDLC bundle's globals (developer/qa/tech-lead/implement).
    // Global install keys files by source filename, so a bare `tech-lead.md`
    // here would overwrite SDLC's when both workflows are installed.
    id: 'plan', name: 'Plan', persona: 'speckit-tech-lead', skillFiles: ['plan'], model: 'claude-opus-4-7',
    description: 'Derive the technical implementation plan from the spec.',
    inputs: 'SPEC.md, existing code, dependency graph, constitution (workspace standard)',
    outputs: 'PLAN.md — architecture, data model, contracts, tech choices honoring the constitution',
    artifact: 'PLAN.md',
    humanReview: true, autoReview: false,
    capabilities: ['files', 'github', 'core-business'],
    dependsOn: ['clarify'],
  },
  {
    id: 'tasks', name: 'Tasks', persona: 'speckit-tech-lead', skillFiles: ['tasks'], model: 'claude-sonnet-4-6',
    description: 'Break the plan into an ordered, dependency-aware task list.',
    inputs: 'PLAN.md, SPEC.md acceptance criteria',
    outputs: 'TASKS.md — numbered tasks with dependencies, each traceable to a requirement',
    artifact: 'TASKS.md',
    humanReview: true, autoReview: false,
    capabilities: ['files'],
    dependsOn: ['plan'],
  },
  {
    id: 'analyze', name: 'Analyze', persona: 'speckit-qa', skillFiles: ['analyze'], model: 'claude-sonnet-4-6',
    description: 'Cross-check spec ↔ plan ↔ tasks for consistency and coverage before build.',
    inputs: 'SPEC.md, PLAN.md, TASKS.md',
    outputs: 'ANALYSIS.md — coverage matrix, gaps, contradictions, go/no-go',
    artifact: 'ANALYSIS.md',
    humanReview: true, autoReview: true, autoReviewRunner: '.aidlc/validators/ci.mjs',
    capabilities: ['files'],
    dependsOn: ['tasks'],
  },
  {
    id: 'implement', name: 'Implement', persona: 'speckit-developer', skillFiles: ['speckit-implement'], model: 'claude-sonnet-4-6',
    description: 'Execute the task list on a feature branch.',
    inputs: 'TASKS.md, PLAN.md, SPEC.md, project coding rules',
    outputs: 'Code on feature branch, PR opened, tasks checked off',
    artifact: 'feature/<EPIC>-<slug>',
    humanReview: true, autoReview: true, autoReviewRunner: '.aidlc/validators/ci.mjs',
    capabilities: ['files', 'github'],
    dependsOn: ['analyze'],
  },
];

/**
 * Recipes for the Spec Kit workflow, keyed by task type. Each lists a subset
 * of the Spec Kit phase ids in execution order.
 */
const SPECKIT_RECIPES: RecipeDef[] = [
  {
    id: 'quick-spec',
    description: 'Spec then build — skip formal clarify/analyze for small, well-understood work.',
    steps: ['specify', 'plan', 'tasks', 'implement'],
  },
  {
    id: 'full-spec-driven',
    description: 'Full Spec Kit flow: specify → clarify → plan → tasks → analyze → implement.',
    steps: ['specify', 'clarify', 'plan', 'tasks', 'analyze', 'implement'],
  },
  {
    id: 'spec-only',
    description: 'Produce a clarified spec and plan without implementing.',
    steps: ['specify', 'clarify', 'plan'],
  },
];

export const BUILTIN_WORKFLOWS: BuiltinWorkflow[] = [
  {
    id: 'sdlc-parallel-pipeline',
    pipelineId: 'sdlc-parallel-full',
    name: 'SDLC Pipeline',
    templatesDir: 'sdlc',
    description:
      'Parallel SDLC pipeline ending at execute-test: Plan → (Design → Implement+UnitTest) ∥ (Test Plan → Generate Test Cases) → Execute Test+Report. PO / Tech Lead / Developer / QA. QA runs concurrently with engineering.',
    phases: PHASES,
    recipes: SDLC_RECIPES,
  },
  {
    id: 'speckit-pipeline',
    pipelineId: 'speckit-full',
    name: 'Spec Kit',
    templatesDir: 'speckit',
    description:
      'Spec-driven development (GitHub Spec Kit): Specify → Clarify → Plan → Tasks → Analyze → Implement. Constitution lives in the workspace SDLC standard. Analyst / Tech Lead / QA / Developer.',
    phases: SPECKIT_PHASES,
    recipes: SPECKIT_RECIPES,
  },
];

const BUILTIN_BY_ID = new Map(BUILTIN_WORKFLOWS.map((w) => [w.id, w]));
const BUILTIN_BY_PIPELINE_ID = new Map(BUILTIN_WORKFLOWS.map((w) => [w.pipelineId, w]));

/**
 * Short slug used to namespace every workspace.yaml id (agent/skill/slash
 * command) that a built-in preset writes. Drops the redundant `-pipeline`
 * suffix from `workflow.id`:
 *   `sdlc-pipeline` → `sdlc`
 *   `ios-native-pipeline` → `ios-native`
 *   `backend-dotnet-pipeline` → `backend-dotnet`
 *
 * Concatenated with phase id this gives unique ids per (workflow × phase),
 * so two built-in presets can coexist in the same project without
 * overwriting each other's `plan`/`design`/… entries.
 */
export function workflowSlug(workflow: BuiltinWorkflow): string {
  return workflow.id.replace(/-pipeline$/, '');
}

/**
 * Look up a built-in workflow by its preset id (e.g. `ios-native-pipeline`).
 */
export function getBuiltinWorkflow(id: string): BuiltinWorkflow | undefined {
  return BUILTIN_BY_ID.get(id);
}

/**
 * Look up a built-in workflow by the pipeline id written into
 * `workspace.yaml` (e.g. `ios-native-full`). Used by the webview to know
 * which artifact template bundle to drop into `.aidlc/aidlc-templates/<id>/`.
 */
export function getBuiltinWorkflowByPipelineId(pipelineId: string): BuiltinWorkflow | undefined {
  return BUILTIN_BY_PIPELINE_ID.get(pipelineId);
}

/**
 * Resolve a phase's expected output path under the conventional epic root.
 * Returns `null` for phases whose `artifact` isn't a regular file — git
 * branches and version tags (e.g. `feature/<EPIC>-<slug>`, `v<X.Y.Z> tag`)
 * can't be validated by file-existence, so the runner shouldn't try.
 */
function artifactPathFor(phase: PhaseDef): string | null {
  const artifact = (phase.artifact ?? '').trim();
  if (!artifact) { return null; }
  // Bare filename pattern: ends in a recognized extension. Anything with a
  // slash, space, or angle brackets is descriptive prose ("v<X.Y.Z> tag",
  // "feature/<EPIC>-<slug>") and we skip it.
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(artifact)) { return null; }
  // Must match the prompt convention in `builtinClaudeCommand`, which tells
  // the agent to write under `<epicRoot>/<epic>/artifacts/<file>`. Validating
  // the bare `docs/epics/{epic}/<file>` path would never find the file the
  // agent actually wrote, breaking "Mark step done" (see issue #26).
  return `docs/epics/{epic}/artifacts/${artifact}`;
}

/**
 * Namespaced id for a pipeline phase's slash command + `.claude/commands`
 * file: `<pipelineId>-<phaseId>` (e.g. `sdlc-parallel-full-plan`). Keying by
 * pipeline keeps commands distinct when multiple pipelines reuse the same
 * phase names — `/sdlc-parallel-full-plan` vs `/my-migration-plan` — instead
 * of both fighting over a single `/plan` / `plan.md`.
 */
export function pipelineCommandId(pipelineId: string, phaseId: string): string {
  return `${pipelineId}-${phaseId}`;
}

/**
 * Filesystem root whose `templates/<dir>/…` holds the bundled agent / skill /
 * artifact markdown. This is the core package root (templates ship via core's
 * `files`), so callers that don't have their own copy — e.g. the CLI — can do
 * `loadBuiltinPreset(builtinTemplatesRoot(), workflow)`.
 *
 * NOTE: the VS Code extension bundles core with esbuild, so `__dirname` there
 * points at the extension bundle, not core. The extension therefore keeps
 * passing its own `extensionPath` (its build copies `templates/` in) rather
 * than relying on this.
 */
export function builtinTemplatesRoot(): string {
  // dist/presets/builtinWorkflows.js → package root is two levels up; the
  // sibling `templates/` dir lives there.
  return path.join(__dirname, '..', '..');
}

/**
 * Load + compose a built-in preset. Bundled .md files are read at
 * runtime from the extension's installed location, so the build pipeline
 * doesn't need a separate "compose preset JSON" step.
 */
export function loadBuiltinPreset(extensionPath: string, workflow: BuiltinWorkflow): WorkspacePreset {
  const workflowDir = path.join(extensionPath, 'templates', workflow.templatesDir);
  const agentsDir = path.join(workflowDir, 'agents');
  const skillsDir = path.join(workflowDir, 'skills');

  // Compose the per-phase slash-command body (persona + phase work) for
  // every phase. Used by the `.claude/commands/<phase>.md` writer; not
  // emitted as a workspace.yaml skill entry.
  const skillContents: Record<string, string> = {};
  for (const phase of workflow.phases) {
    const personaPath = path.join(agentsDir, `${phase.persona}.md`);
    const persona = fs.existsSync(personaPath)
      ? fs.readFileSync(personaPath, 'utf8')
      : `# ${phase.name}\n\n(persona file missing: agents/${phase.persona}.md)\n`;
    // Primary skill file (first in the list) drives the composed command body.
    const primarySkill = phase.skillFiles[0];
    let instruction: string;
    if (primarySkill) {
      const skillPath = path.join(skillsDir, `${primarySkill}.md`);
      instruction = fs.existsSync(skillPath)
        ? fs.readFileSync(skillPath, 'utf8')
        : `# /${phase.id}\n\n(skill file missing: skills/${primarySkill}.md)\n`;
    } else {
      instruction =
        IMPLEMENT_FALLBACK_INSTRUCTIONS[workflow.id] ?? IMPLEMENT_FALLBACK_INSTRUCTIONS.default;
    }
    skillContents[phase.id] = composeSkill(persona, instruction, phase.id, workflow);
  }

  // Layout (3-layer: persona × skill × phase):
  //   - workspace.yaml `agents:` — one entry per *unique persona*
  //     (aidlc-po, aidlc-qa, …). `skills:` lists every phase id this
  //     persona handles, so the user can see at a glance "QA does
  //     test-plan, generate-test-cases, execute-test".
  //   - workspace.yaml `skills:` — one entry per *phase* (plan,
  //     design, test-plan, …). Each points at the composed skill file
  //     at `~/.claude/skills/aidlc-<phase>.md` (persona + phase work
  //     inlined by globalDefaultsInstaller).
  //   - workspace.yaml `slash_commands:` — one per phase, slash name
  //     matches phase id, mapped to the persona that runs it.
  //   - Pipeline `steps:` carry `name` (phase id / slash command),
  //     `agent` (persona), `skill` (phase id again — overrides the
  //     agent default when the persona has multiple skills). That
  //     trio is what the user sees: "test-plan step uses agent qa
  //     and skill test-plan".

  // Aggregate phase ids per persona so each agent's `skills:` array
  // lists every phase that runs as that persona.
  const phasesByPersona = new Map<string, PhaseDef[]>();
  for (const phase of workflow.phases) {
    const list = phasesByPersona.get(phase.persona) ?? [];
    list.push(phase);
    phasesByPersona.set(phase.persona, list);
  }

  // Skill ids are derived from the skill *filename* (`aidlc-<file>`) so they
  // match the on-disk files globalDefaultsInstaller writes (it installs every
  // `skills/<file>.md` as `~/.claude/skills/aidlc-<file>.md`). Keying by
  // filename — not phase id — keeps workspace.yaml references resolvable (no
  // dangling chips like the old phase-id `aidlc-plan` vs file `aidlc-prd`).
  const skillIdFor = (file: string): string => `aidlc-${file}`;
  // The skills a phase makes available, in declared order (primary first).
  const skillIdsOf = (p: PhaseDef): string[] => p.skillFiles.map(skillIdFor);

  const agents: Array<Record<string, unknown>> = [];
  for (const [persona, personaPhases] of phasesByPersona) {
    const refPhase = personaPhases[0];
    const caps = new Set<string>();
    // Union of every skill across all phases this persona handles, deduped
    // but order-preserving (e.g. developer → [implement, unit-test]).
    const skillSet: string[] = [];
    for (const p of personaPhases) {
      for (const c of p.capabilities ?? []) { caps.add(c); }
      for (const sid of skillIdsOf(p)) { if (!skillSet.includes(sid)) { skillSet.push(sid); } }
    }
    const agent: Record<string, unknown> = {
      id: `aidlc-${persona}`,
      name: persona.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/-/g, ' '),
      skills: skillSet,
      model: refPhase.model,
      description: `${persona} persona — handles ${personaPhases.map((p) => p.id).join(', ')}`,
    };
    if (caps.size > 0) { agent.capabilities = Array.from(caps); }
    agents.push(agent);
  }

  // One workspace.yaml skill entry per *unique skill file* across all phases,
  // pointing at the global file globalDefaultsInstaller writes.
  const skillEntries = new Map<string, Record<string, unknown>>();
  for (const p of workflow.phases) {
    for (const file of p.skillFiles) {
      const id = skillIdFor(file);
      if (!skillEntries.has(id)) {
        skillEntries.set(id, { id, path: `~/.claude/skills/aidlc-${file}.md` });
      }
    }
  }
  const skills: Array<Record<string, unknown>> = Array.from(skillEntries.values());

  const slashCommands: Array<Record<string, unknown>> = workflow.phases.map((p) => ({
    name: `/${pipelineCommandId(workflow.pipelineId, p.id)}`,
    agent: `aidlc-${p.persona}`,
  }));

  const pipeline = {
    id: workflow.pipelineId,
    steps: workflow.phases.map((p) => {
      // Default artifact path uses the conventional epic root (`docs/epics`).
      // Users who set `state.root` to something else can edit `produces:`
      // post-install — the runner / UI both honor whatever's on the step.
      // A phase whose artifact is a branch / tag (e.g. `feature/<EPIC>-<slug>`,
      // `v<X.Y.Z> tag`) skips `produces:` because there's no file to gate on.
      const producesPath = artifactPathFor(p);
      const step: Record<string, unknown> = {
        name: p.id,
        agent: `aidlc-${p.persona}`,
        skills: skillIdsOf(p),
        enabled: true,
        requires: [],
        produces: producesPath ? [producesPath] : [],
        human_review: p.humanReview,
        auto_review: p.autoReview,
      };
      if (p.dependsOn && p.dependsOn.length > 0) {
        // Deps reference phase ids (step.name), not personas — multiple
        // steps backed by the same persona stay distinct in the DAG
        // (test-plan ⤴ plan, generate-test-cases ⤴ test-plan, both as aidlc-qa).
        step.depends_on = p.dependsOn;
      }
      if (p.autoReview && p.autoReviewRunner) {
        step.auto_review_runner = p.autoReviewRunner;
      }
      return step;
    }),
    on_failure: 'stop' as const,
  };

  return {
    formatVersion: 1,
    builtin: true,
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    savedAt: '2026-01-01T00:00:00Z',
    workspace: {
      version: '1.0',
      agents,
      skills,
      environment: {},
      slash_commands: slashCommands,
      pipelines: [pipeline],
      // Task-type recipes draw from the pipeline we just composed, so a
      // freshly-applied preset can `assemblePipeline` right away.
      recipes: (workflow.recipes ?? []).map((r) => ({
        id: r.id,
        description: r.description,
        from: workflow.pipelineId,
        steps: r.steps,
      })),
      sidebar: {
        views: [
          { type: 'agents-list' },
          { type: 'skills-list' },
          { type: 'pipelines-list' },
        ],
      },
    },
    skillContents,
  };
}

/**
 * Load every built-in preset. Used by `presetStore.setBuiltinLoader` so the
 * preset picker lists all domains at once.
 */
export function loadAllBuiltinPresets(extensionPath: string): WorkspacePreset[] {
  return BUILTIN_WORKFLOWS.map((w) => loadBuiltinPreset(extensionPath, w));
}

/**
 * Compose a self-contained v2 skill from an agent persona + slash-command
 * instruction. Strips the original `Load your full persona from .claude/...`
 * lines because the persona is now inlined right above.
 */
function composeSkill(persona: string, instruction: string, phaseId: string, workflow: BuiltinWorkflow): string {
  const cleanedInstruction = instruction
    .replace(/^.*Load your full persona from `?\.?\.?\/?\.claude\/agents\/[^\n]*\n/gm, '')
    .replace(/^.*Reference `?\.?\.?\/?\.claude\/agents\/[^\n]*\n/gm, '');

  return [
    `<!-- Composed by AIDLC Flow built-in preset "${workflow.id}" — phase: ${phaseId} -->`,
    '',
    '## Persona',
    '',
    persona.trim(),
    '',
    '---',
    '',
    '## Phase Behavior',
    '',
    cleanedInstruction.trim(),
    '',
  ].join('\n');
}

export { PHASES };

/**
 * Returns a static pipeline summary for a built-in workflow, built from the
 * workflow's `phases` array — no file I/O needed.
 */
export function getBuiltinPipelineSummary(workflow: BuiltinWorkflow) {
  return {
    id: workflow.pipelineId,
    name: workflow.name,
    builtin: true as const,
    on_failure: 'stop' as const,
    steps: workflow.phases.map((p) => ({
      // `name` = phase id (slash command + display label); `agent` =
      // persona file (aidlc-po, aidlc-qa, …); `skills` = phase-scoped
      // skill list. Mirrors what `loadBuiltinPreset` writes into
      // workspace.yaml.
      name: p.id,
      agent: `aidlc-${p.persona}`,
      skills: p.skillFiles.map((f) => `aidlc-${f}`),
      enabled: true,
      produces: [] as string[],
      requires: [] as string[],
      depends_on: p.dependsOn ?? [],
      human_review: p.humanReview,
      auto_review: p.autoReview,
      ...(p.autoReview && p.autoReviewRunner ? { auto_review_runner: p.autoReviewRunner } : {}),
    })),
  };
}

/**
 * Returns the SDLC pipeline summary. Kept for back-compat — newer call sites
 * should use `getAllBuiltinPipelineSummaries()` to surface every built-in
 * workflow.
 */
export function getSdlcBuiltinPipelineSummary() {
  return getBuiltinPipelineSummary(BUILTIN_WORKFLOWS[0]);
}

/**
 * Returns pipeline summaries for every built-in workflow. Used by
 * `buildState()` to inject all built-in options into the pipeline picker
 * without requiring the user to apply the preset first — applying is only
 * needed to materialize the agent/skill files on disk for a run.
 */
export function getAllBuiltinPipelineSummaries() {
  return BUILTIN_WORKFLOWS.map((w) => getBuiltinPipelineSummary(w));
}

/**
 * Recipe summaries for every built-in workflow, resolved to their source
 * pipeline's agents. Lets the Start-Epic modal offer the Auto classifier on a
 * project that hasn't applied a preset yet — the workspace is materialized at
 * Start time.
 */
export function getBuiltinRecipeSummaries(): Array<{
  id: string;
  description: string;
  from: string;
  steps: string[];
  agents: string[];
}> {
  return BUILTIN_WORKFLOWS.flatMap((wf) => {
    const summary = getBuiltinPipelineSummary(wf);
    const agentByStep = new Map(summary.steps.map((s) => [s.name, s.agent]));
    return (wf.recipes ?? []).map((r) => ({
      id: r.id,
      description: r.description,
      from: wf.pipelineId,
      steps: r.steps,
      agents: r.steps.map((id) => agentByStep.get(id)).filter((a): a is string => !!a),
    }));
  });
}

/**
 * A recipe row as it lives in `workspace.yaml` (`config.recipes[]`): the
 * built-in {@link RecipeDef} plus the `from` pipeline it draws steps from.
 */
export interface WorkspaceRecipe {
  id: string;
  description: string;
  from: string;
  steps: string[];
}

/** The DAG identity the runner/assembler keys a pipeline step by: `name ?? agent`. */
function stepDagIdsOf(pipeline: unknown): Set<string> {
  const ids = new Set<string>();
  const steps = (pipeline as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) { return ids; }
  for (const s of steps) {
    if (!s || typeof s !== 'object') { continue; }
    const step = s as { name?: unknown; agent?: unknown };
    const id = typeof step.name === 'string' && step.name
      ? step.name
      : typeof step.agent === 'string' ? step.agent : '';
    if (id) { ids.add(id); }
  }
  return ids;
}

/**
 * Plan a recipe back-fill for an existing workspace that predates recipes.
 *
 * Recipes power task-type suggestion in `aidlc epic start --brief`. A workspace
 * scaffolded before recipes existed has a pipeline but an empty `recipes:`
 * block, so the classifier has nothing to choose from. This figures out which
 * built-in recipes can be grafted onto the workspace's *existing* pipeline.
 *
 * A recipe is valid against a pipeline only when its `steps` (DAG ids) exist in
 * that pipeline, so each built-in recipe is filtered to the steps the pipeline
 * actually has, and `from` is rebound to that pipeline's id. We prefer a
 * pipeline whose id matches a built-in workflow's `pipelineId`, then fall back
 * to whichever pipeline covers the most recipe steps — this also handles a
 * renamed/duplicated SDLC pipeline.
 *
 * Returns `null` when nothing should change: recipes already present, no
 * pipelines, or no pipeline whose steps overlap any built-in recipe. The result
 * is the array to assign to `doc.recipes`; the caller persists it.
 */
export function planRecipeMigration(
  doc: { recipes?: unknown; pipelines?: unknown },
  workflows: BuiltinWorkflow[] = BUILTIN_WORKFLOWS,
): WorkspaceRecipe[] | null {
  if (Array.isArray(doc.recipes) && doc.recipes.length > 0) { return null; }
  const pipelines = Array.isArray(doc.pipelines) ? doc.pipelines : [];
  if (pipelines.length === 0) { return null; }

  let best: { recipes: WorkspaceRecipe[]; score: number } | null = null;
  for (const wf of workflows) {
    const wfRecipes = wf.recipes ?? [];
    if (wfRecipes.length === 0) { continue; }
    for (const pipe of pipelines) {
      const pid = (pipe as { id?: unknown }).id;
      if (typeof pid !== 'string' || !pid) { continue; }
      const ids = stepDagIdsOf(pipe);
      const built: WorkspaceRecipe[] = [];
      for (const r of wfRecipes) {
        const steps = r.steps.filter((s) => ids.has(s));
        if (steps.length === 0) { continue; }
        built.push({ id: r.id, description: r.description, from: pid, steps });
      }
      if (built.length === 0) { continue; }
      // Exact pipelineId match dominates; otherwise prefer the pipeline that
      // covers the most recipe steps.
      const covered = built.reduce((n, r) => n + r.steps.length, 0);
      const score = (pid === wf.pipelineId ? 10_000 : 0) + covered;
      if (!best || score > best.score) { best = { recipes: built, score }; }
    }
  }
  return best ? best.recipes : null;
}

/**
 * Generate the content of `.claude/commands/<phase.id>.md` for a given
 * built-in phase. Inlines the composed skill + AIDLC task wiring (read
 * state/inputs, write artifact, tell user to mark done).
 *
 * For phases whose artifact is not a plain file (implement → branch,
 * release → tag), we still ask Claude to write a summary .md to the
 * artifacts/ folder so the AIDLC gate can validate something exists.
 */
export function builtinClaudeCommand(
  phase: PhaseDef,
  skillBody: string,
  epicRoot: string,
): string {
  const isFilePath = !phase.artifact.includes('<') && !phase.artifact.includes('>');
  const artifactInstruction = isFilePath
    ? `3. Write your output to \`${epicRoot}/$ARGUMENTS/artifacts/${phase.artifact}\`. The AIDLC validator checks for this file when the step is marked done.`
    : `3. Complete the work (${phase.artifact}), then write a summary to \`${epicRoot}/$ARGUMENTS/artifacts/${phase.id.toUpperCase()}-SUMMARY.md\` so the AIDLC validator has a file to check.`;

  return `---
description: ${phase.description}
---

${skillBody.trim()}

## Task

The user invoked you with epic id \`$ARGUMENTS\`.

1. Read \`${epicRoot}/$ARGUMENTS/state.json\` to understand the current run state.
   - If the step has \`feedback\` from a prior rejection, address it explicitly in this revision.
   - Check \`history\` entries for rejection reasons and context.
2. Read \`${epicRoot}/$ARGUMENTS/inputs.json\` for capability inputs (Jira ticket, Figma URL, files glob, GitHub repo, etc.).
${artifactInstruction}
4. When finished, summarize what you produced and tell the user to click **"Mark step done"** in the AIDLC panel to advance the pipeline.
`;
}

/** Back-compat alias — older call sites import `sdlcClaudeCommand`. */
export const sdlcClaudeCommand = builtinClaudeCommand;

/**
 * Returns the artifact output filename for a phase.
 * Phases whose artifact contains < > (non-file, e.g. branch / tag) get a
 * synthetic SUMMARY file name instead.
 */
export function phaseArtifactFileName(phase: PhaseDef): string {
  const isFilePath = !phase.artifact.includes('<') && !phase.artifact.includes('>');
  return isFilePath ? phase.artifact : `${phase.id.toUpperCase()}-SUMMARY.md`;
}

/**
 * Tech-stack priority for resolving a *single* base template when a project
 * spans several stacks (e.g. a fullstack web+backend app). The user-facing
 * surface wins: a feature in a fullstack app is "thought of" from the UI side,
 * so the UI template is the better skeleton. backend / cli only win when
 * they're the sole stack (a headless service / CLI tool).
 *
 *     mobile > desktop > web > backend > cli
 */
const STACK_PRIORITY: readonly string[] = ['mobile', 'desktop', 'web', 'backend', 'cli'];

/**
 * Pick the single "primary" stack from a detected set, per STACK_PRIORITY.
 * Returns `null` for an empty / null set (caller falls back to the generic
 * template). A detected value outside the priority list is returned as-is
 * (first one) so unknown-but-present stacks still select something.
 */
export function resolvePrimaryStack(stacks: readonly string[] | null | undefined): string | null {
  if (!stacks || stacks.length === 0) { return null; }
  const set = new Set(stacks);
  for (const s of STACK_PRIORITY) {
    if (set.has(s)) { return s; }
  }
  return stacks[0] ?? null;
}

export interface ArtifactTemplateOptions {
  /**
   * Full detected stack set. Used to render `{{#if <stack>}}` blocks inside
   * the chosen template — so secondary stacks (the backend half of a web app)
   * still contribute their conditional sections even though the *base* file is
   * picked by the primary stack alone. `null` → no `{{#if}}` stripping (every
   * block kept), preserving the pre-stack behavior.
   */
  stacks?: readonly string[] | null;
  /**
   * Ordered, most-specific-first file-suffix keys to try before the generic
   * `<phase>.md`. e.g. `['web-react', 'web']` looks for `implement.web-react.md`
   * then `implement.web.md` then `implement.md`. When omitted, derived from
   * `stacks` via {@link resolvePrimaryStack} (single coarse bucket).
   */
  lookupKeys?: readonly string[] | null;
}

/**
 * Read the bundled artifact templates for a built-in workflow from
 * `templates/<workflow.dir>/artifacts/`. Returns a map of
 * `<outputFileName>` → template content.
 *
 * Per phase, the template is resolved by a most-specific-first lookup —
 * `<phase>.<key>.md` for each `lookupKeys` entry, then the generic
 * `<phase>.md` — and the chosen body is rendered through the tech-stack
 * template renderer so `{{#if}}` blocks resolve against `stacks`. Falls back
 * to a placeholder when no file exists.
 *
 * Called with no options (CLI / legacy paths) it reads the generic file and
 * renders with `null` stacks — i.e. byte-identical to the pre-stack behavior.
 */
export function getBuiltinArtifactTemplates(
  extensionPath: string,
  workflow: BuiltinWorkflow,
  options: ArtifactTemplateOptions = {},
): Record<string, string> {
  const artifactsDir = path.join(extensionPath, 'templates', workflow.templatesDir, 'artifacts');
  const stacks = options.stacks ?? null;
  const lookupKeys = options.lookupKeys ?? deriveLookupKeys(stacks);

  const result: Record<string, string> = {};
  for (const phase of workflow.phases) {
    const outFile = phaseArtifactFileName(phase);
    const raw = readPhaseTemplate(artifactsDir, phase.id, lookupKeys);
    result[outFile] = raw === null
      ? `# ${phase.name} Artifact\n\n*(template missing — fill in your output here)*\n`
      : renderTemplate(raw, stacks);
  }
  return result;
}

/** Default lookup keys: the single primary coarse bucket (or none). */
function deriveLookupKeys(stacks: readonly string[] | null): string[] {
  const primary = resolvePrimaryStack(stacks);
  return primary ? [primary] : [];
}

/**
 * Try `<phaseId>.<key>.md` for each key (most-specific first), then the
 * generic `<phaseId>.md`. Returns the file body, or `null` when nothing on
 * disk matches. Unreadable matches fall through to the next candidate.
 */
function readPhaseTemplate(dir: string, phaseId: string, lookupKeys: readonly string[]): string | null {
  for (const key of lookupKeys) {
    const p = path.join(dir, `${phaseId}.${key}.md`);
    if (fs.existsSync(p)) {
      try { return fs.readFileSync(p, 'utf8'); } catch { /* try next candidate */ }
    }
  }
  const generic = path.join(dir, `${phaseId}.md`);
  if (fs.existsSync(generic)) {
    try { return fs.readFileSync(generic, 'utf8'); } catch { return null; }
  }
  return null;
}

/** Back-compat — read SDLC artifact templates specifically. */
export function getSdlcArtifactTemplates(
  extensionPath: string,
  options: ArtifactTemplateOptions = {},
): Record<string, string> {
  return getBuiltinArtifactTemplates(extensionPath, BUILTIN_WORKFLOWS[0], options);
}

/**
 * Generic auto-review runner used when a workflow ships no bundled validator.
 * Matches the AutoReviewer contract (default-exported function returning a
 * verdict). Kept minimal — passes with a note so the pipeline isn't blocked.
 */
const DEFAULT_AUTO_REVIEW_VALIDATOR = `/**
 * Auto-review runner. AIDLC loads this via dynamic import after the step's
 * \`produces\` validate and calls the default export. Return
 * { decision: 'pass' | 'reject', reason }. Replace with real checks; set
 * \`auto_review: false\` on the step to skip auto-review entirely.
 */
export default async function ci(_ctx) {
  return { decision: 'pass', reason: 'Default validator — replace with real CI checks.' };
}
`;

/**
 * Scaffold the auto-review runner module(s) a built-in workflow references.
 *
 * Phases with `auto_review: true` point `auto_review_runner` at a JS module
 * (e.g. `.aidlc/validators/ci.mjs`) that the core AutoReviewer loads via
 * dynamic `import()` — see packages/core/src/runs/AutoReviewer.ts. The module
 * MUST export a default function; a shell script can't be imported, which is
 * why the runner is `.mjs`, not `.sh` (issue #27).
 *
 * For each distinct project-relative runner path, copies the bundled template
 * (`templates/<dir>/validators/<file>`, falling back to sdlc) when present,
 * else writes a generic passing validator. Never overwrites an existing file,
 * so a user's customized validator survives re-apply.
 */
export function writeBuiltinAutoReviewValidators(
  extensionPath: string,
  root: string,
  workflow: BuiltinWorkflow,
): void {
  const seen = new Set<string>();
  for (const phase of workflow.phases) {
    if (!phase.autoReview || !phase.autoReviewRunner) { continue; }
    const rel = phase.autoReviewRunner;
    // Only scaffold project-relative runner paths we own; leave absolute or
    // out-of-tree paths to the user.
    if (path.isAbsolute(rel) || rel.startsWith('..')) { continue; }
    if (seen.has(rel)) { continue; }
    seen.add(rel);

    const dest = path.join(root, rel);
    if (fs.existsSync(dest)) { continue; }

    const base = path.basename(rel);
    const workflowTpl = path.join(extensionPath, 'templates', workflow.templatesDir, 'validators', base);
    const fallbackTpl = path.join(extensionPath, 'templates', 'sdlc', 'validators', base);
    const tpl = fs.existsSync(workflowTpl) ? workflowTpl : fs.existsSync(fallbackTpl) ? fallbackTpl : null;
    const content = tpl ? fs.readFileSync(tpl, 'utf8') : DEFAULT_AUTO_REVIEW_VALIDATOR;

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, 'utf8');
  }
}

/**
 * Set of built-in preset ids — used by wizards to flag them as undeletable
 * and to skip them when listing user presets only.
 */
export const BUILTIN_PRESET_IDS = new Set<string>(BUILTIN_WORKFLOWS.map((w) => w.id));

export function isBuiltinPreset(id: string): boolean {
  return BUILTIN_PRESET_IDS.has(id);
}
