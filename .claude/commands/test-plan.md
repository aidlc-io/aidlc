---
description: Plan how the feature will be verified. (AIDLC Test Plan phase) Usage: /test-plan <epic>
---

# /test-plan — Test Plan

You were invoked as `/test-plan <epic>` with arguments: `$ARGUMENTS` (the epic id).

Run the **`test-plan`** phase for this epic by following the AIDLC dispatch
procedure exactly as `/aidlc <epic> test-plan` would:

1. Read `docs/epics/<epic>/state.json` → `pipelineId`.
2. In `.aidlc/workspace.yaml`, find that pipeline and its `test-plan` step
   (`name`/`agent` === `test-plan`). Use that step's `agent` + `skills` —
   never assume; two pipelines can wire `test-plan` differently.
3. **If the pipeline has no `test-plan` step**, tell the user this epic's
   pipeline (`<pipelineId>`) has no `test-plan` phase, suggest
   `/aidlc <epic>` to run the next eligible phase, and stop.
4. Otherwise load the persona (`.claude/agents/<agent>.md`) + skill(s)
   (`.claude/skills/<skill>.md`), adopt them (unless the active standard is
   `none`), then follow the structural contract: read state/inputs, write to
   `docs/epics/<epic>/artifacts/TEST-PLAN.md` (or the step's declared
   artifact), and tell the user to click **"Mark step done"**.
