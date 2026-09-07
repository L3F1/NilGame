// tools/sdf-check.js — do the JS and GLSL level SDFs agree?
//
//   node tools/sdf-check.js
//
// Samples stay inside the fundamental octagon, which is the only region the
// renderer evaluates: the ray teleports across faces instead of leaving.
//
// level.js implements the level twice: once in JS for the physics, once as
// GLSL for the renderer. They share their numbers, but not their arithmetic.
// If they drift apart the grapple latches onto surfaces that are not drawn
// and passes through ones that are, and nothing about the picture says so.
//
// This evaluates the real GLSL levelMap on the GPU at a few thousand points
// and compares against the real JS levelMap. Run it after touching either.

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

const { levelGLSL, domainMap } = await import(pathToFileURL(join(ROOT, 'level.js')).href);
const { fromFloor, domainDepth } = await import(pathToFileURL(join(ROOT, 'hyp.js')).href);

// Deterministic sample points across the play volume, so a failure repeats.
// They must lie ON the hyperboloid, so they are built from floor coordinates
// rather than scattered in the ambient R^4.
const N = 16 * 16, BATCHES = 12;
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const batches = [];
for (let b = 0; b < BATCHES; b++) {
  const pts = [];
  for (let i = 0; i < N; i++) {
    // Inside the fundamental octagon, because that is the only region the
    // renderer ever evaluates: its ray teleports across a face rather than
    // walking out of one, so a single-copy SDF is all it is ever handed.
    // Rejection sampling, with a small margin off the faces.
    let q;
    do {
      q = fromFloor(rnd() * 3 - 1.5, rnd() * 3 - 1.5, rnd() * 2.0 - 0.3);
    } while (domainDepth(q) < 0.02);
    pts.push(q);
  }
  batches.push(pts);
}

const FRAG = `#version 300 es
precision highp float;
uniform vec4 uPts[${N}];
out vec4 outColor;

float mdot(vec4 a, vec4 b) { return a.x*b.x + a.y*b.y + a.z*b.z - a.w*b.w; }
float hHeight(vec4 p) { return asinh(p.z); }
// The level GLSL branches on uOpen; this check runs the BOUNDED world, and
// the JS side is left in its default BOUNDED mode to match.
const float uOpen = 0.0;
const float uSolid = 0.0;   // the octagon world; see the note above
float hDist(vec4 p, vec4 q) {
  vec4 w = p - q;
  return 2.0 * asinh(sqrt(max(mdot(w, w), 0.0)) * 0.5);
}
${levelGLSL()}
void main() {
  int i = int(gl_FragCoord.y) * 16 + int(gl_FragCoord.x);
  vec2 m = domainMap(uPts[i]);
  outColor = vec4(m.x, m.y, 0.0, 1.0);
}`;

const page = `<!DOCTYPE html><meta charset="utf-8"><body><pre id="o"></pre><script>
const BATCHES = ${JSON.stringify(batches)};
const FRAG = ${JSON.stringify(FRAG)};
const VERT = "#version 300 es\\nin vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
const out = [];
try {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) throw new Error('no webgl2');
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('no float render targets');
  const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  gl.useProgram(p);

  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  const al = gl.getAttribLocation(p, 'a');
  gl.enableVertexAttribArray(al); gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, 16, 16);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.viewport(0, 0, 16, 16);

  const loc = gl.getUniformLocation(p, 'uPts');
  const px = new Float32Array(16 * 16 * 4);
  const all = [];
  for (const pts of BATCHES) {
    gl.uniform4fv(loc, new Float32Array(pts.flat()));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.readPixels(0, 0, 16, 16, gl.RGBA, gl.FLOAT, px);
    all.push(Array.from(px).filter((_, i) => i % 4 < 2));
  }
  out.push('DATA ' + JSON.stringify(all));
} catch (e) { out.push('FAIL ' + e.message); }
document.getElementById('o').textContent = 'BEGIN\\n' + out.join('\\n') + '\\nEND';
</script></body>`;

const dir = mkdtempSync(join(tmpdir(), 'sdfcheck-'));
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
    '--virtual-time-budget=8000', '--dump-dom',
    'file:///' + file.replace(/\\/g, '/'),
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 180000 });
} catch (e) {
  console.error('browser failed:', e.killed ? 'timed out' : `exit ${e.status}`);
  process.exit(2);
}

const m = dump.replace(/\r\n/g, '\n').match(/BEGIN\n([\s\S]*?)\nEND/);
if (!m) { console.error('no result from the browser'); process.exit(2); }
if (m[1].startsWith('FAIL')) { console.error(m[1]); process.exit(1); }

const gpu = JSON.parse(m[1].replace(/^DATA /, '').replace(/&quot;/g, '"'));
let worst = 0, worstAt = null, matMismatch = 0, checked = 0;
for (let b = 0; b < batches.length; b++) {
  for (let i = 0; i < N; i++) {
    const [gd, gm] = [gpu[b][i * 2], gpu[b][i * 2 + 1]];
    const [jd, jm] = domainMap(batches[b][i]);
    checked++;
    const err = Math.abs(gd - jd);
    if (err > worst) { worst = err; worstAt = batches[b][i]; }
    // Material can legitimately differ where two primitives are equidistant.
    if (gm !== jm && Math.abs(gd - jd) < 1e-3) matMismatch++;
  }
}

console.log(`compared ${checked} points`);
console.log(`worst distance disagreement: ${worst.toExponential(3)}`);
if (worstAt) console.log(`  at ${worstAt.map((n) => n.toFixed(3)).join(', ')}`);
console.log(`material disagreements: ${matMismatch} (ties are expected)`);

// 32-bit float against coordinates of size cosh(s), so the noise floor climbs
// steeply with distance from the origin: sampling six periods out instead of
// one and a half takes the worst disagreement from ~1e-5 to ~1e-2. That is the
// same exponential that caps everything else, and it is survivable here only
// because the player is always folded back into the fundamental domain and fog
// has swallowed anything far enough away to be wrong.
const ok = worst < 2e-3 && matMismatch < checked * 0.005;
console.log(ok ? '\nok   the two SDFs agree' : '\nFAIL the two SDFs have drifted apart');
process.exit(ok ? 0 : 1);
