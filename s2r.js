// s2r.js — S^2 x R: a SPHERICAL floor plan with an honest Euclidean height.
//
// The fifth geometry, and the exact mirror of the bounded world.
//
//   floor (2D wrap)   the floor wraps because a GROUP glues one octagon to
//                     the next; the height does not wrap. Compact sideways,
//                     infinite up and down.
//   S^2 x R           the floor wraps because IT IS A SPHERE, with no group,
//                     no fundamental domain, no fold and no straddle copy;
//                     the height does not wrap. Compact sideways, infinite up
//                     and down.
//
// Same shape of world, opposite mechanism, opposite curvature. Everything the
// hyperbolic floor makes cheap, this one makes impossible, and the reason is
// one fact:
//
//   ANY TWO GEODESICS ON A SPHERE MEET, TWICE, AND ALWAYS.
//
// On the H^2 floor almost no two geodesics meet at all: they diverge like
// e^d, which is why CLAUDE.md records that flanking is cheap, retreating is
// very cheap and a straight-line chase is a losing move. Here every straight
// line you can run is a great circle, every great circle crosses every other
// great circle, and running straight away from someone running straight is how
// you meet them on the far side. **You cannot escape by going straight.** That
// is not a rule anybody wrote; it is the floor.
//
//
// WHAT IT IS THE FIRST TO HAVE: a compact floor AND honest gravity
//
//   H^3 / Gamma   compact, but "down" has to be CHOSEN -- H^3 is isotropic, so
//                 the floor plane is a decision, and in the open world no
//                 consistent down exists at all.
//   S^3           compact, and gravity is IMPOSSIBLE: the only unit-gradient
//                 functions point at a pole, so a whole world falls to one
//                 spot.
//   H^2 x R       honest gravity -- z is affine, |grad z| = 1 exactly -- but
//                 the floor is an infinite hyperbolic plane and nothing wraps.
//   S^2 x R       BOTH. z is affine here for exactly the same reason it is in
//                 H^2 x R, and the floor is compact for free.
//
// So this is the first world in the project you can walk right round and
// arrive where you started, under real gravity, with no group anywhere.
//
//
// THE OTHER THING TO LOOK AT: apparent size is MIXED
//
// In S^3, apparent size is non-monotonic in every direction -- things a
// quarter turn away look smallest and grow again as they recede. In H^2 x R
// everything shrinks like 1/sinh horizontally and like 1/d vertically. Here
// the two disagree:
//
//   horizontally   r / sin(d): smallest at a quarter turn, growing after,
//                  and at the ANTIPODE a single point fills the whole horizon
//   vertically     r / d, ordinary flat falloff, monotonic for ever
//
// The SPIRE below stands at the antipode of the spawn for that reason. Every
// horizontal sightline you can take reaches it -- all great circles through
// you pass through the antipode -- so it is visible in EVERY compass direction
// at once, and it is one object rather than a quotient's copies of one.
//
// Built on `product.js` at kS = +1, which is `h2r.js`'s geometry with sinh and
// cosh swapped for sin and cos. No DOM, so it is testable.

import { surface } from './product.js';
import { RACE_WIDTH, raceTrackGLSL } from './race-track.js';

// --- the geometry, which is product.js at kS = +1 -------------------------

const P = surface(1);

/** The metric on TANGENT vectors: diag(1,1,1,1). Same form S^3 uses. */
export const dot = P.dot;

/**
 * The form on the S^2 factor alone, index 2 (the height) simply ignored.
 *
 * POINTS satisfy sdot(p,p) = +1, which is the round unit sphere in the 0,1,3
 * coordinates. Note the sign against `h2r.js`, where the same test reads -1:
 * that one number is the entire difference between the two worlds.
 */
export const sdot = P.sdot;

export const ORIGIN = P.ORIGIN;
export const IDENTITY = P.IDENTITY;
export const point = P.point;
export const frameVec = P.frameVec;

export const applyPoint = P.applyPoint;
export const applyVec = P.applyVec;
export const fromFrame = P.fromFrame;
export const compose = P.compose;

/** The height of a point, and it is just the coordinate. */
export const height = P.height;
/** Up, in frame components, constant. No alignUp here either. */
export const UP = P.UP;

export const translation = P.translation;
export const translationBy = P.translationBy;
export const geodesic = P.geodesic;
export const rayPoint = P.rayPoint;
export const exp = P.exp;
export const log = P.log;

/** Distance across the floor. Never more than pi, because it is a sphere. */
export const horizDist = P.horizDist;
/** Distance in S^2 x R: Pythagoras in the two factors, exactly. */
export const dist = P.dist;

export const inv = P.inv;
export const logTo = P.logTo;
export const reorthonormalize = P.reorthonormalize;
export const groupError = P.groupError;
export const placeAt = P.placeAt;

/** Once round the floor. Straight ahead brings you back here. */
export const S2R_LAP = 2 * Math.PI;
/** The far point: every horizontal sightline from the origin reaches it. */
export const S2R_ANTIPODE = Math.PI;

// --- the world ------------------------------------------------------------
//
// NO QUOTIENT, and here that is not even a design choice -- there is nothing
// to quotient. The floor closes up on its own. So the fundamental domain, the
// face scan, the exit solve, the fold loop and the straddle copies are all
// dead code in this program exactly as they are in the spherical and product
// ones, which is why it links in a fraction of the hyperbolic time.
//
// The content is arranged to make the mixed falloff legible at a glance,
// which is the same job `s3.js`'s two rings do and a harder one here because
// only the horizontal direction misbehaves.

/** A ring of columns at surface distance `rho` around the placement `base`. */
const capRing = (base, n, rho, r, mat, phase = 0, top = 1.6) =>
  Array.from({ length: n }, (_, i) => {
    const th = phase + 2 * Math.PI * i / n;
    return { c: rayPoint(base, [Math.cos(th), Math.sin(th), 0], rho), r, mat, top };
  });

/**
 * The two POLES OF THE LAP COURSE, which is where all the scenery goes.
 *
 * The course is a great circle, and the first layout put its scenery in rings
 * centred on the SPAWN -- which cannot work, and the reason is worth keeping.
 * A ring at a fixed arc from the spawn has members at every azimuth, and the
 * course leaves the spawn at azimuth 0, so some member is always near the
 * course line. Measured: a ring of 8 at a quarter turn put a column dead ahead
 * and a straight lap stopped against it at arc 1.341. Phasing the ring only
 * moves which member is in the way; at a quarter turn a column has to be at
 * least 48 degrees of azimuth off the line to clear a 0.83 corridor, and eight
 * evenly spaced columns cannot all be.
 *
 * A POLE of the course circle is a quarter turn from EVERY point of it, so a
 * cap of scenery around one is clear of the whole lap at once, with room to
 * spare out to 0.74 of radius. Two poles, two caps, and the corridor is clear
 * all the way round by construction rather than by search.
 */
export const POLE_A = [0, Math.PI / 2, 0];
export const POLE_B = [0, -Math.PI / 2, 0];

/**
 * The world: two SPIRES at the poles and a cap of pillars around each.
 *
 * THE SPIRES ARE THE THING TO LOOK AT. Each stands a quarter turn from every
 * point of the lap, so running the whole way round, neither comes closer and
 * neither gets further -- the two just sweep a full turn around you, staying
 * exactly opposite each other on the horizon the entire time. Nothing flat or
 * hyperbolic does that: there, keeping something at constant range means
 * constantly turning, and here it is what running dead straight looks like.
 *
 * THE TWO CAPS ARE THE FALLOFF DEMO, and it is an equality rather than a
 * trend, which is easier to check by eye. Apparent size across this floor is
 * r/sin(d), and sin(0.45) = sin(pi - 0.45). So standing at spire A:
 *
 *   the near cap  0.45 away,  r 0.13  ->  apparent 0.299
 *   the far cap   2.69 away,  r 0.13  ->  apparent 0.293
 *
 * SIX TIMES THE DISTANCE AND THE SAME APPARENT SIZE, to twelve digits. In
 * either hyperbolic world the far one would be 6.3% of the near one's WIDTH
 * and so 0.4% of its solid angle; here the two are indistinguishable.
 */
/**
 * A column beside the course: `t` along the great circle, then `w` sideways.
 *
 * The point is (sin t cos w, sin w, ., cos t cos w), which is on the sphere by
 * cos^2 w + sin^2 w = 1 and is EXACTLY w from the course circle -- the circle
 * is where the second coordinate vanishes, and the distance to it is asin of
 * that coordinate. So w is a clearance in the units the gates are measured in,
 * with no search and no trigonometry at the call site.
 */
const beside = (t, w, r, mat, top) => ({
  c: [Math.sin(t) * Math.cos(w), Math.sin(w), 0, Math.cos(t) * Math.cos(w)],
  r, mat, top,
});

/** An avenue of columns down one side of the course. */
const avenue = (n, w, r, mat, top, phase = 0) =>
  Array.from({ length: n }, (_, i) => beside(phase + 2 * Math.PI * i / n, w, r, mat, top));

/**
 * The world: two SPIRES at the poles, a cap of pillars around each, and an
 * avenue down both sides of the lap.
 *
 * THE SPIRES ARE THE THING TO LOOK AT. Each stands a quarter turn from every
 * point of the lap, so running the whole way round, neither comes closer and
 * neither gets further -- the two just sweep a full turn around you, staying
 * exactly opposite each other on the horizon the entire time. Nothing flat or
 * hyperbolic does that: there, keeping something at constant range means
 * constantly turning, and here it is what running dead straight looks like.
 *
 * THE TWO CAPS ARE THE FALLOFF DEMO, and it is an equality rather than a
 * trend, which is far easier to check by eye. Apparent size across this floor
 * is r/sin(d), and sin(0.45) = sin(pi - 0.45) exactly. So standing at spire A:
 *
 *   the near cap  0.45 away,  r 0.13  ->  apparent 0.299
 *   the far cap   2.69 away,  r 0.13  ->  apparent 0.299
 *
 * SIX TIMES THE DISTANCE AND THE SAME APPARENT SIZE, to twelve digits. In
 * either hyperbolic world the far one would be 6.3% of the near one's WIDTH
 * and so 0.4% of its solid angle; here the two are indistinguishable.
 *
 * THE AVENUE IS WHAT MAKES RUNNING READ AS RUNNING, and placing it taught the
 * one thing about a sphere that a floor plan will not tell you:
 *
 *   THERE ARE NO PARALLEL LINES, SO THERE IS NO SUCH THING AS AN AVENUE
 *   RUNNING ALONGSIDE YOUR ROUTE.
 *
 * The first attempt put columns at a constant 1.05 sideways all the way round,
 * which in a flat world is a road with trees down both sides. Here the "line"
 * at constant offset from a great circle is not a geodesic at all, and every
 * one of its columns sits 60 degrees or more off the direction of travel --
 * computed, 67.9 degrees at a quarter of the way and never below 60.1. The
 * field of view is about 40 degrees to a side, so NOT ONE of them was ever on
 * screen while running. The screenshot was a flat horizon and the gates.
 *
 * What works is putting them CLOSE and BETWEEN. The drawn gate rings reach
 * 0.70 sideways but have no extent along the course, so a column halfway
 * between two gates only has to clear the running corridor. At 0.42 sideways
 * and half a gate-spacing along, the nearest ring point is 0.52 away and the
 * column is 0.41 clear of it, while the bearing from a runner comes down to 24
 * degrees at the far ones -- comfortably in frame, converging as they should.
 */
export const S2R_COLUMNS = [
  { c: point(translation(POLE_A)), r: 0.10, mat: 4, top: 7.0 },
  { c: point(translation(POLE_B)), r: 0.10, mat: 7, top: 5.0 },
  ...capRing(translation(POLE_A), 6, 0.45, 0.13, 2, 0),
  ...capRing(translation(POLE_B), 6, 0.45, 0.13, 3, Math.PI / 6),
  ...avenue(6, 0.42, 0.11, 5, 1.30, S2R_LAP / 12),
  ...avenue(6, -0.42, 0.11, 8, 0.95, S2R_LAP / 12),
];

/** The spire at pole A, which main.js and the tests both want to name. */
export const S2R_SPIRE = S2R_COLUMNS[0];

/** The floor, which is a whole sphere, and where a lap course is run. */
export const S2R_FLOOR_Z = 0;
export const S2R_PLAYER_R = 0.10;

/**
 * The world as a distance and a material, exactly as `levelMap` is.
 *
 * No folding and no straddle copy: there is no group, so a point has one name.
 * Every term is exact -- a product metric makes distance Pythagoras in the two
 * factors, so the floor is the height coordinate and a column is a horizontal
 * distance with the height dropped.
 */
export function s2rMap(p) {
  let best = p[2], mat = 1;                     // the floor at z = 0, exact
  for (const c of S2R_COLUMNS) {
    // The column is the intersection of a disc in the floor plan with a height
    // slab, and `max` of the two is exact inside and an underestimate outside
    // the rim -- the safe direction, and the convention every primitive in
    // this project uses.
    const d = Math.max(horizDist(p, c.c) - c.r, p[2] - c.top);
    if (d < best) { best = d; mat = c.mat; }
  }
  return [best, mat];
}

/** Just the distance. */
export const s2rSDF = (p) => s2rMap(p)[0];

// --- the same world, as GLSL ---------------------------------------------

const num = (n) => {
  const s = Number(n).toPrecision(9);
  return s.includes('.') || s.includes('e') ? s : `${s}.0`;
};

/**
 * Emit the world for the shader.
 *
 * Written out rather than rolled, for the reason `level.js` is: these are
 * constant array reads in the march inner loop, and unrolled the compiler
 * folds them. Fifteen columns of three lines each, against the hyperbolic
 * level's 39 primitives of three slabs of asinh, so this program links well
 * under the hyperbolic one.
 */
export function s2rGLSL() {
  const n = S2R_COLUMNS.length;
  return `
const vec4 S2R_C[${n}] = vec4[${n}](
    ${S2R_COLUMNS.map((c) => `vec4(${c.c.map(num).join(', ')})`).join(',\n    ')});
// x = radius, y = material, z = top height.
const vec3 S2R_RM[${n}] = vec3[${n}](
    ${S2R_COLUMNS.map((c) => `vec3(${num(c.r)}, ${num(c.mat)}, ${num(c.top)})`).join(',\n    ')});

// The whole S^2 x R world. No domain, no folding, no straddle copy: the floor
// closes up on its own, so a point has exactly one name.
vec2 s2rWorld(vec4 p) {
  // The floor is a whole sphere at z = 0, and its exact distance is the
  // coordinate. Cheapest exact surface in the project, twice over now.
  vec2 m = vec2(p.z, 1.0);
  for (int i = 0; i < ${n}; i++) {
    // A vertical column: the height drops out of the horizontal distance
    // entirely, so this is exact at every altitude, capped by a height slab.
    float d = max(hHorizDist(p, S2R_C[i]) - S2R_RM[i].x, p.z - S2R_RM[i].z);
    if (d < m.x) m = vec2(d, S2R_RM[i].y);
  }
  if (uRace > 0.5) {
    float latitude = abs(asin(clamp(p.y, -1.0, 1.0)));
    if (m.y == 1.0 && latitude < ${RACE_WIDTH}) m.y = 5.0;
    ${raceTrackGLSL()}
  }
  return m;
}
`;
}

// --- walking, falling and jumping ----------------------------------------
//
// The first world here you can WALK in that is not built on `hyp.js`, and it
// is short for the reason everything in a product is: the two factors do not
// interact, so gravity is one subtraction and steering is the other two
// components, and neither knows about the other.
//
// What it is NOT is `physics.js`. There is no rope, no boomerang, no portal,
// no opponent -- all of that is built on hyp.js and its group, top to bottom.
// This is the small honest slice, exactly as `s3.js` is.

export const S2R_G = 9.0;          // brisker than the dropper's: you jump here
export const S2R_WALK = 2.2;       // top speed on the ground
export const S2R_GRIP = 14.0;      // how fast the ground reaches that speed
export const S2R_AIR = 3.0;        // and how little authority you have off it
export const S2R_JUMP = 4.2;       // -> about 0.98 up, and 0.95 s of hang time

/** Standing on something? Measured against the world, not against z alone. */
export const grounded = (M, sdf, r = S2R_PLAYER_R) => sdf(point(M)) <= r + 1e-3;

/**
 * Steer horizontally and fall vertically, in FRAME components.
 *
 * `want` is a horizontal unit vector or zero. The horizontal velocity is
 * steered toward `want * S2R_WALK` at a rate that depends on whether there is
 * ground under you, and the vertical one is left entirely alone except by
 * gravity -- which is the whole content of "the factors do not interact".
 */
export function s2rControl(v, want, onGround, dt) {
  const rate = onGround ? S2R_GRIP : S2R_AIR;
  const k = 1 - Math.exp(-rate * dt);
  const tx = want[0] * S2R_WALK, ty = want[1] * S2R_WALK;
  return [
    v[0] + (tx - v[0]) * k,
    v[1] + (ty - v[1]) * k,
    v[2] - S2R_G * dt,
  ];
}

/**
 * Advance one substep along the geodesic the velocity points down.
 *
 * Velocity in frame components is constant along a geodesic, so this is one
 * composition and the velocity is genuinely untouched -- the same shape as
 * `stepFree` in physics.js, `s3Step` in s3.js and `stepFall` in h2r.js.
 */
export function s2rStep(M, v, dt) {
  const speed = Math.hypot(v[0], v[1], v[2]);
  if (speed < 1e-12) return [reorthonormalize(M), v];
  const dir = [v[0] / speed, v[1] / speed, v[2] / speed];
  return [reorthonormalize(geodesic(M, dir, speed * dt)), v];
}

/** The outward normal of the surface at the player, in frame components. */
export function surfaceNormal(M, sdf) {
  const e = 1e-4;
  const g = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const d = [0, 0, 0];
    d[i] = 1;
    g[i] = (sdf(rayPoint(M, d, e)) - sdf(rayPoint(M, d, -e))) / (2 * e);
  }
  const m = Math.hypot(g[0], g[1], g[2]);
  if (m < 1e-12) return [0, 0, 1];
  return [g[0] / m, g[1] / m, g[2] / m];
}

/** Push out of anything the player is inside, and kill the velocity going in. */
export function s2rCollide(M, v, sdf, r = S2R_PLAYER_R) {
  let normal = null;
  for (let i = 0; i < 4; i++) {
    const d = sdf(point(M)) - r;
    if (d >= 0) break;
    const n = surfaceNormal(M, sdf);
    M = geodesic(M, n, -d);
    normal = n;
    const vn = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
    if (vn < 0) v = [v[0] - vn * n[0], v[1] - vn * n[1], v[2] - vn * n[2]];
  }
  return [reorthonormalize(M), v, normal];
}

/** A jump: set the vertical component, do not add to it. */
export const jump = (v) => [v[0], v[1], S2R_JUMP];

// --- the lap course -------------------------------------------------------
//
// Gates around a GREAT CIRCLE, so running dead straight takes every one of
// them and brings you back to the start.
//
// That is exactly what the hoop course in the bounded world does, and the
// mechanism is the opposite one. There, a closed geodesic exists because a
// GROUP glues the room to itself, and the course returns you because the
// manifold is compact. Here there is no group at all: a great circle closes
// because a sphere closes. Running the two back to back is the cleanest way
// to feel what a quotient actually is, because the experience is identical
// and only the reason differs.
//
// It is ORDERED, for a reason that has nothing to do with wrapping this time:
// without it, a lap in the WRONG DIRECTION would count every gate too, and a
// course you can run backwards is not a course.

export const LAP_GATES = 6;
export const LAP_GATE_R = 0.70;
/**
 * The gate's centre height, and it is the RADIUS on purpose: a ring centred at
 * its own radius stands ON the floor rather than half buried in it. At 0.35 it
 * was buried, and the drawn loop dipped 0.20 below the floor -- which nothing
 * would have flagged except that the clearance test measures the drawn ring.
 *
 * It also sets how wide the gate is at running height. A player's centre is at
 * PLAYER_R = 0.10, so the vertical miss is already 0.60 of the 0.70 budget,
 * leaving sqrt(0.70^2 - 0.60^2) = 0.36 of sideways room. That is the gate.
 */
export const LAP_GATE_Z = LAP_GATE_R;

/**
 * Did the segment p0 -> p1 pass through this gate?
 *
 * A gate is a VERTICAL PLANE through the floor's centre -- a great circle's
 * worth of it -- so the sign test uses `sdot`, which ignores the height
 * entirely. That is what makes it a doorway you can jump through rather than
 * a hoop at one altitude. The radius test then uses the FULL distance, so
 * jumping over the top of it does not count.
 */
export function gateCrossed(p0, p1, gate) {
  const f0 = sdot(p0, gate.N), f1 = sdot(p1, gate.N);
  if (f0 === f1) return false;
  if ((f0 > 0) === (f1 > 0)) return false;
  const u = f0 / (f0 - f1);
  // Interpolate in the S^2 factor and push back onto the sphere; the height is
  // linear and needs no correction at all. Over one substep the chord and the
  // geodesic agree far inside the radius being tested.
  const q = [p0[0] + u * (p1[0] - p0[0]), p0[1] + u * (p1[1] - p0[1]), 0,
             p0[3] + u * (p1[3] - p0[3])];
  const s = Math.sqrt(Math.max(sdot(q, q), 1e-300));
  const hit = [q[0] / s, q[1] / s, p0[2] + u * (p1[2] - p0[2]), q[3] / s];
  return dist(hit, gate.at) <= gate.r;
}

/**
 * Build the course: n gates evenly spaced around the great circle running
 * along +E1 from the origin.
 *
 * Gate i stands at arc distance (i+1) * 2*pi/n, so the last one is back at the
 * start -- the lap closes, and finishing means arriving where you set off.
 * Skipping i = 0 is the same guard `modes.geodesicCourse` needs: a gate
 * exactly on the start line is crossed on the first substep.
 *
 * The NORMAL of gate i is the unit surface vector along the direction of
 * travel there, which for a great circle in the (0,3) plane at arc t is
 * (cos t, 0, ., -sin t): the tangent to the circle, and orthogonal to the
 * gate's own centre, so the plane passes through it.
 */
export function lapCourse(n = LAP_GATES) {
  const hoops = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 1) * S2R_LAP / n;
    const at = point(translation([t, 0, LAP_GATE_Z]));
    hoops.push({ at, N: [Math.cos(t), 0, 0, -Math.sin(t)], r: LAP_GATE_R, t });
  }
  return { kind: 'lap', hoops, crossed: gateCrossed };
}

/**
 * Points around a gate's frame, for main.js to draw as a LINE LOOP.
 *
 * Same rule as every other course here: a curve in `sceneMap` would be inlined
 * three times and paid for at link time, which is the budget that binds, and
 * main.js already draws curves for the rope. A gate is a circle in the plane
 * spanned by "up" and the horizontal direction across the course, so it is
 * drawn by stepping out from its centre in that plane.
 */
export function gateRing(gate, n = 40) {
  const v = log(gate.at);
  const base = translation([v[0], v[1], gate.at[2]]);
  // The gate faces along the course, so its plane is spanned by E3 (up) and
  // the horizontal direction perpendicular to travel. `logTo` of the next
  // point along would give travel; the cross-course direction is E2 whenever
  // the course runs along E1, which it does by construction.
  return Array.from({ length: n }, (_, i) => {
    const th = 2 * Math.PI * i / n;
    return rayPoint(base, [0, Math.cos(th), Math.sin(th)], gate.r);
  });
}

/** Where a lap starts: on the floor at the origin, facing along the course. */
export const lapStart = () => placeAt(0, 0, S2R_PLAYER_R);
