// Arcade driving on S2 x R. Heading and velocity are in the transported local
// frame. The sphere supplies the lap; height supplies an ordinary jump.
//
// WHY THE HEADING TRICK WORKS, and it is the only thing here that is about the
// geometry rather than about driving: velocity in FRAME components is constant
// along a geodesic, and parallel transport on a sphere carries the frame with
// you -- so holding a constant heading IS a great circle, and holding it all
// the way round brings you back where you started. `s2r.js` makes the same
// claim for walking; this mode is that claim with a throttle on it.
//
// THE LOOP THE MODE IS BUILT ON, and every number in it is measured rather
// than tuned by feel (see race-track.js and racing.test.js):
//
//     drift through the turns   -> charges turbo nine times as fast
//     turbo                     -> the only way to clear a hurdle
//     no turbo                  -> leave the road and go round, at 40% speed
//
// so the corners pay for the jumps. A run that neither boosts nor detours
// stops dead at the first hurdle, which is what used to happen to everyone,
// because nothing said the jump needed turbo.

import * as S from './s2r.js';
import { raceObstacleSDF, RACE_WIDTH } from './race-track.js';

export const RACE_SPEED = 0.85;
export const TURBO_SPEED = 1.5;
export const RACE_LAPS = 3;
export const RACE_JUMP = 2.7;
export const BOOST_COST = 0.30;
export const BOOST_TIME = 0.90;
/** Charge per second: drifting is the only way to earn turbo at any rate. */
export const DRIFT_CHARGE = 0.32;
export const IDLE_CHARGE = 0.035;
/** Off the tarmac you keep this fraction of your speed. The detour's price. */
export const OFF_ROAD = 0.4;

export function makeRacer() {
  return {
    heading: 0, charge: 0.35, boost: 0, drift: 0, jumping: false,
    boosting: false, impact: 0,
  };
}

export const raceSDF = (p) => Math.min(S.s2rSDF(p), raceObstacleSDF(p));

/** True while the player is on the tarmac rather than out on the sphere. */
export const onRoad = (p) =>
  Math.abs(Math.asin(Math.max(-1, Math.min(1, p[1])))) < RACE_WIDTH;

export function raceStep(M, vel, state, input, dt) {
  const next = { ...state };
  const grounded = S.grounded(M, raceSDF);
  const speed = Math.hypot(vel[0], vel[1]);
  const sliding = grounded && input.drift && Math.abs(input.steer) > 0.1 && speed > 0.2;
  next.heading += input.steer * (sliding ? 2.2 : 1.45) * dt;
  next.drift = sliding ? Math.min(1, next.drift + dt * 0.65) : 0;
  next.charge = Math.min(1, next.charge + (sliding ? DRIFT_CHARGE : IDLE_CHARGE) * dt);
  if (input.boost && !state.boosting && next.charge >= BOOST_COST) {
    next.charge -= BOOST_COST;
    next.boost = BOOST_TIME;
  }
  next.boosting = input.boost;
  next.boost = Math.max(0, next.boost - dt);
  const cap = next.boost > 0 ? TURBO_SPEED : RACE_SPEED;
  // The road is the same constant the shader paints and the same one the
  // hurdles are sized against; it lived here as a bare 0.29 as well, which is
  // two places for one number in a file pair that exists to have one.
  const target = Math.max(0, input.throttle) * cap * (onRoad(S.point(M)) ? 1 : OFF_ROAD);
  const grip = 1 - Math.exp(-(sliding ? 2 : grounded ? 7 : 1.5) * dt);
  const v = [
    vel[0] + (Math.cos(next.heading) * target - vel[0]) * grip,
    vel[1] + (Math.sin(next.heading) * target - vel[1]) * grip,
    vel[2],
  ];
  if (grounded && input.jump && !state.jumping) v[2] = RACE_JUMP;
  v[2] -= S.S2R_G * dt;
  next.jumping = input.jump;
  const [moved, fallen] = S.s2rStep(M, v, dt);
  const [out, result] = S.s2rCollide(moved, fallen, raceSDF);
  next.impact = Math.max(0, state.impact - dt);
  // A collision that took more than a third of the HORIZONTAL speed. Landing
  // does not trigger it, because the floor's normal is vertical and s2rCollide
  // only removes the component along the normal.
  if (Math.hypot(result[0], result[1]) < Math.hypot(fallen[0], fallen[1]) * 0.65) {
    next.impact = 0.35;
  }
  return [out, result, next];
}

/**
 * Gates per lap, and the count is constrained from three directions at once.
 *
 * A GATE MUST NOT OVERLAP ITS NEIGHBOUR. Twelve of radius 0.40 sat 0.524 apart
 * around the equator -- a diameter of 0.80 in a gap of 0.52 -- so the course
 * was a continuous tunnel of interpenetrating rings rather than a line of
 * checkpoints, and on screen it read as noise. Ten of radius 0.30 sit 0.628
 * apart, which clears.
 *
 * A GATE MUST NOT LAND ON A HURDLE. Those are at a quarter and three quarters
 * of the way round, so a count that divides the lap into quarters puts a gate
 * exactly on one. Ten does not: 2 pi / 10 never hits pi / 2.
 *
 * AND A GATE SHOULD BE THE ROAD'S WIDTH, not wider. At 0.40 against a road
 * half-width of 0.29 you could be off the tarmac and still score, so the two
 * instructions the mode gives -- stay on the road, take the gates -- pulled
 * apart. At 0.30 they are the same instruction.
 */
export const RACE_GATES = 10;
export const RACE_GATE_R = 0.30;
/**
 * The gate's centre height is its own radius, so the ring stands ON the floor
 * instead of half buried -- the same rule `s2r.js` records for the lap course,
 * where 0.35 against a radius of 0.55 dipped the drawn loop 0.20 underground.
 */
export const RACE_GATE_Z = RACE_GATE_R;

/**
 * Three ordered laps. Repeated positions are intentional; order prevents
 * shortcuts -- and here, unlike in the hyperbolic courses, it also prevents
 * running the lap BACKWARDS, since every gate would otherwise count again.
 *
 * The gates ride a great circle with a small latitude wobble so the line is
 * not a dead straight run, but the crossing PLANE is the equator's, which is
 * what makes `sdot(p, N)` change sign exactly at the gate's arc. The plane
 * test is directional; `gateCrossed` then checks the full distance, which is
 * what rejects the antipodal crossing of the same plane half a world away.
 *
 * Gate i sits at arc (i+1) * 2 pi / n, so the LAST one of each lap is back at
 * the start and finishing means arriving where you set off. Skipping i = 0 is
 * the guard `modes.geodesicCourse` and `s2r.lapCourse` both need: a gate
 * exactly on the start line is crossed on the first substep.
 */
export function raceCourse() {
  const hoops = [];
  for (let lap = 0; lap < RACE_LAPS; lap++) {
    for (let i = 0; i < RACE_GATES; i++) {
      const t = (i + 1) * 2 * Math.PI / RACE_GATES;
      // Kept under (road - gate) so a gate never hangs off the tarmac.
      const w = 0.06 * Math.sin(3 * t);
      const at = [Math.sin(t) * Math.cos(w), Math.sin(w), RACE_GATE_Z,
        Math.cos(t) * Math.cos(w)];
      hoops.push({ at, N: [Math.cos(t), 0, 0, -Math.sin(t)], r: RACE_GATE_R, t, lap });
    }
  }
  return {
    kind: 'race',
    hoops,
    crossed: (p0, p1, gate) => S.sdot(p0, gate.N) < 0 && S.sdot(p1, gate.N) >= 0
      && S.gateCrossed(p0, p1, gate),
  };
}
