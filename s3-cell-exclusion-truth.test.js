// MUSE-53: independent full-segment S3 cell-exclusion audit.
//
// Tests engine/geometry/s3-cell-exclusion.js directly (Claude owns classifier
// integration; nothing here imports it). The reference is dense uniform
// sampling of the named witness face f(theta) = dot(q(theta), pole) along the
// full physical segment plus golden-section refinement of the sampled argmin
// bracket. It never uses phase/atan2/amplitude extrema logic and never
// rescales stored poles: compiled planes are used verbatim. It shares cos/sin
// geodesic evaluation with production (stated limitation, as in MUSE-52).
//
// Exact special cases (endpoint values, signs, budgets, validation) are
// asserted analytically and kept separate from converged sampled evidence.
// Verdict: docs/qa/muse53-cell-exclusion.md.
import assert from 'node:assert/strict';
import { createMetricSpace } from './engine/geometry/metric-space.js';
import { compileRegionWorld } from './engine/world/region-world.js';
import { excludeSphericalCell } from './engine/geometry/s3-cell-exclusion.js';

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
// Geodesic evaluation only: no phase, no atan2, no pole normalization.
const faceValue = (pole, p, u, theta) => {
  const c = Math.cos(theta), s = Math.sin(theta);
  let f = 0;
  for (let k = 0; k < 4; k++) f += (c * p[k] + s * u[k]) * pole[k];
  return f;
};
// Dense scan (N=8192 over at most pi radians: spacing < 4e-4 rad) plus
// golden-section refinement inside the argmin bracket (a sinusoid is
// unimodal on a 8e-4-rad bracket). Returns { dense, refined, theta }.
function witnessProfile(pole, p, u, length) {
  const N = 8192;
  let bi = 0, bv = Infinity;
  for (let i = 0; i <= N; i++) {
    const v = faceValue(pole, p, u, (length * i) / N);
    if (v < bv) { bv = v; bi = i; }
  }
  let a = Math.max(0, (length * (bi - 1)) / N), b = Math.min(length, (length * (bi + 1)) / N);
  const gr = (Math.sqrt(5) - 1) / 2;
  let c = b - gr * (b - a), d = a + gr * (b - a);
  let fc = faceValue(pole, p, u, c), fd = faceValue(pole, p, u, d);
  for (let i = 0; i < 80; i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = faceValue(pole, p, u, c); }
    else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = faceValue(pole, p, u, d); }
  }
  return { dense: bv, refined: Math.min(fc, fd), theta: (a + b) / 2 };
}
// Empirical reference allowance, not a certified libm error bound. Evaluation
// uses double arithmetic and cos/sin; JavaScript supplies no portable ulp bound
// for those transcendental calls. REF_ALLOW = 1e-14 is asserted below every
// compared production guard (smallest observed 2.831e-14 on the audit host).
// A sampled minimum can only overestimate the true minimum (up to roundoff),
// so this checks the claimed lower from above; it does not prove
// production's analytic minimum is correct -- a dip narrower than the grid
// spacing that production also misses would escape both.
const REF_ALLOW = 1e-14;
// Worst (smallest) sampler-minus-lower gap seen; reported at the end.
const worstGap = { dense: Infinity, refined: Infinity, tag: '' };
// Every excluded result must satisfy this on its named witness face.
function assertWitnessConsistent(result, pole, p, u, length, tag) {
  assert.equal(result.status, 'excluded', `${tag}: expected exclusion`);
  assert.ok(result.lower > 0, `${tag}: lower must be positive (${result.lower})`);
  assert.ok(result.guard > 0, `${tag}: guard must be positive`);
  assert.ok(REF_ALLOW < result.guard,
    `${tag}: reference allowance ${REF_ALLOW} must sit below the production guard ${result.guard}`);
  const prof = witnessProfile(pole, p, u, length);
  if (prof.dense - result.lower < worstGap.dense)
    { worstGap.dense = prof.dense - result.lower; worstGap.tag = `${tag} (dense)`; }
  if (prof.refined - result.lower < worstGap.refined)
    { worstGap.refined = prof.refined - result.lower; worstGap.tag = `${tag} (refined)`; }
  assert.ok(prof.dense > 0, `${tag}: dense minimum must stay outside (${prof.dense})`);
  assert.ok(prof.refined > 0, `${tag}: refined minimum must stay outside (${prof.refined})`);
  assert.ok(prof.dense >= result.lower - REF_ALLOW,
    `${tag}: dense ${prof.dense} below claimed lower ${result.lower}`);
  assert.ok(prof.refined >= result.lower - REF_ALLOW,
    `${tag}: refined ${prof.refined} below claimed lower ${result.lower}`);
  return prof;
}

const P0 = [0, 0, 0, 1], UX = [1, 0, 0, 0];
const space1 = createMetricSpace({ kind: 's3', curvatureRadius: 1 });
const synth = (pole) => ({
  entity: { kind: 'geodesic-cell' },
  planes: Array.from({ length: 6 }, () => [...pole]),
});
const ask = (cell, p, u, maxDistance, opts = {}) =>
  excludeSphericalCell(space1, cell, p, u, { maxDistance, ...opts });

check('exact: zero range excludes iff the origin is strictly outside', () => {
  const out = ask(synth([0, 0, 0, 1]), P0, UX, 0);
  assert.equal(out.status, 'excluded', 'origin outside excludes at zero range');
  assert.equal(out.work, 1, 'first-face witness costs one unit');
  assert.equal(ask(synth([1, 0, 0, 0]), P0, UX, 0).status, 'unknown', 'origin on plane stays unknown');
  assert.equal(ask(synth([0, 0, 0, -1]), P0, UX, 0).status, 'unknown', 'origin inside stays unknown');
  console.log(`  zero range: outside excluded (work 1), on-plane/inside unknown`);
});

check('exact: both endpoint touches stay unknown despite a positive interior', () => {
  // f(theta) = sin(theta) on [0, pi]: touches 0 at both endpoints, >0 inside.
  const r = ask(synth([1, 0, 0, 0]), P0, UX, Math.PI);
  assert.equal(r.status, 'unknown', 'touching endpoints never exclude');
  let peak = -Infinity;
  for (let i = 0; i <= 200; i++) peak = Math.max(peak, faceValue([1, 0, 0, 0], P0, UX, (Math.PI * i) / 200));
  assert.ok(peak > 0.99, `interior is clearly positive (${peak}) yet still unknown`);
  console.log(`  endpoint touches at 0 and pi unknown; interior peak ${peak.toFixed(4)}`);
});

check('far-end-only touch stays unknown despite a positive interior', () => {
  // f(theta) = cos(theta) on [0, pi/2]: strictly positive on [0, pi/2),
  // touching ~0 only at the far endpoint. An origin-only minimum (f(0) = 1)
  // would falsely exclude this ray; the whole-segment minimum forbids it.
  const end = Math.PI / 2;
  const r = ask(synth([0, 0, 0, 1]), P0, UX, end);
  assert.equal(r.status, 'unknown', 'far-end touch never excludes');
  assert.ok(Math.abs(faceValue([0, 0, 0, 1], P0, UX, end)) < 1e-12,
    `far endpoint touches zero (${faceValue([0, 0, 0, 1], P0, UX, end)})`);
  let interior = Infinity;
  for (let i = 0; i < 400; i++) interior = Math.min(interior,
    faceValue([0, 0, 0, 1], P0, UX, (end * i) / 400));
  assert.ok(interior > 1e-3, `interior strictly positive (${interior}) yet still unknown`);
  console.log(`  far-end touch at pi/2 unknown; interior min over [0, pi/2) ${interior.toFixed(4)}`);
});

check('outside at origin but entering later is never excluded', () => {
  // f(theta) = cos(theta), range 2: outside at 0, inside past pi/2.
  const r = ask(synth([0, 0, 0, 1]), P0, UX, 2);
  assert.equal(r.status, 'unknown', 'later entry blocks exclusion');
  assert.equal(r.reason, 'no-witness', 'recorded as no-witness, not occupancy');
  let entered = false;
  for (let i = 0; i <= 400; i++) {
    if (faceValue([0, 0, 0, 1], P0, UX, (2 * i) / 400) < -1e-9) { entered = true; break; }
  }
  assert.ok(entered, 'independent samples prove the ray later enters');
  console.log(`  range-2 ray outside at origin, sampled inside later: unknown/no-witness`);
});

check('rays beginning inside are never excluded', () => {
  for (const range of [0.05, 0.5, 2]) {
    const r = ask(synth([0, 0, 0, -1]), P0, UX, range);
    assert.equal(r.status, 'unknown', `inside origin at range ${range} stays unknown`);
  }
  assert.ok(faceValue([0, 0, 0, -1], P0, UX, 0) < 0, 'origin value is negative (exact)');
  console.log(`  inside origin unknown at ranges 0.05/0.5/2; f(0) = -1 exactly`);
});

check('nearly coplanar and degenerate poles stay unknown', () => {
  assert.equal(ask(synth([0, 1, 0, 1e-15]), P0, UX, 0.5).status, 'unknown', 'near-coplanar unknown');
  assert.equal(ask(synth([0, 1, 0, 0]), P0, UX, 0.5).status, 'unknown', 'identically-zero face unknown');
  assert.equal(ask(synth([0, 1, 0, 0]), P0, UX, 0).status, 'unknown', 'degenerate face unknown at zero range too');
  console.log(`  near-coplanar (1e-15 tilt) and f-identically-0 faces: all unknown`);
});

check('pi*R limit: full half-circle never excludes a non-degenerate face', () => {
  const r = ask(synth([0, 0, 0, 1]), P0, UX, Math.PI);
  assert.equal(r.status, 'unknown', 'half-circle span cannot exclude cos face');
  const prof = witnessProfile([0, 0, 0, 1], P0, UX, Math.PI);
  assert.ok(prof.refined < -0.999, `samples reach the antipode dip (${prof.refined})`);
  assert.throws(() => ask(synth([0, 0, 0, 1]), P0, UX, Math.PI + 1e-9), /maxDistance/);
  const R8 = createMetricSpace({ kind: 's3', curvatureRadius: 8 });
  const cell8 = synth([0, 0, 0, 1]);
  assert.throws(() => excludeSphericalCell(R8, cell8, P0, UX, { maxDistance: 8 * Math.PI + 0.01 }), /maxDistance/);
  console.log(`  range pi excluded never; beyond pi*R throws (R=1 and R=8)`);
});

check('budgets are exact and validation refuses invalid inputs', () => {
  const mixed = synth([0, 1, 0, 0]);
  mixed.planes[3] = [0, 0, 0, 1];
  for (let cap = 0; cap <= 6; cap++) {
    const r = ask(mixed, P0, UX, 0.5, { maxWork: cap });
    assert.ok(r.work <= cap, `cap ${cap}: work ${r.work} within budget`);
    assert.equal(r.status, cap < 4 ? 'unknown' : 'excluded', `cap ${cap} transitions at face 3`);
    if (cap < 4) assert.equal(r.reason, 'work-budget', `cap ${cap} is a budget refusal`);
    if (cap >= 4) { assert.equal(r.face, 3); assert.equal(r.work, 4); }
  }
  assert.throws(() => ask(synth([0, 0, 0, 1]), P0, UX, 0.5, { maxWork: 2.5 }), /maxWork/);
  assert.throws(() => ask(synth([0, 0, 0, 1]), P0, UX, -0.1), /maxDistance/);
  assert.throws(() => ask(synth([0, 0, 0, 1]), P0, UX, NaN), /maxDistance/);
  const e3 = createMetricSpace({ kind: 'e3', curvatureRadius: 1 });
  assert.throws(() => excludeSphericalCell(e3, synth([0, 0, 0, 1]), [0, 0, 0], [1, 0, 0], { maxDistance: 1 }), /S3/);
  assert.throws(() => excludeSphericalCell(space1, { entity: { kind: 'geodesic-cell' }, planes: [[0, 0, 0, 1]] },
    P0, UX, { maxDistance: 0.5 }), /six-plane/);
  const bad = synth([0, 0, 0, 1]); bad.planes[2] = [0, 0, 0, 2];
  assert.throws(() => ask(bad, P0, UX, 0.5), /pole/);
  console.log(`  work caps 0..6 transition exactly at face 3; invalid maxWork/range/space/cell/pole throw`);
});

check('input drift can only produce unknown, never a witness', () => {
  const drifted = P0.map((x) => x * (1 + 1e-10));
  assert.equal(ask(synth([0, 0, 0, 1]), drifted, UX, 1).reason, 'input-roundoff', 'scaled position refuses');
  assert.equal(ask(synth([0, 0, 0, 1]), P0, [1, 0, 0, 1e-9], 1).reason, 'input-roundoff', 'non-tangent ray refuses');
  assert.throws(() => excludeSphericalCell(space1, synth([0, 0, 0, 1]), P0, [2, 0, 0, 0], { maxDistance: 1 }),
    /unit length/, 'non-unit direction throws');
  console.log(`  drifted position/tangent -> input-roundoff; non-unit direction throws`);
});

check('ambiguous face does not block a different valid full-span witness', () => {
  // Face 0 is identically ambiguous (f == 0 everywhere); face 3 excludes [0, 0.5].
  const cell = synth([0, 1, 0, 0]);
  cell.planes[3] = [0, 0, 0, 1];
  cell.planes[4] = [0, 0, 0, -1];
  const short = ask(cell, P0, UX, 0.5);
  assert.equal(short.status, 'excluded', 'valid witness wins despite ambiguous face 0');
  assert.equal(short.face, 3, 'witness is face 3, not the ambiguous face');
  assertWitnessConsistent(short, cell.planes[3], P0, UX, 0.5, 'ambiguous+valid');
  // The same witness fails on the longer ray that later enters that face.
  const long = ask(cell, P0, UX, 2);
  assert.equal(long.status, 'unknown', 'longer ray loses the witness');
  assert.equal(long.reason, 'no-witness', 'no persistent face => UNKNOWN, not occupancy');
  let entered = false;
  for (let i = 0; i <= 400; i++) {
    if (faceValue(cell.planes[3], P0, UX, (2 * i) / 400) < -1e-9) { entered = true; break; }
  }
  assert.ok(entered, 'samples prove entry on the longer span');
  console.log(`  face 3 excludes [0,0.5] past ambiguous face 0; same face fails [0,2]: unknown`);
});

function compileCell(R, position, halfExtent, frame, tag) {
  const world = compileRegionWorld({
    format: 'nil-scene', version: 2, id: tag, units: { name: 'design-unit', playerRadius: 0.01 * R },
    regions: [{ id: 'r', geometry: { kind: 's3', curvatureRadius: R }, topology: 'cover', extent: R }],
    entities: [
      { id: 's', kind: 'spawn', regionId: 'r', position: [0, 0, 0] },
      { id: 'c', kind: 'geodesic-cell', regionId: 'r', position, halfExtent, ...(frame ? { frame } : {}) },
    ],
    connections: [],
  });
  const region = world.regions.get('r');
  return { space: region.space, cell: region.field.primitives[0] };
}

check('compiled translated/rotated cells at multiple R: every witness verified', () => {
  const frames = [
    { forward: [0.87758256, 0.47942554, 0], up: [0, 0, 1] },
    { forward: [0.45359612, 0.89120736, 0], up: [0, 0, 1] },
  ];
  let total = 0;
  let example = null;
  for (const R of [0.5, 1, 8, 100]) {
    const { space, cell } = compileCell(R, [0.4 * R, 0, 0], [0.06 * R, 0.05 * R, 0.04 * R],
      frames[R < 2 ? 0 : 1], `audr${String(R).replace('.', 'p')}`);
    const before = JSON.stringify(cell.planes);
    const p = [0, 0, 0, 1];
    let witnesses = 0, rays = 0;
    for (let j = 0; j < 72; j++) {
      const angle = (j * 2 * Math.PI) / 72;
      const dirs = [
        [Math.cos(angle), Math.sin(angle), 0, 0],
        [Math.cos(angle) * 0.9, Math.sin(angle) * 0.9, Math.sqrt(1 - 0.81), 0].slice(0, 3).concat([0]),
      ];
      for (const dir of dirs) {
        const u = dir.map((x, k) => x - p[k] * dot(p, dir));
        const norm = Math.hypot(...u);
        const uu = u.map((x) => x / norm);
        rays++;
        const result = excludeSphericalCell(space, cell, p, uu, { maxDistance: 0.8 * R });
        if (result.status !== 'excluded') continue;
        witnesses++;
        total++;
        const prof = assertWitnessConsistent(result, cell.planes[result.face], p, uu, 0.8, `R=${R} ray ${j}`);
        if (!example) example = { R, j, face: result.face, lower: result.lower, refined: prof.refined };
      }
    }
    assert.ok(witnesses > 0, `R=${R}: no excluded ray found`);
    assert.equal(JSON.stringify(cell.planes), before, `R=${R}: stored poles untouched by screening`);
    console.log(`  R=${R}: ${witnesses}/${rays} rays excluded, all sampled+refined above claimed lower`);
  }
  assert.ok(total > 100, `only ${total} witnesses`);
  console.log(`  ${total} witnesses total; e.g. R=${example.R} ray ${example.j} face ${example.face} ` +
    `lower ${example.lower.toExponential(3)} refined-min ${example.refined.toExponential(3)}`);
});

check('poses on authored face planes: on-plane origins never exclude', () => {
  const { space, cell } = compileCell(8, [3, 0, 0], [0.5, 0.4, 0.3],
    { forward: [0.45359612, 0.89120736, 0], up: [0, 0, 1] }, 'faceplane');
  const pole = cell.planes[2];
  const dev = Math.abs(Math.hypot(...pole) - 1);
  assert.ok(dev < 1e-8, 'compile-legal pole used verbatim (no harness normalization)');
  const onPlane = (seed) => {
    // Exact plane foot: divide by dot(pole, pole) since compile-legal
    // decimal poles are off-unit up to 1e-8. The stored pole is untouched;
    // only the test point is projected.
    const pp = dot(pole, pole);
    const d = dot(seed, pole) / pp;
    const q = seed.map((x, k) => x - d * pole[k]);
    const m = Math.hypot(...q);
    return q.map((x) => x / m);
  };
  const alongPlane = (p, seed) => {
    const pp = dot(pole, pole);
    const w = seed.map((x, k) => x - dot(seed, p) * p[k] - (dot(seed, pole) / pp) * pole[k]);
    // Re-tangentize exactly at p (u.pole keeps only double roundoff now
    // that the pole component is divided out; the pole itself is untouched).
    const t = w.map((x, k) => x - dot(w, p) * p[k]);
    const m = Math.hypot(...t);
    return t.map((x) => x / m);
  };
  const p = onPlane([1, 0.3, 0.2, 0.5]);
  // Exact foot projection leaves only double roundoff: the normalized point
  // is on the authored plane to ~1e-16. The harness never renormalizes the
  // stored pole itself.
  assert.ok(Math.abs(dot(p, pole)) < 1e-12, `origin on authored plane (${dot(p, pole).toExponential(1)})`);
  const u = alongPlane(p, [0.2, 1, 0.4, 0.1]);
  assert.ok(Math.abs(dot(p, u)) < 1e-9 && Math.abs(dot(u, u) - 1) < 1e-12, 'valid unit tangent along plane');
  // Origin on face 2's plane: face 2 itself can never witness, but another
  // face may. Both outcomes are consistent; neither claims occupancy.
  for (const range of [0.5, 2, 8]) {
    const r = excludeSphericalCell(space, cell, p, u, { maxDistance: range });
    if (r.status === 'excluded') {
      assert.notEqual(r.face, 2, `range ${range}: the on-plane face never witnesses`);
      assertWitnessConsistent(r, cell.planes[r.face], p, u, range / 8, `on-plane range=${range}`);
      console.log(`  on-plane ray range ${range}: excluded via face ${r.face} (verified)`);
    } else {
      console.log(`  on-plane ray range ${range}: unknown/${r.reason}`);
    }
  }
  // Tilted off the plane: each outcome must still be self-consistent.
  let resolved = 0, tried = 0;
  for (const delta of [1e-9, 1e-6, 1e-3, 0.02]) {
    const q = p.map((x, k) => x + delta * pole[k]);
    const m = Math.hypot(...q);
    const pp = q.map((x) => x / m);
    const w = u.map((x, k) => x - dot(u, pp) * pp[k]);
    const uu = w.map((x) => x / Math.hypot(...w));
    for (const range of [0.5, 2]) {
      tried++;
      const r = excludeSphericalCell(space, cell, pp, uu, { maxDistance: range });
      if (r.status !== 'excluded') continue;
      resolved++;
      assertWitnessConsistent(r, cell.planes[r.face], pp, uu, range / 8, `off-plane d=${delta} range=${range}`);
    }
  }
  console.log(`  on-plane handled above (face 2 never witnesses); off-plane tilts: ${resolved}/${tried} resolve with verified witnesses`);
});

check('authored subtractor-cutter pose: screen resolves only a strictly-outside cell', () => {
  // No Claude-reported pose exists in this checkout (integration is concurrent
  // at base 7e61c4b); this constructs the same class: a ray starting exactly
  // on an authored subtractor face plane. The helper is tested directly.
  const world = compileRegionWorld({
    format: 'nil-scene', version: 2, id: 'cutterpose', units: { name: 'design-unit', playerRadius: 0.05 },
    regions: [{ id: 'r', geometry: { kind: 's3', curvatureRadius: 8 }, topology: 'cover', extent: 8 }],
    entities: [
      { id: 's', kind: 'spawn', regionId: 'r', position: [0, 5, 0] },
      { id: 'base', kind: 'geodesic-cell', regionId: 'r', position: [3, 0, 0], halfExtent: [0.5, 0.4, 0.3] },
      { id: 'cut', kind: 'geodesic-cell', regionId: 'r', position: [3.2, 0.1, 0], halfExtent: [0.3, 0.3, 0.3],
        op: 'subtract', target: 'base' },
    ],
    connections: [],
  });
  const region = world.regions.get('r');
  const cut = region.field.primitives.find((x) => x.entity.id === 'cut');
  const pole = cut.planes[0];
  const seed = [0.5, -0.4, 0.3, 0.7];
  // Exact plane foot (divide by dot(pole, pole)); the stored pole is untouched.
  const pp = dot(pole, pole);
  const d = dot(seed, pole) / pp;
  const qq = seed.map((x, k) => x - d * pole[k]);
  const p = qq.map((x) => x / Math.hypot(...qq));
  assert.ok(Math.abs(dot(p, pole)) < 1e-12,
    `ray starts on the cutter face plane (${dot(p, pole).toExponential(1)})`);
  const w0 = [0.1, 0.9, -0.3, 0.2];
  const w1 = w0.map((x, k) => x - dot(w0, p) * p[k] - (dot(w0, pole) / pp) * pole[k]);
  const u = w1.map((x) => x / Math.hypot(...w1));
  const onCutter = excludeSphericalCell(region.space, cut, p, u, { maxDistance: 2 });
  // Origin exactly on face 0's plane: face 0 itself can never witness
  // (f(0) = 0 up to roundoff), but this pose deterministically excludes via
  // face 2 (observed lower 1.666e-1, verified below). Pinned: any change in
  // status or witness face is a behavior change, not sampling noise.
  assert.equal(onCutter.status, 'excluded', 'cutter-plane pose resolves via a full-span witness');
  assert.equal(onCutter.face, 2, 'witness is face 2, never the on-plane face 0');
  const cutterProf = assertWitnessConsistent(onCutter, cut.planes[2], p, u, 2 / 8, 'cutter on-plane');
  console.log(`  cutter-plane origin excluded via face 2 ` +
    `(lower ${onCutter.lower.toExponential(3)}, refined ${cutterProf.refined.toExponential(3)}): ` +
    `a full-span witness resolves this pose`);
  // Back the origin off the plane along the pole: the same cell may resolve.
  let resolved = null;
  for (const delta of [1e-4, 1e-3, 1e-2, 0.05]) {
    const q2 = p.map((x, k) => x + delta * pole[k]);
    const pp = q2.map((x) => x / Math.hypot(...q2));
    const w2 = u.map((x, k) => x - dot(u, pp) * pp[k]);
    const uu = w2.map((x) => x / Math.hypot(...w2));
    const r = excludeSphericalCell(region.space, cut, pp, uu, { maxDistance: 2 });
    if (r.status === 'excluded' && !resolved) {
      const prof = assertWitnessConsistent(r, cut.planes[r.face], pp, uu, 2 / 8, `cutter off-plane d=${delta}`);
      resolved = { delta, face: r.face, lower: r.lower, refined: prof.refined };
    }
  }
  console.log(`  off-plane offsets 1e-4..0.05: ` +
    (resolved
      ? `offset ${resolved.delta} resolves via face ${resolved.face} (lower ${resolved.lower.toExponential(3)}, refined ${resolved.refined.toExponential(3)})`
      : `none resolves this ray: screen does not fix every cutter refusal`));
});

console.log(`  worst sampler gap (sampled minus claimed lower): dense ${worstGap.dense.toExponential(3)}, ` +
  `refined ${worstGap.refined.toExponential(3)} at ${worstGap.tag}; allowance ${REF_ALLOW.toExponential(0)}`);
console.log(`s3 cell exclusion truth: ${passed}/${passed + failed}`);
if (failed) process.exitCode = 1;
