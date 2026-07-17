/**
 * SDLC compliance-standard picker — a webview panel (GH-69 P3).
 *
 * Opened by `aidlc.selectStandard` (sidebar ⚖️ button / command palette). Shows
 * the built-in profiles as cards; clicking one writes the top-level `standard:`
 * key to `.aidlc/workspace.yaml`. The workspace.yaml watcher set up in
 * `activate()` refreshes the sidebar automatically.
 *
 * Modeled on {@link TokenReportWebview}: single-instance per window, same CSP +
 * nonce + asset-URI boilerplate, host↔webview via postMessage.
 */
import * as vscode from 'vscode';

import { builtinProfiles, workspaceStandard } from '@aidlc/core';

import { themeManager } from './themeManager';
import { missingBundleHtml } from './webviewBundleGuard';
import { readYaml, writeYaml } from './yamlIO';

interface ProfileVM {
  id: string;
  name: string;
  description: string;
  anchors: Array<[string, string]>;
  enforce: boolean;
  rules: string[];
}

interface StandardPickerState {
  profiles: ProfileVM[];
  current: string;
  justApplied?: string;
}

function buildProfiles(): ProfileVM[] {
  return builtinProfiles().map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    anchors: Object.entries(p.anchors),
    enforce: p.traceability.enforce,
    rules: p.traceability.rules,
  }));
}

export class StandardPickerWebview {
  public static readonly viewType = 'aidlcStandardPicker';
  private static current: StandardPickerWebview | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private state: StandardPickerState;

  static show(extensionUri: vscode.Uri): void {
    if (StandardPickerWebview.current) {
      StandardPickerWebview.current.reload();
      StandardPickerWebview.current.panel.reveal(vscode.ViewColumn.Active);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      StandardPickerWebview.viewType,
      'SDLC Standard',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    );
    StandardPickerWebview.current = new StandardPickerWebview(panel, extensionUri);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
  ) {
    this.state = { profiles: buildProfiles(), current: this.readCurrent() };
    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg), null, this.disposables);
    this.disposables.push(themeManager.register(this.panel.webview));
  }

  private root(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private readCurrent(): string {
    const root = this.root();
    if (!root) { return 'none'; }
    try {
      const doc = readYaml(root);
      return doc ? workspaceStandard(doc as { standard?: unknown }) : 'none';
    } catch {
      return 'none';
    }
  }

  /** Re-read the active standard from disk (e.g. after a hand-edit) and repaint. */
  private reload(): void {
    this.state = { profiles: buildProfiles(), current: this.readCurrent() };
    this.refresh();
  }

  private refresh(): void {
    void this.panel.webview.postMessage({ type: 'state', state: this.state });
  }

  private async handleMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
    switch (msg.type) {
      case 'ready':
        this.refresh();
        return;
      case 'select': {
        const id = typeof msg.id === 'string' ? msg.id : '';
        if (!id) { return; }
        await this.applyStandard(id);
        return;
      }
      case 'setTheme': {
        const mode = String(msg.mode ?? '');
        if (mode === 'auto' || mode === 'light' || mode === 'dark') {
          await themeManager.set(mode);
        }
        return;
      }
    }
  }

  private async applyStandard(id: string): Promise<void> {
    const root = this.root();
    if (!root) {
      void vscode.window.showWarningMessage('AIDLC: Open a project first to choose its SDLC standard.');
      return;
    }
    const doc = readYaml(root);
    if (!doc) {
      void vscode.window.showWarningMessage(
        'AIDLC: No workspace.yaml — load a template or init a workspace first.',
      );
      return;
    }
    if (workspaceStandard(doc as { standard?: unknown }) === id) {
      this.state = { ...this.state, current: id, justApplied: id };
      this.refresh();
      return;
    }
    doc.standard = id;
    try {
      writeYaml(root, doc);
    } catch (e) {
      void vscode.window.showErrorMessage(
        `AIDLC: could not write standard to workspace.yaml — ${e instanceof Error ? e.message : String(e)}`,
      );
      return;
    }
    this.state = { ...this.state, current: id, justApplied: id };
    this.refresh();
    void vscode.window.showInformationMessage(`AIDLC: SDLC standard set to "${id}".`);
  }

  private dispose(): void {
    StandardPickerWebview.current = undefined;
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) { d.dispose(); }
    }
  }

  private getHtml(): string {
    const nonce = makeNonce();
    const webview = this.panel.webview;
    const cspSource = webview.cspSource;
    const fallback = missingBundleHtml(this.extensionUri.fsPath, 'standardPicker.js', cspSource, nonce);
    if (fallback) { return fallback; }
    const initialTheme = themeManager.current;
    const assetsRoot = vscode.Uri.joinPath(this.extensionUri, 'out', 'webviews');
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'styles.css')).toString();
    const entryUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'standardPicker.js')).toString();

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none';
           img-src ${cspSource} https: data:;
           font-src ${cspSource} https: data:;
           style-src ${cspSource} 'unsafe-inline';
           script-src 'nonce-${nonce}' ${cspSource};">
<title>SDLC Standard</title>
<link rel="stylesheet" href="${cssUri}">
</head>
<body>
<div id="app"></div>
<script nonce="${nonce}">
window.__AIDLC_INITIAL_STATE__ = ${JSON.stringify(this.state)};
window.__AIDLC_INITIAL_THEME__ = ${JSON.stringify(initialTheme)};
</script>
<script type="module" nonce="${nonce}" src="${entryUri}"></script>
</body>
</html>`;
  }
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) { out += chars[Math.floor(Math.random() * chars.length)]; }
  return out;
}
