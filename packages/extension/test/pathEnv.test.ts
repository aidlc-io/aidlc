import { describe, expect, it } from 'vitest';

import { augmentedEnv, extraBinDirs } from '../src/v2/pathEnv';

/**
 * Regression coverage for issue #81: the MCP Servers panel showed
 * "`claude` not found on PATH" even though the CLI was installed and worked in a
 * terminal. Root cause: a Dock-launched VS Code extension host inherits a
 * minimal PATH, so `execFile('claude', …)` failed with ENOENT. We now append
 * the common install dirs to the child's PATH.
 */
describe('augmentedEnv', () => {
  it('appends the common install dirs to PATH', () => {
    const env = augmentedEnv({ PATH: '/usr/bin:/bin', HOME: '/Users/x' });
    const parts = (env.PATH ?? '').split(':');
    expect(parts).toContain('/opt/homebrew/bin');
    expect(parts).toContain('/usr/local/bin');
    expect(parts).toContain('/Users/x/.local/bin');
    expect(parts).toContain('/Users/x/.claude/local');
  });

  it('keeps the existing PATH entries first so the user PATH still wins', () => {
    const env = augmentedEnv({ PATH: '/my/custom/bin:/usr/bin', HOME: '/Users/x' });
    const parts = (env.PATH ?? '').split(':');
    expect(parts[0]).toBe('/my/custom/bin');
    expect(parts[1]).toBe('/usr/bin');
  });

  it('does not duplicate a dir already on PATH', () => {
    const env = augmentedEnv({ PATH: '/opt/homebrew/bin:/usr/bin', HOME: '/Users/x' });
    const occurrences = (env.PATH ?? '').split(':').filter((p) => p === '/opt/homebrew/bin');
    expect(occurrences).toHaveLength(1);
  });

  it('handles an empty/undefined PATH', () => {
    const env = augmentedEnv({ HOME: '/Users/x' });
    expect((env.PATH ?? '').split(':')).toContain('/opt/homebrew/bin');
    expect((env.PATH ?? '').startsWith(':')).toBe(false);
  });

  it('preserves other env vars', () => {
    const env = augmentedEnv({ PATH: '/usr/bin', HOME: '/Users/x', FOO: 'bar' });
    expect(env.FOO).toBe('bar');
  });

  it('omits home-based dirs when HOME is empty', () => {
    const dirs = extraBinDirs('');
    expect(dirs).toContain('/opt/homebrew/bin');
    expect(dirs.every((d) => !d.startsWith('/.'))).toBe(true);
  });
});
