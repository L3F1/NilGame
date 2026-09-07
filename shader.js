// shader.js — the GLSL, as strings. No DOM, so tools can import it.
//
// The hyperbolic block below is a line-for-line port of hyp.js. Change one and
// change the other; they are the only cross-check the renderer has against the
// geometry. The level block is generated from level.js, and the group data
// from hyp.js.
//
// NEVER put a backtick in a shader comment. These live in JS template
// literals, so a backtick ends the string early and main.js stops being valid
// JavaScript — the module never loads and the screen is black BEFORE the
// shader is reached, so the COMPILE_STATUS check never fires. Use single
// quotes. tools/shader-check.js catches it if you forget.

import { levelGLSL } from './level.js';
import { OCT_SIDE, OCT_PAIR, DOD_SIDE, DOD_PAIR } from './hyp.js';

export const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

export const LINE_VERT = `#version 300 es
in vec2 aNDC;
void main() { gl_Position = vec4(aNDC, 0.0, 1.0); }`;

export const LINE_FRAG = `#version 300 es
precision highp float;
uniform vec3 uColor;
out vec4 fragColor;
void main() { fragColor = vec4(uColor, 1.0); }`;

const num = (n) => {
  const s = Number(n).toPrecision(9);
  return s.includes('.') || s.includes('e') ? s : `${s}.0`;
};
const vec4s = (a) => `vec4(${a.map(num).join(', ')})`;
const mat4s = (m) => `mat4(${m.map(num).join(', ')})`;

// The group, as constants. Eight side normals and eight pairings are the
// entire description of a closed genus-2 surface.
// Both groups, as constants.
//
// OCTAGON tessellates the FLOOR only, so the manifold is
// (genus-2 surface) x R: compact sideways, infinite up and down. Remove the
// floor there and you fall out of the world.
//
// DODECAHEDRON is Seifert-Weber space, a CLOSED hyperbolic 3-manifold. It
// repeats in every direction including above and below, which is what an
// open world actually needs.
const GROUP_GLSL = `
const vec4 OCT_SIDE[8] = vec4[8](
    ${OCT_SIDE.map(vec4s).join(",\n    ")});
const mat4 OCT_PAIR[8] = mat4[8](
    ${OCT_PAIR.map(mat4s).join(",\n    ")});
const vec4 DOD_SIDE[12] = vec4[12](
    ${DOD_SIDE.map(vec4s).join(",\n    ")});
const mat4 DOD_PAIR[12] = mat4[12](
    ${DOD_PAIR.map(mat4s).join(",\n    ")});
`;

const HYP_GLSL = `
float mdot(vec4 a, vec4 b) { return a.x*b.x + a.y*b.y + a.z*b.z - a.w*b.w; }

// Altitude: signed distance to the floor plane. |grad| = 1, so it IS a
// distance, and it is Gamma-invariant, so it means the same in every copy.
float hHeight(vec4 p) { return asinh(p.z); }

// Distance between two points. From <p-q,p-q> = 4 sinh^2(d/2), which stays
// well conditioned when they are close; acosh(-mdot(p,q)) does not.
float hDist(vec4 p, vec4 q) {
  vec4 w = p - q;
  return 2.0 * asinh(sqrt(max(mdot(w, w), 0.0)) * 0.5);
}

// The isometry translating distance t along the geodesic from the origin
// toward unit u. Same formula as hyp.js translation().
mat4 boostMat(vec3 u, float t) {
  float ch = cosh(t), sh = sinh(t);
  vec4 U = vec4(u, 0.0);
  mat4 B;
  for (int c = 0; c < 4; c++) {
    for (int r = 0; r < 4; r++) {
      float e3r = (r == 3) ? 1.0 : 0.0;
      float e3c = (c == 3) ? 1.0 : 0.0;
      B[c][r] = ((r == c) ? 1.0 : 0.0)
              + (ch - 1.0) * U[r] * U[c]
              + sh * (U[r] * e3c + e3r * U[c])
              + (ch - 1.0) * e3r * e3c;
    }
  }
  return B;
}
`;

export const FRAG = `#version 300 es
precision highp float;

uniform vec2  uRes;
uniform mat4  uPlayer;   // the player placement: where, plus their frame
uniform float uYaw;
uniform float uPitch;
uniform float uRoll;   // about the view axis; see cameraBasis in main.js
uniform float uSteps;
uniform float uTime;
uniform float uFog;      // Farsight lifts this
uniform float uMaxT;
uniform float uOpen;   // 1 = floor and ceiling removed
uniform float uZoom;   // 1 = full field of view; higher narrows it
uniform float uEdges;  // 1 = draw the fundamental domain outline
uniform float uSolid;  // 0 = octagon (floor only), 1 = dodecahedron (3D)
uniform float uSelfR;  // player radius; 0 hides the body
uniform float uSuper;  // 1 = 2x2 supersampling
uniform float uLightC; // world units per second; <= 0 means instantaneous

// A portal pair, already folded into the fundamental domain. Column 3 of each
// is where it is and column 0 is its OUTWARD normal; the other two span the
// disc. uPortalTA carries you through A and out of B, uPortalTB the other way.
// Both are computed on the CPU from the folded placements, because inverting a
// Lorentz matrix is exact and cheap there and the shader would only be
// repeating it 200 times a pixel.
uniform float uAO;     // 1 = ambient occlusion
uniform float uFoeHurt;  // 0 at full health, 1 at none; the body drains to dark

// --- everything round, in one list --------------------------------------
//
// The anchor, the beacon, both boomerangs, both blocks, both decoys, the
// opponent and a holonomy blast are all the same shape: a centre, a radius, a
// material, and a second copy across the nearest face. They used to be nine
// separate branches, and nine branches is nine copies of the code INSIDE
// sceneMap - which is itself inlined three times, once in the march and once
// each in the (rolled) normal and occlusion loops.
//
// Written as one list and one loop, the body is emitted once. The bound is a
// uniform, so the D3D compiler cannot count the iterations and will not unroll
// it back into what it was - the same trick rolled() plays, done better,
// because a count also means the loop runs only for the markers that are
// actually live. Nothing is up in the common case and the loop costs nothing.
//
// Adding a marker is now a CPU-side push and no shader change at all, which is
// the real win: every one of these cost link time to add, and the budget is
// finite. See tools/link-time.js.
//
// info is (radius, material, shell). shell draws the surface of the sphere
// rather than the ball, which is what a blast wants: an expanding shockwave
// you can see pass rather than a balloon.
const int MARKS = 10;
uniform int   uMarkN;
uniform vec4  uMark[MARKS];
// The copy on the far side of the face the centre is nearest to. A body on a
// seam pokes out through it, and the marcher never leaves the domain, so that
// part was simply CUT OFF - a sphere with a flat slice taken out of it. This
// second copy fills exactly the missing cap, because the piece that left
// through one face arrives through its pair. See straddleImage in main.js.
uniform vec4  uMarkAlt[MARKS];
uniform vec4  uMarkInfo[MARKS];

// --- the sightline cutter -----------------------------------------------
//
// A disc of totally geodesic plane. Its signed distance is asinh(<p,N>) for
// the unit spacelike normal N, which is the same formula the floor uses and
// is exact; the disc is that slab intersected with a ball. Two slots, because
// in a network game the other player can have one up as well - and theirs is
// solid to you, so it has to be drawn where it really is.
const int CUTS = 2;
uniform int   uCutN;
uniform vec4  uCutNorm[CUTS];
uniform vec4  uCutAt[CUTS];
uniform vec4  uCutNormAlt[CUTS];
uniform vec4  uCutAtAlt[CUTS];
uniform float uCutR;
uniform float uCutT;

uniform float uPortalOn;
uniform float uPortalR;
uniform mat4  uPortalA;
uniform mat4  uPortalB;
uniform mat4  uPortalTA;
uniform mat4  uPortalTB;

// Where the player HAS BEEN, folded, newest first, one sample every uHistDt
// seconds. See selfAt: what you see of yourself at distance t left you
// t/uLightC seconds ago, so the body drawn at distance t is the body from
// that far back in this buffer.
const int SELF_HIST = 32;
uniform vec4  uSelfHist[SELF_HIST];
// The far end of each segment: entry i+1 moved into the SAME copy as entry i.
// See selfAt - interpolating straight from uSelfHist[i] to uSelfHist[i+1] is
// what tore the body into stripes.
uniform vec4  uSelfHistB[SELF_HIST];
uniform float uHistDt;
// How fast the body moves per unit of ray distance: speed / uLightC. The
// self-sphere is not a static surface, and this is what keeps the marcher
// from stepping straight through it. See sceneMap.
uniform float uSelfLip;

out vec4 fragColor;

// Force a REAL loop out of the driver, where an unrolled one would be a second
// copy of something enormous.
//
// On Windows the browser runs ANGLE: this GLSL becomes HLSL, and the Direct3D
// compiler builds it at LINK time. That compiler inlines every call and unrolls
// every loop whose trip count it can work out - and the things looped over here
// each contain the whole level. Written out, main called trace five times and
// sceneNormal sampled sceneMap eight; the scene program took 212 SECONDS to
// link, and a browser kills a GPU process that unresponsive. See main.js link().
//
// gl_FragCoord.x is a pixel centre, so it is at least 0.5, so this returns n
// exactly. The compiler cannot prove that, so it cannot count the iterations,
// so it emits a loop and the body appears ONCE. Same work at run time.
//
// Use it ONLY where the body is large. On a small body in a hot path an
// unrolled loop is faster, because the compiler can fold the constant array
// reads - which is why level.js deliberately leaves its own loops alone.
int rolled(int n) { return n + int(min(gl_FragCoord.x, 0.0)); }

const float HIT_EPS  = 0.0015;
const float FACE_EPS = 0.0020;   // how close to a face counts as crossing it
// Only fold when the sample is outside by MORE than this. Landing exactly on
// a face is the teleport trap: the pairing takes a point on face k to a point
// on face k+4 at the same depth, so a 'depth < 0' test fires again at once and
// the ray ping-pongs between the two, burning every step without moving. It
// bites hardest at an edge, where stepping FACE_EPS along the ray past one
// face leaves a perpendicular depth of FACE_EPS*sin(angle) on its neighbour -
// which goes to zero as the ray grazes. A hundred times the float32 noise and
// two hundred times smaller than FACE_EPS, so no real crossing is missed.
const float FOLD_EPS = 1e-5;

// Fog, and it is doing more work here than in a flat game. Volume grows like
// e^(2r), so the number of copies in view grows with it, and past a few units
// each one is smaller than a pixel; fog is what stops that becoming noise.
//
// Extinction is PER CHANNEL, which is the one idea worth taking from the
// reference path tracer's air (it carries an absorb colour and applies
// exp(-absorb*dist), rather than a scalar). Red is absorbed half again as
// fast as blue, so distance shifts hue instead of only draining contrast -
// the cue that reads as depth in a real atmosphere. The two lines are the
// analytic single-scattering solution: what survives, plus what the air
// itself puts back.
const vec3 FOG_COL    = vec3(0.035, 0.045, 0.075);
const vec3 FOG_ABSORB = vec3(1.35, 1.10, 0.72);

// Light is not instantaneous, and in a compact manifold that is not a detail.
// You can see yourself here - your own images sit one cell away down every
// sightline - so a finite speed means the copy two cells off shows where you
// were, and the one five cells off shows where you were long before that. One
// object, a procession of its own past, all in view at once.
//
// The orbs pulse for the same reason: the same orb is caught at a different
// phase in every copy, because every copy is a different distance away.
${HYP_GLSL}
${GROUP_GLSL}
${levelGLSL()}
// Distance along the ray to a portal's plane, entering from the FRONT.
//
// Same closed form as exitDist - the portal's plane is the same kind of object
// as a face of the fundamental domain, which is the point: the faces already
// ARE portals, glued by the group, and a placed pair is the same construction.
// The front side is where <p,N> is positive, so entering it means f decreasing,
// which means a < 0. Only that direction teleports, and that is forced rather
// than chosen: crossing A front-to-back puts you BEHIND B moving out of it, so
// you immediately cross B back-to-front. If that counted too you would bounce
// straight back. One-sidedness is what makes the pair consistent.
float portalCross(mat4 chart, vec3 dir, float sMin, vec4 N) {
  vec4 D = chart * vec4(dir, 0.0);
  float a = mdot(D, N), b = mdot(chart[3], N);
  if (a >= -abs(b)) return 1e30;          // wrong way, or never meets it
  float tc = 0.5 * log((a - b) / (a + b));
  return tc > sMin ? tc : 1e30;
}

// Level plus the transient marker on the grapple anchor. The anchor is not in
// the level because physics must not collide with it.
// t is passed in so the player body can be skipped in the near field.
//
// Every uniform POINT here has been folded into the fundamental domain by
// the CPU, because p has been folded too. Comparing a folded point against
// an unfolded one puts the marker in the wrong copy - and once the unfolded
// one drifts a few cells away its coordinates grow like cosh until the
// distance to it cancels to zero in 32-bit float, reads as a hit at every
// pixel, and floods the screen with that material.
// Depth inside the ACTIVE fundamental domain, and which face is nearest.
float domainDepth(vec4 p, out int face) {
  float worst = -1e30;
  face = 0;
  if (uSolid < 0.5) {
    for (int k = 0; k < 8; k++) {
      float v = mdot(p, OCT_SIDE[k]);
      if (v > worst) { worst = v; face = k; }
    }
  } else {
    for (int k = 0; k < 12; k++) {
      float v = mdot(p, DOD_SIDE[k]);
      if (v > worst) { worst = v; face = k; }
    }
  }
  return -asinh(worst);
}

mat4 pairingOf(int face) {
  if (uSolid < 0.5) return OCT_PAIR[face];
  return DOD_PAIR[face];
}

// Where the player was, as seen from distance t.
//
// Light emitted by the body at distance t reaches the eye t/uLightC seconds
// later, so what is drawn there is the body as it was that long ago. The
// history is a ring of folded positions, one every uHistDt seconds, so the
// index is just the delay divided by the interval - and the fractional part
// is worth interpolating, because otherwise the copies advance in visible
// jerks once every uHistDt.
//
// Interpolation on the hyperboloid: take the straight-line combination and
// push it back onto the sheet. For two nearby points that IS the geodesic
// midpoint, and consecutive samples are always nearby.
vec4 selfAt(float t, out vec4 alt) {
  alt = uSelfHist[0];
  if (uLightC <= 0.0) return uSelfHist[0];
  float u = clamp((t / uLightC) / uHistDt, 0.0, float(SELF_HIST - 1) - 0.001);
  int i = int(u);
  // Interpolate along the SEGMENT, not between two folded representatives.
  //
  // Every history entry is folded into the fundamental domain on its own, so
  // when the player walks across a face the stored trail JUMPS to the far side
  // of the room even though the player did not move. Mixing across that jump
  // swept a phantom centre right across the domain over about a fifth of a
  // second of light-time, and since every ray meets it at a different distance
  // each one caught it somewhere else: the body came apart into thin sheets.
  // That is the banding, and it is why the copies looked like stacked lines
  // rather than a sphere.
  //
  // uSelfHistB[i] is entry i+1 carried into entry i's copy by the group
  // element the player actually crossed by, so this segment is the real path
  // and interpolating along it is honest motion.
  vec4 q = mix(uSelfHist[i], uSelfHistB[i], fract(u));
  q = q / sqrt(max(-mdot(q, q), 1e-12));
  // Then put it back in the domain, and this half is not optional either.
  //
  // A segment that straddles a crossing runs OUT of the fundamental domain by
  // the end, and the marcher's samples are always inside it, so an outside
  // centre draws the body in the wrong place - and worse, consecutive segments
  // would not join, because each is anchored in a different copy. Folding
  // lands every segment's far end exactly on the next one's near end, since
  // they are two lifts of the same point, so the whole trail is continuous.
  //
  // TWICE, not once. One pairing is enough for a walking pace, but a fast
  // segment - a swing, a dash - can end more than one face outside, and a
  // point left outside draws the body in the wrong place. That was the
  // remaining flicker after the interpolation was fixed.
  //
  // The loop KEEPS its last depth, so the straddle test below is free: asking
  // domainDepth again would be a second copy of it inlined at every sceneMap
  // site, and that alone cost 1.7 s of link time.
  int face;
  float dep = 0.0;
  for (int k = 0; k < rolled(3); k++) {
    dep = domainDepth(q, face);
    if (dep >= 0.0) break;
    q = pairingOf(face) * q;
  }
  // And the same straddle fix the other bodies get on the CPU: a centre within
  // a body radius of a face pokes through it, and the piece that leaves by one
  // face arrives by its pair.
  alt = dep < uSelfR ? pairingOf(face) * q : q;
  return q;
}

vec2 sceneMap(vec4 p, float t) {
  vec2 m = domainMap(p);
  // Every round marker: anchor, beacon, boomerangs, blocks, decoys, the
  // opponent, a blast. One body, run once per live marker. See uMark above.
  //
  // The blocks are drawn while they are still FORMING, at the size they will
  // be, so the other player can see one coming and get out of the way - that
  // readability is the whole point of the delay. The decoys are drawn with the
  // player's own material, because a decoy that could be told apart from the
  // real thing would not be one; in a manifold where your images already stand
  // in every cell, one more is genuinely indistinguishable.
  for (int i = 0; i < uMarkN; i++) {
    // w is a near cutoff, and only the decoy uses it. A decoy is planted from
    // the oldest end of your own trail, so standing still and dropping one
    // puts it exactly where you are - and being inside a sphere fills the
    // whole screen with one flat colour, which looks precisely like a shader
    // that failed to compile. The self body has the same guard for the same
    // reason; nothing real is hidden by it, because the nearest copy of
    // anything is a whole cell away.
    if (t < uMarkInfo[i].w) continue;
    float d = min(hDist(p, uMark[i]), hDist(p, uMarkAlt[i])) - uMarkInfo[i].x;
    // A shell rather than a ball: the surface of the sphere, so a blast reads
    // as a wave going past instead of a balloon inflating through you.
    if (uMarkInfo[i].z > 0.5) d = abs(d) - 0.02;
    if (d < m.x) m = vec2(d, uMarkInfo[i].y);
  }
  // The panes. Slab distance and disc distance, maxed - exact inside, an
  // underestimate outside the rim, which is the safe direction for a marcher.
  for (int i = 0; i < uCutN; i++) {
    float a = max(abs(asinh(mdot(p, uCutNorm[i]))) - uCutT,
                  hDist(p, uCutAt[i]) - uCutR);
    float b = max(abs(asinh(mdot(p, uCutNormAlt[i]))) - uCutT,
                  hDist(p, uCutAtAlt[i]) - uCutR);
    float d = min(a, b);
    if (d < m.x) m = vec2(d, 19.0);
  }
  // The portal rims. A ring, not a disc: the opening has to stay open, so the
  // solid part is only the torus around the edge. Inside the ring the distance
  // to the rim is positive and the marcher sails through - into the isometry,
  // which is handled in the march loop rather than here.
  if (uPortalOn > 0.5) {
    float a = max(abs(asinh(mdot(p, uPortalA[0]))) - 0.015,
                  abs(hDist(p, uPortalA[3]) - uPortalR) - 0.03);
    if (a < m.x) m = vec2(a, 13.0);
    float b = max(abs(asinh(mdot(p, uPortalB[0]))) - 0.015,
                  abs(hDist(p, uPortalB[3]) - uPortalR) - 0.03);
    if (b < m.x) m = vec2(b, 14.0);
  }
  // The player has a body, and in a closed manifold that means you can see
  // yourself: your own images sit one cell away down every sightline.
  // Skipped in the near field so the camera is not inside its own head -
  // the nearest image is a whole cell away, so no real copy is hidden.
  if (uSelfR > 0.0 && t > 0.35) {
    vec4 selfAlt;
    // Divide by (1 + speed/c), and that division is what makes this a valid
    // sphere-tracing bound at all.
    //
    // Everything else here is a fixed surface. This one is not: its centre is
    // selfAt(t), so it MOVES as the ray advances - by speed/uLightC per unit
    // of t. Stepping by the raw distance therefore overshoots by up to that
    // fraction of the step, and at the slow light setting speed/c approaches
    // one, so the ray punches clean through the body on some pixels and not
    // others. Holes in a sphere, in bands. Scaling the step down by the rate
    // the target can close on us restores the guarantee.
    // Call it FIRST, into a variable. GLSL promises no evaluation order for
    // arguments, so reading selfAlt inside the same expression that fills it
    // is undefined - it would happen to work and not stay working.
    vec4 selfC = selfAt(t, selfAlt);
    float d = (min(hDist(p, selfC), hDist(p, selfAlt)) - uSelfR)
            / (1.0 + uSelfLip);
    if (d < m.x) m = vec2(d, 12.0);
  }
  return m;
}

// Unit up-vector at p: the height gradient, an ambient tangent vector.
vec4 upAt(vec4 p) {
  float s = sqrt(1.0 + p.z * p.z);
  return vec4(p.z * p.x, p.z * p.y, 1.0 + p.z * p.z, p.z * p.w) / s;
}

// Surface normal at p, as a unit ambient TANGENT vector. Not in frame
// components: the player frame lives at the player, not at p, so perturbing
// by it would slide off the hyperboloid. mdot of two ambient tangent vectors
// at p is their inner product, so shading needs no frame.
vec4 sceneNormal(vec4 p, float t) {
  float e = 0.0015;
  // Written out, these eight taps are eight inlined copies of the whole level,
  // and even one loop with both signs in it is two. Walking all eight in one
  // loop leaves ONE. Same central differences, same eight samples at run time -
  // see rolled() in level.js for why the bound has to be disguised.
  //
  // j runs 0..7: j>>1 picks the axis, j&1 picks the sign.
  vec4 g = vec4(0.0);
  for (int j = 0; j < rolled(8); j++) {
    int ax = j / 2;
    float sgn = (j - 2 * ax) == 0 ? 1.0 : -1.0;
    vec4 d = vec4(0.0);
    d[ax] = sgn * e;
    g[ax] += sgn * sceneMap(p + d, t).x;
  }
  vec4 G = vec4(g.x, g.y, g.z, -g.w);          // raise the index
  G = G + mdot(G, p) * p;                      // project onto T_p
  // A tangent vector at p is spacelike, so mdot(G,G) > 0 - but at a grazing
  // hit the four differences nearly cancel and it can come back at or below
  // zero. Dividing by sqrt(max(gg, 1e-12)) then scales G by up to a million
  // and the lighting term explodes, which after clamping is a white speck.
  // Those were the splotches along the horizon. Bail to "up" instead: at a
  // grazing hit the shading barely matters, and a wrong normal is worlds
  // better than an infinite one.
  float gg = mdot(G, G);
  if (gg < 1e-8) return upAt(p);
  return G / sqrt(gg);
}

// Ambient occlusion: how much of the sky can this point actually see.
//
// Walk a short way along the normal and ask the SDF how far the nearest
// surface is. In open space that distance equals how far you walked; anywhere
// with a neighbour it is less, and the shortfall IS the occlusion. Four
// samples with a geometric falloff is enough to read as contact shadow, and
// it is what separates a wall meeting a floor from a wall painted on a floor.
//
// The step along the normal is the exact geodesic, cosh(d)*p + sinh(d)*n, not
// p + d*n - the latter leaves the hyperboloid and the SDF of a point that is
// not in the space means nothing.
//
// Samples that leave the fundamental domain are dropped rather than folded.
// domainMap would happily answer for them, but it would be answering about
// the wrong copy, and a wrong answer here paints a dark smear along every
// seam. Unoccluded is the right default: an unfolded sample is one that has
// left the room, and there is nothing in the room to occlude it.
float ambient(vec4 p, vec4 n, float t) {
  if (uAO < 0.5) return 1.0;
  float occ = 0.0, w = 1.0;
  for (int i = 1; i <= rolled(4); i++) {
    float d = 0.055 * float(i);
    vec4 q = cosh(d) * p + sinh(d) * n;
    int face;
    if (domainDepth(q, face) < 0.0) continue;
    occ += w * max(d - sceneMap(q, t).x, 0.0);
    w *= 0.62;
  }
  return clamp(1.0 - 2.6 * occ, 0.0, 1.0);
}

// The pairing that brings you back across that face.
// How far ALONG THE RAY until it leaves the fundamental domain.
//
// This is the difference between a marcher that works at a seam and one that
// does not. domainDepth measures PERPENDICULAR distance to the nearest face,
// which is the correct sphere-tracing bound and is hopelessly pessimistic for
// a ray running nearly parallel to that face: the perpendicular distance is
// tiny while the ray can travel a long way before actually crossing. Clamping
// the step by it makes every step near a seam FACE_EPS-sized, the ray creeps
// along burning its whole budget, and the pixel falls through to the
// background. That is the grey wedge, and it is why the wedge shrinks when
// you raise Quality instead of moving: more steps, more creeping.
//
// The crossing is available in closed form, so there is no need to bound it.
// The ray is p(t) = sinh(t)*D + cosh(t)*Q with D = C*(dir,0) and Q = C*o, so
// against a face normal N the test value is
//
//     f(t) = <p(t), N> = a*sinh(t) + b*cosh(t),   a = <D,N>, b = <Q,N>
//
// which has at most ONE zero: for |b| < |a| it is a*sqrt(1-(b/a)^2)*sinh(t+ph)
// and for |b| > |a| it never changes sign at all. So there is no tangency
// case to worry about. f is increasing exactly when a > 0, and leaving the
// domain means f going from negative to positive, so the exits are the roots
// with a > 0:
//
//     tanh(t) = -b/a   ->   t = 0.5 * log((a - b) / (a + b))
//
// and a > |b| makes both of those logs' arguments positive. Returns a huge
// number when the ray never leaves - a vertical ray in the octagon world
// never crosses a side, and then nothing should clamp it.
float exitDist(mat4 C, vec3 dir, float tMin) {
  vec4 D = C * vec4(dir, 0.0);
  vec4 Q = C[3];
  float best = 1e30;
  if (uSolid < 0.5) {
    for (int k = 0; k < 8; k++) {
      float a = mdot(D, OCT_SIDE[k]);
      float b = mdot(Q, OCT_SIDE[k]);
      if (a > abs(b)) {
        float tc = 0.5 * log((a - b) / (a + b));
        if (tc > tMin) best = min(best, tc);
      }
    }
  } else {
    for (int k = 0; k < 12; k++) {
      float a = mdot(D, DOD_SIDE[k]);
      float b = mdot(Q, DOD_SIDE[k]);
      if (a > abs(b)) {
        float tc = 0.5 * log((a - b) / (a + b));
        if (tc > tMin) best = min(best, tc);
      }
    }
  }
  return best;
}

vec3 materialColor(float m, vec4 p, float up) {
  if (m < 1.5) {
    if (up > 0.5) {
      // Floor checker in KLEIN coordinates, p.xy / p.w: the whole hyperbolic
      // plane squashed into a unit disc. Cells shrink toward the rim, and
      // that shrinking is the hyperbolic plane drawn honestly.
      //
      // Geodesic polar is the obvious choice and is worse: atan pinches
      // every cell to a point at the octagon centre, so standing in the
      // middle fills the screen with a radial fan.
      vec2 kl = p.xy / p.w;
      float c = mod(floor(kl.x * 7.0) + floor(kl.y * 7.0), 2.0);
      vec3 col = mix(vec3(0.15, 0.18, 0.24), vec3(0.21, 0.25, 0.32), c);
      // Draw the octagon boundary. These lines are where one copy is glued to
      // the next: cross one and you are in the same room again. Eight of them
      // meet at every corner, which is what a genus-2 surface looks like.
      int face;
      float d = domainDepth(p, face);
      if (uEdges > 0.5 && uSolid < 0.5) col = mix(vec3(0.62, 0.46, 0.14), col, smoothstep(0.0, 0.05, d));
      return col;
    }
    if (up < -0.5) return vec3(0.07, 0.08, 0.11);
    return vec3(0.13, 0.14, 0.20);
  }
  if (m < 2.5) return vec3(0.42, 0.30, 0.22);
  if (m < 3.5) return vec3(0.20, 0.38, 0.28);
  if (m < 4.5) return vec3(0.15, 0.75, 0.85);
  if (m < 5.5) return vec3(0.34, 0.26, 0.20);   // bar
  if (m < 6.5) {
    // Walls get a coarse horizontal banding, in altitude. Altitude is a
    // Gamma-invariant function, so the courses line up across a face instead
    // of stopping dead at one - which is the whole point of the quotient.
    float band = mod(floor(hHeight(p) * 9.0), 2.0);
    return mix(vec3(0.30, 0.31, 0.34), vec3(0.37, 0.38, 0.41), band);
  }
  if (m < 7.5) return vec3(0.30, 0.27, 0.34);   // tower
  if (m < 8.5) return vec3(0.46, 0.44, 0.38);   // spoke
  if (m < 9.5) return vec3(0.26, 0.30, 0.38);   // pod
  if (m < 10.5) return vec3(1.0, 0.55, 0.15);   // grapple anchor
  if (m < 11.5) return vec3(0.90, 0.30, 1.00);  // gravity beacon
  if (m < 12.5) return vec3(0.35, 1.00, 0.55);  // the player, seen as a copy
  if (m < 13.5) return vec3(1.00, 0.62, 0.12);  // portal A rim
  if (m < 14.5) return vec3(0.20, 0.62, 1.00);  // portal B rim
  if (m < 15.5) return vec3(1.00, 0.24, 0.32);  // the boomerang
  // The opponent, draining toward dark as it is hurt.
  if (m < 16.5) return mix(vec3(1.00, 0.52, 0.20), vec3(0.34, 0.09, 0.07), uFoeHurt);
  if (m < 17.5) return vec3(0.42, 0.78, 0.55);  // a finished block: solid
  if (m < 18.5) return vec3(0.16, 0.34, 0.26);  // and one still forming
  if (m < 19.5) return vec3(0.55, 0.80, 1.00);  // a sightline cutter pane
  return vec3(1.00, 0.90, 0.45);                // a holonomy blast
}

// Direction of the sightline, narrowed by the zoom.
//
// ZOOM is an honest optical zoom and nothing more: a narrower fan of rays out
// of the same eye, so every ray is still a geodesic and what you see is still
// what light does. Dividing the transverse offset by uZoom multiplies the
// angular magnification by uZoom, which crops the edges of the field and
// magnifies uniformly - near and far alike.
//
// It replaced 'flat vision', which was a LENS rather than a zoom: it scaled
// the fan by alpha(t) = t/sinh(t), turning the hyperbolic s/sinh(d) falloff
// into the flat s/d one, so the far field came in while the near field stayed
// put. That is a thing a zoom cannot do, and depth stopped reading as depth -
// which was the point of it, and also why it was hard to fight in.
//
// It also costs less. alpha depended on t, so the direction changed at every
// step and the face-exit distance had to be recomputed every step with it. A
// zoom is constant along the ray, so the direction is computed ONCE, before
// the march, and survives every fold unchanged - a direction in frame
// components means the same thing in every chart.
vec3 rayDir(vec3 fwd, vec3 off) {
  return normalize(fwd + off / max(uZoom, 1e-3));
}

vec3 trace(vec2 uv) {


  float cy = cos(uYaw),   sy = sin(uYaw);
  float cp = cos(uPitch), sp = sin(uPitch);
  vec3 fwd = vec3(cy * cp, sy * cp, sp);
  vec3 r0  = vec3(sy, -cy, 0.0);
  vec3 u0  = cross(r0, fwd);
  // Roll turns the two transverse axes about the view axis. main.js does the
  // same rotation in cameraBasis, and the two must agree or the rope and the
  // crosshair drift apart from what the marcher draws.
  float cr = cos(uRoll), sr = sin(uRoll);
  vec3 right = cr * r0 + sr * u0;
  vec3 up    = cr * u0 - sr * r0;

  // ---- MARCH, TELEPORTING CHART TO CHART ------------------------------
  // The ray never leaves the fundamental domain. When it reaches a face, that
  // face's pairing carries the chart across and marching resumes: the ray has
  // crossed into the neighbouring copy, which IS this copy. So domainMap only
  // ever has to describe ONE copy - the ray cannot reach anything it has not
  // been told about, because it cannot leave the room. What makes that a
  // valid claim is never stepping past a face, which is exitDist's job.
  //
  // The direction is computed ONCE and never touched again, because a zoom
  // does not bend the ray: it is the same geodesic, just a narrower fan of
  // them. (Flat vision, which this replaced, rescaled the fan by a function of
  // t, so the direction changed every step and so did the face exit.) Frame
  // components survive both the boost (parallel transport) and the pairing
  // (which multiplies on the left, and so acts on the frame's columns without
  // touching a vector's components in it), so a direction means the same
  // thing in every chart the ray passes through.
  //
  // Teleport only once strictly outside, and always step a hair PAST a face
  // rather than onto it. Landing exactly on a face is the trap: the pairing
  // puts you exactly on the opposite face of the next copy, still at depth
  // zero, so the test fires again immediately and the ray teleports for ever
  // without advancing. See FOLD_EPS, which is the other half of that guard.
  vec3 off = uv.x * 1.2 * right + uv.y * 1.2 * up;

  // The chart the sample is measured from, and how far along it we are.
  //
  // The obvious formulation carries an accumulated group element and computes
  // every sample from the eye: p = Gacc * uPlayer * (sinh(t)*dir, cosh(t)).
  // It is correct and it falls apart at range. Both factors have entries of
  // size cosh(t) and the product cancels down to a point of size one, so the
  // absolute error is about cosh(t)^2 * 6e-8 - fine at t = 4, one part in
  // fifty at t = 7, and total nonsense by t = 10. The symptom is not a wrong
  // shape, it is white speckle: the normal is computed from differences that
  // have lost all their digits, comes out far too long, and the lighting term
  // saturates. Every pixel that gets a long sightline rolls the dice.
  //
  // So re-base. Keep the placement at the last teleport and measure s from
  // THERE, exactly as the reference marcher does (it resets localV0 on every
  // teleport rather than flowing from the eye). s never exceeds a cell
  // diameter, cosh(s)^2 stays near a hundred, and the range limit is gone -
  // not pushed back, gone, because the error no longer grows with t at all.
  // t is still carried alongside for fog, light delay and the flat lens.
  mat4 chart = uPlayer;
  float t = 0.0;            // total distance from the eye
  float s = 0.0;            // distance since the chart was re-based
  vec4 p = uPlayer[3];
  vec3 dir = rayDir(fwd, off);
  float hit = -1.0;
  float mat = 0.0;
  int steps = min(int(uSteps), 512);   // a bound, in case a uniform goes wrong

  float sExit = -1e30;      // where the ray leaves this copy; see exitDist

  // How wide one pixel is, as an angle. A fixed hit threshold is wrong in two
  // directions at once. Too fine, and a ray grazing the floor never converges:
  // sphere tracing on a surface it meets at a shallow angle shrinks its step
  // geometrically and approaches without arriving, so the ray dies with the
  // floor still 0.0016 away and the pixel comes out as sky. Too coarse, and
  // near surfaces go soft.
  //
  // The right threshold is not a constant, it is the pixel's FOOTPRINT. An
  // object of size s at distance d subtends s/sinh(d) here, so a pixel of
  // angular width w covers w*sinh(t) of world at distance t, and asking the
  // marcher to resolve below that is asking for detail that cannot be drawn.
  // Setting the threshold there fattens every surface by exactly one pixel,
  // no matter how far away it is - which is the definition of not being
  // visible. It also stops the marcher resolving sub-pixel detail on the
  // horizon, where the copies pile up, so it takes some of the speckle with
  // it. The cap keeps sinh from running away past the fog.
  // Zoom narrows the cone, so one pixel spans a proportionally SMALLER angle
  // and the threshold has to come down with it. Leaving it fixed would fatten
  // every surface by one un-zoomed pixel and the magnified view would come out
  // blobbier the further you zoomed in, which reads as the zoom being broken.
  float pix = (1.2 / uRes.y) / max(uZoom, 1e-3) * (uSuper > 0.5 ? 0.5 : 1.0);

  for (int i = 0; i < steps; i++) {
    p = chart * vec4(sinh(s) * dir, cosh(s));

    // Fold until INSIDE, not once per step. Near an edge or a corner the ray
    // can be outside two or three faces at once, and folding across one at a
    // time - a whole loop iteration each - burns the step budget.
    //
    // Crossing a face re-bases the chart onto the crossing point: carry the
    // chart forward by the boost the ray has already flown, then apply the
    // pairing. The boost parallel-transports the frame, which is exactly why
    // dir does not have to change - in frame components the velocity along a
    // geodesic is constant.
    int face;
    bool rebased = false;
    float depth = domainDepth(p, face);
    for (int fold = 0; fold < 12 && depth < -FOLD_EPS; fold++) {
      chart = pairingOf(face) * (chart * boostMat(dir, s));
      s = 0.0;
      p = chart[3];
      depth = domainDepth(p, face);
      rebased = true;
    }

    // A long unobstructed run inside one copy would grow s the same way, so
    // re-base on distance too. A cell is about three across; two is plenty.
    if (!rebased && s > 2.0) {
      chart = chart * boostMat(dir, s);
      s = 0.0;
      p = chart[3];
      rebased = true;
    }

    // The exit depends only on the chart and the direction, and neither
    // changes between re-bases, so this survives until the next one.
    if (rebased || sExit <= s) {
      sExit = exitDist(chart, dir, s);
    }

    vec2 m = sceneMap(p, t);
    if (m.x < min(0.05, max(HIT_EPS, pix * sinh(t)))) { hit = t; mat = m.y; break; }

    // Step by the SDF, but never past the face - beyond it domainMap is
    // describing the wrong copy. Landing a hair PAST the face rather than on
    // it is what stops the teleport loop; the FACE_EPS floor is what stops a
    // grazing crossing that rounds to 'still inside' from stalling, and it
    // cannot lose anything because m.x is at least the hit threshold here.
    float adv = min(m.x, max(sExit + FACE_EPS - s, FACE_EPS));

    // A portal is one more surface the step must not cross blind. Find where
    // the ray would meet the opening, and if that is inside this step, go
    // through instead: land a hair past the disc and re-base the chart on the
    // far portal. Exactly the fold above, with the pairing replaced by the
    // portal's own isometry - which is the whole point, since a face of the
    // fundamental domain is already a portal glued by the group.
    if (uPortalOn > 0.5) {
      float ca = portalCross(chart, dir, s, uPortalA[0]);
      float cb = portalCross(chart, dir, s, uPortalB[0]);
      bool useA = ca <= cb;
      float sc = useA ? ca : cb;
      if (sc - s < adv) {
        vec4 pc = chart * vec4(sinh(sc) * dir, cosh(sc));
        vec4 centre = useA ? uPortalA[3] : uPortalB[3];
        if (hDist(pc, centre) < uPortalR) {
          float d = sc - s + FACE_EPS;
          s += d;
          t += d;
          chart = (useA ? uPortalTA : uPortalTB) * (chart * boostMat(dir, s));
          s = 0.0;
          sExit = -1e30;                 // new chart, so the old exit is stale
          if (t > uMaxT) break;
          continue;
        }
      }
    }

    s += adv;
    t += adv;
    if (t > uMaxT) break;
  }


  vec3 col;
  if (hit < 0.0) {
    col = FOG_COL;
  } else {
    vec4 n = sceneNormal(p, hit);
    // These are cosines between unit vectors, so they belong in [0,1]. Saying
    // so costs nothing and means a normal that has lost its length can only
    // shade the surface wrongly, never blow the pixel out to white.
    float key = clamp(mdot(n, upAt(p)), 0.0, 1.0);
    vec4 tangent = chart * vec4(cosh(s) * dir, sinh(s));
    float head = clamp(-mdot(n, tangent), 0.0, 1.0);
    float occ = ambient(p, n, hit);
    // Occlusion belongs on the ambient term, not on the whole shade. The key
    // and headlight terms are direct light; a crevice does not stop them, it
    // stops the sky.
    col = materialColor(mat, p, mdot(n, upAt(p)))
        * (0.16 * occ + (0.62 * key + 0.30 * head) * (0.35 + 0.65 * occ));
    // Only the transient markers glow. An orb glowed too, which is fine with
    // one of them and ruinous with one in every cell in every direction: they
    // punched through the fog and the far field turned into a starfield of
    // clamped white specks. Unlit, they fade with distance like everything
    // else, and the light-speed pulse still makes them read.
    if (mat > 9.5) col *= 1.3;
    // Orbs and your own body both pulse, so a finite light speed shows twice
    // over: the copy is displaced (selfAt) AND caught at an earlier phase.
    if (((mat > 3.5 && mat < 4.5) || (mat > 11.5 && mat < 12.5)) && uTime >= 0.0) {
      // Orbs pulse, and light is not instantaneous: what you see left the
      // orb hit/LIGHT_C seconds ago. Copies at different distances are at
      // different points in the same pulse, so one object appears as a
      // procession of its own past.
      float phase = uTime - hit / max(uLightC, 1e-3);   // uTime < 0 disables
      col *= 0.55 + 0.75 * (0.5 + 0.5 * sin(phase * 2.2));
    }
    vec3 ext = exp(-hit * uFog * FOG_ABSORB);
    col = col * ext + FOG_COL * (1.0 - ext);
    // Blue outlives the other two, so at the range limit it has not quite
    // converged and geometry would pop as it crossed. Close the last quarter
    // by hand; it costs one smoothstep and there is nothing to see out there.
    col = mix(col, FOG_COL, smoothstep(uMaxT * 0.72, uMaxT, hit));
  }

  // Grazing hits at long range push the normal estimate into cancellation
  // and it can come back NaN, which rasterises as a white speck.
  if (any(isnan(col)) || any(isinf(col))) col = FOG_COL;
  return clamp(col, 0.0, 1.0);
}

// The horizon is packed with copies of the room, and at that range each one
// is smaller than a pixel. That is not something to fix in the shading - it
// is aliasing, and the only real cure is more samples. uSuper turns on a 2x2
// rotated grid, four marches a pixel, so it lives on the high quality
// setting and nowhere else.
// The supersample is a LOOP, and that is not a style choice - it is the
// difference between a shader that links in seconds and one the browser kills.
//
// Written as four calls plus the single-sample one, trace() is inlined FIVE
// times, and trace() contains the marcher, which contains the level once per
// distance sample. The Direct3D compiler took 212 seconds over it and the GPU
// process was killed under it; the tell was every warning in its log appearing
// exactly five times. As a loop the body is emitted once: 212 s -> 12 s.
//
// The bound depends on a uniform, so the compiler cannot count it and will not
// unroll it back into what it was. Sampling this way costs nothing extra at
// run time - the same four rays, one copy of the code.
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  // A rotated-grid pattern: better than a regular 2x2 on the near-horizontal
  // and near-vertical edges, which is most of an architectural scene.
  vec2 J[4] = vec2[4](vec2(1.0, 3.0), vec2(-3.0, 1.0),
                      vec2(3.0, -1.0), vec2(-1.0, -3.0));
  float e = 0.25 / uRes.y;
  int n = uSuper > 0.5 ? 4 : 1;
  vec3 col = vec3(0.0);
  for (int k = 0; k < n; k++) {
    col += trace(uv + (uSuper > 0.5 ? e * J[k] : vec2(0.0)));
  }
  col /= float(n);
  fragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;
