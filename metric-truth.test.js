// MUSE-32: the metric space, checked against identities it cannot fake.
//
// Differential geometry gives relations a wrong implementation cannot
// satisfy by luck, which beats recomputing the same formulas a second way.
// Each property below is stated as a sentence, then checked on e3 and on
// s3 at several radii. Where an identity holds only to a tolerance, the
// test prints the worst deviation and where it happens; tolerances come
// from a pre-pass (/tmp/probe-metric.mjs, scratch), never tuned to pass.
import assert from 'node:assert/strict';
import { createMetricSpace } from './engine/geometry/metric-space.js';

const scalar = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const normed = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
// Absolute tolerance scales with the radius: an O(1) separation at R=1e4
// carries O(1/R^2) curvature terms no implementation can round away.
const tol = (s) => 1e-12 * Math.max(1, s.curvatureRadius);

const spaces = {
  e3: createMetricSpace({ kind: 'e3', maxDistance: 5 }),
  s3R05: createMetricSpace({ kind: 's3', curvatureRadius: 0.5 }),
  s3R1: createMetricSpace({ kind: 's3' }),
  s3R7: createMetricSpace({ kind: 's3', curvatureRadius: 7 }),
};
const flat = createMetricSpace({ kind: 's3', curvatureRadius: 1e4 });

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
const unitAuthor = (s, v) => v.map((x) => x * 0.4 * Math.min(s.curvatureRadius, 2));

// log and exp invert each other, both ways, from 1e-6 to the patch edge.
for (const [name, s] of Object.entries(spaces)) {
  check(`log/exp invert on ${name}`, () => {
    const p = s.decode(unitAuthor(s, [1, -0.75, 0.5]));
    const f = s.frame(p);
    const dirs = [f[0], f[1], f[2], normed(f[0].map((x, i) => x + f[1][i]))];
    let worst = 0, at = null;
    for (const L of [1e-6, 1e-3, 0.1, 0.5, 1.0]) {
      if (L >= s.maxDistance) continue;
      for (const dir of dirs) {
        const v = dir.map((x) => x * L);
        const back = s.logAt(p, s.expAt(p, v));
        const e1 = Math.hypot(...sub(back, v));
        const rt = s.expAt(p, back);
        const e2 = name === 'e3' ? Math.hypot(...sub(rt, s.expAt(p, v))) : s.distance(rt, s.expAt(p, v));
        if (e1 > worst) { worst = e1; at = `log(exp) L=${L}`; }
        if (e2 > worst) { worst = e2; at = `exp(log) L=${L}`; }
      }
    }
    console.log(`  inversion/${name}: worst ${worst.toExponential(2)} at ${at}`);
    assert.ok(worst <= tol(s), `worst ${worst} exceeds ${tol(s)}`);
  });
}

// Below ~1e-9, renormalizing a displacement amplifies float dust past the
// tangency gate, and expAt refuses. That refusal is correct (the vector is
// genuinely not tangent to 1e-8), so this pins the floor rather than the
// error: if precision ever improves past it, delete this check.
check('tiny-separation floor: s3 refuses at 1e-13, e3 does not', () => {
  for (const [name, s] of Object.entries(spaces)) {
    const p = s.decode(unitAuthor(s, [1, -0.75, 0.5]));
    const v = s.frame(p)[0].map((x) => x * 1e-13);
    if (name === 'e3') {
      const back = s.logAt(p, s.expAt(p, v));
      assert.ok(Math.hypot(...sub(back, v)) <= 1e-12, 'e3 exact even here');
    } else {
      assert.throws(() => s.expAt(p, s.logAt(p, s.expAt(p, v))), /tangent/,
        `${name} should refuse a 1e-13 round trip`);
    }
  }
});

// distance is the norm of the logarithm, and symmetric.
for (const [name, s] of Object.entries(spaces)) {
  check(`distance is norm(log) on ${name}`, () => {
    const pts = [];
    for (let i = 0; i < 12; i++) {
      pts.push(s.decode(unitAuthor(s, [Math.sin(i * 1.7), Math.cos(i * 2.3), Math.sin(i * 0.9 + 1)])));
    }
    let worst = 0;
    for (const p of pts) for (const q of pts) {
      worst = Math.max(worst, Math.abs(s.distance(p, q) - s.norm(p, s.logAt(p, q))));
      worst = Math.max(worst, Math.abs(s.distance(p, q) - s.distance(q, p)));
    }
    console.log(`  distnorm/${name}: worst ${worst.toExponential(2)}`);
    assert.ok(worst <= tol(s), `worst ${worst} exceeds ${tol(s)}`);
  });
}

// A geodesic is locally shortest: kinked detours are strictly longer.
for (const [name, s] of Object.entries(spaces)) {
  check(`geodesics are shortest on ${name}`, () => {
    const p = s.decode(unitAuthor(s, [0.75, -0.5, 0.25]));
    const f = s.frame(p);
    let minMargin = Infinity, maxMargin = 0;
    for (const [u, T] of [[f[0], 0.5], [f[1], 1.0], [normed(f[0].map((x, i) => x + f[2][i])), 0.7]]) {
      const q = s.expAt(p, u.map((x) => x * T));
      const direct = s.distance(p, q);
      for (const delta of [0.05, 0.15, 0.4]) for (const w of f) {
        const m = s.expAt(p, u.map((x, i) => x * T / 2 + w[i] * delta));
        const mm = name === 'e3' ? m : normed(m);
        const margin = s.distance(p, mm) + s.distance(mm, q) - direct;
        minMargin = Math.min(minMargin, margin);
        maxMargin = Math.max(maxMargin, margin);
      }
    }
    console.log(`  shortest/${name}: min margin ${minMargin.toExponential(2)}, max ${maxMargin.toExponential(2)}`);
    assert.ok(minMargin > -1e-12, `detour shorter than geodesic by ${-minMargin}`);
    assert.ok(maxMargin > 1e-3, 'no deviation actually deviated');
  });
}

// Transport preserves the inner product of two vectors, not just one length.
for (const [name, s] of Object.entries(spaces)) {
  check(`transport is an isometry on ${name}`, () => {
    let worst = 0, at = null;
    for (let i = 0; i < 20; i++) {
      const p = s.decode(unitAuthor(s, [Math.sin(i * 2.1), Math.cos(i * 1.3), Math.sin(i * 0.7 + 2)]));
      const f = s.frame(p);
      const u = normed(f[0].map((x, k) => x + 0.5 * f[1][k]));
      const q = s.expAt(p, u.map((x) => x * 0.6));
      const v1 = f[2], v2 = normed(f[0].map((x, k) => x - f[2][k]));
      const before = s.dot(p, v1, v2);
      const e1 = Math.abs(before - s.dot(q, s.transport(p, q, v1), s.transport(p, q, v2)));
      const seg = s.stepWithTransport(p, u, 0.6);
      const e2 = Math.abs(before - s.dot(seg.position, seg.carry(v1), seg.carry(v2)));
      if (e1 > worst) { worst = e1; at = `transport i=${i}`; }
      if (e2 > worst) { worst = e2; at = `carry i=${i}`; }
    }
    console.log(`  isometry/${name}: worst ${worst.toExponential(2)} at ${at}`);
    assert.ok(worst <= 1e-12, `worst ${worst} exceeds 1e-12`);
  });
}

// Holonomy: around a closed geodesic triangle the vector returns rotated by
// area/R^2, and unchanged in E3. Side lengths go through l'Huilier's theorem
// (spherical excess from sides), an independent path from rotation composition.
function lhuilier(x, y, z) {
  const s = (x + y + z) / 2;
  const t = Math.tan(s / 2) * Math.tan((s - x) / 2) * Math.tan((s - y) / 2) * Math.tan((s - z) / 2);
  return 4 * Math.atan(Math.sqrt(Math.max(0, t)));
}
for (const [name, s] of Object.entries(spaces)) {
  check(`holonomy is area/R^2 on ${name}`, () => {
    const R = s.curvatureRadius;
    let worst = 0, at = null;
    for (const [a, b] of [[0.3, 0.3], [0.3, 0.6], [1.0, 1.0]]) {
      const o = s.origin, f = s.frame(o);
      const A = s.expAt(o, f[0].map((x) => x * a));
      const B = s.expAt(o, f[1].map((x) => x * b));
      let v = s.stepWithTransport(o, f[0], a).carry(f[0]);
      const dAB = s.distance(A, B);
      v = s.stepWithTransport(A, normed(s.logAt(A, B)), dAB).carry(v);
      const dBO = s.distance(B, o);
      v = s.stepWithTransport(B, normed(s.logAt(B, o)), dBO).carry(v);
      const ang = Math.acos(Math.min(1, Math.max(-1, s.dot(o, f[0], v))));
      const excess = name === 'e3' ? 0
        : lhuilier(s.distance(o, A) / R, s.distance(o, B) / R, dAB / R);
      const e = Math.abs(ang - excess);
      if (e > worst) { worst = e; at = `a=${a} b=${b}`; }
    }
    console.log(`  holonomy/${name}: worst ${worst.toExponential(2)} at ${at}`);
    assert.ok(worst <= 1e-12, `worst ${worst} exceeds 1e-12`);
  });
}

// The E3 limit as R grows: at R=1e4 an O(1) patch is flat to ~1e-9, which
// costs nothing and checks the curvature terms vanish rather than linger.
check('s3 at R=1e4 is e3 to 1e-7', () => {
  let wD = 0, wS = 0, wR = 0, wT = 0;
  for (let i = 0; i < 10; i++) {
    const av = [Math.sin(i * 1.1), Math.cos(i * 2.2), Math.sin(i * 0.5)].map((x) => x * 0.8);
    const bv = [Math.cos(i * 0.7), Math.sin(i * 1.9), Math.cos(i * 1.3)].map((x) => x * 0.8);
    const p = flat.decode(av), q = flat.decode(bv);
    wD = Math.max(wD, Math.abs(flat.distance(p, q) - Math.hypot(...sub(bv, av))));
    const lv = flat.logAt(p, q), ev = bv.map((x, k) => x - av[k]);
    wS = Math.max(wS, Math.hypot(...sub(lv.slice(0, 3), ev)));
    wR = Math.max(wR, Math.abs(lv[3]));
    const f = flat.frame(p);
    wT = Math.max(wT, Math.hypot(...sub(flat.transport(p, q, f[0]).slice(0, 3), f[0].slice(0, 3))));
  }
  console.log(`  flatlimit: dist ${wD.toExponential(2)} logslice ${wS.toExponential(2)} radial ${wR.toExponential(2)} transport ${wT.toExponential(2)}`);
  // Curvature corrections at O(1) separations scale as sep^3/R^2 ~ 1e-8, so
  // 1e-7 asserts they vanish with a decade of margin, not exactness.
  assert.ok(wD <= 1e-7 && wT <= 1e-7 && wS <= 1e-7, 'curvature terms linger');
  assert.ok(wR <= 1e-3, 'radial part is real geometry of size |a|^2/R, not error');
});

// The canonical frame is orthonormal everywhere tried, near the patch edge too.
for (const [name, s] of Object.entries(spaces)) {
  check(`frame is orthonormal on ${name}`, () => {
    const lim = s.kind === 'e3' ? 4.5 : s.maxDistance * 0.98;
    let worst = 0, at = null, n = 0;
    for (let i = 0; i < 40; i++) {
      const a = [Math.sin(i * 3.1), Math.cos(i * 1.7), Math.sin(i * 2.2 + 1)]
        .map((x) => x * lim * (0.2 + 0.8 * ((i * 37) % 10) / 10));
      let p;
      try { p = s.decode(a); } catch { continue; }
      n++;
      const f = s.frame(p);
      for (let m = 0; m < 3; m++) for (let k = 0; k < 3; k++) {
        const e = Math.abs(s.dot(p, f[m], f[k]) - (m === k ? 1 : 0));
        if (e > worst) { worst = e; at = `i=${i}`; }
      }
    }
    console.log(`  frame/${name}: worst ${worst.toExponential(2)} at ${at} over ${n} points`);
    assert.ok(worst <= 1e-12, `worst ${worst} exceeds 1e-12`);
  });
}

// The analytic boundary exit agrees with marched bisection from inside.
for (const [name, s] of Object.entries({ e3: spaces.e3, s3R1: spaces.s3R1, s3R7: spaces.s3R7 })) {
  check(`boundaryDistance matches bisection on ${name}`, () => {
    const exitBisect = (p, u) => {
      if (!s.withinDomain(p)) return 0;
      let t = 0;
      const dt = s.maxDistance / 2000;
      for (let i = 0; i < 40000; i++) {
        t += dt;
        if (!s.withinDomain(s.step(p, u, t))) break;
        if (i === 39999) return Infinity;
      }
      let lo = t - dt, hi = t;
      for (let i = 0; i < 60; i++) {
        const m = (lo + hi) / 2;
        if (s.withinDomain(s.step(p, u, m))) lo = m; else hi = m;
      }
      return hi;
    };
    let worst = 0, at = null, n = 0;
    for (let i = 0; i < 8; i++) {
      const p = s.decode(unitAuthor(s, [Math.sin(i * 1.3), Math.cos(i * 2.9), Math.sin(i * 0.4)]));
      const fp = s.frame(p);
      const dirs = [fp[0], fp[1], normed(fp[0].map((x, k) => x + fp[1][k])),
        normed(fp[0].map((x, k) => x + 0.05 * fp[1][k]))];
      for (const u of dirs) {
        const an = s.boundaryDistance(p, u), bi = exitBisect(p, u);
        const e = an === Infinity && bi === Infinity ? 0 : Math.abs(an - bi);
        n++;
        if (e > worst) { worst = e; at = `i=${i}`; }
      }
    }
    console.log(`  boundary/${name}: worst ${worst.toExponential(2)} at ${at} over ${n} rays`);
    assert.ok(worst <= 1e-12, `worst ${worst} exceeds 1e-12`);
  });
}

console.log(`\nmetric-truth: ${passed} checks passed, ${failed} failed\n`);
if (failed) process.exit(1);
