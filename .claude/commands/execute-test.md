---
description: Run the test cases and write the report. (AIDLC Execute Test phase) Usage: /execute-test <epic>
---

# /execute-test — Execute Test

You were invoked as `/execute-test <epic>` with arguments: `$ARGUMENTS` (the epic id).

Run the **`execute-test`** phase for this epic by following the AIDLC dispatch
procedure exactly as `/aidlc <epic> execute-test` would:

1. Read `docs/epics/<epic>/state.json` → `pipelineId`.
2. In `.aidlc/workspace.yaml`, find that pipeline and its `execute-test` step
   (`name`/`agent` === `execute-test`). Use that step's `agent` + `skills` —
   never assume; two pipelines can wire `execute-test` differently.
3. **If the pipeline has no `execute-test` step**, tell the user this epic's
   pipeline (`<pipelineId>`) has no `execute-test` phase, suggest
   `/aidlc <epic>` to run the next eligible phase, and stop.
4. Otherwise load the persona (`.claude/agents/<agent>.md`) + skill(s)
   (`.claude/skills/<skill>.md`), adopt them (unless the active standard is
   `none`), then follow the structural contract: read state/inputs, write to
   `docs/epics/<epic>/artifacts/TEST-SCRIPT.md` (or the step's declared
   artifact), and tell the user to click **"Mark step done"**.
