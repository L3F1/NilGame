// port.test.js — porting a flat map into a curved space.
//
//   node port.test.js
//
// Keep the summary line LAST and process.exit after IT. A test appended after
// the summary still runs and still prints but is not counted, and an exit in
// the MIDDLE of the file ends the run there -- which cost physics.test.js 59
// silent tests once.

import {
  EMBED, radialProfile, domainRadius, embedding, fitScale, portPoints,
  straightnessError, tissot, shapeReport, cornerAngle, flatAngle,
  distanceReport, compare, distToGeodesic,
} from './port.js';
import { E3, H3, S3 } from './geom.js';

let passed = 0, failed = 0;
function ok(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ok     ${name}`); }
  else { failed++; console.log(`  FAIL   ${name}${extra ? '  ' + extra : ''}`); }
}
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
function section(s) { console.log(`\n${s}`); }

// A little map with content at DIFFERENT radii, which matters: a square whose
// corners are all the same distance from the centre makes every embedding look
// alike, because they differ only in how they treat the radius.
const MAP = [
  [0, 0], [0.25, 0.1], [-0.3, 0.35], [0.6, -0.2],
  [-1, -1], [1, -1], [1, 1], [-1, 1], [0.2, 0.9], [-0.7, 0.3],
];
const SEGS = [
  [[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[-1, -1], [1, 1]],
  [[-0.7, 0.3], [0.6, -0.2]], [[0.25, 0.1], [0.2, 0.9]],
];

// ---------------------------------------------------------------------------
section('E^2 is the control: all three embeddings are the SAME map there');

// Not a formality. The difference between the three IS the curvature, so if
// they ever disagree at k = 0 the disagreement is a bug in the code rather
// than a fact about geometry.
{
  const s = 0.7;
  let worst = 0;
  for (const [x, y] of MAP) {
    const a = embedding(EMBED.POLAR, 0, s)(x, y);
    const b = embedding(EMBED.CONFORMAL, 0, s)(x, y);
    const c = embedding(EMBED.PROJECTIVE, 0, s)(x, y);
    worst = Math.max(worst, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]),
                     Math.abs(a[0] - c[0]), Math.abs(a[1] - c[1]));
  }
  ok('polar, conformal and projective coincide in E^2', worst === 0,
     `worst ${worst}`);
}

{
  // And a flat port is an isometry up to the scale, which no curved one can be.
  const G = E3();
  const f = embedding(EMBED.PROJECTIVE, 0, 0.7);
  const d = distanceReport(G, f, MAP);
  ok('every flat distance ratio is exactly the scale',
     near(d.worst, 0.7, 1e-12) && near(d.best, 0.7, 1e-12),
     `${d.best} .. ${d.worst}`);
}

// ---------------------------------------------------------------------------
section('PROJECTIVE keeps walls straight, exactly, at every scale');

// The Klein and gnomonic models are defined by this: a Euclidean chord of the
// disc IS a geodesic. So the flat midpoint of a flat segment lands ON the
// geodesic between the ported endpoints -- not at its middle, which is a
// different claim, but on it.
for (const [name, G] of [['H^2', H3()], ['S^2', S3()]]) {
  let worst = 0;
  for (const fill of [0.3, 0.6, 0.9]) {
    const scale = fitScale(MAP, EMBED.PROJECTIVE, G.k, 1.4, fill);
    const f = embedding(EMBED.PROJECTIVE, G.k, scale);
    for (const [a, b] of SEGS) worst = Math.max(worst, straightnessError(G, f, a, b));
    // and at a few random interior points of each segment, not just the middle
    for (const [a, b] of SEGS) {
      for (const u of [0.13, 0.37, 0.81]) {
        const m = [a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])];
        const P = G.point(G.translation([...f(m[0], m[1]), 0]));
        const A = G.point(G.translation([...f(a[0], a[1]), 0]));
        const B = G.point(G.translation([...f(b[0], b[1]), 0]));
        worst = Math.max(worst, distToGeodesic(G, P, A, B));
      }
    }
  }
  ok(`${name}: every point of a ported segment is ON the geodesic`, worst < 1e-12,
     `worst ${worst.toExponential(2)}`);
}

{
  // And the other two are NOT straight, which is what makes the test above
  // mean something rather than measure a tautology.
  const G = H3();
  for (const kind of [EMBED.POLAR, EMBED.CONFORMAL]) {
    const scale = fitScale(MAP, kind, -1, 1.4, 0.9);
    const f = embedding(kind, -1, scale);
    let worst = 0;
    for (const [a, b] of SEGS) worst = Math.max(worst, straightnessError(G, f, a, b));
    ok(`${kind} bends a straight wall, measurably`, worst > 0.02,
       `worst ${worst.toFixed(4)}`);
  }
}

// ---------------------------------------------------------------------------
section('CONFORMAL keeps shapes, exactly, and it is the only one that does');

// The Tissot indicatrix: radial stretch g'(u) against tangential sinK(g(u))/u.
// Conformal means those are equal at every radius, so a small circle stays a
// circle however far out it is drawn.
for (const [name, k] of [['H^2', -1], ['S^2', 1]]) {
  let worst = 0;
  for (let i = 1; i < 60; i++) {
    const u = i * (k < 0 ? 0.015 : 0.02);
    worst = Math.max(worst, Math.abs(tissot(EMBED.CONFORMAL, k, u).anisotropy - 1));
  }
  ok(`${name}: conformal anisotropy is 1 at every radius`, worst < 1e-5,
     `worst ${worst.toExponential(2)}`);
}

{
  // The others are not conformal, and the polar one's tangential stretch is
  // EXACTLY sinh(u)/u -- the number quoted all over this project. That is
  // where it comes from.
  let worst = 0;
  for (let i = 1; i < 40; i++) {
    const u = i * 0.05;
    const t = tissot(EMBED.POLAR, -1, u);
    worst = Math.max(worst, Math.abs(t.tangential - Math.sinh(u) / u));
  }
  ok('polar tangential stretch is exactly sinh(u)/u', worst < 1e-12,
     `worst ${worst.toExponential(2)}`);
  ok('so polar is NOT conformal past the origin',
     Math.abs(tissot(EMBED.POLAR, -1, 1.0).anisotropy - 1) > 0.1,
     `${tissot(EMBED.POLAR, -1, 1.0).anisotropy.toFixed(3)}`);
  ok('and projective is not either',
     Math.abs(tissot(EMBED.PROJECTIVE, -1, 0.6).anisotropy - 1) > 0.1,
     `${tissot(EMBED.PROJECTIVE, -1, 0.6).anisotropy.toFixed(3)}`);
}

{
  // Straightness and shape do not both go to zero, and that is the whole
  // reason there are three of these rather than one right answer.
  const G = H3();
  const r = compare(G, MAP, [], SEGS, 1.4);
  ok('projective is exactly straight and NOT shape-preserving',
     r.projective.straight === 0 && Math.abs(r.projective.shape - 1) > 0.1,
     `straight ${r.projective.straight}, shape ${r.projective.shape}`);
  ok('conformal is exactly shape-preserving and NOT straight',
     r.conformal.shape === 1 && r.conformal.straight > 0.02,
     `straight ${r.conformal.straight}, shape ${r.conformal.shape}`);
}

// ---------------------------------------------------------------------------
section('POLAR keeps distance and bearing from the centre');

{
  const G = H3();
  const scale = 0.4;
  const f = embedding(EMBED.POLAR, -1, scale);
  let worstD = 0, worstA = 0;
  for (const [x, y] of MAP) {
    if (Math.hypot(x, y) < 1e-9) continue;
    const ab = f(x, y);
    const p = G.point(G.translation([ab[0], ab[1], 0]));
    worstD = Math.max(worstD, Math.abs(G.dist(G.ORIGIN, p) - Math.hypot(x, y) * scale));
    worstA = Math.max(worstA,
      Math.abs(Math.atan2(ab[1], ab[0]) - Math.atan2(y, x)));
  }
  ok('every radius from the centre is exact', worstD < 1e-12,
     `worst ${worstD.toExponential(2)}`);
  ok('every bearing from the centre is exact', worstA < 1e-15,
     `worst ${worstA.toExponential(2)}`);
}

// ---------------------------------------------------------------------------
section('what NO embedding can do, and why it is worth knowing');

// A hyperbolic quadrilateral has angle sum strictly less than 2*pi, so a
// square room with four right angles does not exist in H^2 AT ALL. Every
// embedding must therefore lose either the right angles or the straight walls,
// and this pins that: all three put the corner well under 90 degrees.
{
  const G = H3();
  const corner = [[-1, -1], [1, -1], [1, 1]];
  const angles = [];
  for (const kind of [EMBED.POLAR, EMBED.CONFORMAL, EMBED.PROJECTIVE]) {
    const scale = fitScale(MAP, kind, -1, 1.4, 0.9);
    angles.push(cornerAngle(G, embedding(kind, -1, scale), ...corner));
  }
  ok('a right-angled corner comes out TIGHT in H^2, in all three',
     angles.every((a) => a < Math.PI / 2 - 0.1),
     angles.map((a) => (a * 57.2958).toFixed(1)).join(' / ') + ' deg');
  ok('and the flat angle it came from really was a right angle',
     near(flatAngle(...corner), Math.PI / 2, 1e-12));
}

{
  // The mirror statement in S^2: angle sum EXCEEDS 2*pi, so corners come out
  // wide. Same code, opposite sign, which is the check that the effect is the
  // curvature and not the code.
  const G = S3();
  const corner = [[-1, -1], [1, -1], [1, 1]];
  const scale = fitScale(MAP, EMBED.PROJECTIVE, 1, 1.4, 0.9);
  const a = cornerAngle(G, embedding(EMBED.PROJECTIVE, 1, scale), ...corner);
  ok('the same corner comes out WIDE in S^2', a > Math.PI / 2 + 0.1,
     `${(a * 57.2958).toFixed(1)} deg`);
}

// ---------------------------------------------------------------------------
section('scaling: the domain is a hard edge, not something to clamp');

{
  // The hyperbolic disc models end at u = 1, and that edge is infinitely far
  // away in the metric. Clamping a point that lands outside would hand back a
  // finite answer for a point that is not in the model -- the level would
  // build and be silently wrong, which is the worst failure available here.
  ok('the hyperbolic disc models stop at 1', domainRadius(EMBED.CONFORMAL, -1) === 1
     && domainRadius(EMBED.PROJECTIVE, -1) === 1);
  ok('polar has no edge in H^2', domainRadius(EMBED.POLAR, -1) === Infinity);
  ok('and stops at pi in S^2', domainRadius(EMBED.POLAR, 1) === Math.PI);
  let threw = false;
  try { embedding(EMBED.PROJECTIVE, -1, 1.0)(1.5, 0); } catch (e) { threw = e instanceof RangeError; }
  ok('a point outside the disc throws rather than clamping', threw);
}

{
  // fitScale must actually land the furthest point where it says.
  for (const [name, k] of [['H^2', -1], ['S^2', 1], ['E^2', 0]]) {
    const G = k < 0 ? H3() : k > 0 ? S3() : E3();
    let worst = 0;
    for (const kind of [EMBED.POLAR, EMBED.CONFORMAL, EMBED.PROJECTIVE]) {
      const { scale, points } = portPoints(MAP, kind, k, 1.4, 0.9);
      const f = embedding(kind, k, scale);
      let far = 0;
      for (const [x, y] of MAP) {
        const ab = f(x, y);
        far = Math.max(far, G.dist(G.ORIGIN, G.point(G.translation([ab[0], ab[1], 0]))));
      }
      worst = Math.max(worst, Math.abs(far - 1.4 * 0.9));
      // and portPoints must agree with embedding at the scale it reports
      const a = points[3], b = f(MAP[3][0], MAP[3][1]);
      worst = Math.max(worst, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
    }
    ok(`${name}: fitScale puts the furthest point at exactly fill * target`,
       worst < 1e-9, `worst ${worst.toExponential(2)}`);
  }
}

{
  // The scale is the design lever, and this says how large a lever. The same
  // map at fill 0.3 and at fill 0.95, ported projectively into H^2.
  const G = H3();
  const spread = (fill) => {
    const s = fitScale(MAP, EMBED.PROJECTIVE, -1, 1.4, fill);
    const d = distanceReport(G, embedding(EMBED.PROJECTIVE, -1, s), MAP);
    return d.worst / d.best;
  };
  const tight = spread(0.3), loose = spread(0.95);
  ok('filling more of the disc makes the port far less uniform',
     loose > tight * 1.5, `fill 0.30 spread ${tight.toFixed(2)}x, fill 0.95 spread ${loose.toFixed(2)}x`);
}

// ---------------------------------------------------------------------------
section('the profiles themselves');

{
  // Sanity on the closed forms, against the definitions rather than against
  // themselves: 2 atanh and atanh in H^2, 2 atan and atan in S^2.
  const u = 0.4;
  ok('hyperbolic conformal is 2 atanh',
     near(radialProfile(EMBED.CONFORMAL, -1)(u), 2 * Math.atanh(u), 1e-15));
  ok('hyperbolic projective is atanh',
     near(radialProfile(EMBED.PROJECTIVE, -1)(u), Math.atanh(u), 1e-15));
  ok('spherical conformal is 2 atan',
     near(radialProfile(EMBED.CONFORMAL, 1)(u), 2 * Math.atan(u), 1e-15));
  ok('spherical projective is atan, so it covers exactly a hemisphere',
     near(radialProfile(EMBED.PROJECTIVE, 1)(1e9), Math.PI / 2, 1e-8));
  ok('and polar is the identity in all three',
     radialProfile(EMBED.POLAR, -1)(u) === u
     && radialProfile(EMBED.POLAR, 0)(u) === u
     && radialProfile(EMBED.POLAR, 1)(u) === u);
}

{
  // distToGeodesic must actually measure a distance: a point ON the geodesic
  // reads zero, and one a known distance off reads that.
  const G = H3();
  const a = G.point(G.translation([-0.8, 0, 0]));
  const b = G.point(G.translation([0.8, 0, 0]));
  const on = G.point(G.translation([0.2, 0, 0]));
  ok('a point on the axis is 0 from it', distToGeodesic(G, on, a, b) < 1e-14);
  // Built by walking to a FOOT on the axis and then stepping perpendicular,
  // not by one geodesic step of a combined vector -- in H^2 those are two
  // different points, and using the second is what made this test claim 0.35
  // for a point that is 0.299 away.
  const foot = G.translation([0.2, 0, 0]);
  const off = G.point(G.geodesic(foot, [0, 0, 1], 0.35));
  ok('and one 0.35 off reads 0.35', near(distToGeodesic(G, off, a, b), 0.35, 1e-9),
     `${distToGeodesic(G, off, a, b).toFixed(9)}`);
  // The flat answer -- the perpendicular part of the log -- is NOT this, and
  // saying so keeps the closed form from quietly reverting.
  const w = G.logTo(G.translation(G.log(a)), off);
  const uu = G.logTo(G.translation(G.log(a)), b);
  const nu2 = Math.hypot(uu[0], uu[1], uu[2]), nw2 = Math.hypot(w[0], w[1], w[2]);
  const cos = (uu[0] * w[0] + uu[1] * w[1] + uu[2] * w[2]) / (nu2 * nw2);
  const flatAnswer = nw2 * Math.sqrt(Math.max(0, 1 - cos * cos));
  ok('and the flat tangent-space answer would have said 0.299',
     Math.abs(flatAnswer - 0.35) > 0.04, `${flatAnswer.toFixed(6)}`);
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
