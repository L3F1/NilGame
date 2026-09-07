// tools/shader-check.js — compile the shaders without opening a browser.
//
//   node tools/shader-check.js
//
// Imports shader.js and compiles what it actually produces in headless
// Chrome. The compiler is ANGLE, the same one the browser uses when you load
// the page for real, so anything this accepts the page accepts. Prints the
// info log on failure. Exit 0 = clean.
//
// It imports rather than scraping the source, so the generated level GLSL is
// checked as generated, and a JS-level break (say a backtick that ends a
// template literal early) surfaces here as an import error naming the file
// and line — which is the other, indistinguishable cause of a black screen.
//
// No dependencies: Node builtins plus the Chrome you already have. Nothing in
// the game imports this; delete tools/ and nothing breaks.

import { writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function findBrowser() {
  const c = [
    `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
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
  console.error('FAIL shader.js did not even load as JavaScript, so the shader');
  console.error('     was never reached. A backtick inside a shader comment ends');
  console.error('     the template literal and does exactly this.\n');
  console.error(e.message);
  process.exit(1);
}

const programs = [
  ['scene (hyperbolic)', mod.VERT, mod.fragFor('h3')],
  // Every geometry is a SEPARATE program, because which one it is is a
  // #define and not a uniform. Each has to be checked and timed on its own:
  // they are what the Curvature option links, and nothing else here would
  // ever look at them.
  ['scene (spherical)', mod.VERT, mod.fragFor('s3')],
  ['scene (H^2 x R)', mod.VERT, mod.fragFor('h2r')],
  ['scene (S^2 x R)', mod.VERT, mod.fragFor('s2r')],
  ['lines', mod.LINE_VERT, mod.LINE_FRAG],
];

const page = `<!DOCTYPE html><meta charset="utf-8"><body><pre id="o"></pre><script>
const PROGRAMS = ${JSON.stringify(programs)};
const out = [];
try {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) throw new Error('no webgl2');
  for (const [name, V, F] of PROGRAMS) {
    const mk = (t, s, label) => {
      const sh = gl.createShader(t);
      gl.shaderSource(sh, s); gl.compileShader(sh);
      const log = (gl.getShaderInfoLog(sh) || '').trim();
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        out.push('FAIL ' + label + ' did not compile'); out.push(log); return null;
      }
      if (log) out.push('WARN ' + label + ': ' + log);
      return sh;
    };
    const vs = mk(gl.VERTEX_SHADER, V, name + ' vertex');
    const fs = mk(gl.FRAGMENT_SHADER, F, name + ' fragment');
    if (!vs || !fs) continue;
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      out.push('FAIL ' + name + ' link'); out.push((gl.getProgramInfoLog(p) || '').trim());
      continue;
    }
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS), names = [];
    for (let i = 0; i < n; i++) names.push(gl.getActiveUniform(p, i).name);
    // A uniform the compiler dropped is missing here. That is the usual
    // reason a shader that "works" quietly ignores one of its inputs.
    out.push('ok   ' + name + ': compiled and linked; uniforms: ' + (names.join(' ') || '(none)'));
  }
} catch (e) { out.push('FAIL ' + e.message); }
document.getElementById('o').textContent = 'BEGIN\\n' + out.join('\\n') + '\\nEND';
</script></body>`;

const dir = mkdtempSync(join(tmpdir(), 'shadercheck-'));
const file = join(dir, 'check.html');
writeFileSync(file, page, 'utf8');

let dump = '';
try {
  dump = execFileSync(findBrowser(), [
    '--headless=new',
    `--user-data-dir=${join(dir, 'profile')}`,
    '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-sync', '--disable-extensions',
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--virtual-time-budget=5000', '--dump-dom',
    'file:///' + file.replace(/\\/g, '/'),
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 120000 });
} catch (e) {
  console.error('browser failed to run:', e.killed ? 'timed out' : `exit ${e.status}`);
  process.exit(2);
}

const m = dump.replace(/\r\n/g, '\n').match(/BEGIN\n([\s\S]*?)\nEND/);
if (!m) { console.error('no result from the browser'); process.exit(2); }
const report = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
console.log(report);
process.exit(/^FAIL/m.test(report) ? 1 : 0);
