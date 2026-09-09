// Swept collision for a finite-radius probe, host-free and geometry-neutral.
//
// This is the query boundary the editor needs: the thing you author and the
// thing you walk into must be the SAME field. So this module consumes exactly
// the capabilities docs/rendering-contract.md already defines --
//
//   distance(p)  a DISTANCE BOUND: it may underestimate, never overestimate
//   normal(p)    a SURFACE NORMAL, or null where none is defined
//
// -- and nothing else. It never looks at the document, the renderer or a host
// transform. Anything that satisfies those two can be collided against,
// including a scene the player is editing while standing in it.
//
// WHY CONSERVATIVE ADVANCEMENT RATHER THAN A POINT TEST PER SUBSTEP.
// A point test asks "am I inside now?", which is only true if the step was
// short enough to land inside. CLAUDE.md records the same failure in the
// gameplay kit: "A lethal surface must be tested SWEPT. A 0.16 slab against a
// 0.20 player is a 0.36 hit zone, and one fast substep can start above and end
// below with neither endpoint inside - a point test reports a clean pass
// through rock." Here the probe only ever advances by a distance it has just
// proved is free, so it CANNOT tunnel, at any speed and any time step. A very
// large step costs more iterations, not correctness.
//
// The cost is the classic sphere-tracing weakness, and it is the same one the
// renderer has: a path running nearly parallel to a surface converges
// geometrically and approaches without arriving. That is bounded by `maxSteps`
// and reported as `stalled`. A stall leaves the probe SHORT of where it wanted
// to be, never past a surface, which is the safe direction to fail in.
//
// REQUIREMENT ON THE FIELD, and it is load-bearing: `distance` must be a true
// lower bound on the distance to the surface (1-Lipschitz). A field that
// OVERESTIMATES lets a step jump through geometry, which is precisely what
// level.js's `levelMap` takes a min over side-neighbours to avoid. An exact
// distance is ideal; an underestimate is safe and merely slower.

const DEFAULT_SKIN = 1e-4;
const DEFAULT_MAX_STEPS = 96;
const DEFAULT_CONTACTS = 4;

function requireFinite(v, n, name) {
  if (!Array.isArray(v) || v.length !== n || !v.every(Number.isFinite)) {
    throw new Error(`${name} must contain ${n} finite numbers`);
  }
}
function requirePositive(x, name) {
  if (!Number.isFinite(x) || x <= 0) throw new Error(`${name} must be a positive finite number`);
}

/**
 * The motion primitives a geometry has to supply. Everything above is written
 * against this, so a curved space plugs in without touching the solver.
 *
 * `step(p, u, t)`      follow the geodesic from p, in unit direction u, for
 *                      arclength t.
 * `transport(p, u, q)` carry the direction u from p to q. In E3 a direction is
 *                      the same vector everywhere and this is the identity;
 *                      in H3/S3 it is parallel transport, and skipping it
 *                      would silently steer the probe -- the same trap
 *                      physics.alignUp exists for.
 * `project(u, n)`      remove the component of u along the surface normal n,
 *                      leaving the slide direction in the tangent plane.
 */
export function e3Space() {
  return Object.freeze({
    kind: 'e3',
    step: (p, u, t) => [p[0] + u[0] * t, p[1] + u[1] * t, p[2] + u[2] * t],
    // A direction in flat space means the same thing at every point, so there
    // is nothing to carry. Curved spaces MUST override this.
    transport: (p, u) => u.slice(),
    project(u, n) {
      const d = u[0] * n[0] + u[1] * n[1] + u[2] * n[2];
      return [u[0] - d * n[0], u[1] - d * n[1], u[2] - d * n[2]];
    },
    norm: (v) => Math.hypot(v[0], v[1], v[2]),
  });
}

/** Free room around a point: how far the probe's SURFACE is from the scene. */
export function clearance(field, position, radius) {
  requireFinite(position, 3, 'position');
  requirePositive(radius, 'radius');
  return field.distance(position) - radius;
}

/**
 * Is there room to stand here? The editor asks this of a spawn, and of the
 * player after an edit. `skin` is the margin that counts as touching rather
 * than clear, so a probe resting exactly on a surface is not "overlapping".
 */
export function isClear(field, position, radius, skin = DEFAULT_SKIN) {
  return clearance(field, position, radius) >= -skin;
}

/**
 * Push a probe out of geometry it is already inside.
 *
 * This is the case an editor creates and a game never does: the author grows
 * a ball through the player, or drags it onto them. The engine's job is to
 * report what it can do, not to decide policy -- whether that means moving the
 * player, refusing the edit or respawning is the host's call.
 *
 * Returns `status`:
 *   'clear'   already had room; position unchanged
 *   'pushed'  moved along the surface normal until it had room
 *   'trapped' no normal to push along (dead centre of a ball), or the push
 *             did not find room within the budget. Position unchanged, and
 *             the caller must choose: refuse the edit, or respawn.
 */
export function resolveOverlap(field, space, position, radius, {
  skin = DEFAULT_SKIN, maxSteps = DEFAULT_MAX_STEPS,
} = {}) {
  requireFinite(position, 3, 'position');
  requirePositive(radius, 'radius');
  let p = position.slice();
  if (clearance(field, p, radius) >= 0) return { position: p, status: 'clear', steps: 0 };
  for (let i = 0; i < maxSteps; i++) {
    const gap = clearance(field, p, radius);
    if (gap >= 0) return { position: p, status: 'pushed', steps: i };
    const n = field.normal(p);
    // At the exact centre of a ball every direction is equally "out", so the
    // normal is undefined and there is no honest choice to make here.
    if (!n) return { position: position.slice(), status: 'trapped', steps: i };
    // Move out by the shortfall plus the skin. With an exact distance this
    // lands in one step; with an underestimate it converges.
    p = space.step(p, n, -gap + skin);
  }
  return clearance(field, p, radius) >= 0
    ? { position: p, status: 'pushed', steps: maxSteps }
    : { position: position.slice(), status: 'trapped', steps: maxSteps };
}

/**
 * Advance the probe along one geodesic until it runs out of distance or meets
 * a surface. No response, no sliding: this is the raw swept query.
 *
 * `hit` is true only when a surface stopped it. `stalled` means the step
 * budget ran out while still moving, which leaves the probe short of `distance`
 * but never inside anything.
 */
export function sweep(field, space, {
  from, direction, distance, radius,
  skin = DEFAULT_SKIN, maxSteps = DEFAULT_MAX_STEPS,
}) {
  requireFinite(from, 3, 'from');
  requireFinite(direction, 3, 'direction');
  requirePositive(radius, 'radius');
  if (!Number.isFinite(distance) || distance < 0) throw new Error('distance must be a nonnegative finite number');
  if (Math.abs(space.norm(direction) - 1) > 1e-8) throw new Error('direction must be a unit vector');

  let position = from.slice(), travelled = 0, u = direction.slice();
  for (let step = 0; step < maxSteps; step++) {
    const remaining = distance - travelled;
    if (remaining <= 0) {
      return { position, travelled, hit: false, normal: null, stalled: false, steps: step };
    }
    const gap = clearance(field, position, radius);
    if (gap <= skin) {
      // Touching. Report the surface normal at the contact, which is capability
      // (3) in the rendering contract -- a real normal, not the direction the
      // marcher happened to stop from.
      return {
        position, travelled, hit: true, normal: field.normal(position),
        stalled: false, steps: step,
      };
    }
    // The only safe advance is one we have proved is free. Stop `skin` short so
    // the probe never lands exactly ON a surface, where the next clearance is
    // zero and the loop makes no progress.
    const advance = Math.min(remaining, gap - skin * 0.5);
    const next = space.step(position, u, advance);
    u = space.transport(position, u, next);
    position = next;
    travelled += advance;
  }
  return {
    position, travelled, hit: false, normal: null,
    stalled: travelled < distance, steps: maxSteps,
  };
}

/**
 * Move a probe for one time step, sliding along whatever it meets.
 *
 * Velocity is an ambient vector here, not frame components: this module has no
 * frame. A curved host that keeps velocity in frame components converts on the
 * way in and out, exactly as physics.js does around its own integrator.
 *
 * Returns the new position and velocity, the contact normals met on the way
 * (in order), and whether the step stalled. Removing the into-surface part of
 * the velocity is what makes a wall a wall rather than a stop; the caller adds
 * friction, gravity and what counts as "grounded", because those are gameplay
 * and this is geometry.
 */
export function moveProbe(field, space, { position, velocity, radius }, dt, {
  skin = DEFAULT_SKIN, maxSteps = DEFAULT_MAX_STEPS, maxContacts = DEFAULT_CONTACTS,
} = {}) {
  requireFinite(position, 3, 'position');
  requireFinite(velocity, 3, 'velocity');
  requirePositive(radius, 'radius');
  if (!Number.isFinite(dt) || dt < 0) throw new Error('dt must be a nonnegative finite number');

  let p = position.slice(), v = velocity.slice();
  const contacts = [];
  let budget = space.norm(v) * dt;
  let stalled = false, steps = 0;

  for (let bounce = 0; bounce <= maxContacts && budget > 0; bounce++) {
    const speed = space.norm(v);
    if (speed <= 0) break;
    const u = [v[0] / speed, v[1] / speed, v[2] / speed];
    const swept = sweep(field, space, {
      from: p, direction: u, distance: budget, radius, skin, maxSteps: maxSteps - steps,
    });
    steps += swept.steps;
    // Carry the velocity to where the probe actually ended up before doing
    // anything else with it. In E3 that is a no-op; in a curved space it is
    // not, and getting it wrong steers the probe without anyone asking.
    // Transport preserves length by definition, so there is nothing to
    // renormalise here -- and renormalising would hide a broken transport.
    v = space.transport(p, v, swept.position);
    p = swept.position;
    budget -= swept.travelled;
    if (swept.stalled || steps >= maxSteps) { stalled = true; break; }
    if (!swept.hit) break;
    const n = swept.normal;
    // A hit with no normal is a degenerate contact (the probe centre is at a
    // ball's centre). There is nothing to slide along, so stop rather than
    // invent a direction.
    if (!n) { stalled = true; break; }
    contacts.push(n.slice());
    const slid = space.project(v, n);
    const slidSpeed = space.norm(slid);
    // Straight into the surface: all of the motion was normal to it, so there
    // is no tangent left and the probe simply stops.
    if (slidSpeed <= 1e-12) { v = [0, 0, 0]; break; }
    v = slid;
    // The remaining budget is the tangent part. Keeping the whole of it would
    // let a probe skim a wall faster than it was travelling.
    budget *= slidSpeed / speed;
  }
  return { position: p, velocity: v, contacts, stalled, steps };
}
