import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import {
  WORKSPACE_DIR,
  BUILTIN_WORKFLOWS,
  loadBuiltinPreset,
  builtinTemplatesRoot,
  installWorkflowGlobalsByIds,
} from '@aidlc/core';
import { readYaml, requireYaml, writeYaml, YamlDocument } from '../yamlIO';
import { resolveWorkspaceRoot } from '../workspaceRoot';
import { SKILL_TEMPLATES } from '../skillTemplates';

// ── Built-in presets ──────────────────────────────────────────────────────────

interface BuiltinPreset {
  id: string;
  description: string;
  apply: (root: string, existing: YamlDocument) => YamlDocument;
}

const BUILTIN_PRESETS: BuiltinPreset[] = [
  {
    id: 'code-review',
    description: 'Single-agent code review pipeline: runs the code-reviewer skill on a diff',
    apply(root, doc) {
      ensureSkillFile(root, 'code-reviewer');
      addIfMissing(doc.skills, { id: 'code-reviewer', path: `./${WORKSPACE_DIR}/skills/code-reviewer.md` });
      addIfMissing(doc.agents, {
        id: 'reviewer',
        name: 'Code Reviewer',
        skills: ['code-reviewer'],
        model: 'claude-sonnet-4-5',
        capabilities: ['files', 'github'],
        description: 'Reviews diffs for bugs, security issues, and perf regressions.',
        outputs: 'Structured table with severity / category / verdict, plus PASS or FAIL verdict.',
      });
      addIfMissing(doc.pipelines, {
        id: 'review-pipeline',
        steps: [{ agent: 'reviewer', human_review: true }],
        on_failure: 'stop',
      });
      return doc;
    },
  },
  {
    id: 'release-notes',
    description: 'Single-agent pipeline that turns git commits into user-facing release notes',
    apply(root, doc) {
      ensureSkillFile(root, 'release-notes');
      addIfMissing(doc.skills, { id: 'release-notes', path: `./${WORKSPACE_DIR}/skills/release-notes.md` });
      addIfMissing(doc.agents, {
        id: 'release-writer',
        name: 'Release Notes Writer',
        skills: ['release-notes'],
        model: 'claude-sonnet-4-5',
        description: 'Summarises git commits into user-facing release notes.',
        outputs: 'Markdown release notes grouped by ✨ New / 🛠 Improved / 🐛 Fixed.',
      });
      addIfMissing(doc.pipelines, {
        id: 'release-pipeline',
        steps: [{ agent: 'release-writer', produces: ['RELEASE-NOTES.md'], human_review: true }],
        on_failure: 'stop',
      });
      return doc;
    },
  },
  {
    id: 'sdlc',
    description: 'AIDLC SDLC pipeline (parallel): Plan → (Design ∥ Test Plan) → Implement (+unit-test) ∥ Generate Test Cases → Execute Test (+report)',
    apply(_root, doc) {
      // Shared with the extension: build the workspace shape (agents, skills,
      // slash commands, pipeline) from the canonical built-in workflow in
      // @aidlc/core. The shape is template-independent — only the composed
      // skill *bodies* read template files, which the CLI doesn't write here
      // (skills resolve to ~/.claude/skills/aidlc-*.md, installed by the
      // extension or `aidlc` global install).
      const workflow = BUILTIN_WORKFLOWS[0];
      const templatesRoot = builtinTemplatesRoot();
      // Install the composed agent/skill markdown into ~/.claude so the
      // workspace.yaml skill paths (~/.claude/skills/aidlc-*.md) resolve —
      // same files the extension installs. Idempotent + marker-guarded.
      installWorkflowGlobalsByIds(templatesRoot, [workflow.id]);
      const preset = loadBuiltinPreset(templatesRoot, workflow);
      const ws = preset.workspace as {
        agents?: Array<Record<string, unknown>>;
        skills?: Array<Record<string, unknown>>;
        slash_commands?: Array<Record<string, unknown>>;
        pipelines?: Array<Record<string, unknown>>;
      };
      for (const a of ws.agents ?? []) { addIfMissing(doc.agents, a); }
      for (const s of ws.skills ?? []) { addIfMissing(doc.skills, s); }
      for (const p of ws.pipelines ?? []) { addIfMissing(doc.pipelines, p); }
      const cmds = doc.slash_commands;
      for (const c of ws.slash_commands ?? []) {
        if (!cmds.some((x) => x.name === c.name)) { cmds.push(c); }
      }
      return doc;
    },
  },
];

// ── User presets (stored in .aidlc/presets/*.json) ────────────────────────────

const PRESETS_DIR = path.join(WORKSPACE_DIR, 'presets');

function presetsDir(root: string): string {
  return path.join(root, PRESETS_DIR);
}

interface UserPreset {
  id: string;
  savedAt: string;
  workspace: YamlDocument;
}

function listUserPresets(root: string): UserPreset[] {
  const dir = presetsDir(root);
  if (!fs.existsSync(dir)) { return []; }
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as UserPreset; }
      catch (err) {
        console.warn(chalk.yellow(`⚠ Skipping corrupt preset file ${f}: ${err instanceof Error ? err.message : String(err)}`));
        return null;
      }
    })
    .filter((p): p is UserPreset => p !== null);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureSkillFile(root: string, templateId: string): void {
  const tpl = SKILL_TEMPLATES.find(t => t.id === templateId);
  if (!tpl) { return; }
  const dir  = path.join(root, WORKSPACE_DIR, 'skills');
  // Use <templateId>.md as filename — consistent with what skill add produces.
  const file = path.join(dir, `${templateId}.md`);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, tpl.content, 'utf8');
  }
}

function addIfMissing(arr: Array<Record<string, unknown>>, item: Record<string, unknown>): void {
  if (!arr.some(x => x.id === item.id)) { arr.push(item); }
}

// ── Command registration ──────────────────────────────────────────────────────

export function registerPreset(program: Command): void {
  const cmd = program.command('preset').description('Apply or save workspace presets');

  // ── list ────────────────────────────────────────────────────────────────────
  cmd
    .command('list')
    .description('List available presets (built-in + saved)')
    .option('--json', 'Output raw JSON')
    .action((opts: { json?: boolean }, actionCmd: Command) => {
      const root  = resolveWorkspaceRoot(actionCmd);
      const users = listUserPresets(root);

      if (opts.json) {
        console.log(JSON.stringify({
          builtin: BUILTIN_PRESETS.map(p => ({ id: p.id, description: p.description })),
          saved:   users.map(p => ({ id: p.id, savedAt: p.savedAt })),
        }, null, 2));
        return;
      }

      console.log(chalk.bold('\nBuilt-in presets'));
      for (const p of BUILTIN_PRESETS) {
        console.log(`  ${chalk.cyan(p.id.padEnd(20))} ${chalk.dim(p.description)}`);
      }

      if (users.length > 0) {
        console.log(chalk.bold('\nSaved presets'));
        for (const p of users) {
          const date = new Date(p.savedAt).toLocaleDateString();
          console.log(`  ${chalk.green(p.id.padEnd(20))} ${chalk.dim(`saved ${date}`)}`);
        }
      }
      console.log();
    });

  // ── apply ───────────────────────────────────────────────────────────────────
  cmd
    .command('apply <name>')
    .description('Apply a preset to the current workspace (merges into existing config)')
    .action((name: string, _opts: unknown, actionCmd: Command) => {
      const root = resolveWorkspaceRoot(actionCmd);
      let doc = readYaml(root);

      // Start from a blank doc if workspace doesn't exist yet
      if (!doc) {
        doc = {
          version: '1.0',
          name: 'AIDLC Workspace',
          agents: [], skills: [], environment: {},
          slash_commands: [], pipelines: [],
        };
      }

      // Check built-in presets first
      const builtin = BUILTIN_PRESETS.find(p => p.id === name);
      if (builtin) {
        const updated = builtin.apply(root, doc);
        writeYaml(root, updated);
        const a = updated.agents.length;
        const s = updated.skills.length;
        const p = updated.pipelines.length;
        console.log(chalk.green('✔') + ` Applied preset ${chalk.bold(name)}`);
        console.log(chalk.dim(`  ${a} agent${a !== 1 ? 's' : ''}, ${s} skill${s !== 1 ? 's' : ''}, ${p} pipeline${p !== 1 ? 's' : ''}`));
        console.log(chalk.dim('  Run: aidlc validate && aidlc list'));
        return;
      }

      // Check user presets
      const userPresets = listUserPresets(root);
      const user = userPresets.find(p => p.id === name);
      if (user) {
        const updated: YamlDocument = {
          ...doc,
          agents:    [...doc.agents,    ...user.workspace.agents.filter(a => !doc!.agents.some(x => x.id === a.id))],
          skills:    [...doc.skills,    ...user.workspace.skills.filter(s => !doc!.skills.some(x => x.id === s.id))],
          pipelines: [...doc.pipelines, ...user.workspace.pipelines.filter(p => !doc!.pipelines.some(x => x.id === p.id))],
        };
        writeYaml(root, updated);
        console.log(chalk.green('✔') + ` Applied saved preset ${chalk.bold(name)}`);
        return;
      }

      console.error(chalk.red(`Preset "${name}" not found.`));
      console.error(chalk.dim('Run: aidlc preset list'));
      process.exit(1);
    });

  // ── save ────────────────────────────────────────────────────────────────────
  cmd
    .command('save <name>')
    .description('Save the current workspace as a reusable preset')
    .action((name: string, _opts: unknown, actionCmd: Command) => {
      const root = resolveWorkspaceRoot(actionCmd);
      const doc  = requireYaml(root);

      const dir = presetsDir(root);
      fs.mkdirSync(dir, { recursive: true });

      const preset: UserPreset = {
        id: name,
        savedAt: new Date().toISOString(),
        workspace: doc,
      };
      const file = path.join(dir, `${name}.json`);
      const alreadyExists = fs.existsSync(file);

      fs.writeFileSync(file, JSON.stringify(preset, null, 2) + '\n', 'utf8');
      const action = alreadyExists ? 'Updated' : 'Saved';
      console.log(chalk.green('✔') + ` ${action} preset ${chalk.bold(name)}`);
      console.log(chalk.dim(`  ${doc.agents.length} agents, ${doc.skills.length} skills, ${doc.pipelines.length} pipelines`));
    });
}
