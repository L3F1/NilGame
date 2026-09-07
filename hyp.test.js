// hyp.test.js — run with:  node hyp.test.js
// If any of these fail, do not write a single line of shader code yet.

import {
  ORIGIN, IDENTITY, dot, matMul, apply, inv, point, frameVec,
  toFrame, fromFrame, reorthonormalize, translation, geodesicFromIdentity,
  geodesic, flow, exp, log, logTo, dist, height, gradHeight, fromFloor, placeAt,
  floorPoint, distToAxis, wallDist,
  DOD_SIDE, DOD_PAIR, DOD_GEN, DOD_R, DOD_DIRS, rotationAbout,
  setSolid, SOLID, reduceToDomain, domainDepth,
  closedGeodesicDirs, closedGeodesicLength,
} from './hyp.js';

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}  ${detail}`); }
}
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const closeVec = (a, b, tol = 1e-9) => a.every((v, i) => close(v, b[i], tol));
const rand = () => (Math.random() - 0.5) * 4;
const unit3 = () => {
  const f = [rand(), rand(), rand()];
  const n = Math.hypot(...f);
  return f.map((x) => x / n);
};
/** A random placement, reached by a random geodesic from the origin. */
const randPlacement = () => geodesicFromIdentity(unit3(), Math.random() * 3);
const randPoint = () => point(randPlacement());

console.log('\nthe hyperboloid');

let ok = true;
for (let i = 0; i < 1000; i++) {
  const p = randPoint();
  if (!close(dot(p, p), -1, 1e-9)) ok = false;
  if (p[3] <= 0) ok = false;
}
check('random points lie on H^3', ok);

ok = true;
for (let i = 0; i < 500; i++) {
  const M = randPlacement();
  // Columns 0,1,2 orthonormal spacelike; column 3 is the point, timelike.
  for (let a = 0; a < 4; a++) {
    for (let b = 0; b < 4; b++) {
      const want = a === b ? (a === 3 ? -1 : 1) : 0;
      if (!close(dot(frameVec(M, a), frameVec(M, b)), want, 1e-9)) ok = false;
    }
  }
}
check('a placement is a Lorentz frame', ok);

ok = true;
for (let i = 0; i < 500; i++) {
  const M = randPlacement();
  if (!closeVec(matMul(M, inv(M)), IDENTITY, 1e-9)) ok = false;
  if (!closeVec(matMul(inv(M), M), IDENTITY, 1e-9)) ok = false;
}
check('inv is a two-sided inverse', ok);

ok = true;
for (let i = 0; i < 500; i++) {
  const M = randPlacement();
  const u = [rand(), rand(), rand(), rand()];
  const v = [rand(), rand(), rand(), rand()];
  // Lorentz matrices preserve the form. This is the whole reason they are the
  // isometries, and it is what makes "compute at the origin then translate"
  // exact rather than approximate.
  if (!close(dot(apply(M, u), apply(M, v)), dot(u, v), 1e-8)) ok = false;
}
check('placements preserve the Minkowski form (they are isometries)', ok);

ok = true;
for (let i = 0; i < 300; i++) {
  // Deliberately corrupt a placement, then repair it.
  const M = randPlacement().map((x) => x + (Math.random() - 0.5) * 1e-3);
  const R = reorthonormalize(M);
  for (let a = 0; a < 4; a++) {
    for (let b = 0; b < 4; b++) {
      const want = a === b ? (a === 3 ? -1 : 1) : 0;
      if (!close(dot(frameVec(R, a), frameVec(R, b)), want, 1e-9)) ok = false;
    }
  }
}
check('reorthonormalize repairs drift', ok);

console.log('\nthe frame');

ok = true;
for (let i = 0; i < 1000; i++) {
  const M = randPlacement();
  const f = [rand(), rand(), rand()];
  const w = fromFrame(M, f);
  // The frame is orthonormal, so frame components measure true length, and
  // the ambient vector must be tangent at the point.
  if (!close(Math.sqrt(dot(w, w)), Math.hypot(...f), 1e-8)) ok = false;
  if (!close(dot(w, point(M)), 0, 1e-8)) ok = false;
  if (!closeVec(toFrame(M, w), f, 1e-8)) ok = false;
}
check('frame components round-trip and measure true length', ok);

console.log('\ngeodesics');

ok = true;
for (let i = 0; i < 1000; i++) {
  const u = unit3();
  const t = Math.random() * 4;
  const p = point(geodesicFromIdentity(u, t));
  // gamma(t) = cosh(t) o + sinh(t) u, and it is exactly t away.
  const want = [Math.sinh(t) * u[0], Math.sinh(t) * u[1], Math.sinh(t) * u[2], Math.cosh(t)];
  if (!closeVec(p, want, 1e-9)) ok = false;
  if (!close(dist(ORIGIN, p), t, 1e-9)) ok = false;
}
check('the geodesic is cosh(t)o + sinh(t)u, at distance t', ok);

ok = true;
for (let i = 0; i < 500; i++) {
  const u = unit3();
  const a = Math.random() * 2, b = Math.random() * 2;
  // Boosts along one direction add.
  if (!closeVec(matMul(translation(u, a), translation(u, b)), translation(u, a + b), 1e-8)) ok = false;
}
check('translations along one direction compose additively', ok);

ok = true;
for (let i = 0; i < 500; i++) {
  const M = randPlacement();
  const v = [rand(), rand(), rand()];
  const t = Math.random() * 2;
  const [M2, v2] = flow(M, v, t);
  // Velocity components are constant along a geodesic here. Nil had to spin
  // them; the boost carries a parallel frame, so these do not move.
  if (!closeVec(v2, v, 1e-12)) ok = false;
  // Unit-speed check: distance covered is |v|*t.
  if (!close(dist(point(M), point(M2)), Math.hypot(...v) * t, 1e-8)) ok = false;
}
check('flow keeps speed, and velocity components, exactly', ok);

ok = true;
for (let i = 0; i < 500; i++) {
  const M = randPlacement();
  const v = [rand(), rand(), rand()];
  const t1 = Math.random() * 1.5, t2 = Math.random() * 1.5;
  const [pa, va] = flow(M, v, t1);
  const [pb, vb] = flow(pa, va, t2);
  const [pc, vc] = flow(M, v, t1 + t2);
  if (!closeVec(pb, pc, 1e-8) || !closeVec(vb, vc, 1e-10)) ok = false;
}
check('flow composes: t1 then t2 is the same as t1+t2', ok);

console.log('\nthe exponential map');

ok = true;
let worst = 0;
for (let i = 0; i < 5000; i++) {
  // Deliberately huge, to show there is no fold to fall off.
  const v = unit3().map((x) => x * Math.random() * 12);
  const back = log(exp(v));
  worst = Math.max(worst, Math.max(...back.map((x, j) => Math.abs(x - v[j]))));
  if (!closeVec(back, v, 1e-7)) { ok = false; console.log('    ', v, back); break; }
}
check('log inverts exp everywhere, out to distance 12', ok, `worst ${worst.toExponential(2)}`);

ok = true;
for (let i = 0; i < 1000; i++) {
  const A = randPlacement(), B = randPlacement();
  const lv = logTo(A, point(B));
  const d = Math.hypot(...lv);
  if (!close(d, dist(point(A), point(B)), 1e-8)) ok = false;
  // Setting off from A along lv/|lv| for |lv| must land exactly on B's point.
  const arrived = point(geodesic(A, lv.map((x) => x / d), d));
  if (!closeVec(arrived, point(B), 1e-7)) ok = false;
}
check('logTo gives the direction and the distance to a point', ok);

ok = true;
for (let i = 0; i < 1000; i++) {
  const p = randPoint(), q = randPoint();
  if (!close(dist(p, q), dist(q, p), 1e-9)) ok = false;
  if (dist(p, q) < 0) ok = false;
}
check('distance is symmetric and non-negative', ok);

ok = true;
for (let i = 0; i < 1000; i++) {
  const a = randPoint(), b = randPoint(), c = randPoint();
  if (dist(a, c) > dist(a, b) + dist(b, c) + 1e-8) ok = false;
}
check('the triangle inequality holds', ok);

console.log('\nthe Busemann function');

ok = true;
for (let i = 0; i < 2000; i++) {
  const p = randPoint();
  const g = gradHeight(p);
  // Unit length: this is what makes gravity uniform, unlike Nil's sqrt(1+x^2).
  if (!close(dot(g, g), 1, 1e-8)) ok = false;
  // And tangent to H^3 at p.
  if (!close(dot(g, p), 0, 1e-8)) ok = false;
}
check('grad height is a unit tangent vector everywhere', ok);

ok = true;
for (let i = 0; i < 1000; i++) {
  const M = randPlacement();
  const p = point(M);
  const f = [rand(), rand(), rand()];
  const w = fromFrame(M, f);
  // <grad h, w> must equal the rate of change of h along w.
  const e = 1e-6;
  const pp = p.map((x, j) => Math.cosh(e) * x + Math.sinh(e) * (w[j] / Math.hypot(...f)));
  const pm = p.map((x, j) => Math.cosh(e) * x - Math.sinh(e) * (w[j] / Math.hypot(...f)));
  const numeric = (height(pp) - height(pm)) / (2 * e) * Math.hypot(...f);
  if (!close(dot(gradHeight(p), w), numeric, 1e-4)) ok = false;
}
check('it really is the gradient of height', ok);

// Straight up from the floor, altitude advances at exactly one unit per unit
// of distance travelled. That is what makes height a distance function, and
// what makes the floor's SDF exact.
ok = true;
for (let i = 0; i < 200; i++) {
  const a = rand() * 3, b = rand() * 3, h = rand();
  const M = placeAt(a, b, h);
  const p = point(M);
  if (!close(height(p), h, 1e-8)) ok = false;
  const up = toFrame(M, gradHeight(p));
  const risen = point(geodesic(M, up, 0.7));
  if (!close(height(risen), h + 0.7, 1e-7)) ok = false;
}
check('rising one unit raises altitude by exactly one', ok);

console.log('\nthe floor never blocks line of sight');

// The property the whole floor choice turns on. A totally geodesic plane cuts
// H^3 into two convex half-spaces, so a geodesic between two points above the
// floor cannot leave it. Sample sightlines between widely separated elevated
// points and check none of them dips below altitude 0.
ok = true;
let deepest = 0;
for (let i = 0; i < 3000; i++) {
  const A = fromFloor(rand() * 3, rand() * 3, 0.05 + Math.random() * 2);
  const B = fromFloor(rand() * 3, rand() * 3, 0.05 + Math.random() * 2);
  const MA = geodesicFromIdentity(log(A), 1);
  const lv = logTo(MA, B);
  const d = Math.hypot(...lv);
  if (d < 1e-6) continue;
  const u = lv.map((x) => x / d);
  for (let s = 1; s < 24; s++) {
    const t = (s / 24) * d;
    const q = point(geodesic(MA, u, t));
    deepest = Math.min(deepest, height(q));
    if (height(q) < -1e-9) ok = false;
  }
}
check('a sightline between two raised points never dips below the floor', ok,
  `lowest altitude reached ${deepest.toExponential(2)}`);

// The contrast, computed directly: on a HOROSPHERE floor the same sightline
// does dip below, and that is why this game does not use one.
{
  const zEye = Math.exp(-0.25);
  const horizon = Math.sqrt(1 - zEye * zEye);
  // Two floor points further apart than the horizon: the connecting semicircle
  // in upper half-space rises above z = 1, i.e. below altitude 0.
  const s = 2.5;
  const dip = -Math.log(s / 2);
  check('(a horosphere floor would have blocked it)', horizon < 1 && dip < 0,
    `horosphere horizon ${horizon.toFixed(3)}, a ${s}-unit sightline dips to ${dip.toFixed(3)}`);
}

console.log('\nthe floor plane');

// The payoff of choosing a horosphere. Lay out a square on the floor by
// walking it in floor coordinates, and it closes up exactly — no area lift,
// no defect. This is the direct contrast with Nil's signature property, where
// the same walk lifted you by the enclosed area.
ok = true;
for (let i = 0; i < 2000; i++) {
  const a = rand() * 2, b = rand() * 2, h = rand();
  const p = fromFloor(a, b, h);
  if (!close(dot(p, p), -1, 1e-8)) ok = false;
  // Altitude is exactly the third argument, because height is the signed
  // distance to the plane and rising is perpendicular to it.
  if (!close(height(p), h, 1e-9)) ok = false;
  // Floor points sit exactly on the plane.
  if (!close(height(floorPoint(a, b)), 0, 1e-12)) ok = false;
}
check('fromFloor lands on H^3 at exactly the altitude asked for', ok);

ok = true;
for (let i = 0; i < 1000; i++) {
  // Radial floor coordinates are true distances from the centre.
  const a = rand() * 2, b = rand() * 2;
  if (!close(dist(fromFloor(0, 0, 0), floorPoint(a, b)), Math.hypot(a, b), 1e-8)) ok = false;
}
check('floor coordinates are true distances from the centre', ok);

ok = true;
let worstAxis = 0;
for (let i = 0; i < 500; i++) {
  // Straight up from a floor point stays over it: the vertical geodesic is
  // the pillar axis, so distance to that axis stays zero.
  //
  // Tight on purpose. The closed form sinh^2 = <p,q>^2 - p2^2 - 1 fails this
  // at 5e-6; forming the perpendicular component first holds 1e-11.
  const a = rand() * 2, b = rand() * 2, h = Math.random() * 2;
  const d = distToAxis(fromFloor(a, b, h), floorPoint(a, b));
  worstAxis = Math.max(worstAxis, d);
  if (!close(d, 0, 1e-11)) ok = false;
}
check('rising stays directly above the floor point', ok, `worst ${worstAxis.toExponential(2)}`);

ok = true;
for (let i = 0; i < 1000; i++) {
  // On the floor, distance to a pillar axis is just the floor distance.
  const q = floorPoint(rand(), rand());
  const p = floorPoint(rand(), rand());
  if (!close(distToAxis(p, q), dist(p, q), 1e-7)) ok = false;
}
check('on the floor, axis distance is floor distance', ok);

ok = true;
for (let i = 0; i < 1000; i++) {
  // Walls: geodesic planes standing on the floor at distance w from centre.
  const w = 0.5 + Math.random() * 2;
  const a = rand();
  const p = floorPoint(a, 0);
  // Along axis 0 the signed distance to the wall at +w is a - w.
  if (!close(wallDist(p, 0, w), a - w, 1e-7)) ok = false;
}
check('wall planes sit at the floor distance they claim', ok);

ok = true;
let worstSpread = 0;
for (let i = 0; i < 300; i++) {
  // Raising two floor points to altitude h spreads them by cosh(h), which is
  // far gentler than the horosphere's e^h.
  const s = 0.2 + Math.random(), h = Math.random() * 1.5;
  const p = fromFloor(0, 0, h), q = fromFloor(s, 0, h);
  // Their separation measured along the equidistant surface is cosh(h)*s.
  // Check via the chord, which must lie below that and above the floor chord.
  const chord = dist(p, q);
  const floorChord = dist(fromFloor(0, 0, 0), fromFloor(s, 0, 0));
  if (chord <= floorChord - 1e-12) ok = false;
  worstSpread = Math.max(worstSpread, chord / floorChord);
  if (chord > Math.cosh(h) * s + 1e-9) ok = false;
}
check('rising spreads the floor apart, bounded by cosh(h)', ok,
  `worst spread ratio ${worstSpread.toFixed(3)}`);


console.log('\nSeifert-Weber: a closed hyperbolic 3-manifold');

// The octagon tessellates the floor only. This one tessellates all of H^3, so
// an open world has no direction to fall out of.
{
  const ang = Math.acos(Math.max(-1, Math.min(1, -dot(DOD_SIDE[0], DOD_SIDE[1])))) * 180 / Math.PI;
  let adjacent = 0, allAt72 = true;
  for (let i = 0; i < 12; i++) {
    for (let j = i + 1; j < 12; j++) {
      const c = -dot(DOD_SIDE[i], DOD_SIDE[j]);
      if (c > 0.2 && c < 0.4) {
        adjacent++;
        if (Math.abs(Math.acos(c) * 180 / Math.PI - 72) > 1e-6) allAt72 = false;
      }
    }
  }
  check('the dodecahedron has 30 adjacent faces, all at 72 degrees',
    adjacent === 30 && allAt72, `first pair ${ang.toFixed(4)} deg`);
  check('so five cells close around every edge', close(5 * 72, 360, 1e-9));
}

ok = true;
for (let i = 0; i < 500; i++) {
  const p = randPoint();
  for (let k = 0; k < 12; k++) {
    if (!close(dot(DOD_SIDE[k], DOD_SIDE[k]), 1, 1e-12)) ok = false;
    if (dist(apply(DOD_PAIR[k], apply(DOD_GEN[k], p)), p) > 1e-8) ok = false;
  }
}
check('dodecahedron normals are unit and each pairing inverts its generator', ok);

// THE test, again. Reduction must be canonical on Gamma-orbits, and the
// discriminating power matters: a 1/10 turn on this same solid gives the
// Poincare homology sphere, which is SPHERICAL, and the check below fails for
// it. So a wrong gluing cannot pass silently.
{
  setSolid(SOLID.DODECAHEDRON);
  ok = true;
  let worst = 0, worstIters = 0;
  for (let i = 0; i < 2000; i++) {
    const M = geodesicFromIdentity(unit3(), Math.random() * 3);
    const [A, , nA] = reduceToDomain(M);
    const k = Math.floor(Math.random() * 12);
    const [B] = reduceToDomain(matMul(DOD_GEN[k], M));
    worst = Math.max(worst, dist(point(A), point(B)));
    worstIters = Math.max(worstIters, nA);
    if (dist(point(A), point(B)) > 1e-6) ok = false;
  }
  check('reduction is canonical on the dodecahedral group', ok,
    `worst disagreement ${worst.toExponential(2)}, worst ${worstIters} foldings`);

  ok = true;
  for (let i = 0; i < 1000; i++) {
    const [F] = reduceToDomain(geodesicFromIdentity(unit3(), Math.random() * 3));
    if (domainDepth(point(F)) < -1e-9) ok = false;
  }
  check('and it lands inside the dodecahedron', ok);

  // The wrong turn must FAIL, or the test above proves nothing.
  const wrongPair = DOD_DIRS.map((d) => matMul(translation(d, -2 * DOD_R), rotationAbout(d, 2 * Math.PI / 10)));
  const wrongGen = DOD_DIRS.map((d) => matMul(rotationAbout(d, -2 * Math.PI / 10), translation(d, 2 * DOD_R)));
  const reduceWith = (P, p0) => {
    let q = p0.slice();
    for (let it = 0; it < 200; it++) {
      let w = -1, wv = 1e-12;
      for (let k = 0; k < 12; k++) { const v = dot(q, DOD_SIDE[k]); if (v > wv) { wv = v; w = k; } }
      if (w < 0) return q;
      q = apply(P[w], q);
    }
    return null;
  };
  // 2000 samples and a threshold of ZERO, and both halves of that matter.
  //
  // A single orbit that reduces two ways DISPROVES the gluing, so "bad > 0" is
  // the mathematically correct threshold; the earlier "bad > 5 out of 400" was
  // both too weak a claim and, measured, a real flake. Only about 3% of random
  // orbits expose the inconsistency -- the greedy walk is a contraction and
  // most starting points wash it out -- so 400 samples gave a mean of 12.3
  // with a minimum of 4 over 200 runs, and tripped "> 5" in about 1% of them.
  // At 2000 the mean is near 60 and seeing zero is not something that happens.
  let bad = 0;
  for (let i = 0; i < 2000; i++) {
    const p = point(geodesicFromIdentity(unit3(), Math.random() * 3));
    const k = Math.floor(Math.random() * 12);
    const a = reduceWith(wrongPair, p);
    const b = reduceWith(wrongPair, apply(wrongGen[k], p));
    if (!a || !b || dist(a, b) > 1e-6) bad++;
  }
  check('a 1/10 turn instead of 3/10 does NOT glue up', bad > 0,
    `${bad}/2000 orbits disagree, as they must — 1/10 is the Poincare sphere`);

  setSolid(SOLID.OCTAGON);
}

console.log('');
console.log('closed geodesics');

{
  // Every generator is a screw motion whose axis runs through the cell centre,
  // so the geodesic along that axis closes up in the quotient: leave the
  // centre in direction d, travel one translation length, and you are back at
  // the centre travelling in direction d. That is what the boomerang flies -
  // nothing steers it, the manifold just brings it back.
  for (const [name, s] of [['octagon', SOLID.OCTAGON], ['dodecahedron', SOLID.DODECAHEDRON]]) {
    setSolid(s);
    const L = closedGeodesicLength();
    let worstPos = 0, worstDir = 0;
    for (const d of closedGeodesicDirs()) {
      const M = geodesic(IDENTITY, d, L);
      const [F] = reduceToDomain(M);
      worstPos = Math.max(worstPos, dist(point(F), ORIGIN));
      const back = fromFrame(F, d), want = fromFrame(IDENTITY, d);
      worstDir = Math.max(worstDir, Math.hypot(
        back[0] - want[0], back[1] - want[1], back[2] - want[2], back[3] - want[3]));
    }
    check(`a ${name} generator axis closes up`, worstPos < 1e-10,
      `returns within ${worstPos.toExponential(2)}`);
    check('  and comes back pointing the same way', worstDir < 1e-10,
      `direction off by ${worstDir.toExponential(2)}`);
  }

  // Half a lap must NOT come back, or the length would be wrong and the
  // boomerang would return early.
  setSolid(SOLID.DODECAHEDRON);
  const half = closedGeodesicLength() / 2;
  let nearest = 1e9;
  for (const d of closedGeodesicDirs()) {
    const [F] = reduceToDomain(geodesic(IDENTITY, d, half));
    nearest = Math.min(nearest, dist(point(F), ORIGIN));
  }
  check('and half a lap does not', nearest > 0.5, `closest ${nearest.toFixed(3)}`);
  setSolid(SOLID.OCTAGON);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
