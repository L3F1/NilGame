// tools/sdf-check.js — do the JS and GLSL world SDFs agree?
//
//   node tools/sdf-check.js
//
// Five worlds now write their scene out TWICE -- once in JS for the physics,
// once as GLSL for the renderer -- from shared data but with unshared
// arithmetic. If a pair drifts, the grapple latches onto surfaces that are not
// drawn and passes through ones that are, and nothing about the picture says
// so. That duplication is the reason this tool exists, and it is why CLAUDE.md
// lists a shared emitter as the next infrastructure job.
//
// It evaluates the real GLSL on a real GPU at a few thousand points per case
// and compares against the real JS at the same points. Run it after touching
// either half of any of them.
//
// CASES COVERED, and why each samples where it does:
//
//   H^3, the bounded level     inside the fundamental octagon, because that is
//                              the only region the marcher ever evaluates: its
//                              ray teleports across a face instead of leaving.
//   E^3/Lambda, the slab       anywhere at all, and that is the point -- the
//   E^3/Lambda, the 3-torus    flat marcher does NOT stay in a domain. It runs
//                              straight out into the covering space and folds
//                              every displacement inside the distance
//                              function, so the two implementations must agree
//                              cells away from the origin as well as inside.
//                              Sampled out to four cells for exactly that.

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
const E3T = await import(pathToFileURL(join(ROOT, 'e3t.js')).href);
const S2R = await import(pathToFileURL(join(ROOT, 's2r.js')).href);
const TRACK = await import(pathToFileURL(join(ROOT, 'race-track.js')).href);

// Deterministic sample points, so a failure repeats.
const N = 16 * 16, BATCHES = 12;
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function sample(make) {
  const batches = [];
  for (let b = 0; b < BATCHES; b++) {
    const pts = [];
    for (let i = 0; i < N; i++) pts.push(make());
    batches.push(pts);
  }
  return batches;
}

const CASES = [
  {
    name: 'H^3, the bounded level',
    // ON the hyperboloid, built from floor coordinates rather than scattered
    // in the ambient R^4, and inside the fundamental octagon with a small
    // margin off the faces -- rejection sampling, because that is the only
    // region a single-copy SDF is ever handed.
    batches: sample(() => {
      let q;
      do {
        q = fromFloor(rnd() * 3 - 1.5, rnd() * 3 - 1.5, rnd() * 2.0 - 0.3);
      } while (domainDepth(q) < 0.02);
      return q;
    }),
    js: domainMap,
    // 32-bit float against coordinates of size cosh(s), so the noise floor
    // climbs steeply with distance from the origin.
    tol: 2e-3,
    glsl: `
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
vec2 worldMap(vec4 p) { return domainMap(p); }`,
  },
  ...[['the slab', 0, E3T.MODE.SLAB], ['the 3-torus', 1, E3T.MODE.CUBE]].map(
    ([label, open, mode]) => ({
      name: `E^3/Lambda, ${label}`,
      // FOUR CELLS OUT in every direction, deliberately. The flat marcher does
      // not stay in a domain -- it runs straight out into the covering space
      // and folds every displacement inside the distance function -- so an
      // agreement that only held near the origin would be worthless.
      batches: sample(() => [
        (rnd() - 0.5) * 24, (rnd() - 0.5) * 24,
        open ? (rnd() - 0.5) * 24 : rnd() * 3, 1,
      ]),
      js: (p) => E3T.e3tMap(p, mode),
      // Flat coordinates do not grow, so float32 keeps its full relative
      // precision however far out the sample is. This tolerance is a
      // thousandth of the hyperbolic one and it is not a lucky setting: it is
      // the whole engineering argument for the flat build in one number.
      tol: 2e-5,
      glsl: `
const float uOpen = ${open}.0;
${E3T.e3tGLSL()}
vec2 worldMap(vec4 p) { return e3tWorld(p); }`,
    })),
  {
    // S^2 x R WITH THE RACE TRACK ON. This case exists because race-track.js
    // is the fifth place in the project that writes a scene out twice, and it
    // was the only one nothing checked -- which is how its JS half came to use
    // Math.acos of the inner product while its GLSL half used the half-angle
    // form. Same number, different arithmetic, and only near contact does the
    // difference show, which is the one place a collision test lives.
    name: 'S^2 x R, race track on',
    // On and just above the road, where the hurdles are and where a car is.
    batches: sample(() => {
      const t = rnd() * 2 * Math.PI, w = (rnd() - 0.5) * 1.4;
      return [Math.sin(t) * Math.cos(w), Math.sin(w), rnd() * 1.2, Math.cos(t) * Math.cos(w)];
    }),
    js: (p) => {
      const m = S2R.s2rMap(p);
      const d = TRACK.raceObstacleSDF(p);
      // s2rGLSL repaints the floor material inside the road before testing the
      // hurdles, so the JS side has to do the same or every road sample is a
      // material mismatch rather than a distance one.
      let mat = m[1];
      if (mat === 1 && Math.abs(Math.asin(Math.max(-1, Math.min(1, p[1])))) < TRACK.RACE_WIDTH) {
        mat = 5;
      }
      return d < m[0] ? [d, TRACK.RACE_HURDLE_MAT] : [m[0], mat];
    },
    // Spherical coordinates are bounded by 1 at every distance, so this holds
    // the flat build's tolerance rather than the hyperbolic one's.
    tol: 2e-5,
    glsl: `
const float kS = 1.0;
const float uRace = 1.0;
float asinS(float x) { return asin(clamp(x, -1.0, 1.0)); }
float hdot(vec4 a, vec4 b) { return a.x*b.x + a.y*b.y + kS*a.w*b.w; }
float hHorizDist(vec4 p, vec4 q) {
  vec4 w = p - q;
  return 2.0 * asinS(sqrt(max(hdot(w, w), 0.0)) * 0.5);
}
${S2R.s2rGLSL()}
vec2 worldMap(vec4 p) { return s2rWorld(p); }`,
  },
];

const fragFor = (c) => `#version 300 es
precision highp float;
uniform vec4 uPts[${N}];
out vec4 outColor;
${c.glsl}
void main() {
  int i = int(gl_FragCoord.y) * 16 + int(gl_FragCoord.x);
  vec2 m = worldMap(uPts[i]);
  outColor = vec4(m.x, m.y, 0.0, 1.0);
}`;

const page = `<!DOCTYPE html><meta charset="utf-8"><body><pre id="o"></pre><script>
const CASES = ${JSON.stringify(CASES.map((c) => ({ batches: c.batches, frag: fragFor(c) })))};
const VERT = "#version 300 es\\nin vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
const out = [];
try {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) throw new Error('no webgl2');
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('no float render targets');
  const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, 16, 16);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.viewport(0, 0, 16, 16);
  const px = new Float32Array(16 * 16 * 4);
  const cases = [];
  for (const c of CASES) {
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, c.frag));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p);
    // Per program, because a second program is entitled to a different
    // location for the same attribute name -- the same rule main.js follows
    // with bindAttribLocation, in its other spelling.
    const al = gl.getAttribLocation(p, 'a');
    gl.enableVertexAttribArray(al); gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);
    const loc = gl.getUniformLocation(p, 'uPts');
    const all = [];
    for (const pts of c.batches) {
      gl.uniform4fv(loc, new Float32Array(pts.flat()));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.readPixels(0, 0, 16, 16, gl.RGBA, gl.FLOAT, px);
      all.push(Array.from(px).filter((_, i) => i % 4 < 2));
    }
    cases.push(all);
  }
  out.push('DATA ' + JSON.stringify(cases));
} catch (e) { out.push('FAIL ' + e.message); }
document.getElementById('o').textContent = 'BEGIN\\n' + out.join('\\n') + '\\nEND';
// Drop the script node before the DOM is dumped. It carries every sample point
// of every case, and --dump-dom would hand all of them back as part of the
// result -- input and output in one buffer, which at four cases went past
// execFileSync's 1 MB maxBuffer and got the browser killed with SIGTERM. The
// failure read as 'browser failed: exit null' with no other clue, and the page
// had run correctly the whole time.
document.currentScript.remove();
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
    // Four programs now, and the S^2 x R one carries 26 columns plus the race
    // track, so SwiftShader needs longer than the 8 s that served one.
    '--virtual-time-budget=30000', '--dump-dom',
    'file:///' + file.replace(/\\/g, '/'),
    // maxBuffer as well as the script removal above, as the belt to that
    // brace: the results alone grow with every case added here.
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  // Name the two failures that look identical from here, because they do not
  // have the same cause: a timeout is the shader, and a SIGTERM with output
  // already produced is this process's own maxBuffer.
  console.error('browser failed:', e.killed ? 'timed out' : `exit ${e.status}`);
  if (e.signal) console.error(`  killed by ${e.signal};`
    + (e.stdout ? ' it had already produced output, so suspect maxBuffer'
      : ' no output, so suspect the shader or the budget'));
  console.error('  page kept at', file);
  process.exit(2);
}

const m = dump.replace(/\r\n/g, '\n').match(/BEGIN\n([\s\S]*?)\nEND/);
if (!m) { console.error('no result from the browser'); process.exit(2); }
if (m[1].startsWith('FAIL')) { console.error(m[1]); process.exit(1); }

const gpu = JSON.parse(m[1].replace(/^DATA /, '').replace(/&quot;/g, '"'));
let allOk = true;
CASES.forEach((c, ci) => {
  let worst = 0, worstAt = null, matMismatch = 0, checked = 0;
  for (let b = 0; b < c.batches.length; b++) {
    for (let i = 0; i < N; i++) {
      const [gd, gm] = [gpu[ci][b][i * 2], gpu[ci][b][i * 2 + 1]];
      const [jd, jm] = c.js(c.batches[b][i]);
      checked++;
      const err = Math.abs(gd - jd);
      if (err > worst) { worst = err; worstAt = c.batches[b][i]; }
      // Material can legitimately differ where two primitives are equidistant.
      if (gm !== jm && Math.abs(gd - jd) < 1e-3) matMismatch++;
    }
  }
  // The hyperbolic tolerance is 32-bit float against coordinates of size
  // cosh(s), so its noise floor climbs steeply with distance: sampling six
  // periods out instead of one and a half takes the worst disagreement from
  // ~1e-5 to ~1e-2. That is the same exponential that caps everything else,
  // and it is survivable only because the player is folded back into the
  // fundamental domain and fog has swallowed anything far enough to be wrong.
  // The flat cases hold a tolerance a hundred times tighter FOUR CELLS OUT.
  const ok = worst < c.tol && matMismatch < checked * 0.005;
  allOk = allOk && ok;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.name}: ${checked} points, `
    + `worst ${worst.toExponential(3)} (tol ${c.tol.toExponential(0)}), `
    + `${matMismatch} material ties`);
  if (!ok && worstAt) console.log(`       at ${worstAt.map((n) => n.toFixed(3)).join(', ')}`);
});
console.log(allOk ? '\nok   every world\'s two SDFs agree'
  : '\nFAIL a world\'s two SDFs have drifted apart');
process.exit(allOk ? 0 : 1);
