import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { collectContext } from '../src';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-collector-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('collectContext', () => {
  it('captures the user-provided scope (trimmed)', () => {
    const epicDir = path.join(tmpRoot, 'docs/epics/E1');
    fs.mkdirSync(epicDir, { recursive: true });
    const ctx = collectContext(tmpRoot, epicDir, 'E1', '  build a thing  ');
    expect(ctx.epic).toBe('E1');
    expect(ctx.scope).toBe('build a thing');
    expect(ctx.createdAt).toBeTruthy();
  });

  it('auto-detects spec_url from artifacts/PRD.md', () => {
    const epicDir = path.join(tmpRoot, 'docs/epics/E1');
    fs.mkdirSync(path.join(epicDir, 'artifacts'), { recursive: true });
    fs.writeFileSync(path.join(epicDir, 'artifacts', 'PRD.md'), '# PRD');
    const ctx = collectContext(tmpRoot, epicDir, 'E1', 'scope');
    expect(ctx.spec_url).toBe('artifacts/PRD.md');
  });

  it('auto-detects design_url from artifacts/PROTOTYPE.md', () => {
    const epicDir = path.join(tmpRoot, 'docs/epics/E1');
    fs.mkdirSync(path.join(epicDir, 'artifacts'), { recursive: true });
    fs.writeFileSync(path.join(epicDir, 'artifacts', 'PROTOTYPE.md'), '# Proto');
    const ctx = collectContext(tmpRoot, epicDir, 'E1', 'scope');
    expect(ctx.design_url).toBe('artifacts/PROTOTYPE.md');
  });

  it('auto-detects codebase paths (src, packages)', () => {
    fs.mkdirSync(path.join(tmpRoot, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'packages'), { recursive: true });
    const epicDir = path.join(tmpRoot, 'docs/epics/E1');
    fs.mkdirSync(epicDir, { recursive: true });
    const ctx = collectContext(tmpRoot, epicDir, 'E1', 'scope');
    expect(ctx.codebase_paths).toEqual(expect.arrayContaining(['src', 'packages']));
  });

  it('auto-detects test locations (tests)', () => {
    fs.mkdirSync(path.join(tmpRoot, 'tests'), { recursive: true });
    const epicDir = path.join(tmpRoot, 'docs/epics/E1');
    fs.mkdirSync(epicDir, { recursive: true });
    const ctx = collectContext(tmpRoot, epicDir, 'E1', 'scope');
    expect(ctx.its_location).toContain('tests');
  });

  it('leaves fields undefined when nothing is detected', () => {
    const epicDir = path.join(tmpRoot, 'docs/epics/E1');
    fs.mkdirSync(epicDir, { recursive: true });
    const ctx = collectContext(tmpRoot, epicDir, 'E1', 'scope');
    expect(ctx.spec_url).toBeUndefined();
    expect(ctx.codebase_paths).toBeUndefined();
    expect(ctx.its_location).toBeUndefined();
    expect(ctx.design_url).toBeUndefined();
  });
});
