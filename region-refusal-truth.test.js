// MUSE-41: does the refusal stay refused?
//
// MUSE-39 confirmed finding 4 (refused walker left ON the plane, next frame
// walked through it); Astra amended the contract and Claude repaired it: the
// final approach is provisional and a refusal rolls back to a checkpoint the
// portal certifies is strictly on the entering side. This corpus re-checks
// the repair: repeated refusals, restored clearance, time refunds, exact
// budget caps, unrefunded work counters, and the flagged unreachable path.
//
// Allowed reads: the contract (+ amendment), the public API, the repair
// report. The implementation is unread here. PORTAL_PLANE_TOLERANCE and
// portal.signedHeight are the shared tolerance and the judge; using them in
// checks is testing against the contract's own number, not the mover.
import assert from 'node:assert/strict';
import { compileRegionWorld } from './engine/world/region-world.js';
import { moveRegionProbe } from './engine/world/region-motion.js';
import { PORTAL_PLANE_TOLERANCE } from './engine/world/region-portal.js';
import { createCameraFrame, turn } from './engine/world/camera-frame.js';

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
const near = (a, b, tol = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} != ${b} (tol ${tol})`);
const vnear = (a, b, tol = 1e-9, msg = '') => {
  assert.equal(a.length, b.length);
  a.forEach((x, i) => near(x, b[i], tol, `${msg}[${i}]`));
};
const scale = (v, s) => v.map((x) => x * s);

const UNITS = { name: 'design-unit', playerRadius: 0.25 };
const e3Region = (id, extent = 8) => ({ id, geometry: { kind: 'e3', curvatureRadius: 1 }, topology: 'cover', extent });
const s3Region = (id, R, extent) => ({ id, geometry: { kind: 's3', curvatureRadius: R }, topology: 'cover', extent });
const anchor = (id, regionId, position, forward, radius = 0.9, up = [0, 0, 1]) =>
  ({ id, regionId, kind: 'anchor', position, forward, up, radius });
const spawn = (id, regionId, position = [0, 0, 0]) => ({ id, regionId, kind: 'spawn', position });
const link = (id, a, b) => ({ id, kind: 'portal', a, b, velocity: 'preserve-speed', scale: 1 });
const scene = (id, regions, entities, connections = []) =>
  ({ format: 'nil-scene', version: 2, id, units: UNITS, regions, entities, connections });

function stateIn(world, regionId, position, velocity, look = {}) {
  const { space } = world.regions.get(regionId);
  const basis = space.frame(position);
  const camera = turn(createCameraFrame(space, position, { forward: basis[1], up: basis[2] }), look);
  return { regionId, position: position.slice(), velocity: velocity.slice(), radius: UNITS.playerRadius, camera };
}
function auditClock(label, out, dt) {
  near(out.timeConsumed + out.timeRemaining, dt, 1e-9, `${label}: consumed+remaining`);
  near(out.time.travel + out.time.rest, out.timeConsumed, 1e-9, `${label}: travel+rest`);
}

// E3 blocked exit: gate-in at [0,2,0], occupied rock region, plug ball.
const plugDoc = (withoutPlug) => scene(withoutPlug ? 'plugopen' : 'plugshut',
  [e3Region('room'), e3Region('rock')], [
    spawn('room-start', 'room', [0, 0, 0]), spawn('rock-start', 'rock', [4, 0, 0]),
    anchor('gate-in', 'room', [0, 2, 0], [0, -1, 0]),
    anchor('gate-out', 'rock', [0, 0, 0], [0, 1, 0]),
    ...(withoutPlug ? [] : [{ id: 'plug-ball', regionId: 'rock', kind: 'ball', position: [0, 0, 0], radius: 0.5 }]),
  ], [link('gate', 'gate-in', 'gate-out')]);

const FRAMES = 12;
function refuseFrames(world, regionId, portal, state0, dt, frames = FRAMES) {
  // Fresh state object per frame (as a host would hand it), chained.
  let state = state0, outs = [];
  for (let f = 0; f < frames; f++) {
    const out = moveRegionProbe(world, state, dt);
    outs.push(out);
    state = { ...out.state, position: [...out.state.position], velocity: [...out.state.velocity] };
  }
  return outs;
}

check('repeated refusals never reach the plane: E3 speeds x dts', () => {
  const world = compileRegionWorld(plugDoc(false));
  const portal = world.portals.find((p) => p.fromRegionId === 'room');
  // Every combo must actually arrive: speed*dt > 2.0 (gate distance), plus
  // the exact-boundary case speed*dt == 2.0. Combos that fall short would
  // merely complete, testing nothing about refusal.
  for (const [speed, dt] of [[2, 1.5], [2, 2], [4, 1], [4, 2], [8, 0.5], [8, 1], [4, 0.5]]) {
      const outs = refuseFrames(world, 'room', portal, stateIn(world, 'room', [0, 0, 0], [0, speed, 0]), dt);
      outs.forEach((out, f) => {
        assert.equal(out.status, 'blocked-exit', `s=${speed} dt=${dt} f=${f}`);
        assert.equal(out.crossings, 0);
        assert.equal(out.state.regionId, 'room');
        assert.ok(portal.signedHeight([...out.state.position]) > PORTAL_PLANE_TOLERANCE,
          `s=${speed} dt=${dt} f=${f}: height above tolerance`);
        auditClock(`refuse s=${speed} dt=${dt} f=${f}`, out, dt);
      });
      const ys = outs.map((o) => [...o.state.position][1]);
      assert.ok(ys.every((y) => Math.abs(y - ys[0]) < 1e-12), `checkpoint stable s=${speed} dt=${dt}: ${ys[0]}`);
      // Absolute pin, not just stability: the certified checkpoint is one
      // skin before the aperture (gate at 2.0), and frame 1 charges exactly
      // the approach to it. A fallback to the leg start ([0,0,0], charge 0)
      // passes every assert above and fails these two.
      vnear([...outs[0].state.position], [0, 2 - 1e-4, 0], 1e-12, `checkpoint s=${speed} dt=${dt}`);
      near(outs[0].timeConsumed, (2 - 1e-4) / speed, 1e-12, `approach charge s=${speed} dt=${dt}`);
      console.log(`  E3 speed=${speed} dt=${dt}: 12 frames held at y=${ys[0].toFixed(7)}, consumed=${outs.map((o) => o.timeConsumed.toExponential(1)).join(' ')}`);
  }
});

// S3 blocked exit: sphere R=2, gate at author [0,1.2,0], occupied E3 dest.
const s3plugDoc = (withoutPlug) => scene(withoutPlug ? 's3open' : 's3shut',
  [s3Region('orb', 2, 3), e3Region('far')], [
    spawn('orb-start', 'orb', [0, 0, 0]), spawn('far-start', 'far', [4, 0, 0]),
    anchor('orb-gate', 'orb', [0, 1.2, 0], [0, -1, 0], 0.8),
    anchor('far-gate', 'far', [0, 0, 0], [0, 1, 0], 0.8),
    ...(withoutPlug ? [] : [{ id: 'plug-ball', regionId: 'far', kind: 'ball', position: [0, 0, 0], radius: 0.5 }]),
  ], [link('gate', 'orb-gate', 'far-gate')]);

function aimAt(world, regionId, fromAuthor, toAuthor, speed) {
  const space = world.regions.get(regionId).space;
  const p0 = space.decode(fromAuthor);
  const u0 = scale(space.normalize(p0, space.logAt(p0, space.decode(toAuthor))), speed);
  return { p0: [...p0], u0: [...u0] };
}

check('repeated refusals: S3, tilted, off-centre', () => {
  {
    const world = compileRegionWorld(s3plugDoc(false));
    const portal = world.portals.find((p) => p.fromRegionId === 'orb');
    const { p0, u0 } = aimAt(world, 'orb', [0, 0, 0], [0, 1.2, 0], 3);
    const outs = refuseFrames(world, 'orb', portal, stateIn(world, 'orb', p0, u0), 1.0);
    outs.forEach((out, f) => {
      assert.equal(out.status, 'blocked-exit', `S3 f=${f}`);
      assert.equal(out.crossings, 0);
      assert.equal(out.state.regionId, 'orb');
      const h = portal.signedHeight([...out.state.position]);
      assert.ok(h > PORTAL_PLANE_TOLERANCE, `S3 f=${f}: height ${h}`);
      auditClock(`S3-refuse f=${f}`, out, 1.0);
    });
    const hs = outs.map((o) => portal.signedHeight([...o.state.position]));
    assert.ok(outs[0].timeConsumed > 0, 'S3 frame 1 charges the approach');
    outs.slice(1).forEach((out, i) => near(out.timeConsumed, 0, 1e-12, `S3 frame ${i + 2}`));
    console.log(`  S3: 12 frames refused, heights ${hs[0].toExponential(2)}..${hs[11].toExponential(2)}, consumed=${outs[0].timeConsumed.toExponential(1)} then 0`);
  }
  {
    // Tilted 30° gate pair, occupied dest, off-centre approach.
    const world = compileRegionWorld(scene('tiltshut', [e3Region('flat'), e3Region('rock')], [
      spawn('flat-start', 'flat', [0, 0, 0]), spawn('rock-start', 'rock', [4, 0, 0]),
      anchor('flat-gate', 'flat', [0, 3, 0], [0, -0.8, -0.6], 0.9, [0, 0.6, -0.8]),
      anchor('rock-gate', 'rock', [0, 0, 0], [0, 0.8, 0.6], 0.9, [0, -0.6, 0.8]),
      { id: 'plug-ball', regionId: 'rock', kind: 'ball', position: [0, 0, 0], radius: 0.5 },
    ], [link('gate', 'flat-gate', 'rock-gate')]));
    const portal = world.portals.find((p) => p.fromRegionId === 'flat');
    const from = [0.3, 0.5, -1.2];
    const dir = [0 - from[0], 3 - from[1], 0 - from[2]];
    const vel = scale(dir, 4 / Math.hypot(...dir));
    const outs = refuseFrames(world, 'flat', portal, stateIn(world, 'flat', from, vel), 1.0);
    outs.forEach((out, f) => {
      assert.equal(out.status, 'blocked-exit', `tilt/off f=${f}`, out.detail ?? '');
      assert.equal(out.crossings, 0);
      assert.ok(portal.signedHeight([...out.state.position]) > PORTAL_PLANE_TOLERANCE, `tilt/off f=${f}`);
      auditClock(`tilt-refuse f=${f}`, out, 1.0);
    });
    assert.ok(outs[0].timeConsumed > 0, 'tilt frame 1 charges the approach');
    outs.slice(1).forEach((out, i) => near(out.timeConsumed, 0, 1e-12, `tilt frame ${i + 2}`));
    console.log(`  tilted+off-centre: 12 frames refused, consumed=${outs[0].timeConsumed.toExponential(1)} then 0`);
  }
});

check('grazing incidence: checkpoint micrometres out, still certified', () => {
  // 0.02 rad incidence: one skin back along the leg sits ~2e-6 above the
  // plane — inside any sloppy tolerance, outside the shared 1e-9 one.
  const world = compileRegionWorld(plugDoc(false));
  const portal = world.portals.find((p) => p.fromRegionId === 'room');
  const vel = [4 * Math.cos(0.02), 4 * Math.sin(0.02), 0];
  const outs = refuseFrames(world, 'room', portal, stateIn(world, 'room', [-4.5, 1.9, 0], vel), 2.0);
  const hs = outs.map((o) => portal.signedHeight([...o.state.position]));
  outs.forEach((out, f) => {
    assert.equal(out.status, 'blocked-exit', `graze f=${f}`, out.detail ?? '');
    assert.equal(out.crossings, 0);
    assert.ok(hs[f] > PORTAL_PLANE_TOLERANCE, `graze f=${f}: height ${hs[f]}`);
    auditClock(`graze f=${f}`, out, 2.0);
  });
  console.log(`  graze E3 0.02rad: 12 frames held at height ${hs[0].toExponential(2)} (tolerance 1e-9)`);
  assert.ok(hs[0] < 1e-5, `checkpoint must be micrometres out, got ${hs[0]}`);
});

check('restored clearance: the next frame crosses, no cooldown armed', () => {
  // From the refusal state, and from five refusals deep: clearing the plug
  // must let the VERY NEXT frame cross. A repair that armed something on
  // refusal would need two frames here instead of one.
  for (const depth of [1, 5]) {
    const shut = compileRegionWorld(plugDoc(false));
    let state = stateIn(shut, 'room', [0, 0, 0], [0, 4, 0]);
    for (let f = 0; f < depth; f++) {
      const r = moveRegionProbe(shut, state, 1.0);
      assert.equal(r.status, 'blocked-exit', `depth ${depth} frame ${f}`);
      state = { ...r.state, position: [...r.state.position], velocity: [...r.state.velocity] };
    }
    const open = compileRegionWorld(plugDoc(true));
    const retry = moveRegionProbe(open, stateIn(open, 'room', [...state.position], [...state.velocity]), 1.0);
    assert.equal(retry.crossings, 1, `depth ${depth}: next frame crosses`);
    assert.equal(retry.state.regionId, 'rock', retry.detail ?? retry.status);
    auditClock(`restore depth=${depth}`, retry, 1.0);
    console.log(`  depth ${depth}: refusal at y=${[...state.position][1].toFixed(7)} crosses next frame`);
  }
});

check('time refunds: first frame charges the approach, later frames nothing', () => {
  // Only DISCARDED travel comes back. Frame 1 really travelled to the
  // checkpoint; frames 2..12 start there. A 12-frame sum above frame 1's
  // charge would be accumulation; below it would be loss.
  const world = compileRegionWorld(plugDoc(false));
  const outs = refuseFrames(world, 'room', null, stateIn(world, 'room', [0, 0, 0], [0, 4, 0]), 1.0);
  near(outs[0].timeConsumed, (2 - 1e-4) / 4, 1e-12, 'frame 1 charges the approach');
  outs.slice(1).forEach((out, i) => {
    near(out.timeConsumed, 0, 1e-12, `frame ${i + 2} charges nothing`);
    near(out.time.travel, 0, 1e-12, `frame ${i + 2} no travel`);
  });
  const total = outs.reduce((s, o) => s + o.timeConsumed, 0);
  near(total, (2 - 1e-4) / 4, 1e-12, '12-frame sum equals the one real approach');
  console.log(`  12 frames consumed total ${total.toExponential(3)} for one ${(2 - 1e-4) / 4}s approach`);
});

const capDoc = () => scene('caproom', [e3Region('room')], [
  spawn('room-start', 'room', [0, 0, 1]),
  { id: 'ground', regionId: 'room', kind: 'plane', position: [0, 0, 0], up: [0, 0, 1] },
  { id: 'wall', regionId: 'room', kind: 'plane', position: [1.5, 0, 0], up: [-1, 0, 0] },
]);
const capState = (world) => stateIn(world, 'room', [0, 0, 0.5], [4, 0, -2]);

check('exact budget caps: step caps bind exactly, contact caps buy exactly', () => {
  const world = compileRegionWorld(capDoc());
  // Uncapped reference: 37 steps, floor then wall, ends stopped.
  const free = moveRegionProbe(world, capState(world), 0.6);
  assert.equal(free.status, 'stopped');
  assert.equal(free.contactSamples.length, 2);
  console.log(`  uncapped: ${free.steps} steps, 2 contacts, stopped`);
  for (const n of [4, 8, 12]) {
    const out = moveRegionProbe(world, capState(world), 0.6, { maxSteps: n });
    assert.equal(out.status, 'budget-exhausted', `cap ${n}`);
    assert.ok(out.steps <= n, `cap ${n}: spent ${out.steps}`);
    auditClock(`cap-steps-${n}`, out, 0.6);
    assert.ok(out.timeRemaining > 0, `cap ${n}: time retained`);
  }
  {
    const out = moveRegionProbe(world, capState(world), 0.6, { maxContacts: 0 });
    assert.equal(out.status, 'budget-exhausted');
    assert.equal(out.detail, 'contacts');
    assert.equal(out.contactSamples.length, 0, 'zero cap: zero responses');
    assert.ok(out.limitingContact, 'zero cap: the met surface still reported');
    vnear([...out.limitingContact.normal], [0, 0, 1], 1e-12, 'limiting contact is the floor');
    auditClock('cap-contacts-0', out, 0.6);
  }
  {
    const out = moveRegionProbe(world, capState(world), 0.6, { maxContacts: 1 });
    assert.equal(out.contactSamples.length, 1, 'cap 1: exactly one response');
    assert.ok(out.limitingContact, 'cap 1: the unanswered wall named');
    vnear([...out.limitingContact.normal], [-1, 0, 0], 1e-12, 'limiting contact is the wall');
    auditClock('cap-contacts-1', out, 0.6);
  }
  {
    const out = moveRegionProbe(world, capState(world), 0.6, { maxContacts: 2 });
    assert.equal(out.contactSamples.length, 2, 'cap 2: both responses');
    assert.equal(out.status, 'stopped');
    auditClock('cap-contacts-2', out, 0.6);
  }
  console.log('  caps: steps<=n at 4/8/12; contacts 0/1/2 exact with limitingContact naming floor/wall');
});

check('work counters are not refunded: refused frames keep the steps they spent', () => {
  // Balls flanking the approach force real marching without touching: the
  // rollback must REPORT those steps, not zero them — otherwise refusing
  // often enough would buy unbounded work inside one call.
  const world = compileRegionWorld(scene('marchshut', [e3Region('room'), e3Region('rock')], [
    spawn('room-start', 'room', [0, 0, 0]), spawn('rock-start', 'rock', [4, 0, 0]),
    anchor('gate-in', 'room', [0, 2, 0], [0, -1, 0]),
    anchor('gate-out', 'rock', [0, 0, 0], [0, 1, 0]),
    { id: 'plug-ball', regionId: 'rock', kind: 'ball', position: [0, 0, 0], radius: 0.5 },
    { id: 'left-ball', regionId: 'room', kind: 'ball', position: [-0.7, 1.0, 0], radius: 0.3 },
    { id: 'right-ball', regionId: 'room', kind: 'ball', position: [0.7, 1.0, 0], radius: 0.3 },
  ], [link('gate', 'gate-in', 'gate-out')]));
  const outs = refuseFrames(world, 'room', null, stateIn(world, 'room', [0, 0, 0], [0, 4, 0]), 1.0);
  outs.forEach((out, f) => {
    assert.equal(out.status, 'blocked-exit', `f=${f}`);
    auditClock(`work f=${f}`, out, 1.0);
  });
  assert.ok(outs[0].steps > 0, `frame 1 reports its marched steps, got ${outs[0].steps}`);
  outs.forEach((out, f) => {
    assert.ok(out.steps <= 96, `frame ${f}: per-call spend bounded (${out.steps})`);
  });
  console.log(`  refusal frames spend steps ${outs.map((o) => o.steps).join('/')} (all reported, all bounded)`);
});

check('unreachable path hunt: the uncertifiable checkpoint', () => {
  // The flagged path needs an event raised from a leg whose start AND
  // one-skin-back checkpoint are both uncertifiable. crossing() itself
  // refuses to raise from inside the tolerance — so three attempts:
  const world = compileRegionWorld(plugDoc(false));
  const real = world.portals.find((p) => p.fromRegionId === 'room');
  // (a) Authored starts on/inside the tolerance, real portal: no event at
  // all, the walker simply goes through (source has no solid).
  for (const [tag, y] of [['on-plane', 2], ['inside-tol', 2 - 5e-10]]) {
    const out = moveRegionProbe(world, stateIn(world, 'room', [0, y, 0], [0, 4, 0]), 1.0);
    console.log(`  hunt (a) start ${tag}: status=${out.status} crossings=${out.crossings} y=${[...out.state.position][1].toFixed(6)}`);
    assert.equal(out.crossings, 0, `hunt (a) ${tag}: no event from inside tolerance`);
    assert.ok([...out.state.position][1] > 2, `hunt (a) ${tag}: walks through`);
  }
  // (b) A STAGED portal forcing the event the real rule would not raise:
  // leg start inside tolerance, staged aperture beyond the plane. This is
  // the only construction that reaches the branch — and it bypasses the
  // very rule that makes the branch unreachable, so it characterises the
  // fallback, it does not refute the flag.
  {
    const forced = { ...real, crossing: () => ({ distance: 0.3, at: [0, 2.3, 0] }) };
    const staged = { regions: world.regions, portals: [forced] };
    const out = moveRegionProbe(staged, stateIn(world, 'room', [0, 2 - 5e-10, 0], [0, 4, 0]), 1.0);
    console.log(`  hunt (b) staged: status=${out.status} detail=${out.detail} y=${[...out.state.position][1].toExponential(2)}`);
    assert.equal(out.status, 'unresolved', 'hunt (b): fallback refuses without committing');
    assert.equal(out.crossings, 0);
    vnear([...out.state.position], [0, 2 - 5e-10, 0], 1e-12, 'hunt (b): leg uncommitted');
    auditClock('hunt-b', out, 1.0);
  }
  // (c) Start inside A's tolerance while a DIFFERENT gate's event fires:
  // certification is per event portal, so it still certifies.
  {
    const two = compileRegionWorld(scene('twogates', [e3Region('room'), e3Region('a'), e3Region('b')], [
      spawn('room-start', 'room', [0, 0, 0]), spawn('a-start', 'a'), spawn('b-start', 'b'),
      anchor('gate-a', 'room', [0, 2, 0], [0, -1, 0]),
      anchor('gate-b', 'room', [0, 2, 0], [0, -1, 0]),
      anchor('a-gate', 'a', [0, 0, 0], [0, 1, 0]), anchor('b-gate', 'b', [0, 0, 0], [0, 1, 0]),
    ], [link('to-a', 'gate-a', 'a-gate'), link('to-b', 'gate-b', 'b-gate')]));
    const out = moveRegionProbe(two, stateIn(two, 'room', [0, 2 - 5e-10, 0], [0, 4, 0]), 1.0);
    console.log(`  hunt (c) inside-tol start, two gates: status=${out.status} crossings=${out.crossings}`);
    assert.equal(out.crossings, 0, 'hunt (c): no event from inside tolerance, however many gates');
  }
  console.log('  verdict: unreachable through crossing() as flagged; the fallback itself (b) refuses cleanly with the clock balanced');
});

console.log(`\nregion-refusal-truth: ${passed} checks passed, ${failed} failed`);
if (failed) process.exit(1);
