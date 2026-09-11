// MUSE-56: independent full-circle global transport evidence for EXISTING
// stepWithTransport in engine/geometry/metric-space.js. No kernel edits.
//
// The step formula (sin/cos rotation in the start/direction plane) is globally
// defined on the whole unit S3 in R4; withinDomain is a bounded runtime-patch
// policy (default maxDistance = pi*R/2, an open hemisphere). These checks run
// full 2*pi*R loops, antipodal half-circles and pi/2-leg triangle loops that
// leave the patch, and separately assert the patch guards still hold.
// References are test-local arithmetic (dot/hypot/atan2/acos) and single-shot
// closed forms; never a recomposed copy of the production stepping.
import assert from 'node:assert/strict';
import { createMetricSpace } from './engine/geometry/metric-space.js';

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

const dot = (a, b) => a.reduce((t, x, i) => t + x * b[i], 0);
const dist = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));

const RADII = [0.5, 8, 10000];
const O = [0, 0, 0, 1]; // e4
const A = [1, 0, 0, 0]; // e1
const B = [0, 1, 0, 0]; // e2
const T1 = [1, 0, 0, 0], T2 = [0, 1, 0, 0]; // in-plane tangents at O

check('full 2*pi*R single loop returns point and direction', () => {
  let worstP = 0, worstU = 0;
  for (const R of RADII) {
    const space = createMetricSpace({ kind: 's3', curvatureRadius: R });
    const u0 = [1, 0, 0, 0];
    const loop = space.stepWithTransport(O, u0, 2 * Math.PI * R);
    worstP = Math.max(worstP, dist(loop.position, O));
    worstU = Math.max(worstU, dist(loop.direction, u0));
  }
  assert.ok(worstP < 1e-12 && worstU < 1e-12, `loop did not close (${worstP}, ${worstU})`);
  console.log(`  full-loop pos/dir err=${worstP.toExponential(2)}/${worstU.toExponential(2)} at R=0.5/8/10000`);
});

check('full loop carries three tangent vectors back to themselves', () => {
  // Parallel transport around a closed geodesic is the identity: an
  // orthonormal tangent frame must return, with norms preserved.
  let worstV = 0, worstN = 0;
  for (const R of RADII) {
    const space = createMetricSpace({ kind: 's3', curvatureRadius: R });
    const frame = [[3.7, 0, 0, 0], [0, 2.1, -1.3, 0], [0, 0, 0.5, 0]];
    const norms = frame.map((v) => Math.hypot(...v));
    const loop = space.stepWithTransport(O, [1, 0, 0, 0], 2 * Math.PI * R);
    frame.forEach((v, i) => {
      const c = loop.carry(v);
      worstV = Math.max(worstV, dist(c, v));
      worstN = Math.max(worstN, Math.abs(Math.hypot(...c) - norms[i]));
      assert.ok(Math.abs(dot(loop.position, c)) < 1e-9, `carried vector not tangent R=${R}`);
    });
  }
  assert.ok(worstV < 1e-9 && worstN < 1e-12, `frame not preserved (${worstV}, ${worstN})`);
  console.log(`  frame return err=${worstV.toExponential(2)}, norm err=${worstN.toExponential(2)}`);
});

check('half-circle lands at antipode via segment carry, not endpoint transport', () => {
  let worstP = 0, worstU = 0, worstC = 0;
  for (const R of RADII) {
    const space = createMetricSpace({ kind: 's3', curvatureRadius: R });
    const u0 = [1, 0, 0, 0];
    const half = space.stepWithTransport(O, u0, Math.PI * R);
    // Closed forms: rotation by pi in the (O,u0) plane.
    worstP = Math.max(worstP, dist(half.position, [0, 0, 0, -1]));
    worstU = Math.max(worstU, dist(half.direction, [-1, 0, 0, 0]));
    // Endpoint transport is undefined at antipodes and must refuse; the
    // segment's own carry is the supported path and must agree with it.
    assert.throws(() => space.transport(O, half.position, u0),
      /Antipodal transport needs an explicit geodesic segment/, `R=${R} endpoint transport admitted`);
    const carried = half.carry([0, 2.5, 0, 0]);
    worstC = Math.max(worstC, dist(carried, [0, 2.5, 0, 0]));
    assert.ok(Math.abs(dot(half.position, carried)) < 1e-9, `antipodal carry not tangent R=${R}`);
    assert.throws(() => space.transport(O, half.position, u0), Error, `R=${R} no-throw`);
  }
  assert.ok(worstP < 1e-12 && worstU < 1e-12 && worstC < 1e-9,
    `antipode mismatch (${worstP}, ${worstU}, ${worstC})`);
  console.log(`  antipode pos/dir/carry err=${worstP.toExponential(2)}/${worstU.toExponential(2)}/${worstC.toExponential(2)}; endpoint transport throws`);
});

check('720 short steps agree with one full 2*pi*R loop', () => {
  let worstP = 0, worstU = 0, worstC = 0;
  for (const R of RADII) {
    const space = createMetricSpace({ kind: 's3', curvatureRadius: R });
    const u0 = [1, 0, 0, 0];
    const total = 2 * Math.PI * R, n = 720, h = total / n;
    let p = O.slice(), u = u0.slice(), v = [0, 1.7, 0, 0];
    for (let i = 0; i < n; i++) {
      const leg = space.stepWithTransport(p, u, h);
      v = leg.carry(v); p = leg.position; u = leg.direction;
    }
    const one = space.stepWithTransport(O, u0, total);
    worstP = Math.max(worstP, dist(p, one.position));
    worstU = Math.max(worstU, dist(u, one.direction));
    worstC = Math.max(worstC, dist(v, one.carry([0, 1.7, 0, 0])));
  }
  assert.ok(worstP < 1e-9 && worstU < 1e-9 && worstC < 1e-9,
    `chained vs single loop disagree (${worstP}, ${worstU}, ${worstC})`);
  console.log(`  720-step vs single-loop pos/dir/carry=${worstP.toExponential(2)}/${worstU.toExponential(2)}/${worstC.toExponential(2)}`);
});

function octantCornerAngles() {
  // Explicit travel/arrival tangents at each vertex, dotted with own
  // arithmetic: O leaves along T1, arrives along -T2; A arrives along -e4,
  // leaves along T2-at-A; B arrives along -e1, leaves along e4-at-B.
  const atO = Math.abs(dot(T1, [0, -1, 0, 0]));
  const atA = Math.abs(dot([0, 0, 0, -1], [0, 1, 0, 0]));
  const atB = Math.abs(dot([-1, 0, 0, 0], [0, 0, 0, 1]));
  return [atO, atA, atB].map((d) => Math.acos(Math.min(1, d)));
}

// Octant legs: each pi/2 arc with an EXPLICIT unit direction (no logAt aiming).
const FWD = [[A, [1, 0, 0, 0]], [B, [0, 1, 0, 0]], [O, [0, 0, 0, 1]]];
const REV = [[B, [0, 1, 0, 0]], [A, [1, 0, 0, 0]], [O, [0, 0, 0, 1]]];

function runTriangle(space, R, legs, v0) {
  const h = Math.PI * R / 2;
  let p = O.slice(), v = v0.slice(), worstClose = 0;
  for (const [Q, d] of legs) {
    assert.ok(Math.abs(space.distance(p, Q) - h) < 1e-9 * Math.max(1, R),
      `leg is not pi/2*R (${space.distance(p, Q)} vs ${h})`);
    const leg = space.stepWithTransport(p, d, h);
    worstClose = Math.max(worstClose, dist(leg.position, Q));
    v = leg.carry(v); p = leg.position;
  }
  return { p, v, worstClose };
}

check('octant triangle closes; forward holonomy equals Girard area pi/2', () => {
  // Independent reference: the three corner angles are each pi/2 (own dots
  // above), so Girard gives area = 3*(pi/2) - pi = pi/2 on the unit sphere.
  const angles = octantCornerAngles();
  angles.forEach((a, i) => assert.ok(Math.abs(a - Math.PI / 2) < 1e-12, `corner ${i} not right (${a})`));
  const area = angles.reduce((t, a) => t + a, 0) - Math.PI;
  assert.ok(Math.abs(area - Math.PI / 2) < 1e-12, `reference area not pi/2 (${area})`);
  let worstClose = 0, worstHolo = 0;
  for (const R of RADII) {
    const space = createMetricSpace({ kind: 's3', curvatureRadius: R });
    const { p, v, worstClose: c } = runTriangle(space, R, FWD, T1);
    worstClose = Math.max(worstClose, c, dist(p, O));
    const signed = Math.atan2(dot(v, T2), dot(v, T1));
    worstHolo = Math.max(worstHolo, Math.abs(signed - area));
    assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-12, `holonomy vector changed norm R=${R}`);
    assert.ok(Math.abs(dot(p, v)) < 1e-9, `holonomy vector not tangent R=${R}`);
  }
  assert.ok(worstClose < 1e-9 && worstHolo < 1e-9, `triangle mismatch (${worstClose}, ${worstHolo})`);
  console.log(`  fwd close=${worstClose.toExponential(2)}, signed holonomy=+pi/2 within ${worstHolo.toExponential(2)} (area=pi/2)`);
});

check('reversed octant triangle gives opposite holonomy -pi/2', () => {
  let worstClose = 0, worstHolo = 0;
  for (const R of RADII) {
    const space = createMetricSpace({ kind: 's3', curvatureRadius: R });
    const { p, v, worstClose: c } = runTriangle(space, R, REV, T1);
    worstClose = Math.max(worstClose, c, dist(p, O));
    const signed = Math.atan2(dot(v, T2), dot(v, T1));
    worstHolo = Math.max(worstHolo, Math.abs(signed + Math.PI / 2));
  }
  assert.ok(worstClose < 1e-9 && worstHolo < 1e-9, `reversed mismatch (${worstClose}, ${worstHolo})`);
  console.log(`  rev close=${worstClose.toExponential(2)}, signed holonomy=-pi/2 within ${worstHolo.toExponential(2)}`);
});

check('carried frame vectors stay unit and tangent on every leg', () => {
  // Norms and tangency sampled after EVERY leg of the forward octant loop,
  // for three mutually orthogonal unit tangents at O.
  let worstN = 0, worstT = 0;
  for (const R of RADII) {
    const space = createMetricSpace({ kind: 's3', curvatureRadius: R });
    const h = Math.PI * R / 2;
    let p = O.slice();
    let vs = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]];
    for (const [, d] of FWD) {
      const leg = space.stepWithTransport(p, d, h);
      assert.ok(Math.abs(Math.hypot(...leg.position) - 1) < 1e-12, `off sphere R=${R}`);
      assert.ok(Math.abs(Math.hypot(...leg.direction) - 1) < 1e-12, `direction not unit R=${R}`);
      assert.ok(Math.abs(dot(leg.position, leg.direction)) < 1e-9, `direction not tangent R=${R}`);
      vs = vs.map((v) => leg.carry(v));
      vs.forEach((v) => {
        worstN = Math.max(worstN, Math.abs(Math.hypot(...v) - 1));
        worstT = Math.max(worstT, Math.abs(dot(leg.position, v)));
      });
      p = leg.position;
    }
  }
  assert.ok(worstN < 1e-12 && worstT < 1e-9, `frame degraded (${worstN}, ${worstT})`);
  console.log(`  per-leg norm err=${worstN.toExponential(2)}, tangency err=${worstT.toExponential(2)}`);
});

check('withinDomain is a bounded patch; the step formula is global; guards hold', () => {
  for (const R of RADII) {
    const space = createMetricSpace({ kind: 's3', curvatureRadius: R });
    const anti = space.stepWithTransport(O, [1, 0, 0, 0], Math.PI * R).position;
    // Points the loops above visit lie OUTSIDE the default patch, yet every
    // step above landed exactly: the formula is global, the domain is policy.
    assert.equal(space.withinDomain(O), true, `R=${R} origin outside patch`);
    assert.equal(space.withinDomain(anti), false, `R=${R} antipode inside patch`);
    assert.equal(space.withinDomain(A), false, `R=${R} equator inside patch`);
    assert.throws(() => space.encode(anti), /outside runtime patch/, `R=${R} encode admitted antipode`);
    assert.throws(() => space.encode(A), /outside runtime patch/, `R=${R} encode admitted equator`);
  }
  // Patch guards are NOT relaxed: hemispheric cap and antipodal transport refusal.
  assert.throws(() => createMetricSpace({ kind: 's3', curvatureRadius: 8, maxDistance: Math.PI * 8 }),
    /cannot exceed an open hemisphere/, 'maxDistance cap relaxed');
  console.log('  antipode/equator outside patch but stepped exactly; encode+maxDistance+transport guards intact');
});

console.log(`\nMUSE-56 global-s3-transport-truth: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
