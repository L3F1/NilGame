// MUSE-60: sphere-exit portal-approach truth (Node-only, no engine changes).
//
// Fixture: levels/fixtures/connected-global.nil.json via compileConnectedCoverWorld.
// Portal under test: leave-sphere, sphere-exit (sphere) -> flat-return (flat).
// Starts are built physically: +/-1 unit along the portal normal from the
// center with space.expAt, aimed with space.transport; cameras via
// createCameraFrame. Body radius 0.25, aperture radius 0.9.
//
// Intended behavior pinned here:
//   front-center exits; backside never crosses; a rim ray the eye sees
//   (radial .7, zero-radius sight) is refused for the .25 body; radial .6 fits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileConnectedCoverWorld } from './engine/world/connected-cover-world.js';
import { traceRegionSight } from './engine/world/region-sight.js';
import { moveRegionProbe } from './engine/world/region-motion.js';
import { createCameraFrame } from './engine/world/camera-frame.js';

const doc = JSON.parse(fs.readFileSync('levels/fixtures/connected-global.nil.json'));
const world = compileConnectedCoverWorld(doc);
const portal = world.portals.find((p) => p.fromId === 'sphere-exit' && p.toRegionId === 'flat');
assert.ok(portal, 'sphere-exit -> flat portal must exist');
assert.equal(portal.radius, 0.9);
const BODY = world.spawn().radius;
assert.equal(BODY, 0.25);

const region = world.regions.get('sphere');
const space = region.space;
const center = portal.center.slice();
const normal = portal.normal.slice();
assert.ok(Math.abs(space.norm(center, normal) - 1) < 1e-9, 'portal normal is unit');
const rd = portal.renderData();
const lateral = space.normalize(center, rd.right);
const up0 = space.normalize(center, rd.up);
assert.ok(Math.abs(space.dot(center, lateral, normal)) < 1e-9, 'lateral ⊥ normal');
assert.ok(Math.abs(space.dot(center, up0, normal)) < 1e-9, 'up ⊥ normal');

// axial: signed units along +normal (front, entering side). radial: aperture offset.
function start(axial, radial) {
  const v = normal.map((x, i) => x * axial + lateral[i] * radial);
  const pos = space.expAt(center, v);
  const inward = normal.map((x) => -Math.sign(axial) * x);
  const toward = space.normalize(pos, space.transport(center, pos, inward));
  const upT = space.transport(center, pos, up0);
  const camera = createCameraFrame(space, pos, { forward: toward, up: upT });
  return { regionId: 'sphere', position: pos, velocity: toward.map((x) => x * 2), radius: BODY, camera };
}
const run = (state) => moveRegionProbe(world, state, 1.5);

// 1. Front-center exits the sphere.
{
  const res = run(start(1, 0));
  assert.equal(res.state.regionId, 'flat', `front-center must exit, got ${res.state.regionId}`);
  assert.ok(res.crossings >= 1, 'front-center must record a crossing');
}

// 2. Backside approach never crosses (stays in sphere, no crossing).
{
  const res = run(start(-1, 0));
  assert.equal(res.state.regionId, 'sphere', `backside must not exit, got ${res.state.regionId}`);
  assert.equal(res.crossings, 0, 'backside must record no crossing');
}

// 3. Front radial .6 fits the body (.6+.25=.85<.9): exits.
{
  const res = run(start(1, 0.6));
  assert.equal(res.state.regionId, 'flat', `radial .6 must exit, got ${res.state.regionId}`);
}

// 4. Front radial .7 does not fit the body (.7+.25=.95>.9): refused, stays.
{
  const res = run(start(1, 0.7));
  assert.equal(res.state.regionId, 'sphere', `radial .7 body must be refused, got ${res.state.regionId}`);
  assert.equal(res.crossings, 0, 'radial .7 body must record no crossing');
}

// 5. Zero-radius sight sees the .7 rim crossing the body is refused:
//    region-sight calls portal.crossing with radius 0 (region-sight.js).
{
  const s = start(1, 0.7);
  const dir = s.velocity.map((x) => x / Math.hypot(...s.velocity));
  const sight = traceRegionSight(world,
    { regionId: 'sphere', position: s.position, direction: dir }, { maxDistance: 5 });
  assert.ok(sight.crossings.length >= 1, `rim sight must cross, got ${JSON.stringify(sight.status)}`);
  assert.equal(sight.crossings[0].id, 'leave-sphere');
  const seen = portal.crossing(s.position, dir, 5, 0);
  const felt = portal.crossing(s.position, dir, 5, BODY);
  assert.ok(seen, 'zero-radius crossing at radial .7 must exist');
  assert.equal(felt, null, 'body-radius crossing at radial .7 must be refused');
}

// 6. Existing straight world.spawn route still exits (enter + leave sphere).
{
  let st = world.spawn();
  let crossings = 0;
  let end = null;
  for (let i = 0; i < 200; i++) {
    const res = moveRegionProbe(world,
      { ...st, velocity: st.camera.forward.map((x) => x * 4) }, 0.25);
    st = res.state;
    crossings += res.crossings;
    if (res.status !== 'complete') { end = res; break; }
  }
  assert.ok(crossings >= 2, `spawn route must cross twice, got ${crossings}`);
  assert.equal(st.regionId, 'flat', `spawn route must end in flat, got ${st.regionId}`);
  // The straight ray then meets the flat-target ball and stops; that benign
  // stop is expected. A crossing refusal would be 'blocked-exit'/'unresolved'.
  if (end) assert.equal(end.status, 'stopped', `spawn route must only stop, got ${end.status}`);
}

console.log('portal approach truth: front-center exits, backside refused, '
  + 'rim .6 exits / .7 body refused but sight crosses, spawn route exits');
