/**
 * OpenCode runner — shells out to the `opencode` CLI in its non-interactive
 * `run` mode (no TUI) with the skill as leading context and the slash command
 * args as the task prompt.
 *
 * Unlike `claude` / `codex`, OpenCode's machine-readable output format has
 * shifted across releases (plain text, `--print-logs`, JSON event streams),
 * so this runner takes the robust path that works on every version: it lets
 * `opencode run` print the assistant's final message to stdout and captures
 * that text verbatim. We stream stdout chunks live and return the collected
 * text as the final output. If a future version's default output needs
 * post-processing, a custom runner (`runner: custom`) is the escape hatch.
 *
 * OpenCode is provider-agnostic — the concrete model is selected with
 * `-m provider/model` (e.g. `openai/gpt-5`, `google/gemini-2.5-pro`), so a
 * single adapter reaches many LLMs. When `ctx.model` is set we pass it through;
 * otherwise OpenCode uses its own configured default.
 *
 * OpenCode does not report a per-run USD cost, so `costUsd` is left undefined
 * (budget accumulation treats that as 0).
 */

import { spawn } from 'child_process';
import type { AidlcRunner, RunnerContext, RunnerResult } from './types';

export interface OpenCodeRunnerOptions {
  /** Override the opencode binary path. Default looks up `opencode` on PATH. */
  openCodeBin?: string;
  /** Extra args inserted before the prompt (after our fixed flags). */
  extraArgs?: string[];
}

export class OpenCodeRunner implements AidlcRunner {
  constructor(private readonly opts: OpenCodeRunnerOptions = {}) {}

  async run(ctx: RunnerContext): Promise<RunnerResult> {
    const bin = this.opts.openCodeBin ?? 'opencode';

    const userMessage = ctx.args.join(' ');
    const prompt = ctx.skill ? `${ctx.skill}\n\n---\n\n${userMessage}` : userMessage;

    // run: non-interactive one-shot (prints the final message, no TUI).
    // -m provider/model: pick the LLM when the agent declares one.
    const args = [
      'run',
      ...(ctx.model ? ['-m', ctx.model] : []),
      ...(this.opts.extraArgs ?? []),
      prompt,
    ];

    const proc = spawn(bin, args, {
      cwd: ctx.workspaceRoot,
      env: { ...process.env, ...ctx.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Capture stdout verbatim — it's the assistant's final message.
    let collected = '';

    proc.stdout.on('data', (d: Buffer) => {
      const chunk = d.toString('utf8');
      collected += chunk;
      ctx.onOutput(chunk);
    });
    proc.stderr.on('data', (d: Buffer) => {
      ctx.onError(d.toString('utf8'));
    });

    return new Promise<RunnerResult>((resolve) => {
      proc.on('error', (err) => {
        ctx.onError(`Failed to spawn ${bin}: ${err.message}\n`);
        resolve({ success: false, output: collected.trim() });
      });
      proc.on('close', (code) => {
        resolve({ success: code === 0, output: collected.trim() });
      });
    });
  }
}
