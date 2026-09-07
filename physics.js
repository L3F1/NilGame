// physics.js — gravity, movement and the grapple, in H^3.
//
// The player is a PLACEMENT (a 4x4 Lorentz matrix): where they are, plus the
// orthonormal frame E1,E2,E3 they carry. Velocities are FRAME components
// [a, b, c] against that frame — the only representation that makes sense,
// since the frame is orthonormal everywhere so |v| is a real speed.
//
// No graphics and no DOM, so it can be tested. See physics.test.js.

import {
  matMul, inv, apply, point, frameVec, toFrame, geodesic, flow,
  reorthonormalize, rotationBetween, height, gradHeight, logTo, dist,
  radialHeight, radialGrad, dot, translation, foldPoint, reduceToDomain,
  closedGeodesicDirs, closedGeodesicLength, fromFrame, IDENTITY, pairings,
} from './hyp.js';

export const G = 3.0;          // gravity strength; uniform, unlike Nil's
// The player has to be small against the fundamental domain, and in the 3D
// world that size is not negotiable: the Seifert-Weber dodecahedron's inradius
// is fixed by its dihedral angle at about 0.996. A 0.25 player filled a
// quarter of the world and could not walk between two pillars.
//
// 0.07 rather than the old 0.10, in BOTH worlds. Smaller reads better for the
// same reason volume grows like e^(2r): the room is bigger than it looks, and
// a fighter wants gaps it can slip through. Smaller is always safe here -
// only growing risks straddling a face.
export const PLAYER_R = 0.07;

export const WALK_ACCEL = 12;
export const AIR_ACCEL = 3.5;
export const WALK_SPEED = 0.9;
export const GROUND_DRAG = 9;
export const JUMP = 1.1;       // apex = JUMP^2/(2G) ~ 0.20

export const ROPE_RANGE = 6;
export const REEL_SPEED = 1.2;
export const ROPE_MIN = 0.2;

// --- The speed that makes you fly ---------------------------------------
//
// Moving horizontally at altitude h pushes you UPWARD at v^2 * tanh(h). This
// is not a bug and not drag or lift: equidistant surfaces are convex toward
// the floor plane, so a geodesic that starts out horizontal curves AWAY from
// the floor. Travel one unit sideways at altitude 0.5 and you arrive at 0.74.
//
// So there is a critical speed. Above
//
//     v_fly = sqrt(G / tanh(h))  ->  sqrt(G) as you get high
//
// the geometry lifts you faster than gravity pulls, and you rise until you
// hit the ceiling. Below it you fall as expected. At h = 0 it costs nothing,
// which is why standing on the floor always feels normal.
//
// WALK_SPEED is deliberately under sqrt(G) = 1.73 so ordinary movement can
// never do this. A swing CAN exceed it, and that is left in on purpose: it is
// free altitude for a fast enough arc, and it is the most hyperbolic thing in
// the game. physics.test.js pins both halves.
export const FLY_SPEED = Math.sqrt(G);

// --- Which way is down ---------------------------------------------------
//
// Gravity is minus G times the gradient of an altitude function, and the only
// requirement on that function is |grad| = 1. Two are wired up:
//
//   PLANE   altitude = distance to the floor plane. Level sets are the floor
//           and the surfaces parallel to it. This is the default, and it is
//           Gamma-invariant, so it means the same thing in every copy.
//   POINT   altitude = distance to a beacon. Level sets are spheres, so you
//           fall inward from every direction and orbit instead of landing.
//
// Swapping between them changes what "down" means without touching the
// integrator, the collision, the rope or the level. Energy is still conserved
// because both are still gradients — physics.test.js checks the point field
// the same way it checks the plane one.
//
// The point field is NOT Gamma-invariant: a beacon is one point of the
// manifold with infinitely many lifts, so gravity aims at the nearest lift.
// That is continuous except on the surface equidistant between two lifts,
// where the nearest one changes and the force direction flips. The potential
// stays continuous, so energy survives the crease.

export const FIELD = { PLANE: 0, POINT: 1 };
let field = FIELD.PLANE;
let beacon = null;
// Scales gravity without changing which function it is the gradient of. Zero
// gives free flight, which is the only sane setting once the floor is removed
// and there is nothing left to land on.
let gScale = 1;

export function setGravityScale(k) { gScale = k; }
export function getGravityScale() { return gScale; }

/** Point gravity at `at`, or back to the floor with (FIELD.PLANE). */
export function setField(kind, at) {
  field = kind;
  beacon = kind === FIELD.POINT && at ? at.slice() : null;
}
export function getField() { return { kind: field, beacon }; }

/**
 * The beacon lift currently pulling, or null under plane gravity.
 *
 * This is the ONE lift the player planted, carried along by carryBeacon
 * whenever the player is folded — not whichever lift happens to be nearest.
 *
 * Aiming at the nearest lift was the obvious choice and is wrong to play: the
 * nearest lift changes as you move, so gravity flips direction whenever you
 * cross the surface equidistant between two of them, and the camera snaps to
 * a different copy's beacon. Following one lift instead means a beacon pulls
 * you back toward the copy you planted it in, and crossing a face changes
 * nothing — exactly the same fix the grapple anchor needed.
 */
export function activeBeacon() { return beacon; }

/** Carry the beacon through the group element the player was folded by. */
export function carryBeacon(g) {
  if (beacon) beacon = apply(g, beacon);
}

/** Altitude at p under the active field. */
export function altitude(p) {
  if (!beacon) return height(p);
  return radialHeight(p, beacon);
}

/** Unit "up" at p under the active field, as an ambient tangent vector. */
export function upAmbient(p) {
  if (!beacon) return gradHeight(p);
  return radialGrad(p, beacon);
}

/** Acceleration due to gravity at M, in frame components. */
export function gravity(M) {
  if (gScale === 0) return [0, 0, 0];
  const u = toFrame(M, upAmbient(point(M)));
  const k = G * gScale;
  return [-k * u[0], -k * u[1], -k * u[2]];
}

/** Which way is up at M, as a unit vector in frame components. */
export function upDirection(M) {
  return toFrame(M, upAmbient(point(M)));
}

/** How much a surface normal faces up. 1 is a flat floor, 0 a sheer wall. */
export function upness(M, n) {
  const u = upDirection(M);
  return n[0] * u[0] + n[1] * u[1] + n[2] * u[2];
}

/** Total energy. Constant under gravity alone — the invariant to test. */
export function energy(M, v) {
  return 0.5 * (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) + G * gScale * altitude(point(M));
}

/**
 * Re-pin the frame so E3 points up, rotating the velocity to match.
 *
 * A placement's frame is parallel-transported, so walking tilts E3 away from
 * up and the camera slowly rolls while "vertical" stops meaning vertical.
 * This rotates about the player's own point — an isometry that fixes where
 * they are — so nothing moves. With it applied every step, up is E3, the
 * camera's yaw/pitch mean what they look like, and gravity in frame
 * components is just (0, 0, -G).
 */
export function alignUp(M, v) {
  const u = upDirection(M);
  const R = rotationBetween([0, 0, 1], u);
  const M2 = reorthonormalize(matMul(M, R));
  // The velocity must be re-expressed in the new frame, or re-pinning would
  // silently steer the player. v_new = R^-1 v_old.
  const Ri = inv(R);
  const w = apply(Ri, [v[0], v[1], v[2], 0]);
  // Ri is returned so callers can carry OTHER frame-component vectors through
  // the same re-pinning. The holonomy meter tracks a heading that way, and
  // the accumulated turn is the enclosed area — see main.js.
  return [M2, [w[0], w[1], w[2]], Ri];
}

/** Carry a frame-component vector through an alignUp rotation. */
export function carryFrameVec(Ri, f) {
  const w = apply(Ri, [f[0], f[1], f[2], 0]);
  return [w[0], w[1], w[2]];
}

// --- Integrator ---------------------------------------------------------
//
// Strang splitting: half a gravity kick, an EXACT geodesic drift, half a
// kick. Both halves are symplectic, so the composition is too and energy
// error stays bounded instead of drifting.

function kick(M, v, dt) {
  const a = gravity(M);
  return [v[0] + a[0] * dt, v[1] + a[1] * dt, v[2] + a[2] * dt];
}

/**
 * One step of free motion under gravity. Returns [placement, velocity].
 *
 * The reorthonormalize is not optional. Every step multiplies matrices, each
 * multiplication leaves the result a hair outside O(3,1), and in H^3 that hair
 * is amplified: entries grow like cosh(distance), so the absolute error grows
 * with them. Left alone, <p,p> drifts off -1 — measured at -0.945 after a few
 * thousand steps — and once the point is no longer ON the hyperboloid the
 * geometry is meaningless and the position runs away to infinity within a
 * hundred more steps. Nil had no constraint to violate and needed nothing
 * like this.
 */
export function stepFree(M, v, dt) {
  let vv = kick(M, v, dt * 0.5);
  const [M2, v2] = flow(M, vv, dt);
  vv = kick(M2, v2, dt * 0.5);
  return [reorthonormalize(M2), vv];
}

// --- Collision ----------------------------------------------------------

/**
 * Unit surface normal at M, in FRAME components.
 *
 * Differences are taken ALONG the manifold — the sample points are
 * cosh(e)p +- sinh(e)E_i, which are genuine points of H^3 at distance e — so
 * this never leaves the hyperboloid and the components come out in the frame
 * directly. Perturbing the ambient 4-vector instead would drift off the
 * hyperboloid and quietly bias every normal.
 */
export function surfaceNormal(M, sdf) {
  const p = point(M);
  const e = 1e-4;
  const ch = Math.cosh(e), sh = Math.sinh(e);
  const g = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const w = frameVec(M, i);
    const pp = p.map((x, j) => ch * x + sh * w[j]);
    const pm = p.map((x, j) => ch * x - sh * w[j]);
    g[i] = (sdf(pp) - sdf(pm)) / (2 * e);
  }
  const m = Math.hypot(g[0], g[1], g[2]);
  if (m < 1e-12) return [0, 0, 1];
  return [g[0] / m, g[1] / m, g[2] / m];
}

/**
 * Push the player out of anything it is inside, and kill the velocity going
 * into the surface. Returns [placement, velocity, normal|null].
 *
 * The push travels along a geodesic, so a deep correction still lands on the
 * surface instead of near it.
 */
export function collide(M, v, sdf) {
  let normal = null;
  for (let i = 0; i < 4; i++) {
    const d = sdf(point(M)) - PLAYER_R;
    if (d >= 0) break;
    const n = surfaceNormal(M, sdf);
    M = geodesic(M, n, -d);
    normal = n;
    const vn = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
    if (vn < 0) v = [v[0] - vn * n[0], v[1] - vn * n[1], v[2] - vn * n[2]];
  }
  return [M, v, normal];
}

// --- Walking ------------------------------------------------------------

/**
 * Steer toward a desired horizontal velocity. `want` is in frame components;
 * only E1 and E2 are driven, so gravity keeps ownership of the vertical.
 * Valid because alignUp has pinned E3 to up.
 */
export function control(v, want, grounded, dt) {
  const out = [v[0], v[1], v[2]];
  const moving = want[0] !== 0 || want[1] !== 0;

  if (grounded) {
    const accel = WALK_ACCEL * dt;
    for (let i = 0; i < 2; i++) {
      const diff = want[i] - v[i];
      out[i] += Math.min(Math.abs(diff), accel) * Math.sign(diff);
    }
    if (!moving) {
      const k = Math.exp(-GROUND_DRAG * dt);
      out[0] *= k; out[1] *= k;
    }
    return out;
  }

  // AIRBORNE: add acceleration along the requested direction and NEVER brake.
  //
  // Steering toward a target velocity, as the grounded branch does, quietly
  // becomes a brake the moment the target is zero — and in the air the target
  // is zero whenever no key is held. That deleted the player's momentum in
  // about half a second and was why the grapple would not swing: the rope
  // preserves tangential velocity faithfully, and this threw it away again
  // every frame.
  //
  // Only the component ALONG the input direction is capped, so speed carried
  // in from a swing or a fall survives, and steering can still redirect it.
  if (!moving) return out;
  const wl = Math.hypot(want[0], want[1]);
  const dx = want[0] / wl, dy = want[1] / wl;
  const along = out[0] * dx + out[1] * dy;
  const add = Math.min(AIR_ACCEL * dt, Math.max(0, WALK_SPEED - along));
  out[0] += dx * add;
  out[1] += dy * add;
  return out;
}

// --- The grapple --------------------------------------------------------

/** The point at arclength t along the geodesic leaving M in unit direction u. */
export function rayPoint(M, u, t) {
  return apply(M, [Math.sinh(t) * u[0], Math.sinh(t) * u[1], Math.sinh(t) * u[2], Math.cosh(t)]);
}

/**
 * Fire along the geodesic leaving M in unit frame direction dir, and return
 * the first surface hit.
 *
 * The same march the fragment shader runs, so the hook ends up under the
 * crosshair. Because levelSDF is now an EXACT hyperbolic distance and t is
 * arclength, the step is simply d — the Nil version had to divide by an
 * ambient speed factor and then take 55% of the result to stay safe.
 */
export function cast(M, dir, sdf, maxT = ROPE_RANGE) {
  let t = 0, tSafe = 0, outside = false;
  for (let i = 0; i < 4000; i++) {
    const q = rayPoint(M, dir, t);
    const d = sdf(q);
    // If we start inside something there is no known-outside point to bisect
    // against. Walk out first. The player is never inside geometry, so this
    // is belt and braces, but a cast returning the muzzle would attach the
    // rope to the player.
    if (!outside) {
      if (d > 0.002) outside = true;
      else { tSafe = t; t += 0.01; if (t > maxT) break; continue; }
    }
    if (d < 0.002) {
      // Marching lands NEAR the surface; near is not good enough when the
      // hook must end up under the crosshair. Bisect onto it.
      let lo = tSafe, hi = t;
      for (let k = 0; k < 40; k++) {
        const mid = 0.5 * (lo + hi);
        if (sdf(rayPoint(M, dir, mid)) > 0) lo = mid; else hi = mid;
      }
      return { hit: true, t: lo, point: rayPoint(M, dir, lo) };
    }
    tSafe = t;
    t += Math.max(d, 0.001);
    if (t > maxT) break;
  }
  return { hit: false, t: maxT, point: rayPoint(M, dir, maxT) };
}

/** Fresh grapple state. `anchor` is a point. */
export function grappleAttach(anchor, length) {
  return { anchor: anchor.slice(), length };
}

/**
 * One rope step. Returns [placement, velocity, info].
 *
 * The rope is a hard distance constraint on the hyperbolic sphere around the
 * anchor. In Nil this needed a warm-started Levenberg-Marquardt solve every
 * frame that could fail; here logTo is closed form, exact and total, so the
 * whole branch-tracking apparatus is gone.
 *
 * When taut, the correction slides the player back along the connecting
 * GEODESIC and removes the outward part of the velocity. Everything
 * tangential survives, which is what makes it swing.
 */
export function grappleStep(state, M, v, dt, reeling, sdf = null) {
  const lv = logTo(M, state.anchor);
  const d = Math.hypot(lv[0], lv[1], lv[2]);
  if (d < 1e-6) return [M, v, { dist: d, dir: [0, 0, 1], taut: false }];
  const u = [lv[0] / d, lv[1] / d, lv[2] / d];   // unit, points at the anchor

  if (reeling) {
    state.length = Math.max(ROPE_MIN, state.length - REEL_SPEED * dt);
    // A little direct pull as well, so reeling feels like being yanked rather
    // than like a slowly shrinking circle.
    const pull = REEL_SPEED * 1.6 * dt;
    v = [v[0] + u[0] * pull, v[1] + u[1] * pull, v[2] + u[2] * pull];
  }
  // The rope never pays out. Letting it grow when the player is beyond its
  // length reads as "don't snap them to a halt" and is really "there is no
  // constraint": it drifts longer every frame and the swing becomes a fall.

  let taut = false;
  if (d > state.length) {
    taut = true;
    // The constraint MOVES the player, and a move that is not swept is a move
    // that goes through walls. Reeling hard pulls several centimetres a
    // substep, straight along the rope, and the rope does not care what is in
    // the way - so the player arrived inside the geometry and collide, which
    // only pushes out along the local normal, could not always get them back.
    // Sweeping the pull and stopping it a body's width short of the first
    // surface makes the wall win, which is the right answer: a rope pulling
    // you into a wall pins you against it.
    let pull = d - state.length;
    if (sdf) {
      const c = cast(M, u, sdf, pull + PLAYER_R);
      if (c.hit) pull = Math.min(pull, Math.max(0, c.t - PLAYER_R));
    }
    M = geodesic(M, u, pull);
    const vr = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
    if (vr < 0) v = [v[0] - vr * u[0], v[1] - vr * u[1], v[2] - vr * u[2]];
  }
  return [M, v, { dist: d, dir: u, taut }];
}

/** Sample the rope's geodesic, for drawing. Returns points. */
export function ropePoints(M, anchor, n = 24) {
  const lv = logTo(M, anchor);
  const d = Math.hypot(lv[0], lv[1], lv[2]);
  if (d < 1e-9) return [point(M), anchor.slice()];
  const u = [lv[0] / d, lv[1] / d, lv[2] / d];
  const out = [];
  for (let i = 0; i <= n; i++) out.push(rayPoint(M, u, (i / n) * d));
  return out;
}

void dist;

/**
 * Signed hyperbolic area swept about the domain centre, going from p to q.
 *
 * This is the holonomy meter, and it measures the thing that actually turns a
 * parallel-transported frame. Walking a closed loop on a surface of curvature
 * -1 rotates your frame by the area you enclosed (Gauss-Bonnet), so the area
 * IS the rotation.
 *
 * In geodesic polar coordinates the area element is sinh(r) dr dtheta, so the
 * sector swept out to the path integrates to (cosh(r) - 1) dtheta. A full
 * circle of radius r gives 2*pi*(cosh(r) - 1), the area of that disc — which
 * is why a wider loop is worth so much more than a tight one, and why this is
 * hopeless to farm in a flat world where the same integral gives zero.
 *
 * Note what this is NOT: alignUp cannot be used to measure it. On the floor
 * under plane gravity E3 is already up, so the re-pinning rotation is the
 * identity and carries no information at all.
 */
export function sweptArea(p, q) {
  let d = Math.atan2(q[1], q[0]) - Math.atan2(p[1], p[0]);
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const r = 0.5 * (Math.asinh(Math.hypot(p[0], p[1])) + Math.asinh(Math.hypot(q[0], q[1])));
  return (Math.cosh(r) - 1) * d;
}

// --- portals ------------------------------------------------------------
//
// A portal pair is two discs and one isometry. That is all a portal ever is,
// and this space makes the point better than a flat one does: the faces of the
// fundamental domain are ALREADY portals, glued by the group, and these are
// the same construction with a pair you place yourself instead of one the
// manifold came with. The renderer handles both the same way - reach the
// surface, apply the isometry to the chart, carry on marching - which is why
// portals cost almost nothing here after the quotient was built.
//
// A portal placement is an ordinary placement: column 3 is where it is, and
// column 0 is its OUTWARD normal, the way it faces. The other two columns span
// the disc.

export const PORTAL_R = 0.32;      // the opening's radius
export const PORTAL_RANGE = 4.0;   // how far you can place one

// Rotation by pi about the portal's own up axis, in frame components. This is
// the whole of the portal convention: a ray entering A's front travels along
// -E1, the flip turns that into +E1, and B's placement sends it out of B's
// front. Without it you would emerge going backwards into B's wall. Negating
// two columns rather than one keeps the determinant at +1, so it stays a
// rotation and not a reflection.
const PORTAL_FLIP = [-1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

let portals = [null, null];

export function getPortals() { return portals; }
export function portalsLive() { return portals[0] !== null && portals[1] !== null; }
export function clearPortals() { portals = [null, null]; }

/** The isometry that carries you through the opening at `from`, out of `to`. */
export function portalMap(from, to) {
  return matMul(matMul(to, PORTAL_FLIP), inv(from));
}

/**
 * Put portal i under the crosshair, facing back at the player.
 *
 * Cast first so it lands on whatever you are looking at, and stand it off the
 * surface by a little: a disc flush with a wall would have the wall's own
 * pixels fighting the opening. If the cast misses, hang it in mid air at
 * arm's length, which is the useful behaviour in the open world where there
 * are no walls to put one on.
 */
// How far off the wall the disc floats, and it MUST clear the player.
//
// Collision stops the player's CENTRE at PLAYER_R from the wall, but crossing
// a portal is the centre passing through its plane. Mount the disc closer than
// PLAYER_R and the centre can never legally reach it: you walk into the wall
// and stop, and the portal does nothing. It was 0.06 against a 0.07 player,
// which is why it worked "sometimes" - only when a fast approach carried the
// centre past the plane inside one substep, before collide pushed it back out.
// A coin flip, decided by frame rate.
//
// Derived from PLAYER_R rather than written out, so shrinking the player can
// never quietly re-break it.
const PORTAL_LIFT = PLAYER_R + 0.06;

/**
 * Place portal i, MOUNTED FLUSH ON THE SURFACE THE AIM HITS.
 *
 * The orientation comes from the WALL, not from where the player is looking.
 * Facing it along the aim instead put the disc at whatever angle you happened
 * to be standing at, so a portal on a flat floor could stand up like a hoop
 * and one on a wall could lie at a slant - and since the pairing is built from
 * the two placements, a crooked portal quietly tilts everything you walk out
 * into. Taking the normal from the surface makes a floor portal lie flat and a
 * wall portal stand upright without the player aiming carefully.
 *
 * The normal is the SDF gradient at the hit point, which points out of the
 * surface into open space - so column 0 ends up facing back toward the player,
 * which is the outward-normal convention portalMap and the shader both expect.
 *
 * With nothing in range there is no surface to take a normal from, so it falls
 * back to the old behaviour and hangs in the air facing the player.
 */
export function placePortal(i, M, dir, sdf) {
  const c = cast(M, dir, sdf, PORTAL_RANGE);
  const R = rotationBetween([1, 0, 0], dir);
  if (!c.hit) {
    const t = Math.max(0.45, c.t);
    const P = matMul(matMul(matMul(M, R), translation([1, 0, 0], t)), PORTAL_FLIP);
    portals[i] = reorthonormalize(P);
    return portals[i];
  }
  // A placement AT the hit point, so the normal comes back in its own frame.
  const H = reorthonormalize(matMul(matMul(M, R), translation([1, 0, 0], c.t)));
  const n = surfaceNormal(H, sdf);
  const P = matMul(matMul(H, rotationBetween([1, 0, 0], n)),
                   translation([1, 0, 0], PORTAL_LIFT));
  portals[i] = reorthonormalize(P);
  return portals[i];
}

/**
 * Did the step from p0 to p1 go through a portal? If so, return the isometry
 * that carries the player through.
 *
 * Only front-to-back counts. The back of a portal is solid, so you cannot fall
 * out of the far side of one, and the two discs each send you to the other.
 *
 * The crossing point is found by linear interpolation and pushed back onto the
 * hyperboloid. Over a substep that is a very short chord, and the only thing
 * it decides is whether you were inside the opening or hit the rim.
 */
export function portalCrossing(p0, p1) {
  if (!portalsLive()) return null;
  for (let i = 0; i < 2; i++) {
    const A = portals[i], B = portals[1 - i];
    const N = [A[0], A[1], A[2], A[3]];        // column 0: the outward normal
    const f0 = dot(p0, N), f1 = dot(p1, N);
    if (!(f0 > 0 && f1 <= 0)) continue;        // front entry only
    const u = f0 / (f0 - f1 || 1e-12);
    const q = [
      p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u,
      p0[2] + (p1[2] - p0[2]) * u, p0[3] + (p1[3] - p0[3]) * u,
    ];
    const n = Math.sqrt(Math.max(-dot(q, q), 1e-18));
    const hit = [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
    if (dist(hit, [A[12], A[13], A[14], A[15]]) > PORTAL_R) continue;
    return portalMap(A, B);
  }
  return null;
}

/**
 * Carry both portals by the group element the player was folded by.
 *
 * Same reason as the grapple anchor and the beacon: a portal is a point of the
 * universal cover, and snapping it to whichever copy is nearest would move it
 * out from under the player mid-stride.
 */
export function carryPortals(g) {
  for (let i = 0; i < 2; i++) if (portals[i]) portals[i] = matMul(g, portals[i]);
}

// --- keeping carried objects in numerical range -------------------------
//
// The beacon, the portals and the grapple anchor are points of the UNIVERSAL
// COVER, carried by the same group element the player was folded by, so that
// they keep meaning the same thing (see carryBeacon). The cost is that their
// coordinates grow like cosh(distance from the player), and that distance is
// unbounded: with beacon gravity you can exceed escape speed and fly away for
// ever, and in the open world there is no floor to stop you.
//
// It breaks sooner than you would guess. Twenty face crossings puts the
// coordinates at 7e7, and folding a point that big back into the domain loses
// EVERY digit - <p,p> comes back as -0.12 instead of -1, and a few crossings
// later it is 1e46. The shader then gets a nonsense uBeacon, the 32-bit
// distance to it cancels to zero at every sample, and the whole screen floods
// with the beacon's purple. That is the failure; folding at upload time cannot
// fix it because the input is already destroyed.
//
// So bound the drift instead. Past CARRY_SNAP the object is re-folded into the
// domain, which is a different lift - but the player is folded too, so the new
// lift is within a domain diameter and the coordinates stay near cosh(5).
// Under the threshold nothing moves, so the no-flip behaviour that carrying
// one lift exists for is untouched in normal play.
//
// It also removes an escape that should not have existed. In H^3 the geodesic
// deviation term beats a linear potential, so beacon gravity has a finite
// escape speed of sqrt(G) that does NOT fall off with distance; past it you
// leave for ever. Re-snapping means the beacon you fly away from is replaced
// by the nearest copy of it, and in a compact manifold there is always one
// within a cell. You cannot leave, because there is nowhere to leave to.
export const CARRY_SNAP = 5.0;

export function settleCarried(p) {
  if (beacon && dist(p, beacon) > CARRY_SNAP) beacon = foldPoint(beacon);
  for (let i = 0; i < 2; i++) {
    if (portals[i] && dist(p, point(portals[i])) > CARRY_SNAP) {
      portals[i] = reduceToDomain(portals[i])[0];
    }
  }
}

// --- the boomerang ------------------------------------------------------
//
// A projectile that flies a CLOSED GEODESIC, so it comes back to exactly where
// it was launched - not because anything steers it, but because the manifold
// is compact and some of its geodesics close up. Nothing bends its path; it
// flies dead straight the whole way.
//
// The closed geodesics it uses are the axes of the generators, which all run
// through the cell centre. In the open world the SPOKES are drawn along those
// very axes, so the level shows you where to aim: fire down a spoke and it
// comes back down the spoke behind you.
//
// The frame it carries does not come back. In the dodecahedral world the
// gluing includes a 3/10 turn about the axis, so one lap rotates the
// boomerang by 108 degrees - holonomy you can watch.

// Slow enough to watch. Fast enough to be a projectile, slow enough that you
// can see it coming back at you, which is the whole trick.
export const BOOM_SPEED = 2.6;
// How far an AIMED throw goes before it turns round.
export const BOOM_RANGE = 2.6;
// It is CAUGHT after one lap, because after one lap it is exactly where it
// started. Without this it flew for ever and the HUD read OUT until you
// respawned. A lap is the honest lifetime: the manifold hands it back.
export const BOOM_LAPS = 1;
export const BOOM_R = 0.09;
// How many times it can rebound before it gives up on the outward leg and
// comes home. Five is enough to ricochet round a pillar and still return.
export const BOOM_BOUNCE_MAX = 5;
// How deep a surface has to be before it counts as a rebound. See boomSub:
// this MUST stay under PLAYER_R, or a throw bounces off the floor as it leaves
// your hand. Half the drawn radius, so it still turns before it visibly
// touches, and the substep is fine enough that it never tunnels a wall.
export const BOOM_SKIN = 0.045;
// How close to your hand counts as catching it.
export const BOOM_CATCH = 0.18;
// How hard it can turn while homing, in radians of course change per second.
// Not infinite, or it snaps onto you the instant it turns round and the return
// leg has no shape at all. At 3.4 it takes about half a second to reverse.
export const BOOM_TURN = 3.4;
// A hard stop, so a throw wedged in a corner cannot fly for ever. It also
// bounds the total arclength composed into the placement (see boomStep), which
// is what keeps the numbers honest.
export const BOOM_LIFE = 9.0;

// One throw PER OWNER, keyed by character id, rather than one in the world.
//
// This was a single module-level slot, and that slot was the reason two
// fighters could not each have a throw out at once: a bot that threw one
// silently took the player's. Everything below still defaults to owner 0 - the
// local player - so single-thrower calls read exactly as they did before.
const booms = new Map();

/** The throw belonging to one owner, or null. */
export function activeBoomerang(id = 0) { return booms.get(id) || null; }
export function clearBoomerang(id = 0) { booms.delete(id); }

/** Every throw in flight, whoever owns it. For drawing, and for the hit test. */
export function allBoomerangs() { return [...booms.values()]; }
export function clearAllBoomerangs() { booms.clear(); }

/** Where one owner's throw is right now, or null. */
export function boomerangPoint(id = 0) { return boomPoint(booms.get(id)); }

/** Where a GIVEN throw is. The form every list-walking caller wants. */
function boomPoint(b) {
  if (!b) return null;
  return point(geodesic(b.M, b.dir, b.s));
}

/**
 * Launch along whichever closed geodesic best matches where you are looking.
 *
 * A closed geodesic through the player's exact position would be a lucky
 * accident - they are a measure-zero set - so the boomerang starts from the
 * nearest point of the chosen axis instead. Which axis is a heuristic and only
 * a heuristic: how well its tangent lines up with the aim, less how far out of
 * the way it is. The GEOMETRY is exact once it is chosen.
 */
/**
 * Throw it along the geodesic you are LOOKING down.
 *
 * Gravity never touched this and still does not: a boomerang follows a
 * geodesic, which is the straightest line the space has, and gravity is not in
 * its integrator at all. What made it look like it fell was the closed-geodesic
 * mode below - in the bounded world every closed geodesic lies IN the floor
 * plane, so the throw started at your feet and skimmed the ground no matter
 * where you aimed. That is a fact about the octagon group, not about gravity.
 *
 * So this is the default: dead straight down your sightline, out to
 * BOOM_RANGE, then back along the same geodesic to your hand. It does not need
 * the manifold to bring it home, so it works at any aim.
 */
export function launchAimed(M, aim, id = 0) {
  const b = {
    owner: id,
    M: reorthonormalize(M), dir: [aim[0], aim[1], aim[2]],
    s: 0, out: true, closed: false,
    length: BOOM_RANGE, laps: 0,
    gone: 0, bounces: 0, age: 0,
  };
  booms.set(id, b);
  return b;
}

export function launchBoomerang(M, aim, id = 0) {
  const p = point(M);
  const aimAmb = fromFrame(M, aim);
  const dirs = closedGeodesicDirs();
  let best = -1e9, pick = null;
  for (const d of dirs) {
    for (const sgn of [1, -1]) {
      const u = [d[0] * sgn, d[1] * sgn, d[2] * sgn];
      const axis = [u[0], u[1], u[2], 0];               // its tangent AT the centre
      const s = Math.asinh(dot(p, axis));               // nearest point, as arclength
      const at = geodesic(IDENTITY, u, s);                 // placement there
      const tangent = fromFrame(at, [u[0], u[1], u[2]]);
      const off = distToAxisPoint(p, at);
      const score = dot(aimAmb, tangent) - 0.6 * off;
      if (score > best) { best = score; pick = { at, dir: u }; }
    }
  }
  const b = { owner: id, M: pick.at, dir: pick.dir, s: 0, out: true,
              closed: true, length: closedGeodesicLength(), laps: 0,
              gone: 0, bounces: 0, age: 0 };
  booms.set(id, b);
  return b;
}

function distToAxisPoint(p, at) { return dist(p, point(at)); }

/**
 * Advance the boomerang. Returns its point, or null if there is none.
 *
 * A lap is a wrap of the arclength, not a step of the placement. Carrying the
 * placement forward one lap at a time and re-folding it looks equivalent and
 * drifts badly: composing a boost of length L multiplies any existing error by
 * e^L, which is 7.4 here, so an error of 4e-15 after one lap is 1.1 after
 * forty. Reorthonormalizing does not help - it restores the group constraint,
 * not the position.
 *
 * Keeping the launch placement and holding s in [0, L) instead means the
 * numbers never grow at all: cosh(2R) is under four, whatever lap it is on.
 */
export function boomerangStep(dt, sdf = null, home = null, id = 0) {
  const b = booms.get(id);
  if (!b || dt <= 0) return boomPoint(b);
  // Substep finely enough that it cannot pass through its own body's width in
  // one go. Bouncing is a test of "is the tip inside something", and a test
  // like that only works if nothing thinner than the step can be jumped over.
  const n = Math.max(1, Math.ceil((BOOM_SPEED * dt) / (BOOM_R * 0.5)));
  const h = dt / n;
  // Re-check the map each substep: a catch or a timeout deletes the entry, and
  // stepping a throw that is already back in a hand would fly it again.
  for (let i = 0; i < n && booms.has(id); i++) boomSub(b, h, sdf, home);
  return boomPoint(booms.get(id));
}

/**
 * Turn the boomerang round at the current point without moving it.
 *
 * Re-basing the placement onto where it is and setting s back to zero. The
 * boost parallel-transports the frame, so the direction of travel keeps the
 * SAME frame components - which is the fact that makes both bouncing and
 * homing simple, because "which way am I going" is readable at any moment
 * without a coordinate change.
 */
function boomRebase(b) {
  if (b.s === 0) return;
  b.M = reorthonormalize(geodesic(b.M, b.dir, b.s));
  b.s = 0;
}

/**
 * One substep. Three things can happen: it flies, it rebounds off a surface,
 * or it steers toward your hand.
 */
function boomSub(b, h, sdf, home) {
  b.age += h;
  if (b.age > BOOM_LIFE) { booms.delete(b.owner); return; }
  const adv = BOOM_SPEED * h;

  // --- rebound ----------------------------------------------------------
  //
  // A specular bounce off the surface it met. The direction of travel at the
  // current point, in that point's own frame, is exactly b.dir - velocity in
  // frame components is constant along a geodesic - so the reflection is the
  // ordinary d - 2(d.n)n, with the normal taken from the SDF right there.
  //
  // Which means a bounce is not a special case of anything: it re-bases the
  // flight onto the wall and sets off along a new geodesic. A bounced throw is
  // as exact as a straight one.
  if (sdf) {
    const P = reorthonormalize(geodesic(b.M, b.dir, b.s));
    // BOOM_SKIN, not BOOM_R, AND IT MUST STAY UNDER PLAYER_R. The throw leaves
    // from the player's centre, and collide only guarantees that centre is
    // PLAYER_R (0.07) clear of anything - so a boomerang of radius 0.09 is
    // already "inside" the floor the instant it is launched. Testing against
    // the full radius made every throw aimed even slightly downward skip off
    // the ground before it left your hand: one bounce on the first substep,
    // measured. Under PLAYER_R there is nothing to hit at launch, and it still
    // rebounds just before it visually touches.
    const inside = BOOM_SKIN - sdf(point(P));
    if (inside > 0) {
      const nrm = surfaceNormal(P, sdf);
      const dn = b.dir[0] * nrm[0] + b.dir[1] * nrm[1] + b.dir[2] * nrm[2];
      // Only bounce when actually heading INTO the surface. Skipping that lets
      // it flip twice on consecutive substeps and sit vibrating in the wall.
      if (dn < 0) {
        const r = [
          b.dir[0] - 2 * dn * nrm[0],
          b.dir[1] - 2 * dn * nrm[1],
          b.dir[2] - 2 * dn * nrm[2],
        ];
        const rl = Math.hypot(r[0], r[1], r[2]) || 1;
        b.dir = [r[0] / rl, r[1] / rl, r[2] / rl];
        // Push clear of the surface, or the next substep finds it inside again
        // and bounces a second time off the same wall.
        b.M = reorthonormalize(geodesic(P, nrm, inside + 1e-3));
        b.s = 0;
        b.bounces++;
        // A closed geodesic that has been deflected is no longer closed, so
        // the manifold will not hand it back. It has to come home the hard way.
        if (b.closed) { b.closed = false; b.out = false; }
        if (b.bounces > BOOM_BOUNCE_MAX) b.out = false;
      }
    }
  }

  if (b.out) {
    // --- outward leg ----------------------------------------------------
    b.s += adv;
    b.gone += adv;
    if (b.closed) {
      while (b.s >= b.length) { b.s -= b.length; b.laps++; }
      if (b.laps >= BOOM_LAPS) b.out = false;
    } else if (b.gone >= b.length) {
      b.out = false;
      // Turn round on the spot. The return then STARTS by retracing the way it
      // came and bends from there toward wherever you have got to, which is
      // both what a boomerang looks like and the shortest way home when you
      // have not moved. Leaving it to the steering alone would work, but it
      // has to reverse through a half turn to do it, and that is the one
      // rotation with no preferred plane.
      // Re-base FIRST: boomRebase flies the placement forward along the
      // current dir, so reversing before it would fly it backwards instead.
      boomRebase(b);
      b.dir = [-b.dir[0], -b.dir[1], -b.dir[2]];
    }
    // NOT re-based here, and that is deliberate. Turning round costs nothing
    // if nothing has to steer, and re-basing a closed lap would carry the
    // placement forward by a whole translation length - which is exactly the
    // drift the arclength-only formulation exists to avoid. The homing branch
    // below re-bases because it has to; this one must not.
    return;
  }

  // --- the return leg -----------------------------------------------------
  //
  // It comes back to WHERE YOU ARE, not to where you threw it from. That has
  // to be a chase rather than a geodesic, because you have moved since - and
  // the target is the NEAREST LIFT of you, so it flies at the copy of you it
  // can actually see, which may well be through a face.
  //
  // Without a home to steer at (no player given) it just keeps going, which is
  // what the closed-geodesic mode wants: the manifold is the thing bringing it
  // back there, and nothing needs to steer.
  if (!home) {
    b.s += adv;
    b.gone += adv;
    if (b.closed) while (b.s >= b.length) { b.s -= b.length; b.laps++; }
    return;
  }

  boomRebase(b);
  const here = point(b.M);
  const target = nearestLift(here, home);
  const lv = logTo(b.M, target);
  const d = Math.hypot(lv[0], lv[1], lv[2]);
  if (d < BOOM_CATCH) { booms.delete(b.owner); return; }  // back in your hand
  const u = [lv[0] / d, lv[1] / d, lv[2] / d];
  b.dir = turnToward(b.dir, u, BOOM_TURN * h);
  b.s += adv;
  b.gone += adv;
}

/**
 * Rotate the unit vector d toward the unit vector u, by at most maxAng.
 *
 * A ROTATION, not a blend, and the difference is not cosmetic. Mixing two unit
 * vectors and renormalising looks like the same thing and fails completely at
 * the one angle that matters here: for d exactly opposite u, the mix is a
 * shorter copy of d, which normalises straight back to d. A throw aimed dead
 * ahead turns round into exactly that case, so with a blend it never turned at
 * all - it flew out and kept going until the lifetime killed it, coordinates
 * doubling every half second.
 *
 * Rodrigues about d x u, and when that cross product vanishes (parallel, or
 * the antipodal case above) any perpendicular axis will do: every plane
 * through the two is as good as any other.
 */
function turnToward(d, u, maxAng) {
  const c = Math.max(-1, Math.min(1, d[0] * u[0] + d[1] * u[1] + d[2] * u[2]));
  const ang = Math.acos(c);
  if (ang < 1e-6) return [u[0], u[1], u[2]];
  let ax = cross3(d, u);
  let al = Math.hypot(ax[0], ax[1], ax[2]);
  if (al < 1e-9) {
    const alt = Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    ax = cross3(d, alt);
    al = Math.hypot(ax[0], ax[1], ax[2]);
  }
  const a = [ax[0] / al, ax[1] / al, ax[2] / al];
  const th = Math.min(maxAng, ang);
  const cs = Math.cos(th), sn = Math.sin(th);
  const ad = a[0] * d[0] + a[1] * d[1] + a[2] * d[2];
  const cr = cross3(a, d);
  const r = [0, 1, 2].map((i) => d[i] * cs + cr[i] * sn + a[i] * ad * (1 - cs));
  const rl = Math.hypot(r[0], r[1], r[2]) || 1;
  return [r[0] / rl, r[1] / rl, r[2] / rl];
}

/** How far round its lap the boomerang is, 0..1. For the HUD. */
export function boomerangProgress(id = 0) {
  const boomerang = booms.get(id);
  if (!boomerang) return 0;
  // The outward leg fills the first half of the meter; the return, which is a
  // chase of unknown length, drains the second half against the hard lifetime.
  if (boomerang.out) {
    return 0.5 * Math.min(1, boomerang.gone / boomerang.length);
  }
  return 0.5 + 0.5 * Math.min(1, boomerang.age / BOOM_LIFE);
}

// --- rolling locomotion -------------------------------------------------
//
// The alternative to control(): instead of steering the velocity directly, the
// player is a ball that is spun up by a torque and moved by FRICTION where it
// touches the ground. Same integrator, same collision, same everything else -
// only the way input becomes motion changes.
//
// It plays quite differently, which is the point of having both. You cannot
// stop on command, because stopping means the contact absorbing your angular
// momentum; you cannot turn instantly, because the spin you already have keeps
// carrying you; and if you ask for more grip than the contact can supply, you
// slip and the ball spins uselessly under you.
//
// The contact model is the standard rigid-sphere impulse. With the contact
// offset rho = -r * up, a tangential impulse J changes the contact point's
// velocity by J * (1 + r^2/I), so the impulse that would exactly cancel a slip
// s is -s / (1 + r^2/I). For a solid sphere I = (2/5) m r^2, so that factor is
// 3.5 - which is why a ball takes a moment to spin up rather than snapping to
// speed: five sevenths of the impulse goes into rotation.
export const ROLL_TORQUE = 30.0;   // angular acceleration from input, rad/s^2
export const ROLL_AIR = 0.25;      // fraction of that available off the ground
export const ROLL_MU = 1.4;        // contact friction; below 1 it slips easily
export const ROLL_INERTIA = 0.4;   // 2/5, a solid sphere
export const ROLL_RESIST = 0.55;   // rolling resistance, so it settles
// Top speed, as the speed of the ball's surface. Torque alone has no limit -
// it would balance against rolling resistance at r*TORQUE/RESIST, which is
// 5.5 here, well past the sqrt(G) at which the geometry starts flying you.
// Capping the SPIN ABOUT THE INPUT AXIS is the same trick control() uses in
// the air: speed carried in from a slope or a swing survives, and only the
// part you are actively driving is limited.
export const ROLL_TOP = 1.35;      // a little above walking, below FLY_SPEED

const cross3 = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/**
 * One substep of rolling. Returns [velocity, spin, slipping].
 *
 * `spin` is angular velocity in FRAME components, like the velocity, so it
 * survives a fold untouched and alignUp carries it with carryFrameVec.
 *
 * The one concession to playability: a real ball in mid-air cannot torque
 * itself at all - angular momentum is conserved and there is nothing to push
 * against. ROLL_AIR gives back a quarter of the ground authority anyway,
 * because with a grapple in the game zero air control is miserable rather than
 * interesting. Set it to 0 for the honest version.
 */
export function rollControl(M, v, spin, want, grounded, dt) {
  const r = PLAYER_R;
  const I = ROLL_INERTIA * r * r;
  const up = upDirection(M);
  const out = [v[0], v[1], v[2]];
  const w = [spin[0], spin[1], spin[2]];

  // Input is a torque about the axis across the direction of travel: to roll
  // toward d on a floor whose up is u, spin about u x d.
  const wl = Math.hypot(want[0], want[1]);
  if (wl > 1e-9) {
    const d = [want[0] / wl, want[1] / wl, 0];
    const axis = cross3(up, d);
    const al = Math.hypot(axis[0], axis[1], axis[2]);
    if (al > 1e-9) {
      const u = [axis[0] / al, axis[1] / al, axis[2] / al];
      const already = w[0] * u[0] + w[1] * u[1] + w[2] * u[2];
      const room = Math.max(0, ROLL_TOP / r - already);
      const k = Math.min((grounded ? 1 : ROLL_AIR) * ROLL_TORQUE * dt, room);
      for (let i = 0; i < 3; i++) w[i] += u[i] * k;
    }
  }

  let slipping = false;
  if (grounded) {
    const rho = [-r * up[0], -r * up[1], -r * up[2]];
    const cv = cross3(w, rho);
    const contact = [out[0] + cv[0], out[1] + cv[1], out[2] + cv[2]];
    // Only the part along the surface can be resisted by friction.
    const along = contact[0] * up[0] + contact[1] * up[1] + contact[2] * up[2];
    const slip = [
      contact[0] - along * up[0],
      contact[1] - along * up[1],
      contact[2] - along * up[2],
    ];
    const sl = Math.hypot(slip[0], slip[1], slip[2]);
    if (sl > 1e-12) {
      const eff = 1 + (r * r) / I;                 // 3.5 for a solid sphere
      const want_ = sl / eff;                      // impulse that kills the slip
      const cap = ROLL_MU * G * gScale * dt;       // what the contact can supply
      const mag = Math.min(want_, cap);
      slipping = want_ > cap;
      const J = [-slip[0] / sl * mag, -slip[1] / sl * mag, -slip[2] / sl * mag];
      for (let i = 0; i < 3; i++) out[i] += J[i];
      const dw = cross3(rho, J);
      for (let i = 0; i < 3; i++) w[i] += dw[i] / I;
    }
    // Rolling resistance. Without it a ball on a level floor never stops, and
    // a floor you cannot stand still on is not somewhere you can fight.
    const damp = Math.exp(-ROLL_RESIST * dt);
    for (let i = 0; i < 3; i++) w[i] *= damp;
  }
  return [out, w, slipping];
}

/** How fast the surface of the ball is moving, for the HUD. */
export function rollSpeed(spin) {
  return PLAYER_R * Math.hypot(spin[0], spin[1], spin[2]);
}

// --- characters, health and hits ----------------------------------------
//
// A character is a placement, a velocity and some health. The player is one of
// these; so is an opponent. Keeping them in one list rather than special-casing
// the player is what makes a second one cheap, and it is the prerequisite for
// anything multiplayer: the network only ever has to carry this struct.
//
// DISTANCE BETWEEN CHARACTERS IS THE ORBIT DISTANCE, NOT THE COORDINATE ONE.
// Space is H^3/Gamma, so two characters that look adjacent on screen may be
// named by representatives a whole cell apart, and two that look a room apart
// may have nearly equal coordinates. What you SEE is the orbit, so what a hit
// must use is the orbit: the minimum over the group of the distance between
// one and every copy of the other. Comparing raw coordinates gives a weapon
// that misses what it visibly struck and hits what is not there.
//
// Checking identity plus the generators is enough at these ranges. Two things
// close enough to touch are at most one face apart, because a fundamental
// domain is wider than any character.

export const MAX_HEALTH = 100;
export const BOOM_DAMAGE = 26;      // four clean hits, so a round has shape
// A hit needs a moment of immunity afterwards, or one boomerang passing
// through at 2.2 units a second registers on every substep it overlaps and
// deletes a character instantly. 0.6s is comfortably longer than a pass.
export const HIT_COOLDOWN = 0.6;

/** A fresh character at M. `id` is whatever the caller wants to track it by. */
export function makeCharacter(M, id = 0) {
  return { id, M, vel: [0, 0, 0], spin: [0, 0, 0], health: MAX_HEALTH, hurtFor: 0, deadFor: 0 };
}

/**
 * Distance between two points OF THE MANIFOLD, which is what a hit means.
 *
 * The minimum over the group of the coordinate distance to each copy. See the
 * note above: this is the whole difference between a weapon that connects with
 * what you aimed at and one that does not.
 */
export function orbitDist(p, q) {
  let best = dist(p, q);
  for (const g of pairings()) {
    const d = dist(p, apply(g, q));
    if (d < best) best = d;
  }
  return best;
}

/** Tick a character's timers. Separate from movement so tests can drive it. */
export function stepCharacter(c, dt) {
  if (c.hurtFor > 0) c.hurtFor = Math.max(0, c.hurtFor - dt);
  if (c.health <= 0) c.deadFor += dt;
}

/**
 * Apply `amount` of damage, unless this character is still in its cooldown.
 * Returns true if it actually landed.
 */
export function damage(c, amount) {
  if (c.hurtFor > 0 || c.health <= 0) return false;
  c.health = Math.max(0, c.health - amount);
  c.hurtFor = HIT_COOLDOWN;
  return true;
}

/**
 * Does the live boomerang overlap any of `chars` right now? Damages the first
 * one it does and returns it, or null.
 *
 * `skip` is the id that threw it - your own boomerang passes through you on
 * the way out, and being hit by it as you release would be absurd. It comes
 * back to your hand rather than into your face.
 */
export function boomerangHits(chars, skip = null) {
  for (const b of booms.values()) {
    const bp = boomPoint(b);
    for (const c of chars) {
      // Your own throw comes back to your hand, not into your face. With one
      // slot that was a `skip` the caller had to remember to pass; now every
      // throw carries its own thrower, so it is right by construction even
      // with several in the air at once. `skip` is still honoured on top.
      if (c.id === b.owner || c.id === skip || c.health <= 0) continue;
      if (orbitDist(bp, point(c.M)) < BOOM_R + PLAYER_R) {
        if (damage(c, BOOM_DAMAGE)) return c;
      }
    }
  }
  return null;
}

// --- the block: something you can build, after a delay -------------------
//
// A sphere of solid space you place where you are looking. It is NOT solid
// when you throw it: there is a delay while it forms, and only then does it
// start blocking. The delay is the whole design - an instant wall is a
// get-out-of-jail button, a wall that arrives in three quarters of a second is
// a prediction, and a prediction is a thing an opponent can read and beat.
//
// It is worth more here than it would be in a flat game, and the reason is the
// same reason everything else here is: volume grows like e^(2r). A sphere of
// radius 0.35 blocks an enormous solid angle from two metres away and almost
// nothing from six, so cover is intensely local. You cannot wall off a lane,
// only the piece of it you are standing in.
export const BLOCK_R = 0.34;
export const BLOCK_DELAY = 0.75;   // seconds before it turns solid
export const BLOCK_LIFE = 9.0;     // seconds it lasts once solid
export const BLOCK_RANGE = 3.0;

// One block per owner, same reason as the boomerang above.
const blocks = new Map();

export function activeBlock(id = 0) { return blocks.get(id) || null; }
export function clearBlock(id = 0) { blocks.delete(id); }

/** Every block that exists, forming or solid. */
export function allBlocks() { return [...blocks.values()]; }
export function clearAllBlocks() { blocks.clear(); }

/** Place one where the aim hits, or at arm's length if it hits nothing. */
export function placeBlock(M, dir, sdf, id = 0) {
  const c = cast(M, dir, sdf, BLOCK_RANGE);
  // Back off by its own radius so it sits ON the surface rather than in it,
  // and never closer than the player's own body or it would spawn inside you.
  const t = c.hit ? Math.max(PLAYER_R + BLOCK_R + 0.05, c.t - BLOCK_R)
                  : BLOCK_RANGE * 0.7;
  const b = { owner: id, at: point(geodesic(M, dir, t)), age: 0 };
  blocks.set(id, b);
  return b;
}

/** Age it. Returns the block, or null once it has expired. */
export function blockStep(dt, id = 0) {
  const b = blocks.get(id);
  if (!b) return null;
  b.age += dt;
  if (b.age > BLOCK_DELAY + BLOCK_LIFE) { blocks.delete(id); return null; }
  return b;
}

/** Age every block at once, whoever owns it. */
export function blockStepAll(dt) {
  for (const id of [...blocks.keys()]) blockStep(dt, id);
}

export function blockSolid(id = 0) {
  const b = blocks.get(id);
  return !!b && b.age >= BLOCK_DELAY;
}

/** How far it has formed, 0..1. For drawing it as a ghost while it builds. */
export function blockForming(id = 0) {
  const b = blocks.get(id);
  if (!b) return 0;
  return Math.min(1, b.age / BLOCK_DELAY);
}

/** Distance to the block, or a large number when it is not solid yet. */
export function blockSDF(p) {
  // The MINIMUM over every solid block. Anything less and a second player's
  // wall would be scenery you walk through - a wall that is solid on one
  // screen and not the other is not a wall, it is a disagreement.
  let d = 1e9;
  for (const b of blocks.values()) {
    if (b.age < BLOCK_DELAY) continue;              // still forming, not solid
    const c = dist(p, b.at) - BLOCK_R;
    if (c < d) d = c;
  }
  return d;
}

/** Carry the block through a fold, like every other point of the cover. */
export function carryBlock(g) {
  for (const b of blocks.values()) b.at = apply(g, b.at);
}

// --- characters bumping into each other ---------------------------------
//
// Yes, they collide, and it has to be done on the ORBIT: two fighters that
// look like they are touching may be named by representatives a cell apart.
// Comparing coordinates would let them walk through each other on screen and
// collide with nothing at a distance.
//
// The push is along the geodesic between them and it is symmetric, so neither
// can shove the other around by walking harder. The approach speed is removed
// as well - without that they interpenetrate every substep, get pushed out
// every substep, and buzz.

/** The lift of q that is nearest p: the copy you can actually see. */
export function nearestLift(p, q) {
  let best = q, bestD = dist(p, q);
  for (const g of pairings()) {
    const c = apply(g, q);
    const d = dist(p, c);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/**
 * Push two bodies apart if they overlap. Mutates nothing; returns
 * [Ma, va, Mb, vb] or null when they are clear of each other.
 */
export function bump(Ma, va, Mb, vb, r = PLAYER_R) {
  const pa = point(Ma);
  const near = nearestLift(pa, point(Mb));
  const d = dist(pa, near);
  const span = 2 * r;
  if (d >= span || d < 1e-9) return null;

  // Directions, each in its OWN frame. logTo from a to the copy of b it can
  // see, and from b to the copy of a it can see - not the negation of the
  // first, because frame components at two different points are not the same
  // coordinates.
  const ua = logTo(Ma, near);
  const la = Math.hypot(ua[0], ua[1], ua[2]) || 1;
  const ub = logTo(Mb, nearestLift(point(Mb), pa));
  const lb = Math.hypot(ub[0], ub[1], ub[2]) || 1;
  const push = (span - d) * 0.5;

  const Ma2 = geodesic(Ma, [-ua[0] / la, -ua[1] / la, -ua[2] / la], push);
  const Mb2 = geodesic(Mb, [-ub[0] / lb, -ub[1] / lb, -ub[2] / lb], push);

  // Remove the part of each velocity that is closing the gap. Leaving it in
  // means they overlap again next substep and jitter.
  const kill = (v, u, l) => {
    const n = [u[0] / l, u[1] / l, u[2] / l];
    const along = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
    if (along <= 0) return v;
    return [v[0] - along * n[0], v[1] - along * n[1], v[2] - along * n[2]];
  };
  return [reorthonormalize(Ma2), kill(va, ua, la),
          reorthonormalize(Mb2), kill(vb, ub, lb)];
}

/**
 * Carry the boomerang through a fold, like every other object of the cover.
 *
 * Not for correctness of the flight - the path is a geodesic either way - but
 * to keep its coordinates near the player's. Left behind, the gap between the
 * two grows by a domain diameter at every crossing, and coordinates here grow
 * like cosh of that gap.
 */
export function carryBoomerang(g) {
  for (const b of booms.values()) b.M = reorthonormalize(matMul(g, b.M));
}

// ========================================================================
// Five abilities that need this space to exist
// ========================================================================
//
// The bar for all of them is the same as everything else here: a thing you
// cannot do in a flat world, or that means something different when you do.

// --- 1. The decoy: a copy of yourself, out of your own past --------------
//
// In a compact manifold you can already see yourself. Your images sit one cell
// away down every sightline, so an opponent looking at you is looking at a
// dozen figures and only one of them is where you are. A decoy here is
// therefore not "a thing that pretends to be you" - it is genuinely
// indistinguishable from the copies of you that are already on screen, because
// it is drawn with the same material and it moves the way you moved.
//
// It is built from the position history the finite-light-speed mode already
// keeps: press the key and the last few seconds of your movement detach and
// keep walking, on a loop. Nothing else in the game gets a second use out of
// that ring, and nothing in a flat world would make the lie work, because
// there you only ever have one body on screen to compare it against.
export const DECOY_LIFE = 7.0;
export const DECOY_COOLDOWN = 7.0;

const decoys = new Map();

export function activeDecoy(id = 0) { return decoys.get(id) || null; }
export function clearDecoy(id = 0) { decoys.delete(id); }

/** Every decoy walking its loop. */
export function allDecoys() { return [...decoys.values()]; }
export function clearAllDecoys() { decoys.clear(); }

/**
 * Plant one. `pts` is a path, oldest first, `dtPer` seconds apart; they are
 * points of the UNIVERSAL COVER in the player's current chart, so a fold has
 * to carry them (carryDecoy) exactly like the anchor and the beacon.
 */
export function plantDecoy(pts, dtPer, id = 0) {
  if (!pts || pts.length < 2) return null;
  const d = { owner: id, pts: pts.map((p) => p.slice()), dtPer, t: 0, age: 0 };
  decoys.set(id, d);
  return d;
}

/** Advance the playback. Returns where it is now, or null once it expires. */
export function decoyStep(dt, id = 0) {
  const decoy = decoys.get(id);
  if (!decoy) return null;
  decoy.age += dt;
  if (decoy.age > DECOY_LIFE) { decoys.delete(id); return null; }
  const span = (decoy.pts.length - 1) * decoy.dtPer;
  decoy.t += dt;
  // It LOOPS. The recording is only a few seconds and the decoy has to outlast
  // that, and something walking the same short beat over and over reads as a
  // figure going about its business rather than as a corpse.
  while (decoy.t >= span) decoy.t -= span;
  return decoyPoint(id);
}

/** Advance every decoy at once, whoever planted it. */
export function decoyStepAll(dt) {
  for (const id of [...decoys.keys()]) decoyStep(dt, id);
}

export function decoyPoint(id = 0) {
  const decoy = decoys.get(id);
  if (!decoy) return null;
  const u = decoy.t / decoy.dtPer;
  const i = Math.min(decoy.pts.length - 2, Math.max(0, Math.floor(u)));
  const f = u - i;
  const a = decoy.pts[i], b = decoy.pts[i + 1];
  // Straight combination pushed back onto the hyperboloid. For two points a
  // fifth of a second apart that IS the geodesic between them.
  const q = [0, 1, 2, 3].map((k) => a[k] + (b[k] - a[k]) * f);
  const n = Math.sqrt(Math.max(-dot(q, q), 1e-12));
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

export function carryDecoy(g) {
  for (const d of decoys.values()) d.pts = d.pts.map((p) => apply(g, p));
}

// --- 2. Recall: go back to where you were --------------------------------
//
// The same ring, read once instead of replayed. It is an escape, and what
// makes it interesting here rather than ordinary is that the path you walked
// may have WRAPPED: three seconds ago you were, in coordinates, in a different
// copy of the room, and recall puts you back at that point of the manifold -
// which is why the trail has to be carried through every fold rather than
// stored folded. Stored folded, recall would drop you at whichever lift
// happened to be current, and the destination would jump about.
//
// It is also the one ability that gets stronger the more the space has been
// bending your path, because a straight-line retreat is exactly the retreat
// the geometry makes worthless.
export const RECALL_BACK = 3.0;        // seconds
export const RECALL_COOLDOWN = 9.0;

/**
 * Which point of `trail` (newest first) to recall to, or null if none is safe.
 *
 * Walking back down the trail rather than insisting on one index, because the
 * position you held three seconds ago may have a block or a wall in it now -
 * you can build in this game, and so can the other player.
 */
export function recallTarget(trail, sdf, dtPer, back = RECALL_BACK) {
  const want = Math.min(trail.length - 1, Math.round(back / dtPer));
  for (let i = want; i >= 1; i--) {
    const p = trail[i];
    if (!p) continue;
    if (sdf(p) > PLAYER_R + 0.01) return p;
  }
  return null;
}

/**
 * Move M to q along the connecting geodesic, keeping the frame.
 *
 * Parallel transport, so the velocity's frame components mean the same thing
 * at the far end and nothing has to be re-aimed. Used by recall and by the
 * anchor swap, which are the same operation with different destinations.
 */
export function warpTo(M, q) {
  const lv = logTo(M, q);
  const d = Math.hypot(lv[0], lv[1], lv[2]);
  if (d < 1e-9) return M;
  return reorthonormalize(geodesic(M, [lv[0] / d, lv[1] / d, lv[2] / d], d));
}

// --- 3. The sightline cutter: a slice of geodesic plane ------------------
//
// A totally geodesic plane is the flattest surface H^3 has, and it is the same
// object the floor is: the signed distance to it is exactly asinh(<p,N>) for a
// unit spacelike N, so its distance field is exact and one inner product wide.
//
// What makes it worth having as a weapon is that an unbounded one cuts H^3
// into two CONVEX half-spaces, so it blocks line of sight completely and at
// any range. This one is a disc, not a whole plane, so it does not manage that
// - but a disc of radius 0.6 against a cell of inradius 1.0 covers a great
// deal of a lane, and it is thin, which the block is not. The two are the same
// idea at different aspect ratios: a ball you hide behind, and a pane you shut
// a corridor with.
//
// The plane through the point you are aiming at, perpendicular to the
// sightline, is free: the ambient unit tangent to your own aiming geodesic AT
// that point is already a unit spacelike vector orthogonal to it, so it IS the
// plane's normal, with no construction at all.
export const CUT_R = 0.6;
export const CUT_THICK = 0.03;
export const CUT_LIFE = 5.0;
export const CUT_RANGE = 3.2;
export const CUT_COOLDOWN = 6.0;

const cuts = new Map();

export function activeCut(id = 0) { return cuts.get(id) || null; }
export function clearCut(id = 0) { cuts.delete(id); }

/** Every pane standing. */
export function allCuts() { return [...cuts.values()]; }
export function clearAllCuts() { cuts.clear(); }

export function placeCut(M, dir, sdf, id = 0) {
  const c = cast(M, dir, sdf, CUT_RANGE);
  // Stand it just short of whatever it hit, so it is a pane across the lane
  // rather than a decal buried in the far wall. Never inside the player.
  const t = Math.min(CUT_RANGE, Math.max(PLAYER_R + CUT_THICK + 0.15,
                                         c.hit ? c.t - 0.06 : CUT_RANGE * 0.65));
  const at = rayPoint(M, dir, t);
  // The tangent to the aiming geodesic at arclength t, as an ambient vector.
  // <at, N> = 0 by construction, so the plane {p : <p,N> = 0} passes through
  // the point, and <N,N> = 1 makes asinh(<p,N>) a true signed distance.
  const N = apply(M, [Math.cosh(t) * dir[0], Math.cosh(t) * dir[1],
                      Math.cosh(t) * dir[2], Math.sinh(t)]);
  const nl = Math.sqrt(Math.max(dot(N, N), 1e-12));
  const c2 = { owner: id, N: N.map((x) => x / nl), at, age: 0 };
  cuts.set(id, c2);
  return c2;
}

export function cutStep(dt, id = 0) {
  const c = cuts.get(id);
  if (!c) return null;
  c.age += dt;
  if (c.age > CUT_LIFE) { cuts.delete(id); return null; }
  return c;
}

/** Age every pane at once, whoever placed it. */
export function cutStepAll(dt) {
  for (const id of [...cuts.keys()]) cutStep(dt, id);
}

/**
 * Distance to the pane. The slab distance and the disc distance, maxed.
 *
 * Exact inside, an underestimate outside the rim - the safe direction, and the
 * same convention every primitive in level.js uses.
 */
export function cutSDF(p) {
  // The minimum over every pane, for the same reason blockSDF takes a minimum.
  let d = 1e9;
  for (const c of cuts.values()) {
    const slab = Math.abs(Math.asinh(dot(p, c.N))) - CUT_THICK;
    const disc = dist(p, c.at) - CUT_R;
    const v = Math.max(slab, disc);
    if (v < d) d = v;
  }
  return d;
}

export function carryCut(g) {
  for (const c of cuts.values()) {
    c.at = apply(g, c.at);
    // The normal is a 4-vector at a point, so it is carried by the SAME matrix
    // as the centre. Fold them apart and the plane no longer passes through
    // its own centre. It stays spacelike and unit because g is a Lorentz
    // transformation.
    c.N = apply(g, c.N);
  }
}

// --- 4. Holonomy, spent as a dash OR as a blast --------------------------
//
// The bank is a SIGNED area: sweptArea accumulates (cosh(r) - 1) dtheta, and
// dtheta has a sign, so circling one way fills it positive and the other way
// fills it negative. That sign was being thrown away with Math.abs, and it is
// the most interesting thing about the meter, because it means the DIRECTION
// you went round something decides which ability you have charged.
//
// Counter-clockwise banks a dash: speed, along the view. Clockwise banks a
// blast: an outward shove and damage on everything near you. Neither is
// available on demand - you have to have gone around something the right way,
// and going around it the other way empties what you had.
//
// The radius scales with the charge, and in this space that is worth far more
// than it sounds: volume grows like e^(2r), so widening a blast from 0.55 to
// 1.6 does not multiply the space it covers by three, it multiplies it by
// about twenty.
export const BLAST_R_MIN = 0.55;
export const BLAST_R_MAX = 1.60;
export const BLAST_DAMAGE = 44;
export const BLAST_PUSH = 2.4;
export const BLAST_COOLDOWN = 2.4;
export const BLAST_MIN_CHARGE = 0.30;   // radians of area; below this, nothing

export function blastRadius(charge) {
  const k = Math.min(1, Math.abs(charge) / 4);
  return BLAST_R_MIN + (BLAST_R_MAX - BLAST_R_MIN) * k;
}

/**
 * Set one off at p. Damages and shoves every character within the radius.
 * Returns the list of characters it damaged.
 *
 * Range is measured on the ORBIT, like every other interaction between
 * characters: what you see is the orbit, so what a blast reaches must be too.
 */
export function holoBlast(p, charge, chars, skip = null) {
  const R = blastRadius(charge);
  const scale = Math.min(1, Math.abs(charge) / 3);
  const hits = [];
  for (const c of chars) {
    if (c.id === skip || c.health <= 0) continue;
    const q = point(c.M);
    const d = orbitDist(p, q);
    if (d > R) continue;
    const near = 1 - d / R;
    if (damage(c, Math.round(BLAST_DAMAGE * scale * (0.35 + 0.65 * near)))) hits.push(c);
    // Shove outward. logTo from the character to the copy of the blast it can
    // see, negated: away from the blast, in the character's OWN frame.
    const to = logTo(c.M, nearestLift(q, p));
    const l = Math.hypot(to[0], to[1], to[2]);
    if (l > 1e-9) {
      const k = BLAST_PUSH * scale * (0.4 + 0.6 * near);
      c.vel = [
        c.vel[0] - (to[0] / l) * k,
        c.vel[1] - (to[1] / l) * k,
        c.vel[2] - (to[2] / l) * k,
      ];
    }
  }
  return hits;
}

// --- 5. Anchor swap: trade places with the grapple hook -------------------
//
// Ordinary in a flat game and not ordinary here, for two reasons.
//
// The rope's length is unchanged by the swap, so you arrive already at exactly
// the radius you left at - you keep swinging, from the other end of the same
// circle. And the anchor may be down a sightline that WRAPPED, so the place
// you are trading into can be a different copy of the room: you fired at
// something that looked far away, and you were looking at the back of your own
// head. That is a blink whose range you established earlier, by aiming.
//
// The frame goes with you by parallel transport along the connecting geodesic,
// so the velocity's frame components still mean what they meant and there is
// nothing to re-aim. It arrives a body's width short of the anchor, because
// the anchor is ON a surface.
export const SWAP_COOLDOWN = 4.0;

/**
 * Swap the player with their anchor. Returns [placement, new anchor point],
 * or null when there is no rope or it is too short to be worth it.
 */
export function anchorSwap(state, M) {
  if (!state) return null;
  const lv = logTo(M, state.anchor);
  const d = Math.hypot(lv[0], lv[1], lv[2]);
  if (d < PLAYER_R * 3) return null;
  const u = [lv[0] / d, lv[1] / d, lv[2] / d];
  const back = Math.max(0, d - (PLAYER_R + 0.06));
  const here = point(M);
  return [reorthonormalize(geodesic(M, u, back)), here];
}
