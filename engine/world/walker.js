// Gravity and ground contact for a finite-radius probe.
//
// This is the thinnest layer that turns the collision contract into something
// that FEELS like standing on a floor, and it is kept separate from
// collision.js on purpose: that module is geometry, this one is gameplay
// policy. Which way is down, what counts as ground, whether you may jump --
// none of that is a fact about the metric, and baking it into the solver is
// how a "floor" ends up hardcoded somewhere it cannot be authored.
//
// WHICH WAY IS DOWN IS A CHOICE, not a given. In E3 the obvious answer is -z
// and that is the default here, but the caller passes it, because in H3 there
// is no canonical down at all -- CLAUDE.md's whole "Height and gravity"
// section is about that, and the closed 3-manifold admits no invariant
// unit-gradient height function. So `up` is a parameter and always will be.
//
// GROUNDED IS A CONTACT TEST, NOT A HEIGHT TEST. Asking "is z small" needs a
// floor at a known place; asking "did I touch something facing up" works for
// a ramp, a ball, a ceiling you are standing under in another geometry, and
// anything an author builds later.
import { moveProbe, clearance } from './collision.js';

export const DEFAULT_GRAVITY = 9.0;
// cos of the steepest slope that still counts as ground. 0.5 is 60 degrees:
// generous enough to stand on the shoulder of a ball, steep enough that a
// near-vertical wall never reads as a floor you can jump from.
export const GROUND_COS = 0.5;

/**
 * One step of walking under gravity.
 *
 * `want` is the desired HORIZONTAL velocity, already in world axes -- the host
 * has a camera and this does not. Vertical motion belongs to gravity and to
 * `jump`, so a walker cannot fly by holding forward while looking up.
 *
 * Returns the new state plus `grounded` and the contacts met, so a host can
 * play a sound, draw a decal or refuse a second jump without re-deriving any
 * of it.
 */
export function stepWalker(field, space, state, dt, {
  up = [0, 0, 1], gravity = DEFAULT_GRAVITY, groundCos = GROUND_COS,
  jump = false, jumpSpeed = 4.0, want = [0, 0, 0],
} = {}) {
  const { position, radius } = state;
  let velocity = state.velocity.slice();

  const along = (v) => v[0] * up[0] + v[1] * up[1] + v[2] * up[2];
  const horizontalOf = (v) => {
    const n = along(v);
    return [v[0] - n * up[0], v[1] - n * up[1], v[2] - n * up[2]];
  };

  // Horizontal control is authoritative: the player asked for it, so they get
  // it. Vertical is integrated, because gravity is the thing that has state.
  const vertical = along(velocity);
  const flat = horizontalOf(want);
  let vz = vertical - gravity * dt;
  if (jump && state.grounded) vz = jumpSpeed;
  velocity = [
    flat[0] + vz * up[0],
    flat[1] + vz * up[1],
    flat[2] + vz * up[2],
  ];

  const moved = moveProbe(field, space, { position, velocity, radius }, dt);

  // Ground is whatever we touched that faces up enough to stand on.
  let grounded = false;
  for (const n of moved.contacts) {
    if (along(n) >= groundCos) { grounded = true; break; }
  }
  // Standing still on a floor produces no contact at all once the probe has
  // settled, because there is no motion left to sweep. So also test the room
  // directly below: without this, `grounded` flickers off the moment you stop
  // and a jump becomes unreliable in exactly the situation you jump from.
  if (!grounded) {
    const probeDown = [-up[0], -up[1], -up[2]];
    const reach = Math.max(1e-3, gravity * dt * dt + 1e-3);
    const below = space.step(moved.position, probeDown, reach);
    if (clearance(field, below, radius) <= 0) {
      const n = field.normal(below);
      if (n && along(n) >= groundCos) grounded = true;
    }
  }

  let out = moved.velocity;
  // Once grounded, stop accumulating downward speed. Left alone, `vz` grows
  // without bound while resting -- the probe never moves, so nothing ever
  // cancels it, and the first step off a ledge launches you at terminal
  // velocity accumulated over the whole time you stood still.
  if (grounded && along(out) < 0) {
    const n = along(out);
    out = [out[0] - n * up[0], out[1] - n * up[1], out[2] - n * up[2]];
  }
  return {
    position: moved.position, velocity: out, radius,
    grounded, contacts: moved.contacts, stalled: moved.stalled,
  };
}
