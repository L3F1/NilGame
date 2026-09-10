// The scene lab: author E3 solids, then walk through them.
//
// Everything visible here comes from ONE compiled document. The renderer's
// uniforms and the collision field are built from the same entities, so the
// picture and the physics cannot drift apart -- which is the entire point of
// the query boundary this experiment exists to validate.
import {
  compileSceneField, editScene, editEntities, addEntity, removeEntity,
  addPortal, removePortal,
} from '../engine/world/scene-field.js';
import { BALL_FIRST_PERSON_GLSL } from '../engine/geometry/ball-shader.js';
import { e3Space, clearance, resolveOverlap, sweep } from '../engine/world/collision.js';
import { stepWalker } from '../engine/world/walker.js';
import { createCameraFrame, turn, mapFrame } from '../engine/world/camera-frame.js';

const $ = (id) => document.getElementById(id), canvas = $('c');
const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
if (!gl) throw new Error('WebGL2 is required');
function shader(type, source) {
  const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
const program = gl.createProgram();
gl.attachShader(program, shader(gl.VERTEX_SHADER, `#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0,1);}`));
gl.attachShader(program, shader(gl.FRAGMENT_SHADER, BALL_FIRST_PERSON_GLSL));
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
const U = Object.fromEntries(['uBalls', 'uBallN',
  'uBoxes', 'uBoxHalves', 'uBoxFwd', 'uBoxUp', 'uBoxN',
  'uModBoxes', 'uModBoxHalves', 'uModBoxFwd', 'uModBoxUp',
  'uModBoxOwner', 'uModBoxSign', 'uModBoxN',
  'uPlanes', 'uPlaneN', 'uRes',
  'uEye', 'uFwd', 'uRight', 'uUp', 'uExtent', 'uSelected',
  'uPortals', 'uPortalNml', 'uPortalExit', 'uPortalMap', 'uPortalN',
  'uModBalls', 'uModBallOwner', 'uModBallSign', 'uModBallN',
  'uModPlanes', 'uModPlaneOwner', 'uModPlaneSign', 'uModPlaneN', 'uMarchSteps']
  .map((n) => [n, gl.getUniformLocation(program, n)]));

const params = new URLSearchParams(location.search);
async function fetchFixture(name) {
  const r = await fetch(`../levels/fixtures/${name}.nil.json`);
  if (!r.ok) throw new Error(`Cannot load the ${name} fixture`);
  return compileSceneField(await r.json()).document();
}
const startName = params.get('scene') || 'room';
let scene = await fetchFixture(startName), undo = [], redo = [];
let selected = compileSceneField(scene).entities().find((e) => e.kind === 'ball')?.id || null;

// --- the player ------------------------------------------------------------
const space = e3Space();
const spawnOf = (doc) => doc.entities.find((e) => e.kind === 'spawn').position.slice();
const probe = {
  position: spawnOf(scene), velocity: [0, 0, 0],
  radius: scene.units.playerRadius, grounded: false,
};
let playing = false, last = null, note = '';
let transited = 0;
const keys = new Set();
const SPEED = 3.2;
const gravityOn = () => $('gravity').checked;

/**
 * THE CAMERA IS A CARRIED FRAME, not a yaw and a pitch.
 *
 * `engine/world/camera-frame.js` keeps forward, up and right as state and
 * rotates them about their OWN axes, which is what lets roll exist at all. It
 * is held at the origin here because E3 transport is the identity, so the
 * frame does not depend on where the walker stands; the moment this lab hosts
 * a curved region that stops being true and the frame gets carried along the
 * path with the same `carry` the velocity uses.
 */
const cameraSpace = e3Space();
const CAMERA_ORIGIN = [0, 0, 0];
let camera = null;
/** Aim from absolute yaw and pitch, the old way, with up as near world up as
 * forward allows. Scripted views want exactly this; a mouse does not. */
function look(yaw, pitch) {
  camera = turn(createCameraFrame(cameraSpace, CAMERA_ORIGIN,
    { forward: [1, 0, 0], up: [0, 0, 1] }), { yaw, pitch });
  return camera;
}
/** Aim along a world direction, keeping up as near world up as it allows. */
function aimForward(f) {
  const n = Math.hypot(...f);
  if (!(n > 1e-9)) return camera;
  const up = Math.abs(f[2] / n) > 0.999 ? [1, 0, 0] : [0, 0, 1];
  camera = createCameraFrame(cameraSpace, CAMERA_ORIGIN, { forward: f, up });
  return camera;
}
look(Math.PI / 2, -0.15);
/** The view, in the shape the renderer and the walker already expect. */
function basis() {
  return { f: camera.forward, r: camera.right, u: camera.up };
}
/** The heading, for anything that still wants one scalar. */
const heading = () => Math.atan2(camera.forward[1], camera.forward[0]);

/**
 * Turn by a mouse delta.
 *
 * Yaw rotates about the frame's own up and pitch about its own right, so the
 * two do not commute and the residue they leave is real roll rather than
 * error. THE PITCH CLAMP IS THE ONE PLACE LEFT THAT ASSUMES A WORLD UP: it
 * stops the view tipping past vertical, which is a walking policy and not a
 * fact about the space. A curved region will have to state it differently or
 * decline it.
 */
function turnBy(dYaw, dPitch) {
  camera = turn(camera, { yaw: dYaw });
  const climbed = Math.asin(Math.max(-1, Math.min(1, camera.forward[2])));
  const wanted = Math.max(-1.5, Math.min(1.5, climbed + dPitch));
  camera = turn(camera, { pitch: wanted - climbed });
  return camera;
}
/**
 * Carry the camera through a portal.
 *
 * A TRANSIT ROTATES THE WORLD, and the camera is the host's, not the
 * engine's, so nothing carries it through unless this does. Skipping it is
 * not a subtle visual error: the walker emerges facing back the way they came,
 * walks straight into the far aperture again, and the portal reads as broken.
 *
 * All three vectors go through `portal.mapVector` -- the same map the walker
 * is carried by -- so ROLL SURVIVES a tilted aperture. Recovering a yaw and a
 * pitch from the mapped forward, which is what this used to do, silently drops
 * it and is only correct while every aperture stands upright.
 */
function carryThroughPortal(portal) {
  camera = mapFrame(camera, CAMERA_ORIGIN, (v) => portal.mapVector(v));
  return camera;
}

function want() {
  const { f, r } = basis(), v = [0, 0, 0];
  const add = (d, k) => { for (let i = 0; i < 3; i++) v[i] += d[i] * k; };
  if (keys.has('KeyW')) add(f, 1); if (keys.has('KeyS')) add(f, -1);
  if (keys.has('KeyD')) add(r, 1); if (keys.has('KeyA')) add(r, -1);
  if (!gravityOn()) {
    if (keys.has('Space')) add([0, 0, 1], 1);
    if (keys.has('ShiftLeft') || keys.has('ShiftRight')) add([0, 0, 1], -1);
  } else {
    v[2] = 0;   // walking: flatten the aim, or looking up walks you into the sky
  }
  const n = Math.hypot(...v);
  return n > 1e-9 ? v.map((x) => x * SPEED / n) : [0, 0, 0];
}

/**
 * THE EDIT/PLAY TRANSACTION POLICY, chosen explicitly rather than by accident.
 *
 * Authoring is never blocked by where the player stands: the edit applies, and
 * the probe is then made legal against the new field. If it can be pushed out,
 * it is. If it cannot -- a ball's dead centre, or a wedge between two solids
 * where the nearest normal points into the other one -- it respawns. Refusing
 * the edit instead would mean an author could not grow a ball while standing
 * in it, which is a worse rule and a more confusing one.
 */
function reconcile(field) {
  const out = resolveOverlap(field, space, probe.position, probe.radius);
  if (out.status === 'clear') return '';
  if (out.status === 'pushed') {
    probe.position = out.position; probe.velocity = [0, 0, 0];
    return 'the edit reached the player, who was pushed clear';
  }
  probe.position = spawnOf(scene); probe.velocity = [0, 0, 0];
  return 'the edit trapped the player, who respawned';
}

// The shader speaks vec4 throughout, so a run of vec3 data is padded rather
// than uploaded as a vec3 array. Keeping one array type across every uniform
// is worth four bytes an object.
const vec4s = (flat) => {
  const out = [];
  for (let i = 0; i < flat.length; i += 3) out.push(flat[i], flat[i + 1], flat[i + 2], 0);
  return out;
};

// --- the inspector ---------------------------------------------------------
function selectedEntity(field) {
  return field.entities().find((e) => e.id === selected) || null;
}
function drawList(field) {
  const list = $('entities');
  list.innerHTML = '';
  for (const e of field.entities()) {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(e.id === selected));
    // A carve reads as a carve in the list. Two entities of the same kind
    // where one is cut out of the other and nothing on screen says which is
    // the sort of thing an author discovers by deleting the wrong one.
    const mark = e.op === 'subtract' ? ` minus ${e.target || '(all)'}`
      : e.op === 'intersect' ? ` clips ${e.target}` : '';
    li.innerHTML = `<span>${e.id}</span><span class="kind">${e.kind}${mark}</span>`;
    li.onclick = () => { selected = e.id; draw(); };
    list.appendChild(li);
  }
  const e = selectedEntity(field);
  // The inspector shows only the fields the selected kind actually has, so it
  // cannot offer a radius for a spawn or a normal for a ball.
  $('radius-field').hidden = !e || e.radius === undefined;
  $('half-field').hidden = !e || e.kind !== 'box';
  $('up-field').hidden = !e || e.kind !== 'plane';
  $('forward-field').hidden = !e || e.kind !== 'anchor';
  $('editor').hidden = !e;
  // An anchor is one END of something, so say which -- an author looking at
  // "gate-3" has no way to tell which portal it belongs to otherwise, and the
  // radius they type will silently move the other end too.
  const holder = e ? compileSceneField(scene).connectionOf(e.id) : null;
  $('inspector-title').textContent = e
    ? `Inspector — ${e.id} (${e.kind}${holder ? `, end of ${holder.id}` : ''})`
    : 'Inspector';
  $('delete').disabled = !e;
  if (e) {
    ['x', 'y', 'z'].forEach((id, i) => { $(id).value = e.position[i]; });
    if (e.radius !== undefined) $('radius').value = e.radius;
    if (e.kind === 'box') ['hx', 'hy', 'hz'].forEach((id, i) => { $(id).value = e.halfExtent[i]; });
    if (e.kind === 'plane') ['ux', 'uy', 'uz'].forEach((id, i) => { $(id).value = e.up[i]; });
    if (e.kind === 'anchor') ['fx', 'fy', 'fz'].forEach((id, i) => { $(id).value = e.forward[i]; });
  }
}

function draw() {
  const field = compileSceneField(scene);
  canvas.width = Math.max(1, Math.round(canvas.clientWidth * devicePixelRatio));
  canvas.height = Math.max(1, Math.round(canvas.clientHeight * devicePixelRatio));
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(program);
  const { f, r, u } = basis();
  const balls = field.ballsUniform(), planes = field.planesUniform();
  const boxC = field.boxCentersUniform(), boxH = field.boxHalvesUniform();
  const boxF = field.boxForwardsUniform(), boxU = field.boxUpsUniform();
  gl.uniform4fv(U.uBalls, balls.length ? balls : [0, 0, 0, -1]);
  gl.uniform1i(U.uBallN, field.ballCount);
  gl.uniform4fv(U.uBoxes, boxC.length ? vec4s(boxC) : [0, 0, 0, 0]);
  gl.uniform4fv(U.uBoxHalves, boxH.length ? vec4s(boxH) : [1, 1, 1, 0]);
  // Identity orientation is forward +y, up +z -- the same default the field
  // gives a box with no authored frame, so an unrotated box is bit-identical
  // to what it drew before frames existed.
  gl.uniform4fv(U.uBoxFwd, boxF.length ? boxF : [0, 1, 0, 0]);
  gl.uniform4fv(U.uBoxUp, boxU.length ? boxU : [0, 0, 1, 0]);
  gl.uniform1i(U.uBoxN, field.boxCount);
  gl.uniform4fv(U.uPlanes, planes.length ? planes : [0, 0, 1, 0]);
  gl.uniform1i(U.uPlaneN, field.planeCount);
  gl.uniform2f(U.uRes, canvas.width, canvas.height);
  gl.uniform3fv(U.uEye, probe.position); gl.uniform3fv(U.uFwd, f);
  gl.uniform3fv(U.uRight, r); gl.uniform3fv(U.uUp, u);
  gl.uniform1f(U.uExtent, field.extent);
  // The apertures. The shader re-aims the ray with the SAME matrix the walker
  // is carried by, so the far side you see is the far side you arrive in.
  const discs = field.portalDiscs().flat(), nml = field.portalNormals().flat();
  const exits = field.portalExits().flat(), maps = field.portalMaps().flat();
  gl.uniform4fv(U.uPortals, discs.length ? discs : [0, 0, 0, 0]);
  gl.uniform4fv(U.uPortalNml, nml.length ? nml : [0, 0, 1, 0]);
  gl.uniform4fv(U.uPortalExit, exits.length ? exits : [0, 0, 0, 0]);
  gl.uniformMatrix3fv(U.uPortalMap, false, maps.length ? maps : new Array(9).fill(0));
  gl.uniform1i(U.uPortalN, field.portalCount);
  // Modifiers, with the solid each one applies to and the SIGN that says
  // which operation it is. When there are none the shader takes its exact
  // closed-form path, exactly as before -- so a scene that modifies nothing
  // renders by the same route it always did.
  const mb = field.modBallsUniform(), mp = field.modPlanesUniform();
  const mbo = field.modBallOwners(), mps = field.modPlaneSigns();
  const mbs = field.modBallSigns(), mpo = field.modPlaneOwners();
  const mxc = field.modBoxCentersUniform(), mxh = field.modBoxHalvesUniform();
  const mxo = field.modBoxOwners(), mxs = field.modBoxSigns();
  const mxf = field.modBoxForwardsUniform(), mxu = field.modBoxUpsUniform();
  gl.uniform4fv(U.uModBalls, mb.length ? mb : [0, 0, 0, 0]);
  gl.uniform1iv(U.uModBallOwner, mbo.length ? mbo : [-1]);
  gl.uniform1fv(U.uModBallSign, mbs.length ? mbs : [-1]);
  gl.uniform1i(U.uModBallN, field.modBallCount);
  gl.uniform4fv(U.uModPlanes, mp.length ? mp : [0, 0, 1, 0]);
  gl.uniform1iv(U.uModPlaneOwner, mpo.length ? mpo : [-1]);
  gl.uniform1fv(U.uModPlaneSign, mps.length ? mps : [-1]);
  gl.uniform1i(U.uModPlaneN, field.modPlaneCount);
  // Boxes carry two arrays that must stay in step, so they are uploaded
  // together and padded together: a half-extent without its centre is a box
  // somewhere else, which is worse than no box at all.
  gl.uniform4fv(U.uModBoxes, mxc.length ? vec4s(mxc) : [0, 0, 0, 0]);
  gl.uniform4fv(U.uModBoxHalves, mxh.length ? vec4s(mxh) : [1, 1, 1, 0]);
  gl.uniform1iv(U.uModBoxOwner, mxo.length ? mxo : [-1]);
  gl.uniform1fv(U.uModBoxSign, mxs.length ? mxs : [-1]);
  gl.uniform4fv(U.uModBoxFwd, mxf.length ? mxf : [0, 1, 0, 0]);
  gl.uniform4fv(U.uModBoxUp, mxu.length ? mxu : [0, 0, 1, 0]);
  gl.uniform1i(U.uModBoxN, field.modBoxCount);
  // A uniform, not a constant, so the D3D compiler cannot unroll the march.
  gl.uniform1i(U.uMarchSteps, 160);
  // WHICH SOLID IS SELECTED, in the shader's own owner encoding: ball i, or
  // 200+i for box i. Not the entity index, which counts spawns and planes
  // too, and not a per-kind index, which would highlight ball 2 when box 2
  // was chosen. Planes are shaded by their grid and take no highlight.
  const added = field.entities().filter((e) => (e.op || 'add') === 'add');
  const ballIds = added.filter((e) => e.kind === 'ball').map((e) => e.id);
  const boxIds = added.filter((e) => e.kind === 'box').map((e) => e.id);
  const boxPick = boxIds.indexOf(selected);
  gl.uniform1i(U.uSelected, boxPick >= 0 ? 200 + boxPick : ballIds.indexOf(selected));
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  drawList(field);
  const gap = clearance(field, probe.position, probe.radius);
  const gates = field.portalCount ? `, ${field.portalCount / 2} portal${field.portalCount === 2 ? '' : 's'}` : '';
  const cuts = field.modifierCount
    ? `, ${field.carveCount} carve${field.carveCount === 1 ? '' : 's'}`
      + `, ${field.intersectCount} clip${field.intersectCount === 1 ? '' : 's'}`
      + ` (distance is a ${field.capabilities.exteriorDistance} outside)` : '';
  // COINCIDENT SURFACES. The box-room fixture once drew a speckled line across
  // its doorway sill because a carving box's face sat in exactly the floor's
  // plane. The obvious warning was "these two are too close", and the
  // measurement (MUSE-31) says there is no such distance: at 1e-12 the field
  // is clean, and at exactly zero it reports it cannot tell. So the field
  // finds the exact candidates and confirms them, and this just says so --
  // naming the pair, because "something is wrong somewhere" is not a warning
  // an author can act on. Not measured while playing: it is an authoring aid.
  const overlaps = playing ? [] : field.coincidentFaces();
  const seam = overlaps.length
    ? ` — ${overlaps[0].a} and ${overlaps[0].b} SHARE A SURFACE exactly`
      + `${overlaps.length > 1 ? ` (+${overlaps.length - 1} more)` : ''}`
      + '; move either one by any amount' : '';
  $('query').textContent = `${field.solidCount} solid${field.solidCount === 1 ? '' : 's'}${gates}.`
    + `${cuts}`
    + ` Player clearance ${gap.toFixed(3)}${gap < 0 ? ' — OVERLAPPING' : ''}`
    + `${probe.grounded ? ', on the ground' : ''}`
    + `${transited ? `, ${transited} transit${transited === 1 ? '' : 's'}` : ''}`
    + `.${note ? ' ' + note : ''}${seam}`;
  $('undo').disabled = !undo.length; $('redo').disabled = !redo.length;
}

function commit(next) {
  const compiled = compileSceneField(next);
  undo.push(scene); redo = []; scene = compiled.document();
  note = reconcile(compiled);
  draw();
}
const stepHistory = (from, to) => {
  if (!from.length) return;
  to.push(scene); scene = from.pop();
  const field = compileSceneField(scene);
  if (!field.entities().some((e) => e.id === selected)) selected = null;
  note = reconcile(field);
  draw();
};

// --- frame loop ------------------------------------------------------------
function frame(now) {
  if (!playing) return;
  // Clamp dt at BOTH ends. The lower one bites: a first callback stamped
  // before the clock was read gives a NEGATIVE dt, which runs the integrator
  // backwards and never recovers. See CLAUDE.md, "Clamp dt at BOTH ends".
  const dt = last === null ? 0 : Math.min(Math.max((now - last) / 1000, 0), 0.05);
  last = now;
  const field = compileSceneField(scene);
  const target = want();
  let out;
  const portals = field.portals;
  if (gravityOn()) {
    out = stepWalker(field, space, probe, dt, { want: target, jump: keys.has('Space'), portals });
    probe.grounded = out.grounded;
  } else {
    // Free flight: the control IS the velocity, so nothing accumulates.
    out = stepWalker(field, space, { ...probe, velocity: target }, dt,
      { gravity: 0, want: target, jump: false, portals });
    probe.grounded = false;
  }
  probe.position = out.position; probe.velocity = out.velocity;
  for (const transit of out.transits) { carryThroughPortal(transit.portal); transited++; }
  note = out.contacts.length
    ? `Contact normal ${out.contacts[0].map((n) => n.toFixed(2)).join(', ')}.`
    : out.blocked ? `Portal ${out.blocked.portal.id} refused: the far side is blocked.`
      : out.stalled ? 'Solver stalled — grazing a surface.' : '';
  draw();
  requestAnimationFrame(frame);
}
function setPlaying(on) {
  playing = on; last = null;
  $('play').textContent = on ? 'Stop (Esc)' : 'Play from spawn';
  canvas.style.cursor = on ? 'crosshair' : 'default';
  if (on) {
    probe.position = spawnOf(scene); probe.velocity = [0, 0, 0];
    probe.grounded = false; note = ''; transited = 0;
    // POINTER LOCK IS A REQUEST, NOT A RIGHT. The browser refuses it outside a
    // user gesture and for a few seconds after Esc, and in newer Chrome that
    // refusal is a REJECTED PROMISE rather than a thrown error -- so `?.()`
    // alone leaves it unhandled and the page reports itself as broken when
    // nothing is wrong. Play still works; only the mouse stays free.
    try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* refused */ }
    requestAnimationFrame(frame);
  } else { document.exitPointerLock?.(); keys.clear(); draw(); }
}

// --- controls --------------------------------------------------------------
$('editor').onsubmit = (e) => {
  e.preventDefault();
  try {
    const entity = selectedEntity(compileSceneField(scene));
    if (!entity) throw new Error('Nothing selected');
    const patch = { position: ['x', 'y', 'z'].map((k) => Number($(k).value)) };
    if (entity.radius !== undefined) patch.radius = Number($('radius').value);
    if (entity.kind === 'box') {
      const h = ['hx', 'hy', 'hz'].map((k) => Number($(k).value));
      if (!h.every((x) => x > 0)) throw new Error('A box needs three positive half-extents');
      patch.halfExtent = h;
    }
    if (entity.kind === 'anchor') {
      const fwd = ['fx', 'fy', 'fz'].map((k) => Number($(k).value));
      const n = Math.hypot(...fwd);
      if (!(n > 1e-9)) throw new Error('An aperture forward cannot be zero length');
      patch.forward = fwd.map((x) => x / n);
      // `up` must stay orthonormal to `forward`, so re-derive it rather than
      // handing the author two vectors to keep consistent by hand. Any up
      // perpendicular to forward will do; this picks the one nearest world up,
      // which keeps a wall portal's "up" pointing up.
      const a = Math.abs(patch.forward[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
      const dot = a.reduce((sum, x, i) => sum + x * patch.forward[i], 0);
      const up = a.map((x, i) => x - dot * patch.forward[i]);
      const un = Math.hypot(...up);
      patch.up = up.map((x) => x / un);
    }
    if (entity.kind === 'plane') {
      const up = ['ux', 'uy', 'uz'].map((k) => Number($(k).value));
      const n = Math.hypot(...up);
      if (!(n > 1e-9)) throw new Error('A plane normal cannot be zero length');
      // Normalise for the author: the schema demands a unit normal, and
      // rejecting "0,0,2" for not being unit length would be pedantry.
      patch.up = up.map((x) => x / n);
    }
    // A PORTAL IS EDITED AT BOTH ENDS AT ONCE. The schema pins the two radii
    // equal, so there is no valid document in between: widening one end and
    // then the other would reject the author's own halfway state. Position and
    // forward stay local to the end being edited; only radius travels.
    const holder = compileSceneField(scene).connectionOf(entity.id);
    if (holder && patch.radius !== undefined) {
      const far = holder.a === entity.id ? holder.b : holder.a;
      commit(editEntities(scene, [
        { id: entity.id, patch },
        { id: far, patch: { radius: patch.radius } },
      ]));
      $('status').textContent = `${entity.id} updated (${far} matched its radius)`;
    } else {
      commit(editScene(scene, entity.id, patch));
      $('status').textContent = `${entity.id} updated`;
    }
  } catch (error) { $('status').textContent = error.message; draw(); }
};
$('add-ball').onclick = () => {
  try {
    // In front of where the player is looking, so a new ball is somewhere you
    // can see rather than at the origin under the floor.
    const { f } = basis();
    const at = probe.position.map((x, i) => x + f[i] * 2.5);
    const next = addEntity(scene, 'ball', { position: at, radius: 0.5 });
    commit(next);
    selected = compileSceneField(next).entities().at(-1).id;
    draw();
    $('status').textContent = `added ${selected}`;
  } catch (error) { $('status').textContent = error.message; }
};
$('add-box').onclick = () => {
  try {
    const { f } = basis();
    const at = probe.position.map((x, i) => x + f[i] * 3);
    const next = addEntity(scene, 'box', { position: at, halfExtent: [0.8, 0.8, 0.8] });
    commit(next);
    selected = compileSceneField(next).entities().at(-1).id;
    draw();
    $('status').textContent = `added ${selected} (axis-aligned; edit its half-extents)`;
  } catch (error) { $('status').textContent = error.message; }
};
$('add-plane').onclick = () => {
  try {
    const next = addEntity(scene, 'plane', { position: [0, 0, 3], up: [0, 0, -1] });
    commit(next);
    selected = compileSceneField(next).entities().at(-1).id;
    draw();
    $('status').textContent = `added ${selected} (a ceiling; edit its normal to re-aim it)`;
  } catch (error) { $('status').textContent = error.message; }
};
$('add-carve').onclick = () => {
  try {
    // A carve targets the SELECTED solid, because a global one takes the floor
    // out from under the doorway and the author is left over a hole wondering
    // what they did. With nothing selected there is nothing to cut, so say so
    // rather than quietly cutting everything.
    const field = compileSceneField(scene);
    const target = field.entities().find((e) => e.id === selected);
    if (!target || !['ball', 'box', 'plane'].includes(target.kind)) {
      throw new Error('Select the solid you want to cut, then carve');
    }
    // A BOX IS CARVED WITH A BOX. Cutting a rectangular doorway with a ball
    // gives a round-topped hole, and an author who wanted a doorway has to
    // undo and start over; matching the cutter to the target is the guess
    // that is right far more often than it is wrong.
    const { f } = basis();
    const at = probe.position.map((x, i) => x + f[i] * 2.5);
    const next = target.kind === 'box'
      ? addEntity(scene, 'box',
        { position: at, halfExtent: [0.6, 0.6, 0.6], op: 'subtract', target: target.id })
      : addEntity(scene, 'ball',
        { position: at, radius: 0.7, op: 'subtract', target: target.id });
    commit(next);
    selected = compileSceneField(next).entities().at(-1).id;
    draw();
    $('status').textContent = `carving ${target.id} with ${selected}`;
  } catch (error) { $('status').textContent = error.message; }
};
$('add-portal').onclick = () => {
  try {
    // Both gates in front of the player and level, so a new portal is one you
    // can walk into rather than one buried in the floor. Forward points OUT of
    // an aperture, so each gate faces back at the room it serves.
    const { f } = basis();
    const flat = [f[0], f[1], 0], n = Math.hypot(...flat) || 1;
    const dir = [flat[0] / n, flat[1] / n, 0];
    const side = [-dir[1], dir[0], 0];
    const at = (k, s) => [probe.position[0] + dir[0] * k + side[0] * s,
      probe.position[1] + dir[1] * k + side[1] * s, 1.2];
    const back = dir.map((x) => -x);
    const next = addPortal(scene, { a: at(3, 0), b: at(3, 8), forwardA: back, forwardB: back });
    commit(next);
    const made = compileSceneField(next).connections().at(-1);
    selected = made.a; draw();
    $('status').textContent = `added ${made.id} — walk into ${made.a}`;
  } catch (error) { $('status').textContent = error.message; }
};
$('delete').onclick = () => {
  try {
    const id = selected;
    // Deleting one end of a portal is not what an author means; they mean the
    // portal. removeEntity refuses it and says so, but doing the right thing
    // is better than explaining why we did not.
    const holder = compileSceneField(scene).connectionOf(id);
    commit(holder ? removePortal(scene, holder.id) : removeEntity(scene, id));
    selected = null; draw();
    $('status').textContent = holder ? `deleted portal ${holder.id} and both ends` : `deleted ${id}`;
  } catch (error) { $('status').textContent = error.message; }
};
$('fixture').value = startName;
$('fixture').onchange = async () => {
  try {
    setPlaying(false);
    commit(await fetchFixture($('fixture').value));
    selected = compileSceneField(scene).entities()[0]?.id || null;
    draw();
    $('status').textContent = `Loaded ${$('fixture').value}`;
  } catch (error) { $('status').textContent = error.message; }
};
$('undo').onclick = () => stepHistory(undo, redo);
$('redo').onclick = () => stepHistory(redo, undo);
$('play').onclick = () => setPlaying(!playing);
$('save').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `${scene.id}.nil.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('load').onchange = async () => {
  const file = $('load').files[0]; if (!file) return;
  try {
    commit(JSON.parse(await file.text()));
    selected = compileSceneField(scene).entities()[0]?.id || null;
    draw();
    $('status').textContent = `Loaded ${file.name}`;
  } catch (error) { $('status').textContent = error.message; }
};
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Escape' && playing) { setPlaying(false); return; }
  if (playing) { keys.add(e.code); if (e.code === 'Space') e.preventDefault(); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('mousemove', (e) => {
  if (!playing) return;
  turnBy(-e.movementX * 0.0025, -e.movementY * 0.0025);
});
new ResizeObserver(draw).observe(canvas);
draw();

// Opt-in executable smoke check, served by page-check --ball-lab.
if (new URLSearchParams(location.search).has('check')) {
  const checks = [];
  const check = (name, ok) => { if (!ok) throw new Error(name); checks.push(name); };
  let err = '', shot = '';
  const shots = [];
  try {
    const initial = JSON.stringify(scene);
    const pixels = () => {
      const p = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, p);
      return p;
    };
    const field0 = compileSceneField(scene);
    check('the room has a floor and a ball', field0.hasPlane && !!field0.ballId);

    // The camera must not be upside down. A negated `right` negates `up` with
    // it and turns the view a half turn, drawing the floor above the horizon.
    const saved = camera; look(heading(), 0);
    check('camera up points along world up', basis().u[2] > 0.99);
    check('camera right is perpendicular to forward',
      Math.abs(basis().r.reduce((a, x, i) => a + x * basis().f[i], 0)) < 1e-9);
    // A carried frame keeps whatever roll it was given, so a scripted view
    // that wants none has to say so. That it CAN hold roll is the point.
    check('a rolled camera keeps its roll instead of snapping upright',
      Math.abs(turn(look(heading(), 0), { roll: 0.4 }).up[2] - 1) > 1e-3);
    camera = saved;

    // --- selection and the inspector --------------------------------------
    // Assert what the SCREEN shows, not what the attribute says. An author
    // rule for `label` outranks the UA rule for [hidden], so a field can be
    // hidden in the DOM and still visible to the user -- which is exactly what
    // happened, and only inspecting the render caught it.
    const shownField = (id) => getComputedStyle($(id)).display !== 'none';
    selected = field0.ballId; draw();
    check('the inspector shows radius for a ball', shownField('radius-field'));
    check('and really hides the plane normal', !shownField('up-field'));
    selected = field0.planeId; draw();
    check('the inspector shows the normal for a plane', shownField('up-field'));
    check('and really hides radius', !shownField('radius-field'));
    const spawnId = field0.entities().find((e) => e.kind === 'spawn').id;
    selected = spawnId; draw();
    check('a spawn shows neither radius nor normal',
      !shownField('radius-field') && !shownField('up-field'));
    check('the entity list shows every entity',
      $('entities').children.length === field0.entities().length);

    // --- editing through the form -----------------------------------------
    selected = field0.ballId; draw();
    const before = pixels();
    $('x').value = 1.5; $('radius').value = 0.4;
    $('editor').requestSubmit();
    // A `step` lattice plus a `min` silently makes ordinary values invalid --
    // min .01 with step .05 rejects a radius of 0.4 -- and the browser then
    // refuses to submit with nothing shown. Assert the form ACCEPTS the values
    // an author would actually type, or the inspector is quietly broken.
    check('the inspector accepts ordinary typed values', $('editor').checkValidity());
    check('the form edits the selected entity',
      compileSceneField(scene).ballUniform()[0] === 1.5);
    check('the field follows the edit',
      Math.abs(compileSceneField(scene).distance([1.5, 0, 0.9]) + 0.4) < 1e-9);
    check('the render changes', pixels().some((v, i) => v !== before[i]));
    $('undo').click();
    check('undo restores the document', JSON.stringify(scene) === initial);
    $('redo').click();
    check('redo restores the edit', compileSceneField(scene).ballUniform()[0] === 1.5);

    // --- adding and deleting ----------------------------------------------
    const n0 = compileSceneField(scene).ballCount;
    $('add-ball').click();
    check('add-ball adds a ball', compileSceneField(scene).ballCount === n0 + 1);
    check('the new ball is selected', selected === compileSceneField(scene).entities().at(-1).id);
    check('the new ball is in the field',
      compileSceneField(scene).distance(compileSceneField(scene).entities().at(-1).position) < 0);
    $('delete').click();
    check('delete removes it', compileSceneField(scene).ballCount === n0);
    selected = spawnId; draw();
    $('delete').click();
    check('deleting the only spawn is refused',
      compileSceneField(scene).entities().some((e) => e.id === spawnId));
    check('and says why', /only spawn/.test($('status').textContent));

    const roundtrip = JSON.stringify(scene);
    commit(JSON.parse(roundtrip));
    check('JSON round trip', JSON.stringify(scene) === roundtrip);
    selected = compileSceneField(scene).ballId; draw();
    $('x').value = 999; $('editor').requestSubmit();
    check('an invalid edit is atomic', JSON.stringify(scene) === roundtrip);

    // --- the walker --------------------------------------------------------
    setPlaying(true);
    const spawn = spawnOf(scene);
    check('play starts at the authored spawn', probe.position.every((x, i) => x === spawn[i]));
    check('the spawn has room', clearance(compileSceneField(scene), probe.position, probe.radius) > 0);

    probe.position = [0, -3, 6]; probe.velocity = [0, 0, 0]; probe.grounded = false;
    let sank = false;
    for (let i = 0; i < 600; i++) {
      const out = stepWalker(compileSceneField(scene), space, probe, 1 / 60);
      probe.position = out.position; probe.velocity = out.velocity; probe.grounded = out.grounded;
      if (clearance(compileSceneField(scene), probe.position, probe.radius) < -1e-6) sank = true;
    }
    check('a fall lands on the floor', probe.grounded);
    check('and never sinks through it', !sank);
    check('resting height is the probe radius', Math.abs(probe.position[2] - probe.radius) < 5e-3);

    const startY = probe.position[1];
    for (let i = 0; i < 120; i++) {
      const out = stepWalker(compileSceneField(scene), space, probe, 1 / 60, { want: [0, 3, 0] });
      probe.position = out.position; probe.velocity = out.velocity; probe.grounded = out.grounded;
    }
    check('walking covers ground', probe.position[1] > startY + 1.5);
    check('walking stays on the floor', Math.abs(probe.position[2] - probe.radius) < 2e-2);

    const far = stepWalker(compileSceneField(scene), space,
      { position: [0, -3, 500], velocity: [0, 0, 0], radius: probe.radius, grounded: false }, 2);
    check('a 500-unit fall still stops at the floor',
      clearance(compileSceneField(scene), far.position, probe.radius) >= -1e-6);

    probe.position = [1.0, 0, 0.9]; probe.velocity = [0, 0, 0];
    const said = reconcile(compileSceneField(
      editScene(scene, compileSceneField(scene).ballId, { position: [0, 0, 0.9], radius: 1.2 })));
    check('an edit that reaches the player moves them', said !== '');
    draw();
    const shown = pixels();
    check('the play view renders more than one flat colour',
      shown.some((v, i) => i % 4 < 3 && v !== shown[i % 4]));
    setPlaying(false);
    check('stopping play leaves the document untouched', JSON.stringify(scene) === roundtrip);

    // --- portals ----------------------------------------------------------
    const flat = pixels();
    commit(await fetchFixture('portal-room'));
    const gated = compileSceneField(scene);
    check('the portal fixture compiles two one-way apertures', gated.portalCount === 2);
    check('an aperture is a hole, not a solid', gated.distance(gated.portals[0].center) > 0);
    check('the renderer gets a map for each aperture',
      gated.portalMaps().length === 2 && gated.portalMaps()[0].length === 9);

    // The picture must come from the SAME map as the physics. Compare the
    // matrix the shader is handed against mapVector, because a portal drawn
    // from a second derivation can show a room you do not arrive in.
    const M = gated.portalMaps()[0], v = [0.3, -0.7, 0.65];
    const byMatrix = [M[0] * v[0] + M[3] * v[1] + M[6] * v[2],
      M[1] * v[0] + M[4] * v[1] + M[7] * v[2],
      M[2] * v[0] + M[5] * v[1] + M[8] * v[2]];
    const byMap = gated.portals[0].mapVector(v);
    check('the drawn map is the walked map',
      byMatrix.every((x, i) => Math.abs(x - byMap[i]) < 1e-9));


    // --- authoring a portal through the DOM -------------------------------
    const c0 = gated.connections().length;
    $('add-portal').click();
    const made = compileSceneField(scene);
    check('add-portal adds one connection', made.connections().length === c0 + 1);
    check('and two apertures with it', made.portalCount === (c0 + 1) * 2);
    check('the near gate is selected', made.entities().some((e) => e.id === selected));
    check('the inspector shows forward for an anchor', shownField('forward-field'));
    check('and radius', shownField('radius-field'));
    check('and really hides the plane normal', !shownField('up-field'));
    check('the inspector names the portal the anchor belongs to',
      /end of /.test($('inspector-title').textContent));

    // A portal is edited at BOTH ends. The schema pins the radii equal, so an
    // author who types one radius must not be told their scene is broken by
    // the halfway state of their own edit.
    const madeConn = made.connections().at(-1);
    selected = madeConn.a; draw();
    $('radius').value = 1.4; $('editor').requestSubmit();
    const widened = compileSceneField(scene);
    const radiusOf = (id) => widened.entities().find((e) => e.id === id).radius;
    check('editing one aperture radius moves both ends',
      radiusOf(madeConn.a) === 1.4 && radiusOf(madeConn.b) === 1.4);
    check('and says so', /matched its radius/.test($('status').textContent));

    // Aim the new gate at the player and check it is walkable, not merely
    // well formed: an editor that produces scenes the engine cannot play is
    // worse than one that refuses the edit.
    const authored = compileSceneField(scene);
    const gate = authored.portals.find((p) => p.fromId === madeConn.a);
    const approach = gate.center.map((x, i) => x + gate.normal[i] * 2);
    const into = gate.normal.map((x) => -x);
    check('a portal authored in the editor can be walked through',
      sweep(authored, space, {
        from: approach, direction: into, distance: 3,
        radius: authored.playerRadius, portals: authored.portals,
      }).transits.length === 1);

    selected = madeConn.a; draw();
    $('delete').click();
    check('deleting one end deletes the whole portal',
      compileSceneField(scene).connections().length === c0);
    check('and leaves no orphan anchor', !compileSceneField(scene)
      .entities().some((e) => e.id === madeConn.a || e.id === madeConn.b));

    setPlaying(true);
    // Aim at the gate, which stands between the spawn and the far room, and
    // walk. One transit, and the camera must come out facing the way the
    // walker now moves -- without that it faces back at the aperture it left
    // and ping-pongs, which is the failure the kernel test measures at 70.
    aimForward([0, 1, 0]);
    const beforeForward = basis().f;
    let saw = 0, sankThroughGate = false;
    for (let i = 0; i < 240; i++) {
      const f2 = compileSceneField(scene);
      const out = stepWalker(f2, space, probe, 1 / 60,
        { want: [basis().f[0] * 3, basis().f[1] * 3, 0], portals: f2.portals });
      for (const transit of out.transits) { carryThroughPortal(transit.portal); saw++; }
      probe.position = out.position; probe.velocity = out.velocity; probe.grounded = out.grounded;
      if (clearance(f2, probe.position, probe.radius) < -1e-3) sankThroughGate = true;
    }
    check('never sank while walking a portal room', !sankThroughGate);
    check('walking into the gate transits exactly once', saw === 1);
    check('and comes out at the far gate', probe.position[0] > 4);
    check('the camera turned with the walker',
      Math.hypot(...basis().f.map((x, i) => x - beforeForward[i])) > 0.1);
    check('still standing after the transit', probe.grounded);
    draw();
    check('a portal room does not render the same picture as a flat one',
      pixels().some((x, i) => x !== flat[i]));
    // --- carving, through the DOM -----------------------------------------
    const beforeCarve = compileSceneField(scene);
    selected = null; draw();
    $('add-carve').click();
    check('carving with nothing selected is refused, and says what to do',
      /Select the solid/.test($('status').textContent));
    check('and nothing was added', compileSceneField(scene).carveCount === beforeCarve.carveCount);

    const floorId = compileSceneField(scene).planeId;
    selected = floorId; draw();
    probe.position = [0, -3, 1.4]; look(Math.PI / 2, -0.5);
    $('add-carve').click();
    const carved = compileSceneField(scene);
    check('carving a selected solid adds a subtract entity', carved.carveCount === 1);
    const cut = carved.entities().at(-1);
    check('the carve TARGETS what was selected', cut.target === floorId && cut.op === 'subtract');
    check('the entity list says which solid it cuts',
      /minus/.test($('entities').textContent));

    // The contract the solver reads must follow the document, not lag it.
    check('the field now advertises a bound, not an exact distance',
      carved.capabilities.exteriorDistance === 'bound'
      && carved.capabilities.interiorDistance === 'magnitude-bound'
      && carved.capabilities.interiorSign === 'exact');
    check('and the readout tells the author', /carve/.test($('query').textContent));

    // A hole is only a hole if the field agrees. The carve sits 2.5 ahead of
    // the probe at its own height, so the floor under it is gone.
    const holeAt = [probe.position[0], probe.position[1] + 2.5, 0.0];
    check('the floor under the carve is now free space', carved.distance(holeAt) > 0);
    check('the floor away from the carve is untouched', carved.distance([8, 8, -0.2]) < 0);

    // And the renderer must have taken the marched path rather than silently
    // drawing the uncarved floor: the picture has to change.
    const beforeCut = pixels();
    $('undo').click();
    draw();
    const uncut = pixels();
    check('the carve changes what is drawn', beforeCut.some((v, i) => v !== uncut[i]));
    $('redo').click();
    draw();
    check('and redo brings it back', compileSceneField(scene).carveCount === 1);
    check('no GL errors after marching', gl.getError() === gl.NO_ERROR);

    // --- boxes, through the DOM -------------------------------------------
    // A box is the primitive that has to stay EXACT, so these checks watch
    // the capability as much as the picture. If adding a box ever flips the
    // scene to a bound, the primitive has stopped earning its place and the
    // author would have been better off with six clipped planes.
    while (compileSceneField(scene).carveCount > 0) $('undo').click();
    draw();
    const beforeBox = pixels();
    probe.position = [0, -3, 1.2]; look(Math.PI / 2, -0.1);
    $('add-box').click();
    const boxed = compileSceneField(scene);
    check('add box adds a box', boxed.boxCount === 1);
    check('THE FIELD IS STILL EXACT with a box in it',
      boxed.capabilities.exteriorDistance === 'exact' && boxed.capabilities.interiorSign === 'exact');
    check('the new box is selected', selected === boxed.entities().at(-1).id);
    check('the inspector shows half-extent for a box', shownField('half-field'));
    check('and hides radius, which a box does not have', !shownField('radius-field'));
    draw();
    check('the box is actually drawn', pixels().some((v, i) => v !== beforeBox[i]));
    check('no GL errors with a box on the closed-form path', gl.getError() === gl.NO_ERROR);

    // Editing a half-extent through the form, which is the only way an author
    // can resize a box -- a wrong field id here is a control that does nothing.
    const wide = pixels();
    $('hx').value = 2.4; $('hz').value = 0.3;
    $('editor').requestSubmit();
    const resized = compileSceneField(scene).entities().at(-1);
    check('the form edits the half-extent',
      resized.halfExtent[0] === 2.4 && resized.halfExtent[2] === 0.3);
    check('and resizing changes the picture', pixels().some((v, i) => v !== wide[i]));

    // A BOX IS CARVED WITH A BOX. Cutting a rectangular doorway with a ball
    // gives a round-topped hole and an author has to undo and start over.
    $('hx').value = 1.2; $('hy').value = 0.3; $('hz').value = 1.2;
    $('editor').requestSubmit();
    $('add-carve').click();
    const boxCut = compileSceneField(scene);
    const cutter = boxCut.entities().at(-1);
    check('carving a box uses a BOX cutter, not a ball', cutter.kind === 'box');
    check('and it targets the box that was selected',
      cutter.op === 'subtract' && cutter.target === resized.id);
    check('a modifier box is counted as one', boxCut.modBoxCount === 1);
    check('and the field drops to a bound, as any modifier must',
      boxCut.capabilities.exteriorDistance === 'bound');
    draw();
    check('no GL errors marching a carved box', gl.getError() === gl.NO_ERROR);
    while (compileSceneField(scene).boxCount > 0) $('undo').click();
    draw();

    // A PICTURE OF A PORTAL, for a human to look at. Every check above can
    // pass on a view that is upside down or shows the near room twice; only
    // looking catches that. Stand back from gate-a, put a ball where gate-b
    // lets out, and the shot should show the teal ball THROUGH the rimmed
    // aperture while the near room has none.
    commit(addEntity(scene, 'ball', { position: [6, 1.6, 0.7], radius: 0.7 }));
    probe.position = [0, -3.2, 1.2]; selected = null;
    look(Math.PI / 2, -0.12);
    draw();
    shot = canvas.toDataURL('image/png');
    shots.push({ name: 'portal', data: shot });

    // A PICTURE OF A BOX ROOM, for the same reason. Every box check above is
    // a number, and a number cannot tell a square doorway from a round one,
    // or a crate from a sphere. Load the fixture an author would open, stand
    // where the wall, the doorway, the step and the crate are all in frame,
    // and look.
    scene = await fetchFixture('box-room');
    undo = []; redo = []; selected = null;
    probe.position = [0, -5.5, 1.5]; probe.velocity = [0, 0, 0]; probe.grounded = true;
    look(Math.PI / 2, -0.08);
    draw();
    check('the box room loads and stays a room', compileSceneField(scene).boxCount === 3);
    shots.push({ name: 'boxes', data: canvas.toDataURL('image/png') });

    // --- an ORIENTED box, which is where the two sides can silently part ---
    // The field transforms a query into the box's own frame; the shader has
    // to do the same, from the same forward and up, or a box collides turned
    // and draws square. Nothing in Node can see that: the field is right on
    // its own and the shader is right on its own, and only a picture taken
    // with a rotation applied shows them disagreeing. So this check renders
    // the SAME box twice, once turned, and requires the screen to change.
    scene = await fetchFixture('oriented-room');
    undo = []; redo = []; selected = null;
    probe.position = [0, -5, 1.3]; probe.velocity = [0, 0, 0]; probe.grounded = true;
    look(Math.PI / 2, -0.06);
    draw();
    const turnedField = compileSceneField(scene);
    const crate = turnedField.entities().find((e) => e.id === 'crate');
    check('the v2 fixture keeps its authored frame', !!crate.frame);
    check('and a v2 document is accepted as it was written', turnedField.boxCount === 2);
    const turnedShot = pixels();

    // The same crate, frame removed. If the shader ignored the frame these
    // two pictures would be identical, which is exactly the bug.
    const square = compileSceneField(scene).document();
    delete square.entities.find((e) => e.id === 'crate').frame;
    commit(square);
    draw();
    check('A TURNED BOX DOES NOT DRAW LIKE A SQUARE ONE',
      pixels().some((v, i) => v !== turnedShot[i]));
    $('undo').click(); draw();

    // And the two sides agree about WHERE it is: a ray fired down the camera
    // axis hits the crate at the distance the field says, so what is drawn is
    // what would be collided with.
    const eye = probe.position.slice();
    const aim = basis().f;
    const cast = compileSceneField(scene).rayCast(eye, aim);
    check('the field resolves the view ray analytically', cast.hit && !cast.exhausted);
    check('and reports which solid it belongs to', typeof cast.owner === 'string');
    shots.push({ name: 'oriented', data: canvas.toDataURL('image/png') });


    setPlaying(false);
    check('no GL errors', gl.getError() === gl.NO_ERROR);
  } catch (error) { err = error.stack; }
  await fetch('/__report', {
    method: 'POST',
    body: JSON.stringify({ err, boot: $('boot').textContent, hud: 'E3 scene authoring lab', px: 'render compared', checks, shot, shots }),
  });
}
