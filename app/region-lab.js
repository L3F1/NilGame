// Host controls only: geometry, field queries and transported motion belong to
// the kernel. Every edit compiles before committing to the document/history.
//
// THIS SLICE IS ONE S3 REGION AND FREE FLIGHT. There is no gravity control and
// no jump, because a curved support policy does not exist yet: `walker.js` is
// three-component world-up code and feeding it a four-vector would produce a
// walker that looked plausible and was standing on nothing. Motion is
// `moveRegionProbe` and only that -- the same coordinator the kernel tests
// pin -- and the camera is the carried frame, turned about its own axes with
// ROLL PRESERVED, because in free flight there is no up to be upright against.
//
// A scene this viewport cannot draw is refused with a message naming what it
// found. Two regions, a portal, or E3 all mean the picture would be a claim
// about somewhere the walker cannot get to from here.
import { compileRegionWorld, editRegionEntity } from '../engine/world/region-world.js';
import { moveRegionProbe } from '../engine/world/region-motion.js';
import { turn } from '../engine/world/camera-frame.js';
import { createRegionRenderer } from '../engine/geometry/region-renderer.js';

const $ = id => document.getElementById(id);
const canvas = $('view'), params = new URLSearchParams(location.search);
const renderer = createRegionRenderer(canvas);
const SPEED = 2.6;
let world, state, selectedId, selectedRegion, playing = false, checking = false;
let undo = [], redo = [], keys = new Set(), lastTime = null;
let loadSequence = 0, raf, motion = null;
const ids3 = ['x', 'y', 'z'];
const read3 = ids => ids.map(id => {
  const text = $(id).value.trim(), value = Number(text);
  if (!text || !Number.isFinite(value)) throw new Error('Enter a finite number in each coordinate.');
  return value;
});
const write3 = (ids, values) => ids.forEach((id, i) => { $(id).value = values[i]; });
const entity = () => world.document().entities.find(e => e.id === selectedId);
function message(text = '') { $('status').textContent = text; }
function failure(error) { $('boot').textContent = error.message || String(error); }
function clearError() { $('boot').textContent = ''; }
function guarded(fn) { return (...args) => { try { clearError(); return fn(...args); } catch (error) { failure(error); } }; }

function stop() {
  playing = false; keys.clear();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  $('play').textContent = 'Fly from region spawn';
}
function option(select, value, label) {
  const child = document.createElement('option'); child.value = value; child.textContent = label; select.append(child);
}
function updateInspector() {
  const e = entity(); $('editor').hidden = !e;
  if (!e) return;
  $('inspector-title').textContent = `${e.id} · ${e.kind}`;
  write3(ids3, e.position);
  const dimensions = ['box', 'geodesic-cell'].includes(e.kind);
  $('radius-field').hidden = e.radius === undefined;
  $('radius').disabled = e.radius === undefined;
  if (e.radius !== undefined) $('radius').value = e.radius;
  $('half-field').hidden = !dimensions;
  if (dimensions) write3(['hx', 'hy', 'hz'], e.halfExtent);
  $('half-label').textContent = e.kind === 'geodesic-cell' ? 'Geodesic face offsets' : 'Half dimensions';
  const forward = dimensions || e.kind === 'anchor', up = forward || e.kind === 'plane';
  $('forward-field').hidden = !forward; $('up-field').hidden = !up; $('frame-hint').hidden = !forward;
  if (forward) write3(['fx', 'fy', 'fz'], e.frame?.forward || e.forward || [0, 1, 0]);
  if (up) write3(['ux', 'uy', 'uz'], e.frame?.up || e.up || [0, 0, 1]);
}
function refresh() {
  const doc = world.document();
  if (!world.regions.has(selectedRegion)) selectedRegion = state.regionId;
  $('regions').replaceChildren();
  for (const r of doc.regions) option($('regions'), r.id, `${r.id} · ${r.geometry.kind.toUpperCase()}`);
  $('regions').value = selectedRegion;
  const entities = doc.entities.filter(e => e.regionId === selectedRegion);
  if (!entities.some(e => e.id === selectedId)) selectedId = entities.find(e => ['ball', 'box', 'geodesic-cell'].includes(e.kind))?.id || entities[0]?.id;
  $('entities').replaceChildren();
  for (const e of entities) option($('entities'), e.id, `${e.id} · ${e.kind}${e.op && e.op !== 'add' ? ` (${e.op})` : ''}`);
  $('entities').value = selectedId; updateInspector();
  $('undo').disabled = !undo.length; $('redo').disabled = !redo.length;
  draw();
}
/**
 * What the last movement request did, in the coordinator's own words.
 *
 * Every status except a plain completion is a REFUSAL of some kind, and the
 * host's job is to show it and stop -- not to retry the leftover time, which is
 * exactly how a walker ends up somewhere no motion could have taken them.
 */
function motionLine() {
  if (!motion) return 'Not flying';
  const detail = motion.detail ? ` (${motion.detail})` : '';
  const left = motion.timeRemaining > 1e-9 ? `, ${motion.timeRemaining.toFixed(4)} s unspent` : '';
  const owed = motion.pendingLift ? `, settle of ${motion.pendingLift.distance.toFixed(4)} still owed` : '';
  const events = motion.events.length ? `, ${motion.events.map(e => e.kind).join('/')}` : '';
  return `${motion.status}${detail}${left}${owed}${events}`;
}
function draw() {
  if (!world || !state) return;
  const rect = canvas.getBoundingClientRect(), scale = Math.min(devicePixelRatio || 1, 1.5);
  const width = Math.max(1, Math.round(rect.width * scale)), height = Math.max(1, Math.round(rect.height * scale));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  renderer.draw(world, state, { selectedId });
  const r = world.regions.get(state.regionId), e = entity();
  const clearance = r.field.distance([...state.position]) - state.radius;
  const distance = e?.regionId === state.regionId ? r.space.distance([...state.position], r.space.decode(e.position)) : null;
  const number = x => Number.isFinite(x) ? x.toFixed(3) : String(x);
  const chart = r.space.encode([...state.position]).map(number).join(', ');
  $('view-label').textContent = `${state.regionId} · S3 R=${r.space.curvatureRadius}${playing ? ' · flying' : ' · preview'}`;
  $('metrics').textContent = [
    `Player radius ${number(state.radius)} · surface clearance ${number(clearance)}`,
    `Chart position ${chart} (extent ${number(r.descriptor.extent)})`,
    distance === null ? 'Selected entity is in another region'
      : `Intrinsic distance to entity centre ${number(distance)}`,
    motionLine(),
    `${renderer.frameTime().toFixed(2)} ms/frame at ${canvas.width}x${canvas.height}`,
  ].join('\n');
}
/**
 * Compile, spawn and only THEN swap. A document that does not compile, or a
 * region this viewport cannot draw, must leave the editor exactly as it was.
 */
function install(document, { history = false, resetHistory = false } = {}) {
  const next = compileRegionWorld(document);
  const regionId = next.regions.has(selectedRegion) ? selectedRegion : undefined;
  const spawn = next.spawn(regionId); // Validate the complete transaction first.
  // Refuse before committing, so a rejected scene never becomes the editor's
  // state and there is nothing half-loaded to look at.
  renderer.draw(next, spawn, { selectedId: null });
  if (history) { undo.push(world.document()); redo = []; }
  if (resetHistory) { undo = []; redo = []; }
  stop(); world = next; state = spawn; selectedRegion = state.regionId; motion = null;
  refresh();
}
const FIXTURES = ['s3-room', 'oriented-room', 'portal-room'];
async function loadFixture(name) {
  const ticket = ++loadSequence;
  if (!FIXTURES.includes(name)) throw new Error('Unknown fixture.');
  const response = await fetch(`../levels/fixtures/${name}.nil.json`);
  if (!response.ok) throw new Error(`Could not load ${name}: HTTP ${response.status}`);
  const doc = await response.json();
  if (ticket !== loadSequence) return;
  selectedRegion = undefined; selectedId = undefined;
  install(doc, { resetHistory: true }); $('fixture').value = name; message('Scene loaded.');
}
function applyEdit(event) {
  event?.preventDefault();
  const e = entity(), patch = { position: read3(ids3) };
  if (e.radius !== undefined) {
    const value = $('radius').value.trim();
    if (!value) throw new Error('Enter a radius.');
    patch.radius = Number(value);
  }
  if (['box', 'geodesic-cell'].includes(e.kind)) {
    patch.halfExtent = read3(['hx', 'hy', 'hz']);
    patch.frame = { forward: read3(['fx', 'fy', 'fz']), up: read3(['ux', 'uy', 'uz']) };
  }
  if (e.kind === 'anchor') patch.forward = read3(['fx', 'fy', 'fz']);
  if (['anchor', 'plane'].includes(e.kind)) patch.up = read3(['ux', 'uy', 'uz']);
  install(editRegionEntity(world.document(), selectedId, patch), { history: true });
  message('Edit applied. Player reset to the validated region spawn.');
}
function historyStep(from, to) {
  if (!from.length) return;
  const document = from.at(-1), previous = world.document();
  install(document); from.pop(); to.push(previous); refresh(); message('Scene history restored.');
}
function startPlay({ pointer = true } = {}) {
  state = world.spawn(selectedRegion); playing = true; keys.clear(); motion = null;
  $('play').textContent = 'Restart from region spawn'; draw();
  if (pointer && !checking) canvas.requestPointerLock?.()?.catch?.(failure);
}
/**
 * One movement request, in the region's own metric.
 *
 * The wish is expressed in the CAMERA's basis and the camera's vectors are
 * already tangent at the player, so the velocity is a tangent vector without
 * any conversion -- and without a world up appearing anywhere. Free flight
 * means the control IS the velocity, so nothing accumulates between frames.
 */
function advance(dt) {
  const wish = [
    Number(keys.has('KeyD')) - Number(keys.has('KeyA')),
    Number(keys.has('KeyW')) - Number(keys.has('KeyS')),
    Number(keys.has('Space')) - Number(keys.has('ShiftLeft') || keys.has('ShiftRight')),
  ];
  const { camera } = state;
  const raw = camera.right.map((x, i) => x * wish[0] + camera.forward[i] * wish[1] + camera.up[i] * wish[2]);
  const length = Math.hypot(...raw);
  const velocity = length > 1e-9 ? raw.map(x => x * SPEED / length) : raw.map(() => 0);
  const result = moveRegionProbe(world, { ...state, velocity }, dt);
  motion = result;
  // The leftover time of a refusal is NOT replayed. The host shows it, and the
  // author steers, edits or resets.
  state = { ...result.state, position: [...result.state.position], velocity: [...result.state.velocity] };
}
function tick(time) {
  const dt = lastTime === null ? 0 : Math.min(.04, Math.max(0, (time - lastTime) / 1000)); lastTime = time;
  if (playing && !checking) {
    try { advance(dt); draw(); } catch (error) { stop(); failure(error); }
  }
  raf = requestAnimationFrame(tick);
}

$('editor').addEventListener('submit', guarded(applyEdit));
$('undo').onclick = guarded(() => historyStep(undo, redo));
$('redo').onclick = guarded(() => historyStep(redo, undo));
$('fixture').onchange = () => { clearError(); loadFixture($('fixture').value).catch(failure); };
$('regions').onchange = guarded(() => { stop(); selectedRegion = $('regions').value; state = world.spawn(selectedRegion); selectedId = undefined; refresh(); });
$('entities').onchange = guarded(() => { selectedId = $('entities').value; updateInspector(); draw(); });
$('play').onclick = guarded(() => startPlay()); $('stop').onclick = () => { stop(); draw(); };
$('reset').onclick = guarded(() => { stop(); state = world.spawn(selectedRegion); motion = null; draw(); });
$('save').onclick = guarded(() => {
  const data = JSON.stringify(world.document(), null, 2) + '\n';
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `${world.document().id}.nil.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); message('Scene JSON saved.');
});
$('load').onchange = async () => {
  const file = $('load').files[0]; if (!file) return;
  const ticket = ++loadSequence;
  try {
    const doc = JSON.parse(await file.text()); if (ticket !== loadSequence) return;
    clearError(); install(doc, { history: true }); message(`Loaded ${file.name}.`);
  } catch (error) { failure(error); }
  finally { $('load').value = ''; }
};
canvas.onclick = guarded(() => { if (playing && !checking) canvas.requestPointerLock?.()?.catch?.(failure); });
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== canvas && !checking) { stop(); draw(); } });
document.addEventListener('mousemove', guarded(event => {
  if (!playing || document.pointerLockElement !== canvas) return;
  // Turned about the frame's OWN axes and never realigned: in free flight there
  // is no up to be upright against, so the roll these leave behind is the
  // walker's real orientation rather than an error to correct.
  state = { ...state, camera: turn(state.camera, { yaw: -event.movementX * .002, pitch: -event.movementY * .002 }) };
  draw();
}));
document.addEventListener('keydown', event => {
  if (event.code === 'Escape') { stop(); draw(); return; }
  if (!playing || event.target.closest?.('input,select,textarea,button')) return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyE'].includes(event.code)) {
    event.preventDefault(); keys.add(event.code);
  }
  // Roll is a control here, not a side effect, because nothing else supplies one.
  if (event.code === 'KeyQ' || event.code === 'KeyE') {
    state = { ...state, camera: turn(state.camera, { roll: event.code === 'KeyQ' ? .05 : -.05 }) };
    draw();
  }
});
document.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('resize', guarded(draw));
window.addEventListener('pagehide', () => { cancelAnimationFrame(raf); renderer.dispose(); });

// Browser integration checks invoke the same form and buttons as an author.
export async function runRegionEditorChecks() {
  checking = true; stop(); const checks = [], shots = [];
  const check = (name, ok) => { checks.push({ name, ok: !!ok }); if (!ok) throw new Error(name); };
  const submit = () => $('editor').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  const selectEntity = id => { $('entities').value = id; $('entities').dispatchEvent(new Event('change')); };
  const pixels = () => {
    const gl = canvas.getContext('webgl2'); gl.finish();
    const out = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, out);
    check('WebGL frame reads without errors', gl.getError() === gl.NO_ERROR);
    return out;
  };
  const differs = (a, b) => a.length === b.length && a.some((v, i) => v !== b[i]);
  let timing = null;
  try {
    await loadFixture('s3-room');
    check('the S3 fixture compiles to a four-component player', state.position.length === 4
      && world.regions.get(state.regionId).descriptor.geometry.kind === 's3');
    check('the spawn carries the region camera, not a rebuilt basis', state.camera.space === world.regions.get(state.regionId).space);
    const drawn = pixels();
    check('the first draw puts something other than sky on the screen',
      drawn.some((v, i) => i % 4 !== 3 && v > 12));
    check('no boot error on load', !$('boot').textContent);

    // RENDER PARITY, at the eye: the clearance the shader marches against is
    // the clearance the walker collides with.
    const region = world.regions.get(state.regionId);
    const { packRegionScene, packedSample } = await import('../engine/geometry/region-shader.js');
    const packed = packRegionScene(world, state.regionId);
    let worst = 0;
    for (let i = 0; i < 40; i++) {
      const p = region.space.decode([-3 + i * 0.15, -3 + (i % 7) * 0.9, 0.4 + (i % 5) * 0.5]);
      worst = Math.max(worst, Math.abs(region.field.distance(p) - packedSample(packed, p).distance));
    }
    check('what is drawn equals what is collided with, at the eye and around it', worst < 1e-12);

    const target = world.document().entities.find(e => e.kind === 'ball' && (!e.op || e.op === 'add'));
    check('the S3 room has an editable metric ball', !!target); selectEntity(target.id);
    const before = JSON.stringify(world.document()), beforePixels = pixels();
    $('radius').value = target.radius * 1.6; submit();
    check('a radius edit applies to the document and the field',
      !$('boot').textContent && entity().radius === target.radius * 1.6);
    check('and changes the rendered pixels', differs(beforePixels, pixels()));
    $('undo').click(); check('undo restores the exact S3 document', JSON.stringify(world.document()) === before);
    $('redo').click(); check('redo restores the edited radius', entity().radius === target.radius * 1.6);
    const edited = JSON.stringify(world.document()); install(JSON.parse(edited));
    check('a JSON round trip preserves curved ownership and values', JSON.stringify(world.document()) === edited);
    $('radius').value = -1; const historyCount = undo.length; submit();
    check('an invalid edit is refused atomically, with a visible message',
      !!$('boot').textContent && JSON.stringify(world.document()) === edited && undo.length === historyCount);
    clearError(); updateInspector();
    shots.push({ name: 's3-authored-room', data: canvas.toDataURL('image/png') });

    // FREE FLIGHT through the coordinator, and a wall that stops it.
    // The frame loop is off while checking, so every comparison below draws
    // explicitly. The first attempt at this did not, and compared a post-flight
    // readback against a canvas that still held the pre-flight frame -- it
    // passed, because an unrelated radius edit had changed the pixels in
    // between. A check that can pass without the thing under test happening is
    // not a check.
    startPlay({ pointer: false });
    draw();
    const atSpawn = pixels();
    const start = [...state.position];
    keys.add('KeyW');
    for (let i = 0; i < 30; i++) advance(1 / 60);
    draw();
    check('W moves the player along a geodesic of the spherical metric',
      region.space.distance(start, [...state.position]) > 0.1);
    check('the carried frame stays finite and tangent after transported motion',
      [...state.camera.forward].every(Number.isFinite)
      && Math.abs(region.space.dot([...state.position], [...state.camera.forward], [...state.camera.up])) < 1e-9);
    check('the camera followed the player rather than staying at the spawn',
      region.space.distance([...state.camera.position], [...state.position]) < 1e-9);
    check('and the motion result is reported, not swallowed', !!motion && typeof motion.status === 'string');
    const flying = pixels();
    check('the drawn view changed because the player moved', differs(atSpawn, flying));
    shots.push({ name: 's3-flown-forward', data: canvas.toDataURL('image/png') });

    // Roll survives, because nothing stands the walker up in free flight.
    const beforeRoll = [...state.camera.up], levelPixels = pixels();
    for (let i = 0; i < 6; i++) {
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', bubbles: true }));
    }
    draw();
    check('roll is a real control in free flight, and nothing stands it back up',
      Math.hypot(...state.camera.up.map((x, i) => x - beforeRoll[i])) > 1e-3);
    check('and the rolled view reaches the screen', differs(levelPixels, pixels()));
    shots.push({ name: 's3-rolled', data: canvas.toDataURL('image/png') });

    // Collision: fly into the wall and stop short of it, not through it.
    keys.clear(); keys.add('KeyW');
    let steps = 0;
    while (steps++ < 600 && region.field.distance([...state.position]) - state.radius > 0.02) advance(1 / 60);
    check('flying into the room stops at a surface rather than inside one',
      region.field.distance([...state.position]) - state.radius > -1e-3);
    keys.clear();

    // Chart edge: the domain is not a wall, and the host says so.
    const far = moveRegionProbe(world, { ...state, velocity: state.camera.forward.map(x => x * 400) }, 1);
    check('a request past the chart edge reports a domain exit or a refusal',
      ['domain-exit', 'stopped', 'blocked-exit', 'budget-exhausted', 'unresolved', 'complete'].includes(far.status));
    check('and hands the unspent time back rather than replaying it',
      far.timeConsumed + far.timeRemaining > 0.999 && far.timeConsumed + far.timeRemaining < 1.001);

    // FRAME TIME, WITH A BARRIER THAT ACTUALLY BLOCKS. `gl.finish` is advisory
    // enough on ANGLE that a loop of draws can return before the GPU has done
    // any of them, and the first attempt at this duly reported 0.00 ms for
    // twenty frames of a 160-step marcher, which is not a number anybody should
    // have believed. A one-pixel readback cannot be deferred.
    const barrier = () => {
      const gl = canvas.getContext('webgl2');
      const one = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, one);
      return one;
    };
    barrier();
    const t0 = performance.now();
    const FRAMES = 30;
    for (let i = 0; i < FRAMES; i++) { renderer.draw(world, state, { selectedId }); barrier(); }
    const totalMs = performance.now() - t0;
    timing = { frames: FRAMES, totalMs, ...renderer.info() };
    check('the measured frame time is a real number greater than zero', totalMs > 0);
    check('thirty frames complete without a GL error', renderer.error() === 0);
    stop();

    // Scenes this viewport must refuse, by name, without drawing them.
    for (const [name, pattern] of [['oriented-room', /E3/], ['portal-room', /portal|connection/i]]) {
      const kept = JSON.stringify(world.document());
      // Routed through the page's own failure handler, exactly as the fixture
      // dropdown does it, so what the check reads is what an author would see.
      await loadFixture(name).catch(failure);
      check(`${name} is refused with a visible message`, !!$('boot').textContent && pattern.test($('boot').textContent));
      check(`${name} leaves the previous scene loaded`, JSON.stringify(world.document()) === kept);
    }
    clearError(); await loadFixture('s3-room');
    check('and the supported scene still loads afterwards', !$('boot').textContent);

    return { kind: 'region-lab-check', checks, err: null, shots, timing };
  } catch (error) {
    failure(error);
    return { kind: 'region-lab-check', checks, err: error.stack || String(error), shots, timing };
  } finally { stop(); checking = false; }
}

await loadFixture(params.get('scene') || 's3-room');
raf = requestAnimationFrame(tick);
window.runRegionEditorChecks = runRegionEditorChecks;
if (params.get('check') === '1') {
  const report = await runRegionEditorChecks();
  window.regionEditorReport = report;
  await fetch('/__report', {
    method: 'POST',
    body: JSON.stringify({
      err: report.err, boot: $('boot').textContent,
      hud: `S3 region viewport · ${report.timing ? `${(report.timing.totalMs / report.timing.frames).toFixed(2)} ms/frame` : 'no timing'}`,
      px: 'render compared', checks: report.checks, shots: report.shots, timing: report.timing,
    }),
  });
}
