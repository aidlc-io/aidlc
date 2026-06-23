/**
 * `aidlc analyze` — Analyze requirements and scaffold a task breakdown.
 *
 * When all required options are provided: non-interactive, shows a confirmation
 * summary and asks "Proceed?".
 * When options are missing: prompts for each missing value interactively.
 *
 * Works without a workspace.yaml — only requires a project folder.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { Command } from 'commander';
import chalk from 'chalk';
import { resolveWorkspaceRoot } from '../workspaceRoot';

const BREAKDOWN_ROOT = 'docs/task-breakdowns';

const PLATFORMS = ['jira', 'github', 'linear', 'redmine', 'local'] as const;
type Platform = typeof PLATFORMS[number];

const PLATFORM_LABELS: Record<Platform, string> = {
  jira:    'Jira',
  github:  'GitHub Issues',
  linear:  'Linear',
  redmine: 'Redmine (CSV export)',
  local:   'Local export only',
};

const PARENT_HINTS: Record<Platform, string> = {
  jira:    'Jira epic key (e.g. PROJ-100) or leave blank to list tasks first',
  github:  'owner/repo or owner/repo#42 (milestone) or blank',
  linear:  'Project/cycle name or URL, or blank',
  redmine: 'Parent issue number or blank',
  local:   'Optional label (e.g. v2.0) or blank',
};

// ── Command registration ──────────────────────────────────────────────────────

export function registerAnalyze(program: Command): void {
  program
    .command('analyze')
    .description('Analyze requirements and scaffold a task breakdown (REQ-NNN)')
    .option('--source <path-or-url>', 'requirements file path (relative) or URL')
    .option('--text <text>', 'inline requirements text (alternative to --source)')
    .option('--platform <platform>', `task platform: ${PLATFORMS.join(' | ')}`)
    .option('--parent <ref>', 'parent epic / issue ref — leave blank to list tasks first')
    .option('--project-key <key>', 'Jira project key (derived from --parent if omitted)')
    .option('--brief', 'brief task list (titles + 1-line desc, skip ACs / points)')
    .option('--instruction <text>', 'custom guidance for task creation (sprint, naming conventions, post-creation actions)')
    .option('--id <runId>', 'use this run ID instead of auto-generated REQ-NNN')
    .option('-y, --yes', 'skip confirmation prompt')
    .action(async (opts: {
      source?: string;
      text?: string;
      platform?: string;
      parent?: string;
      projectKey?: string;
      brief?: boolean;
      instruction?: string;
      id?: string;
      yes?: boolean;
    }, cmd: Command) => {
      const root = resolveWorkspaceRoot(cmd);

      // ── Collect inputs interactively when flags are missing ────────────────

      let requirementsSource = opts.text
        ? `inline:${opts.text.trim()}`
        : opts.source?.trim() ?? '';

      if (!requirementsSource) {
        requirementsSource = await prompt(
          'Requirements source (file path, URL, or paste inline text)',
          undefined,
          (v) => {
            if (!v.trim()) { return 'Required — enter a file path, URL, or paste the text directly'; }
            return null;
          },
        );
        // If the value doesn't look like a path or URL, treat it as inline text
        if (requirementsSource && !requirementsSource.startsWith('http') && !fs.existsSync(path.resolve(root, requirementsSource))) {
          requirementsSource = `inline:${requirementsSource}`;
        }
      }

      // Platform
      let platform = opts.platform as Platform | undefined;
      if (!platform || !PLATFORMS.includes(platform as Platform)) {
        console.log(chalk.dim(`Platforms: ${PLATFORMS.map((p, i) => `${i + 1}. ${PLATFORM_LABELS[p]}`).join('  ')}`));
        const raw = await prompt('Platform [1=Jira, 2=GitHub, 3=Linear, 4=Redmine, 5=Local]', '1');
        const idx = parseInt(raw, 10) - 1;
        platform = PLATFORMS[idx] ?? 'local';
      }

      // Parent task
      let parentTask = opts.parent ?? '';
      if (parentTask === undefined) {
        parentTask = await prompt(PARENT_HINTS[platform], '');
      }

      // Jira project key
      let projectKey = opts.projectKey;
      if (platform === 'jira' && !projectKey && parentTask.trim()) {
        const m = parentTask.trim().match(/^([A-Z][A-Z0-9_]+)-\d+/);
        projectKey = m ? m[1] : undefined;
        if (!projectKey) {
          projectKey = await prompt('Jira project key (e.g. PROJ)', '');
          if (!projectKey.trim()) { projectKey = undefined; }
        }
      }

      // Detail level
      const detailLevel = opts.brief ? 'brief' : 'detailed';
      const instruction = opts.instruction?.trim() ?? '';

      // ── Confirm ────────────────────────────────────────────────────────────

      if (!opts.yes) {
        console.log();
        console.log(chalk.bold('Requirement Analysis — Review'));
        console.log(chalk.dim('─'.repeat(44)));
        const srcLabel = requirementsSource.startsWith('inline:')
          ? chalk.italic('inline text')
          : requirementsSource;
        console.log(chalk.dim('  Source:      ') + srcLabel);
        console.log(chalk.dim('  Platform:    ') + PLATFORM_LABELS[platform]);
        console.log(chalk.dim('  Parent:      ') + (parentTask.trim() || chalk.dim('(none — tasks will be listed first)')));
        console.log(chalk.dim('  Detail:      ') + detailLevel);
        if (instruction) {
          console.log(chalk.dim('  Instructions: ') + instruction.slice(0, 80) + (instruction.length > 80 ? '…' : ''));
        }
        console.log();

        const answer = await prompt('Proceed? [Y/n]', 'Y');
        if (answer.toLowerCase() === 'n') {
          console.log(chalk.dim('Cancelled.'));
          process.exit(0);
        }
      }

      // ── Validate platform ──────────────────────────────────────────────────

      if (!PLATFORMS.includes(platform)) {
        console.error(chalk.red(`Unknown platform "${platform}". Choose: ${PLATFORMS.join(', ')}`));
        process.exit(1);
      }

      // ── Scaffold ───────────────────────────────────────────────────────────

      const runId = opts.id?.trim() || nextRunId(root);
      const breakdownDir = path.resolve(root, BREAKDOWN_ROOT, runId);
      fs.mkdirSync(breakdownDir, { recursive: true });

      const inputs: Record<string, string> = {
        requirements_source: requirementsSource,
        task_platform: platform,
        parent_task: parentTask.trim(),
        detail_level: detailLevel,
      };
      if (projectKey?.trim()) { inputs.project_key = projectKey.trim(); }
      if (instruction) { inputs.custom_instructions = instruction; }

      fs.writeFileSync(
        path.join(breakdownDir, 'inputs.json'),
        JSON.stringify(inputs, null, 2) + '\n',
        'utf8',
      );

      const skillInstalled = tryInstallSkill(root);

      // ── Summary ────────────────────────────────────────────────────────────

      console.log();
      console.log(chalk.green('✔') + ' Scaffolded ' + chalk.bold(runId));
      console.log(chalk.dim('  Output: ') + path.join(BREAKDOWN_ROOT, runId));
      if (!skillInstalled) {
        console.log(chalk.yellow('⚠  ') + chalk.dim('Copy `analyze-requirements.md` into `.claude/commands/` to register the slash command.'));
      }
      console.log();
      console.log('Run this in the Claude CLI to start:');
      console.log(chalk.cyan(`  /analyze-requirements ${runId}`));
      console.log();
    });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Prompt the user for a single line. Returns the trimmed answer. */
function prompt(
  question: string,
  defaultValue?: string,
  validate?: (v: string) => string | null,
): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const suffix = defaultValue !== undefined ? chalk.dim(` [${defaultValue || 'blank'}]`) : '';
    rl.question(`${chalk.bold(question)}${suffix}: `, (raw) => {
      rl.close();
      const value = raw.trim() || (defaultValue ?? '');
      if (validate) {
        const err = validate(value);
        if (err) {
          console.error(chalk.red(`  ✗ ${err}`));
          process.exit(1);
        }
      }
      resolve(value);
    });
  });
}

function nextRunId(root: string): string {
  const dir = path.resolve(root, BREAKDOWN_ROOT);
  let next = 1;
  if (fs.existsSync(dir)) {
    const numbers = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name.match(/^REQ-(\d+)$/i))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => parseInt(m[1], 10));
    if (numbers.length > 0) { next = Math.max(...numbers) + 1; }
  }
  return `REQ-${String(next).padStart(3, '0')}`;
}

function tryInstallSkill(root: string): boolean {
  const commandsDir = path.join(root, '.claude', 'commands');
  const dest = path.join(commandsDir, 'analyze-requirements.md');
  if (fs.existsSync(dest)) { return true; }

  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'core', 'templates', 'sdlc', 'skills', 'analyze-requirements.md'),
    path.resolve(__dirname, '..', 'templates', 'sdlc', 'skills', 'analyze-requirements.md'),
  ];
  for (const src of candidates) {
    if (fs.existsSync(src)) {
      fs.mkdirSync(commandsDir, { recursive: true });
      fs.copyFileSync(src, dest);
      return true;
    }
  }
  return false;
}
