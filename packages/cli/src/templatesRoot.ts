import * as fs from 'fs';
import * as path from 'path';
import { builtinTemplatesRoot } from '@aidlc/core';

/**
 * Locate the bundled `templates/` for built-in workflows. In the published CLI
 * the entry is an esbuild bundle (`dist/bundle.js`) with @aidlc/core inlined,
 * so core's `builtinTemplatesRoot()` (which keys off its own `__dirname`)
 * resolves to the CLI bundle dir, not core — the `bundle` script copies the
 * templates to `dist/templates` for exactly this case. In a dev / `tsc` run
 * core is a real node_modules dep, so its resolver works.
 */
export function cliTemplatesRoot(): string {
  const bundled = __dirname; // dist/ when running the esbuild bundle
  if (fs.existsSync(path.join(bundled, 'templates', 'sdlc'))) { return bundled; }
  return builtinTemplatesRoot();
}
