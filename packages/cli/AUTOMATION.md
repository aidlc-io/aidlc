# Automating AIDLC pipelines

The `aidlc` CLI is built to run unattended — in CI, a cron job, a git hook, or a
shell script. This guide covers the headless surface: exit codes, machine-readable
output, event streams, and a copy-paste GitHub Action.

> Everything here runs without VS Code. It needs the `claude` CLI on `PATH` and an
> auth method (`claude login`, `ANTHROPIC_API_KEY`, Bedrock, or Vertex). Run
> `aidlc doctor` first — it checks all of that and now exits non-zero if anything
> (including a broken skill or runner path) fails.

## Exit codes

`aidlc run exec` distinguishes *finished* from *blocked* so a CI job can branch on it:

| Exit | Meaning |
|------|---------|
| `0`  | Run reached `completed` (or stopped at `--until`, or a `--dry-run` preview) |
| `2`  | Paused on a gate — awaiting human review, a rejected step, or a budget pause |
| `1`  | Error — claude failed, artifacts missing, budget `on_exceed: fail`, etc. |

Add `--require-complete` to collapse every non-`completed` outcome to `1`. Use it
when a job must fail unless the whole pipeline ran to the end:

```bash
aidlc run exec my-pipeline --auto-approve --require-complete
```

Other commands follow the usual convention: `0` on success, `1` on failure.
`aidlc validate --strict`, `aidlc run verify`, and `aidlc doctor` all exit `1`
when something is wrong — drop them into a CI job as gates.

## Machine-readable output (`--json`)

| Command | `--json` payload |
|---------|------------------|
| `aidlc doctor --json` | `{ ok, failures, sections: [{ title, checks: [{ label, pass, info }] }] }` |
| `aidlc validate --json` | `{ ok, configPath, counts, refIssues }` (or `{ ok:false, error }`) |
| `aidlc run verify --json` | `{ runId, ok, checked, drift: [...] }` |
| `aidlc run exec --json` | final `{ runId, outcome, exitCode, runStatus, totalCostUsd, steps }` |
| `aidlc status [runId] --json` | run list / one run's full state |
| `aidlc list --json`, `aidlc epic list --json`, … | workspace + epic inspection |

In `run exec --json`, claude's streamed output goes to **stderr** so stdout stays a
clean JSON document:

```bash
aidlc run exec my-pipeline --auto-approve --json 2>/dev/null | jq '.totalCostUsd'
```

## Event stream (`tail --json`)

`aidlc tail --json` emits one NDJSON object per state transition — pipe it into a
notifier or a downstream trigger:

```bash
aidlc tail --json | while read -r ev; do
  case "$(jq -r .event <<<"$ev")" in
    step_status) echo "step moved: $ev" ;;
    run_status)  curl -s -X POST "$SLACK_WEBHOOK" -d "{\"text\":\"$ev\"}" ;;
  esac
done
```

Event kinds: `seed`, `run_new`, `run_status`, `pointer`, `step_status`,
`step_revision`, `run_gone`. Every line carries `ts` and `runId`.

## Passing context

`run start` and `agent run` accept context three ways, merged in order
(file → flags, last wins):

```bash
aidlc run start my-pipeline \
  --context-file ci-context.json \      # JSON object or key=value lines
  --context epic=ABC-123 \              # repeatable
  --context "env=staging,region=eu"     # comma-separated also works
```

## Quiet mode

`-q, --quiet` suppresses decorative progress output (today: `run exec`'s
step-by-step chatter). Errors and `--json` payloads still print. Colour is handled
by chalk — it auto-disables when stdout is not a TTY and honours `NO_COLOR`.

## GitHub Action recipe

A workflow that runs an AIDLC pipeline end-to-end on every push and fails the build
if it didn't complete:

```yaml
# .github/workflows/aidlc.yml
name: AIDLC pipeline
on: [push]

jobs:
  run-pipeline:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install aidlc + claude
        run: |
          npm install -g aidlc
          npm install -g @anthropic-ai/claude-code

      - name: Preflight
        run: aidlc doctor --json
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

      - name: Validate workspace
        run: aidlc validate --strict

      - name: Run the pipeline to completion
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          RUN_ID="ci-${{ github.run_id }}"
          aidlc run start my-pipeline --id "$RUN_ID" \
            --context "sha=${{ github.sha }},branch=${{ github.ref_name }}"
          aidlc run exec "$RUN_ID" --auto-approve --require-complete --json \
            > run-summary.json 2>run.log
          cat run.log

      - name: Verify artifacts (drift check)
        run: aidlc run verify "ci-${{ github.run_id }}" --json

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: aidlc-run
          path: |
            run-summary.json
            run.log
            .aidlc/runs/
```

Notes:
- `--auto-approve` clears `human_review` gates so the run doesn't block on a person.
  Drop it if you *want* the job to stop (exit `2`) at a review gate.
- Steps with `auto_review: true` run their `auto_review_runner` validator
  automatically — a `reject` stops the run with a non-zero exit.
- A pipeline `budget` with `on_exceed: fail` caps spend and fails the job if exceeded.
