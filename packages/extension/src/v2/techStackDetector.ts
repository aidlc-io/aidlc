/**
 * Heuristic tech-stack detector for a workspace root.
 *
 * Scans common manifest files / project layouts and returns an array of
 * stack ids. The renderer in `templateRenderer.ts` uses the result to strip
 * `{{#if <stack>}}…{{/if}}` blocks from skill templates so the user only
 * sees sections relevant to their project.
 *
 * Stack ids (kept small + orthogonal):
 *   - `web`      — browser UI (React / Vue / Angular / Svelte / Next / Nuxt / …)
 *   - `mobile`   — iOS / Android native or cross-platform (RN / Expo / Flutter)
 *   - `desktop`  — Electron / Tauri / WPF / native macOS
 *   - `backend`  — server / API / service (Node / Go / Rust / Java / .NET / Python)
 *   - `cli`      — CLI program (package.json bin / Cargo `[[bin]]` / Go main)
 *
 * False-positive cost is low (the agent gets one extra matrix row); false
 * negatives cost the user the same wall of text they're complaining about,
 * so when uncertain we include the stack rather than drop it.
 */

import * as fs from 'fs';
import * as path from 'path';

export type TechStack = 'web' | 'mobile' | 'desktop' | 'backend' | 'cli';
export const ALL_STACKS: readonly TechStack[] = ['web', 'mobile', 'desktop', 'backend', 'cli'];

/**
 * Inspect `root` for known stack indicators. Returns the union of detected
 * stacks (empty when nothing recognizable is found — callers should treat
 * "[]" as "unknown" and either prompt the user or fall back to all stacks).
 */
export function detectTechStack(root: string): TechStack[] {
  if (!root || !fs.existsSync(root)) { return []; }
  const stacks = new Set<TechStack>();

  // package.json — the densest signal for JS / TS projects.
  try {
    const pkgPath = path.join(root, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
      const deps: Record<string, string> = {
        ...(pkg.dependencies as Record<string, string> | undefined),
        ...(pkg.devDependencies as Record<string, string> | undefined),
        ...(pkg.peerDependencies as Record<string, string> | undefined),
      };
      const has = (id: string): boolean => Object.prototype.hasOwnProperty.call(deps, id);

      if (
        has('react') || has('vue') || has('svelte') || has('next') || has('nuxt') ||
        has('@angular/core') || has('solid-js') || has('@builder.io/qwik') || has('astro') ||
        has('@remix-run/react') || has('@sveltejs/kit') || has('vite') || has('webpack')
      ) { stacks.add('web'); }

      if (has('react-native') || has('expo')) { stacks.add('mobile'); }

      if (has('electron') || has('@tauri-apps/api')) { stacks.add('desktop'); }

      if (
        has('express') || has('fastify') || has('koa') || has('@nestjs/core') ||
        has('hapi') || has('@hapi/hapi') || has('hono') || has('h3') || has('elysia')
      ) { stacks.add('backend'); }

      if (pkg.bin && (typeof pkg.bin === 'string' || typeof pkg.bin === 'object')) {
        stacks.add('cli');
      }
    }
  } catch {
    // Malformed package.json — skip the dep-based signals.
  }

  // Mobile-native indicators (independent of package.json so Flutter /
  // pure-iOS / pure-Android projects still register).
  if (
    fs.existsSync(path.join(root, 'pubspec.yaml')) ||
    fs.existsSync(path.join(root, 'ios')) ||
    fs.existsSync(path.join(root, 'android'))
  ) { stacks.add('mobile'); }
  if (anyFileMatches(root, /\.xcodeproj$/) || anyFileMatches(root, /\.xcworkspace$/)) {
    stacks.add('mobile');
  }

  // Desktop-native indicators.
  if (anyFileMatches(root, /\.xcodeproj$/) && fs.existsSync(path.join(root, 'macos'))) {
    stacks.add('desktop');
  }
  if (anyChildMatches(root, /\.(?:csproj|sln)$/)) { stacks.add('backend'); }

  // Backend by language: presence of a non-JS manifest is a strong signal.
  if (fs.existsSync(path.join(root, 'go.mod'))) {
    stacks.add('backend');
    // `cmd/<name>/main.go` layout → also a CLI.
    if (fs.existsSync(path.join(root, 'cmd'))) { stacks.add('cli'); }
  }
  if (fs.existsSync(path.join(root, 'Cargo.toml'))) {
    stacks.add('backend');
    try {
      const cargo = fs.readFileSync(path.join(root, 'Cargo.toml'), 'utf8');
      if (/\[\[bin]]/m.test(cargo)) { stacks.add('cli'); }
    } catch { /* ignore */ }
  }
  if (
    fs.existsSync(path.join(root, 'pom.xml')) ||
    fs.existsSync(path.join(root, 'build.gradle')) ||
    fs.existsSync(path.join(root, 'build.gradle.kts'))
  ) { stacks.add('backend'); }
  if (
    fs.existsSync(path.join(root, 'requirements.txt')) ||
    fs.existsSync(path.join(root, 'pyproject.toml')) ||
    fs.existsSync(path.join(root, 'Pipfile'))
  ) { stacks.add('backend'); }

  return Array.from(stacks);
}

/**
 * True when any direct child of `dir` matches `pattern`. Cheap shallow scan
 * — we don't recurse so a deeply-nested fixture project doesn't poison the
 * detection.
 */
function anyChildMatches(dir: string, pattern: RegExp): boolean {
  try {
    return fs.readdirSync(dir).some((name) => pattern.test(name));
  } catch {
    return false;
  }
}

/** Same as `anyChildMatches`, kept separate so future calls can refine
 *  selection (e.g. skip when also nested deep). */
function anyFileMatches(dir: string, pattern: RegExp): boolean {
  return anyChildMatches(dir, pattern);
}

/**
 * Detect a finer-grained framework key for a given primary stack, used to
 * select a framework-specialized artifact template (`implement.web-react.md`)
 * ahead of the coarse bucket (`implement.web.md`).
 *
 * Deliberately narrow — only the few "hot" frameworks that ship a specialized
 * template today. Returns `null` when nothing more specific than the bucket is
 * recognized (caller falls back to the coarse template). Add a case here only
 * alongside a matching `<phase>.<primary>-<framework>.md` template.
 */
export function detectPrimaryFramework(root: string, primary: string | null): string | null {
  if (!root || !primary || !fs.existsSync(root)) { return null; }

  let deps: Record<string, string> = {};
  try {
    const pkgPath = path.join(root, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
      deps = {
        ...(pkg.dependencies as Record<string, string> | undefined),
        ...(pkg.devDependencies as Record<string, string> | undefined),
        ...(pkg.peerDependencies as Record<string, string> | undefined),
      };
    }
  } catch {
    return null;
  }
  const has = (id: string): boolean => Object.prototype.hasOwnProperty.call(deps, id);

  switch (primary) {
    case 'web':
      // React family (incl. Next.js / Remix) → the react template.
      if (has('react') || has('next') || has('@remix-run/react')) { return 'react'; }
      return null;
    case 'backend':
      // JS/TS HTTP frameworks → the node template.
      if (
        has('express') || has('fastify') || has('koa') || has('@nestjs/core') ||
        has('hapi') || has('@hapi/hapi') || has('hono') || has('h3') || has('elysia')
      ) { return 'node'; }
      return null;
    default:
      return null;
  }
}

/**
 * Build the ordered, most-specific-first artifact-template lookup keys for a
 * project: `['web-react', 'web']` when a React web app, `['web']` for a
 * non-React web app, `[]` when no stack is known. The matching `core`
 * `getBuiltinArtifactTemplates` tries each in turn, then the generic file.
 */
export function artifactLookupKeys(root: string, primary: string | null): string[] {
  if (!primary) { return []; }
  const fw = detectPrimaryFramework(root, primary);
  return fw ? [`${primary}-${fw}`, primary] : [primary];
}
