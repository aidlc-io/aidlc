import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Import through the extension's own re-export module (builtinPresets.ts) —
// this is the exact surface presetWizards.writeBuiltinClaudeCommands wires the
// GH-71 two-layer command generation in through. Importing it here proves the
// re-export resolves and the extension-side wiring is sound.
import {
  writeTwoLayerCommands,
  unprovisionedPhases,
  provisionShortcutDocs,
  CANONICAL_PHASE_IDS,
} from '../src/v2/builtinPresets';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-2layer-'));
}

describe('GH-71: two-layer command model (extension surface)', () => {
  let root: string;

  beforeEach(() => {
    root = tmpRoot();
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  // GH-71-UT01: the fixed shortcut set + backbone are written, no pipeline prefix.
  it('writes /aidlc backbone + one file per canonical phase, unprefixed', () => {
    const res = writeTwoLayerCommands(root, { epicRoot: 'docs/epics' });
    const dir = path.join(root, '.claude', 'commands');

    expect(fs.existsSync(path.join(dir, 'aidlc.md'))).toBe(true);
    for (const id of CANONICAL_PHASE_IDS) {
      expect(fs.existsSync(path.join(dir, `${id}.md`))).toBe(true);
    }
    // The old N·M namespaced files are NOT what this writer emits.
    expect(fs.existsSync(path.join(dir, 'sdlc-parallel-full-plan.md'))).toBe(false);
    expect(res.written.length).toBe(CANONICAL_PHASE_IDS.length + 1);
  });

  // GH-71-UT02: shortcut count is fixed — includes the new unit-test + benchmark.
  it('the shortcut set is fixed regardless of pipelines and includes unit-test + benchmark', () => {
    expect(CANONICAL_PHASE_IDS).toContain('unit-test');
    expect(CANONICAL_PHASE_IDS).toContain('benchmark');
  });

  // GH-71-UT03: backbone command carries the runtime-resolution instructions.
  it('the backbone command file documents epic→pipeline→phase resolution', () => {
    writeTwoLayerCommands(root, { epicRoot: 'docs/epics' });
    const body = fs.readFileSync(path.join(root, '.claude', 'commands', 'aidlc.md'), 'utf8');
    expect(body).toContain('pipelineId');
    expect(body).toContain('next eligible phase');
    expect(body).toContain('Mark step done');
  });

  // GH-71-UT04: re-provision is idempotent (never clobbers a user's edits).
  it('does not overwrite existing command files unless asked', () => {
    writeTwoLayerCommands(root, { epicRoot: 'docs/epics' });
    const planPath = path.join(root, '.claude', 'commands', 'plan.md');
    fs.writeFileSync(planPath, 'USER EDITED', 'utf8');

    writeTwoLayerCommands(root, { epicRoot: 'docs/epics' }); // default: no overwrite
    expect(fs.readFileSync(planPath, 'utf8')).toBe('USER EDITED');

    writeTwoLayerCommands(root, { epicRoot: 'docs/epics', overwrite: true });
    expect(fs.readFileSync(planPath, 'utf8')).not.toBe('USER EDITED');
  });

  // GH-71-UT05: auto-provision detection for custom (non-canonical) phases.
  it('detects unprovisioned custom phases + generates a runnable shortcut for them', () => {
    const config = {
      version: '1.0',
      name: 't',
      agents: [{ id: 'po', name: 'PO', skills: ['prd'] }],
      skills: [{ id: 'prd', builtin: true }],
      pipelines: [
        {
          id: 'p',
          steps: [
            { agent: 'po', name: 'plan' },
            { agent: 'po', name: 'security-review' }, // custom, not canonical
          ],
        },
      ],
      // fields the type wants but the function ignores
      environment: {},
      slash_commands: [],
      recipes: [],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const missing = unprovisionedPhases(config as any);
    expect(missing).toEqual(['security-review']);

    const docs = provisionShortcutDocs(missing, 'docs/epics');
    expect(docs['security-review']).toContain('/security-review <epic>');
  });
});
