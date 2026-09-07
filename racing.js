// Arcade driving on S2 x R. Heading and velocity are in the transported local
// frame. The sphere supplies the lap; height supplies an ordinary jump.
import * as S from './s2r.js';
import { raceObstacleSDF } from './race-track.js';
export const RACE_SPEED = 0.85;
export const TURBO_SPEED = 1.5;
export const RACE_LAPS = 3;
export function makeRacer() {
  return { heading: 0, charge: 0.35, boost: 0, drift: 0, jumping: false,
    boosting: false, impact: 0 };
}
export const raceSDF = (p) => Math.min(S.s2rSDF(p), raceObstacleSDF(p));
export function raceStep(M, vel, state, input, dt) {
  const next = { ...state };
  const grounded = S.grounded(M, raceSDF);
  const speed = Math.hypot(vel[0], vel[1]);
  const sliding = grounded && input.drift && Math.abs(input.steer) > .1 && speed > .2;
  next.heading += input.steer * (sliding ? 2.2 : 1.45) * dt;
  next.drift = sliding ? Math.min(1, next.drift + dt * .65) : 0;
  next.charge = Math.min(1, next.charge + (sliding ? .32 : .035) * dt);
  if (input.boost && !state.boosting && next.charge >= .3) {
    next.charge -= .3; next.boost = .9;
  }
  next.boosting = input.boost;
  next.boost = Math.max(0, next.boost - dt);
  const cap = next.boost > 0 ? TURBO_SPEED : RACE_SPEED;
  const onRoad = Math.abs(Math.asin(S.point(M)[1])) < .29;
  const target = Math.max(0, input.throttle) * cap * (onRoad ? 1 : .4);
  const grip = 1 - Math.exp(-(sliding ? 2 : grounded ? 7 : 1.5) * dt);
  let v = [vel[0] + (Math.cos(next.heading) * target - vel[0]) * grip,
    vel[1] + (Math.sin(next.heading) * target - vel[1]) * grip, vel[2]];
  if (grounded && input.jump && !state.jumping) v[2] = 2.7;
  v[2] -= S.S2R_G * dt;
  next.jumping = input.jump;
  const [moved, fallen] = S.s2rStep(M, v, dt);
  const [out, result] = S.s2rCollide(moved, fallen, raceSDF);
  next.impact = Math.max(0, state.impact - dt);
  if (Math.hypot(result[0], result[1]) < Math.hypot(fallen[0], fallen[1]) * .65) next.impact = .35;
  return [out, result, next];
}

/** Three ordered laps. Repeated positions are intentional; order prevents shortcuts. */
export function raceCourse() {
  const hoops = [];
  for (let lap = 0; lap < RACE_LAPS; lap++) {
    for (let i = 0; i < 12; i++) {
      const t = (i + 1) * Math.PI / 6;
      const w = .10 * Math.sin(3 * t);
      const at = [Math.sin(t) * Math.cos(w), Math.sin(w), .26, Math.cos(t) * Math.cos(w)];
      hoops.push({ at, N: [Math.cos(t), 0, 0, -Math.sin(t)], r: .40, t });
    }
  }
  return { kind: 'race', hoops, crossed: (p0, p1, gate) =>
    S.sdot(p0, gate.N) < 0 && S.sdot(p1, gate.N) >= 0 && S.gateCrossed(p0, p1, gate) };
}
