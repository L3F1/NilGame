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
import { moveRegionProbe, resumeRegionCorrection } from '../engine/world/region-motion.js';
import { turn } from '../engine/world/camera-frame.js';
import { motionPause } from './motion-pause.js';
import { createMouseLook } from './mouse-look.js';
const mouseLook = createMouseLook({sensitivity:.002});
import { createRegionRenderer } from '../engine/geometry/region-renderer.js';

const $ = id => document.getElementById(id);
const canvas = $('view'), params = new URLSearchParams(location.search);
const renderer = createRegionRenderer(canvas);
const SPEED = 2.6;
let world, state, selectedId, selectedRegion, playing = false, checking = false;
let undo = [], redo = [], keys = new Set(), lastTime = null;
let loadSequence = 0, raf, motion = null;
// Set when a movement request ENDS the session rather than merely limiting
// the frame. While it is set the host issues no further requests: only an
// explicit control -- resume, reset, an edit or a fixture load -- starts one.
let halted = null;
// Consecutive frames whose request did NOT simply complete.
//
// A debt-free refusal is allowed to carry on -- the state is settled and the
// next frame is a new request with a fresh budget -- but only while the host
// says so out loud. A single refused frame among sixty is a flicker in a
// metrics panel and reads as nothing; fifty in a row is a walker pinned
// against something, and the difference is the only thing that tells an author
// which they are looking at. MUSE-43 accepted the carry-on ON THIS CONDITION.
let refusalRun = 0;
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

/**
 * Put the refusal on the page and stop asking.
 *
 * The kernel's state is adopted either way -- it is the last VALIDATED state,
 * so it is safe to stand on and safe to draw. What this denies is CONTINUING
 * from it, which for an owed correction would spend a debt that was never paid
 * and for an unresolved query would replay a refusal until it happened to land
 * somewhere. See `motion-pause.js` for which statuses end a session and why.
 */
function halt(pause) {
  halted = pause;
  stop(); updateHalt(); draw();
}
function updateHalt() {
  $('halt').hidden = !halted;
  if (!halted) return;
  $('halt-text').textContent = halted.text;
  // TWO DIFFERENT ACTIONS, and offering the wrong one is the whole hazard.
  // `Finish correction` discharges the DEBT -- a separate operation, its own
  // budget, no gameplay time. `Resume` restarts NORMAL PLAY, and may not be
  // offered while anything is owed, because play from a half-corrected state
  // is the debt being spent rather than paid.
  $('finish').hidden = !halted.finishable;
  $('finish').disabled = !halted.finishable;
  $('resume').disabled = !halted.resumable;
}
/** The one recovery the contract requires to always be on offer. */
function resetToSpawn() {
  stop(); state = world.spawn(selectedRegion);
  motion = null; halted = null; refusalRun = 0; updateHalt(); draw();
  message('Player reset to the validated region spawn.');
}

function stop() {
  playing = false; keys.clear();
  mouseLook.reset(false, performance.now());
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
  const held = halted ? `PAUSED (${halted.kind}) — ` : '';
  const run = refusalRun > 1 ? `, ${refusalRun} frames running` : '';
  return `${held}${motion.status}${detail}${left}${owed}${events}${run}`;
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
  // A scene edit is one of the recoveries the contract names, so it clears
  // any pause: the document that stranded the player is no longer loaded.
  halted = null; refusalRun = 0; updateHalt();
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
  halted = null; refusalRun = 0; updateHalt();
  mouseLook.reset(document.pointerLockElement === canvas, performance.now());
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
function advance(dt, options) {
  // A HALTED SESSION IS OVER. Not throttled, not retried more slowly: over.
  // The refused request's unspent time is already discarded and is never
  // accumulated into whatever request comes next.
  if (halted) return motion;
  const wish = [
    Number(keys.has('KeyD')) - Number(keys.has('KeyA')),
    Number(keys.has('KeyW')) - Number(keys.has('KeyS')),
    Number(keys.has('Space')) - Number(keys.has('ShiftLeft') || keys.has('ShiftRight')),
  ];
  const { camera } = state;
  const raw = camera.right.map((x, i) => x * wish[0] + camera.forward[i] * wish[1] + camera.up[i] * wish[2]);
  const length = Math.hypot(...raw);
  const velocity = length > 1e-9 ? raw.map(x => x * SPEED / length) : raw.map(() => 0);
  // `options` exists so a check can tighten the kernel's own budgets and get a
  // REAL refusal out of a real scene rather than a hand-built result. Play
  // always passes nothing, and gets REGION_MOTION_DEFAULTS.
  const result = moveRegionProbe(world, { ...state, velocity }, dt, options);
  motion = result;
  // `dt` is this frame's own clock and nothing else: the refused request's
  // unspent time was discarded when it was reported, so a run of refusals
  // cannot bank time and spend it in one late frame.
  refusalRun = result.status === 'complete' || result.status === 'stopped'
    ? 0 : refusalRun + 1;
  // The leftover time of a refusal is NOT replayed. The host shows it, and the
  // author steers, edits or resets.
  state = { ...result.state, position: [...result.state.position], velocity: [...result.state.velocity] };
  // Status and pendingLift, never the clock: a correction can go unpaid beside
  // a timeRemaining that already reads zero, and a host watching only the clock
  // reads that frame as a completed move.
  const pause = motionPause(result);
  if (pause) halt(pause);
  return motion;
}
/** One frame's worth of accumulated mouse, applied once. */
function applyLook() {
  const look = mouseLook.drain();
  if (look.yaw || look.pitch) state = { ...state, camera: turn(state.camera, look) };
}
function tick(time) {
  const dt = lastTime === null ? 0 : Math.min(.04, Math.max(0, (time - lastTime) / 1000)); lastTime = time;
  if (playing && !checking) {
    applyLook();
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
$('reset').onclick = guarded(resetToSpawn);
$('halt-reset').onclick = guarded(resetToSpawn);
/**
 * Discharge the debt, and nothing else.
 *
 * The refused request's unspent time was discarded when it was reported and is
 * not handed to this: a correction costs queries and no gameplay time. The
 * result REPLACES the suspended one atomically, so the continuation just spent
 * cannot be presented again, and a partial correction comes back still owed --
 * with a fresh continuation at its new endpoint, so pressing again continues
 * rather than restarting.
 */
function finishCorrection(options) {
  if (!halted || !halted.finishable) return motion;
  const out = resumeRegionCorrection(world, motion, options);
  motion = out;
  if (out.status !== 'stale-continuation') {
    state = { ...out.state, position: [...out.state.position], velocity: [...out.state.velocity] };
  }
  halted = motionPause(out);
  if (!halted) {
    // Debt cleared. Play does NOT resume by itself: clearing a debt and
    // choosing to fly again are two decisions, and the second is the author's.
    halted = Object.freeze({ kind: 'corrected', resumable: true, finishable: false,
      status: out.status, detail: out.detail,
      text: `Correction finished: ${out.corrected.toExponential(3)} settled in `
        + `${out.steps} ${out.steps === 1 ? 'query' : 'queries'}, no gameplay time spent. `
        + 'Nothing is owed now, so play can resume as a new request.' });
  }
  updateHalt(); draw();
  message(out.status === 'stale-continuation'
    ? `The correction could not be finished: ${out.detail}.`
    : `Correction ${out.pendingLift ? 'partly ' : ''}applied.`);
  return out;
}
// `options` exists for the same reason `advance`'s does: a check tightens the
// kernel's own budget to reach a PARTIAL correction in a real scene. The button
// always passes nothing and gets CORRECTION_RESUME_DEFAULTS.
$('finish').onclick = guarded(() => finishCorrection());
$('resume').onclick = guarded(() => {
  if (!halted) return;
  if (!halted.resumable) throw new Error(halted.text);
  // A NEW REQUEST from the state the kernel validated, NOT a respawn and NOT a
  // replay: the refused request's unspent time stays discarded, and the clock
  // starts again from this frame.
  halted = null; motion = null; refusalRun = 0; playing = true; keys.clear(); lastTime = null;
  mouseLook.reset(document.pointerLockElement === canvas, performance.now());
  updateHalt(); message('New movement request from the last validated state.'); draw();
});
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
document.addEventListener('pointerlockchange', () => {
  mouseLook.reset(playing && document.pointerLockElement === canvas, performance.now());
  if (document.pointerLockElement !== canvas && !checking) { stop(); draw(); }
});
document.addEventListener('mousemove', guarded(event => {
  if (!playing || document.pointerLockElement !== canvas) return;
  // Turned about the frame's OWN axes and never realigned: in free flight there
  // is no up to be upright against, so the roll these leave behind is the
  // walker's real orientation rather than an error to correct.
  mouseLook.push(event.movementX, event.movementY, performance.now());
}));
addEventListener('blur', () => { mouseLook.reset(false, performance.now()); keys.clear(); });
addEventListener('focus', () => {
  mouseLook.reset(playing && document.pointerLockElement === canvas, performance.now());
});
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
    let region = world.regions.get(state.regionId);
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
    // Re-read the region: the JSON round trip above installed a NEW compiled
    // world, and the field and space captured before it belong to the old one.
    region = world.regions.get(state.regionId);
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

    // PAUSE AND RESET, on refusals the kernel really produced.
    //
    // A stranded player is how a settle goes unpaid: an author drags a wall
    // onto the spawn, or buries it in the floor, and the next frame's lift has
    // nothing left in the budget to settle back down with. Both states below
    // are built by putting the player INSIDE a solid of the loaded fixture and
    // asking the real coordinator to move them -- no hand-written results. The
    // debt case tightens `maxSteps`, which is the kernel's own knob and the one
    // the contract's "retry after a budget increase" language is about; the
    // unresolved case needs no knob at all.
    const { createCameraFrame } = await import('../engine/world/camera-frame.js');
    const strandAt = (chart) => {
      const position = region.space.decode(chart);
      const basis = region.space.frame(position);
      return { regionId: state.regionId, radius: state.radius, position,
        camera: createCameraFrame(region.space, position, { forward: basis[1], up: basis[2] }),
        velocity: basis[1].map(() => 0) };
    };

    startPlay({ pointer: false });
    state = strandAt([0, -3, -0.1]);          // buried under the floor
    keys.clear(); keys.add('KeyW');
    advance(1 / 60, { maxSteps: 2 });
    check('a settle the budget could not pay is reported as owed',
      !!motion.pendingLift && motion.pendingLift.distance > 0);
    check('and the host stops flying rather than spending the debt',
      !playing && !!halted && halted.kind === 'debt');
    check('the refusal is on the page, where the author is',
      !$('halt').hidden && /correction/i.test($('halt-text').textContent));
    // The key has to go back: `halt` clears them, so a second frame with an
    // empty wish would sit still whether the guard were there or not. Asserting
    // that `motion` is the SAME OBJECT is the direct statement -- no request was
    // issued at all, rather than one whose outcome happened to look static.
    const held = [...state.position], heldMotion = motion;
    keys.add('KeyW');
    advance(1 / 60);
    check('a halted session issues no further movement request',
      motion === heldMotion && held.every((x, i) => x === state.position[i]));
    keys.clear();
    check('and normal play is not offered while anything is owed',
      $('resume').disabled);
    $('halt-reset').click();
    check('reset returns the player to the validated spawn and clears the pause',
      !halted && $('halt').hidden && !playing
      && [...world.spawn(selectedRegion).position].every((x, i) => Math.abs(x - state.position[i]) < 1e-12));

    // FINISHING THE CORRECTION, which is a different action from resuming play.
    //
    // A walker resting on the floor drives at the far wall, is lifted clear so
    // it can slide, and the step budget runs out before the settle. The lift
    // really happened and the walker really is hovering, so the residual has
    // free space to travel through -- unlike the buried case above, where the
    // settle meets the floor it is already inside and completes at zero.
    startPlay({ pointer: false });
    state = strandAt([0, 1, 0.2501]);
    keys.clear(); keys.add('KeyW');
    advance(1 / 60, { maxSteps: 8 });
    keys.clear();
    check('a starved settle leaves the walker hovering, owing a real distance',
      !!motion.pendingLift && motion.pendingLift.distance > 1e-3
      && region.field.distance([...state.position]) - state.radius > 1e-3);
    check('and the debt comes with the authority to finish it',
      !!motion.continuation && halted?.kind === 'debt' && halted.finishable === true);
    check('so the page offers Finish correction, and still refuses to resume play',
      !$('finish').hidden && !$('finish').disabled && $('resume').disabled);

    const owed = motion.pendingLift.distance, hovering = [...state.position];
    const suspended = motion;
    $('finish').click();
    check('ONE press discharges the debt', motion.status === 'complete' && !motion.pendingLift);
    check('and it cost no gameplay time at all',
      motion.timeConsumed === 0 && motion.timeRemaining === 0);
    const settled = region.space.distance(hovering, [...state.position]);
    check('the walker moved by the residual, along it rather than by a velocity',
      Math.abs(settled - motion.corrected) < 1e-9 && motion.corrected > 1e-3
      && motion.corrected <= owed + 1e-15);
    check('the settled walker is resting on the surface, not inside it',
      region.field.distance([...state.position]) - state.radius > -1e-3);
    check('play does not restart by itself, but is now offerable',
      !playing && halted?.kind === 'corrected' && !halted.finishable && !$('resume').disabled);
    // The host CANNOT apply one continuation twice: the result it replaced its
    // suspended one with holds a different authority, and the spent one is
    // refused by the kernel even presented directly.
    const replay = resumeRegionCorrection(world, suspended);
    check('and the spent continuation cannot be applied a second time',
      replay.status === 'stale-continuation');
    check('a stale resume changes nothing and keeps the debt it could not pay',
      !!replay.pendingLift && replay.continuation === null
      && [...replay.state.position].every((x, i) => x === hovering[i]));
    // A DEBT WITH NO AUTHORITY LEFT offers only a reset. The host is built so
    // this cannot be reached by clicking -- every handler replaces the
    // suspended result -- so the panel is rendered from the real stale result
    // through the page's own `motionPause` and `updateHalt`, and put back after.
    const live = halted;
    halted = motionPause(replay); updateHalt();
    check('an unfinishable debt hides Finish correction and leaves only a reset',
      halted.kind === 'debt' && halted.finishable === false && $('finish').hidden
      && $('resume').disabled && !$('halt-reset').disabled);
    halted = live; updateHalt();
    $('resume').click();
    check('resuming after the debt clears is a new request', playing && !halted);
    stop();

    // A PARTIAL correction: pressed with a budget too small, it comes back
    // still owed, at a NEW endpoint, with fresh authority -- so pressing again
    // continues rather than starting over.
    startPlay({ pointer: false });
    state = strandAt([0, 1, 0.2501]);
    keys.clear(); keys.add('KeyW');
    advance(1 / 60, { maxSteps: 8 });
    keys.clear();
    const whole = owed, path = [];
    let presses = 0;
    while (halted?.finishable && presses < 20) {
      const before = motion.pendingLift.distance;
      finishCorrection({ maxSteps: 1 });
      presses++;
      path.push(motion.corrected);
      if (motion.pendingLift) {
        check('a partial correction takes exactly what it walked off the residual',
          Math.abs(motion.pendingLift.distance - (before - motion.corrected)) < 1e-15);
        check('and hands back fresh authority at its new endpoint', !!motion.continuation);
      }
    }
    check('repeated partial corrections converge on a cleared debt',
      presses > 1 && !motion.pendingLift && motion.status === 'complete');
    check('and together they walk the same distance the single press did',
      Math.abs(path.reduce((a, b) => a + b, 0) - whole) < 1e-3);
    stop(); resetToSpawn();

    // A scene edit is the other recovery, and it must not leave a debt
    // pointing at a floor that is no longer compiled.
    startPlay({ pointer: false });
    state = strandAt([0, 1, 0.2501]);
    keys.clear(); keys.add('KeyW');
    advance(1 / 60, { maxSteps: 8 });
    keys.clear();
    check('a debt is owed before the edit', !!halted && halted.kind === 'debt');
    selectEntity(world.document().entities.find(e => e.kind === 'ball').id);
    $('radius').value = 0.7; submit();
    check('an edit recompiles the scene and clears the pause with it',
      !$('boot').textContent && !halted && $('halt').hidden && !playing);
    $('undo').click();

    region = world.regions.get(state.regionId);
    startPlay({ pointer: false });
    state = strandAt([-1.5, 0, 0.75]);        // dead centre of the metric ball
    keys.clear(); keys.add('KeyW');
    advance(1 / 60);
    check('a contact the solver cannot resolve is unresolved, not a guess',
      motion.status === 'unresolved' && motion.timeRemaining > 0);
    check('which pauses the flight and keeps the edit controls',
      !playing && halted?.kind === 'unresolved' && !$('editor').hidden);
    check('an unresolved refusal MAY be retried, as a new request',
      !$('resume').disabled);
    const beforeResume = [...state.position];
    $('resume').click();
    check('and resuming neither respawns the player nor replays the refused time',
      playing && !halted && motion === null
      && beforeResume.every((x, i) => x === state.position[i]));
    stop(); keys.clear();
    resetToSpawn();

    // A REFUSAL THAT CARRIES ON, and is said out loud while it does.
    //
    // MUSE-43 derived the pause table from the contract independently and
    // agreed with it everywhere except one row: debt-free budget exhaustion,
    // where their reading said pause and the shipped policy carries on. They
    // adjudicated against the contract in favour of carrying on, ON CONDITION
    // that the host reports the refusal loudly and starts each retry with a
    // fresh budget and no accumulated time. This is that condition, checked.
    //
    // The refusal is real and it persists: flown out through the top of the
    // chart, the walker is stopped just inside and stays there, and every
    // further frame is refused the same way. Nothing is stranded, nothing is
    // owed, and an author who cannot see it happening has no way to tell this
    // from ordinary flight into a wall.
    startPlay({ pointer: false });
    state = strandAt([0, 0, 7.6]);
    // Aim at the chart edge rather than along the room's forward.
    const outward = region.space.frame([...state.position])[2];
    state = { ...state,
      camera: createCameraFrame(region.space, [...state.position],
        { forward: outward, up: region.space.frame([...state.position])[1] }) };
    keys.clear(); keys.add('KeyW');
    let refusals = 0, clockExact = true;
    for (let i = 0; i < 24; i++) {
      advance(1 / 60);
      if (motion.status !== 'complete' && motion.status !== 'stopped') refusals++;
      // No accumulation: each frame's clock is that frame's own dt, so a run
      // of refusals cannot bank time and spend it in one late frame.
      if (Math.abs(motion.timeConsumed + motion.timeRemaining - 1 / 60) > 1e-12) clockExact = false;
    }
    draw();
    check('flying out of the chart is refused, and stays refused, frame after frame',
      refusals > 10 && motion.status === 'domain-exit');
    check('with nothing owed, so it carries on rather than ending the session',
      !motion.pendingLift && !halted && playing);
    check('EVERY refused frame is charged its own dt and banks nothing',
      clockExact && motion.timeRemaining > 0);
    check('and the run is on the page, so a pinned walker is not a flicker',
      / \d+ frames running/.test($('metrics').textContent));
    const runShown = Number(/ (\d+) frames running/.exec($('metrics').textContent)[1]);
    check('the run counts the refusals rather than the frames', runShown === refusals);
    keys.clear();
    advance(1 / 60);
    draw();
    check('and a frame that completes clears the run',
      motion.status === 'stopped' && !/frames running/.test($('metrics').textContent));
    stop(); resetToSpawn();

    // POINTER LOCK AND SPIKES, through the page's own listeners.
    //
    // Node covers the filter in `mouse-look.js` directly and cannot cover the
    // WIRING: which listener is attached to what, whether the settle is armed
    // on the right transition, whether an unlock really stops the flight. So
    // this block dispatches real events at the real handlers, with `checking`
    // off and the frame loop suspended so nothing races the assertions.
    //
    // ONE THING HERE IS SIMULATED and it should be read as such: headless
    // Chrome will not grant pointer lock without a user gesture, so
    // `document.pointerLockElement` is shadowed for the duration and restored
    // afterwards. An operating system's mouse stream is still not covered by
    // anything here, and a hardware-specific snap would not show up.
    const lockOwn = Object.getOwnPropertyDescriptor(document, 'pointerLockElement');
    let lockedTo = null;
    Object.defineProperty(document, 'pointerLockElement',
      { configurable: true, get: () => lockedTo });
    cancelAnimationFrame(raf);
    checking = false;
    try {
      const move = (dx, dy) => document.dispatchEvent(
        new MouseEvent('mousemove', { movementX: dx, movementY: dy, bubbles: true }));
      const lock = (to) => { lockedTo = to; document.dispatchEvent(new Event('pointerlockchange')); };
      const settle = () => new Promise((done) => setTimeout(done, 300));
      // Nothing applied means the camera OBJECT was never replaced. Comparing
      // angles instead would hide a turn of 1e-16 behind a tolerance.
      const angle = (before) => Math.acos(Math.max(-1, Math.min(1,
        region.space.dot([...state.position], [...before], [...state.camera.forward]))));

      startPlay({ pointer: false });
      region = world.regions.get(state.regionId);
      let cam = state.camera;
      move(40, 0); applyLook();
      check('a fresh play session does not turn until the pointer is locked',
        state.camera === cam);

      lock(canvas);
      move(40, 0); applyLook();
      check('and a move inside the lock settle window is discarded too',
        state.camera === cam);

      await settle();
      move(40, 0); applyLook();
      check('after the settle an ordinary move turns the camera', angle(cam.forward) > 1e-4);

      // THE HANDLER'S OWN LOCK GUARD, with the filter armed behind it. The
      // check above cannot see this one: a fresh session leaves the filter
      // inactive anyway, so it passes whether the guard is there or not.
      // Dropping the lock WITHOUT the change event leaves the filter armed and
      // the lock gone, which is the only state where the guard does the work.
      lockedTo = null;
      cam = state.camera;
      move(40, 0); applyLook();
      check('a move with no pointer lock is refused even while the filter is armed',
        state.camera === cam);
      lockedTo = canvas;

      cam = state.camera;
      move(900, 0); applyLook();
      check('a pointer-lock spike is dropped rather than applied',
        state.camera === cam);

      // TWENTY-FIVE moves of 60, and the count is load-bearing. At this
      // sensitivity that is three radians of raw wish against a cap of six
      // tenths -- and three is under pi, which is the whole point. The angle
      // between two forwards WRAPS, so a burst big enough to wrap can land
      // back inside the cap's band by coincidence: the first version of this
      // check used a hundred moves, and with the cap deleted its twelve
      // radians read as 0.5664 and passed. Kept under pi, an uncapped turn
      // cannot be mistaken for a capped one.
      for (let i = 0; i < 25; i++) move(60, 0);
      applyLook();
      const burst = angle(cam.forward);
      check('a burst is accumulated once and capped inside the frame',
        burst > 0.5 && burst <= 0.6 + 1e-9);
      cam = state.camera; applyLook();
      check('and nothing is held back to snap on the next frame', state.camera === cam);

      keys.add('KeyW');
      dispatchEvent(new Event('blur'));
      move(40, 0); cam = state.camera; applyLook();
      check('losing focus clears the keys and the pending turn together',
        keys.size === 0 && state.camera === cam);

      lock(canvas);
      move(40, 0); cam = state.camera; applyLook();
      check('re-acquiring the lock arms a FRESH settle window',
        state.camera === cam);
      await settle();
      move(40, 0); cam = state.camera; applyLook();
      check('and turning resumes once that window has passed',
        state.camera !== cam);

      // The real frame loop, drawing and draining for itself. Object identity
      // is no use here: the carry rebuilds the frame every tick, so
      // `state.camera` is a new object each time whether anything turned or
      // not -- which is why the first version of this check passed with
      // `applyLook` deleted from the loop entirely. So measure BOTH: what a
      // still frame does to the numbers, and what a frame with a mouse move
      // does. The control is the half that makes the other half mean anything.
      const twoFrames = () => new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)));
      raf = requestAnimationFrame(tick);
      cam = state.camera;
      await twoFrames();
      const drift = Math.hypot(...[...state.camera.forward].map((x, i) => x - cam.forward[i]));
      cam = state.camera;
      move(40, 0);
      await twoFrames();
      const turned = Math.hypot(...[...state.camera.forward].map((x, i) => x - cam.forward[i]));
      check('the frame loop drains the accumulator itself, and a still frame does not',
        drift < 1e-9 && turned > 1e-3);

      lock(null);
      check('releasing the pointer lock stops the flight', !playing);
    } finally {
      checking = true;
      lockedTo = null;
      cancelAnimationFrame(raf);
      if (lockOwn) Object.defineProperty(document, 'pointerLockElement', lockOwn);
      else delete document.pointerLockElement;
      raf = requestAnimationFrame(tick);
      stop(); keys.clear();
    }
    check('the browser owns the pointer lock again after the check',
      Object.getOwnPropertyDescriptor(document, 'pointerLockElement') === undefined);
    resetToSpawn(); draw();
    shots.push({ name: 's3-after-input-lifecycle', data: canvas.toDataURL('image/png') });

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
