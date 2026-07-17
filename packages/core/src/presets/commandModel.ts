/**
 * Two-layer command model — GH-71.
 *
 * Replaces the one-command-per-(pipeline × phase) fan-out
 * (`<pipelineId>-<phaseId>`, see {@link pipelineCommandId}) with:
 *
 *   1. **Shortcut layer** — a fixed set of phase commands (`/plan`, `/design`,
 *      …) shared across all pipelines, no pipeline prefix. Count is fixed at
 *      the number of canonical phases; adding a pipeline adds zero commands.
 *   2. **Backbone dispatcher** — a single `/aidlc <epic> [phase]` that resolves
 *      composition at runtime via `epic → its pipeline → phase` and, with no
 *      phase arg, runs the next eligible phase.
 *
 * Composition is resolved from the epic's *pipeline binding* (its run
 * `state.json` → `pipelineId` → that pipeline's step wiring), never from the
 * command name. So two pipelines that reuse a phase name with different
 * agent/skill wiring never share composition — {@link resolveComposition} keys
 * off the pipeline, not the command.
 *
 * This module is pure TypeScript. The command *files* it generates are Claude
 * Code slash-command markdown; the runtime resolution they describe is carried
 * out by Claude reading `state.json` + `workspace.yaml` at invocation time
 * (there is no JS in a `.md` command), which is why the composition logic here
 * is also exposed as pure functions the extension + tests can call directly.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { PipelineConfig, WorkspaceConfig } from '../schema/WorkspaceSchema';
import { normalizeStep, stepDagId } from '../schema/WorkspaceSchema';
import type { RunState } from '../runs/RunState';

// ── Canonical phase set (the fixed shortcut layer) ─────────────────

export interface CanonicalPhase {
  /** Phase id === shortcut command name (no pipeline prefix). */
  id: string;
  /** Display label. */
  name: string;
  /** One-line command description (frontmatter). */
  description: string;
  /**
   * Default artifact filename hint. Runtime resolution may point elsewhere,
   * but the shortcut prompt uses this as the expected output when the pipeline
   * step doesn't declare one. Filenames only — never a branch/tag pattern.
   */
  artifact: string;
}

/**
 * The canonical phases every pipeline draws from. Mirrors `PHASES` in
 * builtinWorkflows.ts plus two first-class additions from GH-71:
 * `unit-test` (split out of implement's `['implement','unit-test']`) and
 * `benchmark` (performance run, previously unmodeled).
 */
export const CANONICAL_PHASES: CanonicalPhase[] = [
  { id: 'plan', name: 'Plan', description: 'Scaffold the epic and write the PRD.', artifact: 'PRD.md' },
  { id: 'design', name: 'Design', description: 'Design the implementation approach.', artifact: 'TECH-DESIGN.md' },
  { id: 'test-plan', name: 'Test Plan', description: 'Plan how the feature will be verified.', artifact: 'TEST-PLAN.md' },
  { id: 'implement', name: 'Implement', description: 'Build the feature on a feature branch.', artifact: 'IMPLEMENT-SUMMARY.md' },
  { id: 'unit-test', name: 'Unit Test', description: 'Write / run the unit tests for the feature.', artifact: 'UNIT-TEST-SUMMARY.md' },
  { id: 'benchmark', name: 'Benchmark', description: 'Run performance / benchmark checks.', artifact: 'BENCHMARK-SUMMARY.md' },
  { id: 'generate-test-cases', name: 'Generate Test Cases', description: 'Concrete, executable test cases from the plan.', artifact: 'TEST-CASES.md' },
  { id: 'execute-test', name: 'Execute Test', description: 'Run the test cases and write the report.', artifact: 'TEST-SCRIPT.md' },
];

export const CANONICAL_PHASE_IDS: string[] = CANONICAL_PHASES.map((p) => p.id);

const CANONICAL_BY_ID = new Map(CANONICAL_PHASES.map((p) => [p.id, p]));

export function isCanonicalPhase(id: string): boolean {
  return CANONICAL_BY_ID.has(id);
}

export function getCanonicalPhase(id: string): CanonicalPhase | undefined {
  return CANONICAL_BY_ID.get(id);
}

/** The backbone dispatcher command id / filename stem. */
export const BACKBONE_COMMAND_ID = 'aidlc';

/**
 * Shortcut command id for a phase — the phase id itself (no pipeline prefix).
 * This is the whole point of GH-71: `/plan`, not `/sdlc-parallel-full-plan`.
 */
export function shortcutCommandId(phaseId: string): string {
  return phaseId;
}

// ── Runtime composition resolution (epic → pipeline → phase) ───────

export interface PhaseComposition {
  /** False when the phase is not a step in this pipeline (drives the no-op message). */
  found: boolean;
  phaseId: string;
  pipelineId: string;
  /** Agent/persona id that runs the phase (from the pipeline step). */
  agent?: string;
  /** Skill ids the phase makes available — step override, else the agent's defaults. */
  skills?: string[];
  humanReview?: boolean;
  autoReview?: boolean;
}

/**
 * Resolve the agent + skills a phase runs under **for a specific pipeline**.
 *
 * Looks the phase up by its DAG id (`name ?? agent`) among the pipeline's
 * steps. When the step omits per-step `skills`, falls back to the referenced
 * agent's `skills:` (matching how the runner scopes a step). Returns
 * `{ found: false }` when the pipeline has no such step — the caller (shortcut
 * command / dispatcher) then reports "this epic's pipeline has no `<phase>`
 * step" instead of composing nothing.
 */
export function resolveComposition(
  config: WorkspaceConfig,
  pipelineId: string,
  phaseId: string,
): PhaseComposition {
  const pipeline = config.pipelines.find((p) => p.id === pipelineId);
  if (!pipeline) {
    return { found: false, phaseId, pipelineId };
  }
  const stepCfg = pipeline.steps.find((s) => stepDagId(s) === phaseId);
  if (!stepCfg) {
    return { found: false, phaseId, pipelineId };
  }
  const step = normalizeStep(stepCfg);
  let skills = step.skills;
  if (!skills || skills.length === 0) {
    const agent = config.agents.find((a) => a.id === step.agent);
    skills = agent?.skills ?? [];
  }
  return {
    found: true,
    phaseId,
    pipelineId,
    agent: step.agent,
    skills,
    humanReview: step.human_review,
    autoReview: step.auto_review,
  };
}

// ── Next-eligible-phase resolution (for `/aidlc <epic>` with no phase) ──

export interface EligiblePhase {
  index: number;
  phaseId: string;
  /** Why this step is the one to run now. */
  reason: 'awaiting_work' | 'rejected' | 'unblocked';
}

/**
 * The next phase a user should run for an epic, respecting `depends_on` + gate
 * status. Read-only — mirrors the runner's advance logic without mutating.
 *
 * Priority, scanning steps in index order:
 *   1. a step `awaiting_work` (already unblocked, work not yet submitted),
 *   2. a step `rejected` (needs rework),
 *   3. a `pending` step whose every `depends_on` is `approved` (just eligible).
 *
 * Steps that are `approved` or paused for review (`awaiting_auto_review` /
 * `awaiting_review`) are not "run a phase" actions, so they're skipped.
 * Returns `null` when nothing is actionable (all done or all gated on review).
 */
export function nextEligiblePhase(state: RunState, pipeline: PipelineConfig): EligiblePhase | null {
  const dagId = (idx: number): string => {
    const cfg = pipeline.steps[idx];
    return cfg ? stepDagId(cfg) : state.steps[idx]?.agent ?? String(idx);
  };
  const statusByDagId = new Map<string, string>();
  state.steps.forEach((s, idx) => statusByDagId.set(dagId(idx), s.status));

  // 1 + 2: an already-open or rejected step, whichever comes first by index.
  for (let i = 0; i < state.steps.length; i++) {
    const st = state.steps[i].status;
    if (st === 'awaiting_work') { return { index: i, phaseId: dagId(i), reason: 'awaiting_work' }; }
    if (st === 'rejected') { return { index: i, phaseId: dagId(i), reason: 'rejected' }; }
  }
  // 3: first pending step whose deps are all approved.
  for (let i = 0; i < state.steps.length; i++) {
    if (state.steps[i].status !== 'pending') { continue; }
    const cfg = pipeline.steps[i];
    const deps = cfg ? normalizeStep(cfg).depends_on : [];
    const ready = deps.every((d) => statusByDagId.get(d) === 'approved');
    if (ready) { return { index: i, phaseId: dagId(i), reason: 'unblocked' }; }
  }
  return null;
}

// ── Auto-provision: phases a workflow uses that have no shortcut yet ──

/**
 * Phases referenced by any pipeline step that are NOT in the canonical
 * shortcut set — e.g. a custom `security-review` phase. The extension shows
 * these in the "create commands for these phases?" popup on workflow
 * create/edit (GH-71). Deduped, in first-seen order.
 */
export function unprovisionedPhases(
  config: WorkspaceConfig,
  canonical: string[] = CANONICAL_PHASE_IDS,
): string[] {
  const known = new Set(canonical);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const pipeline of config.pipelines) {
    for (const step of pipeline.steps) {
      const id = stepDagId(step);
      if (!id || known.has(id) || seen.has(id)) { continue; }
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

// ── Command-file generation ────────────────────────────────────────

/**
 * The backbone dispatcher command body (`.claude/commands/aidlc.md`).
 *
 * Describes the runtime-resolution procedure Claude follows: bind the epic to
 * its pipeline, resolve the phase's wiring, load the persona + skill, then act
 * under the always-present structural contract (write to the artifacts dir,
 * tell the user to Mark step done). `$ARGUMENTS` is `<epic> [phase]`.
 */
export function backboneCommandDoc(epicRoot: string = 'docs/epics'): string {
  return `---
description: AIDLC dispatcher — run a phase for an epic, or the next eligible phase. Usage: /aidlc <epic> [phase]
---

# AIDLC dispatcher

You were invoked as \`/aidlc <epic> [phase]\` with arguments: \`$ARGUMENTS\`.
The first token is the **epic id**; an optional second token is the **phase**.

## 1. Bind the epic to its pipeline

1. Read \`${epicRoot}/<epic>/state.json\`. Note \`pipelineId\` (the pipeline this
   epic is bound to) and the per-step \`status\` list. If the file is missing,
   tell the user the epic isn't started and stop.

## 2. Choose the phase

- **If a phase was given**, use it. Validate it is a step in the epic's
  pipeline (see step 3). If it isn't, tell the user which phases the pipeline
  *does* have and stop.
- **If no phase was given**, pick the **next eligible phase**: the first step
  that is \`awaiting_work\`, else the first \`rejected\` step, else the first
  \`pending\` step whose every \`depends_on\` is \`approved\`. If none is
  actionable (all approved or paused for review), say so and stop.

## 3. Resolve composition from the pipeline (never from the command name)

1. Read \`.aidlc/workspace.yaml\`. Find the pipeline whose \`id\` === \`pipelineId\`.
2. In that pipeline's \`steps\`, find the step whose \`name\` (or \`agent\` when
   unnamed) === the chosen phase. That step's \`agent\` + \`skills\` are the
   wiring. If the step omits \`skills\`, use the referenced agent's \`skills:\`.
3. Load the persona from \`.claude/agents/<agent>.md\` (fall back to
   \`~/.claude/agents/<agent>.md\`), and each skill from
   \`.claude/skills/<skill>.md\` (fall back to \`~/.claude/skills/<skill>.md\`).
   Adopt the persona and follow the skill instructions.

If the active SDLC standard (\`standard:\` in workspace.yaml, or a per-epic
override) is \`none\`, skip the persona/skill (opinion) layer and act as plain
Claude — but still follow the structural contract below.

## 4. Structural contract (always applies, every profile)

1. Read \`${epicRoot}/<epic>/state.json\` for prior feedback/history and address
   any rejection reasons in this revision.
2. Read \`${epicRoot}/<epic>/inputs.json\` for capability inputs.
3. Write your output to \`${epicRoot}/<epic>/artifacts/<FILE>\` where \`<FILE>\`
   is the step's declared artifact, or the phase's conventional file. The AIDLC
   validator checks this path when the step is marked done.
4. Summarize what you produced and tell the user to click **"Mark step done"**
   in the AIDLC panel to advance the pipeline.
`;
}

/**
 * A shortcut command body (`.claude/commands/<phase>.md`). A thin alias into
 * the backbone with the phase fixed — keeps the composition logic in one place.
 */
export function shortcutCommandDoc(phase: CanonicalPhase, epicRoot: string = 'docs/epics'): string {
  return `---
description: ${phase.description} (AIDLC ${phase.name} phase) Usage: /${phase.id} <epic>
---

# /${phase.id} — ${phase.name}

You were invoked as \`/${phase.id} <epic>\` with arguments: \`$ARGUMENTS\` (the epic id).

Run the **\`${phase.id}\`** phase for this epic by following the AIDLC dispatch
procedure exactly as \`/aidlc <epic> ${phase.id}\` would:

1. Read \`${epicRoot}/<epic>/state.json\` → \`pipelineId\`.
2. In \`.aidlc/workspace.yaml\`, find that pipeline and its \`${phase.id}\` step
   (\`name\`/\`agent\` === \`${phase.id}\`). Use that step's \`agent\` + \`skills\` —
   never assume; two pipelines can wire \`${phase.id}\` differently.
3. **If the pipeline has no \`${phase.id}\` step**, tell the user this epic's
   pipeline (\`<pipelineId>\`) has no \`${phase.id}\` phase, suggest
   \`/aidlc <epic>\` to run the next eligible phase, and stop.
4. Otherwise load the persona (\`.claude/agents/<agent>.md\`) + skill(s)
   (\`.claude/skills/<skill>.md\`), adopt them (unless the active standard is
   \`none\`), then follow the structural contract: read state/inputs, write to
   \`${epicRoot}/<epic>/artifacts/${phase.artifact}\` (or the step's declared
   artifact), and tell the user to click **"Mark step done"**.
`;
}

export interface WriteCommandsResult {
  /** Absolute paths of command files written this call. */
  written: string[];
  /** Absolute paths skipped because they existed and overwrite was false. */
  skipped: string[];
}

/**
 * Write the two-layer command set into \`<root>/.claude/commands/\`:
 * the backbone \`aidlc.md\` plus one \`<phase>.md\` per canonical phase.
 *
 * Idempotent: never overwrites an existing file unless \`overwrite\` is set,
 * so a user's hand-tuned command survives re-provision.
 */
export function writeTwoLayerCommands(
  root: string,
  opts: { epicRoot?: string; phases?: CanonicalPhase[]; overwrite?: boolean } = {},
): WriteCommandsResult {
  const epicRoot = opts.epicRoot ?? 'docs/epics';
  const phases = opts.phases ?? CANONICAL_PHASES;
  const overwrite = opts.overwrite ?? false;

  const commandsDir = path.join(root, '.claude', 'commands');
  fs.mkdirSync(commandsDir, { recursive: true });

  const written: string[] = [];
  const skipped: string[] = [];
  const emit = (file: string, body: string): void => {
    if (fs.existsSync(file) && !overwrite) { skipped.push(file); return; }
    fs.writeFileSync(file, body, 'utf8');
    written.push(file);
  };

  emit(path.join(commandsDir, `${BACKBONE_COMMAND_ID}.md`), backboneCommandDoc(epicRoot));
  for (const phase of phases) {
    emit(path.join(commandsDir, `${shortcutCommandId(phase.id)}.md`), shortcutCommandDoc(phase, epicRoot));
  }
  return { written, skipped };
}

/**
 * Generate shortcut command bodies for arbitrary phase ids (canonical or not)
 * — used by the "create commands for these phases?" auto-provision popup. A
 * non-canonical id gets a generic {@link CanonicalPhase} shell so it still
 * produces a runnable shortcut.
 */
export function provisionShortcutDocs(
  phaseIds: string[],
  epicRoot: string = 'docs/epics',
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of phaseIds) {
    const phase = getCanonicalPhase(id) ?? {
      id,
      name: id.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/-/g, ' '),
      description: `Run the ${id} phase.`,
      artifact: `${id.toUpperCase()}-SUMMARY.md`,
    };
    out[id] = shortcutCommandDoc(phase, epicRoot);
  }
  return out;
}
