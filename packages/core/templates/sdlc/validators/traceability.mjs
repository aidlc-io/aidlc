/**
 * Traceability auto-review runner — GH-69 (P1).
 *
 * Enforces the requirements-traceability chain of the ACTIVE SDLC profile:
 *
 *     REQ → AC → DES → TC → RESULT     (RTM ties them together)
 *
 * AIDLC loads this via dynamic import after a step's `produces` validate and
 * calls the default export with { workspaceRoot, state, step, pipeline, paths }.
 * Returns { decision: 'pass' | 'reject', reason }.
 *
 * The profile is chosen by `standard:` in .aidlc/workspace.yaml (workspace
 * tier), overridable per-epic by a `standard:` key in the epic's state.json
 * (epic tier). Under `none` (or unset) this validator always passes — nothing
 * is enforced, matching the backward-compatible default.
 *
 * Phase-progressive by design: a rule only fires once the artifact it needs
 * exists. "Every AC has a test" is not enforced until TEST-CASES.md is
 * present, so early phases (e.g. the plan step, before any test cases exist)
 * are never blocked for downstream gaps.
 *
 * Self-contained: no `@aidlc/core` import (it runs in the target project,
 * which can't resolve the package). Built-in profile rules are embedded; a
 * custom profile is read from .aidlc/profiles/<id>.yaml when js-yaml is
 * importable, else it is treated as enforce-nothing with a logged note.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// Built-in profile traceability config — mirrors
// packages/core/src/profiles/StandardProfile.ts. Keep in sync.
const BUILTIN_TRACE = {
  none: { enforce: false, rules: [] },
  'agile-lite': { enforce: true, rules: ['ac-testable', 'ac-has-test'] },
  hybrid: { enforce: true, rules: ['ac-testable', 'ac-has-test', 'tc-has-result', 'rtm-no-dangling'] },
  'iso-ieee': {
    enforce: true,
    rules: ['ac-testable', 'ac-has-test', 'tc-has-result', 'rtm-no-dangling', 'mandatory-sections'],
  },
};

// Vague phrases that make an acceptance criterion untestable (ac-testable).
const VAGUE = [/should work well/i, /good ux/i, /feels fast/i, /as expected/i, /etc\.?$/im];

// Mandatory sections checked under `mandatory-sections`, keyed by artifact file.
const MANDATORY_SECTIONS = {
  'PRD.md': ['Problem & Goal', 'User Flow', 'Acceptance Criteria', 'Non-Functional Requirements', 'Dependencies'],
  'TECH-DESIGN.md': ['Architecture', 'API', 'Data Model'],
  'TEST-CASES.md': ['Test Cases'],
};

// ── helpers ────────────────────────────────────────────────────────

function readIfExists(p) {
  try {
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  } catch {
    return null;
  }
}

function firstExisting(dir, names) {
  for (const n of names) {
    const p = path.join(dir, n);
    if (fs.existsSync(p)) { return { path: p, text: fs.readFileSync(p, 'utf8') }; }
  }
  return null;
}

/** Resolve the active standard id: epic override (state.json) beats workspace.yaml; default `none`. */
function resolveStandardId(workspaceRoot, state) {
  // Epic tier: a `standard` in the run context or the epic's state.json.
  const ctxStd = state && state.context && typeof state.context.standard === 'string' ? state.context.standard : null;
  if (ctxStd) { return ctxStd; }

  // Workspace tier: parse `standard:` off workspace.yaml (regex — avoids a YAML dep).
  const wsText = readIfExists(path.join(workspaceRoot, '.aidlc', 'workspace.yaml'));
  if (wsText) {
    const m = wsText.match(/^standard:\s*["']?([A-Za-z0-9_-]+)["']?\s*(?:#.*)?$/m);
    if (m) { return m[1]; }
  }
  return 'none';
}

/** Traceability config for an id — built-in embedded, custom via optional js-yaml read. */
async function traceConfigFor(id, workspaceRoot, notes) {
  if (Object.prototype.hasOwnProperty.call(BUILTIN_TRACE, id)) { return BUILTIN_TRACE[id]; }
  const manifest = path.join(workspaceRoot, '.aidlc', 'profiles', `${id}.yaml`);
  const text = readIfExists(manifest);
  if (!text) {
    notes.push(`custom profile "${id}" has no manifest at ${manifest} — enforcing nothing`);
    return { enforce: false, rules: [] };
  }
  try {
    const yaml = await import('js-yaml');
    const doc = yaml.load(text) || {};
    const t = doc.traceability || {};
    return { enforce: t.enforce === true, rules: Array.isArray(t.rules) ? t.rules : [] };
  } catch {
    notes.push(`custom profile "${id}" present but js-yaml unavailable — enforcing nothing`);
    return { enforce: false, rules: [] };
  }
}

// ── artifact parsers (convention-based, tolerant) ──────────────────

// Optional multi-segment epic prefix, e.g. `GH-69-` or `GH-1-` (or none).
const PREFIX = '(?:[A-Za-z0-9]+-)*';

/** AC ids like `GH-69-AC01` or `AC-12`. Returns unique ids in document order. */
function parseAcIds(text) {
  const ids = [];
  const re = new RegExp(`\\b${PREFIX}AC[-]?\\d{1,3}\\b`, 'g');
  let m;
  while ((m = re.exec(text)) !== null) { ids.push(m[0]); }
  return [...new Set(ids)];
}

/** TC ids like `GH-69-TC01` or `TC-3`. */
function parseTcIds(text) {
  const ids = [];
  const re = new RegExp(`\\b${PREFIX}TC[-]?\\d{1,3}\\b`, 'g');
  let m;
  while ((m = re.exec(text)) !== null) { ids.push(m[0]); }
  return [...new Set(ids)];
}

/** All ids of any known kind referenced in the RTM (for dangling detection). */
function parseAllIds(text) {
  const ids = [];
  const re = new RegExp(`\\b${PREFIX}(?:REQ|AC|DES|TC|RESULT)[-]?\\d{1,3}\\b`, 'g');
  let m;
  while ((m = re.exec(text)) !== null) { ids.push(m[0]); }
  return [...new Set(ids)];
}

/** A TC is "resulted" when its id sits on/near a pass|fail|blocked|skipped marker. */
function resultedTcIds(text) {
  const resulted = new Set();
  for (const line of text.split('\n')) {
    if (/\b(pass|passed|fail|failed|blocked|skipped|not\s*run|pending)\b/i.test(line)) {
      for (const id of parseTcIds(line)) { resulted.add(id); }
    }
  }
  return resulted;
}

// ── the runner ─────────────────────────────────────────────────────

export default async function traceability(ctx) {
  const { workspaceRoot, state, paths } = ctx;
  const notes = [];

  const standardId = resolveStandardId(workspaceRoot, state);
  const trace = await traceConfigFor(standardId, workspaceRoot, notes);

  if (!trace.enforce || trace.rules.length === 0) {
    return { decision: 'pass', reason: `Profile "${standardId}" enforces no traceability rules.` };
  }

  // Locate the epic's artifacts dir — from a produced path, else derive from context.
  let artifactsDir = null;
  const firstProduced = (paths && paths.produces && paths.produces[0]) || null;
  if (firstProduced) { artifactsDir = path.dirname(firstProduced); }
  if (!artifactsDir) {
    const epic = state && state.context ? state.context.epic : undefined;
    if (epic) { artifactsDir = path.join(workspaceRoot, 'docs', 'epics', epic, 'artifacts'); }
  }
  if (!artifactsDir || !fs.existsSync(artifactsDir)) {
    return { decision: 'pass', reason: `No artifacts directory to validate (profile "${standardId}").` };
  }

  const prd = firstExisting(artifactsDir, ['PRD.md']);
  const testCases = firstExisting(artifactsDir, ['TEST-CASES.md']);
  const testReport = firstExisting(artifactsDir, ['TEST-REPORT.md', 'TEST-SCRIPT.md', 'test-report.md']);
  const rtm = firstExisting(artifactsDir, ['traceability.md', 'RTM.md', 'TRACEABILITY.md']);

  const violations = [];

  // ac-testable — ACs must not be vague prose (only once a PRD exists).
  if (trace.rules.includes('ac-testable') && prd) {
    for (const line of prd.text.split('\n')) {
      if (/\bAC[-]?\d/.test(line) && VAGUE.some((re) => re.test(line))) {
        violations.push(`untestable/vague acceptance criterion: "${line.trim().slice(0, 100)}"`);
      }
    }
  }

  // ac-has-test — every AC covered by ≥1 test case (only once test cases exist).
  if (trace.rules.includes('ac-has-test') && prd && testCases) {
    const acIds = parseAcIds(prd.text);
    const covered = testCases.text;
    const uncovered = acIds.filter((id) => !covered.includes(id));
    for (const id of uncovered) { violations.push(`acceptance criterion ${id} has no covering test case`); }
  }

  // tc-has-result — every test case has a recorded result (only once a report exists).
  if (trace.rules.includes('tc-has-result') && testCases && testReport) {
    const tcIds = parseTcIds(testCases.text);
    const resulted = resultedTcIds(testReport.text);
    for (const id of tcIds) {
      if (!resulted.has(id)) { violations.push(`test case ${id} has no recorded result`); }
    }
  }

  // rtm-no-dangling — every id the RTM references exists in a source artifact.
  if (trace.rules.includes('rtm-no-dangling') && rtm) {
    const universe = [prd, testCases, testReport]
      .filter(Boolean)
      .map((a) => a.text)
      .join('\n');
    for (const id of parseAllIds(rtm.text)) {
      // The RTM lists the id AND its source artifact must also contain it.
      if (!universe.includes(id)) { violations.push(`RTM references ${id} which exists in no artifact (dangling)`); }
    }
  }

  // mandatory-sections — each present artifact carries the profile's required headings.
  if (trace.rules.includes('mandatory-sections')) {
    for (const [file, sections] of Object.entries(MANDATORY_SECTIONS)) {
      const found = firstExisting(artifactsDir, [file]);
      if (!found) { continue; }
      for (const s of sections) {
        if (!found.text.includes(s)) { violations.push(`${file} is missing mandatory section "${s}"`); }
      }
    }
  }

  const noteSuffix = notes.length ? ` (notes: ${notes.join('; ')})` : '';
  if (violations.length) {
    return {
      decision: 'reject',
      reason:
        `Profile "${standardId}" traceability check failed with ${violations.length} issue(s):\n` +
        violations.map((v) => `  - ${v}`).join('\n') +
        noteSuffix,
    };
  }
  return {
    decision: 'pass',
    reason: `Profile "${standardId}" traceability check passed (rules: ${trace.rules.join(', ')}).${noteSuffix}`,
  };
}
