import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

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

import { OpenCodeRunner } from '../src';
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

describe('OpenCodeRunner — run mode', () => {
  beforeEach(() => {
    lastArgs = [];
    lastBin = '';
  });

  it('invokes `opencode run` with the prompt', async () => {
    const runner = new OpenCodeRunner();
    const p = runner.run(ctx());
    expect(lastBin).toBe('opencode');
    expect(lastArgs[0]).toBe('run');
    // Prompt is the trailing positional and carries the args.
    expect(lastArgs[lastArgs.length - 1]).toContain('do the thing');
    lastChild.emit('close', 0);
    await p;
  });

  it('forwards provider/model via -m when set', async () => {
    const runner = new OpenCodeRunner();
    const p = runner.run(ctx({ model: 'openai/gpt-5' }));
    const i = lastArgs.indexOf('-m');
    expect(i).toBeGreaterThan(-1);
    expect(lastArgs[i + 1]).toBe('openai/gpt-5');
    lastChild.emit('close', 0);
    await p;
  });

  it('captures stdout as the final message (trimmed)', async () => {
    const runner = new OpenCodeRunner();
    const chunks: string[] = [];
    const p = runner.run(ctx({ onOutput: (c) => chunks.push(c) }));
    lastChild.stdout.emit('data', Buffer.from('Hello '));
    lastChild.stdout.emit('data', Buffer.from('world\n'));
    lastChild.emit('close', 0);
    const res = await p;
    expect(res.success).toBe(true);
    expect(chunks.join('')).toBe('Hello world\n'); // streamed verbatim
    expect(res.output).toBe('Hello world');        // final output trimmed
    expect(res.costUsd).toBeUndefined();
  });

  it('non-zero exit → success false', async () => {
    const runner = new OpenCodeRunner();
    const p = runner.run(ctx());
    lastChild.emit('close', 2);
    const res = await p;
    expect(res.success).toBe(false);
  });
});
