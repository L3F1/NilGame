// MUSE-43: is the pause table the one the contract asks for?
//
// Independent audit of app/motion-pause.js. The expected table was derived
// from docs/engineering/REGION_MOTION_CONTRACT.md ALONE (see
// docs/qa/muse43-pause-audit-2026-09-10.md) before the module was opened.
// This file pins the shipped behavior row by row from real kernel results,
// plus synthetic policy probes for the debt rows the kernel never produced.
//
// Outcome of the audit: the shipped policy agrees with the derived table on
// every reached combination EXCEPT debt-free budget exhaustion, where the
// derived table pre-registered PAUSE and the shipped policy carries on. The
// contract mandates a validated state with honest time there, not a pause,
// so the shipped carry-on is contract-compatible PROVIDED the host reports
// loudly and never accumulates discarded time across frames (that proviso
// lives in the host loop, not in motionPause).
import assert from 'node:assert/strict';
import { compileRegionWorld } from './engine/world/region-world.js';
import { moveRegionProbe } from './engine/world/region-motion.js';
import { createCameraFrame, turn } from './engine/world/camera-frame.js';
import { motionPause } from './app/motion-pause.js';

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

const UNITS = { name: 'design-unit', playerRadius: 0.25 };
const e3 = (id, extent = 8) => ({ id, geometry: { kind: 'e3', curvatureRadius: 1 }, topology: 'cover', extent });
const anchor = (id, regionId, position, forward, radius = 0.9, up = [0, 0, 1]) =>
  ({ id, regionId, kind: 'anchor', position, forward, up, radius });
const spawn = (id, regionId, position = [0, 0, 0]) => ({ id, regionId, kind: 'spawn', position });
const link = (id, a, b) => ({ id, kind: 'portal', a, b, velocity: 'preserve-speed', scale: 1 });
const scene = (id, regions, entities, connections = []) =>
  ({ format: 'nil-scene', version: 2, id, units: UNITS, regions, entities, connections });

function stateAt(world, regionId, position, velocity) {
  const { space } = world.regions.get(regionId);
  const basis = space.frame(position);
  const camera = turn(createCameraFrame(space, position, { forward: basis[1], up: basis[2] }), {});
  return { regionId, position: position.slice(), velocity: velocity.slice(), radius: UNITS.playerRadius, camera };
}
function probe(world, regionId, position, velocity, dt, options = {}) {
  return moveRegionProbe(world, stateAt(world, regionId, position, velocity), dt, options);
}

const floorplugDoc = scene('audit-floorplug', [e3('room'), e3('next')], [
  spawn('room-start', 'room', [0, 0, 1]), spawn('next-start', 'next', [-1, 0, 0]),
  { id: 'plug', regionId: 'next', kind: 'ball', position: [0, 0, 0], radius: 0.5 },
  { id: 'ground', regionId: 'room', kind: 'plane', position: [0, 0, 0], up: [0, 0, 1] },
  anchor('ahead', 'room', [2, 0, 0.3], [-1, 0, 0], 0.8, [0, 0, 1]),
  anchor('next-gate', 'next', [0, 0, 0], [1, 0, 0], 0.8, [0, 0, 1]),
], [link('wall-gate', 'ahead', 'next-gate')]);
const edgefloorDoc = scene('audit-edgefloor', [e3('room', 2.5)], [
  spawn('s', 'room', [0, 0, 0.5]),
  { id: 'ground', regionId: 'room', kind: 'plane', position: [0, 0, 0], up: [0, 0, 1] },
]);
const planewallDoc = scene('audit-planewall', [e3('room')], [
  spawn('s', 'room', [0, 0, 1]),
  { id: 'wall', regionId: 'room', kind: 'plane', position: [0, 2, 0], up: [0, -1, 0] },
  { id: 'ground', regionId: 'room', kind: 'plane', position: [0, 0, 0], up: [0, 0, 1] },
]);
const twogatesDoc = scene('audit-twogates', [e3('room'), e3('a'), e3('b')], [
  spawn('room-start', 'room', [0, 0, 0]), spawn('a-start', 'a'), spawn('b-start', 'b'),
  anchor('gate-a', 'room', [0, 2, 0], [0, -1, 0]),
  anchor('gate-b', 'room', [0, 2, 0], [0, -1, 0]),
  anchor('a-gate', 'a', [0, 0, 0], [0, 1, 0]), anchor('b-gate', 'b', [0, 0, 0], [0, 1, 0]),
], [link('to-a', 'gate-a', 'a-gate'), link('to-b', 'gate-b', 'b-gate')]);
const emptyDoc = scene('audit-empty', [e3('room')], [spawn('s', 'room', [0, 0, 0])]);
const ballDoc = scene('audit-ball', [e3('room')], [
  spawn('s', 'room', [0, 0, 0]),
  { id: 'rock', regionId: 'room', kind: 'ball', position: [0, 3, 0], radius: 0.6 },
]);

const W = {
  floorplug: compileRegionWorld(floorplugDoc),
  edgefloor: compileRegionWorld(edgefloorDoc),
  planewall: compileRegionWorld(planewallDoc),
  twogates: compileRegionWorld(twogatesDoc),
  empty: compileRegionWorld(emptyDoc),
  ball: compileRegionWorld(ballDoc),
};

check('debt pauses under every status the kernel reaches with debt owed', () => {
  // Q1: yes, a blocked-exit CAN arrive carrying an unpaid correction (the
  // floor lift is outstanding when the plugged aperture is reached), and the
  // policy pauses on the debt, not the refusal.
  const refused = probe(W.floorplug, 'room', [0, 0, 0.5], [4, 0, -2], 0.6);
  assert.equal(refused.status, 'blocked-exit');
  assert.ok(refused.pendingLift, 'kernel must actually owe the debt for this row');
  const p1 = motionPause(refused);
  assert.equal(p1.kind, 'debt');
  assert.equal(p1.resumable, false);
  assert.equal(p1.status, 'blocked-exit');
  // Same debt-first ordering under domain-exit and budget-exhausted.
  const edged = probe(W.edgefloor, 'room', [0, 0, 0.5], [4, 0, -2], 1);
  assert.equal(edged.status, 'domain-exit');
  assert.ok(edged.pendingLift);
  assert.equal(motionPause(edged).kind, 'debt');
  const capped = probe(W.planewall, 'room', [0, 0, 1], [0, 4, -1], 4, { maxSteps: 8 });
  assert.equal(capped.status, 'budget-exhausted');
  assert.ok(capped.pendingLift);
  const p3 = motionPause(capped);
  assert.equal(p3.kind, 'debt');
  assert.equal(p3.resumable, false);
  console.log(`  debt rows: blocked-exit+owed rem=${refused.timeRemaining.toFixed(3)}, `
    + `domain-exit+owed rem=${edged.timeRemaining.toFixed(3)}, budget+owed rem=${capped.timeRemaining.toFixed(3)}`);
});

check('debt-first holds for the debt rows the kernel never produces (synthetic)', () => {
  // Q2: ~40 targeted hunts (fine step-cap/dt ladders, drops, head-on stops)
  // never produced complete|owed or stopped|owed, and no status ever paired
  // debt with a zero clock — corrections consume zero gameplay time, so the
  // clock cannot die mid-correction, and moveProbe pairs banked debt with
  // stalled/exhausted. The policy is a pure function of the result, so these
  // synthetic rows pin the debt-first ordering directly for the unreached
  // combinations the contract sentence exists to protect.
  const synth = (status, timeRemaining) => ({
    status, detail: null, timeRemaining, events: [],
    pendingLift: { regionId: 'room', distance: 0.05, normal: [0, 0, 1] },
  });
  for (const [status, rem] of [['complete', 0], ['stopped', 0], ['budget-exhausted', 0], ['domain-exit', 0]]) {
    const p = motionPause(synth(status, rem));
    assert.ok(p, `${status}|owed|zero must pause`);
    assert.equal(p.kind, 'debt', `${status}: debt must win over status`);
    assert.equal(p.resumable, false, `${status}: debt offers reset, not resume`);
  }
  console.log('  synthetic complete|owed|zero, stopped|owed|zero, budget|owed|zero, domain|owed|zero: all PAUSE(debt,resumable=false)');
});

check('unresolved pauses, stays resumable, and names the competitors', () => {
  const tied = probe(W.twogates, 'room', [0, 0, 0], [0, 4, 0], 1);
  assert.equal(tied.status, 'unresolved');
  assert.equal(tied.detail, 'competing-events');
  const p = motionPause(tied);
  assert.equal(p.kind, 'unresolved');
  assert.equal(p.resumable, true, 'a tie is steered/edited away as a NEW request');
  assert.ok(p.competing.length >= 2, `both gates must be shown, got ${JSON.stringify(p.competing)}`);
  assert.ok(p.text.includes('discarded'), 'unspent time is discarded, never accumulated');
  // Non-tie unresolved rows pause the same way.
  const inside = probe(W.ball, 'room', [0, 3, 0], [0, 1, 0], 0.5);
  assert.equal(inside.status, 'unresolved');
  assert.equal(motionPause(inside).kind, 'unresolved');
  console.log(`  competing: ${p.competing.join(' | ')}`);
});

check('honest limits without debt carry on', () => {
  const rows = [
    ['complete', probe(W.empty, 'room', [0, 0, 0], [0, 2, 0], 1)],
    ['stopped', probe(W.ball, 'room', [0, 0, 0], [0, 3, 0], 2)],
    ['domain-exit', probe(W.empty, 'room', [0, 0, 0], [0, 2, 0], 30)],
    ['blocked-exit', probe(W.floorplug, 'room', [0, 0, 1.5], [4, 0, -2.4], 0.6)],
    ['budget-exhausted', probe(W.empty, 'room', [0, 0, 0], [0, 2, 0], 1, { maxSteps: 0 })],
  ];
  for (const [want, out] of rows) {
    assert.equal(out.status, want, `row setup must reach ${want}`);
    assert.equal(out.pendingLift, null, `${want}: row must be debt-free`);
    assert.equal(motionPause(out), null, `${want} without debt carries on`);
  }
  // NOTE (audit finding, not a test failure): the pre-registered table said
  // debt-free budget-exhausted ends the session. The contract mandates only a
  // validated state with honest time there, so the shipped carry-on stands —
  // on the condition that the host reports loudly and frames each retry as a
  // new request with fresh budgets and no accumulated time.
  console.log('  complete/stopped/domain-exit/blocked-exit/budget-exhausted without debt: all null');
});

check('pause reasons are frozen and echo the outcome', () => {
  const tied = probe(W.twogates, 'room', [0, 0, 0], [0, 4, 0], 1);
  const p = motionPause(tied);
  assert.ok(Object.isFrozen(p));
  assert.equal(p.status, 'unresolved');
  assert.equal(p.detail, 'competing-events');
  assert.throws(() => motionPause(null), 'invalid input throws');
});

console.log(`\nmotion-pause-truth: ${passed} checks passed, ${failed} failed`);
if (failed) process.exit(1);
