// MUSE-46: a resumed correction CAN reach the chart edge in S3.
//
// Reproduction of the S3 falsification. The would-be claim "a resumed
// correction cannot reach a chart edge" was already falsified in E3
// (correction-resume.test.js); the S3 case was explicitly unclaimed
// territory. This pins the S3 instance: a wall contact near the edge
// banks a lift, the walker slides tangentially with the debt intact, the
// settle target lands outside the chart, and the resume reports
// unresolved/correction-boundary on a domain event — moving nothing,
// keeping the debt, issuing no continuation.
//
// Mechanism (same as E3, transposed): the wall sits edge-side of the
// walker, so the settle walks back edge-ward; the tangential slide
// carries the endpoint to within one residual of the edge. S3 needed an
// exactly-tangent slide velocity (frame basis with the largest +y
// component); penetrating starts kill the slide, touching starts slide.
import assert from 'node:assert/strict';
import { compileRegionWorld } from './engine/world/region-world.js';
import { moveRegionProbe, resumeRegionCorrection } from './engine/world/region-motion.js';
import { createCameraFrame, turn } from './engine/world/camera-frame.js';

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

check('a resumed correction reaches the S3 chart edge', () => {
  const world = compileRegionWorld({
    format: 'nil-scene', version: 2, id: 's3edge',
    units: { name: 'design-unit', playerRadius: 0.25 },
    regions: [{ id: 'orb', geometry: { kind: 's3', curvatureRadius: 8 }, topology: 'cover', extent: 6 }],
    entities: [
      { id: 's', regionId: 'orb', kind: 'spawn', position: [0, 0, 0] },
      { id: 'wall', regionId: 'orb', kind: 'plane', position: [5.9, 0, 0], up: [-1, 0, 0] },
    ],
    connections: [],
  });
  const space = world.regions.get('orb').space;
  const pos = [...space.decode([5.55, 0, 0])];
  const frame = space.frame(pos);
  const velocity = frame[0].map((x, i) => (x * 8 + frame[1][i] * 6));
  const basis = space.frame(pos);
  const worn = {
    regionId: 'orb', position: pos, velocity, radius: 0.25,
    camera: turn(createCameraFrame(space, pos, { forward: basis[1], up: basis[2] }), {}),
  };
  const owed = moveRegionProbe(world, worn, 0.8, { maxSteps: 56 });
  assert.ok(owed.pendingLift && owed.continuation, 'fixture must owe with continuation');
  assert.ok(space.withinDomain([...owed.state.position]), 'debt endpoint is inside');
  const below = space.step([...owed.state.position],
    owed.continuation.direction, owed.continuation.distance);
  assert.ok(!space.withinDomain(below), 'settle target is outside the chart');
  const out = resumeRegionCorrection(world, owed);
  assert.equal(out.status, 'unresolved');
  assert.equal(out.detail, 'correction-boundary');
  assert.equal(out.events.length, 1);
  assert.equal(out.events[0].kind, 'domain');
  assert.equal(out.events[0].phase, 'correction');
  assert.equal(out.events[0].portalId, null);
  assert.equal(out.corrected, 0, 'refused resume walks nothing');
  assert.ok([...out.state.position].every((x, i) => x === [...owed.state.position][i]));
  assert.ok(out.state.camera === owed.state.camera);
  assert.equal(out.pendingLift.distance, owed.pendingLift.distance, 'debt intact');
  assert.equal(out.continuation, null, 'no continuation re-issued');
  console.log(`  debt=${owed.pendingLift.distance.toExponential(2)} `
    + `r=${space.distance(space.origin, [...owed.state.position]).toFixed(4)}/6 `
    + `event at ${out.events[0].distance.toFixed(4)} along the residual`);
});

console.log(`\nimpossibility-audit: ${passed} checks passed, ${failed} failed`);
if (failed) process.exit(1);
