/**
 * Default runner — shells out to the `claude` CLI with the skill as system
 * prompt and slash command args as the user message. Streams stdout/stderr
 * back through the runner context callbacks.
 *
 * Phase 1: this is a working stub. Real terminal/extension integration lands
 * in Phase 4 when we wire AidlcTerminal up to call this. Tests in Phase 1
 * exercise the spawn logic via a fake child_process; production use kicks in
 * once an extension calls `runner.run({...})`.
 */

import { spawn } from 'child_process';
import type { AidlcRunner, RunnerContext, RunnerResult } from './types';

export interface DefaultRunnerOptions {
  /**
   * Override the claude binary path. Useful for tests + when claude is not
   * on PATH (rare). Default looks up `claude` on PATH.
   */
  claudeBin?: string;
  /**
   * Extra args inserted before the user message. Most users won't need this;
   * custom runners are the right place for advanced flag tuning.
   */
  extraArgs?: string[];
}

export class DefaultRunner implements AidlcRunner {
  constructor(private readonly opts: DefaultRunnerOptions = {}) {}

  async run(ctx: RunnerContext): Promise<RunnerResult> {
    const bin = this.opts.claudeBin ?? 'claude';
    const userMessage = ctx.args.join(' ');

    // --print: non-interactive, dump response and exit (no REPL)
    // --append-system-prompt: stack our skill on top of claude's defaults
    // --output-format stream-json --verbose: emit NDJSON events as they happen
    //   so we keep streaming text live AND get a final `result` event carrying
    //   `total_cost_usd` (claude's own accurate cost) for the budget guard.
    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--verbose',
      '--append-system-prompt', ctx.skill,
      ...(this.opts.extraArgs ?? []),
      userMessage,
    ];

    const proc = spawn(bin, args, {
      cwd: ctx.workspaceRoot,
      env: { ...process.env, ...ctx.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // NDJSON is line-delimited — buffer partial lines across data chunks.
    let buf = '';
    let finalText = '';
    let costUsd: number | undefined;

    const handleEvent = (evt: StreamEvent): void => {
      if (evt.type === 'assistant' && evt.message?.content) {
        // Stream each text block of the assistant turn live.
        for (const block of evt.message.content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            ctx.onOutput(block.text);
          }
        }
      } else if (evt.type === 'result') {
        if (typeof evt.total_cost_usd === 'number') { costUsd = evt.total_cost_usd; }
        if (typeof evt.result === 'string') { finalText = evt.result; }
      }
    };

    const consume = (line: string): void => {
      const trimmed = line.trim();
      if (!trimmed) { return; }
      try {
        handleEvent(JSON.parse(trimmed) as StreamEvent);
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
        resolve({ success: false, output: finalText, costUsd });
      });
      proc.on('close', (code) => {
        if (buf.length) { consume(buf); } // flush any trailing partial line
        resolve({ success: code === 0, output: finalText, costUsd });
      });
    });
  }
}

/** Shape of the claude `--output-format stream-json` NDJSON events we read. */
interface StreamEvent {
  type: string;
  message?: { content?: Array<{ type: string; text?: string }> };
  total_cost_usd?: number;
  result?: string;
}
