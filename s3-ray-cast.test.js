// Where a ray first enters solid in a spherical region -- checked against
// distances worked out from the authored geometry, not from the code.
//
// THE REFERENCE IS THE NORMAL CHART. For a region whose chart origin is O with
// orthonormal lifted axes e1,e2,e3, the point `decode([0,0,z])` is
// cos(z/R)O + sin(z/R)e3, and a plane authored at the origin with up [0,0,1]
// has pole e3. Its signed height there is R*asin(sin(z/R)) = z EXACTLY. The
// same cancellation gives a geodesic cell centred at the origin a face at
// exactly its half-extent, and a ball centred d along an axis an entry at
// exactly d - radius. So every expected distance below is an authored number,
// and none of them came out of `castSphericalRegion`.
//
// Every ray in this file leaves the chart origin along a chart axis, because
// that is the only family for which those identities hold: normal coordinates
// are exact along a geodesic through the origin and not off it.
import assert from 'node:assert/strict';
import { compileRegionWorld } from './engine/world/region-world.js';
import { castSphericalRegion, S3_CAST_DEFAULTS } from './engine/world/s3-ray-cast.js';
import { sphericalBoundaryEvents } from './engine/geometry/s3-ray-events.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`);

const RADII = [0.5, 8, 100];
const UNITS = { name: 'design-unit', playerRadius: 0.01 };
// The spawn is parked well away from every solid these scenes author. It plays
// no part in any cast -- the document simply requires one, and requires it not
// to be buried.
const scene = (id, R, extent, entities) => ({
  format: 'nil-scene', version: 2, id, units: UNITS,
  regions: [{ id: 'orb', geometry: { kind: 's3', curvatureRadius: R }, topology: 'cover', extent }],
  entities: [{ id: 'start', regionId: 'orb', kind: 'spawn',
    position: [0.5 * extent, -0.5 * extent, 0.3 * extent] }, ...entities],
  connections: [],
});
/**
 * How far a cast may look here, and why it is not `pi*R`.
 *
 * Every face of a geodesic cell is a great sphere, and the ones perpendicular
 * to the ray all vanish together a quarter turn from the cell -- six roots
 * piled on one another, which the coincidence policy refuses, correctly. That
 * refusal is real and is checked on its own; it is not what these routes are
 * about, so they look a chart's width and stop.
 */
const span = (extent) => 0.95 * extent;
const cell = (id, position, halfExtent, extra = {}) =>
  ({ id, regionId: 'orb', kind: 'geodesic-cell', position, halfExtent, ...extra });

/** A region, its chart origin, and the three axis directions at that origin. */
function orb(document) {
  const world = compileRegionWorld(document);
  const region = world.regions.get('orb'), space = region.space;
  const origin = space.decode([0, 0, 0]);
  const axes = space.frame(origin);
  return { world, region, space, origin, axes };
}
/** The identity every expected distance in this file rests on, asserted once. */
function pinChart(space, origin, axes, along, distance) {
  const chart = [0, 0, 0]; chart[along] = distance;
  const walked = space.step(origin, axes[along], distance);
  const decoded = space.decode(chart);
  assert.ok(space.distance(walked, decoded) < 1e-12,
    'normal coordinates must agree with the geodesic along a chart axis');
  return walked;
}

test('THE CHART IDENTITY the rest of this file depends on', () => {
  for (const R of RADII) {
    const { space, origin, axes } = orb(scene('pin', R, 0.6 * Math.PI * R / 2, []));
    for (const along of [0, 1, 2]) pinChart(space, origin, axes, along, 0.3 * R);
  }
});

test('a ball straight ahead is entered at exactly centre distance minus radius', () => {
  for (const R of RADII) {
    const extent = 0.8 * Math.PI * R / 2, d = 0.40 * extent, radius = 0.15 * extent;
    const { region, space, origin, axes } = orb(scene('ball', R, extent, [
      { id: 'orb-ball', regionId: 'orb', kind: 'ball', position: [0, d, 0], radius },
    ]));
    pinChart(space, origin, axes, 1, d);
    const out = castSphericalRegion(region, origin, axes[1], { maxDistance: span(extent) });
    assert.equal(out.status, 'hit', `R=${R}`);
    assert.equal(out.contact, 'surface');
    near(out.distance, d - radius, 1e-9 * Math.max(1, R));
    assert.equal(out.surfaceOwner, 'orb-ball');
    assert.equal(out.additiveOwner, 'orb-ball');
    assert.equal(out.face, null, 'a ball has one surface and no face index');
    // An ENTRY normal opposes the direction of travel. This is a property of
    // entering solid, independent of any particular primitive's convention.
    assert.ok(space.dot([...out.point], [...out.normal], [...out.tangent]) < 0);
  }
});

test('an authored floor is entered at exactly the height it was authored below', () => {
  for (const R of RADII) {
    const extent = 0.8 * Math.PI * R / 2, height = 0.35 * extent;
    const { region, space, origin, axes } = orb(scene('floor', R, extent, [
      { id: 'ground', regionId: 'orb', kind: 'plane', position: [0, 0, 0], up: [0, 0, 1] },
    ]));
    const above = pinChart(space, origin, axes, 2, height);
    // Straight down the chart axis, back toward the origin the plane runs through.
    const down = space.normalize(above, space.logAt(above, origin));
    const out = castSphericalRegion(region, above, down, { maxDistance: span(extent) });
    assert.equal(out.status, 'hit', `R=${R}`);
    near(out.distance, height, 1e-9 * Math.max(1, R));
    assert.equal(out.surfaceOwner, 'ground');
    assert.equal(out.face, 0);
    assert.ok(space.dot([...out.point], [...out.normal], [...out.tangent]) < 0);
  }
});

test('a geodesic cell is entered at exactly its half extent', () => {
  for (const R of RADII) {
    const extent = 0.8 * Math.PI * R / 2, half = 0.12 * extent, start = 0.5 * extent;
    const { region, space, origin, axes } = orb(scene('cellroute', R, extent, [
      cell('box', [0, 0, 0], [half, half, half]),
    ]));
    const above = pinChart(space, origin, axes, 2, start);
    const down = space.normalize(above, space.logAt(above, origin));
    const out = castSphericalRegion(region, above, down, { maxDistance: span(extent) });
    assert.equal(out.status, 'hit', `R=${R}`);
    near(out.distance, start - half, 1e-9 * Math.max(1, R));
    assert.equal(out.surfaceOwner, 'box');
    assert.ok(Number.isInteger(out.face) && out.face >= 0 && out.face < 6);
    assert.ok(space.dot([...out.point], [...out.normal], [...out.tangent]) < 0);
  }
});

test('AN INACTIVE FACE ROOT IS NOT A HIT, and the roots really were there', () => {
  // A cell's faces are great spheres: they carry on all the way round, so a ray
  // that never goes near the cell still crosses some of them. Calling each
  // crossing a hit is exactly what the event layer warns a downstream consumer
  // not to do.
  for (const R of RADII) {
    const extent = 0.8 * Math.PI * R / 2, half = 0.08 * extent;
    const offset = 0.45 * extent, ahead = 0.45 * extent;
    const { region, space, origin, axes } = orb(scene('inactive', R, extent, [
      cell('aside', [offset, ahead, 0], [half, half, half]),
    ]));
    const out = castSphericalRegion(region, origin, axes[1], { maxDistance: span(extent) });
    assert.equal(out.status, 'miss', `R=${R}: ${out.reason} ${out.detail}`);
    assert.ok(out.events > 0, `the check is vacuous unless face roots existed (R=${R})`);
  }
});

test('a passage cut through a wall lets the ray through; moving it aside does not', () => {
  for (const R of RADII) {
    const extent = 0.8 * Math.PI * R / 2;
    const wall = 0.45 * extent, wy = 0.06 * extent, wx = 0.30 * extent, wz = 0.30 * extent;
    const dx = 0.12 * extent, dz = 0.12 * extent, dy = 2 * wy;
    const through = orb(scene('passage', R, extent, [
      cell('wall', [0, wall, 0], [wx, wy, wz]),
      cell('door', [0, wall, 0], [dx, dy, dz], { op: 'subtract', target: 'wall' }),
    ]));
    const open = castSphericalRegion(through.region, through.origin, through.axes[1],
      { maxDistance: span(extent) });
    assert.equal(open.status, 'miss', `R=${R} through the doorway: ${open.reason} ${open.detail}`);
    assert.ok(open.events > 0, 'the wall and the door must both have produced roots');

    // The same wall with the doorway moved off the ray: now it is a wall.
    const shifted = orb(scene('passage2', R, extent, [
      cell('wall', [0, wall, 0], [wx, wy, wz]),
      cell('door', [2 * dx, wall, 0], [dx, dy, dz], { op: 'subtract', target: 'wall' }),
    ]));
    const blocked = castSphericalRegion(shifted.region, shifted.origin, shifted.axes[1],
      { maxDistance: span(extent) });
    assert.equal(blocked.status, 'hit', `R=${R} beside the doorway`);
    near(blocked.distance, wall - wy, 1e-9 * Math.max(1, R));
    assert.equal(blocked.surfaceOwner, 'wall');
    assert.equal(blocked.additiveOwner, 'wall');
  }
});

test('A SUBTRACTION BOUNDARY IS A SURFACE YOU ENTER SOLID THROUGH, with a reversed normal', () => {
  // The carve straddles the wall's near face, so the ray reaches the wall
  // already inside the carve and becomes solid only where it LEAVES the carve.
  // The surface belongs to the cutter; the solid is on the far side of it from
  // the cutter's own outside, which is why the normal is negated.
  for (const R of RADII) {
    const extent = 0.8 * Math.PI * R / 2;
    const wall = 0.45 * extent, wy = 0.08 * extent, wxz = 0.30 * extent;
    const cut = 0.03 * extent;
    const { region, space, origin, axes } = orb(scene('carveface', R, extent, [
      cell('wall', [0, wall, 0], [wxz, wy, wxz]),
      cell('bite', [0, wall - wy, 0], [0.5 * wxz, cut, 0.5 * wxz], { op: 'subtract', target: 'wall' }),
    ]));
    const out = castSphericalRegion(region, origin, axes[1], { maxDistance: span(extent) });
    assert.equal(out.status, 'hit', `R=${R}: ${out.reason} ${out.detail}`);
    near(out.distance, wall - wy + cut, 1e-9 * Math.max(1, R));
    assert.equal(out.surfaceOwner, 'bite', 'the surface belongs to the cutter');
    assert.equal(out.additiveOwner, 'wall', 'the solid belongs to the wall');
    // The load-bearing assertion: with the reversal dropped this flips sign.
    assert.ok(space.dot([...out.point], [...out.normal], [...out.tangent]) < 0,
      'a reversed cutter normal must still oppose the direction of travel');
  }
});

test('a THIN cut is not stepped over', () => {
  // The same shape, with the bite four thousand times thinner than the wall. A
  // marcher with any epsilon advance lands past it and reports the wall's own
  // face; there is no epsilon advance here, so the answer moves by the width of
  // the cut and by exactly that.
  for (const R of RADII) {
    const extent = 0.8 * Math.PI * R / 2;
    const wall = 0.45 * extent, wy = 0.08 * extent, wxz = 0.30 * extent;
    const cut = 2e-4 * extent;
    const { region, origin, axes } = orb(scene('thincut', R, extent, [
      cell('wall', [0, wall, 0], [wxz, wy, wxz]),
      cell('bite', [0, wall - wy, 0], [0.5 * wxz, cut, 0.5 * wxz], { op: 'subtract', target: 'wall' }),
    ]));
    const out = castSphericalRegion(region, origin, axes[1], { maxDistance: span(extent) });
    assert.equal(out.status, 'hit', `R=${R}: ${out.reason} ${out.detail}`);
    near(out.distance, wall - wy + cut, 1e-9 * Math.max(1, R));
    assert.notEqual(out.distance, wall - wy);
    assert.equal(out.surfaceOwner, 'bite');
  }
});

test('a global cutter bites every group; a scoped one bites exactly its target', () => {
  const R = 8, extent = 0.8 * Math.PI * R / 2;
  const wall = 0.30 * extent, wy = 0.04 * extent, wxz = 0.18 * extent, dy = 2 * wy;
  const both = [
    cell('near-wall', [0, wall, 0], [wxz, wy, wxz]),
    cell('far-wall', [0, wall + 4 * wy, 0], [wxz, wy, wxz]),
  ];
  const hole = (extra) => cell('hole', [0, wall + 2 * wy, 0], [0.4 * wxz, 3 * wy + dy, 0.4 * wxz],
    { op: 'subtract', ...extra });

  // Global: no target, so it is in EVERY group's modifier list and both walls
  // are opened.
  const global = orb(scene('globalcut', R, extent, [...both, hole({})]));
  const open = castSphericalRegion(global.region, global.origin, global.axes[1],
    { maxDistance: span(extent) });
  assert.equal(open.status, 'miss', `global cut should open both: ${open.reason} ${open.detail}`);

  // Scoped to the near wall: the far one is untouched and stops the ray.
  const scoped = orb(scene('scopedcut', R, extent, [...both, hole({ target: 'near-wall' })]));
  const stopped = castSphericalRegion(scoped.region, scoped.origin, scoped.axes[1],
    { maxDistance: span(extent) });
  assert.equal(stopped.status, 'hit', `${stopped.reason} ${stopped.detail}`);
  assert.equal(stopped.additiveOwner, 'far-wall', 'only the targeted wall was opened');
  near(stopped.distance, wall + 4 * wy - wy, 1e-9 * R);
});

test('an intersect narrows its group rather than adding to the scene', () => {
  const R = 8, extent = 0.8 * Math.PI * R / 2;
  const wall = 0.45 * extent, wy = 0.06 * extent, wxz = 0.25 * extent;
  // The clip covers only the far half of the slab, so the near face stops
  // being solid and the first solid is where the clip begins.
  const clipped = orb(scene('clipscene', R, extent, [
    cell('slab', [0, wall, 0], [wxz, wy, wxz]),
    cell('clip', [0, wall + wy, 0], [wxz, wy, wxz], { op: 'intersect', target: 'slab' }),
  ]));
  const out = castSphericalRegion(clipped.region, clipped.origin, clipped.axes[1],
    { maxDistance: span(extent) });
  assert.equal(out.status, 'hit', `${out.reason} ${out.detail}`);
  near(out.distance, wall, 1e-9 * R);
  assert.equal(out.additiveOwner, 'slab');
  assert.equal(out.surfaceOwner, 'clip', 'the clip contributes the surface that is entered');
});

test('an origin inside solid is a hit at zero with NO normal', () => {
  for (const R of RADII) {
    const extent = 0.8 * Math.PI * R / 2, half = 0.2 * extent;
    const { region, origin, axes } = orb(scene('insideorigin', R, extent, [
      cell('around', [0, 0, 0], [half, half, half]),
    ]));
    const out = castSphericalRegion(region, origin, axes[1], { maxDistance: 0.5 * Math.PI * R });
    assert.equal(out.status, 'hit');
    assert.equal(out.contact, 'inside');
    assert.equal(out.distance, 0);
    assert.equal(out.normal, null, 'an occupancy convention has no surface to point away from');
    assert.equal(out.surfaceOwner, null);
    assert.equal(out.additiveOwner, 'around');
    assert.equal(out.events, 0, 'nothing is solved once the origin is known to be solid');
  }
});

test('an empty region is a certified miss, and says what it spent', () => {
  const { region, origin, axes } = orb(scene('empty', 8, 10, []));
  const out = castSphericalRegion(region, origin, axes[1], { maxDistance: 5 });
  assert.equal(out.status, 'miss');
  assert.equal(out.events, 0);
  assert.equal(out.work, 0, 'no primitives, no surfaces, no work');
  assert.equal(out.distance, null);
  assert.ok(Object.isFrozen(out));
});

test('coincident surfaces are refused, not ordered by primitive id', () => {
  const R = 8, extent = 0.8 * Math.PI * R / 2;
  // Two planes authored identically: their poles are the same great sphere, so
  // their roots land on top of each other. Picking one would be inventing an
  // order the geometry never gave.
  const { region, space, origin, axes } = orb(scene('coincident', R, extent, [
    { id: 'floor-a', regionId: 'orb', kind: 'plane', position: [0, 0, 0], up: [0, 0, 1] },
    { id: 'floor-b', regionId: 'orb', kind: 'plane', position: [0, 0, 0], up: [0, 0, 1] },
  ]));
  const above = pinChart(space, origin, axes, 2, 0.35 * extent);
  const down = space.normalize(above, space.logAt(above, origin));
  const out = castSphericalRegion(region, above, down, { maxDistance: span(extent) });
  assert.equal(out.status, 'unresolved');
  assert.equal(out.reason, 'coincident-events');
  assert.ok(/floor-a|floor-b/.test(out.detail));
});

test('a root at the end of the range is refused, not rounded in or out', () => {
  const R = 8, extent = 0.8 * Math.PI * R / 2, height = 0.35 * extent;
  const { region, space, origin, axes } = orb(scene('endpoint', R, extent, [
    { id: 'ground', regionId: 'orb', kind: 'plane', position: [0, 0, 0], up: [0, 0, 1] },
  ]));
  const above = pinChart(space, origin, axes, 2, height);
  const down = space.normalize(above, space.logAt(above, origin));
  // Exactly at the crossing: the event layer will not place a root on the
  // boundary of the range it was given.
  const out = castSphericalRegion(region, above, down, { maxDistance: height });
  assert.equal(out.status, 'unresolved');
  assert.equal(out.reason, 'primitive-events');
  assert.ok(/range-boundary/.test(out.detail));
  // Comfortably short of it is an honest miss; comfortably past it is a hit.
  assert.equal(castSphericalRegion(region, above, down, { maxDistance: 0.5 * height }).status, 'miss');
  assert.equal(castSphericalRegion(region, above, down, { maxDistance: 1.5 * height }).status, 'hit');
});

test('A RAY THAT BEGINS ON A BOUNDARY IS REFUSED, not classified to one side', () => {
  // The chart origin lies exactly on a floor authored through it: the atomic
  // margin is 0, which is neither inside nor outside at this precision. Reading
  // the sign of an exact zero would put the ray on whichever side the
  // comparison happened to pick.
  for (const R of RADII) {
    const extent = 0.8 * Math.PI * R / 2;
    const { region, origin, axes } = orb(scene('onplane', R, extent, [
      { id: 'ground', regionId: 'orb', kind: 'plane', position: [0, 0, 0], up: [0, 0, 1] },
    ]));
    const out = castSphericalRegion(region, origin, axes[1], { maxDistance: span(extent) });
    assert.equal(out.status, 'unresolved', `R=${R}`);
    assert.equal(out.reason, 'ambiguous-origin');
    assert.equal(out.events, 0, 'refused before a single root was solved');
  }
});

test('and the event layer refuses that same surface, which is why mid-walk ambiguity is unreachable', () => {
  // THE COUPLING THIS FILE CANNOT OTHERWISE SHOW. `castSphericalRegion` also
  // refuses when occupancy becomes undecidable PART WAY along a walk. I could
  // not construct that: a surface is undecidable at a point exactly when that
  // point is a root of its own equation, and the event layer refuses a root at
  // the start of the range. So origin ambiguity is caught before any walk
  // begins, and a surface that is decidable at the origin only ever changes at
  // an event, which sets it to a definite value.
  //
  // That argument rests entirely on the refusal below. If the event layer ever
  // stops refusing here, this test breaks and points at a branch in
  // `s3-ray-cast.js` that is currently unreachable rather than wrong.
  const R = 8, extent = 0.8 * Math.PI * R / 2;
  const { region, origin, axes } = orb(scene('coupling', R, extent, [
    { id: 'ground', regionId: 'orb', kind: 'plane', position: [0, 0, 0], up: [0, 0, 1] },
  ]));
  const ground = region.field.primitives.find(p => p.entity.id === 'ground');
  const space = region.space;
  // Both families of direction from a point ON the surface, and both refuse:
  // one lies IN the plane and never crosses it, the other crosses it here.
  const along = axes[1];
  const across = space.normalize(origin, axes[1].map((x, i) => x + axes[2][i]));
  const tangential = sphericalBoundaryEvents(space, ground, origin, along, { maxDistance: span(extent) });
  assert.equal(tangential.status, 'unresolved');
  assert.equal(tangential.reason, 'coincident-or-ill-conditioned');
  const crossing = sphericalBoundaryEvents(space, ground, origin, across, { maxDistance: span(extent) });
  assert.equal(crossing.status, 'unresolved');
  assert.equal(crossing.reason, 'range-boundary');
  // And the cast refuses on the origin itself, before either is reached.
  for (const direction of [along, across]) {
    const out = castSphericalRegion(region, origin, direction, { maxDistance: span(extent) });
    assert.equal(out.status, 'unresolved');
    assert.equal(out.reason, 'ambiguous-origin');
  }
});

test('budgets are validated before they are spent, and refused when short', () => {
  const R = 8, extent = 0.8 * Math.PI * R / 2;
  const { region, origin, axes } = orb(scene('budgets', R, extent, [
    cell('box', [0, 0.45 * extent, 0], [0.2 * extent, 0.06 * extent, 0.2 * extent]),
  ]));
  const range = { maxDistance: span(extent) };
  const full = castSphericalRegion(region, origin, axes[1], range);
  assert.equal(full.status, 'hit');
  assert.ok(full.work > 0 && full.events > 0);

  // One cell is six atomic surfaces: six to classify and six to solve.
  const short = castSphericalRegion(region, origin, axes[1], { ...range, maxWork: 11 });
  assert.equal(short.status, 'unresolved');
  assert.equal(short.reason, 'work-budget');
  assert.ok(/12 work units/.test(short.detail), short.detail);
  assert.equal(short.work, 0, 'and nothing was spent finding that out');
  assert.equal(castSphericalRegion(region, origin, axes[1], { ...range, maxWork: 12 }).status,
    'unresolved', 'twelve pays for classify and solve but not for applying events');

  const noEvents = castSphericalRegion(region, origin, axes[1], { ...range, maxEvents: 0 });
  assert.equal(noEvents.status, 'unresolved');
  assert.equal(noEvents.reason, 'primitive-events');
  assert.ok(/event-budget/.test(noEvents.detail));
  assert.equal(S3_CAST_DEFAULTS.maxEvents, 512);
  assert.equal(S3_CAST_DEFAULTS.maxWork, 2048);
});

test('inputs and unsupported spans are refused before any geometry is touched', () => {
  const R = 8, extent = 0.8 * Math.PI * R / 2;
  const { region, world, origin, axes } = orb(scene('inputs', R, extent, [
    cell('box', [0, 0.4 * extent, 0], [0.1 * extent, 0.1 * extent, 0.1 * extent]),
  ]));
  const flat = compileRegionWorld({
    format: 'nil-scene', version: 2, id: 'flatroom', units: UNITS,
    regions: [{ id: 'room', geometry: { kind: 'e3', curvatureRadius: 1 }, topology: 'cover', extent: 6 }],
    entities: [{ id: 'start', regionId: 'room', kind: 'spawn', position: [0, 0, 0] }],
    connections: [],
  }).regions.get('room');
  assert.throws(() => castSphericalRegion(flat, [0, 0, 0], [0, 1, 0], { maxDistance: 1 }), /S3 region/);
  assert.throws(() => castSphericalRegion(null, origin, axes[1], { maxDistance: 1 }), /S3 region/);
  assert.throws(() => castSphericalRegion({ space: region.space }, origin, axes[1], { maxDistance: 1 }),
    /compiled region field/);
  for (const bad of [0, -1, NaN, Infinity, undefined, '3']) {
    assert.throws(() => castSphericalRegion(region, origin, axes[1], { maxDistance: bad }),
      /positive finite physical range/);
  }
  // A LONGER SPAN IS REFUSED, NOT SUBDIVIDED. Which parts of an over-long
  // sightline mean anything is a question about portals and chart exits, and
  // this query does not own either.
  assert.throws(() => castSphericalRegion(region, origin, axes[1],
    { maxDistance: Math.PI * R + 1e-9 }), /half-circle/);
  assert.throws(() => castSphericalRegion(region, origin, axes[1],
    { maxDistance: 1, maxEvents: 1.5 }), /maxEvents/);
  assert.throws(() => castSphericalRegion(region, origin, axes[1],
    { maxDistance: 1, maxWork: -1 }), /maxWork/);
  const scaled = axes[1].map(x => x * 2);
  assert.throws(() => castSphericalRegion(region, origin, scaled, { maxDistance: 1 }), /unit length/);
  assert.ok(world.regions.get('orb') === region);
});

test('the caller\'s state is never touched, and the result is frozen through', () => {
  const R = 8, extent = 0.8 * Math.PI * R / 2;
  const { region, origin, axes } = orb(scene('immutable', R, extent, [
    cell('box', [0, 0.4 * extent, 0], [0.1 * extent, 0.06 * extent, 0.1 * extent]),
  ]));
  const position = [...origin], direction = [...axes[1]];
  const before = [JSON.stringify(position), JSON.stringify(direction)];
  const out = castSphericalRegion(region, position, direction, { maxDistance: span(extent) });
  assert.deepEqual([JSON.stringify(position), JSON.stringify(direction)], before);
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.point) && Object.isFrozen(out.normal));
  assert.ok(Object.isFrozen(out.additiveOwners));
  // The hit point and tangent really are on the ray at that distance.
  assert.equal(out.status, 'hit', `${out.reason} ${out.detail}`);
  const walked = region.space.step(origin, axes[1], out.distance);
  assert.ok(region.space.distance(walked, [...out.point]) < 1e-9 * R);
});

console.log(`s3 ray cast: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
