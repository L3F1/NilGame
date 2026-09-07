// s2r.test.js — S^2 x R: a compact floor, real gravity, and no group anywhere.
//
//   node s2r.test.js
//
// Keep the summary line LAST and process.exit after IT. A test appended after
// the summary still runs and still prints but is not counted, and an exit in
// the MIDDLE of the file ends the run there -- which cost physics.test.js 59
// silent tests once.

import {
  ORIGIN, IDENTITY, dot, sdot, point, frameVec, applyPoint, applyVec, compose,
  UP, translation, translationBy, geodesic, rayPoint, exp, log,
  horizDist, dist, inv, logTo, reorthonormalize, groupError, placeAt,
  S2R_LAP, S2R_ANTIPODE, S2R_COLUMNS, S2R_SPIRE, S2R_FLOOR_Z, S2R_PLAYER_R,
  s2rMap, s2rSDF, s2rGLSL,
  S2R_G, S2R_WALK, S2R_JUMP, grounded, s2rControl, s2rStep, surfaceNormal,
  s2rCollide, jump,
  LAP_GATES, LAP_GATE_R, gateCrossed, lapCourse, gateRing, lapStart,
} from './s2r.js';
import * as H2R from './h2r.js';
import { surface, E2R } from './product.js';
import { makeRun, startRun, runStep, PHASE } from './modes.js';

let passed = 0, failed = 0;
function ok(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ok     ${name}`); }
  else { failed++; console.log(`  FAIL   ${name}${extra ? '  ' + extra : ''}`); }
}
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
function section(s) { console.log(`\n${s}`); }

// ---------------------------------------------------------------------------
section('the model: the floor is a round sphere and the height is free');

{
  let worst = 0;
  for (let i = 0; i < 400; i++) {
    const p = point(translation([
      (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 40]));
    worst = Math.max(worst, Math.abs(sdot(p, p) - 1));
  }
  ok('sdot(p,p) = +1 at every height', worst < 1e-13,
     `worst ${worst.toExponential(2)}`);
  // The one number that separates this world from H^2 x R.
  ok('and it is -1 in H^2 x R, which is the whole difference',
     near(H2R.hdot(H2R.point(H2R.translation([1, 2, 3])), H2R.point(H2R.translation([1, 2, 3]))), -1, 1e-12));
}

{
  // The height is affine here for exactly the reason it is in H^2 x R, so it
  // is exact at any depth -- and unlike H^2 x R the HORIZONTAL coordinates are
  // bounded by 1 as well, so this geometry has no range limit at all.
  const p = point(translation([2.0, 1.0, 1e6]));
  ok('height 1e6 is stored exactly', p[2] === 1e6, `got ${p[2]}`);
  let big = 0;
  for (let i = 0; i < 200; i++) {
    const q = point(translation([(Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 0]));
    big = Math.max(big, Math.abs(q[0]), Math.abs(q[1]), Math.abs(q[3]));
  }
  ok('and every horizontal coordinate is bounded by 1, at any distance',
     big <= 1 + 1e-15, `worst |coord| ${big}`);
}

{
  const M = placeAt(1.1, -0.6, 3.1);
  let worst = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      worst = Math.max(worst, Math.abs(dot(frameVec(M, i), frameVec(M, j)) - (i === j ? 1 : 0)));
    }
  }
  ok('the frame is orthonormal under diag(1,1,1,1)', worst < 1e-13,
     `worst ${worst.toExponential(2)}`);
  ok('E3 is exactly the vertical', frameVec(M, 2).join() === [0, 0, 1, 0].join());
}

// ---------------------------------------------------------------------------
section('the group: the same affine-height rule, at the other curvature');

{
  // The trap product.js exists to get right, checked again at kS = +1 because
  // a sign error would show here and nowhere else.
  const A = translation([0.78, 0, 2.1]);
  const B = translationBy([0.6, 0, 0.8], 1.3);
  const C = compose(A, B);
  ok('composing two heights ADDS them', near(point(C)[2], 3.14, 1e-12),
     `got ${point(C)[2]}`);
  const wrongZ = A[10] * B[14] + A[14] * B[15];   // what a mat4 multiply gives
  ok('a linear compose would still have got it wrong',
     Math.abs(wrongZ - 3.14) > 0.2, `linear gives ${wrongZ.toFixed(3)}`);
}

{
  ok('applyPoint translates the height',
     near(applyPoint(translation([0.4, 0.9, 7]), ORIGIN)[2], 7, 1e-13));
  ok('applyVec does not',
     near(applyVec(translation([0.4, 0.9, 7]), [0, 0, 1, 0])[2], 1, 1e-13));
}

{
  let worstI = 0, worstG = 0;
  for (let i = 0; i < 300; i++) {
    const M = placeAt((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6,
                      (Math.random() - 0.5) * 30);
    const I = compose(M, inv(M));
    for (let k = 0; k < 16; k++) worstI = Math.max(worstI, Math.abs(I[k] - IDENTITY[k]));
    worstG = Math.max(worstG, groupError(M));
  }
  ok('M o inv(M) is the identity', worstI < 1e-13, `worst ${worstI.toExponential(2)}`);
  ok('placeAt is in the group', worstG < 1e-13, `worst ${worstG.toExponential(2)}`);
}

{
  // At kS = +1 the surface block is ORTHOGONAL, so the inverse is a plain
  // transpose. Saying so pins the J = diag(1,1,kS) in product.js: get the sign
  // wrong and this is the test that notices.
  const M = translation([0.9, -0.4, 2.0]);
  const N = inv(M);
  let worst = 0;
  for (const i of [0, 1, 3]) {
    for (const j of [0, 1, 3]) worst = Math.max(worst, Math.abs(N[j * 4 + i] - M[i * 4 + j]));
  }
  ok('the surface block inverts by transposition', worst < 1e-15,
     `worst ${worst.toExponential(2)}`);
}

// ---------------------------------------------------------------------------
section('the floor closes up on its own -- no group, no domain, no fold');

{
  // Walk one lap in a straight line and arrive exactly where you started. The
  // hoop course in the bounded world does this because a GROUP glues the room
  // to itself; here it is because a sphere is a sphere.
  let worst = 0;
  for (let i = 0; i < 16; i++) {
    const th = 2 * Math.PI * i / 16;
    const back = rayPoint(placeAt(0, 0, 0.4), [Math.cos(th), Math.sin(th), 0], S2R_LAP);
    worst = Math.max(worst, dist(back, point(placeAt(0, 0, 0.4))));
  }
  ok('a lap in any direction returns to the start', worst < 1e-12,
     `worst ${worst.toExponential(2)}`);
}

{
  // Every great circle through a point passes through its antipode, so walking
  // pi in ANY direction lands on the same place. That is the fact the spire
  // was originally placed on, and the fact that makes escape impossible.
  const start = placeAt(0, 0, 0);
  const anti = rayPoint(start, [1, 0, 0], S2R_ANTIPODE);
  let worst = 0;
  for (let i = 0; i < 24; i++) {
    const th = 2 * Math.PI * i / 24;
    worst = Math.max(worst, horizDist(rayPoint(start, [Math.cos(th), Math.sin(th), 0], S2R_ANTIPODE), anti));
  }
  ok('walking pi in any direction lands on the SAME point', worst < 1e-12,
     `worst ${worst.toExponential(2)}`);
}

{
  // ANY two great circles meet. Two players running dead straight from the
  // same place in different directions cannot avoid each other -- exactly the
  // opposite of the H^2 floor, where geodesics diverge like e^d and CLAUDE.md
  // records that retreating is very cheap.
  const start = placeAt(0, 0, 0);
  let worstMeet = 0;
  for (let i = 1; i < 12; i++) {
    const th = Math.PI * i / 12;
    // after half a lap both are at the antipode, whatever the angle between
    const a = rayPoint(start, [1, 0, 0], Math.PI);
    const b = rayPoint(start, [Math.cos(th), Math.sin(th), 0], Math.PI);
    worstMeet = Math.max(worstMeet, horizDist(a, b));
  }
  ok('two straight runs from one place MEET again, at every angle',
     worstMeet < 1e-12, `worst separation ${worstMeet.toExponential(2)}`);
  // and in H^2 x R the same pair is exponentially far apart
  const ha = H2R.rayPoint(H2R.placeAt(0, 0, 0), [1, 0, 0], Math.PI);
  const hb = H2R.rayPoint(H2R.placeAt(0, 0, 0), [Math.cos(Math.PI / 2), Math.sin(Math.PI / 2), 0], Math.PI);
  ok('where in H^2 x R the same pair has run apart', H2R.horizDist(ha, hb) > 4,
     `${H2R.horizDist(ha, hb).toFixed(3)} apart`);
}

{
  // Distance across the floor is capped at pi, by construction.
  let worst = 0;
  for (let i = 0; i < 400; i++) {
    const a = point(translation([(Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, 0]));
    const b = point(translation([(Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, 0]));
    worst = Math.max(worst, horizDist(a, b));
  }
  ok('no two floor points are more than pi apart', worst <= Math.PI + 1e-9,
     `worst ${worst.toFixed(6)}`);
}

// ---------------------------------------------------------------------------
section('distance is Pythagoras, and the frame never tilts');

{
  let worst = 0;
  for (let i = 0; i < 400; i++) {
    const a = point(translation([(Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 20]));
    const b = point(translation([(Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 20]));
    worst = Math.max(worst, Math.abs(dist(a, b) - Math.hypot(horizDist(a, b), a[2] - b[2])));
  }
  ok('dist = hypot(horizontal, vertical)', worst < 1e-12,
     `worst ${worst.toExponential(2)}`);
}

{
  // A circle of radius r has circumference 2 pi SIN(r), so it SHRINKS past a
  // quarter turn and closes to a point at the antipode. The mirror of the
  // sinh in h2r.test.js, and the reason apparent size is not monotonic.
  const per = (r) => {
    const base = placeAt(0, 0, 0);
    const n = 4000;
    let s = 0, prev = rayPoint(base, [1, 0, 0], r);
    for (let i = 1; i <= n; i++) {
      const th = 2 * Math.PI * i / n;
      const q = rayPoint(base, [Math.cos(th), Math.sin(th), 0], r);
      s += horizDist(prev, q);
      prev = q;
    }
    return s;
  };
  ok('a circle of radius 1.0 has circumference 2 pi sin(1)',
     near(per(1.0), 2 * Math.PI * Math.sin(1), 2e-3),
     `${per(1.0).toFixed(4)} vs ${(2 * Math.PI * Math.sin(1)).toFixed(4)}`);
  ok('and a circle of radius 2.6 is SMALLER than one of radius 1.0',
     per(2.6) < per(1.0), `${per(2.6).toFixed(3)} vs ${per(1.0).toFixed(3)}`);
}

{
  let M = placeAt(0, 0, 12);
  let worstUp = 0, worstFlat = 0;
  for (let i = 0; i < 400; i++) {
    const th = i * 0.37;
    M = reorthonormalize(geodesic(M, [Math.cos(th) * 0.9, Math.sin(th) * 0.9,
                                      Math.sin(i * 0.11) * 0.436], 0.05));
    const e3 = frameVec(M, 2);
    worstUp = Math.max(worstUp, Math.abs(e3[0]), Math.abs(e3[1]),
                       Math.abs(e3[2] - 1), Math.abs(e3[3]));
    worstFlat = Math.max(worstFlat, Math.abs(frameVec(M, 0)[2]), Math.abs(frameVec(M, 1)[2]));
  }
  ok('E3 stays exactly vertical over a 400-step walk', worstUp < 1e-13,
     `worst ${worstUp.toExponential(2)}`);
  ok('E1 and E2 stay exactly horizontal', worstFlat < 1e-13,
     `worst ${worstFlat.toExponential(2)}`);
}

{
  let worst = 0;
  for (let i = 0; i < 400; i++) {
    const v = [(Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 20];
    const back = log(exp(v));
    for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(back[k] - v[k]));
  }
  ok('log(exp(v)) = v inside one lap', worst < 1e-10,
     `worst ${worst.toExponential(2)}`);
}

{
  // log must use atan2 rather than asin, or it cannot name the far half of the
  // sphere at all: asin tops out at pi/2 and every point past a quarter turn
  // comes back as its own reflection.
  const far = point(translation([2.8, 0, 0]));
  ok('log names a point 2.8 away, past the asin limit',
     near(Math.hypot(...log(far).slice(0, 2)), 2.8, 1e-12),
     `${Math.hypot(...log(far).slice(0, 2)).toFixed(9)}`);
  ok('and the antipode does not read as the origin',
     near(Math.hypot(...log(point(translation([Math.PI, 0, 0]))).slice(0, 2)), Math.PI, 1e-9));
}

{
  let worst = 0;
  for (let i = 0; i < 300; i++) {
    const M = placeAt((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 8);
    const q = point(translation([(Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 8]));
    const v = logTo(M, q);
    worst = Math.max(worst, Math.abs(Math.hypot(v[0], v[1], v[2]) - dist(point(M), q)));
  }
  ok('|logTo(M,q)| = dist(M,q)', worst < 1e-9, `worst ${worst.toExponential(2)}`);
}

// ---------------------------------------------------------------------------
section('product.js: three curvatures out of one set of formulas');

{
  // The flat case is the control, exactly as E^3 is in geom.js: distance is
  // Pythagoras twice over, and translations COMMUTE, which they do in neither
  // curved product.
  const F = E2R();
  const A = F.translation([1.3, 0.4, 2.0]), B = F.translation([-0.7, 1.1, -0.5]);
  let worst = 0;
  const AB = F.compose(A, B), BA = F.compose(B, A);
  for (let k = 0; k < 16; k++) worst = Math.max(worst, Math.abs(AB[k] - BA[k]));
  ok('E^2 x R translations commute', worst < 1e-14, `worst ${worst.toExponential(2)}`);
  ok('and its distance is plain Pythagoras in three coordinates',
     near(F.dist(F.point(A), F.point(B)), Math.hypot(2.0, -0.7, 2.5), 1e-12),
     `${F.dist(F.point(A), F.point(B)).toFixed(9)}`);
  // ... and they do NOT commute in either curved one, which is the holonomy
  // the dash banks, one dimension down.
  for (const kS of [-1, 1]) {
    const P = surface(kS);
    const X = P.compose(P.translation([1.3, 0.4, 2.0]), P.translation([-0.7, 1.1, -0.5]));
    const Y = P.compose(P.translation([-0.7, 1.1, -0.5]), P.translation([1.3, 0.4, 2.0]));
    let d = 0;
    for (let k = 0; k < 16; k++) d = Math.max(d, Math.abs(X[k] - Y[k]));
    ok(`kS = ${kS} translations do NOT commute`, d > 0.05, `gap ${d.toFixed(4)}`);
  }
}

// ---------------------------------------------------------------------------
section('the world');

{
  ok('every column centre is on the sphere',
     S2R_COLUMNS.every((c) => Math.abs(sdot(c.c, c.c) - 1) < 1e-13));
  ok('materials stay below 10, so nothing in the level glows',
     S2R_COLUMNS.every((c) => c.mat < 10));
  // Low enough that the floor is what is nearest -- higher up an avenue
  // column wins, which is the point of putting them beside the course.
  ok('the floor SDF is the height',
     s2rSDF(point(translation([0.05, 0.02, 0.3]))) === 0.3);
  ok('and its material is 1', s2rMap(point(translation([0, 0, 0.3])))[1] === 1);
}

{
  // Nothing at the spawn. A camera inside geometry fills the screen with one
  // flat colour, which looks exactly like a shader that failed to compile.
  ok('the spawn is clear', s2rSDF(point(lapStart())) >= S2R_PLAYER_R - 1e-9,
     `SDF ${s2rSDF(point(lapStart())).toFixed(4)}`);
}

{
  // THE FALLOFF IS NOT MONOTONIC, and the two caps are placed to make that an
  // EQUALITY rather than a trend, because an equality can be checked by eye.
  // Apparent size across this floor is r/sin(d), and sin(0.45) = sin(pi-0.45).
  const app = (d, r) => r / Math.sin(d);
  const nearCap = app(0.45, 0.13), farCap = app(Math.PI - 0.45, 0.13);
  ok('the far cap is 6x the distance and the SAME apparent size',
     Math.abs(farCap / nearCap - 1) < 1e-12,
     `${((Math.PI - 0.45) / 0.45).toFixed(2)}x the distance, ${(farCap / nearCap).toFixed(6)}x the size`);
  // In either hyperbolic world the same pair would be gone.
  const hypApp = (d, r) => r / Math.sinh(d);
  ok('and in H^2 x R the far one would be a sixteenth of the near one',
     hypApp(Math.PI - 0.45, 0.13) / hypApp(0.45, 0.13) < 0.07,
     `${(100 * hypApp(Math.PI - 0.45, 0.13) / hypApp(0.45, 0.13)).toFixed(1)}% of the width`);
}

{
  // The spire is the pole of the lap, so it is a quarter turn from every gate
  // -- it sweeps a full turn around you while you run dead straight.
  const c = lapCourse();
  let worst = 0;
  for (const g of c.hoops) worst = Math.max(worst, Math.abs(horizDist(g.at, S2R_SPIRE.c) - Math.PI / 2));
  ok('the spire is exactly pi/2 from every gate on the lap', worst < 1e-9,
     `worst ${worst.toExponential(2)}`);
}

{
  // The course line must be CLEAR, which is what the first layout got wrong:
  // the ring of 8 was unphased, so a column stood at arc pi/2 straight ahead
  // and a dead-straight lap stopped against it at 1.341.
  let worst = 1e9;
  for (let i = 0; i <= 400; i++) {
    const p = rayPoint(lapStart(), [1, 0, 0], S2R_LAP * i / 400);
    worst = Math.min(worst, s2rSDF(p));
  }
  ok('the whole course line is clear of every column',
     worst >= S2R_PLAYER_R - 1e-9, `worst clearance ${worst.toFixed(4)}`);
}

{
  const g = s2rGLSL();
  ok('the emitted GLSL declares every column',
     g.includes(`S2R_C[${S2R_COLUMNS.length}]`) && g.includes(`S2R_RM[${S2R_COLUMNS.length}]`));
}

// ---------------------------------------------------------------------------
section('walking, falling and jumping');

{
  const dt = 1 / 240;
  let M = placeAt(0, 0, S2R_PLAYER_R), v = [0, 0, 0];
  for (let i = 0; i < 480; i++) {
    v = s2rControl(v, [1, 0], grounded(M, s2rSDF), dt);
    [M, v] = s2rStep(M, v, dt);
    [M, v] = s2rCollide(M, v, s2rSDF);
  }
  ok('walking reaches the top speed', near(Math.hypot(v[0], v[1]), S2R_WALK, 1e-3),
     `${Math.hypot(v[0], v[1]).toFixed(5)} vs ${S2R_WALK}`);
  ok('and stays on the floor', near(point(M)[2], S2R_PLAYER_R, 1e-3),
     `z ${point(M)[2].toFixed(5)}`);
}

{
  // The height is EUCLIDEAN, so a jump is the schoolbook parabola and its
  // apex is exactly v^2 / 2g. That is the whole claim of the geometry, in the
  // one place a player would notice it.
  const dt = 1 / 960;
  let M = placeAt(0, 0, S2R_PLAYER_R), v = jump([0, 0, 0]);
  let apex = 0, t = 0, air = 0;
  for (let i = 0; i < 4000; i++) {
    v = s2rControl(v, [0, 0], false, dt);
    [M, v] = s2rStep(M, v, dt);
    [M, v] = s2rCollide(M, v, s2rSDF);
    apex = Math.max(apex, point(M)[2] - S2R_PLAYER_R);
    t += dt;
    if (point(M)[2] > S2R_PLAYER_R + 1e-4) air = t;
  }
  ok('a jump reaches exactly v^2 / 2g',
     near(apex, S2R_JUMP * S2R_JUMP / (2 * S2R_G), 5e-3),
     `${apex.toFixed(4)} vs ${(S2R_JUMP * S2R_JUMP / (2 * S2R_G)).toFixed(4)}`);
  ok('and hangs for 2v/g', near(air, 2 * S2R_JUMP / S2R_G, 0.02),
     `${air.toFixed(3)} s vs ${(2 * S2R_JUMP / S2R_G).toFixed(3)}`);
}

{
  // Running horizontally must not change the jump, for the same reason the
  // dropper's fall does not care how hard you steer: the factors do not
  // interact. Measured at every walking speed there is.
  const dt = 1 / 960;
  const apexAt = (vh) => {
    let M = placeAt(0, 0, S2R_PLAYER_R), v = [vh, 0, S2R_JUMP], apex = 0;
    for (let i = 0; i < 2000; i++) {
      v = [v[0], v[1], v[2] - S2R_G * dt];
      [M, v] = s2rStep(M, v, dt);
      apex = Math.max(apex, point(M)[2]);
    }
    return apex;
  };
  const a = [0, 0.7, 1.5, 2.2].map(apexAt);
  ok('the jump apex is identical at every running speed',
     Math.max(...a) - Math.min(...a) === 0,
     `spread ${(Math.max(...a) - Math.min(...a)).toExponential(2)}`);
}

{
  // Walk into the spire and stop against it.
  const v0 = log(S2R_SPIRE.c);
  const m = Math.hypot(v0[0], v0[1]);
  const dir = [v0[0] / m, v0[1] / m, 0];
  const dt = 1 / 240;
  let M = placeAt(0, 0, S2R_PLAYER_R), vel = [0, 0, 0];
  for (let i = 0; i < 2400; i++) {
    vel = s2rControl(vel, [dir[0], dir[1]], grounded(M, s2rSDF), dt);
    [M, vel] = s2rStep(M, vel, dt);
    [M, vel] = s2rCollide(M, vel, s2rSDF);
  }
  // The tolerance is the finite-difference step in surfaceNormal, not slack:
  // collide pushes out along a normal it measured with e = 1e-4, so resting
  // contact settles within that of the surface and no closer.
  // The tolerance is the finite-difference step in surfaceNormal times the
  // few glancing contacts on the way, not slack: collide pushes out along a
  // normal measured with e = 1e-4, so resting contact settles within that of
  // the surface and no closer, and a walk that grazes an avenue column on the
  // way accumulates a couple of those.
  ok('a walk into the spire stops outside it',
     s2rSDF(point(M)) >= S2R_PLAYER_R - 1e-3, `SDF ${s2rSDF(point(M)).toFixed(6)}`);
  const n = surfaceNormal(placeAt(0, 0, 0.5), s2rSDF);
  ok('the floor normal is straight up', near(n[2], 1, 1e-6));
}

// ---------------------------------------------------------------------------
section('the lap course');

{
  const c = lapCourse();
  ok('six gates', c.hoops.length === LAP_GATES);
  ok('it supplies its own crossing test', c.crossed === gateCrossed);
  ok('evenly spaced around one lap',
     c.hoops.every((h, i) => near(h.t, (i + 1) * S2R_LAP / LAP_GATES, 1e-12)));
  ok('the last gate is back at the start',
     horizDist(c.hoops[LAP_GATES - 1].at, point(lapStart())) < 1e-9);
  ok('every gate plane passes through its own centre',
     c.hoops.every((h) => Math.abs(sdot(h.at, h.N)) < 1e-12));
  ok('and every gate normal is a unit surface vector',
     c.hoops.every((h) => near(sdot(h.N, h.N), 1, 1e-12)));
}

{
  const c = lapCourse();
  let worst = 1e9;
  for (const g of c.hoops) for (const p of gateRing(g)) worst = Math.min(worst, s2rSDF(p));
  // Exactly zero is right: a gate is centred at its own radius, so the bottom
  // of every ring touches the floor. Anything NEGATIVE means it is buried, or
  // that it has run into a column.
  ok('every gate ring is clear of the columns and sits on the floor',
     worst > -1e-9 && worst < 1e-9, `worst ${worst.toExponential(2)}`);
}

{
  const g = lapCourse().hoops[1];
  const before = rayPoint(lapStart(), [1, 0, 0], g.t - 0.05);
  const after = rayPoint(lapStart(), [1, 0, 0], g.t + 0.05);
  ok('a pass through the middle counts', gateCrossed(before, after, g));
  ok('and it counts the other way round too -- a gate, not a door',
     gateCrossed(after, before, g));
  // Jumping clean over it does not: the sign test ignores the height, but the
  // radius test uses the FULL distance.
  const overB = rayPoint(placeAt(0, 0, 3.0), [1, 0, 0], g.t - 0.05);
  const overA = rayPoint(placeAt(0, 0, 3.0), [1, 0, 0], g.t + 0.05);
  ok('but jumping over the top of it does not', !gateCrossed(overB, overA, g));
}

{
  // THE HEADLINE: run dead straight and the lap takes every gate and returns
  // you to the start. Same experience as the bounded world's hoop course, and
  // the opposite mechanism -- there a group glues the room to itself, here a
  // sphere closes on its own.
  const c = lapCourse();
  const run = startRun(makeRun(c), 0);
  const dt = 1 / 240;
  let M = lapStart(), v = [0, 0, 0], t = 0;
  while (t < 20 && run.phase === PHASE.RUNNING) {
    const p0 = point(M);
    v = s2rControl(v, [1, 0], grounded(M, s2rSDF), dt);
    [M, v] = s2rStep(M, v, dt);
    [M, v] = s2rCollide(M, v, s2rSDF);
    runStep(run, dt, p0, point(M), null);
    t += dt;
  }
  ok('a dead-straight run takes every gate, with no steering at all',
     run.phase === PHASE.DONE, `${run.next}/${LAP_GATES} gates`);
  ok('and it takes about one lap-length of time',
     near(run.t, S2R_LAP / S2R_WALK, 0.5), `${run.t.toFixed(3)} s`);
  ok('and finishes back where it started',
     horizDist(point(M), point(lapStart())) < 0.3,
     `${horizDist(point(M), point(lapStart())).toFixed(4)} from the start`);
}

{
  // Running BACKWARDS must not count, or the course is not a course. The
  // ordering is what does it, and here it has nothing to do with wrapping.
  const c = lapCourse();
  const run = startRun(makeRun(c), 0);
  const dt = 1 / 240;
  let M = lapStart(), v = [0, 0, 0], t = 0;
  while (t < 4 && run.phase === PHASE.RUNNING) {
    const p0 = point(M);
    v = s2rControl(v, [-1, 0], grounded(M, s2rSDF), dt);
    [M, v] = s2rStep(M, v, dt);
    [M, v] = s2rCollide(M, v, s2rSDF);
    runStep(run, dt, p0, point(M), null);
    t += dt;
  }
  ok('a backwards lap does NOT complete the course', run.phase !== PHASE.DONE,
     `${run.next}/${LAP_GATES} gates`);
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
