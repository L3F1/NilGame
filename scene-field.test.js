// The scene field (balls + planes) and the walker built on it.
//
// Expectations are closed form: a plane's signed distance is dot(p,n) - offset
// and a resting probe sits exactly its radius above the floor, so nothing here
// checks the solver against itself.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateScene } from './engine/world/document.js';
import { compileSceneField, editScene, addEntity, removeEntity } from './engine/world/scene-field.js';
import { e3Space, clearance, resolveOverlap } from './engine/world/collision.js';
import { stepWalker, GROUND_COS } from './engine/world/walker.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
const load = (n) => JSON.parse(readFileSync(new URL(`./levels/fixtures/${n}`, import.meta.url), 'utf8'));
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

const room = load('room.nil.json');
const field = compileSceneField(room);
const space = e3Space();
const r = field.playerRadius;                       // 0.25
const BALL = [0, 0, 0.9], BR = 0.9;

// --- the plane primitive --------------------------------------------------

test('a plane is a half-space with an exact signed distance', () => {
  near(field.distance([0, -3, 2]), 2, 1e-12, 'height above the floor');
  near(field.distance([5, 5, 0]), 0, 1e-12, 'on the floor');
  near(field.distance([0, -3, -0.75]), -0.75, 1e-12, 'below is negative');
  assert.deepEqual(field.normal([0, -3, 2]), [0, 0, 1], 'the floor faces up');
});

test('the floor is unbounded, unlike the ball', () => {
  // Far outside the region extent the floor is still the floor: `extent` is an
  // authoring bound, not a wall, and the field must not pretend otherwise.
  near(field.distance([100, 100, 3]), 3, 1e-12, 'distance far from the origin');
});

test('the union takes the NEAREST solid, with its own normal', () => {
  // Directly above the ball: the ball is nearer than the floor, so both the
  // distance and the normal must come from the ball.
  const p = [0, 0, 2.0];
  near(field.distance(p), Math.hypot(...p.map((x, i) => x - BALL[i])) - BR, 1e-12, 'ball distance');
  assert.deepEqual(field.normal(p).map((x) => Math.round(x * 1e9) / 1e9), [0, 0, 1]);
  // Off to the side at low height the floor wins.
  const q = [4, 0, 0.2];
  near(field.distance(q), 0.2, 1e-12, 'floor distance');
  assert.deepEqual(field.normal(q), [0, 0, 1]);
});

test('a plane ray hit is exact, and starting inside returns zero', () => {
  near(field.rayHit([0, -3, 2], [0, 0, -1]), 2, 1e-12, 'straight down');
  assert.equal(field.rayHit([0, -3, 2], [0, 0, 1]), Infinity, 'up never meets the floor');
  assert.equal(field.rayHit([0, -3, -1], [0, 0, 1]), 0, 'starting below is inside');
  assert.equal(field.rayHit([0, -3, 2], [0, 1, 0]), Infinity, 'parallel misses');
});

test('an empty scene is free space, not distance zero', () => {
  const bare = structuredClone(room);
  bare.entities = bare.entities.filter((e) => e.kind === 'spawn');
  assert.equal(compileSceneField(bare).distance([0, 0, 0]), Infinity);
  assert.equal(compileSceneField(bare).normal([0, 0, 0]), null);
});

// --- the schema -----------------------------------------------------------

test('a plane requires a unit up and refuses radius or forward', () => {
  const bad = (mutate) => {
    const s = structuredClone(room);
    mutate(s.entities.find((e) => e.kind === 'plane'));
    return () => validateScene(s);
  };
  assert.throws(bad((p) => { p.up = [0, 0, 2]; }), /unit normal/);
  assert.throws(bad((p) => { delete p.up; }), /up is required/);
  assert.throws(bad((p) => { p.radius = 1; }), /radius only applies/);
  assert.throws(bad((p) => { p.forward = [1, 0, 0]; }), /forward only applies/);
});

test('the ball fixture still validates and still has no plane', () => {
  const ball = compileSceneField(load('ball-lab.nil.json'));
  assert.equal(ball.hasPlane, false);
  assert.equal(ball.solidCount, 1);
});

test('a connection becomes apertures, and an aperture is a HOLE not a solid', () => {
  const s = structuredClone(room);
  s.entities.push(
    { id: 'a1', regionId: 'flat-room', kind: 'anchor', position: [4, 0, 1], radius: 0.8, forward: [1, 0, 0], up: [0, 0, 1] },
    { id: 'a2', regionId: 'flat-room', kind: 'anchor', position: [-4, 0, 1], radius: 0.8, forward: [-1, 0, 0], up: [0, 0, 1] });
  s.connections.push({ id: 'p1', kind: 'portal', a: 'a1', b: 'a2', velocity: 'preserve-speed', scale: 1 });
  const field = compileSceneField(s);
  assert.equal(field.portalCount, 2, 'one connection, two one-way apertures');
  assert.equal(field.solidCount, 2, 'the anchors did not become solids');
  // Standing in the aperture is standing in open air, not inside geometry.
  assert.ok(field.distance([4, 0, 1]) > 0);
  // Portal traversal itself is covered by portal.test.js.
});

// --- editing --------------------------------------------------------------

test('editScene patches by id and never mutates the source', () => {
  const before = JSON.stringify(room);
  const moved = editScene(room, 'editable-ball', { position: [1, 0, 1.2], radius: 0.4 });
  assert.equal(JSON.stringify(room), before, 'source untouched');
  assert.deepEqual(compileSceneField(moved).ballUniform(), [1, 0, 1.2, 0.4]);
  assert.throws(() => editScene(room, 'nope', {}), /No entity/);
  assert.throws(() => editScene(room, 'editable-ball', { radius: -1 }), /positive/);
  assert.equal(JSON.stringify(room), before, 'a rejected edit leaves the source alone');
});

test('the floor itself can be moved, and the field follows', () => {
  const raised = compileSceneField(editScene(room, 'ground', { position: [0, 0, 1] }));
  near(raised.distance([0, -3, 2]), 1, 1e-12, 'the floor moved up by one');
  assert.deepEqual(raised.planeUniform(), [0, 0, 1, 1]);
});

// --- adding and removing entities ----------------------------------------

test('addEntity fills in the region and a fresh id', () => {
  const before = JSON.stringify(room);
  const next = addEntity(room, 'ball', { position: [3, 0, 1], radius: 0.5 });
  const added = compileSceneField(next).entities().at(-1);
  assert.equal(added.kind, 'ball');
  assert.equal(added.regionId, 'flat-room');
  assert.match(added.id, /^ball-\d+$/);
  assert.equal(JSON.stringify(room), before, 'source untouched');
  // The new solid is in the field, not just in the document.
  near(compileSceneField(next).distance([3, 0, 1]), -0.5, 1e-12, 'inside the new ball');
  assert.equal(compileSceneField(next).ballCount, 2);
});

test('fresh ids never collide with anything already named', () => {
  let doc = room;
  for (let i = 0; i < 5; i++) doc = addEntity(doc, 'ball', { position: [i - 2, 4, 1], radius: 0.2 });
  const ids = compileSceneField(doc).entities().map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'all ids distinct');
  // Taking an id by hand and then adding must still not collide.
  const taken = addEntity(doc, 'ball', { id: 'ball-99', position: [0, 5, 1], radius: 0.2 });
  const more = addEntity(taken, 'ball', { position: [1, 5, 1], radius: 0.2 });
  const all = compileSceneField(more).entities().map((e) => e.id);
  assert.equal(new Set(all).size, all.length);
});

test('an invalid addition is refused whole', () => {
  const before = JSON.stringify(room);
  assert.throws(() => addEntity(room, 'ball', { position: [0, 0, 1], radius: -1 }), /positive/);
  assert.throws(() => addEntity(room, 'ball', { position: [0, 0, 1] }), /radius/);
  assert.throws(() => addEntity(room, 'plane', { position: [0, 0, 1] }), /up is required/);
  assert.throws(() => addEntity(room, 'teapot', { position: [0, 0, 1] }), /unsupported kind/);
  assert.equal(JSON.stringify(room), before, 'source untouched by any of them');
});

test('a second plane is a second half-space, and the union takes the nearer', () => {
  // A ceiling at z = 3 above the floor at z = 0. Halfway up, the floor is
  // nearer; near the top, the ceiling is, and each brings its own normal.
  const roofed = compileSceneField(addEntity(room, 'plane', { position: [0, 0, 3], up: [0, 0, -1] }));
  assert.equal(roofed.planeCount, 2);
  near(roofed.distance([5, 5, 1]), 1, 1e-12, 'floor is nearer low down');
  assert.deepEqual(roofed.normal([5, 5, 1]), [0, 0, 1]);
  near(roofed.distance([5, 5, 2.5]), 0.5, 1e-12, 'ceiling is nearer high up');
  assert.deepEqual(roofed.normal([5, 5, 2.5]), [0, 0, -1]);
});

test('removeEntity deletes by id and refuses the last spawn', () => {
  const before = JSON.stringify(room);
  const gone = compileSceneField(removeEntity(room, 'editable-ball'));
  assert.equal(gone.ballCount, 0);
  assert.equal(gone.solidCount, 1, 'the floor is still there');
  assert.throws(() => removeEntity(room, 'start'), /only spawn/);
  assert.throws(() => removeEntity(room, 'nope'), /No entity/);
  assert.equal(JSON.stringify(room), before, 'source untouched');
});

test('a scene can lose its floor and still be a scene', () => {
  const floorless = compileSceneField(removeEntity(room, 'ground'));
  assert.equal(floorless.hasPlane, false);
  assert.equal(floorless.planeCount, 0);
  // The ball is still solid; there is simply nothing to stand on.
  near(floorless.distance([0, 0, 0.9]), -0.9, 1e-12, 'the ball survives');
});

// --- gravity and ground contact ------------------------------------------

test('a probe dropped from a height lands and STAYS on the floor', () => {
  let s = { position: [0, -3, 5], velocity: [0, 0, 0], radius: r, grounded: false };
  for (let i = 0; i < 400; i++) s = stepWalker(field, space, s, 1 / 60);
  assert.equal(s.grounded, true, 'must end up standing');
  // Resting height is exactly the probe radius above the plane.
  near(s.position[2], r, 2e-3, 'resting height');
  assert.ok(clearance(field, s.position, r) >= -1e-6, 'never sinks through');
});

test('a resting probe does not accumulate downward speed', () => {
  // The bug this guards: while resting nothing cancels gravity, so vz grows
  // every frame and the first step off a ledge fires you downward at the speed
  // accumulated over however long you stood still.
  let s = { position: [0, -3, r], velocity: [0, 0, 0], radius: r, grounded: true };
  for (let i = 0; i < 600; i++) s = stepWalker(field, space, s, 1 / 60);
  assert.ok(Math.abs(s.velocity[2]) < 1.0, `vertical speed stayed bounded: ${s.velocity[2]}`);
  near(s.position[2], r, 2e-3, 'still at resting height after ten seconds');
});

test('walking moves horizontally without sinking or flying', () => {
  let s = { position: [0, -3, r], velocity: [0, 0, 0], radius: r, grounded: true };
  for (let i = 0; i < 120; i++) {
    s = stepWalker(field, space, s, 1 / 60, { want: [0, 2, 0] });
    assert.ok(clearance(field, s.position, r) >= -1e-6, `step ${i} sank into the floor`);
  }
  assert.ok(s.position[1] > -3 + 1.5, `travelled: ${s.position[1]}`);
  near(s.position[2], r, 1e-2, 'stayed on the ground while walking');
});

test('a jump leaves the ground and gravity brings it back', () => {
  let s = { position: [0, -3, r], velocity: [0, 0, 0], radius: r, grounded: true };
  s = stepWalker(field, space, s, 1 / 60, { jump: true });
  assert.ok(s.velocity[2] > 0, 'jump gives upward speed');
  let peak = s.position[2];
  for (let i = 0; i < 300; i++) {
    s = stepWalker(field, space, s, 1 / 60);
    peak = Math.max(peak, s.position[2]);
  }
  assert.ok(peak > r + 0.3, `actually left the ground: peak ${peak}`);
  assert.equal(s.grounded, true, 'and came back down');
  near(s.position[2], r, 2e-3, 'landed at resting height');
});

test('a jump is refused in mid-air', () => {
  const airborne = { position: [0, -3, 3], velocity: [0, 0, 0], radius: r, grounded: false };
  const s = stepWalker(field, space, airborne, 1 / 60, { jump: true });
  assert.ok(s.velocity[2] < 0, 'still falling, not launched');
});

test('the ball is standable at its top and not at its side', () => {
  // Top of the ball: the normal is straight up, so it is ground.
  const top = [0, 0, BALL[2] + BR + r];
  let s = { position: top, velocity: [0, 0, 0], radius: r, grounded: false };
  s = stepWalker(field, space, s, 1 / 60);
  assert.equal(s.grounded, true, 'the top of a ball is ground');
  // The side is a near-vertical wall: its normal is horizontal, so it is not.
  const side = [BALL[0] + BR + r - 1e-4, 0, BALL[2]];
  const n = field.normal(side);
  assert.ok(n[2] < GROUND_COS, 'the side normal is not standable');
});

test('down is a parameter, not a constant', () => {
  // Flip the plane into a CEILING (solid above, free below) and flip gravity
  // with it: the probe must now fall upward and rest under the ceiling.
  // Nothing in the walker may assume -z is down, because H3 has no canonical
  // down at all -- that is the whole subject of "Height and gravity".
  const ceiling = compileSceneField(editScene(room, 'ground', { up: [0, 0, -1] }));
  assert.ok(ceiling.distance([0, -3, -2]) > 0, 'below a ceiling is free space');
  let s = { position: [0, -3, -3], velocity: [0, 0, 0], radius: r, grounded: false };
  for (let i = 0; i < 400; i++) s = stepWalker(ceiling, space, s, 1 / 60, { up: [0, 0, -1] });
  assert.equal(s.grounded, true, 'stands on the underside of the ceiling');
  near(s.position[2], -r, 3e-3, 'rests a radius below the plane');
});

test('a huge time step still lands rather than tunnelling', () => {
  const s = stepWalker(field, space,
    { position: [0, -3, 500], velocity: [0, 0, 0], radius: r, grounded: false },
    2, { }, );
  assert.ok(clearance(field, s.position, r) >= -1e-6, 'a two-second fall from 500 does not pass the floor');
});

// --- the editor case, now with a floor underneath -------------------------

test('an edit that only reaches the player sideways pushes them clear', () => {
  // Beside the ball with room above and below: the nearest-surface normal
  // points into open space, so the push resolves in one move.
  const standing = [1.0, 0, 0.9];      // inside a ball of radius 1.2 at (0,0,0.9)
  const grown = compileSceneField(editScene(room, 'editable-ball', { radius: 1.2 }));
  assert.ok(clearance(grown, standing, r) < 0, 'precondition: the edit swallows the player');
  const out = resolveOverlap(grown, space, standing, r);
  assert.equal(out.status, 'pushed');
  assert.ok(clearance(grown, out.position, r) >= -1e-6, 'clear of the ball');
  assert.ok(out.position[2] >= -1e-6, 'and not pushed below the floor');
});

test('a player WEDGED between two solids is reported trapped, not shoved', () => {
  // Standing on the floor directly under the ball's centre, then growing the
  // ball over them. The nearest surface is the ball and its normal points
  // straight DOWN -- into the floor. Pushing along it lands inside the floor,
  // whose normal points straight back up, and the two alternate for ever.
  //
  // Gradient push cannot escape a wedge, and pretending otherwise would move
  // the player through the floor. Reporting `trapped` is the honest answer;
  // the documented policy then respawns them. See docs/ball-lab.md.
  const standing = [0, 0, r];
  const grown = compileSceneField(editScene(room, 'editable-ball', { position: [0, 0, 0.9], radius: 1.4 }));
  assert.ok(clearance(grown, standing, r) < 0, 'precondition: the edit swallows the player');
  const out = resolveOverlap(grown, space, standing, r);
  assert.equal(out.status, 'trapped');
  assert.deepEqual(out.position, standing, 'a trapped probe is never moved');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
