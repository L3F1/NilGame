const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');

function latest(folder) {
  const root = path.join(folder.uri.fsPath, '.agent-bridge');
  const pointer = JSON.parse(fs.readFileSync(path.join(root, 'latest.json'), 'utf8'));
  const relative = path.relative(path.join(root, 'runs'), pointer.dir);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid bridge run path');
  return { ...pointer, summary: JSON.parse(fs.readFileSync(path.join(pointer.dir, 'summary.json'), 'utf8')) };
}
function activate(context) {
  if (!vscode.workspace.isTrusted) return;
  const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  bar.command = 'nilgame.bridge.status';
  context.subscriptions.push(bar);
  let current;
  const open = async name => {
    if (!current) return vscode.window.showInformationMessage('No NilGame bridge run yet.');
    const file = path.join(current.dir, name);
    if (!fs.existsSync(file)) return vscode.window.showInformationMessage('The automatic review is not available yet.');
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(file)));
  };
  const refresh = async () => {
    for (const folder of vscode.workspace.workspaceFolders || []) {
      try {
        current = latest(folder);
        bar.text = `$(organization) Agents: ${current.summary.status}`;
        bar.tooltip = 'Claude / Muse bridge — click for status'; bar.show();
        const tasksDone = current.summary.status === 'tasks-finished' && !current.summary.reviewRequested;
        if (tasksDone || ['review-finished', 'review-needs-attention'].includes(current.summary.status)) {
          const key = `${current.id}:${current.summary.status}`;
          if (context.workspaceState.get('lastNotification') !== key) {
            await context.workspaceState.update('lastNotification', key);
            const tasks = current.summary.tasks || [];
            const clean = tasks.length > 0 && tasks.every(task => task.status === 'awaiting-review');
            const message = tasksDone
              ? (clean ? 'NilGame: all assigned agents have finished. Results await lead review.'
                : 'NilGame: agent run finished with failures or blocked work. Open status for details.')
              : (current.summary.status === 'review-finished' ? 'NilGame: automatic Astra review is ready.' : 'NilGame: automatic review needs attention.');
            const choice = await vscode.window.showInformationMessage(message,
              ...(tasksDone ? ['Open Status'] : ['Open Review', 'Open Status']));
            if (choice) await open(choice === 'Open Review' ? 'astra-review.md' : 'summary.json');
          }
        }
        return;
      } catch { /* no run, or writer has not finished publishing it */ }
    }
  };
  context.subscriptions.push(vscode.commands.registerCommand('nilgame.bridge.status', () => open('summary.json')));
  context.subscriptions.push(vscode.commands.registerCommand('nilgame.bridge.review', () => open('astra-review.md')));
  for (const folder of vscode.workspace.workspaceFolders || []) {
    for (const pattern of ['.agent-bridge/latest.json', '.agent-bridge/runs/*/summary.json']) {
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, pattern));
      context.subscriptions.push(watcher, watcher.onDidCreate(refresh), watcher.onDidChange(refresh));
    }
  }
  void refresh();
}
module.exports = { activate };
