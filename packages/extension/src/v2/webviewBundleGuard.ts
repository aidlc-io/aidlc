/**
 * Fallback HTML for when a webview bundle is missing on disk.
 *
 * Why: webview bundles (`out/webviews/*.js`) are built by Vite, not tsc. If
 * `clean:out` runs and then only `tsc` re-runs (e.g. via `pnpm watch`), the
 * extension loads but the React bundle never gets emitted — the panel
 * renders as an empty black screen with no log. This guard returns a
 * friendly instructions page instead so the cause is obvious.
 */

import * as fs from 'fs';
import * as path from 'path';

export function missingBundleHtml(
  extensionFsPath: string,
  bundleName: string,
  cspSource: string,
  nonce: string,
): string | null {
  const bundlePath = path.join(extensionFsPath, 'out', 'webviews', bundleName);
  if (fs.existsSync(bundlePath)) { return null; }
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none';
           style-src ${cspSource} 'unsafe-inline';
           script-src 'nonce-${nonce}';">
<title>AIDLC — webview bundle missing</title>
<style nonce="${nonce}">
  body { font-family: var(--vscode-font-family); padding: 24px; color: var(--vscode-foreground); line-height: 1.5; }
  h1 { font-size: 1.05rem; margin: 0 0 12px; }
  code { background: var(--vscode-textCodeBlock-background); padding: 2px 6px; border-radius: 3px; font-family: var(--vscode-editor-font-family); }
  ul { padding-left: 20px; }
  .hint { opacity: 0.7; margin-top: 16px; font-size: 0.9em; }
</style>
</head>
<body>
<h1>AIDLC webview bundle missing</h1>
<p>The compiled bundle <code>out/webviews/${bundleName}</code> wasn't found, so the React UI can't mount.</p>
<p>Rebuild it from the repo root with one of:</p>
<ul>
  <li><code>pnpm --filter aidlc bundle:webviews</code> — one-shot Vite build</li>
  <li><code>pnpm --filter aidlc watch</code> — tsc + Vite watch in parallel (recommended for dev)</li>
</ul>
<p class="hint">This typically happens after <code>pnpm clean:out</code> or when only <code>tsc</code> ran. Reload the VS Code window once the rebuild finishes.</p>
</body>
</html>`;
}
