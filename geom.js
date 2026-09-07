// geom.js -- one geometry module for curvature -1, 0 and +1.
//
// hyp.js is H^3 written out. This is the same mathematics with the curvature
// left in as a parameter, so that E^3 (flat) and S^3 (spherical) come out of
// the same formulas rather than out of a second copy of the file.
//
// NOTHING IMPORTS THIS YET. It is additive on purpose: hyp.js and the running
// game are untouched, and the first job of the tests is to prove that this
// module agrees with hyp.js to the last digit at k = -1. A geometry layer that
// changes the existing answers is a regression wearing a new coat.
//
//
// THE ONE IDEA
//
// Write the ambient space as R^4 with the bilinear form
//
//     <x,y>_k = x0*y0 + x1*y1 + x2*y2 + k * x3*y3
//
// and the model as { <x,x> = k }, except at k = 0 where it degenerates to the
// affine plane { x3 = 1 }. Then:
//
//     k = -1   <x,x> = -1, form diag(1,1,1,-1)   the hyperboloid; hyp.js
//     k =  0   x3 = 1,     form diag(1,1,1, 0)   flat space, homogeneous coords
//     k = +1   <x,x> = +1, form diag(1,1,1,+1)   the unit 3-sphere in R^4
//
// and the geodesic from the origin o = (0,0,0,1) in a unit direction u is ONE
// formula in all three:
//
//     gamma(t) = cosK(t) * o + sinK(t) * u
//
//     cosK(t) = cosh t | 1 | cos t          sinK(t) = sinh t | t | sin t
//
// with the Pythagorean identity  cosK(t)^2 + k * sinK(t)^2 = 1  holding in all
// three cases: cosh^2 - sinh^2 = 1, 1 + 0 = 1, cos^2 + sin^2 = 1.
//
// Everything else follows. This is not a trick to save typing -- it is why the
// three geometries have the same trigonometry, and the k in front of sinK^2 is
// exactly the curvature.
//
//
// WHY SPHERICAL IS WORTH HAVING, beyond novelty
//
// - S^3 is COMPACT with no quotient at all. Every geodesic closes, at 2*pi.
//   You can see the back of your own head with no group.
// - Its coordinates are BOUNDED BY 1. The hard range limit that caps this
//   whole project -- <p,p> cancelling terms of size e^{2d}, out of digits at
//   d = 16 in float64 and d = 7 in FLOAT32 -- simply does not arise. A level
//   could be any size.
// - Circumference is 2*pi*sinK(r), so in S^3 it grows to a maximum at r = pi/2
//   and then SHRINKS. Past the equator, going wider round a corner is FASTER.
//   Measured for a 90 degree corner: d(arc)/dr is +1.77 in H^3 at r = 0.5 and
//   -0.65 in S^3 at r = 2.0. A corner there has two fast lines and the slow one
//   is through the middle -- which is the exact opposite of every driver's
//   instinct, and the reason racing wants this geometry.

export const CURV = { FLAT: 0, HYPERBOLIC: -1, SPHERICAL: 1 };

// --- linear algebra, which belongs to no geometry -------------------------
//
// A matrix product and a matrix-times-vector do not know what the form is, so
// they are the same code at every curvature -- and, more to the point, they
// are the same code in h2r.js, which is NOT a constant-curvature space and so
// cannot use anything else here. Hoisted to module scope for that one reason.

/** Column-major, M[col*4 + row], so it goes straight to uniformMatrix4fv. */
export function matMul(A, B) {
  const C = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let i = 0; i < 4; i++) s += A[i * 4 + r] * B[c * 4 + i];
      C[c * 4 + r] = s;
    }
  }
  return C;
}

/** M times a 4-vector, column-major. */
export const apply = (M, v) => [
  M[0] * v[0] + M[4] * v[1] + M[8] * v[2] + M[12] * v[3],
  M[1] * v[0] + M[5] * v[1] + M[9] * v[2] + M[13] * v[3],
  M[2] * v[0] + M[6] * v[1] + M[10] * v[2] + M[14] * v[3],
  M[3] * v[0] + M[7] * v[1] + M[11] * v[2] + M[15] * v[3],
];

/** Where a placement is: its column 3. */
export const pointOf = (M) => [M[12], M[13], M[14], M[15]];

/** Frame vector i of a placement, as an ambient vector. */
export const frameVecOf = (M, i) => [M[i * 4], M[i * 4 + 1], M[i * 4 + 2], M[i * 4 + 3]];

// --- generalised trigonometry -------------------------------------------

/** cosh / 1 / cos. */
export function cosK(t, k) {
  if (k < 0) return Math.cosh(t);
  if (k > 0) return Math.cos(t);
  return 1;
}

/** sinh / t / sin. The "how far sideways" function. */
export function sinK(t, k) {
  if (k < 0) return Math.sinh(t);
  if (k > 0) return Math.sin(t);
  return t;
}

/**
 * The inverse of sinK. Used for distance, and the reason it is asinh rather
 * than acosh in the hyperbolic case is precision, not taste: acosh loses all
 * of it exactly where the answer is small, which is where a rope spends its
 * life. See hyp.js.
 */
export function asinK(s, k) {
  if (k < 0) return Math.asinh(s);
  if (k > 0) return Math.asin(Math.max(-1, Math.min(1, s)));
  return s;
}

/** tanK = sinK / cosK. */
export function tanK(t, k) {
  if (k < 0) return Math.tanh(t);
  if (k > 0) return Math.tan(t);
  return t;
}

// --- the space -----------------------------------------------------------

/**
 * A geometry of curvature k. An object rather than module state, so two of
 * them can be compared in one test without a mode switch between.
 */
export function geometry(k) {
  const flat = k === 0;

  /** The bilinear form: <x,y> = x0y0 + x1y1 + x2y2 + k*x3y3. */
  const dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2] + k * x[3] * y[3];

  const ORIGIN = [0, 0, 0, 1];
  const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  /**
   * Push a point back onto the model.
   *
   * Flat space has no curved constraint to restore -- the model is the affine
   * plane x3 = 1 -- so there is nothing to normalise but that coordinate. In
   * the other two, every matrix multiply leaves the result a hair off the
   * model and the drift is amplified by coordinates that grow like cosK, so
   * this is not optional maintenance.
   */
  function normalize(p) {
    if (flat) return [p[0], p[1], p[2], 1];
    const q = dot(p, p);
    // For k = -1 the model is <p,p> = -1 and for k = +1 it is +1, so in both
    // cases the scale to divide by is sqrt(<p,p>/k).
    const s = Math.sqrt(Math.max(q / k, 1e-300));
    return [p[0] / s, p[1] / s, p[2] / s, p[3] / s];
  }

  const point = pointOf;
  const frameVec = frameVecOf;

  /** A frame-component direction as an ambient tangent vector at point(M). */
  const fromFrame = (M, v) => apply(M, [v[0], v[1], v[2], 0]);

  /**
   * The isometry carrying the origin a distance |v| along the direction v.
   *
   * Acting on the plane spanned by the unit direction u and the origin o:
   *
   *     o  ->   cosK(t) o + sinK(t) u
   *     u  ->  -k sinK(t) o + cosK(t) u
   *
   * which is a boost at k = -1, a rotation at k = +1, and a SHEAR at k = 0 --
   * where the second line degenerates to u -> u, and the translation becomes
   * the ordinary affine one. Everything orthogonal to that plane is fixed.
   */
  function translationBy(unit, t) {
    if (t === 0) return IDENTITY.slice();
    const u = [unit[0], unit[1], unit[2], 0];
    const o = [0, 0, 0, 1];
    // Signed t needs no special case: cosK is even and sinK is odd in all
    // three geometries, so a negative distance is the inverse isometry.
    const c = cosK(t, k), s = sinK(t, k);
    const M = IDENTITY.slice();
    // M = I + (c-1) u u^T + s u o^T - k s o u^T + (c-1) o o^T, with plain
    // Euclidean outer products: u and o are Euclidean-orthogonal by shape.
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        M[col * 4 + row] += (c - 1) * u[row] * u[col]
                          + s * u[row] * o[col]
                          - k * s * o[row] * u[col]
                          + (c - 1) * o[row] * o[col];
      }
    }
    return M;
  }

  /**
   * The same isometry from one vector whose LENGTH is the distance.
   *
   * Both spellings exist because callers genuinely have both, and converting
   * between them is not free: a caller holding a unit direction and a distance
   * would otherwise multiply them together only for this to divide them apart
   * again, and the round trip is not the identity in floating point. Measured,
   * that round trip alone moved hyp.js's matrices by 1.8e-15 -- small, but it
   * turned a bit-for-bit agreement into an approximate one for no reason.
   */
  function translation(v) {
    const t = Math.hypot(v[0], v[1], v[2]);
    if (t < 1e-15) return IDENTITY.slice();
    return translationBy([v[0] / t, v[1] / t, v[2] / t], t);
  }

  /** exp at the ORIGIN: the point a distance |v| away along v. */
  function exp(v) {
    const t = Math.hypot(v[0], v[1], v[2]);
    if (t < 1e-15) return ORIGIN.slice();
    const c = cosK(t, k), s = sinK(t, k) / t;
    return [s * v[0], s * v[1], s * v[2], c];
  }

  /**
   * log at the ORIGIN: the tangent vector whose exp is p.
   *
   * Taken from the SPATIAL part, never from the x3 coordinate. At k = -1 that
   * is the asinh-not-acosh rule; at k = +1 it is the same argument in reverse,
   * since acos is the one that loses precision near zero there.
   */
  function log(p) {
    const m = Math.hypot(p[0], p[1], p[2]);
    if (m < 1e-15) return [0, 0, 0];
    let t = asinK(m, k);
    // asin only returns the near branch. Past a quarter turn the sphere wraps
    // back on itself and the true distance is pi - t, which the sign of the
    // x3 coordinate distinguishes: it goes negative past the equator.
    if (k > 0 && p[3] < 0) t = Math.PI - t;
    const s = t / m;
    return [p[0] * s, p[1] * s, p[2] * s];
  }

  /**
   * Distance between two points.
   *
   * Via <p-q, p-q> = 4 sinK(d/2)^2, which holds in all three geometries and is
   * what keeps the numbers honest: the direct forms (acosh of -<p,q>, acos of
   * <p,q>) cancel terms of size cosK(d)^2 and then take a square root.
   */
  function dist(p, q) {
    const d = [p[0] - q[0], p[1] - q[1], p[2] - q[2], p[3] - q[3]];
    const s = Math.sqrt(Math.max(dot(d, d), 0)) / 2;
    return 2 * asinK(s, k);
  }

  /** The placement M moved a distance t along its own frame direction dir. */
  function geodesic(M, dir, t) {
    return matMul(M, translation([dir[0] * t, dir[1] * t, dir[2] * t]));
  }

  /** The point a distance t from M along frame direction dir. */
  const rayPoint = (M, dir, t) => point(geodesic(M, dir, t));

  /**
   * Gram-Schmidt the frame back into the isometry group, in the form's own
   * inner product.
   *
   * Every matrix multiply leaves the result a hair outside the group and the
   * error is amplified by coordinates of size cosK(distance). Left alone the
   * position runs away. Flat space is the exception that still needs it: its
   * frame drifts out of O(3) just the same, even though the point cannot leave
   * the plane x3 = 1.
   */
  function reorthonormalize(M) {
    const out = M.slice();
    // Column 3 first: the point, put back on the model.
    const p = normalize(point(M));
    out[12] = p[0]; out[13] = p[1]; out[14] = p[2]; out[15] = p[3];
    for (let i = 0; i < 3; i++) {
      let v = frameVec(out, i);
      // Strip the component along the point. For k != 0 that is <v,p>/<p,p>
      // = <v,p>/k; flat space has <p,p> = 0 and the point direction is not in
      // the form's range at all, so the x3 row is simply held at zero.
      if (flat) v[3] = 0;
      else {
        const c = dot(v, p) / k;
        v = [v[0] - c * p[0], v[1] - c * p[1], v[2] - c * p[2], v[3] - c * p[3]];
      }
      for (let j = 0; j < i; j++) {
        const w = frameVec(out, j);
        const c = dot(v, w);
        v = [v[0] - c * w[0], v[1] - c * w[1], v[2] - c * w[2], v[3] - c * w[3]];
      }
      const n = Math.sqrt(Math.max(dot(v, v), 1e-300));
      out[i * 4] = v[0] / n; out[i * 4 + 1] = v[1] / n;
      out[i * 4 + 2] = v[2] / n; out[i * 4 + 3] = v[3] / n;
    }
    return out;
  }

  /** The tangent vector at M pointing at q, in M's own frame components. */
  function logTo(M, q) {
    const inv = invIsometry(M);
    return log(apply(inv, q));
  }

  /**
   * The inverse of an isometry, from the form rather than by elimination.
   *
   * For k != 0 the frame columns are orthonormal in <,> and the point column
   * has <p,p> = k, so the inverse is the adjoint with the form's signs. Flat
   * space is the affine case: the rotation transposes and the translation is
   * carried back through it.
   */
  function invIsometry(M) {
    const out = new Array(16).fill(0);
    if (flat) {
      // The affine case, where the form is degenerate and cannot be used:
      // M is [R | t ; 0 1], so the inverse is [R^T | -R^T t ; 0 1].
      const p = point(M);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) out[j * 4 + i] = M[i * 4 + j];
        out[12 + i] = -(M[i * 4] * p[0] + M[i * 4 + 1] * p[1] + M[i * 4 + 2] * p[2]);
        out[i * 4 + 3] = 0;
      }
      out[15] = 1;
      return out;
    }
    // Curved: M preserves the form J = diag(1,1,1,k), so M^-1 = J^-1 M^T J,
    // i.e. (M^-1)_ij = M_ji * J_j / J_i. No elimination and no division by
    // anything that can get small -- the only ratios are 1 and k.
    const J = [1, 1, 1, k];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) out[j * 4 + i] = M[i * 4 + j] * J[j] / J[i];
    }
    return out;
  }

  /** How far a placement has drifted out of the isometry group. Diagnostic. */
  function groupError(M) {
    let worst = 0;
    const cols = [0, 1, 2].map((i) => frameVec(M, i));
    const p = point(M);
    for (let i = 0; i < 3; i++) {
      worst = Math.max(worst, Math.abs(dot(cols[i], cols[i]) - 1));
      for (let j = i + 1; j < 3; j++) worst = Math.max(worst, Math.abs(dot(cols[i], cols[j])));
      // "The frame is orthogonal to the point" is a CURVED statement and it is
      // meaningless when k = 0: the form is degenerate there, <Ei,P> reduces to
      // the plain spatial dot of the frame axis with the position, and a
      // translated frame has no reason to be perpendicular to where it sits.
      // The flat invariant is the affine one instead -- the frame's x3 row is
      // zero, so directions stay directions under translation.
      if (flat) worst = Math.max(worst, Math.abs(cols[i][3]));
      else worst = Math.max(worst, Math.abs(dot(cols[i], p)));
    }
    worst = Math.max(worst, flat ? Math.abs(p[3] - 1) : Math.abs(dot(p, p) - k));
    return worst;
  }

  /**
   * Circumference of a circle of radius r: 2*pi*sinK(r).
   *
   * The one line that explains every design rule in this project. It grows
   * exponentially at k = -1, linearly at k = 0, and at k = +1 it grows to a
   * maximum at r = pi/2 and then SHRINKS back to nothing at the antipode.
   */
  const circumference = (r) => 2 * Math.PI * sinK(r, k);

  /** How much a corner of angle `ang` costs at line radius r. */
  const cornerArc = (r, ang) => sinK(r, k) * ang;

  return {
    k, flat, CURV,
    dot, ORIGIN, IDENTITY, normalize, matMul, apply, point, frameVec,
    fromFrame, translation, translationBy, exp, log, dist, geodesic, rayPoint,
    reorthonormalize, logTo, inv: invIsometry, groupError,
    cosK: (t) => cosK(t, k), sinK: (t) => sinK(t, k), asinK: (s) => asinK(s, k),
    tanK: (t) => tanK(t, k),
    circumference, cornerArc,
  };
}

export const E3 = () => geometry(0);
export const H3 = () => geometry(-1);
export const S3 = () => geometry(1);
