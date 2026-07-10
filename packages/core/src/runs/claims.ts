/**
 * Advisory run-claim helpers for git-shared, multi-user workspaces.
 *
 * A claim records "who is currently driving this run" so a teammate who pulls
 * the state can avoid stepping on in-flight work. It is deliberately *soft*:
 * there is no distributed lock — two people can still race, and whoever `git
 * push`es first wins (the loser's push is rejected and they re-pull). A claim
 * older than `ttlMs` is treated as stale and may be taken over without force.
 */

import type { RunState, RunClaim } from './RunState';

export const DEFAULT_CLAIM_TTL_MS = 4 * 60 * 60 * 1000; // 4h

/** True when `claim` exists and is within its TTL relative to `now`. */
export function isClaimActive(
  claim: RunClaim | undefined,
  ttlMs: number = DEFAULT_CLAIM_TTL_MS,
  now: number = Date.now(),
): boolean {
  if (!claim) { return false; }
  const at = Date.parse(claim.at);
  if (Number.isNaN(at)) { return false; }
  return now - at < ttlMs;
}

export type ClaimOutcome =
  | { ok: true; state: RunState; refreshed: boolean }
  | { ok: false; heldBy: string; heldAt: string };

/**
 * Claim `state` for `actor`. Returns a new state with the claim set, unless an
 * *active* claim is already held by someone else and `force` is false — in
 * which case the current holder is reported so the CLI can explain the refusal.
 *
 * Re-claiming your own (or a stale) claim always succeeds and refreshes `at`.
 */
export function claimRun(args: {
  state: RunState;
  actor: string;
  ttlMs?: number;
  force?: boolean;
  now?: number;
}): ClaimOutcome {
  const { state, actor, force = false } = args;
  const ttlMs = args.ttlMs ?? DEFAULT_CLAIM_TTL_MS;
  const now = args.now ?? Date.now();
  const existing = state.claim;
  const actorKey = actor.trim().toLowerCase();

  if (
    !force &&
    isClaimActive(existing, ttlMs, now) &&
    existing!.by.trim().toLowerCase() !== actorKey
  ) {
    return { ok: false, heldBy: existing!.by, heldAt: existing!.at };
  }

  const refreshed = !!existing && existing.by.trim().toLowerCase() === actorKey;
  const next: RunState = {
    ...clone(state),
    claim: { by: actor, at: new Date(now).toISOString() },
  };
  return { ok: true, state: next, refreshed };
}

/** Drop the claim on a run (e.g. `aidlc run release`). Idempotent. */
export function releaseRun(state: RunState): RunState {
  const next = clone(state);
  delete next.claim;
  return next;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
