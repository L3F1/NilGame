// geom.test.js -- the curvature-parameterised geometry, in all three signs.
//
// Run with: node geom.test.js
//
// The summary line goes LAST and process.exit after IT. See CLAUDE.md.
//
// The load-bearing test in this file is not any single identity. It is that at
// k = -1 this module gives the SAME ANSWERS AS hyp.js, to the last digit. A
// geometry layer that quietly changes the existing numbers is a regression
// wearing a new coat, and every other test here would still pass.

import { geometry, E3, H3, S3, cosK, sinK, asinK, CURV } from './geom.js';
import * as hyp from './hyp.js';

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}  ${detail}`); }
}
const close = (a, b, tol = 1e-12) => Math.abs(a - b) <= tol;
const vclose = (a, b, tol = 1e-12) => a.length === b.length
  && a.every((x, i) => Math.abs(x - b[i]) <= tol);
const rnd = () => (Math.random() - 0.5) * 2;

const NAMES = [['E^3', E3()], ['H^3', H3()], ['S^3', S3()]];

console.log('generalised trigonometry');
{
  // The identity that makes one set of formulas work for three geometries.
  // cosh^2 - sinh^2 = 1, 1 + 0 = 1, cos^2 + sin^2 = 1 are the same statement.
  let ok = true;
  for (const k of [-1, 0, 1]) {
    for (let t = -2; t <= 2; t += 0.13) {
      if (Math.abs(cosK(t, k) ** 2 + k * sinK(t, k) ** 2 - 1) > 1e-12) ok = false;
    }
  }
  check('cosK^2 + k sinK^2 = 1 in all three', ok);
  check('  and k IS the curvature: -1 hyperbolic, 0 flat, +1 spherical',
    CURV.HYPERBOLIC === -1 && CURV.FLAT === 0 && CURV.SPHERICAL === 1);
  check('sinK degenerates to the identity when flat', close(sinK(0.7, 0), 0.7));
  check('asinK inverts sinK', [-1, 0, 1].every((k) =>
    close(asinK(sinK(0.6, k), k), 0.6, 1e-12)));
}

console.log('');
console.log('every geometry is a geometry');
for (const [name, G] of NAMES) {
  const v = [0.31, -0.22, 0.47];
  const t = Math.hypot(...v);
  const M = G.translation(v);
  const p = G.exp(v);

  check(`${name}: exp lands the right distance away`,
    close(G.dist(G.ORIGIN, p), t, 1e-12), `${G.dist(G.ORIGIN, p)} vs ${t}`);
  check('  log undoes exp', vclose(G.log(p), v, 1e-12));
  check('  the point is on the model', close(G.groupError(M), 0, 1e-12),
    `${G.groupError(M)}`);
  check('  translation moves the origin to exp(v)',
    vclose(G.point(M), p, 1e-12));
  check('  and M * inv(M) is the identity',
    vclose(G.matMul(M, G.inv(M)), G.IDENTITY, 1e-12));
  check('  distance is symmetric', close(G.dist(p, G.ORIGIN), G.dist(G.ORIGIN, p)));
  check('  and zero to itself', close(G.dist(p, p), 0, 1e-15));

  // A geodesic is travelled at unit speed: the distance from the start is the
  // arclength. This is the property everything else in the engine rests on.
  let speedOk = true;
  for (let s = 0.1; s <= 1.2; s += 0.1) {
    const q = G.rayPoint(G.IDENTITY, [1, 0, 0], s);
    if (Math.abs(G.dist(G.ORIGIN, q) - s) > 1e-12) speedOk = false;
  }
  check('  a geodesic runs at unit speed', speedOk);

  // Composing translations stays in the group. This is what drifts, and it is
  // why reorthonormalize exists.
  //
  // The walk is deliberately kept NEAR THE ORIGIN, by stepping back toward it
  // whenever it strays. Left to wander, this test measures something else
  // entirely: a hyperbolic random walk is BALLISTIC rather than diffusive, so
  // 400 free steps of 0.2 reach d = 11.7, where coordinates are 5.9e4 and
  // <p,p> has to come out to -1 from terms of size 3.5e9. Float64 leaves about
  // 8e-7 of residue there, which is the documented d = 16 range limit doing
  // exactly what CLAUDE.md says it does -- not a failure of reorthonormalize.
  // Measured before this was pinned down: 29 of 200 trials over tolerance in
  // H^3, and none at all in E^3 or S^3.
  let M2 = G.IDENTITY.slice();
  for (let i = 0; i < 400; i++) {
    const home = G.logTo(M2, G.ORIGIN);
    const hm = Math.hypot(home[0], home[1], home[2]);
    const step = hm > 1.5
      ? [home[0] / hm * 0.2, home[1] / hm * 0.2, home[2] / hm * 0.2]
      : [rnd() * 0.2, rnd() * 0.2, rnd() * 0.2];
    M2 = G.matMul(M2, G.translation(step));
    M2 = G.reorthonormalize(M2);
  }
  check('  400 composed steps stay in the group under reorthonormalize',
    G.groupError(M2) < 1e-12, `${G.groupError(M2).toExponential(2)}`);
  check('  and the walk stayed in range while doing it',
    G.dist(G.ORIGIN, G.point(M2)) < 2.5);
}

console.log('');
console.log('THE regression test: at k = -1 this must match hyp.js exactly');
{
  const G = H3();
  hyp.setSolid(hyp.SOLID.OCTAGON);
  let worstD = 0, worstP = 0, worstL = 0, worstT = 0;
  for (let i = 0; i < 2000; i++) {
    const v = [rnd() * 1.2, rnd() * 1.2, rnd() * 1.2];
    const w = [rnd() * 1.2, rnd() * 1.2, rnd() * 1.2];

    // exp
    const pa = G.exp(v), pb = hyp.exp(v);
    worstP = Math.max(worstP, Math.max(...pa.map((x, j) => Math.abs(x - pb[j]))));

    // distance
    const qa = G.exp(w), qb = hyp.exp(w);
    worstD = Math.max(worstD, Math.abs(G.dist(pa, qa) - hyp.dist(pb, qb)));

    // log
    const la = G.log(pa), lb = hyp.log(pb);
    worstL = Math.max(worstL, Math.max(...la.map((x, j) => Math.abs(x - lb[j]))));

    // The isometry itself. hyp.translation takes a UNIT direction and a
    // distance as two arguments; geom's takes one vector whose length is the
    // distance. Same map, different spelling.
    const tv = Math.hypot(v[0], v[1], v[2]);
    const Ta = G.translation(v);
    const Tb = hyp.translation([v[0] / tv, v[1] / tv, v[2] / tv], tv);
    worstT = Math.max(worstT, Math.max(...Ta.map((x, j) => Math.abs(x - Tb[j]))));
  }
  // 1e-14 rather than 1e-15, measured: over 200000 samples the worst
  // disagreement is 4.4e-16, which is under one ULP at these magnitudes.
  // A 1e-15 tolerance is about one ULP and would flake for no reason.
  check('exp agrees with hyp.js', worstP < 1e-14, `worst ${worstP.toExponential(2)}`);
  check('log agrees with hyp.js', worstL < 1e-14, `worst ${worstL.toExponential(2)}`);
  check('dist agrees with hyp.js', worstD < 1e-14, `worst ${worstD.toExponential(2)}`);
  check('translation agrees with hyp.js', worstT < 1e-15,
    `worst ${worstT.toExponential(2)}`);

  // And the form itself, which everything above is built on.
  let worstF = 0;
  for (let i = 0; i < 2000; i++) {
    const a = [rnd(), rnd(), rnd(), rnd()], b = [rnd(), rnd(), rnd(), rnd()];
    worstF = Math.max(worstF, Math.abs(G.dot(a, b) - hyp.dot(a, b)));
  }
  check('the Minkowski form agrees with hyp.js', worstF < 1e-15,
    `worst ${worstF.toExponential(2)}`);
}

console.log('');
console.log('flat space is the control: arithmetic you can check by hand');
{
  const G = E3();
  check('a point is just its coordinates, with 1 in the last slot',
    vclose(G.exp([3, 4, 0]), [3, 4, 0, 1], 1e-15));
  check('distance is Pythagoras', close(G.dist(G.exp([3, 4, 0]), G.ORIGIN), 5, 1e-15));
  check('  and between two points', close(
    G.dist(G.exp([1, 2, 3]), G.exp([4, 6, 3])), 5, 1e-14));
  check('a circle of radius 2 has circumference 4*pi',
    close(G.circumference(2), 4 * Math.PI, 1e-14));
  check('translations commute, which they do in NO other geometry here', vclose(
    G.matMul(G.translation([1, 0, 0]), G.translation([0, 1, 0])),
    G.matMul(G.translation([0, 1, 0]), G.translation([1, 0, 0])), 1e-15));
}
{
  // The same check in H^3, to show the flat one above is saying something.
  const G = H3();
  const ab = G.matMul(G.translation([1, 0, 0]), G.translation([0, 1, 0]));
  const ba = G.matMul(G.translation([0, 1, 0]), G.translation([1, 0, 0]));
  check('  in H^3 they do not commute, and the gap IS the holonomy',
    !vclose(ab, ba, 1e-6));
}

console.log('');
console.log('the sphere closes up on itself');
{
  const G = S3();
  // Compact with NO quotient. Every geodesic closes at 2*pi, which is the
  // property the octagon and dodecahedron groups exist to fake in H^3.
  const lap = G.rayPoint(G.IDENTITY, [1, 0, 0], 2 * Math.PI);
  check('a geodesic closes after 2*pi with no group at all',
    G.dist(lap, G.ORIGIN) < 1e-12, `${G.dist(lap, G.ORIGIN).toExponential(2)}`);
  const half = G.rayPoint(G.IDENTITY, [1, 0, 0], Math.PI);
  check('  and reaches the antipode at pi',
    close(G.dist(half, G.ORIGIN), Math.PI, 1e-9));
  check('  which is the same point whichever way you set off',
    G.dist(half, G.rayPoint(G.IDENTITY, [0, 1, 0], Math.PI)) < 1e-12);
  // The furthest anything can be. In H^3 there is no such bound at all.
  let far = 0;
  for (let i = 0; i < 3000; i++) {
    const a = G.exp([rnd() * 4, rnd() * 4, rnd() * 4]);
    const b = G.exp([rnd() * 4, rnd() * 4, rnd() * 4]);
    far = Math.max(far, G.dist(a, b));
  }
  check('nothing is ever further away than pi', far <= Math.PI + 1e-9,
    `furthest ${far.toFixed(6)}`);

  // THE reason spherical is worth the work, beyond being a curiosity:
  // coordinates are bounded, so the float32 range limit that caps this whole
  // project simply does not arise.
  let bound = 0;
  for (let i = 0; i < 3000; i++) {
    const p = G.exp([rnd() * 6, rnd() * 6, rnd() * 6]);
    bound = Math.max(bound, ...p.map(Math.abs));
  }
  check('every coordinate stays within 1, however far you travel',
    bound <= 1 + 1e-12, `worst ${bound}`);
}
{
  // Against H^3, where it does NOT hold and never can.
  const G = H3();
  const p = G.exp([8, 0, 0]);
  check('  where in H^3 the same trip gives coordinates of order 1e3',
    Math.max(...p.map(Math.abs)) > 1e3,
    `${Math.max(...p.map(Math.abs)).toExponential(1)}`);
}

console.log('');
console.log('the range limit, which is a fact about the GEOMETRY not the code');
{
  // CLAUDE.md: "<p,p> is a difference of terms of size e^{2d} that must come
  // out to exactly -1. The digits run out around d = 16 in float64 and d = 7
  // in FLOAT32." That is why the level is small and why the corridor is only a
  // few units across. It is worth showing that this is hyperbolic space's
  // problem specifically, because the fix is not better arithmetic.
  const rows = [];
  for (const [name, G] of NAMES) {
    const far = G.k > 0 ? Math.PI * 0.9 : 10;    // the sphere has nowhere further
    const p = G.exp([far, 0, 0]);
    rows.push([name, far, Math.max(...p.map(Math.abs)), G.groupError(G.translation([far, 0, 0]))]);
  }
  const [, , eCoord] = rows[0], [, , hCoord, hErr] = rows[1], [, , sCoord] = rows[2];
  check('flat coordinates grow like the distance', close(eCoord, 10, 1e-9));
  check('hyperbolic coordinates grow like cosh of it -- 1.1e4 at d = 10',
    hCoord > 1e4, `${hCoord.toExponential(2)}`);
  check('  which is why the group error is already visible there',
    hErr > 1e-16, `${hErr.toExponential(2)}`);
  check('SPHERICAL coordinates never leave 1, however far you go',
    sCoord <= 1 + 1e-15, `${sCoord}`);

  // The float32 version of the same statement, which is the one that actually
  // binds, because the shader is float32.
  const H = H3();
  const f32 = (x) => Math.fround(x);
  let d32 = 0;
  for (let d = 1; d < 20; d += 0.05) {
    const p = H.exp([d, 0, 0]).map(f32);
    if (Math.abs(H.dot(p, p) + 1) > 1e-3) { d32 = d; break; }
  }
  check('in FLOAT32 hyperbolic space runs out of digits around d = 7',
    d32 > 5 && d32 < 10, `<p,p> is off by 1e-3 at d = ${d32.toFixed(2)}`);
  const S = S3();
  let ok32 = true;
  for (let d = 0; d < Math.PI; d += 0.01) {
    const p = S.exp([d, 0, 0]).map(f32);
    if (Math.abs(S.dot(p, p) - 1) > 1e-5) ok32 = false;
  }
  check('  where spherical float32 holds all the way to the antipode', ok32);
}

console.log('');
console.log('the racing line, which is why this was built');
{
  // Circumference is 2*pi*sinK(r). The DERIVATIVE in r is the price of moving
  // one unit wider to overtake, and its sign is the whole difference between
  // the three geometries.
  const [E, H, S] = [E3(), H3(), S3()];
  const ang = Math.PI / 2;
  const d = (G, r) => (G.cornerArc(r + 1e-6, ang) - G.cornerArc(r - 1e-6, ang)) / 2e-6;

  check('flat: width costs the same wherever you are',
    close(d(E, 0.5), d(E, 3.0), 1e-6));
  check('hyperbolic: width costs MORE the wider you already are',
    d(H, 3.0) > d(H, 0.5) * 5, `${d(H, 0.5).toFixed(2)} -> ${d(H, 3.0).toFixed(2)}`);
  // The inversion. Past the equator a wider line is a SHORTER one, so a corner
  // has two fast lines -- hug the apex, or go round the far side and hug its
  // antipode -- and the slow one is straight through the middle. No flat
  // racing instinct survives it.
  check('spherical: past pi/2 the price of width goes NEGATIVE',
    d(S, 0.5) > 0 && d(S, 2.0) < 0,
    `${d(S, 0.5).toFixed(3)} at r=0.5, ${d(S, 2.0).toFixed(3)} at r=2.0`);
  check('  with the turning point exactly at the equator',
    Math.abs(d(S, Math.PI / 2)) < 1e-5);
  check('  so the SLOWEST line round a spherical corner is the equator',
    S.cornerArc(Math.PI / 2, ang) > S.cornerArc(1.0, ang)
    && S.cornerArc(Math.PI / 2, ang) > S.cornerArc(2.5, ang));
  check('  while in H^3 the slowest line is always the widest',
    H.cornerArc(2.5, ang) > H.cornerArc(Math.PI / 2, ang));
}

console.log('');
console.log('one geometry object per curvature, no global mode switch');
{
  // physics.js and level.js carry a global "which solid am I in", and getting
  // it out of step with the renderer is a whole class of bug. Two geometries
  // held at once cannot go out of step with each other.
  const a = geometry(-1), b = geometry(1);
  check('two geometries can be held at once and stay independent',
    a.k === -1 && b.k === 1
    && Math.abs(a.circumference(1) - b.circumference(1)) > 1);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
