import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';

/**
 * Drives the self-contained traceability validator
 * (templates/sdlc/validators/traceability.mjs) exactly as the core
 * AutoReviewer would — dynamic import + call default export with a ctx.
 */

const VALIDATOR = path.join(__dirname, '..', 'templates', 'sdlc', 'validators', 'traceability.mjs');

type Verdict = { decision: 'pass' | 'reject'; reason: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let runner: (ctx: any) => Promise<Verdict>;

beforeEach(async () => {
  const mod = await import(pathToFileURL(VALIDATOR).href);
  runner = mod.default;
});

describe('traceability validator (GH-69 P1)', () => {
  let root: string;
  let artifactsDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-trace-'));
    fs.mkdirSync(path.join(root, '.aidlc'), { recursive: true });
    artifactsDir = path.join(root, 'docs', 'epics', 'GH-1', 'artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const setStandard = (v: string) =>
    fs.writeFileSync(path.join(root, '.aidlc', 'workspace.yaml'), `version: "1.0"\nname: t\nstandard: ${v}\n`);
  const write = (file: string, text: string) => fs.writeFileSync(path.join(artifactsDir, file), text);
  const ctx = () => ({
    workspaceRoot: root,
    state: { context: { epic: 'GH-1' } },
    paths: { produces: [path.join(artifactsDir, 'PRD.md')], requires: [] },
  });

  it('passes under `none` even with a broken chain (AC10)', async () => {
    setStandard('none');
    write('PRD.md', 'GH-1-AC01 something');
    write('TEST-CASES.md', 'no coverage here');
    const v = await runner(ctx());
    expect(v.decision).toBe('pass');
  });

  it('passes a fully consistent chain (AC09)', async () => {
    setStandard('hybrid');
    write('PRD.md', '## Acceptance Criteria\n- GH-1-AC01 Given/When/Then\n- GH-1-AC02 Given/When/Then');
    write('TEST-CASES.md', '## Test Cases\n- GH-1-TC01 covers GH-1-AC01\n- GH-1-TC02 covers GH-1-AC02');
    write('TEST-REPORT.md', 'GH-1-TC01 passed\nGH-1-TC02 failed');
    const v = await runner(ctx());
    expect(v.decision).toBe('pass');
  });

  it('rejects an AC with no covering test case (AC06)', async () => {
    setStandard('hybrid');
    write('PRD.md', '- GH-1-AC01 x\n- GH-1-AC02 y');
    write('TEST-CASES.md', '- GH-1-TC01 covers GH-1-AC01'); // AC02 uncovered
    const v = await runner(ctx());
    expect(v.decision).toBe('reject');
    expect(v.reason).toContain('GH-1-AC02');
  });

  it('rejects a test case with no recorded result (AC07)', async () => {
    setStandard('hybrid');
    write('PRD.md', '- GH-1-AC01 x');
    write('TEST-CASES.md', '- GH-1-TC01 covers GH-1-AC01\n- GH-1-TC02 covers GH-1-AC01');
    write('TEST-REPORT.md', 'GH-1-TC01 passed'); // TC02 has no result
    const v = await runner(ctx());
    expect(v.decision).toBe('reject');
    expect(v.reason).toContain('GH-1-TC02');
  });

  it('rejects a dangling RTM reference (AC08)', async () => {
    setStandard('hybrid');
    write('PRD.md', '- GH-1-AC01 x');
    write('TEST-CASES.md', '- GH-1-TC01 covers GH-1-AC01');
    write('TEST-REPORT.md', 'GH-1-TC01 passed');
    write('traceability.md', '| GH-1-AC01 | GH-1-TC01 | GH-1-AC99 |'); // AC99 exists nowhere
    const v = await runner(ctx());
    expect(v.decision).toBe('reject');
    expect(v.reason).toContain('GH-1-AC99');
  });

  it('does not enforce ac-has-test before test cases exist — phase-progressive (AC11 spirit)', async () => {
    setStandard('hybrid');
    write('PRD.md', '- GH-1-AC01 x\n- GH-1-AC02 y'); // only PRD, no TEST-CASES yet
    const v = await runner(ctx());
    expect(v.decision).toBe('pass');
  });

  it('agile-lite does NOT enforce mandatory-sections or RTM (AC11)', async () => {
    setStandard('agile-lite');
    // Missing PRD sections + a dangling RTM would fail iso-ieee, but agile-lite ignores both.
    write('PRD.md', '- GH-1-AC01 x');
    write('TEST-CASES.md', '- GH-1-TC01 covers GH-1-AC01');
    write('traceability.md', '| GH-1-AC77 |');
    const v = await runner(ctx());
    expect(v.decision).toBe('pass');
  });

  it('iso-ieee rejects a PRD missing mandatory sections (mandatory-sections rule)', async () => {
    setStandard('iso-ieee');
    write('PRD.md', '## Acceptance Criteria\n- GH-1-AC01 x'); // missing Problem & Goal, User Flow, NFR, Dependencies
    const v = await runner(ctx());
    expect(v.decision).toBe('reject');
    expect(v.reason).toContain('mandatory section');
  });

  it('per-epic override in state.context.standard beats workspace.yaml', async () => {
    setStandard('none'); // workspace says none…
    write('PRD.md', '- GH-1-AC01 x');
    write('TEST-CASES.md', '- GH-1-TC01 covers GH-1-AC02'); // AC01 uncovered
    const overridden = {
      workspaceRoot: root,
      state: { context: { epic: 'GH-1', standard: 'hybrid' } }, // …epic overrides to hybrid
      paths: { produces: [path.join(artifactsDir, 'PRD.md')], requires: [] },
    };
    const v = await runner(overridden);
    expect(v.decision).toBe('reject');
    expect(v.reason).toContain('GH-1-AC01');
  });
});
