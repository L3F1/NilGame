// tools/browser-host.js -- running a real browser from a host that cannot.
//
// THE PROBLEM THIS SOLVES. Agents working in the sandboxed WSL shell cannot
// start Chrome at all: the sandbox denies `socketpair(2)`, which Chrome needs
// before it does anything, and no flag avoids it. Measured there:
// `google-chrome --headless --dump-dom about:blank` with an explicit
// `--user-data-dir` gives `socketpair: Operation not permitted` and a
// `Trace/breakpoint trap`, and it persists under
// `--no-sandbox --single-process --disable-crashpad --disable-dev-shm-usage`.
// That is a seccomp policy in the harness, not something this repository can
// configure, so every browser check was simply unavailable from WSL.
//
// THE WAY THROUGH. WSL can execute Windows binaries, and the WINDOWS Chrome
// runs outside the Linux sandbox entirely. Measured on this machine:
//
//   - `/mnt/c/Program Files/Google/Chrome/Application/chrome.exe` launches
//     from WSL and exits 0. No EPERM.
//   - It reaches a Node server bound to 127.0.0.1 INSIDE WSL, which is what
//     `page-check.js` binds. WSL2's localhost forwarding covers it, and the
//     explicit 127.0.0.1 case was tested rather than assumed from `localhost`.
//   - `taskkill.exe` and `wslpath` are both on PATH from WSL.
//
// An earlier probe read EPERM on `chrome.exe` through WSL interop and recorded
// interop as blocked. That reading was an artifact: `timeout(1)` is itself
// broken in that sandbox (`timeout 10 echo hi` -> Operation not permitted,
// exit 126), and the probe ran through it. Interop was never actually tested.
//
// THE TRAP, and the reason this file exists rather than three lines in
// page-check. Killing the WSL-side child does NOT reap the Windows Chrome.
// Measured: 11 processes belonging to one run survived both SIGTERM and
// SIGKILL to the Linux child, because that child is an interop stub and the
// real process tree lives on the Windows side. A naive port of the launch
// leaks an entire browser tree per run, on the user's own desktop.
//
// So cleanup has to cross back. It does that WITHOUT any blanket matching, per
// the standing rule that only a test's own process tree may be cleaned up:
// each run stamps a unique inert switch onto Chrome's command line, the root
// of the tree carrying that stamp is resolved by exact match, and the tree is
// killed by PID. Nothing is matched by image name, and a run can never see
// another run's browser, let alone the user's own.
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const POWERSHELL = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';

/** True inside WSL, where Windows binaries are reachable through interop. */
export function isWsl() {
  if (process.platform !== 'linux') return false;
  try { return /microsoft/i.test(readFileSync('/proc/version', 'utf8')); }
  catch { return false; }
}

/** A browser we launch as a Windows process, whatever platform we are on. */
export const isWindowsExe = (path) => /\.exe$/i.test(path);

/**
 * Where Chrome might be, most specific first.
 *
 * On WSL the Windows locations come FIRST and deliberately: a Linux Chrome may
 * well be installed and it is the one that cannot start. Preferring it would
 * reproduce the block this module exists to route around.
 *
 * `wsl` is injectable so the ordering can be tested on any host. Reading the
 * environment inside the function is exactly how the last platform bug got a
 * test that could only fail on one machine.
 */
export function browserCandidates({ wsl = isWsl() } = {}) {
  const windows = [
    `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  ];
  const posix = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
  ];
  if (!wsl) return [...windows, ...posix];
  return [
    '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
    '/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    ...posix,
  ];
}

/** The first candidate that exists. Throws with the list it looked through. */
export function findBrowser(candidates = browserCandidates()) {
  const hit = candidates.find((p) => p && existsSync(p));
  if (!hit) {
    throw new Error('no Chrome found; install Chrome or use a host where it is '
      + `available. Looked in:\n  ${candidates.filter(Boolean).join('\n  ')}`);
  }
  return hit;
}

/**
 * A path the BROWSER can open, which is not always a path we can open.
 *
 * A Windows Chrome launched from WSL is handed `--user-data-dir`, and it reads
 * that as a Windows path. `/tmp/x` would be created relative to the Windows
 * drive root, silently, somewhere nobody looks.
 */
export function hostPathForBrowser(path, browser) {
  if (!isWindowsExe(browser) || process.platform === 'win32') return path;
  return execFileSync('wslpath', ['-w', path], { encoding: 'utf8' }).trim();
}

/**
 * A unique, inert command-line stamp identifying one run's browser.
 *
 * Chrome ignores switches it does not know, so this changes no behaviour; it
 * exists purely so cleanup can find exactly this run's processes and nothing
 * else. A per-run stamp rather than the profile path because a WARM leased
 * profile is shared between runs by design, and matching on it could reach
 * into a concurrent run's browser.
 */
export const runStamp = () => `--nilgame-run-id=${randomUUID()}`;

function powershell(script) {
  return execFileSync(POWERSHELL, ['-NoProfile', '-Command', script],
    { encoding: 'utf8', timeout: 30000 }).replace(/\r/g, '').trim();
}

/**
 * The root Windows PID of the browser tree carrying `stamp`, or null.
 *
 * "Root" is the tagged process whose parent is not itself tagged: Chrome
 * spawns renderer and GPU children that inherit the command line, and killing
 * a renderer leaves the browser running.
 */
export function findWindowsBrowserRoot(stamp) {
  const quoted = stamp.replace(/'/g, "''");
  const out = powershell(
    `$all = @(Get-CimInstance Win32_Process -Filter 'Name="chrome.exe"' `
    + `| Where-Object { $_.CommandLine -like '*${quoted}*' }); `
    + '$ids = $all.ProcessId; '
    + '($all | Where-Object { $ids -notcontains $_.ParentProcessId } '
    + '| Select-Object -First 1).ProcessId');
  const pid = Number.parseInt(out, 10);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

/** How many processes still carry `stamp`. Used to VERIFY a cleanup, not to do one. */
export function countWindowsBrowser(stamp) {
  const quoted = stamp.replace(/'/g, "''");
  const out = powershell(
    `@(Get-CimInstance Win32_Process -Filter 'Name="chrome.exe"' `
    + `| Where-Object { $_.CommandLine -like '*${quoted}*' }).Count`);
  const n = Number.parseInt(out, 10);
  return Number.isInteger(n) ? n : -1;
}

/**
 * Kill exactly the browser tree this run started on the Windows side.
 *
 * Returns what happened rather than throwing, because this runs in a `finally`
 * and losing the real error to a cleanup failure would be worse than the leak.
 * The count afterwards is REPORTED, never swept: if something survives, the
 * caller says so out loud instead of widening the match until it dies.
 */
export function killWindowsBrowserTree(stamp) {
  let root = null;
  try { root = findWindowsBrowserRoot(stamp); }
  catch (error) { return { killed: false, reason: `could not resolve: ${error.message}` }; }
  if (root === null) return { killed: false, reason: 'nothing carried the stamp', remaining: 0 };
  try {
    execFileSync('taskkill.exe', ['/PID', String(root), '/T', '/F'],
      { stdio: 'ignore', timeout: 30000 });
  } catch (error) {
    // taskkill exits non-zero when the tree already went away on its own, so
    // the exit code is not the answer. The count below is.
  }
  let remaining = -1;
  try { remaining = countWindowsBrowser(stamp); } catch { /* reported as -1 */ }
  return { killed: remaining === 0, root, remaining };
}
