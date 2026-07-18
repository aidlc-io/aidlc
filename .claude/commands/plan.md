---
description: Scaffold the epic and write the PRD. (AIDLC Plan phase) Usage: /plan <epic>
---

# /plan — Plan

You were invoked as `/plan <epic>` with arguments: `$ARGUMENTS` (the epic id).

Run the **`plan`** phase for this epic by following the AIDLC dispatch
procedure exactly as `/aidlc <epic> plan` would:

1. Read `docs/epics/<epic>/state.json` → `pipelineId`.
2. In `.aidlc/workspace.yaml`, find that pipeline and its `plan` step
   (`name`/`agent` === `plan`). Use that step's `agent` + `skills` —
   never assume; two pipelines can wire `plan` differently.
3. **If the pipeline has no `plan` step**, tell the user this epic's
   pipeline (`<pipelineId>`) has no `plan` phase, suggest
   `/aidlc <epic>` to run the next eligible phase, and stop.
4. Otherwise load the persona (`.claude/agents/<agent>.md`) + skill(s)
   (`.claude/skills/<skill>.md`), adopt them (unless the active standard is
   `none`), then follow the structural contract: read state/inputs, write to
   `docs/epics/<epic>/artifacts/PRD.md` (or the step's declared
   artifact), and tell the user to click **"Mark step done"**.
