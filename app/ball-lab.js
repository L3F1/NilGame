// The scene lab: author E3 solids, then walk through them.
//
// Everything visible here comes from ONE compiled document. The renderer's
// uniforms and the collision field are built from the same entities, so the
// picture and the physics cannot drift apart -- which is the entire point of
// the query boundary this experiment exists to validate.
import { compileSceneField, editScene, addEntity, removeEntity } from '../engine/world/scene-field.js';
import { BALL_FIRST_PERSON_GLSL } from '../engine/geometry/ball-shader.js';
import { e3Space, clearance, resolveOverlap } from '../engine/world/collision.js';
import { stepWalker } from '../engine/world/walker.js';

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
const U = Object.fromEntries(['uBalls', 'uBallN', 'uPlanes', 'uPlaneN', 'uRes',
  'uEye', 'uFwd', 'uRight', 'uUp', 'uExtent', 'uSelected',
  'uPortals', 'uPortalNml', 'uPortalExit', 'uPortalMap', 'uPortalN']
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
let yaw = Math.PI / 2, pitch = -0.15, playing = false, last = null, note = '';
let transited = 0;
const keys = new Set();
const SPEED = 3.2;
const gravityOn = () => $('gravity').checked;

function basis() {
  // right = normalize(forward x worldUp), up = right x forward. Getting the
  // sign of `right` wrong negates `up` with it, which rotates the whole view a
  // half turn about the forward axis -- it draws the FLOOR ABOVE THE HORIZON
  // and reads as a plane-equation bug rather than a camera one.
  const cp = Math.cos(pitch);
  const f = [Math.cos(yaw) * cp, Math.sin(yaw) * cp, Math.sin(pitch)];
  const r = [Math.sin(yaw), -Math.cos(yaw), 0];
  return { f, r, u: [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]] };
}
/**
 * Point the camera along a world direction.
 *
 * A TRANSIT ROTATES THE WORLD, and the camera is the host's, not the engine's,
 * so nothing carries it through unless this does. Skipping it is not a subtle
 * visual error: the walker emerges facing back the way they came, walks
 * straight into the far aperture again, and the portal reads as broken.
 *
 * Yaw and pitch are recovered rather than a full frame kept, which silently
 * drops ROLL. That is right for a walker whose up is the world's up and wrong
 * the moment an aperture is tilted -- so it is a limit of this camera, not of
 * `portal.mapVector`, and the place to fix it when a wall portal exists.
 */
function aimAlong(f) {
  const n = Math.hypot(...f);
  if (!(n > 1e-9)) return;
  yaw = Math.atan2(f[1], f[0]);
  pitch = Math.asin(Math.max(-1, Math.min(1, f[2] / n)));
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
    li.innerHTML = `<span>${e.id}</span><span class="kind">${e.kind}</span>`;
    li.onclick = () => { selected = e.id; draw(); };
    list.appendChild(li);
  }
  const e = selectedEntity(field);
  // The inspector shows only the fields the selected kind actually has, so it
  // cannot offer a radius for a spawn or a normal for a ball.
  $('radius-field').hidden = !e || e.radius === undefined;
  $('up-field').hidden = !e || e.kind !== 'plane';
  $('editor').hidden = !e;
  $('inspector-title').textContent = e ? `Inspector — ${e.id} (${e.kind})` : 'Inspector';
  $('delete').disabled = !e;
  if (e) {
    ['x', 'y', 'z'].forEach((id, i) => { $(id).value = e.position[i]; });
    if (e.radius !== undefined) $('radius').value = e.radius;
    if (e.kind === 'plane') ['ux', 'uy', 'uz'].forEach((id, i) => { $(id).value = e.up[i]; });
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
  gl.uniform4fv(U.uBalls, balls.length ? balls : [0, 0, 0, -1]);
  gl.uniform1i(U.uBallN, field.ballCount);
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
  // Which BALL is selected, as an index into the ball array the shader loops
  // over -- not the entity index, which counts spawns and planes too.
  const ballIds = field.entities().filter((e) => e.kind === 'ball').map((e) => e.id);
  gl.uniform1i(U.uSelected, ballIds.indexOf(selected));
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  drawList(field);
  const gap = clearance(field, probe.position, probe.radius);
  const gates = field.portalCount ? `, ${field.portalCount / 2} portal${field.portalCount === 2 ? '' : 's'}` : '';
  $('query').textContent = `${field.solidCount} solid${field.solidCount === 1 ? '' : 's'}${gates}.`
    + ` Player clearance ${gap.toFixed(3)}${gap < 0 ? ' — OVERLAPPING' : ''}`
    + `${probe.grounded ? ', on the ground' : ''}`
    + `${transited ? `, ${transited} transit${transited === 1 ? '' : 's'}` : ''}`
    + `.${note ? ' ' + note : ''}`;
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
  for (const transit of out.transits) { aimAlong(transit.portal.mapVector(basis().f)); transited++; }
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
    if (entity.kind === 'plane') {
      const up = ['ux', 'uy', 'uz'].map((k) => Number($(k).value));
      const n = Math.hypot(...up);
      if (!(n > 1e-9)) throw new Error('A plane normal cannot be zero length');
      // Normalise for the author: the schema demands a unit normal, and
      // rejecting "0,0,2" for not being unit length would be pedantry.
      patch.up = up.map((x) => x / n);
    }
    commit(editScene(scene, entity.id, patch));
    $('status').textContent = `${entity.id} updated`;
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
$('add-plane').onclick = () => {
  try {
    const next = addEntity(scene, 'plane', { position: [0, 0, 3], up: [0, 0, -1] });
    commit(next);
    selected = compileSceneField(next).entities().at(-1).id;
    draw();
    $('status').textContent = `added ${selected} (a ceiling; edit its normal to re-aim it)`;
  } catch (error) { $('status').textContent = error.message; }
};
$('delete').onclick = () => {
  try {
    const id = selected;
    commit(removeEntity(scene, id));
    selected = null; draw();
    $('status').textContent = `deleted ${id}`;
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
  yaw -= e.movementX * 0.0025;
  pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * 0.0025));
});
new ResizeObserver(draw).observe(canvas);
draw();

// Opt-in executable smoke check, served by page-check --ball-lab.
if (new URLSearchParams(location.search).has('check')) {
  const checks = [];
  const check = (name, ok) => { if (!ok) throw new Error(name); checks.push(name); };
  let err = '', shot = '';
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
    const savedPitch = pitch; pitch = 0;
    check('camera up points along world up', basis().u[2] > 0.99);
    check('camera right is perpendicular to forward',
      Math.abs(basis().r.reduce((a, x, i) => a + x * basis().f[i], 0)) < 1e-9);
    pitch = savedPitch;

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

    setPlaying(true);
    // Aim at the gate, which stands between the spawn and the far room, and
    // walk. One transit, and the camera must come out facing the way the
    // walker now moves -- without that it faces back at the aperture it left
    // and ping-pongs, which is the failure the kernel test measures at 70.
    aimAlong([0, 1, 0]);
    const beforeYaw = yaw;
    let saw = 0, sankThroughGate = false;
    for (let i = 0; i < 240; i++) {
      const f2 = compileSceneField(scene);
      const out = stepWalker(f2, space, probe, 1 / 60,
        { want: [Math.cos(yaw) * 3, Math.sin(yaw) * 3, 0], portals: f2.portals });
      for (const transit of out.transits) { aimAlong(transit.portal.mapVector(basis().f)); saw++; }
      probe.position = out.position; probe.velocity = out.velocity; probe.grounded = out.grounded;
      if (clearance(f2, probe.position, probe.radius) < -1e-3) sankThroughGate = true;
    }
    check('never sank while walking a portal room', !sankThroughGate);
    check('walking into the gate transits exactly once', saw === 1);
    check('and comes out at the far gate', probe.position[0] > 4);
    check('the camera turned with the walker', Math.abs(yaw - beforeYaw) > 0.1);
    check('still standing after the transit', probe.grounded);
    draw();
    check('a portal room does not render the same picture as a flat one',
      pixels().some((x, i) => x !== flat[i]));
    // A PICTURE OF A PORTAL, for a human to look at. Every check above can
    // pass on a view that is upside down or shows the near room twice; only
    // looking catches that. Stand back from gate-a, put a ball where gate-b
    // lets out, and the shot should show the teal ball THROUGH the rimmed
    // aperture while the near room has none.
    commit(addEntity(scene, 'ball', { position: [6, 1.6, 0.7], radius: 0.7 }));
    probe.position = [0, -3.2, 1.2]; selected = null;
    yaw = Math.PI / 2; pitch = 0;
    draw();
    shot = canvas.toDataURL('image/png');
    setPlaying(false);
    check('no GL errors', gl.getError() === gl.NO_ERROR);
  } catch (error) { err = error.stack; }
  await fetch('/__report', {
    method: 'POST',
    body: JSON.stringify({ err, boot: $('boot').textContent, hud: 'E3 scene authoring lab', px: 'render compared', checks, shot }),
  });
}
