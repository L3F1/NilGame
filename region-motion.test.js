// Region-owned motion: ownership, one clock, and transactional crossings.
//
// The references here are closed forms written out by hand, not second calls
// into the solver. The strongest is the SLIDE CLOCK: a probe launched at speed
// 5 into a wall that removes exactly the 3-component ends the frame at
// y = 4 * dt, whatever the wall is placed at -- the distance to the wall
// cancels out of the arithmetic entirely. Reusing the leftover DISTANCE budget
// as if it were time (the natural bug) lands somewhere else, and no tolerance
// hides the difference.
import assert from 'node:assert/strict';
import { compileRegionWorld } from './engine/world/region-world.js';
import { moveRegionProbe } from './engine/world/region-motion.js';
import { moveProbe } from './engine/world/collision.js';
import { createCameraFrame, turn } from './engine/world/camera-frame.js';
import { PORTAL_PLANE_TOLERANCE } from './engine/world/region-portal.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`);
const vectorNear = (a, b, tol = 1e-9) => {
  assert.equal(a.length, b.length);
  a.forEach((x, i) => near(x, b[i], tol));
};
const scale = (v, s) => v.map((x) => x * s);
const SKIN = 1e-4;   // the default checkpoint retreat, and the default skin
/** Feed a result's state back in as the next frame's, the way a host would. */
const nextFrame = (out, velocity) => ({ ...out.state,
  position: [...out.state.position],
  velocity: velocity ? velocity.slice() : [...out.state.velocity] });

const UNITS = { name: 'design-unit', playerRadius: 0.25 };
const e3Region = (id, extent = 6) => ({ id, geometry: { kind: 'e3', curvatureRadius: 1 }, topology: 'cover', extent });
const s3Region = (id, curvatureRadius, extent) => ({ id, geometry: { kind: 's3', curvatureRadius }, topology: 'cover', extent });
const anchor = (id, regionId, position, forward, radius = 0.8, up = [0, 0, 1]) =>
  ({ id, regionId, kind: 'anchor', position, forward, up, radius });
const spawn = (id, regionId, position = [0, 0, 0]) => ({ id, regionId, kind: 'spawn', position });
const link = (id, a, b) => ({ id, kind: 'portal', a, b, velocity: 'preserve-speed', scale: 1 });
const scene = (id, regions, entities, connections = []) =>
  ({ format: 'nil-scene', version: 2, id, units: UNITS, regions, entities, connections });

/** A state at `position` aimed along `forward`, with the camera the region owns. */
function stateAt(world, regionId, position, velocity, look = {}) {
  const { space } = world.regions.get(regionId);
  const basis = space.frame(position);
  const camera = turn(createCameraFrame(space, position, { forward: basis[1], up: basis[2] }), look);
  return { regionId, position: position.slice(), velocity: velocity.slice(), radius: UNITS.playerRadius, camera };
}

// A flat room and a sphere joined by one gate, used by most of the checks.
// The flat gate faces the walker (forward points back down the approach), which
// is what the one-sided crossing rule requires; the sphere anchor's forward is
// the direction the walker emerges along.
const pairScene = (curvatureRadius = 2, extent = 3) => scene('pair', [e3Region('flat'), s3Region('sphere', curvatureRadius, extent)], [
  spawn('flat-start', 'flat'), spawn('sphere-start', 'sphere'),
  anchor('flat-gate', 'flat', [0, 2, 0], [0, -1, 0]),
  anchor('sphere-gate', 'sphere', [0, 1, 0], [0, 1, 0]),
], [link('gate', 'flat-gate', 'sphere-gate')]);

// ---------------------------------------------------------------- validation

test('invalid arguments are rejected before anything moves', () => {
  const world = compileRegionWorld(pairScene());
  const good = stateAt(world, 'flat', [0, 0, 0], [0, 1, 0]);
  assert.throws(() => moveRegionProbe(world, good, Number.NaN), /dt/);
  assert.throws(() => moveRegionProbe(world, good, -1), /dt/);
  assert.throws(() => moveRegionProbe({}, good, 1), /compiled region world/);
  assert.throws(() => moveRegionProbe(world, null, 1), /state/);
  assert.throws(() => moveRegionProbe(world, { ...good, regionId: 'nowhere' }, 1), /Unknown region nowhere/);
  assert.throws(() => moveRegionProbe(world, { ...good, radius: 0 }, 1), /radius/);
  assert.throws(() => moveRegionProbe(world, { ...good, radius: Number.POSITIVE_INFINITY }, 1), /radius/);
  assert.throws(() => moveRegionProbe(world, { ...good, position: [0, 0] }, 1), /point/);
  assert.throws(() => moveRegionProbe(world, { ...good, velocity: [0, Number.NaN, 0] }, 1), /tangent/);
  assert.throws(() => moveRegionProbe(world, { ...good, camera: undefined }, 1), /camera/);
  assert.throws(() => moveRegionProbe(world, good, 1, { skin: 0 }), /skin/);
  assert.throws(() => moveRegionProbe(world, good, 1, { maxSteps: 2.5 }), /maxSteps/);
  assert.throws(() => moveRegionProbe(world, good, 1, { maxContacts: -1 }), /maxContacts/);
  assert.throws(() => moveRegionProbe(world, good, 1, { maxCrossings: 1.5 }), /maxCrossings/);
});

test('a camera from another metric or another point is not the region owner', () => {
  const world = compileRegionWorld(pairScene());
  const good = stateAt(world, 'flat', [0, 0, 0], [0, 1, 0]);
  const elsewhere = stateAt(world, 'flat', [0, 0.5, 0], [0, 1, 0]);
  assert.throws(() => moveRegionProbe(world, { ...good, camera: elsewhere.camera }, 1), /state\.position/);
  // Two S3 regions of different radius produce identical-looking four-vectors,
  // so identity of the space object is the only sound ownership test.
  const twin = compileRegionWorld(pairScene(2, 3));
  const foreign = stateAt(twin, 'flat', [0, 0, 0], [0, 1, 0]);
  assert.throws(() => moveRegionProbe(world, { ...good, camera: foreign.camera }, 1), /owned by the region space/);
});

test('zero dt is the identity, including standing on the aperture plane', () => {
  const world = compileRegionWorld(pairScene());
  for (const position of [[0, 0, 0], [0, 2, 0]]) {
    const state = stateAt(world, 'flat', position, [0, 4, 0]);
    const out = moveRegionProbe(world, state, 0);
    assert.equal(out.status, 'complete');
    assert.equal(out.crossings, 0);
    assert.equal(out.events.length, 0);
    assert.equal(out.state.regionId, 'flat');
    vectorNear([...out.state.position], position, 0);
    vectorNear([...out.state.velocity], [0, 4, 0], 0);
    assert.equal(out.state.camera, state.camera);
    near(out.timeConsumed, 0, 0); near(out.timeRemaining, 0, 0);
  }
});

test('a move that crosses does not mutate the state it was given', () => {
  const world = compileRegionWorld(pairScene());
  const state = stateAt(world, 'flat', [0, 0, 0], [0, 4, 0]);
  const before = JSON.stringify({ r: state.regionId, p: state.position, v: state.velocity, c: state.camera.forward });
  const out = moveRegionProbe(world, state, 0.6);
  assert.equal(out.state.regionId, 'sphere');
  assert.equal(JSON.stringify({ r: state.regionId, p: state.position, v: state.velocity, c: state.camera.forward }), before);
  assert.throws(() => { out.state.position[0] = 9; }, TypeError);
});

// ------------------------------------------------------------- free crossing

test('free E3 -> S3 -> E3 keeps speed, radius, roll and the whole clock', () => {
  const world = compileRegionWorld(pairScene(2, 3));
  const flat = world.regions.get('flat').space, sphere = world.regions.get('sphere').space;
  const start = stateAt(world, 'flat', [0, 0, 0], [0, 4, 0], { roll: 0.7, pitch: 0.3, yaw: -0.4 });
  const dt = 0.55;

  const out = moveRegionProbe(world, start, dt);
  assert.equal(out.status, 'complete', out.detail ?? '');
  assert.equal(out.state.regionId, 'sphere');
  assert.equal(out.crossings, 1);
  assert.equal(out.state.camera.space, sphere);
  assert.equal(out.state.radius, start.radius);
  near(sphere.norm([...out.state.position], [...out.state.velocity]), 4, 1e-12);
  near(out.timeConsumed + out.timeRemaining, dt, 1e-15);
  near(out.timeRemaining, 0, 1e-15);
  // A portal is a shortcut through the manifold, not free distance and not a
  // pause: source arc + destination arc = speed * dt, up to the exit offset.
  const flown = 2 + sphere.distance(sphere.decode([0, 1, 0]), [...out.state.position]);
  near(flown, 4 * dt, 1e-3);

  const back = moveRegionProbe(world, { ...out.state, velocity: scale([...out.state.velocity], -1) }, dt);
  assert.equal(back.status, 'complete', back.detail ?? '');
  assert.equal(back.state.regionId, 'flat');
  assert.equal(back.state.camera.space, flat);
  near(flat.norm([...back.state.position], [...back.state.velocity]), 4, 1e-12);
  // ROLL SURVIVES THE ROUND TRIP. Out and back along the same geodesics, the
  // transports cancel and the two portal maps are inverse, so the frame that
  // comes home is the frame that left -- vector for vector, roll included.
  for (const key of ['forward', 'up', 'right']) {
    vectorNear([...back.state.camera[key]], [...start.camera[key]], 1e-12);
  }
});

test('two S3 regions of different curvature radius: speed crosses, angle does not', () => {
  const world = compileRegionWorld(scene('radii', [s3Region('small', 1, 1.5), s3Region('large', 3, 4)], [
    spawn('small-start', 'small'), spawn('large-start', 'large'),
    anchor('small-gate', 'small', [0, 0.7, 0], [0, -1, 0], 0.4),
    anchor('large-gate', 'large', [0, 1, 0], [0, 1, 0], 0.4),
  ], [link('gate', 'small-gate', 'large-gate')]));
  const small = world.regions.get('small').space, large = world.regions.get('large').space;
  const start = stateAt(world, 'small', small.decode([0, 0, 0]), [0, 2, 0, 0]);
  const out = moveRegionProbe(world, start, 0.6);
  assert.equal(out.status, 'complete', out.detail ?? '');
  assert.equal(out.state.regionId, 'large');
  assert.equal(out.state.camera.space, large);
  near(large.norm([...out.state.position], [...out.state.velocity]), 2, 1e-12);
  // Equal PHYSICAL speed, different angular rate: the same 1.2 units of travel
  // sweeps 1.2 rad in the R=1 room and 0.4 rad in the R=3 one. Inferring the
  // metric from the vector's length would have kept R=1 and put the walker in
  // the wrong place by a factor of three.
  const travelled = large.distance(large.decode([0, 1, 0]), [...out.state.position]);
  near(travelled, 1.2 - 0.7, 1e-3);
});

// Apertures set at 45 degrees in both rooms, so nothing about the crossing is
// axis-aligned and a map that quietly assumed an upright gate has nowhere to hide.
const H = Math.SQRT1_2;
const tiltedScene = () => scene('tilt', [e3Region('flat'), s3Region('sphere', 2, 3)], [
  spawn('flat-start', 'flat'), spawn('sphere-start', 'sphere'),
  anchor('flat-gate', 'flat', [0, 2, 0], [0, -H, -H], 0.8, [0, -H, H]),
  anchor('sphere-gate', 'sphere', [0, 1, 0], [0, H, H], 0.8, [0, -H, H]),
], [link('gate', 'flat-gate', 'sphere-gate')]);

test('a tilted aperture crosses, and the roll comes home with the walker', () => {
  const world = compileRegionWorld(tiltedScene());
  const flat = world.regions.get('flat').space, sphere = world.regions.get('sphere').space;
  // Aimed at the gate centre along the aperture normal: start + sqrt(2) * u.
  const start = stateAt(world, 'flat', [0, 1, -1], scale([0, H, H], 4), { roll: 1.1, pitch: 0.2 });
  const dt = Math.SQRT2 / 4;
  const out = moveRegionProbe(world, start, dt);
  assert.equal(out.state.regionId, 'sphere', out.detail ?? out.status);
  assert.equal(out.crossings, 1);
  near(sphere.norm([...out.state.position], [...out.state.velocity]), 4, 1e-12);
  near(out.timeRemaining, 0, 1e-15);
  const back = moveRegionProbe(world, { ...out.state, velocity: scale([...out.state.velocity], -1) }, dt);
  assert.equal(back.state.regionId, 'flat');
  near(flat.norm([...back.state.position], [...back.state.velocity]), 4, 1e-12);
  for (const key of ['forward', 'up', 'right']) {
    vectorNear([...back.state.camera[key]], [...start.camera[key]], 1e-12);
  }
});

test('the crossing holds across player radii, and the radius itself is preserved', () => {
  const world = compileRegionWorld(pairScene(2, 3));
  const sphere = world.regions.get('sphere').space;
  for (const radius of [0.05, 0.25, 0.5]) {
    const start = { ...stateAt(world, 'flat', [0, 0, 0], [0, 4, 0], { roll: 0.4 }), radius };
    const out = moveRegionProbe(world, start, 0.5);
    assert.equal(out.state.regionId, 'sphere', `radius ${radius}`);
    assert.equal(out.state.radius, radius);
    near(sphere.norm([...out.state.position], [...out.state.velocity]), 4, 1e-12);
  }
  // Wider than the aperture admits, and it is refused as a wall would be: the
  // radial fit is a body test, not a centre-ray test.
  const tooWide = { ...stateAt(world, 'flat', [0, 0, 0], [0, 4, 0]), radius: 0.9 };
  const out = moveRegionProbe(world, tooWide, 0.6);
  assert.equal(out.crossings, 0);
  assert.equal(out.state.regionId, 'flat');
});

test('the camera is the composition along the actual legs, not a rebuilt frame', () => {
  const world = compileRegionWorld(pairScene(2, 3));
  const sphere = world.regions.get('sphere').space;
  const portal = world.portals.find((p) => p.fromRegionId === 'flat');
  const start = stateAt(world, 'flat', [0.1, 0, 0.05], [0, 4, 0], { roll: 0.9, pitch: -0.25 });
  // dt is chosen so the frame ends exactly at the aperture: what is left is
  // the crossing and its exit offset, and nothing else to confuse the composition.
  const out = moveRegionProbe(world, start, 0.5);
  assert.equal(out.state.regionId, 'sphere');
  near(out.timeRemaining, 0, 1e-15);
  // Independent composition: E3 transport is the identity, so the source leg
  // contributes nothing; then the portal's own map; then the exit offset's
  // transport along the destination geodesic.
  const at = [0.1, 2, 0.05];
  const transit = portal.transit(at);
  const exitNormal = sphere.normalize(transit.position, transit.normal);
  const offset = sphere.stepWithTransport(transit.position, exitNormal, 4e-4);
  for (const key of ['forward', 'up', 'right']) {
    vectorNear([...out.state.camera[key]], offset.carry(transit.carry([...start.camera[key]])), 1e-11);
  }
  vectorNear([...out.state.position], offset.position, 1e-12);
});

// --------------------------------------------------------------------- clock

// A wall at x = d whose normal is -x, so sliding removes exactly the
// x-component of the velocity. Launch at (3, 4, 0): speed 5 before, 4 after.
const wallScene = (d) => scene('slide', [e3Region('room', 8)], [
  spawn('room-start', 'room', [0, 0, 0]),
  { id: 'wall', regionId: 'room', kind: 'plane', position: [d, 0, 0], up: [-1, 0, 0] },
]);

test('remaining TIME, not leftover distance, is what the slide gets to spend', () => {
  const world = compileRegionWorld(wallScene(1));
  const dt = 0.5;
  const out = moveRegionProbe(world, stateAt(world, 'room', [0, 0, 0], [3, 4, 0]), dt);
  assert.equal(out.status, 'complete', out.detail ?? '');
  assert.ok(out.contactSamples.length > 0, 'the wall must actually be met');
  // y(dt) = (4/3)(d - r) + 4 * (dt - (d - r)/3) = 4 * dt. The wall's position
  // cancels. Spending the leftover DISTANCE (5 * remaining) instead would put
  // the walker at 2.25 here rather than 2.
  near([...out.state.position][1], 4 * dt, 2e-3);
  near([...out.state.position][0], 1 - UNITS.playerRadius, 2e-3);
  near(out.timeConsumed, dt, 1e-12);
  near(out.timeRemaining, 0, 1e-12);
  near(out.time.rest, 0, 0);
  vectorNear([...out.state.velocity], [0, 4, 0], 1e-9);
});

test('the same clock holds wherever the wall is put', () => {
  for (const d of [0.6, 1.4, 2.2]) {
    const world = compileRegionWorld(wallScene(d));
    const out = moveRegionProbe(world, stateAt(world, 'room', [0, 0, 0], [3, 4, 0]), 0.7);
    near([...out.state.position][1], 4 * 0.7, 3e-3);
  }
});

test('a probe driven straight into a wall spends the rest of the frame at rest', () => {
  const world = compileRegionWorld(wallScene(1));
  const dt = 0.6;
  const out = moveRegionProbe(world, stateAt(world, 'room', [0, 0, 0], [5, 0, 0]), dt);
  assert.equal(out.status, 'stopped');
  near(out.timeConsumed, dt, 1e-12);
  near(out.timeRemaining, 0, 0);
  assert.ok(out.time.rest > 0, 'rest time is reported separately from travel');
  near(out.time.travel + out.time.rest, dt, 1e-12);
  vectorNear([...out.state.velocity], [0, 0, 0], 0);
});

// --------------------------------------------------------- event ordering

// A wall at x = 1 with a gate behind it and a gate reachable only by sliding.
const deflectScene = (wall) => scene('deflect', [e3Region('room', 8), e3Region('behind', 8), e3Region('beside', 8)], [
  spawn('room-start', 'room', [0, 0, 0]), spawn('behind-start', 'behind'), spawn('beside-start', 'beside'),
  ...(wall ? [{ id: 'wall', regionId: 'room', kind: 'plane', position: [1, 0, 0], up: [-1, 0, 0] }] : []),
  anchor('ahead', 'room', [3, 0, 0], [-1, 0, 0], 0.8),
  anchor('behind-gate', 'behind', [0, 0, 0], [1, 0, 0], 0.8),
  anchor('side', 'room', [0.7, 1.2, 0], [0, -1, 0], 0.6),
  anchor('beside-gate', 'beside', [0, 0, 0], [0, 1, 0], 0.6),
], [link('through', 'ahead', 'behind-gate'), link('sideways', 'side', 'beside-gate')]);

test('a surface that blocks arrival wins over the portal behind it', () => {
  const open = compileRegionWorld(deflectScene(false));
  const reached = moveRegionProbe(open, stateAt(open, 'room', [0, 0, 0], [4, 0, 0]), 1);
  assert.equal(reached.state.regionId, 'behind', 'control: the gate is reachable when nothing is in the way');
  assert.equal(reached.crossings, 1);

  const walled = compileRegionWorld(deflectScene(true));
  const out = moveRegionProbe(walled, stateAt(walled, 'room', [0, 0, 0], [4, 0, 0]), 1);
  assert.equal(out.status, 'stopped');
  assert.equal(out.state.regionId, 'room');
  assert.equal(out.crossings, 0);
  assert.equal(out.events.filter((e) => e.kind === 'portal').length, 0);
  assert.ok(out.contactSamples.length > 0);
  near([...out.state.position][0], 1 - UNITS.playerRadius, 2e-3);
});

test('a contact changes the direction, and a DIFFERENT portal is the one reached', () => {
  const walled = compileRegionWorld(deflectScene(true));
  const out = moveRegionProbe(walled, stateAt(walled, 'room', [0, 0, 0], [3, 1, 0]), 1.4);
  assert.equal(out.state.regionId, 'beside', out.detail ?? out.status);
  assert.equal(out.crossings, 1);
  assert.ok(out.contactSamples.length > 0, 'the wall must be met before the gate');
  const portalEvents = out.events.filter((e) => e.kind === 'portal');
  assert.equal(portalEvents.length, 1);
  assert.equal(portalEvents[0].portalId, 'sideways');
  // The contact came first: its sample sits short of the aperture it deflected
  // the walker into.
  assert.ok(out.contactSamples[0].position[1] < portalEvents[0].at[1]);
});

test('contact samples keep their own point and region, and stay tangent there', () => {
  const walled = compileRegionWorld(deflectScene(true));
  const out = moveRegionProbe(walled, stateAt(walled, 'room', [0, 0, 0], [3, 1, 0]), 1.4);
  const space = walled.regions.get('room').space;
  for (const sample of out.contactSamples) {
    assert.equal(sample.regionId, 'room');
    space.validateTangent([...sample.position], [...sample.normal]);
    near(Math.hypot(...sample.normal), 1, 1e-12);
    // The normal belongs where it was sampled, and that is not the end point.
    assert.ok(space.distance([...sample.position], [...out.state.position]) > 1e-6);
  }
});

test('an aperture the body does not fit through is simply not an event', () => {
  // The centre ray passes well inside the disc; the player radius does not.
  const world = compileRegionWorld(scene('narrow-room', [e3Region('room'), e3Region('far')], [
    spawn('room-start', 'room', [0, 0, 0]), spawn('far-start', 'far'),
    anchor('narrow', 'room', [0, 2, 0], [0, -1, 0], 0.3),
    anchor('far-gate', 'far', [0, 0, 0], [0, 1, 0], 0.3),
  ], [link('pinch', 'narrow', 'far-gate')]));
  const offCentre = moveRegionProbe(world, stateAt(world, 'room', [0.2, 0, 0], [0, 4, 0]), 1);
  assert.equal(offCentre.crossings, 0);
  assert.equal(offCentre.state.regionId, 'room');
  // Nothing invented a wall either: the walker keeps going, through the plane
  // the aperture is set in, because the source scene has no solid there.
  assert.ok([...offCentre.state.position][1] > 2);
});

test('standing on the aperture plane is not a teleport', () => {
  const world = compileRegionWorld(pairScene());
  const out = moveRegionProbe(world, stateAt(world, 'flat', [0, 2, 0], [0, 4, 0]), 0.2);
  assert.equal(out.crossings, 0);
  assert.equal(out.state.regionId, 'flat');
  near([...out.state.position][1], 2.8, 1e-9);
});

test('an exact frame-end crossing is processed once, with no time left over', () => {
  const world = compileRegionWorld(pairScene(2, 3));
  // 4 * 0.5 = 2.0 exactly, and 3 * (2/3) is 1.9999999999999998 -- a crossing
  // that lands a rounding step past the requested range, which must still be
  // taken exactly once rather than lost or doubled.
  for (const [speed, dt] of [[4, 0.5], [3, 2 / 3]]) {
    const out = moveRegionProbe(world, stateAt(world, 'flat', [0, 0, 0], [0, speed, 0]), dt);
    assert.equal(out.crossings, 1, `speed ${speed}`);
    assert.equal(out.state.regionId, 'sphere');
    assert.equal(out.status, 'complete');
    near(out.timeRemaining, 0, 1e-15);
    near(out.timeConsumed, dt, 1e-15);
  }
});

test('a portal beyond the chart edge does not win against the chart edge', () => {
  // No authored document can produce this ordering -- a chart is convex and the
  // schema keeps every aperture inside it -- so the portal's own crossing is
  // replaced with one placed deliberately past the edge.
  const world = compileRegionWorld(pairScene());
  const space = world.regions.get('flat').space;
  const limit = space.boundaryDistance([0, 0, 0], [0, 1, 0]);
  const real = world.portals.find((p) => p.fromRegionId === 'flat');
  const beyond = { ...real, crossing: () => ({ distance: limit + 0.5, at: [0, limit + 0.5, 0] }) };
  const staged = { regions: world.regions, portals: [beyond] };
  const out = moveRegionProbe(staged, stateAt(world, 'flat', [0, 0, 0], [0, 4, 0]), 10);
  assert.equal(out.status, 'domain-exit');
  assert.equal(out.crossings, 0);
  assert.equal(out.events.at(-1).kind, 'domain');
  near(out.events.at(-1).limit, limit, 1e-12);
  // Stopped JUST INSIDE, and the chart edge is not a surface: no normal, no
  // projection, no grounded flag, and the velocity is untouched.
  assert.ok(space.withinDomain([...out.state.position]));
  assert.equal(out.contactSamples.length, 0);
  vectorNear([...out.state.velocity], [0, 4, 0], 0);
  assert.ok(out.timeRemaining > 0);
});

test('a portal tied with the chart edge is unresolved, not a coin flip', () => {
  const world = compileRegionWorld(pairScene());
  const space = world.regions.get('flat').space;
  const limit = space.boundaryDistance([0, 0, 0], [0, 1, 0]);
  const real = world.portals.find((p) => p.fromRegionId === 'flat');
  const tied = { ...real, crossing: () => ({ distance: limit, at: [0, limit, 0] }) };
  const out = moveRegionProbe({ regions: world.regions, portals: [tied] },
    stateAt(world, 'flat', [0, 0, 0], [0, 4, 0]), 10);
  assert.equal(out.status, 'unresolved');
  assert.equal(out.detail, 'competing-events');
  assert.equal(out.crossings, 0);
  assert.equal(out.state.regionId, 'flat');
  assert.equal(out.events.at(-1).competitors.length, 2);
  assert.ok(out.timeRemaining > 0);
});

test('two indistinguishable apertures are unresolved, in either authoring order', () => {
  const both = (first, second) => scene('tied', [e3Region('room'), e3Region('a'), e3Region('b')], [
    spawn('room-start', 'room', [0, 0, 0]), spawn('a-start', 'a'), spawn('b-start', 'b'),
    anchor(first, 'room', [0, 2, 0], [0, -1, 0]), anchor(second, 'room', [0, 2, 0], [0, -1, 0]),
    anchor('a-gate', 'a', [0, 0, 0], [0, 1, 0]), anchor('b-gate', 'b', [0, 0, 0], [0, 1, 0]),
  ], [link('to-a', first === 'left' ? 'left' : 'right', first === 'left' ? 'a-gate' : 'b-gate'),
    link('to-b', first === 'left' ? 'right' : 'left', first === 'left' ? 'b-gate' : 'a-gate')]);
  for (const [first, second] of [['left', 'right'], ['right', 'left']]) {
    const world = compileRegionWorld(both(first, second));
    const out = moveRegionProbe(world, stateAt(world, 'room', [0, 0, 0], [0, 4, 0]), 1);
    assert.equal(out.status, 'unresolved', `${first} first`);
    assert.equal(out.state.regionId, 'room');
    assert.equal(out.crossings, 0);
    assert.equal(out.events.at(-1).competitors.length, 2);
    // An unresolved tie is an UNCOMMITTED approach. The walker is returned to
    // the start of the leg that raised it, not parked on a plane nobody could
    // show they had a right to be on, and the whole frame is handed back.
    near([...out.state.position][1], 0, 1e-12);
    near(out.timeConsumed, 0, 1e-12);
    near(out.timeRemaining, 1, 1e-12);
    near(out.events.at(-1).at[1], 2, 1e-12);
    near(out.events.at(-1).stoppedAt[1], 0, 1e-12);
  }
});

test('the crossing is found on the geodesic leg, not on a chord across it', () => {
  const world = compileRegionWorld(scene('curved', [s3Region('here', 1, 1.5), e3Region('there')], [
    spawn('here-start', 'here'), spawn('there-start', 'there'),
    anchor('curved-gate', 'here', [0, 0.9, 0], [0, -1, 0], 0.4),
    anchor('flat-gate', 'there', [0, 0, 0], [0, 1, 0], 0.4),
  ], [link('gate', 'curved-gate', 'flat-gate')]));
  const space = world.regions.get('here').space;
  const portal = world.portals.find((p) => p.fromRegionId === 'here');
  const from = space.decode([0, 0, 0]);
  const direction = [0, 1, 0, 0];
  const out = moveRegionProbe(world, stateAt(world, 'here', from, scale(direction, 3)), 0.4);
  const crossing = out.events.find((e) => e.kind === 'portal');
  assert.ok(crossing, 'the aperture is crossed');
  const at = [...crossing.at];
  // The aperture is the great sphere orthogonal to the anchor normal: the
  // reported point lies ON it, and at the arclength the geodesic reaches it.
  near(at.reduce((s, x, i) => s + x * portal.normal[i], 0), 0, 1e-14);
  near(space.distance(from, at), 0.9, 1e-12);
  // A chord test between the endpoints of the whole move answers a materially
  // different question. The interpolated point is not on the sphere at all,
  // and -- the part that would actually move a walker -- the chord fraction is
  // not the arclength fraction, so the crossing is reported at the wrong
  // DISTANCE along the path. (The radial projection of the chord point happens
  // to land back on the geodesic crossing here, because an aperture is a great
  // sphere and the geodesic shares its 2-plane; the distance is what is wrong,
  // and the distance is what the solver advances by.)
  const travel = 3 * 0.4;
  const end = space.step(from, direction, travel);
  const h = (p) => p.reduce((sum, x, i) => sum + x * portal.normal[i], 0);
  const fraction = h(from) / (h(from) - h(end));
  const chord = from.map((x, i) => x + fraction * (end[i] - x));
  assert.ok(Math.abs(Math.hypot(...chord) - 1) > 1e-2, 'the chord point is off the sphere');
  assert.ok(Math.abs(fraction * travel - 0.9) > 1e-2,
    `chord fraction reports ${fraction * travel}, the geodesic reaches the aperture at 0.9`);
});

// -------------------------------------------------------- crossing refusals

test('a destination that is occupied refuses the crossing and keeps source ownership', () => {
  const world = compileRegionWorld(scene('blocked', [e3Region('room'), e3Region('rock')], [
    spawn('room-start', 'room', [0, 0, 0]), spawn('rock-start', 'rock', [2, 0, 0]),
    anchor('gate-in', 'room', [0, 2, 0], [0, -1, 0]),
    anchor('gate-out', 'rock', [0, 0, 0], [0, 1, 0]),
    { id: 'plug', regionId: 'rock', kind: 'ball', position: [0, 0, 0], radius: 0.5 },
  ], [link('gate', 'gate-in', 'gate-out')]));
  const dt = 1;
  const out = moveRegionProbe(world, stateAt(world, 'room', [0, 0, 0], [0, 4, 0]), dt);
  assert.equal(out.status, 'blocked-exit');
  // A field that advertises an EXACT exterior distance proves occupancy; a
  // conservative bound only fails to prove clearance. Both refuse; they are
  // not the same finding and are not reported as one.
  assert.equal(out.detail, 'destination-clearance-insufficient');
  assert.equal(out.state.regionId, 'room');
  assert.equal(out.crossings, 0);
  // STRICTLY SOURCE-SIDE, not on the plane: the approach was provisional and
  // the destination refused it, so it rolls back by one skin along the leg it
  // was travelling. The aperture it aimed at is reported separately.
  near([...out.state.position][1], 2 - SKIN, 1e-12);
  near(out.events.at(-1).at[1], 2, 1e-12);
  near(out.events.at(-1).stoppedAt[1], 2 - SKIN, 1e-12);
  // Only the DISCARDED travel is refunded: the walker really did cover the
  // first 2 - skin units.
  near(out.timeConsumed, (2 - SKIN) / 4, 1e-12);
  near(out.timeConsumed + out.timeRemaining, dt, 1e-15);
  assert.ok(out.timeRemaining > 0);
});

test('an obstructed exit offset fails the whole crossing, not half of it', () => {
  // Clearance at the arrival point passes (1e-4 >= skin/2) and the swept offset
  // then meets the surface inside 4 * skin. No partial destination state may
  // escape: ownership, position, velocity and camera all stay in the source.
  const world = compileRegionWorld(scene('ledge-room', [e3Region('room'), e3Region('ledge')], [
    spawn('room-start', 'room', [0, 0, 0]), spawn('ledge-start', 'ledge', [-1, 0, 0]),
    anchor('gate-in', 'room', [0, 2, 0], [0, -1, 0]),
    anchor('gate-out', 'ledge', [0, 0, 0], [1, 0, 0]),
    { id: 'lip', regionId: 'ledge', kind: 'plane', position: [UNITS.playerRadius + 1e-4, 0, 0], up: [-1, 0, 0] },
  ], [link('gate', 'gate-in', 'gate-out')]));
  const out = moveRegionProbe(world, stateAt(world, 'room', [0, 0, 0], [0, 4, 0]), 1);
  assert.equal(out.status, 'blocked-exit');
  assert.equal(out.detail, 'exit-offset-obstructed');
  assert.equal(out.state.regionId, 'room');
  assert.equal(out.state.camera.space, world.regions.get('room').space);
  assert.equal(out.crossings, 0);
  near([...out.state.position][1], 2 - SKIN, 1e-12);
});

test('a legitimate return crossing is not suppressed', () => {
  const world = compileRegionWorld(pairScene(2, 3));
  let state = stateAt(world, 'flat', [0, 0, 0], [0, 4, 0]);
  let crossings = 0;
  for (let frame = 0; frame < 2; frame++) {
    const out = moveRegionProbe(world, state, 0.6);
    crossings += out.crossings;
    state = { ...out.state, position: [...out.state.position], velocity: [...out.state.velocity] };
    if (frame === 0) {
      assert.equal(out.state.regionId, 'sphere');
      state.velocity = scale(state.velocity, -1);
    }
  }
  assert.equal(crossings, 2, 'out and back, with no cooldown suppressing the return');
  assert.equal(state.regionId, 'flat');
});

// -------------------------------------------------- corrections are not travel

// A floor to settle onto, a gate in the wall ahead, and (optionally) a gate
// lying flat just above the walker -- close enough that the LIFT off the floor
// runs into it. A lift is a numerical repair, not a journey, and it is not
// allowed to decide which region anybody is standing in.
const floorScene = (lidHeight, plug = false) => scene('floor-room', [e3Region('room'), e3Region('next')], [
  spawn('room-start', 'room', [0, 0, 1]), spawn('next-start', 'next', [-1, 0, 0]),
  ...(plug ? [{ id: 'plug', regionId: 'next', kind: 'ball', position: [0, 0, 0], radius: 0.5 }] : []),
  { id: 'ground', regionId: 'room', kind: 'plane', position: [0, 0, 0], up: [0, 0, 1] },
  anchor('ahead', 'room', [2, 0, 0.3], [-1, 0, 0], 0.8, [0, 0, 1]),
  anchor('next-gate', 'next', [0, 0, 0], [1, 0, 0], 0.8, [0, 0, 1]),
  ...(lidHeight === null ? [] : [
    anchor('lid', 'room', [0.5, 0, lidHeight], [0, 0, -1], 0.8, [1, 0, 0]),
    anchor('lid-exit', 'next', [0, 2, 0], [0, 0, 1], 0.8, [1, 0, 0]),
  ]),
], [link('wall-gate', 'ahead', 'next-gate'),
  ...(lidHeight === null ? [] : [link('lid-gate', 'lid', 'lid-exit')])]);

test('a lift that reaches an aperture stops and says so instead of crossing', () => {
  const world = compileRegionWorld(floorScene(0.29));
  const out = moveRegionProbe(world, stateAt(world, 'room', [0, 0, 0.5], [4, 0, -2]), 0.5);
  assert.equal(out.status, 'unresolved');
  assert.equal(out.detail, 'correction-boundary');
  assert.equal(out.state.regionId, 'room');
  assert.equal(out.crossings, 0);
  const event = out.events.at(-1);
  assert.equal(event.phase, 'correction');
  assert.equal(event.portalId, 'lid-gate');
  // NONE OF THE LIFT IS KEPT. A correction that runs into a decision it may not
  // make is discarded whole, so the walker is still at the contact it was
  // lifting off and owes no settle -- the debt only exists if the lift happened.
  assert.equal(out.pendingLift, null);
  assert.ok(event.at[2] > event.stoppedAt[2] + 1e-9,
    'the aperture aimed at is above the contact stopped at');
  near([...out.state.position][2], event.stoppedAt[2], 1e-15);
  assert.ok(out.timeRemaining > 0);
});

test('a transit cancels the source floor settle debt rather than carrying it across', () => {
  const world = compileRegionWorld(floorScene(null));
  const out = moveRegionProbe(world, stateAt(world, 'room', [0, 0, 0.5], [4, 0, -2]), 0.6);
  assert.equal(out.state.regionId, 'next', out.detail ?? out.status);
  assert.equal(out.crossings, 1);
  assert.ok(out.contactSamples.length > 0, 'the floor must have been met, so a lift was owed');
  assert.ok(out.contactSamples.every((c) => c.regionId === 'room'));
  // A source floor's correction means nothing on the far side of the portal.
  assert.equal(out.pendingLift, null);
  near(out.timeConsumed + out.timeRemaining, 0.6, 1e-12);
});

// A sphere with one rock in it, and no apertures: the point is the CARRY.
const grazeScene = () => scene('graze', [s3Region('curve', 1, 1.5)], [
  spawn('curve-start', 'curve', [0, -0.6, 0]),
  { id: 'rock', regionId: 'curve', kind: 'ball', position: [0, 0.5, 0], radius: 0.4 },
]);

test('a curved contact carries the camera along the legs walked, not between endpoints', () => {
  const world = compileRegionWorld(grazeScene());
  const base = world.regions.get('curve').space;
  // Record the legs the solver actually takes, then transport along each of
  // them with an independent endpoint formula. Composing per leg is a
  // different computation from the solver's rotating-plane carry, and it is a
  // different ANSWER from transporting once between the two endpoints -- which
  // follows a geodesic the walker never travelled.
  const legs = [];
  const space = { ...base, stepWithTransport(p, u, t) {
    const segment = base.stepWithTransport(p, u, t);
    legs.push([p.slice(), segment.position.slice()]);
    return segment;
  } };
  const region = world.regions.get('curve');
  const staged = { regions: new Map([['curve', { ...region, space }]]), portals: [] };
  const from = base.decode([0, -0.6, 0]);
  const basis = base.frame(from);
  const direction = base.normalize(from, basis[1].map((x, i) => x + 0.5 * basis[0][i]));
  const camera = turn(createCameraFrame(space, from, { forward: basis[1], up: basis[2] }), { roll: 0.8 });
  const out = moveRegionProbe(staged,
    { regionId: 'curve', position: from, velocity: scale(direction, 2), radius: UNITS.playerRadius, camera }, 0.5);
  assert.ok(out.contactSamples.length > 0, 'the rock must actually be met');
  assert.ok(legs.length > 2, 'travel, lift, slide and settle are separate legs');

  const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
  const perLeg = (v) => legs.reduce((value, [a, b]) => {
    const k = dot(value, b) / (1 + dot(a, b));
    return value.map((x, i) => x - k * (a[i] + b[i]));
  }, v);
  let endpointGap = 0;
  for (const key of ['forward', 'up', 'right']) {
    const mapped = [...out.state.camera[key]];
    vectorNear(mapped, perLeg([...camera[key]]), 2e-10);
    base.validateTangent([...out.state.position], mapped);
    near(base.norm([...out.state.position], mapped), 1, 2e-10);
    const endpoint = base.transport(from, [...out.state.position], [...camera[key]]);
    endpointGap = Math.max(endpointGap, Math.hypot(...mapped.map((x, i) => x - endpoint[i])));
  }
  assert.ok(endpointGap > 1e-3,
    `path carry and shortest endpoint transport must be distinguishable here (${endpointGap})`);
});

// ------------------------------------------------- the event range is a contract

test('an event reported outside the proposed leg is refused, not rounded into range', () => {
  const world = compileRegionWorld(pairScene());
  const { field, space } = world.regions.get('flat');
  const seen = [];
  const beyond = (query) => { seen.push(query); return { kind: 'portal', distance: query.distance * 2 }; };
  assert.throws(() => moveProbe(field, space, { position: [0, 0, 0], velocity: [0, 4, 0], radius: 0.25 },
    1, { events: beyond }), /within the proposed leg/);
  assert.throws(() => moveProbe(field, space, { position: [0, 0, 0], velocity: [0, 4, 0], radius: 0.25 },
    1, { events: () => ({ kind: 'portal', distance: -1 }) }), /within the proposed leg/);
  // The provider is handed the leg it is being asked about, not the whole move.
  assert.equal(seen[0].phase, 'travel');
  near(seen[0].distance, 4, 1e-12);
  vectorNear(seen[0].direction, [0, 1, 0], 1e-15);
});

test('a crossing that lies past the frame is not pulled back onto it', () => {
  const world = compileRegionWorld(pairScene());
  const real = world.portals.find((p) => p.fromRegionId === 'flat');
  // Reported far beyond anything this frame can reach: the coordinator must
  // drop it, and the walker must simply travel the distance it had.
  const far = { ...real, crossing: () => ({ distance: 500, at: [0, 500, 0] }) };
  const out = moveRegionProbe({ regions: world.regions, portals: [far] },
    stateAt(world, 'flat', [0, 0, 0], [0, 4, 0]), 0.25);
  assert.equal(out.crossings, 0);
  assert.equal(out.state.regionId, 'flat');
  assert.equal(out.status, 'complete');
  near([...out.state.position][1], 1, 1e-12);
});

// ------------------------------------------- a refusal that stays a refusal

test('a settle owed at a REFUSED aperture is still owed, and never paid first', () => {
  // Descend, meet the floor, lift off it, slide into a gate whose far side is
  // plugged. The lift is outstanding when the aperture is reached, so the
  // settle must not run first -- running it would drag the probe off the
  // aperture and the crossing would be tested from a point it was never at.
  const world = compileRegionWorld(floorScene(null, true));
  const portal = world.portals.find((p) => p.fromRegionId === 'room' && p.toId === 'next-gate');
  const out = moveRegionProbe(world, stateAt(world, 'room', [0, 0, 0.5], [4, 0, -2]), 0.6);
  assert.equal(out.status, 'blocked-exit', out.detail ?? out.status);
  assert.equal(out.state.regionId, 'room');
  assert.ok(out.contactSamples.length > 0, 'the floor must have been met, so a lift was owed');
  // The debt survives the refusal: it was never paid, and it is still owed at
  // the checkpoint the walker was rolled back to.
  assert.ok(out.pendingLift, 'the outstanding settle is reported, not silently applied');
  assert.equal(out.pendingLift.regionId, 'room');
  assert.ok(portal.signedHeight([...out.state.position]) > PORTAL_PLANE_TOLERANCE);
});

test('an event yields BEFORE the settle, so the debt is still outstanding', () => {
  // Descend onto a floor, lift off it, slide, and run into the chart edge. The
  // settle is still owed at that moment, and the event has to be handed back
  // before it can be paid: paying it first moves the probe away from the very
  // thing that stopped it, and the caller is told about a point the probe was
  // never at when it stopped.
  const world = compileRegionWorld(scene('edge-room', [e3Region('room', 2.5)], [
    spawn('room-start', 'room', [0, 0, 0.5]),
    { id: 'ground', regionId: 'room', kind: 'plane', position: [0, 0, 0], up: [0, 0, 1] },
  ]));
  const out = moveRegionProbe(world, stateAt(world, 'room', [0, 0, 0.5], [4, 0, -2]), 1);
  assert.equal(out.status, 'domain-exit', out.detail ?? out.status);
  assert.ok(out.contactSamples.length > 0, 'the floor must have been met, so a lift was owed');
  assert.ok(out.pendingLift, 'the settle is still owed when the chart edge stops the walk');
  assert.equal(out.pendingLift.regionId, 'room');
  // Still up off the floor by the lift that was never undone.
  assert.ok([...out.state.position][2] > UNITS.playerRadius + 1e-3,
    'the probe is where the event stopped it, not where a settle would have put it');
});

// A gate whose far side is plugged solid, and the same scene with the plug
// taken out. Free-standing apertures: no wall saves this one.
const plugScene = (plug) => scene('plug-room', [e3Region('room', 9), e3Region('rock')], [
  spawn('room-start', 'room', [0, 0, 0]), spawn('rock-start', 'rock', [2, 0, 0]),
  anchor('gate-in', 'room', [0, 2, 0], [0, -1, 0]),
  anchor('gate-out', 'rock', [0, 0, 0], [0, 1, 0]),
  ...(plug ? [{ id: 'plug', regionId: 'rock', kind: 'ball', position: [0, 0, 0], radius: 0.5 }] : []),
], [link('gate', 'gate-in', 'gate-out')]);

test('a refused crossing stops on the ENTERING side, frame after frame', () => {
  const world = compileRegionWorld(plugScene(true));
  const portal = world.portals.find((p) => p.fromRegionId === 'room');
  let state = stateAt(world, 'room', [0, 0, 0], [0, 4, 0]);
  for (let frame = 0; frame < 12; frame++) {
    const out = moveRegionProbe(world, state, 1);
    assert.equal(out.status, 'blocked-exit', `frame ${frame}`);
    assert.equal(out.state.regionId, 'room');
    assert.equal(out.crossings, 0);
    // The one thing that must never happen: ending at or past the plane, where
    // the one-sided test declines to look and the next frame walks through.
    const height = portal.signedHeight([...out.state.position]);
    assert.ok(height > PORTAL_PLANE_TOLERANCE, `frame ${frame} height ${height}`);
    near([...out.state.position][1], 2 - SKIN, 1e-12);
    // The first frame pays for the approach it really made; every later frame
    // starts already at the checkpoint and so covers no ground at all.
    near(out.timeConsumed, frame === 0 ? (2 - SKIN) / 4 : 0, 1e-12);
    near(out.timeConsumed + out.timeRemaining, 1, 1e-15);
    state = nextFrame(out);
  }
});

test('retreat and lateral departure stay possible from a refused checkpoint', () => {
  const world = compileRegionWorld(plugScene(true));
  const refused = moveRegionProbe(world, stateAt(world, 'room', [0, 0, 0], [0, 4, 0]), 1);
  assert.equal(refused.status, 'blocked-exit');
  const back = moveRegionProbe(world, nextFrame(refused, [0, -4, 0]), 0.25);
  assert.equal(back.status, 'complete');
  near([...back.state.position][1], 1 - SKIN, 1e-12);
  const sideways = moveRegionProbe(world, nextFrame(refused, [4, 0, 0]), 0.25);
  assert.equal(sideways.status, 'complete');
  near([...sideways.state.position][0], 1, 1e-12);
  // No cooldown was armed: a portal is refused because its far side is blocked,
  // not because it refused once before.
  assert.equal(sideways.crossings, 0);
});

test('clearing the obstruction lets the very next frame cross', () => {
  const blocked = compileRegionWorld(plugScene(true));
  const open = compileRegionWorld(plugScene(false));
  const refused = moveRegionProbe(blocked, stateAt(blocked, 'room', [0, 0, 0], [0, 4, 0]), 1);
  assert.equal(refused.status, 'blocked-exit');
  // Same place, same heading, same remaining time -- only the far side changed.
  const resumed = moveRegionProbe(open,
    stateAt(open, 'room', [...refused.state.position], [...refused.state.velocity]),
    refused.timeRemaining);
  assert.equal(resumed.status, 'complete', resumed.detail ?? '');
  assert.equal(resumed.state.regionId, 'rock');
  assert.equal(resumed.crossings, 1);
});

test('a refusal keeps the work it spent and refunds only the travel it discarded', () => {
  // A ball beside the path so the approach costs real marching steps, which a
  // rollback must NOT hand back: those queries happened.
  const world = compileRegionWorld(scene('spend-room', [e3Region('room', 9), e3Region('rock')], [
    spawn('room-start', 'room', [0, 0, 0]), spawn('rock-start', 'rock', [2, 0, 0]),
    { id: 'post', regionId: 'room', kind: 'ball', position: [0.75, 1, 0], radius: 0.4 },
    anchor('gate-in', 'room', [0, 2, 0], [0, -1, 0]),
    anchor('gate-out', 'rock', [0, 0, 0], [0, 1, 0]),
    { id: 'plug', regionId: 'rock', kind: 'ball', position: [0, 0, 0], radius: 0.5 },
  ], [link('gate', 'gate-in', 'gate-out')]));
  const out = moveRegionProbe(world, stateAt(world, 'room', [0, 0, 0], [0, 4, 0]), 1);
  assert.equal(out.status, 'blocked-exit');
  assert.ok(out.steps > 1, `the approach must cost steps to be worth retaining (${out.steps})`);
  near([...out.state.position][1], 2 - SKIN, 1e-9);
  near(out.timeConsumed, (2 - SKIN) / 4, 1e-9);
});

test('the checkpoint carries the camera and the clock to the point it restores', () => {
  const world = compileRegionWorld(plugScene(true));
  const start = stateAt(world, 'room', [0.1, 0, -0.05], [0, 4, 0], { roll: 0.9, pitch: 0.3 });
  const out = moveRegionProbe(world, start, 1);
  assert.equal(out.status, 'blocked-exit');
  // E3 transport is the identity along the whole approach, so the frame that
  // survives the rollback is the frame that set out -- vector for vector.
  for (const key of ['forward', 'up', 'right']) {
    vectorNear([...out.state.camera[key]], [...start.camera[key]], 1e-14);
  }
  vectorNear([...out.state.camera.position], [0.1, 2 - SKIN, -0.05], 1e-12);
  near(out.timeConsumed + out.timeRemaining, 1, 1e-15);
  near(out.time.rest, 0, 0);
});

test('a crossing refused at the very end of the frame still rolls back', () => {
  const world = compileRegionWorld(plugScene(true));
  const out = moveRegionProbe(world, stateAt(world, 'room', [0, 0, 0], [0, 4, 0]), 0.5);
  assert.equal(out.status, 'blocked-exit');
  near([...out.state.position][1], 2 - SKIN, 1e-12);
  // The refund is real even when there was almost nothing left to refund.
  near(out.timeRemaining, SKIN / 4, 1e-15);
});

test('an uncommitted portal held by the crossing budget is also held source-side', () => {
  const world = compileRegionWorld(plugScene(false));
  const portal = world.portals.find((p) => p.fromRegionId === 'room');
  let state = stateAt(world, 'room', [0, 0, 0], [0, 4, 0]);
  for (let frame = 0; frame < 3; frame++) {
    const out = moveRegionProbe(world, state, 1, { maxCrossings: 0 });
    assert.equal(out.status, 'budget-exhausted');
    assert.equal(out.detail, 'crossings');
    assert.equal(out.crossings, 0);
    assert.ok(portal.signedHeight([...out.state.position]) > PORTAL_PLANE_TOLERANCE, `frame ${frame}`);
    state = nextFrame(out);
  }
  // Give it the budget it was short of, from the state it was left in.
  const allowed = moveRegionProbe(world, state, 1);
  assert.equal(allowed.state.regionId, 'rock');
  assert.equal(allowed.crossings, 1);
});

test('a grazing approach is certified on the entering side, in E3 and S3', () => {
  const flat = compileRegionWorld(plugScene(true));
  const flatPortal = flat.portals.find((p) => p.fromRegionId === 'room');
  // 0.02 of the speed into the plane, so the checkpoint sits one skin back
  // along a path almost parallel to the aperture -- 2e-6 of physical height.
  // A backward nudge along a guessed normal is what lands on the wrong side here.
  const grazed = moveRegionProbe(flat, stateAt(flat, 'room', [-2.5, 1.95, 0], [4, 0.08, 0]), 0.7);
  assert.equal(grazed.status, 'blocked-exit', grazed.detail ?? grazed.status);
  const flatHeight = flatPortal.signedHeight([...grazed.state.position]);
  assert.ok(flatHeight > PORTAL_PLANE_TOLERANCE, `E3 grazing height ${flatHeight}`);
  assert.ok(flatHeight < 1e-4, 'and genuinely grazing, not comfortably clear');

  // The same in S3, built FROM the aperture so the shallow walk lands near the
  // disc centre: back off along the plane's own normal, slide sideways, then
  // come in almost parallel.
  const curved = compileRegionWorld(scene('graze-sphere', [s3Region('curve', 2, 3), e3Region('rock')], [
    spawn('curve-start', 'curve'), spawn('rock-start', 'rock', [2, 0, 0]),
    anchor('curved-gate', 'curve', [0, 1.2, 0], [0, -1, 0], 1.2),
    anchor('rock-gate', 'rock', [0, 0, 0], [0, 1, 0], 1.2),
    { id: 'plug', regionId: 'rock', kind: 'ball', position: [0, 0, 0], radius: 0.5 },
  ], [link('gate', 'curved-gate', 'rock-gate')]));
  const space = curved.regions.get('curve').space;
  const portal = curved.portals.find((p) => p.fromRegionId === 'curve');
  const centre = space.decode([0, 1.2, 0]);
  const back = space.stepWithTransport(centre, portal.normal, 0.05);
  const normalThere = back.carry(portal.normal);
  const lateral = space.normalize(back.position,
    space.project(back.position, space.frame(back.position)[0], normalThere));
  const over = space.stepWithTransport(back.position, lateral, -0.25);
  const from = over.position;
  const heading = space.normalize(from,
    over.carry(lateral).map((x, i) => x - 0.1 * over.carry(normalThere)[i]));

  const out = moveRegionProbe(curved, stateAt(curved, 'curve', from, scale(heading, 2)), 0.5);
  assert.equal(out.status, 'blocked-exit', out.detail ?? out.status);
  const height = portal.signedHeight([...out.state.position]);
  assert.ok(height > PORTAL_PLANE_TOLERANCE, `S3 grazing height ${height}`);
  assert.ok(height < 1e-4, 'and genuinely grazing');
  space.validatePoint([...out.state.position]);
  assert.equal(out.state.camera.space, space);
});

// ------------------------------------------------------------------ budgets

test('a crossing budget of zero stops at the aperture with a valid state', () => {
  const world = compileRegionWorld(pairScene());
  const out = moveRegionProbe(world, stateAt(world, 'flat', [0, 0, 0], [0, 4, 0]), 1, { maxCrossings: 0 });
  assert.equal(out.status, 'budget-exhausted');
  assert.equal(out.detail, 'crossings');
  assert.equal(out.state.regionId, 'flat');
  assert.equal(out.crossings, 0);
  assert.ok(out.timeRemaining > 0);
  world.regions.get('flat').space.validatePoint([...out.state.position]);
});

test('a starved step budget leaves the probe short, valid, and honest about time', () => {
  const world = compileRegionWorld(wallScene(1));
  const dt = 4;
  const out = moveRegionProbe(world, stateAt(world, 'room', [0, 0, 0], [3, 4, 0]), dt, { maxSteps: 6 });
  assert.equal(out.status, 'budget-exhausted');
  // EXACT. Lift and settle are work and come out of the same allowance; giving
  // each of them its own fixed budget is how a cap of six becomes thirty.
  assert.ok(out.steps <= 6, `steps ${out.steps}`);
  assert.ok(out.timeRemaining > 0);
  near(out.timeConsumed + out.timeRemaining, dt, 1e-12);
  const space = world.regions.get('room').space;
  space.validateTangent([...out.state.position], [...out.state.velocity]);
  // Short of where it wanted to be, never past the wall.
  assert.ok([...out.state.position][0] <= 1 - UNITS.playerRadius + 1e-6);
});

test('zero contacts buys zero contact responses, and says what it met', () => {
  const world = compileRegionWorld(wallScene(1));
  const out = moveRegionProbe(world, stateAt(world, 'room', [0, 0, 0], [3, 4, 0]), 0.5, { maxContacts: 0 });
  assert.equal(out.status, 'budget-exhausted');
  assert.equal(out.detail, 'contacts');
  // A cap of zero responses buys zero responses. The surface was still MET, and
  // saying so is a diagnostic, not a response: no slide, no lift, no settle.
  assert.equal(out.contacts, 0);
  assert.equal(out.contactSamples.length, 0);
  assert.ok(out.limitingContact, 'the limiting contact is reported apart from the response list');
  assert.equal(out.limitingContact.regionId, 'room');
  vectorNear([...out.limitingContact.normal], [-1, 0, 0], 1e-12);
  near([...out.state.position][0], 1 - UNITS.playerRadius, 2e-3);
  assert.ok(out.timeRemaining > 0);
  near(out.timeConsumed + out.timeRemaining, 0.5, 1e-12);
});

test('each contact budget buys exactly that many responses', () => {
  // A corner: two walls, so a probe driven into it meets one surface, slides,
  // and meets the second. The cap decides how many of those it may answer.
  const corner = scene('corner-room', [e3Region('room', 8)], [
    spawn('room-start', 'room', [0, 0, 0]),
    { id: 'east', regionId: 'room', kind: 'plane', position: [1.2, 0, 0], up: [-1, 0, 0] },
    { id: 'north', regionId: 'room', kind: 'plane', position: [0, 1.2, 0], up: [0, -1, 0] },
  ]);
  const world = compileRegionWorld(corner);
  for (const cap of [0, 1, 2]) {
    const out = moveRegionProbe(world, stateAt(world, 'room', [0, 0, 0], [3, 4, 0]), 0.6, { maxContacts: cap });
    assert.ok(out.contacts <= cap, `cap ${cap} answered ${out.contacts}`);
    assert.equal(out.contactSamples.length, out.contacts);
    if (out.detail === 'contacts') assert.ok(out.limitingContact, `cap ${cap} met a surface it could not answer`);
  }
});

test('the step cap is exact, and an unpayable settle is reported not borrowed', () => {
  const world = compileRegionWorld(wallScene(1));
  for (const cap of [4, 8, 12, 16, 24]) {
    const out = moveRegionProbe(world, stateAt(world, 'room', [0, 0, 0], [3, 4, 0]), 4, { maxSteps: cap });
    assert.equal(out.status, 'budget-exhausted');
    // EXACT, not "about". Corrections draw on this allowance like everything
    // else; a settle handed its own fresh sixteen is how a cap of twelve turns
    // into twenty-eight and nobody notices until a frame takes too long.
    assert.ok(out.steps <= cap, `cap ${cap} spent ${out.steps}`);
    near(out.timeConsumed + out.timeRemaining, 4, 1e-12);
    world.regions.get('room').space.validateTangent([...out.state.position], [...out.state.velocity]);
    if (cap >= 12) {
      // The probe was lifted off the wall and ran out of budget before it could
      // settle back. The debt is REPORTED; it is not paid with steps that do
      // not exist.
      assert.ok(out.pendingLift, `cap ${cap} owes a settle it could not pay`);
      assert.equal(out.pendingLift.regionId, 'room');
    }
  }
});

test('a very large dt still leaves a valid state and a truthful clock', () => {
  const world = compileRegionWorld(pairScene(2, 3));
  const dt = 1e6;
  const out = moveRegionProbe(world, stateAt(world, 'flat', [0, 0, 0], [0, 4, 0]), dt);
  assert.ok(['domain-exit', 'budget-exhausted'].includes(out.status), out.status);
  near(out.timeConsumed + out.timeRemaining, dt, 1e-6);
  assert.ok(out.timeRemaining > 0);
  const space = world.regions.get(out.state.regionId).space;
  space.validatePoint([...out.state.position]);
  space.validateTangent([...out.state.position], [...out.state.velocity]);
  assert.equal(out.state.camera.space, space);
});

console.log(`${passed}/${passed + failed} region motion checks passed`);
process.exitCode = failed ? 1 : 0;
