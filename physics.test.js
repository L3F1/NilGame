// physics.test.js — run with:  node physics.test.js
//
// These are the invariants that say the gravity and the rope are real physics
// rather than plausible-looking arithmetic. If energy drifts, gravity is not a
// gradient. If the rope length wanders, the constraint is not on the
// hyperbolic sphere. Both failures look fine on screen for about a minute.

import {
  IDENTITY, point, dist, height, gradHeight, dot, geodesic, closedGeodesicDirs,
  geodesicFromIdentity, placeAt, fromFloor, floorPoint, distToAxis,
  logTo, toFrame, frameVec, flow, apply, reduceToDomain, domainDepth,
  OCT_R, OCT_GEN, OCT_PAIR, OCT_SIDE, matMul, radialGrad, setSolid, SOLID, generators,
  closedGeodesicLength,
  log as logOf, fromFrame, reorthonormalize, foldPoint,
} from './hyp.js';
import {
  G, gravity, energy, stepFree, control, cast, collide, alignUp,
  grappleAttach, grappleStep, ropePoints, PLAYER_R, upDirection, upness,
  rayPoint, WALK_SPEED, JUMP, FLY_SPEED, FIELD, setField, sweptArea, carryBeacon,
  altitude, setGravityScale,
  placePortal, clearPortals, portalsLive, portalCrossing, portalMap,
  PORTAL_R, settleCarried, activeBeacon,
  launchBoomerang, boomerangStep, activeBoomerang, clearBoomerang,
  rollControl, rollSpeed, carryFrameVec, ROLL_TOP,
  makeCharacter, damage, stepCharacter, boomerangHits, orbitDist,
  MAX_HEALTH, BOOM_DAMAGE, HIT_COOLDOWN,
  launchAimed, BOOM_RANGE, bump, nearestLift,
  placeBlock, blockStep, blockSDF, blockSolid, clearBlock, BLOCK_R, BLOCK_DELAY,
  plantDecoy, decoyStep, decoyPoint, carryDecoy, clearDecoy, DECOY_LIFE,
  recallTarget, warpTo,
  placeCut, cutStep, cutSDF, carryCut, clearCut, activeCut, CUT_R, CUT_LIFE,
  holoBlast, blastRadius, anchorSwap,
} from './physics.js';
import { packState, unpackState, PACKET_FLOATS } from './net.js';
import { levelSDF, levelMap, contentMap, domainMap, ORB_POINTS, ORBS, CEILING, setMode, MODE } from './level.js';

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}  ${detail}`); }
}
const close = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const rand = () => (Math.random() - 0.5) * 4;
// Inside the arena, and inside the range where cosh(r) has not eaten the
// precision. Floor radius stays under ~2, altitude inside the room.
const randFloor = () => (Math.random() - 0.5) * 2;
const randPlace = () => placeAt(randFloor() * 1.5, randFloor() * 0.6, 0.3 + Math.random() * 0.8);

console.log('\ngravity is a gradient');

let ok = true;
for (let i = 0; i < 500; i++) {
  const M = randPlace();
  const g = gravity(M);
  // Uniform strength everywhere. Nil's grew like sqrt(1+x^2); this does not,
  // because a Busemann function has unit gradient by construction.
  if (!close(Math.hypot(g[0], g[1], g[2]), G, 1e-8)) ok = false;
}
check('gravity has the same strength everywhere', ok);

ok = true;
for (let i = 0; i < 500; i++) {
  const M = randPlace();
  const p = point(M);
  const gh = gradHeight(p);
  if (!close(dot(gh, gh), 1, 1e-8)) ok = false;
  if (!close(dot(gh, p), 0, 1e-8)) ok = false;
  // Gravity is exactly -G times it, expressed in the frame.
  const want = toFrame(M, gh).map((x) => -G * x);
  if (!gravity(M).every((x, j) => close(x, want[j], 1e-9))) ok = false;
}
check('gravity is minus G times the unit height gradient', ok);

console.log('\nthe frame stays pinned to gravity');

ok = true;
for (let i = 0; i < 300; i++) {
  const M = randPlace();
  const v = [rand(), rand(), rand()];
  const [M2, v2] = alignUp(M, v);
  const u = upDirection(M2);
  // After aligning, up IS E3.
  if (!close(u[0], 0, 1e-8) || !close(u[1], 0, 1e-8) || !close(u[2], 1, 1e-8)) ok = false;
  // The player has not moved...
  if (!point(M2).every((x, j) => close(x, point(M)[j], 1e-8))) ok = false;
  // ...and the velocity means the same thing: same speed, same ambient
  // direction. Rotating the frame without rotating v would steer the player.
  if (!close(Math.hypot(...v2), Math.hypot(...v), 1e-9)) ok = false;
  const before = frameVec(M, 0).map((x, j) => v[0] * x + v[1] * frameVec(M, 1)[j] + v[2] * frameVec(M, 2)[j]);
  const after = frameVec(M2, 0).map((x, j) => v2[0] * x + v2[1] * frameVec(M2, 1)[j] + v2[2] * frameVec(M2, 2)[j]);
  if (!before.every((x, j) => close(x, after[j], 1e-7))) ok = false;
}
check('alignUp pins E3 to up without moving or steering the player', ok);

// Without this, walking tilts the frame: the drift is real, not theoretical.
{
  let M = placeAt(0, 0, 0.3);
  const v = [1.5, 0, 0];
  for (let i = 0; i < 400; i++) [M] = stepFree(M, v, 1 / 240);
  const u = upDirection(M);
  check('and the drift it corrects is real', Math.abs(u[2] - 1) > 1e-3,
    `E3 drifted to ${u.map((x) => x.toFixed(3))}`);
}

console.log('\nthe integrator conserves energy');

// Two and a half seconds, not the Nil version's seventeen, and the reason is
// a hard limit of the model rather than impatience. There is no floor in this
// test, so the player falls forever, and coordinates grow like cosh(distance).
// See the range test below: past distance ~16 a point cannot even be
// confirmed to lie on the hyperboloid. Real play never approaches that — the
// corridor is small — but a test that drops someone into a void does.
ok = true;
let worstDrift = 0;
for (let trial = 0; trial < 40; trial++) {
  let M = randPlace();
  let v = [rand() * 0.4, rand() * 0.4, rand() * 0.4];
  const e0 = energy(M, v);
  for (let i = 0; i < 600; i++) [M, v] = stepFree(M, v, 1 / 240);
  const drift = Math.abs(energy(M, v) - e0) / (1 + Math.abs(e0));
  worstDrift = Math.max(worstDrift, drift);
  if (drift > 2e-3) ok = false;
}
check('energy holds over 600 steps', ok, `worst relative drift ${worstDrift.toExponential(2)}`);

// Pin down that limit, because it decides how big a level can ever be.
// <p,p> is x0^2+x1^2+x2^2 - x3^2, a difference of terms of size e^{2d} that
// must come out to exactly -1. In float64 the digits run out around d = 16;
// in the shader's float32, around d = 7. Every formula in hyp.js and level.js
// is written to avoid needing this quantity for exactly this reason.
{
  const onShellTo = (d) => {
    const p = point(geodesicFromIdentity([1, 0, 0], d));
    return Math.abs(dot(p, p) + 1);
  };
  const near = onShellTo(5), far = onShellTo(20);
  check('the hyperboloid constraint is only checkable at short range',
    near < 1e-10 && far > 1e-3,
    `error at d=5 is ${near.toExponential(1)}, at d=20 is ${far.toExponential(1)}`);
}

{
  // Halving the timestep should cut the error roughly fourfold: Strang
  // splitting is second order. Catches a first-order mistake that energy
  // conservation alone would not.
  const M0 = placeAt(0.4, -0.7, 1.2), v0 = [0.9, -0.3, 0.5];
  const runTo = (dt) => {
    let M = M0, v = v0;
    const n = Math.round(3 / dt);
    for (let i = 0; i < n; i++) [M, v] = stepFree(M, v, dt);
    return point(M);
  };
  const ref = runTo(1 / 8000);
  const errA = dist(runTo(1 / 200), ref);
  const errB = dist(runTo(1 / 400), ref);
  const order = Math.log2(errA / errB);
  check('the integrator is second order', order > 1.7, `measured order ${order.toFixed(2)}`);
}

console.log('\nfalling');

{
  // Dropped from rest you fall straight down the vertical geodesic through
  // your floor point: altitude drops and you stay directly above it. In Nil
  // this was false — off the axis you drifted sideways. Here it is clean.
  const a = 1.1, b = -0.8;
  let M = placeAt(a, b, 1.8), v = [0, 0, 0];
  for (let i = 0; i < 300; i++) [M, v] = stepFree(M, v, 1 / 240);
  const dropped = height(point(M));
  const off = distToAxis(point(M), floorPoint(a, b));
  check('a drop from rest falls straight down', dropped < 1.8 - 0.05 && off < 1e-9,
    `altitude ${dropped.toFixed(3)}, sideways ${off.toExponential(2)}`);
}

{
  // Free fall over a short drop matches the Newtonian h = v^2/(2g) closely,
  // because the vertical geodesic is unit speed in altitude.
  let M = placeAt(0, 0, 2.0), v = [0, 0, 0];
  const h0 = height(point(M));
  for (let i = 0; i < 120; i++) [M, v] = stepFree(M, v, 1 / 240);
  const fell = h0 - height(point(M));
  const want = 0.5 * G * 0.5 * 0.5;
  check('free fall covers g*t^2/2 in altitude', close(fell, want, 1e-4),
    `fell ${fell.toFixed(6)} vs ${want.toFixed(6)}`);
}

console.log('\ncollision');

ok = true;
let checked = 0;
for (let i = 0; i < 300; i++) {
  // Start below the floor plane, in open ground, and check we are pushed out
  // to standing.
  const a = randFloor() * 0.5, b = randFloor() * 0.5;
  const M0 = placeAt(a, b, -0.12);
  // Skip spots under a pillar or platform, where the nearest surface is not
  // the floor and the normal is quite properly not up. Probing at altitude
  // 0.4: if nothing beats the floor there, this is open ground.
  if (levelSDF(fromFloor(a, b, 0.4)) < 0.399) continue;
  const [M, , n] = collide(M0, [0, 0, -1], levelSDF);
  checked++;
  if (levelSDF(point(M)) < PLAYER_R - 1e-3) ok = false;
  if (!n || upness(M, n) < 0.99) ok = false;
}
check('collision pushes out of the floor and reports an up normal', ok, `${checked} spots`);

{
  // Standing on open floor means altitude exactly PLAYER_R, because height IS
  // the signed distance to the floor plane. That exactness is new: in Nil the
  // SDF was Euclidean and this was only approximately true.
  const [M] = collide(placeAt(1.35, 0.0, -0.2), [0, 0, -1], levelSDF);
  check('standing altitude is exactly the player radius',
    close(height(point(M)), PLAYER_R, 1e-9), `${height(point(M)).toFixed(10)}`);
}

ok = true;
for (let i = 0; i < 200; i++) {
  const M0 = randPlace();
  const v0 = [rand(), rand(), rand()];
  if (levelSDF(point(M0)) < PLAYER_R) continue;
  const [, v] = collide(M0, v0, levelSDF);
  if (v.some((x, j) => x !== v0[j])) ok = false;
}
check('collision leaves free points alone', ok);

console.log('\nthe level');

ok = true;
for (let i = 0; i < 400; i++) {
  // The exact SDF must agree with brute-force distance to the orbs: sample a
  // point, and if the orb is the nearest thing, the two must match.
  const p = fromFloor(randFloor(), randFloor(), Math.random() * 2);
  let best = Infinity;
  for (let j = 0; j < ORBS.length; j++) best = Math.min(best, dist(p, ORB_POINTS[j]) - ORBS[j][3]);
  if (levelSDF(p) > best + 1e-9) ok = false;
}
check('the level SDF never overestimates the distance to an orb', ok);

// The one property sphere tracing depends on: stepping by the SDF along ANY
// geodesic must not pass through a surface.
ok = true;
for (let i = 0; i < 2000; i++) {
  const M = randPlace();
  const d = levelSDF(point(M));
  if (d <= 0) continue;
  const u = [rand(), rand(), rand()];
  const n = Math.hypot(...u);
  const dir = u.map((x) => x / n);
  if (levelSDF(rayPoint(M, dir, d * 0.999)) <= 0) ok = false;
}
check('the SDF is a true lower bound (sphere tracing is safe)', ok);

{
  // Content must not touch a domain face. The renderer marches chart by chart
  // and never leaves the fundamental domain, so a surface straddling a face is
  // CUT OFF at it - drawn on one side, missing on the other, with a flat
  // cross-section where it was sliced. Nothing else in the suite would notice:
  // both SDFs would still agree, the physics would still collide correctly
  // (levelMap folds and checks the neighbours), and the picture would just be
  // quietly wrong. So check it directly, in whichever domain is active.
  // Both worlds, because they have different domains AND different content:
  // the dodecahedron's inradius is 0.996 against the octagon's 1.5286, which
  // is exactly why the walls and towers are octagon-only.
  const clearance = (reach) => {
    let worst = Infinity, where = null;
    for (let i = 0; i < 120000; i++) {
      const a = (Math.random() * 2 - 1) * reach;
      const b = (Math.random() * 2 - 1) * reach;
      const h = Math.random() * 2 * reach - reach;
      const p = fromFloor(a, b, h);
      if (contentMap(p)[0] > 0) continue;        // only points INSIDE content
      const d = domainDepth(p);
      if (d < worst) { worst = d; where = [a, b, h]; }
    }
    return [worst, where];
  };
  const report = ([w, at]) => `closest approach ${w.toFixed(3)}` +
    (at ? ` at ${at.map((x) => x.toFixed(2)).join(', ')}` : '');

  let r = clearance(1.7);
  check('no content straddles a face of the octagon', r[0] > 0.05, report(r));

  setSolid(SOLID.DODECAHEDRON);
  setMode(MODE.OPEN);
  r = clearance(1.2);
  check('and none straddles a face of the dodecahedron', r[0] > 0.05, report(r));
  setSolid(SOLID.OCTAGON);
  setMode(MODE.BOUNDED);
}

{
  // Open ground: the SDF is exactly the altitude, because height is a genuine
  // distance function and is Gamma-invariant.
  // Out in the perimeter band, past the wall pinwheel, where the floor really
  // is open. Anywhere inside 1.2 now has furniture over it.
  check('altitude agrees with the SDF on open ground',
    close(levelSDF(fromFloor(1.35, 0.0, 0.35)), 0.35, 1e-9));
  check('and the ceiling does too',
    close(levelSDF(fromFloor(1.35, 0.0, CEILING - 0.2)), 0.2, 1e-9));
}

console.log('\nthe quotient: a closed genus-2 surface');

// The octagon is regular with 45 degree interior angles, so eight copies close
// up around every corner. That is what makes the identification a surface and
// not a cone point, and it is the whole reason this octagon was chosen.
{
  const ang = Math.acos(-dot(OCT_SIDE[0], OCT_SIDE[1])) * 180 / Math.PI;
  check('adjacent sides meet at 45 degrees, so 8 copies close a corner',
    close(ang, 45, 1e-9), `${ang.toFixed(6)} degrees, 8 x 45 = ${8 * 45}`);
}

// Every generator is a translation along an axis lying IN the floor plane, so
// it preserves height. Without that, gravity would not descend to the quotient
// and "down" would mean different things in different copies.
ok = true;
for (let i = 0; i < 2000; i++) {
  const p = fromFloor(rand(), rand(), rand());
  for (let k = 0; k < 8; k++) {
    const q = apply(OCT_GEN[k], p);
    if (!close(height(p), height(q), 1e-9)) ok = false;
    if (!close(dot(q, q), -1, 1e-8)) ok = false;
  }
}
check('every generator preserves height and stays on H^3', ok);

// Generators are isometries, so they move nothing relative to anything else.
ok = true;
for (let i = 0; i < 1000; i++) {
  const p = fromFloor(rand(), rand(), rand());
  const q = fromFloor(rand(), rand(), rand());
  const k = Math.floor(Math.random() * 8);
  if (!close(dist(p, q), dist(apply(OCT_GEN[k], p), apply(OCT_GEN[k], q)), 1e-8)) ok = false;
}
check('generators are isometries', ok);

// Pairings really do undo the generators.
ok = true;
for (let i = 0; i < 500; i++) {
  const p = fromFloor(rand(), rand(), rand());
  for (let k = 0; k < 8; k++) {
    if (dist(apply(OCT_PAIR[k], apply(OCT_GEN[k], p)), p) > 1e-8) ok = false;
  }
}
check('each pairing inverts its generator', ok);

// THE test. If the octagon with these pairings is a genuine fundamental domain
// for a discrete group, then reduction is CANONICAL: applying any group
// element before folding must land on exactly the same representative. Nothing
// else in this file would catch a wrong pairing; the picture would just be
// subtly, unfalsifiably wrong.
ok = true;
let worstCanon = 0, worstIters = 0;
for (let i = 0; i < 3000; i++) {
  const M = placeAt(rand() * 2, rand() * 2, Math.random() * 1.2);
  const [A, , nA] = reduceToDomain(M);
  const k = Math.floor(Math.random() * 8);
  const [B] = reduceToDomain(matMul(OCT_GEN[k], M));
  const e = dist(point(A), point(B));
  worstCanon = Math.max(worstCanon, e);
  worstIters = Math.max(worstIters, nA);
  if (e > 1e-6) ok = false;
}
check('reduction is canonical on Gamma-orbits', ok,
  `worst disagreement ${worstCanon.toExponential(2)}, worst ${worstIters} foldings`);

// And it actually lands inside.
ok = true;
for (let i = 0; i < 2000; i++) {
  const M = placeAt(rand() * 3, rand() * 3, Math.random());
  const [F] = reduceToDomain(M);
  if (domainDepth(point(F)) < -1e-9) ok = false;
}
check('reduction lands inside the fundamental octagon', ok);

// Folding does not change what the player sees: same point of the manifold,
// different representative.
ok = true;
for (let i = 0; i < 1000; i++) {
  const M = placeAt(rand() * 2, rand() * 2, 0.2 + Math.random());
  const [F] = reduceToDomain(M);
  if (!close(levelSDF(point(M)), levelSDF(point(F)), 1e-7)) ok = false;
}
check('folding does not change the view', ok);

// The level SDF must be Gamma-periodic, or the physics and the renderer would
// disagree about where the walls are as soon as the player crossed a face.
ok = true;
let worstPeriodic = 0;
for (let i = 0; i < 2000; i++) {
  const p = fromFloor(rand(), rand(), Math.random() * 1.4);
  const k = Math.floor(Math.random() * 8);
  const e = Math.abs(levelSDF(p) - levelSDF(apply(OCT_GEN[k], p)));
  worstPeriodic = Math.max(worstPeriodic, e);
  if (e > 1e-6) ok = false;
}
check('the level SDF is invariant under the group', ok,
  `worst difference ${worstPeriodic.toExponential(2)}`);

// Walking in a straight line must bring you home. On a closed surface there is
// no edge to reach, so this is the defining experience of the manifold.
{
  let M = placeAt(0.95, 0.60, PLAYER_R), v = [0, 0, 0];
  const start = point(M);
  let travelled = 0, crossed = 0, back = 1e9;
  // Bare floor and ceiling, no furniture. What is under test is the MANIFOLD -
  // that a closed genus-2 surface has no edge, so a straight line comes back -
  // and a wall in the way would only be testing the walls.
  const shellOnly = (q) => Math.min(height(q), CEILING - height(q));
  for (let i = 0; i < 40000; i++) {
    const before = point(M);
    v = control(v, [WALK_SPEED, 0, 0], true, 1 / 240);
    [M, v] = stepFree(M, v, 1 / 240);
    const c = collide(M, v, shellOnly); M = c[0]; v = c[1];
    [M, v] = alignUp(M, v);
    travelled += dist(before, point(M));
    const [F, , n] = reduceToDomain(M);
    M = F; crossed += n;
    if (travelled > 1.0) back = Math.min(back, dist(point(M), start));
  }
  check('walking straight ahead brings you back to where you started',
    crossed > 0 && back < 0.35,
    `walked ${travelled.toFixed(1)}, crossed ${crossed} faces, closest return ${back.toFixed(3)}`);
}


console.log('\nthe grapple');

ok = true;
let casts = 0;
for (let i = 0; i < 400; i++) {
  const M = randPlace();
  if (levelSDF(point(M)) < 0.25) continue;
  const u = [rand(), rand(), rand()];
  const n = Math.hypot(...u);
  const dir = u.map((x) => x / n);
  const r = cast(M, dir, levelSDF);
  if (!r.hit) continue;
  casts++;
  if (Math.abs(levelSDF(r.point)) > 0.01) { ok = false; console.log('     off surface', levelSDF(r.point)); break; }
  // The hit point must be exactly where that geodesic is at time t.
  if (dist(rayPoint(M, dir, r.t), r.point) > 1e-9) { ok = false; break; }
}
check('the cast lands on a surface, at the arclength it reports', ok, `${casts} hits`);

{
  // Aim at an orb and the hook must land on its surface, exactly one radius
  // short of the middle.
  const M = placeAt(0.20, 0.40, PLAYER_R);
  const target = ORB_POINTS[0];
  const lv = logTo(M, target);
  const d = Math.hypot(...lv);
  const dir = lv.map((x) => x / d);
  const r = cast(M, dir, levelSDF);
  check('aiming at an orb hits it one radius short of the centre',
    r.hit && close(dist(r.point, target), ORBS[0][3], 2e-3),
    r.hit ? `centre distance ${dist(r.point, target).toFixed(5)} vs r=${ORBS[0][3]}` : 'no hit');
}

{
  // A taut rope holds its length. This is the constraint working on the
  // hyperbolic sphere, and it is what a swing is made of.
  const anchor = ORB_POINTS[1];
  let M = placeAt(1.2, 0.35, 0.45);
  let v = [0.9, 0, 0];
  const L = Math.hypot(...logTo(M, anchor));
  const st = grappleAttach(anchor, L);
  let worstViolation = 0, worstSlack = 0, swung = 0;
  ok = true;
  for (let i = 0; i < 3000; i++) {
    [M, v] = stepFree(M, v, 1 / 240);
    const [M2, v2, info] = grappleStep(st, M, v, 1 / 240, false);
    M = M2; v = v2;
    [M, v] = alignUp(M, v);
    if (!info) { ok = false; break; }
    // The invariant is AFTER the correction: the rope may go slack but must
    // never be exceeded. Measuring before it just measures one timestep.
    const after = Math.hypot(...logTo(M, anchor));
    worstViolation = Math.max(worstViolation, after - L);
    worstSlack = Math.max(worstSlack, L - after);
    swung += Math.hypot(v[0], v[1]) / 240;
  }
  check('a taut rope is never exceeded while swinging',
    ok && worstViolation < 1e-6 && swung > 1,
    `worst violation ${worstViolation.toExponential(2)}, max slack ${worstSlack.toFixed(4)}, arc ${swung.toFixed(2)}`);
}

{
  // Reeling in must actually shorten the rope and pull the player closer.
  const anchor = ORB_POINTS[1];
  let M = placeAt(1.2, 0.35, PLAYER_R);
  let v = [0, 0, 0];
  const st = grappleAttach(anchor, Math.hypot(...logTo(M, anchor)));
  const before = dist(point(M), anchor);
  for (let i = 0; i < 240; i++) {
    [M, v] = stepFree(M, v, 1 / 240);
    [M, v] = grappleStep(st, M, v, 1 / 240, true).slice(0, 2);
  }
  check('reeling in pulls the player toward the anchor',
    dist(point(M), anchor) < before - 0.25,
    `${before.toFixed(2)} -> ${dist(point(M), anchor).toFixed(2)}`);
}

{
  // The drawn rope must be the actual geodesic: ends where they belong, and
  // evenly spaced in arclength.
  const anchor = ORB_POINTS[0];
  const M = placeAt(0.3, 0.2, 0.5);
  const pts = ropePoints(M, anchor, 20);
  const d = Math.hypot(...logTo(M, anchor));
  const endsOk = dist(pts[0], point(M)) < 1e-9 && dist(pts[pts.length - 1], anchor) < 1e-7;
  let even = true;
  for (let i = 1; i < pts.length; i++) {
    if (!close(dist(pts[i - 1], pts[i]), d / 20, 1e-6)) even = false;
  }
  check('the drawn rope is the geodesic, evenly sampled', endsOk && even);
}

console.log('\ncontrol');

{
  let v = [0, 0, 0];
  for (let i = 0; i < 200; i++) v = control(v, [WALK_SPEED, 0, 0], true, 1 / 60);
  const up = close(v[0], WALK_SPEED, 1e-6);
  for (let i = 0; i < 240; i++) v = control(v, [0, 0, 0], true, 1 / 60);
  check('walking reaches target speed, then friction stops it', up && Math.abs(v[0]) < 0.05);
}

{
  const v = control([1, 2, 3], [2, 0, 0], false, 1 / 60);
  check('control leaves the vertical to gravity', close(v[2], 3, 1e-12));
}

{
  // Air control must never brake. Steering toward a zero target in the air is
  // what silently deleted the player's momentum and stopped the rope swinging.
  let v = [1.4, 0.6, 0];
  const s0 = Math.hypot(v[0], v[1]);
  for (let i = 0; i < 600; i++) v = control(v, [0, 0, 0], false, 1 / 240);
  check('airborne with no input keeps every bit of momentum',
    close(Math.hypot(v[0], v[1]), s0, 1e-12), `${s0.toFixed(4)} -> ${Math.hypot(v[0], v[1]).toFixed(4)}`);
}

{
  // Speed carried in from a swing survives: air control only caps the
  // component along the direction you are asking for.
  let v = [4.0, 0, 0];
  for (let i = 0; i < 600; i++) v = control(v, [WALK_SPEED, 0, 0], false, 1 / 240);
  check('air control does not cap speed carried in from a swing',
    close(v[0], 4.0, 1e-12), `${v[0].toFixed(4)}`);
}

console.log('\nthe speed that makes you fly');

// Moving horizontally at altitude pushes you up at v^2*tanh(h), because
// equidistant surfaces are convex toward the floor. Verify that directly
// against the simulation, then check WALK_SPEED sits safely under it.
{
  const h = 0.8, v0 = 2.5;
  const M = placeAt(0, 0, h);
  const [M2] = flow(M, [v0, 0, 0], 0.01);
  const rose = (height(point(M2)) - h) / (0.5 * 0.01 * 0.01);
  check('horizontal motion at altitude lifts you at v^2*tanh(h)',
    Math.abs(rose - v0 * v0 * Math.tanh(h)) < 0.05,
    `measured ${rose.toFixed(3)} vs predicted ${(v0 * v0 * Math.tanh(h)).toFixed(3)}`);
}

check('walking is below the speed that lifts you', WALK_SPEED < FLY_SPEED,
  `WALK_SPEED ${WALK_SPEED} vs sqrt(G) = ${FLY_SPEED.toFixed(3)}`);

{
  // The whole point: hold forward in mid-air and you must come back down.
  let M = placeAt(0.95, 0.60, PLAYER_R), v = [0, 0, JUMP];
  let peak = height(point(M));
  let grounded = false;
  for (let fr = 0; fr < 400; fr++) {
    for (let i = 0; i < 4; i++) {
      v = control(v, [WALK_SPEED, 0, 0], grounded, 1 / 240);
      [M, v] = stepFree(M, v, 1 / 240);
      const c = collide(M, v, levelSDF);
      M = c[0]; v = c[1]; grounded = !!c[2] && upness(M, c[2]) > 0.5;
      [M, v] = alignUp(M, v);
      [M] = reduceToDomain(M);
    }
    peak = Math.max(peak, height(point(M)));
  }
  check('jumping and holding forward does not fly to the ceiling',
    peak < 1.0 && grounded, `peak altitude ${peak.toFixed(3)}`);
}

void IDENTITY; void geodesic; void gravity; void OCT_R; void domainMap; void contentMap; void levelMap;

console.log('\ngravity can point somewhere else');

// The point field is a distance function too, so it has unit gradient and is
// still conservative. Everything the plane field is tested for must hold here.
{
  const q = fromFloor(0.2, -0.1, 0.5);
  ok = true;
  for (let i = 0; i < 2000; i++) {
    const p = fromFloor(rand() * 0.7, rand() * 0.7, Math.random() * 1.2);
    if (dist(p, q) < 0.05) continue;
    const g = radialGrad(p, q);
    if (!close(dot(g, g), 1, 1e-7)) ok = false;      // unit
    if (!close(dot(g, p), 0, 1e-7)) ok = false;      // tangent at p
  }
  check('radial gravity has unit gradient and is tangent', ok);
}

{
  // It points AWAY from the beacon, so gravity (minus it) pulls inward.
  const q = fromFloor(0, 0, 0.4);
  const p = fromFloor(0.8, 0.3, 0.9);
  const M = geodesicFromIdentity(logOf(p), 1);
  const g = radialGrad(p, q);
  const stepped = point(geodesic(M, toFrame(M, g), 0.05));
  check('radial up points away from the beacon', dist(stepped, q) > dist(p, q));
}

{
  // Energy under radial gravity. Same Strang integrator, same invariant: if
  // this drifts, the point field is not a gradient after all.
  setField(FIELD.POINT, fromFloor(0, 0, 0.5));
  ok = true;
  let worst = 0;
  for (let trial = 0; trial < 30; trial++) {
    let M = placeAt(rand() * 0.5, rand() * 0.5, 0.7 + Math.random() * 0.5);
    let v = [rand() * 0.3, rand() * 0.3, rand() * 0.3];
    const e0 = energy(M, v);
    for (let i = 0; i < 400; i++) [M, v] = stepFree(M, v, 1 / 240);
    const drift = Math.abs(energy(M, v) - e0) / (1 + Math.abs(e0));
    worst = Math.max(worst, drift);
    if (drift > 3e-3) ok = false;
  }
  check('energy holds under beacon gravity too', ok,
    `worst relative drift ${worst.toExponential(2)}`);
  setField(FIELD.PLANE);
}

{
  // Dropped from rest near a beacon you fall toward it, not toward the floor.
  setField(FIELD.POINT, fromFloor(0.9, 0, 0.9));
  let M = placeAt(0, 0, 0.9), v = [0, 0, 0];
  const before = dist(point(M), fromFloor(0.9, 0, 0.9));
  for (let i = 0; i < 200; i++) {
    [M, v] = stepFree(M, v, 1 / 240);
    [M, v] = alignUp(M, v);
  }
  const after = dist(point(M), fromFloor(0.9, 0, 0.9));
  check('a beacon pulls you sideways, not down', after < before - 0.05,
    `${before.toFixed(3)} -> ${after.toFixed(3)}, altitude ${height(point(M)).toFixed(3)}`);
  setField(FIELD.PLANE);
}


console.log('\nholonomy: the enclosed area turns your frame');

// Walking a closed loop on a curvature -1 surface rotates a
// parallel-transported frame by the area enclosed (Gauss-Bonnet). sweptArea
// accumulates exactly that, so a full circle of radius r must come out to
// the area of that disc, 2*pi*(cosh r - 1).
//
// Worth stating what does NOT work: alignUp cannot measure this. On the
// floor under plane gravity E3 is already up, so its rotation is the
// identity and carries no information. The first version of this meter read
// zero everywhere for exactly that reason.
{
  ok = true;
  let worstArea = 0;
  for (const r of [0.3, 0.7, 1.0, 1.4]) {
    let sum = 0;
    const n = 3000;
    for (let i = 0; i < n; i++) {
      const t0 = (2 * Math.PI * i) / n, t1 = (2 * Math.PI * (i + 1)) / n;
      sum += sweptArea(fromFloor(r * Math.cos(t0), r * Math.sin(t0), 0),
                       fromFloor(r * Math.cos(t1), r * Math.sin(t1), 0));
    }
    const want = 2 * Math.PI * (Math.cosh(r) - 1);
    worstArea = Math.max(worstArea, Math.abs(sum - want));
    if (Math.abs(sum - want) > 1e-9) ok = false;
  }
  check('a closed loop banks exactly the area it encloses', ok,
    `worst error ${worstArea.toExponential(2)}`);
}

{
  // Wider loops are worth much more, because hyperbolic area is.
  const loop = (r) => {
    let sum = 0; const n = 2000;
    for (let i = 0; i < n; i++) {
      const t0 = (2 * Math.PI * i) / n, t1 = (2 * Math.PI * (i + 1)) / n;
      sum += sweptArea(fromFloor(r * Math.cos(t0), r * Math.sin(t0), 0),
                       fromFloor(r * Math.cos(t1), r * Math.sin(t1), 0));
    }
    return sum;
  };
  const small = loop(0.4), big = loop(1.2);
  check('a wider loop banks far more than a tight one', big / small > 4,
    `radius 0.4 gives ${(small * 57.3).toFixed(0)} deg, radius 1.2 gives ${(big * 57.3).toFixed(0)} deg`);
}

{
  // Walking straight out and straight back banks nothing: no area swept.
  let sum = 0;
  for (let i = 0; i < 200; i++) {
    sum += sweptArea(fromFloor(i * 0.005, 0, 0), fromFloor((i + 1) * 0.005, 0, 0));
  }
  for (let i = 200; i > 0; i--) {
    sum += sweptArea(fromFloor(i * 0.005, 0, 0), fromFloor((i - 1) * 0.005, 0, 0));
  }
  check('walking out and back banks nothing', Math.abs(sum) < 1e-12,
    `${sum.toExponential(2)}`);
}


console.log('\ndoes moving forward curve you upward here too?');

// In the FLOOR world it does: equidistant surfaces are convex toward the
// plane, so horizontal motion is pushed up at v^2*tanh(h).
//
// With a BEACON the level sets are spheres instead, and a geodesic tangent to
// a sphere of radius r curves AWAY from the centre at v^2*coth(r). Same
// phenomenon, opposite dependence: easier to fly the higher you are, easier to
// orbit the further out you are. Both tend to sqrt(G) in the limit.
//
// With NO gravity there is nothing to curve against: motion is a geodesic.
{
  const q = fromFloor(0, 0, 0);
  ok = true;
  let worstErr = 0;
  for (const r of [0.3, 0.6, 1.0, 2.0]) {
    const M = placeAt(r, 0, 0);
    const up = toFrame(M, radialGrad(point(M), q));
    let axis = 0, small = 2;
    for (let i = 0; i < 3; i++) if (Math.abs(up[i]) < small) { small = Math.abs(up[i]); axis = i; }
    let t = [0, 0, 0]; t[axis] = 1;
    const d = t[0] * up[0] + t[1] * up[1] + t[2] * up[2];
    t = [t[0] - d * up[0], t[1] - d * up[1], t[2] - d * up[2]];
    const n = Math.hypot(...t); t = t.map((x) => x / n);
    const v0 = 1.0, dt = 1e-3;
    const [M2] = flow(M, t.map((x) => x * v0), dt);
    const got = (dist(point(M2), q) - r) / (0.5 * dt * dt);
    const want = (v0 * v0) / Math.tanh(r);
    worstErr = Math.max(worstErr, Math.abs(got - want));
    if (Math.abs(got - want) > 1e-3) ok = false;
  }
  check('beacon gravity: tangential motion pushes out at v^2*coth(r)', ok,
    `worst error ${worstErr.toExponential(2)}`);
}

{
  // So the circular-orbit speed is sqrt(G*tanh(r)) rather than the floor
  // world's sqrt(G/tanh(h)).
  const vOrb = (r) => Math.sqrt(G * Math.tanh(r));
  check('orbit speed rises with distance, and tends to sqrt(G)',
    vOrb(0.3) < vOrb(2.0) && Math.abs(vOrb(8) - Math.sqrt(G)) < 1e-6,
    `r=0.3 -> ${vOrb(0.3).toFixed(3)}, r=2 -> ${vOrb(2).toFixed(3)}, limit ${Math.sqrt(G).toFixed(3)}`);
}

{
  // Free flight: no gravity means geodesic motion, so speed is constant and
  // there is no parabola at all.
  let M = placeAt(0.5, 0, 0), v = [0, 1.0, 0];
  const s0 = Math.hypot(...v);
  let steady = true;
  for (let i = 0; i < 500; i++) {
    const [M2, v2] = flow(M, v, 1 / 500);
    if (Math.abs(Math.hypot(...v2) - s0) > 1e-12) steady = false;
    M = M2; v = v2;
  }
  check('with no gravity motion is a geodesic: no curve at all', steady);
}


// A beacon must follow the ONE lift it was planted at, carried by the group
// element the player was folded by. Snapping to the nearest lift instead is
// what made gravity flip and the camera lurch when crossing a face.
{
  // Free flight with a beacon planted: gravity is off so the player actually
  // travels and crosses faces, while altitude still reports the distance to
  // the beacon lift, which is the quantity that used to jump.
  // In the DODECAHEDRAL world, because the octagon is a vertical prism: it is
  // infinite up and down, so a player drifting upward never crosses a face and
  // the test would prove nothing.
  setSolid(SOLID.DODECAHEDRON);
  setField(FIELD.POINT, fromFloor(0.3, 0.2, 0.4));
  setGravityScale(0);
  let M = placeAt(0, 0, 0.3);
  const before = altitude(point(M));
  ok = true;
  let worstJump = 0, folds = 0;
  let v = [1.2, 0.5, 0.1];
  let prev = before;
  for (let i = 0; i < 2400; i++) {
    [M, v] = stepFree(M, v, 1 / 240);
    const [F, g, n] = reduceToDomain(M);
    if (n !== 0) { M = F; carryBeacon(g); folds += n; }
    const a = altitude(point(M));
    // Altitude is distance to the beacon; it can change as you move, but it
    // must never JUMP, which is exactly what snapping to another lift does.
    worstJump = Math.max(worstJump, Math.abs(a - prev));
    prev = a;
  }
  check('a beacon does not jump lifts when the player crosses a face',
    folds > 0 && worstJump < 0.05,
    `${folds} folds, worst altitude jump ${worstJump.toExponential(2)}`);
  setField(FIELD.PLANE);
  setGravityScale(1);
  setSolid(SOLID.OCTAGON);
  void before;
}

console.log('');
console.log('portals');

{
  // A portal pair is two discs and one isometry, and that isometry is the same
  // kind of object as a face pairing of the fundamental domain - the faces are
  // already portals, glued by the group. So these are the same checks the
  // group gets: is it an isometry, does it land you where it should, and does
  // it leave your speed alone.
  const M = placeAt(0, 0, 0.5);
  const A = placePortal(0, M, [1, 0, 0], levelSDF);
  const B = placePortal(1, M, [0, 1, 0], levelSDF);
  const T = portalMap(A, B);

  check('a portal placement is a real placement',
    close(dot(point(A), point(A)), -1, 1e-9) && close(dot(point(B), point(B)), -1, 1e-9));

  let worst = 0;
  for (let i = 0; i < 400; i++) {
    const p = fromFloor(rand(), rand(), rand());
    const q = fromFloor(rand(), rand(), rand());
    worst = Math.max(worst, Math.abs(dist(apply(T, p), apply(T, q)) - dist(p, q)));
  }
  check('the portal map is an isometry', worst < 1e-9, `worst ${worst.toExponential(2)}`);

  // Entering A's front must come out of B's FRONT, moving away from it. Both
  // halves matter: the wrong rotation lands you facing into B's back, and
  // nothing downstream can fix that.
  const eps = 0.05;
  const inFront = apply(A, [Math.sinh(eps), 0, 0, Math.cosh(eps)]);
  const nB = [B[0], B[1], B[2], B[3]];
  check('a point in front of A maps behind B, which is what glues them',
    dot(apply(T, inFront), nB) < 0);
  const heading = apply(T, fromFrame(A, [-1, 0, 0]));   // straight into A
  check('and a ray into A comes out of B moving away from it',
    dot(heading, nB) > 0.999);

  // Now the thing the player actually does: walk into it. Gravity off, or the
  // walker drops below the disc before it gets there - what is under test is
  // the portal, not the fall.
  setGravityScale(0);
  let P = placeAt(0, 0, 0.5), v = [1.2, 0, 0];
  let went = false;
  for (let i = 0; i < 500 && !went; i++) {
    const from = point(P);
    const [P2, v2] = stepFree(P, v, 1 / 240);
    P = P2; v = v2;
    const Tc = portalCrossing(from, point(P));
    if (Tc) { P = reorthonormalize(matMul(Tc, P)); went = true; }
  }
  check('walking into a portal takes you through it', went);
  check('and you come out at the far disc',
    went && dist(point(P), point(B)) < PORTAL_R + 0.15,
    `${dist(point(P), point(B)).toFixed(3)} from B`);
  check('and you keep the speed you arrived with',
    close(Math.hypot(v[0], v[1], v[2]), 1.2, 1e-6));

  // Only one way, and that is forced rather than chosen: crossing A front to
  // back puts you BEHIND B moving out of it, so you immediately cross B back
  // to front. If that counted too you would bounce straight back.
  const behind = apply(A, [-Math.sinh(eps), 0, 0, Math.cosh(eps)]);
  check('a portal is one-sided, and has to be', portalCrossing(behind, inFront) === null);

  const off = Math.asinh(Math.sinh(PORTAL_R) * 2);
  const wideIn = apply(A, [Math.sinh(eps), 0, Math.sinh(off), Math.cosh(off)]);
  const wideOut = apply(A, [-Math.sinh(eps), 0, Math.sinh(off), Math.cosh(off)]);
  check('and missing the opening does not teleport you',
    portalCrossing(wideIn, wideOut) === null);

  setGravityScale(1);
  clearPortals();
  check('clearing leaves no portal live', !portalsLive());
}

console.log('');
console.log('carried objects stay in numerical range');

{
  // The purple-screen bug, as a test. Fly away in the open world with beacon
  // gravity: the beacon is carried by every fold, its coordinates grow like
  // cosh(distance), and once they pass about 1e7 folding it back into the
  // domain loses every digit. The shader then reads a nonsense point, the
  // 32-bit distance to it cancels to zero everywhere, and every pixel comes
  // out as the beacon's colour.
  // Free flight is the case that breaks, and it is the ordinary one: the open
  // world FORCES gravity to none, so a beacon planted for the marker is
  // carried by every fold with nothing pulling the player back toward it.
  // Beacon gravity itself is safe - a linear potential confines you, so the
  // distance never grows - but flying straight does not stop.
  setSolid(SOLID.DODECAHEDRON);
  setMode(MODE.OPEN);
  setField(FIELD.POINT, point(placeAt(0.3, 0.2, 0.1)));
  setGravityScale(0);

  let M = placeAt(0, 0, 0), v = [0.9, 0.25, 0.12];   // just walking pace
  let worstCoord = 0, worstFold = 0, folds = 0;
  for (let i = 0; i < 40000; i++) {
    [M, v] = stepFree(M, v, 1 / 240);
    const [F, g, n] = reduceToDomain(M);
    if (n !== 0) { M = F; carryBeacon(g); folds += n; }
    settleCarried(point(M));
    const b = activeBeacon();
    worstCoord = Math.max(worstCoord, Math.max(...b.map(Math.abs)));
    const fb = foldPoint(b);
    worstFold = Math.max(worstFold, Math.abs(dot(fb, fb) + 1));
  }
  check('flying away does not blow the beacon out of range',
    worstCoord < 1e4, `crossed ${folds} faces, worst coordinate ${worstCoord.toExponential(2)}`);
  check('and the folded beacon stays on the hyperboloid',
    worstFold < 1e-6, `worst <p,p>+1 = ${worstFold.toExponential(2)}`);

  setField(FIELD.PLANE);
  setGravityScale(1);
  setSolid(SOLID.OCTAGON);
  setMode(MODE.BOUNDED);
}

{
  // Nothing at the spawn, in either world. A camera inside geometry makes
  // every ray hit at t = 0 and fills the screen with one flat colour, which
  // looks exactly like a shader that failed to compile. Both spawns have been
  // blocked at some point: the open world by a spoke through the hub, the
  // bounded world by the orb directly overhead, 0.01 away.
  const clearAt = (M) => levelSDF(point(M));
  check('the bounded spawn is clear of the level',
    clearAt(placeAt(0, 0, 0.6)) > PLAYER_R,
    `${clearAt(placeAt(0, 0, 0.6)).toFixed(3)} of clearance`);

  setSolid(SOLID.DODECAHEDRON);
  setMode(MODE.OPEN);
  check('and so is the open one',
    clearAt(placeAt(0, 0, 0)) > PLAYER_R,
    `${clearAt(placeAt(0, 0, 0)).toFixed(3)} of clearance`);
  setSolid(SOLID.OCTAGON);
  setMode(MODE.BOUNDED);
}

console.log('');
console.log('the camera across a face');

{
  // Why the open world cannot re-pin to gravity, stated as a fact rather than
  // as a story: plane height is invariant under the octagon generators and is
  // NOT invariant under the dodecahedral ones. That is the entire reason plane
  // gravity belongs to the bounded world.
  const drift = (gens) => {
    let worst = 0;
    for (let i = 0; i < 200; i++) {
      const p = fromFloor(rand(), rand(), rand());
      for (const g of gens) worst = Math.max(worst, Math.abs(height(apply(g, p)) - height(p)));
    }
    return worst;
  };
  setSolid(SOLID.OCTAGON);
  check('plane height survives the octagon group', drift(OCT_GEN) < 1e-12);
  setSolid(SOLID.DODECAHEDRON);
  const d = drift(generators());
  check('and does NOT survive the dodecahedral one', d > 0.1,
    `moves altitude by up to ${d.toFixed(3)}`);

  // So with the frame pinned to it, crossing a face swings the view. This is
  // the jerk, measured: a single substep turning the camera by a third of a
  // revolution. With the pinning skipped the frame is only ever
  // parallel-transported and the view is exactly continuous.
  setMode(MODE.OPEN);
  setField(FIELD.PLANE);
  setGravityScale(0);
  const swing = (repin) => {
    let M = placeAt(0, 0, 0), v = [0.9, 0.3, 0.15], worst = 0, folds = 0;
    for (let i = 0; i < 24000; i++) {
      const before = fromFrame(M, [1, 0, 0]);
      [M, v] = stepFree(M, v, 1 / 240);
      if (repin) [M, v] = alignUp(M, v);
      const [F, g, n] = reduceToDomain(M);
      if (n !== 0) { M = F; folds += n; }
      const carried = n !== 0 ? apply(g, before) : before;
      const c = Math.max(-1, Math.min(1, dot(carried, fromFrame(M, [1, 0, 0]))));
      worst = Math.max(worst, Math.acos(c));
    }
    return [worst * 57.2958, folds];
  };
  const [pinned, folds] = swing(true);
  const [free] = swing(false);
  check('pinning to plane gravity here would jerk the view',
    pinned > 45, `${pinned.toFixed(1)} degrees in one substep, over ${folds} crossings`);
  check('leaving the frame alone keeps it continuous across every face',
    free < 1e-9, `${free.toExponential(2)} degrees`);

  setField(FIELD.PLANE);
  setGravityScale(1);
  setSolid(SOLID.OCTAGON);
  setMode(MODE.BOUNDED);
}

console.log('');
console.log('the boomerang');

{
  setSolid(SOLID.DODECAHEDRON);
  setMode(MODE.OPEN);
  const M = placeAt(0, 0, 0);
  const b = launchBoomerang(M, [0, 0, 1]);
  const start = boomerangStep(0);
  check('it launches onto a closed geodesic',
    Math.abs(b.length - closedGeodesicLength()) < 1e-12);

  // Fly it a whole lap in small steps and see where it ends up. The residual
  // is a time step, not geometry: the step lands past the closing point, not
  // short of it. Stop one step BEFORE the catch, or there is nothing to ask.
  let q = start;
  for (let i = 0; i < 40000 && b.laps < 1; i++) {
    const next = boomerangStep(1 / 2400);
    if (!next) break;                       // caught; q is the last live point
    q = next;
  }
  // Compare FOLDED positions. A lap returns it to the same point of the
  // MANIFOLD, which in the covering space is one translation length away -
  // reading raw coordinates here reports the lap length as the error.
  check('one lap brings it back to where it was thrown',
    dist(foldPoint(q), foldPoint(start)) < 0.01,
    `${dist(foldPoint(q), foldPoint(start)).toExponential(2)} away after ${b.laps} lap`);

  // A lap ends the outward leg. It is NOT caught there any more: it comes back
  // to where the player is NOW, which after a lap of flight is not where they
  // threw it from. With no player handed in there is nothing to steer at, and
  // it simply keeps flying the closed geodesic - which is what the drift check
  // below needs.
  check('one lap ends the outward leg', activeBoomerang() && !activeBoomerang().out);
  {
    // Hand it a player, a good way off the launch point, and it steers there.
    const away = point(placeAt(0.35, 0.1, 0.2));
    let caught = false;
    for (let i = 0; i < 20000; i++) {
      if (!boomerangStep(1 / 240, null, away)) { caught = true; break; }
    }
    check('and then it chases the player to where they are NOW', caught);
  }
  // The numbers do not grow with the laps either. Arclength is held in
  // [0, L) and the launch placement never changes, so composing a boost of
  // length L - which would multiply any error by e^L = 7.4 a lap - never
  // happens. Checked by flying a fresh one for forty laps' worth of time.
  const b2 = launchBoomerang(M, [0, 0, 1]);
  b2.laps = -40;                            // let it run, just for this check
  b2.age = -1e6;                            // and outlive BOOM_LIFE with it
  let far = boomerangStep(0);
  for (let i = 0; i < 400000 && b2.laps < 0; i++) far = boomerangStep(1 / 2400) || far;
  check('and forty laps of flight do not make it drift',
    dist(foldPoint(far), foldPoint(start)) < 0.02,
    `${dist(foldPoint(far), foldPoint(start)).toExponential(2)} away`);

  clearBoomerang();
  check('and it can be cleared', activeBoomerang() === null);
  setSolid(SOLID.OCTAGON);
  setMode(MODE.BOUNDED);
}

console.log('');
console.log('rolling locomotion');

{
  // The alternative movement model, kept alongside walking so the two can be
  // compared. What makes it rolling rather than a differently tuned walk is
  // the contact constraint: the ball's SURFACE speed has to match the speed of
  // its centre, or it is sliding, not rolling.
  const floor = (p) => height(p);
  const drive = (holdFor, total, want) => {
    let M = placeAt(0, 0, PLAYER_R), v = [0, 0, 0], spin = [0, 0, 0], slip = false;
    const dt = 1 / 240;
    let worstSlip = 0, everSlipped = false;
    for (let i = 0; i < 240 * total; i++) {
      const w = i < 240 * holdFor ? want : [0, 0, 0];
      [v, spin, slip] = rollControl(M, v, spin, w, true, dt);
      [M, v] = stepFree(M, v, dt);
      const c = collide(M, v, floor); M = c[0]; v = c[1];
      const [M2, v2, Ri] = alignUp(M, v);
      M = M2; v = v2; spin = carryFrameVec(Ri, spin);
      if (i > 240) worstSlip = Math.max(worstSlip, Math.abs(Math.hypot(v[0], v[1]) - rollSpeed(spin)));
      if (slip) everSlipped = true;
    }
    return { speed: Math.hypot(v[0], v[1]), surface: rollSpeed(spin), worstSlip, everSlipped };
  };

  const held = drive(4, 4, [WALK_SPEED, 0, 0]);
  check('a torque spins the ball up and it moves',
    held.speed > 1.0, `reaches ${held.speed.toFixed(3)}`);
  check('and it rolls rather than slides',
    held.worstSlip < 0.02,
    `surface and centre differ by at most ${held.worstSlip.toFixed(4)}`);
  check('and it respects a top speed',
    held.speed < ROLL_TOP + 0.02, `${held.speed.toFixed(3)} against ${ROLL_TOP}`);
  check('  which stays under the speed the geometry starts flying you at',
    ROLL_TOP < FLY_SPEED, `${ROLL_TOP} vs sqrt(G) = ${FLY_SPEED.toFixed(3)}`);

  // Momentum is the whole point: letting go does not stop you.
  const coast = drive(3, 6, [WALK_SPEED, 0, 0]);
  check('letting go does not stop you dead',
    coast.speed > 0.3 && coast.speed < held.speed,
    `still ${coast.speed.toFixed(3)} three seconds after release`);

  // Walking, for contrast: the same input, released, stops almost at once.
  {
    let M = placeAt(0, 0, PLAYER_R), v = [0, 0, 0];
    const dt = 1 / 240;
    for (let i = 0; i < 240 * 6; i++) {
      v = control(v, i < 240 * 3 ? [WALK_SPEED, 0, 0] : [0, 0, 0], true, dt);
      [M, v] = stepFree(M, v, dt);
      const c = collide(M, v, floor); M = c[0]; v = c[1];
      [M, v] = alignUp(M, v);
    }
    check('  where walking stops almost immediately',
      Math.hypot(v[0], v[1]) < 0.01, `${Math.hypot(v[0], v[1]).toExponential(2)}`);
  }

  // Ask for more grip than the contact can give and it slips instead.
  {
    let M = placeAt(0, 0, PLAYER_R), v = [2.2, 0, 0], spin = [0, 0, 0], slip = false;
    [v, spin, slip] = rollControl(M, v, spin, [0, 0, 0], true, 1 / 240);
    check('a ball dropped moving with no spin slips before it grips', slip);
  }
}

console.log('');
console.log('two characters, health and hits');

{
  // The prerequisite for anything multiplayer: a second character that lives
  // by the same rules, and a hit test that agrees with what you can see.

  // A hit test has to measure distance in the MANIFOLD. Two names for the same
  // character - one folded, one a cell away - must read as the same thing, or
  // the boomerang misses what it visibly struck.
  const a = point(placeAt(0, 0, PLAYER_R));
  const b = apply(OCT_PAIR[0], a);
  check('the orbit distance sees through a face',
    dist(a, b) > 2.5 && orbitDist(a, b) < 1e-9,
    `coordinates say ${dist(a, b).toFixed(2)}, the manifold says ${orbitDist(a, b).toExponential(1)}`);

  // ...and it must not make far things near. Two genuinely separate points
  // stay separate.
  const c = point(placeAt(0.8, 0, PLAYER_R));
  check('and does not pull unrelated points together',
    Math.abs(orbitDist(a, c) - dist(a, c)) < 1e-9);

  const foe = makeCharacter(placeAt(0.5, 0, PLAYER_R), 1);
  check('a character starts at full health', foe.health === MAX_HEALTH);

  check('damage lands', damage(foe, BOOM_DAMAGE) === true
    && foe.health === MAX_HEALTH - BOOM_DAMAGE);
  // Without a cooldown a single boomerang pass registers on every substep it
  // overlaps and deletes a character in a frame.
  check('and a second hit in the same instant does not',
    damage(foe, BOOM_DAMAGE) === false && foe.health === MAX_HEALTH - BOOM_DAMAGE);
  stepCharacter(foe, HIT_COOLDOWN + 1e-6);
  check('but it can be hit again once the cooldown passes',
    damage(foe, BOOM_DAMAGE) === true && foe.health === MAX_HEALTH - 2 * BOOM_DAMAGE);

  // The boomerang connects with something standing on its geodesic, exactly
  // once per pass, and stops mattering when the target is down.
  setSolid(SOLID.OCTAGON);
  setMode(MODE.BOUNDED);
  clearBoomerang();
  const dir = closedGeodesicDirs()[0];
  const target = makeCharacter(geodesic(IDENTITY, dir, 0.8), 2);
  const thrower = placeAt(0, 0, PLAYER_R);
  launchBoomerang(thrower, dir);
  let hits = 0, guard = 0;
  while (activeBoomerang() && guard++ < 100000) {
    // The thrower's CURRENT position, which is what it comes back to now.
    boomerangStep(1 / 480, null, point(thrower));
    stepCharacter(target, 1 / 480);
    if (boomerangHits([target], 0)) hits++;
  }
  check('the boomerang hits a character on its path, once per pass',
    hits === 1 && target.health === MAX_HEALTH - BOOM_DAMAGE,
    `${hits} hit(s), health ${target.health}`);
  check('and it is caught rather than flying for ever', activeBoomerang() === null);

  // Your own throw must not hit you on the way out.
  clearBoomerang();
  const me = makeCharacter(placeAt(0, 0, PLAYER_R), 0);
  launchBoomerang(me.M, dir);
  let selfHits = 0;
  guard = 0;
  while (activeBoomerang() && guard++ < 100000) {
    boomerangStep(1 / 480);
    stepCharacter(me, 1 / 480);
    if (boomerangHits([me], 0)) selfHits++;
  }
  check('and it never hits the character that threw it',
    selfHits === 0 && me.health === MAX_HEALTH);
  clearBoomerang();
}


console.log('');
console.log('aimed throws, bumping and building');

{
  // An AIMED throw goes where you look. The closed-geodesic mode cannot: in
  // the bounded world every closed geodesic lies in the floor plane, so it
  // skimmed the ground however you aimed - which reads as gravity pulling it
  // down. Nothing pulls it down; it follows a geodesic and gravity is not in
  // its integrator at all.
  setSolid(SOLID.OCTAGON);
  setMode(MODE.BOUNDED);
  clearBoomerang();
  const M = placeAt(0, 0, 0.6);
  const up40 = [Math.cos(0.7), 0, Math.sin(0.7)];
  launchAimed(M, up40);
  let hi = -9, lo = 9, far = 0, t = 0, guard = 0;
  for (;;) {
    const q = boomerangStep(1 / 240, null, point(M));
    t += 1 / 240;
    if (!q || guard++ > 100000) break;
    hi = Math.max(hi, height(q));
    lo = Math.min(lo, height(q));
    far = Math.max(far, dist(q, point(M)));
  }
  check('an aimed throw climbs when you aim up', hi > 2.0,
    `reached altitude ${hi.toFixed(2)} from 0.60`);
  check('and never dips below where it was thrown from', lo > 0.6 - 1e-6,
    `lowest altitude ${lo.toFixed(3)}`);
  check('it reaches its range and returns to the hand',
    Math.abs(far - BOOM_RANGE) < 0.03 && activeBoomerang() === null,
    `furthest ${far.toFixed(2)}, round trip ${t.toFixed(2)}s`);

  // Two bodies cannot share a place, and the test is on the ORBIT so it holds
  // when they are named a cell apart.
  let A = placeAt(0, 0, PLAYER_R), B = placeAt(0.05, 0, PLAYER_R);
  let va = [0.5, 0, 0], vb = [-0.5, 0, 0];
  for (let i = 0; i < 60; i++) {
    const r = bump(A, va, B, vb);
    if (!r) break;
    [A, va, B, vb] = r;
  }
  check('two bodies get pushed apart until they just touch',
    Math.abs(orbitDist(point(A), point(B)) - 2 * PLAYER_R) < 1e-3,
    `gap ${orbitDist(point(A), point(B)).toFixed(4)}`);
  check('and the push reaches through a face',
    bump(placeAt(0, 0, PLAYER_R), [0, 0, 0],
         reorthonormalize(matMul(OCT_PAIR[0], placeAt(0.05, 0, PLAYER_R))),
         [0, 0, 0]) !== null);
  {
    const p = point(placeAt(0, 0, PLAYER_R));
    check('nearestLift returns the copy you can actually see',
      dist(p, nearestLift(p, apply(OCT_PAIR[0], p))) < 1e-9);
  }

  // A block is not solid until it has formed. The delay is the design: an
  // instant wall is a panic button; one that takes three quarters of a second
  // is a prediction the other player can read and beat.
  clearBlock();
  const p0 = placeAt(0, 0, PLAYER_R);
  placeBlock(p0, [1, 0, 0], levelSDF);
  check('a fresh block is not solid yet',
    !blockSolid() && blockSDF(point(p0)) > 1e8);
  blockStep(BLOCK_DELAY + 0.01);
  check('and turns solid after the delay', blockSolid());
  const atBlock = blockSDF(point(p0));
  check('once solid it has a real distance field',
    atBlock < 1e8 && atBlock > 0, `${atBlock.toFixed(3)} from the player`);
  check('and it is placed clear of the player who built it',
    atBlock > PLAYER_R, `${atBlock.toFixed(3)} vs body ${PLAYER_R}`);
  clearBlock();
  check('and it can be cleared', blockSDF(point(p0)) > 1e8);
}


console.log('');
console.log('the boomerang bounces, and comes back to where you are NOW');

{
  setSolid(SOLID.OCTAGON);
  setMode(MODE.BOUNDED);
  clearBoomerang();
  clearBlock();

  // A wall to throw it at: a solid ball sitting in the flight path. Nothing in
  // the boomerang's integrator knows what it is - it asks the sdf whether it is
  // inside something and reflects off the gradient if it is.
  const wallAt = point(placeAt(1.2, 0, 0.3));
  const ball = (p) => dist(p, wallAt) - 0.30;

  const M = placeAt(0, 0, 0.3);
  launchAimed(M, [1, 0, 0]);
  let bounced = false, far = 0;
  for (let i = 0; i < 4000; i++) {
    const q = boomerangStep(1 / 240, ball, point(M));
    if (!q) break;
    far = Math.max(far, dist(q, point(M)));
    if (activeBoomerang().bounces > 0) { bounced = true; break; }
  }
  check('a throw into a surface rebounds off it', bounced,
    `after ${far.toFixed(2)} of flight`);
  check('and the rebound turns it round rather than stopping it',
    activeBoomerang() && Math.hypot(...activeBoomerang().dir) > 0.99,
    `dir ${activeBoomerang().dir.map((x) => x.toFixed(2)).join(', ')}`);
  // Carry on and it still gets home, which is the point of bouncing rather
  // than dying: a shot round a pillar is still your boomerang.
  let home = false;
  for (let i = 0; i < 6000; i++) {
    if (!boomerangStep(1 / 240, ball, point(M))) { home = true; break; }
  }
  check('and a bounced throw still finds its way back', home);

  // A throw must not bounce off the ground as it LEAVES YOUR HAND, and it very
  // nearly does. The launch point is the player's centre, and collide only
  // guarantees that centre is PLAYER_R (0.07) clear of anything - so testing
  // the rebound against the drawn radius (0.09) makes every throw aimed even
  // slightly downward skip off the floor on its first substep. BOOM_SKIN is
  // under PLAYER_R for exactly this reason.
  {
    const stand = placeAt(0, 0, PLAYER_R);
    const shallow = [];
    for (const ang of [0, -0.05, -0.10, -0.17]) {
      clearBoomerang();
      launchAimed(stand, [Math.cos(ang), 0, Math.sin(ang)]);
      boomerangStep(0.05, levelSDF, point(stand));
      shallow.push(activeBoomerang() ? activeBoomerang().bounces : -1);
    }
    check('a throw does not skip off the floor as it leaves your hand',
      shallow.every((n) => n === 0), `bounces by aim: ${shallow.join(', ')}`);
    // But aimed properly down at the ground it does, because that is a throw
    // into the ground and it should skip.
    clearBoomerang();
    launchAimed(stand, [Math.cos(-0.6), 0, Math.sin(-0.6)]);
    boomerangStep(0.1, levelSDF, point(stand));
    check('but one aimed down at the floor still skips off it',
      activeBoomerang() && activeBoomerang().bounces > 0);
    clearBoomerang();
  }

  // It comes back to where the player IS, not to where they threw it from.
  // Throw, walk away while it flies, and it should end up at the new place.
  clearBoomerang();
  const from = placeAt(0, 0, 0.3);
  launchAimed(from, [1, 0, 0]);
  let walker = from;
  let last = null;
  for (let i = 0; i < 6000; i++) {
    // Stroll off sideways at walking pace while it is on its way out, then
    // stand still and let it find you. Only while it is out, because a target
    // that never stops walking leaves the range where coordinates of size
    // cosh(distance) still have digits in them - a fact about the model, not
    // about the boomerang.
    if (activeBoomerang() && activeBoomerang().out) {
      walker = geodesic(walker, [0, 1, 0], WALK_SPEED / 240);
    }
    const q = boomerangStep(1 / 240, null, point(walker));
    if (!q) break;
    last = q;
  }
  const toNew = orbitDist(last, point(walker));
  const toOld = orbitDist(last, point(from));
  check('it returns to where the player has MOVED to, not the throw point',
    toNew < 0.2 && toOld > 0.6,
    `${toNew.toFixed(2)} from them, ${toOld.toFixed(2)} from where they threw it`);
  clearBoomerang();
}

console.log('');
console.log('five abilities');

{
  setSolid(SOLID.OCTAGON);
  setMode(MODE.BOUNDED);

  // --- the decoy -------------------------------------------------------
  //
  // A path, played back on a loop. What matters is that it is a path of the
  // UNIVERSAL COVER and gets carried through a fold by the same element the
  // player was folded by - the same rule the anchor and the beacon obey.
  clearDecoy();
  const path = [];
  for (let i = 0; i < 12; i++) path.push(point(placeAt(i * 0.05, 0, 0.3)));
  plantDecoy(path, 0.2);
  const d0 = decoyStep(0);
  check('a decoy starts at the oldest end of the recording',
    dist(d0, path[0]) < 1e-9);
  decoyStep(0.5);
  const d1 = decoyPoint();
  check('and walks the path you walked',
    dist(d1, path[0]) > 0.05 && dist(d1, path[11]) > 0.05,
    `${dist(d1, path[0]).toFixed(3)} along`);
  // Round the loop and back to the start, because a decoy has to outlast the
  // few seconds it was recorded from.
  decoyStep((path.length - 1) * 0.2);
  check('and loops rather than stopping at the end',
    dist(decoyPoint(), d1) < 1e-6);
  {
    const before = decoyPoint();
    carryDecoy(OCT_PAIR[0]);
    check('a fold carries the whole decoy by that element',
      dist(apply(OCT_PAIR[0], before), decoyPoint()) < 1e-9);
  }
  decoyStep(DECOY_LIFE + 0.01);
  check('and it expires', decoyPoint() === null);

  // --- recall ----------------------------------------------------------
  //
  // Newest first, so index 15 at 0.2s a sample is three seconds ago.
  {
    const trail = [];
    for (let i = 0; i < 32; i++) trail.push(point(placeAt(-i * 0.06, 0, 0.3)));
    const open = () => 1;                          // nothing in the way
    const t = recallTarget(trail, open, 0.2, 3.0);
    check('recall picks the point you held three seconds ago',
      dist(t, trail[15]) < 1e-9);
    // Blocked, so it walks back down the trail to the first clear one.
    const blocked = (p) => (dist(p, trail[15]) < 0.3 ? -1 : 1);
    const t2 = recallTarget(trail, blocked, 0.2, 3.0);
    check('and skips a destination something is now standing in',
      t2 !== null && dist(t2, trail[15]) > 0.2);
    check('and gives up rather than dropping you inside a wall',
      recallTarget(trail, () => -1, 0.2, 3.0) === null);
    // Arriving keeps the frame: parallel transport, so the velocity's frame
    // components still mean what they meant and nothing has to be re-aimed.
    const M = placeAt(0, 0, 0.3);
    const M2 = warpTo(M, trail[15]);
    check('warping there moves you and nothing else',
      dist(point(M2), trail[15]) < 1e-9
      && Math.abs(dot(frameVec(M2, 0), frameVec(M2, 0)) - 1) < 1e-9);
  }

  // --- the sightline cutter --------------------------------------------
  //
  // A disc of totally geodesic plane. Its distance field is exact - asinh of
  // one inner product - which is the same formula the floor uses.
  clearCut();
  {
    const M = placeAt(0, 0, 0.5);
    placeCut(M, [1, 0, 0], () => 1e9);
    const c = activeCut();
    check('a pane is a unit spacelike plane through its own centre',
      Math.abs(dot(c.N, c.N) - 1) < 1e-9 && Math.abs(dot(c.at, c.N)) < 1e-9,
      `<N,N> = ${dot(c.N, c.N).toFixed(12)}, <at,N> = ${dot(c.at, c.N).toExponential(1)}`);
    check('you are on the outside of the one you just placed',
      cutSDF(point(M)) > PLAYER_R,
      `${cutSDF(point(M)).toFixed(3)} away`);
    // It blocks the lane. A point beyond it, straight ahead, is inside.
    check('and it is solid across the line you were looking down',
      cutSDF(c.at) < 0);
    // Off to the side, past the rim, it is not.
    check('but only across the disc, not the whole plane',
      cutSDF(point(geodesic(warpTo(IDENTITY, c.at), [0, 1, 0], CUT_R + 0.3))) > 0);
    {
      const before = cutSDF(point(M));
      carryCut(OCT_PAIR[0]);
      check('a fold carries the pane and its normal together',
        Math.abs(cutSDF(apply(OCT_PAIR[0], point(M))) - before) < 1e-9);
    }
    cutStep(CUT_LIFE + 0.01);
    check('and it expires', activeCut() === null && cutSDF(point(M)) > 1e8);
  }

  // --- holonomy, as a blast --------------------------------------------
  //
  // The bank is SIGNED - sweptArea integrates (cosh(r) - 1) dtheta - so which
  // way you went round something is which ability you have charged.
  {
    const a = point(placeAt(0.3, 0, 0.3));
    const b = point(placeAt(-0.3, 0, 0.3));
    const cw = sweptArea(a, b);
    const ccw = sweptArea(b, a);
    check('going round one way banks the opposite sign to the other',
      cw * ccw < 0, `${cw.toFixed(3)} against ${ccw.toFixed(3)}`);
    // And a wider loop is worth enormously more, which is the whole reason
    // this is interesting in curvature -1 and worthless in a flat world.
    const wide = Math.abs(sweptArea(point(placeAt(1.2, 0, 0.3)),
                                    point(placeAt(0, 1.2, 0.3))));
    const tight = Math.abs(sweptArea(point(placeAt(0.2, 0, 0.3)),
                                     point(placeAt(0, 0.2, 0.3))));
    check('and circling wide is worth far more than circling tight',
      wide > tight * 8, `${wide.toFixed(3)} against ${tight.toFixed(3)}`);

    // Radius is the wrong measure of how much bigger a charged blast is.
    // Volume grows like e^(2r) here, so going from 0.68 out to 1.60 does not
    // reach two and a third times as much space, it reaches about six times as
    // much - which is why the charge is worth building, and why the same
    // ability in a flat world would be a fifth as interesting.
    const rSmall = blastRadius(0.5), rBig = blastRadius(4);
    const volRatio = Math.exp(2 * rBig) / Math.exp(2 * rSmall);
    check('a bigger charge reaches far more space than its radius suggests',
      rBig / rSmall < 2.5 && volRatio > 5,
      `radius ${rSmall.toFixed(2)} to ${rBig.toFixed(2)} is `
      + `${(rBig / rSmall).toFixed(1)}x, but ${volRatio.toFixed(1)}x the volume`);

    const victim = makeCharacter(placeAt(0.25, 0, PLAYER_R), 1);
    const hits = holoBlast(point(placeAt(0, 0, PLAYER_R)), 4, [victim], 0);
    check('a blast damages what is inside it', hits.length === 1 && victim.health < MAX_HEALTH,
      `health ${victim.health}`);
    check('and shoves it away rather than only hurting it',
      Math.hypot(...victim.vel) > 0.5, `speed ${Math.hypot(...victim.vel).toFixed(2)}`);
    // Outside an UNCHARGED blast, which here is the only way to be far away:
    // this world's covering radius is under two, so on the orbit there is
    // nowhere further than that from anywhere else, and a fully charged blast
    // at 1.60 very nearly covers the whole cell. That is a fact about a
    // compact manifold rather than a generous number - there is no standing
    // off at range in a room that comes back round to itself.
    const far = makeCharacter(placeAt(1.0, 0, PLAYER_R), 2);
    const gap = orbitDist(point(placeAt(1.0, 0, PLAYER_R)), point(placeAt(0, 0, PLAYER_R)));
    check('and does not reach what is outside it',
      holoBlast(point(placeAt(0, 0, PLAYER_R)), 0.5, [far], 0).length === 0,
      `target ${gap.toFixed(2)} away, blast reaches ${blastRadius(0.5).toFixed(2)}`);
    // On the ORBIT, like every other interaction between characters: a target
    // named a cell away is still standing right next to you.
    const across = makeCharacter(reorthonormalize(
      matMul(OCT_PAIR[0], placeAt(0.25, 0, PLAYER_R))), 3);
    check('and it reaches through a face, because the orbit is what you see',
      holoBlast(point(placeAt(0, 0, PLAYER_R)), 4, [across], 0).length === 1);
    check('but never the person who set it off',
      holoBlast(point(placeAt(0, 0, PLAYER_R)), 4,
        [makeCharacter(placeAt(0, 0, PLAYER_R), 0)], 0).length === 0);
  }

  // --- the anchor swap --------------------------------------------------
  {
    const M = placeAt(0, 0, 0.4);
    const anchor = point(placeAt(1.1, 0, 0.4));
    const rope = grappleAttach(anchor, dist(point(M), anchor));
    const before = point(M);
    const r = anchorSwap(rope, M);
    check('the swap puts you at the anchor, a body short of it',
      r !== null && Math.abs(dist(point(r[0]), anchor) - (PLAYER_R + 0.06)) < 1e-6,
      `${dist(point(r[0]), anchor).toFixed(4)} from it`);
    check('and hands the anchor the place you left',
      dist(r[1], before) < 1e-12);
    // The rope's length is untouched, so you arrive at the radius you left at
    // and keep swinging - from the other end of the same circle.
    check('and the rope still spans the same distance',
      Math.abs(dist(point(r[0]), r[1]) - rope.length) < PLAYER_R + 0.07,
      `${dist(point(r[0]), r[1]).toFixed(3)} against ${rope.length.toFixed(3)}`);
    check('and there is nothing to swap with without a rope',
      anchorSwap(null, M) === null);
    check('nor when you are already on top of the anchor',
      anchorSwap(grappleAttach(point(M), 0.01), M) === null);
  }
}

console.log('');
console.log('what goes on the wire');

{
  // The packet is the character struct, folded. Folded because a point of
  // H^3/Gamma has infinitely many names and only the canonical one is a name
  // both ends agree on; see net.js.
  setSolid(SOLID.OCTAGON);
  const M = reduceToDomain(placeAt(0.4, -0.2, 0.5))[0];
  const src = {
    world: 1, seq: 77, health: 61, hurt: 0.25,
    M, vel: [0.3, -0.4, 0.1],
    boom: foldPoint(point(placeAt(0.2, 0.2, 0.4))),
    blockState: 2, block: foldPoint(point(placeAt(-0.3, 0.1, 0.4))), blockR: BLOCK_R,
    decoy: foldPoint(point(placeAt(0.1, -0.5, 0.3))),
    cut: { at: foldPoint(point(placeAt(0.6, 0, 0.4))), N: [1, 0, 0, 0] },
    blast: { at: foldPoint(point(placeAt(0, 0, 0.4))), r: 1.2 },
  };
  const back = unpackState(packState(src));
  const same = (a, b, tol) => a.every((x, i) => Math.abs(x - b[i]) < tol);
  check('a state packet survives the round trip',
    back.world === 1 && back.seq === 77 && back.health === 61
    && same(back.M, M, 1e-6) && same(back.vel, src.vel, 1e-6));
  check('and so does everything the other player has out',
    same(back.boom, src.boom, 1e-6) && back.blockState === 2
    && same(back.block, src.block, 1e-6)
    && same(back.decoy, src.decoy, 1e-6)
    && same(back.cut.at, src.cut.at, 1e-6) && same(back.cut.N, src.cut.N, 1e-6)
    && Math.abs(back.blast.r - 1.2) < 1e-6);
  check('what is not out comes back as nothing at all',
    unpackState(packState({ world: 0, seq: 1, health: 100, M, vel: [0, 0, 0] })).boom === null);
  check('and anything that is not a state packet is rejected',
    unpackState(new Float32Array(PACKET_FLOATS)) === null
    && unpackState(new Float32Array(4)) === null);

  // THE claim the whole design rests on: reduction is canonical, so two peers
  // holding different representatives of the same place send the same packet.
  // Without this a position on the wire would mean nothing.
  let agree = true;
  for (let i = 0; i < 200; i++) {
    const P = placeAt((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2,
                      0.2 + Math.random());
    const mine = reduceToDomain(P)[0];
    // The same point of the manifold, named the way the other peer might.
    const g = OCT_PAIR[Math.floor(Math.random() * 8)];
    const theirs = reduceToDomain(reorthonormalize(matMul(g, P)))[0];
    if (dist(point(mine), point(theirs)) > 1e-9) agree = false;
  }
  check('two peers naming the same place send the same coordinates', agree);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
