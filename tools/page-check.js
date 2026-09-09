// tools/page-check.js — does the actual page actually start?
//
//   node tools/page-check.js          real GPU, cold shader cache
//   node tools/page-check.js --warm   keep the cache (fast, less thorough)
//   node tools/page-check.js --sw     SwiftShader instead of the real driver
//   node tools/page-check.js --worlds all presets, resets, menu and resolution
//   node tools/page-check.js --ball-lab editable scene-v1 E3 primitive
//
// Serves the project over HTTP and loads index.html as a REAL ES module graph,
// the way Live Server does, then lets the page run twenty frames and report on
// itself: any error, whether the boot panel fired, the first HUD line, and the
// colour of the middle pixel.
//
// It exists because nothing else covers the whole path. preview.js BUNDLES the
// modules, so it cannot see a module-loading failure; shader-check compiles the
// GLSL with no page around it; link-time.js times the driver but runs no game.
// This is the only check that answers the question the developer actually asks,
// which is "I opened it and the screen is black".
//
// It reports rather than dumps the DOM, because --dump-dom never fires here:
// the frame loop keeps the page busy for ever, so Chrome never goes idle.
//
// COLD BY DEFAULT, and that matters. Chrome caches a linked program, so the
// second load skips the driver's five-second shader build entirely - and the
// first load is where the interesting bugs live. A cold start found the frame
// clock running BACKWARDS on frame one (see main.js frame()), which a warm run
// cannot reproduce at all.

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { runBrowserSession, killOwnedChild, parseReportTimeoutMs } from './browser-process.js';
import { acquireBrowserProfile } from './browser-profile.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = 8771;
const FRAMES = 20;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const warm = process.argv.includes('--warm');
const sw = process.argv.includes('--sw');
const worlds = process.argv.includes('--worlds');
const ballLab = process.argv.includes('--ball-lab');
let timeoutMs;
try {
  timeoutMs = parseReportTimeoutMs(process.argv);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

function findBrowser() {
  const c = [
    `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
  ];
  const hit = c.find((p) => p && existsSync(p));
  if (!hit) throw new Error('no Chrome found; install Chrome or use a host where it is available');
  return hit;
}

// Everything below runs in the page. It waits FRAMES frames so the loop has
// really been round, not just started.
const probe = `
<script>
window.__err = '';
window.addEventListener('error', function (e) { window.__err = e.message || String(e.error); });
window.addEventListener('unhandledrejection', function (e) { window.__err = 'unhandled rejection: ' + e.reason; });
window.addEventListener('load', function () {
  if (${worlds}) return;
  var n = 0;
  function tick() {
    if (++n < ${FRAMES}) { requestAnimationFrame(tick); return; }
    var boot = document.getElementById('boot');
    var cv = document.getElementById('c');
    var px = 'n/a';
    try {
      var gl = cv.getContext('webgl2');
      var b = new Uint8Array(4);
      gl.readPixels(cv.width >> 1, cv.height >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b);
      px = b[0] + ',' + b[1] + ',' + b[2];
    } catch (e) { px = 'readback failed: ' + e.message; }
    fetch('/__report', { method: 'POST', body: JSON.stringify({
      err: window.__err,
      boot: boot && boot.style.display === 'block' ? boot.textContent : '',
      hud: document.getElementById('hud').textContent || '',
      px: px,
    }) });
  }
  requestAnimationFrame(tick);
});
</script>`;

let done = null;
const srv = createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/__report') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { res.writeHead(200); res.end('ok'); done(JSON.parse(body)); });
    return;
  }
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    if (ballLab) { res.end(readFileSync(join(ROOT, 'tools/ball-lab.html'), 'utf8')); return; }
    res.end(readFileSync(join(ROOT, 'index.html'), 'utf8').replace('</head>', probe + '</head>'));
    return;
  }
  const f = join(ROOT, decodeURIComponent(url));
  if (!existsSync(f)) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' });
  if (worlds && url === '/main.js') {
    res.end(readFileSync(f, 'utf8') + '\n' + readFileSync(join(ROOT, 'tools/world-probe.js'), 'utf8'));
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

// One owned session: prompt failure on spawn error or early browser exit,
// bounded wait otherwise, and cleanup of exactly this run's child plus the
// HTTP server on every completion path. See tools/browser-process.js.
let browserErrors = '';
const t0 = Date.now();
const session = await runBrowserSession({
  launch: () => {
    const child = spawn(findBrowser(), [
      '--enable-logging=stderr',
      '--headless=new', `--user-data-dir=${profile.path}`,
      '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
      ...(sw ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']
             : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']),
      ballLab ? '--window-size=960,600' : '--window-size=640,400', `http://127.0.0.1:${PORT}/${ballLab ? '?check=1' : ''}`,
    ], { stdio: ['ignore','ignore','pipe'], windowsHide: true,
      // POSIX only: the child becomes its process-group leader, so cleanup
      // owns the whole tree by construction (PID == PGID). Windows spawn
      // arguments stay exactly as verified; tree kill stays with taskkill.
      ...(process.platform === 'win32' ? {} : { detached: true }) });
    child.stderr.on('data', chunk => { browserErrors = (browserErrors + chunk).slice(-24000); });
    return child;
  },
  waitForReport: () => new Promise((resolve) => { done = resolve; }),
  timeoutMs,
  cleanup: async (owned) => {
    try {
      if (owned?.pid) {
        await killOwnedChild(owned, { posixProcessGroup: process.platform !== 'win32' });
      }
    } finally {
      if (typeof srv.closeAllConnections === 'function') srv.closeAllConnections();
      await new Promise((resolve) => srv.close(resolve));
    }
  },
});
const report = session.status === 'report' ? session.report : null;
// POSIX group cleanup is now established, but warm publication stays
// Windows-only until the lead reviews group-exit evidence.
profile.release(session.status === 'report' && session.cleanup === 'ok' && process.platform === 'win32');

console.log(`backend: ${sw ? 'SwiftShader' : 'real GPU'}, ${profile.reused ? 'warm' : 'COLD'} shader cache`);
console.log(`test profile: ${profile.path}`);
if (!report) {
  if (session.status === 'timeout') {
    console.log(`FAIL the page never reported back within ${Math.round(timeoutMs / 1000)} s.`);
    console.log('     Either it threw before the frame loop, or the driver is');
    console.log('     still building the shader - try node tools/link-time.js.');
  } else {
    console.log(`FAIL the browser stopped before reporting: ${session.reason}`);
    const tail = browserErrors.trim().split('\n').slice(-15).join('\n');
    if (tail) console.log(tail);
  }
  if (session.cleanup === 'failed') console.log(`     Browser cleanup also failed: ${session.cleanupError}`);
  process.exit(1);
}

const first = (report.hud || '').split('\n')[0].trim();
console.log(`${ballLab ? 'ball editor checks' : worlds ? 'world suite time' : `time to ${FRAMES} frames`} : ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log('page error        :', report.err || '(none)');
console.log('boot panel        :', report.boot ? report.boot.split('\n').slice(0, 3).join(' / ') : '(hidden - good)');
console.log('hud first line    :', first || '(EMPTY - the module never ran)');
console.log('centre pixel      :', report.px);
if (report.checks) console.log(`${ballLab ? 'ball editor' : 'world/input'} checks : ${report.checks.length} passed`);

const problems = [];
if (report.err) problems.push('the page threw');
if (report.err) console.log(browserErrors.split('\n').filter(line=>/GL_INVALID|D3D|shader|error X|compile/i.test(line)).join('\n'));
if (report.boot) problems.push('the boot panel fired');
if (!first) problems.push('the HUD is empty, so the module never ran');
// NaN in the HUD means the physics has already destroyed itself, which draws a
// perfectly normal-looking picture and is completely unplayable.
if (/NaN/.test(report.hud || '')) problems.push('the HUD reads NaN - the physics blew up');
// A clean page with a failed cleanup is not a pass: report it, keep exit nonzero.
if (session.cleanup === 'failed') problems.push(`browser cleanup failed: ${session.cleanupError}`);

console.log(problems.length
  ? `\nFAIL ${problems.join('; ')}`
  : `\nok   ${ballLab ? 'ball editor checks passed' : worlds ? 'all world transitions and input checks passed' : `the page started, ran ${FRAMES} frames, and its numbers are finite`}`);
process.exit(problems.length ? 1 : 0);
