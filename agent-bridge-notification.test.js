// Execute the extension against a fake VS Code host; no editor or models needed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const source = fs.readFileSync('tools/vscode-agent-bridge/extension.cjs', 'utf8');
async function probe(status, tasks, reviewRequested = false) {
  const folder = { uri: { fsPath: process.cwd() } };
  const dir = path.join(process.cwd(), '.agent-bridge', 'runs', 'test-notification');
  const messages = [], saved = new Map(), changes = [];
  const context = { subscriptions: [], workspaceState: {
    get: key => saved.get(key), update: async (key, value) => saved.set(key, value),
  } };
  const vscode = {
    StatusBarAlignment: { Left: 1 },
    window: { createStatusBarItem: () => ({ show() {} }),
      showInformationMessage: async message => { messages.push(message); } },
    commands: { registerCommand() {} }, RelativePattern: class {},
    workspace: { isTrusted: true, workspaceFolders: [folder],
      createFileSystemWatcher: () => ({ onDidCreate() {}, onDidChange(fn) { changes.push(fn); } }) },
  };
  const fakeFs = { readFileSync: file => JSON.stringify(file.endsWith('latest.json')
    ? { id: 'test', dir } : { status, tasks, reviewRequested }) };
  const sandbox = { module: { exports: {} }, require: name =>
    ({ vscode, 'node:fs': fakeFs, 'node:path': path })[name] };
  vm.runInNewContext(source, sandbox);
  sandbox.module.exports.activate(context);
  await new Promise(resolve => setImmediate(resolve));
  for (const change of changes) await change();
  return messages;
}
assert.deepEqual(await probe('running', []), []);
const delivered = await probe('tasks-finished', [{ status: 'awaiting-review' }, { status: 'awaiting-review' }]);
assert.equal(delivered.length, 1, 'completion must notify once, without automatic review');
assert.match(delivered[0], /await lead review/);
const failed = await probe('tasks-finished', [{ status: 'awaiting-review' }, { status: 'needs-attention' }]);
assert.equal(failed.length, 1); assert.match(failed[0], /failures or blocked/);
assert.deepEqual(await probe('tasks-finished', [], true), []);
assert.match((await probe('review-finished', [], true))[0], /automatic Astra review is ready/);
console.log('5/5 notification scenarios passed (including repeated file events)');
