// Motion adapters for the worlds without a quotient. No DOM or mutable session
// globals. M and velocity belong to the caller; each step returns new values.
// A packed product placement must be manipulated by product operations, never
// by a generic mat4 multiply. Each adapter keeps that choice explicit.
import { S3G, s3SDF, s3Control, s3Step, s3Collide } from './s3.js';
import * as H2R from './h2r.js';
import * as S2R from './s2r.js';

const MOTION = Object.freeze({
  // H3's full kit, quotient folding and carried objects still use physics.js.
  h3: null,
  s3: Object.freeze({
    input: 'flight',
    point: S3G.point,
    course: null,
    spawn: () => ({ M: S3G.IDENTITY.slice(), vel: [0, 0, 0], yaw: 0, pitch: 0 }),
    step(M, vel, want, jump, dt) {
      const v = s3Control(vel, want, dt);
      const [nextM, nextV] = s3Step(M, v, dt);
      return s3Collide(nextM, nextV, s3SDF);
    },
  }),
  h2r: Object.freeze({
    input: 'floor',
    point: H2R.point,
    course: H2R.dropperCourse,
    // Looking down makes the gates visible from the deck.
    spawn: () => ({ M: H2R.dropperStart(), vel: [0, 0, 0], yaw: 0, pitch: -1.15 }),
    step(M, vel, want, jump, dt) {
      const v = H2R.h2rFall(vel, want, dt);
      const [nextM, nextV] = H2R.stepFall(M, v, dt);
      return H2R.h2rCollide(nextM, nextV, H2R.h2rSDF);
    },
  }),
  s2r: Object.freeze({
    input: 'floor',
    point: S2R.point,
    course: S2R.lapCourse,
    spawn: () => ({ M: S2R.lapStart(), vel: [0, 0, 0], yaw: 0, pitch: 0 }),
    step(M, vel, want, jump, dt) {
      const onGround = S2R.grounded(M, S2R.s2rSDF);
      const v = onGround && jump ? S2R.jump(vel) : vel;
      const driven = S2R.s2rControl(v, want, onGround, dt);
      const [nextM, nextV] = S2R.s2rStep(M, driven, dt);
      return S2R.s2rCollide(nextM, nextV, S2R.s2rSDF);
    },
  }),
});

/** null means the existing H3 simulation; unknown keys are implementation errors. */
export function worldMotionFor(key) {
  if (!Object.hasOwn(MOTION, key)) throw new Error(`No world motion adapter: ${key}`);
  return MOTION[key];
}
