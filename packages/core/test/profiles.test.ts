import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  BUILTIN_PROFILE_IDS,
  DEFAULT_PROFILE_ID,
  isBuiltinProfileId,
  workspaceStandard,
  resolveStandard,
  listProfileManifests,
  loadProfile,
  loadActiveProfile,
  builtinProfiles,
  UnknownStandardError,
  ProfileLoadError,
} from '../src/profiles/StandardProfile';

describe('StandardProfile — resolution (GH-69 P1)', () => {
  it('defaults to `none` when `standard:` is unset (AC02)', () => {
    expect(workspaceStandard({})).toBe(DEFAULT_PROFILE_ID);
    expect(DEFAULT_PROFILE_ID).toBe('none');
    expect(resolveStandard({})).toBe('none');
  });

  it('resolves each built-in id without touching disk (AC01)', () => {
    for (const id of BUILTIN_PROFILE_IDS) {
      expect(resolveStandard({ standard: id })).toBe(id);
      expect(isBuiltinProfileId(id)).toBe(true);
    }
  });

  it('throws UnknownStandardError on an unknown id, listing valid values (AC03)', () => {
    expect(() => resolveStandard({ standard: 'iso-9001-typo' })).toThrow(UnknownStandardError);
    try {
      resolveStandard({ standard: 'nope' });
    } catch (e) {
      const err = e as UnknownStandardError;
      expect(err.known).toEqual(expect.arrayContaining(['none', 'hybrid', 'iso-ieee', 'agile-lite']));
      expect(err.message).toContain('nope');
    }
  });

  it('applies precedence epic > workspace > default (AC04)', () => {
    // epic override wins over workspace value
    expect(resolveStandard({ standard: 'agile-lite' }, { epicOverride: 'iso-ieee' })).toBe('iso-ieee');
    // no override → workspace value
    expect(resolveStandard({ standard: 'hybrid' })).toBe('hybrid');
    // empty override string is ignored
    expect(resolveStandard({ standard: 'hybrid' }, { epicOverride: '' })).toBe('hybrid');
  });
});

describe('StandardProfile — manifests (GH-69 P1)', () => {
  it('every built-in manifest loads and passes schema (AC05)', () => {
    const profiles = builtinProfiles();
    expect(profiles.map((p) => p.id).sort()).toEqual([...BUILTIN_PROFILE_IDS].sort());
    for (const p of profiles) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(typeof p.traceability.enforce).toBe('boolean');
    }
  });

  it('`none` enforces nothing; `iso-ieee` enforces the full rule set', () => {
    expect(loadProfile('none').traceability.enforce).toBe(false);
    const iso = loadProfile('iso-ieee');
    expect(iso.traceability.enforce).toBe(true);
    expect(iso.traceability.rules).toContain('rtm-no-dangling');
    expect(iso.traceability.rules).toContain('mandatory-sections');
  });

  it('opinion layer: `none` composes no persona; others prescribe personas per phase', () => {
    expect(Object.keys(loadProfile('none').phases)).toHaveLength(0);
    expect(loadProfile('hybrid').phases.plan?.persona).toBe('po');
    expect(loadProfile('iso-ieee').phases.design?.persona).toBe('tech-lead');
  });
});

describe('StandardProfile — custom profiles on disk', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-profiles-'));
    fs.mkdirSync(path.join(root, '.aidlc', 'profiles'), { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('resolves + loads a valid custom manifest', () => {
    fs.writeFileSync(
      path.join(root, '.aidlc', 'profiles', 'my-std.yaml'),
      'id: my-std\nname: My Standard\ntraceability:\n  enforce: true\n  rules: [ac-has-test]\n',
    );
    expect(listProfileManifests(root)).toContain('my-std');
    expect(resolveStandard({ standard: 'my-std' }, { root })).toBe('my-std');
    const p = loadActiveProfile({ standard: 'my-std' }, { root });
    expect(p.name).toBe('My Standard');
    expect(p.traceability.rules).toEqual(['ac-has-test']);
  });

  it('throws UnknownStandardError when the custom id has no manifest', () => {
    expect(() => resolveStandard({ standard: 'ghost' }, { root })).toThrow(UnknownStandardError);
  });

  it('throws ProfileLoadError on invalid manifest YAML/schema', () => {
    fs.writeFileSync(path.join(root, '.aidlc', 'profiles', 'broken.yaml'), 'id: broken\n# missing required name\n');
    expect(() => loadProfile('broken', root)).toThrow(ProfileLoadError);
  });
});
