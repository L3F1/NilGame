// tools/page-check.js — does the actual page actually start?
//
//   node tools/page-check.js          real GPU, cold shader cache
//   node tools/page-check.js --warm   keep the cache (fast, less thorough)
//   node tools/page-check.js --sw     SwiftShader instead of the real driver
//   node tools/page-check.js --worlds all presets, resets, menu and resolution
//   node tools/page-check.js --ball-lab editable scene-v1 E3 primitive
//   node tools/page-check.js --region-lab the single-region S3 viewport
//   node tools/page-check.js --spherical-cover whole-S3 ball sight and loop
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
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { runBrowserSession, killOwnedChild, parseReportTimeoutMs } from './browser-process.js';
import { acquireBrowserProfile } from './browser-profile.js';
import {
  findBrowser, isWindowsExe, hostPathForBrowser, runStamp, killWindowsBrowserTree,
} from './browser-host.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = 8771;
const FRAMES = 20;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const warm = process.argv.includes('--warm');
const sw = process.argv.includes('--sw');
const worlds = process.argv.includes('--worlds');
const ballLab = process.argv.includes('--ball-lab');
const regionLab = process.argv.includes('--region-lab');
const threeGeometry = process.argv.includes('--three-geometry');
const connectedGlobal = process.argv.includes('--connected-global') || threeGeometry;
const h3Gpu = process.argv.includes('--h3-gpu');
const connectedPreview = process.argv.includes('--connected-preview') || connectedGlobal;
const sphericalCover = process.argv.includes('--spherical-cover');
const lab = ballLab || regionLab || connectedPreview || sphericalCover || h3Gpu;
let timeoutMs;
try {
  timeoutMs = parseReportTimeoutMs(process.argv);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

// Browser discovery, path translation and the WSL interop route now live in
// tools/browser-host.js, which documents why a Windows Chrome is preferred
// from WSL and why its cleanup has to cross back to the Windows side.

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
    if (h3Gpu) { res.end(readFileSync(join(ROOT,'tools/h3-gpu-probe.html'),'utf8')); return; }
    if (ballLab) { res.end(readFileSync(join(ROOT, 'tools/ball-lab.html'), 'utf8')); return; }
    if (regionLab) { res.end(readFileSync(join(ROOT, 'tools/region-lab.html'), 'utf8')); return; }
    if (connectedPreview) { res.end(readFileSync(join(ROOT, connectedGlobal?'tools/connected-global-preview.html':'tools/connected-preview.html'), 'utf8')); return; }
    if (sphericalCover) { res.end(readFileSync(join(ROOT, 'tools/spherical-cover.html'), 'utf8')); return; }
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
// INTEROP. On WSL the Linux Chrome cannot start at all (seccomp denies
// socketpair), so we launch the WINDOWS Chrome, which runs outside that
// sandbox. Two consequences, both handled rather than hoped over: the profile
// path has to be handed over in Windows form, and the process tree that needs
// cleaning up is on the Windows side, where a Linux signal cannot reach it.
const browser = findBrowser();
const crossHost = isWindowsExe(browser) && process.platform !== 'win32';
const stamp = crossHost ? runStamp() : null;
if (crossHost) console.log('browser           : Windows Chrome via WSL interop');

const session = await runBrowserSession({
  launch: () => {
    const child = spawn(browser, [
      '--enable-logging=stderr',
      ...(stamp ? [stamp] : []),
      '--headless=new', `--user-data-dir=${hostPathForBrowser(profile.path, browser)}`,
      '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
      ...(sw ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']
             : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']),
      lab ? '--window-size=960,600' : '--window-size=640,400', `http://127.0.0.1:${PORT}/${lab ? '?check=1'+(threeGeometry?'&preset=three':'') : ''}`,
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
      // Killing the interop stub does NOT reap the Windows tree -- measured,
      // 11 processes survived both SIGTERM and SIGKILL to the Linux child. So
      // cross back and kill exactly the tree carrying this run's stamp. The
      // result is REPORTED rather than escalated: if something survives, say
      // so, do not widen the match until it dies.
      if (stamp) {
        const swept = killWindowsBrowserTree(stamp);
        if (!swept.killed && swept.remaining !== 0) {
          console.error(`WARNING: ${swept.remaining} browser process(es) from this run `
            + `survived cleanup (${swept.reason || `root pid ${swept.root}`}).`);
        }
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
if(h3Gpu&&report.h3Evidence){
  mkdirSync(join(ROOT,'.agent-bridge'),{recursive:true});
  writeFileSync(join(ROOT,'.agent-bridge',sw?'h3-gpu-sw.json':'h3-gpu-real.json'),JSON.stringify(report.h3Evidence,null,2));
}
const label = sphericalCover ? 'whole-S3 GPU check' : connectedPreview ? 'connected GPU preview check' : ballLab ? 'ball editor checks' : regionLab ? 'S3 viewport checks' : worlds ? 'world suite time' : `time to ${FRAMES} frames`;
console.log(`${label} : ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log('page error        :', report.err || '(none)');
console.log('boot panel        :', report.boot ? report.boot.split('\n').slice(0, 3).join(' / ') : '(hidden - good)');
console.log('hud first line    :', first || '(EMPTY - the module never ran)');
if (!connectedPreview && !sphericalCover) console.log('centre pixel      :', report.px);
if (connectedPreview) console.log('preview renderer  : WebGL2 analytic connected rays, CPU motion');
if (sphericalCover) console.log('preview renderer  : WebGL2 whole-S3 first ball hit over 2πR, CPU authority');
if (report.checks) console.log(`${sphericalCover ? 'whole-S3 GPU' : connectedPreview ? 'connected GPU preview' : ballLab ? 'ball editor' : regionLab ? 'S3 viewport' : 'world/input'} checks : ${report.checks.length} passed`);
if(report.connectedGlobalEvidence)report.connectedEvidence=report.connectedGlobalEvidence;
if(report.connectedEvidence){
  mkdirSync(join(ROOT,'.agent-bridge'),{recursive:true});
  writeFileSync(join(ROOT,'.agent-bridge',threeGeometry?(sw?'three-editor-sw.json':'three-editor-real.json'):connectedGlobal?'connected-global-gpu-evidence.json':'connected-gpu-evidence.json'),JSON.stringify(report.connectedEvidence,null,2));
  for(const r of report.connectedEvidence){
    if(r.label)console.log('parity:',JSON.stringify(r.label==='gallery-entry-ray-census'?{...r,document:undefined,pose:undefined,samples:r.samples.length}:r));
    if(r.gpuMs){const sorted=[...r.gpuMs].sort((a,b)=>a-b);console.log(`GPU ${r.pose}: ${r.hardware}, ${r.resolution.width}x${r.resolution.height}, samples ${sorted.length}, median ${sorted[Math.floor(sorted.length/2)]}, p90 ${sorted[Math.floor(sorted.length*.9)]} ms`);}
  }
}
if (report.sphericalEvidence) {
  mkdirSync(join(ROOT, '.agent-bridge'), { recursive: true });
  writeFileSync(join(ROOT, '.agent-bridge', 'spherical-cover-evidence.json'), JSON.stringify(report.sphericalEvidence, null, 2));
  for (const r of report.sphericalEvidence) {
    if (r.label) console.log('parity:', JSON.stringify({ ...r, position: undefined }));
    if (r.loop) console.log('loop  :', JSON.stringify(r.loop));
    if (r.hardware) console.log('gpu               :', r.hardware);
  }
}
// Frame time is only meaningful with the hardware and the resolution beside
// it, so the page reports all three together or none of them.
if (report.timing) {
  const t = report.timing;
  console.log(`gpu               : ${t.vendor} / ${t.renderer}`);
  console.log(`frame time        : ${(t.totalMs / t.frames).toFixed(2)} ms over ${t.frames} frames`
    + ` at ${t.resolution[0]}x${t.resolution[1]}, ${t.steps} march steps`);
  console.log(`uniform capacity  : ${t.fragmentUniformVectors} fragment vectors available`
    + `; scene narrowed to float32 by at most ${t.narrowing === null ? 'n/a' : t.narrowing.toExponential(2)}`);
}
// SCREENSHOTS, when the page offers them. Numeric checks pass happily on a
// view that is upside down or drawing the floor above the horizon -- that is
// not hypothetical, it happened here and only a picture caught it.
//
// A page returns `shot` as a data URL for one picture, or `shots` as a list
// of { name, data } when there is more than one thing worth looking at. One
// feature landing should not cost the picture that proved the last one.
const pictures = report.shots?.length ? report.shots
  : report.shot ? [{ name: '', data: report.shot }] : [];
for (const pic of pictures) {
  const base = resolve(process.env.SHOT || 'page-check-shot.png');
  const at = pic.name ? base.replace(/\.png$/, `-${pic.name}.png`) : base;
  writeFileSync(at, Buffer.from(pic.data.split(',')[1], 'base64'));
  console.log('screenshot        :', at);
}

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
  : `\nok   ${sphericalCover ? 'whole-S3 CPU/GPU parity, closure and loop checks passed' : connectedPreview ?'connected GPU preview and CPU motion checks passed' : ballLab ? 'ball editor checks passed' : regionLab ? 'S3 viewport checks passed' : worlds ? 'all world transitions and input checks passed' : `the page started, ran ${FRAMES} frames, and its numbers are finite`}`);
process.exit(problems.length ? 1 : 0);
