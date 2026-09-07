// s3.js — the spherical world, and flying around inside it.
//
// S^3 is the third geometry geom.js knows, and the cheapest of the three to
// make into a place. It needs NO QUOTIENT: it is already compact, so there is
// no fundamental domain, no face scan, no pairing, no fold. Fly far enough in
// any direction and you come back after 2*pi, and nothing was glued to make
// that happen. Everything in hyp.js about the octagon and the dodecahedron
// simply has no counterpart here, and everything in the marcher that exists to
// fake compactness switches off.
//
// So this file is small, and that is the point rather than an accident.
//
// Like level.js, the scene is written ONCE as data and emitted TWICE: a JS SDF
// for the physics and a GLSL one for the renderer. Edit the arrays, never the
// emitted numbers.
//
// No DOM, so it is testable, and `s3.test.js` does test it.

import { S3 } from './geom.js';

/**
 * The geometry. Curvature +1: <x,y> = x0y0 + x1y1 + x2y2 + x3y3, <p,p> = 1.
 *
 * Named S3G rather than G because tools/preview.js cannot parse a RENAMED
 * import (`import { G as S3G }`) - it bundles the module graph by hand and
 * understands only the plain form. The browser is perfectly happy with either,
 * so this bites in exactly one place and it is cheaper to not need it.
 */
export const S3G = S3();

/** The player's collision radius, as PLAYER_R is in physics.js. */
export const S3_PLAYER_R = 0.07;

/**
 * How far round the world is. A geodesic closes at 2*pi, and half of that is
 * the ANTIPODE, where every geodesic from a point meets again.
 */
export const S3_LAP = 2 * Math.PI;
export const S3_ANTIPODE = Math.PI;

// --- the scene ----------------------------------------------------------
//
// Two rings of balls, and the arrangement is chosen to show the one thing
// about S^3 that no amount of description gets across.
//
// APPARENT SIZE IS NOT MONOTONIC IN DISTANCE. An object of proper radius r at
// distance t subtends about r / sin(t), and sin peaks at pi/2. So things look
// SMALLEST at a quarter of the way round the world and get bigger again as
// they recede past it, until at the antipode a single point fills the sky.
// That is the exact opposite of the hyperbolic world next door, where the
// e^{2r} volume growth shrinks everything away almost immediately.
//
//   six axis balls   at pi/2 = 1.5708, r 0.30  -> apparent 0.30 / 1.000 = 0.300
//   eight diagonals  at 2.80,          r 0.15  -> apparent 0.15 / 0.335 = 0.448
//
// The diagonals are nearly TWICE as far away and appear HALF AGAIN as large.
// A player who flies toward one watches it shrink.
//
// Nothing is at the origin, where the player spawns: the nearest surface is
// the axis balls' at 1.271. That rule matters more here than anywhere, because
// a camera inside a marker fills the screen with one flat colour and looks
// exactly like a shader that failed to compile.
//
// Materials stay below 10, which is the shader's "does it glow" boundary.
// Material 4 pulses, which is why the diagonals have it: with a finite light
// speed the far ones are caught at a visibly earlier phase than the near ones.
const AXES = [
  [[1, 0, 0], 2], [[-1, 0, 0], 3],
  [[0, 1, 0], 5], [[0, -1, 0], 7],
  [[0, 0, 1], 8], [[0, 0, -1], 9],
];

const DIAG_R = 1 / Math.sqrt(3);

/**
 * A ball, as the scene stores it: the CENTRE as a point of S^3, plus a radius
 * and a material.
 *
 * The centre a distance t from the origin along unit u is
 * `cos(t) * o + sin(t) * (u, 0)` = `(sin(t) * u, cos(t))`, which is the k = +1
 * case of the one geodesic formula in geom.js.
 */
function ball(u, t, r, mat) {
  const s = Math.sin(t), c = Math.cos(t);
  return { c: [s * u[0], s * u[1], s * u[2], c], r, mat };
}

export const S3_BALLS = [
  ...AXES.map(([u, mat]) => ball(u, Math.PI / 2, 0.30, mat)),
  ...[-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) =>
    ball([x * DIAG_R, y * DIAG_R, z * DIAG_R], 2.80, 0.15, 4)))),
];

/**
 * The scene as a distance and a material, exactly as `levelMap` is.
 *
 * There is no folding and no straddle copy, because there is no quotient: a
 * point of S^3 has ONE name, not infinitely many. That single fact is what
 * removes most of the code the hyperbolic side needs.
 */
export function s3Map(p) {
  let best = 1e9, mat = 1;
  for (const b of S3_BALLS) {
    const d = S3G.dist(p, b.c) - b.r;
    if (d < best) { best = d; mat = b.mat; }
  }
  return [best, mat];
}

/** Just the distance. This is what collision and the grapple would want. */
export function s3SDF(p) { return s3Map(p)[0]; }

// --- the same scene, as GLSL --------------------------------------------

const num = (n) => {
  const s = Number(n).toPrecision(9);
  return s.includes('.') || s.includes('e') ? s : `${s}.0`;
};

/**
 * Emit the scene for the shader.
 *
 * Written out rather than rolled with `rolled()`, for the reason level.js is:
 * these are constant array reads inside the march inner loop, and unrolled the
 * compiler folds them. The count is small (14 against the level's 39) and this
 * is the only content the spherical program has, since every level primitive
 * is dead code there.
 */
export function s3GLSL() {
  const n = S3_BALLS.length;
  return `
const vec4 S3_C[${n}] = vec4[${n}](
    ${S3_BALLS.map((b) => `vec4(${b.c.map(num).join(', ')})`).join(',\n    ')});
// x = radius, y = material.
const vec2 S3_RM[${n}] = vec2[${n}](
    ${S3_BALLS.map((b) => `vec2(${num(b.r)}, ${num(b.mat)})`).join(',\n    ')});

// The whole spherical scene. No domain, no folding, no straddle copy: a point
// of S^3 has one name, so there is nothing to reduce and nothing to teleport.
vec2 sphereWorld(vec4 p) {
  vec2 m = vec2(1e9, 1.0);
  for (int i = 0; i < ${n}; i++) {
    float d = hDist(p, S3_C[i]) - S3_RM[i].x;
    if (d < m.x) m = vec2(d, S3_RM[i].y);
  }
  return m;
}
`;
}

// --- flying -------------------------------------------------------------
//
// Free flight, and only free flight. There is no gravity here and there cannot
// usefully be: "down" has to be a function with |grad| = 1 that the geometry
// respects, and on a sphere the only candidates point at a pole, so a whole
// world would fall to one spot. The hyperbolic side gets a floor because a
// geodesic plane cuts H^3 into two convex halves; S^3 has no such cut.
//
// That makes this the SIMPLEST of the three to move around in, which is the
// other reason it was worth doing first.

// Terminal speed is S3_ACCEL / S3_DRAG, and it has to be set against the size
// of the WORLD rather than by feel, because in S^3 the world has a size. A lap
// is 2*pi = 6.283, so a terminal speed of 6 crosses the entire universe in a
// second and nothing is ever in view long enough to look at. At 1.2 a lap
// takes 5.2 s, the near ring of balls is about 1.3 s away and the far ring
// 2.3 s, which is a flight rather than a teleport.
const S3_DRAG = 2.0;
const S3_ACCEL = 2.4;

/**
 * Steer the velocity toward `want`, in FRAME components.
 *
 * All three axes are driven, unlike `control` in physics.js, which leaves E3
 * to gravity. There is no gravity to leave it to.
 */
export function s3Control(v, want, dt) {
  const out = [v[0], v[1], v[2]];
  for (let i = 0; i < 3; i++) {
    out[i] += want[i] * S3_ACCEL * dt;
    out[i] *= Math.exp(-S3_DRAG * dt);
  }
  return out;
}

/**
 * Advance one substep along the geodesic the velocity points down.
 *
 * Velocity in FRAME components is constant along a geodesic -- the frame is
 * parallel-transported by the same rotation that moves the point -- so this is
 * a single matrix multiply and the velocity is genuinely untouched. Identical
 * in form to `stepFree`, and identical for the same reason.
 *
 * `reorthonormalize` is not optional. Every multiply leaves the result a hair
 * outside SO(4), and unlike the hyperbolic case the drift does not run away to
 * infinity -- it quietly stops being a rotation, which is worse, because the
 * picture still looks plausible.
 */
export function s3Step(M, v, dt) {
  const speed = Math.hypot(v[0], v[1], v[2]);
  if (speed < 1e-12) return [S3G.reorthonormalize(M), v];
  const dir = [v[0] / speed, v[1] / speed, v[2] / speed];
  return [S3G.reorthonormalize(S3G.geodesic(M, dir, speed * dt)), v];
}

/** The outward normal of the surface under the player, in frame components. */
export function s3SurfaceNormal(M, sdf) {
  const p = S3G.point(M);
  const e = 1e-4;
  const c = Math.cos(e), s = Math.sin(e);
  const g = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const w = S3G.frameVec(M, i);
    // The geodesic offset in S^3: cos(e) * p + sin(e) * w, which is the k = +1
    // case of the same formula the hyperbolic normal uses with cosh and sinh.
    const pp = p.map((x, j) => c * x + s * w[j]);
    const pm = p.map((x, j) => c * x - s * w[j]);
    g[i] = (sdf(pp) - sdf(pm)) / (2 * e);
  }
  const m = Math.hypot(g[0], g[1], g[2]);
  if (m < 1e-12) return [0, 0, 1];
  return [g[0] / m, g[1] / m, g[2] / m];
}

/**
 * Push out of anything the player is inside, and kill the velocity going in.
 *
 * The push travels along a geodesic, so a deep correction lands ON the surface
 * rather than near it -- the same reason `collide` does it that way.
 */
export function s3Collide(M, v, sdf, r = S3_PLAYER_R) {
  let normal = null;
  for (let i = 0; i < 4; i++) {
    const d = sdf(S3G.point(M)) - r;
    if (d >= 0) break;
    const n = s3SurfaceNormal(M, sdf);
    M = S3G.geodesic(M, n, -d);
    normal = n;
    const vn = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
    if (vn < 0) v = [v[0] - vn * n[0], v[1] - vn * n[1], v[2] - vn * n[2]];
  }
  return [S3G.reorthonormalize(M), v, normal];
}

/**
 * How far round the world you have flown, folded into [0, 2*pi).
 *
 * There is no group to reduce by, so "where am I really" is answered by the
 * distance from where you started and nothing else. Worth having on the HUD
 * because it is the readout that makes the closure visible: fly straight, and
 * this climbs to 2*pi and returns to zero having passed through the antipode
 * at pi, where everything you can see is behind you.
 */
export function s3LapFraction(M, start) {
  const d = S3G.dist(S3G.point(M), S3G.point(start));
  return d / S3_ANTIPODE;
}
