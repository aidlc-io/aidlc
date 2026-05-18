#!/usr/bin/env bash
# .aidlc/scripts/ci.sh
# Auto-review runner for the Implement step.
# AIDLC calls this script after the developer agent finishes; if it exits
# non-zero the step is marked as failing auto-review.
#
# Customize the commands below to match your project's toolchain.

set -euo pipefail

echo "[aidlc-ci] Running lint…"
# npm run lint
# pnpm lint
# yarn lint

echo "[aidlc-ci] Running type-check…"
# npm run typecheck
# pnpm typecheck

echo "[aidlc-ci] Running tests…"
# npm test
# pnpm test
# pytest

echo "[aidlc-ci] All checks passed."
