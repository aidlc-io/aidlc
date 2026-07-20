---
description: Run performance / benchmark checks. (AIDLC Benchmark phase) Usage: /benchmark <epic>
---

# /benchmark — Benchmark

You were invoked as `/benchmark <epic>` with arguments: `$ARGUMENTS` (the epic id).

Run the **`benchmark`** phase for this epic by following the AIDLC dispatch
procedure exactly as `/aidlc <epic> benchmark` would:

1. Read `docs/epics/<epic>/state.json` → `pipelineId`.
2. In `.aidlc/workspace.yaml`, find that pipeline and its `benchmark` step
   (`name`/`agent` === `benchmark`). Use that step's `agent` + `skills` —
   never assume; two pipelines can wire `benchmark` differently.
3. **If the pipeline has no `benchmark` step**, tell the user this epic's
   pipeline (`<pipelineId>`) has no `benchmark` phase, suggest
   `/aidlc <epic>` to run the next eligible phase, and stop.
4. Otherwise load the persona (`.claude/agents/<agent>.md`) + skill(s)
   (`.claude/skills/<skill>.md`), adopt them (unless the active standard is
   `none`), then follow the structural contract: read state/inputs, write to
   `docs/epics/<epic>/artifacts/BENCHMARK-SUMMARY.md` (or the step's declared
   artifact), and tell the user to click **"Mark step done"**.
