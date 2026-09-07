// tools/march-check.js — how many rays run out of steps?
//
//   node tools/march-check.js
//
// A grey wedge along a seam is not a shading bug. It is a ray that used its
// whole step budget without reaching anything, so the pixel falls through to
// the background colour. Nothing about the picture says which of the two it
// is, and the wedge shrinks when you raise Quality, which is the tell.
//
// This replays the shader's marching loop in JS — the same fold, the same
// step rule, the same level SDF — over a fan of rays from viewpoints chosen
// to sit on faces, edges and corners, and reports the share that die by
// exhaustion. That share IS the wedge. It should be zero.
//
// float64 here against the shader's float32, so this measures the STEP RULE,
// not precision. That is the part that produces wedges.

import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const H = await import(pathToFileURL(join(ROOT, 'hyp.js')).href);
const L = await import(pathToFileURL(join(ROOT, 'level.js')).href);

const { apply, matMul, placeAt, sides, pairings, setSolid, SOLID, dot, translation } = H;
const { domainMap, setMode, MODE } = L;
const { PLAYER_R } = await import(pathToFileURL(join(ROOT, 'physics.js')).href);

const HIT_EPS = 0.0015;
const FACE_EPS = 0.0020;
const FOLD_EPS = 1e-5;   // fold only when outside by more than noise; see shader.js
// One pixel, as an angle, for a nominal 900-line viewport. The shader derives
// this from uRes; see the note on the footprint threshold in shader.js.
const PIX = 1.2 / 900;
const hitEps = (t) => Math.min(0.05, Math.max(HIT_EPS, PIX * Math.sinh(t)));

// Which face are we furthest outside of, and by how much. The shader's
// domainDepth, but returning the face too.
function depthAndFace(p) {
  const S = sides();
  let worst = -1e30, face = 0;
  for (let k = 0; k < S.length; k++) {
    const v = dot(p, S[k]);
    if (v > worst) { worst = v; face = k; }
  }
  return [-Math.asinh(worst), face];
}

// The shader's exitDist: how far along the ray until it leaves this copy.
// f(t) = <p(t),N> = a*sinh(t) + b*cosh(t), one root, and it is an EXIT only
// when a > 0. See the comment on exitDist in shader.js.
function exitDist(C, dir, tMin) {
  const D = apply(C, [dir[0], dir[1], dir[2], 0]);
  const Q = [C[12], C[13], C[14], C[15]];
  const S = sides();
  let best = Infinity;
  for (let k = 0; k < S.length; k++) {
    const a = dot(D, S[k]), b = dot(Q, S[k]);
    if (a > Math.abs(b)) {
      const tc = 0.5 * Math.log((a - b) / (a + b));
      if (tc > tMin && tc < best) best = tc;
    }
  }
  return best;
}

const EXHAUSTED = 0, HIT = 1, ESCAPED = 2;

// Samples the fold loop could not bring back inside the domain. Those are
// evaluated against the wrong copy of the level, which draws geometry that is
// not there. It reads as a smear at a seam rather than as a wedge, and the
// only reason it is visible here at all is that the loop gives up after a
// bounded number of folds. It must be zero.
const STUCK = { n: 0 };

/** One ray. Returns [outcome, stepsUsed, worst folds in a single step]. */
function march(M, dir, steps, maxT) {
  const P = pairings();
  let chart = M;
  let t = 0, s = 0, folds = 0, sExit = -Infinity;
  const at = (c, d, u) => apply(c, [Math.sinh(u) * d[0], Math.sinh(u) * d[1], Math.sinh(u) * d[2], Math.cosh(u)]);
  for (let i = 0; i < steps; i++) {
    let p = at(chart, dir, s);
    let [depth, face] = depthAndFace(p);
    let rebased = false, here = 0;
    for (let f = 0; f < 12 && depth < -FOLD_EPS; f++) {
      chart = matMul(P[face], matMul(chart, translation(dir, s)));
      s = 0;
      here++;
      if (here > folds) folds = here;
      p = [chart[12], chart[13], chart[14], chart[15]];
      [depth, face] = depthAndFace(p);
      rebased = true;
    }
    if (!rebased && s > 2) {
      chart = matMul(chart, translation(dir, s));
      s = 0;
      p = [chart[12], chart[13], chart[14], chart[15]];
      rebased = true;
    }
    if (depth < -FOLD_EPS) STUCK.n++;
    if (rebased || sExit <= s) sExit = exitDist(chart, dir, s);
    const m = domainMap(p);
    if (m[0] < hitEps(t)) return [HIT, i, folds];
    const adv = Math.min(m[0], Math.max(sExit + FACE_EPS - s, FACE_EPS));
    s += adv;
    t += adv;
    if (t > maxT) return [ESCAPED, i, folds];
  }
  return [EXHAUSTED, steps, folds];
}

// A fan of rays, in the frame: yaw around, pitch up and down. Same 1.2 field
// scale the shader uses, so these are the directions real pixels take.
function fan(n) {
  const dirs = [];
  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      const u = (ix / (n - 1) - 0.5) * 2.4;      // matches uv.x * 1.2 * 2
      const v = (iy / (n - 1) - 0.5) * 1.5;
      const d = [1, u, v];
      const l = Math.hypot(d[0], d[1], d[2]);
      dirs.push([d[0] / l, d[1] / l, d[2] / l]);
    }
  }
  return dirs;
}

// Viewpoints that sit ON the hard cases: pressed against a face, out at a
// corner, and looking along the vertical edge where two faces meet.
//
// Skipping any that are inside the level, or within a player radius of it.
// An eye 7mm from a wall crawls along the surface for hundreds of steps and
// there is no marcher that does not - sphere tracing on a near-tangent
// surface advances by the clearance, so it costs distance/clearance steps.
// That is not a bug to fix here, it is a camera the game cannot produce:
// collide keeps the player PLAYER_R clear of every surface, so the eye is
// never nearer than that. Testing viewpoints the game cannot reach would
// only measure how bad an impossible case is.
function viewpoints(open) {
  const R = open ? H.DOD_R : H.OCT_R;
  const pts = [];
  const hs = open ? [0, 0.5, -0.5] : [0.25, 0.55, 0.85, -0.2];
  for (const h of hs) {
    for (let k = 0; k < 16; k++) {
      const th = (k * Math.PI) / 8;                 // faces AND corners
      for (const r of [R * 0.3, R * 0.55, R * 0.75, R * 0.9, R * 0.99]) {
        const M = placeAt(r * Math.cos(th), r * Math.sin(th), h);
        if (domainMap(H.point(M))[0] < PLAYER_R) continue;
        pts.push(M);
      }
    }
  }
  return pts;
}

function run(label, open, steps, maxT, tolerant = false) {
  setSolid(open ? SOLID.DODECAHEDRON : SOLID.OCTAGON);
  setMode(open ? MODE.OPEN : MODE.BOUNDED);
  const dirs = fan(13);
  const eyes = viewpoints(open);
  let total = 0, exhausted = 0, worstFolds = 0, sumSteps = 0;
  for (const M of eyes) {
    for (const d of dirs) {
      const [outcome, used, folds] = march(M, d, steps, maxT);
      total++;
      sumSteps += used;
      if (folds > worstFolds) worstFolds = folds;
      if (outcome === EXHAUSTED) exhausted++;
    }
  }
  const pct = (100 * exhausted) / total;
  console.log(
    `${label.padEnd(16)} ${String(exhausted).padStart(5)} / ${total} exhausted` +
    ` (${pct.toFixed(2)}%)   mean steps ${(sumSteps / total).toFixed(1).padStart(5)}` +
    `   worst folds ${worstFolds}   left outside ${STUCK.n}`);
  // A sample left outside the domain is always wrong - it draws geometry from
  // the wrong copy. An exhausted ray is a budget question, and at the cheapest
  // setting a handful of grazing rays genuinely cost more steps than the
  // budget allows; that is what choosing 'low' buys. A CLUSTER of them is the
  // grey wedge, so the tolerance is a rate, not a count.
  const allowed = tolerant ? Math.floor(total * 0.0002) : 0;
  const bad = Math.max(0, exhausted - allowed) + STUCK.n;
  STUCK.n = 0;
  return bad;
}

let bad = 0;
console.log('rays that used the whole step budget without hitting anything:\n');
// The three Quality tiers, exactly as main.js sets them.
bad += run('bounded, low', false, 160, 14, true);
bad += run('bounded, medium', false, 220, 14);
bad += run('bounded, high', false, 280, 14);
bad += run('open, low', true, 160, 10, true);
bad += run('open, medium', true, 220, 10);
bad += run('open, high', true, 280, 10);

console.log('');
console.log(bad === 0
  ? 'ok   no wedge, and every sample is inside the domain'
  : `FAIL ${bad} rays either ran out of steps - those pixels are the grey wedge -
     or were left outside the domain, which draws geometry from the wrong copy`);
process.exit(bad === 0 ? 0 : 1);
