// main.js — WebGL2 setup, input, the frame loop, and drawing the rope.
//
// The geometry is in hyp.js, the level in level.js, the movement in
// physics.js and the GLSL in shader.js. What is left here is plumbing.

import {
  IDENTITY, logTo, geodesic, point, placeAt, apply,
  reduceToDomain, setSolid, SOLID, foldPoint, foldElement,
  matMul, reorthonormalize, dist, pairings, sides, dot,
} from './hyp.js';
import { levelSDF, setMode, getMode, MODE } from './level.js';
import { VERT, fragFor, LINE_VERT, LINE_FRAG } from './shader.js';
import * as E3T from './e3t.js';
import * as NIL from './nil.js';
import { SPACES, spaceFor, spaceForOption } from './engine/geometry/registry.js';
import { PRESETS, PRESET_KEYS } from './levels/presets.js';
import { createWorldMenu } from './app/menu.js';
import { worldMotionFor, motionInput } from './engine/runtime/world-motion.js';
import { makeRacer, raceStep, raceCourse, RACE_SPEED, RACE_LAPS, BOOST_COST,
  RACE_GATES } from './racing.js';
import {
  S3G, s3LapFraction, S3_LAP,
} from './s3.js';
import {
  PLAYER_R, WALK_SPEED, JUMP, ROPE_RANGE, FLY_SPEED,
  stepFree, collide, control, cast, grappleAttach, grappleStep, ropePoints,
  energy, alignUp, upDirection, upness, sweptArea,
  FIELD, setField, getField, activeBeacon, altitude, setGravityScale, carryBeacon,
  placePortal, clearPortals, getPortals, portalsLive, portalCrossing, carryPortals,
  portalMap, PORTAL_R, settleCarried,
  launchBoomerang, boomerangStep, activeBoomerang, clearBoomerang,
  rollControl, rollSpeed, carryFrameVec, ROLL_TOP,
  makeCharacter, stepCharacter, boomerangHits, orbitDist,
  MAX_HEALTH, BOOM_DAMAGE, boomerangProgress, launchAimed,
  placeBlock, blockStepAll, blockSDF, blockSolid, blockForming, activeBlock,
  clearBlock, carryBlock, bump, BLOCK_R, BLOCK_DELAY, BLOCK_LIFE,
  boomerangPoint, carryBoomerang, BOOM_R,
  plantDecoy, decoyStepAll, decoyPoint, carryDecoy, clearDecoy,
  DECOY_COOLDOWN,
  recallTarget, warpTo, RECALL_COOLDOWN,
  placeCut, cutStepAll, cutSDF, carryCut, clearCut, activeCut,
  CUT_R, CUT_THICK, CUT_LIFE, CUT_COOLDOWN,
  holoBlast, blastRadius, BLAST_COOLDOWN, BLAST_MIN_CHARGE,
  anchorSwap, SWAP_COOLDOWN,
} from './physics.js';
// Plain named imports, no namespace and no renaming: tools/preview.js
// bundles the module graph by hand and understands only this one form.
import {
  geodesicCourse, grappleCourse, carryCourse, hoopNear, hoopRing,
  runStep, runProgress, gateOpen, gateProgress,
  makeRun, startRun, resetRun, formatTime, PHASE,
} from './modes.js';
// The product geometry, as a namespace rather than named imports: almost
// every symbol in it collides with hyp.js by design -- point, log, dist,
// translation, geodesic all exist in both and mean the same thing in a
// DIFFERENT space, and mixing the two is the class of bug that draws black.
// H2R.point is unambiguous at every call site; a bare `point` never would be.
import * as H2R from './h2r.js';
import * as S2R from './s2r.js';
import {
  packState, netLive, netState, netNote, netOnPacket, netSendPacket,
  netHost, netJoin, netFinish, netConnectVia,
} from './net.js';

// --- what is solid ------------------------------------------------------
//
// The level, plus everything anybody has built. Collision, casting, the rope
// and the boomerang's rebound all go through this rather than levelSDF, or
// each of those things would be scenery you walk through.
//
// The other player's block and pane are in here too. They have to be: a wall
// that is solid on their screen and not on yours is not a wall, it is a
// disagreement, and the first thing either of you would notice is walking
// through one and being shoved back out by the other end's correction.
let remoteSolid = () => 1e9;
const worldSDF = (p) => Math.min(levelSDF(p), blockSDF(p), cutSDF(p), remoteSolid(p));

/**
 * The copy of a body on the far side of the face it is nearest to.
 *
 * A sphere whose centre sits within its own radius of a face pokes THROUGH
 * that face, and the marcher never leaves the fundamental domain, so that part
 * of it is simply not drawn: the body comes out with a flat slice cut off it.
 * Mapping the centre by the pairing of the face it is nearest to puts a second
 * copy just outside the PAIRED face, and the part of that copy which lies
 * inside the domain is exactly the missing cap - because a piece that leaves
 * through one face arrives through its partner. That is what gluing means.
 *
 * Returns the point unchanged when it is nowhere near a face, so the shader's
 * min() costs nothing in the common case.
 */
function straddlePairing(q, r) {
  const S = sides(), P = pairings();
  let worst = -1e30, face = 0;
  for (let k = 0; k < S.length; k++) {
    const v = dot(q, S[k]);
    if (v > worst) { worst = v; face = k; }
  }
  // -asinh(worst) is the depth; within r of the wall means it straddles.
  return -Math.asinh(worst) < r ? P[face] : null;
}

function straddleImage(q, r) {
  const g = straddlePairing(q, r);
  return g ? apply(g, q) : q;
}

// --- the marker list ----------------------------------------------------
//
// One flat list of everything round the shader has to draw: the anchor, the
// beacon, both boomerangs, both blocks, both decoys, the opponent, a blast.
// The shader loops over exactly the live ones, so an object costs nothing when
// it is not out and adding one costs no shader at all - which matters, because
// every separate branch in sceneMap is three more copies of itself once the
// normal and occlusion loops have inlined it, and link time is the budget that
// actually binds here. See the note above uMark in shader.js.
const MARKS = 10;                 // must match MARKS in shader.js
const markPt = new Float32Array(MARKS * 4);
const markAlt = new Float32Array(MARKS * 4);
const markInfo = new Float32Array(MARKS * 4);
let markN = 0;

/** Add one. `p` is an unfolded world point; folding is done here, once. */
function marker(p, r, mat, shell = 0, tMin = 0) {
  if (geomKey() !== 'h3') return;
  if (!p || markN >= MARKS) return;
  const q = foldPoint(p);
  markPt.set(q, markN * 4);
  markAlt.set(straddleImage(q, r), markN * 4);
  markInfo[markN * 4] = r;
  markInfo[markN * 4 + 1] = mat;
  markInfo[markN * 4 + 2] = shell;
  markInfo[markN * 4 + 3] = tMin;
  markN++;
}

// The panes, which are a plane normal as well as a point. The NORMAL has to be
// carried by the same group element as the point - fold them apart and the
// plane no longer passes through its own centre, so the pane draws as a
// slanted sliver somewhere else entirely. foldElement exists for this.
const CUTS = 2;                   // must match CUTS in shader.js
const cutNormBuf = new Float32Array(CUTS * 4);
const cutAtBuf = new Float32Array(CUTS * 4);
const cutNormAltBuf = new Float32Array(CUTS * 4);
const cutAtAltBuf = new Float32Array(CUTS * 4);
let cutN = 0;

function markCut(at, N) {
  if (geomKey() !== 'h3') return;
  if (!at || cutN >= CUTS) return;
  const [q, g] = foldElement(at);
  const n = apply(g, N);
  cutAtBuf.set(q, cutN * 4);
  cutNormBuf.set(n, cutN * 4);
  const s = straddlePairing(q, CUT_R);
  cutAtAltBuf.set(s ? apply(s, q) : q, cutN * 4);
  cutNormAltBuf.set(s ? apply(s, n) : n, cutN * 4);
  cutN++;
}

// --- boilerplate --------------------------------------------------------

const canvas = document.getElementById('c');
const hud = document.getElementById('hud');

/**
 * The WebGL2 context, or an error that says what to do about it.
 *
 * "WebGL2 not available" is true and useless: it has three quite different
 * causes and the remedy differs for each. Asking for WebGL 1 as well separates
 * them - if 1 works and 2 does not, the browser is fine and it is WebGL 2
 * specifically that is off; if neither works, the browser is not doing
 * hardware 3D at all.
 *
 * The common cause is the third one. Chrome stopped falling back to software
 * WebGL on its own, so with graphics acceleration turned off, or the driver
 * blocklisted, getContext just returns null.
 */
function getGL() {
  const gl2 = canvas.getContext('webgl2', { antialias: false });
  if (gl2) return gl2;
  const gl1 = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  const why = gl1
    ? 'WebGL 1 DOES work here, so the browser and this page are fine. It is '
      + 'WebGL 2 specifically that is unavailable.'
    : 'WebGL 1 is not available either, so this is not about the page at all: '
      + 'the browser is not doing hardware 3D right now.';
  throw new Error([
    'WebGL2 is not available, so there is nothing to draw with.',
    '',
    why,
    '',
    'Most likely, in order:',
    '  1. Graphics acceleration is off. In Chrome: Settings > System >',
    '     "Use graphics acceleration when available" -> on, then RESTART',
    '     Chrome. Recent Chrome will not fall back to software WebGL by',
    '     itself, so with this off you get exactly this message.',
    '  2. Open chrome://gpu and read the WebGL2 row. "Disabled" or',
    '     "Software only" there means the driver is blocklisted.',
    '  3. A GPU driver update, or a GPU process that died. Restart the',
    '     browser; if that fails, reboot.',
    '',
    'Nothing in the game can cause this, and nothing in the game can work',
    'around it. It is the browser refusing to hand out a 3D context.',
  ].join('\n'));
}

const gl = getGL();

function compile(type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  // Without this check a broken shader fails SILENTLY and you get a black
  // screen with no explanation. Never delete it.
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh));
  }
  return sh;
}

/**
 * Link a program, and say something useful when it does not.
 *
 * On Windows the browser runs ANGLE, which translates the GLSL to HLSL at
 * COMPILE time and then hands that to the Direct3D compiler at LINK time. So
 * a shader that is too expensive to compile passes compile() and fails here,
 * which is why this path needs as much care as that one.
 *
 * An EMPTY info log on failure is its own diagnosis. A real compile error
 * always names a line. Nothing means the driver never got to say anything:
 * the GPU process was killed under it - almost always the watchdog, after the
 * D3D compiler sat on the shader for longer than the browser was willing to
 * wait. It looks identical to a syntax error and is a completely different
 * problem, so the two must not print the same thing.
 */
function link(name, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  // Pin the attribute slots BEFORE linking, so every program agrees on them.
  // There is more than one scene program now (one per curvature), and the
  // full-screen quad's vertex array is set up once against slot 0; a driver is
  // entitled to hand the second program a different location for the same
  // name, which would draw nothing at all with no error to say why. Binding a
  // name the shader does not have is legal and ignored, so both go in here.
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.bindAttribLocation(p, 0, 'aNDC');
  const t0 = performance.now();
  gl.linkProgram(p);
  const secs = (performance.now() - t0) / 1000;
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = (gl.getProgramInfoLog(p) || '').trim();
    if (log) throw new Error(`the ${name} program did not link:\n\n${log}`);
    throw new Error([
      `The ${name} program did not link, and the driver gave no reason.`,
      `It gave up after ${secs.toFixed(1)} seconds.`,
      '',
      'An empty message means this is NOT a mistake in the shader source - a',
      'real error names a line. The GPU process was killed while compiling,',
      'which the browser does when a shader takes too long to translate.',
      '',
      'Reload once: the browser caches a program it did manage to build, and',
      'the second attempt is usually instant. If it fails again the shader is',
      'genuinely too big for this driver - lower Quality, or cut level content',
      'in level.js, which is inlined into every distance sample.',
    ].join('\n'));
  }
  // Even a link that succeeds can take long enough to look like a hang. Say
  // so rather than leaving a black screen with no explanation.
  if (secs > 2) {
    console.warn(`[shader] the ${name} program took ${secs.toFixed(1)} s to link.`);
  }
  return p;
}

// The scene program, ONE PER GEOMETRY.
//
// Which geometry it is is a #define rather than a uniform, so each world gets
// its own program with the other worlds' half of the marcher already dead.
// Measured, warm, three runs: hyperbolic 8.5 s, spherical 3.7 s, H^2 x R
// 3.8 s. The two that have no quotient link in under half the time because
// the fundamental domain, the face scan, the exact exit solve, the fold loop,
// the portals and all 39 level primitives are unreachable in them, and the
// preprocessor lets the D3D compiler see that BEFORE it starts inlining.
//
// The price is that switching worlds has to link, and a link here is seconds,
// not milliseconds. So only the world actually being played is built: the
// hyperbolic one at startup, exactly as before, and each other the first time
// it is asked for. Nobody who never opens the option pays for it.
const sceneProgs = new Map();
function sceneFor(key) {
  if (!sceneProgs.has(key)) {
    const p = link(spaceFor(key).programName, VERT, fragFor(key));
    sceneProgs.set(key, { p, U: sceneUniforms(p) });
  }
  return sceneProgs.get(key);
}

let scene = null, U = null;
// Which curvature the bound program is for, compared against the option so
// that switching space happens ONCE rather than every frame. Declared HERE and
// not beside the spherical helpers further down: applyOptions runs during
// module setup and reads it, and a `let` further down the file is still in its
// temporal dead zone at that point - which throws before the first frame and
// takes the whole module with it.
let curvNow = 'h3';
// Which preset was last applied, for the menu's one-line description of it.
let lastPreset = null;
// Where this spherical session started, for the lap readout.
let s3Start = null;

/** Point `scene` and `U` at the program for this geometry, building it once. */
function useCurvature(key) {
  const s = sceneFor(key);
  scene = s.p; U = s.U;
}
useCurvature('h3');

const lines = link('rope', LINE_VERT, LINE_FRAG);

// Losing the context mid-game draws a frozen or black canvas and reports
// nothing, because it is not an exception - it is an event.
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  const b = document.getElementById('boot');
  if (b) {
    b.style.display = 'block';
    b.textContent = 'THE GRAPHICS CONTEXT WAS LOST\n\n'
      + 'The browser dropped the GPU context out from under the page. Reload.\n'
      + 'If it keeps happening the shader is too heavy for this driver: lower\n'
      + 'Quality in the options menu (press O).';
  }
});

// One quad covering the whole screen. Every pixel runs the fragment shader.
const quadVao = gl.createVertexArray();
gl.bindVertexArray(quadVao);
const quadBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
const quadLoc = gl.getAttribLocation(scene, 'aPos');
gl.enableVertexAttribArray(quadLoc);
gl.vertexAttribPointer(quadLoc, 2, gl.FLOAT, false, 0, 0);

// Streamed clip-space positions for the rope and crosshair.
const lineVao = gl.createVertexArray();
gl.bindVertexArray(lineVao);
const lineBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
const lineLoc = gl.getAttribLocation(lines, 'aNDC');
gl.enableVertexAttribArray(lineLoc);
gl.vertexAttribPointer(lineLoc, 2, gl.FLOAT, false, 0, 0);

/** Uniform locations for one scene program. One table per curvature. */
function sceneUniforms(prog) {
  return {
    res: gl.getUniformLocation(prog, 'uRes'),
    player: gl.getUniformLocation(prog, 'uPlayer'),
    yaw: gl.getUniformLocation(prog, 'uYaw'),
    pitch: gl.getUniformLocation(prog, 'uPitch'),
    race: gl.getUniformLocation(prog, 'uRace'),
    roll: gl.getUniformLocation(prog, 'uRoll'),
    markN: gl.getUniformLocation(prog, 'uMarkN'),
    mark: gl.getUniformLocation(prog, 'uMark'),
    markAlt: gl.getUniformLocation(prog, 'uMarkAlt'),
    markInfo: gl.getUniformLocation(prog, 'uMarkInfo'),
    cutN: gl.getUniformLocation(prog, 'uCutN'),
    cutNorm: gl.getUniformLocation(prog, 'uCutNorm'),
    cutAt: gl.getUniformLocation(prog, 'uCutAt'),
    cutNormAlt: gl.getUniformLocation(prog, 'uCutNormAlt'),
    cutAtAlt: gl.getUniformLocation(prog, 'uCutAtAlt'),
    cutR: gl.getUniformLocation(prog, 'uCutR'),
    cutT: gl.getUniformLocation(prog, 'uCutT'),
    steps: gl.getUniformLocation(prog, 'uSteps'),
    open: gl.getUniformLocation(prog, 'uOpen'),
    zoom: gl.getUniformLocation(prog, 'uZoom'),
    edges: gl.getUniformLocation(prog, 'uEdges'),
    solid: gl.getUniformLocation(prog, 'uSolid'),
    selfHist: gl.getUniformLocation(prog, 'uSelfHist'),
    selfHistB: gl.getUniformLocation(prog, 'uSelfHistB'),
    selfLip: gl.getUniformLocation(prog, 'uSelfLip'),
    histDt: gl.getUniformLocation(prog, 'uHistDt'),
    lightC: gl.getUniformLocation(prog, 'uLightC'),
    selfR: gl.getUniformLocation(prog, 'uSelfR'),
    superSample: gl.getUniformLocation(prog, 'uSuper'),
    time: gl.getUniformLocation(prog, 'uTime'),
    ao: gl.getUniformLocation(prog, 'uAO'),
    foeHurt: gl.getUniformLocation(prog, 'uFoeHurt'),
    portalOn: gl.getUniformLocation(prog, 'uPortalOn'),
    portalR: gl.getUniformLocation(prog, 'uPortalR'),
    portalA: gl.getUniformLocation(prog, 'uPortalA'),
    portalB: gl.getUniformLocation(prog, 'uPortalB'),
    portalTA: gl.getUniformLocation(prog, 'uPortalTA'),
    portalTB: gl.getUniformLocation(prog, 'uPortalTB'),
    fog: gl.getUniformLocation(prog, 'uFog'),
    maxT: gl.getUniformLocation(prog, 'uMaxT'),
  };
}
const UL = { color: gl.getUniformLocation(lines, 'uColor') };

// Every march step evaluates the whole level, so pixel count decides the
// frame rate. [ and ] move this; drop it if the game feels heavy.
let renderScale = 1.0;

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5) * renderScale;
  canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  gl.viewport(0, 0, canvas.width, canvas.height);
}
addEventListener('resize', resize);
resize();

// --- state --------------------------------------------------------------

let player = IDENTITY;        // a PLACEMENT: position plus orthonormal frame
let vel = [0, 0, 0];          // velocity in FRAME components
let yaw = 0, pitch = 0;
let grapple = null;           // null, or state from grappleAttach
let grounded = false;
let marchSteps = 140;
let crossings = 0;            // how many times a face has been crossed

// The holonomy meter: the hyperbolic area swept about the domain centre.
// Transporting a frame around a closed loop on a curvature -1 surface rotates
// it by the enclosed area, so this accumulates the rotation the geometry is
// storing up. The hyperbolic analogue of Nil's area-lift, and the dash spends
// it. Circling wide is worth far more than circling tight, because area is.
let banked = 0;               // radians of accumulated holonomy

// --- what the player looked like a moment ago ---------------------------
//
// Light is not instantaneous, and in a compact manifold that is not a detail
// you can ignore. You can see YOURSELF here: your images sit one cell away
// down every sightline. So with a finite speed the copy two cells off shows
// where you were a moment ago and the one five cells off shows where you were
// long before that - one object, a procession of its own past, all at once.
// Nothing else makes the difference between an object and its image so plain.
//
// Which needs a history. The shader indexes it by distance (see selfAt), so
// this is a plain ring of folded positions, newest first. Folded, because the
// marcher folds its own samples and would otherwise compare against a point in
// the wrong copy.
//
// World units per second, one per Light speed setting. Walking is 0.9, so
// 'slow' is a little over twice walking pace and the lag is unmissable.
const LIGHT_C = [0, 6, 2];
const SELF_HIST = 32;         // must match SELF_HIST in shader.js
const HIST_DT = 0.2;          // seconds per sample; 32 of them is 6.4s
const selfHist = new Float32Array(SELF_HIST * 4);
let histAccum = 0;

// --- the same path, kept UNFOLDED ---------------------------------------
//
// selfHist above is folded, because the shader needs it folded. The decoy and
// recall need the opposite: a path in the player's CURRENT chart, carried
// through every crossing by the group element that folded the player.
//
// It has to be that way round. Recall means "put me back at the point of the
// manifold I was at three seconds ago", and if the stored point is folded then
// its coordinates name whichever lift happened to be current when it was
// recorded - so recalling after a crossing would drop you in a different copy
// from the one you actually walked. The trail is a list of points of the
// universal cover, and it obeys the same rule the anchor, the beacon and the
// portals do.
//
// It stays in range on its own: it is only ever a few seconds of walking long,
// and carrying it with the player keeps every entry within that of them.
const trail = [...Array(SELF_HIST)].map(() => [0, 0, 0, 1]);

function seedHistory(q, raw) {
  for (let i = 0; i < SELF_HIST; i++) {
    selfHist.set(q, i * 4);
    selfHistB.set(q, i * 4);
    linkOf[i] = IDENTITY.slice();
    trail[i] = (raw || q).slice();
  }
  histAccum = 0;
}

/** Advance the ring by dt, pushing q whenever a whole sample has elapsed. */
function pushHistory(q, raw, dt) {
  histAccum += dt;
  while (histAccum >= HIST_DT) {
    histAccum -= HIST_DT;
    selfHist.copyWithin(4, 0, (SELF_HIST - 1) * 4);
    // The new sample shares its copy with the one it displaces, so the fresh
    // link is the identity and every older one shuffles down with its sample.
    linkOf.pop();
    linkOf.unshift(IDENTITY.slice());
    selfHist.set(q, 0);
    trail.pop();
    trail.unshift(raw.slice());
  }
  // The newest sample tracks continuously, so the near copies do not stutter.
  selfHist.set(q, 0);
  trail[0] = raw.slice();
}

/** A fold moved the player's chart, so it moves everything in the trail. */
function carryTrail(g) {
  for (let i = 0; i < SELF_HIST; i++) trail[i] = apply(g, trail[i]);
}

// The far end of every segment, and the speed along the fastest one.
//
// THIS IS THE FIX FOR THE BODY COMING APART INTO STRIPES. Each history entry
// is folded into the fundamental domain as it is recorded, so the moment the
// player walks across a face the stored trail jumps clean across the room
// while the player has not moved at all. The shader interpolates between
// consecutive entries to stop the copies stepping five times a second - and
// interpolating across that jump swept a phantom body right through the
// domain, which every ray met somewhere different, so the sphere was drawn as
// a stack of thin sheets rather than a ball.
//
// The cure is to remember WHICH fold. Every crossing hands us the group
// element it folded by, so linkOf[i] is the product of the elements applied
// between sample i+1 and sample i - the isometry carrying the older sample's
// copy into the newer one's. Interpolating from selfHist[i] to
// linkOf[i] * selfHist[i+1] then follows the path the player actually walked.
//
// Searching for the nearest copy instead does NOT work, and it was tried: a
// fold can be a product of two generators, the search misses it, and the
// fallback of collapsing the segment turns a smear into a hard step, which
// measured 70x worse than the bug it was meant to fix.
//
// The elements are only ever one sample apart, so they are products of one or
// two generators and never grow. That is what keeps this exact.
const selfHistB = new Float32Array(SELF_HIST * 4);
const linkOf = [...Array(SELF_HIST)].map(() => IDENTITY.slice());
let selfLip = 0;

/** A fold just happened; it moves the newest sample's chart, not the older. */
function foldHistory(g) { linkOf[0] = matMul(g, linkOf[0]); }

function linkHistory() {
  let worst = 0;
  const a = [0, 0, 0, 0], b = [0, 0, 0, 0];
  for (let i = 0; i < SELF_HIST - 1; i++) {
    for (let k = 0; k < 4; k++) {
      a[k] = selfHist[i * 4 + k];
      b[k] = selfHist[(i + 1) * 4 + k];
    }
    const far = apply(linkOf[i], b);
    selfHistB.set(far, i * 4);
    const d = dist(a, far);
    if (d > worst) worst = d;
  }
  // The last entry has no successor; a flat segment keeps selfAt in range.
  selfHistB.set(selfHist.subarray((SELF_HIST - 1) * 4, SELF_HIST * 4), (SELF_HIST - 1) * 4);
  // How far the body travels per unit of RAY distance. The shader divides its
  // step by (1 + this), because a surface that closes on the ray as fast as
  // the ray advances is one the marcher would otherwise step straight through.
  const c = LIGHT_C[opts.light.i];
  selfLip = c > 0 ? Math.min(worst / HIST_DT / c, 4) : 0;
}
// Everything switchable lives here, and the options overlay is generated from
// it, so adding a setting is one entry rather than three edits.
const opts = {
  mode:       { label: 'World',        values: ['floor (2D wrap)', 'open (3D wrap)'], i: 0 },
  // Curvature. 'spherical' is a DIFFERENT SPACE, not a different level.
  //
  // S^3 needs no quotient: it is already compact, so the marcher's entire
  // fundamental-domain apparatus - the face scan, the exit solve, the fold
  // loop, the straddle copies - has nothing to do and is compiled out. Fly far
  // enough in any direction and you come back after 2*pi, not because anything
  // was glued but because that is what a geodesic on a sphere does.
  //
  // It is a FLYTHROUGH, not the full kit: free flight and collision, no
  // gravity (a sphere admits no unit-gradient height function, so there is no
  // honest "down"), and none of the fighting kit, all of which is built on
  // hyp.js. The locks below take those away rather than leaving dead keys.
  curv:       { label: 'Geometry',     values: SPACES.map((space) => space.option), i: 0 },
  field:      { label: 'Gravity',      values: ['floor plane', 'beacon', 'none'], i: 0 },
  light:      { label: 'Light speed',  values: ['instant', 'fast', 'slow'],   i: 0 },
  move:       { label: 'Movement',     values: ['walking', 'rolling'],        i: 0 },
  upright:    { label: 'Camera up',    values: ['gravity', 'pendulum', 'free'], i: 0 },
  roll:       { label: 'Roll',         values: ['hold', 'momentum'],           i: 0 },
  portals:    { label: 'Portals',      values: ['off', 'on'],                  i: 0 },
  boomerang:  { label: 'Boomerang',    values: ['aimed', 'closed geodesic', 'off'], i: 0 },
  build:      { label: 'Build (G)',    values: ['on', 'off'],                  i: 0 },
  // The hoop course. Its shape is a fact about the manifold rather than a
  // level someone authored: the hoops sit on a CLOSED GEODESIC, so flying the
  // course dead straight returns you to its own start. In the open world those
  // axes are the spokes the level already draws.
  // Two courses, and they are opposites on purpose.
  //
  //   hoops    laid on a CLOSED GEODESIC, so flying dead straight returns you
  //            to the start. About what the manifold does. Wants no gravity
  //            and a free camera.
  //   grapple  a ring of CHARGE GATES that only open once you have banked
  //            enough holonomy of the right SIGN, so you must swing around
  //            something the right way round to get through. About what you
  //            do. Wants gravity and the rope.
  course:     { label: 'Course (K)',   values: ['off', 'hoops', 'grapple', 'dropper', 'lap', 'race', 'torus', 'climb'], i: 0 },
  // What Q spends the banked holonomy on. 'sign decides' is the interesting
  // one: sweptArea is SIGNED, so going round something one way charges a dash
  // and the other way charges a blast, and there is no third option where you
  // get to choose after the fact.
  holo:       { label: 'Holonomy (Q)', values: ['sign decides', 'dash only', 'blast only'], i: 0 },
  foe:        { label: 'Opponent',     values: ['bot', 'network', 'off'],      i: 0 },
  fog:        { label: 'Fog',          values: ['normal', 'thin', 'thick'],    i: 0 },
  shading:    { label: 'Shading',      values: ['ambient occlusion', 'flat'],  i: 0 },
  edges:      { label: 'Domain edges', values: ['show', 'hide'],               i: 0 },
  quality:    { label: 'Quality',      values: ['low', 'medium', 'high'],      i: 1 },
  resolution: { label: 'Resolution',   values: ['50%', '70%', '85%', '100%'], i: 3 },
};
const optKeys = Object.keys(opts);
let optSel = 0, optOpen = false;
let racer = makeRacer(), dropDeaths = 0, dropFlash = 0;
let menuBusy = false;

// Optical zoom, on the scroll wheel. Replaced flat vision, which was bound to
// V and did something quite different - see rayDir in shader.js. A zoom keeps
// every ray a geodesic, so what you see is still what light does; it just
// narrows the fan. It is not in the options menu because it is a thing you do
// while looking, like aiming, not a thing you set.
const ZOOM_MIN = 1, ZOOM_MAX = 8;
let zoom = 1;

// Camera roll about the view axis, and how fast it is turning.
//
// It only means anything with the camera free, because pinning to gravity
// overwrites it every step. In 'momentum' mode the keys change the rate rather
// than the angle and nothing damps it, so a nudge leaves you turning - which
// is the honest version of the same idea the geometry already gives you for
// free, since transporting a frame around a loop rotates it by the enclosed
// area whether you ask for it or not.
// The ball's angular velocity, in FRAME components like the velocity, so a
// fold leaves it alone and alignUp carries it with the same rotation. Only
// used by the rolling movement model; walking ignores it entirely.
let spin = [0, 0, 0];
let slipping = false;

// --- the opponent, and health -------------------------------------------
//
// Roadmap item seven: two characters and a collision check. Local only for now
// - the bot is driven from here rather than from a socket - but the STATE is
// already the shape a network would carry, which is the point of putting it in
// physics.js as a character rather than as a pile of variables in this file.
//
// It chases, because a fighter that stands still teaches you nothing about a
// space where flanking is cheap and a straight chase is a losing move. Watch
// it come at you and you learn that faster than any explanation.
let foe = null;
let foeWorld = null;          // which world the current one was spawned for
let playerHealth = MAX_HEALTH;
let playerHurtFor = 0;
let lastHit = '';             // a line for the HUD when something connects
let lastHitFor = 0;
const FOE_SPEED = 0.72;       // a shade under WALK_SPEED, so you can outrun it
const FOE_RESPAWN = 3.0;      // seconds down before it comes back
const TOUCH_DAMAGE = 12;      // what it costs to let the thing reach you
const TOUCH_COOLDOWN = 0.9;

/**
 * Put the opponent somewhere across the room that it can actually walk out of.
 *
 * The spot is SEARCHED for, not written down. The first hand-picked pair sat
 * 0.30 from a tower of radius 0.26, so the thing spawned wedged against it:
 * every step drove it into the surface, collide cancelled the velocity, and it
 * stood there for the whole five seconds looking like broken pathfinding. A
 * search costs nothing once per spawn and cannot rot when the level changes.
 *
 * Clearance is capped at PLAYER_R for anything standing on the floor, because
 * the floor is part of the level - so the test is "as clear as standing on
 * open ground", not "clear by a wide margin".
 */
function spawnFoe() {
  const bounded = optVal('mode') === 'floor (2D wrap)';
  const h = bounded ? PLAYER_R : 0.0;
  const from = point(placeAt(0, 0, bounded ? 0.6 : 0.0));
  let best = null;
  for (let r = 0.5; r <= 1.2; r += 0.1) {
    for (let k = 0; k < 16; k++) {
      const th = (k / 16) * Math.PI * 2;
      const M = placeAt(r * Math.cos(th), r * Math.sin(th), h);
      const clear = worldSDF(point(M));
      const away = dist(point(M), from);
      if (away < 0.7 || away > 1.5) continue;
      // Prefer clearance first, then distance, so it never starts on top of
      // you and never starts inside the furniture.
      const score = Math.min(clear, PLAYER_R) * 10 + away * 0.1;
      if (!best || score > best.score) best = { M, score };
    }
  }
  foe = makeCharacter(best ? best.M : placeAt(0.8, 0, h), 1);
}

// --- the other player, over a wire --------------------------------------
//
// Roadmap item nine. The netcode is deliberately ordinary; what is NOT
// ordinary is the state, and net.js has the full argument. The short version:
// a position here is a point of H^3/Gamma and therefore has infinitely many
// names, so two peers holding "the same" coordinates are not necessarily in
// the same place. reduceToDomain is canonical, so the FOLDED representative is
// a name both ends agree on - and every distance between players is an orbit
// distance, which the hit tests already used.
//
// The remote player drives the same `foe` character the bot does. That is the
// whole reason characters were pulled into physics.js in the first place: the
// struct a bot moves is the struct a packet carries, so there is nothing to
// reconcile and no second code path to keep in step.
let remote = null;            // the last packet, unpacked
let netSeq = 0;
let netSendAt = 0;
let netBlast = null;          // my blast, broadcast for a moment after it fires
let netWorldWarn = false;
const NET_HZ = 20;
// How fast the remote body is dragged toward the position the last packet
// named. Along the connecting GEODESIC, and toward the NEAREST LIFT, so it
// takes the short way round rather than across the room when the two ends are
// holding representatives a cell apart.
const NET_SMOOTH = 14.0;

netOnPacket((p) => {
  remote = p;
});

/**
 * Whatever the other player has made solid: their block and their pane.
 *
 * Not optional. A wall that exists on one screen and not the other is not a
 * wall, it is a disagreement, and it shows up immediately as one player
 * walking through something the other is standing behind.
 */
remoteSolid = (p) => {
  if (!remote || optVal('foe') !== 'network') return 1e9;
  let d = 1e9;
  if (remote.block && remote.blockState > 1.5) {
    d = Math.min(d, dist(p, remote.block) - remote.blockR);
  }
  if (remote.cut) {
    d = Math.min(d, Math.max(
      Math.abs(Math.asinh(dot(p, remote.cut.N))) - CUT_THICK,
      dist(p, remote.cut.at) - CUT_R,
    ));
  }
  return d;
};

/** Everything of mine that the other end has to know about, folded. */
function netSend(t) {
  if (geomKey() !== 'h3') return;
  if (!netLive() || t < netSendAt) return;
  netSendAt = t + 1 / NET_HZ;
  const cut = activeCut();
  let cutOut = null;
  if (cut) {
    // The pane's normal must be folded by the SAME element as its centre, or
    // the plane stops passing through the point it is meant to be at.
    const [q, g] = foldElement(cut.at);
    cutOut = { at: q, N: apply(g, cut.N) };
  }
  const blk = activeBlock();
  netSendPacket(packState({
    world: optVal('mode') === 'floor (2D wrap)' ? 0 : 1,
    seq: ++netSeq,
    health: playerHealth,
    hurt: playerHurtFor,
    M: reduceToDomain(player)[0],
    vel,
    boom: boomerangPoint() ? foldPoint(boomerangPoint()) : null,
    blockState: blk ? (blockSolid() ? 2 : 1) : 0,
    block: blk ? foldPoint(blk.at) : null,
    blockR: BLOCK_R,
    decoy: decoyPoint() ? foldPoint(decoyPoint()) : null,
    cut: cutOut,
    blast: netBlast && t < netBlast.until ? { at: netBlast.at, r: netBlast.r } : null,
  }));
}

/**
 * Fold the last packet into the foe character, and take the damage its owner's
 * weapons have done to me.
 *
 * DAMAGE IS SELF-ASSESSED at both ends. I decide whether their boomerang hit
 * me and broadcast my own health; they do the same. Neither of us can be shot
 * by something we never saw, and there is no authority to argue with - which
 * is the right trade for a two-player game with no server in it.
 */
function netApply(h) {
  if (!remote || optVal('foe') !== 'network') return;
  const myWorld = optVal('mode') === 'floor (2D wrap)' ? 0 : 1;
  if (remote.world !== myWorld) {
    if (!netWorldWarn) { say('the other player is in the OTHER world - switch to match', 6); netWorldWarn = true; }
    return;
  }
  netWorldWarn = false;
  if (!foe) spawnFoe();
  foe.health = remote.health;
  foe.hurtFor = remote.hurt;
  foe.vel = remote.vel.slice();
  // Smooth toward the packet rather than snapping to it. Twenty packets a
  // second is a jump every 50 ms otherwise, and the jump is along a geodesic
  // to the NEAREST LIFT - the copy of them that is actually on screen.
  const target = nearestLiftPoint(point(foe.M), point(remote.M));
  const lv = logTo(foe.M, target);
  const d = Math.hypot(lv[0], lv[1], lv[2]);
  if (d > 3.0) {
    // Too far to smooth: they respawned, recalled or swapped. Snap.
    foe.M = reorthonormalize(remote.M.slice());
  } else if (d > 1e-9) {
    const k = Math.min(1, NET_SMOOTH * h);
    foe.M = geodesic(foe.M, [lv[0] / d, lv[1] / d, lv[2] / d], d * k);
  }
  const [ff, , fc] = reduceToDomain(foe.M);
  if (fc !== 0) foe.M = ff;

  // Their weapons, against me.
  if (playerHurtFor > 0 || playerHealth <= 0) return;
  const me = point(player);
  if (remote.boom && orbitDist(me, remote.boom) < BOOM_R + PLAYER_R) {
    playerHealth = Math.max(0, playerHealth - BOOM_DAMAGE);
    playerHurtFor = TOUCH_COOLDOWN;
    say(`their boomerang: -${BOOM_DAMAGE}`);
  } else if (remote.blast && orbitDist(me, remote.blast.at) < remote.blast.r) {
    const near = 1 - orbitDist(me, remote.blast.at) / remote.blast.r;
    const amount = Math.round(30 * (0.35 + 0.65 * near));
    playerHealth = Math.max(0, playerHealth - amount);
    playerHurtFor = TOUCH_COOLDOWN;
    // And the shove, which is the half of a blast that changes a fight.
    const away = logTo(player, nearestLiftPoint(me, remote.blast.at));
    const l = Math.hypot(away[0], away[1], away[2]);
    if (l > 1e-9) {
      for (let i = 0; i < 3; i++) vel[i] -= (away[i] / l) * 2.4 * (0.4 + 0.6 * near);
    }
    say(`their blast: -${amount}`);
  }
}

/** The copy of q that is nearest p. Same rule as physics.nearestLift. */
function nearestLiftPoint(p, q) {
  let best = q, bestD = dist(p, q);
  for (const g of pairings()) {
    const c = apply(g, q);
    const d = dist(p, c);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

let roll = 0, rollRate = 0;

// --- the pendulum camera ------------------------------------------------
//
// The camera as a weighted ball hanging inside the player: the weight sits at
// the bottom, so it hangs along whatever direction feels like down. In an
// accelerating frame that is not gravity, it is gravity MINUS the
// acceleration, which is why a car's hanging air freshener swings backwards
// when you pull away and forwards when you brake.
//
// So the drive is the player's own acceleration, and the rest is a damped
// harmonic oscillator: a spring pulling the weight back under the pivot, and
// friction bleeding the swing away over a couple of seconds. Stiffness and
// damping are what make it feel like a weight rather than a filter - PEND_C
// near 2*sqrt(PEND_K) is critical damping, and this sits under it on purpose
// so it overshoots once or twice before settling.
//
// Small angles, so the tilt is carried as a plain 2-vector in the frame's
// horizontal plane rather than as a rotation.
let tilt = [0, 0], tiltVel = [0, 0];
let prevVel = [0, 0, 0];
const PEND_K = 26.0;      // stiffness: how hard it hangs back down
const PEND_C = 5.2;       // damping: under 2*sqrt(K) = 10.2, so it overshoots
const PEND_GAIN = 0.085;  // radians of lean per unit of acceleration
// The portal swing, as a WHOLE rotation rather than a lean.
//
// The pendulum's tilt is a small-angle 2-vector, and that is fine for leaning
// into a stop but hopeless here: a portal can hand you a vertical 82 degrees
// away from the one you had - measured, walking from a wall portal into a
// floor one - and a 2-vector clamped to a third of a radian leaves fifty of
// those degrees happening in a single frame. Which still reads as a snap,
// because it is one.
//
// So the camera carries a real rotation offset instead: axis fixed, angle
// sprung back to zero. It can hold a half turn without meaning something
// different, and cameraBasis applies it to the whole basis at once.
let camSwing = { axis: [0, 0, 1], angle: 0, vel: 0 };
// Softer than the pendulum: this is a bigger movement and wants to arrive
// rather than wobble. Ratio 0.79, so one small overshoot.
const SWING_K = 15.0;
const SWING_C = 6.1;

/**
 * Start the camera swinging, by exactly the rotation alignUp just applied.
 *
 * Ri is that rotation, as frame components, so setting the offset to Ri means
 * the first frame after a portal renders EXACTLY where the last one did - no
 * jump at all - and the spring then turns the head to the new vertical over
 * about a second.
 *
 * The axis and angle come off the 3x3 block. The antisymmetric part gives the
 * axis times sin(angle) and the trace gives the cosine, which is the standard
 * extraction and is stable everywhere except at a half turn, where sin is zero
 * and any perpendicular axis is as good as any other.
 */
function kickSwing(Ri) {
  const m = (c, r) => Ri[c * 4 + r];
  const ax = [m(1, 2) - m(2, 1), m(2, 0) - m(0, 2), m(0, 1) - m(1, 0)];
  const s = Math.hypot(ax[0], ax[1], ax[2]) * 0.5;
  const c = (m(0, 0) + m(1, 1) + m(2, 2) - 1) * 0.5;
  const angle = Math.atan2(s, Math.max(-1, Math.min(1, c)));
  if (angle < 1e-4) return;                 // nothing worth swinging
  let axis;
  if (s > 1e-6) {
    axis = ax.map((x) => x / (2 * s));
  } else {
    // A half turn. R + I has the axis in its columns; take the longest.
    const cols = [0, 1, 2].map((k) => [m(k, 0) + (k === 0 ? 1 : 0),
                                       m(k, 1) + (k === 1 ? 1 : 0),
                                       m(k, 2) + (k === 2 ? 1 : 0)]);
    axis = cols.reduce((a, b) => (Math.hypot(...b) > Math.hypot(...a) ? b : a));
    const n = Math.hypot(...axis);
    axis = axis.map((x) => x / n);
  }
  camSwing = { axis, angle, vel: 0 };
}

/** Bring the swing home. Same damped spring, on the angle alone. */
function stepSwing(dt) {
  if (dt <= 0 || camSwing.angle === 0) return;
  const acc = -SWING_K * camSwing.angle - SWING_C * camSwing.vel;
  camSwing.vel += acc * dt;
  camSwing.angle += camSwing.vel * dt;
  // Park it exactly, so cameraBasis can skip the rotation entirely.
  if (Math.abs(camSwing.angle) < 2e-4 && Math.abs(camSwing.vel) < 2e-3) {
    camSwing.angle = 0; camSwing.vel = 0;
  }
}

function stepPendulum(dt) {
  if (dt <= 0) return;
  // Acceleration in FRAME components. alignUp keeps that basis meaningful, and
  // in free-camera mode it is parallel-transported, which is just as good:
  // either way it is the basis the velocity is already written in.
  const ax = (vel[0] - prevVel[0]) / dt;
  const ay = (vel[1] - prevVel[1]) / dt;
  prevVel = [vel[0], vel[1], vel[2]];
  // The acceleration DRIVE is what the 'pendulum' setting buys: lean into a
  // stop. The spring itself runs in every upright mode, because a portal kicks
  // the tilt whatever the setting and something has to bring it home.
  const driven = optVal('upright') === 'pendulum';
  for (let i = 0; i < 2; i++) {
    const drive = driven ? (i === 0 ? ax : ay) * PEND_GAIN : 0;
    const acc = -PEND_K * tilt[i] - PEND_C * tiltVel[i] + drive * PEND_K;
    tiltVel[i] += acc * dt;
    tilt[i] += tiltVel[i] * dt;
  }
}

/**
 * The tilt, as the pitch and roll the camera actually renders with.
 *
 * The lean is a horizontal direction; how it reads depends on where you are
 * looking. The part along the view tips the horizon toward or away from you,
 * and the part across it rolls the horizon - the same decomposition the camera
 * basis already uses, so 'right' here is the same (sin yaw, -cos yaw).
 */
function viewAngles() {
  // 'free' never re-pins the frame, so there is no snap to swing out of and
  // nothing hanging: the tilt has no meaning there. Everywhere else it does,
  // even under plain 'gravity', because that is the mode a portal jerks.
  if (!upright()) return [pitch, roll];
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const along = tilt[0] * cy + tilt[1] * sy;
  const across = tilt[0] * sy - tilt[1] * cy;
  return [pitch - along, roll + across];
}
let dashReadyAt = 0;          // when the dash comes back; see DASH_COOLDOWN
// The other four cooldowns, all in seconds on the performance clock.
let decoyReadyAt = 0, recallReadyAt = 0, cutReadyAt = 0, swapReadyAt = 0;
// A holonomy blast, while it is still expanding. Purely a picture: the damage
// and the shove all happen on the frame it goes off.
const BLAST_FX = 0.34;        // seconds the shell takes to reach full radius
let blastFx = null;           // { at, R, age }
const ROLL_SPEED = 1.4;       // radians per second, held
const ROLL_IMPULSE = 1.1;     // radians per second per press, momentum mode
// --- what the player chose, and what the mode allows ---------------------
//
// `rawVal` is the setting as it sits in the menu. `optVal` is the setting the
// GAME actually uses, which is not always the same: a mode can take an option
// away.
//
// This exists because a mode is not just a scoring rule, it is a set of things
// that make no sense inside it. A boomerang in a timed flying course is not a
// balance question - the course has no target to throw at, the throw drops you
// out of the racing line, and it is one more key doing nothing. The spherical
// world is the harder case: it has no floor plane, so "gravity: floor plane"
// is not a worse choice there, it is an INCOHERENT one that would pin the
// camera to a function the geometry does not have.
//
// Forcing rather than hiding, and forcing through `optVal` rather than at each
// call site, is the part worth keeping. Every `optVal` in this file already
// asks the same question, so a lock applies everywhere at once and cannot be
// forgotten in one branch - which is exactly how "gravity is off but the FIELD
// is still the plane one" survived long enough to jerk the camera at every
// face. The menu still shows what the player picked, greyed, with the value
// the mode is using, so nothing is silently overridden.
const rawVal = (k) => opts[k].values[opts[k].i];

let forcedOpts = {}, forcedWhy = {};

/**
 * Which settings the current mode takes away, and what to.
 *
 * Reads `rawVal` only, never `optVal`, or it would be defined in terms of
 * itself.
 */
function computeForced() {
  const f = {}, why = {};
  const lock = (k, v, reason) => {
    // First lock wins, so the most specific rule should come first.
    if (k in f) return;
    f[k] = v; why[k] = reason;
  };

  // A DIFFERENT SPACE outranks a mode inside one, so these are first.
  //
  // Nothing here is a balance decision. S^3 has no floor plane, so plane
  // gravity is not a worse choice there but an incoherent one; it has no
  // quotient, so "Domain edges" outlines a fundamental domain that does not
  // exist; and the whole fighting kit - the boomerang, the block, the pane,
  // portals, the opponent - is built on hyp.js and its group, none of which
  // has a spherical counterpart yet.
  if (rawVal('curv') === 'spherical') {
    lock('field', 'none', 'no down on a sphere');
    lock('upright', 'free', 'no down on a sphere');
    lock('move', 'walking', 'free flight');
    lock('edges', 'hide', 'no fundamental domain');
    lock('foe', 'off', 'hyperbolic only');
    lock('boomerang', 'off', 'hyperbolic only');
    lock('build', 'off', 'hyperbolic only');
    lock('portals', 'off', 'hyperbolic only');
    lock('course', 'off', 'hyperbolic only');
  }

  // NIL. The same family as S^3, and mostly for the same reasons: the kit is
  // hyperbolic-only, there is no fundamental domain to outline, and the self
  // copies light speed draws need a quotient's fold. Gravity and camera up go
  // for a reason of Nil's own, and it is the sharpest in the project: the
  // vertical field is left invariant, so a constant "down" descends perfectly
  // well -- but it is a CONTACT form, dw = -dx ^ dy is not zero, so it is the
  // gradient of nothing and there is no potential anywhere. Nil also has no
  // invariant horizontal plane at all, so there is no floor to fall to.
  if (['Sol', 'SL2R'].includes(rawVal('curv'))) {
    lock('field', 'none', 'flight laboratory');
    lock('upright', 'free', 'canonical coordinate frame');
    lock('move', 'walking', 'flight laboratory');
    lock('edges', 'hide', 'no quotient');
    lock('light', 'instant', 'no history rendering');
    lock('foe', 'off', 'hyperbolic only');
    lock('boomerang', 'off', 'hyperbolic only');
    lock('build', 'off', 'hyperbolic only');
    lock('portals', 'off', 'hyperbolic only');
    lock('course', 'off', 'navigation laboratory');
  }
  if (rawVal('curv') === 'Nil') {
    lock('field', 'none', 'down is not a gradient in Nil');
    lock('upright', 'free', 'the stabiliser is only SO(2)');
    lock('move', 'walking', 'free flight');
    lock('edges', 'hide', 'no fundamental domain');
    lock('light', 'instant', 'self copies need a quotient');
    lock('foe', 'off', 'hyperbolic only');
    lock('boomerang', 'off', 'hyperbolic only');
    lock('build', 'off', 'hyperbolic only');
    lock('portals', 'off', 'hyperbolic only');
    lock('course', 'climb', 'the climb is what Nil is for');
  }

  // H^2 x R takes the same family away for the same kind of reason, and adds
  // one of its own: the whole fighting kit and both hyperbolic courses are
  // built on hyp.js and its group, and a product placement does not satisfy
  // that form at all.
  //
  // Gravity is the interesting exception. It is NOT taken away here -- falling
  // is the entire mode. It is simply not physics.js's gravity: the height is a
  // coordinate, so the fall is a constant subtraction from one velocity
  // component and there is no field object to choose. The option is pinned to
  // say so rather than left offering three answers to a question the geometry
  // has already settled.
  if (rawVal('curv') === 'H^2 x R') {
    lock('field', 'floor plane', 'the floor is z = 0');
    lock('upright', 'free', 'the frame never tilts');
    lock('move', 'walking', 'free fall');
    lock('edges', 'hide', 'no fundamental domain');
    lock('foe', 'off', 'hyperbolic only');
    lock('boomerang', 'off', 'hyperbolic only');
    lock('build', 'off', 'hyperbolic only');
    lock('portals', 'off', 'hyperbolic only');
    lock('light', 'instant', 'no self copies without a quotient');
    lock('course', 'dropper', 'the mode this geometry is for');
  }

  // S^2 x R takes the same family, and for the same reasons -- but NOT
  // gravity, and not the camera: this is the one world here with a compact
  // floor AND an honest down, so both are real settings rather than pinned
  // ones. What it cannot have is the hyperbolic kit and the hyperbolic
  // courses, which are built on hyp.js and its group top to bottom.
  if (rawVal('curv') === 'S^2 x R') {
    lock('field', 'floor plane', 'the floor is z = 0');
    lock('upright', 'free', 'the frame never tilts');
    lock('move', 'walking', 'no rolling model here yet');
    lock('edges', 'hide', 'no fundamental domain');
    lock('foe', 'off', 'hyperbolic only');
    lock('boomerang', 'off', 'hyperbolic only');
    lock('build', 'off', 'hyperbolic only');
    lock('portals', 'off', 'hyperbolic only');
    lock('light', 'instant', 'no self copies without a quotient');
    lock('course', rawVal('course') === 'race' ? 'race' : 'lap', 'spherical floor course');
  }

  // E^3 / Lambda takes the same hyperbolic-only family, and then two things
  // are pinned rather than taken, which is a distinction worth keeping:
  //
  // GRAVITY IS REAL HERE and it is not physics.js's. In the slab the height is
  // an affine coordinate exactly as it is in both products, so the fall is one
  // subtraction and there is no field object to choose. In the 3-TORUS it is
  // stranger than any of them: d/dz is invariant under every lattice
  // translation so the FORCE descends perfectly well, but z is not periodic so
  // there is no height function on T^3 at all -- and there cannot be, since a
  // continuous function on a compact manifold has a maximum and a maximum has
  // no gradient. Force without a potential. Played, that is falling through
  // the floor, arriving through the roof, and arriving faster than you left.
  // 'none' therefore stays available and means exactly what it says.
  //
  // THE CAMERA IS PINNED for the reason both products' is: parallel transport
  // in a flat space is componentwise, so the frame never tilts and alignUp has
  // nothing to re-pin.
  //
  // DOMAIN EDGES ARE **NOT** LOCKED OFF, and this is the one place this world
  // differs from every other non-hyperbolic one. There IS a fundamental domain
  // here, it is a square, and the gold line around it is the only thing on
  // screen that gives the quotient away -- in the octagon world the rooms
  // visibly crowd and the corners tell you; here nothing distinguishes a cell
  // that wraps from an endless plain.
  if (rawVal('curv') === 'flat torus') {
    lock('upright', 'free', 'the frame never tilts');
    lock('move', 'walking', 'no rolling model here yet');
    lock('foe', 'off', 'hyperbolic only');
    lock('boomerang', 'off', 'hyperbolic only');
    lock('build', 'off', 'hyperbolic only');
    lock('portals', 'off', 'hyperbolic only');
    // NOT because there are no self copies -- there are, and they come free:
    // hDist folds every displacement, so the player's body is drawn in every
    // cell down every sightline with no machinery at all. What finite light
    // speed needs is `selfHist`, the ring of FOLDED samples plus the group
    // elements linking them, and that is built on the hyperbolic fold.
    lock('light', 'instant', 'the light-speed trail is built on the hyperbolic fold');
    lock('course', rawVal('course') === 'torus' ? 'torus' : 'off',
      'the flat course is the torus one');
    // The (1,1,1) course rises, and in the slab world z is not glued, so a
    // geodesic with any rise never comes back. The course IS the 3-torus.
    if (rawVal('course') === 'torus') {
      lock('mode', 'open (3D wrap)', 'the course closes only when z is glued');
    }
  }

  // And the other way round: each product's course needs that product's
  // height, so neither exists in a constant-curvature world nor in the other
  // product. Saying so in the menu beats a course option that silently builds
  // something else.
  const wantCourse = rawVal('course');
  if (wantCourse === 'dropper' && rawVal('curv') !== 'H^2 x R') {
    lock('course', 'off', 'H^2 x R only');
  }
  if ((wantCourse === 'lap' || wantCourse === 'race') && rawVal('curv') !== 'S^2 x R') {
    lock('course', 'off', 'S^2 x R only');
  }
  if (wantCourse === 'torus' && rawVal('curv') !== 'flat torus') {
    lock('course', 'off', 'flat torus only');
  }
  if (rawVal('course') === 'climb' && rawVal('curv') !== 'Nil') {
    lock('course', 'off', 'Nil only');
  }

  // A course is a time trial. Everything that exists to fight with is off:
  // there is nothing to fight, and each one is a key that would do nothing.
  const course = f.course ?? rawVal('course');
  if (course !== 'off') {
    lock('foe', 'off', 'timed run');
    lock('boomerang', 'off', 'timed run');
    lock('build', 'off', 'timed run');
    lock('portals', 'off', 'timed run');
  }
  // The grapple course is charge gates, so it needs the two things that make
  // a charge: gravity to swing under, and a rope to swing on. With gravity off
  // there is nothing to swing from and every gate stays shut for ever.
  if (course === 'grapple') {
    lock('field', 'floor plane', 'gates need a swing');
    lock('upright', 'gravity', 'gates need a swing');
    lock('mode', 'floor (2D wrap)', 'gates need a floor');
  }

  return [f, why];
}

// --- presets --------------------------------------------------------------
//
// A preset is a STARTING POINT, not a lock: it sets the options the mode wants
// and then gets out of the way, so anything not mentioned is left as the
// player had it and anything mentioned can be changed back. That is the
// difference between this and `computeForced` above, and both are needed --
// forcing is for settings a mode cannot coexist with, a preset is for settings
// it merely plays better with.
//
// Presets are applied by NAME, not by index, so reordering an option's values
// cannot silently change what a preset means.
/**
 * Apply a preset. Unknown values are IGNORED RATHER THAN GUESSED.
 *
 * A preset naming a value an option does not have is a typo, and silently
 * picking index 0 would apply a plausible-looking wrong setting that nobody
 * would ever trace back to here. Say so in the console and leave it alone.
 */
function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  for (const [k, v] of Object.entries(p.set)) {
    const o = opts[k];
    if (!o) { console.warn(`[preset ${name}] no option "${k}"`); continue; }
    const i = o.values.indexOf(v);
    if (i < 0) { console.warn(`[preset ${name}] "${k}" has no value "${v}"`); continue; }
    o.i = i;
  }
  applyOptions();
  // A course preset should also START the course, or the player picks
  // "Hoop course" and lands in a world with an unlit course in it.
  if (optVal('course') !== 'off') { resetForCurvature(); beginRun(); return; }
  // And a preset WITHOUT a course has to stop one that is already running, or
  // the clock from the last preset keeps counting under a mode that has no
  // course at all - measured: switching from "Hoop course" to "Spherical
  // flight" left the run in PHASE.RUNNING with a live timer.
  if (run) resetRun(run);
  resetForCurvature();
}

/** The setting the game uses: the mode's, if it has taken this one over. */
const optVal = (k) => (k in forcedOpts ? forcedOpts[k] : rawVal(k));

/**
 * Should the frame be re-pinned to gravity this step?
 *
 * Not if there is no gravity - there is nothing to pin to - and not if the
 * player asked for a free camera. In free mode the frame is only ever
 * parallel-transported, which has a consequence worth knowing: transport
 * around a closed loop on a curvature -1 surface rotates it by the area
 * enclosed, so flying a circle really does roll you, by exactly the amount
 * the loop encloses. That is the same holonomy the dash banks.
 */
const upright = () => optVal('upright') !== 'free' && optVal('field') !== 'none';
const keys = new Set();

function reset() {
  // The bounded world spawns above its floor; the open world has no floor and
  // its own furniture, so it spawns in the clear ball at the cell centre.
  player = placeAt(0, 0, optVal('mode') === 'floor (2D wrap)' ? 0.6 : 0.0);
  seedHistory(foldPoint(point(player)), point(player));
  vel = [0, 0, 0];
  yaw = 0; pitch = 0;
  grapple = null;
  crossings = 0;
  banked = 0;
  dashReadyAt = 0;
  clearBoomerang();
  clearBlock();
  clearCut();
  clearDecoy();
  blastFx = null;
  decoyReadyAt = 0; recallReadyAt = 0; cutReadyAt = 0; swapReadyAt = 0;
  roll = 0; rollRate = 0;
  tilt = [0, 0]; tiltVel = [0, 0]; prevVel = [0, 0, 0];
  spin = [0, 0, 0]; slipping = false;
  camSwing = { axis: [0, 0, 1], angle: 0, vel: 0 };
  playerHealth = MAX_HEALTH; playerHurtFor = 0;
  lastHit = ''; lastHitFor = 0;
  spawnFoe();
  // Settings are deliberately untouched: R puts the player back, it does not
  // undo what they chose. Re-applying them keeps the world in step.
  applyOptions();
}
reset();

// --- input --------------------------------------------------------------

// Zoom on the wheel. Geometric steps, so every notch is the same proportional
// change whichever end of the range you are at - the same reason a camera lens
// is marked in stops. passive:false because the default action scrolls the
// page, and a page that scrolls under a pointer-locked game is a mess.
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * Math.exp(-e.deltaY * 0.0012)));
}, { passive: false });

addEventListener('keydown', (e) => {
  // The network panel has real text fields in it, and a game that reads WASD
  // out of a box you are pasting a connection code into is unusable.
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (menuBusy) { e.preventDefault(); return; }
  if (e.code === 'KeyO' || (e.code === 'Escape' && optOpen)) {
    e.preventDefault();
    if (!e.repeat) setMenuOpen(!optOpen);
    return;
  }
  if (optOpen && (tag === 'SELECT' || tag === 'BUTTON' || tag === 'SUMMARY')
      && !/^Digit[1-8]$/.test(e.code)) return;
  if (e.code === 'KeyN') { toggleNetPanel(); return; }
  if (netOpen) { if (e.code === 'Escape') toggleNetPanel(); return; }
  // Zoom back out in one press, because scrolling all the way back is a chore
  // and you want the wide view the instant something goes wrong.
  if (optOpen) {
    e.preventDefault();
    if (e.code === 'ArrowUp') optSel = (optSel + optKeys.length - 1) % optKeys.length;
    if (e.code === 'ArrowDown') optSel = (optSel + 1) % optKeys.length;
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      const o = opts[optKeys[optSel]];
      if (optKeys[optSel] in forcedOpts) return;
      o.i = (o.i + (e.code === 'ArrowRight' ? 1 : o.values.length - 1)) % o.values.length;
      queueMenuChange(() => { lastPreset = null; applyOptions(); });
    }
    // Digits pick a preset. They are portal keys during play, which is exactly
    // why this lives inside the menu-open branch and returns below.
    const digit = e.code.startsWith('Digit') ? Number(e.code.slice(5)) : 0;
    if (digit >= 1 && digit <= PRESET_KEYS.length) {
      choosePreset(PRESET_KEYS[digit - 1]);
    }
    drawMenu();
    return;
  }
  if (e.code === 'KeyR' && !e.repeat) { restartWorld(); return; }
  if (racing() && e.code === 'KeyX') { keys.add(e.code); return; }
  if (e.code === 'KeyX') zoom = ZOOM_MIN;
  if (e.code === 'KeyF' && geomKey() === 'h3') toggleBeacon();
  // The fighting kit uses H3 operations. Never run it on another placement.
  if (geomKey() !== 'h3' && ['KeyQ', 'KeyV', 'KeyH', 'KeyT', 'KeyE',
    'KeyB', 'KeyG', 'Digit1', 'Digit2', 'Digit3'].includes(e.code)) return;
  if (e.code === 'KeyQ') useHolonomy();
  // The five abilities that came after the grapple. Each one is a thing the
  // geometry makes possible rather than a thing bolted on: see physics.js.
  if (e.code === 'KeyV') dropDecoy();       // a copy of you, from your own past
  if (e.code === 'KeyH') doRecall();        // back down the path you walked
  if (e.code === 'KeyT') doCut();           // a pane of geodesic plane
  if (e.code === 'KeyE') doSwap();          // trade places with the anchor
  if (optVal('roll') === 'momentum') {
    if (e.code === 'KeyZ') rollRate -= ROLL_IMPULSE;
    if (e.code === 'KeyC') rollRate += ROLL_IMPULSE;
    if (e.code === 'KeyX') rollRate = 0;
  }
  // Portals. The faces of the fundamental domain are already portals, glued
  // by the group; these are the same construction with a pair you place.
  if (e.code === 'Digit1' && optVal('portals') === 'on') {
    placePortal(0, player, cameraBasis().fwd, worldSDF);
  }
  if (e.code === 'Digit2' && optVal('portals') === 'on') {
    placePortal(1, player, cameraBasis().fwd, worldSDF);
  }
  if (e.code === 'Digit3') clearPortals();
  // Start or restart the course. K TURNS IT ON if it is off, rather than doing
  // nothing: the option defaults to 'off', so gating this on courseOn() meant
  // the key was dead until you had already found the mode in the options menu
  // - and the menu is the only place it was mentioned, because K was missing
  // from the key list below too. Two lines, and between them the whole feature
  // was unreachable in the shipped build. A key named on screen must always do
  // something when pressed.
  if (e.code === 'KeyK') {
    if (sphericalWorld()) { restartWorld(); return; }
    // A key named on screen must always do something. In H^2 x R the course
    // is forced on, so K is a restart; everywhere else it turns the hoop
    // course on if nothing is running, exactly as before.
    if (!courseOn()) { opts.course.i = 1; applyOptions(); }
    beginRun();
  }
  // The boomerang. It flies dead straight and comes back anyway, because some
  // of this manifold's geodesics close up. In the open world the spokes are
  // drawn along exactly those geodesics, so they show you where to aim.
  if (e.code === 'KeyB' && optVal('boomerang') !== 'off') {
    // 'aimed' throws down the sightline and turns round; 'closed geodesic'
    // uses an axis of the group and lets the manifold hand it back. The second
    // is the geometrically special one and the first is the usable one.
    if (optVal('boomerang') === 'closed geodesic') launchBoomerang(player, cameraBasis().fwd);
    else launchAimed(player, cameraBasis().fwd);
  }
  // Build. The delay is the design: see placeBlock.
  if (e.code === 'KeyG' && optVal('build') === 'on') {
    placeBlock(player, cameraBasis().fwd, worldSDF);
  }
  if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
    opts.resolution.i = Math.max(0, Math.min(opts.resolution.values.length - 1,
      opts.resolution.i + (e.code === 'BracketRight' ? 1 : -1)));
    applyOptions();
  }
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'Space' && grounded && geomKey() === 'h3') {
    // Jump along up-at-the-player. alignUp has pinned that to E3, but asking
    // for it keeps this honest if the pinning is ever removed.
    const u = upDirection(player);
    vel = [vel[0] + u[0] * JUMP, vel[1] + u[1] * JUMP, vel[2] + u[2] * JUMP];
    grounded = false;
  }
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));

// Pointer lock delivers a garbage first delta: the browser reports the jump
// from wherever the cursor was on screen to the locked position, which can be
// hundreds of pixels and snaps the view somewhere random. The same thing can
// happen after an alt-tab or a re-lock. Two defences, because either alone
// leaves a hole: drop the first few events after a lock change, and clamp
// every delta to something a hand could actually produce in one frame.
// The settle window is measured in TIME, not in events. Counting events is
// wrong in a way that gets worse the better your mouse is: at 125 Hz, three
// events is 24 ms; at 1000 Hz it is 3 ms, so a high-polling-rate mouse sails
// straight through the guard and the spurious first delta lands anyway.
let lockSettleUntil = 0;
document.addEventListener('pointerlockchange', () => {
  lockSettleUntil = performance.now() + 250;
  pendingX = 0; pendingY = 0;
  if (document.pointerLockElement !== canvas) keys.clear();
});
addEventListener('blur', () => {
  lockSettleUntil = performance.now() + 250;
  keys.clear(); pendingX = 0; pendingY = 0; grapple = null;
});

// A single event bigger than this is not a hand, it is the browser reporting
// the jump to the locked position or flushing a stall. Drop it outright rather
// than clamping: a clamped 180px spike is still a 26 degree snap.
const SPIKE = 250;
// And cap what one frame can turn, so a burst of merely-large events cannot
// add up to a spin either.
const MAX_TURN = 0.6;     // radians per frame

let pendingX = 0, pendingY = 0;

addEventListener('mousemove', (e) => {
  if (optOpen || netOpen || menuBusy) return;
  if (document.pointerLockElement !== canvas) return;
  if (performance.now() < lockSettleUntil) return;
  const dx = e.movementX || 0, dy = e.movementY || 0;
  if (Math.abs(dx) > SPIKE || Math.abs(dy) > SPIKE) return;
  // Accumulate and apply once per frame. At 1000 Hz this is eight events per
  // frame, and folding them together is both cheaper and impossible to get
  // half-applied partway through a physics substep.
  pendingX += dx;
  pendingY += dy;
});

/** Fold this frame's accumulated mouse movement into the camera. */
function applyLook() {
  const clamp = (v) => Math.max(-MAX_TURN, Math.min(MAX_TURN, v));
  yaw -= clamp(pendingX * 0.0025);
  pitch -= clamp(pendingY * 0.0025);
  pitch = Math.max(-1.5, Math.min(1.5, pitch));
  pendingX = 0; pendingY = 0;
}

canvas.addEventListener('mousedown', (e) => {
  if (optOpen || netOpen || menuBusy) return;
  if (document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; }
  if (e.button === 0 && geomKey() === 'h3') fireGrapple();
});
addEventListener('mouseup', (e) => { if (e.button === 0) grapple = null; });

/** Rotate v about a unit axis by an angle. Rodrigues, written out. */
function rotAbout(v, axis, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const d = axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2];
  const cx = [
    axis[1] * v[2] - axis[2] * v[1],
    axis[2] * v[0] - axis[0] * v[2],
    axis[0] * v[1] - axis[1] * v[0],
  ];
  return [0, 1, 2].map((i) => v[i] * c + cx[i] * s + axis[i] * d * (1 - c));
}

/**
 * One substep of the opponent.
 *
 * The same integrator, collision and re-pinning the player gets, so it moves
 * by the same rules and there is nothing to reconcile later - which is exactly
 * what a networked version will need.
 *
 * It steers by logTo, the direction of the geodesic from it to you, in ITS
 * frame. That is the honest "which way is the enemy" in curved space. On an
 * H^2 floor a straight-line chase is a losing move, so this thing is beatable
 * by circling rather than by outrunning it - which is the lesson the geometry
 * has to teach, and watching it fail to catch you teaches it faster than any
 * explanation would.
 *
 * It aims at the NEAREST COPY of you, not at your coordinates: it should walk
 * toward the image it can actually see, which may be through a face.
 */
function stepFoe(h) {
  if (!foe || optVal('foe') === 'off') return;
  stepCharacter(foe, h);
  if (playerHurtFor > 0) playerHurtFor = Math.max(0, playerHurtFor - h);
  if (lastHitFor > 0) lastHitFor = Math.max(0, lastHitFor - h);

  // Over a network the other end owns this character completely: its position,
  // its health and whether its weapons connected are all its own to decide.
  // Nothing here may touch it, or two simulations would be arguing.
  if (optVal('foe') === 'network') { netApply(h); return; }

  if (foe.health <= 0) {
    if (foe.deadFor >= FOE_RESPAWN) spawnFoe();
    return;
  }

  const me = point(foe.M);
  let target = point(player), best = dist(me, target);
  for (const g of pairings()) {
    const q = apply(g, point(player));
    const d = dist(me, q);
    if (d < best) { best = d; target = q; }
  }
  const to = logTo(foe.M, target);
  const flat = Math.hypot(to[0], to[1]);
  const want = flat > 1e-6
    ? [(to[0] / flat) * FOE_SPEED, (to[1] / flat) * FOE_SPEED, 0]
    : [0, 0, 0];

  foe.vel = control(foe.vel, want, true, h);
  [foe.M, foe.vel] = stepFree(foe.M, foe.vel, h);
  [foe.M, foe.vel] = collide(foe.M, foe.vel, worldSDF);
  if (upright()) [foe.M, foe.vel] = alignUp(foe.M, foe.vel);
  const [ff, , fc] = reduceToDomain(foe.M);
  if (fc !== 0) foe.M = ff;

  // The boomerang can hit it. Skipping id 0 means your own throw passes
  // through you on the way out - it comes back to your hand, not your face.
  if (boomerangHits([foe], 0)) {
    lastHit = `boomerang hit for ${BOOM_DAMAGE}`;
    lastHitFor = 1.6;
  }

  // And letting it reach you costs something, or your health is decoration.
  if (playerHurtFor <= 0 && playerHealth > 0
      && orbitDist(point(player), point(foe.M)) < PLAYER_R * 2) {
    playerHealth = Math.max(0, playerHealth - TOUCH_DAMAGE);
    playerHurtFor = TOUCH_COOLDOWN;
    lastHit = playerHealth > 0 ? `it reached you: -${TOUCH_DAMAGE}` : 'you are down - R to reset';
    lastHitFor = playerHealth > 0 ? 1.6 : 99;
  }
}

/** Camera basis, in FRAME components. Identical to the shader's. */
function cameraBasis() {
  const [vp, vr] = viewAngles();
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(vp), sp = Math.sin(vp);
  let fwd = [cy * cp, sy * cp, sp];
  const r0 = [sy, -cy, 0];
  const u0 = [
    r0[1] * fwd[2] - r0[2] * fwd[1],
    r0[2] * fwd[0] - r0[0] * fwd[2],
    r0[0] * fwd[1] - r0[1] * fwd[0],
  ];
  // Roll turns the other two about the view axis; fwd is untouched, so aiming
  // and the grapple do not care. The shader does the same rotation, and the
  // two have to agree or the rope draws off the crosshair.
  const cr = Math.cos(vr), sr = Math.sin(vr);
  let right = [0, 1, 2].map((i) => cr * r0[i] + sr * u0[i]);
  let up = [0, 1, 2].map((i) => cr * u0[i] - sr * r0[i]);
  // The portal swing, applied as a WHOLE rotation rather than as a lean.
  if (camSwing.angle !== 0) {
    fwd = rotAbout(fwd, camSwing.axis, camSwing.angle);
    right = rotAbout(right, camSwing.axis, camSwing.angle);
    up = rotAbout(up, camSwing.axis, camSwing.angle);
  }
  return { fwd, right, up };
}

/**
 * The camera basis expressed back as the yaw/pitch/roll the shader wants.
 *
 * The shader builds its basis from three angles, so an arbitrary rotation
 * offset has to be folded back into them. Inverting the shader's construction:
 * pitch and yaw come straight off the forward vector, and roll is the angle
 * from the un-rolled right vector to the actual one. Degenerate looking
 * straight up or down, exactly as the angles themselves are.
 */
function shaderAngles() {
  const { fwd, right } = cameraBasis();
  const p = Math.asin(Math.max(-1, Math.min(1, fwd[2])));
  const y = Math.atan2(fwd[1], fwd[0]);
  const cy = Math.cos(y), sy = Math.sin(y);
  const r0 = [sy, -cy, 0];
  const u0 = [
    r0[1] * fwd[2] - r0[2] * fwd[1],
    r0[2] * fwd[0] - r0[0] * fwd[2],
    r0[0] * fwd[1] - r0[1] * fwd[0],
  ];
  const r = Math.atan2(
    right[0] * u0[0] + right[1] * u0[1] + right[2] * u0[2],
    right[0] * r0[0] + right[1] * r0[1] + right[2] * r0[2],
  );
  return [y, p, r];
}

function fireGrapple() {
  const { fwd } = cameraBasis();
  const r = cast(player, fwd, worldSDF, ROPE_RANGE);
  if (!r.hit) { grapple = null; return; }
  // The cast marched arclength, so t IS the rope length.
  grapple = grappleAttach(r.point, Math.max(r.t, 0.35));
}

/**
 * Air resistance. Applied outside stepFree so the integrator stays a pure
 * symplectic gravity step and physics.test.js can still hold it to exact
 * energy conservation — drag is precisely the thing that breaks that, so it
 * does not belong inside.
 *
 * Quadratic, like a real fluid: gentle at walking pace, and it puts a ceiling
 * on how fast a swing can wind you up. Without one the rope is a free energy
 * source, because nothing else in the game removes any.
 */
const DRAG_K = 0.06;

function drag(v, dt) {
  const sp = Math.hypot(v[0], v[1], v[2]);
  if (sp < 1e-9) return v;
  const k = Math.max(0, 1 - DRAG_K * sp * dt);
  return [v[0] * k, v[1] * k, v[2] * k];
}

// --- options overlay ----------------------------------------------------

const worldMenu = createWorldMenu({
  presets: PRESETS,
  onPreset: choosePreset,
  onOption: (key, value) => queueMenuChange(() => {
    opts[key].i = opts[key].values.indexOf(value);
    lastPreset = null;
    applyOptions();
  }),
  onClose: () => setMenuOpen(false),
});
document.getElementById('worlds-button').addEventListener('click', () => setMenuOpen(true));

function setMenuOpen(open) {
  if (menuBusy) return;
  optOpen = open;
  keys.clear(); pendingX = 0; pendingY = 0; grapple = null;
  if (open && document.pointerLockElement === canvas) document.exitPointerLock();
  drawMenu();
  if (open) worldMenu.focus();
  else document.getElementById('worlds-button').focus();
}

function choosePreset(name) {
  queueMenuChange(() => { lastPreset = name; applyPreset(name); });
}

function queueMenuChange(change) {
  if (menuBusy) return;
  menuBusy = true;
  drawMenu();
  // Give the browser a paint before a cold driver link can block JavaScript.
  // This does not pretend to shorten compilation; cached switches stay cheap.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try { change(); }
    catch (error) { showBoot(error.stack || String(error)); }
    finally { menuBusy = false; drawMenu(); }
  }));
}

function drawMenu() {
  worldMenu.update({
    open: optOpen, options: opts,
    values: Object.fromEntries(optKeys.map((key) => [key, optVal(key)])),
    reasons: forcedWhy, selected: lastPreset, busy: menuBusy,
    status: menuBusy ? 'Preparing your world… First visits can take a few seconds.'
      : `${netLive() ? 'Connected game continues while browsing.' : 'Movement and course timer pause while browsing.'}`
        + ` Resolution ${optVal('resolution')} · ${optVal('quality')} quality.`
        + (lastPreset ? ` Ready: ${PRESETS[lastPreset].label}. Return to game, then click the view to look around.` : ''),
  });
}

// --- the network panel --------------------------------------------------
//
// Two ways to connect, and the first one needs no server of any kind.
//
//   DIRECT. Press Host, send the code to the other player however you already
//   talk to them, paste their reply back. That is the whole WebRTC handshake
//   done by hand, and it works over the open internet with nothing running
//   anywhere but the two browsers.
//
//   RELAY. Both of you type the same room name and the relay swaps the two
//   codes for you. tools/relay.js is that relay, and it also serves the game,
//   so one command puts a LAN game up. It never sees a frame of play: once the
//   two ends have found each other the traffic is peer to peer.
let netOpen = false;
const netPanel = document.createElement('div');
netPanel.style.cssText = [
  'position:fixed', 'left:50%', 'top:50%', 'transform:translate(-50%,-50%)',
  'width:min(560px,92vw)', 'padding:16px 18px',
  'background:rgba(8,10,16,0.97)', 'border:1px solid #3a4a5e', 'border-radius:8px',
  'font:13px/1.6 ui-monospace,Menlo,Consolas,monospace', 'color:#9fe',
  'display:none', 'z-index:20',
].join(';');
netPanel.innerHTML = [
  '<div style="font-weight:bold;margin-bottom:8px">TWO PLAYERS, ONE MANIFOLD',
  '<span style="float:right;opacity:0.6">N or Esc closes</span></div>',
  '<div id="nstat" style="margin:6px 0 10px;color:#ffd">not connected</div>',
  '<div style="opacity:0.75;margin-bottom:6px">Both players must be in the SAME World',
  ' (the two worlds use different groups, so a position in one means nothing in the other).</div>',
  '<div style="margin:10px 0 4px;opacity:0.8">DIRECT - no server at all</div>',
  '<button id="nhost">Host</button> <button id="njoin">Join with the code below</button>',
  ' <button id="nfin">Finish with their reply</button>',
  '<textarea id="ncode" rows="4" spellcheck="false" placeholder="the connection code goes here"',
  ' style="width:100%;margin-top:6px;background:#0d1119;color:#9fe;border:1px solid #2a3a4e;',
  'font:11px/1.4 ui-monospace,Consolas,monospace"></textarea>',
  '<div style="margin:12px 0 4px;opacity:0.8">RELAY - run <code>node tools/relay.js</code></div>',
  'room <input id="nroom" value="hyp" spellcheck="false"',
  ' style="width:90px;background:#0d1119;color:#9fe;border:1px solid #2a3a4e">',
  ' url <input id="nurl" spellcheck="false"',
  ' style="width:210px;background:#0d1119;color:#9fe;border:1px solid #2a3a4e">',
  ' <button id="nrh">Host</button> <button id="nrj">Join</button>',
  '<div style="margin-top:12px;opacity:0.6">Each player is authoritative over their own',
  ' health: you decide whether their boomerang hit you, they decide whether yours hit them.</div>',
].join('');
document.body.appendChild(netPanel);
for (const b of netPanel.querySelectorAll('button')) {
  b.style.cssText = 'background:#1a2432;color:#9fe;border:1px solid #3a4a5e;'
    + 'border-radius:4px;padding:3px 9px;font:12px ui-monospace,Consolas,monospace;cursor:pointer';
}
const nEl = (id) => netPanel.querySelector('#' + id);
// Default the relay to whatever served this page, which is right whenever the
// page came from tools/relay.js and a sensible guess otherwise.
nEl('nurl').value = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/';

function netStatusLine() {
  const s = netState();
  const n = netNote();
  return netLive() ? 'CONNECTED - set Opponent to "network" in the options (O)'
                      : `${s}${n ? ' - ' + n : ''}`;
}

function toggleNetPanel() {
  netOpen = !netOpen;
  keys.clear(); pendingX = 0; pendingY = 0; grapple = null;
  if (netOpen && optOpen) setMenuOpen(false);
  netPanel.style.display = netOpen ? 'block' : 'none';
  if (netOpen && document.pointerLockElement === canvas) document.exitPointerLock();
  nEl('nstat').textContent = netStatusLine();
}

const netFail = (e) => { nEl('nstat').textContent = 'failed: ' + (e && e.message ? e.message : e); };

nEl('nhost').onclick = () => netHost().then((code) => {
  nEl('ncode').value = code;
  nEl('ncode').select();
  nEl('nstat').textContent = 'send that code to the other player, then paste their reply here'
    + ' and press Finish';
}).catch(netFail);

nEl('njoin').onclick = () => netJoin(nEl('ncode').value).then((code) => {
  nEl('ncode').value = code;
  nEl('ncode').select();
  nEl('nstat').textContent = 'send THAT code back to the host';
}).catch(netFail);

nEl('nfin').onclick = () => netFinish(nEl('ncode').value)
  .then(() => { nEl('nstat').textContent = 'connecting...'; }).catch(netFail);

nEl('nrh').onclick = () => netConnectVia(nEl('nurl').value, nEl('nroom').value, true)
  .then(() => { nEl('nstat').textContent = 'waiting for the other player'; }).catch(netFail);
nEl('nrj').onclick = () => netConnectVia(nEl('nurl').value, nEl('nroom').value, false)
  .then(() => { nEl('nstat').textContent = 'connecting...'; }).catch(netFail);

/** Push the current option values into the world. */
// --- the hoop course -----------------------------------------------------
//
// Rebuilt whenever the world changes, because the two worlds have different
// groups and therefore different closed geodesics: the octagon's are 3.057
// long and lie IN the floor plane, the dodecahedron's are 1.993 and range over
// altitude. Same code, different course.
let course = null, run = null, courseWorld = '', hoopFlash = 0;


// --- the spherical world -------------------------------------------------
//
// A flythrough, deliberately, and separate from the hyperbolic path rather
// than woven into it. physics.js is built on hyp.js from top to bottom -
// gravity, the rope, collision, every ability - and making all of that
// curvature-generic is a rewrite of the load-bearing file. This is the small
// honest slice instead: geom.js already gives S^3 its geodesics and its
// SO(4), s3.js adds a scene and free flight, and the two paths meet only at
// `player`, which is a 4x4 either way and goes to the same uniform.
function sphericalWorld() { return optVal('curv') === 'spherical'; }

/**
 * H^2 x R: the PRODUCT geometry, and the third scene program.
 *
 * Not a space of constant curvature at all, and that is the point of it. The
 * floor plan is a hyperbolic plane and the height is Euclidean, and the two
 * factors do not interact: parallel transport is componentwise, so the frame
 * never tilts, and a horizontal geodesic stays at its height for ever.
 *
 * That last fact is why the DROPPER lives here. CLAUDE.md recorded a dropper
 * as impossible, with a measurement behind it, and the measurement was right
 * about H^3 rather than about droppers: there the level sets of the height are
 * equidistant surfaces that curve away from the floor plane, so horizontal
 * motion is motion that climbs and above a critical speed the fall stops
 * outright. Here z = const is TOTALLY GEODESIC and the fall time is exactly
 * independent of how hard you steer -- h2r.test.js measures it at every
 * horizontal speed from 0 to 3, to every printed digit.
 *
 * Like the spherical world this is a small honest slice rather than the full
 * kit: no rope, no fighting kit, no quotient. The two paths meet at `player`,
 * which is a 4x4 either way.
 */
function productWorld() { return optVal('curv') === 'H^2 x R'; }

/**
 * S^2 x R: a SPHERICAL floor plan with the same honest Euclidean height, and
 * the exact mirror of the bounded world.
 *
 * The bounded world's floor wraps because a GROUP glues one octagon to the
 * next. This one's wraps because it is a sphere -- no group, no fundamental
 * domain, no fold, no straddle copy. Same shape of world, opposite mechanism
 * and opposite curvature, and running the hoop course in one and the lap
 * course in the other back to back is the cleanest way to feel what a
 * quotient actually is: the experience is identical and only the reason
 * differs.
 *
 * It is also the FIRST world here with a compact floor AND honest gravity.
 * H^3/Gamma is compact but "down" has to be chosen; S^3 is compact and admits
 * no gravity at all; H^2 x R has honest gravity over an infinite floor. This
 * one has both, because z is affine exactly as it is in H^2 x R and the floor
 * closes up for free.
 *
 * And the fact you feel first: ANY TWO GEODESICS ON A SPHERE MEET, TWICE. On
 * the H^2 floor almost none do -- they diverge like e^d, which is why
 * flanking is cheap there and a straight chase is a losing move. Here running
 * straight away from someone running straight is how you meet them on the far
 * side. You cannot escape by going straight.
 */
function sphereFloorWorld() { return optVal('curv') === 'S^2 x R'; }

/** Either product: a curved floor plan with a flat, honest height. */
function anyProduct() { return productWorld() || sphereFloorWorld(); }

/**
 * E^3 / Lambda: the flat 3-manifolds, and the CONTROL the other four are
 * measured against.
 *
 * It is the exact structural mirror of the two hyperbolic worlds -- same
 * `mode` option, same two meanings, a square cell of inradius 1.50 against the
 * octagon's 1.5286 -- so the same level and the same course can be run in
 * both, one switch apart, with nothing differing but the curvature. That is
 * what makes it worth a whole geometry: every claim this project makes about
 * what curvature does is only checkable against a world where it does nothing.
 *
 * It is also the only world here where a PORTED MAP IS THE MAP. port.js exists
 * because there is no isometric embedding between surfaces of different
 * curvature and every strategy trades one exact property for two wrong ones;
 * port a flat floor plan into flat space and there is nothing to trade.
 */
function flatWorld() { return geomKey() === 'e3t'; }

/**
 * NIL, the Heisenberg group: the first Thurston geometry here that is neither
 * constant curvature nor a product, and the least invasive world yet.
 *
 * It is a Lie GROUP with a left-invariant metric, so every isometry is affine,
 * a placement is an ordinary 4x4 whose columns are the frame, and the shader's
 * chartMap is a plain multiply. That is the shape this codebase had when it
 * WAS a Nil game.
 *
 * What it costs is the distance function, which has no closed form -- and that
 * cost far less than the roadmap predicted. Sphere tracing only ever needed a
 * LOWER BOUND, which every SDF here already is outside its corners, so the
 * marcher's step rule is untouched; Nil supplies a bound from the isoperimetric
 * inequality instead, because climbing in Nil is done by enclosing area. What
 * really is structural is the QUOTIENT: a fundamental domain needs the ray/face
 * crossing solved and against a HELIX that is transcendental, so this world has
 * none, exactly as S^3 and both products have none.
 *
 * The fact you meet first: GOING STRAIGHT UP IS NOT THE SHORTEST WAY UP. The
 * climb's finish sits 60 units directly overhead, costing 60 to fly on the axis
 * or 26.7 on a helix of radius 4.13. Every azimuth gives a helix of that same
 * length, so the finish is visible as a RING of images around you at the launch
 * elevation as well as one dim copy straight up.
 */
function nilWorld() { return geomKey() === 'nil'; }

/**
 * Anything that is not H^3: the worlds that run on a motion adapter rather
 * than on physics.js and its group.
 */
function adapterWorld() { return geomKey() !== 'h3'; }

/**
 * What the options have selected INSIDE the current geometry.
 *
 * Only the flat one reads it, and it is the first geometry here whose single
 * shader program serves two manifolds: `mode` picks the slab from the 3-torus
 * exactly as it picks the octagon world from the dodecahedral one.
 */
function motionEnv() {
  return {
    open: optVal('mode') !== 'floor (2D wrap)',
    gravity: optVal('field') !== 'none',
  };
}

/** Which scene program the options are asking for. */
function geomKey() {
  return spaceForOption(optVal('curv')).key;
}

function showBoot(msg) {
  const b = document.getElementById('boot');
  if (b) { b.style.display = 'block'; b.textContent = msg; }
}
function hideBoot() {
  const b = document.getElementById('boot');
  if (b) { b.style.display = 'none'; b.textContent = ''; }
}

/**
 * Put the player somewhere legal for the space they are now in.
 *
 * Not optional, and not a convenience. A placement is a matrix preserving the
 * form, and the two forms are different: carrying a Lorentz matrix into the
 * spherical program leaves every ray off the 3-sphere and draws black.
 */
function resetForCurvature() {
  racer = makeRacer();
  const motion = worldMotionFor(geomKey());
  if (!motion) { reset(); return; }
  clearBoomerang(); clearBlock(); clearCut(); clearDecoy(); clearPortals();
  blastFx = null;
  grounded = false;
  const spawn = motion.spawn(motionEnv());
  player = spawn.M; vel = spawn.vel; yaw = spawn.yaw; pitch = spawn.pitch;
  roll = 0; rollRate = 0;
  tilt = [0, 0]; tiltVel = [0, 0]; prevVel = [0, 0, 0];
  camSwing = { axis: [0, 0, 1], angle: 0, vel: 0 };
  grapple = null;
  banked = 0;
  if (sphericalWorld()) s3Start = player;
}
/** Reset using this world's placement and restart its course at the start line. */
function restartWorld() {
  keys.clear();
  grounded = false;
  resetForCurvature();
  if (courseOn()) beginRun();
}

/**
 * What the keys are asking for, in FRAME components, for free flight.
 *
 * Unlike the walking control this drives all three axes and it drives them
 * along the VIEW rather than along the floor, because there is no floor. W is
 * where you are looking, including pitch, and space/shift are the view's own
 * up - which is what flying is.
 */
function s3Want(basis) {
  const w = [0, 0, 0];
  const add = (v, k) => { for (let i = 0; i < 3; i++) w[i] += v[i] * k; };
  if (keys.has('KeyW')) add(basis.fwd, 1);
  if (keys.has('KeyS')) add(basis.fwd, -1);
  if (keys.has('KeyD')) add(basis.right, 1);
  if (keys.has('KeyA')) add(basis.right, -1);
  if (keys.has('Space')) add(basis.up, 1);
  if (keys.has('ShiftLeft') || keys.has('ShiftRight')) add(basis.up, -1);
  const m = Math.hypot(w[0], w[1], w[2]);
  return m > 1e-9 ? [w[0] / m, w[1] / m, w[2] / m] : [0, 0, 0];
}

/**
 * What the keys ask for while falling: a HORIZONTAL direction, and nothing
 * else. You cannot steer the fall, only the drift, which is what a dropper is.
 *
 * Taken off the view's forward projected into the floor plan rather than off
 * the frame directly, so W is "further into the shaft the way I am looking"
 * even when the camera is pointed almost straight down.
 */
function h2rWant(basis) {
  let wx = 0, wy = 0;
  const fx = basis.fwd[0], fy = basis.fwd[1];
  const m = Math.hypot(fx, fy);
  // Looking straight down leaves no horizontal forward at all; fall back to
  // yaw, which is where the head is pointing whatever the pitch is.
  const [cx, cy] = m > 1e-3 ? [fx / m, fy / m] : [Math.cos(yaw), Math.sin(yaw)];
  if (keys.has('KeyW')) { wx += cx; wy += cy; }
  if (keys.has('KeyS')) { wx -= cx; wy -= cy; }
  if (keys.has('KeyD')) { wx += cy; wy -= cx; }
  if (keys.has('KeyA')) { wx -= cy; wy += cx; }
  const wl = Math.hypot(wx, wy);
  return wl > 1e-9 ? [wx / wl, wy / wl] : [0, 0];
}

/** Advance motion and its course in the same chart (these worlds do not fold). */
function stepWorldMotion(motion, h, want) {
  const p0 = motion.point(player);
  dropFlash = Math.max(0, dropFlash - h);
  if (productWorld() && run && run.phase === PHASE.RUNNING &&
      H2R.dropperImpact(player, H2R.h2rFall(vel, want, h), h)) {
    dropDeaths++; dropFlash = 1; beginRun(); return;
  }
  if (racing()) {
    if (run && run.phase === PHASE.DONE) { vel = [0, 0, 0]; return; }
    [player, vel, racer] = raceStep(player, vel, racer, {
      throttle: keys.has('KeyW') ? 1 : 0,
      steer: (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0),
      drift: keys.has('ShiftLeft') || keys.has('ShiftRight'),
      jump: keys.has('Space'), boost: keys.has('KeyX'),
    }, h);
    yaw = racer.heading;
  } else {
    [player, vel] = motion.step(player, vel, want, keys.has('Space'), h, motionEnv());
  }
  if (motion.course && run && course) {
    if (runStep(run, h, p0, motion.point(player), null) >= 0) hoopFlash = 0.35;
    if (productWorld() && run.phase === PHASE.RUNNING &&
        motion.point(player)[2] < course.hoops[run.next].z - 1) {
      dropDeaths++; dropFlash = 1; beginRun();
    }
  }
}

function racing() { return sphereFloorWorld() && optVal('course') === 'race'; }
function courseOn() { return optVal('course') !== 'off'; }
function buildCourse() {
  if (racing()) return raceCourse();
  const motion = worldMotionFor(geomKey());
  if (motion && motion.course) return motion.course();
  return optVal('course') === 'grapple' ? grappleCourse() : geodesicCourse(0, 6);
}

function ensureCourse() {
  // Keyed by GEOMETRY as well as by group. A dropper built in H^2 x R is
  // nonsense in H^3 -- its gate centres satisfy a different form -- and
  // getMode() alone cannot tell those apart, because the curvature option is
  // not the world option.
  const w = `${geomKey()}:${getMode()}:${optVal('course')}`;
  if (course && courseWorld === w) return;
  courseWorld = w;
  course = buildCourse();
  run = makeRun(course);
}

/**
 * Aim the camera at a point, using the SAME log the projection uses.
 *
 * Going through logTo rather than working out yaw and pitch from the axis
 * directly means this cannot disagree with `project`: if the hoop draws at the
 * centre of the screen, the camera really is pointing at it. cameraBasis
 * builds fwd as [cos(yaw)cos(pitch), sin(yaw)cos(pitch), sin(pitch)] in frame
 * components, so inverting it is one atan2 and one asin.
 */
function aimAt(q) {
  const lv = sphereFloorWorld() ? S2R.logTo(player, q)
    : productWorld() ? H2R.logTo(player, q)
      : nilWorld() ? NIL.logTo(player, q)
        : flatWorld() ? E3T.logTo(player, q) : logTo(player, q);
  const m = Math.hypot(lv[0], lv[1], lv[2]);
  if (m < 1e-9) return;
  yaw = Math.atan2(lv[1], lv[0]);
  pitch = Math.asin(Math.max(-1, Math.min(1, lv[2] / m)));
  roll = 0; rollRate = 0;
  camSwing = { axis: [0, 0, 1], angle: 0, vel: 0 };
}

/**
 * Start, or start again. One key does both, which is what a time trial wants.
 *
 * It PUTS YOU ON THE START LINE, and that is not a convenience - it is what
 * makes the mode legible at all. A closed geodesic of the octagon group runs
 * through the CELL CENTRE, so `geodesicCourse` has to lay its hoops on the
 * axis through the origin; it cannot lay them on the axis through wherever the
 * player happens to be standing, because a geodesic parallel to a generator's
 * axis but offset from it does not close up, and a course that does not close
 * is the one thing this mode exists to show. So the course cannot come to the
 * player and the player must go to the course.
 *
 * Measured before this: from the ordinary spawn, gate 1 had 0 of 41 ring
 * points on screen. You pressed K, the clock started, and nothing whatsoever
 * appeared - which is exactly what "the new modes don't do anything" looks
 * like from the outside.
 */
function beginRun() {
  // The dropper is its own start: back on the deck at the top of the shaft,
  // stationary, looking down at the first gate. resetForCurvature already
  // does exactly that, so the run and the respawn are the same act.
  if (adapterWorld()) {
    ensureCourse();
    const best0 = run ? run.best : null;
    course = buildCourse();
    run = makeRun(course);
    run.best = best0;
    resetForCurvature();
    // The flat course needs no aiming: `hoopStart` puts the player ON the
    // closed geodesic already looking down it, because the frame there is the
    // identity and the camera angles come straight off the direction. The
    // hyperbolic course cannot do that -- its hoops must lie on the axis
    // through the CELL CENTRE, since a geodesic parallel to a generator's axis
    // but offset from it does not close up.
    if (!flatWorld() && !nilWorld() && course.hoops.length) aimAt(course.hoops[0].at);
    if (racing()) { racer.heading = yaw; pitch = -0.08; }
    startRun(run);
    return;
  }
  ensureCourse();
  // Rebuild rather than reuse: the hoops have been carried through every fold
  // the player made, so by now they are in whatever chart the player ended up
  // in. A fresh course puts them back on the axis through the cell centre.
  const best = run ? run.best : null;
  course = buildCourse();
  run = makeRun(course);
  run.best = best;

  // The geodesic course runs through the origin, so the origin IS its start
  // line. Stand there rather than at the ordinary spawn: in the bounded world
  // every closed geodesic lies IN the floor plane, so the hoops are centred at
  // altitude 0 and a player spawned at 0.6 is above the whole ring - outside a
  // gate of radius 0.3, looking down at it. Just clear of the floor puts the
  // eye INSIDE the line of gates, which is where a slalom is run from.
  //
  // The grapple course is a ring at radius 1.30 that the origin is not on, and
  // it is flown on a rope rather than run in a straight line, so it keeps the
  // ordinary spawn and only gets the aim.
  if (optVal('course') !== 'grapple') {
    player = placeAt(0, 0, optVal('mode') === 'floor (2D wrap)' ? 0.12 : 0.0);
    seedHistory(foldPoint(point(player)), point(player));
    vel = [0, 0, 0];
    spin = [0, 0, 0];
    grapple = null;
  }
  // Face the first gate. Without this the run is timed from a camera pointing
  // wherever you left it, and in a compact manifold "somewhere behind you" can
  // be several cells away.
  if (course.hoops.length) aimAt(hoopNear(course.hoops[0], point(player)).at);

  startRun(run);
}

function applyOptions() {
  // FIRST, because everything below this line reads optVal and optVal asks
  // what the mode has taken over.
  [forcedOpts, forcedWhy] = computeForced();

  // Curvature picks which SCENE PROGRAM is bound, because it is a #define and
  // not a uniform. Switching to spherical the first time has to LINK, which
  // takes about 4.4 s and blocks the thread while it happens, so say so rather
  // than looking like a hang. After that it is cached and switching is free.
  //
  // Switching space also has to re-place the player: a Lorentz matrix is not
  // an isometry of the 3-sphere. The spawn point has <p,p> = -1 under the
  // Minkowski form, as it must, and +1.81 under the Euclidean one where a
  // valid S^3 point needs exactly +1 - so handing the spherical marcher a
  // hyperbolic placement starts every ray 0.81 off the manifold, hits nothing,
  // and draws a 99.3% black screen. That was measured, and it is why `reset`
  // is not optional here.
  const k = geomKey();
  if (curvNow !== k) {
    const fresh = !sceneProgs.has(k);
    if (fresh) showBoot(`Building the ${optVal('curv')} shader.`
      + String.fromCharCode(10)
      + 'A few seconds, once - after that, switching is instant.');
    useCurvature(k);
    if (fresh) hideBoot();
    curvNow = k;
    resetForCurvature();
  }

  // The two worlds use DIFFERENT groups, and that is the whole point.
  //
  //   floor  octagon group. Tessellates the floor plane only, so the manifold
  //          is (genus-2 surface) x R and the vertical direction is not
  //          wrapped. The floor and ceiling are what stop you leaving it.
  //   open   Seifert-Weber dodecahedral space, a CLOSED hyperbolic 3-manifold.
  //          It repeats in every direction including up and down, so there is
  //          nowhere to fall out of and no floor is needed.
  //
  // A closed hyperbolic 3-manifold admits no invariant unit-gradient function,
  // so there is no globally consistent "down" in the open world at all. Plane
  // gravity is meaningless there; free flight and a beacon (which follows the
  // one lift you planted) are the honest choices, so the field is forced.
  const open = optVal('mode') !== 'floor (2D wrap)';
  setSolid(open ? SOLID.DODECAHEDRON : SOLID.OCTAGON);
  setMode(open ? MODE.OPEN : MODE.BOUNDED);
  // Plane gravity does not descend to the dodecahedral quotient - its
  // generators move the floor plane, so "down" would mean something different
  // in every copy - so the open world cannot have it. It used to fall back to
  // NONE, which reads as "gravity is too weak" because there is none at all.
  // A beacon does descend well enough to play with: it confines you, because
  // its potential grows linearly and there is nowhere in a compact manifold
  // to escape to. So fall back to that instead, planted at the cell centre.
  if (open && optVal('field') === 'floor plane') opts.field.i = 1;   // -> beacon
  const g = optVal('field');
  if (g === 'none') { setField(FIELD.PLANE); setGravityScale(0); }
  else if (g === 'beacon') {
    setGravityScale(1);
    // In the open world there is nothing to cast at from the spawn, and the
    // cell centre is the one place that means something, so plant it there.
    if (getField().kind !== FIELD.POINT) {
      if (open) setField(FIELD.POINT, point(placeAt(0, 0, 0.35)));
      else plantBeacon();
    }
  }
  else { setField(FIELD.PLANE); setGravityScale(1); }
  // Raised from 90/140/200 when the marcher stopped creeping along seams:
  // it now averages a third of the steps it used to, so these cost less than
  // the old ones did. tools/march-check.js checks that no ray runs out at
  // any of the three.
  marchSteps = { low: 160, medium: 220, high: 280 }[optVal('quality')];
  const scale = parseInt(optVal('resolution'), 10) / 100;
  if (scale !== renderScale) { renderScale = scale; resize(); }
  // Switching worlds changes the group AND the level, so an opponent standing
  // where the other world put it can end up inside the furniture, where it
  // shovels itself into a surface and never moves. Respawn it, but only on an
  // actual world change - otherwise nudging the fog setting would restart the
  // fight.
  if (foeWorld !== optVal('mode')) {
    foeWorld = optVal('mode');
    spawnFoe();
  }
}

// --- abilities ----------------------------------------------------------

/**
 * Plant a gravity beacon wherever the crosshair is pointing, or clear it.
 *
 * Gravity is minus the gradient of an altitude function, and this swaps which
 * function that is: distance to the floor plane becomes distance to a point.
 * Level sets stop being the floor and become spheres, so there is no longer a
 * direction that is globally down — you fall inward from wherever you are and
 * orbit rather than land. The floor is still solid; it is just no longer the
 * thing defining down.
 */
function toggleBeacon() {
  if (getField().kind === FIELD.POINT) {
    setField(FIELD.PLANE);
    opts.field.i = 0;
    return;
  }
  opts.field.i = 1;
  plantBeacon();
}

function plantBeacon() {
  const { fwd } = cameraBasis();
  const r = cast(player, fwd, worldSDF, ROPE_RANGE);
  // ON the surface you are looking at, not a third of a metre short of it.
  // The old 0.35 pullback left the beacon hanging in mid-air well in front of
  // the wall, which made it impossible to aim: you could not put gravity on a
  // specific ledge because the beacon never reached one.
  //
  // A hair off the surface rather than exactly on it, because at the beacon
  // itself "away from the beacon" has no direction and gravity is undefined
  // there. Standing on a wall is the point of the ability, so it wants to be
  // close: 0.08 is under a body radius.
  const at = r.hit ? point(geodesic(player, fwd, Math.max(r.t - 0.08, 0.3)))
                   : point(geodesic(player, fwd, 2.5));
  setField(FIELD.POINT, at);
}

/**
 * Spend banked holonomy as a burst of speed along the view direction.
 *
 * The bank fills by going AROUND things: on a curvature -1 surface a closed
 * loop turns your frame by the area it encloses, so a wide circle is worth far
 * more than a tight one. In a flat game this ability would be impossible —
 * there would be nothing to accumulate.
 */
// A dash is an impulse now and the opposite impulse later, so it displaces you
// without leaving you with speed you did not earn. The return is applied in
// the frame you are in WHEN IT FIRES, not the one you launched from, which
// matters here: the frame is parallel-transported and re-pinned, so those are
// not the same basis.
// How long before you can dash again. It used to be how long before the dash
// TOOK ITSELF BACK: an equal and opposite impulse later, so it displaced you
// without leaving speed you had not earned. That is tidy and it plays badly -
// the speed you just bought evaporates under you, usually mid-arc. Now the
// impulse simply stands, and the cooldown is what limits it.
const DASH_COOLDOWN = 1.6;

const nowSec = () => performance.now() * 0.001;
const say = (s, t = 1.6) => { lastHit = s; lastHitFor = t; };

/**
 * Spend the bank, and WHICH WAY YOU WENT ROUND decides how.
 *
 * sweptArea integrates (cosh(r) - 1) dtheta, and dtheta has a sign, so the
 * meter is signed: counter-clockwise fills it positive, clockwise negative,
 * and going back round the other way empties it. That sign was previously
 * thrown away with Math.abs, and it is the most interesting thing the meter
 * has - it means the ability you have charged is decided by the shape of the
 * path you walked, not by a key you pressed.
 *
 * Positive banks the DASH: speed, along the view. Negative banks the BLAST: a
 * shove and damage on everything near you. Both settings that ignore the sign
 * are kept, because a mode where you cannot choose is a hard sell as the only
 * mode, and comparing the two is the whole reason both exist.
 */
function useHolonomy() {
  const t = nowSec();
  if (t < dashReadyAt) return;
  const mode = optVal('holo');
  const blast = mode === 'blast only' || (mode === 'sign decides' && banked < 0);
  if (blast) holoBlastNow(t); else dash(t);
}

function dash(t) {
  const strength = Math.min(Math.abs(banked), 4.0);
  if (strength < 0.15) { say('nothing banked - circle something', 1.2); return; }
  const { fwd } = cameraBasis();
  const boost = 0.8 + 1.1 * strength;
  vel = [vel[0] + fwd[0] * boost, vel[1] + fwd[1] * boost, vel[2] + fwd[2] * boost];
  dashReadyAt = t + DASH_COOLDOWN;
  banked = 0;
}

function holoBlastNow(t) {
  const charge = Math.abs(banked);
  if (charge < BLAST_MIN_CHARGE) { say('not enough banked for a blast', 1.2); return; }
  const at = point(player);
  const R = blastRadius(charge);
  // Only the bot takes damage from here. Over a network each player is
  // authoritative over their own health, so a blast is BROADCAST and the other
  // end decides whether it caught them - which is the only arrangement where
  // neither player can be shot by something they never saw.
  const hits = optVal('foe') === 'bot' && foe ? holoBlast(at, charge, [foe], 0) : [];
  blastFx = { at, R, age: 0 };
  netBlast = { at: foldPoint(at), r: R, until: t + 0.25 };
  banked = 0;
  dashReadyAt = t + BLAST_COOLDOWN;
  say(hits.length ? `blast caught them (r ${R.toFixed(2)})`
                  : `blast, radius ${R.toFixed(2)}`);
}

/**
 * Drop a copy of yourself out of the last few seconds of your own movement.
 *
 * The trail is already there - the finite-light-speed mode keeps it so the
 * shader can draw where you WERE. This reads the same ring, hands it to the
 * decoy, and the decoy walks that beat on a loop until it expires.
 *
 * It is drawn with the player's own material on purpose. In a compact manifold
 * your images already stand one cell away down every sightline, so an opponent
 * looking at you is looking at a dozen of you already: one more, moving the
 * way you move, is not a costume, it is genuinely the same thing to look at.
 */
function dropDecoy() {
  const t = nowSec();
  if (t < decoyReadyAt) return;
  // The last ~3 seconds, oldest first, which is what plantDecoy plays forward.
  const n = Math.min(SELF_HIST, Math.round(3.0 / HIST_DT));
  const pts = [];
  for (let i = n - 1; i >= 0; i--) pts.push(trail[i]);
  if (!plantDecoy(pts, HIST_DT)) return;
  decoyReadyAt = t + DECOY_COOLDOWN;
  say('decoy dropped - it walks your last three seconds');
}

/** Go back to where you were, along your own path. */
function doRecall() {
  const t = nowSec();
  if (t < recallReadyAt) return;
  const q = recallTarget(trail, worldSDF, HIST_DT);
  if (!q) { say('nowhere safe to recall to', 1.2); return; }
  const moved = dist(point(player), q);
  player = warpTo(player, q);
  vel = [0, 0, 0];
  spin = [0, 0, 0];
  // The rope is anchored where you were standing a moment ago and the recall
  // has just moved you several units; keeping it would be a yank, not a swing.
  grapple = null;
  recallReadyAt = t + RECALL_COOLDOWN;
  say(`recalled ${moved.toFixed(2)} back down your own path`);
}

/** Shut a lane with a pane of geodesic plane. */
function doCut() {
  const t = nowSec();
  if (t < cutReadyAt) return;
  placeCut(player, cameraBasis().fwd, worldSDF);
  cutReadyAt = t + CUT_COOLDOWN;
  say(`pane up for ${CUT_LIFE.toFixed(0)}s`);
}

/** Trade places with the grapple hook. */
function doSwap() {
  const t = nowSec();
  if (t < swapReadyAt) return;
  if (!grapple) { say('no rope to swap with', 1.2); return; }
  const r = anchorSwap(grapple, player);
  if (!r) { say('too close to the anchor to swap', 1.2); return; }
  const moved = dist(point(player), r[1]);
  player = r[0];
  grapple.anchor = r[1];
  swapReadyAt = t + SWAP_COOLDOWN;
  say(`swapped ${moved.toFixed(2)} with the anchor`);
}

// --- projection ---------------------------------------------------------

/**
 * Point -> clip space, in curved space.
 *
 * There is no projection matrix to multiply by: which pixel a point lands on
 * is decided by which GEODESIC reaches it, so the projection is the log map.
 * logTo gives the direction to set off in, in frame components; the camera
 * basis then reads off screen coordinates exactly as the shader's ray
 * construction does, run backwards.
 *
 * This is why the rope draws as a visible curve. It is not a decorative
 * bend — it is where the rope actually is.
 */
function project(q, basis) {
  // The SAME log the camera is aimed with, so a gate drawn at the centre of
  // the screen really is the one the crosshair is on. In H^2 x R that is a
  // different function on a different form; using the hyperbolic one on a
  // product placement draws the course somewhere it is not.
  const lv = sphereFloorWorld() ? S2R.logTo(player, q)
    : productWorld() ? H2R.logTo(player, q)
      : nilWorld() ? NIL.logTo(player, q)
        : flatWorld() ? E3T.logTo(player, q) : logTo(player, q);
  const m = Math.hypot(lv[0], lv[1], lv[2]);
  if (m < 1e-9) return null;
  const u = [lv[0] / m, lv[1] / m, lv[2] / m];
  const f = u[0] * basis.fwd[0] + u[1] * basis.fwd[1] + u[2] * basis.fwd[2];
  if (f <= 0.02) return null;                    // behind the eye
  const r = u[0] * basis.right[0] + u[1] * basis.right[1] + u[2] * basis.right[2];
  const p = u[0] * basis.up[0] + u[1] * basis.up[1] + u[2] * basis.up[2];
  // Inverse of dir = normalize(fwd + uv.x*1.2*right + uv.y*1.2*up), then the
  // uv -> clip mapping from uv = (frag - 0.5*res)/res.y.
  const uvx = r / f / 1.2, uvy = p / f / 1.2;
  return [uvx * 2 * (canvas.height / canvas.width), uvy * 2];
}

/**
 * Where the rope leaves the player: down and to the right of the eye, half a
 * geodesic step away.
 *
 * Not decoration. Drawn from the eye itself the rope is invisible, and not
 * because of a bug: every point on it lies on ONE geodesic through the eye,
 * so they all project to the same pixel. You would be looking exactly down
 * the rope. Offsetting the origin is what gives it something to bend across.
 */
function handPlacement(basis) {
  const d = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    d[i] = basis.fwd[i] * 0.55 + basis.right[i] * 0.62 - basis.up[i] * 0.56;
  }
  const m = Math.hypot(d[0], d[1], d[2]);
  return geodesic(player, [d[0] / m, d[1] / m, d[2] / m], 0.16);
}

function drawLineStrip(pts, color, mode) {
  if (pts.length < 2) return;
  gl.useProgram(lines);
  gl.bindVertexArray(lineVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts.flat()), gl.DYNAMIC_DRAW);
  gl.uniform3fv(UL.color, color);
  gl.drawArrays(mode, 0, pts.length);
}

function drawRope(basis) {
  if (!grapple) return;
  // The drawn rope runs hand -> anchor, a different geodesic from the physical
  // constraint's eye -> anchor. Close enough to read as the same rope, and
  // unlike the physical one it is actually visible.
  const pts = ropePoints(handPlacement(basis), grapple.anchor, 26);
  const strip = [];
  for (const q of pts) {
    const ndc = project(q, basis);
    if (ndc) strip.push(ndc);
  }
  // gl.lineWidth is clamped to 1 nearly everywhere, so thickness comes from
  // drawing the strip a few times nudged by a pixel.
  const dx = 1.6 / canvas.width, dy = 1.6 / canvas.height;
  for (const [ox, oy] of [[0, 0], [dx, 0], [-dx, 0], [0, dy], [0, -dy]]) {
    drawLineStrip(strip.map(([x, y]) => [x + ox, y + oy]), [0.95, 0.62, 0.25], gl.LINE_STRIP);
  }
}

/**
 * The hoops, as line loops.
 *
 * NOT a shader primitive, on purpose. Anything in sceneMap is inlined into the
 * marcher three times and paid for at LINK time, which is the budget that
 * binds here - the one that once took the scene program to 212 seconds. A hoop
 * is a curve, this file already draws curves for the rope, and a line loop
 * costs the compiler nothing at all.
 *
 * Each hoop is drawn at the copy NEAREST the player. A course laid along a
 * closed geodesic wraps the manifold, so most of its hoops are several cells
 * away in coordinates; drawn there they would project to the wrong part of the
 * screen, because the marcher's view teleports at every face and this overlay
 * does not.
 */
function drawCourse(basis) {
  if (!course || !courseOn()) return;
  const me = anyProduct() ? H2R.point(player) : point(player);
  for (let i = 0; i < course.hoops.length; i++) {
    // ON A SPHERE THE FAR GATES ARE THE BIGGEST THINGS ON SCREEN, and an
    // overlay is where that stops being a curiosity and becomes a bug.
    // Apparent size goes like r/sin(d): it is smallest a quarter turn away
    // and grows again after, so a gate near the antipode fills the sky.
    // Drawing a whole lap of twelve put every ring you had already passed,
    // and every one half a world away, across the view as huge concentric
    // circles -- the ones you could not use were the loudest. Three ahead
    // is what a racing line needs and is the only range where r/sin(d) is
    // still doing the ordinary thing.
    if ((racing() || nilWorld()) && (i < (run?.next || 0) || i > (run?.next || 0) + (nilWorld() ? 1 : 2))) continue;
    const taken = run && i < run.next;
    const hoop = course.hoops[i];
    const next = run && i === run.next;
    // A gate you cannot open yet is RED, and that is the whole readout: it
    // says "you have not gone round anything the right way yet" without a word
    // of text. It turns green the moment the meter crosses its threshold.
    const shut = next && !gateOpen(hoop, banked);
    const col = taken ? [0.22, 0.30, 0.26]
      : next
        ? (hoopFlash > 0 ? [0.95, 1.0, 0.75]
          : shut ? [0.95, 0.35, 0.30] : [0.35, 0.95, 0.65])
        : [0.30, 0.55, 0.48];
    const strip = [];
    // No group here, so no nearest copy to look for: a point of H^2 x R has
    // exactly one name. hoopNear would be asking the octagon group about a
    // point that does not satisfy its form.
    // The nearest copy, in EVERY world that has a group -- and the flat one
    // has one, so it needs this too. The reason arrives from the opposite
    // direction there: the hyperbolic marcher teleports at every face and this
    // overlay does not, while the flat marcher never teleports but folds every
    // displacement inside hDist, so what it draws at a coordinate is that
    // coordinate's nearest image. Two mechanisms, one symptom.
    const ring = sphereFloorWorld() ? S2R.gateRing(hoop, 40)
      : productWorld() ? H2R.gateRing(hoop, 40)
        : nilWorld() ? NIL.gateRing(hoop, 40)
          : flatWorld() ? E3T.gateRing(hoop, 40, me)
            : hoopRing(hoopNear(hoop, me), 40);
    for (const q of ring) {
      const ndc = project(q, basis);
      if (ndc) strip.push(ndc);
    }
    if (strip.length < 2) continue;
    const dx = 1.6 / canvas.width, dy = 1.6 / canvas.height;
    for (const [ox, oy] of [[0, 0], [dx, 0], [0, dy]]) {
      drawLineStrip(strip.map(([x, y]) => [x + ox, y + oy]), col, gl.LINE_STRIP);
    }
  }
}

function drawCrosshair() {
  const ax = 0.016 * (canvas.height / canvas.width), ay = 0.016;
  const g = [0.7, 0.85, 0.9];
  drawLineStrip([[-ax * 2, 0], [-ax, 0]], g, gl.LINES);
  drawLineStrip([[ax, 0], [ax * 2, 0]], g, gl.LINES);
  drawLineStrip([[0, -ay * 2], [0, -ay]], g, gl.LINES);
  drawLineStrip([[0, ay], [0, ay * 2]], g, gl.LINES);
}

// --- loop ---------------------------------------------------------------

// Unset until the first frame, because the first frame's clock can run
// BACKWARDS and one negative step is fatal. See below.
let last = null;

function frame(now) {
  // Browsing offline should neither consume a run nor ray-march a covered
  // canvas. Keep connected simulation live; the peer cannot pause with us.
  if (menuBusy || ((optOpen || netOpen || document.hidden) && !netLive())) {
    last = null;
    requestAnimationFrame(frame);
    return;
  }
  // Clamp dt at BOTH ends, and the lower one is not paranoia.
  //
  // requestAnimationFrame hands you the timestamp of the frame it belongs to,
  // and that can predate anything measured after module setup. Building the
  // shader takes the driver about five seconds on a cold load, and the first
  // callback then arrives stamped 145 ms while the clock reads 5100 - a dt of
  // MINUS five seconds. The integrator runs five seconds backwards in a single
  // step, the placement leaves the hyperboloid, and every number afterwards is
  // NaN for the rest of the session: the HUD reads "altitude NaN speed NaN"
  // and nothing responds. Math.min alone does not catch it, because the value
  // is far below the cap, not above it.
  //
  // Starting last at null makes the first frame exactly zero, and the max
  // covers every later clock hiccup - a backgrounded tab, a GPU stall.
  const dt = last === null ? 0 : Math.max(0, Math.min((now - last) / 1000, 0.05));
  last = now;

  applyLook();
  // Roll. Held keys in 'hold' mode; in 'momentum' mode the keys set a rate on
  // keydown and it just keeps turning.
  if (optVal('roll') === 'hold') {
    rollRate = 0;
    if (keys.has('KeyZ')) roll -= ROLL_SPEED * dt;
    if (keys.has('KeyC')) roll += ROLL_SPEED * dt;
  }
  roll += rollRate * dt;
  stepPendulum(dt);
  stepSwing(dt);
  const basis = cameraBasis();
  const reeling = keys.has('ShiftLeft') || keys.has('ShiftRight');

  // Desired horizontal velocity, in frame components. Same convention as the
  // camera: W is (cos yaw, sin yaw), D is (sin yaw, -cos yaw).
  let wx = 0, wy = 0;
  if (keys.has('KeyW')) { wx += Math.cos(yaw); wy += Math.sin(yaw); }
  if (keys.has('KeyS')) { wx -= Math.cos(yaw); wy -= Math.sin(yaw); }
  if (keys.has('KeyD')) { wx += Math.sin(yaw); wy -= Math.cos(yaw); }
  if (keys.has('KeyA')) { wx -= Math.sin(yaw); wy += Math.cos(yaw); }
  const wl = Math.hypot(wx, wy);
  const want = wl > 0 ? [(wx / wl) * WALK_SPEED, (wy / wl) * WALK_SPEED, 0] : [0, 0, 0];

  // Fixed substeps: the rope is a hard constraint, so a long frame integrated
  // in one go visibly jitters.
  const SUB = 4;
  const h = dt / SUB;
  let ropeInfo = null;
  // Free flight in S^3 is a different integrator on a different group, so it
  // takes the substep and nothing else in this loop applies: there is no fold
  // (no quotient), no gravity, no rope, no carried object to keep in range.
  const motion = worldMotionFor(geomKey());
  // The same arrangement for the fall: a different group, a different
  // integrator, and none of the rest of this loop applies. Two factors that
  // do not interact make it the shortest of the three.
  // Both products take the same horizontal input -- a direction in the floor
  // plan, and nothing else -- so they share `h2rWant`. What differs is what
  // the vertical does with it: one falls down a shaft, one runs and jumps.
  // The flat world is the first whose input model is not fixed by the
  // geometry: you WALK in the slab and FLY in the 3-torus, because the 3-torus
  // has no floor left to stand on once the roof is glued to it.
  const motionWant = motion
    ? (motionInput(motion, motionEnv()) === 'flight' ? s3Want(basis) : h2rWant(basis))
    : null;
  for (let i = 0; i < SUB; i++) {
    if (motion) { stepWorldMotion(motion, h, motionWant); continue; }
    const stepFrom = point(player);
    // Two movement models, kept side by side so they can be compared.
    // 'walking' steers the velocity directly; 'rolling' spins a ball up with a
    // torque and lets contact friction turn that into motion. Everything
    // downstream - the integrator, collision, the rope - is identical.
    if (optVal('move') === 'rolling') {
      [vel, spin, slipping] = rollControl(player, vel, spin, want, grounded, h);
    } else {
      vel = control(vel, want, grounded, h);
    }
    vel = drag(vel, h);
    [player, vel] = stepFree(player, vel, h);
    // Through a portal, if the step went through one. The isometry carries the
    // whole placement, so the velocity's FRAME components are untouched and
    // the ambient velocity is transported with it - you come out at the same
    // speed, facing out of the far disc, and nothing has to be re-aimed.
    let wentThrough = false;
    if (optVal('portals') === 'on') {
      const T = portalCrossing(stepFrom, point(player));
      if (T) { player = reorthonormalize(matMul(T, player)); wentThrough = true; }
    }
    if (grapple) {
      const [M2, v2, info] = grappleStep(grapple, player, vel, h, reeling, worldSDF);
      player = M2; vel = v2; ropeInfo = info;
    }
    const [M3, v3, n] = collide(player, vel, worldSDF);
    player = M3; vel = v3;
    grounded = !!n && upness(player, n) > 0.5;
    // Re-pin the frame to gravity. Only when there IS gravity, and only when
    // the camera is asked to stay upright.
    //
    // This was the camera jerking at every face in the open world. There,
    // gravity is forced to none - but the field object was still the PLANE
    // one, so alignUp went on pinning E3 to the plane's up. The dodecahedral
    // generators do not preserve that function (only the octagon's do, which
    // is the whole reason plane gravity is the bounded world's), so crossing a
    // face moved "up" and the view snapped to follow it.
    //
    // With no gravity there is no preferred direction to pin to, and the
    // honest thing is to leave the frame alone: parallel transport, and the
    // view is continuous across every face. Lorentz drift is still repaired,
    // because stepFree reorthonormalizes on its own.
    if (upright()) {
      const [M2, v2, Ri] = alignUp(player, vel);
      player = M2; vel = v2;
      // The spin is a frame-component vector too, so it has to be carried
      // through the same re-pinning or the ball would silently change axis.
      spin = carryFrameVec(Ri, spin);
      // Coming out of a portal, SWING to the new up instead of snapping to it.
      //
      // A portal can hand you a completely different down - walk into one on a
      // wall and come out of one on the floor - and alignUp then re-pins the
      // frame in a single substep, which reads as the camera being yanked.
      // What it should do is what a head does: keep looking where it was and
      // come round to the new vertical over the next second.
      //
      // tilt already means exactly that, "how far the camera hangs from the
      // pinned up", and the spring that returns it to zero is already there.
      // So take where the OLD up ended up in the new frame and start the tilt
      // there: the first rendered frame is unchanged, and the spring does the
      // rest. carryFrameVec(Ri, up) is that old up, since Ri is precisely the
      // rotation alignUp just applied.
      if (wentThrough) kickSwing(Ri);
    }
    // Fold the player back into the fundamental octagon. Space is H^3/Gamma,
    // so this is not teleporting them anywhere: it is the same point of the
    // manifold, named by a different representative, and the view does not
    // change by so much as a pixel.
    const [folded, g, crossed] = reduceToDomain(player);
    let bankFrom = stepFrom;
    if (crossed !== 0) {
      player = folded;
      // The anchor is a point of the universal cover, so it has to be carried
      // by the SAME group element the player was folded by. Snapping it to
      // whichever copy is nearest is wrong: the rope would change length in a
      // single frame and the constraint would either yank or let go. That was
      // the "grapple cuts off at a border" bug.
      if (grapple) grapple.anchor = apply(g, grapple.anchor);
      // Same for the beacon: it is a point of the universal cover too, and
      // following one lift is what stops gravity flipping at a face.
      carryBeacon(g);
      // And the portals, which are placements of the universal cover.
      carryPortals(g);
      // And anything the player has built, or thrown, or left behind. Every
      // one of these is a point of the universal cover and every one has to
      // move by the SAME element - not be snapped to the nearest copy.
      carryBlock(g);
      carryCut(g);
      carryDecoy(g);
      carryBoomerang(g);
      carryTrail(g);
      // The course is a carried object like all of those: its hoops are points
      // of the universal cover and its normals are 4-vectors at them, so both
      // move by the SAME g. Snapping to the nearest copy would slide a gate
      // out from under a player mid-flight.
      if (course) carryCourse(course, g);
      // And the trail of past positions - not by moving it, but by recording
      // WHICH fold this was, so the shader can interpolate along the real path
      // instead of across the jump. See linkHistory.
      foldHistory(g);
      crossings += crossed;
      // Carry the step's start point through the same fold, or the swept
      // angle would jump by whatever the fold moved us.
      bankFrom = apply(g, stepFrom);
    }
    stepFoe(h);
    // Two bodies cannot occupy the same place. Done on the orbit, so it agrees
    // with what is on screen even when the two are named a cell apart.
    if (foe && foe.health > 0 && optVal('foe') !== 'off') {
      const b = bump(player, vel, foe.M, foe.vel);
      if (b) {
        player = b[0]; vel = b[1];
        // Over a network the other body belongs to the other end, and it is
        // running this same push against its own copy of me. Taking only my
        // half means we each move out of the way once; shoving my copy of them
        // as well would fight the next packet and read as them jittering.
        if (optVal('foe') === 'bot') { foe.M = b[2]; foe.vel = b[3]; }
      }
    }
    banked += sweptArea(bankFrom, point(player));
    // The hoop test rides on exactly the segment the holonomy meter uses, and
    // that is not a convenience: bankFrom is the substep's start point CARRIED
    // THROUGH ANY FOLD that happened during it, so the two ends are in the
    // same chart. Testing raw start against folded end would report a flight
    // right across the room every time the player crossed a face, and every
    // hoop in between would count at once.
    if (run && run.phase === PHASE.RUNNING) {
      // banked is passed in because a charge gate is shut until the holonomy
      // meter reads far enough, WITH THE RIGHT SIGN. Flying through a shut
      // gate is not blocked - a solid disc across a corridor you are swinging
      // down at speed is a wall you hit by accident - the pass simply does not
      // count, and you go round again the other way.
      if (runStep(run, h, bankFrom, point(player), banked) >= 0) hoopFlash = 0.35;
    }
    // Keep the carried objects in range. Without this they drift with the
    // player and their coordinates run away; see settleCarried.
    settleCarried(point(player));
  }

  // 'unglued' is really 'has no HYPERBOLIC fold', and the flat world made that
  // distinction matter: E^3/Lambda emphatically HAS a group, and it is still
  // wrong to send its points through `foldPoint`, which reduces against the
  // octagon or dodecahedral generators. A flat point put through those comes
  // back as nonsense -- the same class of mistake as handing the spherical
  // marcher a Lorentz matrix, and it showed up the same way: the self body
  // drew at a plausible-looking wrong place, and only at the spawn was it
  // right, because the flat origin and the hyperbolic origin happen to have
  // identical coordinates.
  //
  // The flat build needs no folding here at all: its shader wraps every
  // displacement inside hDist, so an unfolded centre draws in the right place,
  // and `foldPlacement` in the step keeps the coordinates bounded anyway.
  const unglued = adapterWorld();
  const p0 = sphericalWorld() ? S3G.point(player)
    : anyProduct() ? H2R.point(player) : point(player);
  // The folded copy and the raw one are the SAME point when there is no group
  // to fold by, which is the whole of what "no quotient" means here.
  pushHistory(unglued ? p0 : foldPoint(p0), p0, dt);
  // BIND THE PROGRAM FIRST. gl.uniform* writes to whatever program is current,
  // and at the top of a frame that is still the LINE program, left bound by
  // last frame's rope and crosshair. Uniforms set here before this call went
  // to the wrong program and were silently dropped - which is the whole reason
  // the boomerang was invisible: uBoomOn was never once set on the scene
  // program, so it sat at its default of zero and the marcher never drew it.
  // Nothing warns about this. The uniform simply does nothing.
  gl.useProgram(scene);
  gl.uniform1f(U.race, racing() ? 1 : 0);

  // --- age everything, then say what to draw ----------------------------
  //
  // The boomerang gets the world and the player's CURRENT position, which is
  // the whole of "it bounces and it comes back to where you are now": it
  // rebounds off whatever the sdf says it hit, and on the return leg it steers
  // at the nearest lift of the point handed in here. Neither needs gravity and
  // neither has ever had any.
  // These are keyed by OWNER now, and the two halves are different jobs.
  //
  // AGE everyone's: a block a second character placed has to form and expire
  // on its own clock, and nothing else advances it. Then READ owner 0's - the
  // local player's - because that is the one this HUD and these markers are
  // about. Ageing owner 0 twice is the bug to avoid here, so the singular
  // step calls are gone entirely.
  //
  // The throw is the exception and stays singular: its return leg steers at a
  // home position, and each owner would need their own. Only the local player
  // throws so far.
  const boomAt = unglued ? null : boomerangStep(dt, worldSDF, p0, 0);
  blockStepAll(dt);
  decoyStepAll(dt);
  cutStepAll(dt);
  const blk = activeBlock(0);
  const decoyAt = decoyPoint(0);
  const cut = activeCut(0);
  // The gate you just took lights up for a third of a second.
  if (hoopFlash > 0) hoopFlash = Math.max(0, hoopFlash - dt);
  if (blastFx) {
    blastFx.age += dt;
    if (blastFx.age > BLAST_FX) blastFx = null;
  }

  markN = 0;
  cutN = 0;
  if (grapple) marker(grapple.anchor, 0.06, 10);
  const bcn = activeBeacon();
  if (bcn) marker(bcn, 0.10, 11);
  // Same near cutoff, and for the same reason: a boomerang leaves your hand
  // AT your hand, so for the first two or three frames of every throw the
  // eye is inside it and the screen goes flat red.
  if (boomAt) marker(boomAt, BOOM_R, 15, 0, 0.2);
  if (blk && optVal('build') === 'on') marker(blk.at, BLOCK_R, blockSolid() ? 17 : 18);
  // The decoy wears the player's own material, and that is the point of it.
  // The near cutoff: a decoy comes off the oldest end of your own trail, so
  // standing still and dropping one puts it exactly where you are, and a
  // camera inside a sphere fills the screen with one flat colour.
  if (decoyAt) marker(decoyAt, PLAYER_R * 1.25, 12, 0, 0.35);
  if (blastFx) {
    // A blast is centred on you and starts at radius zero, so without the
    // cutoff its shell passes through the eye on the frame it goes off.
    marker(blastFx.at, blastFx.R * Math.min(1, blastFx.age / BLAST_FX), 20, 1, 0.2);
  }
  if (cut) markCut(cut.at, cut.N);
  // The opponent, and everything of theirs. FOLDED like every other world
  // point the shader is given: an unfolded one is compared against folded
  // geometry and lands in the wrong copy.
  if (foe && foe.health > 0 && optVal('foe') !== 'off') {
    marker(point(foe.M), PLAYER_R * 1.25, 16);
    gl.uniform1f(U.foeHurt, 1 - foe.health / MAX_HEALTH);
  }
  if (remote && optVal('foe') === 'network') {
    if (remote.boom) marker(remote.boom, BOOM_R, 15, 0, 0.2);
    if (remote.blockState > 0.5) marker(remote.block, remote.blockR, remote.blockState > 1.5 ? 17 : 18);
    if (remote.decoy) marker(remote.decoy, PLAYER_R * 1.25, 16, 0, 0.35);
    if (remote.blast) marker(remote.blast.at, remote.blast.r, 20, 1, 0.2);
    if (remote.cut) markCut(remote.cut.at, remote.cut.N);
  }
  gl.uniform1i(U.markN, markN);
  gl.uniform4fv(U.mark, markPt);
  gl.uniform4fv(U.markAlt, markAlt);
  gl.uniform4fv(U.markInfo, markInfo);
  gl.uniform1i(U.cutN, cutN);
  gl.uniform4fv(U.cutNorm, cutNormBuf);
  gl.uniform4fv(U.cutAt, cutAtBuf);
  gl.uniform4fv(U.cutNormAlt, cutNormAltBuf);
  gl.uniform4fv(U.cutAtAlt, cutAtAltBuf);
  gl.uniform1f(U.cutR, CUT_R);
  gl.uniform1f(U.cutT, CUT_THICK);
  netSend(now * 0.001);
  gl.bindVertexArray(quadVao);
  gl.uniform2f(U.res, canvas.width, canvas.height);
  gl.uniformMatrix4fv(U.player, false, new Float32Array(player));
  // Fold the swing back into the three angles the shader builds its basis
  // from, so the marcher and cameraBasis cannot disagree.
  const [viewYaw, viewPitch, viewRoll] = shaderAngles();
  gl.uniform1f(U.yaw, viewYaw);
  gl.uniform1f(U.pitch, viewPitch);
  gl.uniform1f(U.roll, viewRoll);
  gl.uniform1f(U.steps, marchSteps);
  // Finite light speed only matters if the shader can see a clock.
  gl.uniform1f(U.time, LIGHT_C[opts.light.i] > 0 ? now * 0.001 : -1.0);
  const openWorld = optVal('mode') !== 'floor (2D wrap)';
  gl.uniform1f(U.open, openWorld ? 1 : 0);
  gl.uniform1f(U.solid, openWorld ? 1 : 0);
  // Curvature is NOT uploaded here. It is a #define, so it is baked into which
  // program is bound, and `useCurvature` in applyOptions is what selects that.
  // It started life as a uniform and cost 1.6 s of link time in the build that
  // is always made; see the note beside the define in shader.js.
  gl.uniform1f(U.zoom, zoom);
  gl.uniform1f(U.edges, optVal('edges') === 'show' ? 1 : 0);
  // Zooming in is asking to see further, so the fog has to back off and the
  // range has to go up with it - otherwise the magnified view is a magnified
  // wall of fog and the zoom looks broken. It is cheap: the cone is narrower
  // by the same factor, so the rays that remain are all pointed at what you
  // are actually looking at.
  const zoomed = Math.min(zoom, 4);
  // The 3D world needs much more fog. Its cell is small and has twelve faces,
  // so a sightline crosses far more copies than the octagon's does, and the
  // far field becomes a mass of sub-pixel detail that no amount of shading
  // will make readable. Fading it out is the honest answer; supersampling
  // handles what is left near the horizon.
  // Fog is a tactical setting here, not only a look: it is what decides how
  // many copies of the room you can see, and so how far you can see someone
  // coming. Thin makes the repetition legible; thick makes it a knife fight.
  // H^2 x R needs a FAR longer range and much less fog than either compact
  // world, and the reason is the flat factor. In H^3 and S^3 everything is a
  // cell or two away because the manifold comes back round to itself; here the
  // shaft is 44 units deep and the whole point of standing on the deck is
  // seeing down it. Range is affordable because the world is cheap - thirty
  // vertical cylinders, each one inner product, no folding and no straddle
  // copy - so the marcher's cost per step is a fraction of the hyperbolic
  // level's. Note also that looking DOWN the shaft is looking along the flat
  // factor, where distance is Euclidean and there is no sinh to shrink things
  // away; the far gates are small because they are far, not because the
  // geometry ate them.
  const product = productWorld();
  // S^2 x R needs a range of about one lap and no more: nothing is further
  // away than pi horizontally, because the floor is a sphere. Past that a ray
  // is going up, where there is nothing. Cheap, and it makes the far side of
  // the world genuinely visible, which is the point of standing on a sphere.
  const sphereFloor = sphereFloorWorld();
  // THE FLAT WORLD WANTS THE LEAST FOG AND THE LONGEST RANGE OF ANY OF THEM,
  // and that is the whole visual argument for building it. Down the clear
  // street the copies of the room recede like 1/d rather than like e^{-2r}, so
  // where the octagon world's second copy is already a speck this one shows
  // ten of them in a straight line, all the same size, all lit the same. It is
  // the cheapest and clearest picture of what a quotient is that this project
  // has, and it costs one uncluttered corridor and a range of 30.
  const flat = flatWorld();
  const base = (nilWorld() ? 0.025 : product ? 0.030 : sphereFloor ? 0.075 : flat ? 0.055
    : openWorld ? 0.45 : 0.20)
    * { normal: 1, thin: 0.55, thick: 1.9 }[optVal('fog')];
  gl.uniform1f(U.fog, base / Math.sqrt(zoomed));
  gl.uniform1f(U.ao, optVal('shading') === 'flat' ? 0 : 1);
  gl.uniform1f(U.maxT,
    (nilWorld() ? 70.0 : product ? 60.0 : sphereFloor ? 12.0 : flat ? 30.0 : openWorld ? 10.0 : 14.0)
    * Math.sqrt(zoomed));
  // Portals, FOLDED, for the same reason every other world point is: the
  // marcher folds its own samples, so an unfolded placement would be compared
  // against geometry in a different copy - and once it has drifted a few cells
  // the 32-bit distance to it collapses and every pixel reads as a hit.
  // The isometry is built from the folded pair, because that is the map the
  // marcher needs: it works entirely in domain coordinates.
  const live = optVal('portals') === 'on' && portalsLive();
  gl.uniform1f(U.portalOn, live ? 1 : 0);
  gl.uniform1f(U.portalR, PORTAL_R);
  if (live) {
    const [pa] = reduceToDomain(getPortals()[0]);
    const [pb] = reduceToDomain(getPortals()[1]);
    gl.uniformMatrix4fv(U.portalA, false, new Float32Array(pa));
    gl.uniformMatrix4fv(U.portalB, false, new Float32Array(pb));
    gl.uniformMatrix4fv(U.portalTA, false, new Float32Array(portalMap(pa, pb)));
    gl.uniformMatrix4fv(U.portalTB, false, new Float32Array(portalMap(pb, pa)));
  }
  linkHistory();
  gl.uniform4fv(U.selfHist, selfHist);
  gl.uniform4fv(U.selfHistB, selfHistB);
  gl.uniform1f(U.selfLip, selfLip);
  gl.uniform1f(U.histDt, HIST_DT);
  gl.uniform1f(U.lightC, LIGHT_C[opts.light.i]);
  // Drawn a little larger than the collision radius, because the whole point
  // of having a body is being able to SEE your own copies lagging behind you
  // and a sphere the size of the hitbox is a speck at one cell's distance.
  // Both are smaller than they were - PLAYER_R went 0.10 -> 0.07 and this
  // multiplier 1.5 -> 1.25, so the drawn ball is 0.088 against 0.15.
  // Hidden in the spherical world for now. The body is drawn from selfHist,
  // which is a ring of FOLDED positions and a set of fold elements linking
  // them - machinery that exists because the hyperbolic marcher never leaves
  // its fundamental domain. S^3 has no domain to leave, so the history needs a
  // different (simpler) shape, and until it has one an unfolded history would
  // draw the body somewhere it is not. Worth doing: in S^3 light goes all the
  // way round, so you would see yourself down every sightline without needing
  // a quotient at all.
  gl.uniform1f(U.selfR, sphericalWorld() ? 0 : PLAYER_R * 1.25);
  // Supersampling is four marches a pixel, so only at high quality.
  gl.uniform1f(U.superSample, optVal('quality') === 'high' ? 1 : 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  drawRope(basis);
  drawCourse(basis);
  drawCrosshair();

  const f = (n) => n.toFixed(2).padStart(6);
  // A meter drawn in text, because the HUD is text and a canvas overlay for
  // two bars would be a whole second render path.
  const bar = (frac, n) => {
    const k = Math.max(0, Math.min(n, Math.round(frac * n)));
    return '[' + '#'.repeat(k) + '.'.repeat(n - k) + ']';
  };
  const speed = Math.hypot(vel[0], vel[1], vel[2]);
  const p = p0;
  // The spherical world gets its own readout rather than a hyperbolic one
  // computed on a placement that does not describe it. `altitude` is
  // asinh(p.z), a distance to a floor plane that does not exist here, and
  // `energy` is a potential from the same field: both printed 0.00, and both
  // were meaningless rather than merely zero.
  if (racing()) {
    hud.textContent = `ORBITAL SPRINT / S2 x R\n`
      + `lap ${Math.min(RACE_LAPS, 1 + Math.floor((run?.next || 0) / RACE_GATES))}`
      + `/${RACE_LAPS}`
      + ` · checkpoint ${Math.min(RACE_GATES * RACE_LAPS, (run?.next || 0) + 1)}`
      + `/${RACE_GATES * RACE_LAPS}\n`
      + (run?.phase === PHASE.DONE
        ? `FINISHED ${formatTime(run.t)} · best ${formatTime(run.best)}\n`
        : `time ${formatTime(run?.t || 0)}\n`)
      + `speed ${Math.hypot(vel[0], vel[1]).toFixed(2)} / ${RACE_SPEED}\n`
      + `turbo ${bar(racer.charge, 16)} ${(racer.charge * 100).toFixed(0)}%`
      + `${racer.boost > 0 ? ' BOOST!' : racer.drift > 0 ? ' CHARGING DRIFT'
        : racer.charge >= BOOST_COST ? ' ready — X to boost' : ' need 30%'}\n`
      // THE OLD LINE HERE SAID "jump earlier or go around", and going around
      // is a thing the geometry does not permit: a hurdle is 0.23 of arc in a
      // road half-width of 0.29, so the on-road gap beside one is 0.060 and
      // the player is 0.10 across. Every driver who read it drove into the
      // side of the hurdle and stopped there for ever. What is true is that a
      // hurdle needs TURBO -- measured, cruising gives 0.413 of clear arc
      // against the 0.66 a hurdle needs, and turbo gives 0.728 -- or a detour
      // off the tarmac at 40% speed, which costs 9.91s a lap against 6.65.
      + (racer.impact > 0
        ? 'HURDLE HIT — you cannot clear one at cruising speed.\n'
          + '   Drift to charge, X to boost, then Space. Or leave the road.\n'
        : '')
      + '\nW accelerate · S brake/coast · A/D steer · Shift drift\n'
      + 'X turbo · Space jump · R / K restart · O worlds\n'
      + 'Stay on the gold road. Green gates count in order.\n'
      + 'A HURDLE NEEDS TURBO: drift the turns, boost, then jump.\n'
      + 'Or go round it off the road, at 40% speed.';
    requestAnimationFrame(frame);
    return;
  }
  if (sphereFloorWorld()) {
    const p = S2R.point(player);
    const gate = run && course ? course.hoops[run.next] : null;
    const round = S2R.horizDist(p, S2R.ORIGIN);
    const spire = S2R.horizDist(p, S2R.S2R_SPIRE.c);
    hud.textContent =
      `S^2 x R   a SPHERICAL floor plan and a Euclidean height
`
      + `altitude ${f(p[2])}   speed ${f(Math.hypot(vel[0], vel[1]))} / ${f(S2R.S2R_WALK)}`
      + `   ${S2R.grounded(player, S2R.s2rSDF) ? 'on ground' : 'airborne'}
`
      + `from the start ${f(round)} of ${S2R.S2R_ANTIPODE.toFixed(2)} to the far side`
      + `   ${bar(Math.min(1, round / S2R.S2R_ANTIPODE), 12)}
`
      + (run && run.phase === PHASE.RUNNING
        ? `lap ${formatTime(run.t)}  ${bar(runProgress(run), 12)}  `
          + `gate ${run.next + 1}/${course.hoops.length}
`
        : run && run.phase === PHASE.DONE
          ? `LAP DONE ${formatTime(run.t)}${run.best !== null ? `   best ${formatTime(run.best)}` : ''}   K to run again
`
          : `K to start a lap
`)
      + `
RUN DEAD STRAIGHT AND YOU COME BACK HERE, after ${S2R.S2R_LAP.toFixed(2)}
`
      + `units, with no steering and NO QUOTIENT. The bounded world's hoop
`
      + `course does the same thing because a GROUP glues the room to itself;
`
      + `this floor closes up because it is a sphere. Same run, opposite reason.

`
      + `THE SPIRE IS ${f(spire)} AWAY and on the lap it never changes: it is
`
      + `the pole of the course circle, exactly a quarter turn from every gate,
`
      + `so running straight makes it sweep a full turn around you.

`
      + `YOU CANNOT ESCAPE BY RUNNING STRAIGHT. Any two great circles meet,
`
      + `twice, always -- so two people running dead straight from one place
`
      + `meet again on the far side whatever angle they chose. On the H^2
`
      + `floor almost no two geodesics meet at all.

`
      + `THE FAR PILLARS ARE 6x THE DISTANCE AND THE SAME APPARENT SIZE:
`
      + `size goes like r/sin(d), and sin(0.45) = sin(pi - 0.45) exactly.

`
      + `WASD run - space jump - mouse look - K restart the lap - O options`;
    requestAnimationFrame(frame);
    return;
  }
  if (flatWorld()) {
    const p = point(player);
    const cell = E3T.foldPoint(p, motionEnv().open ? E3T.MODE.CUBE : E3T.MODE.SLAB);
    const open = motionEnv().open;
    hud.textContent =
      `E^3 / LATTICE   ${open ? 'the 3-TORUS: all three axes glued'
        : 'the SLAB: x and y glued, the height a real line'}\n`
      + `cell ${f(cell[0])} ${f(cell[1])} ${f(cell[2])}   of ${E3T.CELL[0]} across`
      + `   speed ${f(Math.hypot(vel[0], vel[1], vel[2]))}\n`
      + (run && run.phase === PHASE.RUNNING
        ? `run ${formatTime(run.t)}  ${bar(runProgress(run), 12)}  `
          + `gate ${run.next + 1}/${course.hoops.length}\n`
        : run && run.phase === PHASE.DONE
          ? `DONE ${formatTime(run.t)}`
            + `${run.best !== null ? `   best ${formatTime(run.best)}` : ''}   K to run again\n`
          : open ? `K to fly the (1,1,1) course\n` : `O to switch worlds\n`)
      + `\nTHIS IS THE CONTROL, and it is the only world here where a PORTED\n`
      + `MAP IS THE MAP. port.js needs three embeddings and a developing map\n`
      + `because there is no isometric embedding between curvatures; port a\n`
      + `flat plan into flat space and every length and angle survives.\n\n`
      + (open
        ? `EVERY RATIONAL DIRECTION COMES BACK. The closed geodesics here are\n`
          + `DENSE -- aim anywhere and you are close to one -- and they come in\n`
          + `continuous families, every parallel translate closing at the same\n`
          + `length. The octagon world has exactly EIGHT, all rigid, all of\n`
          + `length 3.06, and every other direction never returns. That is\n`
          + `Mostow rigidity showing up as a fact about level design.\n\n`
          + `The rods run along the three axes and each meets its own image\n`
          + `across the faces, so one rod is an infinite straight rod.\n\n`
          + `GRAVITY HERE HAS A FORCE AND NO POTENTIAL: d/dz survives every\n`
          + `lattice translation, z does not survive any. Switch gravity on and\n`
          + `you fall through the floor, arrive through the roof, and arrive\n`
          + `FASTER -- ${f(E3T.fallLap(0))} after one lap, ${f(E3T.fallLap(E3T.fallLap(0)))} after two, for ever.\n\n`
        : `LOOK DOWN THE STREET. The copies recede like 1/d, so a dozen of\n`
          + `them stand in a straight line all the same size. In the octagon\n`
          + `world e^{2r} makes the second copy a speck. Same quotient, same\n`
          + `sized room; the falloff is the whole difference.\n\n`
          + `The gold square is the fundamental domain. Cross it and you are\n`
          + `in the same room -- and nothing else on screen would tell you.\n\n`)
      + `WASD ${open ? 'fly' : 'walk'} - ${open ? 'space/shift up and down' : 'space jump'}`
      + ` - mouse look - K course - O worlds`;
    requestAnimationFrame(frame);
    return;
  }
  if (productWorld()) {
    const z = H2R.point(player)[2];
    const gate = run && course ? course.hoops[run.next] : null;
    hud.textContent = `THE DROPPER / H2 x R\n`
      + `attempt ${dropDeaths + 1} · deaths ${dropDeaths}\n`
      + (dropFlash > 0 ? 'CRASH — back to the top!\n' : '')
      + (run?.phase === PHASE.DONE
        ? `FINISHED ${formatTime(run.t)} · best ${formatTime(run.best)}\n`
        : `time ${formatTime(run?.t || 0)} · gate ${(run?.next || 0) + 1}/${course?.hoops.length || 5}\n`)
      + `height ${z.toFixed(1)} · fall ${(-vel[2]).toFixed(1)}\n`
      + (gate ? `opening ${H2R.horizDist(H2R.point(player), gate.at).toFixed(2)} away\n` : '')
      + '\nFly through the green rings, in order.\n'
      // The columns are SCENERY you bounce off, not hazards. This line used
      // to say a column kills you, which was true for one commit and made
      // the course unfinishable at every input: the gate ring stands only
      // 0.220 clear of one, having been searched on the footing that they
      // were harmless.
      + 'Between each pair of gates is a solid BAFFLE with one hole,\n'
      + 'on the line from this gate to the next: the gates say WHERE,\n'
      + 'the baffles say you were ON THE WAY. Hit one and you restart.\n'
      + 'The columns are solid but harmless -- you bounce off them.\n'
      + 'WASD steer · mouse look · R / K retry · O worlds';
    requestAnimationFrame(frame);
    return;
  }
  if (geomKey() === 'sol' || geomKey() === 'sl2r') {
    hud.textContent = `${geomKey() === 'sol' ? 'SOL / STRETCH CHAMBER' : 'SL2R / TWIST CHAMBER'}\n`
      + `speed ${speed.toFixed(2)}\n\n`
      + (geomKey() === 'sol' ? 'Rise and descend: the two horizontal directions change scale oppositely.\n'
        : 'Horizontal motion couples to the unwrapped fibre direction.\n')
      + 'Explore the grid and fly around the solid blocks.\n'
      + 'WASD fly · space/shift rise/descend · mouse look · R reset · O worlds';
    requestAnimationFrame(frame);
    return;
  }
  if (nilWorld()) {
    hud.textContent = `NIL / SPIRAL CLIMB\n`
      + (run?.phase === PHASE.DONE
        ? `FINISHED ${formatTime(run.t)} · best ${formatTime(run.best)}\n`
        : `time ${formatTime(run?.t || 0)} · gate ${(run?.next || 0) + 1}/${NIL.NIL_GATES}\n`)
      + `height ${NIL.coords(player)[2].toFixed(1)} / ${NIL.NIL_H} · speed ${speed.toFixed(2)}\n\n`
      + 'Follow the green gates around the spire. Steer as you climb.\n'
      + 'The helix climbs 60 units in 26.7 units of travel.\n'
      + 'Columns are solid; the finish beacon is passable.\n'
      + 'WASD fly · space/shift rise/descend · mouse look · R/K retry · O worlds';
    requestAnimationFrame(frame);
    return;
  }
  if (sphericalWorld()) {
    const lap = s3LapFraction(player, s3Start || player);
    hud.textContent =
      `SPHERICAL   S^3, curvature +1\n`
      + `speed ${f(speed)}   a lap is ${S3_LAP.toFixed(2)}, so straight ahead brings\n`
      + `you back here in ${(S3_LAP / Math.max(speed, 1e-6)).toFixed(1)} s\n`
      + `from the start ${f(lap * Math.PI)}  ${bar(Math.min(1, lap), 12)}  `
      + `${lap > 0.98 ? 'AT THE ANTIPODE: every direction leads home'
        : `${(lap * 100).toFixed(0)}% of the way to the antipode`}\n`
      + `\nNO QUOTIENT. The hyperbolic worlds are compact because a group\n`
      + `glues one cell to itself; this one is compact on its own, so there\n`
      + `is no domain, no folding, and no gold seam anywhere in it.\n\n`
      + `THINGS GET BIGGER AS THEY RECEDE past a quarter turn - apparent\n`
      + `size goes like r / sin(t), and sin peaks at pi/2. The small ring\n`
      + `of six is NEARER than the big ring of eight.\n\n`
      + `WASD fly - space up - shift down - mouse look\n`
      + `O options - R reset - Curvature back to hyperbolic for the game`;
    requestAnimationFrame(frame);
    return;
  }
  hud.textContent =
    `altitude ${f(altitude(p))}   speed ${f(speed)}   energy ${f(energy(player, vel))}\n` +
    `horizontal ${f(Math.hypot(vel[0], vel[1]))} / ${f(FLY_SPEED)} ${Math.hypot(vel[0], vel[1]) > FLY_SPEED ? '<< FLYING: geometry is lifting you' : ''}\n` +
    `${grounded ? 'on ground' : 'airborne '}   gravity ${optVal('field')}   world ${optVal('mode')}
   faces crossed ${crossings}   zoom ${zoom.toFixed(1)}x${zoom > 1.02 ? '' : '  (scroll wheel)'}\n` +
    `light ${optVal('light')}${LIGHT_C[opts.light.i] > 0 ? ' \u00b7 your distant copies lag behind you' : ''}\n` +
    `movement ${optVal('move')}${optVal('move') === 'rolling' ? ` \u00b7 surface ${f(rollSpeed(spin))} / ${f(ROLL_TOP)}${slipping ? '  SLIPPING' : ''}` : ''}\n` +
    // The bank is SIGNED, and under 'sign decides' the sign is the ability:
    // which way you went round something is which key you have charged.
    `banked holonomy ${f(banked * 57.2958)} deg ${banked >= 0 ? '(+)' : '(-)'}`
      + `   ${optVal('holo') === 'sign decides'
        ? (banked >= 0 ? 'Q = DASH   (circle the other way for a blast)'
                       : 'Q = BLAST  (circle the other way for a dash)')
        : `Q = ${optVal('holo').replace(' only', '')}`}\n` +
    (grapple
      ? `rope ${f(ropeInfo ? ropeInfo.dist : 0)} / ${f(grapple.length)}  ${ropeInfo && ropeInfo.taut ? 'TAUT' : 'slack'}${reeling ? '  REELING' : ''}\n`
      : 'rope --\n') +
    (optVal('boomerang') !== 'off'
      ? `boomerang ${activeBoomerang()
          ? `OUT ${bar(boomerangProgress(), 10)}`
          : `ready \u00b7 B  (${optVal('boomerang')})`}\n`
      : 'boomerang off \u00b7 O to switch it on\n') +
    (courseOn() && run
      ? `course    ${run.phase === PHASE.RUNNING
            ? `${formatTime(run.t)}  ${bar(runProgress(run), 10)}  `
              + `gate ${run.next + 1}/${course.hoops.length}`
            : run.phase === PHASE.DONE
              ? `FINISHED ${formatTime(run.t)}`
              : 'ready \u00b7 press K'}`
          + `${run.best !== null ? `   best ${formatTime(run.best)}` : ''}\n`
        // A shut gate has to say what would open it, or a red ring is just a
        // red ring. The sign is the instruction: circle one way or the other.
        + ((run.phase === PHASE.RUNNING && course.hoops[run.next]
            && course.hoops[run.next].needs)
          ? `          gate needs ${course.hoops[run.next].needs > 0
                ? 'COUNTER-CLOCKWISE' : 'CLOCKWISE'} `
            + `${Math.abs(course.hoops[run.next].needs).toFixed(1)}  `
            + `${bar(gateProgress(course.hoops[run.next], banked), 10)}  `
            + `${gateOpen(course.hoops[run.next], banked) ? 'OPEN' : 'SHUT'}`
            + `${run.refused ? `  (${run.refused} refused)` : ''}\n`
          : '')
      : '') +
    (optVal('build') === 'on'
      ? `build     ${activeBlock()
          ? (blockSolid()
            ? `SOLID ${bar(1 - (activeBlock().age - BLOCK_DELAY) / BLOCK_LIFE, 10)}`
            : `forming ${bar(blockForming(), 10)}`)
          : 'ready \u00b7 press G'}\n`
      : '') +
    // The four newer abilities, as one line of cooldowns. A ready one shows
    // its key; one that is not shows how long.
    `abilities ${[
      ['V decoy', decoyReadyAt], ['H recall', recallReadyAt],
      ['T pane', cutReadyAt], ['E swap', swapReadyAt],
    ].map(([name, at]) => {
      const left = at - now * 0.001;
      return left > 0 ? `${name}(${left.toFixed(1)})` : name;
    }).join(' · ')}\n` +
    `health ${bar(playerHealth / MAX_HEALTH, 16)} ${String(playerHealth).padStart(3)}`
      + `${playerHealth <= 0 ? '   DOWN - press R' : ''}\n` +
    (optVal('foe') !== 'off' && foe
      ? (foe.health > 0
        ? `enemy  ${bar(foe.health / MAX_HEALTH, 16)} ${String(foe.health).padStart(3)}`
          + `   ${optVal('foe') === 'network'
            ? (netLive() ? '(networked)' : '(N to connect)')
            : `(B to throw; it hits for ${BOOM_DAMAGE})`}\n`
        : `enemy  down${optVal('foe') === 'bot'
            ? `, back in ${Math.max(0, FOE_RESPAWN - foe.deadFor).toFixed(1)}s` : ''}\n`)
      : 'enemy off \u00b7 O to switch it on\n') +
    (optVal('foe') === 'network'
      ? `net    ${netLive() ? 'live' : netState()}`
        + `${netNote() ? ' \u00b7 ' + netNote() : ''}   (N opens the panel)\n`
      : '') +
    (lastHitFor > 0 ? `>> ${lastHit}\n` : '\n') +
    `\nA COMPACT 3-MANIFOLD. The floor is a closed genus-2 surface, so it\n` +
    `has no edge at all: walk any direction and you come back. The gold\n` +
    `octagons are where the room is glued to itself, eight at a corner.\n\n` +
    `WASD move \u00b7 space jump \u00b7 LMB grapple \u00b7 shift reel \u00b7 Q holonomy\n` +
    `B boomerang \u00b7 G build \u00b7 V decoy \u00b7 H recall \u00b7 T pane \u00b7 E anchor swap\n` +
    `F beacon \u00b7 K course \u00b7 scroll zoom \u00b7 X unzoom \u00b7 N multiplayer \u00b7 O options\n` +
    `R reset \u00b7 ${courseOn()
      ? `course: ${optVal('course')} \u00b7 K restarts \u00b7 O to switch mode`
      : `no course \u00b7 K starts the hoops \u00b7 O for the grapple gates`}\n` +
    (optVal('portals') === 'on'
      ? `1 / 2 place a portal \u00b7 3 clear \u00b7 ${portalsLive() ? 'pair live' : 'place both'}`
      : `portals off \u00b7 O to switch them on`);

  requestAnimationFrame(frame);
}
// Push the option defaults into the world before the first frame.
applyOptions();
drawMenu();

requestAnimationFrame(frame);

void PLAYER_R;
