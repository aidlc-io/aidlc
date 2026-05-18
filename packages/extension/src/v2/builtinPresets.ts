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

import type { WorkspacePreset } from './presetStore';

interface PhaseDef {
  id: string;
  name: string;
  persona: string;        // file under agents/
  skillFile: string | null; // file under skills/, or null = use persona only
  model: string;
  description: string;
  inputs: string;
  outputs: string;
  artifact: string;
  humanReview: boolean;
  autoReview: boolean;
  autoReviewRunner?: string; // path to runner script, required when autoReview is true
}

const PHASES: PhaseDef[] = [
  {
    id: 'plan', name: 'Plan', persona: 'po', skillFile: 'epic', model: 'claude-opus-4-7',
    description: 'Scaffold the epic and write the PRD.',
    inputs: 'Jira ticket, business context, Figma designs',
    outputs: 'Epic doc + PRD with measurable acceptance criteria',
    artifact: 'PRD.md',
    humanReview: true, autoReview: false,
  },
  {
    id: 'design', name: 'Design', persona: 'tech-lead', skillFile: 'tech-design', model: 'claude-opus-4-7',
    description: 'Design the implementation approach.',
    inputs: 'PRD, existing code, dependency graph',
    outputs: 'Architecture, API contract, DI plan, file impact list',
    artifact: 'TECH-DESIGN.md',
    humanReview: true, autoReview: false,
  },
  {
    id: 'test-plan', name: 'Test Plan', persona: 'qa', skillFile: 'test-plan', model: 'claude-sonnet-4-6',
    description: 'Plan how the feature will be verified.',
    inputs: 'PRD acceptance criteria, tech design, ITS / device matrix',
    outputs: 'Test cases (UT / UI / integration / performance), device matrix',
    artifact: 'TEST-PLAN.md',
    humanReview: true, autoReview: false,
  },
  {
    id: 'implement', name: 'Implement', persona: 'developer', skillFile: null, model: 'claude-sonnet-4-6',
    description: 'Build the feature on a feature branch.',
    inputs: 'Tech design, test plan, project coding rules',
    outputs: 'Code + unit tests on feature branch, PR opened',
    artifact: 'feature/<EPIC>-<slug>',
    humanReview: true, autoReview: true, autoReviewRunner: '.aidlc/scripts/ci.sh',
  },
  {
    id: 'review', name: 'Review', persona: 'auto-reviewer', skillFile: 'review', model: 'claude-opus-4-7',
    description: 'Review the diff against the PRD + tech design.',
    inputs: 'Git diff, PRD, tech design, test plan',
    outputs: 'AC validation table, architecture check, verdict (pass / reject)',
    artifact: 'APPROVAL.md',
    humanReview: true, autoReview: false,
  },
  {
    id: 'execute-test', name: 'Execute Test', persona: 'qa', skillFile: 'execute-test', model: 'claude-sonnet-4-6',
    description: 'Run the test plan on the merged code.',
    inputs: 'Merged code, test plan, UAT environment',
    outputs: 'Test execution report, tester sign-off',
    artifact: 'TEST-SCRIPT.md',
    humanReview: true, autoReview: false,
  },
  {
    id: 'release', name: 'Release', persona: 'release-manager', skillFile: 'release', model: 'claude-sonnet-4-6',
    description: 'Cut the release.',
    inputs: 'Git log since last tag, epic test execution status',
    outputs: 'Release checklist, app store / changelog notes, version tag',
    artifact: 'v<X.Y.Z> tag',
    humanReview: true, autoReview: false,
  },
  {
    id: 'monitor', name: 'Monitor', persona: 'sre', skillFile: 'monitor', model: 'claude-sonnet-4-6',
    description: 'Watch production for regressions after release.',
    inputs: 'App Store crashes, analytics events, support tickets',
    outputs: 'Health report, KHI table, Go / Hotfix decision',
    artifact: 'HEALTH-REPORT.md',
    humanReview: true, autoReview: false,
  },
  {
    id: 'doc-sync', name: 'Doc Sync', persona: 'archivist', skillFile: 'doc-sync', model: 'claude-sonnet-4-6',
    description: 'Reverse-sync docs to match what was actually built.',
    inputs: 'PRD plan, tech design plan, actual git commits',
    outputs: 'Updated core-business / architecture docs, reverse-sync checklist',
    artifact: 'DOC-REVERSE-SYNC.md',
    humanReview: true, autoReview: false,
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

1. Read \`docs/sdlc/epics/<KEY>/TECH-DESIGN.md\` and \`docs/sdlc/epics/<KEY>/TEST-PLAN.md\`.
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
export interface BuiltinWorkflow {
  id: string;
  pipelineId: string;
  name: string;
  templatesDir: string;
  description: string;
}

export const BUILTIN_WORKFLOWS: BuiltinWorkflow[] = [
  {
    id: 'sdlc-pipeline',
    pipelineId: 'sdlc-full',
    name: 'SDLC Pipeline',
    templatesDir: 'sdlc',
    description:
      'Generic SDLC pipeline: Plan → Design → Test Plan → Implement → Review → Execute Test → Release → Monitor → Doc Sync. Stack-neutral baseline with PO / Tech Lead / QA / Developer / RM / SRE / Archivist agents.',
  },
  {
    id: 'electron-app-pipeline',
    pipelineId: 'electron-app-full',
    name: 'Electron App Pipeline',
    templatesDir: 'electron-app',
    description:
      'Desktop apps on Electron — main/renderer split, IPC contextBridge, auto-update, code signing & notarization, Playwright + Spectron-style e2e, electron-builder release flow.',
  },
  {
    id: 'ios-native-pipeline',
    pipelineId: 'ios-native-full',
    name: 'iOS Native Pipeline',
    templatesDir: 'ios-native',
    description:
      'Native iOS apps — Swift / SwiftUI / Combine / Swift Concurrency, XCTest + XCUITest, SPM, fastlane, TestFlight beta, App Store rollout, MetricKit observability.',
  },
  {
    id: 'web-app-pipeline',
    pipelineId: 'web-app-full',
    name: 'Web App Pipeline',
    templatesDir: 'web-app',
    description:
      'Modern web apps — TypeScript + React (Next.js or Vite), TanStack Query, Zod, Playwright + Vitest + Testing Library, Core Web Vitals, Vercel/Cloud-Run release flow.',
  },
  {
    id: 'backend-dotnet-pipeline',
    pipelineId: 'backend-dotnet-full',
    name: 'Backend .NET Pipeline',
    templatesDir: 'backend-dotnet',
    description:
      'ASP.NET Core services — Minimal APIs, EF Core, FluentValidation, Serilog + OpenTelemetry, xUnit + Testcontainers, dotnet-format, Helm/ACR release flow.',
  },
  {
    id: 'backend-spring-boot-pipeline',
    pipelineId: 'backend-spring-boot-full',
    name: 'Backend Spring Boot Pipeline',
    templatesDir: 'backend-spring-boot',
    description:
      'Spring Boot 3 services — JPA/Hibernate, Bean Validation, Resilience4j, Micrometer + OpenTelemetry, JUnit 5 + Testcontainers, Flyway migrations, Spring profiles release flow.',
  },
  {
    id: 'backend-golang-pipeline',
    pipelineId: 'backend-golang-full',
    name: 'Backend Go Pipeline',
    templatesDir: 'backend-golang',
    description:
      'Go services — chi/echo, sqlc + pgx, context-first APIs, structured logging (slog), table-driven tests + httptest, golangci-lint, goreleaser release flow.',
  },
  {
    id: 'mobile-react-native-pipeline',
    pipelineId: 'mobile-react-native-full',
    name: 'Mobile React Native Pipeline',
    templatesDir: 'mobile-react-native',
    description:
      'React Native (Expo or bare) — React Navigation, TanStack Query, Reanimated, Hermes, Jest + React Native Testing Library + Detox, EAS Submit / Fastlane release flow.',
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
 * Load + compose a built-in preset. Bundled .md files are read at
 * runtime from the extension's installed location, so the build pipeline
 * doesn't need a separate "compose preset JSON" step.
 */
export function loadBuiltinPreset(extensionPath: string, workflow: BuiltinWorkflow): WorkspacePreset {
  const workflowDir = path.join(extensionPath, 'templates', workflow.templatesDir);
  const agentsDir = path.join(workflowDir, 'agents');
  const skillsDir = path.join(workflowDir, 'skills');

  // Skill content lives in `~/.claude/skills/aidlc-<workflowId>-<phaseId>.md`,
  // dropped there by `globalDefaultsInstaller` at extension activation. We
  // keep `skillContents` empty so PresetStore.applyTo doesn't write a second
  // copy under `.aidlc/skills/` — one source of truth, no per-workflow
  // collision when multiple presets land in the same project.
  //
  // We still compose `skillContents[phase.id]` for the back-compat path
  // (`.claude/commands/<phase>.md` writers read it) — but mark those entries
  // for download-on-write paths only, not for the skills block.
  const skillContents: Record<string, string> = {};
  const agents: Array<Record<string, unknown>> = [];
  const skills: Array<Record<string, unknown>> = [];
  const slashCommands: Array<Record<string, unknown>> = [];

  for (const phase of PHASES) {
    const personaPath = path.join(agentsDir, `${phase.persona}.md`);
    const persona = fs.existsSync(personaPath)
      ? fs.readFileSync(personaPath, 'utf8')
      : `# ${phase.name}\n\n(persona file missing: agents/${phase.persona}.md)\n`;

    let instruction: string;
    if (phase.skillFile) {
      const skillPath = path.join(skillsDir, `${phase.skillFile}.md`);
      instruction = fs.existsSync(skillPath)
        ? fs.readFileSync(skillPath, 'utf8')
        : `# /${phase.id}\n\n(skill file missing: skills/${phase.skillFile}.md)\n`;
    } else {
      instruction =
        IMPLEMENT_FALLBACK_INSTRUCTIONS[workflow.id] ?? IMPLEMENT_FALLBACK_INSTRUCTIONS.default;
    }

    // Namespace every workspace.yaml id by the workflow's short slug so
    // multiple built-in presets can land in the same project without
    // colliding (e.g. iOS Native's `plan` agent vs Web App's `plan` agent).
    // Drop the redundant `-pipeline` suffix from workflow.id for ergonomics:
    // `sdlc-pipeline` → `sdlc`, `ios-native-pipeline` → `ios-native`.
    const slug = workflowSlug(workflow);
    const nsId = `${slug}-${phase.id}`;

    skillContents[nsId] = composeSkill(persona, instruction, phase.id, workflow);

    // Reference the global installer copy (`~/.claude/skills/...`). SkillLoader
    // expands `~/` at load time so workspace.yaml stays portable.
    skills.push({ id: nsId, path: `~/.claude/skills/aidlc-${workflow.id}-${phase.id}.md` });
    agents.push({
      id: nsId,
      name: `${workflow.name}: ${phase.name}`,
      skill: nsId,
      model: phase.model,
      description: phase.description,
      inputs: phase.inputs,
      outputs: phase.outputs,
      artifact: phase.artifact,
    });
    slashCommands.push({ name: `/${nsId}`, agent: nsId });
  }

  const slug = workflowSlug(workflow);
  const pipeline = {
    id: workflow.pipelineId,
    steps: PHASES.map((p) => {
      const step: Record<string, unknown> = {
        agent: `${slug}-${p.id}`,
        enabled: true,
        requires: [],
        produces: [],
        human_review: p.humanReview,
        auto_review: p.autoReview,
      };
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
 * Backward-compatible loader for the original SDLC preset. Newer call sites
 * should use `loadBuiltinPreset(extPath, getBuiltinWorkflow(id)!)` or
 * `loadAllBuiltinPresets()`.
 */
export function loadSdlcPreset(extensionPath: string): WorkspacePreset {
  return loadBuiltinPreset(extensionPath, BUILTIN_WORKFLOWS[0]);
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

/** Pipeline id for the original SDLC built-in workflow in workspace.yaml. */
export const SDLC_PIPELINE_ID = BUILTIN_WORKFLOWS[0].pipelineId;

export { PHASES };

/**
 * Returns a static pipeline summary for a built-in workflow, built from the
 * PHASES constant — no file I/O needed.
 */
export function getBuiltinPipelineSummary(workflow: BuiltinWorkflow) {
  return {
    id: workflow.pipelineId,
    name: workflow.name,
    builtin: true as const,
    on_failure: 'stop' as const,
    steps: PHASES.map((p) => ({
      agent: p.id,
      name: p.name,
      enabled: true,
      produces: [] as string[],
      requires: [] as string[],
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
 * Read the bundled artifact templates for a built-in workflow from
 * `templates/<workflow.dir>/artifacts/`. Returns a map of
 * `<outputFileName>` → template content. Falls back gracefully if a
 * template file is missing.
 */
export function getBuiltinArtifactTemplates(extensionPath: string, workflow: BuiltinWorkflow): Record<string, string> {
  const artifactsDir = path.join(extensionPath, 'templates', workflow.templatesDir, 'artifacts');
  const result: Record<string, string> = {};
  for (const phase of PHASES) {
    const templatePath = path.join(artifactsDir, `${phase.id}.md`);
    const outFile = phaseArtifactFileName(phase);
    result[outFile] = fs.existsSync(templatePath)
      ? fs.readFileSync(templatePath, 'utf8')
      : `# ${phase.name} Artifact\n\n*(template missing — fill in your output here)*\n`;
  }
  return result;
}

/** Back-compat — read SDLC artifact templates specifically. */
export function getSdlcArtifactTemplates(extensionPath: string): Record<string, string> {
  return getBuiltinArtifactTemplates(extensionPath, BUILTIN_WORKFLOWS[0]);
}

/**
 * Set of built-in preset ids — used by wizards to flag them as undeletable
 * and to skip them when listing user presets only.
 */
export const BUILTIN_PRESET_IDS = new Set<string>(BUILTIN_WORKFLOWS.map((w) => w.id));

export function isBuiltinPreset(id: string): boolean {
  return BUILTIN_PRESET_IDS.has(id);
}
