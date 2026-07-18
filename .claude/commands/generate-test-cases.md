---
description: Concrete, executable test cases from the plan. (AIDLC Generate Test Cases phase) Usage: /generate-test-cases <epic>
---

# /generate-test-cases — Generate Test Cases

You were invoked as `/generate-test-cases <epic>` with arguments: `$ARGUMENTS` (the epic id).

Run the **`generate-test-cases`** phase for this epic by following the AIDLC dispatch
procedure exactly as `/aidlc <epic> generate-test-cases` would:

1. Read `docs/epics/<epic>/state.json` → `pipelineId`.
2. In `.aidlc/workspace.yaml`, find that pipeline and its `generate-test-cases` step
   (`name`/`agent` === `generate-test-cases`). Use that step's `agent` + `skills` —
   never assume; two pipelines can wire `generate-test-cases` differently.
3. **If the pipeline has no `generate-test-cases` step**, tell the user this epic's
   pipeline (`<pipelineId>`) has no `generate-test-cases` phase, suggest
   `/aidlc <epic>` to run the next eligible phase, and stop.
4. Otherwise load the persona (`.claude/agents/<agent>.md`) + skill(s)
   (`.claude/skills/<skill>.md`), adopt them (unless the active standard is
   `none`), then follow the structural contract: read state/inputs, write to
   `docs/epics/<epic>/artifacts/TEST-CASES.md` (or the step's declared
   artifact), and tell the user to click **"Mark step done"**.
