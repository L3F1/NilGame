// Portal apertures, the transit isometry, and swept crossing.
//
// The map is checked as an ISOMETRY -- distances and angles preserved, the
// aperture carried onto its partner -- rather than against a second
// implementation of itself. A portal that merely agrees with its own inverse
// can still be the wrong portal.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileSceneField, addEntity, editScene } from './engine/world/scene-field.js';
import { portalPair, apertureCrossing, firstCrossing } from './engine/world/portal.js';
import { e3Space, sweep, moveProbe, clearance } from './engine/world/collision.js';
import { stepWalker } from './engine/world/walker.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
const load = (n) => JSON.parse(readFileSync(new URL(`./levels/fixtures/${n}`, import.meta.url), 'utf8'));
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const room = load('portal-room.nil.json');
const field = compileSceneField(room);
const space = e3Space();
const r = field.playerRadius;
const [A, B] = field.portals;          // A: gate-a -> gate-b, B: the way back

// --- the map --------------------------------------------------------------

test('a connection compiles to two one-way apertures', () => {
  assert.equal(field.portalCount, 2);
  assert.equal(A.fromId, 'gate-a'); assert.equal(A.toId, 'gate-b');
  assert.equal(B.fromId, 'gate-b'); assert.equal(B.toId, 'gate-a');
  // An aperture is a hole. It must not appear as something to collide with.
  assert.equal(field.solidCount, 2, 'floor and marker ball only');
  assert.ok(field.distance([0, 0, 1.2]) > 0, 'the aperture centre is open space');
});

test('the map carries one aperture centre onto the other', () => {
  assert.deepEqual(A.mapPoint(A.center).map((x) => +x.toFixed(9)), B.center);
  assert.deepEqual(B.mapPoint(B.center).map((x) => +x.toFixed(9)), A.center);
});

test('the map is an ISOMETRY: it preserves distance and angle', () => {
  const pts = [[0.3, 0.2, 1.4], [-0.7, 0.9, 0.6], [0, 0, 1.2], [1.1, -0.4, 2.0]];
  for (const p of pts) {
    for (const q of pts) {
      near(dist(A.mapPoint(p), A.mapPoint(q)), dist(p, q), 1e-12, 'distance preserved');
    }
  }
  const u = [0.6, -0.8, 0], v = [0, 0, 1];
  near(dot(A.mapVector(u), A.mapVector(v)), dot(u, v), 1e-12, 'angle preserved');
  near(Math.hypot(...A.mapVector(u)), Math.hypot(...u), 1e-12, 'length preserved');
});

test('A and B are inverse maps', () => {
  for (const p of [[0.3, 0.2, 1.4], [-0.7, 0.9, 0.6]]) {
    const back = B.mapPoint(A.mapPoint(p));
    near(dist(back, p), 0, 1e-12, 'there and back is the identity');
  }
});

test('ENTERING one aperture means LEAVING the other', () => {
  // gate-a's forward is (0,-1,0), so a traveller arrives moving +y. They must
  // emerge from gate-b moving along ITS forward, out into the room -- not
  // backwards into it, which would re-cross immediately and read as a portal
  // that does not work.
  const entering = [0, 1, 0];
  const out = A.mapVector(entering);
  assert.deepEqual(out.map((x) => +x.toFixed(9)), B.center && [0, -1, 0]);
  assert.ok(dot(out, A.exitNormal) > 0.99, 'emerges along the exit normal');
});

test('mapPoint and mapVector are different operations', () => {
  // Applying the point map to a direction adds the portal's displacement to
  // something that has no position. Silent, and wrong by 7.2 units here.
  const dir = [0, 1, 0];
  assert.ok(dist(A.mapPoint(dir), A.mapVector(dir)) > 1,
    'the two must not be interchangeable');
  near(Math.hypot(...A.mapVector(dir)), 1, 1e-12, 'mapVector keeps it a unit vector');
});

// --- crossing the aperture ------------------------------------------------

test('a segment through the disc crosses; one outside it does not', () => {
  const hit = apertureCrossing(A, [0, -1, 1.2], [0, 1, 1.2]);
  assert.ok(hit, 'straight through the middle');
  near(hit.t, 0.5, 1e-12, 'halfway along the segment');
  assert.deepEqual(hit.at.map((x) => +x.toFixed(9)), [0, 0, 1.2]);
  // Same plane, but outside the 1.1 radius.
  assert.equal(apertureCrossing(A, [3, -1, 1.2], [3, 1, 1.2]), null);
  // Parallel to the aperture, never crossing its plane.
  assert.equal(apertureCrossing(A, [0, -1, 1.2], [2, -1, 1.2]), null);
});

test('crossing is ONE-SIDED: leaving through the back does not count', () => {
  // Front to back crosses; back to front does not. Without this a traveller
  // who has just emerged is caught by the aperture they came out of.
  assert.ok(apertureCrossing(A, [0, -1, 1.2], [0, 1, 1.2]), 'front to back');
  assert.equal(apertureCrossing(A, [0, 1, 1.2], [0, -1, 1.2]), null, 'back to front');
});

test('firstCrossing takes the nearest aperture along the segment', () => {
  const hit = firstCrossing(field.portals, [0, -1, 1.2], [0, 1, 1.2]);
  assert.equal(hit.portal.fromId, 'gate-a');
});

// --- transit through a swept move ----------------------------------------

test('a sweep through the aperture comes out at the far gate', () => {
  const out = sweep(field, space, {
    from: [0, -2, 1.2], direction: [0, 1, 0], distance: 3, radius: r,
    portals: field.portals,
  });
  assert.equal(out.transits.length, 1, 'exactly one transit');
  assert.equal(out.blocked, null);
  // Entered 2 along, so it emerges 2 from the start and continues 1 further
  // out of gate-b, whose forward is -y.
  near(out.travelled, 3, 1e-3, 'arclength is conserved: a portal is not free distance');
  near(dist(out.position, [6, 3, 1.2]), 0, 5e-3, 'one unit out of the far gate');
});

test('a transit does NOT immediately re-cross the aperture it left', () => {
  // Emerging exactly on the exit plane leaves the next sign test able to read
  // either way, and the traveller ping-pongs without advancing. The H3 marcher
  // needs the same guard at a domain face.
  const out = sweep(field, space, {
    from: [0, -2, 1.2], direction: [0, 1, 0], distance: 8, radius: r,
    portals: field.portals, maxSteps: 512,
  });
  assert.equal(out.transits.length, 1, `expected one transit, got ${out.transits.length}`);
});

test('velocity is carried through, not just position', () => {
  const out = moveProbe(field, space,
    { position: [0, -2, 1.2], velocity: [0, 4, 0], radius: r }, 1,
    { portals: field.portals, maxSteps: 512 });
  assert.equal(out.transits.length, 1);
  // Went in moving +y; comes out moving along gate-b's forward, which is -y.
  assert.deepEqual(out.velocity.map((x) => +x.toFixed(6)), [0, -4, 0]);
});

test('a BLOCKED exit refuses the transit and stops at the aperture', () => {
  // Put a ball over the far gate, so emerging would land inside it. The
  // traveller must stop at the near aperture rather than appear inside rock.
  const walled = compileSceneField(
    addEntity(room, 'ball', { position: [6, 3.4, 1.2], radius: 1.0 }));
  const out = sweep(walled, space, {
    from: [0, -2, 1.2], direction: [0, 1, 0], distance: 3, radius: r,
    portals: walled.portals,
  });
  assert.equal(out.transits.length, 0, 'no transit happened');
  assert.ok(out.blocked, 'and it says the exit was blocked');
  assert.equal(out.hit, true, 'the aperture behaved as the wall it sits in');
  near(dist(out.position, [0, 0, 1.2]), 0, 1e-2, 'stopped at the near aperture');
});

test('a portal a player cannot fit through is refused at compile time', () => {
  // Finding this out by walking into it is worse than being told.
  // Both ends at once: the schema pins the radii equal, so editing one and
  // then the other never reaches a valid intermediate document.
  const both = structuredClone(room);
  for (const e of both.entities) if (e.kind === 'anchor') e.radius = 0.2;
  assert.throws(() => compileSceneField(both), /does not admit a player/);
});

test('A TRANSIT ROTATES THE WORLD, so the host must carry its heading through', () => {
  // The contract this pins down, and it is easy to get wrong: `want` is a
  // WORLD-space direction. A traveller who keeps asking for the same world
  // direction after a transit is asking to walk back the way they came --
  // measured, that re-crosses the far aperture immediately and loops, 70
  // transits in 200 steps. The host holds a camera; the engine does not; so
  // the host must map its heading by the same portal the probe went through.
  let s = { position: [0, -3, r], velocity: [0, 0, 0], radius: r, grounded: true };
  let heading = [0, 1, 0], transits = 0;
  for (let i = 0; i < 200; i++) {
    const out = stepWalker(field, space, s, 1 / 60,
      { want: heading.map((x) => x * 3), portals: field.portals, maxSteps: 256 });
    for (const transit of out.transits) heading = transit.portal.mapVector(heading);
    transits += out.transits.length;
    s = { ...s, position: out.position, velocity: out.velocity, grounded: out.grounded };
    assert.ok(clearance(field, s.position, r) >= -1e-6, `step ${i} sank into the floor`);
  }
  // The gate is at z = 1.2 with radius 1.1, so its lower rim reaches z = 0.1
  // and a walker whose centre is at r = 0.25 passes through it.
  assert.equal(transits, 1, `expected to walk through once, got ${transits}`);
  assert.ok(s.position[0] > 4, `came out near the far gate: ${s.position}`);
  assert.equal(s.grounded, true, 'still standing after the transit');
});

test('a scene with no connections has no portals and still works', () => {
  const plain = compileSceneField(load('room.nil.json'));
  assert.equal(plain.portalCount, 0);
  const out = moveProbe(plain, space,
    { position: [0, -3, 0.5], velocity: [0, 2, 0], radius: r }, 0.5,
    { portals: plain.portals });
  assert.deepEqual(out.transits, []);
  assert.equal(out.blocked, null);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
