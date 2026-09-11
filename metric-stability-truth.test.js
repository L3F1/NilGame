// MUSE-50: independent audit of the S3 numerical transport repair.
//
// The repair (3207536, engine/geometry/metric-space.js): normalize validates
// first, strips radial roundoff, then normalizes; stepWithTransport retracts
// point/direction representatives on each nonzero leg and carries every vector
// through the same linear map with radial cleanup (never renormalizing carried
// vectors); zero travel is exact identity. Region spaces ARE these metric
// spaces (region-world.js builds each region space with createMetricSpace),
// so this unit-level audit covers the kernel the walker and camera ride on.
// No engine/app changes. Verdicts: docs/qa/muse50-metric-stability.md.
import assert from 'node:assert/strict';
import { createMetricSpace } from './engine/geometry/metric-space.js';

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

// Own arithmetic only: dot, ambient norm, angles. Never stepWithTransport,
// normalize, or carry. References are single-shot closed forms (one cos/sin
// evaluation for a whole chained path; Girard for loops), never a recomposed
// copy of the production stepping.
const dot = (a, b) => a.reduce((t, x, i) => t + x * b[i], 0);
const dist = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
const ambientAngle = (a, b) => Math.acos(Math.min(1, Math.max(-1, dot(a, b))));

check('repeated nonzero legs match one closed-form rotation; step equals leg', () => {
  // N production legs totaling 0.6 rad vs a single test-local rotation by
  // 0.6: pref = [sin, 0, 0, cos], uref = [cos, 0, 0, -sin]. R and leg size
  // vary; error accumulates over up to 6000 legs and is reported, not cited.
  let worstP = 0, worstU = 0;
  for (const R of [0.5, 8, 100]) {
    const space = createMetricSpace({ kind: 's3', curvatureRadius: R });
    for (const h of [R * 1e-4, R * 0.02]) {
      const n = Math.round(0.6 * R / h);
      let p = [0, 0, 0, 1], u = [1, 0, 0, 0];
      for (let i = 0; i < n; i++) {
        const leg = space.stepWithTransport(p, u, h);
        assert.deepEqual(space.step(p, u, h), leg.position, `step/leg disagree R=${R} leg ${i}`);
        p = leg.position; u = leg.direction;
      }
      const A = 0.6;
      worstP = Math.max(worstP, dist(p, [Math.sin(A), 0, 0, Math.cos(A)]));
      worstU = Math.max(worstU, dist(u, [Math.cos(A), 0, 0, -Math.sin(A)]));
    }
  }
  assert.ok(worstP < 1e-9 && worstU < 1e-9, `accumulated drift too large (${worstP}, ${worstU})`);
  console.log(`  R=.5/8/100 h=R*1e-4/R*.02 to 0.6 rad: worst pos err=${worstP.toExponential(2)} dir err=${worstU.toExponential(2)}`);
});

check('zero travel is exact identity, including carry', () => {
  for (const kind of ['e3', 's3']) {
    const space = createMetricSpace(kind === 's3' ? { kind, curvatureRadius: 8 } : { kind });
    const p = kind === 's3' ? [0, 0, 0, 1] : [1, 2, 3];
    const u = kind === 's3' ? [0, 1, 0, 0] : [0, 0, 1];
    const v = kind === 's3' ? [0.3, -0.4, 0.2, 0] : [3, -1, 2];
    const z = space.stepWithTransport(p, u, 0);
    assert.deepEqual(z.position, p, `${kind} zero-step position`);
    assert.deepEqual(z.direction, u, `${kind} zero-step direction`);
    assert.deepEqual(z.carry(v), v, `${kind} zero-step carry`);
    assert.deepEqual(space.step(p, u, 0), p, `${kind} position-only zero step`);
    // S3 still validates tangency at zero travel (every finite E3 vector is
    // tangent, so the E3 control is non-finite input instead).
    if (kind === 's3') assert.throws(() => z.carry([9, 9, 9, 9]), Error, `${kind} zero-step carry validates`);
    assert.throws(() => z.carry(v.map(() => NaN)), /finite/, `${kind} zero-step carry rejects NaN`);
  }
  console.log('  e3+s3 zero travel: exact position/direction/carry, invalid carry still throws');
});

check('carry preserves speeds and linearity, never resets to one', () => {
  // The repair deliberately does NOT normalize carried vectors: speeds and
  // linearity must survive. Norms 0.01/3.7 (not one) and a+b linearity are
  // checked with own hypot/arithmetic after 20 chained legs.
  let worstNorm = 0, worstLin = 0;
  for (const R of [0.5, 8, 100]) {
    const space = createMetricSpace({ kind: 's3', curvatureRadius: R });
    const a = [3.7, 0, 0, 0], b = [0, 2.1, -1.3, 0], tiny = [0.01, 0, 0, 0];
    const abs = [a, b, tiny].map((v) => Math.hypot(...v));
    let p = [0, 0, 0, 1], u = [0, 1, 0, 0];
    let va = a.slice(), vb = b.slice(), vt = tiny.slice(), vs = a.map((x, j) => x + b[j]);
    const h = R * 0.01;
    for (let i = 0; i < 20; i++) {
      const leg = space.stepWithTransport(p, u, h);
      // Carry takes vectors tangent at THIS leg's start, so the images are
      // threaded: norms still compare against the originals.
      const ca = leg.carry(va), cb = leg.carry(vb), ct = leg.carry(vt);
      const cs = leg.carry(vs);
      worstNorm = Math.max(worstNorm,
        Math.abs(Math.hypot(...ca) - abs[0]),
        Math.abs(Math.hypot(...cb) - abs[1]),
        Math.abs(Math.hypot(...ct) - abs[2]));
      worstLin = Math.max(worstLin, dist(cs, ca.map((x, j) => x + cb[j])));
      va = ca; vb = cb; vt = ct; vs = cs;
      p = leg.position; u = leg.direction;
    }
  }
  assert.ok(worstNorm < 1e-12, `carry changed a speed (${worstNorm})`);
  assert.ok(worstLin < 1e-12, `carry broke linearity (${worstLin})`);
  // A non-unit DIRECTION is still rejected: no silent velocity normalization.
  const space = createMetricSpace({ kind: 's3', curvatureRadius: 8 });
  assert.throws(() => space.stepWithTransport([0, 0, 0, 1], [2, 0, 0, 0], 0.1),
    /unit physical norm/, 'non-unit direction rejected');
  console.log(`  norms {0.01, 2.47, 3.7} kept to ${worstNorm.toExponential(2)}, linearity to ${worstLin.toExponential(2)}; non-unit direction throws`);
});

check('tiny radial roundoff accepted, invalid input rejected, callers untouched', () => {
  // Boundaries probed, not assumed: normalize accepts radial <= 1e-10 and
  // rejects >= 1e-6; steps absorb off-sphere <= 1e-9 and reject 1e-3.
  const space = createMetricSpace({ kind: 's3', curvatureRadius: 8 });
  const p = [0, 0, 0, 1];
  for (const e of [1e-16, 1e-12, 1e-10]) {
    const v = [1, 0, 0, e], before = v.slice();
    const u = space.normalize(p, v);
    assert.deepEqual(v, before, `caller vector mutated at eps=${e}`);
    assert.ok(Math.abs(Math.hypot(...u) - 1) < 1e-15, `output not unit at eps=${e}`);
    assert.ok(Math.abs(dot(u, p)) < 1e-15, `output not tangent at eps=${e}`);
    assert.ok(ambientAngle(u, [1, 0, 0, 0]) < 1e-9, `direction bent at eps=${e}`);
  }
  for (const e of [1e-6, 1e-4]) {
    assert.throws(() => space.normalize(p, [1, 0, 0, e]), /tangent/, `radial ${e} admitted`);
  }
  assert.throws(() => space.normalize(p, [0, 0, 0, 0]), /zero tangent/, 'zero vector admitted');
  assert.throws(() => space.normalize(p, [1, 0, 0, NaN]), /finite/, 'NaN admitted');
  for (const e of [1e-12, 1e-9]) {
    const leg = space.stepWithTransport([e, 0, 0, 1], [1, 0, 0, 0], 0.1);
    assert.ok(Math.abs(Math.hypot(...leg.position) - 1) < 1e-15, `retraction failed at off=${e}`);
  }
  assert.throws(() => space.stepWithTransport([1e-6, 0, 0, 1], [1, 0, 0, 0], 0.1),
    /tangent/, 'radial direction admitted by step');
  assert.throws(() => space.stepWithTransport([1e-3, 0, 0, 1], [1, 0, 0, 0], 0.1),
    /unit sphere/, 'far point admitted by step');
  console.log('  normalize: 1e-16..1e-10 cleaned, 1e-6+ throws; steps absorb 1e-9, refuse 1e-3; inputs never mutated');
});

check('inverse legs return to start without bias', () => {
  let worst = 0;
  for (const R of [0.5, 8, 100]) {
    const space = createMetricSpace({ kind: 's3', curvatureRadius: R });
    const h = R * 0.01, n = 50;
    let p = [0, 0, 0, 1], u = [1, 0, 0, 0];
    const p0 = p.slice();
    for (let i = 0; i < n; i++) { const leg = space.stepWithTransport(p, u, h); p = leg.position; u = leg.direction; }
    for (let i = 0; i < n; i++) {
      const leg = space.stepWithTransport(p, u.map((x) => -x), h);
      p = leg.position; u = leg.direction.map((x) => -x);
    }
    worst = Math.max(worst, dist(p, p0));
  }
  assert.ok(worst < 1e-9, `inverse legs did not return (${worst})`);
  console.log(`  50 forward + 50 reversed legs at R=.5/8/100: worst return err=${worst.toExponential(2)}`);
});

check('closed geodesic triangle rotates the frame by area over R squared', () => {
  // Nontrivial holonomy: right triangle OAB (right angle at O, legs a) has
  // Girard area 2*asin(sin a / sin c) - pi/2 with c = acos(cos^2 a). The
  // area is the test-local reference; aiming uses production logAt as
  // fixture setup (closed-form geodesic, not the repaired transport), and
  // the measured rotation is own dot/acos arithmetic. Same angular loop at
  // every R must give the same angle: holonomy is area/R^2 with area in
  // physical units, i.e. R-independent in radians.
  let worstClose = 0, worstAngle = 0;
  for (const R of [0.5, 8, 100]) {
    const space = createMetricSpace({ kind: 's3', curvatureRadius: R });
    for (const a of [0.1, 0.3]) {
      const O = [0, 0, 0, 1];
      const A = [Math.sin(a), 0, 0, Math.cos(a)], B = [0, Math.sin(a), 0, Math.cos(a)];
      const c = Math.acos(Math.cos(a) * Math.cos(a));
      const expected = 2 * Math.asin(Math.sin(a) / Math.sin(c)) - Math.PI / 2;
      const u0 = [1, 0, 0, 0];
      let p = O.slice(), v = u0.slice();
      for (const [Q, n] of [[A, 10], [B, 20], [O, 10]]) {
        const total = ambientAngle(p, Q) * R;
        for (let i = 0; i < n; i++) {
          const leg = space.stepWithTransport(p,
            space.normalize(p, space.logAt(p, Q)), total / n);
          v = leg.carry(v); p = leg.position;
        }
      }
      worstClose = Math.max(worstClose, dist(p, O));
      worstAngle = Math.max(worstAngle, Math.abs(ambientAngle(v, u0) - expected));
    }
  }
  assert.ok(worstClose < 1e-9, `loop did not close (${worstClose})`);
  assert.ok(worstAngle < 1e-9, `holonomy != Girard area (${worstAngle})`);
  console.log(`  triangles a=0.1/0.3 at R=.5/8/100: worst close err=${worstClose.toExponential(2)}, worst holonomy err=${worstAngle.toExponential(2)} (0.005008/0.045676 rad both sizes)`);
});

check('seeded per-leg radial residue does not accumulate', () => {
  // The shape contact slides leave: 1e-12 of radial error sown into the
  // direction before every one of 6000 legs. The repair retracts each leg's
  // representatives, so the residue never compounds (measured 3.25e-14);
  // unretracted stepping accumulates it linearly (old code: 1.75e-9).
  // Reference is the single-shot closed form for 0.6 rad.
  let worst = 0;
  for (const R of [0.5, 8]) {
    const space = createMetricSpace({ kind: 's3', curvatureRadius: R });
    const h = R * 1e-4, n = Math.round(0.6 * R / h);
    let p = [0, 0, 0, 1], u = [1, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const leg = space.stepWithTransport(p, [u[0], u[1], u[2], u[3] + 1e-12], h);
      p = leg.position; u = leg.direction;
    }
    worst = Math.max(worst, dist(p, [Math.sin(0.6), 0, 0, Math.cos(0.6)]));
  }
  assert.ok(worst < 1e-11, `radial residue accumulated (${worst})`);
  console.log(`  6000 legs with 1e-12 radial sown per leg: worst err=${worst.toExponential(2)} (unretracted: 1.75e-9)`);
});

console.log(`\nmetric-stability-truth: ${passed} checks passed, ${failed} failed`);
if (failed) process.exit(1);
