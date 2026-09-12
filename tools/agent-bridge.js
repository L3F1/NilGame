// Bounded external-agent orchestration. No HTTP listener, UI injection, merge,
// permission bypass or recursive agent dispatch. All subprocess argv are arrays.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = path.join(ROOT, '.agent-bridge');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temp, file);
};
export function validRelative(file) {
  return typeof file === 'string' && file.length > 0 &&
    !file.startsWith('-') && !/[\\:\0\r\n]/.test(file) &&
    file.split('/').every(p => p && p !== '.' && p !== '..' && !p.startsWith('.git'));
}
export function validateBatch(batch) {
  if (batch?.version !== 1 || !Array.isArray(batch.tasks) || !batch.tasks.length || batch.tasks.length > 2)
    throw new Error('Expected version 1 with one or two tasks');
  const ids = new Set(), agents = new Set();
  for (const task of batch.tasks) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(task.id) || ids.has(task.id)) throw new Error('Invalid/duplicate task id');
    if (!['claude', 'muse'].includes(task.agent) || agents.has(task.agent)) throw new Error('One task per supported agent');
    if (typeof task.instruction !== 'string' || !task.instruction.trim()) throw new Error('Missing instruction');
    if (!Array.isArray(task.allowedFiles) || !task.allowedFiles.length || !task.allowedFiles.every(validRelative))
      throw new Error('Invalid allowed files');
    if (!task.allowedFiles.includes(task.report)) throw new Error('Report must be an allowed file');
    ids.add(task.id); agents.add(task.agent);
  }
  return batch;
}
export function wslPath(file) {
  const match = /^([a-z]):[\\/](.*)$/i.exec(file);
  if (!match) throw new Error('WSL bridge requires a drive-qualified Windows path');
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll('\\', '/')}`;
}
export function scopeVerdict(files, allowedFiles) {
  const unexpected = files.filter(file => !allowedFiles.includes(file));
  return { unexpected, scopeOK: unexpected.length === 0 };
}
export function claudeOutcome(text) {
  // Headless Claude may put a provider failure inside a JSON result. Do not
  // infer task success from exit zero or a previously written report alone.
  try {
    const value = JSON.parse(text);
    const result = Array.isArray(value) ? value.findLast(item => item.type === 'result') : value;
    if (result?.type !== 'result') return { isError: true, reason: 'missing-result' };
    return { isError: result.is_error === true, reason: result.terminal_reason ?? result.subtype,
      sessionId: result.session_id ?? null, message: String(result.result ?? '').slice(0, 1500),
      usage: { turns: result.num_turns ?? null, outputTokens: result.usage?.output_tokens ?? null,
        cacheReadTokens: result.usage?.cache_read_input_tokens ?? null,
        cacheWriteTokens: result.usage?.cache_creation_input_tokens ?? null,
        estimatedCostUSD: result.total_cost_usd ?? null } };
  } catch { return { isError: true, reason: 'invalid-result-json' }; }
}
export function resolveCodex(config) {
  if (config.codex !== 'auto') return config.codex;
  const root = config.vscodeExtensions;
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('Auto Codex needs vscodeExtensions');
  const installed = json(path.join(root, 'extensions.json'));
  const entry = installed.find(item => item.identifier?.id === 'openai.chatgpt');
  if (!entry || typeof entry.relativeLocation !== 'string' || !validRelative(entry.relativeLocation))
    throw new Error('Installed Codex extension not found');
  return path.join(root, entry.relativeLocation, 'bin', 'windows-x86_64', 'codex.exe');
}
function git(cwd, args) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 32*1024*1024 });
  if (run.error || run.status !== 0) throw new Error(`git ${args[0]}: ${run.error?.message || run.stderr}`);
  return run.stdout;
}

// Captures process failures and transport output. Exit zero alone is NOT an
// agent-task acceptance; scope, report presence and review are separate.
export function runProcess(command, args, { cwd, prefix, input = '', timeoutMs = 1800000 } = {}) {
  return new Promise(resolve => {
    const stdout = fs.createWriteStream(`${prefix}.stdout.jsonl`);
    const stderr = fs.createWriteStream(`${prefix}.stderr.log`);
    let child, timer, timedOut = false, error = null, settled = false, tail = '';
    const finish = (exitCode, signal) => {
      if (settled) return; settled = true; clearTimeout(timer);
      // 'finish' only flushes writes; Windows handles remain open until 'close'.
      Promise.all([stdout, stderr].map(stream => new Promise(done => {
        stream.once('close', done); stream.end();
      })))
        .then(() => resolve({ exitCode, signal, timedOut, error, tail: tail.slice(-4000) }));
    };
    try { child = spawn(command, args, { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (e) { error = e.message; finish(null, null); return; }
    child.on('error', e => { error = e.message; finish(null, null); });
    child.stdout.on('data', data => { stdout.write(data); tail = (tail + data.toString()).slice(-8000); });
    child.stderr.on('data', data => stderr.write(data));
    child.stdin.on('error', () => {}); // closed stdin on an early launch failure
    child.stdin.end(input);
    child.on('close', finish);
    timer = setTimeout(() => {
      timedOut = true;
      // Only this still-owned child, never executable-name or stale PID kills.
      if (child.exitCode !== null || child.signalCode) return;
      if (process.platform === 'win32') {
        const stop = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, encoding: 'utf8' });
        if (stop.status !== 0) { error = `Owned process cleanup failed: ${stop.stderr}`; finish(null, null); }
      } else child.kill('SIGTERM');
    }, timeoutMs);
  });
}

async function taskRun(task, ctx) {
  const dir = path.join(ctx.dir, task.id), checkout = path.join(dir, 'checkout');
  fs.mkdirSync(dir);
  const record = { id: task.id, agent: task.agent, status: 'preparing', checkout, base: ctx.base };
  const persist = () => { write(path.join(dir, 'result.json'), record); };
  persist();
  try {
    // Full local clone, not Windows-linked worktree metadata: usable by both
    // Linux Git and Windows Git, with independent index and no shared writes.
    git(ROOT, ['clone', '--local', '--no-hardlinks', '--no-checkout', ROOT, checkout]);
    git(checkout, ['checkout', '--detach', ctx.base]);
    git(checkout, ['remote', 'remove', 'origin']); // no accidental publishing target
    const prompt = `${task.instruction}\n\nAUTOMATED HANDOFF FROM ASTRA\n` +
      `Base: ${ctx.base}. This is your isolated checkout; stay in it.\n` +
      `Allowed writes: ${task.allowedFiles.join(', ')}.\n` +
      'Do not commit, push, merge, change settings, launch other agents or modify another checkout.\n' +
      'Use current default model/account. Preserve tests. Read only the task contract and affected code, not the whole archive.\n' +
      'Keep tool output focused; print full failure details only when needed. Do not repeat successful full suites without new changes.\n' +
      'Write a short checkpoint before long validation, so a quota stop preserves your reasoning.\n' +
      'Run host-probe once; if browser checks are unavailable, report that and continue Node work.\n' +
      'Do not use the root browser queue from this clone: it tests the wrong checkout. No browser run is required for this Node-only task.\n' +
      'For fail-demos use an isolated temporary copy and restore/remove only your own scratch.\n' +
      'If permission/auth/environment prevents a required action, report BLOCKED explicitly; do not bypass it.\n' +
      `Write the report to ${task.report}. Finish with READY FOR REVIEW or BLOCKED and exact checks/results.\n`;
    fs.writeFileSync(path.join(checkout, 'BRIDGE_PROMPT.txt'), prompt);
    // Prompt is local harness input; exclude from the candidate patch.
    fs.appendFileSync(path.join(checkout, '.git', 'info', 'exclude'), '\n/BRIDGE_PROMPT.txt\n');
    record.status = 'running'; persist();
    const prefix = path.join(dir, 'agent');
    if (task.agent === 'claude') {
      record.process = await runProcess(ctx.config.claude, [
        '-p', '--output-format', 'json', '--permission-mode', 'acceptEdits', '--effort', 'medium',
        '--autocompact', '100k',
        '--allowedTools', 'Read,Edit,Write,Glob,Grep,Bash(node *),Bash(git status *),Bash(git diff *),Bash(rg *),Bash(pwd),Bash(ls *)',
      ], { cwd: checkout, prefix, input: prompt, timeoutMs: ctx.timeoutMs });
      record.agentResult = claudeOutcome(fs.readFileSync(`${prefix}.stdout.jsonl`, 'utf8'));
    } else {
      // Linux timeout owns the Linux process group; WSL transport timeout is
      // deliberately longer so killing wsl.exe isn't the primary cleanup.
      record.process = await runProcess('wsl.exe', [
        '-d', ctx.config.distro, '--cd', wslPath(checkout), '--exec',
        '/usr/bin/timeout', '--signal=TERM', '--kill-after=10s', `${Math.floor(ctx.timeoutMs/1000)}s`,
        ctx.config.muse, 'exec', '--json', '--prompt-file', 'BRIDGE_PROMPT.txt',
        '--workspace', wslPath(checkout), '--max-model-steps', '80', '--max-tool-output-bytes', '12000',
        '--disable-approval', '--trust-workspace', '--disable-web-tools',
      ], { cwd: checkout, prefix, timeoutMs: ctx.timeoutMs + 30000 });
    }
    const files = [...new Set([
      ...git(checkout, ['diff', '--name-only', '-z', ctx.base]).split('\0'),
      ...git(checkout, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0'),
    ].filter(Boolean))];
    Object.assign(record, scopeVerdict(files, task.allowedFiles));
    record.files = files;
    record.headUnchanged = git(checkout, ['rev-parse', 'HEAD']).trim() === ctx.base;
    record.report = path.join(checkout, task.report);
    record.reportExists = fs.existsSync(record.report);
    const allowed = files.filter(file => task.allowedFiles.includes(file));
    if (allowed.length) git(checkout, ['add', '--', ...allowed]);
    fs.writeFileSync(path.join(dir, 'candidate.patch'), git(checkout, ['diff', '--cached', '--binary', ctx.base]));
    record.status = record.process.exitCode === 0 && !record.process.error && !record.process.timedOut && !record.agentResult?.isError &&
      record.scopeOK && record.headUnchanged && record.reportExists ? 'awaiting-review' : 'needs-attention';
  } catch (e) { record.status = 'failed'; record.error = e.message; }
  record.finished = new Date().toISOString(); persist();
  console.log(`${task.id}: ${record.status}`);
  return record;
}

export async function supervise(dir, config, batch, {
  review = false, timeoutMs = 1800000, taskRunner = taskRun, processRunner = runProcess,
} = {}) {
  const base = git(ROOT, ['rev-parse', 'HEAD']).trim();
  const summary = { base, status: 'running', started: new Date().toISOString(), reviewRequested: review, tasks: [] };
  write(path.join(dir, 'summary.json'), summary);
  summary.tasks = await Promise.all(batch.tasks.map(task => taskRunner(task, { dir, base, config, timeoutMs })));
  summary.status = 'tasks-finished'; write(path.join(dir, 'summary.json'), summary);
  if (review) {
    const prompt = `You are Astra reviewing bounded external-agent handoffs for NilGame.\n` +
      `Read ${path.join(dir, 'summary.json')} and each task's report, candidate.patch and relevant code in its isolated checkout.\n` +
      'Process exit and READY FOR REVIEW are claims, not acceptance. Check allowed-file violations, refused tools, test evidence and mathematical contracts.\n' +
      'Read root AGENTS.md/WORKING_RULES. Return one short verdict per task, concrete issues, and next integration steps, within 500 words.\n' +
      'Read only relevant report/diff/code portions. Do not reread historical archives or whole process logs unless resolving a specific discrepancy.\n' +
      'READ ONLY: do not modify files, run tests that write files, commit, merge, launch agents or start another review.\n' +
      'This is the single automatic completion callback requested by the user; stop after review.\n';
    fs.writeFileSync(path.join(dir, 'review-prompt.txt'), prompt);
    summary.status = 'reviewing'; write(path.join(dir, 'summary.json'), summary);
    summary.review = await processRunner(config.codex, [
      'exec', '--sandbox', 'read-only', '--json', '-C', ROOT,
      '-o', path.join(dir, 'astra-review.md'), '-',
    ], { cwd: ROOT, prefix: path.join(dir, 'review'), input: prompt, timeoutMs: 1200000 });
    summary.status = summary.review.exitCode === 0 && !summary.review.error && !summary.review.timedOut &&
      fs.existsSync(path.join(dir, 'astra-review.md')) ? 'review-finished' : 'review-needs-attention';
  }
  summary.finished = new Date().toISOString(); write(path.join(dir, 'summary.json'), summary);
  return summary;
}

async function main() {
  const [command, ...flags] = process.argv.slice(2);
  if (command === 'status') {
    const latest = json(path.join(LOCAL, 'latest.json'));
    const summary = json(path.join(latest.dir, 'summary.json'));
    summary.tasks = fs.readdirSync(latest.dir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && fs.existsSync(path.join(latest.dir, entry.name, 'result.json')))
      .map(entry => json(path.join(latest.dir, entry.name, 'result.json')));
    // Full process output stays in files, not every status poll's context.
    for (const task of summary.tasks) if (task.process) delete task.process.tail;
    if (summary.review) delete summary.review.tail;
    console.log(`${summary.status} | base ${summary.base.slice(0, 7)}`);
    for (const task of summary.tasks) console.log(`${task.id}: ${task.status}${task.agentResult?.message ? ' | ' + task.agentResult.message.slice(0, 180) : ''}`);
    for (const task of summary.tasks) if (task.agentResult?.usage)
      console.log(`${task.id} usage (not subscription percentage): ${JSON.stringify(task.agentResult.usage)}`);
    console.log(`Details: ${latest.dir}`); return;
  }
  if (command !== 'start' && command !== 'worker') throw new Error('Usage: node tools/agent-bridge.js start [--review] | status');
  if (flags.some(flag => flag !== '--review')) throw new Error('Unknown flag');
  fs.mkdirSync(LOCAL, { recursive: true });
  const config = json(path.join(LOCAL, 'config.json'));
  config.codex = resolveCodex(config);
  for (const key of ['claude', 'codex', 'muse', 'distro'])
    if (typeof config[key] !== 'string' || !config[key]) throw new Error(`Missing local config ${key}`);
  for (const key of ['claude', 'codex'])
    if (!path.isAbsolute(config[key]) || !fs.existsSync(config[key])) throw new Error(`Missing native executable: ${key}`);
  const batch = validateBatch(json(path.join(ROOT, 'tools/agent-bridge-tasks.json')));
  const lock = path.join(LOCAL, 'active.lock');
  if (command === 'start') {
    // Never reclaim a stale lock automatically: a Linux child might outlive a
    // crashed Windows supervisor. Inspect saved state before starting again.
    const token = randomUUID();
    fs.writeFileSync(lock, JSON.stringify({ token, launcher: process.pid, started: new Date().toISOString() }), { flag: 'wx' });
    const log = fs.openSync(path.join(LOCAL, 'supervisor.log'), 'a');
    try {
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'worker', ...flags], {
        cwd: ROOT, detached: true, windowsHide: true, stdio: ['ignore', log, log],
        env: { ...process.env, NIL_BRIDGE_RUN_TOKEN: token },
      });
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      child.unref(); console.log(`Bridge supervisor started: PID ${child.pid}. Results in .agent-bridge/.`);
    } catch (e) { fs.unlinkSync(lock); throw e; }
    finally { fs.closeSync(log); }
    return;
  }
  const lease = json(lock);
  if (!lease.token || lease.token !== process.env.NIL_BRIDGE_RUN_TOKEN || lease.worker)
    throw new Error('Worker requires its unused launcher lease');
  write(lock, { ...lease, worker: process.pid });
  const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
  const dir = path.join(LOCAL, 'runs', id);
  try {
    fs.mkdirSync(dir, { recursive: true }); write(path.join(LOCAL, 'latest.json'), { id, dir, pid: process.pid });
    await supervise(dir, config, batch, { review: flags.includes('--review') });
  } catch (e) {
    write(path.join(dir, 'failure.json'), { error: e.message, finished: new Date().toISOString() });
    throw e;
  } finally { if (fs.existsSync(lock) && json(lock).token === lease.token) fs.unlinkSync(lock); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(e => { console.error(e.stack); process.exitCode = 1; });
