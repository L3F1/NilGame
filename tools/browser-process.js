// tools/browser-process.js — owned browser-process lifecycle for page-check.
//
// page-check.js used to call child.kill(), wait the full report timeout on
// an early browser failure, and had no spawn-error handler. This module
// separates those lifecycle decisions from launching Chrome so they run
// under WSL without browser sockets: the Node tests use controlled
// child/event substitutes, never real Chrome.
//
// Ownership rule: cleanup targets exactly the child this session launched.
// Windows tree termination addresses the owned PID only, never process
// names or "all headless" matches. If ownership cannot be established
// (no valid PID/handle), cleanup refuses and the session reports the
// limitation instead of killing guessed or reused PIDs.

export const DEFAULT_REPORT_TIMEOUT_MS = 300000;

/** Optional `--timeout=SECONDS` override; the 300 s default is retained. */
export function parseReportTimeoutMs(argv, defaultMs = DEFAULT_REPORT_TIMEOUT_MS) {
  const flag = argv.find((arg) => arg.startsWith('--timeout='));
  if (flag === undefined) return defaultMs;
  const raw = flag.slice('--timeout='.length);
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0.001 || seconds > 2147483.647) {
    throw new Error(`Expected --timeout=SECONDS with a positive number, got ${JSON.stringify(raw)}`);
  }
  return Math.round(seconds * 1000);
}

function validPid(pid) {
  return Number.isInteger(pid) && pid > 0;
}

const defaultSignal = (target, signal) => process.kill(target, signal);

/** Is this PID still running? EPERM means it exists and is not ours to see. */
const defaultAlive = (pid) => {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code !== 'ESRCH'; }
};

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** Resolve true when the child exits within ms, false on timeout. */
function awaitChildExit(child, ms) {
  return new Promise((resolve) => {
    if ((child.exitCode !== null && child.exitCode !== undefined) || child.signalCode) {
      return resolve(true);
    }
    const timer = setTimeout(() => {
      child.removeListener?.('exit', onExit);
      resolve(false);
    }, ms);
    const onExit = () => { clearTimeout(timer); resolve(true); };
    if (typeof child.once === 'function') child.once('exit', onExit);
    else child.on?.('exit', onExit);
  });
}

/**
 * Terminate exactly the owned child. Structured arguments only — no shell,
 * no process-name matching, no sweeps. `execFn` injects the Windows
 * executor for tests; the real path runs `taskkill` directly (execFile,
 * argument array, never a shell-built command). `signalFn` injects the
 * POSIX signaller for tests; the real path is process.kill.
 *
 * POSIX tree cleanup requires group ownership ESTABLISHED AT LAUNCH: the
 * caller passes posixProcessGroup only for a child it spawned detached,
 * whose PID is then its PGID. Without that flag only the single PID is
 * signalled (descendants explicitly not owned). A group address is never
 * derived from an arbitrary handle.
 */
export async function killOwnedChild(child, {
  platform = process.platform, execFn = null, signalFn = null, aliveFn = null,
  posixProcessGroup = false, termGraceMs = 5000, killWaitMs = 5000,
} = {}) {
  const pid = child?.pid;
  if (!validPid(pid)) {
    throw new Error(`Refusing cleanup: owned PID not established (${String(pid)})`);
  }
  // The owned child already reaped itself: no signal or taskkill to send,
  // and none to report as a failure. (Windows host evidence: taskkill on
  // an exited page-check child prints ERROR "process not found".)
  if ((child.exitCode !== null && child.exitCode !== undefined) || child.signalCode) {
    return { target: pid, method: 'already-exited' };
  }
  if (posixProcessGroup && platform !== 'win32') {
    const send = signalFn ?? defaultSignal;
    const group = -pid;
    try {
      send(group, 'SIGTERM');
    } catch (error) {
      if (error?.code === 'ESRCH') return { target: pid, method: 'already-exited' };
      throw new Error(`Could not signal owned process group ${pid}: ${error?.message || error}`);
    }
    if (await awaitChildExit(child, termGraceMs)) {
      return { target: pid, method: 'posix-group', forced: false };
    }
    try {
      send(group, 'SIGKILL');
    } catch (error) {
      if (error?.code === 'ESRCH') return { target: pid, method: 'already-exited' };
      throw new Error(`Could not force-kill owned process group ${pid}: ${error?.message || error}`);
    }
    if (await awaitChildExit(child, killWaitMs)) {
      return { target: pid, method: 'posix-group', forced: true };
    }
    throw new Error(`Owned process group ${pid} survived SIGKILL`);
  }
  if (platform === 'win32') {
    const run = execFn ?? (async (exe, args) => {
      const { execFile } = await import('node:child_process');
      await new Promise((resolve, reject) => {
        execFile(exe, args, { windowsHide: true, timeout: 10000 }, (error, stdout, stderr) => {
          if (error) reject(new Error(`taskkill /PID ${pid} failed: ${stderr || error.message}`));
          else resolve();
        });
      });
    });
    try {
      await run('taskkill', ['/PID', String(pid), '/T', '/F']);
      return { target: pid, method: 'taskkill' };
    } catch (error) {
      // taskkill /T reports failure when ANY descendant refuses, and Chrome's
      // GPU, renderer and utility children routinely exit on their own the
      // instant the browser process does. The message for that race is
      // "The process with PID <n> (child process of PID <owned>) could not be
      // terminated. Reason: The operation attempted is not supported." -- a
      // dead descendant, not a leak, and failing the whole check on it makes
      // a green run flaky. What this session OWNS is the one PID it spawned,
      // so that is the only thing worth asserting. Poll briefly, because
      // termination is asynchronous, and re-throw if it really is still up.
      const isAlive = aliveFn ?? defaultAlive;
      for (let i = 0; i < 10; i++) {
        const exited = (child.exitCode !== null && child.exitCode !== undefined) || child.signalCode;
        if (exited || !isAlive(pid)) {
          return { target: pid, method: 'taskkill', descendantsRefused: true };
        }
        await wait(50);
      }
      throw error;
    }
  }
  if (typeof child.kill !== 'function') {
    throw new Error(`Refusing cleanup: owned child PID ${pid} has no kill handle`);
  }
  if (child.kill() === false) throw new Error(`Could not signal owned child PID ${pid}`);
  return { target: pid, method: 'signal' };
}

/**
 * Run one browser session to a single observable outcome.
 *
 * - `launch()` returns the owned child handle (an EventEmitter with
 *   'error'/'exit', as spawn provides) or throws on spawn failure.
 * - `waitForReport()` resolves with the page report; rejection is a
 *   report-path failure, not a hang.
 * - `cleanup(child)` releases this session's resources (kill the owned
 *   tree, close the HTTP server). A throwing cleanup is reported in the
 *   outcome, never swallowed.
 *
 * Exactly-once: the first of report / spawn-error / early-exit / timeout
 * wins; later arrivals are dropped and cleanup runs a single time.
 */
export async function runBrowserSession({ launch, waitForReport, timeoutMs = DEFAULT_REPORT_TIMEOUT_MS, cleanup = null }) {
  let child = null;
  const clean = async () => {
    if (typeof cleanup !== 'function') return { cleanup: 'none' };
    try { await cleanup(child); return { cleanup: 'ok' }; }
    catch (error) { return { cleanup: 'failed', cleanupError: error?.message || String(error) }; }
  };
  try {
    const launched = launch();
    child = launched?.then ? await launched : launched;
  } catch (error) {
    return { status: 'spawn-error', reason: `browser did not start: ${error?.message || error}`, ...await clean() };
  }
  if (!child || typeof child.on !== 'function') {
    return { status: 'spawn-error', reason: 'browser did not start: launch returned no child handle', ...await clean() };
  }
  return await new Promise((resolve) => {
    let settled = false;
    const finish = async (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener?.('error', onError);
      child.removeListener?.('exit', onExit);
      resolve({ ...outcome, ...await clean() });
    };
    const onError = (error) => finish({
      status: 'spawn-error',
      reason: `browser error before report: ${error?.message || error}`,
    });
    const onExit = (code, signal) => finish({
      status: 'early-exit',
      reason: `browser exited before report (code ${code}, signal ${signal})`
        + (code === 21 ? '; Chrome profile is already in use' : ''),
    });
    const timer = setTimeout(() => finish({
      status: 'timeout',
      reason: `no report within ${(timeoutMs / 1000).toFixed(timeoutMs < 10000 ? 1 : 0)} s`,
    }), timeoutMs);
    child.on('error', onError);
    child.on('exit', onExit);
    // A child that died between spawn and listener attachment would
    // otherwise wait the full timeout: observe its recorded state.
    if ((child.exitCode !== null && child.exitCode !== undefined) || child.signalCode) {
      onExit(child.exitCode, child.signalCode ?? null);
    }
    Promise.resolve()
      .then(waitForReport)
      .then((report) => finish({ status: 'report', report }))
      .catch((error) => finish({
        status: 'report-error',
        reason: `report path failed: ${error?.message || error}`,
      }));
  });
}
