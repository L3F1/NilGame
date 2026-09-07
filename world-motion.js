// Motion adapters for the worlds without a quotient. No DOM or mutable session
// globals. M and velocity belong to the caller; each step returns new values.
// A packed product placement must be manipulated by product operations, never
// by a generic mat4 multiply. Each adapter keeps that choice explicit.
import { S3G, s3SDF, s3Control, s3Step, s3Collide } from './s3.js';
import * as H2R from './h2r.js';
import * as S2R from './s2r.js';
import * as E3T from './e3t.js';

// Every adapter takes a trailing `env` describing what the OPTIONS have
// selected inside this geometry, and only the flat one reads it. E^3/Lambda is
// the first geometry here whose one shader program serves TWO manifolds -- the
// slab and the 3-torus, chosen by the same `mode` option the hyperbolic build
// uses -- so its spawn, its input model and its collision world all depend on
// something the key alone does not say.
const DEFAULT_ENV = Object.freeze({ open: false });

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
  // E^3 / Lambda. Two manifolds, one program, one adapter: walking on a floor
  // whose plan wraps in x and y, or free flight in the 3-torus where it wraps
  // in z as well and there is no floor left to stand on.
  e3t: Object.freeze({
    input: 'floor',
    inputFor: (env) => (env.open ? 'flight' : 'floor'),
    point: E3T.point,
    course: E3T.hoopCourse,
    spawn: (env) => (env.open
      ? { vel: [0, 0, 0], ...E3T.hoopStart() }
      : { M: E3T.slabStart(), vel: [0, 0, 0], yaw: 0, pitch: 0 }),
    step(M, vel, want, jump, dt, env = DEFAULT_ENV) {
      if (env.open) {
        // The 3-torus, with gravity OFF by default -- see e3t.js on why the
        // 3-torus is the one world here where a constant down field is
        // perfectly well defined and has no potential whatsoever. Turned on,
        // this is an endless fall through a finite room.
        const v = E3T.e3tFly(vel, want, dt, env.gravity ? E3T.E3T_G : 0);
        const [nextM, nextV] = E3T.e3tStep(M, v, dt, E3T.MODE.CUBE);
        return E3T.e3tCollide(nextM, nextV, E3T.cubeSDF);
      }
      const onGround = E3T.grounded(M, E3T.slabSDF);
      const v = onGround && jump ? E3T.jump(vel) : vel;
      const driven = E3T.e3tControl(v, want, onGround, dt);
      const [nextM, nextV] = E3T.e3tStep(M, driven, dt, E3T.MODE.SLAB);
      return E3T.e3tCollide(nextM, nextV, E3T.slabSDF);
    },
  }),
});

/** Which input model an adapter wants, given what the options have selected. */
export function motionInput(motion, env = DEFAULT_ENV) {
  return motion.inputFor ? motion.inputFor(env) : motion.input;
}

/** The SDF the adapter collides against, for callers that need it directly. */
export function motionSDF(key, env = DEFAULT_ENV) {
  if (key === 's3') return s3SDF;
  if (key === 'h2r') return H2R.h2rSDF;
  if (key === 's2r') return S2R.s2rSDF;
  if (key === 'e3t') return env.open ? E3T.cubeSDF : E3T.slabSDF;
  return null;
}

/** null means the existing H3 simulation; unknown keys are implementation errors. */
export function worldMotionFor(key) {
  if (!Object.hasOwn(MOTION, key)) throw new Error(`No world motion adapter: ${key}`);
  return MOTION[key];
}
