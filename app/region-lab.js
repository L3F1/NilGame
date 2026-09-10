// Host controls only: geometry, field queries and transported motion belong to
// the kernel. Every edit compiles before committing to the document/history.
import { compileRegionWorld, editRegionEntity } from '../engine/world/region-world.js';
import { stepRegionPlayer, turnRegionPlayer } from '../engine/world/region-motion.js';
import { createRegionRenderer } from '../engine/geometry/region-renderer.js';

const $ = id => document.getElementById(id);
const canvas = $('view'), params = new URLSearchParams(location.search);
const renderer = createRegionRenderer(canvas);
let world, state, selectedId, selectedRegion, playing = false, checking = false;
let undo = [], redo = [], keys = new Set(), jumpPending = false, lastTime = null;
let loadSequence = 0, raf;
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
  playing = false; keys.clear(); jumpPending = false;
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  $('play').textContent = 'Play from region spawn';
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
function draw() {
  if (!world || !state) return;
  const rect = canvas.getBoundingClientRect(), scale = Math.min(devicePixelRatio || 1, 1.5);
  const width = Math.max(1, Math.round(rect.width * scale)), height = Math.max(1, Math.round(rect.height * scale));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  renderer.draw(world, state, { selectedId });
  const r = world.regions.get(state.regionId), e = entity();
  const clearance = r.field.distance(state.position) - state.radius;
  const distance = e?.regionId === state.regionId ? r.space.distance(state.position, r.space.decode(e.position)) : null;
  const number = x => Number.isFinite(x) ? x.toFixed(3) : String(x);
  $('view-label').textContent = `${state.regionId} · ${r.descriptor.geometry.kind.toUpperCase()}${playing ? ' · playing' : ' · preview'}`;
  $('metrics').textContent = `Player radius ${number(state.radius)} design units\nSurface clearance ${number(clearance)}\n${distance === null ? 'Selected entity is in another region' : `Intrinsic distance to entity center ${number(distance)}`}\nPortal crossings ${state.transits || 0}${state.grounded ? ' · grounded' : ''}${state.stalled ? ' · unresolved movement' : ''}${state.blocked ? ` · ${state.blocked}` : ''}`;
}
function install(document, { history = false, resetHistory = false } = {}) {
  const next = compileRegionWorld(document);
  const regionId = next.regions.has(selectedRegion) ? selectedRegion : undefined;
  const spawn = next.spawn(regionId); // Validate the complete transaction first.
  if (history) { undo.push(world.document()); redo = []; }
  if (resetHistory) { undo = []; redo = []; }
  stop(); world = next; state = spawn; selectedRegion = state.regionId;
  refresh();
}
async function loadFixture(name) {
  const ticket = ++loadSequence;
  if (!['s3-room', 'connected-room', 'oriented-room'].includes(name)) throw new Error('Unknown fixture.');
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
  message('Edit applied. Player reset to region spawn.');
}
function historyStep(from, to) {
  if (!from.length) return;
  const document = from.at(-1), previous = world.document();
  install(document); from.pop(); to.push(previous); refresh(); message('Scene history restored.');
}
function startPlay({ pointer = true } = {}) {
  state = world.spawn(selectedRegion); playing = true; keys.clear(); jumpPending = false;
  $('play').textContent = 'Restart from region spawn'; draw();
  if (pointer && !checking) canvas.requestPointerLock?.()?.catch?.(failure);
}
function advance(dt) {
  const gravity = $('gravity').checked;
  const wish = [Number(keys.has('KeyD')) - Number(keys.has('KeyA')), Number(keys.has('KeyW')) - Number(keys.has('KeyS')),
    gravity ? 0 : Number(keys.has('Space')) - Number(keys.has('ShiftLeft') || keys.has('ShiftRight'))];
  const previousRegion = state.regionId;
  state = stepRegionPlayer(world, state, dt, { wish, gravity, jump: jumpPending });
  jumpPending = false;
  if (previousRegion !== state.regionId) { selectedRegion = state.regionId; selectedId = undefined; refresh(); }
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
$('reset').onclick = guarded(() => { stop(); state = world.spawn(selectedRegion); draw(); });
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
  if (playing && document.pointerLockElement === canvas) { state = turnRegionPlayer(world, state, -event.movementX * .002, -event.movementY * .002); draw(); }
}));
document.addEventListener('keydown', event => {
  if (event.code === 'Escape') { stop(); draw(); return; }
  if (!playing || event.target.closest?.('input,select,textarea,button')) return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
    event.preventDefault(); keys.add(event.code); if (event.code === 'Space' && !event.repeat) jumpPending = true;
  }
});
document.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => { keys.clear(); jumpPending = false; });
window.addEventListener('resize', guarded(draw));
window.addEventListener('pagehide', () => { cancelAnimationFrame(raf); renderer.dispose(); });

// Browser integration checks invoke the same form and buttons as an author.
// This page does not own page-check's HTTP reporting endpoint.
export async function runRegionEditorChecks() {
  checking = true; stop(); const checks = [], shots = [];
  const check = (name, ok) => { checks.push({ name, ok: !!ok }); if (!ok) throw new Error(name); };
  const submit = () => $('editor').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  const selectEntity = id => { $('entities').value = id; $('entities').dispatchEvent(new Event('change')); };
  const pixels = () => {
    const gl = canvas.getContext('webgl2'); gl.finish(); const out = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, out);
    check('WebGL frame reads without errors', gl.getError() === gl.NO_ERROR); return out;
  };
  try {
    await loadFixture('s3-room');
    check('S3 fixture compiles to a four-component player', state.position.length === 4 && world.regions.get(state.regionId).descriptor.geometry.kind === 's3');
    const target = world.document().entities.find(e => e.kind === 'ball' && (!e.op || e.op === 'add'));
    check('S3 room has an editable metric ball', !!target); selectEntity(target.id);
    const before = JSON.stringify(world.document()), beforePixels = pixels();
    $('radius').value = target.radius * .7; submit();
    check('Radius form applies to document and field', ! $('boot').textContent && entity().radius === target.radius * .7);
    const afterPixels = pixels();
    check('An authored radius edit changes the rendered pixels', beforePixels.length === afterPixels.length && beforePixels.some((v, i) => v !== afterPixels[i]));
    $('undo').click(); check('Undo restores exact S3 document', JSON.stringify(world.document()) === before);
    $('redo').click(); check('Redo restores edited radius', entity().radius === target.radius * .7);
    const edited = JSON.stringify(world.document()); install(JSON.parse(edited));
    check('JSON roundtrip preserves curved scene ownership and values', JSON.stringify(world.document()) === edited);
    $('radius').value = -1; const historyCount = undo.length; submit();
    check('Unsupported edit rejects atomically with visible error', !!$('boot').textContent && JSON.stringify(world.document()) === edited && undo.length === historyCount);
    clearError(); updateInspector();
    shots.push({ name: 's3-authored-room', data: canvas.toDataURL('image/png') });
    startPlay({ pointer: false }); const start = state.position.slice(); $('gravity').checked = false;
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    for (let i = 0; i < 12; i++) advance(1 / 60);
    document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
    check('WASD handler moves in the spherical metric', world.regions.get(state.regionId).space.distance(start, state.position) > .01);
    check('S3 movement retains a finite transported camera frame', state.frame.flat().every(Number.isFinite) && state.position.every(Number.isFinite));
    stop(); $('gravity').checked = true;
    await loadFixture('oriented-room');
    const box = world.document().entities.find(e => e.kind === 'box' && (!e.op || e.op === 'add'));
    check('E3 fixture supplies an orientable box', !!box); selectEntity(box.id);
    write3(['fx', 'fy', 'fz'], [1, 0, 0]); write3(['ux', 'uy', 'uz'], [0, 0, 1]); submit();
    check('Construction frame edits through the inspector', !$('boot').textContent && entity().frame.forward[0] === 1);
    $('undo').click(); check('Frame edit undo preserves original frame', JSON.stringify(entity().frame) === JSON.stringify(box.frame));
    $('redo').click(); check('Frame edit redo restores orientation', entity().frame.forward[0] === 1);
    await loadFixture('connected-room');
    check('Connected fixture preserves E3 and S3 region ownership', new Set(world.document().regions.map(r => r.geometry.kind)).size === 2);
    const s3 = world.document().regions.find(r => r.geometry.kind === 's3');
    $('regions').value = s3.id; $('regions').dispatchEvent(new Event('change'));
    check('Region selector uses the selected region spawn', state.regionId === s3.id && state.position.length === 4);
    draw(); pixels(); shots.push({ name: 'connected-spherical-room', data: canvas.toDataURL('image/png') });
    return { kind: 'region-lab-check', checks, err: null, shots };
  } catch (error) { failure(error); return { kind: 'region-lab-check', checks, err: error.message || String(error), shots }; }
  finally { stop(); checking = false; }
}

await loadFixture(params.get('scene') || 's3-room');
raf = requestAnimationFrame(tick);
window.runRegionEditorChecks = runRegionEditorChecks;
if (params.get('check') === '1') {
  const report = await runRegionEditorChecks();
  window.regionEditorReport = report;
  if (window.parent !== window) window.parent.postMessage(report, location.origin);
}
