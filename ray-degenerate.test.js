// MUSE-36: degenerate rays — is the analytic path still telling the truth?
//
// The lead changed `csgRayCast` so an uncertain ray parameter behind the
// origin is DISCARDED (beyond a local tolerance) instead of clamped to zero.
// The reasoning: an ambiguity behind the origin carries no measure, so it
// cannot move any forward interval. This corpus attacks that reasoning with
// near-degenerate rays, each run three ways:
//
//   1. `method: 'analytic'` — the path under test.
//   2. `method: 'march'` — recorded for agreement only. It is NOT a second
//      opinion on correctness: it sphere-traces the same field the reference
//      reads, so a shared field defect would move both together.
//   3. INDEPENDENT reference — uniform scan of `field.distance` along the ray
//      (step 5e-4, full ray) for the first sign change, then 60 rounds of
//      bisection. It never consults the ray-interval module. Bracketing
//      resolution 5e-4; parameter resolution after bracketing is float-limited
//      (~1e-12 relative). Chords shorter than the scan step can be SKIPPED —
//      the ulp-graze cases demonstrate this on purpose, with a tight-window
//      refinement (step 1e-7 over ±1e-3 around the predicted tangent) and, at
//      the bottom of the scale, construction truth (the offset sign is known
//      by construction, not measured, because ±2e-16 is below field noise).
//
// Disagreements are sorted by COST, never averaged:
//   - false HIT / false MISS: correctness failure.
//   - false `indeterminate`: waste — a refusal on an answerable ray.
//
// Verdict on the guard's boundary is at the bottom of the output.
import assert from 'node:assert/strict';
import { compileSceneField } from './engine/world/scene-field.js';

const norm = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
const at = (p, u, t) => [p[0] + u[0] * t, p[1] + u[1] * t, p[2] + u[2] * t];

const doc = (id, entities) => ({
  format: 'nil-scene', version: 2, id,
  units: { name: 'design-unit', playerRadius: 0.25 },
  regions: [{ id: 'r', geometry: { kind: 'e3', curvatureRadius: 1 }, topology: 'cover', extent: 20 }],
  entities: [{ id: 'start', regionId: 'r', kind: 'spawn', position: [0, -8, 0.3] }, ...entities],
  connections: [],
});
const ball = (id, position, radius, extra = {}) =>
  ({ id, regionId: 'r', kind: 'ball', position, radius, ...extra });
const box = (id, position, halfExtent, extra = {}) =>
  ({ id, regionId: 'r', kind: 'box', position, halfExtent, ...extra });

// Ball of radius 1 at [0,0,1]: the ray x=1,z=1 along +y is exactly tangent,
// closest approach t=6 from p=[1,-6,1].
//
// Construction subtlety the first run exposed: axis-EXACT tangency computes
// disc == 0 in float and takes the confident point-interval path — it never
// reaches `unknown()`, so it never exercises the guard. The guard only fires
// on a near-miss inside the module's own error bound (disc < 0, |disc| <=
// error ~= 1.1e-13 here). Every tangency below is therefore offset by
// DELTA = 1e-14: disc ~= -2e-14, robustly negative yet inside the bound, so
// the primitive reports unknown() at the tangent parameter and the guard
// decides. True verdicts stay geometric: line distance 1+1e-14 > 1, a miss.
const DELTA = 1e-14;
const TANGENT = {
  doc: doc('tangent-1', [ball('b', [0, 0, 1], 1)]),
  p: [1 + DELTA, -6, 1], u: norm([0, 1, 0]), tStar: 6,
};
// Carve scene: ball s (r=1.2) hit at t=4.8, cutter c NEAR-tangent to the same
// ray at t=3 (offset DELTA, so the cutter reports unknown, not a point
// interval) — a tangency to the CUTTER, floating ahead of the hit.
const CUTTER_TANGENT = {
  doc: doc('cutter-tangent', [
    ball('s', [0, 0, 1], 1.2),
    ball('c', [0.5 + DELTA, -3, 1], 0.5, { op: 'subtract', target: 's' }),
  ]),
  p: [0, -6, 1], u: norm([0, 1, 0]),
};
// Coincident union: two boxes sharing the z=2 face plane exactly.
const COINCIDENT = {
  doc: doc('coincident', [
    box('boxa', [0, 0, 1], [1, 1, 1]),
    box('boxb', [0, 0, 3], [1, 1, 1]),
  ]),
};

/** Independent reference: scan for the first sign change, then bisect. */
function truthScan(f, p, u, { step = 5e-4, tmax = 60 } = {}) {
  if (f.distance(p) <= 0) return { hit: true, t: 0 };
  let prev = 0;
  for (let t = step; t <= tmax; t += step) {
    if (f.distance(at(p, u, t)) <= 0) {
      let lo = prev, hi = t;
      for (let i = 0; i < 60; i++) {
        const m = (lo + hi) / 2;
        if (f.distance(at(p, u, m)) <= 0) hi = m; else lo = m;
      }
      return { hit: true, t: hi };
    }
    prev = t;
  }
  return { hit: false, t: Infinity };
}

/** Tight-window minimum of the field around a predicted tangent parameter. */
function truthWindow(f, p, u, tStar, half = 1e-3, step = 1e-7) {
  let best = Infinity, bestT = -1;
  for (let t = Math.max(0, tStar - half); t <= tStar + half; t += step) {
    const d = f.distance(at(p, u, t));
    if (d < best) { best = d; bestT = t; }
  }
  return { minD: best, minT: bestT };
}

const cast = (f, p, u, opts = {}, method = 'analytic') =>
  f.rayCast(p, u, { ...opts, method });

let passed = 0, failed = 0;
const failures = { correctness: [], waste: [] };
function check(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
// verdict: what the REFERENCE says is right ('hit' with t, or 'miss').
// Sorts an analytic answer into correctness failure vs waste.
function judge(name, ref, a, tTol = 1e-4) {
  const refVerdict = ref.hit ? `hit@${ref.t.toFixed(6)}` : 'miss';
  const aVerdict = a.status === 'hit' ? `hit@${a.t.toFixed(6)}`
    : a.status === 'miss' ? 'miss' : 'indeterminate';
  console.log(`  ${name}: ref ${refVerdict} | analytic ${aVerdict} | march ${a.march}`);
  if (a.status === 'indeterminate') {
    failures.waste.push(`${name}: analytic refuses, ref says ${refVerdict}`);
    return 'waste';
  }
  if (ref.hit && a.status === 'miss') {
    failures.correctness.push(`${name}: FALSE MISS, ref hit@${ref.t}`);
    return 'false-miss';
  }
  if (!ref.hit && a.status === 'hit') {
    failures.correctness.push(`${name}: FALSE HIT@${a.t}, ref miss`);
    return 'false-hit';
  }
  if (ref.hit && a.status === 'hit' && Math.abs(a.t - ref.t) > tTol) {
    failures.correctness.push(`${name}: wrong distance ${a.t} vs ref ${ref.t}`);
    return 'wrong-t';
  }
  return 'agree';
}

const withMarch = (f, p, u, opts, a) => {
  const m = cast(f, p, u, opts, 'march');
  return { ...a, march: m.status === 'hit' ? `hit@${m.t.toFixed(6)}` : m.status };
};

// --- Tangency ahead / behind / straddling (additive ball) ---
{
  const f = compileSceneField(TANGENT.doc);
  const { p, u } = TANGENT;

  let ref = truthScan(f, p, u);
  let a = withMarch(f, p, u, {}, cast(f, p, u));
  const vAhead = judge('near-tangency ahead (t=6, true miss)', ref, a);
  check('near-tangency ahead is refused, not answered wrong (pinned waste)', () => {
    // The reference says miss; the ambiguity at t=6 is inside the module's
    // own error bound, so the cast refuses. Waste, not failure — pinned so
    // a tighter error model breaks this test on purpose.
    assert.equal(a.status, 'indeterminate', `expected refusal, got ${a.status}`);
    assert.equal(ref.hit, false, 'reference must say miss');
  });

  const ub = norm([0, -1, 0]); // same ray aimed AWAY: ambiguity at t=-6
  ref = truthScan(f, p, ub);
  a = withMarch(f, p, ub, {}, cast(f, p, ub));
  const vBehind = judge('near-tangency behind (t=-6, true miss)', ref, a);
  check('tangency six units behind is a miss, not a refusal', () => {
    assert.equal(a.status, 'miss', `expected miss, got ${a.status}`);
    assert.equal(ref.hit, false, 'reference must agree it is a miss');
  });

  const ps = [1 + DELTA, 0, 1]; // origin at the near-tangent point: straddles
  ref = truthScan(f, ps, u);
  a = withMarch(f, ps, u, {}, cast(f, ps, u));
  const vStraddle = judge('near-tangency straddling the origin', ref, a);
  check('straddling ambiguity keeps the clamp (pinned waste)', () => {
    // Occupancy at the origin is within float noise either way; the guard
    // keeps the clamp here by design. The reference says miss.
    assert.equal(a.status, 'indeterminate', `expected refusal, got ${a.status}`);
  });
  console.log(`  (ahead=${vAhead} behind=${vBehind} straddle=${vStraddle})`);
}

// --- Tangency to a CUTTER vs to an additive solid ---
{
  const f = compileSceneField(CUTTER_TANGENT.doc);
  const { p, u } = CUTTER_TANGENT;
  const ref = truthScan(f, p, u);
  const a = withMarch(f, p, u, {}, cast(f, p, u));
  const v = judge('cutter near-tangent ahead of the hit (t=3, hit t=4.8)', ref, a);
  check('cutter near-tangency ahead refuses rather than mis-answering (pinned waste)', () => {
    // Reference says hit at 4.8; the cutter's ambiguity at t=3 is before it,
    // so the cast refuses. The cutter floats in empty space, disjoint from
    // the target — a finding for the lead (reported, not fixed).
    assert.equal(a.status, 'indeterminate', `expected refusal, got ${a.status}`);
    assert.ok(ref.hit && Math.abs(ref.t - 4.8) < 1e-4, `ref must say hit@4.8, got ${ref.t}`);
  });

  // Same scene aimed away: cutter tangency behind, everything behind.
  const ub = norm([0, -1, 0]);
  const ref2 = truthScan(f, p, ub);
  const a2 = withMarch(f, p, ub, {}, cast(f, p, ub));
  judge('cutter scene aimed away (all behind)', ref2, a2);
  check('cutter scene aimed away is a miss', () => {
    assert.equal(a2.status, 'miss', `expected miss, got ${a2.status}`);
  });
}

// --- On / just-inside / just-outside starts ---
{
  const f = compileSceneField(doc('skin', [ball('s', [0, 0, 1], 1.2)]));
  const on = [0, -1.2, 1]; // exactly on the near face
  for (const [name, pp, uu] of [
    ['on-surface, aimed in', on, norm([0, 1, 0])],
    ['on-surface, aimed out', on, norm([0, -1, 0])],
    ['just inside (0.1), aimed out', [0, -1.1, 1], norm([0, -1, 0])],
    ['just inside (0.1), aimed in', [0, -1.1, 1], norm([0, 1, 0])],
    ['just outside (0.1), aimed in', [0, -1.3, 1], norm([0, 1, 0])],
    ['just outside (0.1), aimed away', [0, -1.3, 1], norm([0, -1, 0])],
  ]) {
    const ref = truthScan(f, pp, uu);
    const a = withMarch(f, pp, uu, {}, cast(f, pp, uu));
    const v = judge(name, ref, a);
    check(`${name}: analytic matches reference`, () => {
      assert.equal(v, 'agree', `got ${v}`);
    });
  }
}

// --- maxDistance landing exactly on the hit ---
{
  const f = compileSceneField(doc('maxd', [ball('s', [0, 0, 1], 1.2)]));
  const p = [0, -6, 1], u = norm([0, 1, 0]);
  const T = truthScan(f, p, u).t;
  console.log(`  clean hit at T=${T}`);
  check('maxDistance exactly on the hit still hits', () => {
    const a = cast(f, p, u, { maxDistance: T });
    assert.equal(a.status, 'hit', `expected hit, got ${a.status}`);
    assert.ok(Math.abs(a.t - T) < 1e-9, `t=${a.t} vs T=${T}`);
  });
  check('maxDistance one epsilon short misses', () => {
    const a = cast(f, p, u, { maxDistance: T - 1e-9 });
    assert.equal(a.status, 'miss', `expected miss, got ${a.status}`);
  });
}

// --- Coincident faces: union must not poison; pin the clean answer ---
{
  const f = compileSceneField(COINCIDENT.doc);
  for (const [name, pp, uu] of [
    ['across coincident union faces', [0, -6, 2], norm([0, 1, 0])],
    ['down through the shared face plane', [0, 0, 6], norm([0, 0, -1])],
    ['riding the seam plane', [1, -6, 2], norm([0, 1, 0])],
  ]) {
    const ref = truthScan(f, pp, uu);
    const a = withMarch(f, pp, uu, {}, cast(f, pp, uu));
    const v = judge(name, ref, a);
    check(`${name}: analytic matches reference`, () => {
      assert.equal(v, 'agree', `got ${v}`);
    });
  }
}

// --- Grazes displaced by one ulp either side of tangency ---
// Construction truth (not measurement): +1ulp is a true miss, -1ulp is a
// true graze-hit with chord 2*sqrt(2*1*2.2e-16) ~= 4.2e-8. The field cannot
// resolve 2e-16 — the windowed sampling below is shown WITH its noise so the
// reference floor is visible instead of hidden.
{
  const f = compileSceneField(TANGENT.doc);
  const { u, tStar } = TANGENT;
  const ulp1 = 1 + Number.EPSILON; // one ulp above 1.0
  for (const [name, x, constructed] of [
    ['graze +1ulp (true miss)', ulp1, 'miss'],
    ['graze -1ulp (true graze-hit)', 2 - ulp1, 'hit'],
  ]) {
    const p = [x, -6, 1];
    const w = truthWindow(f, p, u, tStar);
    const ref = truthScan(f, p, u);
    const a = withMarch(f, p, u, {}, cast(f, p, u));
    console.log(`  ${name}: window minD=${w.minD.toExponential(2)} at t=${w.minT.toFixed(6)}`
      + ` | scan says ${ref.hit ? `hit@${ref.t}` : 'miss'}`);
    const v = judge(name, { hit: constructed === 'hit', t: tStar }, a);
    check(`${name}: analytic never confidently wrong`, () => {
      assert.ok(v !== 'false-miss' && v !== 'false-hit', `correctness failure: ${v}`);
    });
  }
}

// --- Probe the new guard directly: how far behind before it discards? ---
// Construction: origin [1,-h,1], direction -y, tangency at t=-h exactly.
// Predicted boundary: tolerance(t,0) = 64*eps*max(1,|t|) ~= 1.42e-14 for
// |t| <= 1. Beyond it the ambiguity is discarded (miss); inside it the clamp
// is kept (indeterminate), because occupancy at the origin is genuinely
// within float noise.
{
  const f = compileSceneField(TANGENT.doc);
  const ub = norm([0, -1, 0]);
  const hs = [6, 1, 1e-8, 1e-13, 3e-14, 1.5e-14, 1e-14, 1e-15, 0];
  console.log('  guard sweep (h = tangency depth behind origin):');
  const observed = [];
  for (const h of hs) {
    const a = cast(f, [1 + DELTA, -h, 1], ub);
    observed.push(a.status);
    console.log(`    h=${h.toExponential(1)}: ${a.status}`
      + (a.status === 'indeterminate' ? ` uncertainFrom=${a.uncertainFrom}` : ''));
  }
  check('far-behind ambiguity is discarded (miss)', () => {
    for (const h of [6, 1, 1e-8, 1e-13]) {
      assert.equal(cast(f, [1 + DELTA, -h, 1], ub).status, 'miss', `h=${h}`);
    }
  });
  check('ambiguity AT the origin keeps the clamp (indeterminate)', () => {
    assert.equal(cast(f, [1 + DELTA, 0, 1], ub).status, 'indeterminate', 'h=0');
  });
  check('flip sits at the predicted 64eps boundary', () => {
    const far = observed.slice(0, 4).every((s) => s === 'miss');
    const near = observed[observed.length - 1] === 'indeterminate';
    assert.ok(far && near, `sweep: ${observed.join(',')}`);
    console.log(`  (flip between h=1.5e-14 and h=1.0e-14; predicted 1.42e-14)`);
    assert.ok(observed[5] === 'miss' && observed[6] === 'indeterminate',
      `flip must sit between 1.5e-14 and 1e-14: ${observed.join(',')}`);
  });
}

// --- Hunt for a WRONG forward answer caused by discarding behind-origin
// ambiguity. Structural note: `uncertainty` only gates refusal, it never
// moves `best`, so discarding can only turn indeterminate into an answer,
// never change which answer. A wrong answer needs a forward doubt the module
// does not detect at all. Tried below; none found.
{
  const f = compileSceneField(doc('hunt', [
    ball('s', [0, 0, 1], 1.2),
    ball('c', [0.5 + DELTA, -3, 1], 0.5, { op: 'subtract', target: 's' }),
  ]));
  // Forward: carved hit at 4.8 with a live cutter near-tangency ahead at
  // t=3 (refuses). Then the same ray with an EXTRA near-tangent ball at
  // t=-1, BEHIND the origin (middle = -dot(p-c,u) = -1) — discarding it must
  // not change the forward refusal.
  const g = compileSceneField(doc('hunt2', [
    ball('s', [0, 0, 1], 1.2),
    ball('c', [0.5 + DELTA, -3, 1], 0.5, { op: 'subtract', target: 's' }),
    ball('far', [1 + DELTA, -7, 1], 1),
  ]));
  const p = [0, -6, 1], u = norm([0, 1, 0]);
  const a1 = cast(f, p, u), a2 = cast(g, p, u);
  console.log(`  hunt: without far ball: ${a1.status}; with far ball: ${a2.status}`);
  check('behind-origin geometry does not move the forward answer', () => {
    assert.equal(a1.status, a2.status, `${a1.status} vs ${a2.status}`);
  });
  // Thin-sliver subtraction: cutter face 1e-15 inside the target face. If
  // discarding hid real forward doubt, a sliver hit would be the shape.
  const s = compileSceneField(doc('sliver', [
    box('s', [0, 0, 1], [1, 1, 1]),
    box('c', [0, 2 - 1e-15, 1], [1, 1, 1], { op: 'subtract', target: 's' }),
  ]));
  const ps = [0, -6, 1], us = norm([0, 1, 0]);
  const ref = truthScan(s, ps, us);
  const as = withMarch(s, ps, us, {}, cast(s, ps, us));
  const v = judge('thin-sliver subtraction (1e-15)', ref, as);
  check('thin sliver: no confident wrong answer', () => {
    assert.ok(v !== 'false-miss' && v !== 'false-hit', `correctness failure: ${v}`);
  });
}

console.log(`\nray-degenerate: ${passed} checks passed, ${failed} failed`);
console.log(`sorted cost: ${failures.correctness.length} correctness failures, `
  + `${failures.waste.length} waste refusals`);
for (const w of failures.waste) console.log(`  waste: ${w}`);
for (const c of failures.correctness) console.log(`  CORRECTNESS: ${c}`);
if (failed) process.exit(1);

