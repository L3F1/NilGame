// MUSE-63: independent bounded checks of the portal authoring APIs (Node-only).
//
// Contract: docs/engineering/CONNECTED_PORTAL_AUTHORING.md.
// Method: exercise the ACTUAL transaction APIs
// createConnectedGlobalPreview.addPortalPair / reconnectPortals (plus
// undo/redo/loadDocument), not document reconstruction. The new E3/S3 pair is
// the deterministic bench-nook pair below; centre-route crossings use the real
// moveRegionProbe. Camera evidence uses a separately written anchor-frame map
// (own dot/cross/lift code over the author records plus space primitives;
// never portal.transit/carry), backed by tight unit/tangency checks.
//
// Deliberately NOT repeated here (covered by portal-authoring.test.js):
// radius/frame mismatch, player/spawn aperture refusal, host-upload refusal,
// directed-portal capacity, immutable-input checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createConnectedGlobalPreview } from './app/connected-global-model.js';
import { compileConnectedCoverWorld } from './engine/world/connected-cover-world.js';
import { moveRegionProbe } from './engine/world/region-motion.js';
import { createCameraFrame } from './engine/world/camera-frame.js';
import { packConnectedWorld } from './engine/geometry/connected-shader.js';

const fixture = JSON.parse(fs.readFileSync('levels/fixtures/connected-global.nil.json', 'utf8'));
const BODY = 0.25;
const SPEC = {
  id: 'bench-nook', radius: 0.9,
  a: { id: 'flat-bench', regionId: 'flat', position: [6, 0, 0], forward: [0, -1, 0], up: [0, 0, 1] },
  b: { id: 'sphere-nook', regionId: 'sphere', chartId: 'exit-chart', position: [1, 1, 0], forward: [1, 0, 0], up: [0, 0, 1] },
};

// ---- independent vector kit (no portal-map imports) ----
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => Math.hypot(...v);

// Lifted anchor basis from the AUTHOR record, decoded the way each ownership
// demands: base anchors through their region space, cover anchors through
// their own author chart (global S3 has no single decode). Written here from
// the documented frame convention (right = up x forward; entering side is
// +forward); never touches portal.transit/carry or compiled anchor frames.
function anchorRecord(doc, id) {
  return doc.baseScene.entities.find((e) => e.id === id)
    ?? doc.coverRegions.flatMap((r) => r.entities).find((e) => e.id === id);
}
function liftedBasis(world, doc, id) {
  const rec = anchorRecord(doc, id);
  if (rec.regionId) {
    const space = world.regions.get(rec.regionId).space;
    const center = space.decode(rec.position);
    const basis = space.frame(center);
    const lift = (v) => basis[0].map((_, i) => basis.reduce((s, b, j) => s + b[i] * v[j], 0));
    return {
      space, center,
      normal: lift(rec.forward), up: lift(rec.up), right: lift(cross(rec.up, rec.forward)),
    };
  }
  const coverDoc = doc.coverRegions.find((r) => r.entities.some((e) => e.id === id));
  const space = world.regions.get(coverDoc.id).space;
  const chartDoc = coverDoc.charts.find((c) => c.id === rec.chartId);
  const chart = space.chartAt(chartDoc.center, { extent: chartDoc.extent, basis: chartDoc.basis });
  const center = chart.decode(rec.position);
  const lift = (v) => chart.center.map((_, i) => chart.basis.reduce((s, b, j) => s + b[i] * v[j], 0));
  const carry = (v) => space.transport(chart.center, center, v);
  return {
    space, center,
    normal: carry(lift(rec.forward)), up: carry(lift(rec.up)), right: carry(lift(cross(rec.up, rec.forward))),
  };
}
// Expected exit direction of an entry vector v (tangent at the from-centre):
// frame components with the documented half turn, rebuilt in the to-basis,
// transported to the actual arrival point.
function expectExitDir(world, doc, fromId, toId, v, arrivalPos) {
  const A = liftedBasis(world, doc, fromId), B = liftedBasis(world, doc, toId);
  const c = [-dot(v, A.right), dot(v, A.up), -dot(v, A.normal)];
  const exitAtCenter = B.right.map((x, i) => c[0] * x + c[1] * B.up[i] + c[2] * B.normal[i]);
  const carried = B.space.transport(B.center, arrivalPos, exitAtCenter);
  return { dir: carried.map((x) => x / norm(carried)), space: B.space };
}

// ---- model harness with atomic-refusal helper ----
let packet;
const model = createConnectedGlobalPreview(fixture, {
  installWorld: (w) => { packet = packConnectedWorld(w); },
});
const json = () => JSON.stringify(model.document());
function refuses(action, pattern) {
  const before = {
    doc: json(), world: model.world, state: model.state,
    packet, undo: model.canUndo, redo: model.canRedo,
  };
  assert.throws(action, pattern);
  assert.equal(json(), before.doc, 'refused edit must leave the document untouched');
  assert.equal(model.world, before.world);
  assert.equal(model.state, before.state);
  assert.equal(packet, before.packet);
  assert.equal(model.canUndo, before.undo, 'refused edit must preserve history');
  assert.equal(model.canRedo, before.redo, 'refused edit must preserve history');
}

// ---- 1. fixed deterministic corpus of invalid final graphs ----
const badAdd = (mutate) => () => {
  const candidate = structuredClone(SPEC);
  mutate(candidate);
  return model.addPortalPair(candidate);
};
const corpus = [
  ['cover endpoint omits its chart', badAdd((s) => { delete s.b.chartId; }), /chart/],
  ['base endpoint names a chart', badAdd((s) => { s.a.chartId = 'exit-chart'; }), /must not name/],
  ['cover endpoint names an unknown chart', badAdd((s) => { s.b.chartId = 'no-such-chart'; }), /chart/],
  ['cover endpoint names an unknown region', badAdd((s) => { s.b.regionId = 'no-such-region'; }), /region/],
  ['duplicate anchor id', badAdd((s) => { s.b.id = 'flat-entry'; }), /unique/],
  ['self-loop reconnect', () => model.reconnectPortals(
    [{ id: 'enter-sphere', a: 'flat-entry', b: 'flat-entry' }]), /Invalid portal connection/],
  ['convergent batch steals one endpoint twice', () => model.reconnectPortals(
    [{ id: 'enter-sphere', a: 'flat-entry', b: 'flat-return' },
     { id: 'leave-sphere', a: 'sphere-entry', b: 'flat-return' }]), /already connected/],
  ['reconnect to an unknown anchor', () => model.reconnectPortals(
    [{ id: 'enter-sphere', a: 'flat-entry', b: 'no-such-anchor' }]), /Unknown or already connected/],
];
for (const [name, action, pattern] of corpus) refuses(action, pattern);
console.log(`invalid final-graph corpus refused atomically (${corpus.length} cases)`);

// ---- 2. redo survives a failed edit; ownership of a valid add ----
assert.equal(model.addPortalPair(structuredClone(SPEC)), true);
const doc = model.document();
const flatBench = doc.baseScene.entities.find((e) => e.id === 'flat-bench');
assert.ok(flatBench && flatBench.regionId === 'flat' && !Object.hasOwn(flatBench, 'chartId'),
  'base anchor must live in baseScene without a chart');
const sphereNook = doc.coverRegions[0].entities.find((e) => e.id === 'sphere-nook');
assert.ok(sphereNook && sphereNook.chartId === 'exit-chart', 'cover anchor must keep its author chart');
model.undoEdit();
assert.equal(model.canRedo, true);
refuses(badAdd((s) => { s.radius = -1; }), /./);
assert.equal(model.canRedo, true, 'failed edit must not consume the redo stack');
assert.equal(model.redoEdit(), true, 'redo after a failed edit must still restore the pair');
assert.equal(json(), JSON.stringify(doc), 'redo must restore the exact created document');
console.log('atomic history: failed edit preserves redo; redo restores the pair');

// ---- 3. rewritten-connection metadata retained; untouched base stays ----
const baseDoc = structuredClone(fixture);
baseDoc.connections = [];
baseDoc.baseScene.entities.push(
  { id: 'local63-a', kind: 'anchor', regionId: 'flat', position: [-6, 0, 0], radius: 0.9, forward: [0, 1, 0], up: [0, 0, 1] },
  { id: 'local63-b', kind: 'anchor', regionId: 'flat', position: [-6, 2, 0], radius: 0.9, forward: [0, -1, 0], up: [0, 0, 1] });
baseDoc.baseScene.connections.push(
  { id: 'local63', kind: 'portal', a: 'flat-entry', b: 'flat-return', velocity: 'preserve-speed', scale: 1 },
  { id: 'untouched63', kind: 'portal', a: 'local63-a', b: 'local63-b', velocity: 'preserve-speed', scale: 1 });
baseDoc.connections.push(
  { id: 'curved63', kind: 'portal', a: 'sphere-entry', b: 'sphere-exit', velocity: 'preserve-speed', scale: 1 });
const migrated = createConnectedGlobalPreview(baseDoc, { installWorld: packConnectedWorld });
migrated.reconnectPortals([
  { id: 'local63', a: 'flat-entry', b: 'sphere-entry' },
  { id: 'curved63', a: 'flat-return', b: 'sphere-exit' },
]);
assert.deepEqual(migrated.document().baseScene.connections.map((c) => c.id), ['untouched63'],
  'rewritten base link migrates; untouched base link keeps ownership');
assert.deepEqual(migrated.document().connections.find((c) => c.id === 'local63'),
  { id: 'local63', kind: 'portal', a: 'flat-entry', b: 'sphere-entry', velocity: 'preserve-speed', scale: 1 },
  'rewritten connection keeps its id, kind and portal policy metadata');
assert.equal(migrated.world.portals.find((p) => p.fromId === 'flat-entry').toRegionId, 'sphere');
migrated.undoEdit();
assert.deepEqual(migrated.document().baseScene.connections.map((c) => c.id), ['local63', 'untouched63']);
migrated.redoEdit();
assert.deepEqual(migrated.document().baseScene.connections.map((c) => c.id), ['untouched63']);
console.log('ownership: rewritten base link migrates with metadata; untouched base stays; undo/redo hold');

// ---- 4. created E3/S3 pair crosses after save/load and after reconnection ----
function crossCentre(world, doc, fromId, toId, start, entryDir) {
  const fromRegion = anchorRecord(doc, fromId).regionId
    ?? doc.coverRegions.find((r) => r.entities.some((e) => e.id === fromId)).id;
  const space = world.regions.get(fromRegion).space;
  let st = {
    regionId: fromRegion, position: start.slice(), velocity: entryDir.map((x) => x * 4), radius: BODY,
    camera: createCameraFrame(space, start.slice(), { forward: entryDir, up: [0, 0, 1] }),
  };
  const toRegionId = anchorRecord(doc, toId).regionId
    ?? doc.coverRegions.find((r) => r.entities.some((e) => e.id === toId)).id;
  const entryUp = st.camera.up.slice();
  let crossings = 0, steps = 0;
  while (st.regionId !== toRegionId && steps < 120) {
    const res = moveRegionProbe(world,
      { ...st, velocity: st.camera.forward.map((x) => x * 4) }, 0.25);
    st = res.state;
    crossings += res.crossings;
    steps += 1;
    if (res.status !== 'complete') break;
  }
  assert.equal(st.regionId, toRegionId, `centre crossing ${fromId} -> ${toId} must arrive`);
  assert.ok(crossings >= 1, 'crossing must record a crossing');
  // Independent anchor-frame expectation (own map above, never portal carry),
  // plus tight unit/tangency checks. A missing half turn would read near -1.
  const { dir: expected, space: toSpace } = expectExitDir(world, doc, fromId, toId, entryDir, st.position);
  const alignment = dot(st.camera.forward, expected);
  assert.ok(alignment > 1 - 1e-9, `carried camera must follow the anchor-frame map (dot ${alignment})`);
  const expectedUp = expectExitDir(world, doc, fromId, toId, entryUp, st.position).dir;
  assert.ok(dot(st.camera.up, expectedUp) > 1 - 1e-9, 'carried up must follow the frame map (roll is not free)');
  assert.ok(Math.abs(norm(st.camera.forward) - 1) < 1e-9, 'camera forward must stay unit');
  if (toSpace.kind === 's3') {
    assert.ok(Math.abs(dot(st.position, st.camera.forward)) < 1e-9, 'S3 camera must stay tangent');
  }
  assert.equal(st.camera.space, toSpace, 'camera must be transported, not rebuilt');
  return st;
}
// Simulated restart: file round-trip into a fresh model through loadDocument.
const saved = JSON.parse(JSON.stringify(model.document()));
const fresh = createConnectedGlobalPreview(structuredClone(fixture), { installWorld: packConnectedWorld });
fresh.loadDocument(saved);
assert.equal(JSON.stringify(fresh.document()), JSON.stringify(saved), 'save/load must preserve the pair');
const fwd = crossCentre(fresh.world, fresh.document(), 'flat-bench', 'sphere-nook', [6, -2, 0], [0, 1, 0]);
assert.ok(fresh.world.regions.get('sphere').space.distance(
  fwd.camera.position, fwd.position) <= 1e-9, 'transported camera must sit at the walker');
// Reverse through the same pair with the actual movement API.
{
  const world = fresh.world, sphere = world.regions.get('sphere');
  const portal = world.portals.find((p) => p.fromId === 'sphere-nook' && p.toRegionId === 'flat');
  const center = portal.center.slice(), normal = portal.normal.slice();
  const up0 = sphere.space.normalize(center, portal.renderData().up);
  const backPos = sphere.space.expAt(center, normal.map((x) => x * 1));
  const toward = sphere.space.normalize(backPos,
    sphere.space.transport(center, backPos, normal.map((x) => -x)));
  const back = {
    regionId: 'sphere', position: backPos, velocity: toward.map((x) => x * 2), radius: BODY,
    camera: createCameraFrame(sphere.space, backPos,
      { forward: toward, up: sphere.space.transport(center, backPos, up0) }),
  };
  const res = moveRegionProbe(world, back, 1.5);
  assert.equal(res.state.regionId, 'flat', 'reverse crossing must return to flat');
  const revExpected = expectExitDir(world, fresh.document(),
    'sphere-nook', 'flat-bench', normal.map((x) => -x), res.state.position);
  const revAlignment = dot(res.state.camera.forward, revExpected.dir);
  assert.ok(revAlignment > 1 - 1e-9,
    `reverse exit must follow the anchor-frame map (dot ${revAlignment})`);
  const revUp = expectExitDir(world, fresh.document(), 'sphere-nook', 'flat-bench', up0, res.state.position).dir;
  assert.ok(dot(res.state.camera.up, revUp) > 1 - 1e-9, 'reverse carried up must preserve the prescribed roll');
}
// Reconnect the two fixture pairs around the created pair, then cross it again.
fresh.reconnectPortals([
  { id: 'enter-sphere', a: 'flat-entry', b: 'sphere-exit' },
  { id: 'leave-sphere', a: 'sphere-entry', b: 'flat-return' },
]);
assert.equal(fresh.world.portals.find((p) => p.fromId === 'flat-bench').toId, 'sphere-nook',
  'created pair must survive the neighbouring reconnection');
crossCentre(fresh.world, fresh.document(), 'flat-bench', 'sphere-nook', [6, -2, 0], [0, 1, 0]);
console.log('crossing: created E3/S3 pair crosses both ways after save/load and after reconnection');

// ---- 5. isolated fail-demo: un-migrated final graph on a copy only ----
{
  const broken = structuredClone(fixture);
  broken.baseScene.entities.push({
    id: 'flat-bench', kind: 'anchor', regionId: 'flat',
    position: SPEC.a.position, radius: SPEC.radius, forward: SPEC.a.forward, up: SPEC.a.up,
  });
  broken.coverRegions[0].entities.push({
    id: 'sphere-nook', kind: 'anchor', chartId: 'exit-chart',
    position: SPEC.b.position, radius: SPEC.radius, forward: SPEC.b.forward, up: SPEC.b.up,
  });
  // The connection record is left in baseScene while one endpoint is
  // cover-owned: the base compiler cannot resolve it.
  broken.baseScene.connections.push(
    { id: 'bench-nook', kind: 'portal', a: 'flat-bench', b: 'sphere-nook', velocity: 'preserve-speed', scale: 1 });
  assert.throws(() => compileConnectedCoverWorld(broken), /unknown anchor sphere-nook/);
  assert.equal(json(), JSON.stringify(doc), 'fail-demo copy must not disturb the live model');
  console.log('fail-demo: un-migrated copy refused (unknown anchor sphere-nook); live sources untouched');
}

console.log('portal authoring API truth (MUSE-63): invalid-graph corpus, history, ownership, crossings passed');
