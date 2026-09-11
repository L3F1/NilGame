// MUSE-57: independent global-ray truth for EXISTING castSphericalBalls in
// engine/geometry/spherical-cover.js. No kernel edits.
//
// Reference is test-local chord-membership sampling + bisection over one full
// 2*pi*R period: inside(t) iff |step(p,u,t) - center|^2 < 2-2*cos(radius/R).
// It never reuses the kernel's analytic entry roots (atan2/acos wrap), so a
// wrong-root or piR-cap kernel mutation must fail against it. Sampling is a
// converged numerical oracle, not a proof: near-grazing entries narrower than
// the grid step could be missed. Every constructed hit is therefore required
// to bracket on the grid (hard throw otherwise), which is what "reference
// resolves chosen object sizes" means here: radius 0.1R vs 720 grid steps.
import assert from 'node:assert/strict';
import { createSphericalCover, castSphericalBalls } from './engine/geometry/spherical-cover.js';

const dot = (a, b) => a.reduce((t, x, i) => t + x * b[i], 0);
let cases = 0;
const worst = { entry: 0, normal: 0, surface: 0 };

// Deterministic poses: no Math.random, reproducible across hosts.
let seed = 0x57;
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const randUnit4 = () => {
  const v = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, rnd() - 0.5];
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};
const randTangent = (p) => {
  for (let k = 0; k < 100; k++) {
    const g = randUnit4(), d = dot(g, p);
    const v = g.map((x, i) => x - d * p[i]);
    const n = Math.hypot(...v);
    if (n > 0.5) return v.map((x) => x / n);
  }
  throw Error('random tangent degenerate; reseed');
};
// Offset of physical length len at base, orthogonal to base AND the ray
// direction there. Transversality is what makes a lateral==radius placement a
// true grazer (closest approach equals radius); without it the center drifts
// along-track and the "tangent" becomes a clean hit.
const transverse = (base, dir, len) => {
  let bestV = null, bestN = -1;
  for (let k = 0; k < 4; k++) {
    const e = [0, 0, 0, 0]; e[k] = 1;
    const v = e.map((x, i) => x - dot(e, base) * base[i] - dot(e, dir) * dir[i]);
    const n = Math.hypot(...v);
    if (n > bestN) { bestN = n; bestV = v; }
  }
  assert.ok(bestN > 0.5, 'transverse basis degenerate; reseed');
  return bestV.map((x) => (x / bestN) * len);
};

// First-entry oracle: coarse grid brackets, bisection converges. Throws when
// the grid cannot resolve the ball (reference limitation, not a kernel miss).
function referenceEntry(space, p, u, ball) {
  const R = space.curvatureRadius, period = 2 * Math.PI * R;
  const threshold = 2 - 2 * Math.cos(ball.radius / R);
  const inside = (t) => {
    const q = space.step(p, u, t);
    return q.reduce((a, x, i) => a + (x - ball.center[i]) ** 2, 0) < threshold;
  };
  assert.ok(!inside(0), 'reference: start inside ball; construction error');
  const N = 720;
  let lo = 0, hi = -1;
  for (let j = 1; j <= N; j++) {
    const t = (j * period) / N;
    if (inside(t)) { hi = t; lo = ((j - 1) * period) / N; break; }
  }
  assert.ok(hi >= 0, 'reference grid failed to resolve ball; refine grid, not kernel');
  for (let j = 0; j < 45; j++) {
    const m = (lo + hi) / 2;
    if (inside(m)) hi = m; else lo = m;
  }
  return (lo + hi) / 2;
}

function checkHit(space, p, u, ball, label) {
  cases++;
  const R = space.curvatureRadius;
  const ref = referenceEntry(space, p, u, ball);
  const found = castSphericalBalls(space, [ball], p, u);
  assert.equal(found.status, 'hit', `${label}: expected hit, got ${found.status}/${found.reason}`);
  assert.equal(found.id, ball.id, `${label}: wrong ball`);
  const err = Math.abs(found.distance - ref);
  worst.entry = Math.max(worst.entry, err / R);
  assert.ok(err < 1e-8 * R, `${label}: entry err ${err / R}`);
  const surf = Math.abs(space.distance(found.point, ball.center) - ball.radius);
  worst.surface = Math.max(worst.surface, surf / R);
  assert.ok(surf < 1e-8 * R, `${label}: point off surface ${surf / R}`);
  assert.ok(Math.abs(dot(found.point, found.normal)) < 1e-9, `${label}: normal not tangent`);
  assert.ok(Math.abs(Math.hypot(...found.normal) - 1) < 1e-9, `${label}: normal not unit`);
  const dir = space.stepWithTransport(p, u, found.distance).direction;
  const nErr = dot(found.normal, dir);
  worst.normal = Math.max(worst.normal, Math.abs(nErr + Math.abs(nErr)));
  assert.ok(nErr < 0, `${label}: first hit must enter the ball`);
}

for (const R of [0.5, 8, 10000]) {
  const space = createSphericalCover({ curvatureRadius: R });

  const place = (p, u, theta, fracLen, radius, id) => {
    const leg = space.stepWithTransport(p, u, theta * R);
    return { id, center: space.expAt(leg.position, transverse(leg.position, leg.direction, fracLen * R)), radius: radius * R };
  };
  // 8 rotated-pose single hits, lateral 0.04R vs radius 0.1R (clean crossing).
  for (const theta of [0.5, 1.2, 2.0, 3.0, 3.6, 4.2, 5.0, 5.8]) {
    const p = randUnit4(), u = randTangent(p);
    checkHit(space, p, u, place(p, u, theta, 0.04, 0.1, `rot-${theta}`), `R=${R} theta=${theta}`);
  }

  // 4 two-ball nearest selections, both input orders (permutation invariance).
  for (const [nearT, farT] of [[0.6, 2.2], [2.4, 4.4], [0.4, 5.2], [3.4, 1.4]]) {
    const p = randUnit4(), u = randTangent(p);
    const mk = (id, th) => place(p, u, th, 0.04, 0.1, id);
    const near = mk('near', nearT), far = mk('far', farT);
    const want = nearT < farT ? 'near' : 'far';
    for (const order of [[near, far], [far, near]]) {
      cases++;
      const found = castSphericalBalls(space, order, p, u);
      assert.equal(found.status, 'hit', `R=${R} pair ${nearT}/${farT}: expected hit`);
      assert.equal(found.id, want, `R=${R} pair ${nearT}/${farT}: order changed winner`);
    }
  }

  // 2 beyond-piR far-side hits: distance must exceed pi*R, reference-checked.
  for (const theta of [1.3 * Math.PI, 1.7 * Math.PI]) {
    const p = randUnit4(), u = randTangent(p);
    const ball = place(p, u, theta, 0.04, 0.1, 'far-side');
    checkHit(space, p, u, ball, `R=${R} far-side theta=${theta.toFixed(3)}`);
    cases++; // beyond-piR assertion counted separately
    const found = castSphericalBalls(space, [ball], p, u);
    assert.ok(found.distance > Math.PI * R, `R=${R}: far-side hit clipped to hemisphere`);
  }

  // 2 finite-range misses.
  {
    const p = randUnit4(), u = randTangent(p);
    const ball = place(p, u, 2.0, 0.04, 0.1, 'cut');
    cases++;
    const cut = castSphericalBalls(space, [ball], p, u, { maxDistance: 1.0 * R });
    assert.equal(cut.status, 'miss', `R=${R}: range cut should miss`);
    assert.ok(Math.abs(cut.checkedDistance - 1.0 * R) < 1e-12 * R, `R=${R}: checkedDistance`);
    assert.equal(cut.periodic, false, `R=${R}: short range is not periodic`);
    cases++;
    const leg2 = space.stepWithTransport(p, u, 0.7 * R);
    const offBall = { id: 'off', center: space.expAt(leg2.position, transverse(leg2.position, leg2.direction, (Math.PI / 2) * R * 0.999)), radius: 0.05 * R };
    const miss = castSphericalBalls(space, [offBall], p, u, { maxDistance: 10 * Math.PI * R });
    assert.equal(miss.status, 'miss', `R=${R}: off-orbit should miss`);
    assert.equal(miss.periodic, true, `R=${R}: full-period miss certifies longer orbit`);
    assert.ok(Math.abs(miss.checkedDistance - 2 * Math.PI * R) < 1e-9 * R, `R=${R}: checked one period`);
  }

  // Later tangency behind a nearer hit is kept; tangency ahead refuses.
  {
    const p = randUnit4(), u = randTangent(p);
    const grazAt = (phi) => place(p, u, phi, 0.1, 0.1, 'graz');
    const solidAt = (id, th) => place(p, u, th, 0.04, 0.1, id);
    cases++;
    const behind = castSphericalBalls(space, [grazAt(1.4), solidAt('near', 0.4)], p, u);
    assert.equal(behind.id, 'near', `R=${R}: later tangency erased nearer hit`);
    cases++;
    const ahead = castSphericalBalls(space, [grazAt(1.4), solidAt('near', 2.0)], p, u);
    assert.equal(ahead.status, 'unresolved', `R=${R}: earlier tangency must refuse, got ${ahead.status}`);
    cases++;
    const lone = castSphericalBalls(space, [grazAt(1.4)], p, u);
    assert.equal(lone.status, 'unresolved', `R=${R}: exposed tangency must refuse`);
    assert.equal(lone.reason, 'tangent-or-range-boundary', `R=${R}: tangent reason`);
  }

  // Coincident ownership and zero budget refuse explicitly.
  {
    const p = randUnit4(), u = randTangent(p);
    const mk = (id) => place(p, u, 0.9, 0.04, 0.1, id);
    cases++;
    const coin = castSphericalBalls(space, [mk('a'), mk('b')], p, u);
    assert.equal(coin.status, 'unresolved', `R=${R}: coincident owners must refuse`);
    cases++;
    const zero = castSphericalBalls(space, [mk('a')], p, u, { maxTests: 0 });
    assert.equal(zero.status, 'unresolved', `R=${R}: zero budget must refuse`);
    assert.equal(zero.reason, 'work-budget', `R=${R}: budget reason`);
  }
}

assert.ok(cases <= 100, `case budget exceeded: ${cases}`);
console.log(`global-s3-ray-truth: ${cases} cases passed (R=0.5/8/10000)`);
console.log(`  worst entry err/R=${worst.entry.toExponential(2)} surface err/R=${worst.surface.toExponential(2)}`);
