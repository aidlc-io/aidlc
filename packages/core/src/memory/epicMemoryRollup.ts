/**
 * Cross-epic memory curator.
 *
 * Each epic keeps a compact `docs/epics/<KEY>/epic-memory.json` digest
 * (decisions / constraints / context / notes + reflections), written by
 * `tools/epic-memory.mjs` and auto-injected per-epic by the epic-memory hook.
 * That optimizes working *within* one epic — but the knowledge stays siloed:
 * a constraint learned in epic A never reaches epic B.
 *
 * This module rolls the per-epic digests up into a single **project-level**
 * memory (`.aidlc/memory.json`) so a brand-new epic starts already aware of
 * the team's standing constraints and hard-won reflections — fewer tokens
 * re-deriving context, fewer repeated mistakes. It is pure + filesystem-thin
 * so it can run from the CLI today and from a shared "Hermes" bot later,
 * reacting to git commits, without changing shape.
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Shapes (mirror tools/epic-memory.mjs) ──────────────────────────

export interface EpicMemoryEntry {
  at?: string;
  author?: string;
  /** decision | constraint | context | note (free string tolerated). */
  kind?: string;
  text: string;
}

export interface EpicMemoryReflection {
  at?: string;
  author?: string;
  text: string;
}

export interface EpicMemory {
  epic: string;
  summary?: string;
  updatedAt?: string;
  entries?: EpicMemoryEntry[];
  reflections?: EpicMemoryReflection[];
}

/** One epic's digest paired with the epic id it came from. */
export interface EpicMemorySource {
  epic: string;
  memory: EpicMemory;
}

// ── Rolled-up project memory ───────────────────────────────────────

export interface RolledItem {
  text: string;
  /** Epic id this item was first distilled from. */
  epic: string;
  kind?: string;
  author?: string;
  at?: string;
}

export interface ProjectMemory {
  schemaVersion: 1;
  generatedAt: string;
  /** Epic ids that contributed to this rollup. */
  epics: string[];
  /** `kind: constraint` entries — standing rules that should apply project-wide. */
  constraints: RolledItem[];
  /** `kind: decision` entries — notable decisions worth carrying forward. */
  decisions: RolledItem[];
  /** Reflections on how to prompt / work more effectively. */
  reflections: RolledItem[];
}

export const PROJECT_MEMORY_DIR = '.aidlc';
export const PROJECT_MEMORY_FILE = 'memory.json';
export const DEFAULT_EPICS_DIR = path.join('docs', 'epics');

function normKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Read every `<epicsDir>/*\/epic-memory.json` under `workspaceRoot`.
 * Missing dir / unreadable / malformed files are skipped silently — the
 * curator is best-effort and never blocks on a bad digest.
 */
export function readEpicMemories(
  workspaceRoot: string,
  epicsDir: string = DEFAULT_EPICS_DIR,
): EpicMemorySource[] {
  const root = path.join(workspaceRoot, epicsDir);
  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: EpicMemorySource[] = [];
  for (const d of dirents) {
    if (!d.isDirectory()) { continue; }
    const file = path.join(root, d.name, 'epic-memory.json');
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        out.push({ epic: d.name, memory: { epic: d.name, ...parsed } });
      }
    } catch {
      /* no memory for this epic, or corrupt — skip */
    }
  }
  return out;
}

/**
 * Pure aggregation: fold per-epic digests into one {@link ProjectMemory}.
 * Constraints/decisions are pulled from `entries` by `kind`; reflections from
 * `reflections`. Items are de-duplicated by normalized text (first occurrence
 * wins) so the same standing rule declared in three epics appears once.
 */
export function rollupEpicMemories(
  sources: EpicMemorySource[],
  now: string = new Date().toISOString(),
): ProjectMemory {
  const constraints: RolledItem[] = [];
  const decisions: RolledItem[] = [];
  const reflections: RolledItem[] = [];
  const seen = { constraint: new Set<string>(), decision: new Set<string>(), reflection: new Set<string>() };
  const epics: string[] = [];

  for (const { epic, memory } of sources) {
    if (!epics.includes(epic)) { epics.push(epic); }
    for (const e of memory.entries ?? []) {
      if (!e || typeof e.text !== 'string' || !e.text.trim()) { continue; }
      const item: RolledItem = { text: e.text.trim(), epic, kind: e.kind, author: e.author, at: e.at };
      const key = normKey(e.text);
      if (e.kind === 'constraint' && !seen.constraint.has(key)) {
        seen.constraint.add(key);
        constraints.push(item);
      } else if (e.kind === 'decision' && !seen.decision.has(key)) {
        seen.decision.add(key);
        decisions.push(item);
      }
    }
    for (const r of memory.reflections ?? []) {
      if (!r || typeof r.text !== 'string' || !r.text.trim()) { continue; }
      const key = normKey(r.text);
      if (seen.reflection.has(key)) { continue; }
      seen.reflection.add(key);
      reflections.push({ text: r.text.trim(), epic, author: r.author, at: r.at });
    }
  }

  return { schemaVersion: 1, generatedAt: now, epics, constraints, decisions, reflections };
}

/** Absolute path to the project memory file for a workspace. */
export function projectMemoryPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, PROJECT_MEMORY_DIR, PROJECT_MEMORY_FILE);
}

/** Write the rolled-up project memory to `.aidlc/memory.json`. */
export function writeProjectMemory(workspaceRoot: string, mem: ProjectMemory): string {
  const p = projectMemoryPath(workspaceRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(mem, null, 2) + '\n', 'utf8');
  return p;
}

/** Load `.aidlc/memory.json`, or null when absent / unreadable. */
export function loadProjectMemory(workspaceRoot: string): ProjectMemory | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(projectMemoryPath(workspaceRoot), 'utf8'));
    if (parsed && parsed.schemaVersion === 1) { return parsed as ProjectMemory; }
    return null;
  } catch {
    return null;
  }
}

/** Convenience: read → rollup → write. Returns the rollup + output path. */
export function rollupProjectMemory(
  workspaceRoot: string,
  epicsDir: string = DEFAULT_EPICS_DIR,
): { memory: ProjectMemory; path: string } {
  const memory = rollupEpicMemories(readEpicMemories(workspaceRoot, epicsDir));
  const outPath = writeProjectMemory(workspaceRoot, memory);
  return { memory, path: outPath };
}

/** Render a project memory as Markdown for `aidlc memory show`. */
export function renderProjectMemory(mem: ProjectMemory): string {
  const lines = [`# Project memory  (rolled up ${mem.generatedAt})`];
  lines.push('', `Epics contributing: ${mem.epics.length ? mem.epics.join(', ') : '(none yet)'}`);
  const section = (title: string, items: RolledItem[]) => {
    if (!items.length) { return; }
    lines.push('', `## ${title}`);
    for (const it of items) {
      lines.push(`- ${it.text}  —  _${it.epic}${it.author ? `, ${it.author}` : ''}_`);
    }
  };
  section('Standing constraints', mem.constraints);
  section('Decisions carried forward', mem.decisions);
  section('Reflections (prompt/work better)', mem.reflections);
  return lines.join('\n');
}
