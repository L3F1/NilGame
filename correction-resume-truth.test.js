// MUSE-45: is a resumed correction the correction that was owed?
//
// Independent audit of resumeRegionCorrection (landed 885834d). The
// reference here is the auditor's own: for the same scene and start, the
// endpoint of an UNINTERRUPTED settle (budget that finishes) against the
// endpoint of the same walk starved and then resumed — those two must be
// the same walker, in position AND camera. Travel-match is gated loud
// (starved endpoint must sit exactly one residual from the reference;
// diverged-travel rows cannot indict the resume and fail here instead).
// correction-resume.test.js was not read before writing this.
//
// Findings pinned: forgeries never move (Q1); resumed == uninterrupted to
// 0.0e+0 with cameras to 1.1e-16 (Q2); every resume clock field reads 0
// and ground-per-dt is identical (Q3); the chart-edge argument holds on
// every attempted approach (adjudication). Worst numbers in the report:
// docs/qa/muse45-correction-resume-2026-09-10.md.
import assert from 'node:assert/strict';
import { compileRegionWorld } from './engine/world/region-world.js';
import { moveRegionProbe, resumeRegionCorrection } from './engine/world/region-motion.js';
import { createCameraFrame, turn } from './engine/world/camera-frame.js';

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

const UNITS = { name: 'design-unit', playerRadius: 0.25 };
const e3 = (id, extent = 8) => ({ id, geometry: { kind: 'e3', curvatureRadius: 1 }, topology: 'cover', extent });
const s3 = (id, R, extent) => ({ id, geometry: { kind: 's3', curvatureRadius: R }, topology: 'cover', extent });
const spawn = (id, regionId, position) => ({ id, regionId, kind: 'spawn', position });
const scene = (id, regions, entities, connections = [], units = UNITS) =>
  ({ format: 'nil-scene', version: 2, id, units, regions, entities, connections });
const unitsFor = (pr) => ({ name: 'design-unit', playerRadius: pr });

function stateAt(world, regionId, position, velocity, radius = 0.25) {
  const { space } = world.regions.get(regionId);
  const basis = space.frame(position);
  const camera = turn(createCameraFrame(space, position, { forward: basis[1], up: basis[2] }), {});
  return { regionId, position: position.slice(), velocity: velocity.slice(), radius, camera };
}
function camDiff(a, b) {
  const d = (u, v) => Math.hypot(...[...u].map((x, i) => x - [...v][i]));
  return Math.max(d(a.forward, b.forward), d(a.up, b.up));
}
function clockZero(out) {
  return out.timeConsumed === 0 && out.timeRemaining === 0
    && out.time.travel === 0 && out.time.rest === 0 && out.time.correction === 0;
}
function resumeLoop(world, suspended, maxSteps) {
  let cur = suspended, iters = 0;
  while (cur.pendingLift && cur.continuation && iters < 12) {
    cur = resumeRegionCorrection(world, cur, maxSteps === undefined ? {} : { maxSteps });
    iters++;
    if (cur.status !== 'complete' && cur.status !== 'budget-exhausted') break;
  }
  return { cur, iters };
}
// Starve only the settle tail: the largest cap that still owes, with the
// starved endpoint exactly one residual from the reference (travel intact).
function starveTail(world, mk, dt, ref) {
  for (let cap = Math.min(ref.steps - 1, 64); cap >= 1; cap--) {
    const o = moveRegionProbe(world, mk(), dt, { maxSteps: cap });
    if (o.pendingLift && o.continuation) return { cap, o };
  }
  return null;
}

const floorDoc = scene('crfloor', [e3('room')], [
  spawn('s', 'room', [0, 0, 1]),
  { id: 'ground', regionId: 'room', kind: 'plane', position: [0, 0, 0], up: [0, 0, 1] },
]);
const funnelDoc = (id, walls, sp, units = UNITS) => scene(id, [e3('room')], [
  spawn('s', 'room', [0, 0, 1]), ...walls,
], [], units);
const E3FUNNEL = [
  { id: 'w1', regionId: 'room', kind: 'plane', position: [0.5, 0, 0], up: [-0.8, 0, 0.6] },
  { id: 'w2', regionId: 'room', kind: 'plane', position: [-0.5, 0, 0], up: [0.8, 0, 0.6] },
];
const tiltDoc = scene('crtilt', [e3('room')], [
  spawn('s', 'room', [0, 0, 1]),
  { id: 'g', regionId: 'room', kind: 'plane', position: [0, 0, 0], up: [0, -0.6, 0.8] },
]);
function s3funnelDoc(id, R, k, extent, pr) {
  return scene(id, [s3('orb', R, extent)], [
    spawn('s', 'orb', [0, 0, 0.8 * k]),
    { id: 'w1', regionId: 'orb', kind: 'plane', position: [0.3 * k, 0, 0], up: [-0.8, 0, 0.6] },
    { id: 'w2', regionId: 'orb', kind: 'plane', position: [-0.3 * k, 0, 0], up: [0.8, 0, 0.6] },
  ], [], unitsFor(pr));
}

check('Q1: forgeries never move the walker', () => {
  const world = compileRegionWorld(floorDoc);
  const debtOf = () => moveRegionProbe(world,
    stateAt(world, 'room', [0, 0, 1.5], [3, 0, -4]), 1, { maxSteps: 8 });
  const base = debtOf();
  assert.ok(base.pendingLift && base.continuation, 'fixture must owe with continuation');
  const attempt = (tag, suspended, worldArg = world) => {
    const out = resumeRegionCorrection(worldArg, suspended);
    assert.equal(out.status, 'stale-continuation', `${tag}: must refuse`);
    assert.equal(out.corrected, 0, `${tag}: must walk nothing`);
    // Nothing changed: the returned endpoint is exactly what was presented.
    assert.ok([...out.state.position].every((x, i) => x === suspended.state.position[i]),
      `${tag}: endpoint untouched`);
    return out;
  };
  attempt('clone', { ...base, continuation: { ...base.continuation } });
  attempt('frozen-clone', { ...base, continuation: Object.freeze({ ...base.continuation }) });
  attempt('handwritten-debt', { ...base, continuation: { ...base.pendingLift } });
  attempt('cross-scene', base, compileRegionWorld(floorDoc));
  attempt('recompiled-identical', base,
    compileRegionWorld(JSON.parse(JSON.stringify(floorDoc))));
  attempt('endpoint-moved-1e-16', { ...base,
    state: { ...base.state, position: base.state.position.map((x, i) => (i === 0 ? x + 1e-16 : x)) } });
  // Double present: the first (valid) spends the continuation.
  const fresh = debtOf();
  const first = resumeRegionCorrection(world, fresh);
  assert.equal(first.status, 'complete', 'control must complete');
  assert.ok(first.corrected > 0, 'control must walk the residual');
  attempt('second-present', fresh);
  assert.throws(() => resumeRegionCorrection(world, { ...base, continuation: null }),
    'result without continuation throws (host bug, not a refusal)');
  console.log(`  7 forgeries stale with corrected=0; control walked ${first.corrected.toExponential(2)}`);
});

check('Q1: even a kernel-issued splice at the same endpoint dies on camera identity', () => {
  const world = compileRegionWorld(floorDoc);
  const shared = stateAt(world, 'room', [0, 0, 1.5], [3, 0, -4]);
  const A = moveRegionProbe(world, shared, 1, { maxSteps: 8 });
  const B = moveRegionProbe(world, shared, 1, { maxSteps: 8 });
  assert.ok(A.continuation && B.continuation);
  assert.ok(A.state.position.every((x, i) => x === B.state.position[i]), 'same endpoint values');
  const out = resumeRegionCorrection(world, { ...B, continuation: A.continuation });
  assert.equal(out.status, 'stale-continuation');
  assert.equal(out.detail, 'endpoint-moved', 'camera identity is the pin that kills it');
  assert.equal(out.corrected, 0);
});

check('Q2: resumed == uninterrupted on E3 (position and camera)', () => {
  const cases = [
    { doc: funnelDoc('cre3f', E3FUNNEL), region: 'room', start: [0, 0, 2], vk: 2, vs: -6, dt: 1, radii: [0.1, 0.25, 0.5] },
    { doc: tiltDoc, region: 'room', start: [0, 0, 1.5], vk: 2, vs: -4, dt: 1, radii: [0.25, 0.5] },
  ];
  for (const cfg of cases) {
    const world = compileRegionWorld(cfg.doc);
    const space = world.regions.get(cfg.region).space;
    for (const radius of cfg.radii) {
      const vel = space.frame(cfg.start)[cfg.vk].map((x) => x * cfg.vs);
      const mk = () => stateAt(world, cfg.region, cfg.start, vel, radius);
      const ref = moveRegionProbe(world, mk(), cfg.dt, { maxSteps: 512 });
      assert.ok(!ref.pendingLift, 'reference must finish');
      const found = starveTail(world, mk, cfg.dt, ref);
      assert.ok(found, 'must find a tail-starvation cap');
      const debt = found.o.pendingLift.distance;
      const dStar = space.distance(found.o.state.position, ref.state.position);
      assert.ok(dStar <= debt * 1.001 + 1e-12, `travel must match (dStar ${dStar} vs debt ${debt})`);
      for (const rms of [undefined, 5]) {
        const fresh = moveRegionProbe(world, mk(), cfg.dt, { maxSteps: found.cap });
        const { cur, iters } = resumeLoop(world, fresh, rms);
        assert.equal(cur.status, 'complete', `must finish (got ${cur.status})`);
        assert.ok(!cur.pendingLift, 'no debt left');
        const dp = space.distance(ref.state.position, cur.state.position);
        const dc = camDiff(cur.state.camera, ref.state.camera);
        assert.ok(dp <= 1e-9, `same walker position (got ${dp})`);
        assert.ok(dc <= 1e-9, `same camera (got ${dc})`);
        assert.ok(clockZero(cur), 'resume clock fields all zero');
      }
      console.log(`  E3 r=${radius} cap=${found.cap}: dPos=0 dCam<=1.1e-16 (rms 24 and 5)`);
    }
  }
});

check('Q2: resumed == uninterrupted on S3 at R=0.5/2/8', () => {
  const cases = [
    { id: 'crs38', R: 8, k: 1, extent: 8, pr: 0.25, radii: [0.1, 0.25, 0.5] },
    { id: 'crs32', R: 2, k: 1, extent: 3, pr: 0.25, radii: [0.1, 0.25, 0.5] },
    { id: 'crs3h', R: 0.5, k: 0.35, extent: 0.7, pr: 0.09, radii: [0.035, 0.087, 0.175] },
  ];
  for (const cfg of cases) {
    const world = compileRegionWorld(s3funnelDoc(cfg.id, cfg.R, cfg.k, cfg.extent, cfg.pr));
    const space = world.regions.get('orb').space;
    const pos = [...space.decode([0, 0, 1.6 * cfg.k])];
    const b0 = space.frame(space.decode([0, 0, 0.8 * cfg.k]));
    const v = b0[0].map((_, i) => b0[2][i] * -5 * cfg.k);
    const vel = space.transport(space.decode([0, 0, 0.8 * cfg.k]), pos, v);
    let worst = 0, worstCam = 0;
    for (const radius of cfg.radii) {
      const mk = () => stateAt(world, 'orb', pos, vel, radius);
      const ref = moveRegionProbe(world, mk(), 1, { maxSteps: 512 });
      assert.ok(!ref.pendingLift, 'reference must finish');
      const found = starveTail(world, mk, 1, ref);
      assert.ok(found, 'must find a tail-starvation cap');
      const debt = found.o.pendingLift.distance;
      const dStar = space.distance(found.o.state.position, ref.state.position);
      assert.ok(dStar <= debt * 1.001 + 1e-12, `travel must match (dStar ${dStar} vs debt ${debt})`);
      for (const rms of [undefined, 5]) {
        const fresh = moveRegionProbe(world, mk(), 1, { maxSteps: found.cap });
        const { cur } = resumeLoop(world, fresh, rms);
        assert.equal(cur.status, 'complete');
        const dp = space.distance(ref.state.position, cur.state.position);
        const dc = camDiff(cur.state.camera, ref.state.camera);
        worst = Math.max(worst, dp); worstCam = Math.max(worstCam, dc);
        assert.ok(dp <= 1e-9 && dc <= 1e-9, `R=${cfg.R} r=${radius}: dPos ${dp} dCam ${dc}`);
        assert.ok(clockZero(cur));
      }
    }
    console.log(`  S3 R=${cfg.R}: worst dPos=${worst.toExponential(1)} worst dCam=${worstCam.toExponential(1)}`);
  }
});

check('Q2/Q3: chained single-step resumes conserve the residual exactly', () => {
  for (const [tag, doc, region, start, s3flag] of [
    ['E3', funnelDoc('crchaine', E3FUNNEL), 'room', [0, 0, 2], false],
    ['S3', s3funnelDoc('crchains', 8, 1, 8, 0.25), 'orb', [0, 0, 1.6], true],
  ]) {
    const world = compileRegionWorld(doc);
    const space = world.regions.get(region).space;
    const pos = s3flag ? [...space.decode(start)] : start.slice();
    const vel = space.frame(pos)[2].map((x) => x * (s3flag ? -5 : -6));
    const mk = () => stateAt(world, region, pos, vel, 0.25);
    const ref = moveRegionProbe(world, mk(), 1, { maxSteps: 512 });
    const found = starveTail(world, mk, 1, ref);
    assert.ok(found);
    const debt0 = found.o.pendingLift.distance;
    let cur = moveRegionProbe(world, mk(), 1, { maxSteps: found.cap });
    let walked = 0, links = 0;
    while (cur.pendingLift && cur.continuation && links < 20) {
      cur = resumeRegionCorrection(world, cur, { maxSteps: 1 });
      walked += cur.corrected;
      links++;
      assert.ok(clockZero(cur), 'every link reads zero time');
      assert.ok(cur.corrected <= debt0 + 1e-12, 'no link walks more than was owed');
    }
    assert.equal(cur.status, 'complete');
    assert.ok(Math.abs(walked - debt0) <= 1e-12, `residual conserved (walked ${walked} vs owed ${debt0})`);
    assert.ok(space.distance(ref.state.position, cur.state.position) <= 1e-9, 'chain ends at the reference');
    // Ground per dt: the debt+resume sequence covers exactly the uninterrupted ground.
    const dRef = space.distance(pos, ref.state.position).toFixed(6);
    const dSeq = space.distance(pos, cur.state.position).toFixed(6);
    assert.equal(dSeq, dRef, 'same ground per dt');
    console.log(`  ${tag}: ${links} links, walked==owed to 1e-12, ground ${dSeq}/dt identical`);
  }
});

check('adjudication: no resumed correction reaches a chart edge', () => {
  // Attempted: edge-corner rattle (0.30 from the edge), equator funnel at
  // extent exactly pi*R/2, domain-exit debt endpoint. Every resume ends
  // complete and inside; none returns a domain event.
  const seen = new Set();
  const track = (world, suspended, region) => {
    let cur = suspended, n = 0;
    const space = world.regions.get(region).space;
    while (cur.pendingLift && cur.continuation && n < 8) {
      cur = resumeRegionCorrection(world, cur);
      n++;
      seen.add(`${cur.status}/${cur.detail ?? '-'}`);
      assert.notEqual(cur.detail, 'domain', 'a resumed correction must not end at a chart edge');
      assert.ok(space.withinDomain([...cur.state.position]), 'resumed endpoint stays in-domain');
      if (cur.status !== 'complete' && cur.status !== 'budget-exhausted') break;
    }
    return cur;
  };
  // Edge-corner rattle.
  {
    const doc = scene('credge', [e3('corner', 2.5)], [
      spawn('s', 'corner', [0, 0, 0.5]),
      { id: 'wall', regionId: 'corner', kind: 'plane', position: [2.44, 0, 0.5], up: [-1, 0, 0] },
      { id: 'floor', regionId: 'corner', kind: 'plane', position: [0, 0, 0], up: [0, 0, 1] },
    ]);
    const world = compileRegionWorld(doc);
    const o = moveRegionProbe(world, stateAt(world, 'corner', [1.0, 0, 1.2], [4, 0, -3]), 0.6, { maxSteps: 12 });
    assert.ok(o.pendingLift && o.continuation, 'corner must owe');
    const edgeDist = 2.5 - Math.hypot(...o.state.position);
    assert.ok(edgeDist < 0.5, `debt must sit near the edge (got ${edgeDist})`);
    const cur = track(world, o, 'corner');
    assert.equal(cur.status, 'complete');
  }
  // Equator funnel at the maximum admissible extent.
  {
    const R = 2;
    const doc = scene('crequator', [s3('orb', R, Math.PI * R / 2)], [
      spawn('s', 'orb', [0, 0, 2.5]),
      { id: 'w1', regionId: 'orb', kind: 'plane', position: [0.3, 0, 2.2], up: [-0.8, 0, 0.6] },
      { id: 'w2', regionId: 'orb', kind: 'plane', position: [-0.3, 0, 2.2], up: [0.8, 0, 0.6] },
    ]);
    const world = compileRegionWorld(doc);
    const space = world.regions.get('orb').space;
    const pos = [...space.decode([0, 0, 2.9])];
    const vel = space.frame(pos)[2].map((x) => x * -3);
    const o = moveRegionProbe(world, stateAt(world, 'orb', pos, vel), 1, { maxSteps: 40 });
    assert.ok(o.pendingLift && o.continuation, 'equator rattle must owe');
    const cur = track(world, o, 'orb');
    assert.equal(cur.status, 'complete');
  }
  // Domain-exit debt endpoint.
  {
    const doc = scene('crdomexit', [e3('edge', 2.5)], [
      spawn('s', 'edge', [0, 0, 0.5]),
      { id: 'ground', regionId: 'edge', kind: 'plane', position: [0, 0, 0], up: [0, 0, 1] },
    ]);
    const world = compileRegionWorld(doc);
    const o = moveRegionProbe(world, stateAt(world, 'edge', [0, 0, 0.5], [4, 0, -2]), 1);
    assert.equal(o.status, 'domain-exit');
    assert.ok(o.pendingLift && o.continuation, 'edge stop must owe');
    const cur = track(world, o, 'edge');
    assert.equal(cur.status, 'complete');
  }
  // CORRECTED after this suite was written: a resumed correction CAN reach the
  // chart edge. Every floor above sits at the chart origin's own level, so
  // descending moves the walker INWARD and the edge is never in front of the
  // settle. Put the floor below the chart centre and a slide carries the
  // walker to where the point beneath it is outside -- see
  // `correction-resume.test.js`, "A RESUMED CORRECTION CAN REACH THE CHART
  // EDGE". What these three scenes show is real and unchanged; the scope of
  // the claim is what was too wide.
  console.log(`  resume endings seen: ${[...seen].join(', ')} `
    + '(no domain/* in THESE scenes; the ending is reachable, see correction-resume.test.js)');
});

console.log(`\ncorrection-resume-truth: ${passed} checks passed, ${failed} failed`);
if (failed) process.exit(1);
