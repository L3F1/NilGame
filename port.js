// port.js — reading a EUCLIDEAN map as a map of a curved space.
//
// The standing question this file answers: a level is drawn flat, on a grid,
// in whatever a person or a tool naturally draws in. What does it become in
// H^2, in S^2, in the floor of one of this project's worlds?
//
// THE HONEST ANSWER FIRST, because it saves the wasted attempt: there is no
// isometric embedding. A flat map cannot be laid on a curved surface without
// changing SOMETHING, and Gauss's Theorema Egregium says so in one line -
// curvature is intrinsic, so any distance-preserving map between two surfaces
// of different curvature does not exist. This is the same fact as an orange
// peel not lying flat.
//
// So the question is not "which embedding is right" but "WHICH PROPERTY DO
// YOU WANT KEPT". Three classical answers, and each one is EXACT in one thing
// and wrong in the others:
//
//   embedding      exact                            distorted
//   ------------------------------------------------------------------------
//   polar          distance and bearing FROM THE     everything transverse,
//                  CENTRE -- it is the exponential   by sinh(r)/r, so a ring
//                  map, so a radius is a radius      is stretched around
//   conformal      ANGLES, everywhere. A right       scale, by 2/(1-u^2), so
//   (Poincare /    angle stays a right angle and     rooms shrink toward the
//    stereographic) a square corner still reads      rim of the disc
//                  square, at every point
//   projective     STRAIGHTNESS. A straight wall     angles and distances
//   (Klein /       stays a geodesic, a corner stays  both -- a right angle
//    gnomonic)     a corner, and a sightline that    is not preserved
//                  was clear stays clear
//
// **The projective one is usually what a level wants**, and that is not a
// matter of taste: a map made of straight walls is a map whose entire meaning
// is which straight lines exist. In the Klein model a Euclidean chord of the
// disc IS a hyperbolic geodesic, so every wall stays a wall, every corner
// stays a corner, every room stays convex and every sightline that was blocked
// stays blocked. What changes is the metric, which is exactly what you asked
// for by porting it into a curved space at all. The conformal one is the
// choice when the map is about SHAPES rather than lines - a spiral, a curve, a
// logo - and the polar one when it is about RANGES from one place.
//
// **In E^2 all three are the same map**, and that is not a coincidence to
// mention in passing, it is the control: the difference between them IS the
// curvature. `port.test.js` asserts it.
//
// The output is always GEODESIC POLAR (a, b) about the domain centre, which is
// what `level.js`, `h2r.js` and `s3.js` already author in: `|(a,b)|` is the
// true distance and the direction is honest. So a ported map goes straight
// into any of them, and `translation([a, b, z])` does the rest.

import { CURV } from './geom.js';

/** The three families. Names are the classical ones. */
export const EMBED = {
  POLAR: 'polar',
  CONFORMAL: 'conformal',
  PROJECTIVE: 'projective',
};

/**
 * The RADIAL PROFILE of each embedding: flat radius u -> curved radius r.
 *
 * Every one of the three is a pure function of the radius, with the bearing
 * carried through untouched. That is what makes them comparable at all, and it
 * is why the whole file is one small table rather than three projections.
 *
 * The hyperbolic and spherical columns are the same formulas with sinh and
 * tanh swapped for sin and tan, exactly as `geom.js` swaps them everywhere
 * else. The flat column is the identity three times over.
 *
 *                    hyperbolic          flat      spherical
 *   polar            u                   u         u
 *   conformal        2 atanh(u)          u         2 atan(u)
 *   projective       atanh(u)            u         atan(u)
 *
 * The domains differ and they matter. Polar takes any u in H^2 and any u below
 * pi in S^2. Conformal and projective take the unit disc in H^2 (u < 1) and
 * the whole plane in S^2 -- where the projective one covers exactly the open
 * HEMISPHERE, because a gnomonic projection sees half a sphere and no more.
 */
export function radialProfile(kind, k) {
  if (k === 0) return (u) => u;
  if (kind === EMBED.POLAR) return (u) => u;
  if (k < 0) {
    // atanh blows up at 1 and the caller has to stay inside the disc. Clamping
    // silently would hand back a finite answer for a point that is outside the
    // model, which is worse than a NaN: the level would build and be wrong.
    if (kind === EMBED.CONFORMAL) return (u) => 2 * Math.atanh(u);
    return (u) => Math.atanh(u);
  }
  if (kind === EMBED.CONFORMAL) return (u) => 2 * Math.atan(u);
  return (u) => Math.atan(u);
}

/**
 * The largest flat radius this embedding can take, or Infinity.
 *
 * Not a detail. The hyperbolic disc models have a HARD edge at u = 1 that is
 * infinitely far away in the metric, so a map scaled to touch it does not
 * merely look wrong, it has a wall at infinite distance in it.
 */
export function domainRadius(kind, k) {
  if (k === 0 || kind === EMBED.POLAR) return k > 0 ? Math.PI : Infinity;
  return k < 0 ? 1 : Infinity;
}

/**
 * Build the map: flat (x, y) -> geodesic polar (a, b).
 *
 * `scale` is the one design lever and it is a large one. It says how much of
 * the model disc the map is allowed to fill, and in the curved cases that is
 * the same thing as saying HOW HYPERBOLIC IT FEELS: a map squeezed into the
 * middle of a Poincare disc is nearly flat, and the same map spread to 0.9 of
 * the radius has corners several units apart that look adjacent.
 *
 * Use `fitScale` rather than guessing it.
 */
export function embedding(kind, k, scale = 1) {
  const prof = radialProfile(kind, k);
  const lim = domainRadius(kind, k);
  return (x, y) => {
    const rho = Math.hypot(x, y);
    if (rho < 1e-15) return [0, 0];
    const u = rho * scale;
    if (!(u < lim)) {
      throw new RangeError(
        `port: (${x}, ${y}) scaled to ${u.toFixed(4)}, outside this model's `
        + `domain of ${lim}. Lower the scale, or use fitScale.`);
    }
    const r = prof(u);
    return [r * x / rho, r * y / rho];
  };
}

/**
 * Pick a scale so the whole map lands inside a target radius.
 *
 * `fill` is how much of the available room to use, and the default of 0.9 is
 * deliberately short of 1: in the disc models the last tenth of the radius is
 * most of the space, so a map pushed to the rim has its outermost content
 * enormously far from everything else.
 *
 * The target is a CURVED radius -- an inradius, in this project's terms -- so
 * this inverts the profile rather than scaling in the flat plane. That is the
 * whole point: asking "what flat scale puts my furthest wall 1.4 units from
 * the centre" is a different question in each geometry, and it is the question
 * the clearance rule in CLAUDE.md is actually asking.
 */
export function fitScale(points, kind, k, targetR, fill = 0.9) {
  let far = 0;
  for (const [x, y] of points) far = Math.max(far, Math.hypot(x, y));
  if (far < 1e-15) return 1;
  const want = targetR * fill;
  // Invert the profile at `want` to get the flat radius that reaches it.
  let u;
  if (k === 0 || kind === EMBED.POLAR) u = want;
  else if (k < 0) u = kind === EMBED.CONFORMAL ? Math.tanh(want / 2) : Math.tanh(want);
  else u = kind === EMBED.CONFORMAL ? Math.tan(want / 2) : Math.tan(want);
  return u / far;
}

/**
 * Port a whole map: a list of flat (x, y) into a list of geodesic polar (a, b).
 *
 * Returns the points AND the scale used, because the scale is what a caller
 * has to keep if it wants to port anything else into the same world later --
 * two batches ported at different scales do not line up.
 */
export function portPoints(points, kind, k, targetR, fill = 0.9) {
  const scale = fitScale(points, kind, k, targetR, fill);
  const f = embedding(kind, k, scale);
  return { scale, points: points.map(([x, y]) => f(x, y)) };
}

// --- measuring what each one costs ---------------------------------------
//
// The reason this file has a measurement half at all: "the projective one
// keeps straight lines straight" is a claim, and a claim about a coordinate
// change is exactly the kind that is easy to get subtly wrong and impossible
// to see in a picture. Every property in the table at the top is checked here
// against the real geometry rather than against the formula it came from.

/**
 * How far off a geodesic the ported MIDPOINT of a flat segment lands.
 *
 * This is the straightness test, and it is the one that separates the three.
 * Take flat A and B, take their flat midpoint M, port all three, and ask how
 * far port(M) is from the geodesic joining port(A) to port(B).
 *
 * For the PROJECTIVE embedding the answer is zero to machine precision, at
 * every scale and every position, because that is the defining property of the
 * Klein and gnomonic models: a Euclidean chord IS a geodesic. For the other
 * two it is not, and the miss grows with how much of the disc the map fills.
 *
 * Note what is NOT claimed: port(M) is not the geodesic MIDPOINT. Straightness
 * and distance are different properties and no embedding keeps both.
 */
export function straightnessError(G, f, a, b) {
  const A = G.point(G.translation(...toArgs(G, f(a[0], a[1]))));
  const B = G.point(G.translation(...toArgs(G, f(b[0], b[1]))));
  const mid = f((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  const M = G.point(G.translation(...toArgs(G, mid)));
  return distToGeodesic(G, M, A, B);
}

/**
 * The local stretch of an embedding, radially and tangentially, at flat
 * radius u. The classical Tissot indicatrix, and the thing that says what a
 * small circle drawn on the flat map becomes.
 *
 * For a purely radial map r = g(u) the two are exactly
 *
 *     radial      = g'(u)                  along the ray from the centre
 *     tangential  = sinK(g(u)) / u         around it
 *
 * because a circle of radius g(u) has circumference 2*pi*sinK(g(u)) where the
 * flat one had 2*pi*u.
 *
 * `anisotropy` is their ratio, and it is the ONLY honest conformality test:
 * an embedding is conformal exactly when this is 1 at every u. Verified
 * analytically for the hyperbolic conformal profile g = 2 atanh(u):
 * g' = 2/(1-u^2), and sinh(2 atanh u)/u = 2/(1-u^2) as well.
 *
 * Note what the POLAR row says: its tangential stretch is exactly sinh(u)/u,
 * which is the number quoted all over this project. The polar embedding is
 * where that factor comes from.
 */
export function tissot(kind, k, u, h = 1e-6) {
  const g = radialProfile(kind, k);
  const r = g(u);
  const lo = Math.max(u - h, 0);
  const radial = (g(u + h) - g(lo)) / (u + h - lo);
  const sk = k < 0 ? Math.sinh(r) : k > 0 ? Math.sin(r) : r;
  const tangential = u > 1e-12 ? sk / u : radial;
  return { r, radial, tangential, anisotropy: tangential / radial };
}

/**
 * Worst local anisotropy over a map. 1.0 is conformal; further from 1 means a
 * small circle on the flat map comes out as a more elongated ellipse.
 *
 * This is the number to read when the map is about SHAPES -- a curve, a
 * spiral, a room you want to still look like that room. When the map is about
 * LINES, read `straightnessError` instead; they do not both go to zero, and no
 * embedding makes them.
 */
export function shapeReport(kind, k, points, scale) {
  let worst = 1;
  for (const [x, y] of points) {
    const u = Math.hypot(x, y) * scale;
    if (u < 1e-9) continue;
    const a = tissot(kind, k, u).anisotropy;
    if (Math.abs(Math.log(a)) > Math.abs(Math.log(worst))) worst = a;
  }
  return worst;
}

/**
 * The angle a ported CORNER has once its two walls have become geodesics.
 *
 * Read this as a cost, not as a conformality test -- the distinction is worth
 * stating because it looks like one. A conformal embedding preserves the angle
 * between two CURVES, and the curve a straight wall becomes under the
 * conformal map is not a geodesic; replace it with the geodesic joining its
 * endpoints, which is what a wall in this project actually is, and the angle
 * moves. Measured on a unit square ported to inradius 1.4, all three
 * embeddings put a right-angled corner at about 55 degrees.
 *
 * AND NO EMBEDDING CAN FIX THAT, which is the useful part. A hyperbolic
 * quadrilateral has angle sum strictly less than 2*pi, so a square room with
 * four right angles DOES NOT EXIST in H^2 at all. Any map that keeps the walls
 * straight must lose the right angles, and any map that keeps the right angles
 * must bend the walls. If a ported level needs both, it needs re-authoring,
 * not re-projecting.
 *
 * The same statement with the inequality reversed holds in S^2, where the
 * angle sum exceeds 2*pi and the corners come out too WIDE.
 */
export function cornerAngle(G, f, a, b, c) {
  const B = G.translation(...toArgs(G, f(b[0], b[1])));
  const A = G.point(G.translation(...toArgs(G, f(a[0], a[1]))));
  const C = G.point(G.translation(...toArgs(G, f(c[0], c[1]))));
  const u = G.logTo(B, A), v = G.logTo(B, C);
  const nu = Math.hypot(u[0], u[1], u[2]), nv = Math.hypot(v[0], v[1], v[2]);
  if (nu < 1e-12 || nv < 1e-12) return 0;
  const cos = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (nu * nv);
  return Math.acos(Math.max(-1, Math.min(1, cos)));
}

/** The flat angle at b in the corner a-b-c, in radians. */
export function flatAngle(a, b, c) {
  const ux = a[0] - b[0], uy = a[1] - b[1];
  const vx = c[0] - b[0], vy = c[1] - b[1];
  const nu = Math.hypot(ux, uy), nv = Math.hypot(vx, vy);
  if (nu < 1e-15 || nv < 1e-15) return 0;
  const cos = (ux * vx + uy * vy) / (nu * nv);
  return Math.acos(Math.max(-1, Math.min(1, cos)));
}

/**
 * The worst, best and mean ratio of ported distance to flat distance, over
 * every pair. 1.0 everywhere would be an isometry, which cannot exist.
 *
 * Read it as the price list. A spread of 0.9 to 1.1 is a map that still plays
 * like the flat one with the geometry showing at the edges; a spread of 0.6 to
 * 6 is a different level that happens to share a floor plan.
 */
export function distanceReport(G, f, points) {
  const P = points.map(([x, y]) => G.point(G.translation(...toArgs(G, f(x, y)))));
  let worst = 0, best = Infinity, sum = 0, n = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const flat = Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]);
      if (flat < 1e-12) continue;
      const ratio = G.dist(P[i], P[j]) / flat;
      worst = Math.max(worst, ratio);
      best = Math.min(best, ratio);
      sum += ratio; n++;
    }
  }
  return { worst, best, mean: n ? sum / n : 1, pairs: n };
}

/**
 * All three embeddings side by side, for one map, in one geometry.
 *
 * This is the thing to run before choosing, and it is the same discipline as
 * every other layout decision in this project: measure, then pick. The columns
 * are deliberately three DIFFERENT questions -- does a wall stay a wall
 * (`straight`), does a shape stay that shape (`shape`), and what did the
 * distances cost (`worst` and `best`) -- because there is no single number,
 * and pretending otherwise is how you pick the wrong embedding.
 */
export function compare(G, points, corners, segments, targetR, fill = 0.9) {
  const out = {};
  for (const kind of [EMBED.POLAR, EMBED.CONFORMAL, EMBED.PROJECTIVE]) {
    const scale = fitScale(points, kind, G.k, targetR, fill);
    const f = embedding(kind, G.k, scale);
    let straight = 0, corner = 0;
    for (const [a, b] of segments) straight = Math.max(straight, straightnessError(G, f, a, b));
    for (const [a, b, c] of corners) {
      corner = Math.max(corner, Math.abs(cornerAngle(G, f, a, b, c) - flatAngle(a, b, c)));
    }
    const d = distanceReport(G, f, points);
    out[kind] = {
      scale: +scale.toFixed(4),
      worst: +d.worst.toFixed(3),
      best: +d.best.toFixed(3),
      straight: +straight.toFixed(6),
      shape: +shapeReport(kind, G.k, points, scale).toFixed(3),
      cornerDeg: +(corner * 57.2958).toFixed(2),
    };
  }
  return out;
}

// --- helpers --------------------------------------------------------------

/**
 * `geom.js` translation takes a single vector; `hyp.js` takes a unit and a
 * distance. This file speaks the geom.js dialect, and the two-argument form is
 * kept out of it deliberately: routing a (unit, distance) pair through the
 * single-vector form multiplies them together only to divide them apart again,
 * which is not the identity in floating point.
 */
const toArgs = (G, ab) => [[ab[0], ab[1], 0]];

/**
 * Perpendicular distance from p to the geodesic through a and b.
 *
 * Formed as a VECTOR first and then measured, never through the closed form
 * sinh^2 = <p,q>^2 - 1: that is algebraically right and numerically awful,
 * because it cancels terms of size cosh^2 and then takes a square root. Same
 * lesson as hyp.distToAxis, one dimension down.
 */
export function distToGeodesic(G, p, a, b) {
  // Both logs are taken at the SAME point, so the answer does not depend on
  // which frame a is given -- changing it rotates both vectors together.
  const A = G.translation(G.log(a));
  const u = G.logTo(A, b), w = G.logTo(A, p);
  const nu = Math.hypot(u[0], u[1], u[2]);
  const nw = Math.hypot(w[0], w[1], w[2]);
  if (nu < 1e-14) return G.dist(p, a);
  if (nw < 1e-14) return 0;
  // sin(theta) from the CROSS PRODUCT, never from sqrt(1 - cos^2). The angle
  // this is asked about is usually near zero -- that is what "the point is on
  // the line" means -- and there cos comes back as 1 - 1e-16, so the square
  // root returns 1e-8 and the straightness test reads 3.55e-8 instead of the
  // exact zero it should. The cross product loses nothing at a small angle.
  const cx = u[1] * w[2] - u[2] * w[1];
  const cy = u[2] * w[0] - u[0] * w[2];
  const cz = u[0] * w[1] - u[1] * w[0];
  const sin = Math.hypot(cx, cy, cz) / (nu * nw);
  // THE PERPENDICULAR COMPONENT OF THE LOG IS NOT THE DISTANCE, and it is
  // worth being explicit because it looks like it should be. Splitting log_a(p)
  // into parts along and across the axis and taking the norm of the second is
  // the FLAT answer, done in the tangent space at a; it underestimates, by
  // 0.299 against a true 0.35 in the test that caught it.
  //
  // The right relation is the one for a right triangle with hypotenuse rho and
  // opposite angle theta, which is a single line in all three curvatures:
  //
  //     sinK(d) = sinK(rho) * sin(theta)
  //
  // and it degenerates to d = rho sin(theta) at k = 0, which is why the flat
  // answer looks right until it is measured.
  return G.asinK(G.sinK(nw) * sin);
}


// --- the fourth strategy: DEVELOPING the map ------------------------------
//
// The three embeddings above are all radial: r = g(u) with the bearing carried
// through, measured from ONE centre. That suits a compact blob and it crushes
// anything extended, because a corridor's distortion is set by how far it
// happens to be from a centre that has nothing to do with it.
//
// A designer reaching for a different guarantee usually wants this one:
//
//   KEEP EVERY EDGE LENGTH AND EVERY TURN ANGLE, EXACTLY.
//
// A corridor 8 long is 8 long, a right-hand turn is 90 degrees, and both hold
// everywhere on the map rather than near a chosen origin. That is a DEVELOPING
// MAP: unroll the flat instructions into the curved space one edge at a time,
// carrying the frame along.
//
// It has exactly one cost, it is not negotiable, and it is worth more as a
// thing to understand than the other three put together:
//
//   THE LOOP DOES NOT CLOSE, AND THE GAP IS THE AREA IT ENCLOSES.
//
// Walk a flat rectangle -- four edges, four right turns -- and you are back
// where you started. Develop the same instructions into H^2 and you are not.
// That is not accumulated error and no amount of care removes it; it is
// Gauss-Bonnet. A geodesic n-gon in H^2 has angle sum (n-2)pi MINUS its area,
// so a polygon whose angles are the flat ones has nowhere to be.
//
// It is also, exactly, the quantity the holonomy dash banks. `sweptArea` in
// physics.js integrates (cosh(r) - 1) dtheta around the player's path and
// calls the result a charge; `developClosure` here composes isometries around
// a path and calls the result an error. Same integral, opposite attitude. A
// map that cannot be ported and an ability that only exists here are one fact
// seen twice.
//
// So: DEVELOP ALONG A SPANNING TREE AND THE PORT IS EXACT. Any part of a map
// with no loops in it -- a corridor, a branch, a dead end, a whole tree of
// rooms -- ports with every length and every angle intact. Only the CYCLES
// cannot be satisfied, and there are exactly (edges - nodes + 1) of them. Cut
// them, develop the tree, and re-close each cut by hand; `developClosure` says
// how much you are asking each cut to absorb.
//
// The encouraging half: BRANCHING MAPS PORT TO H^2 BETTER THAN TO E^2. A tree
// of rooms needs room that grows exponentially with depth, which is what
// hyperbolic space has and flat space does not -- in E^2 a deep branching
// level has to fold back on itself and crowd. Cycles are what hyperbolic space
// is bad at. Trees are what it is BETTER at.

/**
 * Rotate a placement about its own point, in the floor plane.
 *
 * A RIGHT multiplication, because it acts on the frame rather than on the
 * space: columns 0 and 1 turn into each other, and column 3 -- the point --
 * is untouched. Left-multiplying would move the whole world instead, which is
 * a different thing that happens to look the same at the origin.
 */
export function turnBy(G, M, theta) {
  const c = Math.cos(theta), s = Math.sin(theta);
  const R = G.IDENTITY.slice();
  R[0] = c; R[1] = s;
  R[4] = -s; R[5] = c;
  return G.matMul(M, R);
}

/**
 * Turn a flat path into (length, turn) instructions.
 *
 * The turn recorded for each edge is the SIGNED EXTERIOR ANGLE at its start --
 * how far a walker turns to get onto it, positive to the left. That is the
 * quantity a developing map needs and the quantity Gauss-Bonnet is stated in;
 * the interior angle is pi minus it, and mixing the two up flips every corner.
 *
 * For a closed path the first instruction's turn is the one from the LAST edge
 * onto the first, so developing the whole list returns the frame to the
 * heading it started with. A flat convex polygon's turns sum to 2*pi, which is
 * why E^2 closes exactly and is the control this is checked against.
 */
export function pathInstructions(points, closed = false) {
  const n = points.length;
  const out = [];
  const edges = closed ? n : n - 1;
  for (let i = 0; i < edges; i++) {
    const a = points[i], b = points[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let turn = 0;
    if (i > 0 || closed) {
      const p = points[(i - 1 + n) % n];
      const h0 = Math.atan2(a[1] - p[1], a[0] - p[0]);
      const h1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
      turn = Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0));
    }
    out.push([len, turn]);
  }
  return out;
}

/**
 * Develop instructions into the geometry, keeping every length and turn.
 *
 * Returns the placement after each edge. Every instruction is carried out
 * exactly; what this cannot promise is that a closed path comes back, which is
 * what `developClosure` measures.
 */
export function develop(G, instructions, start = null) {
  let M = start || G.IDENTITY;
  const out = [];
  for (const [len, turn] of instructions) {
    if (turn) M = turnBy(G, M, turn);
    M = G.reorthonormalize(G.geodesic(M, [1, 0, 0], len));
    out.push(M);
  }
  return out;
}

/**
 * How far a developed CLOSED path fails to close.
 *
 * The holonomy of the loop is `inv(start) * end`, which is the identity if and
 * only if the port succeeded. `gap` is how far short of the start it lands and
 * `spin` is how far the frame turned, read off that composite's first column.
 *
 * In E^2 both are zero to machine precision: the instructions describe a
 * closed polygon and flat space has no obstruction to satisfying them. In H^2
 * and S^2 neither is, and for a path small enough to stay linear
 *
 *     spin  ~  k * area
 *
 * measured over squares of side 0.4, 0.2, 0.1 and 0.05: the ratio runs
 * -1.052, -1.013, -1.003, -1.001 in H^2 and +0.946, +0.987, +0.997, +0.999 in
 * S^2. So a hyperbolic port comes back UNDER-turned and a spherical one
 * OVER-turned, which is the same statement as a triangle's angles summing to
 * less or more than pi, because it IS that statement.
 *
 * How to read it when porting: this is how much geometry each CUT EDGE of your
 * map has to absorb. Under a few degrees, close the loop by nudging one
 * corridor and nobody will notice. Over a right angle, the map has a cycle
 * whose area the geometry will not accept, and it needs re-authoring rather
 * than re-projecting.
 */
export function developClosure(G, instructions, start = null) {
  const path = develop(G, instructions, start);
  const M = path[path.length - 1];
  const S = start || G.IDENTITY;
  const T = G.matMul(G.inv(S), M);
  return {
    gap: G.dist(G.point(M), G.point(S)),
    spin: Math.atan2(Math.sin(Math.atan2(T[1], T[0])), Math.cos(Math.atan2(T[1], T[0]))),
    path,
  };
}

/**
 * The closure defect of a regular n-gon of side s, developed.
 *
 * Its own function because it is the CLEAN measurement: the flat polygon's
 * area is known in closed form, so the defect is compared against arithmetic
 * rather than against another simulation. `port.test.js` uses it to pin
 * `spin ~ -k * area` in both curvatures and an exact zero in E^2.
 */
export function polygonDefect(G, n, s) {
  const R = s / (2 * Math.sin(Math.PI / n));   // circumradius of side s
  const pts = Array.from({ length: n }, (_, i) => {
    const th = 2 * Math.PI * i / n;
    return [R * Math.cos(th), R * Math.sin(th)];
  });
  const area = 0.25 * n * s * s / Math.tan(Math.PI / n);
  return { area, ...developClosure(G, pathInstructions(pts, true)) };
}

// --- what the plan's CYCLES cost, if you develop it instead ---------------
//
// The embeddings above are radial and measured from one centre. The other way
// to port a plan is to DEVELOP it: keep every corridor length and every turn
// angle exactly, and accept that loops do not close. See port.js.
//
// Which is better depends entirely on the plan, and this is the number that
// decides it. A plan with no cycles -- a tree of corridors -- develops
// PERFECTLY, with nothing lost at all. A plan with cycles has exactly
// (edges - nodes + components) of them, and each one has to be cut and
// re-closed by hand; the defect below is how much geometry each cut absorbs.
//
// Under a few degrees, nudge one corridor and nobody will notice. Over a right
// angle, the geometry will not accept that loop and it needs re-authoring.

const KEY = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;

/**
 * The fundamental cycles of the segment graph.
 *
 * A spanning forest, then one cycle per non-tree edge -- which is the standard
 * construction and gives exactly (E - V + C) of them, the cycle rank. Every
 * other cycle in the plan is a combination of these, so measuring these
 * measures all of them.
 */
export function fundamentalCycles(segments) {
  const idx = new Map();
  const pts = [];
  const id = (p) => {
    const k = KEY(p);
    if (!idx.has(k)) { idx.set(k, pts.length); pts.push(p); }
    return idx.get(k);
  };
  const edges = segments.map(([a, b]) => [id(a), id(b)]);
  const adj = pts.map(() => []);
  edges.forEach(([u, v], e) => { adj[u].push([v, e]); adj[v].push([u, e]); });

  const parent = new Array(pts.length).fill(-1);
  const parentEdge = new Array(pts.length).fill(-1);
  const seen = new Array(pts.length).fill(false);
  const inTree = new Array(edges.length).fill(false);
  for (let s = 0; s < pts.length; s++) {
    if (seen[s]) continue;
    seen[s] = true;
    const stack = [s];
    while (stack.length) {
      const u = stack.pop();
      for (const [v, e] of adj[u]) {
        if (seen[v]) continue;
        seen[v] = true; parent[v] = u; parentEdge[v] = e; inTree[e] = true;
        stack.push(v);
      }
    }
  }
  // The path from a node up to the root of its tree.
  const up = (u) => { const p = []; for (let x = u; x !== -1; x = parent[x]) p.push(x); return p; };

  const cycles = [];
  edges.forEach(([u, v], e) => {
    if (inTree[e]) return;
    const pu = up(u), pv = up(v);
    const set = new Map(pu.map((x, i) => [x, i]));
    let meet = -1, iv = -1;
    for (let i = 0; i < pv.length; i++) if (set.has(pv[i])) { meet = pv[i]; iv = i; break; }
    if (meet === -1) return;                        // different components
    const loop = [...pu.slice(0, set.get(meet) + 1), ...pv.slice(0, iv).reverse()];
    if (loop.length >= 3) cycles.push(loop.map((i) => pts[i]));
  });
  return cycles;
}

export { CURV };
