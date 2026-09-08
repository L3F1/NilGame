// tools/page-check.js — does the actual page actually start?
//
//   node tools/page-check.js          real GPU, cold shader cache
//   node tools/page-check.js --warm   keep the cache (fast, less thorough)
//   node tools/page-check.js --sw     SwiftShader instead of the real driver
//   node tools/page-check.js --worlds all presets, resets, menu and resolution
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
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = 8771;
const FRAMES = 20;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const warm = process.argv.includes('--warm');
const sw = process.argv.includes('--sw');
const worlds = process.argv.includes('--worlds');

function findBrowser() {
  const c = [
    `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
  ];
  const hit = c.find((p) => p && existsSync(p));
  if (!hit) { console.error('no Chrome found; edit findBrowser()'); process.exit(2); }
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
await new Promise((r) => srv.listen(PORT, r));

const profile = join(tmpdir(), `pagecheck-${sw ? 'sw' : 'gpu'}`);
if (!warm) { try { rmSync(profile, { recursive: true, force: true }); } catch { /* first run */ } }

const child = spawn(findBrowser(), [
  '--enable-logging=stderr',
  '--headless=new', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  ...(sw ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']
         : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']),
  '--window-size=640,400', `http://127.0.0.1:${PORT}/`,
], { stdio: ['ignore','ignore','pipe'], windowsHide: true });
let browserErrors = '';
child.stderr.on('data', chunk => { browserErrors = (browserErrors + chunk).slice(-24000); });

const t0 = Date.now();
const report = await new Promise((resolve) => {
  done = resolve;
  setTimeout(() => resolve(null), 300000);
});
child.kill();
srv.close();

console.log(`backend: ${sw ? 'SwiftShader' : 'real GPU'}, ${warm ? 'warm' : 'COLD'} shader cache`);
if (!report) {
  console.log('FAIL the page never reported back within 300 s.');
  console.log('     Either it threw before the frame loop, or the driver is');
  console.log('     still building the shader - try node tools/link-time.js.');
  process.exit(1);
}

const first = (report.hud || '').split('\n')[0].trim();
console.log(`${worlds ? 'world suite time' : `time to ${FRAMES} frames`} : ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log('page error        :', report.err || '(none)');
console.log('boot panel        :', report.boot ? report.boot.split('\n').slice(0, 3).join(' / ') : '(hidden - good)');
console.log('hud first line    :', first || '(EMPTY - the module never ran)');
console.log('centre pixel      :', report.px);
if (report.checks) console.log(`world/input checks : ${report.checks.length} passed`);

const problems = [];
if (report.err) problems.push('the page threw');
if (report.err) console.log(browserErrors.split('\n').filter(line=>/GL_INVALID|D3D|shader|error X|compile/i.test(line)).join('\n'));
if (report.boot) problems.push('the boot panel fired');
if (!first) problems.push('the HUD is empty, so the module never ran');
// NaN in the HUD means the physics has already destroyed itself, which draws a
// perfectly normal-looking picture and is completely unplayable.
if (/NaN/.test(report.hud || '')) problems.push('the HUD reads NaN - the physics blew up');

console.log(problems.length
  ? `\nFAIL ${problems.join('; ')}`
  : `\nok   ${worlds ? 'all world transitions and input checks passed' : `the page started, ran ${FRAMES} frames, and its numbers are finite`}`);
process.exit(problems.length ? 1 : 0);
