// MUSE-39: region motion — independent truth for the clock and the crossing.
//
// Claude wrote engine/world/region-motion.js against
// docs/engineering/REGION_MOTION_CONTRACT.md and checked it with 34 tests of
// their own authorship. This suite derives an INDEPENDENT analytic reference
// for free flight and time — never the implementation, which is unread here —
// and attacks the clock, ownership, and finding 4 with it.
//
// REFERENCE (derived, stated so it can be rebuilt). The contract commits to
// constant-velocity motion plus collision: no forces, so velocity is
// piecewise constant and every regular segment of length d at speed s > 0
// consumes d/s seconds.
//   E3 free flight: p(t) = p0 + v*t, arclength s*t, s = |v|.
//   S3 free flight: positions are unit 4-vectors, distances scaled by R.
//     Physical speed s = space.norm(p0, u0); euclidean e = |u0|; unit
//     tangent w = u0/e; angular rate a = s/R. Then
//       p(t) = cos(a*t)*p0 + sin(a*t)*w.
//     Check: |p| = 1 (p0⊥w), p'(0) = a*w = u0 since a = s/R = e... i.e. the
//     embedding angular rate carries the physical speed. Arclength s*t.
//     Self-checked below against space.distance (metric API, not the mover).
//   Round trip: reversing velocity retraces the geodesic; parallel transport
//     out and back composes to the identity and the two portal maps are
//     inverse, so position AND camera (roll included) come home.
//   Slide (E3): contact at t1 = (wallGap)/vn; post velocity v' = v-(v.n)n;
//     end = contact + v'(dt-t1); travel = dt. Head-on: rest = dt-t1, v' = 0.
//   Crossing: costs no time. sourceArc + destArc = s*travel, up to the exit
//     offset (~4e-4, zero-time): arcs exceed s*travel by at most ~1e-3.
// The portal TRANSIT MAP (world.portals[].transit) is used as emergence
// reference where noted — a different module from the mover, the contract's
// own mechanism, same as the existing suite does. Everything else is closed
// form above.
//
// CLOCK AUDIT (every case): timeConsumed + timeRemaining == dt, and
// time.travel + time.rest == timeConsumed, corrections logged separately.
// A correction is not travel; rest is not travel. The hunt is for a path
// where time is consumed twice or refunded once.
import assert from 'node:assert/strict';
import { compileRegionWorld } from './engine/world/region-world.js';
import { moveRegionProbe } from './engine/world/region-motion.js';
import { moveProbe } from './engine/world/collision.js';
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
const sub = (a, b) => a.map((x, i) => x - b[i]);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

const UNITS = { name: 'design-unit', playerRadius: 0.25 };
const e3Region = (id, extent = 8) => ({ id, geometry: { kind: 'e3', curvatureRadius: 1 }, topology: 'cover', extent });
const s3Region = (id, R, extent) => ({ id, geometry: { kind: 's3', curvatureRadius: R }, topology: 'cover', extent });
const anchor = (id, regionId, position, forward, radius = 0.9, up = [0, 0, 1]) =>
  ({ id, regionId, kind: 'anchor', position, forward, up, radius });
const spawn = (id, regionId, position = [0, 0, 0]) => ({ id, regionId, kind: 'spawn', position });
const link = (id, a, b) => ({ id, kind: 'portal', a, b, velocity: 'preserve-speed', scale: 1 });
const scene = (id, regions, entities, connections = []) =>
  ({ format: 'nil-scene', version: 2, id, units: UNITS, regions, entities, connections });

function stateAt(world, regionId, position, velocity, look = {}) {
  const { space } = world.regions.get(regionId);
  const basis = space.frame(position);
  const camera = turn(createCameraFrame(space, position, { forward: basis[1], up: basis[2] }), look);
  return { regionId, position: position.slice(), velocity: velocity.slice(), radius: UNITS.playerRadius, camera };
}
const snap = (s) => JSON.stringify({
  r: s.regionId, p: [...s.position], v: [...s.velocity], rad: s.radius,
  cf: [...s.camera.forward], cu: [...s.camera.up], cr: [...s.camera.right],
});
// The clock audit. Returns nothing; fails the check on any imbalance.
function auditClock(label, out, dt) {
  near(out.timeConsumed + out.timeRemaining, dt, 1e-9, `${label}: consumed+remaining`);
  near(out.time.travel + out.time.rest, out.timeConsumed, 1e-9, `${label}: travel+rest`);
  assert.ok(out.time.correction >= 0, `${label}: correction nonnegative`);
  assert.ok(out.timeConsumed >= -1e-12 && out.timeRemaining >= -1e-12, `${label}: no negative time`);
}
// Closed-form free flight. Uses the metric's norm (physical speed) and R
// from geometry — never a stepping function.
function freeRef(space, R, p0, u0, t) {
  const s = space.norm([...p0], [...u0]);
  if (space.kind === 'e3') return { pos: p0.map((x, i) => x + u0[i] * t), arc: s * t, speed: s };
  const e = Math.hypot(...u0), w = u0.map((x) => x / e), a = (s / R) * t;
  return {
    pos: p0.map((x, i) => x * Math.cos(a) + w[i] * Math.sin(a)),
    arc: s * t, speed: s,
  };
}

// Free rooms: one flat, one sphere, NO portals — pure free flight.
const freeName = (R) => `free-r${String(R).replace('.', 'p')}`;
const freeScene = (R, extent) => scene(freeName(R), [s3Region('orb', R, extent)], [spawn('s', 'orb', [0, 0, 0])]);
const flatFree = () => scene('flatfree', [e3Region('room')], [spawn('s', 'room', [0, 0, 0])]);

check('reference self-check: S3 closed form matches the metric distance', () => {
  for (const [R, extent] of [[0.5, 0.4], [2, 3], [8, 6], [100, 6]]) {
    const world = compileRegionWorld(freeScene(R, extent));
    const space = world.regions.get('orb').space;
    const p0 = space.decode([0.1, -0.1, 0.05]);
    const basis = space.frame(p0);
    const u0 = scale([...basis[1]], 2.5);
    for (const t of [0.05, 0.2]) {
      const ref = freeRef(space, R, [...p0], u0, t);
      near(space.distance([...p0], ref.pos), ref.arc, 1e-12, `R=${R} t=${t}`);
    }
  }
});

check('E3 free flight: position, arcs and the whole clock', () => {
  const world = compileRegionWorld(flatFree());
  const space = world.regions.get('room').space;
  const start = stateAt(world, 'room', [1, -2, 0.5], [2, 3, -1]);
  const dt = 0.4;
  const out = moveRegionProbe(world, start, dt);
  assert.equal(out.status, 'complete');
  const ref = freeRef(space, 1, [1, -2, 0.5], [2, 3, -1], dt);
  vnear([...out.state.position], ref.pos, 1e-9);
  vnear([...out.state.velocity], [2, 3, -1], 1e-12);
  auditClock('e3-free', out, dt);
  near(out.time.travel, dt, 1e-12);
  near(out.time.rest, 0, 0);
  near(out.time.correction, 0, 0);
});

for (const [R, extent] of [[0.5, 0.4], [8, 6], [100, 6]]) {
  check(`S3 free flight at R=${R}: closed form, arcs, clock`, () => {
    const world = compileRegionWorld(freeScene(R, extent));
    const space = world.regions.get('orb').space;
    const p0 = space.decode([0.05, -0.05, 0.02]);
    const basis = space.frame(p0);
    const u0 = scale([...basis[1]], 3);
    const dt = 0.1;
    const out = moveRegionProbe(world, stateAt(world, 'orb', [...p0], u0), dt);
    assert.equal(out.status, 'complete', out.detail ?? out.status);
    const ref = freeRef(space, R, [...p0], u0, dt);
    vnear([...out.state.position], ref.pos, 1e-9, `R=${R}`);
    near(space.norm([...out.state.position], [...out.state.velocity]), 3, 1e-9);
    auditClock(`s3-free-R${R}`, out, dt);
    near(out.time.travel, dt, 1e-12);
  });
}

// My gate pair: flat gate at [0,3,0] facing the walker, orb (R=2) gate at
// [0,1.5,0] emerging along +y. Centre-ray crossing: 3.0 source arc at speed
// 4, then destination arcs.
const gateScene = () => scene('gates', [e3Region('flat'), s3Region('orb', 2, 3)], [
  spawn('flat-start', 'flat'), spawn('orb-start', 'orb'),
  anchor('flat-gate', 'flat', [0, 3, 0], [0, -1, 0]),
  anchor('orb-gate', 'orb', [0, 1.5, 0], [0, 1, 0]),
], [link('gate', 'flat-gate', 'orb-gate')]);

function portalAt(out) {
  const e = out.events.find((x) => x.kind === 'portal');
  assert.ok(e, 'a portal event must be recorded');
  return e;
}

check('free crossing: source arc + dest arc = speed x time, up to the offset', () => {
  const world = compileRegionWorld(gateScene());
  const sphere = world.regions.get('orb').space;
  const portal = world.portals.find((p) => p.fromRegionId === 'flat');
  const start = stateAt(world, 'flat', [0, 0, 0], [0, 4, 0]);
  const dt = 1.0;
  const out = moveRegionProbe(world, start, dt);
  assert.equal(out.state.regionId, 'orb', out.detail ?? out.status);
  assert.equal(out.crossings, 1);
  const at = [...portalAt(out).at];
  // Radial fit, not a centre-ray test: the aperture point must lie in the disc.
  assert.ok(Math.hypot(at[0] - 0, at[2] - 0) <= 0.9 - 0.25 + 1e-9, `aperture point in disc: ${at}`);
  const sourceArc = Math.hypot(...sub(at, [0, 0, 0]));
  const emergence = portal.transit(at).position;
  const destArc = sphere.distance(emergence, [...out.state.position]);
  near(sourceArc, 3.0, 1e-9);
  near(sourceArc + destArc, 4 * dt + 4e-4, 2e-3, 'arcs = speed x time + exit offset');
  near(sphere.norm([...out.state.position], [...out.state.velocity]), 4, 1e-12);
  auditClock('free-cross', out, dt);
  near(out.timeRemaining, 0, 1e-15);
});

check('off-centre crossing: arcs still add up, speed still preserved', () => {
  const world = compileRegionWorld(gateScene());
  const sphere = world.regions.get('orb').space;
  const from = [0.3, -0.5, 0.1];
  const dir = [0 - from[0], 3 - from[1], 0 - from[2]];
  const n = Math.hypot(...dir), vel = scale(dir, 4 / n);
  const start = stateAt(world, 'flat', from, vel);
  const dt = 1.0;
  const out = moveRegionProbe(world, start, dt);
  assert.equal(out.state.regionId, 'orb', out.detail ?? out.status);
  const at = [...portalAt(out).at];
  assert.ok(Math.hypot(at[0], at[2]) <= 0.9 - 0.25 + 1e-9, `off-centre aperture in disc: ${at}`);
  const sourceArc = Math.hypot(...sub(at, from));
  const portal = world.portals.find((p) => p.fromRegionId === 'flat');
  const destArc = sphere.distance(portal.transit(at).position, [...out.state.position]);
  near(sourceArc + destArc, 4 * dt + 4e-4, 2e-3, 'off-centre arcs');
  near(sphere.norm([...out.state.position], [...out.state.velocity]), 4, 1e-12);
  auditClock('off-centre', out, dt);
});

const tiltScene = () => scene('tilt30', [e3Region('flat'), s3Region('orb', 2, 3)], [
  spawn('flat-start', 'flat'), spawn('orb-start', 'orb'),
  anchor('flat-gate', 'flat', [0, 3, 0], [0, -0.8, -0.6], 0.9, [0, 0.6, -0.8]),
  anchor('orb-gate', 'orb', [0, 1.5, 0], [0, 0.8, 0.6], 0.9, [0, -0.6, 0.8]),
], [link('gate', 'flat-gate', 'orb-gate')]);

check('tilted round trip: arcs both ways, roll comes home', () => {
  const world = compileRegionWorld(tiltScene());
  const sphere = world.regions.get('orb').space;
  const start = stateAt(world, 'flat', [0, 1, -1.5], [0, 3.2, 2.4], { roll: 1.1, pitch: 0.2 });
  const dt = 0.8;
  const out = moveRegionProbe(world, start, dt);
  assert.equal(out.state.regionId, 'orb', out.detail ?? out.status);
  assert.equal(out.crossings, 1);
  near(sphere.norm([...out.state.position], [...out.state.velocity]), 4, 1e-12);
  auditClock('tilt-out', out, dt);
  const back = moveRegionProbe(world, { ...out.state, velocity: scale([...out.state.velocity], -1) }, dt);
  assert.equal(back.state.regionId, 'flat', back.detail ?? back.status);
  auditClock('tilt-back', back, dt);
  vnear([...back.state.position], [0, 1, -1.5], 1e-9);
  for (const key of ['forward', 'up', 'right']) {
    vnear([...back.state.camera[key]], [...start.camera[key]], 1e-12, `roll-home ${key}`);
  }
});

// Two S3 regions, different radii (1.5 and 5 — not the existing suite's 1/3),
// plus the same-dimension trap: identical-looking 4-vectors, different R.
const radiiScene = () => scene('radii', [s3Region('small', 1.5, 2), s3Region('large', 5, 6)], [
  spawn('small-start', 'small'), spawn('large-start', 'large'),
  anchor('small-gate', 'small', [0, 0.9, 0], [0, -1, 0], 0.8),
  anchor('large-gate', 'large', [0, 1.2, 0], [0, 1, 0], 0.8),
], [link('gate', 'small-gate', 'large-gate')]);

function stateAtS3(world, regionId, authorPt, aimAuthorPt, speed) {
  const space = world.regions.get(regionId).space;
  const p0 = space.decode(authorPt);
  const u0 = scale(space.normalize(p0, space.logAt(p0, space.decode(aimAuthorPt))), speed);
  return { state: stateAt(world, regionId, [...p0], [...u0]), p0: [...p0], u0: [...u0] };
}

check('two S3 radii: the destination arc is measured in destination R', () => {
  const world = compileRegionWorld(radiiScene());
  const small = world.regions.get('small').space, large = world.regions.get('large').space;
  const { state, p0, u0 } = stateAtS3(world, 'small', [0, 0, 0], [0, 0.9, 0], 2);
  const dt = 0.6;
  const out = moveRegionProbe(world, state, dt);
  assert.equal(out.state.regionId, 'large', out.detail ?? out.status);
  near(large.norm([...out.state.position], [...out.state.velocity]), 2, 1e-12);
  // Source arc along the geodesic to the recorded aperture, crossing time
  // from it, destination arc in LARGE radii from the mapped emergence.
  const at = [...portalAt(out).at];
  const sourceArc = small.distance(p0, at);
  const tCross = sourceArc / 2, tRem = dt - tCross;
  assert.ok(tRem > 0, 'must cross mid-frame for the arc split to discriminate');
  const portal = world.portals.find((p) => p.fromRegionId === 'small');
  const transit = portal.transit(at);
  // Tangential velocity at the aperture, from the closed form (derivative of
  // the S3 reference): u(tc) = -s sin(w tc) p0 + s cos(w tc) w.
  const w = u0.map((x) => x / Math.hypot(...u0)), om = (2 / 1.5) * tCross;
  const uAt = p0.map((x, i) => -2 * Math.sin(om) * x + 2 * Math.cos(om) * w[i]);
  const uDest = transit.carry(uAt);
  const right = freeRef(large, 5, [...transit.position], [...uDest], tRem);
  vnear([...out.state.position], right.pos, 2e-3, 'dest-R prediction');
  // THE TRAP: the same computation in the source radius must be far away.
  const wrong = freeRef(large, 1.5, [...transit.position], [...uDest], tRem);
  const gap = Math.hypot(...sub(wrong.pos, [...out.state.position]));
  assert.ok(gap > 1e-3, `wrong-R answer must discriminate (gap ${gap})`);
  auditClock('two-radii', out, dt);
});

// Collision strictly before the portal, with reference slide arithmetic.
const slideScene = (wall) => scene('slidegate', [e3Region('room'), e3Region('behind'), e3Region('beside')], [
  spawn('room-start', 'room', [0, 0, 0]), spawn('behind-start', 'behind'), spawn('beside-start', 'beside'),
  ...(wall ? [{ id: 'wall', regionId: 'room', kind: 'plane', position: [1.5, 0, 0], up: [-1, 0, 0] }] : []),
  anchor('ahead', 'room', [4, 0, 0], [-1, 0, 0], 0.8),
  anchor('behind-gate', 'behind', [0, 0, 0], [1, 0, 0], 0.8),
  anchor('side', 'room', [1.25, 2.2, 0], [0, -1, 0], 0.8),
  anchor('beside-gate', 'beside', [0, 0, 0], [0, 1, 0], 0.8),
], [link('through', 'ahead', 'behind-gate'), link('sideways', 'side', 'beside-gate')]);

check('collision strictly before portal: slide reference, clock, no crossing', () => {
  const walled = compileRegionWorld(slideScene(true));
  const dt = 1.4, v = [3, 1, 0];
  const out = moveRegionProbe(walled, stateAt(walled, 'room', [0, 0, 0], v), dt);
  assert.equal(out.state.regionId, 'room');
  assert.equal(out.crossings, 0);
  // Reference: contact at t1 = (1.5 - 0.25)/3, then slide v' = [0,1,0].
  const t1 = (1.5 - 0.25) / 3;
  const ref = [1.25, 1 * t1 + 1 * (dt - t1), 0];
  vnear([...out.state.position], ref, 2e-3, 'slide end');
  auditClock('slide', out, dt);
  near(out.time.travel, dt, 1e-12, 'slide is all travel');
  near(out.time.rest, 0, 0);
});

check('head-on stop: the rest of the frame is rest, not travel', () => {
  const walled = compileRegionWorld(slideScene(true));
  const dt = 1.0;
  const out = moveRegionProbe(walled, stateAt(walled, 'room', [0, 0, 0], [4, 0, 0]), dt);
  assert.equal(out.status, 'stopped');
  vnear([...out.state.position], [1.25, 0, 0], 2e-3);
  vnear([...out.state.velocity], [0, 0, 0], 0);
  auditClock('head-on', out, dt);
  assert.ok(out.time.rest > 0, 'rest reported separately');
  near(out.time.travel + out.time.rest, dt, 1e-12);
});

check('a contact deflects into a DIFFERENT portal, on the reference clock', () => {
  const walled = compileRegionWorld(slideScene(true));
  const dt = 2.4;
  const out = moveRegionProbe(walled, stateAt(walled, 'room', [0, 0, 0], [3, 1, 0]), dt);
  assert.equal(out.state.regionId, 'beside', out.detail ?? out.status);
  assert.equal(out.crossings, 1);
  // Contact at t1 = 1.25/3, slide at speed 1 reaches the side gate
  // [1.25,2.2,0] at t1 + (2.2 - t1) = 2.2 < dt, then destination travel.
  auditClock('deflect', out, dt);
  near(out.time.travel, dt, 1e-9, 'deflect is all travel');
});

// Refusal audit: input untouched, source ownership kept, no destination
// position/velocity/camera anywhere in the result, clock honest with
// unconsumed time. destTags are distinctive destination-side numbers that
// must not appear in the serialised result.
function refuseAudit(label, world, sourceId, state, dt, destTags) {
  const before = snap(state);
  const out = moveRegionProbe(world, state, dt);
  assert.equal(out.status, 'blocked-exit', `${label}: status`);
  assert.equal(out.crossings, 0, `${label}: no crossing`);
  assert.equal(snap(state), before, `${label}: input state untouched`);
  assert.equal(out.state.regionId, sourceId, `${label}: source ownership`);
  assert.equal(out.state.camera.space, world.regions.get(sourceId).space, `${label}: source camera owner`);
  vnear([...out.state.velocity], [...state.velocity], 1e-12, `${label}: velocity unmapped`);
  const json = JSON.stringify(out);
  for (const tag of destTags) {
    assert.ok(!json.includes(tag), `${label}: destination leak ${tag}`);
  }
  auditClock(label, out, dt);
  assert.ok(out.timeRemaining > 0, `${label}: unconsumed time handed back`);
  return out;
}

check('a body that does not fit: the aperture is not an event, time still honest', () => {
  // Radial misfit is not a refusal — there is no event, so the walker keeps
  // going through the plane the aperture is set in (source has no solid).
  // The check is the clock: every second consumed as travel, none refunded.
  const world = compileRegionWorld(gateScene());
  const state = { ...stateAt(world, 'flat', [0, 0, 0], [0, 4, 0]), radius: 1.0 };
  const before = snap(state);
  const dt = 1.0;
  const out = moveRegionProbe(world, state, dt);
  assert.equal(out.crossings, 0);
  assert.equal(out.state.regionId, 'flat');
  assert.equal(snap(state), before, 'input untouched');
  assert.ok([...out.state.position][1] > 3, 'walked through the aperture plane');
  auditClock('misfit', out, dt);
  near(out.time.travel, dt, 1e-12, 'pass-through is all travel');
  near(out.timeConsumed, dt, 1e-12);
});

const plugScene = () => scene('plug', [e3Region('room'), e3Region('rock')], [
  spawn('room-start', 'room', [0, 0, 0]), spawn('rock-start', 'rock', [4.5, -2.5, 3.0]),
  anchor('gate-in', 'room', [0, 2, 0], [0, -1, 0]),
  anchor('gate-out', 'rock', [4.5, -2.5, 1.25], [0, 1, 0]),
  { id: 'plug-ball', regionId: 'rock', kind: 'ball', position: [4.5, -2.5, 1.25], radius: 0.5 },
], [link('gate', 'gate-in', 'gate-out')]);

check('blocked exit II: occupied destination, exact field proves it', () => {
  const world = compileRegionWorld(plugScene());
  const state = stateAt(world, 'room', [0, 0, 0], [0, 4, 0]);
  const out = refuseAudit('occupied', world, 'room', state, 1.0, ['4.5', '-2.5', '1.25']);
  // A single unmodified ball advertises exact exterior distance: occupancy
  // is PROVED, reported distinctly from an unproven bound.
  assert.equal(out.detail, 'destination-clearance-insufficient');
  near(out.timeConsumed, 2 / 4, 1e-12);
});

const lipScene = () => scene('lip', [e3Region('room'), e3Region('ledge')], [
  spawn('room-start', 'room', [0, 0, 0]), spawn('ledge-start', 'ledge', [4.5, -2.5, 3.0]),
  anchor('gate-in', 'room', [0, 2, 0], [0, -1, 0]),
  anchor('gate-out', 'ledge', [4.5, -2.5, 1.25], [1, 0, 0]),
  { id: 'lip-plane', regionId: 'ledge', kind: 'plane', position: [4.5 + 0.2501, -2.5, 1.25], up: [-1, 0, 0] },
], [link('gate', 'gate-in', 'gate-out')]);

check('blocked exit III: obstructed exit offset fails the whole crossing', () => {
  const world = compileRegionWorld(lipScene());
  const state = stateAt(world, 'room', [0, 0, 0], [0, 4, 0]);
  const out = refuseAudit('offset', world, 'room', state, 1.0, ['4.5', '-2.5', '1.25']);
  assert.equal(out.detail, 'exit-offset-obstructed');
});

check('crossing exactly on the frame end: taken once, no time left', () => {
  const world = compileRegionWorld(gateScene());
  {
    // Gate at 3.0, speed 4, dt 0.75: the crossing lands exactly on the end.
    const out = moveRegionProbe(world, stateAt(world, 'flat', [0, 0, 0], [0, 4, 0]), 0.75);
    assert.equal(out.crossings, 1);
    assert.equal(out.state.regionId, 'orb');
    assert.equal(out.status, 'complete');
    auditClock('frame-end', out, 0.75);
    near(out.timeRemaining, 0, 1e-15);
  }
  // Rounding past the range (3 * (2/3) = 1.9999999999999998 for a gate at
  // 2.0): still taken exactly once rather than lost or doubled.
  const world2 = compileRegionWorld(scene('end2', [e3Region('flat'), s3Region('orb', 2, 3)], [
    spawn('flat-start', 'flat'), spawn('orb-start', 'orb'),
    anchor('flat-gate', 'flat', [0, 2, 0], [0, -1, 0]),
    anchor('orb-gate', 'orb', [0, 1.5, 0], [0, 1, 0]),
  ], [link('gate', 'flat-gate', 'orb-gate')]));
  const out2 = moveRegionProbe(world2, stateAt(world2, 'flat', [0, 0, 0], [0, 3, 0]), 2 / 3);
  assert.equal(out2.crossings, 1);
  assert.equal(out2.state.regionId, 'orb');
  auditClock('frame-end-round', out2, 2 / 3);
});

check('tied apertures are unresolved in either authoring order, clock honest', () => {
  const both = (first, second) => scene('tiedgates', [e3Region('room'), e3Region('a'), e3Region('b')], [
    spawn('room-start', 'room', [0, 0, 0]), spawn('a-start', 'a'), spawn('b-start', 'b'),
    anchor(first, 'room', [0, 2, 0], [0, -1, 0]), anchor(second, 'room', [0, 2, 0], [0, -1, 0]),
    anchor('a-gate', 'a', [0, 0, 0], [0, 1, 0]), anchor('b-gate', 'b', [0, 0, 0], [0, 1, 0]),
  ], [link('to-a', first, 'a-gate'), link('to-b', second, 'b-gate')]);
  for (const [first, second] of [['left', 'right'], ['right', 'left']]) {
    const world = compileRegionWorld(both(first, second));
    const state = stateAt(world, 'room', [0, 0, 0], [0, 4, 0]);
    const before = snap(state);
    const dt = 1;
    const out = moveRegionProbe(world, state, dt);
    assert.equal(out.status, 'unresolved', `${first} first`);
    assert.equal(out.state.regionId, 'room');
    assert.equal(out.crossings, 0);
    assert.equal(snap(state), before, 'tied input untouched');
    auditClock(`tie-${first}`, out, dt);
    assert.ok(out.timeRemaining > 0, 'unconsumed time handed back');
    vnear([...out.state.position], [0, 2, 0], 1e-9, 'held at the aperture');
  }
});

check('every budget exhausted: valid state, honest clock, time retained', () => {
  const gates = compileRegionWorld(gateScene());
  {
    const out = moveRegionProbe(gates, stateAt(gates, 'flat', [0, 0, 0], [0, 4, 0]), 1, { maxCrossings: 0 });
    assert.equal(out.status, 'budget-exhausted');
    assert.equal(out.crossings, 0);
    assert.equal(out.state.regionId, 'flat');
    auditClock('budget-crossings', out, 1);
    assert.ok(out.timeRemaining > 0);
  }
  {
    const walls = compileRegionWorld(slideScene(true));
    const dt = 4;
    const out = moveRegionProbe(walls, stateAt(walls, 'room', [0, 0, 0], [3, 4, 0]), dt, { maxSteps: 6 });
    assert.equal(out.status, 'budget-exhausted');
    auditClock('budget-steps', out, dt);
    assert.ok(out.timeRemaining > 0);
    const space = walls.regions.get('room').space;
    space.validatePoint([...out.state.position]);
    space.validateTangent([...out.state.position], [...out.state.velocity]);
  }
  {
    const walls = compileRegionWorld(slideScene(true));
    const dt = 0.5;
    const out = moveRegionProbe(walls, stateAt(walls, 'room', [0, 0, 0], [3, 4, 0]), dt, { maxContacts: 0 });
    assert.equal(out.status, 'budget-exhausted');
    auditClock('budget-contacts', out, dt);
    assert.ok(out.timeRemaining > 0);
  }
  {
    const dt = 1e6;
    const out = moveRegionProbe(gates, stateAt(gates, 'flat', [0, 0, 0], [0, 4, 0]), dt);
    assert.ok(['domain-exit', 'budget-exhausted'].includes(out.status), out.status);
    auditClock('budget-huge-dt', out, dt);
    assert.ok(out.timeRemaining > 0);
    const space = gates.regions.get(out.state.regionId).space;
    space.validatePoint([...out.state.position]);
    space.validateTangent([...out.state.position], [...out.state.velocity]);
    assert.equal(out.state.camera.space, space);
  }
});

check('an event past the proposed leg is refused, not rounded in', () => {
  // The range is a contract on the coordinator's side too: a provider that
  // reports beyond [0, proposed] must throw, never be clamped into travel.
  const world = compileRegionWorld(gateScene());
  const { field, space } = world.regions.get('flat');
  assert.throws(() => moveProbe(field, space,
    { position: [0, 0, 0], velocity: [0, 4, 0], radius: 0.25 }, 1,
    { events: (q) => ({ kind: 'portal', distance: q.distance * 2 }) }), /within the proposed leg/);
  assert.throws(() => moveProbe(field, space,
    { position: [0, 0, 0], velocity: [0, 4, 0], radius: 0.25 }, 1,
    { events: () => ({ kind: 'portal', distance: -1 }) }), /within the proposed leg/);
});

check('finding 4: a refused crossing leaves the walker on the plane, and the next frame walks through it', () => {
  // Free-standing gate pair (no wall anywhere): the plug refuses the
  // crossing with the walker exactly on the aperture plane. Next frame, the
  // one-sided rule declines to test it (h = 0), so nothing stops the walker
  // travelling through the plane into source space behind it. CONFIRM with
  // two frames and positions, not with adjectives.
  const world = compileRegionWorld(plugScene());
  const dt = 1.0;
  const refused = moveRegionProbe(world, stateAt(world, 'room', [0, 0, 0], [0, 4, 0]), dt);
  assert.equal(refused.status, 'blocked-exit');
  assert.equal(refused.crossings, 0);
  vnear([...refused.state.position], [0, 2, 0], 1e-9, 'refused exactly on the plane');
  const next = moveRegionProbe(world,
    { ...refused.state, position: [...refused.state.position], velocity: [...refused.state.velocity] }, dt);
  console.log(`  finding4: frame1 ${refused.status} at y=${[...refused.state.position][1].toFixed(6)}; `
    + `frame2 crossings=${next.crossings} region=${next.state.regionId} y=${[...next.state.position][1].toFixed(6)}`);
  assert.equal(next.crossings, 0, 'one-sided rule declines the on-plane test');
  assert.ok([...next.state.position][1] > 2, 'CONFIRMED: walked through the aperture plane into source space');
  assert.equal(next.state.regionId, 'room');
  auditClock('finding4-f2', next, dt);
});

check('legitimate return: clock both ways, camera home', () => {
  const world = compileRegionWorld(gateScene());
  const dt = 1.0;
  const start = stateAt(world, 'flat', [0, 0, 0], [0, 4, 0], { roll: 0.5 });
  const out = moveRegionProbe(world, start, dt);
  assert.equal(out.state.regionId, 'orb');
  auditClock('return-out', out, dt);
  const back = moveRegionProbe(world, { ...out.state, velocity: scale([...out.state.velocity], -1) }, dt);
  assert.equal(back.state.regionId, 'flat', back.detail ?? back.status);
  assert.equal(back.crossings, 1);
  auditClock('return-back', back, dt);
  // Position comes home up to the zero-time exit offsets (~4e-4 each way);
  // the camera, transported out and back along the same legs, is exact.
  vnear([...back.state.position], [0, 0, 0], 1e-3, 'round trip home');
  for (const key of ['forward', 'up', 'right']) {
    vnear([...back.state.camera[key]], [...start.camera[key]], 1e-12, `camera-home ${key}`);
  }
});

console.log(`\nregion-motion-truth: ${passed} checks passed, ${failed} failed`);
if (failed) process.exit(1);


