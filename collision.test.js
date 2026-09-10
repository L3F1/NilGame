// Swept collision against the scene-v1 ball field.
//
// Every expectation here is an INDEPENDENT closed form, not a second run of
// the solver: a sphere of radius r meeting a ball of radius R centred at c is
// exactly |p - c| = R + r, so the contact distance along any ray is solvable
// by hand. CPU/GPU agreement is not proof and neither is solver/solver
// agreement -- see WORKING_RULES, "use independent identities".
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileBallScene, editBallScene } from './engine/world/ball-scene.js';
import {
  e3Space, clearance, isClear, resolveOverlap, sweep, moveProbe,
} from './engine/world/collision.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

const scene = JSON.parse(readFileSync(new URL('./levels/fixtures/ball-lab.nil.json', import.meta.url), 'utf8'));
const field = compileBallScene(scene);          // ball at (0,0,0.25), radius 0.6
const space = e3Space();
const C = [0, 0, 0.25], R = 0.6, r = 0.07;      // r is units.playerRadius
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

// --- the field as the solver sees it -------------------------------------

test('clearance subtracts the probe radius', () => {
  // A probe centred 2 below the ball centre: surface gap is 2 - R - r.
  near(clearance(field, [0, 0, C[2] - 2], r), 2 - R - r, 1e-12, 'clearance');
  assert.equal(isClear(field, [0, 0, C[2] - 2], r), true);
  assert.equal(isClear(field, C, r), false, 'the centre is not clear');
});

test('the fixture spawn has room for the player', () => {
  const spawn = scene.entities.find((e) => e.kind === 'spawn').position;
  assert.ok(clearance(field, spawn, r) > 0, 'authored spawn must not be inside the ball');
});

// --- the swept query ------------------------------------------------------

test('a sweep stops at the analytic contact distance', () => {
  // Straight at the centre from 3 away along -y: contact when the gap closes,
  // i.e. after 3 - (R + r).
  const from = [0, C[1] - 3, C[2]];
  const out = sweep(field, space, { from, direction: [0, 1, 0], distance: 10, radius: r });
  assert.equal(out.hit, true);
  assert.equal(out.stalled, false);
  near(out.travelled, 3 - (R + r), 2e-4, 'contact arclength');
  // The reported normal points out of the surface, back the way we came.
  assert.deepEqual(out.normal.map((x) => Math.round(x * 1e6) / 1e6), [0, -1, 0]);
});

test('a sweep that misses travels its whole distance', () => {
  // Offset well past the swept radius: R + r = 0.67, so x = 2 cannot touch.
  const out = sweep(field, space, {
    from: [2, C[1] - 3, C[2]], direction: [0, 1, 0], distance: 6, radius: r,
  });
  assert.equal(out.hit, false);
  assert.equal(out.stalled, false);
  near(out.travelled, 6, 1e-9, 'free travel');
  near(out.position[1], C[1] + 3, 1e-9, 'end point');
});

test('A SINGLE ENORMOUS STEP CANNOT TUNNEL', () => {
  // The whole point of sweeping. One step of 1000 units straight through the
  // ball: a point test at either end reports empty space, because both ends
  // ARE empty space. Conservative advancement stops at the surface.
  const out = sweep(field, space, {
    from: [0, C[1] - 500, C[2]], direction: [0, 1, 0], distance: 1000, radius: r, maxSteps: 4096,
  });
  assert.equal(out.hit, true, 'must not pass through the ball');
  near(out.travelled, 500 - (R + r), 1e-3, 'contact after a huge step');
  assert.ok(clearance(field, out.position, r) >= -1e-6, 'never ends up inside');
});

test('a grazing sweep stalls SHORT rather than passing through', () => {
  // Tangent-ish: the classic sphere-tracing weakness. Whatever it does, the
  // one thing it must never do is end up inside.
  const graze = R + r + 1e-4;
  const out = sweep(field, space, {
    from: [graze, C[1] - 3, C[2]], direction: [0, 1, 0], distance: 6, radius: r, maxSteps: 32,
  });
  assert.ok(clearance(field, out.position, r) >= -1e-6, 'a stall is never a penetration');
  assert.ok(out.travelled <= 6 + 1e-9, 'never travels further than asked');
});

test('a sweep of zero distance is a no-op, not a hit', () => {
  const from = [0, C[1] - 3, C[2]];
  const out = sweep(field, space, { from, direction: [0, 1, 0], distance: 0, radius: r });
  assert.equal(out.hit, false);
  assert.deepEqual(out.position, from);
});

test('a sweep rejects a non-unit direction', () => {
  assert.throws(() => sweep(field, space, {
    from: [0, -3, 0], direction: [0, 2, 0], distance: 1, radius: r,
  }), /unit/);
});

// --- overlap, which is the case an EDITOR creates -------------------------

test('a probe already inside is pushed out along the normal', () => {
  // Sitting 0.1 off centre: inside the ball, with a well-defined normal.
  const inside = [0.1, 0, C[2]];
  assert.ok(clearance(field, inside, r) < 0, 'precondition: overlapping');
  const out = resolveOverlap(field, space, inside, r);
  assert.equal(out.status, 'pushed');
  assert.ok(clearance(field, out.position, r) >= 0, 'ends with room');
  // Pushed straight out along +x, so it lands at exactly R + r from centre.
  near(Math.hypot(...out.position.map((x, i) => x - C[i])), R + r, 1e-3, 'push distance');
  near(out.position[1], 0, 1e-12, 'push does not drift sideways');
});

test('a probe with room is left exactly where it is', () => {
  const clearAt = [0, -2, 1];
  const out = resolveOverlap(field, space, clearAt, r);
  assert.equal(out.status, 'clear');
  assert.deepEqual(out.position, clearAt);
});

test('dead centre reports TRAPPED rather than inventing a direction', () => {
  // Every direction is equally "out" here, so there is no honest push. The
  // host decides whether that means refusing the edit or respawning.
  const out = resolveOverlap(field, space, C.slice(), r);
  assert.equal(out.status, 'trapped');
  assert.deepEqual(out.position, C, 'a trapped probe is not moved');
});

test('an edit that swallows the player is detected through the same field', () => {
  // The editor case end to end: grow the ball until it contains a probe that
  // previously had room, and ask the SAME field the renderer will draw.
  const standing = [0, -1, 0.25];
  assert.ok(isClear(field, standing, r), 'precondition: clear before the edit');
  const grown = compileBallScene(editBallScene(scene, C, 1.5));
  assert.equal(isClear(grown, standing, r), false, 'the edit now overlaps the probe');
  const out = resolveOverlap(grown, space, standing, r);
  assert.equal(out.status, 'pushed');
  near(Math.hypot(...out.position.map((x, i) => x - C[i])), 1.5 + r, 1e-3, 'pushed to the new surface');
});

// --- the moving probe -----------------------------------------------------

test('a free move covers speed * dt exactly', () => {
  const out = moveProbe(field, space, {
    position: [2, -3, 0.25], velocity: [0, 2, 0], radius: r,
  }, 0.5);
  assert.deepEqual(out.contacts, []);
  assert.equal(out.stalled, false);
  near(out.position[1], -3 + 1, 1e-9, 'distance covered');
});

test('a head-on contact stops the probe and reports the normal', () => {
  const out = moveProbe(field, space, {
    position: [0, -3, 0.25], velocity: [0, 10, 0], radius: r,
  }, 1);
  assert.equal(out.contacts.length, 1);
  assert.deepEqual(out.contacts[0].map((x) => Math.round(x * 1e6) / 1e6), [0, -1, 0]);
  // All of the motion was normal to the surface, so nothing is left to slide.
  assert.deepEqual(out.velocity, [0, 0, 0]);
  assert.ok(clearance(field, out.position, r) >= -1e-6, 'stops outside the surface');
});

test('an angled contact SLIDES instead of stopping', () => {
  // An OFF-CENTRE approach: impact parameter 0.4 against a contact radius of
  // R + r = 0.67, so the probe meets the surface obliquely and keeps the
  // tangential part. (Aiming from (-2,-2) at 45 degrees looks angled and is
  // not -- that line runs through the centre, which is head-on.)
  const out = moveProbe(field, space, {
    position: [-2, -0.4, 0.25], velocity: [4, 0, 0], radius: r,
  }, 1);
  assert.ok(out.contacts.length >= 1, 'must touch the ball');
  assert.ok(space.norm(out.position, out.velocity) > 0.1, 'keeps tangential speed');
  const n = out.contacts[0];
  const into = out.velocity[0] * n[0] + out.velocity[1] * n[1] + out.velocity[2] * n[2];
  assert.ok(into > -1e-6, `velocity must not point into the surface (${into})`);
  assert.ok(clearance(field, out.position, r) >= -1e-6, 'never inside');
});

test('a resting probe stays put and does not creep through', () => {
  // Press into the surface for many steps: the classic way a solver leaks.
  let state = { position: [0, C[1] - (R + r) - 1e-3, C[2]], velocity: [0, 0.5, 0], radius: r };
  for (let i = 0; i < 200; i++) {
    const out = moveProbe(field, space, state, 1 / 60);
    state = { ...state, position: out.position, velocity: [0, 0.5, 0] };
    assert.ok(clearance(field, state.position, r) >= -1e-6,
      `step ${i} leaked inside: ${clearance(field, state.position, r)}`);
  }
});

test('a huge time step is bounded by the surface, not by dt', () => {
  const out = moveProbe(field, space, {
    position: [0, -500, 0.25], velocity: [0, 1000, 0], radius: r,
  }, 1, { maxSteps: 4096 });
  assert.ok(clearance(field, out.position, r) >= -1e-6, 'a 1000-unit step still stops at the ball');
  assert.ok(out.contacts.length >= 1, 'and it registers the contact');
});

test('zero velocity and zero dt are no-ops', () => {
  const at = [0, -2, 1];
  for (const [v, dt] of [[[0, 0, 0], 1], [[0, 1, 0], 0]]) {
    const out = moveProbe(field, space, { position: at, velocity: v, radius: r }, dt);
    assert.deepEqual(out.position, at);
    assert.deepEqual(out.contacts, []);
  }
});

test('bad arguments are refused rather than producing NaN', () => {
  const ok = { position: [0, -2, 1], velocity: [0, 1, 0], radius: r };
  assert.throws(() => moveProbe(field, space, { ...ok, radius: 0 }, 1), /positive/);
  assert.throws(() => moveProbe(field, space, { ...ok, position: [0, 1] }, 1), /3 finite/);
  assert.throws(() => moveProbe(field, space, { ...ok, velocity: [0, NaN, 0] }, 1), /3 finite/);
  assert.throws(() => moveProbe(field, space, ok, -1), /nonnegative/);
});

// --- the space abstraction itself ----------------------------------------

test('e3 transport is the identity and project removes the normal part', () => {
  // The metric now takes the POINT it is being evaluated at, because outside
  // E3 an inner product and a parallel transport are properties of a place
  // rather than of a pair of arrays. Signatures are (p, q, v) for transport
  // and (p, u, n) for project.
  assert.deepEqual(space.transport([1, 2, 3], [4, 5, 6], [9, 9, 9]), [9, 9, 9]);
  assert.deepEqual(space.project([1, 2, 3], [1, 1, 0], [1, 0, 0]), [0, 1, 0]);
  // Projecting twice changes nothing: it is a projection, not a reflection.
  const once = space.project([1, 2, 3], [1, 1, 0], [1, 0, 0]);
  assert.deepEqual(space.project([1, 2, 3], once, [1, 0, 0]), once);
  // A NON-UNIT normal must work: the field promises a direction, not a length,
  // and dividing by the wrong length silently scales the slide.
  assert.deepEqual(space.project([1, 2, 3], [1, 1, 0], [3, 0, 0]), [0, 1, 0]);
});

test('A SWEEP CARRIES A VECTOR ALONG THE PATH, not between its endpoints', () => {
  // The distinction is invisible in E3 and is the whole reason the seam
  // exists: transport between two endpoints is transport along the shortest
  // geodesic joining them, and a probe that slid round a corner or went
  // through a portal did not travel along that. `carry` composes the legs the
  // probe actually took, in order.
  const out = sweep(field, space, {
    from: [-2, 0, 0.25], direction: [1, 0, 0], distance: 1.0, radius: r,
  });
  assert.equal(typeof out.carry, 'function', 'every sweep reports how to carry a vector');
  // In flat space every leg is the identity, so carry is too -- and that is
  // exactly what lets this whole suite check the refactor rather than merely
  // survive it.
  assert.deepEqual(out.carry([0, 1, 0]), [0, 1, 0]);
  assert.deepEqual(out.carry([3, -2, 7]), [3, -2, 7]);
});

test('the solver never calls the field with anything but a 3-vector', () => {
  // Guards the contract the curved fields will have to satisfy next.
  const seen = [];
  const probeField = {
    distance: (p) => { seen.push(p); return field.distance(p); },
    normal: (p) => { seen.push(p); return field.normal(p); },
  };
  moveProbe(probeField, space, { position: [0, -3, 0.25], velocity: [0, 5, 0], radius: r }, 1);
  assert.ok(seen.length > 0);
  for (const p of seen) {
    assert.ok(Array.isArray(p) && p.length === 3 && p.every(Number.isFinite), `bad field query ${p}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
