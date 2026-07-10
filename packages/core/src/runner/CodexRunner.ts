/**
 * Codex runner — shells out to OpenAI's `codex` CLI in non-interactive
 * (`exec`) mode with the skill as the leading context and the slash command
 * args as the task prompt. Streams assistant text back through the runner
 * context callbacks.
 *
 * Output parsing: `codex exec --json` writes a JSON Lines (JSONL) stream to
 * stdout — one event object per line. The events we care about are
 * `item.completed` with `item.type === 'agent_message'`, whose `item.text`
 * carries assistant prose. The final assistant message is the last such event.
 *
 *   {"type":"item.completed","item":{"type":"agent_message","text":"Done."}}
 *
 * Codex does not report a per-run USD cost the way `claude` does, so
 * `costUsd` is left undefined (budget accumulation treats that as 0).
 *
 * Like DefaultRunner this is a Phase-1 runner: it is exercised by unit tests
 * via a faked child_process and becomes live once a caller invokes
 * `runner.run({...})` for an agent whose `runner: codex`.
 */

import { spawn } from 'child_process';
import type { AidlcRunner, RunnerContext, RunnerResult } from './types';

export interface CodexRunnerOptions {
  /** Override the codex binary path. Default looks up `codex` on PATH. */
  codexBin?: string;
  /**
   * Extra args inserted before the prompt (after our fixed flags). Custom
   * runners are the better place for heavy flag tuning, but this keeps tests
   * and one-off overrides simple.
   */
  extraArgs?: string[];
}

export class CodexRunner implements AidlcRunner {
  constructor(private readonly opts: CodexRunnerOptions = {}) {}

  async run(ctx: RunnerContext): Promise<RunnerResult> {
    const bin = this.opts.codexBin ?? 'codex';

    // The skill is our system context; the user's args are the concrete task.
    // Codex exec takes a single prompt positional, so we prepend the skill.
    const userMessage = ctx.args.join(' ');
    const prompt = ctx.skill ? `${ctx.skill}\n\n---\n\n${userMessage}` : userMessage;

    // exec: non-interactive one-shot (no TUI).
    // --json: emit JSONL events on stdout so we can stream + find the final msg.
    // --sandbox workspace-write: allow edits inside the project, nothing outside.
    // --ask-for-approval never: nobody is present to approve in an automated run.
    // --skip-git-repo-check: agents may run in a scratch dir that isn't a repo.
    const args = [
      'exec',
      '--json',
      '--sandbox', 'workspace-write',
      '--ask-for-approval', 'never',
      '--skip-git-repo-check',
      ...(ctx.model ? ['--model', ctx.model] : []),
      ...(this.opts.extraArgs ?? []),
      prompt,
    ];

    const proc = spawn(bin, args, {
      cwd: ctx.workspaceRoot,
      env: { ...process.env, ...ctx.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // JSONL is line-delimited — buffer partial lines across data chunks.
    let buf = '';
    let finalText = '';

    const handleEvent = (evt: CodexEvent): void => {
      if (
        evt.type === 'item.completed' &&
        evt.item?.type === 'agent_message' &&
        typeof evt.item.text === 'string'
      ) {
        // Stream the assistant message live and remember it as the final text.
        // The last agent_message wins, matching `claude`'s single `result`.
        ctx.onOutput(evt.item.text);
        finalText = evt.item.text;
      }
    };

    const consume = (line: string): void => {
      const trimmed = line.trim();
      if (!trimmed) { return; }
      try {
        handleEvent(JSON.parse(trimmed) as CodexEvent);
      } catch {
        // Not JSON (e.g. a stray log line) — surface it raw rather than drop it.
        ctx.onOutput(line);
      }
    };

    proc.stdout.on('data', (d: Buffer) => {
      buf += d.toString('utf8');
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        consume(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    });
    proc.stderr.on('data', (d: Buffer) => {
      ctx.onError(d.toString('utf8'));
    });

    return new Promise<RunnerResult>((resolve) => {
      proc.on('error', (err) => {
        ctx.onError(`Failed to spawn ${bin}: ${err.message}\n`);
        resolve({ success: false, output: finalText });
      });
      proc.on('close', (code) => {
        if (buf.length) { consume(buf); } // flush any trailing partial line
        resolve({ success: code === 0, output: finalText });
      });
    });
  }
}

/** Shape of the `codex exec --json` JSONL events we read. */
interface CodexEvent {
  type: string;
  item?: { type?: string; text?: string };
}
