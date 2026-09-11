// MUSE-59: independent connected-global CPU truth for compileConnectedCoverWorld.
// Fixture: levels/fixtures/connected-global.nil.json (flat E3 -> global S3 -> flat E3).
// Expected lengths are derived here from authored fixture coordinates with
// great-circle math, not from engine lookup tables.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileConnectedCoverWorld } from './engine/world/connected-cover-world.js';
import { traceRegionSight } from './engine/world/region-sight.js';
import { moveRegionProbe } from './engine/world/region-motion.js';

const doc = JSON.parse(fs.readFileSync('levels/fixtures/connected-global.nil.json'));
const R = 8; // coverRegions[0].geometry.curvatureRadius in the fixture
const world = compileConnectedCoverWorld(doc);
const start = world.spawn();

// ---- Independent derivation from authored fixture coordinates ----
const spawnPos = [0, -2, 0];            // baseScene flat-spawn
const entryPos = [0, 0, 0];             // baseScene flat-entry anchor
const returnPos = [3, 0, 0];            // baseScene flat-return anchor
const targetPos = [3, 3, 0], targetR = 0.6; // baseScene flat-target ball
assert.deepEqual(start.position, spawnPos);
assert.deepEqual(start.camera.forward, [0, 1, 0]);
const entryDist = entryPos[1] - spawnPos[1]; // straight +y ray meets entry plane: 2
assert.equal(entryDist, 2);
// Chart convention: a chart maps its local origin to its center unit 4-vector,
// so the sphere entry/exit points are the two chart centers from the fixture.
const E = [0, 0, 0, 1]; // north-chart center
const X = [0, -1, 0, 0]; // exit-chart center
const dot = E.reduce((s, x, i) => s + x * X[i], 0);
const phi = Math.acos(Math.min(1, Math.max(-1, dot))); // pi/2
assert.ok(Math.abs(phi - Math.PI / 2) < 1e-12);
// Entry chart forward [0,1,0] maps through the north-chart basis to [0,1,0,0];
// the short-way initial heading is X-(X.E)E = X, and dot([0,1,0,0], X) = -1 < 0,
// so the ray heads away from the exit and takes the long way around.
const shortWay = phi * R, longWay = (2 * Math.PI - phi) * R; // 4pi vs 12pi
assert.ok(Math.abs(longWay - 12 * Math.PI) < 1e-12);
const targetDist = (targetPos[1] - returnPos[1]) - targetR; // 3 - 0.6 = 2.4
assert.equal(targetDist, 2.4);
const TOTAL = entryDist + longWay + targetDist;

// ---- 1. Full route: hit, owners, crossings, per-region segments ----
const full = traceRegionSight(world,
  { regionId: start.regionId, position: start.position, direction: start.camera.forward },
  { maxDistance: 60 });
assert.equal(full.status, 'hit');
assert.equal(full.query.owner, 'flat-target');
assert.equal(full.crossings.length, 2);
assert.equal(full.crossings[0].id, 'enter-sphere');
assert.equal(full.crossings[1].id, 'leave-sphere');
assert.ok(Math.abs(full.crossings[0].distance - entryDist) < 1e-9);
assert.ok(Math.abs(full.crossings[1].distance - (entryDist + longWay)) < 1e-9);
assert.deepEqual(full.crossings[0].exit, E);
assert.deepEqual(full.segments.map(s => s.regionId), ['flat', 'sphere', 'flat']);
assert.ok(Math.abs(full.segments[0].distance - entryDist) < 1e-9);
assert.ok(Math.abs(full.segments[1].distance - longWay) < 1e-9,
  `sphere leg ${full.segments[1].distance} is not the long way ${longWay}`);
assert.ok(Math.abs(full.segments[1].distance - shortWay) > 1, 'must not take the short way');
assert.ok(Math.abs(full.segments[2].distance - targetDist) < 1e-9);
assert.ok(Math.abs(full.distance - TOTAL) < 1e-9, `${full.distance} vs ${TOTAL}`);

// ---- 2. Ray-range ladder just before/after entry, return, target ----
const ray = { regionId: start.regionId, position: start.position, direction: start.camera.forward };
const eps = 1e-6, ret = entryDist + longWay;
const ladder = [
  [entryDist - eps, 'miss', 0], [entryDist + eps, 'miss', 1],
  [ret - eps, 'miss', 1], [ret + eps, 'miss', 2],
  [TOTAL - eps, 'miss', 2], [TOTAL + eps, 'hit', 2],
];
for (const [md, status, cross] of ladder) {
  const r = traceRegionSight(world, ray, { maxDistance: md });
  assert.equal(r.status, status, `range ${md}: ${JSON.stringify(r)}`);
  assert.equal(r.crossings.length, cross, `range ${md}: crossings`);
  if (status === 'hit') assert.ok(Math.abs(r.distance - TOTAL) < 1e-9);
}

// ---- 3. Crossing budgets 0/1/2 ----
{
  const b0 = traceRegionSight(world, ray, { maxDistance: 60, maxCrossings: 0 });
  assert.equal(b0.status, 'unresolved');
  assert.equal(b0.reason, 'crossing-budget');
  assert.equal(b0.crossings.length, 0);
  const b1 = traceRegionSight(world, ray, { maxDistance: 60, maxCrossings: 1 });
  assert.equal(b1.status, 'unresolved');
  assert.equal(b1.reason, 'crossing-budget');
  assert.equal(b1.crossings.length, 1);
  const b2 = traceRegionSight(world, ray, { maxDistance: 60, maxCrossings: 2 });
  assert.equal(b2.status, 'hit');
  assert.equal(b2.crossings.length, 2);
}

// ---- 4a. Inside-ball origin on the sphere is unresolved, not a hit ----
{
  const d2 = structuredClone(doc);
  d2.coverRegions[0].entities.push(
    { id: 'sphere-blob', kind: 'ball', chartId: 'north-chart', position: [0, 0.3, 0], radius: 0.5 });
  const w2 = compileConnectedCoverWorld(d2);
  const c = w2.regions.get('sphere').balls.find(b=>b.id==='sphere-blob').center;
  assert.ok(w2.regions.get('sphere').field.distance(c) < 0, 'origin must be strictly inside');
  const raw = [0, 0, 1, 0], d = raw.reduce((s, x, i) => s + x * c[i], 0);
  const t = raw.map((x, i) => x - d * c[i]), n = Math.hypot(...t);
  const dir = t.map(x => x / n); // test-local tangent projection
  const r = traceRegionSight(w2, { regionId: 'sphere', position: c.slice(), direction: dir }, { maxDistance: 5 });
  assert.equal(r.status, 'unresolved', JSON.stringify(r));
  assert.match(r.reason || r.query?.reason || '', /inside/);
}

// ---- 4b. Near-tangent graze of the flat target is unresolved; clean miss is a miss ----
{
  const graze = x => traceRegionSight(world,
    { regionId: 'flat', position: [x, -2, 0], direction: [0, 1, 0] }, { maxDistance: 5 });
  // Lateral offset radius+1e-9 passes within 1e-9 of the surface: no confident miss.
  const g1 = graze(targetPos[0] + targetR + 1e-9);
  assert.equal(g1.status, 'unresolved', JSON.stringify(g1));
  // Exactly tangent is a floating-point boundary, also unresolved.
  const g2 = graze(targetPos[0] + targetR);
  assert.equal(g2.status, 'unresolved', JSON.stringify(g2));
  // Offset radius+0.05 clears the ball over the whole 5-unit range.
  const g3 = graze(targetPos[0] + targetR + 0.05);
  assert.equal(g3.status, 'miss');
  assert.equal(g3.reason, 'range');
  // Head-on endpoint 5e-9 short of the surface is range-boundary; 1e-3 short is a miss.
  const surface = (targetPos[1] - (-2)) - targetR; // 4.4 from y=-2
  const h1 = traceRegionSight(world,
    { regionId: 'flat', position: [3, -2, 0], direction: [0, 1, 0] }, { maxDistance: surface - 5e-9 });
  assert.equal(h1.status, 'unresolved');
  assert.equal(h1.reason, 'range-boundary');
  const h2 = traceRegionSight(world,
    { regionId: 'flat', position: [3, -2, 0], direction: [0, 1, 0] }, { maxDistance: surface - 1e-3 });
  assert.equal(h2.status, 'miss');
}

// ---- 5. Body blocked exit: destination obstacle refuses the return crossing ----
{
  const blocked = structuredClone(doc);
  blocked.baseScene.entities.push(
    { id: 'return-blocker', regionId: 'flat', kind: 'ball', position: [3, 0.3, 0], radius: 0.5 });
  const w3 = compileConnectedCoverWorld(blocked);
  let st = w3.spawn();
  // Independent physical gap at the return transit point, for a body of radius 0.25.
  const gap = Math.hypot(3 - 3, 0.3 - 0, 0 - 0) - 0.5 - st.radius;
  assert.ok(gap < 0, `transit point must be inside the blocker (gap ${gap})`);
  let end = null;
  for (let i = 0; i < 120; i++) {
    const res = moveRegionProbe(w3, { ...st, velocity: st.camera.forward.map(x => x * 4) }, 0.25);
    st = res.state;
    if (res.status !== 'complete') { end = { i, ...res }; break; }
  }
  assert.ok(end, 'probe must eventually refuse the obstructed crossing');
  assert.ok(end.i > 5, 'probe must first travel the full route before refusing');
  assert.equal(end.status, 'blocked-exit');
  assert.equal(end.detail, 'destination-clearance-insufficient');
  assert.equal(st.regionId, 'sphere', 'source ownership is retained on refusal');
}

console.log('connected global truth: full route, range ladder, budgets 0/1/2, '
  + 'inside-ball/near-tangent unresolved, blocked exit passed');
