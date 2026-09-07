// level.js — the level geometry, written once and emitted twice.
//
// The physics needs the level in JS (to collide against, and to find what the
// grapple hit). The renderer needs it in GLSL. Two implementations of the same
// surface that disagree means a grapple that latches onto thin air, so the
// numbers live here as plain data and BOTH implementations read them.
//
// `node tools/sdf-check.js` compares the two on a grid of sample points.
//
// THIS LEVEL LIVES IN A COMPACT 3-MANIFOLD. The floor is a closed genus-2
// surface (H^2 quotiented by the octagon group in hyp.js) and there are no
// side walls anywhere, because a closed surface has no boundary.
//
// TWO MODES.
//   BOUNDED  a floor plane below and a ceiling above. Somewhere to stand.
//   OPEN     both removed. Nothing but the scaffold, in every direction, for
//            ever. Gravity still points the same way, so falling is real and
//            the grapple is the only thing that saves you.
//
// Content is authored in the fundamental octagon, in geodesic polar floor
// coordinates (a, b) about its centre, plus altitude h. Keep it well inside
// the inradius (~1.53) so no surface touches a face - a surface straddling a
// face would need the renderer to evaluate neighbouring copies, and the whole
// point of marching chart by chart is that it does not have to.

import {
  fromFloor, floorPoint, dist, dot, height, distToAxis,
  distToGeodesic, geodesicThrough, exp, DOD_DIRS,
} from './hyp.js';

export const CEILING = 1.1;
export const PLATFORM_T = 0.06;

export const MODE = { BOUNDED: 0, OPEN: 1 };
let mode = MODE.BOUNDED;
export function setMode(m) { mode = m; }
export function getMode() { return mode; }

// [a, b, radius, low altitude, high altitude] - capped vertical tubes. Not all
// of them stand on the floor; in OPEN mode none of them can.
export const PILLARS = [
  [0.42, 0.16, 0.11, -0.42, 0.46],
  [-0.36, -0.30, 0.11, -0.30, 0.52],
  [-0.08, 0.44, 0.09, 0.10, 0.60],
];

// [a1, b1, h1, a2, b2, h2, radius] - tubes around the geodesic joining two
// points. These are what make the map three-dimensional rather than a floor
// with things standing on it.
export const BARS = [
  [0.42, 0.16, 0.46, -0.36, -0.30, 0.52, 0.055],
  [-0.36, -0.30, -0.30, -0.08, 0.44, 0.10, 0.055],
  [-0.08, 0.44, 0.60, 0.42, 0.16, -0.20, 0.05],
];

// [a, b, altitude, radius] - a disc to land on.
export const PLATFORMS = [
  [0.10, -0.44, 0.22, 0.20],
];

// [a, b, altitude, radius] - grapple targets, spread through the volume.
export const ORBS = [
  [0.20, 0.40, 0.62, 0.08],
  [-0.52, 0.06, 0.02, 0.08],
  [0.30, -0.18, -0.40, 0.08],
  [0.00, 0.00, 0.92, 0.09],   // overhead, but clear of the spawn at 0.6
];

// --- content that only fits the OCTAGON ---------------------------------
//
// Everything above is small enough to sit inside both fundamental domains.
// These are not: the dodecahedron's inradius is 0.996 against the octagon's
// 1.5286, so a wall long enough to be worth taking cover behind straddles a
// dodecahedral face, and a surface that straddles a face is CUT OFF at it -
// the marcher never leaves the domain, so it never draws the part in the
// neighbouring copy. So these appear in the bounded world only, exactly like
// the floor and ceiling, and for the same kind of reason.
//
// The clearance rule is simple, because plane distance is 1-Lipschitz: a
// point d from the centre is at least (inradius - d) from every face. So
// centre distance plus thickness must stay under the inradius, and
// physics.test.js checks it directly rather than trusting the arithmetic.

// [a1, b1, a2, b2, thickness, low altitude, high altitude] - a slab about the
// vertical geodesic plane through two floor points. Cover to break sightlines,
// which the level badly wanted: on an H^2 floor flanking is cheap and a
// straight chase is a losing move, so there has to be something to flank.
//
// Four chords at floor radius 1.0, a pinwheel with wide gaps between them, so
// the band from 1.1 out to the inradius stays clear all the way round. That
// perimeter matters: it is the same corridor in every copy, so it is the one
// route that keeps going for ever, and it is where the manifold reads as a
// manifold rather than as a room.
export const WALLS = [
  [0.96, 0.30, 0.31, 0.95, 0.08, 0.00, 0.78],
  [-0.29, 0.96, -0.95, 0.31, 0.07, 0.30, 1.00],  // raised - run underneath it
  [-0.96, -0.29, -0.31, -0.95, 0.08, 0.00, 0.80],
  [0.29, -0.96, 0.95, -0.31, 0.07, 0.00, 0.42],  // low - vault it
];

// [a, b, radius, low altitude, high altitude] - the same shape as a PILLAR,
// just far too big to fit the other world. One of them reaches the ceiling.
export const TOWERS = [
  [0.62, -0.62, 0.26, 0.00, CEILING],   // full height, and it blocks a gap
  [-0.66, 0.60, 0.22, 0.00, 0.85],
];

// --- content that only fits the DODECAHEDRON ----------------------------
//
// The mirror of the section above. The open world had the shared scaffold and
// nothing else, and it read as empty for a measurable reason: that scaffold is
// authored within 0.63 of the centre, and the dodecahedral cell reaches 0.996
// toward a face and 1.854 toward a corner. Two thirds of the room was unused.
//
// SPOKES are the structure worth having here, because of how the gluing works.
// Each one runs from near the centre out along a face normal. Opposite faces
// are identified, and the 3/10 turn that identifies them is ABOUT that axis,
// so a spoke pointing at a face lines up exactly with the neighbouring cell's
// spoke coming the other way. They join across every face into straight lines
// that never end - the truss reads as one infinite lattice rather than as
// twelve sticks in a box, and that is the manifold showing itself.
//
// PODS fill the corners, where there is nearly twice the room.
const DOD_VERTEX_DIRS = (() => {
  const out = [];
  const d3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (let i = 0; i < DOD_DIRS.length; i++) {
    for (let j = i + 1; j < DOD_DIRS.length; j++) {
      for (let k = j + 1; k < DOD_DIRS.length; k++) {
        const A = DOD_DIRS[i], B = DOD_DIRS[j], C = DOD_DIRS[k];
        // Three MUTUALLY adjacent face normals meet at a vertex of the dual.
        if (d3(A, B) < 0.4 || d3(A, C) < 0.4 || d3(B, C) < 0.4) continue;
        const v = [A[0] + B[0] + C[0], A[1] + B[1] + C[1], A[2] + B[2] + C[2]];
        const n = Math.hypot(v[0], v[1], v[2]);
        out.push([v[0] / n, v[1] / n, v[2] / n]);
      }
    }
  }
  return out;                                  // 20 of them
})();

// [dx, dy, dz, near, far, radius] - a tube along the geodesic in direction d,
// from distance near to distance far. The face sits at 0.996, so 0.88 plus the
// radius stops just short of it and the two halves meet across the seam.
// Starting at 0.42 rather than at the hub: the player spawns at the cell
// centre in this world, and a camera inside geometry fills the screen with one
// flat colour, which looks exactly like a different bug.
export const SPOKES = DOD_DIRS.map((d) => [d[0], d[1], d[2], 0.42, 0.88, 0.05]);

// [dx, dy, dz, distance, radius] - blocks out in the corners. Every other
// vertex direction, so there is somewhere to fly between them.
export const PODS = DOD_VERTEX_DIRS.filter((_, i) => i % 2 === 0)
  .map((d) => [d[0], d[1], d[2], 1.05, 0.26]);

// Level materials stay below 10; the transient markers (anchor, beacon, the
// player's own body, portal rims) live from 10 up, and the shader's "does it
// glow" test is the boundary between them. Adding a level material above 10
// would silently make it emissive in every copy of the room.
export const MAT = { ROOM: 1, PILLAR: 2, PLATFORM: 3, ORB: 4, BAR: 5, WALL: 6, TOWER: 7,
  SPOKE: 8, POD: 9 };

export const PILLAR_Q = PILLARS.map(([a, b]) => floorPoint(a, b));
export const TOWER_Q = TOWERS.map(([a, b]) => floorPoint(a, b));
export const PLATFORM_Q = PLATFORMS.map(([a, b]) => floorPoint(a, b));
export const ORB_POINTS = ORBS.map(([a, b, h]) => fromFloor(a, b, h));

/** Midpoint of the geodesic segment AB: normalise A + B back onto H^3. */
function midpointOf(A, B) {
  const s = [A[0] + B[0], A[1] + B[1], A[2] + B[2], A[3] + B[3]];
  const n = Math.sqrt(Math.max(-dot(s, s), 1e-18));
  return [s[0] / n, s[1] / n, s[2] / n, s[3] / n];
}

/**
 * Unit normal to the VERTICAL geodesic plane through two floor points.
 *
 * Both floor points have z = 0, and the plane is to contain the vertical
 * direction (0,0,1,0) as well, so the normal must have z = 0 too. That drops
 * the problem into the (x, y, w) slice, where the form is x^2 + y^2 - w^2 and
 * "orthogonal to both" is a cross product with one sign flipped: <n,A> = 0
 * reads as (a cross b) . a = 0 once the w component is negated, which is what
 * the Minkowski sign does for you.
 */
function verticalPlaneNormal(A, B) {
  const a = [A[0], A[1], A[3]], b = [B[0], B[1], B[3]];
  const c = [a[1] * b[2] - a[2] * b[1],
             a[2] * b[0] - a[0] * b[2],
             a[0] * b[1] - a[1] * b[0]];
  const n = [c[0], c[1], 0, -c[2]];
  const s = Math.sqrt(Math.max(dot(n, n), 1e-18));
  return [n[0] / s, n[1] / s, 0, n[3] / s];
}

// A wall is three slabs intersected: distance to its plane, distance along it,
// and altitude. Each is a signed distance in its own right - asinh of an inner
// product against a unit spacelike vector is the distance to the geodesic
// plane that vector is normal to, which is the same formula the FLOOR uses -
// and the three normals are mutually orthogonal, so max of the three is the
// box distance: exact inside, an underestimate outside the corners, which is
// the safe direction for sphere tracing. Same pattern as PILLARS and BARS.
//
// The end caps are equidistant surfaces from the waist plane, not geodesic
// planes, so a wall tapers slightly as it rises - about 20% over its height.
// That is not an approximation, it is what a constant distance from a plane
// means here, and it is worth leaving visible.
export const WALL_DATA = WALLS.map(([a1, b1, a2, b2, t, lo, hi]) => {
  const A = floorPoint(a1, b1), B = floorPoint(a2, b2);
  const mid = midpointOf(A, B);
  const [, u] = geodesicThrough(mid, B);
  return {
    n: verticalPlaneNormal(A, B), u, t,
    halfLen: dist(A, B) / 2,
    hMid: (lo + hi) / 2, hHalf: (hi - lo) / 2,
  };
});

// Spokes reuse the bar machinery exactly: a tube around a geodesic, stored as
// midpoint plus unit tangent, so the arclength along it is zero in the middle.
// The endpoints are exp of a tangent vector at the cell centre rather than
// floor coordinates, because here the interesting directions point at faces
// and corners, not along the ground.
export const SPOKE_DATA = SPOKES.map(([dx, dy, dz, near, far, r]) => {
  const A = exp([dx * near, dy * near, dz * near]);
  const B = exp([dx * far, dy * far, dz * far]);
  const mid = midpointOf(A, B);
  const [, u] = geodesicThrough(mid, B);
  return { mid, u, r, halfLen: dist(A, B) / 2 };
});

export const POD_POINTS = PODS.map(([dx, dy, dz, d]) => exp([dx * d, dy * d, dz * d]));

// A bar is stored as [midpoint, unit tangent, radius, half length], so the
// arclength coordinate along it is zero in the middle and the end cap is a
// single abs().
export const BAR_DATA = BARS.map(([a1, b1, h1, a2, b2, h2, r]) => {
  const A = fromFloor(a1, b1, h1), B = fromFloor(a2, b2, h2);
  const mid = midpointOf(A, B);
  const [, u] = geodesicThrough(mid, B);
  return { mid, u, r, halfLen: dist(A, B) / 2 };
});

// --- JS implementation --------------------------------------------------

/** The Gamma-invariant shell. Empty in OPEN mode. */
function shellMap(p) {
  if (mode === MODE.OPEN) return Infinity;
  const h = height(p);
  return Math.min(h, CEILING - h);
}

/** Everything authored inside one fundamental domain. */
export function contentMap(p) {
  const h = height(p);
  let d = Infinity, m = MAT.ROOM;
  for (let i = 0; i < PILLARS.length; i++) {
    const r = PILLARS[i][2], lo = PILLARS[i][3], hi = PILLARS[i][4];
    const q = Math.max(distToAxis(p, PILLAR_Q[i]) - r,
      Math.abs(h - (lo + hi) / 2) - (hi - lo) / 2);
    if (q < d) { d = q; m = MAT.PILLAR; }
  }
  for (let i = 0; i < BAR_DATA.length; i++) {
    const b = BAR_DATA[i];
    const along = Math.asinh(dot(p, b.u));
    const q = Math.max(distToGeodesic(p, b.mid, b.u) - b.r, Math.abs(along) - b.halfLen);
    if (q < d) { d = q; m = MAT.BAR; }
  }
  for (let i = 0; i < PLATFORMS.length; i++) {
    const q = Math.max(distToAxis(p, PLATFORM_Q[i]) - PLATFORMS[i][3],
      Math.abs(h - PLATFORMS[i][2]) - PLATFORM_T);
    if (q < d) { d = q; m = MAT.PLATFORM; }
  }
  for (let i = 0; i < ORBS.length; i++) {
    const q = dist(p, ORB_POINTS[i]) - ORBS[i][3];
    if (q < d) { d = q; m = MAT.ORB; }
  }
  // Dodecahedron-only: the spoke lattice and the corner pods. Both reach
  // further out than the octagon's own furniture allows near a face, and
  // neither has any meaning in a world with a floor.
  if (mode === MODE.OPEN) {
    for (let i = 0; i < SPOKE_DATA.length; i++) {
      const b = SPOKE_DATA[i];
      const q = Math.max(distToGeodesic(p, b.mid, b.u) - b.r,
        Math.abs(Math.asinh(dot(p, b.u))) - b.halfLen);
      if (q < d) { d = q; m = MAT.SPOKE; }
    }
    for (let i = 0; i < PODS.length; i++) {
      const q = dist(p, POD_POINTS[i]) - PODS[i][4];
      if (q < d) { d = q; m = MAT.POD; }
    }
  }
  // Octagon-only, for the same reason the floor is: too big for the other
  // domain, and a surface that straddles a face gets cut off at it.
  if (mode === MODE.BOUNDED) {
    for (let i = 0; i < WALL_DATA.length; i++) {
      const w = WALL_DATA[i];
      const q = Math.max(
        Math.abs(Math.asinh(dot(p, w.n))) - w.t,
        Math.abs(Math.asinh(dot(p, w.u))) - w.halfLen,
        Math.abs(h - w.hMid) - w.hHalf);
      if (q < d) { d = q; m = MAT.WALL; }
    }
    for (let i = 0; i < TOWERS.length; i++) {
      const r = TOWERS[i][2], lo = TOWERS[i][3], hi = TOWERS[i][4];
      const q = Math.max(distToAxis(p, TOWER_Q[i]) - r,
        Math.abs(h - (lo + hi) / 2) - (hi - lo) / 2);
      if (q < d) { d = q; m = MAT.TOWER; }
    }
  }
  return [d, m];
}

/** [distance, material] for a point ALREADY IN the fundamental domain. */
export function domainMap(p) {
  const s = shellMap(p);
  const c = contentMap(p);
  return c[0] < s ? c : [s, MAT.ROOM];
}

export function levelSDF(p) { return levelMap(p)[0]; }

import { reduceToDomain, pairings, apply } from './hyp.js';

/**
 * [distance, material] anywhere in the universal cover.
 *
 * Folds the query into the fundamental domain, then takes the min over that
 * copy AND its eight side-neighbours. The neighbours are not optional: the
 * nearest content to a point near a face is very often in the copy across it,
 * and the folded copy alone would OVERESTIMATE - the one thing sphere tracing
 * cannot survive. The renderer avoids all of this by never leaving the domain.
 */
export function levelMap(p) {
  const [, g] = reduceToDomain([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, ...p]);
  const q = apply(g, p);
  let best = [shellMap(p), MAT.ROOM];      // the shell is invariant
  const c0 = contentMap(q);
  if (c0[0] < best[0]) best = c0;
  const P = pairings();
  for (let k = 0; k < P.length; k++) {
    const c = contentMap(apply(P[k], q));
    if (c[0] < best[0]) best = c;
  }
  return best;
}

// --- GLSL implementation ------------------------------------------------

const f = (n) => {
  const s = Number(n).toPrecision(9);
  return s.includes('.') || s.includes('e') ? s : `${s}.0`;
};
const vec = (a) => `vec${a.length}(${a.map(f).join(', ')})`;
const arr = (name, type, rows) =>
  `const ${type} ${name}[${rows.length}] = ${type}[${rows.length}](\n    ${rows.map(vec).join(',\n    ')});`;

export function levelGLSL() {
  const pil = PILLARS.map((p) => [p[2], (p[3] + p[4]) / 2, (p[4] - p[3]) / 2, 0]);
  return `
// The loops below are LEFT UNROLLED on purpose, and that was measured.
//
// The Direct3D compiler unrolls any loop whose trip count it can work out, and
// every loop here has a constant bound over a constant array, so all of them
// qualify: contentMap becomes 39 primitives written out. Elsewhere that kind
// of duplication is what broke the page (see shader.js rolled(), and the
// inlining rule in CLAUDE.md) - but here it is worth having. These run in the
// march inner loop, and unrolled they let the compiler fold the array reads
// into constants. Hiding the bounds to stop it cost 74% more frame time
// (0.50 -> 0.87 ms at 720p, 1.80 -> 3.50 supersampled) and saved 0.3 s of
// compile, which is inside the noise. Do not "fix" this.
//
// It is only affordable because sceneMap is now inlined THREE times rather
// than sixty-five. If that number climbs again, this is where it hurts.

const float CEILING = ${f(CEILING)};
const float PLATFORM_T = ${f(PLATFORM_T)};
${arr('PILLAR_RH', 'vec4', pil)}
${arr('PILLAR_Q', 'vec4', PILLAR_Q)}
${arr('BAR_MID', 'vec4', BAR_DATA.map((b) => b.mid))}
${arr('BAR_U', 'vec4', BAR_DATA.map((b) => b.u))}
${arr('BAR_RH', 'vec2', BAR_DATA.map((b) => [b.r, b.halfLen]))}
${arr('PLATFORMS', 'vec4', PLATFORMS)}
${arr('PLATFORM_Q', 'vec4', PLATFORM_Q)}
${arr('ORBS', 'vec4', ORBS)}
${arr('ORB_POINTS', 'vec4', ORB_POINTS)}
${arr('WALL_N', 'vec4', WALL_DATA.map((w) => w.n))}
${arr('WALL_U', 'vec4', WALL_DATA.map((w) => w.u))}
${arr('WALL_RH', 'vec4', WALL_DATA.map((w) => [w.t, w.halfLen, w.hMid, w.hHalf]))}
${arr('TOWER_Q', 'vec4', TOWER_Q)}
${arr('TOWER_RH', 'vec4', TOWERS.map((t) => [t[2], (t[3] + t[4]) / 2, (t[4] - t[3]) / 2, 0]))}
${arr('SPOKE_MID', 'vec4', SPOKE_DATA.map((b) => b.mid))}
${arr('SPOKE_U', 'vec4', SPOKE_DATA.map((b) => b.u))}
${arr('SPOKE_RH', 'vec2', SPOKE_DATA.map((b) => [b.r, b.halfLen]))}
${arr('POD_POINTS', 'vec4', POD_POINTS)}
${arr('POD_R', 'vec2', PODS.map((q) => [q[4], 0]))}

// Distance to the vertical geodesic standing on floor point q. The part of p
// perpendicular to the axis is formed FIRST and then normed - the algebraically
// equal sinh^2 = <p,q>^2 - p.z^2 - 1 cancels terms of size cosh^2 and then
// takes a square root, which in 32-bit float is ruinous near the axis.
float distToAxis(vec4 p, vec4 q) {
  float pq = mdot(p, q);
  vec4 w = vec4(p.x + pq * q.x, p.y + pq * q.y, pq * q.z, p.w + pq * q.w);
  return asinh(sqrt(max(mdot(w, w), 0.0)));
}

// Distance to the geodesic through q with unit tangent u there. Same trick.
float distToGeo(vec4 p, vec4 q, vec4 u) {
  float pq = mdot(p, q), pu = mdot(p, u);
  vec4 w = p + pq * q - pu * u;
  return asinh(sqrt(max(mdot(w, w), 0.0)));
}

// Everything authored inside one fundamental domain.
vec2 contentMap(vec4 p) {
  float h = hHeight(p);
  vec2 best = vec2(1e9, ${f(MAT.ROOM)});
  for (int i = 0; i < ${PILLARS.length}; i++) {
    float q = max(distToAxis(p, PILLAR_Q[i]) - PILLAR_RH[i].x,
                  abs(h - PILLAR_RH[i].y) - PILLAR_RH[i].z);
    if (q < best.x) best = vec2(q, ${f(MAT.PILLAR)});
  }
  for (int i = 0; i < ${BARS.length}; i++) {
    float q = max(distToGeo(p, BAR_MID[i], BAR_U[i]) - BAR_RH[i].x,
                  abs(asinh(mdot(p, BAR_U[i]))) - BAR_RH[i].y);
    if (q < best.x) best = vec2(q, ${f(MAT.BAR)});
  }
  for (int i = 0; i < ${PLATFORMS.length}; i++) {
    float q = max(distToAxis(p, PLATFORM_Q[i]) - PLATFORMS[i].w,
                  abs(h - PLATFORMS[i].z) - PLATFORM_T);
    if (q < best.x) best = vec2(q, ${f(MAT.PLATFORM)});
  }
  for (int i = 0; i < ${ORBS.length}; i++) {
    float q = hDist(p, ORB_POINTS[i]) - ORBS[i].w;
    if (q < best.x) best = vec2(q, ${f(MAT.ORB)});
  }
  // Dodecahedron only: the spoke lattice and the corner pods.
  if (uOpen > 0.5) {
    for (int i = 0; i < ${SPOKES.length}; i++) {
      float q = max(distToGeo(p, SPOKE_MID[i], SPOKE_U[i]) - SPOKE_RH[i].x,
                    abs(asinh(mdot(p, SPOKE_U[i]))) - SPOKE_RH[i].y);
      if (q < best.x) best = vec2(q, ${f(MAT.SPOKE)});
    }
    for (int i = 0; i < ${PODS.length}; i++) {
      float q = hDist(p, POD_POINTS[i]) - POD_R[i].x;
      if (q < best.x) best = vec2(q, ${f(MAT.POD)});
    }
  }
  // Octagon only. The dodecahedron's inradius is 0.996 and these do not fit,
  // and a surface that straddles a face is cut off at it - the marcher never
  // leaves the domain, so it never draws the part on the other side.
  if (uOpen < 0.5) {
    for (int i = 0; i < ${WALLS.length}; i++) {
      float q = max(max(abs(asinh(mdot(p, WALL_N[i]))) - WALL_RH[i].x,
                        abs(asinh(mdot(p, WALL_U[i]))) - WALL_RH[i].y),
                    abs(h - WALL_RH[i].z) - WALL_RH[i].w);
      if (q < best.x) best = vec2(q, ${f(MAT.WALL)});
    }
    for (int i = 0; i < ${TOWERS.length}; i++) {
      float q = max(distToAxis(p, TOWER_Q[i]) - TOWER_RH[i].x,
                    abs(h - TOWER_RH[i].y) - TOWER_RH[i].z);
      if (q < best.x) best = vec2(q, ${f(MAT.TOWER)});
    }
  }
  return best;
}

// uOpen removes the floor and the ceiling: nothing but the scaffold, in every
// direction, for ever.
vec2 domainMap(vec4 p) {
  vec2 best = vec2(1e9, ${f(MAT.ROOM)});
  if (uOpen < 0.5) {
    float h = hHeight(p);
    best = vec2(min(h, CEILING - h), ${f(MAT.ROOM)});
  }
  vec2 c = contentMap(p);
  return c.x < best.x ? c : best;
}
`;
}
