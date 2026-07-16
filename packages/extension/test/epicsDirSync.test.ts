import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  readEpicsDirFromYaml,
  writeEpicsDirToYaml,
} from '../src/v2/epicsDirSync';

const WORKSPACE_DIR = '.aidlc';
const WORKSPACE_FILENAME = 'workspace.yaml';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-epicsdir-'));
}

function writeWorkspaceYaml(root: string, content: string): void {
  const dir = path.join(root, WORKSPACE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, WORKSPACE_FILENAME), content, 'utf8');
}

function readWorkspaceYaml(root: string): string {
  return fs.readFileSync(path.join(root, WORKSPACE_DIR, WORKSPACE_FILENAME), 'utf8');
}

describe('GH-68: epics directory sync', () => {
  let root: string;

  beforeEach(() => {
    root = tmpRoot();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  // GH-68-UT01: Read state.root from workspace.yaml
  describe('readEpicsDirFromYaml', () => {
    it('GH-68-UT01a: returns state.root when set', () => {
      writeWorkspaceYaml(root, `
version: "1.0"
name: test
agents: []
skills: []
environment: {}
slash_commands: []
state:
  entity: epic
  root: ".aidlc/epics"
`);
      expect(readEpicsDirFromYaml(root)).toBe('.aidlc/epics');
    });

    it('GH-68-UT01b: returns default when state.root is absent', () => {
      writeWorkspaceYaml(root, `
version: "1.0"
name: test
agents: []
skills: []
environment: {}
slash_commands: []
`);
      expect(readEpicsDirFromYaml(root)).toBe('docs/epics');
    });

    it('GH-68-UT01c: returns default when workspace.yaml does not exist', () => {
      expect(readEpicsDirFromYaml(root)).toBe('docs/epics');
    });
  });

  // GH-68-UT02: Write state.root to workspace.yaml
  describe('writeEpicsDirToYaml', () => {
    it('GH-68-UT02a: creates state.root when state section missing', () => {
      writeWorkspaceYaml(root, `
version: "1.0"
name: test
agents: []
skills: []
environment: {}
slash_commands: []
`);
      writeEpicsDirToYaml(root, 'custom/epics');
      expect(readEpicsDirFromYaml(root)).toBe('custom/epics');
    });

    it('GH-68-UT02b: updates existing state.root', () => {
      writeWorkspaceYaml(root, `
version: "1.0"
name: test
agents: []
skills: []
environment: {}
slash_commands: []
state:
  entity: epic
  root: "docs/epics"
`);
      writeEpicsDirToYaml(root, '.aidlc/epics');
      expect(readEpicsDirFromYaml(root)).toBe('.aidlc/epics');
    });

    it('GH-68-UT02c: preserves other state fields', () => {
      writeWorkspaceYaml(root, `
version: "1.0"
name: test
agents: []
skills: []
environment: {}
slash_commands: []
state:
  entity: epic
  root: "docs/epics"
  status_file: ".state.json"
`);
      writeEpicsDirToYaml(root, 'new/dir');
      const content = readWorkspaceYaml(root);
      expect(content).toContain('entity');
      expect(content).toContain('status_file');
      expect(readEpicsDirFromYaml(root)).toBe('new/dir');
    });

    it('GH-68-UT02d: no-op when workspace.yaml does not exist', () => {
      // Should not throw or create files
      writeEpicsDirToYaml(root, 'custom/epics');
      expect(fs.existsSync(path.join(root, WORKSPACE_DIR, WORKSPACE_FILENAME))).toBe(false);
    });

    it('GH-68-UT02e: setting to default value still writes explicitly', () => {
      writeWorkspaceYaml(root, `
version: "1.0"
name: test
agents: []
skills: []
environment: {}
slash_commands: []
state:
  entity: epic
  root: "custom/epics"
`);
      writeEpicsDirToYaml(root, 'docs/epics');
      expect(readEpicsDirFromYaml(root)).toBe('docs/epics');
    });
  });
});