// MUSE-65: independent bounded numerical corpus for createHyperbolicSpace.
// Independent expectations only: Lorentz acosh distance identity, ambientDot
// isometry/tangency checks, log-norm and step-length identities, analytic
// radial/transverse exit lengths. Never compares tangents across points
// without transport. Does not touch scene/portal/GPU support.
import assert from 'node:assert/strict';
import { createHyperbolicSpace } from './engine/geometry/hyperbolic-space.js';
import { createMetricSpace } from './engine/geometry/metric-space.js';

// Own Lorentz pairing (+,+,+,-); production distance uses a chord/asinh path,
// so R*acosh(-pair) below is an independent code path, not a re-statement.
const pair = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] - a[3] * b[3];
const distTruth = (R, p, q) => {
  const c = -pair(p, q);
  assert.ok(c >= 1 - 1e-9, `spacelike pair ${c}`);
  return R * Math.acosh(Math.max(1, c));
};
const SEEDS = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1], [1, 2, 3], [-2, 1, 0.5], [0.3, -0.7, 0.5], [-1, -1, 2]];
const unit = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
const dirAt = (o, s) => [...unit(s), 0];
const near = (a, b, t, m) => assert.ok(Math.abs(a - b) <= t, `${m}: ${a} != ${b}`);
const same = (a, b, t, m) => a.forEach((x, i) => near(x, b[i], t, `${m}[${i}]`));
const worst = { dist: 0, step: 0, log: 0, exit: 0, frame: 0 };
const scaled = (R, e) => Math.abs(e) / R;

// Metric factory intentionally refuses h3; the experimental adapter is direct.
assert.throws(() => createMetricSpace({ kind: 'h3' }), /Unsupported/);
// Extent policy: at most 2R, positive radius/extent.
assert.throws(() => createHyperbolicSpace({ maxDistance: 3 }), /extent/);
assert.throws(() => createHyperbolicSpace({ curvatureRadius: 0.5, maxDistance: 1.25 }), /extent/);
assert.throws(() => createHyperbolicSpace({ curvatureRadius: -1 }), /positive/);
assert.equal(createHyperbolicSpace().maxDistance, 2);

for (const R of [0.5, 8, 10000]) {
  const s = createHyperbolicSpace({ curvatureRadius: R });
  const E = 2; // default dimensionless extent
  // Origin frame is orthonormal in the ambient pairing.
  const f0 = s.frame(s.origin);
  f0.forEach((e, i) => f0.forEach((f, j) => near(s.ambientDot(e, f), i === j ? 1 : 0, 1e-12, `R=${R} origin frame`)));
  for (let k = 0; k < SEEDS.length; k++) {
    const ua = dirAt(s.origin, SEEDS[k]), ub = dirAt(s.origin, SEEDS[(k + 3) % SEEDS.length]);
    const ta = (0.25 + 0.13 * k) * R, tb = (0.4 + 0.11 * ((k + 1) % 5)) * R;
    const p = s.step(s.origin, ua, ta), q = s.step(s.origin, ub, tb);
    // Distance vs Lorentz acosh identity.
    const d = s.distance(p, q), truth = distTruth(R, p, q);
    worst.dist = Math.max(worst.dist, scaled(R, d - truth));
    near(d, truth, 1e-9 * R, `R=${R} acosh distance k=${k}`);
    // Step length identity: unit-speed travel covers exactly |t|.
    const t = 0.35 * R, mid = s.step(p, s.frame(p)[k % 3], t);
    const stepErr = s.distance(p, mid) - t;
    worst.step = Math.max(worst.step, scaled(R, stepErr));
    near(s.distance(p, mid), t, 1e-9 * R, `R=${R} step length k=${k}`);
    // Log norm identity + exp round trip at one point.
    const lv = s.logAt(p, q);
    worst.log = Math.max(worst.log, scaled(R, s.norm(p, lv) - d));
    near(s.norm(p, lv), d, 1e-9 * R, `R=${R} log norm k=${k}`);
    same(s.expAt(p, lv), q, 1e-8 * R, `R=${R} exp-log k=${k}`);
    // Transport: tangency at q, isometry, linearity, inverse (all same-point).
    const fp = s.frame(p), v = fp[0].map((x, j) => 2 * x + 3 * fp[1][j]);
    const w = fp[2], Tv = s.transport(p, q, v), Tw = s.transport(p, q, w);
    near(s.ambientDot(q, Tv), 0, 1e-9, `R=${R} carried tangency k=${k}`);
    near(s.ambientDot(Tv, Tw), s.ambientDot(v, w), 1e-9, `R=${R} isometry k=${k}`);
    near(s.norm(q, Tv), s.norm(p, v), 1e-12 * Math.max(1, R), `R=${R} norm carry k=${k}`);
    const a = 1.5, b = -0.75;
    const combo = v.map((x, j) => a * x + b * w[j]);
    same(s.transport(p, q, combo), Tv.map((x, j) => a * x + b * Tw[j]), 1e-9, `R=${R} linearity k=${k}`);
    same(s.transport(q, p, Tv), v, 1e-9, `R=${R} inverse k=${k}`);
    // Frame orthonormality + hyperboloid membership via ambient pairing.
    fp.forEach((e, i) => {
      near(s.ambientDot(p, e), 0, 1e-9, `R=${R} frame tangency k=${k}`);
      fp.forEach((f, j) => {
        const err = s.ambientDot(e, f) - (i === j ? 1 : 0);
        worst.frame = Math.max(worst.frame, Math.abs(err));
      });
    });
    near(pair(p, p), -1, 1e-9, `R=${R} hyperboloid k=${k}`);
    // Dot bilinearity / norm homogeneity at one point.
    near(s.dot(p, combo, w), a * s.dot(p, v, w) + b * s.dot(p, w, w), 1e-9, `R=${R} dot bilinear k=${k}`);
    near(s.norm(p, combo), Math.abs(a) * s.norm(p, v.map((x, j) => x + (b / a) * w[j])), 1e-9, `R=${R} norm combo k=${k}`);
  }
  // Domain exit on a custom 1.5R extent, radial point 0.9R (fresh numbers).
  const c = createHyperbolicSpace({ curvatureRadius: R, maxDistance: 1.5 * R });
  const pr = c.decode([0.9 * R, 0, 0]), fr = c.frame(pr);
  const out = 0.6 * R, inw = 2.4 * R;
  const side = R * Math.acosh(Math.cosh(1.5) / Math.cosh(0.9));
  const eOut = c.boundaryDistance(pr, fr[0]), eIn = c.boundaryDistance(pr, fr[0].map((x) => -x));
  const eSide = c.boundaryDistance(pr, fr[1]);
  worst.exit = Math.max(worst.exit, scaled(R, eOut - out), scaled(R, eIn - inw), scaled(R, eSide - side));
  near(eOut, out, 1e-9 * R, `R=${R} outward exit`);
  near(eIn, inw, 1e-9 * R, `R=${R} inward exit`);
  near(eSide, side, 1e-9 * R, `R=${R} transverse exit`);
  near(eOut, Math.min(eOut, eSide, eIn), 0, `R=${R} outward is first exit`);
  assert.equal(c.boundaryDistance(pr, fr[1], eSide * 0.5), Infinity); // range truncation
  near(c.boundaryDistance(pr, fr[1], eSide * 2), eSide, 1e-12 * R, `R=${R} range carry`);
  assert.ok(c.withinDomain(c.step(pr, fr[1], eSide - 1e-6 * R)));
  assert.ok(!c.withinDomain(c.step(pr, fr[1], eSide + 1e-6 * R)));
  near(c.distance(c.origin, c.step(pr, fr[1], eSide)), 1.5 * R, 1e-6 * R, `R=${R} edge radius`);
}

// Near-boundary inward/outward on the default 2R extent (R=1, rho=1.99R).
{
  const s = createHyperbolicSpace();
  const p = s.decode([1.99, 0, 0]), f = s.frame(p);
  near(s.boundaryDistance(p, f[0]), 0.01, 1e-9, 'near-edge outward');
  near(s.boundaryDistance(p, f[0].map((x) => -x)), 3.99, 1e-9, 'near-edge inward');
  // First-exit: outward radial is the minimum over a seeded fan.
  let fanMin = Infinity;
  for (const sd of SEEDS) {
    const uu = s.normalize(p, s.tangentPart(p, [...unit(sd), 0]));
    fanMin = Math.min(fanMin, s.boundaryDistance(p, uu));
  }
  near(fanMin, 0.01, 1e-9, 'fan first exit');
  assert.equal(s.boundaryDistance(s.step(s.origin, [1, 0, 0, 0], 2.4), [0, 1, 0, 0]), 0);
}

// Non-axis points near radial 3.9 (representability envelope 4), R=1.
{
  const s = createHyperbolicSpace();
  const mk = (sd) => s.step(s.origin, dirAt(s.origin, sd), 3.9);
  const p = mk([1, 1, 1]), q = mk([1, 2, 3]);
  for (const [tag, pt] of [['p', p], ['q', q]]) {
    s.validatePoint(pt); // representable: no throw
    assert.ok(!s.withinDomain(pt), `${tag} outside author domain, not a wall`);
    near(pair(pt, pt), -1, 1e-10, `${tag} hyperboloid at 3.9`);
    assert.throws(() => s.encode(pt), /outside/);
  }
  const d = s.distance(p, q);
  near(d, distTruth(1, p, q), 1e-9, 'envelope acosh distance');
  const fp = s.frame(p), v = fp[0].map((x, j) => x - 2 * fp[2][j]);
  const Tv = s.transport(p, q, v);
  near(s.ambientDot(q, Tv), 0, 1e-9, 'envelope carried tangency');
  near(s.norm(q, Tv), s.norm(p, v), 1e-9, 'envelope norm carry');
  same(s.transport(q, p, Tv), v, 1e-7, 'envelope inverse');
  // Sampled limit (policy, not repair): |log(p,q)| = d > 4, so logAt succeeds
  // but the single expAt leg refuses. Recorded, not weakened.
  near(s.norm(p, s.logAt(p, q)), d, 1e-9, 'envelope log norm');
  assert.throws(() => s.expAt(p, s.logAt(p, q)), /Invalid/);
  const inward = s.normalize(p, s.logAt(p, s.origin));
  const q2 = s.step(p, inward, 0.35); // radial 3.55, inside envelope
  same(s.expAt(p, s.logAt(p, q2)), q2, 1e-9, 'envelope exp-log close pair');
}

// Author decode domain (2R) differs from representability (4R): edge is
// coverage, not a collision wall; geodesics continue past it.
{
  const s = createHyperbolicSpace();
  assert.throws(() => s.decode([2, 0, 0]), /outside/);
  const dir = dirAt(s.origin, [3, -1, 2]);
  const inside = s.step(s.origin, dir, 1.9);
  assert.ok(s.withinDomain(inside));
  const leg = s.stepWithTransport(s.origin, dir, 1.9);
  const past = s.step(leg.position, leg.direction, 0.5); // radial 2.4, past edge
  s.validatePoint(past);
  assert.ok(!s.withinDomain(past));
  near(s.distance(inside, past), 0.5, 1e-9, 'no wall past domain edge');
  // Tiny positive extents still resolve proportionally.
  for (const tiny of [1e-9, 1e-6]) {
    const t = createHyperbolicSpace({ maxDistance: tiny });
    near(t.boundaryDistance(t.origin, [1, 0, 0, 0]), tiny, 1e-24, `tiny extent ${tiny}`);
    assert.throws(() => t.decode([tiny, 0, 0]), /outside/);
    same(t.encode(t.decode([tiny / 2, 0, 0])), [tiny / 2, 0, 0], tiny * 1e-9, `tiny codec ${tiny}`);
  }
}

// Repeated transported frames: alternating-leg walk keeps an orthonormal
// frame; out-and-back legs return to the same point and carried vector.
{
  const s = createHyperbolicSpace();
  let p = s.origin.slice();
  let carry = dirAt(s.origin, SEEDS[4]).slice();
  for (let i = 0; i < 300; i++) {
    const sd = SEEDS[i % SEEDS.length];
    const w = s.normalize(p, s.tangentPart(p, [...unit(sd), 0]));
    const leg = s.stepWithTransport(p, w, 0.01);
    carry = leg.carry(carry);
    p = leg.position;
    if (i % 50 === 49) {
      const f = s.frame(p);
      f.forEach((e, a) => f.forEach((g, b) => near(s.ambientDot(e, g), a === b ? 1 : 0, 1e-9, `walk frame ${i}`)));
      near(pair(p, p), -1, 1e-9, `walk hyperboloid ${i}`);
      near(s.ambientDot(p, carry), 0, 1e-9, `walk carry tangency ${i}`);
      near(s.norm(p, carry), 1, 1e-9, `walk carry norm ${i}`);
    }
  }
  // Out-and-back along the live direction returns exactly.
  const f = s.frame(p);
  const leg = s.stepWithTransport(p, f[0], 0.25);
  same(s.step(leg.position, leg.direction.map((x) => -x), 0.25), p, 1e-12, 'out-and-back position');
  same(s.transport(leg.position, p, leg.carry(carry)), carry, 1e-9, 'out-and-back carry');
  // Carry is linear: same-point comparison at the leg end.
  const e = s.frame(p), c1 = e[1].map((x, j) => 2 * x - e[2][j]);
  same(leg.carry(c1), leg.carry(e[1]).map((x, j) => 2 * x - leg.carry(e[2])[j]), 1e-12, 'carry linearity');
}

console.log(`H3 truth corpus passed; worst scaled residuals: dist=${worst.dist} step=${worst.step} log=${worst.log} exit=${worst.exit} frame=${worst.frame}`);
