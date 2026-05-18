/**
 * `aidlc.uninstallWorkflowGlobals` — multi-pick UI to remove built-in
 * workflows' agents + skills from `~/.claude/agents/` and `~/.claude/skills/`.
 *
 * Only files still carrying the AIDLC marker are removed — user-edited or
 * replaced files are preserved.
 *
 * Recommended to run *before* uninstalling the extension since VS Code has
 * no reliable "on uninstall" hook (deactivate() also fires on window close
 * / disable / reload).
 */

import * as vscode from 'vscode';

import { BUILTIN_WORKFLOWS } from './builtinPresets';
import {
  isWorkflowGloballyInstalled,
  uninstallWorkflowGlobalsByIds,
} from './globalDefaultsInstaller';
import { WorkspaceWebview } from './workspaceWebview';

export async function uninstallWorkflowGlobalsCommand(
  extensionPath: string,
  output: vscode.OutputChannel,
): Promise<void> {
  interface WorkflowPickItem extends vscode.QuickPickItem {
    workflowId: string;
  }

  const installed = BUILTIN_WORKFLOWS.filter((w) =>
    isWorkflowGloballyInstalled(extensionPath, w.id),
  );
  if (installed.length === 0) {
    void vscode.window.showInformationMessage(
      'AIDLC: no workflow agents / skills installed in ~/.claude/. Nothing to uninstall.',
    );
    return;
  }

  const items: WorkflowPickItem[] = installed.map((w) => ({
    label: w.name,
    description: '$(check) installed',
    detail: w.description,
    workflowId: w.id,
    picked: true,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder:
      'Pick workflows to remove from ~/.claude/agents and ~/.claude/skills (only files we installed are removed)',
    ignoreFocusOut: true,
    matchOnDetail: true,
    title: 'Uninstall Workflow Globals',
  });
  if (!picked || picked.length === 0) { return; }

  const ids = picked.map((p) => p.workflowId);
  const names = ids
    .map((id) => BUILTIN_WORKFLOWS.find((w) => w.id === id)?.name ?? id)
    .join(', ');
  const confirm = await vscode.window.showWarningMessage(
    `Remove agent + skill files for: ${names}?\n\n` +
      'Only files written by the AIDLC extension are removed. Anything you edited or replaced is kept.',
    { modal: false },
    'Remove', 'Cancel',
  );
  if (confirm !== 'Remove') { return; }

  const reports = uninstallWorkflowGlobalsByIds(ids, (m) => output.appendLine(m));
  const totalRemoved = reports.reduce((acc, r) => acc + r.removed.length, 0);
  const totalSkipped = reports.reduce((acc, r) => acc + r.skipped.length, 0);
  const skippedNote = totalSkipped > 0
    ? ` (skipped ${totalSkipped} user-edited file${totalSkipped === 1 ? '' : 's'})`
    : '';
  void vscode.window.showInformationMessage(
    `AIDLC: removed ${totalRemoved} file${totalRemoved === 1 ? '' : 's'} for ${names}${skippedNote}.`,
  );
  // Refresh the Builder so the Domain dropdown drops the just-removed
  // workflows immediately.
  WorkspaceWebview.refreshCurrent();
}
