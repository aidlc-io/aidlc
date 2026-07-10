import { describe, it, expect } from 'vitest';
import {
  RunnerRegistry,
  DefaultRunner,
  CodexRunner,
  OpenCodeRunner,
} from '../src';
import type { AgentConfig } from '../src';

function agent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: 'coder',
    name: 'Coder',
    skills: ['code'],
    runner: 'default',
    ...overrides,
  } as AgentConfig;
}

describe('RunnerRegistry.resolve — honors agent.runner', () => {
  const reg = new RunnerRegistry('/tmp/ws');

  it('default → DefaultRunner', () => {
    expect(reg.resolve(agent({ runner: 'default' }))).toBeInstanceOf(DefaultRunner);
  });

  it('codex → CodexRunner', () => {
    expect(reg.resolve(agent({ runner: 'codex' }))).toBeInstanceOf(CodexRunner);
  });

  it('opencode → OpenCodeRunner', () => {
    expect(reg.resolve(agent({ runner: 'opencode' }))).toBeInstanceOf(OpenCodeRunner);
  });

  it('unknown builtin id falls back to DefaultRunner', () => {
    expect(reg.resolve(agent({ runner: 'nope' as AgentConfig['runner'] }))).toBeInstanceOf(DefaultRunner);
  });

  it('custom without runner_path throws', () => {
    expect(() => reg.resolve(agent({ runner: 'custom' }))).toThrow(/runner_path/);
  });
});
