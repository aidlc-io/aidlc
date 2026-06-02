import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// Fake child_process: each spawn() returns a controllable emitter we can feed
// NDJSON lines into, then close. Captured so the test can drive it.
class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
}
let lastChild: FakeChild;
let lastArgs: string[];

vi.mock('child_process', () => ({
  spawn: (_bin: string, args: string[]) => {
    lastArgs = args;
    lastChild = new FakeChild();
    return lastChild;
  },
}));

// Import AFTER the mock is registered.
import { DefaultRunner } from '../src';
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

describe('DefaultRunner — stream-json parsing', () => {
  beforeEach(() => {
    lastArgs = [];
  });

  it('requests stream-json output format', async () => {
    const runner = new DefaultRunner();
    const p = runner.run(ctx());
    // Args are captured synchronously on spawn.
    expect(lastArgs).toContain('--output-format');
    expect(lastArgs).toContain('stream-json');
    expect(lastArgs).toContain('--verbose');
    lastChild.emit('close', 0);
    await p;
  });

  it('streams assistant text and captures total_cost_usd from the result event', async () => {
    const runner = new DefaultRunner();
    const chunks: string[] = [];
    const p = runner.run(ctx({ onOutput: (c) => chunks.push(c) }));

    lastChild.stdout.emit('data', Buffer.from(
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hello ' }] } }) + '\n',
    ));
    lastChild.stdout.emit('data', Buffer.from(
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'world' }] } }) + '\n',
    ));
    lastChild.stdout.emit('data', Buffer.from(
      JSON.stringify({ type: 'result', subtype: 'success', result: 'Hello world', total_cost_usd: 0.0123 }) + '\n',
    ));
    lastChild.emit('close', 0);

    const res = await p;
    expect(res.success).toBe(true);
    expect(chunks.join('')).toBe('Hello world');
    expect(res.output).toBe('Hello world');
    expect(res.costUsd).toBeCloseTo(0.0123);
  });

  it('buffers NDJSON across split data chunks', async () => {
    const runner = new DefaultRunner();
    const p = runner.run(ctx());
    const line = JSON.stringify({ type: 'result', total_cost_usd: 0.5, result: 'x' }) + '\n';
    // Split mid-JSON across two data events.
    lastChild.stdout.emit('data', Buffer.from(line.slice(0, 10)));
    lastChild.stdout.emit('data', Buffer.from(line.slice(10)));
    lastChild.emit('close', 0);
    const res = await p;
    expect(res.costUsd).toBe(0.5);
  });

  it('non-zero exit → success false, cost still undefined', async () => {
    const runner = new DefaultRunner();
    const p = runner.run(ctx());
    lastChild.emit('close', 1);
    const res = await p;
    expect(res.success).toBe(false);
    expect(res.costUsd).toBeUndefined();
  });
});
