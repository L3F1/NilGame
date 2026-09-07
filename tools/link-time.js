// tools/link-time.js — how long the REAL driver takes to build the shader.
//
//   node tools/link-time.js
//
// shader-check answers "is this valid GLSL". This answers "will the browser
// survive compiling it", which is a completely different question and the one
// that actually broke the page.
//
// On Windows the browser runs ANGLE: the GLSL becomes HLSL at compile time,
// and the Direct3D compiler runs at LINK time. That compiler inlines every
// call and unrolls every countable loop, so a function called five times is
// five copies, and a loop over the level is the level once per primitive. The
// scene program once took 212 SECONDS to link this way. Chrome kills a GPU
// process that unresponsive, and a killed link reports LINK_STATUS false with
// an EMPTY info log - which looks exactly like a syntax error and is not one.
//
// shader-check cannot see any of this. It runs SwiftShader, which has no HLSL
// back end and linked that same 212-second shader in about a second. Only a
// real driver shows it, which is why this tool exists separately and asks for
// the GPU explicitly.
//
// Exit 0 if every program links under BUDGET seconds. No dependencies: Node
// builtins plus the Chrome you already have.

import { writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Chrome's GPU watchdog is the real limit. Past BUDGET the page is one slow
// machine away from dying with an empty error; WARN is where to start looking.
//
// The shader legitimately sits around seven seconds, so a warning below that
// is noise - the first version of this file warned at 5 and cried wolf on its
// own baseline. WARN is set with real headroom under the failure instead.
const BUDGET = 15;
const WARN = 10;

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function findBrowser() {
  const c = [
    `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
  ];
  const hit = c.find((p) => p && existsSync(p));
  if (!hit) { console.error('no Chrome or Edge found; edit findBrowser()'); process.exit(2); }
  return hit;
}

let mod;
try {
  mod = await import(pathToFileURL(join(ROOT, 'shader.js')).href);
} catch (e) {
  console.error('FAIL shader.js did not load as JavaScript.\n');
  console.error(e.message);
  process.exit(1);
}

const programs = [
  ['scene', mod.VERT, mod.FRAG],
  ['lines', mod.LINE_VERT, mod.LINE_FRAG],
];

const script = `
const P = ${JSON.stringify(programs)};
const BUDGET = ${BUDGET};
const WARN = ${WARN};
const NL = String.fromCharCode(10);
const out = [];
try {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) throw new Error('no webgl2 - rerun with a real GPU available');
  const d = gl.getExtension('WEBGL_debug_renderer_info');
  out.push('driver: ' + (d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)));
  for (const [name, V, F] of P) {
    const mk = (t, s) => {
      const sh = gl.createShader(t);
      gl.shaderSource(sh, s);
      const a = performance.now();
      gl.compileShader(sh);
      const ms = performance.now() - a;
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        out.push('FAIL ' + name + ' did not compile'); out.push(gl.getShaderInfoLog(sh));
        return null;
      }
      return [sh, ms];
    };
    const vs = mk(gl.VERTEX_SHADER, V);
    const fs = mk(gl.FRAGMENT_SHADER, F);
    if (!vs || !fs) continue;
    const p = gl.createProgram();
    gl.attachShader(p, vs[0]); gl.attachShader(p, fs[0]);
    const a = performance.now();
    gl.linkProgram(p);
    const ok = gl.getProgramParameter(p, gl.LINK_STATUS);
    const secs = (performance.now() - a) / 1000;
    if (!ok) {
      const log = (gl.getProgramInfoLog(p) || '').trim();
      out.push('FAIL ' + name + ' did not link after ' + secs.toFixed(1) + ' s');
      out.push(log || '     (empty info log - the GPU process was killed under it)');
      continue;
    }
    const tag = secs > BUDGET ? 'FAIL' : (secs > WARN ? 'WARN' : 'ok  ');
    out.push(tag + ' ' + name + ': compile '
      + (vs[1] + fs[1]).toFixed(0) + ' ms, link ' + secs.toFixed(1) + ' s');
    if (secs > WARN) {
      out.push('     Something is being inlined or unrolled more than once.');
      out.push('     See the inlining rule in CLAUDE.md, Rendering gotchas.');
    }
  }
} catch (e) { out.push('FAIL ' + e.message); }
document.getElementById('o').textContent = 'BEGIN' + NL + out.join(NL) + NL + 'END';
`;

const dir = mkdtempSync(join(tmpdir(), 'linktime-'));
const file = join(dir, 'check.html');
writeFileSync(file,
  '<!DOCTYPE html><meta charset="utf-8"><body><pre id="o"></pre><scr'
  + 'ipt>' + script + '</scr' + 'ipt></body>', 'utf8');

let dump = '';
try {
  dump = execFileSync(findBrowser(), [
    '--headless=new',
    `--user-data-dir=${join(dir, 'profile')}`,
    '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-sync', '--disable-extensions',
    // The whole point: the real back end, NOT SwiftShader.
    '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist',
    '--virtual-time-budget=600000', '--dump-dom',
    'file:///' + file.replace(/\\/g, '/'),
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 600000 });
} catch (e) {
  console.error('browser failed to run:', e.killed ? 'timed out after 10 minutes' : `exit ${e.status}`);
  console.error('a timeout here IS the bug: the driver never finished linking.');
  process.exit(2);
}

const m = dump.replace(/\r\n/g, '\n').match(/BEGIN\n([\s\S]*?)\nEND/);
if (!m) { console.error('no result from the browser'); process.exit(2); }
const report = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
console.log(report);
process.exit(/^FAIL/m.test(report) ? 1 : 0);
