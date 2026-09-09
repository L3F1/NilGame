// Lifecycle tests for tools/browser-process.js. Controlled child/event
// substitutes only — no Chrome, no sockets, no real processes. Each test
// asserts the observable session outcome, never source strings.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { acquireBrowserProfile } from './tools/browser-profile.js';
import {
  DEFAULT_REPORT_TIMEOUT_MS,
  killOwnedChild,
  parseReportTimeoutMs,
  runBrowserSession,
} from './tools/browser-process.js';

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.stack}`); }
}

class FakeChild extends EventEmitter {
  constructor(pid) { super(); this.pid = pid; this.kills = 0; }
  kill() { this.kills++; }
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const never = () => new Promise(() => {});

await test('normal report resolves with the report and cleans the owned child', async () => {
  const owned = new FakeChild(1001);
  let cleaned = null;
  const t0 = Date.now();
  const outcome = await runBrowserSession({
    launch: async () => owned,
    waitForReport: async () => ({ checks: ['a'], hud: 'x' }),
    timeoutMs: 5000,
    cleanup: async (child) => { cleaned = child; },
  });
  assert.equal(Date.now() - t0 < 5000, true, 'must not wait the full timeout');
  assert.equal(outcome.status, 'report');
  assert.deepEqual(outcome.report, { checks: ['a'], hud: 'x' });
  assert.equal(outcome.cleanup, 'ok');
  assert.equal(cleaned, owned);
});

await test('spawn failure promptly releases non-child resources too', async () => {
  const t0 = Date.now();
  let cleaned = false;
  const outcome = await runBrowserSession({
    launch: async () => { throw new Error('spawn ENOENT'); },
    waitForReport: never,
    timeoutMs: 5000,
    cleanup: async (child) => { assert.equal(child, null); cleaned = true; },
  });
  assert.equal(Date.now() - t0 < 1000, true);
  assert.equal(outcome.status, 'spawn-error');
  assert.match(outcome.reason, /ENOENT/);
  assert.equal(outcome.cleanup, 'ok');
  assert.equal(cleaned, true);
});

await test('spawn error event fails promptly with the reason', async () => {
  const owned = new FakeChild(1002);
  const gate = deferred();
  const t0 = Date.now();
  const session = runBrowserSession({
    launch: async () => owned,
    waitForReport: () => gate.promise,
    timeoutMs: 5000,
    cleanup: async (child) => { child.kill(); },
  });
  await new Promise((r) => setImmediate(r));
  owned.emit('error', new Error('socketpair failed'));
  const outcome = await session;
  assert.equal(Date.now() - t0 < 1000, true);
  assert.equal(outcome.status, 'spawn-error');
  assert.match(outcome.reason, /socketpair/);
  assert.equal(outcome.cleanup, 'ok');
  assert.equal(owned.kills, 1);
});

await test('early exit fails promptly with code and signal', async () => {
  const owned = new FakeChild(1003);
  const t0 = Date.now();
  const session = runBrowserSession({
    launch: async () => owned,
    waitForReport: never,
    timeoutMs: 5000,
    cleanup: async (child) => { child.kill(); },
  });
  await new Promise((r) => setImmediate(r));
  owned.emit('exit', 1, null);
  const outcome = await session;
  assert.equal(Date.now() - t0 < 1000, true, 'must not wait the full timeout');
  assert.equal(outcome.status, 'early-exit');
  assert.match(outcome.reason, /code 1/);
  assert.equal(outcome.cleanup, 'ok');
  assert.equal(owned.kills, 1);
});

await test('timeout reports after the bound and kills the owned child', async () => {
  const owned = new FakeChild(1004);
  const t0 = Date.now();
  const outcome = await runBrowserSession({
    launch: async () => owned,
    waitForReport: never,
    timeoutMs: 50,
    cleanup: async (child) => { child.kill(); },
  });
  const elapsed = Date.now() - t0;
  assert.equal(outcome.status, 'timeout');
  assert.match(outcome.reason, /no report within/);
  assert.equal(elapsed < 2000, true, `took ${elapsed} ms`);
  assert.equal(outcome.cleanup, 'ok');
  assert.equal(owned.kills, 1);
});

await test('cleanup failure is reported, never a silent success', async () => {
  const owned = new FakeChild(1005);
  const outcome = await runBrowserSession({
    launch: async () => owned,
    waitForReport: async () => ({ ok: true }),
    timeoutMs: 5000,
    cleanup: async () => { throw new Error('taskkill denied'); },
  });
  assert.equal(outcome.status, 'report');
  assert.equal(outcome.cleanup, 'failed');
  assert.match(outcome.cleanupError, /denied/);
});

await test('racing report, exit and timeout settles exactly once', async () => {
  const owned = new FakeChild(1006);
  const gate = deferred();
  let cleanups = 0;
  const session = runBrowserSession({
    launch: async () => owned,
    waitForReport: () => gate.promise,
    timeoutMs: 30,
    cleanup: async () => { cleanups++; },
  });
  await new Promise((r) => setImmediate(r));
  owned.emit('exit', 0, null);
  gate.resolve({ late: true });
  const outcome = await session;
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(cleanups, 1, `cleanup ran ${cleanups} times`);
  assert.equal(outcome.status, 'early-exit');
  assert.equal('report' in outcome, false, 'late report must be dropped');
});

await test('cleanup touches only the owned child; a sentinel is untouched', async () => {
  const owned = new FakeChild(1007);
  const sentinel = new FakeChild(9999);
  assert.equal(typeof sentinel.kill, 'function');
  const outcome = await runBrowserSession({
    launch: async () => owned,
    waitForReport: async () => ({ ok: true }),
    timeoutMs: 5000,
    cleanup: async (child) => killOwnedChild(child, { platform: 'posix' }),
  });
  assert.equal(outcome.status, 'report');
  assert.equal(outcome.cleanup, 'ok');
  assert.equal(owned.kills, 1);
  assert.equal(sentinel.kills, 0, 'unrelated process must never be killed');
});

await test('killOwnedChild refuses unestablished ownership', async () => {
  await assert.rejects(killOwnedChild({ pid: -1 }), /owned PID not established/);
  await assert.rejects(killOwnedChild({ pid: 0 }), /owned PID not established/);
  await assert.rejects(killOwnedChild({ pid: 'headless' }), /owned PID not established/);
  await assert.rejects(killOwnedChild(null), /owned PID not established/);
});

await test('windows tree kill targets the owned PID via structured args', async () => {
  const owned = new FakeChild(4242);
  const calls = [];
  const result = await killOwnedChild(owned, {
    platform: 'win32',
    execFn: async (exe, args) => { calls.push([exe, args]); },
  });
  assert.deepEqual(calls, [['taskkill', ['/PID', '4242', '/T', '/F']]]);
  assert.deepEqual(result, { target: 4242, method: 'taskkill' });
  assert.equal(owned.kills, 0, 'no signal kill alongside taskkill');
});

await test('taskkill refusing a dead descendant is not a cleanup failure', async () => {
  // The real message from a live run: Chrome's own child had already exited,
  // taskkill /T reported that as an error, and a clean 2000-frame run was
  // failed for it. The owned PID is what this session promised to clean up.
  const owned = new FakeChild(4300);
  const result = await killOwnedChild(owned, {
    platform: 'win32',
    execFn: async () => {
      throw new Error('taskkill /PID 4300 failed: ERROR: The process with PID 19068 '
        + '(child process of PID 4300) could not be terminated. '
        + 'Reason: The operation attempted is not supported.');
    },
    aliveFn: () => false,             // the owned process really is gone
  });
  assert.deepEqual(result, { target: 4300, method: 'taskkill', descendantsRefused: true });
});

await test('taskkill failure with the owned process still alive still fails', async () => {
  const owned = new FakeChild(4301);
  await assert.rejects(killOwnedChild(owned, {
    platform: 'win32',
    execFn: async () => { throw new Error('taskkill /PID 4301 failed: Access is denied.'); },
    aliveFn: () => true,              // still up: this is a genuine failure
  }), /Access is denied/);
});

await test('report-path rejection is an observable failure, not a hang', async () => {
  const owned = new FakeChild(1008);
  const outcome = await runBrowserSession({
    launch: async () => owned,
    waitForReport: async () => { throw new Error('server gone'); },
    timeoutMs: 5000,
    cleanup: async () => {},
  });
  assert.equal(outcome.status, 'report-error');
  assert.match(outcome.reason, /server gone/);
  assert.equal(outcome.cleanup, 'ok');
});

await test('already-exited child resolves without waiting for events', async () => {
  const owned = new FakeChild(1009);
  owned.exitCode = 2; // died between spawn and listener attachment; no event fires
  const t0 = Date.now();
  const outcome = await runBrowserSession({
    launch: async () => owned,
    waitForReport: never,
    timeoutMs: 5000,
    cleanup: async () => {},
  });
  assert.equal(Date.now() - t0 < 1000, true);
  assert.equal(outcome.status, 'early-exit');
  assert.match(outcome.reason, /code 2/);
});

await test('cleanup of an already-exited child sends no kill', async () => {
  const owned = new FakeChild(1010);
  owned.exitCode = 1; // reaped itself; taskkill would print "process not found"
  let execCalls = 0;
  const win = await killOwnedChild(owned, {
    platform: 'win32',
    execFn: async () => { execCalls++; },
  });
  assert.deepEqual(win, { target: 1010, method: 'already-exited' });
  assert.equal(execCalls, 0);
  const posix = await killOwnedChild(owned, { platform: 'posix' });
  assert.equal(posix.method, 'already-exited');
  assert.equal(owned.kills, 0);
});

await test('parseReportTimeoutMs keeps the default and validates overrides', () => {
  assert.equal(parseReportTimeoutMs([]), DEFAULT_REPORT_TIMEOUT_MS);
  assert.equal(parseReportTimeoutMs(['--worlds']), DEFAULT_REPORT_TIMEOUT_MS);
  assert.equal(parseReportTimeoutMs(['--timeout=10']), 10000);
  assert.throws(() => parseReportTimeoutMs(['--timeout=nope']), /positive number/);
  assert.throws(() => parseReportTimeoutMs(['--timeout=0']), /positive number/);
  assert.throws(() => parseReportTimeoutMs(['--timeout=-5']), /positive number/);
});

await test('signal-exited child is not signalled again', async () => {
  const child = new FakeChild(1011); child.exitCode = null; child.signalCode = 'SIGTRAP';
  assert.equal((await killOwnedChild(child)).method, 'already-exited');
  const outcome = await runBrowserSession({ launch: () => child, waitForReport: never, timeoutMs: 5000 });
  assert.equal(outcome.status, 'early-exit');
  assert.match(outcome.reason, /SIGTRAP/);
});
await test('failed signal is not reported as successful cleanup', async () => {
  await assert.rejects(killOwnedChild({ pid: 1012, kill: () => false }, { platform: 'linux' }), /Could not signal/);
});
await test('cold profiles are isolated; only completed profiles can be warmed', () => {
  const root = mkdtempSync(join(tmpdir(), 'nilgame-profile-test-'));
  const a = acquireBrowserProfile({ root, backend: 'gpu' });
  const b = acquireBrowserProfile({ root, backend: 'gpu' });
  assert.notEqual(a.path, b.path);
  a.release(true); b.release(false);
  const warm = acquireBrowserProfile({ root, backend: 'gpu', warm: true });
  assert.equal(warm.path, a.path); assert.equal(warm.reused, true);
  const concurrent = acquireBrowserProfile({ root, backend: 'gpu', warm: true });
  assert.notEqual(concurrent.path, warm.path); assert.equal(concurrent.reused, false);
  concurrent.release(); warm.release(true);
  const sw = acquireBrowserProfile({ root, backend: 'sw', warm: true });
  assert.equal(sw.reused, false); sw.release();
});
await test('profile manifest cannot select an unrelated directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'nilgame-profile-test-'));
  writeFileSync(join(root, 'gpu-last.json'), JSON.stringify({ profile: join(root, '..', 'gpu-unrelated') }));
  const profile = acquireBrowserProfile({ root, backend: 'gpu', warm: true });
  assert.equal(profile.reused, false); profile.release();
});
await test('timeout overrides cannot overflow or round down to zero', () => {
  assert.throws(() => parseReportTimeoutMs(['--timeout=0.00001']));
  assert.throws(() => parseReportTimeoutMs(['--timeout=999999999']));
});

// --- POSIX process-group revision (MUSE-06): fakes + real workers ---

await test('posix group cleanup terminates the tree and awaits exit', async () => {
  const owned = new FakeChild(2001);
  const targets = [];
  const result = await killOwnedChild(owned, {
    platform: 'posix', posixProcessGroup: true, termGraceMs: 500, killWaitMs: 500,
    signalFn: (target, signal) => {
      targets.push([target, signal]);
      owned.exitCode = 0; owned.emit('exit', 0, null);
    },
  });
  assert.deepEqual(result, { target: 2001, method: 'posix-group', forced: false });
  assert.deepEqual(targets, [[-2001, 'SIGTERM']]);
});

await test('posix group cleanup escalates to SIGKILL when TERM is ignored', async () => {
  const owned = new FakeChild(2002);
  const targets = [];
  const result = await killOwnedChild(owned, {
    platform: 'posix', posixProcessGroup: true, termGraceMs: 50, killWaitMs: 500,
    signalFn: (target, signal) => {
      targets.push([target, signal]);
      if (signal === 'SIGKILL') { owned.signalCode = 'SIGKILL'; owned.emit('exit', null, 'SIGKILL'); }
    },
  });
  assert.deepEqual(result, { target: 2002, method: 'posix-group', forced: true });
  assert.deepEqual(targets, [[-2002, 'SIGTERM'], [-2002, 'SIGKILL']]);
});

await test('posix group signal failure is an honest error', async () => {
  const denied = new Error('operation not permitted'); denied.code = 'EPERM';
  await assert.rejects(
    killOwnedChild(new FakeChild(2003), {
      platform: 'posix', posixProcessGroup: true, signalFn: () => { throw denied; },
    }),
    /Could not signal owned process group 2003/,
  );
});

await test('posix group ESRCH means already reaped, not failure', async () => {
  const gone = new Error('no such process'); gone.code = 'ESRCH';
  const calls = [];
  const result = await killOwnedChild(new FakeChild(2004), {
    platform: 'posix', posixProcessGroup: true,
    signalFn: (target, signal) => { calls.push([target, signal]); throw gone; },
  });
  assert.deepEqual(result, { target: 2004, method: 'already-exited' });
  assert.deepEqual(calls, [[-2004, 'SIGTERM']]);
});

await test('posix group flag never addresses another PID', async () => {
  const owned = new FakeChild(2005);
  const targets = [];
  await killOwnedChild(owned, {
    platform: 'posix', posixProcessGroup: true, termGraceMs: 100, killWaitMs: 100,
    signalFn: (target, signal) => {
      targets.push(target);
      owned.exitCode = 0; owned.emit('exit', 0, null);
    },
  });
  assert.ok(targets.length > 0, 'must signal something');
  for (const target of targets) {
    assert.equal(target, -2005, `only the owned PGID may be signalled, got ${target}`);
  }
});

await test('posix without group flag still signals only the single child', async () => {
  const owned = new FakeChild(2006);
  const result = await killOwnedChild(owned, { platform: 'posix' });
  assert.deepEqual(result, { target: 2006, method: 'signal' });
  assert.equal(owned.kills, 1);
});

await test('win32 never takes the posix-group branch, even when flagged', async () => {
  // Module-side pin for the integration defect: the probe called
  // killOwnedChild with posix semantics on a win32 host, where
  // process.kill(-pid) throws ESRCH for a LIVE child and the group-ESRCH
  // reading then misreported it as already-exited. Whatever the flag says,
  // an injected win32 platform must take the taskkill path and never send
  // a group signal, so the ESRCH reading stays POSIX-only in its effect.
  const live = new FakeChild(2010);
  const groupSignals = [];
  const esrchSignal = (target, signal) => {
    groupSignals.push([target, signal]);
    const error = new Error('no such process'); error.code = 'ESRCH'; throw error;
  };
  const result = await killOwnedChild(live, {
    platform: 'win32', posixProcessGroup: true, signalFn: esrchSignal,
    execFn: async (exe, args) => {
      assert.deepEqual([exe, args], ['taskkill', ['/PID', '2010', '/T', '/F']]);
    },
  });
  assert.deepEqual(groupSignals, [], 'no group signal may be sent on win32');
  assert.equal(result.method, 'taskkill');
});

// Real POSIX workers (tools/fixtures/browser-worker.js): no sockets, no
// Chrome. EPERM-style environment failures SKIP explicitly — never a mock
// pass. After two environment failures the rest skip too.
const workerScript = fileURLToPath(new URL('./tools/fixtures/browser-worker.js', import.meta.url));
let skipped = 0;
function skipReal(name, reason) {
  skipped++;
  console.log(`SKIP ${name}: ${reason}`);
}
const ENV_CODES = new Set(['EPERM', 'EACCES', 'EAGAIN', 'ENOMEM']);
function isEnvError(error) {
  return !!error && (ENV_CODES.has(error.code) || /not permitted|permission denied/i.test(error.message || ''));
}
// Every REAL child this suite creates, by PID. FakeChild substitutes never
// enter this list. The closing self-check asserts each recorded PID is gone:
// no sweeps, no process-name matching, only PIDs this suite created.
const suiteSpawnedPids = [];
function spawnWorker(mode, args = [], opts = {}) {
  const child = spawn(process.execPath, [workerScript, mode, ...args],
    { detached: false, stdio: ['ignore', 'pipe', 'ignore'], ...opts });
  if (Number.isInteger(child?.pid)) suiteSpawnedPids.push(child.pid);
  return child;
}
function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}
function readWorkerLines(child, prefixes, ms = 5000) {
  return new Promise((resolve, reject) => {
    const found = new Map();
    let buf = '';
    const timer = setTimeout(() => {
      child.stdout.removeListener('data', onData);
      child.removeListener('error', onError);
      reject(new Error(`worker protocol timeout waiting for ${prefixes.filter((p) => !found.has(p)).join(',')}`));
    }, ms);
    const onData = (chunk) => {
      buf += String(chunk);
      for (const line of buf.split('\n')) {
        for (const p of prefixes) {
          if (!found.has(p) && line.startsWith(p)) found.set(p, line.trim());
        }
      }
      if (prefixes.every((p) => found.has(p))) {
        clearTimeout(timer);
        child.stdout.removeListener('data', onData);
        child.removeListener('error', onError);
        resolve(found);
      }
    };
    const onError = (error) => {
      clearTimeout(timer);
      child.stdout.removeListener('data', onData);
      reject(error);
    };
    child.stdout.on('data', onData);
    child.on('error', onError);
  });
}
function reapStray(child, grouped) {
  if (!child?.pid || child.exitCode !== null || child.signalCode) return;
  // A group address can fail (no group established, or a non-POSIX host,
  // where process.kill(-pid) throws ESRCH). Fall back to the single owned
  // PID so a stray worker is never left orphaned holding this suite's
  // stdout pipe open -- that hung the whole run and leaked a process.
  if (grouped) {
    try { process.kill(-child.pid, 'SIGKILL'); return; } catch { /* fall through */ }
  }
  try { child.kill('SIGKILL'); } catch { /* best effort only */ }
}
async function supportProbe(spawnFn = spawnWorker) {
  const worker = spawnFn('linger', [], { detached: true });
  try {
    await readWorkerLines(worker, ['READY']);
    const result = await killOwnedChild(worker, {
      platform: 'posix', posixProcessGroup: true, termGraceMs: 2000, killWaitMs: 3000,
    });
    assert.equal(result.method, 'posix-group');
    assert.equal(alive(worker.pid), false);
    return { ok: true };
  } catch (error) {
    reapStray(worker, true);
    if (isEnvError(error)) return { ok: false, reason: `${error.code || ''} ${error.message || error}`.trim() };
    throw error;
  }
}
// POSIX process groups are the subject of these tests, and Windows has no
// equivalent: process.kill(-pid) throws ESRCH there, which killOwnedChild
// reads as 'already-exited' even for a still-running child. Probing it
// anyway spawned a detached worker that outlived the failed probe, hung the
// suite and leaked the process (see MUSE-08). Skip before spawning anything;
// the Windows termination path has its own tests.
//
// The platform is INJECTED (default: this host) so the win32 path is testable
// anywhere: a counting spawn stub must observe zero spawns. State is carried
// in an explicit object so the simulated-platform test cannot pollute the
// shared probe state used by the real tests below.
function isPosixPlatform(platform = process.platform) {
  return platform !== 'win32';
}
function createRealWorkerState() {
  return { support: null, envFailures: 0 };
}
const POSIX_HOST = isPosixPlatform();
const sharedRealWorkerState = createRealWorkerState();

async function realTestWith(state, { platform = process.platform, spawnFn = spawnWorker } = {}, name, fn) {
  if (!isPosixPlatform(platform)) {
    skipReal(name, `POSIX-only process-group semantics; host is ${platform}`);
    return 'skipped-platform';
  }
  if (state.support === null) {
    try {
      state.support = await supportProbe(spawnFn);
    } catch (error) {
      state.envFailures++;
      state.support = { ok: false, reason: `support probe failed: ${error.message || error}` };
    }
  }
  if (!state.support.ok) { skipReal(name, state.support.reason); return 'skipped-nosupport'; }
  if (state.envFailures >= 2) { skipReal(name, 'two environment failures already recorded'); return 'skipped-env'; }
  try { await fn(); passed++; return 'ran'; }
  catch (error) {
    if (isEnvError(error)) {
      state.envFailures++;
      skipReal(name, `${error.code || ''} ${error.message || error}`.trim());
      return 'skipped-env';
    } else { failed++; console.error(`FAIL ${name}: ${error.stack}`); return 'failed'; }
  }
}
async function realTest(name, fn) {
  return realTestWith(sharedRealWorkerState, undefined, name, fn);
}

// MUSE-08 guard 1: on a simulated win32 host the real-worker path must SPAWN
// NOTHING. Fails against the pre-fix behavior (no platform gate), where the
// support probe spawned a detached worker before the POSIX-only kill failed.
await test('platform gate is a pure function of the injected platform', () => {
  assert.equal(isPosixPlatform('win32'), false);
  assert.equal(isPosixPlatform('linux'), true);
  assert.equal(isPosixPlatform('darwin'), true);
  assert.equal(isPosixPlatform(process.platform), process.platform !== 'win32');
});

await test('simulated win32 host: real-worker path spawns nothing', async () => {
  let spawns = 0;
  const stubSpawn = () => { spawns++; throw new Error('real-worker path must not spawn on win32'); };
  let bodyRan = false;
  const outcome = await realTestWith(createRealWorkerState(), { platform: 'win32', spawnFn: stubSpawn },
    'simulated win32 real-worker case', async () => { bodyRan = true; });
  assert.equal(outcome, 'skipped-platform');
  assert.equal(spawns, 0, 'the support probe must not spawn on a simulated win32 host');
  assert.equal(bodyRan, false, 'the worker body must not run on a simulated win32 host');
});

await realTest('real worker: group TERM exits worker and grandchild', async () => {
  const worker = spawnWorker('linger', ['1'], { detached: true });
  try {
    const lines = await readWorkerLines(worker, ['READY', 'CHILD']);
    const grandchild = Number(lines.get('CHILD').split(' ')[1]);
    const result = await killOwnedChild(worker, {
      platform: 'posix', posixProcessGroup: true, termGraceMs: 2000, killWaitMs: 3000,
    });
    assert.deepEqual(result, { target: worker.pid, method: 'posix-group', forced: false });
    assert.equal(worker.exitCode, 0);
    assert.equal(alive(grandchild), false, 'grandchild must be reaped with the group');
  } finally {
    reapStray(worker, true);
  }
});

await realTest('real worker: ignored TERM escalates to SIGKILL', async () => {
  const worker = spawnWorker('ignore-term', [], { detached: true });
  try {
    await readWorkerLines(worker, ['READY']);
    const result = await killOwnedChild(worker, {
      platform: 'posix', posixProcessGroup: true, termGraceMs: 500, killWaitMs: 3000,
    });
    assert.deepEqual(result, { target: worker.pid, method: 'posix-group', forced: true });
    assert.equal(worker.signalCode, 'SIGKILL');
  } finally {
    reapStray(worker, true);
  }
});

await realTest('real worker: sentinel in another group survives', async () => {
  const worker = spawnWorker('linger', ['0'], { detached: true });
  const sentinel = spawnWorker('linger', ['0']);
  try {
    await readWorkerLines(worker, ['READY']);
    await readWorkerLines(sentinel, ['READY']);
    const result = await killOwnedChild(worker, {
      platform: 'posix', posixProcessGroup: true, termGraceMs: 2000, killWaitMs: 3000,
    });
    assert.equal(result.method, 'posix-group');
    assert.equal(alive(sentinel.pid), true, 'unrelated worker must survive group cleanup');
    sentinel.kill('SIGKILL');
    assert.equal(await new Promise((resolve) => {
      if (sentinel.exitCode !== null || sentinel.signalCode) return resolve(true);
      const timer = setTimeout(() => resolve(false), 3000);
      sentinel.once('exit', () => { clearTimeout(timer); resolve(true); });
    }), true, 'sentinel must die on direct signal');
  } finally {
    reapStray(worker, true);
    reapStray(sentinel, false);
  }
});

await realTest('real worker: natural exit needs no signal', async () => {
  const worker = spawnWorker('exit-now', ['0'], { detached: true });
  try {
    await readWorkerLines(worker, ['READY']);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('worker did not exit')), 5000);
      if (worker.exitCode !== null) { clearTimeout(timer); resolve(); }
      else worker.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    const result = await killOwnedChild(worker, {
      platform: 'posix', posixProcessGroup: true, termGraceMs: 500, killWaitMs: 500,
    });
    assert.equal(result.method, 'already-exited');
  } finally {
    reapStray(worker, true);
  }
});

// MUSE-08 guard 2: the suite leaves no child of its own alive. Only PIDs
// this suite really spawned are recorded (FakeChild substitutes never enter
// the list), so there is no sweep and no process-name matching. Runs last:
// file order is execution order.
await test('suite leaves no owned child alive', async () => {
  console.log(`owned real-child PIDs this run: ${suiteSpawnedPids.length ? suiteSpawnedPids.join(',') : '(none)'}`);
  if (!POSIX_HOST) {
    assert.equal(suiteSpawnedPids.length, 0, 'a win32 run must not spawn real workers at all');
  }
  const live = suiteSpawnedPids.filter((pid) => {
    try { return alive(pid); }
    catch { return true; } // EPERM or similar: cannot prove it gone, so report it, never pass silently
  });
  assert.deepEqual(live, [], `these suite-spawned PIDs are still alive: ${live.join(',')}`);
});

console.log(`${passed} passed, ${failed} failed, ${skipped} skipped`);
process.exitCode = failed ? 1 : 0;
