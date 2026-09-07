// modes.js -- rounds, timers and ordered checkpoints.
//
// There was no game state anywhere in this project: no score, no clock, no
// phase, no win condition. Every mode in TODO.md needs the same few pieces, so
// they are built here once rather than discovered five times.
//
// NO DOM, for the same reason physics.js has none: this is the part with rules
// in it, and rules are worth testing. main.js owns the drawing and the HUD.
//
// The first mode is the hoop course, and it is first because almost all of it
// already existed -- flight, free camera, no gravity - and because the shape
// of the course is a fact about the manifold rather than a level to author.

import {
  dot, dist, point, geodesic, apply, matMul, exp, foldElement, pairings,
  placeAt, logTo,
  closedGeodesicDirs, closedGeodesicLength, IDENTITY,
} from './hyp.js';

// --- a hoop --------------------------------------------------------------
//
// The same primitive as the sightline cutter, and for the same reason: a disc
// of totally geodesic plane is one inner product wide and exactly right.
//
// A hoop is { at, N, r }: a centre, a UNIT SPACELIKE normal orthogonal to it,
// and a radius. The plane is { p : <p,N> = 0 }, which passes through `at`
// because <at,N> = 0, and asinh(<p,N>) is then a true signed distance to it.

export const HOOP_R = 0.30;

/**
 * The hoop centred at arclength t along the geodesic from `M` in direction
 * `dir`, facing ALONG that geodesic.
 *
 * The normal comes free from the construction. The ambient unit tangent to the
 * aiming geodesic at the point it reaches is already orthogonal to that point
 * and already unit spacelike, so it IS the plane's normal with nothing to
 * build: <at,N> = 0 and <N,N> = 1 fall straight out of cosh^2 - sinh^2 = 1.
 * placeCut does exactly this; the only difference is what it is used for.
 */
export function hoopAt(M, dir, t, r = HOOP_R) {
  const c = Math.cosh(t), s = Math.sinh(t);
  return {
    at: point(geodesic(M, dir, t)),
    N: apply(M, [c * dir[0], c * dir[1], c * dir[2], s]),
    r,
  };
}

/**
 * A course of `n` hoops evenly spaced around a CLOSED GEODESIC.
 *
 * This is the whole reason the mode is worth building here. The manifold is
 * compact and some of its geodesics close up, so a course laid along one
 * returns to its own start with NO TURNING: you fly dead straight and arrive
 * where you began. There is no flat world in which that course exists.
 *
 * In the dodecahedral world these axes are the SPOKES, which the level already
 * draws -- so the scenery is showing you the racing line before you know there
 * is a race.
 *
 * `axis` picks which closed geodesic; every generator gives one.
 */
export function geodesicCourse(axis = 0, n = 6, r = HOOP_R) {
  const dirs = closedGeodesicDirs();
  const u = dirs[axis % dirs.length];
  const L = closedGeodesicLength();
  const hoops = [];
  // Skip k = 0: a hoop exactly at the start line would be crossed on the first
  // substep, before the player has flown anywhere.
  for (let k = 1; k <= n; k++) hoops.push(hoopAt(IDENTITY, u, (k * L) / (n + 1), r));
  return { hoops, axis, length: L, closed: true };
}

/**
 * A CHARGE GATE: a hoop that will not open until you have banked enough
 * holonomy, of the right sign.
 *
 * This is the whole reason a grapple course is worth building rather than
 * being a hoop course with a rope. `sweptArea` integrates (cosh(r) - 1)
 * dtheta, and dtheta HAS A SIGN, so the meter fills positive going round
 * something one way and negative going the other -- and going back round
 * empties what you had. Until now that sign only ever chose between a dash and
 * a blast.
 *
 * A gate that wants +0.8 can only be opened by circling something
 * counter-clockwise, and one that wants -0.8 by circling clockwise, so a
 * course that alternates makes you reverse your orbit between gates. And
 * because the integrand is cosh(r) - 1, a wide arc is worth exponentially more
 * than a tight one: the cheap way to charge is to swing out around a tower,
 * not to spin on the spot.
 *
 * In a flat world this mechanic does not exist at all. The same integral is
 * identically zero.
 */
export function gateOpen(hoop, banked) {
  if (!hoop.needs) return true;
  if (typeof banked !== 'number' || !Number.isFinite(banked)) return false;
  // Signed: a positive requirement is not met by a large negative bank.
  return hoop.needs > 0 ? banked >= hoop.needs : banked <= hoop.needs;
}

/** How far toward this gate's requirement the bank is, 0..1. For the HUD. */
export function gateProgress(hoop, banked) {
  if (!hoop.needs) return 1;
  if (typeof banked !== 'number' || !Number.isFinite(banked)) return 0;
  return Math.max(0, Math.min(1, banked / hoop.needs));
}

/**
 * A course you fly with the rope: a ring of gates around the arena, each
 * facing the next, alternating which way round you must have gone.
 *
 * Deliberately NOT on a closed geodesic. The hoop course already shows what
 * the manifold does when you fly straight; this one is about what YOU do, and
 * it wants the level's towers and pillars nearby to swing around. It sits at
 * floor radius `r`, inside the octagon's inradius of 1.5286 with room to
 * spare, and at an altitude a rope can reach.
 *
 * Each gate faces the NEXT one rather than along some frame axis, which needs
 * no assumption about how placeAt orients itself: the log map from one
 * placement to the next point IS the direction of travel there.
 */
export function grappleCourse(n = 5, r = 1.30, h = 0.45, charge = 0.8,
                              phase = 9 * Math.PI / 180) {
  // The ring is SEARCHED for, not written down, exactly as the opponent spawn
  // is and for the same reason. The obvious choice - floor radius 1.0, no
  // offset - puts a gate INSIDE a wall: the walls are a pinwheel at floor
  // radius 1.0, and levelSDF at that first gate reads -0.034. A gate you
  // cannot fly through reads as a broken course, not as a hard one.
  //
  // Swept over radius, altitude and rotation against levelSDF, the best clear
  // ring is r = 1.30, h = 0.45, rotated 9 degrees, which stands every gate
  // 0.336 clear of the nearest surface and keeps them all within 1.412 of the
  // centre - inside the octagon's inradius of 1.5286.
  const spots = [];
  for (let k = 0; k < n; k++) {
    const a = phase + (k / n) * Math.PI * 2;
    spots.push(placeAt(r * Math.cos(a), r * Math.sin(a), h));
  }
  const hoops = [];
  for (let k = 0; k < n; k++) {
    const M = spots[k];
    const nextP = point(spots[(k + 1) % n]);
    const lv = logTo(M, nextP);
    const d = Math.hypot(lv[0], lv[1], lv[2]) || 1;
    const dir = [lv[0] / d, lv[1] / d, lv[2] / d];
    // t = 0, so the hoop sits exactly at the placement and its normal is a
    // frame vector there -- unit spacelike and orthogonal to the point by
    // definition, which is precisely the invariant the crossing test needs.
    const hoop = hoopAt(M, dir, 0, HOOP_R * 1.3);
    // The first gate is free, so a run can start. After that they alternate,
    // which forces a reversal: to go from +0.8 to -0.8 you must unwind the
    // 0.8 you had and then bank 0.8 the other way.
    hoop.needs = k === 0 ? 0 : (k % 2 === 1 ? charge : -charge);
    hoops.push(hoop);
  }
  return { hoops, axis: -1, length: 0, closed: false };
}

/**
 * Did the segment p0 -> p1 pass through this hoop?
 *
 * Exactly portalCrossing's test, with two differences. A hoop counts from
 * EITHER side -- it is a gate, not a one-way door, and a course you can only
 * fly one way round would be a worse course. And nothing teleports, so the
 * answer is a boolean rather than an isometry.
 *
 * The sign of <p,N> says which side of the plane a point is on, so a crossing
 * is a sign change. Interpolating linearly in ambient coordinates and pushing
 * back onto the hyperboloid is exact enough here for the same reason the decoy
 * interpolation is: over one substep the chord and the geodesic agree to far
 * better than the radius being tested.
 */
export function hoopCrossed(p0, p1, hoop) {
  const f0 = dot(p0, hoop.N), f1 = dot(p1, hoop.N);
  if (f0 === f1) return false;
  if ((f0 > 0) === (f1 > 0)) return false;         // no sign change, no crossing
  const u = f0 / (f0 - f1);
  const q = [0, 1, 2, 3].map((k) => p0[k] + (p1[k] - p0[k]) * u);
  const n = Math.sqrt(Math.max(-dot(q, q), 1e-18));
  const hit = [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
  return dist(hit, hoop.at) <= hoop.r;
}

/**
 * Carry a course through a fold, by the SAME group element as the player.
 *
 * The hoops are points of the universal cover, exactly like the grapple
 * anchor, the beacon and the portals, and the rule is the one CLAUDE.md
 * already states: carry them by `g`, never snap them to the nearest copy.
 * Snapping would move a gate out from under a player mid-flight.
 *
 * The normal is a 4-vector at the point, so it is carried by the same matrix,
 * and it stays unit spacelike because g is a Lorentz transformation. Folding
 * the normal apart from the centre would leave the plane no longer passing
 * through its own centre -- the exact bug foldElement exists to prevent for
 * the pane.
 */
export function carryCourse(course, g) {
  for (const h of course.hoops) {
    h.at = apply(g, h.at);
    h.N = apply(g, h.N);
  }
}

/**
 * The copy of this hoop NEAREST to `p`, for drawing it where it is seen.
 *
 * A course laid along a closed geodesic wraps the whole manifold on purpose,
 * so most of its hoops are nowhere near the fundamental domain in coordinates.
 * Drawn at their raw coordinates they would project to the wrong part of the
 * screen: the marcher's view teleports at every face and a line overlay does
 * not, so the overlay has to name the copy the marcher is actually showing.
 *
 * The centre and the normal are carried by the SAME group element. That is the
 * entire job of foldElement, and getting it wrong is not subtle -- fold them
 * apart and the plane stops passing through its own centre, so the ring draws
 * as a slanted sliver somewhere the gate is not.
 */
export function hoopNear(hoop, p) {
  let best = null, bd = dist(p, hoop.at);
  for (const g of pairings()) {
    const d = dist(p, apply(g, hoop.at));
    if (d < bd) { bd = d; best = g; }
  }
  if (!best) return hoop;
  return { at: apply(best, hoop.at), N: apply(best, hoop.N), r: hoop.r };
}

/** The same hoop reduced INTO the fundamental domain, normal carried with it. */
export function hoopFolded(hoop) {
  const [at, g] = foldElement(hoop.at);
  return { at, N: apply(g, hoop.N), r: hoop.r };
}

// --- a run ---------------------------------------------------------------

export const PHASE = { IDLE: 0, RUNNING: 1, DONE: 2 };

export function makeRun(course) {
  return {
    course,
    phase: PHASE.IDLE,
    t: 0,            // seconds since the start
    next: 0,         // index of the hoop that counts next
    splits: [],      // time at each hoop taken, in order
    refused: 0,      // passes through a gate that was not charged yet
    best: null,      // best full run this session
  };
}

/** Begin. Idempotent from any phase, so one key can be "start" and "retry". */
export function startRun(run) {
  run.phase = PHASE.RUNNING;
  run.t = 0;
  run.next = 0;
  run.splits = [];
  run.refused = 0;
  return run;
}

export function resetRun(run) {
  run.phase = PHASE.IDLE;
  run.t = 0;
  run.next = 0;
  run.splits = [];
  run.refused = 0;
  return run;
}

/**
 * Advance a run by one substep, given the segment the player just moved along.
 *
 * ORDERED on purpose. Only `run.next` can be taken, so the course cannot be
 * short-circuited by flying through hoop five on the way to hoop two -- and in
 * a compact manifold that is not a hypothetical, because a straight line
 * eventually reaches everything. Without the ordering the wrap IS the cheat.
 *
 * Returns the index of the hoop just taken, or -1.
 */
export function runStep(run, dt, p0, p1, banked = null) {
  if (run.phase !== PHASE.RUNNING) return -1;
  run.t += dt;
  const h = run.course.hoops[run.next];
  if (!h || !p0 || !p1) return -1;
  if (!hoopCrossed(p0, p1, h)) return -1;
  // A shut gate is flown THROUGH, not bounced off. Blocking the way would need
  // the gate to be solid, and a solid disc in a corridor you are swinging down
  // at speed is a wall you hit by accident; the honest failure here is that
  // the pass simply does not count and you go round again.
  if (!gateOpen(h, banked)) { run.refused++; return -1; }

  const taken = run.next;
  run.splits.push(run.t);
  run.next++;
  if (run.next >= run.course.hoops.length) {
    run.phase = PHASE.DONE;
    if (run.best === null || run.t < run.best) run.best = run.t;
  }
  return taken;
}

/** 0..1 around the course. For a HUD bar. */
export function runProgress(run) {
  const n = run.course.hoops.length;
  return n ? Math.min(1, run.next / n) : 0;
}

/** mm:ss.hh, which is what a time trial wants to read. */
export function formatTime(t) {
  // typeof first, and it is not belt and braces: `null >= 0` is TRUE in
  // JavaScript, because null coerces to 0 in a relational comparison. A bare
  // `!(t >= 0)` therefore lets null through and prints 00:00.00 for a run
  // nobody has finished, which reads as a world record.
  if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = Math.floor(t - m * 60);
  const h = Math.floor((t - m * 60 - s) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
       + `.${String(h).padStart(2, '0')}`;
}

/**
 * A ring of points around a hoop, for drawing it as a line loop.
 *
 * Deliberately NOT a shader primitive. Everything drawn in `sceneMap` is
 * inlined into the marcher three times and costs link time -- and link time is
 * the budget that binds here, the one that once took the scene program to 212
 * seconds. A hoop is a curve, main.js already draws curves for the rope, and a
 * line loop costs the GPU nothing and the compiler nothing at all.
 *
 * The ring is built at the ORIGIN and carried, which is the idiom the whole
 * codebase uses: pick any two ambient directions spanning the plane orthogonal
 * to the normal, then walk the circle in geodesic polar about the centre.
 */
export function hoopRing(hoop, n = 32) {
  // A frame for the plane: two unit spacelike vectors orthogonal to `at`, to
  // each other, and to N. Start from any vector not parallel to N.
  const N = hoop.N;
  const seed = Math.abs(N[0]) < 0.9 ? [1, 0, 0, 0] : [0, 1, 0, 0];
  const e1 = orthonormalize(seed, hoop.at, N);
  const e2 = orthonormalize(cross4(hoop.at, N, e1), hoop.at, N, e1);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const dir = [0, 1, 2, 3].map((k) => e1[k] * c + e2[k] * s);
    // geodesic polar about `at`: cosh(r)*at + sinh(r)*dir, with dir unit
    // spacelike and orthogonal to at, which is exactly what this frame is.
    const ch = Math.cosh(hoop.r), sh = Math.sinh(hoop.r);
    out.push([0, 1, 2, 3].map((k) => hoop.at[k] * ch + dir[k] * sh));
  }
  return out;
}

/** Strip off the components along each of `refs`, then normalise. Minkowski. */
function orthonormalize(v, at, ...refs) {
  let w = v.slice();
  // The timelike direction first: <at,at> = -1, so the projection flips sign.
  const ta = dot(w, at);
  w = w.map((x, k) => x + ta * at[k]);
  for (const r of refs) {
    const c = dot(w, r);
    w = w.map((x, k) => x - c * r[k]);
  }
  const n = Math.sqrt(Math.max(dot(w, w), 1e-18));
  return w.map((x) => x / n);
}

/** A 4-vector orthogonal to three given ones: the Minkowski cross product. */
function cross4(a, b, c) {
  // The generalised cross product via the Levi-Civita symbol, then the index
  // is lowered by the metric diag(1,1,1,-1) -- which is the sign flip on the
  // last component below.
  const d = [
    -det3([a[1], a[2], a[3]], [b[1], b[2], b[3]], [c[1], c[2], c[3]]),
    +det3([a[0], a[2], a[3]], [b[0], b[2], b[3]], [c[0], c[2], c[3]]),
    -det3([a[0], a[1], a[3]], [b[0], b[1], b[3]], [c[0], c[1], c[3]]),
    +det3([a[0], a[1], a[2]], [b[0], b[1], b[2]], [c[0], c[1], c[2]]),
  ];
  return [d[0], d[1], d[2], -d[3]];
}

function det3(r0, r1, r2) {
  return r0[0] * (r1[1] * r2[2] - r1[2] * r2[1])
       - r0[1] * (r1[0] * r2[2] - r1[2] * r2[0])
       + r0[2] * (r1[0] * r2[1] - r1[1] * r2[0]);
}

void matMul; void exp;
