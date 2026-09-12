// MUSE-64: independent portal-removal / anchor-reorientation truth (Node-only).
//
// Scope: adversarial cases NOT re-proven here (see portal-removal.test.js):
// basic saved-graph removal, upload refusal, zero-pair render, file round-trip.
// This file pins: saved-graph removal AFTER swap/base-migration, unsafe-restore
// undo refusal with history retained, halted-motion refusal, cover-anchor
// reframe after transport (construction frame vs camera frame), and one
// isolated invalid graph showing the checks can fail. No engine changes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createConnectedGlobalPreview } from './app/connected-global-model.js';
import { removeConnectedPortalPair } from './engine/world/connected-cover-edit.js';
import { packConnectedWorld } from './engine/geometry/connected-shader.js';

const fixture = JSON.parse(fs.readFileSync('levels/fixtures/connected-global.nil.json', 'utf8'));
const preview = () => createConnectedGlobalPreview(fixture, { installWorld: packConnectedWorld });
const close = (a, b, eps = 1e-9) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < eps);

// 1. Removal after a two-pair swap deletes the SAVED endpoints, not originals.
{
  const m = preview();
  m.reconnectPortals([
    { id: 'enter-sphere', a: 'flat-entry', b: 'sphere-exit' },
    { id: 'leave-sphere', a: 'sphere-entry', b: 'flat-return' },
  ]);
  m.removePortalPair('enter-sphere');
  const doc = m.document();
  assert.deepEqual(doc.connections.map(c => c.id), ['leave-sphere']);
  assert.ok(!doc.coverRegions[0].entities.some(e => e.id === 'sphere-exit'), 'saved endpoint sphere-exit removed');
  assert.ok(doc.coverRegions[0].entities.some(e => e.id === 'sphere-entry'), 'partner sphere-entry retained');
  assert.ok(!doc.baseScene.entities.some(e => e.id === 'flat-entry'), 'saved endpoint flat-entry removed');
  assert.equal(m.world.portals.find(p => p.fromId === 'sphere-entry').toId, 'flat-return');
  console.log('1. swap-then-remove uses saved endpoints passed');
}

// 2. Base-owned link migrates to the envelope on reconnect, then removes cleanly.
{
  const base = structuredClone(fixture);
  base.connections = [];
  base.baseScene.connections = [{ id: 'local', kind: 'portal', a: 'flat-entry', b: 'flat-return', velocity: 'preserve-speed', scale: 1 }];
  const m = createConnectedGlobalPreview(base, { installWorld: packConnectedWorld });
  m.reconnectPortals([{ id: 'local', a: 'flat-entry', b: 'flat-return' }]);
  assert.equal(m.document().baseScene.connections.length, 0, 'rewritten base link migrates to envelope');
  assert.equal(m.document().connections.at(-1).id, 'local');
  m.removePortalPair('local');
  const doc = m.document();
  assert.equal(doc.connections.filter(c => c.id === 'local').length, 0);
  assert.equal(doc.baseScene.connections.length, 0);
  assert.ok(doc.baseScene.entities.every(e => e.kind !== 'anchor'), 'both base anchors removed from owner');
  assert.equal(doc.coverRegions[0].entities.filter(e => e.kind === 'anchor').length, 2, 'cover anchors untouched');
  m.undoEdit();
  assert.equal(m.document().connections.at(-1).id, 'local', 'undo restores migrated pair');
  console.log('2. base-migration-then-remove passed');
}

// 3. Undo after movement makes the restored aperture unsafe: refusal retains history.
{
  const m = preview();
  m.removePortalPair('enter-sphere');
  for (let i = 0; i < 8; i++) m.act('forward');
  assert.ok(Math.abs(m.state.position[1]) < 1e-9, 'player now stands where the aperture was');
  const before = m.state;
  assert.throws(() => m.undoEdit(), /player on a portal aperture/);
  assert.equal(m.state, before, 'refused undo keeps state identity');
  assert.equal(m.canUndo, true, 'refusal retains undo authority');
  m.act('back');
  m.undoEdit();
  assert.equal(m.world.portals.length, 4, 'stepping clear lets undo restore 4 portals');
  console.log('3. unsafe-restore undo refusal passed');
}

// 4. Halted motion refuses removal and edits until reset.
{
  const m = preview();
  m.act('reset');
  m.advance(0, [0, 0, 0], { yaw: Math.PI });
  let n = 0;
  for (; n < 400 && !m.halted; n++) m.advance(.04, [0, 1, 0]);
  assert.ok(m.halted && /domain-exit/.test(m.motion), `expected extent halt, got ${m.motion} after ${n}`);
  const frozen = m.state, undo = m.canUndo;
  assert.throws(() => m.removePortalPair('enter-sphere'), /Reset the halted movement/);
  assert.throws(() => m.editEntities([{ id: 'flat-entry', patch: { forward: [1, 0, 0], up: [0, 0, 1] } }]), /Reset the halted movement/);
  assert.equal(m.state, frozen, 'halted refusal freezes state');
  assert.equal(m.canUndo, undo, 'halted refusal keeps history');
  m.act('reset');
  assert.equal(m.halted, false);
  console.log(`4. halted refusal passed (halt after ${n} advances)`);
}

// 5. Cover-anchor reframe after transport: partner and camera unchanged,
//    construction frame changed. Construction forward/up (saved author vectors)
//    are NOT the player camera frame.
{
  const m = preview();
  for (let i = 0; i < 8; i++) m.act('forward');
  assert.equal(m.state.regionId, 'sphere', 'player transported to sphere');
  assert.ok(close(m.state.position, [0, 0, 0, 1], 1e-3), `explicit transported pose, got ${JSON.stringify(m.state.position)}`);
  const partner = structuredClone(m.document().baseScene.entities.find(e => e.id === 'flat-return'));
  const camFwd = m.state.camera.forward.slice(), camUp = m.state.camera.up.slice();
  const normalBefore = m.world.portals.find(p => p.fromId === 'sphere-exit').normal.slice();
  m.editEntities([{ id: 'sphere-exit', patch: { forward: [1, 0, 0], up: [0, 1, 0] } }]);
  const doc = m.document();
  assert.deepEqual(doc.baseScene.entities.find(e => e.id === 'flat-return'), partner, 'partner anchor untouched');
  assert.ok(close(m.state.camera.forward, camFwd) && close(m.state.camera.up, camUp), 'transported camera untouched');
  const saved = doc.coverRegions[0].entities.find(e => e.id === 'sphere-exit');
  assert.deepEqual([saved.forward, saved.up], [[1, 0, 0], [0, 1, 0]], 'construction frame updated');
  assert.ok(!close(saved.forward, m.state.camera.forward.slice(0, 3)), 'construction frame is not the camera frame');
  const normalAfter = m.world.portals.find(p => p.fromId === 'sphere-exit').normal.slice();
  assert.ok(close(normalBefore,[0,0,0,-1]), 'original exit-chart normal matches its authored basis');
  assert.ok(close(normalAfter,[0,0,1,0]), 'rotated normal matches explicit exit-chart basis');
  assert.ok(!close(normalBefore, normalAfter), 'directed portal frame changed');
  console.log('5. cover reframe preserves partner/camera passed');
}

// 6. Isolated invalid graph (in-memory clone; fixture/model untouched): a shared
//    endpoint across two connections makes removal refuse instead of cascading.
{
  const bad = structuredClone(fixture);
  bad.connections.push({ id: 'extra', kind: 'portal', a: 'flat-entry', b: 'flat-return', velocity: 'preserve-speed', scale: 1 });
  const saved = JSON.stringify(bad);
  assert.throws(() => removeConnectedPortalPair(bad, 'enter-sphere'), /referenced elsewhere/);
  assert.equal(JSON.stringify(bad), saved, 'refused removal leaves the graph byte-identical');
  assert.equal(JSON.stringify(fixture), JSON.stringify(JSON.parse(fs.readFileSync('levels/fixtures/connected-global.nil.json', 'utf8'))), 'fixture file untouched');
  console.log('6. shared-endpoint invalid graph refuses passed');
}

console.log('portal-removal-truth: swap/migration removal, unsafe undo, halt refusal, cover reframe, invalid graph passed');
