/**
 * Resolve the tech-stack profile for the active workspace.
 *
 * Resolution order:
 *  1. `tech_stack:` in `workspace.yaml` (explicit user override — wins)
 *  2. Heuristic detection from manifest files at the workspace root
 *  3. `null` when neither produces a list — caller renders the full
 *     generic template (no `{{#if}}` stripping)
 *
 * Centralizing this keeps the install command, the preset-apply flow, and
 * the InitWorkflow path consistent. Anyone needing the stack list calls
 * `resolveTechStackForRoot()` instead of re-implementing the lookup.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { detectTechStack, type TechStack } from './techStackDetector';

const WORKSPACE_YAML = 'workspace.yaml';

export function resolveTechStackForRoot(root?: string): TechStack[] | null {
  const target = root ?? activeWorkspaceRoot();
  if (!target) { return null; }

  const yamlOverride = readYamlOverride(target);
  if (yamlOverride !== null) { return yamlOverride; }

  const detected = detectTechStack(target);
  return detected.length > 0 ? detected : null;
}

/**
 * Return the path of the first workspace folder, or `undefined` when VS Code
 * has no folder open. We deliberately don't pick from multi-root setups —
 * the user can pass an explicit root if they need finer control.
 */
function activeWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/**
 * Read `tech_stack:` from `workspace.yaml` without pulling in the full
 * schema validator (this runs before workspace.yaml is guaranteed to exist).
 * Accepts:
 *   tech_stack: [web, backend]
 *   tech_stack:
 *     - web
 *     - backend
 *
 * Returns `null` when the key is absent or the file is missing/unparseable.
 * An empty `tech_stack: []` returns `[]` — that's an explicit "no stack
 * filtering" override (different from "no override at all").
 */
function readYamlOverride(root: string): TechStack[] | null {
  const yamlPath = path.join(root, WORKSPACE_YAML);
  if (!fs.existsSync(yamlPath)) { return null; }
  let body: string;
  try {
    body = fs.readFileSync(yamlPath, 'utf8');
  } catch {
    return null;
  }
  // Inline form: `tech_stack: [web, backend]`
  const inline = body.match(/^[\t ]*tech_stack:\s*\[([^\]]*)\]\s*$/m);
  if (inline) {
    return parseStackList(inline[1].split(','));
  }
  // Block form: `tech_stack:` followed by `- web` lines.
  const block = body.match(/^[\t ]*tech_stack:\s*\n((?:[\t ]+-[^\n]+\n?)*)/m);
  if (block) {
    return parseStackList(block[1].split('\n').map((l) => l.replace(/^[\t ]+-\s*/, '')));
  }
  return null;
}

const VALID_STACKS: ReadonlySet<TechStack> = new Set(['web', 'mobile', 'desktop', 'backend', 'cli']);

function parseStackList(items: string[]): TechStack[] {
  const out: TechStack[] = [];
  for (const raw of items) {
    const id = raw.trim().replace(/^['"]|['"]$/g, '');
    if (!id) { continue; }
    if (VALID_STACKS.has(id as TechStack)) { out.push(id as TechStack); }
  }
  return out;
}
