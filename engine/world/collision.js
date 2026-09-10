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

import { firstCrossing } from './portal.js';
import { createMetricSpace } from '../geometry/metric-space.js';

const DEFAULT_SKIN = 1e-4;
const DEFAULT_MAX_STEPS = 96;
const DEFAULT_CONTACTS = 4;

function requirePositive(x, name) {
  if (!Number.isFinite(x) || x <= 0) throw new Error(`${name} must be a positive finite number`);
}
/**
 * A point, without saying how many components a point has.
 *
 * `clearance` is handed a position and a field and no geometry, so it is in no
 * position to know whether three components or four is right -- an S3 point is
 * a four-vector on the unit sphere. It checks the shape it can check and lets
 * the FIELD be the authority on the rest, which is where that authority
 * belongs. Everywhere a space IS available, `space.validatePoint` is used
 * instead and it is stricter.
 */
function requirePoint(v, name) {
  if (!Array.isArray(v) || (v.length !== 3 && v.length !== 4) || !v.every(Number.isFinite)) {
    throw new Error(`${name} must contain three or four finite numbers`);
  }
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
  return createMetricSpace({ kind: 'e3' });
}

/** Free room around a point: how far the probe's SURFACE is from the scene. */
export function clearance(field, position, radius) {
  requirePoint(position, 'position');
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
  space.validatePoint(position);
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
    // The normal is a direction, and a geodesic step wants a UNIT one. The
    // field promises a unit normal in E3; normalising here through the metric
    // means a curved space measures it with its own inner product rather than
    // trusting a Euclidean length that means nothing there.
    p = space.step(p, space.normalize(p, n), -gap + skin);
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
  skin = DEFAULT_SKIN, maxSteps = DEFAULT_MAX_STEPS, portals = [],
  events = null, phase = 'travel',
}) {
  space.validatePoint(from);
  space.validateTangent(from, direction);
  requirePositive(radius, 'radius');
  if (!Number.isFinite(distance) || distance < 0) throw new Error('distance must be a nonnegative finite number');
  if (Math.abs(space.norm(from, direction) - 1) > 1e-8) throw new Error('direction must be a unit vector');

  // A PORTAL TEST THAT ASSUMES A STRAIGHT LINE, IN A SPACE THAT HAS NONE.
  // `apertureCrossing` interpolates linearly between two points, which is the
  // geodesic in E3 and is not one anywhere else -- in S3 the interpolated
  // point is not even on the sphere. It would not throw; it would return a
  // plausible crossing at the wrong place. Refusing is the honest state until
  // curved apertures are designed (plan item 4), because everything else in
  // this module is now geometry-correct and a silent chord would be the one
  // remaining place a curved world quietly misbehaves.
  if (portals.length && space.kind !== 'e3') {
    throw new Error(`Portals are E3-only: the aperture test assumes a straight `
      + `segment, which is not a geodesic in ${space.kind}`);
  }

  let position = from.slice(), travelled = 0, u = direction.slice();
  const transits = [];
  let blocked = null;
  // HOW A VECTOR GETS FROM THE START OF THIS SWEEP TO THE END.
  //
  // Not by transporting between the two endpoints: that is transport along the
  // shortest geodesic joining them, and the probe did not travel along that.
  // It travelled along the path below -- many geodesic advances, possibly
  // through a portal that turned it. So each leg contributes its own carry and
  // they compose in path order. In E3 every carry is the identity and this
  // reduces to exactly what the old code did, which is what lets the existing
  // suite check the refactor rather than merely survive it.
  const legs = [];
  const carry = (v) => legs.reduce((acc, leg) => leg(acc), v);
  const advanceBy = (t) => {
    const segment = space.stepWithTransport(position, u, t);
    legs.push(segment.carry);
    u = segment.carry(u);
    position = segment.position;
    return segment;
  };
  // AN EVENT IS ASKED FOR ON THE LEG ABOUT TO BE TRAVELLED, NEVER ON A CHORD.
  // The provider is handed the point the probe is standing at, the unit
  // tangent it is about to follow, and the distance this leg proposes -- so a
  // curved leg is tested along the geodesic it actually is. Testing a chord
  // between the endpoints of a whole move is the trap `firstCrossing` fell
  // into: in S3 the interpolated point is not even on the sphere.
  //
  // The range is a contract, not a suggestion. An event reported outside
  // [0, proposed] would let a provider round a crossing that lies BEYOND this
  // leg into one that happened on it, which is a teleport with a plausible
  // number attached. Refuse it rather than clamp it.
  const eventOn = (proposed) => {
    if (!events || !(proposed > 0)) return null;
    const found = events({ position: position.slice(), direction: u.slice(), distance: proposed, phase });
    if (found === null || found === undefined) return null;
    if (!Number.isFinite(found.distance) || found.distance < 0 || found.distance > proposed) {
      throw new Error('event distance must lie within the proposed leg');
    }
    return found;
  };
  // THE FINAL APPROACH IS PROVISIONAL, so the leg it happens on is handed back
  // whole: where it started, which way it pointed, how far along it the event
  // sits, and the transport composed STRICTLY BEFORE it. A caller that has to
  // undo the approach can then rebuild any point on that already-validated leg
  // by arithmetic, rather than re-running the move with a shortened dt -- which
  // would be a different move, free to choose a different contact or lift.
  const stopAtEvent = (found, step) => {
    const legStart = position.slice(), legDirection = u.slice();
    const before = legs.slice(), travelledBefore = travelled;
    const prefix = (v) => before.reduce((value, leg) => leg(value), v);
    advanceBy(found.distance);
    travelled += found.distance;
    return {
      position, travelled, hit: false, normal: null, stalled: false, steps: step,
      transits, blocked, carry,
      event: { ...found, phase, at: position.slice() },
      checkpoint: { position: legStart, direction: legDirection,
        distance: found.distance, travelled: travelledBefore, carry: prefix },
    };
  };
  for (let step = 0; step < maxSteps; step++) {
    const remaining = distance - travelled;
    if (remaining <= 0) {
      return { position, travelled, hit: false, normal: null, stalled: false, steps: step, transits, blocked, carry, event: null , checkpoint: null };
    }
    const gap = clearance(field, position, radius);
    if (gap <= skin) {
      const n = field.normal(position);
      // TOUCHING BUT LEAVING IS NOT A COLLISION. A probe resting on the floor
      // and jumping starts its step in contact, and reporting that as a hit
      // cancels the jump on the very frame it begins -- the velocity is
      // projected onto the floor plane and the player never leaves the ground.
      // Moving away from the surface raises the clearance immediately, so one
      // nudge is enough to get the normal advancement going again.
      if (n && space.dot(position, u, n) > 1e-9) {
        const nudge = Math.min(remaining, Math.max(skin * 4, 1e-4));
        // The nudge is an ACTUAL leg, so it gets an actual event query. A
        // portal set flush in the floor a probe is jumping off would otherwise
        // be stepped straight over by the one leg nobody thought was travel.
        const leaving = eventOn(nudge);
        if (leaving) return stopAtEvent(leaving, step);
        advanceBy(nudge);
        travelled += nudge;
        continue;
      }
      // Blocked. Report the surface normal at the contact, which is capability
      // (3) in the rendering contract -- a real normal, not the direction the
      // marcher happened to stop from.
      return { position, travelled, hit: true, normal: n, stalled: false, steps: step, transits, blocked, carry, event: null , checkpoint: null };
    }
    // The only safe advance is one we have proved is free. Stop `skin` short so
    // the probe never lands exactly ON a surface, where the next clearance is
    // zero and the loop makes no progress.
    const advance = Math.min(remaining, gap - skin * 0.5);
    // Events are asked BEFORE the legacy chord test and before the advance is
    // taken. `advance` is a distance already proved free of surfaces, so an
    // event inside it happened in open space -- which is exactly why a surface
    // that blocks arrival wins without any priority rule being written: a
    // blocking surface shortens `advance` until the event is out of reach.
    const found = eventOn(advance);
    if (found) return stopAtEvent(found, step);
    const next = space.step(position, u, advance);

    // PORTAL TRANSIT. Tested on the step the probe is about to take, not on
    // the whole frame, so a crossing is found at the right point along the
    // path rather than on a chord through whatever the path actually did.
    const cross = portals.length ? firstCrossing(portals, position, next) : null;
    if (cross) {
      const { portal, t } = cross;
      const reached = advance * t;
      const toAperture = space.stepWithTransport(position, u, reached);
      const at = toAperture.position;
      const carried = toAperture.carry(u);
      const exitPoint = portal.mapPoint(at);
      const exitDir = portal.mapVector(carried);

      // NEVER LAND EXACTLY ON THE APERTURE. The traveller emerges on the exit
      // plane at height zero, and the next step's sign test can then read
      // either way and send them straight back. The H3 marcher needs the same
      // guard at a fundamental-domain face, for the same reason and with the
      // same failure: an object that teleports for ever without advancing.
      const eased = space.step(exitPoint, portal.exitNormal, skin * 4);

      // BLOCKED EXIT. Emerging inside geometry would put the probe somewhere
      // no motion could have taken it, so the transit is refused and the
      // aperture behaves as the wall it is set in. Reporting it lets a host
      // say why rather than leaving the player mysteriously stopped.
      if (clearance(field, eased, radius) < 0) {
        blocked = { portal, at };
        legs.push(toAperture.carry);   // it got as far as the aperture
        return {
          position: at, travelled: travelled + reached,
          hit: true, normal: field.normal(at), stalled: false, steps: step,
          transits, blocked, carry, event: null, checkpoint: null,
        };
      }
      transits.push({ portal, entered: at, exited: eased });
      // Reaching the aperture is a leg, and the portal map is another: a
      // transit turns everything the probe is carrying, not just its heading.
      legs.push(toAperture.carry, (v) => portal.mapVector(v));
      position = eased;
      u = exitDir;
      // The arclength travelled counts the whole way: a portal is a shortcut
      // through the manifold, not free distance.
      travelled += reached;
      continue;
    }

    advanceBy(advance);
    travelled += advance;
  }
  return {
    position, travelled, hit: false, normal: null,
    stalled: travelled < distance, steps: maxSteps, transits, blocked, carry, event: null,
    checkpoint: null,
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
  portals = [], events = null,
} = {}) {
  space.validatePoint(position);
  space.validateTangent(position, velocity);
  requirePositive(radius, 'radius');
  if (!Number.isFinite(dt) || dt < 0) throw new Error('dt must be a nonnegative finite number');

  let p = position.slice(), v = velocity.slice();
  const contacts = [];
  const contactSamples = [];
  const carryOrigin = position.slice();
  // Transport is separate from contact response: a camera must follow every
  // physical correction without having its forward vector projected into a wall.
  const legs = [];
  const carry = vector => {
    space.validateTangent(carryOrigin, vector);
    return legs.reduce((value, leg) => leg(value), vector.slice());
  };
  // TIME IS THE CLOCK; DISTANCE IS DERIVED FROM IT WHENEVER IT IS NEEDED.
  //
  // The old loop carried a distance budget and rescaled it by the speed ratio
  // after a slide. That happens to equal `newSpeed * timeRemaining` and so was
  // right -- but only by arithmetic coincidence, and it could not answer "how
  // much of the frame is left?" at all. A region coordinator has to hand the
  // unconsumed time back when it stops at an aperture, so the clock is the
  // state now and `speed * timeRemaining` is recomputed as the distance each
  // leg is allowed. Corrections (lift, settle) consume ZERO time: they are
  // numerical repairs, not gameplay travel.
  let timeRemaining = dt, timeTravelled = 0, timeRested = 0;
  let stalled = false, steps = 0, atRest = false, exhausted = null;
  let event = null, pendingLift = null, checkpoint = null;
  // A contact the probe MET but was not allowed to respond to. It is reported
  // apart from `contacts`/`contactSamples`, which are the counted response
  // list: a budget of zero responses must buy zero responses, and saying "there
  // is a surface here and I did not process it" is a different statement from
  // "I slid along a surface here".
  let limitingContact = null;
  let responses = 0;
  // How far the probe was lifted off its last contact, and along which normal,
  // so the settle at the end knows what to undo. See the LIFT note below.
  let lifted = 0, liftNormal = null;
  const transits = [];
  let blocked = null;

  while (timeRemaining > 0) {
    const speed = space.norm(p, v);
    if (speed <= 0) { atRest = true; break; }
    if (steps >= maxSteps) { stalled = true; exhausted = 'steps'; break; }
    const u = space.normalize(p, v);
    // Snapshot everything the final approach may have to be rolled back to.
    const legsBefore = legs.slice(), velocityBefore = v.slice();
    const liftNormalBefore = liftNormal ? liftNormal.slice() : null;
    const liftedBefore = lifted, travelBefore = timeTravelled;
    const swept = sweep(field, space, {
      from: p, direction: u, distance: speed * timeRemaining, radius, skin,
      maxSteps: maxSteps - steps, portals, events, phase: 'travel',
    });
    steps += swept.steps;
    for (const transit of swept.transits) transits.push(transit);
    if (swept.blocked) blocked = swept.blocked;
    // CARRY THE VELOCITY ALONG THE PATH THE PROBE ACTUALLY TOOK, which is what
    // `swept.carry` composes: every geodesic leg in order, and the portal map
    // at each transit. Transporting between the two endpoints instead would
    // be transport along a geodesic the probe never travelled, and in a curved
    // space that steers it without anyone asking. In E3 the two agree, which
    // is why this was invisible until now.
    //
    // Transport preserves length by definition, so there is nothing to
    // renormalise -- and renormalising would hide a broken transport.
    legs.push(swept.carry);
    v = swept.carry(v);
    if (liftNormal) liftNormal = swept.carry(liftNormal);
    p = swept.position;
    timeTravelled += swept.travelled / speed;
    timeRemaining = Math.max(0, timeRemaining - swept.travelled / speed);
    // YIELD THE EVENT BEFORE ANYTHING ELSE CAN MOVE THE PROBE. A settle that
    // ran first would pull the probe off the aperture it had just reached, and
    // the crossing would then be tested from a point the probe was never at.
    if (swept.event) {
      event = swept.event;
      if (swept.checkpoint) {
        const cp = swept.checkpoint;
        const prefix = legsBefore.concat([cp.carry]);
        checkpoint = {
          position: cp.position, direction: cp.direction, distance: cp.distance, speed,
          velocity: cp.carry(velocityBefore),
          liftNormal: liftNormalBefore ? cp.carry(liftNormalBefore) : null,
          lifted: liftedBefore,
          timeConsumed: travelBefore + cp.travelled / speed,
          carry: (vector) => {
            space.validateTangent(carryOrigin, vector);
            return prefix.reduce((value, leg) => leg(value), vector.slice());
          },
        };
      }
      break;
    }
    if (swept.stalled || steps >= maxSteps) { stalled = true; exhausted = 'steps'; break; }
    if (!swept.hit) break;
    const n = swept.normal;
    // A hit with no normal is a degenerate contact (the probe centre is at a
    // ball's centre). There is nothing to slide along, so stop rather than
    // invent a direction.
    if (!n) { stalled = true; exhausted = 'degenerate-contact'; break; }
    if (responses >= maxContacts) {
      limitingContact = { position: p.slice(), normal: n.slice() };
      exhausted = 'contacts';
      break;
    }
    responses += 1;
    contacts.push(n.slice());
    // Raw normals belong at their contact points, not at the final position.
    // Keep the legacy contacts array for E3 callers; curved callers use samples.
    contactSamples.push({ position: p.slice(), normal: n.slice() });
    const slid = space.project(p, v, n);
    const slidSpeed = space.norm(p, slid);
    // Straight into the surface: all of the motion was normal to it, so there
    // is no tangent left and the probe simply stops.
    if (slidSpeed <= 1e-12) { v = v.map(() => 0); atRest = true; break; }

    // LIFT BEFORE SLIDING, AND THIS IS THE ONE THAT MAKES WALKING POSSIBLE.
    //
    // Conservative advancement steps by an ISOTROPIC distance bound, and a
    // probe resting on a floor has a clearance of zero -- so the safe step
    // along the floor is also zero, and the probe cannot walk at all. It is
    // the renderer's grazing-ray problem in another costume: sphere tracing
    // approaches a surface it is parallel to without ever arriving.
    //
    // The distance field alone cannot express "the floor does not block
    // sideways motion", so lift clear of the contact first, slide there, and
    // settle back afterwards. The lift is itself a SWEPT query, so lifting
    // into a ceiling stops at the ceiling instead of tunnelling through it.
    const lift = Math.min(0.25 * radius, Math.max(8 * skin, speed * timeRemaining));
    const liftDir = space.normalize(p, n);
    // A correction is work, and work comes out of the SAME budget as travel.
    // Handing it its own fixed allowance is how a call with a cap of six steps
    // ends up taking thirty.
    if (steps >= maxSteps) { stalled = true; exhausted = 'steps'; break; }
    const up = sweep(field, space, {
      from: p, direction: liftDir, distance: lift, radius, skin,
      maxSteps: Math.min(8, maxSteps - steps),
      // No legacy portals: a lift is a correction normal to a surface, not
      // travel. It IS event-checked, and that is not the same thing -- a lift
      // that walks silently across an aperture bypasses the one test that
      // decides which region the probe is standing in.
      events, phase: 'correction',
    });
    steps += up.steps;
    // A CORRECTION THAT REACHES AN APERTURE IS NOT COMMITTED AT ALL. The lift
    // is a numerical repair that has run into a decision it may not make, so
    // none of it is kept: the probe stays at the contact it was lifting off,
    // which is the pre-leg checkpoint the contract asks for, and the aperture
    // it would have reached is reported as the event's attempted point.
    if (up.event) { event = up.event; break; }
    legs.push(up.carry);
    lifted = up.travelled;
    // The lift moved the probe, so the slide direction and the normal we will
    // settle back along both have to come with it.
    v = up.carry(slid);
    liftNormal = up.carry(liftDir);
    p = up.position;
    // The velocity is now only its tangent part, so the remaining TIME is
    // unchanged and the next leg is shorter because the speed is lower. That
    // is the whole of "tangential speed loss uses remaining time correctly";
    // reusing the original distance as time would give the slide its lost
    // speed back for free.
  }
  // Settle back onto whatever was lifted off, so the probe ends resting on the
  // surface rather than hovering a fraction above it. Swept again, so it stops
  // at the first thing it meets rather than being teleported down.
  if (lifted > 0 && liftNormal && !event && steps < maxSteps) {
    const back = sweep(field, space, {
      from: p, direction: liftNormal.map((x) => -x), distance: lifted, radius, skin,
      maxSteps: Math.min(16, maxSteps - steps), events, phase: 'correction',
    });
    steps += back.steps;
    if (back.event) {
      // Same rule as the lift: none of a correction that reached an aperture is
      // kept, so the settle debt stays owed and is reported instead.
      event = back.event;
      pendingLift = { distance: lifted, normal: liftNormal.slice() };
    } else {
      legs.push(back.carry);
      v = back.carry(v);
      p = back.position;
      if (back.stalled) {
        // Travel may have consumed the entire clock while this zero-time
        // correction still needs work. Preserve its residual at the NEW point;
        // neither successful completion nor a time refund describes this case.
        stalled = true;
        exhausted = 'steps';
        pendingLift = { distance: Math.max(0, lifted - back.travelled),
          normal: back.carry(liftNormal) };
      }
    }
  } else if (lifted > 0 && liftNormal) {
    // The probe stopped at an event still owing its floor a settle. The debt is
    // REPORTED rather than paid: paying it would move the probe off the
    // aperture, and a coordinator about to change regions has to be able to
    // cancel it -- a source floor's correction means nothing in a destination.
    pendingLift = { distance: lifted, normal: liftNormal.slice() };
  }
  if (atRest) { timeRested = timeRemaining; timeRemaining = 0; }
  return {
    position: p, velocity: v, contacts, contactSamples, stalled, steps, transits, blocked, carry,
    event, checkpoint, pendingLift, atRest, exhausted, limitingContact, responses,
    timeConsumed: timeTravelled + timeRested, timeRemaining,
    time: { travel: timeTravelled, rest: timeRested, correction: 0 },
  };
}
