// tools/host-probe.js -- what can THIS machine actually do?
//
//   node tools/host-probe.js          human readable
//   node tools/host-probe.js --json   one object, for a report
//
// Run this FIRST, in any new session, on any host. It exists because the
// single largest waste in this project's history has been agents rediscovering
// their own environment: three separate sessions worked out that WSL cannot
// start Chrome, one of them recorded the wrong reason, and that wrong reason
// then stood for weeks and shaped a queue of work around it.
//
// THE TRAP IT WATCHES FOR MOST CAREFULLY IS A BROKEN INSTRUMENT. `timeout(1)`
// is denied in the sandboxed shell -- `timeout 10 echo hi` gives "Operation not
// permitted", exit 126 -- and a probe that ran THROUGH it read EPERM on Chrome
// and concluded that Windows interop was blocked. It was not; it had never
// been tested. So this file checks its own tools before it checks anything
// else, and says so loudly when one of them is unusable. A capability report
// produced with a broken instrument is worse than no report, because it gets
// believed.
//
// Every probe is bounded, spawns only its own children, and cleans up after
// itself. Nothing here kills a process it did not start.
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createServer, connect } from 'node:net';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const json = process.argv.includes('--json');
const report = { host: hostname(), at: new Date().toISOString() };
const notes = [];

const attempt = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };

// --- who and where ---------------------------------------------------------
report.platform = process.platform;
report.node = process.version;
report.cwd = process.cwd();
report.wsl = process.platform === 'linux'
  && /microsoft/i.test(attempt(() => readFileSync('/proc/version', 'utf8'), ''));
report.git = attempt(() => execFileSync('git', ['rev-parse', '--short', 'HEAD'],
  { encoding: 'utf8', timeout: 10000 }).trim(), 'unknown');

// --- the instruments, BEFORE anything is measured with them ----------------
// A probe that runs through a denied helper reports the helper's failure as
// the subject's. That has happened here and cost weeks.
report.tools = {};
for (const [name, argv] of [
  ['spawn', [process.execPath, ['-e', 'process.exit(0)']]],
  ['timeout', ['timeout', ['5', 'echo', 'hi']]],
  ['wslpath', ['wslpath', ['-w', '/tmp']]],
  ['taskkill', ['taskkill.exe', ['/?']]],
  ['powershell', ['powershell.exe', ['-NoProfile', '-Command', 'exit 0']]],
]) {
  const out = attempt(() => spawnSync(argv[0], argv[1], { timeout: 15000, stdio: 'ignore' }));
  report.tools[name] = out && !out.error && out.status !== null && out.status < 126;
}
if (!report.tools.spawn) notes.push('CANNOT SPAWN PROCESSES AT ALL: nothing below is trustworthy.');
if (!report.tools.timeout) {
  notes.push('timeout(1) is DENIED here. Do not wrap probes in it -- that is exactly '
    + 'the mistake that recorded WSL interop as blocked when it had never been tested.');
}

// --- sockets, by family, because they are denied separately ----------------
// Measured shape of the sandboxed shell: TCP yes, unix no, vsock no. Chrome
// needs AF_UNIX (socketpair) and WSL interop needs AF_VSOCK, which is why
// browser checks are unavailable there while an HTTP server works fine.
report.sockets = {};
report.sockets.tcp = await new Promise((resolve) => {
  const srv = createServer((s) => s.end('ok'));
  srv.on('error', () => resolve(false));
  srv.listen(0, '127.0.0.1', () => {
    const client = connect(srv.address().port, '127.0.0.1', () => {
      client.end(); srv.close(); resolve(true);
    });
    client.on('error', () => { srv.close(); resolve(false); });
  });
});
report.sockets.unix = await new Promise((resolve) => {
  if (process.platform === 'win32') { resolve(null); return; }   // named pipes, not comparable
  const path = join(tmpdir(), `nil-probe-${randomUUID().slice(0, 8)}.sock`);
  const srv = createServer(() => {});
  srv.on('error', () => resolve(false));
  srv.listen(path, () => {
    srv.close(() => { attempt(() => unlinkSync(path)); resolve(true); });
  });
});

// --- a browser, and whether it actually starts -----------------------------
report.browser = { found: null, starts: false, why: '' };
const candidates = [
  ...(report.wsl ? ['/mnt/c/Program Files/Google/Chrome/Application/chrome.exe'] : []),
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
];
report.browser.found = candidates.find((p) => p && attempt(() => existsSync(p), false)) || null;
if (report.browser.found && report.tools.spawn) {
  // The real question is not "is Chrome installed" but "does it start here".
  // Those answers differ in the sandbox, which is the whole story.
  const dir = join(tmpdir(), `nil-probe-${randomUUID().slice(0, 8)}`);
  const udd = report.browser.found.endsWith('.exe') && report.tools.wslpath
    ? attempt(() => execFileSync('wslpath', ['-w', dir], { encoding: 'utf8' }).trim(), dir)
    : dir;
  const out = attempt(() => spawnSync(report.browser.found,
    ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${udd}`,
      '--dump-dom', 'about:blank'],
    { timeout: 60000, encoding: 'utf8' }));
  report.browser.starts = !!out && !out.error && out.status === 0;
  if (!report.browser.starts) {
    const stderr = (out && out.stderr) || (out && out.error && out.error.message) || '';
    report.browser.why = stderr.split('\n').filter(Boolean).slice(0, 3).join(' | ').slice(0, 300);
  }
}

// --- can somebody else run it for us? --------------------------------------
// A host that cannot run a browser itself is not necessarily a host that
// cannot get a browser check done. Importing the queue rather than reading its
// heartbeat file directly keeps the staleness rule in one place.
report.checkQueue = await (async () => {
  try {
    const m = await import('./check-queue.js');
    const beat = m.workerStatus();
    return beat ? { host: beat.host, platform: beat.platform, pid: beat.pid } : false;
  } catch { return false; }
})();

// --- the verdict, which is the only line most readers need -----------------
report.browserChecks = report.browser.starts ? 'direct'
  : (report.checkQueue && report.checkQueue !== false) ? 'via check-queue'
    : 'UNAVAILABLE';

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const yn = (v) => (v === null ? 'n/a' : v ? 'yes' : 'NO');
  console.log(`host      : ${report.host} (${report.platform}${report.wsl ? ', WSL' : ''}), node ${report.node}`);
  console.log(`repo      : ${report.cwd} @ ${report.git}`);
  console.log(`tools     : spawn ${yn(report.tools.spawn)}, timeout ${yn(report.tools.timeout)}, `
    + `wslpath ${yn(report.tools.wslpath)}, taskkill ${yn(report.tools.taskkill)}`);
  console.log(`sockets   : tcp ${yn(report.sockets.tcp)}, unix ${yn(report.sockets.unix)}`);
  console.log(`chrome    : ${report.browser.found || 'not found'}`);
  console.log(`  starts  : ${yn(report.browser.starts)}${report.browser.why ? ` -- ${report.browser.why}` : ''}`);
  const q = report.checkQueue;
  console.log(`queue     : ${q && q !== true ? `worker on ${q.host} (${q.platform}), pid ${q.pid}` : 'no worker serving'}`);
  console.log('');
  console.log(report.browserChecks === 'direct'
    ? 'VERDICT: browser checks run DIRECTLY here. Use the tools as documented.'
    : report.browserChecks === 'via check-queue'
      ? 'VERDICT: browser checks run THROUGH THE QUEUE here.\n'
        + '         node tools/check-queue.js page-check --ball-lab'
      : 'VERDICT: browser checks are UNAVAILABLE here.\n'
        + '         Ask for a worker: node tools/check-queue.js --serve on a host with Chrome.\n'
        + '         Do not try to start a browser yourself; record the block and move on.');
  for (const note of notes) console.log(`\nNOTE: ${note}`);
}
