// hyp.js — hyperbolic 3-space, hyperboloid model.
// No graphics in this file. Pure math, so it can be tested.
//
//   Minkowski form:  <x,y> = x0*y0 + x1*y1 + x2*y2 - x3*y3
//   H^3           =  { <x,x> = -1, x3 > 0 }
//   ORIGIN o      =  (0,0,0,1)
//
// Two types, and keeping them straight is most of the work:
//
//   POINT      a 4-array on the hyperboloid.
//   PLACEMENT  a 4x4 Lorentz matrix. M*o is where it is, and columns 0,1,2
//              are the orthonormal frame E1,E2,E3 there.
//
// Nil could use one type for both, because Nil IS a group and a point doubles
// as the translation taking the identity to it. H^3 is not a group, so the
// isometry has to be carried separately. Everything else keeps the same shape:
// compute at the origin, then left-multiply by the placement.
//
// Matrices are COLUMN-MAJOR, M[col*4 + row], so they go straight to
// uniformMatrix4fv without a transpose.

export const ORIGIN = [0, 0, 0, 1];
export const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** The ideal point gravity falls toward. Null: <IDEAL,IDEAL> = 0. */
export const IDEAL = [0, 0, 1, 1];

const SIG = [1, 1, 1, -1];

/** Minkowski inner product. */
export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] - a[3] * b[3];
}

export function matMul(A, B) {
  const out = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += A[k * 4 + r] * B[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

export function apply(M, v) {
  const out = [0, 0, 0, 0];
  for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let c = 0; c < 4; c++) s += M[c * 4 + r] * v[c];
    out[r] = s;
  }
  return out;
}

/**
 * Inverse of a Lorentz matrix: eta * M^T * eta. Exact and cheap, and unlike a
 * general 4x4 inverse it cannot drift the result out of O(3,1).
 */
export function inv(M) {
  const out = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) out[c * 4 + r] = SIG[r] * SIG[c] * M[r * 4 + c];
  }
  return out;
}

/** Where a placement is. */
export function point(M) { return [M[12], M[13], M[14], M[15]]; }

/** Frame vector i (0,1,2) of a placement, as an ambient 4-vector. */
export function frameVec(M, i) { return [M[i * 4], M[i * 4 + 1], M[i * 4 + 2], M[i * 4 + 3]]; }

/** Frame components of an ambient tangent vector w at placement M. */
export function toFrame(M, w) {
  const l = apply(inv(M), w);
  return [l[0], l[1], l[2]];
}

/** Ambient tangent vector from frame components at M. */
export function fromFrame(M, f) {
  return apply(M, [f[0], f[1], f[2], 0]);
}

/**
 * Re-orthonormalise a placement. Repeated multiplication drifts a matrix out
 * of O(3,1) and the drift compounds; a game loop must do this periodically or
 * the player slowly stops being anywhere.
 */
export function reorthonormalize(M) {
  const col = [0, 1, 2, 3].map((i) => frameVec(M, i));
  // The point first: it is timelike with <c,c> = -1.
  let n = Math.sqrt(Math.max(-dot(col[3], col[3]), 1e-300));
  col[3] = col[3].map((x) => x / n);
  for (let i = 0; i < 3; i++) {
    // Project out the timelike part. For w with <w,w> = -1 the projection of
    // v is -<v,w>w, so the perpendicular part is v + <v,w>w.
    const d3 = dot(col[i], col[3]);
    col[i] = col[i].map((x, j) => x + d3 * col[3][j]);
    for (let j = 0; j < i; j++) {
      const dj = dot(col[i], col[j]);
      col[i] = col[i].map((x, k) => x - dj * col[j][k]);
    }
    n = Math.sqrt(Math.max(dot(col[i], col[i]), 1e-300));
    col[i] = col[i].map((x) => x / n);
  }
  return [...col[0], ...col[1], ...col[2], ...col[3]];
}

// --- Geodesics ----------------------------------------------------------
//
// This is where hyperbolic space is kind. A geodesic leaving the origin with
// unit tangent u is
//
//     gamma(t) = cosh(t)*o + sinh(t)*u
//
// and that is the whole story. No series, no near-zero branches, no folding.
//
// The translation ALONG that geodesic is a boost: it fixes everything
// perpendicular to u, and acts on span{u, o} as [[cosh, sinh], [sinh, cosh]].
// Its frame is parallel-transported, which is why velocity in frame
// components is CONSTANT along a geodesic here — in Nil it had to spin.

/** The isometry translating distance t along the geodesic from o toward unit u. */
export function translation(u, t) {
  const ch = Math.cosh(t), sh = Math.sinh(t);
  const uu = [u[0], u[1], u[2], 0];
  const out = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let v = r === c ? 1 : 0;
      v += (ch - 1) * uu[r] * uu[c];
      v += sh * (uu[r] * (c === 3 ? 1 : 0) + (r === 3 ? 1 : 0) * uu[c]);
      v += (ch - 1) * (r === 3 ? 1 : 0) * (c === 3 ? 1 : 0);
      out[c * 4 + r] = v;
    }
  }
  return out;
}

/**
 * Placement reached from the ORIGIN by travelling t with frame velocity f.
 * |f| need not be 1; the distance covered is |f|*t.
 */
export function geodesicFromIdentity(f, t) {
  const s = Math.hypot(f[0], f[1], f[2]);
  if (s < 1e-14) return IDENTITY.slice();
  return translation([f[0] / s, f[1] / s, f[2] / s], s * t);
}

/** Geodesic leaving an arbitrary placement. */
export function geodesic(M, f, t) {
  return matMul(M, geodesicFromIdentity(f, t));
}

/**
 * Exact geodesic flow: [placement, velocity] after time t.
 *
 * The velocity comes back unchanged. That is not a shortcut — the boost
 * carries a parallel frame, so a geodesic's velocity has constant components
 * against it. Nil needed a rotation here because its frame twists.
 */
export function flow(M, v, t) {
  return [matMul(M, geodesicFromIdentity(v, t)), [v[0], v[1], v[2]]];
}

/** The point reached from ORIGIN by frame velocity v after unit time. */
export function exp(v) {
  return point(geodesicFromIdentity(v, 1));
}

/**
 * Inverse of exp: frame components v with exp(v) === r, for r given in the
 * origin's own coordinates. |v| is the distance.
 *
 * Closed form, exact, and it cannot fail. In Nil this was ninety lines of
 * Levenberg-Marquardt that could return null, because Nil's exponential map
 * folds. H^3's is a diffeomorphism.
 *
 * Uses asinh of the spatial part rather than acosh of r[3]: acosh loses all
 * its precision exactly where the answer is small, which is where a rope
 * spends most of its time.
 */
export function log(r) {
  const sp = Math.hypot(r[0], r[1], r[2]);      // = sinh(distance)
  if (sp < 1e-12) return [0, 0, 0];
  const d = Math.asinh(sp);
  const k = d / sp;
  return [r[0] * k, r[1] * k, r[2] * k];
}

/** Frame components pointing from placement M to point q, length = distance. */
export function logTo(M, q) {
  return log(apply(inv(M), q));
}

/**
 * Distance between two points.
 *
 * From <p-q, p-q> = 2(cosh d - 1) = 4 sinh^2(d/2). Well conditioned when the
 * points are close, unlike acosh(-<p,q>) which is not.
 */
export function dist(p, q) {
  const w = [p[0] - q[0], p[1] - q[1], p[2] - q[2], p[3] - q[3]];
  return 2 * Math.asinh(Math.sqrt(Math.max(dot(w, w), 0)) * 0.5);
}

// --- Height, and therefore gravity --------------------------------------
//
// H^3 is isotropic: unlike Nil it hands you no preferred direction at all, so
// "down" has to be CHOSEN. Any function with |grad| = 1 will do — that makes
// gravity a gradient (so energy is conserved) of uniform strength (so it does
// not vary with position the way Nil's did), and makes the floor's SDF exact.
// Two such functions are natural, and both are implemented below.
//
// HOROSPHERE (Busemann). height = log(-<p, IDEAL>). Level sets are
// horospheres, and a horosphere is intrinsically EUCLIDEAN — a genuinely flat
// infinite floor inside a curved space, which sounds ideal.
//
// It is not, and the reason is worth writing down. A horosphere is convex
// toward its ideal point, so the sightline between two points above it DIPS
// BELOW it. From eye altitude h you can see along the ground only
//
//     horizon = sqrt(1 - e^{-2h})
//
// which SATURATES AT 1. Not one unit per something — one unit, ever, however
// high you climb. At a standing altitude of 0.25 that is 0.63, about two and
// a half eye-heights, and it gets worse in eye-heights as you rise. The only
// way out is to make the player tiny against the curvature radius, and then
// nothing looks hyperbolic any more. A horosphere floor cannot have both a
// usable horizon and visible curvature.
//
// GEODESIC PLANE (used here). height = asinh(<p, FLOOR_N>), the signed
// distance to a totally geodesic plane. A totally geodesic plane cuts H^3
// into two CONVEX half-spaces, so a geodesic between two points above the
// floor never leaves that half-space: the ground NEVER blocks line of sight,
// at any range. Level sets are equidistant surfaces, which spread as cosh(t)
// rather than the horosphere's e^t, so climbing is gentler too.
//
// The cost is that the floor is intrinsically H^2 rather than Euclidean, so
// walking on it is hyperbolic. That is the trade taken: an unbounded horizon
// matters more to a game than a Euclidean floor you cannot see across.

/** Unit spacelike normal of the floor plane. */
export const FLOOR_N = [0, 0, 1, 0];

/** Horosphere height. Kept for the Busemann option; see the note above. */
export function busemannHeight(p) { return Math.log(p[3] - p[2]); }
export function busemannGrad(p) {
  const k = p[3] - p[2];
  return [p[0], p[1], p[2] - IDEAL[2] / k, p[3] - IDEAL[3] / k];
}

/** Signed distance to the floor plane. This is the altitude the game uses. */
export function planeHeight(p) { return Math.asinh(p[2]); }

/** Gradient of planeHeight: unit, tangent, and exactly "up". */
export function planeGrad(p) {
  const s = Math.sqrt(1 + p[2] * p[2]);
  return [
    (p[2] * p[0]) / s,
    (p[2] * p[1]) / s,
    (1 + p[2] * p[2]) / s,
    (p[2] * p[3]) / s,
  ];
}

// Swap these two lines to the busemann* pair for a horosphere floor. Nothing
// else in the game needs to change: both are unit-gradient distance
// functions, so gravity, the collision normals and the floor SDF all work the
// same way. The level's coordinates would need re-authoring.
export const height = planeHeight;
export const gradHeight = planeGrad;

/**
 * Distance from p to the geodesic through floor point q perpendicular to the
 * floor — the axis a pillar stands on.
 *
 * sinh(d) = |w|, where w is the part of p perpendicular to the plane
 * span{q, FLOOR_N} that contains the axis:
 *
 *     w = p + <p,q>q - p2*FLOOR_N
 *
 * The algebra collapses to sinh^2(d) = <p,q>^2 - p2^2 - 1, and that closed
 * form is tempting and much worse. It subtracts quantities of size cosh^2 to
 * land on an answer near zero, and then takes a square root, which turns the
 * lost digits into a large ABSOLUTE error — about 5e-6 in float64 at floor
 * radius 3, and far worse in the shader's 32-bit floats.
 *
 * Forming w first moves the cancellation into the vector, where it is benign:
 * w's components go to zero smoothly and its norm is built from small numbers.
 */
export function distToAxis(p, q) {
  const pq = dot(p, q);
  const w = [
    p[0] + pq * q[0],
    p[1] + pq * q[1],
    pq * q[2],
    p[3] + pq * q[3],
  ];
  return Math.asinh(Math.sqrt(Math.max(dot(w, w), 0)));
}

/**
 * Signed distance to a wall: the geodesic plane standing perpendicular to the
 * floor at floor-distance w along axis 0 or 1. Negative on the inside.
 */
export function wallDist(p, axis, w) {
  return Math.asinh(p[axis] * Math.cosh(w) - p[3] * Math.sinh(w));
}

/**
 * Isometry fixing the origin whose spatial part is the minimal rotation
 * taking unit 3-vector a to unit 3-vector b.
 *
 * Needed because a placement's frame is PARALLEL-TRANSPORTED, so walking
 * around slowly tilts E3 away from up. Nil never had this problem: there the
 * player moved by right-multiplication, which carries the frame with the
 * body. Here the frame has to be re-pinned to gravity, and a rotation about
 * the player's own point is the isometry that does it without moving them.
 */
export function rotationBetween(a, b) {
  const v = [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const s2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];

  let R;
  if (s2 < 1e-18) {
    // Parallel, or antiparallel. For antiparallel pick any perpendicular axis.
    if (c > 0) R = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    else {
      let ax = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const d = ax[0] * a[0] + ax[1] * a[1] + ax[2] * a[2];
      ax = ax.map((x, i) => x - d * a[i]);
      const n = Math.hypot(...ax);
      ax = ax.map((x) => x / n);
      // 180 degrees about ax: R = 2*ax*ax^T - I
      R = [];
      for (let col = 0; col < 3; col++) {
        for (let row = 0; row < 3; row++) {
          R.push(2 * ax[row] * ax[col] - (row === col ? 1 : 0));
        }
      }
    }
  } else {
    const k = (1 - c) / s2;
    // Rodrigues: I + [v]x + [v]x^2 * (1-c)/s^2, column-major 3x3.
    const K = [
      [0, -v[2], v[1]],
      [v[2], 0, -v[0]],
      [-v[1], v[0], 0],
    ];
    R = [];
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 3; row++) {
        let kk = 0;
        for (let m = 0; m < 3; m++) kk += K[row][m] * K[m][col];
        R.push((row === col ? 1 : 0) + K[row][col] + k * kk);
      }
    }
  }
  return [
    R[0], R[1], R[2], 0,
    R[3], R[4], R[5], 0,
    R[6], R[7], R[8], 0,
    0, 0, 0, 1,
  ];
}

// --- Level authoring ----------------------------------------------------

// Two charts on the floor plane live below. GEODESIC POLAR (floorPoint /
// fromFloor / placeAt) is radial about the centre and suits a round arena.
// CORRIDOR / Fermi (corridorFloor / fromCorridor / placeCorridor, further
// down) is built about the wrap axis and is the one level.js authors in,
// because s is the direction the world repeats. Both are exact; pick the one
// whose straight lines match the level.

/**
 * A point of the floor plane, in geodesic polar coordinates from its centre.
 *
 * The floor is an H^2, so it cannot be charted by a Euclidean grid. |(a,b)| is
 * the true distance from the centre and the direction is honest, but two floor
 * points are NOT |da, db| apart — that gap is the curvature, and it grows.
 * Author level positions as "this far out, in this direction".
 */
export function floorPoint(a, b) {
  const r = Math.hypot(a, b);
  const sr = r < 1e-12 ? 1 : Math.sinh(r) / r;
  return [sr * a, sr * b, 0, Math.cosh(r)];
}

/**
 * Point at floor position (a, b), raised h above the floor plane.
 *
 * Straight up is the geodesic perpendicular to the floor, and h is true
 * distance along it. Raising by h spreads the floor apart by cosh(h) — the
 * equidistant surface at altitude h carries cosh(h) times the plane's metric.
 */
export function fromFloor(a, b, h) {
  const q = floorPoint(a, b);
  const ch = Math.cosh(h), sh = Math.sinh(h);
  return [ch * q[0], ch * q[1], sh, ch * q[3]];
}

/**
 * A placement at a floor coordinate. Built by translating the origin along
 * the geodesic that reaches it, so the frame arrives parallel-transported.
 */
export function placeAt(a, b, h) {
  return geodesicFromIdentity(log(fromFloor(a, b, h)), 1);
}

// --- The quotient: H^3 / Gamma, a compact 3-manifold ---------------------
//
// Gamma is the fundamental group of a closed GENUS-2 SURFACE, acting on H^3
// through its action on the floor plane. The quotient of the floor is that
// surface; the quotient of the whole space is (genus-2 surface) x R, and once
// the floor and ceiling bound it, the playable manifold is COMPACT.
//
// The fundamental domain is a regular octagon in the floor plane with interior
// angle 2*pi/8 = 45 degrees, opposite sides identified by translation. Eight
// octagons close up around each vertex (8 x 45 = 360), which is what makes the
// identification a surface rather than a cone point. Euler characteristic
// 1 - 4 + 1 = -2, so genus 2.
//
// Why this group and not something easier: every generator is a translation
// along an axis LYING IN THE FLOOR PLANE. Such a translation fixes the p2
// coordinate, so it preserves height, so it preserves gravity. A quotient that
// moved the height function would leave "down" meaning different things in
// different copies and nothing downstream would work.

/** cosh of the octagon's inradius: cos(alpha)/sin(pi/p) with alpha = pi/8. */
const OCT_COSH_R = Math.cos(Math.PI / 8) / Math.sin(Math.PI / 8);
export const OCT_R = Math.acosh(OCT_COSH_R);          // ~1.5286
const OCT_SINH_R = Math.sinh(OCT_R);

/** Translation along the floor direction theta, by distance d. */
export function floorTranslation(theta, d) {
  return translation([Math.cos(theta), Math.sin(theta), 0], d);
}

const OCT_TH = (k) => (k * Math.PI) / 4;

/**
 * Unit spacelike normals of the eight sides. Side k is the geodesic plane
 * perpendicular to the theta_k axis at distance OCT_R, so <p, SIDE[k]> is
 * sinh of the signed distance to it — negative inside the octagon.
 */
export const OCT_SIDE = [...Array(8)].map((_, k) => [
  OCT_COSH_R * Math.cos(OCT_TH(k)),
  OCT_COSH_R * Math.sin(OCT_TH(k)),
  0,
  OCT_SINH_R,
]);

/**
 * Side pairings. Crossing side k puts you in the neighbouring copy; PAIR[k]
 * brings you back, by translating -2*OCT_R along theta_k. Because side k and
 * side k+4 are both perpendicular to that same axis, the pairing is a pure
 * translation — which is the whole reason this octagon was chosen over the
 * usual [a,b][c,d] one, whose pairings are not.
 */
export const OCT_PAIR = [...Array(8)].map((_, k) => floorTranslation(OCT_TH(k), -2 * OCT_R));

/** The generators, for tests and for walking a copy over. */
export const OCT_GEN = [...Array(8)].map((_, k) => floorTranslation(OCT_TH(k), 2 * OCT_R));

/** sinh of the signed distance from p to side k. Negative inside. */
export function sideValue(p, k) { return dot(p, OCT_SIDE[k]); }

/** Distance from p to the nearest side, positive INSIDE the octagon. */
export function domainDepth(p) {
  const S = sides();
  let worst = -1e30;
  for (let k = 0; k < S.length; k++) { const v = dot(p, S[k]); if (v > worst) worst = v; }
  return -Math.asinh(worst);
}

/**
 * Fold a placement into the fundamental domain. Returns [placement, g, n]:
 * the folded placement, the group element that was applied, and how many
 * pairings it took.
 *
 * Greedy Dirichlet reduction — repeatedly cross back over whichever side you
 * are furthest outside. It terminates in about seven steps from anywhere
 * nearby, and it is CANONICAL: reduce(g*p) lands on exactly the same
 * representative as reduce(p) for every g in Gamma. That property is the real
 * proof that the octagon is a fundamental domain, and hyp.test.js checks it.
 *
 * The returned g matters to callers holding other points — the grapple anchor
 * lives in the universal cover, and must be carried by the SAME element the
 * player was folded by, not snapped to whichever copy happens to be nearest.
 */
export function reduceToDomain(M) {
  const S = sides(), P = pairings();
  let g = null, n = 0;
  let p = point(M);
  for (let it = 0; it < 64; it++) {
    let worst = -1, wv = 1e-12;
    for (let k = 0; k < S.length; k++) { const v = dot(p, S[k]); if (v > wv) { wv = v; worst = k; } }
    if (worst < 0) break;
    g = g ? matMul(P[worst], g) : P[worst].slice();
    p = apply(P[worst], p);
    n++;
  }
  if (!g) return [M, IDENTITY.slice(), 0];
  return [reorthonormalize(matMul(g, M)), g, n];
}

// --- Other ways for gravity to point -------------------------------------
//
// Gravity only ever needed a function with |grad| = 1. The floor plane gives
// one, but it is not the only one — H^3 has four natural families, and they
// differ in what their level sets are:
//
//   distance to a PLANE      level sets equidistant surfaces   (the floor)
//   distance to a POINT      level sets spheres                (a beacon)
//   distance to a GEODESIC   level sets tubes                  (a wire)
//   Busemann                 level sets horospheres            (an ideal point)
//
// All four are unit-gradient, so all four give uniform-strength conservative
// gravity and an exact SDF for their level sets. Swapping between them swaps
// what "down" means without touching anything else, which is the whole basis
// of the beacon: it does not bend gravity, it replaces the function gravity is
// the gradient of.
//
// A point field needs no floor at all. Level sets are spheres, so you orbit.

/** Distance from p to q, used as an altitude: up is AWAY from q. */
export function radialHeight(p, q) { return dist(p, q); }

/**
 * Gradient of that distance at p: the unit tangent pointing away from q.
 *
 * grad d = -(q + <q,p> p) / sinh(d). The bracket is q made tangent at p, and
 * its norm is exactly sinh(d), which is why the result is unit without any
 * extra normalisation. Singular at p = q, where "away from q" means nothing.
 */
export function radialGrad(p, q) {
  const c = dot(q, p);
  const s = Math.sqrt(Math.max(c * c - 1, 1e-18));      // = sinh(d)
  return [
    -(q[0] + c * p[0]) / s,
    -(q[1] + c * p[1]) / s,
    -(q[2] + c * p[2]) / s,
    -(q[3] + c * p[3]) / s,
  ];
}

/**
 * The image of q nearest to p, as seen in the quotient, together with which
 * group element produced it.
 *
 * A beacon is a single point of the manifold, but it has infinitely many lifts
 * to H^3, and "toward the beacon" has to mean "toward the nearest one". The
 * search is over the identity and the eight generators, which is enough while
 * p has been folded into the fundamental domain.
 *
 * The result is continuous except on the surface equidistant between two
 * images, where the nearest lift changes. Gravity has a crease there. That is
 * real, not an artefact: the potential min_g d(p, g*q) is continuous, so
 * energy still holds, but the force direction flips across a watershed.
 */
export function nearestImageOf(p, q) {
  let best = q, bd = dist(p, q);
  const GEN = generators();
  for (let k = 0; k < GEN.length; k++) {
    const img = apply(GEN[k], q);
    const d = dist(p, img);
    if (d < bd) { bd = d; best = img; }
  }
  return best;
}

/**
 * Distance from p to the geodesic through q with unit tangent u there.
 *
 * The geodesic is H^3 cut by span{q, u}, a plane of signature (-,+). Splitting
 * p into its part in that plane and the rest, the perpendicular part is
 *
 *     w = p + <p,q> q - <p,u> u
 *
 * and sinh(distance) is its norm. distToAxis is the special case u = FLOOR_N.
 * Formed as a vector before norming, for the same reason as everywhere else:
 * the algebraically equal closed form cancels terms of size cosh^2 and then
 * takes a square root.
 */
export function distToGeodesic(p, q, u) {
  const pq = dot(p, q), pu = dot(p, u);
  const w = [
    p[0] + pq * q[0] - pu * u[0],
    p[1] + pq * q[1] - pu * u[1],
    p[2] + pq * q[2] - pu * u[2],
    p[3] + pq * q[3] - pu * u[3],
  ];
  return Math.asinh(Math.sqrt(Math.max(dot(w, w), 0)));
}

/** Arclength coordinate of p projected onto that geodesic: 0 at q. */
export function alongGeodesic(p, u) { return Math.asinh(dot(p, u)); }

/**
 * The geodesic through two points, as [basepoint, unit tangent] — the form
 * distToGeodesic and alongGeodesic want. The basepoint is a, and the tangent
 * points toward b.
 */
export function geodesicThrough(a, b) {
  const c = dot(a, b);
  const s = Math.sqrt(Math.max(c * c - 1, 1e-18));
  const u = [
    -(b[0] + c * a[0]) / s,
    -(b[1] + c * a[1]) / s,
    -(b[2] + c * a[2]) / s,
    -(b[3] + c * a[3]) / s,
  ];
  return [a.slice(), u.map((x) => -x)];
}

// --- A fully three-dimensional quotient ----------------------------------
//
// The octagon group tessellates the FLOOR and leaves the vertical direction
// alone, so the manifold is (surface) x R: compact sideways, infinite up and
// down. Removing the floor there means falling for ever.
//
// SEIFERT-WEBER dodecahedral space is the fix. Its fundamental domain is a
// regular hyperbolic dodecahedron with dihedral angle 2*pi/5 = 72 degrees, so
// five cells meet around every edge, and opposite faces are glued with a 3/10
// turn. The quotient is a CLOSED hyperbolic 3-manifold: finite volume, no
// boundary, and it repeats in every direction including up and down.
//
// The 3/10 is not decoration. A 1/10 turn on the same solid gives the Poincare
// homology sphere, which is spherical, not hyperbolic; no turn at all does not
// glue up either. hyp.test.js checks that reduction is canonical for 3/10 and
// NOT canonical for 1/10, so a wrong turn cannot pass silently.
//
// The price: a closed hyperbolic 3-manifold admits no invariant unit-gradient
// function, so there is no globally consistent "down" here at all. Plane
// gravity does not descend. Free flight, or a beacon following one lift, are
// the honest options — see physics.js.

const PHI = (1 + Math.sqrt(5)) / 2;

/** The twelve face directions of a dodecahedron: the icosahedron's vertices. */
export const DOD_DIRS = (() => {
  const raw = [];
  for (const s1 of [1, -1]) {
    for (const s2 of [1, -1]) {
      raw.push([0, s1, s2 * PHI], [s1, s2 * PHI, 0], [s2 * PHI, 0, s1]);
    }
  }
  const n = Math.hypot(1, PHI);
  return raw.map((d) => [d[0] / n, d[1] / n, d[2] / n]);
})();

// Adjacent face normals of a dodecahedron meet at arccos(1/sqrt 5); the
// inradius is whatever makes the hyperbolic dihedral angle come out at 72.
const DOD_COSH_R = Math.sqrt((1 + Math.cos((2 * Math.PI) / 5)) / (1 - 1 / Math.sqrt(5)));
export const DOD_R = Math.acosh(DOD_COSH_R);          // ~0.9964

export const DOD_SIDE = DOD_DIRS.map((d) => [
  DOD_COSH_R * d[0], DOD_COSH_R * d[1], DOD_COSH_R * d[2], Math.sinh(DOD_R),
]);

/** Rotation by ang about the spatial axis d, as an isometry fixing the origin. */
export function rotationAbout(d, ang) {
  const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  const [x, y, z] = d;
  const m = [
    t * x * x + c, t * x * y + s * z, t * x * z - s * y,
    t * x * y - s * z, t * y * y + c, t * y * z + s * x,
    t * x * z + s * y, t * y * z - s * x, t * z * z + c,
  ];
  return [
    m[0], m[3], m[6], 0,
    m[1], m[4], m[7], 0,
    m[2], m[5], m[8], 0,
    0, 0, 0, 1,
  ];
}

const DOD_TURN = (6 * Math.PI) / 10;                  // 3/10 of a turn

/** Crossing face k, come back by translating -2R along d_k with a 3/10 turn. */
export const DOD_PAIR = DOD_DIRS.map((d) =>
  matMul(translation(d, -2 * DOD_R), rotationAbout(d, DOD_TURN)));

export const DOD_GEN = DOD_DIRS.map((d) =>
  matMul(rotationAbout(d, -DOD_TURN), translation(d, 2 * DOD_R)));

// --- Which solid is the fundamental domain -------------------------------

export const SOLID = { OCTAGON: 0, DODECAHEDRON: 1 };
let solid = SOLID.OCTAGON;

export function setSolid(s) { solid = s; }
export function getSolid() { return solid; }
/** Face normals of the active fundamental domain. */
export function sides() { return solid === SOLID.DODECAHEDRON ? DOD_SIDE : OCT_SIDE; }
/** Side pairings of the active fundamental domain. */
export function pairings() { return solid === SOLID.DODECAHEDRON ? DOD_PAIR : OCT_PAIR; }
/** Generators of the active group. */
export function generators() { return solid === SOLID.DODECAHEDRON ? DOD_GEN : OCT_GEN; }

/**
 * The CLOSED GEODESICS through the cell centre: their directions, and the
 * length it takes to come back.
 *
 * Every generator is a screw motion whose axis runs through the origin - the
 * octagon's are pure translations by twice its inradius, the dodecahedron's
 * are those composed with a 3/10 turn ABOUT that same axis. Either way the
 * axis is fixed, so the geodesic along it closes up in the quotient after one
 * translation length: leave the centre in direction d, travel 2R, and you are
 * back at the centre travelling in direction d.
 *
 * The frame does NOT come back. The dodecahedron's turn is holonomy, and a
 * boomerang that returns rotated by 108 degrees is that fact, visible.
 *
 * hyp.test.js checks the return to 1e-14 in both worlds.
 */
export function closedGeodesicDirs() {
  if (solid === SOLID.DODECAHEDRON) return DOD_DIRS;
  return [...Array(8)].map((_, k) => {
    const th = OCT_TH(k);
    return [Math.cos(th), Math.sin(th), 0];
  });
}

export function closedGeodesicLength() {
  return 2 * (solid === SOLID.DODECAHEDRON ? DOD_R : OCT_R);
}

/**
 * Fold a POINT into the fundamental domain. Same greedy reduction as
 * reduceToDomain, without the placement.
 *
 * Anything handed to the shader as a world position must go through this. The
 * marcher folds its own sample points, so an unfolded uniform is compared
 * against folded geometry and lands in the wrong place — and worse, an
 * unfolded point drifts a few cells away, its coordinates grow like cosh, and
 * in 32-bit float the distance to it cancels to zero and swallows the screen.
 */
export function foldPoint(p) {
  const S = sides(), P = pairings();
  let q = [p[0], p[1], p[2], p[3]];
  for (let it = 0; it < 64; it++) {
    let worst = -1, wv = 1e-12;
    for (let k = 0; k < S.length; k++) { const v = dot(q, S[k]); if (v > wv) { wv = v; worst = k; } }
    if (worst < 0) break;
    q = apply(P[worst], q);
  }
  return q;
}

/**
 * foldPoint, but it also hands back the group element it folded by.
 *
 * A point on its own can be folded and forgotten. A point that carries a
 * DIRECTION with it - the sightline cutter's plane normal, say - cannot: the
 * normal has to be moved by the same isometry or the plane it defines no
 * longer passes through the point. Returns [folded point, element].
 */
export function foldElement(p) {
  const S = sides(), P = pairings();
  let q = [p[0], p[1], p[2], p[3]];
  let g = null;
  for (let it = 0; it < 64; it++) {
    let worst = -1, wv = 1e-12;
    for (let k = 0; k < S.length; k++) { const v = dot(q, S[k]); if (v > wv) { wv = v; worst = k; } }
    if (worst < 0) break;
    g = g ? matMul(P[worst], g) : P[worst].slice();
    q = apply(P[worst], q);
  }
  return [q, g || IDENTITY.slice()];
}
