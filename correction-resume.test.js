// Finishing a correction the walker was left owing.
//
// The debt is real in every case below: a walker is buried under a floor and
// given a step budget too small to settle back down, and `moveRegionProbe`
// reports what it could not pay. Nothing here fabricates a `pendingLift`,
// because a fabricated one is exactly what this operation must refuse.
//
// The load-bearing check is REPEATED PARTIAL RESUMES EQUAL THE WHOLE. One call
// with a budget that finishes the job, against a sequence of one-step calls
// that grind through the same residual, must land on the same point with the
// same camera. If they differ, the residual is not being carried -- it is being
// re-derived at each endpoint, which is the bug this shape exists to prevent.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileRegionWorld } from './engine/world/region-world.js';
import {
  moveRegionProbe, resumeRegionCorrection, CORRECTION_RESUME_DEFAULTS,
} from './engine/world/region-motion.js';
import { createCameraFrame } from './engine/world/camera-frame.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
const near = (a, b, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`);

const document = JSON.parse(readFileSync('levels/fixtures/s3-room.nil.json', 'utf8'));
const fresh = () => compileRegionWorld(document);
const room = fresh();
const sphere = room.regions.get('sphere');

/** A state at an authored chart point, aimed along the region's own forward. */
function stateAt(world, chart, speed = 2.6) {
  const space = world.regions.get('sphere').space;
  const position = space.decode(chart);
  const basis = space.frame(position);
  const camera = createCameraFrame(space, position, { forward: basis[1], up: basis[2] });
  return { regionId: 'sphere', radius: 0.25, position, camera,
    velocity: [...camera.forward].map((x) => x * speed) };
}
/**
 * THE ORDINARY WAY A SETTLE GOES UNPAID, and the only one worth testing at
 * length: a walker resting on the floor drives into the far wall, is lifted
 * clear so it can slide, and the step budget runs out before it can be put
 * back down. The lift really happened, the walker really is hovering, and the
 * residual really has free space to travel through.
 *
 * The first version of this suite buried the walker INSIDE the floor instead.
 * That produces a debt too, but a degenerate one: the settle direction points
 * into a surface the walker is already 0.35 deep in, so the resume lands on
 * contact after travelling zero, and every property worth checking -- carrying
 * the residual, splitting the work, transporting the camera -- is vacuous.
 * That case is kept below as its own check, where it belongs.
 */
const owing = (world = room, steps = 8) =>
  moveRegionProbe(world, stateAt(world, [0, 1, 0.2501]), 1 / 60, { maxSteps: steps });

test('a debt-carrying result hands back a continuation, and a clean one does not', () => {
  const debt = owing();
  assert.ok(debt.pendingLift, 'the fixture must actually owe a settle');
  const c = debt.continuation;
  assert.ok(c, 'a debt the kernel can finish must come with the authority to finish it');
  assert.equal(c.regionId, 'sphere');
  assert.equal(c.radius, debt.state.radius);
  assert.equal(c.distance, debt.pendingLift.distance);
  assert.equal(c.camera, debt.state.camera, 'the endpoint camera by identity, not by value');
  assert.deepEqual([...c.position], [...debt.state.position]);
  // The residual is a DISTANCE AND A DIRECTION, and the direction is the way
  // the settle travels -- back down the normal it was lifted along.
  near(sphere.space.norm([...c.position], [...c.direction]), 1, 1e-12);
  [...c.direction].forEach((x, i) => near(x, -c.normal[i], 1e-12));
  assert.ok(Object.isFrozen(c) && Object.isFrozen(c.position) && Object.isFrozen(c.direction));

  const clean = moveRegionProbe(room, stateAt(room, [0, -3, 0.3]), 1 / 60);
  assert.equal(clean.status, 'complete');
  assert.equal(clean.pendingLift, null);
  assert.equal(clean.continuation, null, 'nothing owed, nothing to authorise');
  assert.throws(() => resumeRegionCorrection(room, clean), /owes no resumable correction/);
});

test('finishing the correction clears the debt and costs NO gameplay time', () => {
  const debt = owing();
  const done = resumeRegionCorrection(room, debt);
  assert.equal(done.status, 'complete');
  assert.equal(done.pendingLift, null, 'a completed residual clears the debt');
  assert.equal(done.continuation, null, 'and leaves nothing further to authorise');
  // ZERO TIME. The refused request's unspent clock stays discarded; it is not
  // handed to the correction and it is not returned to the caller.
  assert.equal(done.timeConsumed, 0);
  assert.equal(done.timeRemaining, 0);
  assert.deepEqual({ ...done.time }, { travel: 0, rest: 0, correction: 0 });
  assert.ok(debt.timeRemaining > 0, 'the refused frame really did have time left');
  // It MOVED, and it moved the residual rather than a velocity: the distance
  // from the suspended endpoint to the new one IS what the correction walked.
  const travelled = sphere.space.distance([...debt.state.position], [...done.state.position]);
  near(travelled, done.corrected, 1e-9);
  assert.ok(done.corrected > 1e-3, `the correction must actually travel (${done.corrected})`);
  // It landed on the floor a hair short of the full residual, which is what
  // stopping ON a surface rather than passing through it looks like.
  assert.equal(done.detail, 'contact');
  assert.ok(done.corrected <= debt.pendingLift.distance + 1e-15);
  assert.equal(done.crossings, 0);
  assert.equal(done.contactSamples.length, 1);
  assert.equal(done.contactSamples[0].regionId, 'sphere');
});

test('REPEATED PARTIAL RESUMES WALK THE SAME PATH AS ONE WHOLE ONE', () => {
  const whole = resumeRegionCorrection(room, owing());
  assert.equal(whole.status, 'complete');
  assert.ok(whole.corrected > 1e-3);

  let piece = owing(), calls = 0, spent = 0, ground = 0;
  while (piece.pendingLift && calls < 40) {
    const before = piece.pendingLift.distance;
    piece = resumeRegionCorrection(room, piece, { maxSteps: 1 });
    calls++;
    if (piece.status === 'budget-exhausted') {
      spent += piece.corrected;
      // EXACTLY what was walked comes off the residual. "Never grows" is not
      // enough and was not enough: a residual that never shrinks at all
      // satisfies it, and the loop still terminates because the sweep meets the
      // floor anyway -- so the whole and the pieces agree while the bookkeeping
      // is broken. This is the assertion that saw it.
      near(piece.pendingLift.distance, before - piece.corrected, 1e-15);
      if (piece.corrected > 0) ground++;
      assert.ok(piece.continuation, 'a stalled correction keeps its authority at the new point');
    }
  }
  assert.ok(ground > 0, 'at least one partial call must actually travel, or the above is vacuous');
  assert.ok(calls >= 2, `a one-step budget must not finish in one call (took ${calls})`);
  assert.equal(piece.status, 'complete');
  assert.equal(piece.pendingLift, null);
  const gap = sphere.space.distance([...whole.state.position], [...piece.state.position]);
  assert.ok(gap < 1e-12, `whole vs pieces ended ${gap} apart`);
  for (const axis of ['forward', 'up', 'right']) {
    [...whole.state.camera[axis]].forEach((x, i) => near(x, piece.state.camera[axis][i], 1e-12));
  }
  near(spent + piece.corrected, whole.corrected, 1e-12);
  console.log(`  ${calls} one-step resumes vs one whole: ${gap.toExponential(2)} apart`);
});

test('a budget of zero permits zero work, and says so', () => {
  const debt = owing();
  const none = resumeRegionCorrection(room, debt, { maxSteps: 0 });
  assert.equal(none.status, 'budget-exhausted');
  assert.equal(none.detail, 'steps');
  assert.equal(none.corrected, 0);
  near(none.pendingLift.distance, debt.pendingLift.distance, 0);
  // Nothing moved, so the endpoint is where it was -- but the continuation is a
  // NEW one, because the old authority was spent by the attempt.
  assert.deepEqual([...none.state.position], [...debt.state.position]);
  assert.notEqual(none.continuation, debt.continuation);
  assert.throws(() => resumeRegionCorrection(room, debt, { maxSteps: -1 }), /nonnegative integer/);
  assert.throws(() => resumeRegionCorrection(room, debt, { skin: 0 }), /positive finite/);
  assert.equal(CORRECTION_RESUME_DEFAULTS.maxSteps, 24);
});

test('a continuation is spent by use, and cannot be applied twice', () => {
  const debt = owing();
  const first = resumeRegionCorrection(room, debt);
  assert.equal(first.status, 'complete');
  // The same authority, presented again against the state it was issued for.
  const again = resumeRegionCorrection(room, debt);
  assert.equal(again.status, 'stale-continuation');
  assert.equal(again.detail, 'not-issued-or-already-spent');
  assert.deepEqual([...again.state.position], [...debt.state.position], 'and nothing moved');
  assert.equal(again.continuation, null, 'a stale call issues no new authority');
});

test('A FABRICATED CONTINUATION IS NOT AUTHORITY TO MOVE A PLAYER', () => {
  const debt = owing();
  // Field-for-field correct, generous residual, aimed the same way -- and
  // written by the caller rather than issued by the kernel. This is the object
  // that must not work, or `pendingLift` becomes a teleport with a plausible
  // name attached.
  const forged = { ...debt.continuation, distance: 3 };
  const out = resumeRegionCorrection(room, { ...debt, continuation: forged });
  assert.equal(out.status, 'stale-continuation');
  assert.equal(out.detail, 'not-issued-or-already-spent');
  assert.deepEqual([...out.state.position], [...debt.state.position]);
  // Even an exact structural clone of a live continuation is refused.
  const cloned = { ...debt.continuation };
  assert.equal(resumeRegionCorrection(room, { ...debt, continuation: cloned }).status,
    'stale-continuation');
  // ...and the real one still works afterwards, so refusing the clone did not
  // quietly spend it.
  assert.equal(resumeRegionCorrection(room, debt).status, 'complete');
});

test('an edit invalidates the continuation, and no old floor moves a new scene', () => {
  const before = fresh();
  const debt = owing(before);
  assert.ok(debt.continuation);
  // A recompile of the SAME document is a different scene as far as a floor is
  // concerned: the field objects are new and nothing proved the old residual
  // against them.
  const after = compileRegionWorld(document);
  const out = resumeRegionCorrection(after, debt);
  assert.equal(out.status, 'stale-continuation');
  assert.equal(out.detail, 'world-recompiled');
  assert.equal(out.continuation, null);
  assert.deepEqual([...out.state.position], [...debt.state.position]);
  assert.ok(out.pendingLift, 'the debt is still owed; it just cannot be finished here');
  // A moved endpoint is refused too, with the original world.
  const moved = { ...debt, state: { ...debt.state, position: [...debt.state.position].map((x, i) => (i ? x : x + 1e-9)) } };
  assert.equal(resumeRegionCorrection(before, moved).detail, 'endpoint-moved');
  const reframed = { ...debt, state: { ...debt.state, camera: { ...debt.state.camera } } };
  assert.equal(resumeRegionCorrection(before, reframed).detail, 'endpoint-moved');
  const resized = { ...debt, state: { ...debt.state, radius: 0.3 } };
  assert.equal(resumeRegionCorrection(before, resized).detail, 'radius-changed');
});

test('the arguments are checked before anything is moved', () => {
  const debt = owing();
  for (const bad of [null, undefined, {}, { regions: new Map() }]) {
    assert.throws(() => resumeRegionCorrection(bad, debt), /compiled region world/);
  }
  for (const bad of [null, undefined, 'complete', 7]) {
    assert.throws(() => resumeRegionCorrection(room, bad), /region motion result|owes no resumable/);
  }
  assert.throws(() => resumeRegionCorrection(room, { ...debt, continuation: null }),
    /owes no resumable correction/);
  // And the debt survived all of that untouched.
  assert.equal(resumeRegionCorrection(room, debt).status, 'complete');
});

test('a residual pointing into a surface completes where it stands, as the settle would', () => {
  // Buried under the floor: the lift was starved before it got clear, so what
  // is owed points straight back into the solid the walker is already inside.
  // The sweep meets that surface at once and stops there. Zero travelled, debt
  // discharged -- which is exactly what the uninterrupted settle in `moveProbe`
  // does from the same point, and the resume must not invent something kinder.
  const debt = moveRegionProbe(room, stateAt(room, [0, -3, -0.1]), 1 / 60, { maxSteps: 2 });
  assert.ok(debt.pendingLift);
  const clearance = sphere.field.distance([...debt.state.position]) - debt.state.radius;
  assert.ok(clearance < -0.3, `the walker must really be inside the floor (${clearance})`);
  const out = resumeRegionCorrection(room, debt);
  assert.equal(out.status, 'complete');
  assert.equal(out.detail, 'contact');
  assert.equal(out.corrected, 0);
  assert.equal(out.pendingLift, null);
  assert.deepEqual([...out.state.position], [...debt.state.position], 'and nothing moved');
});

// A hatch set flush in the floor, between where the walker rests and where the
// lift puts it. The settle comes back DOWN through the aperture, which is the
// one thing a correction is never allowed to do.
const UNITS = { name: 'design-unit', playerRadius: 0.25 };
const e3 = (id) => ({ id, geometry: { kind: 'e3', curvatureRadius: 1 }, topology: 'cover', extent: 6 });
const hatchScene = {
  format: 'nil-scene', version: 2, id: 'hatch-floor', units: UNITS,
  regions: [e3('room'), e3('under')],
  entities: [
    { id: 'room-start', regionId: 'room', kind: 'spawn', position: [0, 0, 0.25] },
    { id: 'under-start', regionId: 'under', kind: 'spawn', position: [0, 0, 0] },
    { id: 'ground', regionId: 'room', kind: 'plane', position: [0, 0, 0], up: [0, 0, 1] },
    { id: 'wall', regionId: 'room', kind: 'plane', position: [0, 2, 0], up: [0, -1, 0] },
    { id: 'hatch', regionId: 'room', kind: 'anchor', position: [0, 0.03, 0.27],
      forward: [0, 0, 1], up: [0, 1, 0], radius: 0.8 },
    { id: 'under-gate', regionId: 'under', kind: 'anchor', position: [0, 0, 0],
      forward: [0, 0, -1], up: [0, 1, 0], radius: 0.8 },
  ],
  connections: [{ id: 'hatch-link', kind: 'portal', a: 'hatch', b: 'under-gate',
    velocity: 'preserve-speed', scale: 1 }],
};

test('A RESUMED CORRECTION MAY NOT CROSS AN APERTURE, and keeps the debt when it meets one', () => {
  const world = compileRegionWorld(hatchScene);
  const space = world.regions.get('room').space;
  const camera = createCameraFrame(space, [0, 0, 0.25], { forward: [0, 1, 0], up: [0, 0, 1] });
  const debt = moveRegionProbe(world,
    { regionId: 'room', radius: 0.25, position: [0, 0, 0.25], camera, velocity: [0, 4, 0] },
    1 / 60, { maxSteps: 8 });
  assert.ok(debt.pendingLift, 'the walker must be left hovering above the hatch');
  assert.ok(debt.continuation);
  assert.ok(debt.state.position[2] > 0.27, 'and lifted clear ABOVE the aperture');

  const out = resumeRegionCorrection(world, debt);
  assert.equal(out.status, 'unresolved');
  assert.equal(out.detail, 'correction-boundary');
  assert.equal(out.corrected, 0, 'none of a correction that reached an aperture is kept');
  assert.deepEqual([...out.state.position], [...debt.state.position]);
  assert.equal(out.state.camera, debt.state.camera, 'the frame is not rebuilt either');
  assert.ok(out.pendingLift, 'and the debt is exactly what it was');
  near(out.pendingLift.distance, debt.pendingLift.distance, 0);
  assert.equal(out.crossings, 0, 'and nothing crossed');
  assert.equal(out.events.length, 1);
  assert.equal(out.events[0].kind, 'portal');
  assert.equal(out.events[0].portalId, 'hatch-link');
  assert.equal(out.events[0].phase, 'correction');
  // No continuation: pressing again asks the identical question of an
  // unchanged scene and gets the identical answer. The recovery is an edit or
  // a reset, and both belong to the host.
  assert.equal(out.continuation, null);
  console.log(`  settle refused at the hatch, ${debt.pendingLift.distance.toExponential(2)} still owed`);
});

// NOT TESTED, BECAUSE IT IS NOT REACHABLE: a resumed correction meeting the
// CHART EDGE. A settle retraces the lift -- it travels back down the same
// normal, no further than the lift went -- so the only things it can newly
// meet lie strictly between the lifted point and the contact it lifted off.
// The walker was at both of those points and inside the domain at both, and a
// chart extent is a geodesic ball, which is convex: the segment between two
// interior points has no exterior point on it. An aperture CAN sit in that gap,
// which is the check above. A chart edge cannot. The kernel's own settle keeps
// the same `back.event` branch for both, and it is right to -- an unreachable
// branch that refuses is the correct shape -- but a check claiming to exercise
// the domain half of it would be claiming something untrue.

console.log(`correction resume: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
