import assert from 'node:assert/strict';
import { compileHyperbolicRegionWorld } from './engine/world/region-world.js';
import { traceRegionSight } from './engine/world/region-sight.js';
import { createHyperbolicSpace } from './engine/geometry/hyperbolic-space.js';

// MUSE-71 independent H3 sight audit: translated/off-axis challenges to the
// foreground query policy. Reference distances come from a dense scan plus
// bisection on g(t) using ONLY the space metric (distance/step/logAt) and the
// compiled portal crossing/transit primitives. The reference shares the metric
// with production but not the A/B root solver nor the sight ordering, so it
// cannot certify a miss (narrow dips between samples would escape the scan)
// and gate distances reuse queryHyperbolicAperture. Unresolved is always an
// acceptable production answer; a confident hit/miss must match the reference.
function refEntry(space, p, u, center, radius, end) {
  const g = (t) => space.distance(space.step(p, u, t), center) - radius;
  if (g(0) <= 0) return { inside: true };
  const N = 2000;
  let prev = 0;
  for (let i = 1; i <= N; i++) {
    const t = end * i / N;
    if (g(t) <= 0) {
      let a = prev, b = t;
      for (let k = 0; k < 80; k++) { const m = (a + b) / 2; if (g(m) <= 0) b = m; else a = m; }
      return { hit: b };
    }
    prev = t;
  }
  return { sampledMiss: true };
}
const e3Entry = (p, u, c, r) => {
  const d = p.map((x, i) => x - c[i]), b = d.reduce((s, x, i) => s + x * u[i], 0);
  const q = d.reduce((s, x) => s + x * x, 0) - r * r, disc = b * b - q;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : null;
};
const near = (a, b, t = 1e-9) => assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);

// Translated (x=+0.3) E3/H3/E3 world: portals still admit the laterally
// shifted ray, but H3 geodesics off the origin curve in authored coordinates,
// so every expected value below is solved, never copied from lead's axis line.
const TX = 0.3;
function translatedDoc(landmarkPos, extra = []) {
  return { format: 'nil-scene', version: 2, id: 'muse71', units: { name: 'design-unit', playerRadius: 0.1 },
    regions: [
      { id: 'flat', geometry: { kind: 'e3', curvatureRadius: 1 }, extent: 8, topology: 'cover' },
      { id: 'hyperbolic', geometry: { kind: 'h3', curvatureRadius: 8 }, extent: 12, topology: 'cover' },
      { id: 'return', geometry: { kind: 'e3', curvatureRadius: 1 }, extent: 8, topology: 'cover' }],
    entities: [
      { id: 's-flat', kind: 'spawn', regionId: 'flat', position: [TX, -1, 0] },
      { id: 's-hyp', kind: 'spawn', regionId: 'hyperbolic', position: [TX, 0.5, 0] },
      { id: 's-ret', kind: 'spawn', regionId: 'return', position: [TX, 1, 0] },
      { id: 'flat-gate', kind: 'anchor', regionId: 'flat', position: [TX, 0, 0], forward: [0, -1, 0], up: [0, 0, 1], radius: 0.7 },
      { id: 'h3-entry', kind: 'anchor', regionId: 'hyperbolic', position: [TX, 0, 0], forward: [0, 1, 0], up: [0, 0, 1], radius: 0.7 },
      { id: 'h3-exit', kind: 'anchor', regionId: 'hyperbolic', position: [TX, 2, 0], forward: [0, -1, 0], up: [0, 0, 1], radius: 0.7 },
      { id: 'return-gate', kind: 'anchor', regionId: 'return', position: [TX, 0, 0], forward: [0, 1, 0], up: [0, 0, 1], radius: 0.7 },
      { id: 'landmark', kind: 'ball', regionId: 'hyperbolic', position: landmarkPos, radius: 0.25 }, ...extra],
    connections: [
      { id: 'into-h3', kind: 'portal', a: 'flat-gate', b: 'h3-entry', velocity: 'preserve-speed', scale: 1 },
      { id: 'out-of-h3', kind: 'portal', a: 'h3-exit', b: 'return-gate', velocity: 'preserve-speed', scale: 1 }] };
}
const ray = { regionId: 'flat', position: [TX, -1, 0], direction: [0, 1, 0] };
const world = compileHyperbolicRegionWorld(translatedDoc([TX, 1, 0]));
const space = world.regions.get('hyperbolic').space;
// Independent foreground expectation: E3 entry leg plus a bisection reference
// launched from the portal-transit exit state, not from the sight result.
const pIn = world.portals.find((p) => p.fromId === 'flat-gate');
const crossIn = pIn.crossing(ray.position, ray.direction, 30);
near(crossIn.distance, 1, 1e-12);
const transitIn = pIn.transit(crossIn.at);
const uH = transitIn.carry(ray.direction);
const pOut = world.portals.find((p) => p.fromId === 'h3-exit');
const gateDist = pOut.crossing(transitIn.position, uH, 30).distance;
const href = refEntry(space, transitIn.position, uH, space.decode([TX, 1, 0]), 0.25, gateDist);
assert.ok(href.hit !== undefined && href.hit < gateDist);
const expectedNear = crossIn.distance + href.hit;
// A nearer solid survives remote portal range/domain ambiguity at every range,
// including the exit gate exactly at the requested limit, under portal reorder.
const before = JSON.stringify(ray);
for (const md of [2.2, 3, 1 + gateDist, 30]) {
  for (const reversed of [false, true]) {
    const w = reversed ? { ...world, portals: [...world.portals].reverse() } : world;
    const r = traceRegionSight(w, ray, { maxDistance: md });
    assert.equal(r.status, 'hit', `${md} ${reversed} ${r.reason}`);
    assert.equal(r.query.owner, 'landmark');
    assert.equal(r.query.method, 'h3-balls');
    near(r.distance, expectedNear, 1e-6);
    assert.equal(r.crossings.length, 1);
    near(space.distance(r.position, space.decode([TX, 1, 0])), 0.25, 1e-6);
  }
}
assert.equal(JSON.stringify(ray), before);
// A nearer portal survives an uncertain remote solid: landmark past the exit,
// visible ball in the return region; carried direction and total arclength win.
const far = compileHyperbolicRegionWorld(translatedDoc([TX, 3.25, 0],
  [{ id: 'visible', kind: 'ball', regionId: 'return', position: [TX, 0.75, 0], radius: 0.1 }]));
const transitOut = pOut.transit(pOut.crossing(transitIn.position, uH, 30).at);
const uExit = space.transport(transitIn.position, pOut.crossing(transitIn.position, uH, 30).at, uH);
const carryOut = transitOut.carry(uExit);
const returnLeg = e3Entry(transitOut.position, carryOut, [TX, 0.75, 0], 0.1);
assert.ok(Number.isFinite(returnLeg)&&returnLeg>0,'reference must actually hit the return ball');
const expectedFar = 1 + gateDist + returnLeg;
for (const reversed of [false, true]) {
  const w = reversed ? { ...far, portals: [...far.portals].reverse() } : far;
  const r = traceRegionSight(w, ray, { maxDistance: 4 });
  assert.equal(r.status, 'hit', r.reason);
  assert.equal(r.crossings.length, 2);
  assert.deepEqual(r.segments.map((s) => s.regionId), ['flat', 'hyperbolic', 'return']);
  near(r.segments.reduce((n, s) => n + s.distance, 0), r.distance, 1e-12);
  near(r.distance, expectedFar, 1e-6);
  assert.deepEqual(r.direction.map((x) => +x.toFixed(12)), carryOut.map((x) => +x.toFixed(12)));
}
const full = traceRegionSight(world, ray, { maxDistance: 3 });
for (let maxWork = 0; maxWork < full.work; maxWork++) {
  const limited = traceRegionSight(world, ray, { maxDistance: 3, maxWork });
  assert.equal(limited.status, 'unresolved');
  assert.equal(limited.reason, 'work-budget');
  assert.ok(limited.work <= maxWork);
}
assert.equal(traceRegionSight(world, ray, { maxDistance: 6, maxCrossings: 0 }).reason, 'crossing-budget');

// Independently constructed x-axis radial tie world (R=2): exact solid/gate
// coincidence refuses, near ties resolve to the strictly nearer event.
function tieDoc(cx) {
  return { format: 'nil-scene', version: 2, id: 'muse71-tie', units: { name: 'design-unit', playerRadius: 0.05 },
    regions: [
      { id: 'a', geometry: { kind: 'e3', curvatureRadius: 1 }, extent: 8, topology: 'cover' },
      { id: 'h', geometry: { kind: 'h3', curvatureRadius: 2 }, extent: 4, topology: 'cover' },
      { id: 'b', geometry: { kind: 'e3', curvatureRadius: 1 }, extent: 8, topology: 'cover' }],
    entities: [
      { id: 's-a', kind: 'spawn', regionId: 'a', position: [-1, 0, 0] },
      { id: 's-h', kind: 'spawn', regionId: 'h', position: [0.5, 0, 0] },
      { id: 's-b', kind: 'spawn', regionId: 'b', position: [1, 0, 0] },
      { id: 'a-gate', kind: 'anchor', regionId: 'a', position: [0, 0, 0], forward: [-1, 0, 0], up: [0, 0, 1], radius: 0.7 },
      { id: 'h-entry', kind: 'anchor', regionId: 'h', position: [0, 0, 0], forward: [1, 0, 0], up: [0, 0, 1], radius: 0.7 },
      { id: 'h-exit', kind: 'anchor', regionId: 'h', position: [2, 0, 0], forward: [-1, 0, 0], up: [0, 0, 1], radius: 0.7 },
      { id: 'b-gate', kind: 'anchor', regionId: 'b', position: [0, 0, 0], forward: [1, 0, 0], up: [0, 0, 1], radius: 0.7 },
      { id: 'rock', kind: 'ball', regionId: 'h', position: [cx, 0, 0], radius: 0.25 }],
    connections: [
      { id: 'in', kind: 'portal', a: 'a-gate', b: 'h-entry', velocity: 'preserve-speed', scale: 1 },
      { id: 'out', kind: 'portal', a: 'h-exit', b: 'b-gate', velocity: 'preserve-speed', scale: 1 }] };
}
const tray = { regionId: 'a', position: [-1, 0, 0], direction: [1, 0, 0] };
const tied = compileHyperbolicRegionWorld(tieDoc(2.25));
for (const reversed of [false, true]) {
  const w = reversed ? { ...tied, portals: [...tied.portals].reverse() } : tied;
  assert.equal(traceRegionSight(w, tray, { maxDistance: 6 }).status, 'unresolved');
}
const nearSolid = traceRegionSight(compileHyperbolicRegionWorld(tieDoc(2.245)), tray, { maxDistance: 6 });
assert.equal(nearSolid.status, 'hit', nearSolid.reason);
near(nearSolid.distance, 2.995, 1e-9);
assert.equal(nearSolid.crossings.length, 1);
const nearGate = traceRegionSight(compileHyperbolicRegionWorld(tieDoc(2.255)), tray, { maxDistance: 3.5 });
assert.equal(nearGate.status, 'miss', nearGate.reason);
assert.equal(nearGate.crossings.length, 2);

// Diagonal off-axis single-region hits agree with the scan/bisection reference.
for (const R of [0.5, 8]) {
  const s = createHyperbolicSpace({ curvatureRadius: R, maxDistance: 1.8 * R });
  const S = [0.15 * R, -1.1 * R, 0.05 * R], C = [0.75 * R, 0.45 * R, -0.1 * R], br = 0.12 * R;
  const p = s.decode(S), c = s.decode(C);
  const log = s.logAt(p, c), n = s.norm(p, log), u = log.map((x) => x / n);
  const ref = refEntry(s, p, u, c, br, Math.min(s.boundaryDistance(p, u) * 0.999, 3 * R));
  assert.ok(ref.hit !== undefined);
  const wdiag = compileHyperbolicRegionWorld({ format: 'nil-scene', version: 2, id: 'diag',
    units: { name: 'design-unit', playerRadius: 0.02 * R },
    regions: [{ id: 'h', geometry: { kind: 'h3', curvatureRadius: R }, extent: 1.8 * R, topology: 'cover' }],
    entities: [{ id: 'spawn', kind: 'spawn', regionId: 'h', position: [0, 0, 0] },
      { id: 'rock', kind: 'ball', regionId: 'h', position: C, radius: br }], connections: [] });
  const hit = traceRegionSight(wdiag, { regionId: 'h', position: p, direction: u }, { maxDistance: 3 * R });
  assert.equal(hit.status, 'hit', hit.reason);
  assert.equal(hit.query.owner, 'rock');
  near(hit.distance, ref.hit, 1e-6);
  assert.equal(traceRegionSight(wdiag, { regionId: 'h', position: p, direction: u }, { maxDistance: ref.hit }).status, 'unresolved');
  assert.equal(traceRegionSight(wdiag, { regionId: 'h', position: p, direction: u }, { maxDistance: ref.hit - 0.05 * R }).status, 'miss');
  assert.equal(traceRegionSight(wdiag, { regionId: 'h', position: c, direction: s.frame(c)[0] }, { maxDistance: R }).reason, 'inside-start');
}
console.log('MUSE-71 H3 sight truth: translated foreground/range/order, carried arclength, ties/budgets, diagonal references passed');
