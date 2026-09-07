// product.js — SURFACE x R, with the surface's curvature left in.
//
// This is to `h2r.js` and `s2r.js` what `geom.js` is to `hyp.js`: the same
// arithmetic with the curvature as a parameter, so H^2 x R and S^2 x R come
// out of one set of formulas and the flat case E^2 x R = E^3 falls out as the
// degenerate one.
//
// A product geometry is NOT a space of constant curvature, so `geom.js` cannot
// produce it: geom.js is built on `<x,x> = k` and one trigonometry, and a
// product has neither. What it has instead is better for a game -- the two
// factors do not talk to each other at all.
//
//     ds^2 = ds^2_{surface} + dz^2
//
// with no cross term and no z-dependent factor. Three consequences, and all
// three are the reason these geometries are here:
//
//   1. VERTICAL MOTION IS EXACTLY EUCLIDEAN. Under gravity z = z0 - g t^2 / 2,
//      whatever you are doing horizontally. So a fall takes the same time at
//      every horizontal speed, which is what H^3 cannot do and what the
//      dropper needs.
//   2. THE FRAME NEVER TILTS. Parallel transport in a product is componentwise,
//      so E3 stays exactly vertical and E1, E2 stay exactly horizontal, for
//      ever. There is no `alignUp` and nothing for it to correct.
//   3. DISTANCE IS PYTHAGORAS in the two factors, exactly. A ball is
//      sqrt(dh^2 + dz^2) - r, a vertical column is dh - r, a horizontal slab
//      is |dz| - t, and every one of those is EXACT rather than the usual
//      safe underestimate.
//
//
// THE MODEL, and the coordinate order is chosen to make the shader easy
//
//     p = (x0, x1, z, x3)     with   x0^2 + x1^2 + kS x3^2 = kS
//
// Components 0, 1 and 3 are a point of the surface -- the hyperboloid model of
// H^2 in R^{2,1} at kS = -1, the round S^2 in R^3 at kS = +1 -- and component
// 2 is z, the Euclidean height, unconstrained. Two forms live here and keeping
// them apart is most of the work:
//
//     sdot(a,b) = a0b0 + a1b1 + kS a3b3       the SURFACE factor. POINTS live
//                                             here, and sdot(p,p) = kS is the
//                                             model. The height is ignored.
//     dot(a,b)  = a0b0 + a1b1 + a2b2 + kS a3b3    the metric on TANGENT
//                                             vectors, which is what the
//                                             shader's mdot already is.
//
// The tangent form at kS = -1 is diag(1,1,1,-1), the SAME one H^3 uses, and at
// kS = +1 it is diag(1,1,1,1), the same one S^3 uses. That is why the shader's
// lighting, normalisation and normals are shared with both constant-curvature
// builds unchanged, and only distance, the ray and the up vector are written
// per geometry.
//
//
// THE TRAP THIS FILE EXISTS TO GET RIGHT: the height is AFFINE
//
// `Isom(surface x R) = Isom(surface) x Isom(R)`, and that DOES NOT EMBED IN
// GL(4) on this model. The surface part is a 3x3 block on components 0, 1, 3;
// the height part is an ordinary translation, which must be ADDED and never
// scaled. A plain matrix multiply scales the stored height by the other
// factor's timelike coordinate -- measured, a step of 1.3 along a direction
// 60% horizontal from a placement 2.1 up landed at 3.812 instead of 3.140,
// and `M o inv(M)` was off the identity by 1.62.
//
// So `applyPoint`, `applyVec` and `compose` below are the linear operations
// with the height row handled separately, and `applyPoint` versus `applyVec`
// is the whole discipline: a POINT's height translates, a TANGENT VECTOR's
// does not.
//
// No DOM and no graphics. `h2r.test.js` and `s2r.js` cover it.

import { pointOf, frameVecOf, cosK, sinK, asinK } from './geom.js';

/**
 * The geometry of surface(kS) x R, as a value rather than a mode switch.
 *
 * Returned as an object for the same reason `geom.geometry(k)` is: two can be
 * held at once and compared in a single test, with nothing to switch and
 * nothing to get out of step with the renderer.
 */
export function surface(kS) {
  /** The metric on TANGENT vectors. diag(1,1,1,kS). */
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + kS * a[3] * b[3];

  /**
   * The form on the SURFACE factor alone, index 2 (the height) ignored.
   *
   * This is the one POINTS satisfy: sdot(p,p) = kS is the model, and z is
   * free. Every distance, every projection and every reorthonormalisation goes
   * through this rather than through `dot`.
   */
  const sdot = (a, b) => a[0] * b[0] + a[1] * b[1] + kS * a[3] * b[3];

  const ORIGIN = [0, 0, 0, 1];
  const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  const point = pointOf;
  const frameVec = frameVecOf;

  const cK = (t) => cosK(t, kS);
  const sK = (t) => sinK(t, kS);

  // --- the group action, which is where a product is not like the others ---
  //
  // Every placement's HEIGHT ROW is (0, 0, 1, z): columns 0 and 1 are
  // horizontal so their height entry is zero, column 2 is E3 = (0,0,1,0)
  // exactly, and column 3 carries the placement's own height. The three
  // functions below are the linear ones with that row handled separately, and
  // nothing else differs.

  /** M applied to a POINT: linear in the surface factor, a shift in height. */
  function applyPoint(M, p) {
    return [
      M[0] * p[0] + M[4] * p[1] + M[12] * p[3],
      M[1] * p[0] + M[5] * p[1] + M[13] * p[3],
      M[14] + p[2],
      M[3] * p[0] + M[7] * p[1] + M[15] * p[3],
    ];
  }

  /**
   * M applied to a TANGENT VECTOR, which a translation does not displace.
   *
   * E3 is fixed by every isometry of a product, so the vertical component of a
   * tangent vector passes through untouched -- which is the same statement as
   * "parallel transport never tilts the frame", one level down.
   */
  function applyVec(M, v) {
    return [
      M[0] * v[0] + M[4] * v[1] + M[12] * v[3],
      M[1] * v[0] + M[5] * v[1] + M[13] * v[3],
      v[2],
      M[3] * v[0] + M[7] * v[1] + M[15] * v[3],
    ];
  }

  /** A frame-component direction as an ambient tangent vector at point(M). */
  const fromFrame = (M, v) => applyVec(M, [v[0], v[1], v[2], 0]);

  /**
   * A composed with B: columns 0..2 of B are vectors, column 3 is a point.
   *
   * Written out rather than routed through a plain matrix multiply for the
   * reason at the top of the file: the height row must be ADDED, and a linear
   * product multiplies it by the other factor's cosK instead.
   */
  function compose(A, B) {
    const C = new Array(16).fill(0);
    for (let c = 0; c < 3; c++) {
      const v = applyVec(A, frameVecOf(B, c));
      C[c * 4] = v[0]; C[c * 4 + 1] = v[1]; C[c * 4 + 2] = v[2]; C[c * 4 + 3] = v[3];
    }
    const p = applyPoint(A, pointOf(B));
    C[12] = p[0]; C[13] = p[1]; C[14] = p[2]; C[15] = p[3];
    return C;
  }

  /** The height of a point, and it is just the coordinate. No function to it. */
  const height = (p) => p[2];

  /**
   * Up, in FRAME components, and it is constant.
   *
   * In H^3 this is `gradHeight`, a genuine computation that varies from point
   * to point and forces `alignUp` to run every substep. Here the frame's E3 is
   * always the vertical, everywhere, so "up" is E3 and that is the end of it.
   * Uniform gravity in the most literal possible sense.
   */
  const UP = [0, 0, 1];

  /**
   * The isometry carrying the origin a distance |v| along v.
   *
   * Split v into a horizontal part (v0, v1) of length b and a vertical part
   * v2. The isometry is the product of a surface translation of distance b and
   * a shift of the height by v2, and because it IS a product the two commute
   * and there is no ordering question.
   *
   * On the surface factor, with unit h = (v0,v1)/b and the surface origin o:
   *
   *     o  ->  cosK(b) o + sinK(b) h
   *     h  ->  -kS sinK(b) o + cosK(b) h
   *
   * which is a BOOST at kS = -1 and a ROTATION at kS = +1 -- the one place the
   * sign of the curvature is visible as more than a choice of trig function.
   * At kS = -1 the -kS is +1 and h picks up +sinh(b) o; at kS = +1 it is -1
   * and h picks up -sin(b) o, which is what makes the 2x2 block a rotation
   * rather than a boost. Everything in the 0,1 plane orthogonal to h is fixed,
   * and so is E3.
   *
   * The b -> 0 limit needs no guard for correctness, only for the 0/0 in h:
   * cosK -> 1 and sinK -> 0 collapse the surface block to the identity on
   * their own, leaving a pure vertical shift.
   */
  function translation(v) {
    const b = Math.hypot(v[0], v[1]);
    const M = IDENTITY.slice();
    const ch = cK(b), sh = sK(b);
    const h0 = b > 1e-15 ? v[0] / b : 1, h1 = b > 1e-15 ? v[1] / b : 0;
    // Column 0 = E1 carried, column 1 = E2 carried. Both stay in the surface
    // factor, so their z rows are zero and stay zero.
    M[0] = 1 + h0 * h0 * (ch - 1); M[1] = h0 * h1 * (ch - 1); M[3] = -kS * h0 * sh;
    M[4] = h0 * h1 * (ch - 1); M[5] = 1 + h1 * h1 * (ch - 1); M[7] = -kS * h1 * sh;
    // Column 2 = E3, untouched: (0,0,1,0). Already what IDENTITY holds.
    // Column 3 = the point: the carried surface origin, lifted to height v2.
    M[12] = sh * h0; M[13] = sh * h1; M[14] = v[2]; M[15] = ch;
    return M;
  }

  /** The same, from a unit direction and a signed distance. */
  const translationBy = (unit, t) =>
    translation([unit[0] * t, unit[1] * t, unit[2] * t]);

  /** The placement M moved a distance t along its own frame direction dir. */
  const geodesic = (M, dir, t) => compose(M, translationBy(dir, t));

  /** The point a distance t from M along frame direction dir. */
  const rayPoint = (M, dir, t) => point(geodesic(M, dir, t));

  /** exp at the ORIGIN: the point a distance |v| away along v. */
  function exp(v) {
    const b = Math.hypot(v[0], v[1]);
    const s = b > 1e-15 ? sK(b) / b : 1;
    return [s * v[0], s * v[1], v[2], cK(b)];
  }

  /**
   * log at the ORIGIN: the tangent vector whose exp is p.
   *
   * The vertical part needs no inverse function at all; it is read off. The
   * horizontal part needs one, and the two curvatures want DIFFERENT ones:
   *
   *  - at kS = -1, asinh of the spatial part, never acosh of the timelike one.
   *    The precision rule this project states everywhere: acosh loses all its
   *    digits exactly where the answer is small.
   *  - at kS = +1, atan2(m, p3) rather than asin(m). asin only reaches pi/2,
   *    so it cannot name a point on the far half of the sphere at all -- and a
   *    sphere is the one surface here where the far half is reachable and is
   *    most of the interest. atan2 covers the full [0, pi] and is exact at
   *    both poles.
   */
  function log(p) {
    const m = Math.hypot(p[0], p[1]);
    if (m < 1e-15) {
      // At kS = +1 the origin is p3 = +1 and the ANTIPODE is p3 = -1, which is
      // also m = 0. Every direction from the origin reaches it, so there is no
      // single right answer; pick one rather than returning zero, which would
      // claim the antipode is where you are standing.
      if (kS > 0 && p[3] < 0) return [Math.PI, 0, p[2]];
      return [0, 0, p[2]];
    }
    const b = (kS < 0 ? Math.asinh(m) : Math.atan2(m, p[3])) / m;
    return [p[0] * b, p[1] * b, p[2]];
  }

  /**
   * Distance in the surface factor alone: the floor-plan distance.
   *
   * From <p-q,p-q> = 4 sinK(d/2)^2, which holds in both curvatures and is used
   * for the same reason in each: the acos/acosh form cancels terms of size
   * cosK^2 and has no digits left where the answer is small.
   */
  function horizDist(p, q) {
    const w = [p[0] - q[0], p[1] - q[1], 0, p[3] - q[3]];
    // NO kS FACTOR HERE, and the sign of it is a real trap: sdot(w,w) is
    // already positive in BOTH curvatures for a difference of two points --
    // sinh^2 - (1-cosh)^2 = 4 sinh^2(d/2) at kS = -1 and sin^2 + (1-cos)^2 =
    // 4 sin^2(d/2) at kS = +1. Multiplying by kS made every hyperbolic
    // distance clamp to zero, and the dropper's gates all landed on top of
    // each other.
    return 2 * asinK(Math.sqrt(Math.max(sdot(w, w), 0)) / 2, kS);
  }

  /**
   * Distance in surface x R, and in a product metric it is PYTHAGORAS in the
   * two factors -- exactly, not approximately.
   *
   * That is what makes SDFs here easier than in either curved space, and it is
   * the same fact for both signs of the curvature.
   */
  function dist(p, q) {
    return Math.hypot(horizDist(p, q), p[2] - q[2]);
  }

  /**
   * The inverse of a placement.
   *
   * Block by block, because the isometry is a product: the surface part is the
   * form-adjoint (M^-1 = J M^T J with J = diag(1,1,kS) on indices 0,1,3, which
   * is a plain transpose at kS = +1 since the form is then Euclidean), and the
   * height part is an affine shift that inverts by negation. No elimination
   * and nothing that can get small.
   */
  function inv(M) {
    const out = new Array(16).fill(0);
    const J = [1, 1, 0, kS];
    for (const i of [0, 1, 3]) {
      for (const j of [0, 1, 3]) out[j * 4 + i] = M[i * 4 + j] * J[j] / J[i];
    }
    // E3 is fixed by every isometry, so it is fixed by every inverse too.
    out[2 * 4 + 2] = 1;
    // The height offset lives in column 3 row 2 and simply negates. It is not
    // carried back through the surface block: the factors do not mix.
    out[14] = -M[14];
    return out;
  }

  /** The tangent vector at M pointing at q, in M's own frame components. */
  const logTo = (M, q) => log(applyPoint(inv(M), q));

  /**
   * Push a placement back into the isometry group.
   *
   * Needed at kS = -1 for the usual reason -- every matrix multiply leaves the
   * result a hair outside, and hyperbolic coordinates grow like cosh of the
   * distance, so the error is amplified. At kS = +1 there is no amplification
   * at all, because coordinates are bounded by 1, but the drift is still real
   * and still worth removing.
   *
   * The height coordinate is the exception in both and needs no maintenance:
   * it is an ordinary affine coordinate with nothing to drift off.
   *
   * The three constraints, in order: the point lies on the surface; E3 is
   * exactly the vertical; and E1, E2 are sdot-orthonormal, sdot-orthogonal to
   * the point, and purely horizontal.
   */
  function reorthonormalize(M) {
    const out = M.slice();
    const p = point(M);
    const s = Math.sqrt(Math.max(kS * sdot(p, p), 1e-300));
    out[12] = p[0] / s; out[13] = p[1] / s; out[14] = p[2]; out[15] = p[3] / s;
    const P = [out[12], out[13], 0, out[15]];
    out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
    for (const i of [0, 1]) {
      let v = frameVec(out, i);
      v[2] = 0;                                 // horizontal, by construction
      // Strip the component along the point. sdot(P,P) = kS, so the coefficient
      // is sdot(v,P)/kS, and 1/kS is kS for both signs.
      const c = -kS * sdot(v, P);
      v = [v[0] + c * P[0], v[1] + c * P[1], 0, v[3] + c * P[3]];
      if (i === 1) {
        const w = frameVec(out, 0);
        const d = sdot(v, w);
        v = [v[0] - d * w[0], v[1] - d * w[1], 0, v[3] - d * w[3]];
      }
      const n = Math.sqrt(Math.max(sdot(v, v), 1e-300));
      out[i * 4] = v[0] / n; out[i * 4 + 1] = v[1] / n;
      out[i * 4 + 2] = 0; out[i * 4 + 3] = v[3] / n;
    }
    return out;
  }

  /** How far a placement has drifted out of the isometry group. Diagnostic. */
  function groupError(M) {
    const p = point(M);
    let worst = Math.abs(sdot(p, p) - kS);
    const E = [0, 1].map((i) => frameVec(M, i));
    for (let i = 0; i < 2; i++) {
      worst = Math.max(worst, Math.abs(sdot(E[i], E[i]) - 1),
        Math.abs(sdot(E[i], p)), Math.abs(E[i][2]));
    }
    const e3 = frameVec(M, 2);
    worst = Math.max(worst, Math.abs(e3[0]), Math.abs(e3[1]),
      Math.abs(e3[2] - 1), Math.abs(e3[3]));
    return worst;
  }

  /** A placement at horizontal geodesic-polar (a, b) and height z, facing +E1. */
  const placeAt = (a, b, z) => translation([a, b, z]);

  return {
    kS, dot, sdot, ORIGIN, IDENTITY, point, frameVec,
    applyPoint, applyVec, fromFrame, compose, height, UP,
    translation, translationBy, geodesic, rayPoint, exp, log,
    horizDist, dist, inv, logTo, reorthonormalize, groupError, placeAt,
    cosK: cK, sinK: sK, asinK: (x) => asinK(x, kS),
  };
}

/** H^2 x R: a hyperbolic floor plan and a Euclidean height. See h2r.js. */
export const H2R = () => surface(-1);
/** S^2 x R: a spherical floor plan and a Euclidean height. See s2r.js. */
export const S2R = () => surface(1);
/** E^2 x R, which is just E^3. The control, exactly as in geom.js. */
export const E2R = () => surface(0);
