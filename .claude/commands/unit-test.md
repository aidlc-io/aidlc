---
description: Write / run the unit tests for the feature. (AIDLC Unit Test phase) Usage: /unit-test <epic>
---

# /unit-test — Unit Test

You were invoked as `/unit-test <epic>` with arguments: `$ARGUMENTS` (the epic id).

Run the **`unit-test`** phase for this epic by following the AIDLC dispatch
procedure exactly as `/aidlc <epic> unit-test` would:

1. Read `docs/epics/<epic>/state.json` → `pipelineId`.
2. In `.aidlc/workspace.yaml`, find that pipeline and its `unit-test` step
   (`name`/`agent` === `unit-test`). Use that step's `agent` + `skills` —
   never assume; two pipelines can wire `unit-test` differently.
3. **If the pipeline has no `unit-test` step**, tell the user this epic's
   pipeline (`<pipelineId>`) has no `unit-test` phase, suggest
   `/aidlc <epic>` to run the next eligible phase, and stop.
4. Otherwise load the persona (`.claude/agents/<agent>.md`) + skill(s)
   (`.claude/skills/<skill>.md`), adopt them (unless the active standard is
   `none`), then follow the structural contract: read state/inputs, write to
   `docs/epics/<epic>/artifacts/UNIT-TEST-SUMMARY.md` (or the step's declared
   artifact), and tell the user to click **"Mark step done"**.
