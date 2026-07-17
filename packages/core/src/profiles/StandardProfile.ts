/**
 * Compliance-profile ("SDLC standard") resolution — GH-69.
 *
 * A **profile** is a single selector over three coupled layers:
 *   1. artifact sections   (which sections a template must carry)
 *   2. validator rules      (what the traceability validator enforces)
 *   3. per-phase agent/skill (the "opinion layer" a phase composes)
 *
 * The selector value lives at `standard:` in `.aidlc/workspace.yaml`
 * (workspace tier) and may be overridden per-epic (epic tier). A
 * profile-independent **structural/context layer** is always injected
 * regardless of profile — even under `none` — so artifacts always land in
 * `docs/epics/<epic>/artifacts/`. That layer is NOT this module's concern;
 * this module only resolves *which* profile is active and loads its manifest.
 *
 * `none` is the backward-compatible default: nothing is enforced and no
 * AIDLC persona/skill opinion is composed. A workspace with no `standard:`
 * key behaves exactly as it did before this feature existed.
 *
 * This module is pure TypeScript (no `vscode`, no side effects beyond the
 * explicit fs reads in {@link loadProfile}). The traceability *validator*
 * that consumes these rules ships separately as a self-contained `.mjs`
 * (templates/sdlc/validators/traceability.mjs) because it runs via dynamic
 * import in the target project, which cannot resolve `@aidlc/core`.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { z } from 'zod';

import type { WorkspaceConfig } from '../schema/WorkspaceSchema';

// ── Built-in profile ids ───────────────────────────────────────────

/**
 * The four profiles AIDLC ships. `standard:` may also name a custom profile
 * (a `profiles/<name>.yaml` file the user authored); {@link resolveStandard}
 * accepts any id that either is built-in or has a manifest on disk.
 */
export const BUILTIN_PROFILE_IDS = ['none', 'agile-lite', 'hybrid', 'iso-ieee'] as const;
export type BuiltinProfileId = (typeof BUILTIN_PROFILE_IDS)[number];

/** The default when `standard:` is unset — strict backward-compat (GH-69 D1). */
export const DEFAULT_PROFILE_ID: BuiltinProfileId = 'none';

/** Where profile manifests live, relative to the workspace root. */
export const PROFILES_DIR = path.join('.aidlc', 'profiles');

export function isBuiltinProfileId(id: string): id is BuiltinProfileId {
  return (BUILTIN_PROFILE_IDS as readonly string[]).includes(id);
}

// ── Profile manifest schema ────────────────────────────────────────

/** The traceability rules a profile can turn on. See traceability.mjs. */
export const TRACE_RULES = [
  /** Acceptance criteria must be testable (not vague prose). */
  'ac-testable',
  /** Every acceptance criterion is covered by ≥1 test case (once test cases exist). */
  'ac-has-test',
  /** Every test case has a recorded result (once a test report exists). */
  'tc-has-result',
  /** RTM references resolve to real ids (once traceability.md exists). */
  'rtm-no-dangling',
  /** Each present artifact carries the profile's mandatory sections. */
  'mandatory-sections',
] as const;
export type TraceRule = (typeof TRACE_RULES)[number];

const PhaseOpinionSchema = z.object({
  /** Persona (.claude/agents/<persona>.md) the phase composes. Omit under `none`. */
  persona: z.string().min(1).optional(),
  /** Skill ids (.claude/skills/<skill>.md) the phase makes available. */
  skills: z.array(z.string().min(1)).default([]),
});

const ArtifactRuleSchema = z.object({
  /** Section headings that must appear in the artifact under this profile. */
  mandatory_sections: z.array(z.string().min(1)).default([]),
  /** ID-scheme prefixes, e.g. { req: 'REQ', ac: 'AC', des: 'DES', tc: 'TC' }. */
  id_scheme: z.record(z.string(), z.string()).default({}),
});

export const ProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  /** Human-facing standard anchors, keyed by phase (display + traceability header). */
  anchors: z.record(z.string(), z.string()).default({}),
  traceability: z
    .object({
      /** Master switch — `false` means the validator always passes. */
      enforce: z.boolean().default(false),
      /** Which rules run when `enforce` is true. */
      rules: z.array(z.enum(TRACE_RULES)).default([]),
    })
    .default({ enforce: false, rules: [] }),
  /** Per-artifact section + id-scheme requirements, keyed by artifact name (PRD, TECH-DESIGN, …). */
  artifacts: z.record(z.string(), ArtifactRuleSchema).default({}),
  /** Opinion layer: per-phase persona + skills, keyed by phase id (plan, design, …). Empty ⇒ drop opinion. */
  phases: z.record(z.string(), PhaseOpinionSchema).default({}),
});

export type StandardProfile = z.infer<typeof ProfileSchema>;

// ── Errors ─────────────────────────────────────────────────────────

/** Thrown when `standard:` names a profile that is neither built-in nor on disk (GH-69-AC03). */
export class UnknownStandardError extends Error {
  constructor(
    public readonly value: string,
    public readonly known: string[],
  ) {
    super(
      `Unknown SDLC standard "${value}". ` +
        `Valid values: ${known.join(', ')}. ` +
        `Set \`standard:\` in .aidlc/workspace.yaml to one of these, ` +
        `or add a profile manifest at ${PROFILES_DIR}/${value}.yaml.`,
    );
    this.name = 'UnknownStandardError';
  }
}

/** Thrown when a profile manifest exists but is missing / invalid YAML / fails schema. */
export class ProfileLoadError extends Error {
  constructor(message: string, public readonly profilePath: string, public readonly cause?: unknown) {
    super(`[profile ${profilePath}] ${message}`);
    this.name = 'ProfileLoadError';
  }
}

// ── Resolution ─────────────────────────────────────────────────────

export interface ResolveStandardOptions {
  /** Workspace root — required to validate a custom (non-built-in) id against disk. */
  root?: string;
  /** Per-epic override (epic tier). Wins over the workspace value when set (GH-69-AC04). */
  epicOverride?: string | null;
}

/**
 * Read `standard:` off a workspace config, defensively (the field is optional
 * and callers may pass raw configs that predate the key).
 */
export function workspaceStandard(config: Pick<WorkspaceConfig, 'standard'> | { standard?: unknown }): string {
  const v = (config as { standard?: unknown }).standard;
  return typeof v === 'string' && v.length > 0 ? v : DEFAULT_PROFILE_ID;
}

/**
 * Resolve the active profile id with precedence **epic > workspace > default**.
 *
 * Validates the resolved id: a built-in id always passes; a custom id must
 * have a manifest at `<root>/.aidlc/profiles/<id>.yaml`, else
 * {@link UnknownStandardError} is thrown (fail-fast, GH-69-AC03). Built-in
 * ids never touch the filesystem, so this is safe to call with no `root`
 * (or a non-existent one) as long as the value is built-in.
 */
export function resolveStandard(
  config: Pick<WorkspaceConfig, 'standard'> | { standard?: unknown },
  opts: ResolveStandardOptions = {},
): string {
  const override = typeof opts.epicOverride === 'string' && opts.epicOverride.length > 0
    ? opts.epicOverride
    : null;
  const id = override ?? workspaceStandard(config);

  if (isBuiltinProfileId(id)) { return id; }

  // Custom profile — must exist on disk to be valid.
  const known: string[] = [...BUILTIN_PROFILE_IDS];
  if (opts.root) {
    const manifest = path.join(opts.root, PROFILES_DIR, `${id}.yaml`);
    if (fs.existsSync(manifest)) { return id; }
    for (const f of listProfileManifests(opts.root)) { known.push(f); }
  }
  throw new UnknownStandardError(id, [...new Set(known)]);
}

/** List custom profile ids that have a manifest under `<root>/.aidlc/profiles/`. */
export function listProfileManifests(root: string): string[] {
  const dir = path.join(root, PROFILES_DIR);
  if (!fs.existsSync(dir)) { return []; }
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map((f) => f.replace(/\.ya?ml$/, ''));
}

// ── Built-in manifests (embedded) ──────────────────────────────────
//
// The built-in profiles are embedded here so resolution + composition work
// without shipping the yaml files to every consumer. The yaml files under
// templates/sdlc/profiles are the *authoring* copy (scaffolded into projects
// and read by the standalone validator); they must stay in sync with these.

const BUILTIN_MANIFESTS: Record<BuiltinProfileId, StandardProfile> = {
  none: ProfileSchema.parse({
    id: 'none',
    name: 'None (backward-compatible)',
    description:
      'No opinion enforced and no AIDLC persona/skill composed. The structural/context layer is still injected so artifacts land correctly. Nothing is validated.',
    traceability: { enforce: false, rules: [] },
    phases: {},
  }),
  'agile-lite': ProfileSchema.parse({
    id: 'agile-lite',
    name: 'Agile-lite',
    description:
      'Lightweight: user stories + testable acceptance criteria + every AC covered by ≥1 test case. No full section coverage.',
    anchors: { plan: 'User stories / ACs' },
    traceability: { enforce: true, rules: ['ac-testable', 'ac-has-test'] },
    phases: {
      plan: { persona: 'po', skills: ['prd'] },
      implement: { persona: 'developer', skills: ['implement', 'unit-test'] },
      'execute-test': { persona: 'qa', skills: ['execute-test', 'test-report'] },
    },
  }),
  hybrid: ProfileSchema.parse({
    id: 'hybrid',
    name: 'Hybrid (recommended)',
    description:
      'Anchors artifacts to standard names and enforces the full traceability chain, but keeps presentation lean.',
    anchors: {
      plan: 'ISO/IEC/IEEE 29148',
      design: 'ISO/IEC/IEEE 1016 / 42010',
      'test-plan': 'ISO/IEC/IEEE 29119',
    },
    traceability: { enforce: true, rules: ['ac-testable', 'ac-has-test', 'tc-has-result', 'rtm-no-dangling'] },
    phases: {
      plan: { persona: 'po', skills: ['prd'] },
      design: { persona: 'tech-lead', skills: ['tech-design'] },
      'test-plan': { persona: 'qa', skills: ['test-plan'] },
      implement: { persona: 'developer', skills: ['implement', 'unit-test'] },
      'generate-test-cases': { persona: 'qa', skills: ['generate-test-cases'] },
      'execute-test': { persona: 'qa', skills: ['execute-test', 'test-report'] },
    },
  }),
  'iso-ieee': ProfileSchema.parse({
    id: 'iso-ieee',
    name: 'ISO/IEC/IEEE',
    description:
      'Full section coverage per 29148 / 1016 / 29119 plus a mandatory RTM. For audit / compliance teams.',
    anchors: {
      plan: 'ISO/IEC/IEEE 29148',
      design: 'ISO/IEC/IEEE 1016 / 42010',
      'test-plan': 'ISO/IEC/IEEE 29119',
    },
    traceability: {
      enforce: true,
      rules: ['ac-testable', 'ac-has-test', 'tc-has-result', 'rtm-no-dangling', 'mandatory-sections'],
    },
    artifacts: {
      PRD: {
        mandatory_sections: [
          'Problem & Goal',
          'User Flow',
          'Acceptance Criteria',
          'Non-Functional Requirements',
          'Dependencies',
        ],
        id_scheme: { req: 'REQ', ac: 'AC' },
      },
      'TECH-DESIGN': { mandatory_sections: ['Architecture', 'API', 'Data Model'], id_scheme: { des: 'DES' } },
      'TEST-CASES': { mandatory_sections: ['Test Cases'], id_scheme: { tc: 'TC' } },
    },
    phases: {
      plan: { persona: 'po', skills: ['prd'] },
      design: { persona: 'tech-lead', skills: ['tech-design'] },
      'test-plan': { persona: 'qa', skills: ['test-plan'] },
      implement: { persona: 'developer', skills: ['implement', 'unit-test'] },
      'generate-test-cases': { persona: 'qa', skills: ['generate-test-cases'] },
      'execute-test': { persona: 'qa', skills: ['execute-test', 'test-report'] },
    },
  }),
};

/**
 * Load a profile manifest by id.
 *
 * Built-in ids return the embedded manifest (no fs). A custom id reads
 * `<root>/.aidlc/profiles/<id>.yaml`, parses + schema-validates it, and throws
 * {@link ProfileLoadError} on any problem (missing / bad YAML / schema fail) —
 * never silently falls back to a different profile (GH-69 error path).
 */
export function loadProfile(id: string, root?: string): StandardProfile {
  if (isBuiltinProfileId(id)) { return BUILTIN_MANIFESTS[id]; }

  if (!root) {
    throw new ProfileLoadError('cannot load a custom profile without a workspace root', `${id}.yaml`);
  }
  const manifest = path.join(root, PROFILES_DIR, `${id}.yaml`);
  if (!fs.existsSync(manifest)) {
    throw new ProfileLoadError('manifest file not found', manifest);
  }
  let parsed: unknown;
  try {
    parsed = yaml.load(fs.readFileSync(manifest, 'utf8'));
  } catch (err) {
    throw new ProfileLoadError(`YAML parse error: ${err instanceof Error ? err.message : String(err)}`, manifest, err);
  }
  const result = ProfileSchema.safeParse(parsed);
  if (!result.success) {
    const summary = result.error.issues.slice(0, 5).map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new ProfileLoadError(`invalid profile manifest:\n${summary}`, manifest);
  }
  return result.data;
}

/** Convenience: resolve + load in one call. */
export function loadActiveProfile(
  config: Pick<WorkspaceConfig, 'standard'> | { standard?: unknown },
  opts: ResolveStandardOptions = {},
): StandardProfile {
  const id = resolveStandard(config, opts);
  return loadProfile(id, opts.root);
}

/** All built-in manifests — for UI dropdowns and docs. */
export function builtinProfiles(): StandardProfile[] {
  return BUILTIN_PROFILE_IDS.map((id) => BUILTIN_MANIFESTS[id]);
}
