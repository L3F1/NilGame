// Integration contract: selecting an adapter must preserve the old world's
// trajectory, isolate player state, and keep positions on the right manifold.
import assert from 'node:assert/strict';
import { worldMotionFor } from './world-motion.js';
import { SPACES } from './spaces.js';
import * as S3 from './s3.js';
import * as H2R from './h2r.js';
import * as S2R from './s2r.js';

let passed = 0, failed = 0;
function check(name, test) {
  try { test(); passed++; console.log(`ok   ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

check('every playable geometry explicitly selects a motion path', () => {
  for (const space of SPACES) {
    const motion = worldMotionFor(space.key);
    if (space.key === 'h3') assert.equal(motion, null);
    else assert.equal(typeof motion.step, 'function');
  }
  for (const key of ['e3', 'toString', '__proto__', undefined]) {
    assert.throws(() => worldMotionFor(key), /No world motion adapter/);
  }
});

// These are the pre-extraction main.js call sequences, deliberately kept
// independent of the adapter table so swapped implementations fail the test.
const previousStep = {
  s3(M, vel, want, jump, dt) {
    vel = S3.s3Control(vel, want, dt);
    [M, vel] = S3.s3Step(M, vel, dt);
    return S3.s3Collide(M, vel, S3.s3SDF);
  },
  h2r(M, vel, want, jump, dt) {
    vel = H2R.h2rFall(vel, want, dt);
    [M, vel] = H2R.stepFall(M, vel, dt);
    return H2R.h2rCollide(M, vel, H2R.h2rSDF);
  },
  s2r(M, vel, want, jump, dt) {
    const onGround = S2R.grounded(M, S2R.s2rSDF);
    if (onGround && jump) vel = S2R.jump(vel);
    vel = S2R.s2rControl(vel, want, onGround, dt);
    [M, vel] = S2R.s2rStep(M, vel, dt);
    return S2R.s2rCollide(M, vel, S2R.s2rSDF);
  },
};

for (const key of ['s3', 'h2r', 's2r']) {
  const motion = worldMotionFor(key);
  check(`${key}: spawn arrays belong to each player`, () => {
    const first = motion.spawn(), second = motion.spawn();
    const saved = JSON.stringify(second);
    first.M[0] = 99; first.vel[0] = 99;
    assert.equal(JSON.stringify(second), saved);
    assert.equal(JSON.stringify(motion.spawn()), saved);
  });
  check(`${key}: 240 substeps match the existing motion exactly`, () => {
    const start = motion.spawn();
    let M = start.M, vel = start.vel;
    let refM = M.slice(), refV = vel.slice();
    for (let i = 0; i < 240; i++) {
      const dt = 1 / 120;
      const want = motion.input === 'flight'
        ? [Math.cos(i * .03) * .8, Math.sin(i * .03) * .8, .6]
        : [Math.cos(i * .03), Math.sin(i * .03)];
      const jump = i % 90 === 0;
      const before = JSON.stringify([M, vel, want]);
      const next = motion.step(M, vel, want, jump, dt);
      assert.equal(JSON.stringify([M, vel, want]), before, 'step mutated caller state');
      [M, vel] = next;
      [refM, refV] = previousStep[key](refM, refV, want, jump, dt);
      assert.deepEqual([M, vel], [refM, refV]);
      assert.ok([...M, ...vel].every(Number.isFinite));
      const p = motion.point(M);
      const form = key === 's3' ? p.reduce((sum, x) => sum + x * x, 0)
        : key === 'h2r' ? H2R.hdot(p, p) : S2R.sdot(p, p);
      assert.ok(Math.abs(form - (key === 'h2r' ? -1 : 1)) < 1e-7);
    }
  });
}

check('spawn heights and cameras match each world', () => {
  assert.deepEqual(worldMotionFor('s3').spawn().M, S3.S3G.IDENTITY);
  assert.deepEqual(worldMotionFor('h2r').spawn().M, H2R.dropperStart());
  assert.equal(worldMotionFor('h2r').spawn().pitch, -1.15);
  assert.deepEqual(worldMotionFor('s2r').spawn().M, S2R.lapStart());
  assert.equal(worldMotionFor('s2r').spawn().pitch, 0);
});
check('courses use their own geometry', () => {
  assert.equal(worldMotionFor('s3').course, null);
  assert.equal(worldMotionFor('h2r').course, H2R.dropperCourse);
  assert.equal(worldMotionFor('s2r').course, S2R.lapCourse);
});
check('jump affects the lap course but cannot steer the dropper vertically', () => {
  for (const key of ['s2r', 'h2r']) {
    const motion = worldMotionFor(key), spawn = motion.spawn();
    const [, walking] = motion.step(spawn.M, spawn.vel, [0, 0], false, .01);
    const [, jumping] = motion.step(spawn.M, spawn.vel, [0, 0], true, .01);
    if (key === 's2r') assert.ok(jumping[2] > walking[2]);
    else assert.deepEqual(jumping, walking);
  }
});
console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
