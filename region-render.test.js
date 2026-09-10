// Does the thing you SEE equal the thing you walk into?
//
// The renderer does not consult `field.distance`. It consults flat uniform
// arrays that were packed from the same document, and the packing is where a
// renderer silently stops drawing the room the walker is standing in: a carve
// grouped against the wrong solid, a face plane offset by one, a sign dropped
// so a doorway fills in. None of that shows up as an error; it shows up as a
// picture that looks fine and a wall you fall through.
//
// So the packing is checked against the AUTHORITATIVE field, sample by sample,
// with no GL anywhere near it. `packedSample` is written in the shader's shape,
// so if it agrees with the field and the GPU agrees with it, the two cannot
// drift apart unnoticed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileRegionWorld } from './engine/world/region-world.js';
import {
  packRegionScene, packedSample, packedNormal, REGION_RENDER_LIMITS, REGION_S3_GLSL,
} from './engine/geometry/region-shader.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
const fixture = (name) => JSON.parse(readFileSync(`levels/fixtures/${name}.nil.json`, 'utf8'));
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`);

const room = compileRegionWorld(fixture('s3-room'));
const region = room.regions.get('sphere');
const packed = packRegionScene(room, 'sphere');

test('the authored S3 room packs inside this viewport capacity', () => {
  assert.equal(packed.curvatureRadius, 8);
  assert.equal(packed.extent, 8);
  near(packed.boundaryHeight, Math.cos(1), 1e-15);
  // Six additive solids -- floor, three walls, the far wall and the ball --
  // open six groups; the door is a carve and joins the wall's rather than
  // opening one of its own.
  assert.equal(packed.groups, 6);
  assert.ok(packed.primitives.length <= REGION_RENDER_LIMITS.primitives);
  assert.ok(packed.planes.length <= REGION_RENDER_LIMITS.planes);
  const door = packed.primitives.find((p) => p.id === 's-door');
  const wall = packed.primitives.find((p) => p.id === 's-wall');
  assert.equal(door.sign, -1, 'a carve contributes a negated distance');
  assert.equal(door.group, wall.group, 'and joins the group of the solid it targets');
  assert.equal(wall.sign, 1);
});

test('every face plane lands where its own primitive says it does', () => {
  // The flat arrays are indexed by (start, count) and an off-by-one there is
  // invisible in a picture. Compare against the packets the world compiled.
  const packets = room.renderData().primitives.filter((p) => p.regionId === 'sphere');
  for (const primitive of packed.primitives) {
    const packet = packets.find((p) => p.id === primitive.id);
    assert.equal(primitive.planeCount, packet.planes.length, primitive.id);
    for (let j = 0; j < primitive.planeCount; j++) {
      const stored = packed.planes[primitive.planeStart + j];
      packet.planes[j].forEach((x, i) => near(stored[i], x, 1e-12));
    }
  }
});

/** A grid over the room, in authored coordinates, decoded into the metric. */
function* samples(step = 0.4, reach = 4.2) {
  for (let x = -reach; x <= reach; x += step) {
    for (let y = -reach; y <= reach; y += step) {
      for (let z = 0.15; z <= 3.2; z += 0.5) {
        if (Math.hypot(x, y, z) >= region.descriptor.extent) continue;
        yield region.space.decode([x, y, z]);
      }
    }
  }
}

test('the packed scene equals the collision field, everywhere in the room', () => {
  let worst = 0, count = 0;
  for (const p of samples()) {
    const truth = region.field.distance(p);
    const drawn = packedSample(packed, p).distance;
    worst = Math.max(worst, Math.abs(truth - drawn));
    count++;
  }
  assert.ok(count > 1500, `only ${count} samples`);
  assert.ok(worst < 1e-12, `worst field/render disagreement ${worst} over ${count} samples`);
  console.log(`  field vs packed scene: ${count} samples, worst ${worst.toExponential(2)}`);
});

test('and agrees about WHICH solid it is looking at, carve included', () => {
  const packets = room.renderData().primitives.filter((p) => p.regionId === 'sphere');
  let checked = 0, doorSeen = 0;
  for (const p of samples(0.45, 3.0)) {
    const truth = region.field.sample(p);
    if (truth.owner === null) continue;
    const drawn = packedSample(packed, p);
    if (drawn.owner < 0) continue;
    const id = packed.primitives[drawn.owner].id;
    // Seams are ties by definition: the field itself says the winner is not
    // unique there, so agreement on the name is not owed.
    if (truth.feature === 'seam') continue;
    assert.equal(id, truth.owner, `owner at ${p.map((x) => x.toFixed(3))}`);
    if (id === 's-door') doorSeen++;
    checked++;
  }
  assert.ok(checked > 800, `only ${checked} owner comparisons`);
  assert.ok(doorSeen > 0, 'the carved doorway must win somewhere, or the carve is not drawn');
  assert.ok(packets.length > 0);
  console.log(`  owner agreement: ${checked} samples, ${doorSeen} of them the carved doorway`);
});

test('normals are unit tangents, and a carved face points the other way', () => {
  let checked = 0, flipped = 0;
  for (const p of samples(0.45, 3.2)) {
    const drawn = packedSample(packed, p);
    if (drawn.owner < 0) continue;
    const n = packedNormal(packed, p, drawn.owner);
    if (!n) continue;
    near(Math.hypot(...n), 1, 1e-9);
    // Tangent at its own point: on the unit sphere that is orthogonality to p.
    near(n.reduce((s, x, i) => s + x * p[i], 0), 0, 1e-9);
    region.space.validateTangent(p, n);
    if (packed.primitives[drawn.owner].sign < 0) flipped++;
    checked++;
  }
  assert.ok(checked > 800, `only ${checked} normals`);
  assert.ok(flipped > 0, 'the carver surface must be reached, with its normal negated');
  console.log(`  normals: ${checked} checked, ${flipped} on a carved face`);
});

test('the marched ray is the geodesic the walker travels, not a chord', () => {
  // The shader advances `cos(t/R) * eye + sin(t/R) * dir`. That must be the
  // same point metric-space reaches, or the picture and the collision field
  // are looking down two different paths from the same eye.
  const space = region.space;
  const eye = space.decode([0, -3, 0.9]);
  const dir = space.normalize(eye, space.frame(eye)[1]);
  const R = packed.curvatureRadius;
  let worst = 0;
  for (let t = 0; t <= 6; t += 0.25) {
    const shader = eye.map((x, i) => Math.cos(t / R) * x + Math.sin(t / R) * dir[i]);
    const walker = space.step(eye, dir, t);
    worst = Math.max(worst, Math.hypot(...shader.map((x, i) => x - walker[i])));
    near(Math.hypot(...shader), 1, 1e-12);
  }
  assert.ok(worst < 1e-15, `march vs walker path ${worst}`);
  // A straight chord is not that path, and at these distances not by a little.
  const chord = eye.map((x, i) => x + 4 * dir[i]);
  assert.ok(Math.abs(Math.hypot(...chord) - 1) > 0.5, 'a chord leaves the sphere entirely');
});

test('a scene this viewport cannot draw is refused, and says which one it is', () => {
  const flat = compileRegionWorld(fixture('oriented-room'));
  assert.throws(() => packRegionScene(flat, flat.document().regions[0].id), /E3/);
  const portals = compileRegionWorld(fixture('portal-room'));
  assert.throws(() => packRegionScene(portals, portals.document().regions[0].id), /portal|connection/i);
  assert.throws(() => packRegionScene(room, 'nowhere'), /Unknown region/);
  // Capacity is refused by naming the number, not by drawing part of the scene.
  assert.throws(() => packRegionScene(room, 'sphere', { ...REGION_RENDER_LIMITS, planes: 4 }), /face planes/);
  assert.throws(() => packRegionScene(room, 'sphere', { ...REGION_RENDER_LIMITS, groups: 2 }), /solid groups/);
});

test('the shader source is GLSL ES 3.00 and declares what it indexes', () => {
  assert.ok(REGION_S3_GLSL.startsWith('#version 300 es'), 'version directive must be the first line');
  for (const name of ['uPlane', 'uPrimCenter', 'uPrimA', 'uPrimCount', 'uGroupCount', 'uR',
    'uBoundaryHeight', 'uMaxTravel', 'uSteps', 'uEpsilon', 'uEye', 'uFwd', 'uRight', 'uUp',
    'uLight', 'uRes', 'uFocal', 'uSelected', 'uFloorPrim']) {
    assert.ok(new RegExp(`uniform [a-z0-9]+ ${name}\\b`).test(REGION_S3_GLSL), `missing uniform ${name}`);
  }
  // The march bound must stay a uniform: a literal one lets the compiler unroll
  // the scene function and the link time goes with it.
  assert.ok(/for \(int s = 0; s < MAX_STEPS; s\+\+\)[\s\S]{0,40}if \(s >= uSteps\) break;/.test(REGION_S3_GLSL),
    'the march must be bounded by a uniform, not by its literal maximum');
  assert.ok(!/\bt \* dir\b/.test(REGION_S3_GLSL), 'no straight-line stepping in a curved space');
});

console.log(`region render: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
