---
description: Build the feature on a feature branch. (AIDLC Implement phase) Usage: /implement <epic>
---

# /implement — Implement

You were invoked as `/implement <epic>` with arguments: `$ARGUMENTS` (the epic id).

Run the **`implement`** phase for this epic by following the AIDLC dispatch
procedure exactly as `/aidlc <epic> implement` would:

1. Read `docs/epics/<epic>/state.json` → `pipelineId`.
2. In `.aidlc/workspace.yaml`, find that pipeline and its `implement` step
   (`name`/`agent` === `implement`). Use that step's `agent` + `skills` —
   never assume; two pipelines can wire `implement` differently.
3. **If the pipeline has no `implement` step**, tell the user this epic's
   pipeline (`<pipelineId>`) has no `implement` phase, suggest
   `/aidlc <epic>` to run the next eligible phase, and stop.
4. Otherwise load the persona (`.claude/agents/<agent>.md`) + skill(s)
   (`.claude/skills/<skill>.md`), adopt them (unless the active standard is
   `none`), then follow the structural contract: read state/inputs, write to
   `docs/epics/<epic>/artifacts/IMPLEMENT-SUMMARY.md` (or the step's declared
   artifact), and tell the user to click **"Mark step done"**.
