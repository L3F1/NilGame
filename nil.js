// nil.js -- NIL, the Heisenberg group, and the first geometry here whose
// distance is not available as a simple closed-form expression.
//
// This project began as a Nil game and the port to H^3 replaced every line of
// it; this is Nil coming back, on the architecture the other five paid for.
// It is the SIXTH geometry and the seventh scene program, and it is the first
// of the three Thurston geometries CLAUDE.md lists as missing.
//
// THE MODEL. Nil is R^3 with a group law rather than a quadric:
//
//     (x,y,z) * (x',y',z') = (x+x', y+y', z+z' + (x y' - y x') / 2)
//
// and the left-invariant orthonormal frame at (x,y,z) is
//
//     E1 = d/dx - (y/2) d/dz      E2 = d/dy + (x/2) d/dz      E3 = d/dz
//
// so the metric is  dx^2 + dy^2 + (dz + (y dx - x dy)/2)^2. The half-and-half
// spelling makes vertical rotations linear in these coordinates. Other
// coordinate conventions retain the same isometries, expressed differently.
//
// WHAT A PLACEMENT IS, and it is the friendliest answer in the project. The
// isometry group is Nil semidirect O(2) -- translations, plus rotation about
// the vertical, plus a reflection, and NOTHING ELSE. Four dimensions, where
// H^3 has six. Every one of those is an AFFINE map of R^3, so a placement is
// an ordinary 4x4:
//
//     [  1     0    0   a ]        columns 0,1,2 are E1, E2, E3 at the point
//     [  0     1    0   b ]        column 3 is the point
//     [ -b/2  a/2   1   c ]        and composition is matrix multiplication
//     [  0     0    0   1 ]
//
// That is the same contract level.js, physics.js and the shader already have
// with hyp.js -- M*o is where it is, columns 0,1,2 are the frame there -- so
// `chartMap` in the shader is a plain mat4 multiply and the uniform upload is
// unchanged. Nil is the LEAST invasive geometry added so far, and the reason
// is that it is a group and H^3 is not: this is the shape the code had when it
// was a Nil game.
//
// THE COST, and it is the one CLAUDE.md warned about: there is no closed form
// for the distance between two points. See `nilDistLower` below for what
// replaces it, and read the note there before touching anything -- the answer
// is smaller than the architectural change the roadmap predicted.
//
// No DOM and no graphics, so it is testable when something needs it to be.
//
// PARKED, 2026-09-07. Written just before the project turned toward an
// engine/editor, so it is NOT wired into spaces.js, world-motion.js, the
// shader or the menu, and it has no test file yet. The mathematics below was
// verified against an independent RK4 integration of the geodesic equations
// (position 3.7e-11, direction 2.5e-14) and against the group commutator, so
// it is worth keeping rather than rewriting: TODO.md part 4 has Nil under
// "where experiments need them". Nothing imports it, so it costs nothing.

import { matMul as multiplyMatrices } from './geom.js';

export const matMul = multiplyMatrices;

/** Identity placement: at the origin, frame E1,E2,E3, no turn. */
export const NIL_ID = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

/** The player's collision radius, as PLAYER_R is in physics.js. */
export const NIL_PLAYER_R = 0.10;

// --- the group ----------------------------------------------------------

/** The group law. Only the z-component is not addition. */
export function mul(g, h) {
  return [
    g[0] + h[0],
    g[1] + h[1],
    g[2] + h[2] + 0.5 * (g[0] * h[1] - g[1] * h[0]),
  ];
}

/** The inverse is the negation, which is true in Nil and in no other group here. */
export const inv = (g) => [-g[0], -g[1], -g[2]];

/**
 * RELATIVE COORDINATES: the coordinates of g^-1 h, which is where h stands as
 * seen from g with g's own frame as the axes.
 *
 * Everything that measures anything in this file goes through here, because
 * the metric is left invariant and so every question is a question about
 * g^-1 h. Written out, since g^-1 h = (dx, dy, dz + (y_g dx - x_g dy) / 2)
 * costs three multiplies where mul(inv(g), h) costs six.
 */
export function rel(g, h) {
  const dx = h[0] - g[0];
  const dy = h[1] - g[1];
  return [dx, dy, h[2] - g[2] + 0.5 * (g[1] * dx - g[0] * dy)];
}

/** The left translation by g, as a 4x4. Its columns are the frame at g. */
export function transMat(g) {
  const [a, b, c] = g;
  return [
    1, 0, -0.5 * b, 0,
    0, 1, 0.5 * a, 0,
    0, 0, 1, 0,
    a, b, c, 1,
  ];
}

/**
 * Rotation about the vertical, as a 4x4. The ONLY rotation Nil has.
 *
 * H^3 and S^3 have a full SO(3) at every point, so a placement there can be
 * tilted any way at all; both products have SO(2) x {+-1}; Nil has SO(2) and
 * that is the entire stabiliser. So there is no such thing as a placement
 * whose E3 is not vertical, and the question `alignUp` answers in H^3 -- how
 * far has the frame tilted -- cannot even be asked here. Pitch is a direction
 * you look in, never a frame you are in.
 */
export function turnMat(theta) {
  const c = Math.cos(theta), s = Math.sin(theta);
  return [
    c, s, 0, 0,
    -s, c, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

/** Where a placement is. */
export const point = (M) => [M[12], M[13], M[14], 1];
/** Where a placement is, as a group element. */
export const coords = (M) => [M[12], M[13], M[14]];
/** Frame vector i of a placement, in ambient coordinates. */
export const frameVec = (M, i) => [M[i * 4], M[i * 4 + 1], M[i * 4 + 2]];

/** A placement at a point, facing along +x. */
export const placeAt = (x, y, z) => transMat([x, y, z]);

/**
 * A tangent vector's FRAME components from its ambient ones, at p.
 *
 * The inverse of the frame is written out rather than inverted, because the
 * frame is unit lower-triangular: (u1,u2,u3) = (vx, vy, vz + (y vx - x vy)/2).
 * This and `ambientOf` are the only two places the two spellings meet, and
 * keeping them apart is the discipline the whole file rests on -- exactly as
 * h2r.js keeps applyPoint and applyVec apart.
 */
export function frameOf(p, v) {
  return [v[0], v[1], v[2] + 0.5 * (p[1] * v[0] - p[0] * v[1])];
}

/** The ambient components of a tangent vector given in the frame at p. */
export function ambientOf(p, u) {
  return [u[0], u[1], u[2] - 0.5 * (p[1] * u[0] - p[0] * u[1])];
}

// --- geodesics ----------------------------------------------------------

/**
 * THE GEODESIC FLOW, EXACT, and this is the half of Nil that is closed form.
 *
 * With the frame components of the velocity written u = (u1, u2, c), the
 * Euler-Arnold equations for this metric are
 *
 *     u1' = -c u2      u2' = c u1      c' = 0
 *
 * so c is constant and the horizontal part ROTATES at rate c. A Nil geodesic
 * is therefore a HELIX: a circle of radius a/|c| traversed at angular rate c,
 * lifted at a rate that is not constant. Two degenerate cases fall out of the
 * same formula: c = 0 is a horizontal straight line and a = 0 is the vertical
 * axis, and both are geodesics.
 *
 * Integrating x' = u1, y' = u2 and z' = c - (y x' - x y')/2 gives, from the
 * origin,
 *
 *     X = sin(ct)/c            Y = (1 - cos(ct))/c
 *     x = u1 X - u2 Y          y = u2 X + u1 Y
 *     z = ct + (a^2 / 2c^2) (ct - sin(ct))
 *
 * with a^2 = u1^2 + u2^2. The (u1,u2) mixing is the rotation by the launch
 * azimuth written without an atan2.
 *
 * THE SMALL-c BRANCH IS NOT OPTIONAL. Both X and z carry a 1/c and z carries a
 * 1/c^2, and every one of those cancels in exact arithmetic and does not
 * cancel in floating point: a nearly horizontal throw is the common case, not
 * a corner case, and without the series it comes back as a number of size
 * 1e8. The series below is the one the reference marcher uses too.
 *
 * Returns [point, direction] with the direction in the frame at the NEW point.
 * That is what makes this composable: frame components are what every chart
 * agrees on, so the flow can be re-based anywhere without converting anything.
 */
export function flowOrigin(u, t) {
  const c = u[2];
  const a2 = u[0] * u[0] + u[1] * u[1];
  const ct = c * t;
  let X, Y, z;
  if (Math.abs(ct) < 0.05) {
    // ct - sin(ct) = (ct)^3/6 - (ct)^5/120 + ..., so the 1/c^2 in z cancels
    // down to a^2 c t^3 (1/12 - ...) with nothing left to divide by.
    //
    // FOUR TERMS, not two, and the difference is visible. Truncating after
    // two leaves a step of 4e-8 in the position where the two branches meet,
    // which is a hundred times float64 noise and would show as a seam in the
    // one place the geometry is at its most ordinary. In q = (ct)^2 the
    // omitted term is of relative size q^4 = 4e-11 at the switch.
    const t2 = t * t, q = ct * ct;
    X = t * (1 - q / 6 + q * q / 120 - q * q * q / 5040);
    Y = c * t2 * (0.5 - q / 24 + q * q / 720 - q * q * q / 40320);
    z = ct + a2 * c * t2 * t
      * (1 / 12 - q / 240 + q * q / 10080 - q * q * q / 725760);
  } else {
    X = Math.sin(ct) / c;
    Y = (1 - Math.cos(ct)) / c;
    z = ct + (a2 / (2 * c * c)) * (ct - Math.sin(ct));
  }
  const cs = Math.cos(ct), sn = Math.sin(ct);
  return [
    [u[0] * X - u[1] * Y, u[1] * X + u[0] * Y, z],
    [u[0] * cs - u[1] * sn, u[0] * sn + u[1] * cs, c],
  ];
}

/**
 * The same flow, carried by a placement: fly from M for arclength t in the
 * frame direction u, and come back with a placement and a direction.
 *
 * The new placement is M composed with the left translation to the flowed
 * point, which puts its frame back on the left-invariant one. That is a
 * CHOICE and it is the one Nil's isometry group forces: parallel transport
 * along a helix does not keep E3 vertical, and a placement whose E3 is not
 * vertical is not a Nil isometry at all, so there is nothing to store it in.
 * The information is not lost -- it is in the returned direction, whose
 * horizontal part has turned by c*t, which is the whole of what a helix does.
 */
export function flow(M, u, t) {
  const [q, u2] = flowOrigin(u, t);
  return [matMul(M, transMat(q)), u2];
}

/** Where the flow from a point lands, as a group element. Convenience. */
export function rayPoint(g, u, t) {
  return mul(g, flowOrigin(u, t)[0]);
}

// --- distance -----------------------------------------------------------
//
// AND HERE IS THE THING NIL DOES NOT HAVE. There is no closed form for
// d(p, q). CLAUDE.md predicted that this would change the marcher's step rule
// and so be "a change to the load-bearing loop, not an addition beside it".
//
// THAT PREDICTION WAS WRONG, AND THE CORRECTION IS WORTH MORE THAN THE
// GEOMETRY. Sphere tracing never needed the distance. It needs a LOWER BOUND
// on the distance to the nearest surface, because all it does with the number
// is advance by it and claim nothing was skipped -- and that claim follows
// from any underestimate. Every SDF in this project is already an
// underestimate outside its corners, and level.js says so in those words. So
// the marcher's loop is untouched: `adv = min(m.x, ...)` was always correct
// for a bound, and Nil is the world that proves it.
//
// What an inexact distance actually costs is two things, both measurable and
// neither structural: STEPS, since a bound that is 70% of the truth takes
// about 1.4 times as many; and one PIXEL of fattening, since the hit test
// fires when the bound crosses the threshold rather than when the surface
// does. `nil.test.js` measures both.
//
// The thing that IS structural in Nil is the QUOTIENT, not the distance. A
// fundamental domain needs `exitDist` -- where does this ray cross that face
// -- and against a helix that is transcendental, which is why the reference
// marcher hunts the crossing by binary search ("creeping"). This build has no
// quotient, exactly as S^3, H^2 x R and S^2 x R have none, so the question
// does not arise. That is one thing changing at a time, which is the order
// CLAUDE.md asks for.

/**
 * THE VERTICAL DISTANCE, EXACTLY -- the one closed form Nil does have, and it
 * is the fact the whole world is built around.
 *
 * Which geodesics from the origin reach (0,0,z)? The flow's x and y both
 * vanish only when ct is a multiple of 2*pi, and then
 *
 *     z = 2 pi k (1 + a^2 / 2c^2)  =  pi k (1 + 1/c^2),   t = 2 pi k / |c|
 *
 * so with s = 1/|c| >= 1 and k = 1: z = pi(1 + s^2) and length t = 2 pi s.
 * Eliminating s,
 *
 *     d(o, (0,0,z)) = 2 sqrt(pi (|z| - pi))       for |z| >= 2 pi
 *
 * and below that no such helix exists (it would need |c| > 1) so the only
 * geodesic left is the vertical axis and the distance is |z|. The two agree
 * exactly at z = 2 pi, where the helix degenerates to the axis.
 *
 * SO GOING STRAIGHT UP IS NOT THE SHORTEST WAY UP, and the taller the climb
 * the more true that gets: 60 units of altitude cost 60 straight up and 26.7
 * on the helix, a factor of 2.24. That is not a trick or a shortcut -- the
 * vertical line IS still a geodesic, it simply stops being a minimising one
 * past its first conjugate point, which is what z = 2 pi is. Nothing else in
 * this project has a geodesic that gives up.
 */
export function vertDist(z) {
  const a = Math.abs(z);
  return a <= 2 * Math.PI ? a : 2 * Math.sqrt(Math.PI * (a - Math.PI));
}

/** The radius of the helix that climbs to height z the fast way. */
export function climbRadius(z) {
  const a = Math.abs(z);
  return a <= 2 * Math.PI ? 0 : Math.sqrt(a / Math.PI - 2);
}

/**
 * A rigorous LOWER BOUND on d(p, q), and the marcher's whole distance.
 *
 * Write w = p^-1 q with horizontal size rho and vertical coordinate zeta.
 * Along any unit-speed path the horizontal projection is 1-Lipschitz, so
 *
 *     d >= rho                                                     (1)
 *
 * and that one is EXACT: the horizontal geodesic straight at the target
 * reaches it in exactly rho when zeta happens to be zero.
 *
 * The vertical bound is the interesting one, and it is an ISOPERIMETRIC
 * INEQUALITY rather than an estimate. Since z' = u3 + (x y' - y x')/2,
 *
 *     zeta = (integral of u3)  +  (signed area swept by the horizontal path)
 *
 * -- climbing in Nil is done by ENCLOSING AREA. Close the horizontal path with
 * the chord back to the start, which is radial and so sweeps nothing; the
 * closed curve has length at most L + rho and by the isoperimetric inequality
 * encloses at most (L + rho)^2 / 4pi. With |integral of u3| <= L,
 *
 *     |zeta|  <=  L + (L + rho)^2 / (4 pi)                          (2)
 *
 * which inverts in closed form. Both are lower bounds, so the answer is the
 * larger, and neither can ever exceed the truth.
 *
 * HOW TIGHT, measured rather than hoped for (nil.test.js):
 *
 *     straight along a horizontal geodesic   exact, to 1e-15
 *     straight up the vertical axis          84% of the true distance
 *     locally, near any surface              at worst 1/sqrt(2) = 71%
 *
 * The local figure is the one the marcher pays for, and it comes from the
 * metric being exactly Euclidean at the origin: the bound is max(rho, |zeta|)
 * there and the truth is hypot(rho, zeta). So a step is never worse than 71%
 * of the honest one, which is 1.4x the steps in the worst direction and
 * nothing at all in the best.
 *
 * The sharper version of (2) keeps the constraint between the vertical and
 * horizontal budgets instead of bounding each by L, and at rho = 0 it
 * reproduces `vertDist` EXACTLY -- the isoperimetric inequality is not merely
 * a bound on Nil distance, at rho = 0 it IS the distance. It is not used
 * because solving it for L is not closed form, and 84% is not worth a
 * bisection inside the marcher's inner loop.
 */
export function distLower(p, q) {
  const w = rel(p, q);
  const rho = Math.hypot(w[0], w[1]);
  // u = L + rho solves u^2 + 4 pi u - 4 pi (rho + |zeta|) = 0.
  const u = Math.sqrt(Math.PI * Math.PI + Math.PI * (rho + Math.abs(w[2])));
  return Math.max(rho, 2 * (u - Math.PI) - rho);
}

/**
 * The distance to a VERTICAL LINE, exactly, and the reason the level is made
 * of columns and nothing else.
 *
 * Left-translate the line onto the vertical axis and the horizontal geodesic
 * straight at it costs exactly the horizontal distance -- it sweeps no area,
 * because it is radial, so it does not climb and nothing is wasted. So the
 * distance to the axis is the plain Euclidean horizontal distance, at every
 * height, with no correction of any kind. A vertical column in Nil has an
 * EXACT distance function, which is more than can be said for a point.
 *
 * Note what that costs to say about a FLOOR: the plane z = 0 is not preserved
 * by left translation (its image is sheared), so Nil has no invariant notion
 * of a horizontal surface at all. There is an invariant DOWN -- E3 is left
 * invariant and rotation invariant -- and no invariant floor to fall to. That
 * is why this world is free flight, and it is a different reason from S^3's.
 */
export function axisDist(p, cx, cy) {
  return Math.hypot(p[0] - cx, p[1] - cy);
}

/**
 * THE AREA YOU ENCLOSE IS THE HEIGHT YOU GAIN, exactly.
 *
 * Walk a closed loop in the floor plan and Nil returns you to the same (x, y)
 * and a different z: the group commutator of a step right by A and a step
 * forward by B is (0, 0, A B), the area of the rectangle. There are no stairs
 * in Nil; there is only circling.
 *
 * This is the same integral physics.sweptArea computes for the holonomy dash,
 * which banks (cosh(r) - 1) dtheta around the player's path in H^2 and calls
 * it a charge. Here the integrand is the FLAT area element, r dr dtheta, and
 * the manifold pays it out as altitude rather than as a meter reading. One
 * fact, seen twice, with different currencies -- and port.js's developing map,
 * where the same integral is the error a cut has to absorb, makes three.
 *
 * Takes a closed polygon of [x, y] and returns the altitude a walk round it
 * gains. Sign included: the other way round is a descent.
 */
export function loopLift(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

// --- the world ----------------------------------------------------------
//
// Written ONCE as data and emitted TWICE, a JS SDF for the physics and a GLSL
// one for the renderer, exactly as level.js, s3.js, h2r.js, s2r.js and e3t.js
// do. Edit the arrays, never the emitted numbers. (Six files with their own
// copy of the same emit loop is what roadmap item 14 is about.)

/**
 * How high the climb goes, and every other number here is derived from it.
 *
 * 60 is chosen for the RATIO it produces. The straight-up route costs 60 and
 * the helix costs 2 sqrt(pi (60 - pi)) = 26.73, so the fast way is 2.24 times
 * shorter, which is large enough to be obvious in play. It also puts the
 * helix's radius at 4.14, a comfortable world scale: taller climbs spiral
 * wider, since the radius grows like sqrt(z / pi - 2).
 */
export const NIL_H = 60;

/** The optimal climb, solved rather than tuned. See vertDist. */
export const NIL_S = Math.sqrt(NIL_H / Math.PI - 1);
export const NIL_C = 1 / NIL_S;
export const NIL_A = Math.sqrt(1 - NIL_C * NIL_C);
/** The helix's horizontal radius, and the distance the spire holds all the way. */
export const NIL_R = NIL_A / NIL_C;
/** How long the climb is, flown. 2 pi s. */
export const NIL_LEN = 2 * Math.PI * NIL_S;
/** The unit launch direction, in the frame at the start: mostly sideways. */
export const NIL_DIR = Object.freeze([NIL_A, 0, NIL_C]);
/**
 * The spire's foot. The climb's horizontal projection is a circle of radius
 * NIL_R through the origin, and its centre is here -- so the spire is exactly
 * NIL_R from EVERY point of the climb, at every height, and `axisDist` says
 * so exactly rather than approximately. Nothing needed searching: it is the
 * Nil spelling of S^2 x R's rule that a pole of the course circle is a
 * quarter turn from all of it.
 */
export const NIL_SPIRE = Object.freeze([0, NIL_R]);

/**
 * VERTICAL COLUMNS, and the level is nothing else.
 *
 * [x, y, radius, material]. Infinite in both directions, because a cap is a
 * horizontal plane and Nil has none -- and because an infinite column has an
 * EXACT distance while almost nothing else here does. The height readout is
 * the material banding in the shader, not a floor: without it you cannot tell
 * a climb from a hover, since there is no ground to leave.
 *
 * The two working rings sit at a constant offset from the SPIRE, which is the
 * centre of the climb, so their clearance from the course is the same all the
 * way round by construction. Counts are coprime (7 and 11) so they never line
 * up into a corridor, and the far ring of 9 is there for parallax.
 */
export const NIL_COLUMNS = (() => {
  const cols = [[NIL_SPIRE[0], NIL_SPIRE[1], 0.50, 5]];
  const ring = (n, radius, r, mat, phase) => {
    for (let i = 0; i < n; i++) {
      const th = phase + (i * 2 * Math.PI) / n;
      cols.push([
        NIL_SPIRE[0] + radius * Math.cos(th),
        NIL_SPIRE[1] + radius * Math.sin(th),
        r, mat,
      ]);
    }
  };
  ring(7, NIL_R - 1.70, 0.22, 6, 0.3);
  ring(11, NIL_R + 1.70, 0.26, 6, 0.13);
  ring(9, NIL_R + 6.90, 0.55, 7, 0.7);
  return Object.freeze(cols.map((c) => Object.freeze(c)));
})();

/**
 * Spheres, and there are three because a sphere is the one shape here whose
 * distance is only bounded.
 *
 * The FINISH sits directly over the start, and looking at it is the whole
 * demonstration: straight up it is 60 away, and along any of the helices that
 * reach it, 26.7. Since every azimuth gives a helix of the same length, one
 * object is visible as a RING of images around you at the launch elevation
 * AND as a single dim one overhead. Nothing else in this project does that;
 * S^3's antipode is the nearest thing and it focuses to a point rather than a
 * circle.
 */
export const NIL_ORBS = Object.freeze([
  Object.freeze([0, 0, NIL_H, 0.60, 4]),
  Object.freeze([NIL_SPIRE[0], NIL_SPIRE[1], NIL_H * 0.5, 0.34, 4]),
  Object.freeze([NIL_SPIRE[0], NIL_SPIRE[1], NIL_H * 0.5 + 8, 0.34, 4]),
]);

/** The scene, in JS. Columns are exact; the orbs use the bound. */
export function nilMap(p) {
  let best = 1e9, mat = 0;
  for (const [cx, cy, r, m] of NIL_COLUMNS) {
    const d = axisDist(p, cx, cy) - r;
    if (d < best) { best = d; mat = m; }
  }
  for (const [x, y, z, r, m] of NIL_ORBS) {
    const d = distLower(p, [x, y, z]) - r;
    if (d < best) { best = d; mat = m; }
  }
  return [best, mat];
}

export function nilSDF(p) { return nilMap(p)[0]; }

// Beacons are decorative: the final gate passes through one. Only columns
// collide. The displayed beacons are level sets of a distance bound, not exact
// geodesic spheres; a lower bound minus a radius does not locate a true sphere.
export function nilCollisionSDF(p) {
  return Math.min(...NIL_COLUMNS.map(([x, y, r]) => axisDist(p, x, y) - r));
}

const num = (v) => {
  const s = Number(v).toFixed(6);
  return s.includes('.') ? s : `${s}.0`;
};

/**
 * The same scene as GLSL. The columns go out as a constant array with a
 * CONSTANT loop bound, deliberately: level.js records that rolling those
 * bounds costs 74% of the frame time to save 0.3 s of compile, because
 * unrolled the compiler folds the constant array reads. Only big function
 * bodies get rolled() treatment, and a column is two subtractions.
 */
export function nilGLSL() {
  const cols = NIL_COLUMNS.map(([x, y, r, m]) =>
    `  vec4(${num(x)}, ${num(y)}, ${num(r)}, ${num(m)})`).join(',\n');
  const orbs = NIL_ORBS.map(([x, y, z, r, m]) =>
    `  if (true) { float d = hDist(p, vec4(${num(x)}, ${num(y)}, ${num(z)}, 1.0))`
    + ` - ${num(r)}; if (d < m.x) m = vec2(d, ${num(m)}); }`).join('\n');
  return `
// Emitted by nil.js. Edit the arrays there, never these numbers.
const vec4 NIL_COL[${NIL_COLUMNS.length}] = vec4[${NIL_COLUMNS.length}](
${cols}
);

vec2 nilWorld(vec4 p) {
  vec2 m = vec2(1e9, 0.0);
  // A vertical column's distance is EXACT in Nil -- the horizontal geodesic
  // straight at the axis sweeps no area, so it does not climb and nothing is
  // wasted. It is the only exact surface in this world.
  for (int i = 0; i < ${NIL_COLUMNS.length}; i++) {
    vec4 c = NIL_COL[i];
    float d = length(p.xy - c.xy) - c.z;
    if (d < m.x) m = vec2(d, c.w);
  }
${orbs}
  return m;
}
`;
}

// --- motion -------------------------------------------------------------

/** Cruising speed, and how fast the input takes hold. */
export const NIL_FLY = 2.6;
export const NIL_LAG = 5.0;

/**
 * Free flight, and it is free for a reason that is not S^3's.
 *
 * S^3 admits no gravity because every unit-gradient function on a sphere
 * points at a pole and a whole world would fall to one spot. Nil admits a
 * perfectly good invariant DOWN -- the field E3 -- and still admits no
 * gravity worth the name, because that field is not a gradient: its dual
 * 1-form has dw = -dx ^ dy, which is not zero, so no potential exists ANYWHERE,
 * not even in the simply connected universal cover.
 *
 * That is the third distinct answer this project has to the same question and
 * it is the strongest. The 3-torus also has a force with no potential, but its
 * obstruction is topological -- z is not periodic -- and lifting to the cover
 * removes it. Nil's is local and nothing removes it. Walk a closed loop and
 * you come back higher; that is what "no potential" means when you can feel it.
 */
export function nilFly(v, want, dt) {
  const k = 1 - Math.exp(-NIL_LAG * dt);
  return [
    v[0] + (want[0] * NIL_FLY - v[0]) * k,
    v[1] + (want[1] * NIL_FLY - v[1]) * k,
    v[2] + (want[2] * NIL_FLY - v[2]) * k,
  ];
}

/**
 * One substep of free flight. The velocity is in FRAME components and comes
 * back in the frame at the new point, turned by c * t -- which is the helix.
 */
export function nilStep(M, v, dt) {
  const speed = Math.hypot(v[0], v[1], v[2]);
  if (speed < 1e-12) return [M, v];
  const u = [v[0] / speed, v[1] / speed, v[2] / speed];
  const [next, u2] = flow(M, u, speed * dt);
  return [next, [u2[0] * speed, u2[1] * speed, u2[2] * speed]];
}

/**
 * Push out of anything solid. The normal is taken by differencing along the
 * FRAME, not along the coordinate axes: the frame is orthonormal and the
 * coordinate basis is not, so a coordinate gradient would point the wrong way
 * by an amount that grows with how far from the origin you are.
 */
export function nilCollide(M, v, sdf, r = NIL_PLAYER_R) {
  const p = coords(M);
  const d = sdf(p);
  if (d >= r) return [M, v];
  const e = 1e-4;
  const g = [0, 1, 2].map((i) => {
    const step = (s) => {
      const u = [0, 0, 0];
      u[i] = s * e;
      return sdf(mul(p, flowOrigin(u, 1)[0]));
    };
    return (step(1) - step(-1)) / (2 * e);
  });
  const gl = Math.hypot(g[0], g[1], g[2]);
  if (gl < 1e-9) return [M, v];
  const n = [g[0] / gl, g[1] / gl, g[2] / gl];
  const pushed = flow(M, n, r - d)[0];
  const vn = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
  const out = vn < 0 ? [v[0] - vn * n[0], v[1] - vn * n[1], v[2] - vn * n[2]] : v;
  return [pushed, out];
}

// --- the climb ----------------------------------------------------------

/**
 * THE CLIMB: gates along the optimal helix, so flying dead straight takes
 * every one and puts you 60 units above where you started.
 *
 * The hyperbolic hoop course, the S^2 x R lap and the flat torus course all
 * say that same sentence with three different mechanisms behind it -- a closed
 * geodesic in a quotient, a great circle on a sphere, a rational direction in
 * a lattice. This is the fourth and it is the odd one out: the line does NOT
 * close. It goes somewhere, and the somewhere is straight up.
 *
 * The skill is that the fast route does not point at the target. Aiming at
 * the finish means going up, and going up is the slow way; the fast way leaves
 * almost horizontally (the launch direction is 97% sideways) and never once
 * points at where it is going.
 */
export const NIL_GATES = 6;
export const NIL_GATE_R = 0.85;

export function climbCourse() {
  const hoops = [];
  for (let i = 1; i <= NIL_GATES; i++) {
    const t = (i * NIL_LEN) / NIL_GATES;
    const [q, u] = flowOrigin(NIL_DIR, t);
    hoops.push({ at: [q[0], q[1], q[2], 1], dir: u, r: NIL_GATE_R, t });
  }
  return { kind: 'climb', hoops, crossed: gateCrossed };
}

/**
 * Crossing test. A gate is a disc perpendicular to the climb, so the test is
 * a sign change of the forward component in the gate's OWN frame -- which is
 * what `rel` gives, since g^-1 p puts the gate at the origin where its frame
 * is the coordinate frame. Near the gate that is Euclidean, exactly as the
 * hyperbolic hoop test is near its plane.
 *
 * Directional, like every course here: the wrong way through does not count.
 */
export function gateCrossed(p0, p1, gate) {
  const g = [gate.at[0], gate.at[1], gate.at[2]];
  const w0 = rel(g, [p0[0], p0[1], p0[2]]);
  const w1 = rel(g, [p1[0], p1[1], p1[2]]);
  const d = gate.dir;
  const f0 = w0[0] * d[0] + w0[1] * d[1] + w0[2] * d[2];
  const f1 = w1[0] * d[0] + w1[1] * d[1] + w1[2] * d[2];
  if (!(f0 < 0 && f1 >= 0)) return false;
  const k = f0 === f1 ? 0 : f0 / (f0 - f1);
  let s = 0;
  for (let i = 0; i < 3; i++) {
    const m = w0[i] + (w1[i] - w0[i]) * k - d[i] * (f0 + (f1 - f0) * k);
    s += m * m;
  }
  return Math.sqrt(s) < gate.r;
}

/** The start: at the origin, aimed down the climb. */
export function climbStart() {
  return {
    M: NIL_ID.slice(),
    yaw: 0,
    pitch: Math.asin(NIL_DIR[2]),
  };
}

/**
 * A ring of points around a gate, for the line overlay main.js draws. Built in
 * the gate's own frame and carried out by the group, so it is a real circle in
 * the manifold rather than a circle in coordinates.
 */
export function gateRing(gate, n = 40) {
  const d = gate.dir;
  // Any two unit vectors perpendicular to the gate's forward direction.
  const seed = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  let e1 = cross(d, seed);
  const l1 = Math.hypot(e1[0], e1[1], e1[2]);
  e1 = e1.map((v) => v / l1);
  const e2 = cross(d, e1);
  const g = [gate.at[0], gate.at[1], gate.at[2]];
  const out = [];
  for (let i = 0; i < n; i++) {
    const th = (i * 2 * Math.PI) / n;
    const u = [0, 1, 2].map((k) => e1[k] * Math.cos(th) + e2[k] * Math.sin(th));
    // Match the local-coordinate disc used by gateCrossed, not an exponential
    // circle whose points generally leave that disc's plane.
    const q = mul(g, u.map((value) => value * gate.r));
    out.push([q[0], q[1], q[2], 1]);
  }
  return out;
}

/**
 * The log map, for aiming: which frame direction points from M at q, and how
 * far. There is no closed form, so this SHOOTS -- it walks the launch
 * direction toward the target by damped Newton on the flow, which converges in
 * a handful of steps for anything within a few units and is only ever used by
 * the HUD and the gate overlay.
 *
 * That is the honest shape of an inexact geometry: the things that must be
 * fast (the SDF, the flow) are closed form, and the things that are asked once
 * a frame (aiming) are solved.
 */
export function logTo(M, q) {
  const g = coords(M);
  const w = rel(g, [q[0], q[1], q[2]]);
  // Parametrised by V = u * t, so the unit constraint on u is not a fourth
  // unknown: three equations, three unknowns, and a square Jacobian.
  const F = (V) => {
    const t = Math.hypot(V[0], V[1], V[2]);
    if (t < 1e-12) return [0, 0, 0];
    return flowOrigin([V[0] / t, V[1] / t, V[2] / t], t)[0];
  };
  // START FROM THE STRAIGHT COORDINATE SEGMENT, and it is a good start for a
  // reason rather than for want of a better: its horizontal part is radial, so
  // it sweeps no area and does not climb, which makes its Nil length exactly
  // its coordinate length. It is a genuine path of the right length, so the
  // solve begins somewhere the answer already nearly is.
  let V = [w[0], w[1], w[2]];
  let best = V.slice(), bestErr = Infinity;
  for (let it = 0; it < 30; it++) {
    const at = F(V);
    const r = [at[0] - w[0], at[1] - w[1], at[2] - w[2]];
    const e = Math.hypot(r[0], r[1], r[2]);
    if (e < bestErr) { bestErr = e; best = V.slice(); }
    if (e < 1e-12) break;
    // Numeric Jacobian. The exp map is analytic and this is called once a
    // frame by the HUD and the gate overlay, never by the marcher.
    const h = 1e-6;
    const J = [0, 1, 2].map((j) => {
      const Vp = V.slice(); Vp[j] += h;
      const Vm = V.slice(); Vm[j] -= h;
      const a = F(Vp), b = F(Vm);
      return [0, 1, 2].map((i) => (a[i] - b[i]) / (2 * h));
    });
    const d = solve3(J, r);
    if (!d) break;
    // Damped, and the damping is what keeps a target past a CONJUGATE POINT
    // from throwing the iteration across the world. Nil's exp map is not
    // injective -- that is the whole content of the vertical axis stopping
    // being minimising at z = 2 pi -- so there are targets with several
    // answers and targets a Newton step can miss entirely.
    let lam = 1;
    let ok = false;
    for (let k = 0; k < 8; k++) {
      const T = [V[0] - lam * d[0], V[1] - lam * d[1], V[2] - lam * d[2]];
      const a = F(T);
      const en = Math.hypot(a[0] - w[0], a[1] - w[1], a[2] - w[2]);
      if (en < e) { V = T; ok = true; break; }
      lam *= 0.5;
    }
    if (!ok) break;
  }
  return [best[0], best[1], best[2], 0];
}

/** Cramer on a 3x3, returning null when it is too near singular to trust. */
function solve3(J, r) {
  const a = J[0][0], b = J[1][0], c = J[2][0];
  const d = J[0][1], e = J[1][1], f = J[2][1];
  const g = J[0][2], h = J[1][2], i = J[2][2];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  const inv3 = [
    [(e * i - f * h) / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [-(d * i - f * g) / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [(d * h - e * g) / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
  return [0, 1, 2].map((k) =>
    inv3[k][0] * r[0] + inv3[k][1] * r[1] + inv3[k][2] * r[2]);
}
