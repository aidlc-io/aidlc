/**
 * Registry maps an agent's `runner` field to a concrete `AidlcRunner`.
 *
 *   - `runner: default` → bundled DefaultRunner (claude CLI shell-out).
 *   - `runner: custom`  → user's runner_path module, loaded on demand.
 *
 * The registry caches custom runners by absolute path so repeated invocations
 * of the same custom runner don't re-`require()` the file.
 */

import * as path from 'path';

import type { AidlcRunner } from './types';
import type { AgentConfig } from '../schema/WorkspaceSchema';
import { DefaultRunner } from './DefaultRunner';
import { CodexRunner } from './CodexRunner';
import { OpenCodeRunner } from './OpenCodeRunner';
import { CustomRunnerLoader } from './CustomRunnerLoader';

export class RunnerRegistry {
  private builtins = new Map<string, AidlcRunner>();
  private customCache = new Map<string, AidlcRunner>();
  private loader: CustomRunnerLoader;

  constructor(workspaceRoot: string) {
    this.loader = new CustomRunnerLoader(workspaceRoot);
    // Built-in agent CLIs. `default` shells out to `claude`; the others let an
    // agent run on a different LLM by setting `runner: codex` / `runner: opencode`.
    this.register('default', new DefaultRunner());
    this.register('codex', new CodexRunner());
    this.register('opencode', new OpenCodeRunner());
  }

  /** Add or replace a builtin runner. */
  register(id: string, runner: AidlcRunner): void {
    this.builtins.set(id, runner);
  }

  /**
   * Return the runner that should execute this agent, loading custom
   * scripts on demand.
   */
  resolve(agent: AgentConfig): AidlcRunner {
    if (agent.runner === 'custom') {
      if (!agent.runner_path) {
        throw new Error(`Agent \`${agent.id}\` declares runner: custom but no runner_path`);
      }
      const abs = this.loader.absolutePath(agent.runner_path);
      const cached = this.customCache.get(abs);
      if (cached) { return cached; }
      const fresh = this.loader.load(agent.runner_path);
      this.customCache.set(abs, fresh);
      return fresh;
    }

    // Pick the built-in named by `agent.runner` (e.g. `codex`, `opencode`),
    // falling back to `default` for the unset/`default` case or any id we
    // don't recognise.
    const builtin = this.builtins.get(agent.runner) ?? this.builtins.get('default');
    if (!builtin) {
      throw new Error('No default runner registered. RunnerRegistry constructor should have registered one.');
    }
    return builtin;
  }

  /** Drop a cached custom runner — useful when watching the runner file for edits. */
  clearCustom(runnerPath?: string): void {
    if (runnerPath) {
      const abs = path.isAbsolute(runnerPath) ? runnerPath : this.loader.absolutePath(runnerPath);
      this.customCache.delete(abs);
    } else {
      this.customCache.clear();
    }
  }
}
