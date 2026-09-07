// h2r.js -- H^2 x R: a hyperbolic FLOOR PLAN with an honest Euclidean height.
//
// This is the fourth geometry in the project and the first one that is not a
// space of constant curvature, so geom.js cannot produce it: geom.js is built
// on <x,x> = k and one trigonometry, and a PRODUCT has neither. What it does
// have is something better for a game -- the two factors do not talk to each
// other at all, and that separation is the whole reason this file exists.
//
//
// WHY IT EXISTS: the dropper, which H^3 cannot host
//
// A dropper is a fall past a sequence of gates, steering sideways on the way
// down. It was built in H^3, measured, and thrown away, and the reason was not
// tuning. In H^3 the level sets of height are EQUIDISTANT SURFACES of a
// geodesic plane, and those are not totally geodesic: they curve away from the
// plane, so a horizontal geodesic RISES on both sides of its lowest point.
// Horizontal motion is motion that climbs, and above a critical speed the
// geometry beats gravity outright and you stop descending. Measured on the
// real integrator, that speed halves per unit of altitude -- 1.854 at 1, 0.924
// at 2, 0.417 at 3 -- so at WALK_SPEED 0.9 a player simply does not fall at
// all above altitude 2.034. Steering and descending are ANTAGONISTIC there,
// and a dropper needs them independent.
//
// In H^2 x R the slices z = const are TOTALLY GEODESIC. That one word is the
// whole difference. The metric is
//
//     ds^2 = ds^2_{H^2} + dz^2
//
// with no cross term and no z-dependent factor, so the two factors decouple
// completely: under gravity the vertical motion is EXACTLY Euclidean free
// fall, z = z0 - g t^2 / 2, whatever you are doing horizontally, and the
// horizontal motion is an H^2 geodesic at constant speed, whatever height you
// are at. `h2r.test.js` measures precisely that -- fall time is independent of
// horizontal speed to eleven digits -- and it is the claim the mode rests on.
//
// The hyperbolic content does not go away; it moves to where it belongs.
// Reaching a gate a distance d away still costs d/v seconds, as in flat space,
// but:
//
//   - AIMING ERROR GROWS LIKE sinh. Geodesics in H^2 diverge exponentially, so
//     a heading off by an angle e misses a gate at distance d by sinh(d)*e
//     rather than d*e. At d = 3 that is 3.3 times worse than flat.
//   - A GATE'S APPARENT SIZE FALLS LIKE 1/sinh(d), by the same factor.
//
// so committing early to a distant gate is punished twice over, and the two
// compound. That is a dropper's whole skill curve, and in flat space it does
// not exist.
//
//
// THE MODEL, and the coordinate order is chosen to make the shader easy
//
//     p = (x0, x1, z, x3)     with   x0^2 + x1^2 - x3^2 = -1,  x3 > 0
//
// Components 0, 1 and 3 are a point of the hyperboloid model of H^2 in R^{2,1};
// component 2 is z, the Euclidean height, unconstrained. Two forms live here
// and keeping them apart is most of the work:
//
//     hdot(a,b) = a0b0 + a1b1 - a3b3      the H^2 factor. POINTS live here,
//                                         and hdot(p,p) = -1 is the model.
//     dot(a,b)  = a0b0 + a1b1 + a2b2 - a3b3   the metric on TANGENT vectors,
//                                         which adds the z direction back.
//
// `dot` is diag(1,1,1,-1) -- the very same Minkowski form H^3 uses. That is
// not a coincidence worth ignoring: it means the shader's `mdot`, its lighting
// and its normalisation are unchanged, and only distance, the ray and the up
// vector had to be rewritten.
//
// A PLACEMENT is a 4x4 as everywhere else, column 3 the point and columns
// 0,1,2 the frame. Two things about it are NOT as everywhere else.
//
// THE HEIGHT IS AFFINE, AND A PLAIN mat4 MULTIPLY GETS IT WRONG. Isom(H^2 x R)
// is Isom(H^2) x Isom(R), and the R factor acts by z -> z + t. For a matrix to
// do that, the slot the offset multiplies against has to be 1 -- and the slot
// available is x3, which is cosh(horizontal distance) and is emphatically not
// 1. So the isometry group does NOT embed in GL(4) acting on this model; it
// lives in GL(3) x Aff(1). Measured, when this file first used geom.js's
// matMul directly: a step of 1.3 from height 2.1 landed at 3.812 instead of
// 3.140, because the stored height had been multiplied by cosh(0.78) = 1.320.
//
// So `compose` and `applyPoint` are this file's own, and they differ from the
// linear ones in exactly one line: the height row is added, never scaled. The
// point/vector distinction that H^3 gets for free from the 4th coordinate has
// to be made explicit here, which is why there are `applyPoint` and `applyVec`
// rather than one `apply`. A tangent vector is not displaced by a translation;
// a point is.
//
// One dividend falls straight out of that. The height is an ORDINARY AFFINE
// COORDINATE, so it has no cosh in it and no cancellation: the float32 range
// limit that caps every hyperbolic level at about d = 7 applies to the
// horizontal plan ONLY. A shaft here can be a hundred units deep and still be
// exact, which is precisely what a dropper wants.
//
// And the FRAME IS CONSTRAINED in a way it is not in H^3. The isometry group
// is four-dimensional, while the orthonormal frames of a 3-manifold form a
// six-dimensional bundle.
// So a tilted frame is NOT the image of the origin frame under any isometry,
// and "placement = isometry" cannot carry an arbitrary camera.
//
// It costs nothing here, and the reason is worth stating: E1 and E2 stay
// horizontal and E3 stays vertical under parallel transport along ANY geodesic
// (transport in a product is componentwise), so the placement is always
// upright -- and the camera's own yaw/pitch/roll, which main.js already
// carries separately, supplies every direction the player can look. The
// hyperbolic side needs `alignUp` to re-pin E3 every substep because its frame
// tilts as you walk. HERE IT NEVER TILTS. There is nothing to correct.
//
// No DOM, so it is testable, and `h2r.test.js` does test it.

import { surface } from './product.js';

// --- the geometry, which is `product.js` at kS = -1 -----------------------
//
// Every primitive below is one line, because H^2 x R and S^2 x R are the same
// arithmetic with sinh and cosh swapped for sin and cos -- exactly the
// relationship `hyp.js` has with `geom.js`, one product level up. What stays
// in THIS file is everything about this particular space: the column field,
// the shaft, the fall, and the dropper.
//
// The names are re-exported rather than the object being passed around,
// because `main.js`, `h2r.test.js` and the shader emitter all hold them
// individually and the whole point of the refactor was that nothing outside
// had to change. `h2r.test.js` is the regression test for it: 51 tests that
// were written against the old implementations and pass unchanged against
// these, including the two that pin the affine-height trap and the wrong
// answer a linear compose would give.

const P = surface(-1);

/** The metric on TANGENT vectors: diag(1,1,1,-1). Same form H^3 uses. */
export const dot = P.dot;

/**
 * The form on the H^2 factor alone, index 2 (the height) simply ignored.
 *
 * This is the one POINTS satisfy: hdot(p,p) = -1 is the model, and z is free.
 * Every distance, every projection and every reorthonormalisation goes through
 * this rather than through `dot`.
 */
export const hdot = P.sdot;

export const ORIGIN = P.ORIGIN;
export const IDENTITY = P.IDENTITY;
export const point = P.point;
export const frameVec = P.frameVec;

/** M applied to a POINT: linear in the H^2 factor, a SHIFT in the height. */
export const applyPoint = P.applyPoint;
/** M applied to a TANGENT VECTOR, whose height a translation does not move. */
export const applyVec = P.applyVec;
/** A frame-component direction as an ambient tangent vector at point(M). */
export const fromFrame = P.fromFrame;
/** A composed with B. The height row is ADDED; see product.js. */
export const compose = P.compose;

/** The height of a point, and it is just the coordinate. No function to it. */
export const height = P.height;
/** Up, in frame components, and it is constant. There is no alignUp here. */
export const UP = P.UP;

export const translation = P.translation;
export const translationBy = P.translationBy;
export const geodesic = P.geodesic;
export const rayPoint = P.rayPoint;
export const exp = P.exp;
export const log = P.log;

/** Distance in the H^2 factor alone: the floor-plan distance. */
export const horizDist = P.horizDist;
/** Distance in H^2 x R: PYTHAGORAS in the two factors, exactly. */
export const dist = P.dist;

export const inv = P.inv;
export const logTo = P.logTo;
export const reorthonormalize = P.reorthonormalize;
export const groupError = P.groupError;

/** A placement at horizontal geodesic-polar (a, b) and height z, facing +E1. */
export const placeAt = P.placeAt;

// --- the world ------------------------------------------------------------
//
// NO QUOTIENT, and that is a design choice rather than a limitation.
//
// The hyperbolic and spherical worlds in this project are compact: H^3 modulo
// a group, so the room comes back round to itself, and S^3 because a sphere
// already does. Most of the marcher's complexity is there to serve that -- the
// face scan, the exact exit solve, the fold loop, the straddle copies. A
// dropper wants none of it. You fall down a shaft ONCE; there is nothing to
// come back to and nothing to wrap. So this world is plain H^2 x R, unglued,
// and the whole quotient apparatus is dead code in its program exactly as it
// is in the spherical one.
//
// What replaces the wrap as a sense of place is the COLUMN FIELD. A vertical
// cylinder here is `horizDist(p, c) - r`, exact and independent of height, and
// a ring of them at horizontal radius R holds about 2*pi*sinh(R) of arc -- so
// the far ring is not "twice as far and twice as spread out", it is twice as
// far and NINE times as spread out. Falling past them, the near ring sweeps by
// and the far one crowds together at the horizon, and that difference is the
// hyperbolic plan being legible at a glance.
//
// The floor is z = 0. In H^2 x R that is a totally geodesic copy of H^2 and
// its distance function is the coordinate itself -- the cheapest exact surface
// anywhere in this project, and the reason the fall is honest.

const ring = (n, R, r, mat, phase = 0) => Array.from({ length: n }, (_, i) => {
  const th = phase + 2 * Math.PI * i / n;
  return { c: point(translation([R * Math.cos(th), R * Math.sin(th), 0])), r, mat };
});

/**
 * Vertical columns, as (H^2 centre, radius, material).
 *
 * Two rings, and the counts are chosen so the ANGULAR spacing is even rather
 * than the count: circumference is 2*pi*sinh(R), so an outer ring needs more
 * columns to look equally dense, not the same number spread thinner.
 *
 * The inner ring stands in the play area on purpose -- it is what a line
 * between two gates has to be planned around. The outer one is scenery and
 * distance reference. Kept to sixteen in total because every one of them is an
 * unrolled copy in the shader and link time is the budget that binds.
 */
export const H2R_COLUMNS = [
  ...ring(6, 1.70, 0.18, 2),
  ...ring(10, 3.10, 0.28, 3, Math.PI / 10),
  ...ring(14, 4.40, 0.34, 3, Math.PI / 14),
];

/**
 * The floor, and the deck the run starts from.
 *
 * FORTY-FOUR UNITS OF DROP, and that number is only available in this
 * geometry. Height here is an ordinary affine coordinate with no cosh in it,
 * so it is exact at any depth; in H^3 an altitude of 44 would put the
 * coordinates at e^44 and there would be no digits left in a double, let alone
 * in the shader's float32. The shaft is deep because it can be.
 */
export const H2R_FLOOR_Z = 0;
export const H2R_TOP_Z = 44;

/**
 * The world as a distance and a material, exactly as `levelMap` is.
 *
 * No folding and no straddle copy: there is no group, so a point has one name.
 * Every term is EXACT rather than the usual underestimate, because a product
 * metric makes distance Pythagoras in the two factors -- a vertical column
 * ignores the height entirely and the floor is the height coordinate itself.
 */
export function h2rMap(p) {
  let best = p[2], mat = 1;                      // the floor at z = 0, exact
  for (const c of H2R_COLUMNS) {
    const d = horizDist(p, c.c) - c.r;
    if (d < best) { best = d; mat = c.mat; }
  }
  // The baffles are drawn as part of the world, and they are the only lethal
  // thing in it; the columns above are ordinary scenery you bounce off.
  const obstacle = dropperObstacleSDF(p);
  if (obstacle < best) { best = obstacle; mat = 6; }
  return [best, mat];
}

/** Just the distance. */
export const h2rSDF = (p) => h2rMap(p)[0];

// --- the same world, as GLSL ---------------------------------------------

const num = (n) => {
  const s = Number(n).toPrecision(9);
  return s.includes('.') || s.includes('e') ? s : `${s}.0`;
};

/**
 * Emit the world for the shader.
 *
 * Written out rather than rolled, for the reason level.js is: these are
 * constant array reads in the march inner loop and unrolled the compiler folds
 * them. Sixteen columns against the hyperbolic level's 39 primitives, and each
 * one is three lines rather than three slabs of asinh, so this program should
 * link nearer the spherical one than the hyperbolic one.
 */
export function h2rGLSL() {
  const n = H2R_COLUMNS.length;
  return `
const vec4 DROP_B[${DROP_BAFFLES.length}] = vec4[${DROP_BAFFLES.length}](
  ${DROP_BAFFLES.map((b) => `vec4(${b.at.map(num).join(', ')})`).join(',\n  ')});
const vec4 H2R_C[${n}] = vec4[${n}](
    ${H2R_COLUMNS.map((c) => `vec4(${c.c.map(num).join(', ')})`).join(',\n    ')});
// x = radius, y = material.
const vec2 H2R_RM[${n}] = vec2[${n}](
    ${H2R_COLUMNS.map((c) => `vec2(${num(c.r)}, ${num(c.mat)})`).join(',\n    ')});

// The whole H^2 x R world. No domain, no folding, no straddle copy: there is
// no group here, so a point has one name and there is nothing to reduce.
vec2 h2rWorld(vec4 p) {
  // The floor is the plane z = 0, and its exact distance is the coordinate.
  vec2 m = vec2(p.z, 1.0);
  for (int i = 0; i < ${n}; i++) {
    // A vertical column: the height drops out entirely, so this is a distance
    // in the H^2 factor alone and it is exact at every altitude.
    float d = hHorizDist(p, H2R_C[i]) - H2R_RM[i].x;
    if (d < m.x) m = vec2(d, H2R_RM[i].y);
  }
  for (int i = 0; i < ${DROP_BAFFLES.length}; i++) {
    float d = max(abs(p.z - DROP_B[i].z) - ${num(DROP_THICK)},
      ${num(DROP_OPENING)} - hHorizDist(p, DROP_B[i]));
    if (d < m.x) m = vec2(d, 6.0);
  }
  return m;
}
`;
}

// --- falling --------------------------------------------------------------
//
// The integrator, and it is the shortest one in the project because the two
// factors do not interact.
//
// Gravity is a constant subtraction from the E3 component of the velocity, and
// E3 is exactly the vertical at every point, at every height, for ever. There
// is no gradient to evaluate, no `alignUp` to re-pin the frame, and no
// coupling to the horizontal: `stepFall` moves the height by v2*dt EXACTLY,
// whatever the horizontal speed is. That is the whole reason the dropper works
// here and not in H^3, and `h2r.test.js` measures it rather than asserting it.

export const H2R_G = 3.0;         // matches physics.js G, so the fall reads the same
export const H2R_ACCEL = 4.4;     // horizontal authority in free fall
export const H2R_DRAG_H = 2.0;    // -> terminal horizontal speed 2.2
export const H2R_DRAG_V = 0.75;   // -> terminal fall speed 4.0
export const H2R_PLAYER_R = 0.10;

export const H2R_TERM_H = H2R_ACCEL / H2R_DRAG_H;
export const H2R_TERM_V = H2R_G / H2R_DRAG_V;

/**
 * Steer horizontally and fall vertically, in FRAME components.
 *
 * The two drags differ because they do different jobs: the horizontal one sets
 * how fast you can cross the shaft and how quickly you stop when you let go,
 * and the vertical one sets the terminal speed and so the LENGTH OF THE RUN.
 * A dropper is a fixed time budget spent on lateral movement, and those two
 * numbers are the budget.
 */
export function h2rFall(v, want, dt) {
  const kh = Math.exp(-H2R_DRAG_H * dt);
  const kv = Math.exp(-H2R_DRAG_V * dt);
  return [
    (v[0] + want[0] * H2R_ACCEL * dt) * kh,
    (v[1] + want[1] * H2R_ACCEL * dt) * kh,
    (v[2] - H2R_G * dt) * kv,
  ];
}

/**
 * Advance one substep along the geodesic the velocity points down.
 *
 * Velocity in frame components is constant along a geodesic, so this is one
 * composition and the velocity is genuinely untouched -- the same shape as
 * `stepFree` in physics.js and `s3Step` in s3.js.
 */
export function stepFall(M, v, dt) {
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
export function h2rCollide(M, v, sdf, r = H2R_PLAYER_R) {
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

// --- the dropper ----------------------------------------------------------
//
// THE MINIGAME THIS GEOMETRY EXISTS FOR, and it is a reversal: CLAUDE.md
// recorded a dropper as IMPOSSIBLE, with a measurement behind it. That
// measurement was right and its conclusion was too narrow -- it is impossible
// in H^3, and the reason is a fact about H^3 rather than about droppers.
//
// In H^3 the level sets of the height are EQUIDISTANT SURFACES of a geodesic
// plane. They curve away from it, so a geodesic tangent to one has its lowest
// point there and RISES on both sides: horizontal motion is motion that
// climbs. Above a critical horizontal speed the geometry beats gravity and the
// fall stops outright, and that speed halves per unit of altitude -- 1.854 at
// altitude 1, 0.073 at 5. Steering and descending are antagonistic, so the
// mode is a cliff and not a dial.
//
// In H^2 x R the level sets z = const are TOTALLY GEODESIC copies of H^2. A
// horizontal geodesic stays at its height for ever. The two factors of the
// product do not interact at all, so the fall time is EXACTLY independent of
// how hard you steer -- h2r.test.js measures it, at every horizontal speed
// from 0 to 3, to every printed digit.
//
// What survives from H^3, and it is the interesting half, is that the FLOOR
// PLAN is still hyperbolic. A gate 2.94 away is 2.94 of proper distance and
// looks like sinh(2.94) = 9.4 of Euclidean spread; aiming error at distance d
// misses by sinh(d) * e while the gate's apparent size falls like 1/sinh(d),
// and those two compound. Committing to the line early is worth exponentially
// more than correcting late, which is the whole skill of the mode.
//
// The height is an AFFINE coordinate, so it is exact at any depth: the float32
// d = 7 range limit that caps every hyperbolic level here applies to the
// horizontal plan alone. A 44-unit shaft is free in H^2 x R and impossible in
// H^3.

/**
 * The gates, SEARCHED for rather than written down.
 *
 * A search over ring radius, turn per gate, drop per gate, gate radius and
 * wobble -- 1080 layouts against four criteria, all measured on the real
 * integrator in this file:
 *
 *   1. every gate ring is clear of the column field
 *   2. a NO-INPUT drop takes zero gates, or the course is decoration
 *   3. a greedy "aim at the next gate, full input" policy takes every one
 *   4. a LAZY policy -- same aim, 55% input -- fails, so the run rewards
 *      committing early rather than drifting toward the gate
 *
 * 85 layouts passed all four. The winner: ring radius 1.5, 150 degrees of turn
 * and 8 units of drop per gate, gate radius 0.60, five gates. Ring clearance
 * from the columns 0.260; gate-to-gate offsets 1.50 then 2.94 four times, with
 * a mean sinh(d)/d of 2.85 -- so the hyperbolic plan is doing real work rather
 * than being a flat course with a curved metric written on it. The aimed run
 * takes 11.35 s and uses 53% of the tightest gate's radius; no-input takes
 * 0 of 5 and lazy takes 1 of 5.
 */
export const DROP_RING_R = 1.5;
export const DROP_TURN = 150 * Math.PI / 180;
export const DROP_FALL = 8;
export const DROP_GATE_R = 0.60;
export const DROP_GATES = 5;

/**
 * Did the segment p0 -> p1 pass through this gate?
 *
 * A gate here is a HORIZONTAL DISC, not a geodesic plane, so the test is a
 * sign change of the height coordinate rather than of an inner product -- and
 * it is simpler than the hyperbolic one for the reason everything here is:
 * the height is a coordinate. modes.js runStep takes this off course.crossed.
 *
 * Downward only. You cannot re-take a gate by climbing back through it,
 * because in a dropper there is no climbing back.
 */
export function gateCrossed(p0, p1, gate) {
  if (!(p0[2] > gate.z && p1[2] <= gate.z)) return false;
  const f = (p0[2] - gate.z) / (p0[2] - p1[2]);
  // Interpolate in the H^2 factor and push back onto the hyperboloid, exactly
  // as modes.js does. Over one substep the chord and the geodesic agree far
  // inside the gate radius being tested.
  const q = [p0[0] + f * (p1[0] - p0[0]), p0[1] + f * (p1[1] - p0[1]), 0,
             p0[3] + f * (p1[3] - p0[3])];
  const n = Math.sqrt(Math.max(-hdot(q, q), 1e-18));
  const hit = [q[0] / n, q[1] / n, gate.z, q[3] / n];
  return horizDist(hit, gate.at) <= gate.r;
}

/**
 * Build the course.
 *
 * A gate carries `at` (its centre, a point), `z` (its height, which is `at`'s
 * height too and is kept separately because the crossing test wants it as a
 * scalar) and `r`. The shape is deliberately the same as a hoop's, so
 * modes.js needs nothing from here but the crossing test.
 */
export function dropperCourse(n = DROP_GATES) {
  const hoops = [];
  for (let i = 0; i < n; i++) {
    const th = i * DROP_TURN;
    const z = H2R_TOP_Z - (i + 1) * DROP_FALL;
    const at = point(translation([
      DROP_RING_R * Math.cos(th), DROP_RING_R * Math.sin(th), z]));
    hoops.push({ at, z, r: DROP_GATE_R, N: UP });
  }
  return { kind: 'dropper', hoops, crossed: gateCrossed };
}

/**
 * Points around a gate's rim, for main.js to draw as a LINE LOOP.
 *
 * Same rule as the hyperbolic hoops: a curve in the shader would be inlined
 * three times and paid for at link time, which is the budget that binds, and
 * main.js already draws curves for the rope. A gate is a horizontal circle, so
 * every point is one H^2 geodesic step out at the gate's own height.
 */
export function gateRing(gate, n = 48) {
  const v = log(gate.at);
  const base = translation([v[0], v[1], gate.z]);
  return Array.from({ length: n }, (_, i) => {
    const th = 2 * Math.PI * i / n;
    return rayPoint(base, [Math.cos(th), Math.sin(th), 0], gate.r);
  });
}

/** Where a run starts: on the deck, above the first gate's ring. */
export const dropperStart = () => placeAt(0, 0, H2R_TOP_Z);

// --- the baffles, and they are what makes a gate a LINE rather than a point --
//
// A gate says "be here at this height". A baffle says "and be ON THE WAY
// between here and the next one", which is the constraint the mode's own skill
// argument is about: an aiming error e at distance d misses by sinh(d) e and
// the gate's apparent size falls like 1/sinh(d), so committing to the line
// early is worth exponentially more than correcting late. Without a baffle
// nothing checks the line, only the endpoints.
//
// So a baffle is a horizontal slab spanning the shaft with ONE hole, and the
// hole sits at the midpoint of the geodesic from gate i to gate i+1, at the
// midpoint height. THE FIRST VERSION PUT THE HOLE OVER THE GATE IT FOLLOWED,
// which is the same thing as not having one: the next gate is 2.937 sideways,
// so the hole was nowhere near the path and the course was unfinishable at
// every input from 0.0 to 1.0.
//
// SEARCHED, over the height fraction and the hole radius, against the same
// four criteria the gate layout was searched against. 36 candidates, 6 passed:
//
//     frac 0.50, hole 0.95   aimed 5/5 in 11.35s   lazy(0.55) 1/5   none 0/5
//
// and it is the pick because the hole rim stands 0.348 clear of the column
// field -- widest of the six -- while still binding: the aimed line passes
// 0.672 from the hole centre, using 71% of the hole, against 53% of a gate's
// radius. THE BAFFLE IS THE TIGHTER OF THE TWO CONSTRAINTS, which is the whole
// reason to have it. 11.35s is also exactly what the aimed run cost before the
// baffles existed, so a correct line pays nothing for them.
export const DROP_OPENING = 0.95;
export const DROP_THICK = 0.08;
export const DROP_BAFFLE_F = 0.50;

/** The hole centres: midway along the geodesic between consecutive gates. */
function baffleAt(a, b, f = DROP_BAFFLE_F) {
  const A = translation(log(a.at));
  const v = logTo(A, b.at);
  const m = Math.hypot(v[0], v[1]);
  // A purely vertical hop would leave no direction to walk; the gates never do
  // that (they are 2.937 apart) but the guard costs nothing.
  const at = m < 1e-9 ? a.at : rayPoint(A, [v[0] / m, v[1] / m, 0], m * f);
  return [at[0], at[1], a.z + (b.z - a.z) * f, at[3]];
}

export const DROP_BAFFLES = (() => {
  const g = dropperCourse().hoops;
  return g.slice(0, -1).map((a, i) => ({ at: baffleAt(a, g[i + 1]) }));
})();

/**
 * Signed distance to the LETHAL solids, which is the baffles and NOTHING else.
 *
 * The columns are deliberately not in here, and that is the fix rather than an
 * oversight. They are scenery -- the field that makes the hyperbolic floor
 * plan legible as you fall past it -- and the gate ring was SEARCHED against
 * them on exactly that footing: a gate's rim comes within 0.220 of a column,
 * with the player 0.10 across. Making them lethal retroactively invalidated
 * that search, and it showed: the aimed run died at altitude 42.6, above every
 * baffle, having flown out to the 1.70 column ring on its way to a gate at
 * radius 1.5. Every input from 0.0 to 1.0 scored 0/5.
 *
 * They are still SOLID -- they are in `h2rSDF`, so `h2rCollide` stops you --
 * which is the honest reading: you bounce off the scenery and you die on the
 * course furniture.
 *
 * Exact inside and an underestimate outside, which is the safe direction for
 * the sphere trace in `dropperImpact`: above the slab AND inside the hole both
 * terms are positive and the true distance is their hypotenuse, which is
 * larger than the max taken here.
 */
export function dropperObstacleSDF(p) {
  let d = Infinity;
  for (const b of DROP_BAFFLES) d = Math.min(d,
    Math.max(Math.abs(p[2] - b.at[2]) - DROP_THICK,
      DROP_OPENING - horizDist(p, b.at)));
  return d;
}

/** Sweep the player sphere along its actual product geodesic; no tunneling. */
export function dropperImpact(M, v, dt) {
  const speed = Math.hypot(...v), length = speed * dt;
  if (!speed) return dropperObstacleSDF(point(M)) <= H2R_PLAYER_R;
  const dir = v.map((x) => x / speed);
  let t = 0;
  for (let i = 0; i < 128; i++) {
    const clearance = dropperObstacleSDF(rayPoint(M, dir, t)) - H2R_PLAYER_R;
    if (clearance <= 1e-6) return true;
    if (t + clearance > length) return false;
    t += clearance;
  }
  return true; // an unresolved grazing contact is a collision, not a bypass
}
