/**
 * Git-based identity for multi-user, git-shared workspaces.
 *
 * AIDLC's multi-user model (Option A) deliberately avoids a login system: the
 * "who" of every approve / reject / claim is simply the committer's
 * `git config user.email`, which travels with the commit anyway. This module
 * reads that identity with a hostname fallback, mirroring the convention
 * already used by `tools/epic-memory.mjs` so attribution is consistent across
 * the codebase.
 *
 * Pure-ish: shells out to `git`, but never throws — a missing `git`, a repo
 * without an identity configured, or a timeout all degrade to the hostname so
 * callers can always attribute *something*.
 */

import { execFileSync } from 'child_process';
import * as os from 'os';

export interface GitIdentity {
  /** `git config user.name`, or '' when unset. */
  name: string;
  /** Lower-cased `git config user.email`, or '' when unset. */
  email: string;
  /**
   * Display form: `Name <email>`, or just one part when the other is missing,
   * or the hostname when git has no identity at all. Never empty.
   */
  label: string;
}

function gitConfig(key: string, cwd: string): string {
  try {
    return execFileSync('git', ['config', key], {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

/**
 * Extract a lower-cased email from an identity label. Accepts the
 * `Name <email>` form written by {@link resolveGitIdentity}, a bare email, or
 * an auto-approve-suffixed label (`Name <email> (auto-approve)`). Returns '' if
 * no email-looking token is present (e.g. a hostname fallback).
 */
export function emailFromLabel(label: string): string {
  if (!label) { return ''; }
  const angle = /<([^>]+)>/.exec(label);
  const candidate = (angle ? angle[1] : label).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+$/.test(candidate) ? candidate : '';
}

/**
 * Resolve the current git identity for `cwd`. Always returns a usable object;
 * `label` falls back to the machine hostname when git has no name/email.
 */
export function resolveGitIdentity(cwd: string = process.cwd()): GitIdentity {
  const name = gitConfig('user.name', cwd);
  const email = gitConfig('user.email', cwd).toLowerCase();
  let label: string;
  if (name && email) {
    label = `${name} <${email}>`;
  } else if (email) {
    label = email;
  } else if (name) {
    label = name;
  } else {
    label = os.hostname();
  }
  return { name, email, label };
}
