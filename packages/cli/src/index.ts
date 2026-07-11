#!/usr/bin/env node
import * as path from 'path';
import { Command } from 'commander';
import * as yaml from 'js-yaml';
import { activateBackendFromWorkspace } from '@aidlc/core';
import { registerValidate } from './commands/validate';
import { registerList } from './commands/list';
import { registerStatus } from './commands/status';
import { registerInit } from './commands/init';
import { registerDoctor } from './commands/doctor';
import { registerAgent } from './commands/agent';
import { registerSkill } from './commands/skill';
import { registerPipeline } from './commands/pipeline';
import { registerPreset } from './commands/preset';
import { registerRun } from './commands/run';
import { registerStep } from './commands/step';
import { registerWatch } from './commands/watch';
import { registerTail } from './commands/tail';
import { registerDashboard } from './commands/dashboard';
import { registerEpic } from './commands/epic';
import { registerRecipe } from './commands/recipe';
import { registerMonitor } from './commands/monitor';
import { registerAsk } from './commands/ask';
import { registerGuide } from './commands/guide';
import { registerGlobals } from './commands/globals';
import { setQuiet } from './output';
import { registerAnalyze } from './commands/analyze';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require('../package.json') as { version: string };

const program = new Command();

program
  .name('aidlc')
  .description('AIDLC terminal CLI — drive workspace.yaml pipelines from any terminal')
  .version(version)
  .option('-w, --workspace <path>', 'workspace root (defaults to cwd)')
  .option('-q, --quiet', 'Suppress decorative progress output (errors and JSON still print)')
  .hook('preAction', (thisCommand) => {
    // Global --quiet silences info() across commands (today: run exec\'s
    // step-by-step chatter). Colour is left to chalk, which already disables
    // itself when stdout is not a TTY and honours NO_COLOR.
    if (thisCommand.opts().quiet) { setQuiet(true); }

    // Select the run-state backend declared in workspace.yaml (`persistence`).
    // Defensive: absent/invalid config leaves the default file backend in
    // place — validation errors are surfaced by `aidlc validate`, not here.
    const raw = thisCommand.opts().workspace ?? process.env.AIDLC_WORKSPACE ?? process.cwd();
    activateBackendFromWorkspace(path.resolve(raw), (text) => yaml.load(text));
  });

registerInit(program);
registerValidate(program);
registerList(program);
registerStatus(program);
registerDoctor(program);
registerAgent(program);
registerSkill(program);
registerPipeline(program);
registerPreset(program);
registerRun(program);
registerStep(program);
registerWatch(program);
registerTail(program);
registerDashboard(program);
registerEpic(program);
registerRecipe(program);
registerMonitor(program);
registerAsk(program);
registerGuide(program);
registerGlobals(program);
registerAnalyze(program);

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
