// An authored room on a sphere, compiled and walked.
//
// This is plan item 3's acceptance in miniature: a scene document, in a curved
// region, that produces a field the collision solver can walk through a
// doorway in. Nothing here is a second run of the implementation -- the
// expectations are great-circle closed forms, and the strongest of them is the
// FLAT LIMIT: the same authored room at a huge curvature radius must agree
// with plain Euclidean arithmetic, because a sphere of radius 10000 is a plane
// as far as a 6-unit room can tell. A spherical construction that is subtly
// wrong fails that limit and cannot be argued out of it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileRegionWorld, constructionAxes } from './engine/world/region-world.js';
import { sweep, clearance, resolveOverlap } from './engine/world/collision.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

const source = JSON.parse(readFileSync(new URL('./levels/fixtures/s3-room.nil.json', import.meta.url), 'utf8'));
const world = compileRegionWorld(source);
const region = world.regions.get('sphere');
const { space, field } = region;
const RADIUS = source.units.playerRadius;
const at = (x, y, z) => space.decode([x, y, z]);
const aim = (p, q) => space.normalize(p, space.logAt(p, q));
const authored = (p) => space.encode(p);

// --- the room compiles and says what it is --------------------------------

test('a spherical room compiles, and admits it is a bound', () => {
  assert.equal(space.kind, 's3');
  assert.equal(space.curvatureRadius, 8);
  // A geodesic-cell is an intersection of half-spaces, and `max` under-reports
  // near a seam exactly as it does in E3. Claiming otherwise here would be the
  // same mistake the union once made.
  assert.equal(field.capabilities.exteriorDistance, 'bound');
  assert.equal(field.capabilities.intersection, 'bounded-march');
  // The spawn has room, checked through the same field the walker uses.
  assert.ok(clearance(field, region.spawnPosition, RADIUS) > 0, 'spawn has room');
});

test('THE BALL IS EXACT, measured along a great circle', () => {
  // A metric ball is the one primitive with a closed form here, and its
  // surface is where the great-circle distance equals its radius -- not where
  // some chord does.
  const centre = at(-1.5, 0, 0.75), rho = 0.65;
  const away = aim(centre, at(2, 0, 0.75));
  for (const travel of [0, 0.3, rho, 1.0]) {
    const p = space.step(centre, away, travel);
    near(field.distance(p), travel - rho, 1e-9, `distance at arclength ${travel}`);
  }
  // And the surface point really is one radius from the centre by the metric.
  near(space.distance(space.step(centre, away, rho), centre), rho, 1e-12, 'surface radius');
});

test('a geodesic cell has its faces where they were authored', () => {
  // The back wall is 0.2 either side of y = 4. Its faces are great spheres, so
  // "0.2 away" is 0.2 of ARCLENGTH, and a construction that used chords or
  // forgot the curvature radius lands somewhere else.
  //
  // Measured along the cell's OWN construction axis, which is the only
  // direction the half-extent is expressed in. A straight line in authored
  // coordinates is a geodesic only through the chart origin -- the chart is
  // normal coordinates AT the origin, and elsewhere "toward a point with a
  // bigger y" curves. Getting that wrong is what made the first version of
  // this check read 0.04 instead of 0.
  const centre = at(0, 4, 1.5);
  const along = constructionAxes(space, centre)[1];
  near(field.distance(space.step(centre, along, 0.2)), 0, 2e-9, 'the far face reads zero');
  near(field.distance(space.step(centre, along, -0.2)), 0, 2e-9, 'and so does the near one');
  assert.ok(field.distance(space.step(centre, along, 0.1)) < 0, 'inside the wall');
  assert.ok(field.distance(space.step(centre, along, 0.4)) > 0, 'past it');
  // The half-extent is an ARCLENGTH: the face really is 0.2 of great-circle
  // distance from the centre, which a chord construction would get wrong by
  // more than the tolerance above at this curvature.
  near(space.distance(space.step(centre, along, 0.2), centre), 0.2, 1e-12, 'face arclength');
});

// --- the flat limit, which is the strongest check available ----------------

test('AT A HUGE CURVATURE RADIUS THE ROOM IS EUCLIDEAN', () => {
  // Same document, sphere of radius 10000. Over a room 6 units across the
  // curvature is undetectable, so every distance must agree with flat
  // arithmetic. This catches a missing or inverted curvature radius, a chord
  // used where an arc belongs, and a face built at the wrong angle -- none of
  // which the fixture's own numbers would reveal on their own.
  const flatDoc = structuredClone(source);
  flatDoc.regions[0].geometry.curvatureRadius = 10000;
  flatDoc.regions[0].extent = 8;
  const flat = compileRegionWorld(flatDoc).regions.get('sphere');
  const probes = [
    [0, -3, 0.9], [0, 0, 0.9], [0, 1.5, 0.9], [0, 3, 0.9],
    [2, 0, 0.5], [-1.5, 0, 0.75], [-1.5, 0, 1.6], [2.9, 0, 1.0],
  ];
  let worst = 0, at = null;
  for (const q of probes) {
    const here = flat.field.distance(flat.space.decode(q));
    // The Euclidean answer, computed by hand from the same authored numbers.
    const box = (c, h) => {
      const d = [0, 1, 2].map((i) => Math.abs(q[i] - c[i]) - h[i]);
      return Math.hypot(...d.map((x) => Math.max(x, 0))) + Math.min(Math.max(...d), 0);
    };
    const wall = Math.max(box([0, 1.5, 1.5], [3, 0.3, 1.5]), -box([0, 1.5, 1], [0.85, 1.2, 1.3]));
    const truth = Math.min(
      q[2],                                              // the floor plane
      wall,
      box([-3.4, 0, 1.5], [0.2, 3.6, 1.5]), box([3.4, 0, 1.5], [0.2, 3.6, 1.5]),
      box([0, 4, 1.5], [3.4, 0.2, 1.5]),
      Math.hypot(q[0] + 1.5, q[1], q[2] - 0.75) - 0.65,  // the ball
    );
    const gap = Math.abs(here - truth);
    if (gap > worst) { worst = gap; at = q; }
  }
  assert.ok(worst < 2e-3, `flat limit differs by ${worst} at ${JSON.stringify(at)}`);
  console.log(`  flat limit (R=10000): worst |difference| ${worst.toExponential(2)}`);
});

// --- the bound is conservative, which is the safety property ---------------

test('the cell distance NEVER OVERESTIMATES', () => {
  // The whole solver rests on this. A bound that overestimates lets a step
  // jump through a wall, and `max` over half-spaces is exactly the kind of
  // construction where that is easy to get wrong.
  const dirs = [];
  for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) {
    dirs.push([a * Math.PI / 3, (b + 0.5) * Math.PI / 6]);
  }
  let checked = 0;
  for (const q of [[0, 0, 0.9], [0, 1.0, 0.9], [1.5, 1.2, 1.2], [-2, 2, 0.6], [0, 2.6, 1.4]]) {
    const p = at(...q);
    const d = field.distance(p);
    if (d <= 1e-6) continue;
    const basis = space.frame(p);
    for (const [th, ph] of dirs) {
      const v = [0, 1, 2].map((i) => basis[i]).reduce((acc, axis, i) => {
        const w = [Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th), Math.cos(ph)][i];
        return acc.map((x, k) => x + axis[k] * w);
      }, [0, 0, 0, 0]);
      const u = space.normalize(p, v);
      const q2 = space.step(p, u, d * 0.999);
      assert.ok(field.distance(q2) > -1e-6,
        `overestimate at ${JSON.stringify(q)}: claims ${d}, but stepping ${d * 0.999} lands inside`);
      checked++;
    }
  }
  assert.ok(checked > 100, `only ${checked} probes`);
});

// --- and the part that makes it a room -------------------------------------

test('WALK THROUGH THE SPHERICAL DOORWAY, AND NOT THROUGH THE WALL', () => {
  // The discriminating pair, and the reason this fixture exists. Both rays
  // start outside and travel the same arclength; one finds an opening and one
  // does not.
  const start = at(0, -3, 0.9);
  const through = sweep(field, space, {
    from: start, direction: aim(start, at(0, 4, 0.9)), distance: 9, radius: RADIUS, maxSteps: 2048,
  });
  assert.equal(through.hit, true, 'it stops eventually, at the far wall');
  assert.ok(authored(through.position)[1] > 3.4,
    `expected to pass the doorway and reach the back wall, stopped at `
    + `y=${authored(through.position)[1].toFixed(3)}`);

  const blocked = at(2, -3, 0.9);
  const into = sweep(field, space, {
    from: blocked, direction: aim(blocked, at(2, 4, 0.9)), distance: 9, radius: RADIUS, maxSteps: 2048,
  });
  assert.equal(into.hit, true);
  assert.ok(authored(into.position)[1] < 1.2,
    `the wall must stop it before y=1.2, got ${authored(into.position)[1].toFixed(3)}`);
  assert.ok(clearance(field, into.position, RADIUS) >= -1e-3, 'and never inside it');
});

test('a probe pushed into a spherical wall comes back out', () => {
  const inside = at(2, 1.5, 0.9);                 // squarely within the wall
  assert.ok(clearance(field, inside, RADIUS) < 0, 'precondition: overlapping');
  const out = resolveOverlap(field, space, inside, RADIUS);
  assert.equal(out.status, 'pushed');
  assert.ok(clearance(field, out.position, RADIUS) >= 0, 'ends with room');
  space.validatePoint(out.position);
});

test('THE FLOOR NORMAL IS A DIFFERENT VECTOR AT EVERY POINT', () => {
  // On a sphere "up" is not a constant, and a room that treated it as one
  // would be subtly wrong everywhere except at its origin. `region.up` is a
  // function of position for exactly this reason.
  const a = region.up(at(0, 0, 0.5)), b = region.up(at(3, 3, 0.5));
  assert.ok(a && b, 'the floor supplies an up at both places');
  const apart = Math.hypot(...a.map((x, i) => x - b[i]));
  assert.ok(apart > 1e-3, `up must vary across the room, differs by ${apart}`);
  // And it is a unit tangent where it is evaluated, not a leftover from
  // somewhere else.
  for (const [p, n] of [[at(0, 0, 0.5), a], [at(3, 3, 0.5), b]]) {
    space.validateTangent(p, n);
    near(space.norm(p, n), 1, 1e-12, 'up is a unit tangent');
  }
});

console.log(`\ns3 room: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
