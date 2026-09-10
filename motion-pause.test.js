// The host's pause policy, judged on results the kernel really produced.
//
// The interesting failure is not "does the policy read a field" -- it is the
// DISCRIMINATION. A budget that ran out is not a pause; a budget that ran out
// leaving a settle unpaid is. A clock that reads zero proves nothing either
// way. So every result below except one clearly-labelled precedence case comes
// out of `moveRegionProbe` itself, from a real fixture, and the test asserts
// which of them end the session and which do not.
//
// Mutation matrix, run against this file when it was written. Every one of
// these is a policy that reads plausibly and is wrong:
//
//   pause never fires ......................... 5 fail
//   debt judged by timeRemaining === 0 ........ 3 fail
//   every status is a pause ................... 4 fail
//   a debt offered as resumable ............... 2 fail
//   status checked before the debt is .. ...... 1 fail
//   only the first competing gate named ....... 1 fail
//
// The last two fail by ONE check each, which is the honest reading: the
// precedence of debt over a tie and the completeness of the competitor list
// each rest on a single assertion, and there is no second angle on them here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileRegionWorld } from './engine/world/region-world.js';
import { moveRegionProbe } from './engine/world/region-motion.js';
import { createCameraFrame } from './engine/world/camera-frame.js';
import { motionPause } from './app/motion-pause.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

const room = compileRegionWorld(JSON.parse(readFileSync('levels/fixtures/s3-room.nil.json', 'utf8')));
const sphere = room.regions.get('sphere');

/**
 * A state at an authored chart point, aimed along the region's own forward.
 *
 * Points INSIDE a solid are used on purpose: an author who drags a wall onto
 * the player, or a spawn that a scene edit buries, is exactly how a walker
 * comes to owe a correction, and the contract has the editor treat that as a
 * pause rather than as a frame to fly out of.
 */
function stateAt(chart, speed = 2.6, aim = [0, 1, 0]) {
  const position = sphere.space.decode(chart);
  const basis = sphere.space.frame(position);
  const camera = createCameraFrame(sphere.space, position, { forward: basis[1], up: basis[2] });
  // The aim is a combination of the region's own basis at the point, so the
  // camera stays canonical and only the wish changes.
  const raw = basis[0].map((x, i) => x * aim[0] + basis[1][i] * aim[1] + basis[2][i] * aim[2]);
  const length = Math.hypot(...raw);
  return { regionId: 'sphere', radius: 0.25, position, camera,
    velocity: raw.map((x) => x * speed / length) };
}

test('an ordinary completed move is not a pause', () => {
  const out = moveRegionProbe(room, stateAt([0, -3, 0.3]), 1 / 60);
  assert.equal(out.status, 'complete');
  assert.equal(motionPause(out), null);
});

test('a budget that ran out with NOTHING owed is not a pause either', () => {
  // This is the discrimination the policy exists for. Exhaustion leaves the
  // last validated state with honest time; the next frame asking again with a
  // fresh budget is a new request, not a replayed one.
  const out = moveRegionProbe(room, stateAt([0, -3, 0.3]), 1 / 60, { maxSteps: 1 });
  assert.equal(out.status, 'budget-exhausted');
  assert.equal(out.detail, 'steps');
  assert.equal(out.pendingLift, null);
  assert.ok(out.timeRemaining > 0, 'and it really did stop early');
  assert.equal(motionPause(out), null);
});

test('a chart edge is a limit, not a session ending', () => {
  // Straight up, out of the top of the chart: the numbers stop there and the
  // walker is halted just inside, with no normal and no invented wall.
  const out = moveRegionProbe(room, stateAt([0, -3, 2], 20, [0, 0, 1]), 1);
  assert.equal(out.status, 'domain-exit');
  assert.equal(out.contactSamples.length, 0, 'a chart edge is not a surface');
  assert.ok(out.timeRemaining > 0);
  assert.equal(motionPause(out), null);
});

test('AN UNPAYABLE SETTLE ENDS THE SESSION, and cannot be resumed', () => {
  // Buried a tenth of a unit under the floor, with two steps to get out: the
  // lift is applied and the settle that would pay it back is not affordable.
  const out = moveRegionProbe(room, stateAt([0, -3, -0.1]), 1 / 60, { maxSteps: 2 });
  assert.equal(out.status, 'budget-exhausted');
  assert.ok(out.pendingLift, 'the kernel must report the debt for the host to see it');
  assert.ok(out.pendingLift.distance > 0);
  const pause = motionPause(out);
  assert.ok(pause, 'an owed correction is a pause whatever the status says');
  assert.equal(pause.kind, 'debt');
  assert.equal(pause.resumable, false, 'there is no correction-resume API to resume with');
  assert.match(pause.text, /correction/i);
  assert.ok(pause.text.includes('sphere'), 'the debt names the region it is owed in');
  assert.ok(pause.text.includes(out.pendingLift.distance.toExponential(3)));
});

test('and the clock is not what gives it away', () => {
  // The contract's exact warning: "an exhausted zero-time correction can
  // coexist with timeRemaining=0. Hosts must inspect status and pendingLift,
  // not just the clock." A host watching only the clock reads this as done.
  const out = moveRegionProbe(room, stateAt([0, -3, -0.1]), 1 / 60, { maxSteps: 2 });
  const spent = moveRegionProbe(room, stateAt([0, -3, 0.3]), 1 / 60);
  assert.ok(motionPause(out), 'owed, and stopped early');
  assert.equal(spent.timeRemaining, 0);
  assert.equal(motionPause(spent), null);
  // Same clock reading, opposite verdicts, is the whole point.
  assert.equal(motionPause({ ...out, timeRemaining: 0 })?.kind, 'debt');
});

test('a degenerate contact is unresolved, and the host may retry it as new work', () => {
  const out = moveRegionProbe(room, stateAt([-1.5, 0, 0.75]), 1 / 60);
  assert.equal(out.status, 'unresolved');
  assert.equal(out.detail, 'degenerate-contact');
  const pause = motionPause(out);
  assert.equal(pause.kind, 'unresolved');
  assert.equal(pause.resumable, true);
  assert.deepEqual([...pause.competing], []);
  assert.match(pause.text, /NEW request|new request/);
  assert.match(pause.text, /discarded/, 'the unspent time is not banked for later');
});

// Two apertures at the same place, which the kernel refuses to order. Built
// here rather than in a fixture because a tie is a defect an author would not
// commit -- and it is the case the contract requires the host to NAME.
const UNITS = { name: 'design-unit', playerRadius: 0.25 };
const region = (id) => ({ id, geometry: { kind: 'e3', curvatureRadius: 1 }, topology: 'cover', extent: 6 });
const anchorAt = (id, regionId, position, forward) =>
  ({ id, regionId, kind: 'anchor', position, forward, up: [0, 0, 1], radius: 0.8 });
const tiedScene = {
  format: 'nil-scene', version: 2, id: 'tied', units: UNITS,
  regions: [region('room'), region('a'), region('b')],
  entities: [
    { id: 'room-start', regionId: 'room', kind: 'spawn', position: [0, 0, 0] },
    { id: 'a-start', regionId: 'a', kind: 'spawn', position: [0, 0, 0] },
    { id: 'b-start', regionId: 'b', kind: 'spawn', position: [0, 0, 0] },
    anchorAt('left', 'room', [0, 2, 0], [0, -1, 0]),
    anchorAt('right', 'room', [0, 2, 0], [0, -1, 0]),
    anchorAt('a-gate', 'a', [0, 0, 0], [0, 1, 0]),
    anchorAt('b-gate', 'b', [0, 0, 0], [0, 1, 0]),
  ],
  connections: [
    { id: 'to-a', kind: 'portal', a: 'left', b: 'a-gate', velocity: 'preserve-speed', scale: 1 },
    { id: 'to-b', kind: 'portal', a: 'right', b: 'b-gate', velocity: 'preserve-speed', scale: 1 },
  ],
};

test('competing gates are named, both of them, so the author can edit either', () => {
  const world = compileRegionWorld(tiedScene);
  const space = world.regions.get('room').space;
  const camera = createCameraFrame(space, [0, 0, 0], { forward: [0, 1, 0], up: [0, 0, 1] });
  const out = moveRegionProbe(world,
    { regionId: 'room', position: [0, 0, 0], velocity: [0, 4, 0], radius: 0.25, camera }, 1);
  assert.equal(out.status, 'unresolved');
  assert.equal(out.detail, 'competing-events');
  assert.equal(out.events.at(-1).competitors.length, 2);
  const pause = motionPause(out);
  assert.equal(pause.kind, 'unresolved');
  assert.equal(pause.resumable, true);
  assert.equal(pause.competing.length, 2);
  for (const id of ['to-a', 'to-b']) {
    assert.ok(pause.text.includes(id), `the conflict must name ${id}`);
  }
  for (const destination of ['a', 'b']) {
    assert.ok(pause.competing.some((c) => c.endsWith(` to ${destination}`)), destination);
  }
});

test('debt outranks a tie, because a tie can be steered away from and a debt cannot', () => {
  // The only constructed result in this file: a REAL debt result with its
  // status and detail replaced by the correction-boundary pair. That
  // combination is reachable in principle -- a lift that runs into an aperture
  // -- and is awkward to stage in a fixture; every other field here is the
  // kernel's own.
  const owed = moveRegionProbe(room, stateAt([0, -3, -0.1]), 1 / 60, { maxSteps: 2 });
  assert.ok(owed.pendingLift);
  const pause = motionPause({ ...owed, status: 'unresolved', detail: 'correction-boundary' });
  assert.equal(pause.kind, 'debt');
  assert.equal(pause.resumable, false);
  assert.ok(pause.text.includes('unresolved/correction-boundary'),
    'and it still reports the status it actually had');
});

test('a result-shaped nothing is refused rather than read as safe', () => {
  for (const bad of [null, undefined, {}, 'complete', { status: 7 }]) {
    assert.throws(() => motionPause(bad), /region motion result/);
  }
  // A pause must never be mutable by whoever displays it.
  const pause = motionPause(moveRegionProbe(room, stateAt([-1.5, 0, 0.75]), 1 / 60));
  assert.throws(() => { pause.resumable = true; }, TypeError);
});

console.log(`motion pause: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
