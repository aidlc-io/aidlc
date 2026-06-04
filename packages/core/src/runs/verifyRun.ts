/**
 * Post-run drift check for a completed (or in-flight) run.
 *
 * After a step passes the gate, its resolved `produces` paths are recorded in
 * `StepRecord.artifactsProduced`. Nothing stops a human from later deleting or
 * gutting one of those files — the run state still says "approved". `verifyRun`
 * re-checks every recorded artifact (existence + the same `produces_contains`
 * content assertions the gate applied) and reports which steps have drifted.
 *
 * Pure read-only: mirrors the filesystem reads in `markStepDone`'s gate, never
 * mutates state, never throws. The CLI `run verify` command renders the result.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { PipelineConfig } from '../schema/WorkspaceSchema';
import { normalizeStep } from '../schema/WorkspaceSchema';
import type { RunState } from './RunState';
import { resolvePath } from './RunState';

/** Drift detected on a single step's recorded artifacts. */
export interface StepDrift {
  stepIdx: number;
  agent: string;
  /** The step's status in the run state at verify time. */
  status: string;
  /** Recorded artifacts that no longer exist on disk. */
  missing: string[];
  /** `produces_contains` markers no longer present in the produced files. */
  missingMarkers: string[];
}

export interface VerifyReport {
  /** True when no checked step has drifted. */
  ok: boolean;
  /** Number of steps that had recorded artifacts to re-check. */
  checked: number;
  /** Only steps with at least one missing file or marker. */
  drift: StepDrift[];
}

/**
 * Re-validate every step's recorded `artifactsProduced` against the current
 * filesystem. Steps that never produced anything (still pending / awaiting
 * work) are skipped — they have nothing to drift.
 */
export function verifyRun(args: {
  state: RunState;
  pipeline: PipelineConfig;
  workspaceRoot: string;
}): VerifyReport {
  const { state, pipeline, workspaceRoot } = args;
  const drift: StepDrift[] = [];
  let checked = 0;

  for (const step of state.steps) {
    const artifacts = step.artifactsProduced ?? [];
    if (artifacts.length === 0) { continue; }
    checked++;

    const abs = (rel: string) =>
      path.isAbsolute(rel) ? rel : path.join(workspaceRoot, rel);

    const missing = artifacts.filter((rel) => !fs.existsSync(abs(rel)));

    // Content assertions are re-applied from the pipeline step config (the
    // recorded artifacts don't store markers). Resolve placeholders the same
    // way the gate did, and only check against the files that still exist.
    const stepConfig = pipeline.steps[step.stepIdx];
    let missingMarkers: string[] = [];
    if (stepConfig) {
      const markers = normalizeStep(stepConfig).produces_contains.map((m) =>
        resolvePath(m, state.context),
      );
      if (markers.length > 0) {
        const haystack = artifacts
          .map((rel) => {
            try {
              return fs.readFileSync(abs(rel), 'utf8');
            } catch {
              return '';
            }
          })
          .join('\n');
        missingMarkers = markers.filter((marker) => !haystack.includes(marker));
      }
    }

    if (missing.length > 0 || missingMarkers.length > 0) {
      drift.push({
        stepIdx: step.stepIdx,
        agent: step.agent,
        status: step.status,
        missing,
        missingMarkers,
      });
    }
  }

  return { ok: drift.length === 0, checked, drift };
}
