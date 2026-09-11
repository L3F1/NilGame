// MUSE-49: independent connected sight audit.
//
// Own fixtures (not the author's): an offset E3-E3 gate pair, an E3-S3-E3
// route, occlusion, ties, budgets, inside starts, thin objects, S3
// surface candidates, range endpoints. Distance accounting, segment
// chaining, and mapped tangents are recomputed here from compiled anchors
// and metric identities — never copied from the implementation. Verdicts
// and the isolated fail-demo: docs/qa/muse49-sight-audit-2026-09-10.md.
import assert from 'node:assert/strict';
import { compileRegionWorld } from './engine/world/region-world.js';
import { traceRegionSight } from './engine/world/region-sight.js';

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

const UNITS = { name: 'design-unit', playerRadius: 0.25 };
const e3 = (id, extent = 30) => ({ id, geometry: { kind: 'e3', curvatureRadius: 1 }, topology: 'cover', extent });
const s3 = (id, R, extent) => ({ id, geometry: { kind: 's3', curvatureRadius: R }, topology: 'cover', extent });
const anchor = (id, regionId, position, forward, radius = 0.9, up = [0, 0, 1]) =>
  ({ id, regionId, kind: 'anchor', position, forward, up, radius });
const spawn = (id, regionId, position) => ({ id, regionId, kind: 'spawn', position });
const link = (id, a, b) => ({ id, kind: 'portal', a, b, velocity: 'preserve-speed', scale: 1 });
const scene = (id, regions, entities, connections = []) =>
  ({ format: 'nil-scene', version: 2, id, units: UNITS, regions, entities, connections });
const U = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };

// Direction of travel AT a crossing entry, in the from-region tangent space.
function incomingDir(world, r, xi) {
  const c = r.crossings[xi];
  const space = world.regions.get(c.fromRegionId).space;
  const segs = r.segments.filter((s) => s.regionId === c.fromRegionId);
  const s = segs[segs.length - 1];
  const log = space.logAt(c.entry, s.start);
  const l = Math.hypot(...log);
  return log.map((x) => -x / l);
}
// Outgoing direction at a crossing exit, in the to-region tangent space.
function outgoingDir(world, r, xi) {
  const c = r.crossings[xi];
  const space = world.regions.get(c.toRegionId).space;
  const s = r.segments.find((sg) => sg.regionId === c.toRegionId);
  const log = space.logAt(c.exit, s.end);
  const l = Math.hypot(...log);
  return log.map((x) => x / l);
}
function agree(a, b, tol = 1e-9) {
  return a.every((x, i) => Math.abs(x - b[i]) <= tol);
}

const pairDoc = (id) => scene(id, [e3('a'), e3('b')], [
  spawn('sa', 'a', [0, 0, 0]), spawn('sb', 'b', [10, 0, 0]),
  anchor('ga', 'a', [2, 1, 0.5], [-1, 0, 0], 1.2),
  anchor('gb', 'b', [10, 0, 0], [1, 0, 0], 1.2),
], [link('gate', 'ga', 'gb')]);

check('crossing accounts distance, chains segments, carries tangents', () => {
  const world = compileRegionWorld(pairDoc('sightpair'));
  const ray = { regionId: 'a', position: [0, 0.8, 0.5], direction: U([1, 0.1, 0]) };
  const before = JSON.stringify(ray);
  const r = traceRegionSight(world, ray, { maxDistance: 30 });
  assert.equal(r.crossings.length, 1);
  assert.equal(JSON.stringify(ray), before, 'ray input not mutated');
  // Range conservation and segment-sum accounting.
  const sum = r.segments.reduce((t, s) => t + s.distance, 0);
  assert.ok(Math.abs(sum - r.distance) < 1e-9, 'segments sum to total');
  assert.ok(Math.abs(r.distance + r.remainingDistance - 30) < 1e-9, 'range conserved');
  // Same-region chaining: each segment starts where the previous ended.
  const byRegion = {};
  for (const s of r.segments) (byRegion[s.regionId] ??= []).push(s);
  for (const list of Object.values(byRegion))
    for (let i = 1; i < list.length; i++)
      assert.ok(agree(list[i].start, list[i - 1].end), 'segments chain');
  // Crossing records against the compiled transit, recomputed here.
  const c = r.crossings[0];
  const gate = world.portals.find((p) => p.id === 'gate' && p.fromRegionId === 'a');
  const t = gate.transit(c.entry);
  assert.ok(agree(t.position, c.exit), 'exit matches transit');
  assert.ok(agree(t.carry(incomingDir(world, r, 0)), outgoingDir(world, r, 0)),
    'carried tangent matches the b-leg');
  // The continuation past the exit proves the reverse self-hit is suppressed
  // within the call (a zero-distance event would stop the ray at the exit).
  const segB = r.segments.find((s) => s.regionId === 'b');
  assert.ok(agree(segB.start, c.exit), 'b-leg starts at the exit');
  assert.ok(segB.distance > 1, 'ray continues past the exit');
  console.log(`  cross at=${c.distance.toFixed(4)} total=${r.distance.toFixed(4)} work=${r.work}`);
});

check('E3-S3-E3 route totals legs and maps both tangents', () => {
  const world = compileRegionWorld(scene('sightese', [e3('a'), s3('orb', 8, 8), e3('b')], [
    spawn('sa', 'a', [0, 0, 0]), spawn('so', 'orb', [0, 0, 0]), spawn('sb', 'b', [10, 0, 0]),
    anchor('ga', 'a', [3, 0, 0], [-1, 0, 0], 1.5),
    anchor('go', 'orb', [0, 0, -2], [0, 0, 1], 1.5, [0, 1, 0]),
    anchor('ho', 'orb', [0, 0, 2], [0, 0, -1], 1.5, [0, 1, 0]),
    anchor('hb', 'b', [10, 0, 0], [1, 0, 0], 1.5),
  ], [link('in', 'ga', 'go'), link('out', 'ho', 'hb')]));
  const r = traceRegionSight(world, { regionId: 'a', position: [0, 0, 0], direction: U([1, 0, 0]) }, { maxDistance: 40 });
  assert.equal(r.crossings.length, 2);
  const dists = r.segments.map((s) => s.distance);
  assert.ok(Math.abs(dists[0] - 3) < 1e-9 && Math.abs(dists[1] - 4) < 1e-9 && Math.abs(dists[2] - 20) < 1e-9,
    `leg totals 3/4/20, got ${dists}`);
  const pairs = [['in', 'a', 0], ['out', 'orb', 1]];
  for (const [id, from, xi] of pairs) {
    const c = r.crossings[xi];
    const gate = world.portals.find((p) => p.id === id && p.fromRegionId === from);
    const t = gate.transit(c.entry);
    assert.ok(agree(t.position, c.exit), `${id} exit matches`);
    assert.ok(agree(t.carry(incomingDir(world, r, xi)), outgoingDir(world, r, xi)), `${id} carry agrees`);
  }
  console.log(`  legs ${dists.map((d) => d.toFixed(2))} total=${r.distance.toFixed(2)}`);
});

check('S3 approach angles all cross with agreeing tangents', () => {
  const world = compileRegionWorld(scene('sights3ang', [e3('a'), s3('orb', 8, 8), e3('b')], [
    spawn('sa', 'a', [0, 0, 0]), spawn('so', 'orb', [0, 0, 0]), spawn('sb', 'b', [10, 0, 0]),
    anchor('ga', 'a', [3, 0, 0], [-1, 0, 0], 2.5),
    anchor('go', 'orb', [0, 0, -2], [0, 0, 1], 2.5, [0, 1, 0]),
    anchor('ho', 'orb', [0, 0, 2], [0, 0, -1], 1.5, [0, 1, 0]),
    anchor('hb', 'b', [10, 0, 0], [1, 0, 0], 1.5),
  ], [link('in', 'ga', 'go'), link('out', 'ho', 'hb')]));
  for (const dy of [-0.8, 0, 0.8]) {
    const r = traceRegionSight(world, { regionId: 'a', position: [0, dy, 0], direction: U([1, 0.05, 0]) }, { maxDistance: 40 });
    assert.ok(r.crossings.length >= 1, `dy=${dy} crosses`);
    const c = r.crossings[0];
    const gate = world.portals.find((p) => p.id === 'in' && p.fromRegionId === 'a');
    assert.ok(agree(gate.transit(c.entry).carry(incomingDir(world, r, 0)), outgoingDir(world, r, 0)),
      `dy=${dy} tangent agrees`);
  }
  console.log('  3 S3 approach angles cross with agreeing tangents');
});

check('occlusion hits without crossing; inside starts hit at zero', () => {
  const world = compileRegionWorld(scene('sightocc', [e3('a'), e3('b')], [
    spawn('sa', 'a', [0, 0, 0]), spawn('sb', 'b', [10, 0, 0]),
    { id: 'rock', regionId: 'a', kind: 'ball', position: [1, 0.85, 0.5], radius: 0.4 },
    anchor('ga', 'a', [2, 1, 0.5], [-1, 0, 0], 1.2),
    anchor('gb', 'b', [10, 0, 0], [1, 0, 0], 1.2),
  ], [link('gate', 'ga', 'gb')]));
  const r = traceRegionSight(world, { regionId: 'a', position: [0, 0.8, 0.5], direction: U([1, 0.1, 0]) }, { maxDistance: 30 });
  assert.equal(r.status, 'hit');
  assert.equal(r.crossings.length, 0, 'occluder wins over the gate');
  const inner = compileRegionWorld(scene('sightinside', [e3('a')], [
    spawn('sa', 'a', [5, 0, 0]),
    { id: 'rock', regionId: 'a', kind: 'ball', position: [0, 0, 0], radius: 1 },
  ]));
  const r2 = traceRegionSight(inner, { regionId: 'a', position: [0, 0, 0], direction: U([1, 0, 0]) }, { maxDistance: 30 });
  assert.equal(r2.status, 'hit', 'inside start is a hit, never a confident miss');
  assert.equal(r2.distance, 0);
  console.log(`  occluder hit at ${r.distance.toFixed(4)}; inside hit at 0`);
});

check('on-plane starts refuse; competing gates tie; budgets bite on time', () => {
  const world = compileRegionWorld(pairDoc('sightonplane'));
  const r1 = traceRegionSight(world, { regionId: 'a', position: [2, 0.5, 0.5], direction: U([0, 1, 0]) }, { maxDistance: 30 });
  assert.equal(r1.status, 'unresolved');
  assert.equal(r1.reason, 'aperture-side');
  assert.equal(r1.aperture, 'ga', 'refusal names the aperture');
  // A fresh call starting exactly at a mapped exit is an unrelated
  // on-plane start, not a suppressed reverse: it refuses too.
  const fwd = traceRegionSight(world, { regionId: 'a', position: [0, 0.8, 0.5], direction: U([1, 0.1, 0]) }, { maxDistance: 30 });
  const back = traceRegionSight(world, { regionId: 'b', position: [...fwd.crossings[0].exit], direction: U([-1, 0, 0]) }, { maxDistance: 30 });
  assert.equal(back.reason, 'aperture-side', 'fresh-call-at-exit refuses');
  // Competing gates at one distance tie instead of first-winning.
  const tie = compileRegionWorld(scene('sighttie', [e3('a'), e3('b'), e3('c')], [
    spawn('sa', 'a', [0, 0, 0]), spawn('sb', 'b', [10, 0, 0]), spawn('sc', 'c', [-10, 0, 0]),
    anchor('ga', 'a', [2, 0, 0], [-1, 0, 0], 1.0),
    anchor('gb', 'b', [10, 0, 0], [1, 0, 0], 1.0),
    anchor('ha', 'a', [2, 0, 0], [-1, 0, 0], 1.0),
    anchor('hc', 'c', [-10, 0, 0], [1, 0, 0], 1.0),
  ], [link('g1', 'ga', 'gb'), link('g2', 'ha', 'hc')]));
  const r2 = traceRegionSight(tie, { regionId: 'a', position: [0, 0, 0], direction: U([1, 0, 0]) }, { maxDistance: 30 });
  assert.equal(r2.reason, 'aperture-tie');
  assert.equal(r2.crossings.length, 0, 'tie crosses nothing');
  // Budgets: closed gate, one-shot gate, shared work pool.
  const r0 = traceRegionSight(world, { regionId: 'a', position: [0, 0.8, 0.5], direction: U([1, 0.1, 0]) }, { maxDistance: 30, maxCrossings: 0 });
  assert.equal(r0.reason, 'crossing-budget');
  const ese = compileRegionWorld(scene('sightbud', [e3('a'), s3('orb', 8, 8), e3('b')], [
    spawn('sa', 'a', [0, 0, 0]), spawn('so', 'orb', [0, 0, 0]), spawn('sb', 'b', [10, 0, 0]),
    anchor('ga', 'a', [3, 0, 0], [-1, 0, 0], 1.5),
    anchor('go', 'orb', [0, 0, -2], [0, 0, 1], 1.5, [0, 1, 0]),
    anchor('ho', 'orb', [0, 0, 2], [0, 0, -1], 1.5, [0, 1, 0]),
    anchor('hb', 'b', [10, 0, 0], [1, 0, 0], 1.5),
  ], [link('in', 'ga', 'go'), link('out', 'ho', 'hb')]));
  const r1x = traceRegionSight(ese, { regionId: 'a', position: [0, 0, 0], direction: U([1, 0, 0]) }, { maxDistance: 40, maxCrossings: 1 });
  assert.equal(r1x.reason, 'crossing-budget');
  assert.equal(r1x.crossings.length, 1, 'first crossing stands, second refused');
  const rw = traceRegionSight(ese, { regionId: 'a', position: [0, 0, 0], direction: U([1, 0, 0]) }, { maxDistance: 40, maxWork: 10 });
  assert.equal(rw.reason, 'work-budget', 'crossings share one work pool');
  console.log('  aperture-side, fresh-exit, tie, 3 budgets: all exact');
});

check('thin object after the gate; S3 ball stays a candidate; range ends', () => {
  const world = compileRegionWorld(scene('sightthin', [e3('a'), e3('b')], [
    spawn('sa', 'a', [0, 0, 0]), spawn('sb', 'b', [10, 5, 0]),
    anchor('ga', 'a', [2, 0, 0], [-1, 0, 0], 1.2),
    anchor('gb', 'b', [10, 0, 0], [1, 0, 0], 1.2),
    { id: 'foil', regionId: 'b', kind: 'box', position: [10.6, 0, 0], halfExtent: [0.01, 2, 2] },
  ], [link('gate', 'ga', 'gb')]));
  const r = traceRegionSight(world, { regionId: 'a', position: [0, 0, 0], direction: U([1, 0, 0]) }, { maxDistance: 30 });
  assert.equal(r.status, 'hit');
  assert.equal(r.crossings.length, 1, 'gate crossed first');
  assert.ok(Math.abs(r.distance - 2.59) < 0.01, `foil entry right after exit (got ${r.distance})`);
  const s3w = compileRegionWorld(scene('sights3ball', [s3('orb', 8, 8)], [
    spawn('so', 'orb', [0, 0, 0]),
    { id: 'rock', regionId: 'orb', kind: 'ball', position: [0, 3, 0], radius: 0.6 },
  ]));
  const space = s3w.regions.get('orb').space;
  const pos = [...space.decode([0, 0, 0])];
  for (const tgt of [[0, 3, 0], [0.5, 3, 0.2], [-0.4, 2.5, -0.3]]) {
    const dir = space.normalize(pos, space.logAt(pos, space.decode(tgt)));
    const rr = traceRegionSight(s3w, { regionId: 'orb', position: pos, direction: [...dir] }, { maxDistance: 20 });
    assert.equal(rr.reason, 'surface-candidate', 'S3 ball never certifies a hit');
    assert.notEqual(rr.status, 'hit');
  }
  const range = compileRegionWorld(scene('sightrange', [e3('a')], [
    spawn('sa', 'a', [0, 0, 0]),
    { id: 'rock', regionId: 'a', kind: 'ball', position: [5, 0, 0], radius: 1 },
  ]));
  const hit = traceRegionSight(range, { regionId: 'a', position: [0, 0, 0], direction: U([1, 0, 0]) }, { maxDistance: 4 });
  assert.equal(hit.status, 'hit', 'hit exactly at maxDistance still counts');
  const short = traceRegionSight(range, { regionId: 'a', position: [0, 0, 0], direction: U([1, 0, 0]) }, { maxDistance: 3.9999999 });
  assert.equal(short.reason, 'range-boundary', 'the miss belongs to the range');
  const miss = traceRegionSight(range, { regionId: 'a', position: [0, 0, 0], direction: U([0, 1, 0]) }, { maxDistance: 30 });
  assert.equal(miss.reason, 'domain-exit');
  assert.ok(Math.abs(miss.distance - 30) < 1e-9, 'clean miss spends the full range');
  console.log('  thin foil, S3 candidate x3, range hit/short/miss: all exact');
});

check('E3-S3-E3 crossings at R=0.5 and R=100 with closed-form lengths', () => {
  // Revision per Astra review: radii other than R=8, with in-domain charts
  // and independently calculated physical lengths and tangent mapping.
  // Test-local normal-coordinate reference: decode(a) sits at geodesic
  // distance |a| from the chart center along the author direction, on the
  // unit 3-sphere, so physical distance = R * angle. Gated against
  // space.decode at the anchors only, then used for lengths. No production
  // geometry calls inside refEmbed/refAngle.
  const refEmbed = (R, a) => {
    const n = Math.hypot(...a);
    if (n === 0) return [0, 0, 0, 1];
    const s = Math.sin(n / R) / n, c = Math.cos(n / R);
    return [a[0] * s, a[1] * s, a[2] * s, c];
  };
  const refAngle = (R, a, b) => {
    const pa = refEmbed(R, a), pb = refEmbed(R, b);
    const dot = pa.reduce((t, x, i) => t + x * pb[i], 0);
    return Math.acos(Math.min(1, Math.max(-1, dot)));
  };
  for (const [R, ext, apos, arad] of [[0.5, 0.7, 0.35, 0.3], [100, 8, 2, 1.5]]) {
    const world = compileRegionWorld(scene(R < 1 ? 'sightrsmall' : 'sightrlarge', [e3('a'), s3('orb', R, ext), e3('b')], [
      spawn('sa', 'a', [0, 0, 0]), spawn('so', 'orb', [0, 0, 0]), spawn('sb', 'b', [10, 0, 0]),
      anchor('ga', 'a', [3, 0, 0], [-1, 0, 0], arad),
      anchor('go', 'orb', [0, 0, -apos], [0, 0, 1], arad, [0, 1, 0]),
      anchor('ho', 'orb', [0, 0, apos], [0, 0, -1], arad, [0, 1, 0]),
      anchor('hb', 'b', [10, 0, 0], [1, 0, 0], arad),
    ], [link('in', 'ga', 'go'), link('out', 'ho', 'hb')]));
    const space = world.regions.get('orb').space;
    for (const s of [-apos, apos]) {
      assert.ok(agree([...space.decode([0, 0, s])], refEmbed(R, [0, 0, s]), 1e-12),
        `R=${R} reference matches chart at ${s}`);
    }
    const r = traceRegionSight(world, { regionId: 'a', position: [0, 0, 0], direction: U([1, 0, 0]) }, { maxDistance: 40 });
    assert.equal(r.crossings.length, 2, `R=${R} crosses twice`);
    // Closed-form legs: 3 in E3, 2*apos on the orb great circle, 20 in E3.
    const dists = r.segments.map((s) => s.distance);
    const want = [3, 2 * apos, 20];
    assert.ok(dists.every((d, i) => Math.abs(d - want[i]) < 1e-9),
      `R=${R} legs ${dists.map((d) => d.toFixed(6))} want ${want}`);
    assert.ok(Math.abs(refAngle(R, [0, 0, -apos], [0, 0, apos]) - 2 * apos / R) < 1e-12,
      `R=${R} inter-anchor angle`);
    // Both carried tangents: compiler carry agrees with the travelled leg,
    // and each travelled leg is independently a unit tangent at its exit
    // (own hypot/dot arithmetic, no production calls).
    for (const [id, from, xi] of [['in', 'a', 0], ['out', 'orb', 1]]) {
      const c = r.crossings[xi];
      const gate = world.portals.find((p) => p.id === id && p.fromRegionId === from);
      assert.ok(agree(gate.transit(c.entry).carry(incomingDir(world, r, xi)), outgoingDir(world, r, xi)),
        `R=${R} ${id} carry agrees`);
      const t = outgoingDir(world, r, xi);
      assert.ok(Math.abs(Math.hypot(...t) - 1) < 1e-9, `R=${R} ${id} exit tangent unit`);
      if (c.toRegionId === 'orb') {
        assert.ok(Math.abs(t.reduce((sum, v, i) => sum + v * c.exit[i], 0)) < 1e-9,
          `R=${R} ${id} exit tangent tangent to S3`);
      }
    }
    console.log(`  R=${R}: legs ${dists.map((d) => d.toFixed(4))} angle=${refAngle(R, [0, 0, -apos], [0, 0, apos]).toFixed(6)}`);
  }
});

console.log(`\nconnected-sight-truth: ${passed} checks passed, ${failed} failed`);
if (failed) process.exit(1);