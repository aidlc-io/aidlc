/**
 * PATH augmentation for child processes the extension spawns (`claude`, `gh`, …).
 *
 * When VS Code is launched from the macOS Dock / Finder (rather than from a
 * terminal via `code .`), the extension host inherits a minimal PATH that does
 * NOT include the shell-profile additions where CLIs actually live
 * (`/opt/homebrew/bin`, npm/nvm bins, the Claude Code installer's dirs, …). So
 * `execFile('claude', …)` fails with `ENOENT` and the UI reports
 * "`claude` not found on PATH" even though the user added it to their PATH and
 * it works fine in a terminal (issue #81).
 *
 * We can't cheaply reconstruct the user's full login-shell PATH without sourcing
 * a potentially slow `.zshrc`, so we append the common install locations. These
 * cover Homebrew, the Claude Code native installer (`~/.local/bin`,
 * `~/.claude/local`), and manual `/usr/local/bin` installs.
 */

/** Common install dirs missing from the Dock-launched extension host's PATH. */
export function extraBinDirs(home = process.env.HOME ?? ''): string[] {
  const dirs = ['/opt/homebrew/bin', '/usr/local/bin'];
  if (home) { dirs.push(`${home}/.local/bin`, `${home}/.claude/local`); }
  return dirs;
}

/**
 * Return a copy of `base` whose PATH has the common install dirs appended
 * (deduped, existing entries kept first so the user's PATH still wins).
 */
export function augmentedEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const existing = (base.PATH ?? '').split(':').filter(Boolean);
  const seen = new Set(existing);
  const merged = [...existing];
  for (const dir of extraBinDirs(base.HOME ?? process.env.HOME ?? '')) {
    if (!seen.has(dir)) { seen.add(dir); merged.push(dir); }
  }
  return { ...base, PATH: merged.join(':') };
}
