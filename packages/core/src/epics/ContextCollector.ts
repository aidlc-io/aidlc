/**
 * aidlc-autopilot: Smart context collection for epics.
 *
 * Auto-detects spec_url, codebase_paths, design_url, its_location from the epic
 * and workspace. Falls back gracefully if detection fails (leaves field empty/null
 * rather than failing the epic start).
 */

import * as fs from 'fs';
import * as path from 'path';

export interface EpicContext {
  epic: string;
  scope: string;  // user-provided summary of what's being built
  spec_url?: string;  // PRD/spec file or external link
  codebase_paths?: string[];  // detected src/, packages/, lib/, etc.
  design_url?: string;  // Figma or design tool link
  its_location?: string[];  // detected tests/, its/, spec/ locations
  createdAt: string;  // ISO timestamp
}

/**
 * Auto-detect spec URL from epic artifacts.
 * Looks for artifacts/PRD.md, artifacts/SPEC.md in the epic dir.
 */
function detectSpecUrl(epicDir: string, epicId: string): string | undefined {
  const candidates = ['PRD.md', 'SPEC.md', 'SPECIFICATION.md'];
  const artifactsDir = path.join(epicDir, 'artifacts');

  if (!fs.existsSync(artifactsDir)) {
    return undefined;
  }

  for (const fileName of candidates) {
    const filePath = path.join(artifactsDir, fileName);
    if (fs.existsSync(filePath)) {
      return `artifacts/${fileName}`;
    }
  }

  return undefined;
}

/**
 * Auto-detect codebase structure by scanning workspace root.
 * Looks for common source dirs: src/, packages/, lib/, app/, etc.
 */
function detectCodebasePaths(workspaceRoot: string): string[] | undefined {
  const candidates = ['src', 'packages', 'lib', 'app', 'apps', 'modules', 'services'];
  const found: string[] = [];

  for (const dir of candidates) {
    const fullPath = path.join(workspaceRoot, dir);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      found.push(dir);
    }
  }

  return found.length > 0 ? found : undefined;
}

/**
 * Auto-detect test/its locations in workspace.
 * Looks for: tests/, its/, __tests__/, spec/, test/, e2e/
 */
function detectItsLocation(workspaceRoot: string): string[] | undefined {
  const candidates = ['tests', 'its', '__tests__', 'spec', 'test', 'e2e', 'integration'];
  const found: string[] = [];

  for (const dir of candidates) {
    const fullPath = path.join(workspaceRoot, dir);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      found.push(dir);
    }
  }

  return found.length > 0 ? found : undefined;
}

/**
 * Auto-detect design URL from epic artifacts.
 * Looks for artifact files that might contain Figma links in metadata/frontmatter.
 * For now, simple: if PROTOTYPE.md exists, return "artifacts/PROTOTYPE.md"
 */
function detectDesignUrl(epicDir: string): string | undefined {
  const candidates = ['PROTOTYPE.md', 'DESIGN.md', 'FIGMA.md'];
  const artifactsDir = path.join(epicDir, 'artifacts');

  if (!fs.existsSync(artifactsDir)) {
    return undefined;
  }

  for (const fileName of candidates) {
    const filePath = path.join(artifactsDir, fileName);
    if (fs.existsSync(filePath)) {
      return `artifacts/${fileName}`;
    }
  }

  return undefined;
}

/**
 * Collect context for an epic.
 *
 * @param workspaceRoot absolute path to workspace root
 * @param epicDir absolute path to epic directory
 * @param epicId epic identifier
 * @param scope user-provided scope/description (required)
 * @returns EpicContext with auto-detected fields
 */
export function collectContext(
  workspaceRoot: string,
  epicDir: string,
  epicId: string,
  scope: string,
): EpicContext {
  return {
    epic: epicId,
    scope: scope.trim(),
    spec_url: detectSpecUrl(epicDir, epicId),
    codebase_paths: detectCodebasePaths(workspaceRoot),
    design_url: detectDesignUrl(epicDir),
    its_location: detectItsLocation(workspaceRoot),
    createdAt: new Date().toISOString(),
  };
}
