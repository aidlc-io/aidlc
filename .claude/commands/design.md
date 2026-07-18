---
description: Design the implementation approach. (AIDLC Design phase) Usage: /design <epic>
---

# /design — Design

You were invoked as `/design <epic>` with arguments: `$ARGUMENTS` (the epic id).

Run the **`design`** phase for this epic by following the AIDLC dispatch
procedure exactly as `/aidlc <epic> design` would:

1. Read `docs/epics/<epic>/state.json` → `pipelineId`.
2. In `.aidlc/workspace.yaml`, find that pipeline and its `design` step
   (`name`/`agent` === `design`). Use that step's `agent` + `skills` —
   never assume; two pipelines can wire `design` differently.
3. **If the pipeline has no `design` step**, tell the user this epic's
   pipeline (`<pipelineId>`) has no `design` phase, suggest
   `/aidlc <epic>` to run the next eligible phase, and stop.
4. Otherwise load the persona (`.claude/agents/<agent>.md`) + skill(s)
   (`.claude/skills/<skill>.md`), adopt them (unless the active standard is
   `none`), then follow the structural contract: read state/inputs, write to
   `docs/epics/<epic>/artifacts/TECH-DESIGN.md` (or the step's declared
   artifact), and tell the user to click **"Mark step done"**.
