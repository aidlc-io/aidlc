/**
 * AIDLC Monitor — status bar surface + command wiring for agent observability
 * via agents-observe (https://github.com/simple10/agents-observe).
 *
 * Integration is strictly optional: when the observe server is off, the status
 * bar quietly shows "Monitor: off" and polling fails silently (no popups).
 * Polling pauses while the VS Code window is unfocused to avoid needless
 * background requests.
 *
 * Clicking the item opens the unified Monitor panel (Token Usage / Agents).
 */
import * as vscode from 'vscode';

import { MonitorWebview } from './monitorWebview';
import { fetchObserveStatus, offlineStatus, type ObserveStatus } from './observeClient';

const OPEN_COMMAND = 'aidlc.openMonitor';

export function registerAidlcMonitor(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  extensionUri: vscode.Uri,
): void {
  const cfg = () => vscode.workspace.getConfiguration('aidlc.monitor');

  // The command is always registered (so the palette / status-bar button work
  // even when the polling surface is disabled).
  context.subscriptions.push(
    vscode.commands.registerCommand(OPEN_COMMAND, () => {
      MonitorWebview.show(extensionUri, 'agents');
    }),
  );

  if (!cfg().get<boolean>('enabled', true)) {
    output.appendLine('AIDLC Monitor status bar disabled by setting (aidlc.monitor.enabled).');
    return;
  }

  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
  item.text = '🔍 Monitor';
  item.tooltip = 'AIDLC Monitor — agent observability';
  item.command = OPEN_COMMAND;
  item.show();
  context.subscriptions.push(item);

  let inFlight = false;
  let focused = vscode.window.state.focused;

  const render = (status: ObserveStatus): void => {
    if (!status.serverUp) {
      item.text = '🔍 Monitor: off';
      item.tooltip = 'agents-observe server not running — click to open Monitor';
      return;
    }
    const n = status.activeConsumers;
    item.text = n != null && n > 0 ? `🔍 ${n} live` : '🔍 Monitor';
    const md = new vscode.MarkdownString();
    md.appendMarkdown('### AIDLC Monitor\n\n');
    md.appendMarkdown(`Live sessions: ${status.activeConsumers ?? '—'}\n\n`);
    md.appendMarkdown(`Sessions (total): ${status.sessionCount ?? '—'}\n\n`);
    md.appendMarkdown(`Events: ${status.eventCount ?? '—'}\n\n`);
    md.appendMarkdown(`Dashboard tabs: ${status.activeClients ?? '—'}\n\n`);
    md.appendMarkdown('_click to open the Monitor_');
    item.tooltip = md;
  };

  const refresh = async (): Promise<void> => {
    if (inFlight || !focused) return;
    inFlight = true;
    try {
      render(await fetchObserveStatus());
    } catch {
      // Fail silent — server off is the normal case, not an error.
      render(offlineStatus());
    } finally {
      inFlight = false;
    }
  };

  void refresh();

  const intervalSec = Math.max(5, cfg().get<number>('pollIntervalSeconds', 10));
  const timer = setInterval(() => { void refresh(); }, intervalSec * 1000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });

  // Pause polling while the window is unfocused; refresh immediately on regain.
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((e) => {
      focused = e.focused;
      if (focused) void refresh();
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('aidlc.monitor')) return;
      void vscode.window
        .showInformationMessage('AIDLC Monitor settings changed. Reload window to apply.', 'Reload Window')
        .then((pick) => {
          if (pick === 'Reload Window') void vscode.commands.executeCommand('workbench.action.reloadWindow');
        });
    }),
  );

  output.appendLine(`AIDLC Monitor enabled (poll every ${intervalSec}s).`);
}
