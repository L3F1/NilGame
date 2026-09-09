// node tools/play-check.js                 arena fight, 3 seeds, 3000 frames
// node tools/play-check.js --preset=hoops --frames=6000 --seeds=1 --seed=7
// node tools/play-check.js --switch        change worlds mid-run as well
// node tools/play-check.js --sw            SwiftShader instead of the driver
// node tools/play-check.js --warm          keep the shader cache
//
// PLAYS the game, rather than starting it.
//
// page-check --worlds proves that every world boots, that the menu works and
// that a handful of frames come out finite. It never plays: it never holds a
// key down for a thousand frames, never crosses a face, never has a boomerang
// out while it does. So a whole class of bug is invisible to it - the ones
// that need a fold, a carried object and an ability to line up, which is most
// of what this codebase's hard-won rules are about.
//
// The input is a seeded pseudo-random stream, so a failure replays exactly:
// note the seed from the report and run that one seed again.
//
// WHY SEVERAL SEEDS BY DEFAULT. A run that never crosses a face never touches
// the fold path, and passing on that is a false negative. But whether one
// seeded wander leaves the cell is luck, not a property of the build: a run
// that grabs the beacon (F) or holds the rope can orbit at full speed for
// three thousand frames and never fold. Failing that single run would make
// this check flaky, which is worse than not having it. So the ERROR checks
// apply to every seed, and the "did we actually exercise the fold" check
// applies to the seeds TOGETHER.
//
// It reports the STACK on any error. A crash in this engine usually surfaces
// inside a tiny shared leaf - apply(), matMul(), dist() - and the leaf's name
// tells you nothing. The caller does.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { runBrowserSession, killOwnedChild, parseReportTimeoutMs } from './browser-process.js';
import { acquireBrowserProfile } from './browser-profile.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = 8773;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};
const sw = argv.includes('--sw');
const warm = argv.includes('--warm');
const doSwitch = argv.includes('--switch');
const preset = flag('preset', 'fight');
const frames = flag('frames', '3000');
const seed0 = flag('seed', '1');
const seedCount = flag('seeds', '3');
if (!/^[a-z0-9]+$/i.test(preset) || !/^\d+$/.test(frames)
    || !/^\d+$/.test(seed0) || !/^\d+$/.test(seedCount) || Number(seedCount) < 1) {
  console.error('Usage: --preset=NAME --frames=N --seed=N --seeds=N [--switch] [--sw] [--warm] [--timeout=SECONDS]');
  process.exit(2);
}
let timeoutMs;
try {
  timeoutMs = parseReportTimeoutMs(argv);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

function findBrowser() {
  const c = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
  ];
  const hit = c.find((p) => p && existsSync(p));
  if (!hit) throw new Error('no Chrome found; install Chrome or use a host where it is available');
  return hit;
}

let done = null;
const srv = createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/__report') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { res.writeHead(200); res.end('ok'); if (done) done(JSON.parse(body)); });
    return;
  }
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(readFileSync(join(ROOT, 'index.html'), 'utf8'));
    return;
  }
  const f = join(ROOT, url);
  if (!existsSync(f)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' });
  // The probe is appended to main.js so it runs INSIDE the module scope and
  // can drive the real state, exactly as world-probe.js does.
  if (url === '/main.js') {
    res.end(`${readFileSync(f, 'utf8')}\n${readFileSync(join(ROOT, 'tools/play-probe.js'), 'utf8')}`);
  } else res.end(readFileSync(f));
});

const profile = acquireBrowserProfile({ backend: sw ? 'sw' : 'gpu', warm });
try {
  await new Promise((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(PORT, '127.0.0.1', resolve);
  });
} catch (error) {
  profile.release(false);
  throw error;
}

/** One browser session playing one seed. */
async function playSeed(seed) {
  let browserErrors = '';
  const t0 = Date.now();
  const query = `?preset=${preset}&frames=${frames}&seed=${seed}&switch=${doSwitch ? 1 : 0}`;
  const session = await runBrowserSession({
    launch: () => {
      const child = spawn(findBrowser(), [
        '--enable-logging=stderr',
        '--headless=new', `--user-data-dir=${profile.path}`,
        '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
        ...(sw ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']
               : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']),
        '--window-size=640,400', `http://127.0.0.1:${PORT}/${query}`,
      ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true,
        ...(process.platform === 'win32' ? {} : { detached: true }) });
      child.stderr.on('data', (chunk) => { browserErrors = (browserErrors + chunk).slice(-24000); });
      return child;
    },
    waitForReport: () => new Promise((resolve) => { done = resolve; }),
    timeoutMs,
    // The server is shared across seeds, so only the browser is cleaned up here.
    cleanup: async (owned) => {
      if (owned?.pid) await killOwnedChild(owned, { posixProcessGroup: process.platform !== 'win32' });
    },
  });
  done = null;
  return { session, browserErrors, seconds: (Date.now() - t0) / 1000 };
}

const first = Number(seed0);
const count = Number(seedCount);
const results = [];
let hardFailure = null;
console.log(`backend: ${sw ? 'SwiftShader' : 'real GPU'}, ${profile.reused ? 'warm' : 'COLD'} shader cache`);
console.log(`run     : preset ${preset}, ${frames} frames, seeds ${first}..${first + count - 1}${doSwitch ? ', switching worlds' : ''}`);

for (let n = 0; n < count; n++) {
  const seed = first + n;
  const { session, browserErrors, seconds } = await playSeed(seed);
  const report = session.status === 'report' ? session.report : null;
  if (!report) {
    const why = session.status === 'timeout'
      ? `the page never reported back within ${Math.round(timeoutMs / 1000)} s`
      : `the browser stopped before reporting: ${session.reason}`;
    console.log(`  seed ${seed}: FAIL ${why}`);
    const tail = browserErrors.trim().split('\n').slice(-15).join('\n');
    if (tail) console.log(tail);
    hardFailure = hardFailure || `seed ${seed}: ${why}`;
    continue;
  }
  results.push({ seed, report });
  const folds = report.crossings || 0;
  if (report.err) {
    console.log(`  seed ${seed}: FAIL ${report.where || 'the page threw'} (${seconds.toFixed(1)} s)`);
    console.log(`    error: ${report.err}`);
    if (report.stack) console.log(report.stack.split('\n').map((l) => `    ${l}`).join('\n'));
    if (report.log && report.log.length) console.log(`    last input: ${report.log.slice(-6).join(' | ')}`);
    console.log(`    replay: node tools/play-check.js --preset=${preset} --frames=${frames} --seed=${seed} --seeds=1${doSwitch ? ' --switch' : ''}`);
    hardFailure = hardFailure || `seed ${seed} threw: ${report.err}`;
  } else if (!report.hud) {
    console.log(`  seed ${seed}: FAIL the HUD is empty, so the module never ran`);
    hardFailure = hardFailure || `seed ${seed}: empty HUD`;
  } else {
    console.log(`  seed ${seed}: ok, ${folds} face crossings, ${seconds.toFixed(1)} s | ${report.hud}`);
  }
  if (session.cleanup === 'failed') {
    console.log(`  seed ${seed}: browser cleanup failed: ${session.cleanupError}`);
    hardFailure = hardFailure || `seed ${seed}: cleanup failed`;
  }
}

if (typeof srv.closeAllConnections === 'function') srv.closeAllConnections();
await new Promise((resolve) => srv.close(resolve));
profile.release(!hardFailure && process.platform === 'win32');

const folds = results.reduce((n, r) => n + (r.report.crossings || 0), 0);
const problems = [];
if (hardFailure) problems.push(hardFailure);
// Across the whole invocation, not per seed: see the note at the top.
if (!hardFailure && folds === 0) {
  problems.push(`no face crossings in any of ${count} seeds: the fold path was never `
    + 'exercised, so this run proves little - try more seeds or more frames');
}
console.log(problems.length
  ? `\nFAIL ${problems.join('; ')}`
  : `\nok   played ${count} x ${frames} frames of ${preset} across ${folds} face crossings, and nothing broke`);
process.exit(problems.length ? 1 : 0);
