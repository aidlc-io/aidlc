/**
 * Shared stdout gating for scriptable output.
 *
 * `info()` is for *decorative* progress/status text. It is silenced when the
 * user asks for quiet/JSON output, so stdout can carry a clean machine-readable
 * payload (a JSON summary, an NDJSON stream) without chatter mixed in.
 *
 * Errors should keep using `console.error` directly — they go to stderr and
 * stay visible even in quiet/JSON mode, which is what a CI log wants.
 *
 * Colour is handled by chalk itself: it auto-disables when stdout is not a TTY
 * (i.e. when piped) and honours the `NO_COLOR` / `FORCE_COLOR` env vars, so we
 * don't gate colour here.
 */
let quiet = false;

export function setQuiet(v: boolean): void { quiet = v; }
export function isQuiet(): boolean { return quiet; }

/** Decorative stdout line — suppressed under --quiet / --json. */
export function info(msg = ''): void {
  if (!quiet) { console.log(msg); }
}
