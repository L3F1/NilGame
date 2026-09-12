import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBatch, validRelative, wslPath, scopeVerdict, runProcess, supervise, claudeOutcome, resolveCodex } from './tools/agent-bridge.js';
let passed = 0, failed = 0;
async function check(name, fn) { try { await fn(); passed++; } catch (e) { failed++; console.error(name, e); } }
const scratch = path.join(path.dirname(fileURLToPath(import.meta.url)), '.agent-bridge');
fs.mkdirSync(scratch, { recursive: true });
const temp = fs.mkdtempSync(path.join(scratch, 'test-'));
const task = { id: 'test', agent: 'muse', instruction: 'audit', allowedFiles: ['report.md'], report: 'report.md' };
try {
  await check('reject traversal, options and unsupported dispatch', () => {
    for (const file of ['../escape', '/absolute', 'C:/escape', '.git/config', 'x/.git/y', '--output', 'x\\y', 'x\ny'])
      assert.equal(validRelative(file), false, file);
    assert.equal(validRelative('docs/qa/report.md'), true);
    assert.throws(() => validateBatch({ version: 1, tasks: [{ ...task, agent: 'shell' }] }));
    assert.throws(() => validateBatch({ version: 1, tasks: [task, task] }));
    assert.throws(() => validateBatch({ version: 1, tasks: [{ ...task, report: 'other.md' }] }));
    assert.equal(validateBatch({ version: 1, tasks: [task] }).tasks[0], task);
  });
  await check('WSL path conversion preserves spaces and rejects relative roots', () => {
    assert.equal(wslPath('C:\\Users\\Some Name\\repo'), '/mnt/c/Users/Some Name/repo');
    assert.throws(() => wslPath('../repo'));
  });
  await check('out-of-scope output cannot be called scoped', () => {
    assert.deepEqual(scopeVerdict(['report.md', 'engine/changed.js'], ['report.md']),
      { scopeOK: false, unexpected: ['engine/changed.js'] });
    assert.equal(scopeVerdict(['report.md'], ['report.md']).scopeOK, true);
  });
  await check('provider error inside a successful-looking JSON result remains failure', () => {
    const measured = claudeOutcome(JSON.stringify({type:'result',num_turns:80,total_cost_usd:7.31,
      usage:{output_tokens:75057,cache_read_input_tokens:7827424,cache_creation_input_tokens:151783}}));
    assert.deepEqual(measured.usage, {turns:80,outputTokens:75057,cacheReadTokens:7827424,
      cacheWriteTokens:151783,estimatedCostUSD:7.31});
    assert.equal(claudeOutcome('{"type":"result","subtype":"success","is_error":true,"terminal_reason":"api_error"}').isError, true);
    assert.equal(claudeOutcome('{"type":"result","is_error":false,"result":"done"}').isError, false);
    assert.equal(claudeOutcome('not JSON').isError, true);
    assert.equal(claudeOutcome('{}').isError, true);
  });
  await check('Codex discovery follows the installed version and rejects path escape', () => {
    const dir = path.join(temp, 'extensions'); fs.mkdirSync(dir);
    const file = path.join(dir, 'extensions.json');
    const save = name => fs.writeFileSync(file, JSON.stringify([{ identifier: { id: 'openai.chatgpt' }, relativeLocation: name }]));
    save('openai.chatgpt-new');
    assert.equal(resolveCodex({ codex: 'auto', vscodeExtensions: dir }), path.join(dir, 'openai.chatgpt-new/bin/windows-x86_64/codex.exe'));
    save('../outside'); assert.throws(() => resolveCodex({ codex: 'auto', vscodeExtensions: dir }));
    assert.equal(resolveCodex({ codex: 'explicit.exe' }), 'explicit.exe');
  });
  await check('subprocess argv is data, with stdout and clean completion', async () => {
    const marker = 'literal; $(echo wrong) & "quoted"';
    const result = await runProcess(process.execPath, ['-e', 'console.log(process.argv[1])', marker],
      { cwd: temp, prefix: path.join(temp, 'success'), timeoutMs: 5000 });
    assert.equal(result.exitCode, 0); assert.equal(result.error, null);
    assert.ok(result.tail.includes(marker)); assert.equal(result.timedOut, false);
  });
  await check('early error and process exit are reported, not success', async () => {
    const result = await runProcess(process.execPath, ['-e', 'console.error("failed"); process.exit(7)'],
      { cwd: temp, prefix: path.join(temp, 'failure'), timeoutMs: 5000 });
    assert.equal(result.exitCode, 7);
    const missing = await runProcess(path.join(temp, 'missing-agent.exe'), [],
      { cwd: temp, prefix: path.join(temp, 'missing'), timeoutMs: 5000 });
    assert.ok(missing.error); assert.equal(missing.exitCode, null);
  });
  await check('timeout stops only the launched process and reports refusal', async () => {
    const result = await runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'],
      { cwd: temp, prefix: path.join(temp, 'timeout'), timeoutMs: 200 });
    assert.equal(result.timedOut, true); assert.notEqual(result.exitCode, 0);
  });
  await check('exactly one read-only callback after both outcomes, including a failure', async () => {
    const order = [], dir = path.join(temp, 'callback'); fs.mkdirSync(dir);
    const batch = { tasks: [task, { ...task, id: 'second', agent: 'claude' }] };
    const result = await supervise(dir, { codex: 'fake-codex' }, batch, {
      review: true,
      taskRunner: async assigned => {
        await new Promise(resolve => setTimeout(resolve, assigned.id === 'test' ? 30 : 1));
        order.push(assigned.id);
        return { id: assigned.id, status: assigned.id === 'test' ? 'failed' : 'awaiting-review' };
      },
      processRunner: async (command, args, opts) => {
        assert.deepEqual(order, ['second', 'test']); order.push('review');
        assert.equal(command, 'fake-codex');
        assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
        assert.ok(opts.input.includes('do not modify files'));
        fs.writeFileSync(path.join(dir, 'astra-review.md'), 'One blocked, one unreviewed.');
        return { exitCode: 0, error: null, timedOut: false };
      },
    });
    assert.equal(result.status, 'review-finished');
    assert.deepEqual(order, ['second', 'test', 'review']);
    assert.equal(result.tasks[0].status, 'failed');
  });
  await check('callback failure stays visible, no automatic retry', async () => {
    const dir = path.join(temp, 'callback-failure'); fs.mkdirSync(dir); let calls = 0;
    const result = await supervise(dir, { codex: 'fake' }, { tasks: [task] }, {
      review: true, taskRunner: async () => ({ status: 'awaiting-review' }),
      processRunner: async () => { calls++; return { exitCode: 1, error: 'auth required' }; },
    });
    assert.equal(result.status, 'review-needs-attention'); assert.equal(calls, 1);
  });
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
console.log(`agent bridge: ${passed}/${passed + failed}`);
if (failed) process.exitCode = 1;
