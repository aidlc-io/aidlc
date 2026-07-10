import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// Fake child_process: each spawn() returns a controllable emitter we can feed
// JSONL lines into, then close. Captured so the test can drive + assert args.
class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
}
let lastChild: FakeChild;
let lastBin: string;
let lastArgs: string[];

vi.mock('child_process', () => ({
  spawn: (bin: string, args: string[]) => {
    lastBin = bin;
    lastArgs = args;
    lastChild = new FakeChild();
    return lastChild;
  },
}));

// Import AFTER the mock is registered.
import { CodexRunner } from '../src';
import type { RunnerContext } from '../src';

function ctx(overrides: Partial<RunnerContext> = {}): RunnerContext {
  return {
    skill: 'sys prompt',
    env: {},
    args: ['do the thing'],
    workspaceRoot: '/tmp/ws',
    onOutput: () => {},
    onError: () => {},
    claude: null,
    ...overrides,
  };
}

describe('CodexRunner — exec --json parsing', () => {
  beforeEach(() => {
    lastArgs = [];
    lastBin = '';
  });

  it('invokes `codex exec --json` non-interactively', async () => {
    const runner = new CodexRunner();
    const p = runner.run(ctx());
    expect(lastBin).toBe('codex');
    expect(lastArgs[0]).toBe('exec');
    expect(lastArgs).toContain('--json');
    expect(lastArgs).toContain('--ask-for-approval');
    expect(lastArgs).toContain('never');
    expect(lastArgs).toContain('--skip-git-repo-check');
    lastChild.emit('close', 0);
    await p;
  });

  it('forwards the agent model when set', async () => {
    const runner = new CodexRunner();
    const p = runner.run(ctx({ model: 'gpt-5-codex' }));
    const i = lastArgs.indexOf('--model');
    expect(i).toBeGreaterThan(-1);
    expect(lastArgs[i + 1]).toBe('gpt-5-codex');
    lastChild.emit('close', 0);
    await p;
  });

  it('streams agent_message text and uses the last one as final output', async () => {
    const runner = new CodexRunner();
    const chunks: string[] = [];
    const p = runner.run(ctx({ onOutput: (c) => chunks.push(c) }));

    lastChild.stdout.emit('data', Buffer.from(
      JSON.stringify({ type: 'thread.started', thread_id: 't1' }) + '\n',
    ));
    lastChild.stdout.emit('data', Buffer.from(
      JSON.stringify({ type: 'item.completed', item: { type: 'reasoning', text: 'thinking' } }) + '\n',
    ));
    lastChild.stdout.emit('data', Buffer.from(
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Hello world' } }) + '\n',
    ));
    lastChild.emit('close', 0);

    const res = await p;
    expect(res.success).toBe(true);
    // Only the agent_message is streamed/kept — reasoning + non-message events are ignored.
    expect(chunks.join('')).toBe('Hello world');
    expect(res.output).toBe('Hello world');
    // Codex doesn't report a USD cost.
    expect(res.costUsd).toBeUndefined();
  });

  it('buffers JSONL across split data chunks', async () => {
    const runner = new CodexRunner();
    const p = runner.run(ctx());
    const line = JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'done' } }) + '\n';
    lastChild.stdout.emit('data', Buffer.from(line.slice(0, 12)));
    lastChild.stdout.emit('data', Buffer.from(line.slice(12)));
    lastChild.emit('close', 0);
    const res = await p;
    expect(res.output).toBe('done');
  });

  it('non-zero exit → success false', async () => {
    const runner = new CodexRunner();
    const p = runner.run(ctx());
    lastChild.emit('close', 1);
    const res = await p;
    expect(res.success).toBe(false);
  });
});
