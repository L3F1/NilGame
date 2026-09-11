// MUSE-48: four sampled invariants as named regression checks.
//
// From MUSE-46's missing-check list, with their original input
// assumptions: a VALID EXTERIOR distance bound (exact planes/balls here,
// never a conservative composite) and a NON-OVERLAPPING start (every
// start asserts clearance > 0 or the check fails loud instead of
// measuring). Deterministic LCG seeds with non-vacuous counts printed per
// check. Curved (S3) cases where meaningful. Every number below is a
// MEASURED margin, not a theorem — the asserts pin strict positivity so a
// regression fails, and print the margin so a reader sees how much room
// there is. No universal proof is claimed; historical reports untouched.
// Fail-demo: isolated exit-offset removal (report §fail-demo).
import assert from 'node:assert/strict';
import { compileRegionWorld } from './engine/world/region-world.js';
import { moveRegionProbe } from './engine/world/region-motion.js';
import { sweep } from './engine/world/collision.js';
import { createCameraFrame, turn, carryAlong } from './engine/world/camera-frame.js';

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 2 ** 32; };
}
const UNITS = { name: 'design-unit', playerRadius: 0.25 };
const e3 = (id, extent = 30) => ({ id, geometry: { kind: 'e3', curvatureRadius: 1 }, topology: 'cover', extent });
const s3 = (id, R, extent) => ({ id, geometry: { kind: 's3', curvatureRadius: R }, topology: 'cover', extent });
const spawn = (id, regionId, position) => ({ id, regionId, kind: 'spawn', position });
const anchor = (id, regionId, position, forward, radius = 0.9, up = [0, 0, 1]) =>
  ({ id, regionId, kind: 'anchor', position, forward, up, radius });
const link = (id, a, b) => ({ id, kind: 'portal', a, b, velocity: 'preserve-speed', scale: 1 });
const scene = (id, regions, entities, connections = []) =>
  ({ format: 'nil-scene', version: 2, id, units: UNITS, regions, entities, connections });
const U = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
function stateAt(world, regionId, position, velocity, radius = 0.25) {
  const { space } = world.regions.get(regionId);
  const basis = space.frame(position);
  return { regionId, position: position.slice(), velocity: velocity.slice(), radius,
    camera: turn(createCameraFrame(space, position, { forward: basis[1], up: basis[2] }), {}) };
}
// Input assumption, enforced: the start is strictly outside every solid.
function requireClear(field, p, radius, tag) {
  const gap = field.distance(p) - radius;
  assert.ok(gap > 0, `${tag}: overlapping start (gap ${gap}), assumption violated`);
}

check('swept-path-stays-outside: no tunneling at any speed', () => {
  // Thin box wall (half 0.02) and small ball, speeds 1..1e6, seeded grazes.
  // The E3 side is an ENDPOINT sign detector over committed states, NOT a
  // dense swept proof: tunneled = opposite side with empty contacts. What
  // catches a contact followed by penetration is the committed-state
  // clearance asserted on every contact sample and final state below.
  // Exact plane/box/ball bounds only; every start asserts clearance first.
  const world = compileRegionWorld(scene('invthin', [e3('room')], [
    spawn('s', 'room', [-5, 0, 0]),
    { id: 'wall', regionId: 'room', kind: 'box', position: [0, 0, 0], halfExtent: [0.02, 5, 5] },
  ]));
  const { space, field } = world.regions.get('room');
  const rand = lcg(0x48);
  let runs = 0, engaged = 0, tunneled = 0, minCommit = Infinity;
  const statuses = {};
  for (const v of [1, 10, 100, 1000, 1e4, 1e5, 1e6]) {
    for (let k = 0; k < 5; k++) {
      const y = (rand() * 2 - 1) * 4, z = (rand() * 2 - 1) * 4;
      const start = [-5, y, z];
      requireClear(field, start, 0.25, 'thin-wall');
      const o = moveRegionProbe(world, stateAt(world, 'room', start, [v, 0, 0]), 1);
      runs++;
      if (o.contacts > 0 || o.contactSamples.length > 0) engaged++;
      for (const cs of o.contactSamples) {
        const c = field.distance(cs.position) - 0.25;
        assert.ok(c > 0, `wall contact at zero clearance (gap ${c})`);
        minCommit = Math.min(minCommit, c);
      }
      const end = field.distance(o.state.position) - 0.25;
      assert.ok(end > 0, `committed end state inside solid (gap ${end})`);
      minCommit = Math.min(minCommit, end);
      statuses[o.status] = (statuses[o.status] ?? 0) + 1;
      if (Math.sign(o.state.position[0]) !== Math.sign(start[0])
        && o.contactSamples.length === 0 && o.status === 'complete') tunneled++;
    }
  }
  assert.ok(engaged > runs / 2, `solver must engage (engaged ${engaged}/${runs})`);
  assert.equal(tunneled, 0, `tunneled ${tunneled}/${runs}`);
  // S3 small ball, raw sweep, seeded offsets incl. grazing.
  const s3w = compileRegionWorld(scene('invthinball', [s3('orb', 8, 8)], [
    spawn('s', 'orb', [-5, 0, 0]),
    { id: 'rock', regionId: 'orb', kind: 'ball', position: [0, 0, 0], radius: 0.05 },
  ]));
  const ss = s3w.regions.get('orb').space, sf = s3w.regions.get('orb').field;
  // Oracle: independent dense trace of the signed surface-distance field along
  // the exact geodesic the sweep follows. S3 geodesics are periodic, so one
  // full period [0, 2*PI*R] is the whole story at any speed. Near-band rays
  // (coarse min within BAND1 of the envelope) are NOT decided by the coarse
  // trace: a 20000-sample local refinement decides outside BAND2, and what
  // is still inside is counted inconclusive with no verdict asserted.
  const BAND1 = 2e-3, BAND2 = 2e-4, PERIOD = 2 * Math.PI * 8;
  const traceMin = (from, dir, lo, hi, n) => {
    let m = { s: lo, v: Infinity };
    for (let i = 0; i <= n; i++) {
      const s = lo + ((hi - lo) * i) / n;
      const v = sf.distance(ss.step(from, dir, s));
      if (v < m.v) m = { s, v };
    }
    return m;
  };
  // Engineered grazes (bisected in /tmp probes): 0.2595 resolves HIT,
  // 0.2603 resolves MISS, 0.259891 (true min 0.25 - 4e-7) stays inside
  // BAND2 and exercises the inconclusive path.
  let bruns = 0, hits = 0, misses = 0, incon = 0, minGap = Infinity;
  for (const v of [1, 50, 500, 5000, 1e5]) {
    for (const dy of [0, 0.04, 0.2, -0.3, 0.2595, 0.259891, 0.2603]) {
      const from = [...ss.decode([-5, dy, 0])];
      requireClear(sf, from, 0.25, 's3-start');
      const dir = ss.normalize(from, ss.logAt(from, ss.decode([5, dy, 0])));
      const r = sweep(sf, ss, { from, direction: [...dir], distance: v, radius: 0.25 });
      bruns++;
      const span = Math.min(v, PERIOD);
      const c = traceMin(from, dir, 0, span, 20000);
      let verdict;
      if (c.v < 0.25 - BAND1) verdict = 'hit';
      else if (c.v > 0.25 + BAND1) verdict = 'miss';
      else {
        const f = traceMin(from, dir, Math.max(0, c.s - 0.05), Math.min(span, c.s + 0.05), 20000);
        if (f.v < 0.25 - BAND2) verdict = 'hit';
        else if (f.v > 0.25 + BAND2) verdict = 'miss';
        else verdict = 'inconclusive';
      }
      if (verdict === 'hit') {
        assert.ok(r.hit, `TUNNEL v=${v} dy=${dy}: oracle min below envelope, no hit`);
        hits++;
      } else if (verdict === 'miss') {
        assert.ok(!r.hit, `PHANTOM v=${v} dy=${dy}: oracle min above envelope, hit registered`);
        misses++;
      } else incon++;
      if (r.hit) {
        // The stop is compared against the player radius, not zero: a hit
        // whose center is outside can still mean a penetrating body.
        const gap = sf.distance(r.position) - 0.25;
        assert.ok(gap >= -1e-3, `penetrating body at v=${v} dy=${dy} (gap ${gap})`);
        minGap = Math.min(minGap, gap);
      }
    }
  }
  assert.ok(incon === 4, `band path must be exercised (got ${incon} inconclusive)`);
  console.log(`  E3 ${runs} runs (${engaged} engaged) min committed clearance=${minCommit.toExponential(2)} statuses=${JSON.stringify(statuses)}`);
  console.log(`  S3 ${bruns} sweeps: ${hits} oracle-hits, ${misses} clean misses, ${incon} inconclusive (band), min envelope gap=${minGap.toExponential(2)}`);
});

check('contact-margin-above-zero: the probe never lands on a surface', () => {
  // Seeded contacts across floor/wall/ball/corner scenes, E3+S3. The
  // assert is strict positivity; the printed min is the measured margin.
  const world = compileRegionWorld(scene('invmargin', [e3('room')], [
    spawn('s', 'room', [0, 0, 1]),
    { id: 'g', regionId: 'room', kind: 'plane', position: [0, 0, 0], up: [0, 0, 1] },
    { id: 'w', regionId: 'room', kind: 'plane', position: [0, 2, 0], up: [0, -1, 0] },
    { id: 'rock', regionId: 'room', kind: 'ball', position: [3, 0, 0.5], radius: 0.6 },
  ]));
  const { field } = world.regions.get('room');
  const rand = lcg(0x49);
  let minClear = Infinity, n = 0;
  const starts = [[-1, 0, 1], [0, 0, 1.5], [1, 1, 2], [3, -2, 1], [0, 1, 0.6]];
  for (const s0 of starts) {
    for (let k = 0; k < 8; k++) {
      const v = [(rand() * 2 - 1) * 4, (rand() * 2 - 1) * 4, -rand() * 5];
      requireClear(field, s0, 0.25, 'margin');
      const o = moveRegionProbe(world, stateAt(world, 'room', s0, v), 1, { maxSteps: 200 });
      for (const cs of o.contactSamples) {
        const c = field.distance(cs.position) - 0.25;
        n++;
        assert.ok(c > 0, `contact at zero clearance (got ${c})`);
        minClear = Math.min(minClear, c);
      }
    }
  }
  assert.ok(n >= 20, `contacts must occur (got ${n})`);
  // S3 floor contacts.
  const s3w = compileRegionWorld(scene('invmargins3', [s3('orb', 8, 8)], [
    spawn('s', 'orb', [0, 0, 1]),
    { id: 'g', regionId: 'orb', kind: 'plane', position: [0, 0, 0], up: [0, 0, 1] },
  ]));
  const sspace = s3w.regions.get('orb').space, sf = s3w.regions.get('orb').field;
  for (let k = 0; k < 10; k++) {
    const a0 = [(rand() * 2 - 1), (rand() * 2 - 1), 0.5 + rand()];
    const s0 = [...sspace.decode(a0)];
    requireClear(sf, s0, 0.25, 'margin-s3');
    // S3 velocity must be a 4-dim embedding tangent: aim at the floor point
    // below the start.
    const down = sspace.normalize(s0, sspace.logAt(s0, sspace.decode([a0[0], a0[1], 0.05])));
    const o = moveRegionProbe(s3w, stateAt(s3w, 'orb', s0, down.map((x) => x * 3)), 1, { maxSteps: 200 });
    for (const cs of o.contactSamples) {
      const c = sf.distance(cs.position) - 0.25;
      n++;
      assert.ok(c > 0, `S3 contact at zero clearance (got ${c})`);
      minClear = Math.min(minClear, c);
    }
  }
  console.log(`  ${n} contacts, measured min margin=${minClear.toExponential(2)} (asserted > 0; clusters at safetyMargin = skin/2 = 5e-5)`);
});

check('committed-crossing-leaves-source: exit strictly destination-side', () => {
  // The exit moment is observed by freezing the probe right after the
  // crossing: dt = time-to-gate + 1e-6, so post-exit travel (< 1e-5) cannot
  // hide the exit offset (code: exitOffset = 4 * skin, skin = 1e-4).
  // Every committed exit must sit strictly past the aperture by that
  // measured offset, never exactly on it; a refused (exit-obstructed)
  // crossing keeps status blocked-exit strictly source-side.
  const world = compileRegionWorld(scene('invside', [e3('a', 9), e3('b', 9)], [
    spawn('sa', 'a', [0, 0, 0]), spawn('sb', 'b', [4, 0, 0]),
    anchor('ga', 'a', [2, 0, 0], [-1, 0, 0], 1.2),
    anchor('gb', 'b', [0, 0, 0], [1, 0, 0], 1.2),
  ], [link('gate', 'ga', 'gb')]));
  const rand = lcg(0x4a);
  let n = 0, minExit = Infinity, maxExit = 0;
  for (let k = 0; k < 6; k++) {
    const sy = (rand() * 2 - 1) * 0.5, v = 2 + rand() * 4;
    const o = moveRegionProbe(world, stateAt(world, 'a', [0, sy, 0], [v, 0, 0]), 2 / v + 1e-6);
    assert.equal(o.crossings, 1, `seed ${k}: must cross exactly once (got ${o.crossings})`);
    assert.equal(o.state.regionId, 'b', `seed ${k}: exit must be destination-side`);
    n++;
    // Exit = gb anchor + 4e-4 along +x (gb forward), plus < 1e-5 post travel.
    const [x, y] = o.state.position;
    assert.ok(x > 0, `seed ${k}: exit exactly on/before aperture (x=${x})`);
    assert.ok(x >= 4e-4 - 1e-9, `seed ${k}: exit offset missing (x=${x})`);
    assert.ok(x <= 4e-4 + 2e-5, `seed ${k}: exit offset wrong (x=${x})`);
    assert.ok(Math.abs(y - sy) < 1e-9, `seed ${k}: transverse not preserved (y=${y} sy=${sy})`);
    minExit = Math.min(minExit, x); maxExit = Math.max(maxExit, x);
  }
  assert.ok(n === 6, `crossings must occur (got ${n})`);
  // Refused crossing: a ball parked on the exit locus obstructs the offset
  // sweep, so the probe is retained strictly source-side.
  const blocked = compileRegionWorld(scene('invsideblocked', [e3('a', 9), e3('b', 9)], [
    spawn('sa', 'a', [0, 0, 0]), spawn('sb', 'b', [4, 0, 0]),
    anchor('ga', 'a', [2, 0, 0], [-1, 0, 0], 1.2),
    anchor('gb', 'b', [0, 0, 0], [1, 0, 0], 1.2),
    { id: 'plug', regionId: 'b', kind: 'ball', position: [0.2, 0.1, 0], radius: 0.1 },
  ], [link('gate', 'ga', 'gb')]));
  const rb = moveRegionProbe(blocked, stateAt(blocked, 'a', [0, 0.1, 0], [4, 0, 0]), 1);
  assert.equal(rb.crossings, 0, 'obstructed exit must not cross');
  assert.equal(rb.status, 'blocked-exit', `status must say blocked-exit (got ${rb.status})`);
  assert.equal(rb.state.regionId, 'a', 'refused probe stays source-side');
  assert.ok(rb.state.position[0] < 2, `checkpoint strictly source-side (x=${rb.state.position[0]})`);
  // S3 exit side, frozen the same way: dt = 3/4 + 1e-6 stops just inside orb.
  const s3w = compileRegionWorld(scene('invsideese', [e3('a', 9), s3('orb', 8, 8), e3('b', 12)], [
    spawn('sa', 'a', [0, 0, 0]), spawn('so', 'orb', [0, 0, 0]), spawn('sb', 'b', [10, 0, 0]),
    anchor('ga', 'a', [3, 0, 0], [-1, 0, 0], 1.5),
    anchor('go', 'orb', [0, 0, -2], [0, 0, 1], 1.5, [0, 1, 0]),
    anchor('ho', 'orb', [0, 0, 2], [0, 0, -1], 1.5, [0, 1, 0]),
    anchor('hb', 'b', [10, 0, 0], [1, 0, 0], 1.5),
  ], [link('in', 'ga', 'go'), link('out', 'ho', 'hb')]));
  const so = moveRegionProbe(s3w, stateAt(s3w, 'a', [0, 0, 0], [4, 0, 0]), 3 / 4 + 1e-6);
  assert.equal(so.crossings, 1, `S3 route must cross once (got ${so.crossings})`);
  assert.equal(so.state.regionId, 'orb', 'S3 exit must be destination-side');
  const [ox, oy, oz] = s3w.regions.get('orb').space.encode(so.state.position);
  assert.ok(oz > -2 && oz >= -2 + 4e-4 - 1e-9 && oz <= -2 + 4e-4 + 2e-5, `S3 exit offset wrong (${[ox, oy, oz].map((z) => z.toFixed(6)).join(',')})`);
  assert.ok(Math.abs(ox) < 1e-9 && Math.abs(oy) < 1e-9, 'S3 transverse not preserved');
  console.log(`  ${n} E3 exits x in [${minExit.toExponential(2)},${maxExit.toExponential(2)}] (≈4e-4=skin*4), 1 refusal source-side, S3 exit z=${oz.toFixed(6)}`);
});

check('camera-frames-stay-right-handed across turns and transports', () => {
  // Revision per Astra review: the old xyz-projection triple folded chart
  // foreshortening (~p.w) into its magnitude. Handedness is now the
  // determinant in LOCAL tangent coordinates (intrinsic ambient dots
  // against space.frame), cross-checked on S3 by the oriented 4D volume
  // det[forward,up,right,position]. Orthonormality is a separate Gram
  // assert, S3 tangency a separate dot assert. Paths are 30-round
  // turn+transport sequences on ONE frame (transport via carryAlong over
  // real stepWithTransport legs), not create-turn-once. A reflected copy
  // is the negative control: the same determinant must come out negative.
  const world = compileRegionWorld(scene('invhand', [e3('room'), s3('orb', 8, 8)], [
    spawn('sa', 'room', [0, 0, 0]), spawn('so', 'orb', [0, 0, 0]),
  ]));
  const rand = lcg(0x4b);
  const dot = (a, b) => a.reduce((t, x, i) => t + x * b[i], 0);
  const det3rows = ([f, u, r]) =>
    f[0] * (u[1] * r[2] - u[2] * r[1])
    - f[1] * (u[0] * r[2] - u[2] * r[0])
    + f[2] * (u[0] * r[1] - u[1] * r[0]);
  const localDet = (space, p, cam) => det3rows(
    [cam.forward, cam.up, cam.right].map((a) => space.frame(p).map((e) => dot(a, e))));
  const det4 = (m) => {
    if (m.length === 1) return m[0][0];
    let d = 0;
    for (let j = 0; j < m.length; j++) {
      const sub = m.slice(1).map((row) => row.filter((_, k) => k !== j));
      d += (j % 2 ? -1 : 1) * m[0][j] * det4(sub);
    }
    return d;
  };
  const gramDev = (cam) => {
    const axes = [cam.forward, cam.up, cam.right];
    let worst = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
      worst = Math.max(worst, Math.abs(dot(axes[i], axes[j]) - (i === j ? 1 : 0)));
    return worst;
  };
  let rounds = 0, neg = 0, worstGram = 0, minDet = Infinity;
  for (const regionId of ['room', 'orb']) {
    const space = world.regions.get(regionId).space;
    const curved = regionId === 'orb';
    for (let path = 0; path < 20; path++) {
      let p = curved
        ? [...space.decode([(rand() - 0.5) * 4, (rand() - 0.5) * 4, (rand() - 0.5) * 4])]
        : [(rand() - 0.5) * 10, (rand() - 0.5) * 10, (rand() - 0.5) * 10];
      const basis = space.frame(p);
      let cam = createCameraFrame(space, p, { forward: [...basis[0]], up: [...basis[1]] });
      assert.ok(Math.abs(localDet(space, p, cam) - 1) < 1e-9, 'construction det is +1');
      assert.ok(gramDev(cam) < 1e-9, 'construction frame is orthonormal');
      const refl = { ...cam, right: cam.right.map((x) => -x) };
      assert.ok(localDet(space, p, refl) < 0, 'reflected frame must read negative');
      neg++;
      for (let step = 0; step < 30; step++) {
        cam = turn(cam, { yaw: (rand() - 0.5) * 0.6, pitch: (rand() - 0.5) * 0.6, roll: (rand() - 0.5) * 0.6 });
        if (step % 5 === 4) {
          const leg = space.stepWithTransport(cam.position, cam.forward, curved ? 0.05 : 0.5);
          cam = carryAlong(cam, leg);
        }
        p = [...cam.position];
        rounds++;
        const d = localDet(space, p, cam);
        assert.ok(d > 0, `handedness flipped on ${regionId} path ${path} step ${step} (${d})`);
        minDet = Math.min(minDet, d);
        const g = gramDev(cam);
        worstGram = Math.max(worstGram, g);
        assert.ok(g < 1e-9, `Gram drifted on ${regionId} path ${path} step ${step} (${g})`);
        if (curved) {
          for (const [nm, a] of [['forward', cam.forward], ['up', cam.up], ['right', cam.right]])
            assert.ok(Math.abs(dot(a, p)) < 1e-9, `S3 ${nm} left the tangent plane`);
          assert.ok(det4([cam.forward, cam.up, cam.right, p]) > 0, 'S3 4D orientation flipped');
        }
      }
    }
  }
  assert.ok(rounds === 1200 && neg === 40, `non-vacuous paths (rounds ${rounds}, controls ${neg})`);
  console.log(`  ${rounds} turn/transport rounds E3+S3, min local det=${minDet.toExponential(2)}, worst Gram dev=${worstGram.toExponential(2)}, S3 4D sign constant, ${neg} reflection controls negative`);
});

console.log(`\ninvariant-evidence: ${passed} checks passed, ${failed} failed`);
if (failed) process.exit(1);