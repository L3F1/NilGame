// MUSE-66: independent H3 camera stress checks near the adapter envelope.
//
// Scope: radial rho 1.9 (inside author extent 2R) and rho 3.9 (outside author
// extent, inside representation 4R), R in {0.5, 8, 10000}. No triangle
// holonomy corpus is duplicated here; that belongs to hyperbolic-camera.test.js.
// Every comparison below is made AT THE SAME POINT with a Lorentz form written
// in this file, never against the adapter's own `dot` as the sole oracle.
//
// Point construction is independent of the adapter: p = (sinh(rho)*d, cosh(rho))
// for fixed seeded unit directions d. Forward/up are built by an independent
// Lorentz projection plus Lorentz Gram-Schmidt, so the camera inputs owe
// nothing to the code under test.
import assert from 'node:assert/strict';
import { createHyperbolicSpace } from './engine/geometry/hyperbolic-space.js';
import { createCameraFrame, turn, carryAlong } from './engine/world/camera-frame.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (gap ${Math.abs(a - b)})`);

// Independent Lorentz form (+,+,+,-). Written here, not imported.
const L = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] - a[3] * b[3];
const combine = (a, x, b, y) => a.map((v, i) => v * x + b[i] * y);
function det4(m) {
  let total = 0;
  for (let c = 0; c < 4; c++) {
    const s = m.slice(1).map(row => row.filter((_, j) => j !== c));
    const minor = s[0][0] * (s[1][1] * s[2][2] - s[1][2] * s[2][1])
      - s[0][1] * (s[1][0] * s[2][2] - s[1][2] * s[2][0])
      + s[0][2] * (s[1][0] * s[2][1] - s[1][1] * s[2][0]);
    total += (c % 2 ? -1 : 1) * m[0][c] * minor;
  }
  return total;
}

const RADII = [0.5, 8, 10000];
const RHOS = [1.9, 3.9]; // 1.9: inside author extent 2; 3.9: representation-only (extent 2, range 4)
const SEED_DIRS = [[0.6, -0.4, 0.35], [0.2, 0.9, -0.39], [-0.45, 0.3, 0.84]];
const SEED_F = [0.3, -0.7, 0.5, 0.2];
const SEED_U = [-0.5, 0.1, 0.8, -0.3];
const TOL = 1e-10; // conditioning floor at rho 3.9 is eps*cosh(3.9)^2 ~= 1e-13;
// worst measured input-construction residual is 1.9e-11; camera residuals <= 7e-13

const unit = (v) => v.map((x) => x / Math.hypot(...v));
const pointAt = (rho, d) => [...unit(d).map((x) => x * Math.sinh(rho)), Math.cosh(rho)];
const lorentzProject = (p, v) => v.map((x, i) => x - (L(p, v) / L(p, p)) * p[i]);

// Independently built Lorentz-orthonormal forward/up at p: project the fixed
// seeds with the file-local Lorentz projector, then Lorentz Gram-Schmidt.
function independentAxes(p) {
  const f0 = lorentzProject(p, SEED_F);
  const f = f0.map((x) => x / Math.sqrt(L(f0, f0)));
  const u1 = lorentzProject(p, SEED_U);
  const uOrth = u1.map((x, i) => x - L(u1, f) * f[i]);
  const u = uOrth.map((x) => x / Math.sqrt(L(uOrth, uOrth)));
  return { forward: f, up: u };
}

const spaces = RADII.map((R) => createHyperbolicSpace({ curvatureRadius: R, maxDistance: 2 * R }));
const points = [];
for (const h3 of spaces) for (const rho of RHOS) for (const d of SEED_DIRS) {
  points.push({ h3, R: h3.curvatureRadius, rho, p: pointAt(rho, d) });
}

test('envelope points validate; rho 1.9 is authored, rho 3.9 is representation-only', () => {
  for (const { h3, R, rho, p } of points) {
    h3.validatePoint(p);
    near(Math.asinh(Math.hypot(...p.slice(0, 3))) * R, rho * R, 1e-9 * R, `radial R=${R} rho=${rho}`);
    assert.equal(h3.withinDomain(p), rho < 2, `domain flag R=${R} rho=${rho}`);
    if (rho > 2) assert.throws(() => h3.encode(p), /outside/, 'representation-only point was encodable');
  }
});

test('projector is the identity on valid tangents at the envelope', () => {
  let worst = 0;
  for (const { h3, p } of points) {
    for (const t of h3.frame(p)) {
      const back = h3.tangentPart(p, t);
      worst = Math.max(worst, ...back.map((x, i) => Math.abs(x - t[i])));
    }
    const { forward, up } = independentAxes(p);
    for (const t of [forward, up]) {
      const back = h3.tangentPart(p, t);
      worst = Math.max(worst, ...back.map((x, i) => Math.abs(x - t[i])));
    }
  }
  console.log(`  projector identity: worst ${worst.toExponential(2)}`);
  assert.ok(worst <= TOL, `projector moved a tangent: ${worst}`);
});

test('envelope cameras are Lorentz-orthonormal, tangent and handed at the same point', () => {
  let worst = 0, worstVol = 0, at = null;
  for (const { h3, R, rho, p } of points) {
    const { forward, up } = independentAxes(p);
    const camera = createCameraFrame(h3, p, { forward, up });
    const axes = [camera.right, camera.forward, camera.up];
    for (let i = 0; i < 3; i++) {
      const r = Math.abs(L(p, axes[i]));
      if (r > worst) { worst = r; at = `R=${R} rho=${rho} tangency ${i}`; }
      for (let j = 0; j < 3; j++) {
        const g = Math.abs(L(axes[i], axes[j]) - (i === j ? 1 : 0));
        if (g > worst) { worst = g; at = `R=${R} rho=${rho} gram ${i}${j}`; }
      }
      h3.validateTangent(p, axes[i]);
    }
    const basis = h3.frame(p);
    const vol = Math.abs(det4([p, camera.right, camera.forward, camera.up]) - det4([p, basis[0], basis[1], basis[2]]));
    if (vol > worstVol) worstVol = vol;
  }
  console.log(`  envelope Gram/tangency: worst ${worst.toExponential(2)} at ${at}; handedness vol gap ${worstVol.toExponential(2)}`);
  assert.ok(worst <= TOL, `worst ${worst} at ${at}`);
  assert.ok(worstVol <= 1e-9, `handedness volume gap ${worstVol}`);
});

test('bounded short carried turns stay inside representation 4', () => {
  let worst = 0;
  for (const { h3, R, rho, p } of points) {
    const { forward, up } = independentAxes(p);
    let camera = createCameraFrame(h3, p, { forward, up });
    camera = turn(camera, { yaw: 0.2, pitch: -0.1 });
    // Step back toward the origin: rho can only shrink, so range 4 is safe.
    const back = h3.logAt(camera.position, h3.origin);
    const dir = back.map((x) => x / h3.norm(camera.position, back));
    const seg = h3.stepWithTransport(camera.position, dir, 0.05 * R);
    camera = carryAlong(camera, seg);
    const rho2 = Math.asinh(Math.hypot(...camera.position.slice(0, 3)));
    assert.ok(rho2 < 4, `crossed representation 4: rho ${rho2}`);
    for (const v of [camera.right, camera.forward, camera.up]) {
      worst = Math.max(worst, Math.abs(L(camera.position, v) - 0), Math.abs(L(v, v) - 1));
    }
    near(L(camera.forward, camera.forward), 1, TOL, 'carried forward unit');
  }
  console.log(`  short carried turns: worst tangency/norm ${worst.toExponential(2)}`);
  assert.ok(worst <= TOL, `carried residual ${worst}`);
});

test('radial drift on the input is repaired, not re-aimed, at the envelope', () => {
  let worst = 0;
  for (const { h3, p } of points) {
    const { forward, up } = independentAxes(p);
    const dirty = combine(forward, 1, p, 0.02);
    assert.throws(() => h3.validateTangent(p, dirty), /tangent/, 'drifted input was already clean');
    const repaired = createCameraFrame(h3, p, { forward: dirty, up });
    const clean = createCameraFrame(h3, p, { forward, up });
    near(L(p, repaired.forward), 0, TOL, 'repaired forward is tangent');
    for (const axis of ['forward', 'up', 'right']) {
      worst = Math.max(worst, ...repaired[axis].map((x, i) => Math.abs(x - clean[axis][i])));
    }
  }
  console.log(`  drift repair: worst re-aim ${worst.toExponential(2)}`);
  assert.ok(worst <= TOL, `repair re-aimed the camera: ${worst}`);
});

test('degenerate aims are refused at the envelope, never invented', () => {
  for (const { h3, p } of points) {
    const { forward, up } = independentAxes(p);
    assert.throws(() => createCameraFrame(h3, p, { forward: [0, 0, 0, 0], up }), /degenerate/);
    assert.throws(() => createCameraFrame(h3, p, { forward, up: forward.map((x) => x * -3) }), /parallel/);
  }
});

test('ISOLATED FAIL-DEMO shape: the Euclidean projector mis-aims at the envelope', () => {
  // What the pre-Lorentz code did: basis coefficients with the Euclidean sum.
  // Pinned here as the failure this suite guards against, not as acceptance.
  const euclid = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  let worstDeg = 0;
  for (const { h3, p } of points) {
    const basis = h3.frame(p);
    for (const t of basis) {
      const wrong = basis.reduce((acc, e) => combine(acc, 1, e, euclid(t, e)), [0, 0, 0, 0]);
      const aim = Math.acos(Math.min(1, L(wrong, t) / Math.sqrt(L(wrong, wrong)))) * 180 / Math.PI;
      worstDeg = Math.max(worstDeg, aim);
    }
  }
  console.log(`  Euclidean projector at envelope: worst aim error ${worstDeg.toFixed(1)} deg`);
  assert.ok(worstDeg > 5, `the failing case no longer fails: ${worstDeg}`);
});

console.log(`\nhyperbolic camera envelope: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
