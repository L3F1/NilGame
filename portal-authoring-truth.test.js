// MUSE-62: pre-implementation portal-authoring truth (Node-only, no engine changes).
//
// Contract under test: docs/engineering/CONNECTED_PORTAL_AUTHORING.md.
// Method: clone levels/fixtures/connected-global.nil.json in memory, apply
// whole-graph document edits, validate with the CURRENT
// compileConnectedCoverWorld + moveRegionProbe. No kernel/app repairs, no new
// authoring API: the "transaction" is build-candidate-then-compile, and a
// throwing compile is the atomicity boundary (nothing is replaced).
//
// New pair under test (explicit author coordinates, pinned below):
//   flat-bench  E3  baseScene flat  position [6,0,0] forward [0,-1,0] up [0,0,1]
//   sphere-nook S3  sphere exit-chart position [1,1,0] forward [1,0,0] up [0,0,1]
//   bench-nook  envelope portal connection, shared aperture radius 0.9.
// Body radius is 0.25 (fixture playerRadius).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileConnectedCoverWorld } from './engine/world/connected-cover-world.js';
import { moveRegionProbe } from './engine/world/region-motion.js';
import { createCameraFrame } from './engine/world/camera-frame.js';

const fixture = JSON.parse(fs.readFileSync('levels/fixtures/connected-global.nil.json', 'utf8'));
const clone = () => structuredClone(fixture);
const BODY = 0.25;

const BENCH = {
  id: 'flat-bench', regionId: 'flat', kind: 'anchor',
  position: [6, 0, 0], radius: 0.9, forward: [0, -1, 0], up: [0, 0, 1],
};
const NOOK = {
  id: 'sphere-nook', kind: 'anchor', chartId: 'exit-chart',
  position: [1, 1, 0], radius: 0.9, forward: [1, 0, 0], up: [0, 0, 1],
};
const PAIR = {
  id: 'bench-nook', kind: 'portal',
  a: 'flat-bench', b: 'sphere-nook', velocity: 'preserve-speed', scale: 1,
};
// Candidate document carrying the whole pair: two anchors + connection.
function pairDoc() {
  const doc = clone();
  doc.baseScene.entities.push(structuredClone(BENCH));
  doc.coverRegions[0].entities.push(structuredClone(NOOK));
  doc.connections.push(structuredClone(PAIR));
  return doc;
}

// ---- 1. Atomic create: two new anchors + one pair compile as one graph ----
{
  const world = compileConnectedCoverWorld(pairDoc());
  assert.equal(world.spawn().radius, BODY);
  assert.equal(world.portals.length, 6, '2 fixture pairs x2 directions + 1 new pair x2');
  const fwd = world.portals.find((p) => p.fromId === 'flat-bench');
  const rev = world.portals.find((p) => p.fromId === 'sphere-nook');
  assert.ok(fwd && rev, 'both portal directions must exist');
  assert.equal(fwd.toId, 'sphere-nook');
  assert.equal(fwd.toRegionId, 'sphere');
  assert.equal(fwd.fromRegionId, 'flat');
  assert.equal(fwd.radius, 0.9);
  assert.equal(rev.toId, 'flat-bench');
  assert.equal(rev.toRegionId, 'flat');
  // Atomicity: a failing candidate creates nothing observable. The pristine
  // fixture still compiles with its original 4 directional portals.
  const pristine = compileConnectedCoverWorld(clone());
  assert.equal(pristine.portals.length, 4);
  assert.deepEqual(
    pristine.portals.map((p) => p.id).sort(),
    ['enter-sphere', 'enter-sphere', 'leave-sphere', 'leave-sphere']);
  // Undo analogue at document level: removing the whole pair (both anchors
  // AND the connection) restores the original portal set.
  const doc = pairDoc();
  doc.baseScene.entities.splice(doc.baseScene.entities.findIndex((e) => e.id === 'flat-bench'), 1);
  doc.coverRegions[0].entities.splice(doc.coverRegions[0].entities.findIndex((e) => e.id === 'sphere-nook'), 1);
  doc.connections.splice(doc.connections.findIndex((c) => c.id === 'bench-nook'), 1);
  assert.equal(compileConnectedCoverWorld(doc).portals.length, 4);
}

// ---- 2. Valid E3/S3 centre crossing, transported camera, reverse crossing ----
{
  const world = compileConnectedCoverWorld(pairDoc());
  const flat = world.regions.get('flat');
  const sphere = world.regions.get('sphere');
  const startPos = [6, -2, 0]; // entering side of flat-bench (normal [0,-1,0])
  let st = {
    regionId: 'flat', position: startPos, velocity: [0, 4, 0], radius: BODY,
    camera: createCameraFrame(flat.space, startPos, { forward: [0, 1, 0], up: [0, 0, 1] }),
  };
  let crossings = 0, steps = 0;
  while (st.regionId !== 'sphere' && steps < 120) {
    const res = moveRegionProbe(world,
      { ...st, velocity: st.camera.forward.map((x) => x * 4) }, 0.25);
    st = res.state;
    crossings += res.crossings;
    steps += 1;
    if (res.status !== 'complete') break;
  }
  assert.equal(st.regionId, 'sphere', 'forward centre crossing must reach the sphere');
  assert.ok(crossings >= 1, 'forward crossing must record a crossing');
  assert.equal(st.camera.space, sphere.space, 'camera must be transported, not rebuilt');
  assert.ok(sphere.space.distance(st.camera.position, st.position) <= 1e-9,
    'transported camera must sit at the walker');
  assert.ok(Math.abs(sphere.space.norm(st.position, st.camera.forward) - 1) < 1e-9,
    'transported camera forward must stay unit');

  // Reverse: start 1 unit out along the sphere-side normal, aimed back
  // through the aperture centre, using the actual movement API.
  const portal = world.portals.find((p) => p.fromId === 'sphere-nook' && p.toRegionId === 'flat');
  assert.ok(portal, 'sphere-nook -> flat portal must exist');
  const center = portal.center.slice(), normal = portal.normal.slice();
  const rd = portal.renderData();
  const up0 = sphere.space.normalize(center, rd.up);
  const backPos = sphere.space.expAt(center, normal.map((x) => x * 1));
  const toward = sphere.space.normalize(backPos, sphere.space.transport(center, backPos, normal.map((x) => -x)));
  const upT = sphere.space.transport(center, backPos, up0);
  const back = {
    regionId: 'sphere', position: backPos,
    velocity: toward.map((x) => x * 2), radius: BODY,
    camera: createCameraFrame(sphere.space, backPos, { forward: toward, up: upT }),
  };
  const res = moveRegionProbe(world, back, 1.5);
  assert.equal(res.state.regionId, 'flat', `reverse crossing must return to flat, got ${res.state.regionId}`);
  assert.ok(res.crossings >= 1, 'reverse crossing must record a crossing');
  assert.equal(res.state.camera.space, flat.space, 'camera must be carried back to flat');
}

// ---- 3. Invalid graphs: occupied endpoint, radius/frame mismatch,
//        duplicate ID, unknown chart ----
{
  // Occupied endpoint: flat-entry already belongs to enter-sphere.
  const steal = clone();
  steal.coverRegions[0].entities.push(structuredClone(NOOK));
  steal.connections.push({
    id: 'steal-link', kind: 'portal',
    a: 'flat-entry', b: 'sphere-nook', velocity: 'preserve-speed', scale: 1,
  });
  assert.throws(() => compileConnectedCoverWorld(steal), /already connected/);

  // Radius mismatch between the two ends.
  const radii = pairDoc();
  radii.coverRegions[0].entities.find((e) => e.id === 'sphere-nook').radius = 0.5;
  assert.throws(() => compileConnectedCoverWorld(radii), /radii must match/);

  // Non-orthonormal construction frame (up parallel to forward).
  const frame = pairDoc();
  Object.assign(frame.baseScene.entities.find((e) => e.id === 'flat-bench'),
    { forward: [0, 1, 0], up: [0, 1, 0] });
  assert.throws(() => compileConnectedCoverWorld(frame), /orthonormal/);

  // Duplicate connection ID.
  const dup = pairDoc();
  dup.connections.push({ ...structuredClone(PAIR), a: 'flat-entry', b: 'sphere-entry' });
  assert.throws(() => compileConnectedCoverWorld(dup), /Duplicate world ID bench-nook/);

  // Unknown author chart.
  const chart = pairDoc();
  chart.coverRegions[0].entities.find((e) => e.id === 'sphere-nook').chartId = 'no-such-chart';
  assert.throws(() => compileConnectedCoverWorld(chart), /unknown chart/);
}

// ---- 4. Two-pair swap: intermediate graph invalid, final graph valid ----
// Fixture pairs: enter-sphere (flat-entry <-> sphere-entry),
//                leave-sphere (sphere-exit <-> flat-return).
// Swap to:       enter-sphere (flat-entry <-> sphere-exit),
//                leave-sphere (sphere-entry <-> flat-return).
{
  const sequential = clone();
  const a = sequential.connections.find((c) => c.id === 'enter-sphere');
  a.a = 'flat-entry'; a.b = 'sphere-exit';
  // leave-sphere still holds sphere-exit: endpoint used twice.
  assert.throws(() => compileConnectedCoverWorld(sequential), /already connected/,
    'sequential rewrite must fail on the occupied intermediate endpoint');
  const b = sequential.connections.find((c) => c.id === 'leave-sphere');
  b.a = 'sphere-entry'; b.b = 'flat-return';
  const world = compileConnectedCoverWorld(sequential);
  assert.deepEqual(
    sequential.connections.map((c) => c.id).sort(),
    ['enter-sphere', 'leave-sphere'], 'connection IDs stay stable across the swap');
  assert.equal(world.portals.length, 4);
  const fwd = world.portals.find((p) => p.fromId === 'flat-entry');
  assert.equal(fwd.toId, 'sphere-exit', 'final graph carries the swapped endpoint');
}

// ---- 5. Base-to-envelope migration: base compiler cannot resolve a
//        cover-region endpoint; the envelope form compiles ----
{
  // Un-migrated form: the new pair record sits in baseScene.connections while
  // one endpoint (sphere-nook) is cover-owned. The base compiler rejects it.
  const base = pairDoc();
  base.baseScene.connections.push(base.connections.pop());
  assert.throws(() => compileConnectedCoverWorld(base), /connection bench-nook: unknown anchor sphere-nook/,
    'baseScene connection to a cover-owned anchor must fail');
  // Migrated form: the same record in envelope connections compiles.
  const world = compileConnectedCoverWorld(pairDoc());
  const link = world.portals.filter((p) => p.id === 'bench-nook');
  assert.equal(link.length, 2, 'migrated envelope connection yields both directions');
  assert.deepEqual(compileConnectedCoverWorld(clone()).document().baseScene.connections, [],
    'untouched base connections retain their (empty) ownership');
}

// ---- 6. Compiled but obstructed destination: compiler success is not
//        proof of walkability; movement refuses and retains the source ----
{
  const blocked = pairDoc();
  blocked.coverRegions[0].entities.push(
    { id: 'nook-blocker', kind: 'ball', chartId: 'exit-chart', position: [1, 1, 0], radius: 0.5 });
  const world = compileConnectedCoverWorld(blocked); // compiles: not a walkability proof
  const sphere = world.regions.get('sphere');
  const portal = world.portals.find((p) => p.fromId === 'flat-bench' && p.toRegionId === 'sphere');
  assert.ok(portal, 'obstructed pair still compiles its portal');
  // Independent clearance: transit of the aperture centre lands on the far
  // anchor centre, which sits inside the blocker for a 0.25 body.
  const dest = portal.transit(portal.center.slice()).position;
  const ball = sphere.balls.find((x) => x.id === 'nook-blocker');
  const gap = sphere.space.distance(dest, ball.center) - ball.radius - BODY;
  assert.ok(gap < 0, `destination must be obstructed (gap ${gap})`);
  const flat = world.regions.get('flat');
  const startPos = [6, -2, 0];
  let st = {
    regionId: 'flat', position: startPos, velocity: [0, 4, 0], radius: BODY,
    camera: createCameraFrame(flat.space, startPos, { forward: [0, 1, 0], up: [0, 0, 1] }),
  };
  let end = null;
  for (let i = 0; i < 120; i++) {
    const res = moveRegionProbe(world,
      { ...st, velocity: st.camera.forward.map((x) => x * 4) }, 0.25);
    st = res.state;
    if (res.status !== 'complete') { end = { i, ...res }; break; }
  }
  assert.ok(end, 'probe must eventually refuse the obstructed crossing');
  assert.equal(end.status, 'blocked-exit');
  assert.equal(end.detail, 'destination-clearance-insufficient');
  assert.equal(st.regionId, 'flat', 'source ownership is retained on refusal');
}

// ---- 7. Fail-demo: a naive ID-uniqueness check passes an endpoint-stealing
//        graph that the compiler rejects (checks are non-vacuous) ----
{
  const naiveOk = (doc) => {
    const ids = [doc.id, doc.baseScene.id,
      ...doc.baseScene.entities.map((e) => e.id),
      ...doc.coverRegions.flatMap((r) => [r.id, ...r.entities.map((e) => e.id)]),
      ...doc.connections.map((c) => c.id)];
    if (new Set(ids).size !== ids.length) return false;
    const anchorRadius = (id) => {
      const base = doc.baseScene.entities.find((e) => e.id === id);
      if (base) return base.radius;
      return doc.coverRegions.flatMap((r) => r.entities).find((e) => e.id === id)?.radius;
    };
    return doc.connections.every((c) => anchorRadius(c.a) === anchorRadius(c.b));
  };
  assert.ok(naiveOk(clone()), 'naive check passes the pristine fixture');
  const steal = clone();
  steal.baseScene.entities.push(structuredClone(BENCH));
  steal.coverRegions[0].entities.push(structuredClone(NOOK));
  steal.connections.push(structuredClone(PAIR));
  steal.connections.push({
    id: 'second-link', kind: 'portal',
    a: 'flat-entry', b: 'sphere-nook', velocity: 'preserve-speed', scale: 1,
  });
  assert.ok(naiveOk(steal), 'naive check passes the stealing graph: IDs unique, radii match');
  assert.throws(() => compileConnectedCoverWorld(steal), /already connected/,
    'compiler rejects the endpoint steal the naive check missed');
}

// ---- 8. File round-trip: the pair survives JSON serialization ----
{
  const roundTripped = JSON.parse(JSON.stringify(pairDoc()));
  const world = compileConnectedCoverWorld(roundTripped);
  assert.equal(world.portals.length, 6);
  assert.ok(world.portals.some((p) => p.fromId === 'flat-bench' && p.toRegionId === 'sphere'));
}

console.log('portal authoring truth: atomic create, E3/S3 crossing + reverse, '
  + 'occupied/radius/frame/duplicate/chart rejections, swap batch, '
  + 'base-to-envelope migration, obstructed-destination refusal, fail-demo, round-trip');
