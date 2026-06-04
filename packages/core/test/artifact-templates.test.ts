import { describe, it, expect } from 'vitest';

import {
  resolvePrimaryStack,
  getSdlcArtifactTemplates,
  builtinTemplatesRoot,
} from '../src';

const ROOT = builtinTemplatesRoot();

// The implement phase's `artifact` contains `<>` so its output key is the
// synthetic IMPLEMENT-SUMMARY.md; the file on disk is implement[.stack].md.
const IMPLEMENT = 'IMPLEMENT-SUMMARY.md';
// The plan phase ships no stack variant — used to assert generic fallback.
const PRD = 'PRD.md';

describe('resolvePrimaryStack', () => {
  it('prefers the user-facing surface over backend in a fullstack project', () => {
    expect(resolvePrimaryStack(['web', 'backend'])).toBe('web');
    expect(resolvePrimaryStack(['backend', 'web'])).toBe('web'); // order-independent
    expect(resolvePrimaryStack(['mobile', 'backend'])).toBe('mobile');
    expect(resolvePrimaryStack(['desktop', 'backend'])).toBe('desktop');
  });

  it('lets backend / cli win only when they are the sole stack', () => {
    expect(resolvePrimaryStack(['backend'])).toBe('backend');
    expect(resolvePrimaryStack(['cli'])).toBe('cli');
    expect(resolvePrimaryStack(['backend', 'cli'])).toBe('backend');
  });

  it('honors the full priority order mobile > desktop > web > backend > cli', () => {
    expect(resolvePrimaryStack(['cli', 'backend', 'web', 'desktop', 'mobile'])).toBe('mobile');
  });

  it('returns null for an empty / null set', () => {
    expect(resolvePrimaryStack([])).toBeNull();
    expect(resolvePrimaryStack(null)).toBeNull();
    expect(resolvePrimaryStack(undefined)).toBeNull();
  });

  it('returns an unranked-but-present stack as-is', () => {
    expect(resolvePrimaryStack(['embedded'])).toBe('embedded');
  });
});

describe('getBuiltinArtifactTemplates — stack-aware lookup + render', () => {
  it('returns the generic template unchanged when no options are passed', () => {
    const t = getSdlcArtifactTemplates(ROOT);
    // Generic implement.md has no UI-specific or backend-specific sections.
    expect(t[IMPLEMENT]).toContain('## 3. Implementation Notes');
    expect(t[IMPLEMENT]).not.toContain('UI / Component Notes');
  });

  it('picks the coarse bucket template for the primary stack', () => {
    const t = getSdlcArtifactTemplates(ROOT, { stacks: ['web'], lookupKeys: ['web'] });
    expect(t[IMPLEMENT]).toContain('## 3. UI / Component Notes');
    // Not the React-specialized variant.
    expect(t[IMPLEMENT]).not.toContain('## 3. Component & Hook Design');
  });

  it('prefers the framework variant when its lookup key matches first', () => {
    const t = getSdlcArtifactTemplates(ROOT, { stacks: ['web'], lookupKeys: ['web-react', 'web'] });
    expect(t[IMPLEMENT]).toContain('## 3. Component & Hook Design');
    expect(t[IMPLEMENT]).toContain('React Testing Library');
  });

  it('falls back to the next lookup key when the specific file is absent', () => {
    // No `implement.web-vue.md` ships — must fall back to `implement.web.md`.
    const t = getSdlcArtifactTemplates(ROOT, { stacks: ['web'], lookupKeys: ['web-vue', 'web'] });
    expect(t[IMPLEMENT]).toContain('## 3. UI / Component Notes');
  });

  it('strips a {{#if backend}} block for a web-only project', () => {
    const t = getSdlcArtifactTemplates(ROOT, { stacks: ['web'], lookupKeys: ['web'] });
    expect(t[IMPLEMENT]).not.toContain('API Integration');
  });

  it('keeps the {{#if backend}} block for a fullstack web+backend project (base still web)', () => {
    const t = getSdlcArtifactTemplates(ROOT, { stacks: ['web', 'backend'], lookupKeys: ['web'] });
    // Base file is the web one (primary stack), but the secondary backend
    // block survives because `stacks` includes backend.
    expect(t[IMPLEMENT]).toContain('## 3. UI / Component Notes');
    expect(t[IMPLEMENT]).toContain('API Integration');
  });

  it('picks the backend template when backend is the sole stack', () => {
    const t = getSdlcArtifactTemplates(ROOT, { stacks: ['backend'], lookupKeys: ['backend'] });
    expect(t[IMPLEMENT]).toContain('## 3. API Surface');
  });

  it('falls back to the generic file for a phase with no stack variant', () => {
    const t = getSdlcArtifactTemplates(ROOT, { stacks: ['web'], lookupKeys: ['web-react', 'web'] });
    // plan.web*.md does not exist → generic plan.md (PRD output).
    expect(t[PRD].length).toBeGreaterThan(0);
    const generic = getSdlcArtifactTemplates(ROOT)[PRD];
    expect(t[PRD]).toBe(generic);
  });
});
