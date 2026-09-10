// Booleans in the field: a doorway is a wall minus a box.
//
// Union is `min`, subtraction is `max` against the negated carving solid.
// Three things have to hold or the feature is worse than not having it: the
// hole must actually be a hole, the carved face's normal must point the right
// way, and the distance must stay a CONSERVATIVE bound so sphere tracing
// cannot step through a surface. The last one is the safety property and it
// gets a test of its own rather than an argument in a comment.
import assert from 'node:assert/strict';
import { compileSceneField } from './engine/world/scene-field.js';
import { e3Space, clearance } from './engine/world/collision.js';
import { stepWalker } from './engine/world/walker.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
const space = e3Space();

/**
 * A room with a floor and a WALL you can cut a doorway through.
 *
 * The wall is built the way an author would have to build it, and the reason
 * is worth stating: a plane is a HALF-SPACE, infinitely thick, so subtracting
 * a ball from one makes a cavity and not a doorway -- you can walk in and not
 * out. A wall you can pass through has to be a slab, so a second carve takes
 * the far side off. Both carves TARGET the wall, which is why the floor
 * survives them.
 */
function walled({ doorway = null, extra = [] } = {}) {
  return {
    format: 'nil-scene', version: 1, id: 'carve-room',
    units: { name: 'design-unit', playerRadius: 0.25 },
    regions: [{ id: 'r', geometry: { kind: 'e3', curvatureRadius: 1 }, topology: 'cover', extent: 20 }],
    entities: [
      { id: 'ground', regionId: 'r', kind: 'plane', position: [0, 0, 0], up: [0, 0, 1] },
      // Solid on the side the normal points AWAY from, so this fills y >= 2.
      { id: 'wall', regionId: 'r', kind: 'plane', position: [0, 2, 0], up: [0, -1, 0] },
      { id: 'start', regionId: 'r', kind: 'spawn', position: [0, -1, 0.3] },
      // Cuts the wall back to a 0.4-thick slab, y in [2, 2.4].
      { id: 'backface', regionId: 'r', kind: 'plane', op: 'subtract', target: 'wall',
        position: [0, 2.4, 0], up: [0, -1, 0] },
      ...(doorway ? [{ id: 'door', regionId: 'r', kind: 'ball', op: 'subtract',
        target: 'wall', ...doorway }] : []),
      ...extra,
    ],
    connections: [],
  };
}

test('the wall is a slab: solid inside it, open past it', () => {
  const f = compileSceneField(walled());
  assert.ok(f.distance([0, 2.2, 0.5]) < 0, 'inside the slab');
  assert.ok(f.distance([0, 3, 0.5]) > 0, 'past the slab is open air');
  assert.equal(f.carveCount, 1, 'the back face is itself a carve');
});

test('A SCOPED CARVE LEAVES EVERYTHING ELSE ALONE', () => {
  // The reason `target` exists. The back-face carve is a half-space covering
  // y > 2.4 everywhere, including under the floor. Applied globally it would
  // delete the floor beyond the wall and the walker would fall off the world.
  const f = compileSceneField(walled());
  assert.ok(f.distance([0, 6, -0.5]) < 0, 'the floor still exists past the wall');
  assert.deepEqual(f.normal([0, 6, -0.01]).map((x) => +x.toFixed(9)), [0, 0, 1]);
});

test('A CARVE MAKES A HOLE: the same point becomes free space', () => {
  const f = compileSceneField(walled({ doorway: { position: [0, 2.2, 0.6], radius: 0.9 } }));
  assert.equal(f.carveCount, 2, 'the back face and the doorway');
  assert.ok(f.distance([0, 2.2, 0.6]) > 0, 'the middle of the doorway is open');
  // And only where it was carved. One unit up is still wall.
  assert.ok(f.distance([0, 2.2, 2.0]) < 0, 'above the doorway is still solid');
  assert.ok(f.distance([3, 2.2, 0.6]) < 0, 'beside the doorway is still solid');
});

test('the carved face NORMAL points out of the void, not into it', () => {
  // The surface of a doorway belongs to the sphere that cut it, seen from the
  // other side. Without the flip a walker slides along the opening as if the
  // wall were still there, which looks like a collision bug and is a sign bug.
  const f = compileSceneField(walled({ doorway: { position: [0, 2.2, 0.6], radius: 0.9 } }));
  // Just inside the doorway's rim, at the top of the opening.
  const at = [0, 2.2, 1.45];
  const n = f.normal(at);
  assert.ok(n, 'there is a surface here');
  // The carving ball is centred at z = 0.6, so its own outward normal here is
  // +z. The doorway's surface faces back DOWN into the opening.
  assert.ok(n[2] < -0.5, `expected the doorway roof to face down, got ${n.map((x) => x.toFixed(2))}`);
});

test('an uncarved surface keeps ITS normal', () => {
  const f = compileSceneField(walled({ doorway: { position: [0, 2.2, 0.6], radius: 0.9 } }));
  const onFloor = f.normal([4, -4, 0.01]);
  assert.deepEqual(onFloor.map((x) => +x.toFixed(9)), [0, 0, 1], 'the floor still points up');
});

test('THE CONTRACT CHANGES WITH THE OPERATION', () => {
  // `min` of exact distances is exact; `max` is not -- it under-estimates at a
  // concave seam, where the true nearest point is on the edge where two
  // surfaces meet rather than on either one. A field that kept claiming
  // 'exact' would be lying, and clearance() is built on that claim.
  const doc = walled();
  doc.entities = doc.entities.filter((e) => e.id !== 'backface' && e.id !== 'wall');
  const plain = compileSceneField(doc);
  assert.equal(plain.capabilities.distance, 'exact');
  assert.equal(plain.capabilities.intersection, 'exact');
  assert.equal(compileSceneField(walled()).capabilities.distance, 'bound',
    'the slab is itself made by a carve');
  const cut = compileSceneField(walled({ doorway: { position: [0, 2.2, 0.6], radius: 0.9 } }));
  assert.equal(cut.capabilities.distance, 'bound');
  assert.equal(cut.capabilities.intersection, 'marched');
});

test('THE SAFETY PROPERTY: a sphere-tracing step never lands inside', () => {
  // This is what "conservative bound" has to MEAN. Tracing steps by exactly
  // the reported distance; if that were ever an over-estimate the marcher
  // would step through a surface and the renderer would show a hole in a
  // wall that the collider does not have.
  const f = compileSceneField(walled({ doorway: { position: [0, 2.2, 0.6], radius: 0.9 } }));
  let checked = 0;
  for (let i = 0; i < 60; i++) {
    // Deterministic spread of start points and directions, no RNG: a failing
    // case has to be reproducible by re-running the file.
    const a = i * 0.7, b = i * 1.3;
    let p = [Math.cos(a) * 3, Math.sin(a) * 3 - 1, 0.4 + (i % 5) * 0.4];
    const u = [Math.cos(b) * 0.6, Math.sin(b) * 0.8, Math.sin(a) * 0.2];
    const n = Math.hypot(...u);
    const dir = u.map((x) => x / n);
    for (let step = 0; step < 80; step++) {
      const d = f.distance(p);
      if (d < 1e-5) break;                       // arrived at a surface
      p = [p[0] + dir[0] * d, p[1] + dir[1] * d, p[2] + dir[2] * d];
      checked++;
      assert.ok(f.distance(p) > -1e-9,
        `step ${step} from seed ${i} landed ${f.distance(p)} INSIDE the solid`);
      if (Math.hypot(...p) > 40) break;
    }
  }
  assert.ok(checked > 500, `expected a real sweep, only took ${checked} steps`);
});

test('a ray through the doorway passes; the wall beside it stops', () => {
  const f = compileSceneField(walled({ doorway: { position: [0, 2.2, 0.6], radius: 0.9 } }));
  const through = f.rayHit([0, -1, 0.6], [0, 1, 0]);
  assert.ok(through > 6, `expected the ray to pass through the opening, stopped at ${through}`);
  const blocked = f.rayHit([3, -1, 0.6], [0, 1, 0]);
  assert.ok(Math.abs(blocked - 3) < 1e-2, `expected to hit the wall at 3, got ${blocked}`);
});

test('YOU CAN WALK THROUGH IT, which is the point', () => {
  // The acceptance test for the whole feature. A doorway that reads correctly
  // in the distance function but stops a walker is not a doorway.
  const f = compileSceneField(walled({ doorway: { position: [0, 2.2, 0.45], radius: 0.9 } }));
  let s = { position: [0, -1, 0.25], velocity: [0, 0, 0], radius: 0.25, grounded: true };
  for (let i = 0; i < 240; i++) {
    const out = stepWalker(f, space, s, 1 / 60, { want: [0, 2.5, 0] });
    s = { ...s, position: out.position, velocity: out.velocity, grounded: out.grounded };
    assert.ok(clearance(f, s.position, s.radius) >= -1e-3, `step ${i} sank into geometry`);
  }
  assert.ok(s.position[1] > 2.5, `expected to be through the wall, got y=${s.position[1].toFixed(2)}`);
  assert.equal(s.grounded, true, 'and still standing on the floor');
});

test('the same walk into the SOLID wall is stopped', () => {
  // Guards the test above from passing because the wall was never there.
  const f = compileSceneField(walled());
  let s = { position: [0, -1, 0.25], velocity: [0, 0, 0], radius: 0.25, grounded: true };
  for (let i = 0; i < 240; i++) {
    const out = stepWalker(f, space, s, 1 / 60, { want: [0, 2.5, 0] });
    s = { ...s, position: out.position, velocity: out.velocity, grounded: out.grounded };
  }
  assert.ok(s.position[1] < 2, `expected to be stopped by the wall, got y=${s.position[1].toFixed(2)}`);
});

test('carving from nothing leaves nothing', () => {
  // Subtracting from empty space is empty space, not a solid universe with a
  // bite out of it. The sign convention makes this easy to get backwards.
  const doc = walled();
  doc.entities = doc.entities.filter((e) => e.kind !== 'plane');
  const f = compileSceneField(doc);
  assert.equal(f.distance([0, 0, 1]), Infinity, 'still all free space');
  assert.equal(f.normal([0, 0, 1]), null, 'and no surface anywhere');
});

test('op is refused on kinds that are not solids', () => {
  const doc = walled();
  doc.entities.find((e) => e.kind === 'spawn').op = 'subtract';
  assert.throws(() => compileSceneField(doc), /op applies to balls and planes/);
  const bad = walled();
  bad.entities.find((e) => e.id === 'wall').op = 'invert';
  assert.throws(() => compileSceneField(bad), /expected "add" or "subtract"/);
});

test('a document written before booleans means exactly what it did', () => {
  // `op` absent is `add`. Every fixture in the repository predates this
  // feature, so if the default were anything else they would all change.
  const doc = walled();
  doc.entities = doc.entities.filter((e) => e.id !== 'backface');
  const f = compileSceneField(doc);
  assert.equal(f.carveCount, 0);
  assert.equal(f.capabilities.distance, 'exact');
  assert.ok(f.distance([0, 3, 0.5]) < 0, 'an uncarved half-space is infinitely thick');
});

test('a carve must name a solid that exists, and not itself', () => {
  const missing = walled();
  missing.entities.find((e) => e.id === 'backface').target = 'nonesuch';
  assert.throws(() => compileSceneField(missing), /target nonesuch is not a solid/);
  const self = walled();
  self.entities.find((e) => e.id === 'backface').target = 'backface';
  assert.throws(() => compileSceneField(self), /cannot target itself/);
});

console.log(`\nbooleans: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
