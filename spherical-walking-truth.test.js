// MUSE-47: independent spherical support and walking audit.
//
// References are intrinsic (R*asin height against an independently lifted
// normal, analytic free fall, metric speed, substep refinement) on actual
// compiled worlds. Sampled claims stay sampled; no route generalizes to
// all support configurations. Full verdicts, defects with reproductions,
// and reference limits: docs/qa/muse47-walking-audit-2026-09-10.md.
import assert from 'node:assert/strict';
import { compileRegionWorld } from './engine/world/region-world.js';
import { createSphericalWalker } from './engine/world/spherical-walker.js';
import { resumeRegionCorrection } from './engine/world/region-motion.js';
import { createCameraFrame, turn } from './engine/world/camera-frame.js';

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

const UNITS = { name: 'design-unit', playerRadius: 0.25 };
const s3 = (id, R, extent) => ({ id, geometry: { kind: 's3', curvatureRadius: R }, topology: 'cover', extent });
const spawn = (id, regionId, position) => ({ id, regionId, kind: 'spawn', position });
function doc(id, R, extent, floor, extra = [], floorId = 'floor', sp = [0, 0, 1.5]) {
  return { format: 'nil-scene', version: 2, id, units: UNITS,
    regions: [{ id: 'orb', geometry: { kind: 's3', curvatureRadius: R }, topology: 'cover', extent, floorId }],
    entities: [spawn('s', 'orb', sp),
      { id: floorId, regionId: 'orb', kind: 'plane', position: floor.pos, up: floor.up }, ...extra],
    connections: [] };
}
function mkState(world, pos, radius = 0.25) {
  const { space } = world.regions.get('orb');
  const p = [...space.decode(pos)];
  const basis = space.frame(p);
  return { regionId: 'orb', position: p, velocity: [0, 0, 0, 0], radius,
    camera: turn(createCameraFrame(space, p, { forward: basis[1], up: basis[2] }), {}) };
}
// Independent floor-normal lift: author up through the floor-center frame.
function myNormal(space, floorPos, floorUp) {
  const c = space.decode(floorPos), basis = space.frame(c);
  return basis[0].map((_, i) => basis.reduce((s, a, j) => s + a[i] * floorUp[j], 0));
}
const FLAT = { pos: [0, 0, 0], up: [0, 0, 1] };

check('intrinsic height and up match on flat/tilted/offset floors, R=0.5/8/100', () => {
  const cases = [
    { R: 0.5, extent: 0.7, floor: FLAT, probes: [[0.1, 0, 0.3], [-0.1, 0.1, 0.15], [0, 0, 0.05]], spawn: [0, 0, 0.3] },
    { R: 8, extent: 8, floor: FLAT, probes: [[0.1, 0, 0.3], [-0.2, 0.15, 0.5], [0, 0, 0.05], [0.3, -0.2, 0.9]] },
    { R: 100, extent: 8, floor: FLAT, probes: [[0.1, 0, 0.3], [-0.2, 0.15, 0.5], [0, 0, 0.05], [0.3, -0.2, 0.9]] },
    { R: 8, extent: 8, floor: { pos: [0.5, -0.3, 0.4], up: [0, -0.6, 0.8] },
      probes: [[0.5, -0.3, 0.9], [1.2, 0.4, 0.2], [0.5, -0.3, 0.45]], spawn: [-2.5, -2, 3] },
  ];
  for (const cfg of cases) {
    const world = compileRegionWorld(doc(`h${cfg.R}`.replace('.', 'p'), cfg.R, cfg.extent,
      cfg.floor, [], 'floor', cfg.spawn ?? [0, 0, 1.5]));
    const { space } = world.regions.get('orb');
    const w = createSphericalWalker(world);
    const n = myNormal(space, cfg.floor.pos, cfg.floor.up);
    for (const a of cfg.probes) {
      const st = mkState(world, a);
      const s = w.support(st);
      const p = st.position;
      const dot = p.reduce((t, x, i) => t + x * n[i], 0);
      assert.ok(Math.abs(s.height - cfg.R * Math.asin(Math.max(-1, Math.min(1, dot)))) <= 1e-9,
        `R=${cfg.R} height mismatch at [${a}]`);
      const g = n.map((x, i) => x - dot * p[i]);
      const l = Math.hypot(...g);
      assert.ok(Math.hypot(...s.up.map((x, i) => x - g[i] / l)) <= 1e-9, `R=${cfg.R} up mismatch`);
    }
  }
  console.log('  height/up exact to 1e-9 across 4 configurations');
});

check('free fall converges first-order toward the analytic drop', () => {
  const world = compileRegionWorld(doc('fall', 8, 8, FLAT));
  const w = createSphericalWalker(world);
  const errs = [];
  for (const h of [1 / 120, 1 / 480]) {
    let st = mkState(world, [0, 0, 1.5]);
    const h0 = w.support(st).height;
    const n = Math.round(0.3 / h);
    for (let i = 0; i < n; i++) st = w.step(st, h, { wish: [0, 0], speed: 2 }).state;
    const s = w.support(st);
    assert.ok(s.height < h0, 'falling must lose height (directional pin against sign flips)');
    assert.ok(!s.grounded, 'still airborne after 0.3 s');
    errs.push(Math.abs(s.height - (h0 - 9 * 0.3 * 0.3 / 2)));
  }
  const ratio = errs[0] / errs[1];
  assert.ok(ratio > 3 && ratio < 5, `first-order refinement expected ratio ~4, got ${ratio}`);
  console.log(`  errs ${errs.map((e) => e.toExponential(1))} ratio=${ratio.toFixed(2)}`);
});

check('tangential speed is metric; long rest is pinned and drift-free', () => {
  const world = compileRegionWorld(doc('walkrest', 8, 8, FLAT));
  const { space } = world.regions.get('orb');
  const w = createSphericalWalker(world);
  const st = mkState(world, [0, 0, 0.25]);
  const o = w.step(st, 1, { wish: [0, 1], speed: 2 });
  assert.equal(o.status, 'complete');
  assert.ok(Math.abs(space.distance(st.position, o.state.position) - 2) < 1e-3, 'metric speed');
  assert.ok(o.grounded, 'still supported after walking');
  let rs = mkState(world, [0, 0, 0.25]);
  let lo = Infinity, hi = -Infinity, g = 0;
  for (let i = 0; i < 600; i++) {
    rs = w.step(rs, 1 / 60, { wish: [0, 0], speed: 2 }).state;
    const h = w.support(rs).height;
    lo = Math.min(lo, h); hi = Math.max(hi, h);
    if (w.support(rs).grounded) g++;
  }
  assert.equal(g, 600, 'grounded every frame');
  assert.ok(hi - lo < 1e-9, `height pinned (range ${hi - lo})`);
  assert.ok(space.distance(mkState(world, [0, 0, 0.25]).position, rs.position) < 1e-9, 'no drift');
  console.log(`  rest 600/600 grounded, height range ${(hi - lo).toExponential(0)}, drift 0`);
});

check('jump leaves support, air jump is a no-op, landing re-grounds', () => {
  const world = compileRegionWorld(doc('jump', 8, 8, FLAT));
  const w = createSphericalWalker(world);
  let st = mkState(world, [0, 0, 0.25]);
  assert.ok(w.support(st).grounded, 'starts supported');
  st = w.step(st, 1 / 60, { jump: true, jumpSpeed: 4 }).state;
  assert.ok(!w.support(st).grounded, 'jump separates');
  let peak = 0, landed = -1;
  for (let i = 0; i < 200; i++) {
    st = w.step(st, 1 / 60, {}).state;
    peak = Math.max(peak, w.support(st).height);
    if (w.support(st).grounded) { landed = i; break; }
  }
  assert.ok(Math.abs(peak - (0.25 + 16 / 18)) < 0.05, `apex ${peak} near v^2/2g`);
  assert.ok(landed >= 0, 'lands and re-grounds');
  let a = mkState(world, [0, 0, 1.5]);
  const before = w.support(a).height;
  a = w.step(a, 1 / 60, { jump: true, jumpSpeed: 4 }).state;
  assert.ok(w.support(a).height < before, 'air jump must not fire');
  console.log(`  apex=${peak.toFixed(4)} landed after ${landed} frames`);
});

check('nonfloor obstacle blocks without becoming support; aim stays finite', () => {
  const world = compileRegionWorld(doc('obst', 8, 8, FLAT,
    [{ id: 'rock', regionId: 'orb', kind: 'ball', position: [0, 2, 0.25], radius: 0.5 }]));;
  const { space } = world.regions.get('orb');
  const w = createSphericalWalker(world);
  let st = mkState(world, [0, 0, 0.25]);
  const p0 = [...st.position];
  let contacts = 0, sup = 0, n = 0;
  for (let i = 0; i < 60; i++) {
    const o = w.step(st, 1 / 60, { wish: [0, 1], speed: 2 });
    st = o.state; n++;
    if (o.contacts > 0) contacts++;
    if (o.grounded) sup++;
    if (o.status !== 'complete' && o.status !== 'stopped') break;
  }
  assert.equal(n, 60, 'no throw in the first 60 frames');
  assert.ok(contacts > 0, 'rock makes contact');
  const d = space.distance(p0, st.position);
  assert.ok(d < 1.6, `advance stops at the rock (went ${d})`);
  const s = w.support(st);
  assert.ok(Math.abs(s.height - 0.25) < 0.05 || !s.grounded, 'support stays floor-based near rock');
  console.log(`  60 frames, ${contacts} with contact, advance ${d.toFixed(3)} (rock face at 1.25)`);
  // Near-vertical aim both ways: finite, moves.
  for (const pitch of [-1.5, 1.5]) {
    let a = mkState(world, [0, 0, 0.25]);
    a = w.look(a, { pitch });
    const o = w.step(a, 0.5, { wish: [0, 1], speed: 2 });
    assert.ok([...o.state.position].every(Number.isFinite), `pitch ${pitch} finite`);
  }
  console.log('  vertical aim ±1.5 rad: finite, no throw');
});

check('invalid starts resolve visibly; singular pole and domain paths work', () => {
  const world = compileRegionWorld(doc('inv', 8, 8, FLAT,
    [{ id: 'rock', regionId: 'orb', kind: 'ball', position: [3, 0, 0.25], radius: 1 }]));;
  const w = createSphericalWalker(world);
  const t = (tag, pos, status, detail) => {
    const o = w.step(mkState(world, pos), 1 / 60, {});
    assert.equal(o.status, status, `${tag} status`);
    assert.equal(o.detail, detail, `${tag} detail`);
    assert.equal(o.timeConsumed, 0, `${tag} consumes nothing`);
  };
  t('center-in-solid', [3, 0, 0.25], 'unresolved', 'center-in-solid');
  // Singular up is reachable at an offset floor's pole (in-domain here).
  const poleWorld = compileRegionWorld(doc('pole', 8, 8,
    { pos: [0, 0, 5], up: [0, 0, 1] }, [], 'floor', [0, 3, 6]));
  const pw = createSphericalWalker(poleWorld);
  const { space } = poleWorld.regions.get('orb');
  const c = space.decode([0, 0, 5]), basis = space.frame(c);
  const n = basis[0].map((_, i) => basis.reduce((s, a, j) => s + a[i] * [0, 0, 1][j], 0));
  const l = Math.hypot(...n);
  const pole = n.map((x) => -x / l);
  assert.ok(space.withinDomain(pole), 'pole in domain for this floor');
  const fb = space.frame(pole);
  const pst = { regionId: 'orb', position: pole, velocity: [0, 0, 0, 0], radius: 0.05,
    camera: turn(createCameraFrame(space, pole, { forward: fb[0], up: fb[1] }), {}) };
  const ps = pw.support(pst);
  assert.equal(ps.reason, 'singular-floor-up', 'singular path live');
  assert.equal(ps.up, null);
  // Outside-domain via a hand-built off-chart point (decode cannot reach it).
  const edgeWorld = compileRegionWorld(doc('domedge', 8, 8, FLAT));
  const ew = createSphericalWalker(edgeWorld);
  const es = edgeWorld.regions.get('orb').space;
  const pin = [...es.decode([0, 0, 7.9])];
  const dir = es.normalize(pin, es.logAt(pin, [...es.decode([0, 0, 7.99])]));
  const out = es.step(pin, dir, 0.5);
  assert.ok(!es.withinDomain(out), 'hand-built point is off-chart');
  const eb = es.frame(pin);
  const ost = { regionId: 'orb', position: out, velocity: [0, 0, 0, 0], radius: 0.25,
    camera: turn(createCameraFrame(es, out, { forward: eb[1], up: eb[2] }), {}) };
  assert.equal(ew.support(ost).reason, 'outside-domain');
  const oo = ew.step(ost, 1 / 60, {});
  assert.equal(oo.status, 'unresolved');
  assert.equal(oo.detail, 'outside-domain');
  console.log('  center-in-solid, singular pole, hand-built off-chart: all visible');
});

check('unsupported constructions refused; designated reversed floor defines up', () => {
  const carved = { format: 'nil-scene', version: 2, id: 'modcarved', units: UNITS,
    regions: [{ id: 'orb', geometry: { kind: 's3', curvatureRadius: 8 }, topology: 'cover', extent: 8, floorId: 'floor' }],
    entities: [spawn('s', 'orb', [0, 0, 1.5]),
      { id: 'floor', regionId: 'orb', kind: 'plane', position: [0, 0, 0], up: [0, 0, 1] },
      { id: 'cut', regionId: 'orb', kind: 'ball', position: [0, 0, 0.1], radius: 0.4, op: 'subtract', target: 'floor' }],
    connections: [] };
  assert.throws(() => createSphericalWalker(compileRegionWorld(carved)), 'carved floor refused');
  const ballfl = { format: 'nil-scene', version: 2, id: 'modball', units: UNITS,
    regions: [{ id: 'orb', geometry: { kind: 's3', curvatureRadius: 8 }, topology: 'cover', extent: 8, floorId: 'floor' }],
    entities: [spawn('s', 'orb', [0, 0, 1.5]),
      { id: 'floor', regionId: 'orb', kind: 'ball', position: [0, 0, -3], radius: 2 }],
    connections: [] };
  assert.throws(() => createSphericalWalker(compileRegionWorld(ballfl)), 'ball floor refused');
  // Reviewed policy: the designated plane defines local gravity up; its
  // orientation relative to author Z does not make it an unsupported ceiling.
  const world = compileRegionWorld(doc('modceil', 8, 8, { pos: [0, 0, 2], up: [0, 0, -1] }, [], 'floor', [0, 0, 1.0]));
  const w = createSphericalWalker(world);
  let st = mkState(world, [0, 0, 1.75]);
  let g = 0;
  for (let i = 0; i < 120; i++) { const o = w.step(st, 1 / 60, {}); st = o.state; if (o.grounded) g++; }
  assert.equal(g, 120, 'designated reversed floor supports 120/120');
  console.log('  carved/ball floors refused; reversed designated floor supports');
});

check('clock aggregates honestly; budgets are finite; caller state untouched', () => {
  const world = compileRegionWorld(doc('clock', 8, 8, FLAT));
  const w = createSphericalWalker(world);
  const st = mkState(world, [0, 0, 2]);
  const before = JSON.stringify(st);
  const o = w.step(st, 0.2, { wish: [0, 0], speed: 2 });
  assert.ok(Math.abs(o.timeConsumed + o.timeRemaining - 0.2) < 1e-12, 'clock conserved');
  assert.equal(JSON.stringify(st), before, 'input state not mutated');
  const z = w.step(mkState(world, [0, 0, 0.25]), 0.5, { maxSubsteps: 0 });
  assert.equal(z.status, 'budget-exhausted');
  assert.equal(z.detail, 'substeps');
  assert.equal(z.timeConsumed, 0);
  const f = w.step(mkState(world, [0, 0, 2]), 1, { maxSubsteps: 240, maxSteps: 96 });
  assert.ok(f.substeps <= 240 && f.steps <= 240 * 96, 'finite work allowance');
  console.log(`  clock conserved; substeps=0 exhausts; work ${f.steps}/${240 * 96} steps`);
});

check('a real owed correction is returned, resumed explicitly, then walked', () => {
  const world = compileRegionWorld(doc('debtwalk', 8, 8, { pos: [0, 0, 0], up: [0, -0.6, 0.8] }));
  const w = createSphericalWalker(world);
  const o = w.step(mkState(world, [0, 0, 1.5]), 0.5, { wish: [0, 1], maxSteps: 8 });
  assert.equal(o.status, 'budget-exhausted', 'tight cap starves the settle');
  assert.ok(o.pendingLift && o.continuation, 'debt with continuation, no auto-resume');
  const r = resumeRegionCorrection(world, { status: o.status, detail: o.detail,
    timeRemaining: o.timeRemaining, state: o.state,
    pendingLift: o.pendingLift, continuation: o.continuation, events: [] });
  assert.equal(r.status, 'complete');
  assert.ok(r.corrected > 0, 'resume walks the residual');
  assert.equal(r.timeConsumed, 0);
  assert.equal(r.timeRemaining, 0);
  const w2 = w.step(r.state, 0.5, { wish: [0, 1] });
  assert.equal(w2.status, 'complete');
  assert.ok(w2.grounded, 'walking after resume');
  assert.equal(w2.pendingLift, null, 'no debt left');
  console.log(`  debt=${o.pendingLift.distance.toExponential(1)} resumed ${r.corrected.toExponential(1)}, walking grounded`);
});

check('sustained ball contact keeps valid transported state without throwing', () => {
  const world = compileRegionWorld(doc('pincrash', 8, 8, FLAT,
    [{ id: 'rock', regionId: 'orb', kind: 'ball', position: [0, 2, 0.25], radius: 0.5 }]));
  const w = createSphericalWalker(world), {space,field}=world.regions.get('orb');
  let st = mkState(world, [0, 0, 0.25]), contacts=0, worst=0;
  for (let i=0;i<1200;i++) {
    const out=w.step(st,1/60,{wish:[0,1],speed:2});
    assert.equal(out.pendingLift,null,'do not feed a debt state onward');
    assert.equal(out.status,'complete','sustained contact must finish each request');
    st=out.state; contacts+=out.contacts;
    const error=Math.abs(Math.hypot(...st.position)-1);worst=Math.max(worst,error);
    assert.ok(error<2e-15,'unit sphere drift');
    space.validateTangent(st.position,st.velocity);
    for(const v of [st.camera.forward,st.camera.up,st.camera.right])space.validateTangent(st.position,v);
    assert.ok(field.distance(st.position)>=st.radius-1e-4,'no penetration during pin');
  }
  assert.ok(contacts>100,'non-vacuous sustained contact');
  console.log('  1200 pinned frames, contacts='+contacts+', worst radial error='+worst);
});

console.log(`\nspherical-walking-truth: ${passed} checks passed, ${failed} failed`);
if (failed) process.exit(1);
