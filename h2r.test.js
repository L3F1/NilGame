// h2r.test.js — H^2 x R: the product geometry, and the dropper it exists for.
//
//   node h2r.test.js
//
// Keep the summary line LAST and process.exit after IT. A test appended after
// the summary still runs and still prints but is not counted, and an exit in
// the MIDDLE of the file ends the run there -- which cost physics.test.js 59
// silent tests once.

import {
  ORIGIN, IDENTITY, dot, hdot, point, frameVec, applyPoint, applyVec, compose,
  UP, translation, translationBy, geodesic, rayPoint, exp, log,
  horizDist, dist, inv, logTo, reorthonormalize, groupError, placeAt,
  H2R_COLUMNS, H2R_FLOOR_Z, H2R_TOP_Z, h2rMap, h2rSDF, h2rGLSL,
  H2R_G, H2R_ACCEL, H2R_DRAG_H, H2R_DRAG_V, H2R_PLAYER_R,
  H2R_TERM_H, H2R_TERM_V, h2rFall, stepFall, surfaceNormal, h2rCollide,
  DROP_GATES, DROP_FALL,
  gateCrossed, dropperCourse, gateRing, dropperStart,
} from './h2r.js';
import { makeRun, startRun, runStep, PHASE } from './modes.js';
import * as HYP from './hyp.js';
import { stepFree, setField, FIELD, G } from './physics.js';

let passed = 0, failed = 0;
function ok(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ok     ${name}`); }
  else { failed++; console.log(`  FAIL   ${name}${extra ? '  ' + extra : ''}`); }
}
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
function section(s) { console.log(`\n${s}`); }

// ---------------------------------------------------------------------------
section('the model: a point is H^2 in three coordinates plus a free height');

{
  // hdot is what POINTS satisfy: the height does not appear in it at all,
  // which is the whole content of "product".
  let worst = 0;
  for (let i = 0; i < 400; i++) {
    const p = point(translation([
      (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5,
      (Math.random() - 0.5) * 60]));
    worst = Math.max(worst, Math.abs(hdot(p, p) + 1));
  }
  ok('hdot(p,p) = -1 at every height, including 30 units up', worst < 1e-12,
     `worst ${worst.toExponential(2)}`);
}

{
  // The engineering case for the geometry, in one line: the height is an
  // AFFINE coordinate, so it is exact at any depth. H^3 coordinates grow like
  // cosh and run out of float64 near d = 16; here 1e6 units up is exact.
  const p = point(translation([0.3, -0.2, 1e6]));
  ok('height 1e6 is stored exactly', p[2] === 1e6, `got ${p[2]}`);
  ok('and the H^2 factor is untouched by it', Math.abs(hdot(p, p) + 1) < 1e-13);
}

{
  // dot is the AMBIENT form on tangent vectors, diag(1,1,1,-1) -- the same one
  // H^3 uses. That is why the shader's mdot, lighting and normalisation are
  // shared with the hyperbolic build unchanged.
  const M = placeAt(0.7, -0.4, 3.1);
  let worst = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const want = i === j ? 1 : 0;
      worst = Math.max(worst, Math.abs(dot(frameVec(M, i), frameVec(M, j)) - want));
    }
  }
  ok('the frame is orthonormal under the ambient form', worst < 1e-12,
     `worst ${worst.toExponential(2)}`);
  ok('E3 is exactly the vertical', frameVec(M, 2).join() === [0, 0, 1, 0].join());
}

// ---------------------------------------------------------------------------
section('the group: height is AFFINE, so it is added and never scaled');

// This is the trap the whole geometry turns on. Isom(H^2 x R) is
// Isom(H^2) x Isom(R) and does NOT embed in GL(4) on this model -- the height
// part is an affine translation. A plain mat4 multiply scales the stored
// height by the H^2 timelike coordinate, and a step of 1.3 from height 2.1
// lands at 3.812 instead of 3.140.
{
  // The exact case that was measured wrong: a step of 1.3 along a direction
  // that is part horizontal, from a placement 2.1 up. The right answer is
  // 2.1 + 1.3*0.8 = 3.14; a mat4 multiply gave 3.812, because it scaled the
  // stored 2.1 by the step's own cosh(0.78) = 1.3199.
  const A = translation([0.78, 0, 2.1]);
  const B = translationBy([0.6, 0, 0.8], 1.3);
  const C = compose(A, B);
  ok('composing two heights ADDS them', near(point(C)[2], 3.14, 1e-12),
     `got ${point(C)[2]}`);
  // The naive linear composition does not, which is what makes this a test
  // rather than a restatement of the implementation.
  const wrongZ = A[10] * B[14] + A[14] * B[15];   // what a mat4 multiply gives
  ok('a linear compose gets 3.812 instead', near(wrongZ, 3.812, 1e-3),
     `linear gives ${wrongZ.toFixed(3)}`);
}

{
  // applyPoint moves a POINT (the height translates); applyVec moves a TANGENT
  // VECTOR (it does not). Getting these the same way round is the difference
  // between a frame that stays orthonormal and one that walks off.
  const M = translation([0.4, 0.9, 7.0]);
  ok('applyPoint translates the height', near(applyPoint(M, ORIGIN)[2], 7.0, 1e-13));
  ok('applyVec does not', near(applyVec(M, [0, 0, 1, 0])[2], 1.0, 1e-13));
}

{
  let worst = 0;
  for (let i = 0; i < 300; i++) {
    const M = translation([(Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4,
                           (Math.random() - 0.5) * 40]);
    const I = compose(M, inv(M));
    for (let k = 0; k < 16; k++) worst = Math.max(worst, Math.abs(I[k] - IDENTITY[k]));
  }
  ok('M o inv(M) is the identity', worst < 1e-12, `worst ${worst.toExponential(2)}`);
}

{
  let worst = 0;
  for (let i = 0; i < 300; i++) {
    const M = placeAt((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3,
                      (Math.random() - 0.5) * 30);
    worst = Math.max(worst, groupError(M));
  }
  ok('placeAt is in the group', worst < 1e-12, `worst ${worst.toExponential(2)}`);
}

// ---------------------------------------------------------------------------
section('distance is PYTHAGORAS in the two factors, exactly');

{
  // A product metric makes this exact rather than an underestimate, which is
  // why every SDF in the world below is exact.
  let worst = 0;
  for (let i = 0; i < 500; i++) {
    const a = translation([(Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4,
                           (Math.random() - 0.5) * 20]);
    const b = translation([(Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4,
                           (Math.random() - 0.5) * 20]);
    const p = point(a), q = point(b);
    const want = Math.hypot(horizDist(p, q), p[2] - q[2]);
    worst = Math.max(worst, Math.abs(dist(p, q) - want));
  }
  ok('dist = hypot(horizontal, vertical)', worst < 1e-12,
     `worst ${worst.toExponential(2)}`);
}

{
  // The horizontal factor is genuinely H^2: a circle of radius r has
  // circumference 2 pi sinh(r), not 2 pi r. This is the fact that makes the
  // course interesting, and it is worth pinning rather than assuming.
  const r = 1.5;
  const base = placeAt(0, 0, 0);
  const n = 4000;
  let per = 0;
  let prev = rayPoint(base, [1, 0, 0], r);
  for (let i = 1; i <= n; i++) {
    const th = 2 * Math.PI * i / n;
    const q = rayPoint(base, [Math.cos(th), Math.sin(th), 0], r);
    per += horizDist(prev, q);
    prev = q;
  }
  ok('a circle of radius 1.5 has circumference 2 pi sinh(1.5)',
     near(per, 2 * Math.PI * Math.sinh(r), 1e-3),
     `${per.toFixed(4)} vs ${(2 * Math.PI * Math.sinh(r)).toFixed(4)}`);
  ok('which is 1.4x the flat answer, so the plan really is hyperbolic',
     per / (2 * Math.PI * r) > 1.4);
}

{
  // exp and log invert, at height too.
  let worst = 0;
  for (let i = 0; i < 400; i++) {
    const v = [(Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4,
               (Math.random() - 0.5) * 20];
    const back = log(exp(v));
    for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(back[k] - v[k]));
  }
  ok('log(exp(v)) = v', worst < 1e-10, `worst ${worst.toExponential(2)}`);
}

{
  // logTo is what aiming uses, and it has to agree with the distance.
  let worst = 0;
  for (let i = 0; i < 300; i++) {
    const M = placeAt((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3,
                      (Math.random() - 0.5) * 10);
    const q = point(translation([(Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3,
                                 (Math.random() - 0.5) * 10]));
    const v = logTo(M, q);
    worst = Math.max(worst, Math.abs(Math.hypot(v[0], v[1], v[2]) - dist(point(M), q)));
  }
  ok('|logTo(M,q)| = dist(M,q)', worst < 1e-9, `worst ${worst.toExponential(2)}`);
}

// ---------------------------------------------------------------------------
section('the frame never tilts, so there is no alignUp to get wrong');

{
  // Parallel transport in a product is componentwise, so E3 stays vertical and
  // E1, E2 stay horizontal however far you walk. In H^3 this is false and
  // physics.alignUp exists precisely to re-pin it -- 111 degrees in one
  // substep when it was left out of the open world.
  let M = placeAt(0, 0, 12);
  let worstUp = 0, worstFlat = 0;
  for (let i = 0; i < 400; i++) {
    const th = i * 0.37;
    M = geodesic(M, [Math.cos(th) * 0.9, Math.sin(th) * 0.9,
                     Math.sin(i * 0.11) * 0.436], 0.05);
    M = reorthonormalize(M);
    const e3 = frameVec(M, 2);
    worstUp = Math.max(worstUp, Math.abs(e3[0]), Math.abs(e3[1]),
                       Math.abs(e3[2] - 1), Math.abs(e3[3]));
    worstFlat = Math.max(worstFlat, Math.abs(frameVec(M, 0)[2]),
                         Math.abs(frameVec(M, 1)[2]));
  }
  ok('E3 stays exactly vertical over a 400-step walk', worstUp < 1e-12,
     `worst ${worstUp.toExponential(2)}`);
  ok('E1 and E2 stay exactly horizontal', worstFlat < 1e-12,
     `worst ${worstFlat.toExponential(2)}`);
}

// ---------------------------------------------------------------------------
section('THE HEADLINE: fall time is independent of horizontal speed');

// This is the whole reason the dropper works here and does not work in H^3.
// z = const is a TOTALLY GEODESIC copy of H^2, so a horizontal geodesic stays
// at its height for ever and the two factors never interact.
{
  const dt = 1 / 480;
  const fall = (vh) => {
    let M = placeAt(0, 0, 24), v = [vh, 0, 0], t = 0;
    while (point(M)[2] > 0 && t < 60) {
      // gravity only, no steering, so any coupling would have to come from
      // the geometry rather than from the input
      v = [v[0], v[1], (v[2] - H2R_G * dt) * Math.exp(-H2R_DRAG_V * dt)];
      [M, v] = stepFall(M, v, dt);
      t += dt;
    }
    return t;
  };
  const times = [0, 0.4, 0.8, 1.6, 3.0].map(fall);
  const spread = Math.max(...times) - Math.min(...times);
  ok('the same fall time at horizontal 0, 0.4, 0.8, 1.6 and 3.0', spread === 0,
     `spread ${spread.toExponential(2)}, times ${times.map((x) => x.toFixed(6)).join(' ')}`);
  ok('and it is a real fall, not a stall', times[0] > 5 && times[0] < 12,
     `${times[0].toFixed(3)} s`);
}

{
  // The contrast, on H^3's OWN integrator rather than on an argument. Above a
  // critical horizontal speed the geometry beats gravity outright and the fall
  // never finishes -- and that speed collapses with altitude.
  const dt = 1 / 480;
  setField(FIELD.PLANE);
  const fallH3 = (vh, alt) => {
    let M = HYP.translation([0, 0, 1], alt);
    let v = [vh, 0, 0], t = 0;
    while (HYP.height(HYP.point(M)) > 0 && t < 30) {
      [M, v] = stepFree(M, v, dt);
      t += dt;
    }
    return t >= 30 ? Infinity : t;
  };
  const still = fallH3(0, 3);
  const moving = fallH3(0.9, 3);
  ok('H^3 at altitude 3 lands in ~1.4 s standing still', near(still, 1.4146, 0.02),
     `${still.toFixed(4)} s`);
  ok('H^3 at altitude 3 NEVER lands at walking speed 0.9', moving === Infinity,
     `${moving} s`);
  // ... and the same drop in H^2 x R is unmoved by the same input.
  const h2rFallTime = (vh) => {
    let M = placeAt(0, 0, 3), v = [vh, 0, 0], t = 0;
    while (point(M)[2] > 0 && t < 30) {
      v = [v[0], v[1], v[2] - H2R_G * dt];
      [M, v] = stepFall(M, v, dt);
      t += dt;
    }
    return t;
  };
  ok('H^2 x R lands in the same time at 0 and at 0.9',
     h2rFallTime(0) === h2rFallTime(0.9),
     `${h2rFallTime(0).toFixed(4)} vs ${h2rFallTime(0.9).toFixed(4)}`);
}

// ---------------------------------------------------------------------------
section('terminal speeds are the ones the layout was searched against');

{
  // H2R_TERM_H and H2R_TERM_V are the CONTINUOUS limits, a/drag. The exponential
  // integrator's own fixed point is a*dt*k/(1-k) with k = exp(-drag*dt), which
  // is a substep smaller -- 0.2% at 1/480. Both are checked: the simulation
  // must reach its own fixed point exactly, and that fixed point must be the
  // documented constant to well under a percent, or the searched layout was
  // tuned against a speed the game does not actually have.
  const dt = 1 / 480;
  let v = [0, 0, 0];
  for (let i = 0; i < 20000; i++) v = h2rFall(v, [1, 0], dt);
  const fix = (a, drag) => {
    const k = Math.exp(-drag * dt);
    return a * dt * k / (1 - k);
  };
  ok('the horizontal speed reaches the integrator fixed point exactly',
     near(v[0], fix(H2R_ACCEL, H2R_DRAG_H), 1e-9), `${v[0].toFixed(9)}`);
  ok('the fall speed reaches its fixed point exactly',
     near(-v[2], fix(H2R_G, H2R_DRAG_V), 1e-9), `${(-v[2]).toFixed(9)}`);
  ok('terminal horizontal is ACCEL/DRAG_H to under a percent',
     Math.abs(v[0] / H2R_TERM_H - 1) < 0.01, `${v[0].toFixed(4)} vs ${H2R_TERM_H}`);
  ok('terminal fall is G/DRAG_V to under a percent',
     Math.abs(-v[2] / H2R_TERM_V - 1) < 0.01, `${(-v[2]).toFixed(4)} vs ${H2R_TERM_V}`);
}

// ---------------------------------------------------------------------------
section('the world: exact SDFs, and a clear shaft');

{
  // The floor is z = 0 and its distance IS the coordinate. The cheapest exact
  // surface anywhere in this project.
  // Low in the shaft and inside the inner ring, so the floor is what is
  // nearest -- higher up a column wins, which is the point of the columns.
  ok('the floor SDF is the height', h2rSDF(point(translation([0.4, 0.2, 0.5]))) === 0.5);
  ok('and its material is 1', h2rMap(point(translation([0, 0, 0.5])))[1] === 1);
}

{
  // A vertical column ignores the height entirely, so its distance is the same
  // at every altitude. That is exact, not an underestimate.
  const c = H2R_COLUMNS[0];
  const v = log(c.c);
  const at = (z) => h2rSDF(point(translation([v[0] * 1.6, v[1] * 1.6, z])));
  ok('a column reads the same distance at z = 1 and z = 30',
     near(at(1), at(30), 1e-12), `${at(1)} vs ${at(30)}`);
}

{
  // Nothing at the spawn. A camera inside geometry fills the screen with one
  // flat colour, which looks exactly like a shader that failed to compile --
  // and both spawns in this project have been blocked at some point.
  const d = h2rSDF(point(dropperStart()));
  ok('the deck spawn is clear', d > H2R_PLAYER_R * 3, `SDF ${d.toFixed(3)}`);
}

{
  const g = h2rGLSL();
  ok('the emitted GLSL declares every column',
     g.includes(`H2R_C[${H2R_COLUMNS.length}]`) && g.includes(`H2R_RM[${H2R_COLUMNS.length}]`));
  ok('materials stay below 10, so nothing in the level glows',
     H2R_COLUMNS.every((c) => c.mat < 10));
}

// ---------------------------------------------------------------------------
section('collision');

{
  // Walk into a column and stop against it, rather than through it.
  const c = H2R_COLUMNS[0];
  const v = log(c.c);
  const u = Math.hypot(v[0], v[1]);
  const dir = [v[0] / u, v[1] / u, 0];
  let M = placeAt(0, 0, 6), vel = [dir[0] * 2, dir[1] * 2, 0];
  const dt = 1 / 240;
  for (let i = 0; i < 2000; i++) {
    [M, vel] = stepFall(M, vel, dt);
    [M, vel] = h2rCollide(M, vel, h2rSDF);
  }
  ok('a walk into a column stops outside it',
     h2rSDF(point(M)) >= H2R_PLAYER_R - 1e-6, `SDF ${h2rSDF(point(M)).toFixed(4)}`);
}

{
  // The floor catches a fall. The normal there is straight up.
  let M = placeAt(0.3, 0.1, 4), v = [0, 0, -3];
  const dt = 1 / 240;
  for (let i = 0; i < 2000; i++) {
    v = [v[0], v[1], v[2] - H2R_G * dt];
    [M, v] = stepFall(M, v, dt);
    [M, v] = h2rCollide(M, v, h2rSDF);
  }
  ok('a fall lands on the floor and stays', near(point(M)[2], H2R_PLAYER_R, 1e-3),
     `z = ${point(M)[2].toFixed(5)}`);
  const n = surfaceNormal(M, h2rSDF);
  ok('and the floor normal is straight up', near(n[2], 1, 1e-6));
}

// ---------------------------------------------------------------------------
section('the dropper course');

{
  const c = dropperCourse();
  ok('five gates', c.hoops.length === DROP_GATES);
  ok('it supplies its own crossing test', c.crossed === gateCrossed);
  ok('each gate is DROP_FALL below the last',
     c.hoops.every((h, i) => near(h.z, H2R_TOP_Z - (i + 1) * DROP_FALL, 1e-12)));
  ok('the first gate is below the deck', c.hoops[0].z < H2R_TOP_Z);
  ok('the last gate is above the floor', c.hoops[DROP_GATES - 1].z > H2R_FLOOR_Z);
  ok('and every gate normal is the vertical', c.hoops.every((h) => h.N === UP));
}

{
  // The ring clearance the search demanded. A gate inside a column is the
  // same failure the grapple course's naive ring had -- levelSDF read -0.034
  // at the first gate there.
  const c = dropperCourse();
  let worst = 1e9;
  for (const g of c.hoops) for (const p of gateRing(g)) worst = Math.min(worst, h2rSDF(p));
  ok('every gate ring is clear of the columns', worst > 0.2,
     `worst clearance ${worst.toFixed(3)}`);
}

{
  // The plan is genuinely hyperbolic: the hops between gates are far enough
  // apart that sinh(d)/d is doing real work. At d = 0.7 it is 1.08, and the
  // course would be a flat one with a curved metric written on it.
  const c = dropperCourse();
  const offs = [horizDist(c.hoops[0].at, ORIGIN),
    ...c.hoops.slice(1).map((g, i) => horizDist(g.at, c.hoops[i].at))];
  const amp = offs.reduce((s, d) => s + Math.sinh(d) / d, 0) / offs.length;
  ok('mean sinh(d)/d over the hops is well above 1', amp > 2.5,
     `${amp.toFixed(2)}, offsets ${offs.map((x) => x.toFixed(2)).join(' ')}`);
}

{
  // The crossing test: downward only, and inside the radius.
  const g = dropperCourse().hoops[0];
  const v = log(g.at);
  const above = point(translation([v[0], v[1], g.z + 0.1]));
  const below = point(translation([v[0], v[1], g.z - 0.1]));
  ok('a pass down the middle counts', gateCrossed(above, below, g));
  ok('and the same pass upward does not', !gateCrossed(below, above, g));
  ok('a pass outside the radius does not count',
     !gateCrossed(point(translation([v[0] + 2.0, v[1], g.z + 0.1])),
                  point(translation([v[0] + 2.0, v[1], g.z - 0.1])), g));
}

// The three policies the layout was searched against, replayed through the
// REAL run machinery in modes.js rather than through a local copy of it.
function fly(gain) {
  const c = dropperCourse();
  const run = startRun(makeRun(c), 0);
  const dt = 1 / 240;
  let M = dropperStart(), v = [0, 0, 0], t = 0;
  while (point(M)[2] > H2R_FLOOR_Z && t < 40 && run.phase === PHASE.RUNNING) {
    const p0 = point(M);
    const g = c.hoops[run.next];
    let want = [0, 0];
    if (gain > 0 && g) {
      const lv = logTo(M, g.at);
      const m = Math.hypot(lv[0], lv[1]);
      if (m > 1e-6) want = [gain * lv[0] / m, gain * lv[1] / m];
    }
    v = h2rFall(v, want, dt);
    [M, v] = stepFall(M, v, dt);
    [M, v] = h2rCollide(M, v, h2rSDF);
    runStep(run, dt, p0, point(M), null);
    t += dt;
  }
  return run;
}

{
  const aimed = fly(1);
  ok('an aimed run takes every gate and finishes', aimed.phase === PHASE.DONE,
     `${aimed.next}/${DROP_GATES} gates`);
  ok('and it takes a real amount of time', aimed.t > 8 && aimed.t < 16,
     `${aimed.t.toFixed(2)} s`);
}

{
  const idle = fly(0);
  ok('a NO-INPUT drop takes zero gates, so the course is not decoration',
     idle.next === 0, `${idle.next}/${DROP_GATES}`);
}

{
  // The whole skill of the mode: aiming error at distance d misses by
  // sinh(d)*e while the gate's apparent size falls like 1/sinh(d), so
  // committing early is worth exponentially more than correcting late.
  const lazy = fly(0.55);
  ok('a LAZY run (55% input, same aim) does not finish',
     lazy.phase !== PHASE.DONE, `${lazy.next}/${DROP_GATES} gates`);
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
