// Region-owned motion: ONE OWNER AND ONE CLOCK.
//
// This module coordinates ownership. It is emphatically NOT a second collision
// algorithm: every metre the probe moves is moved by `collision.js`, and every
// vector it carries is carried by the map `collision.js` composed along the
// path actually taken. What lives here is the part no solver can answer alone --
// which region owns the probe, whether a crossing is allowed to commit, and how
// much of the frame's TIME is left when it stops somewhere it did not plan to.
//
// Three ideas do most of the work.
//
//   EVENTS ARE ASKED FOR ON REAL LEGS. A portal plane and a chart boundary are
//   not surfaces, so the distance field cannot see them. They are supplied to
//   the solver as an event provider, which the sweep queries on each geodesic
//   leg it is about to travel -- never on a chord between the endpoints of a
//   whole move, which in S3 is not even a path through the space.
//
//   TIME, NOT DISTANCE, IS THE BUDGET. A leg of length d at speed s costs d/s
//   seconds. Sliding along a wall lowers s and leaves the remaining time
//   alone, so the probe covers less ground in what is left -- which is what
//   losing tangential speed means. A portal costs nothing: it is a shortcut
//   through the manifold, not a pause. Lift, settle and the exit offset are
//   numerical repairs and are also free.
//
//   A CROSSING IS A TRANSACTION. Source travel, destination point, destination
//   domain, destination clearance and a swept exit offset are all proved
//   before ownership moves. If any of them fails, NOTHING moves: the probe
//   keeps source ownership at the aperture it reached, and the caller is told
//   which proof failed -- including whether the destination was shown to be
//   occupied or merely not shown to be free, which are different facts.
//
// Host-free. No document, no renderer, no frame components: velocity and camera
// are ambient tangent vectors in whichever metric owns them at the time.
import { moveProbe, sweep } from './collision.js';
import { mapFrame } from './camera-frame.js';

export const REGION_MOTION_DEFAULTS = Object.freeze({
  skin: 1e-4, maxSteps: 96, maxContacts: 4, maxCrossings: 8,
});

function requirePositive(x, name) {
  if (!Number.isFinite(x) || x <= 0) throw new Error(`${name} must be a positive finite number`);
}
function requireCount(x, name) {
  if (!Number.isInteger(x) || x < 0) throw new Error(`${name} must be a nonnegative integer`);
}

/**
 * The tolerance that decides whether two events are DISTINGUISHABLE.
 *
 * It scales with the largest length in play, because a difference of 1e-12
 * means one thing next to the chart origin and nothing at all beside a
 * curvature radius of 10000 or an E3 coordinate of 1e6. It decides
 * UNCERTAINTY only: an event inside it is not thereby permitted to travel
 * farther, it is merely no longer known to be the first one.
 */
function tieTolerance(space, position, distance) {
  const scale = Math.max(1, distance, space.curvatureRadius,
    ...(space.kind === 'e3' ? position.map(Math.abs) : [0]));
  return Math.max(1e-9, 64 * Number.EPSILON * scale);
}

/**
 * The event provider for one region: its outbound apertures and its chart edge.
 *
 * `distance` is the DOMAIN candidate's true limit and `stop` is where the probe
 * is allowed to come to rest. They differ for the chart edge, which is stopped
 * just inside by the safety margin -- `withinDomain` is a strict inequality and
 * a probe parked exactly on the boundary is already outside it. Ties are judged
 * on the true limits, so shifting the stop cannot manufacture or hide one.
 */
function regionEvents(region, portals, radius, safetyMargin) {
  const { space } = region;
  return ({ position, direction, distance }) => {
    const tie = tieTolerance(space, position, distance);
    const candidates = [];
    // A CHART EXTENT IS NOT A SOLID. It is where the numbers stop meaning
    // something, so it stops the probe and says so; it never contributes a
    // normal, a slide or a grounded flag.
    const domain = space.boundaryDistance(position, direction, distance);
    if (Number.isFinite(domain)) {
      candidates.push({ kind: 'domain', regionId: region.id,
        limit: domain, distance: Math.max(0, domain - safetyMargin) });
    }
    for (const portal of portals) {
      // RADIAL FIT IS CHECKED WITH THE PHYSICAL PLAYER RADIUS, not the centre
      // ray: an aperture the centre clears but the body does not is a wall.
      const crossing = portal.crossing(position, direction, distance, radius);
      if (!crossing) continue;
      let t = crossing.distance;
      // `crossing` admits a root a hair past its own maxTravel so an exact
      // frame-end crossing is not lost to rounding. Accept that hair and
      // NOTHING more: rounding a crossing that lies beyond this leg back onto
      // it is a teleport wearing a plausible number.
      if (t > distance) { if (t <= distance + tie) t = distance; else continue; }
      candidates.push({ kind: 'portal', regionId: region.id, portal,
        limit: Math.max(0, t), distance: Math.max(0, t), at: crossing.at });
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.limit - b.limit);
    const tied = candidates.filter((c) => c.limit - candidates[0].limit <= tie);
    if (tied.length > 1) {
      // WHICH DESTINATION YOU ARRIVE IN MUST NOT DEPEND ON ENTITY ORDER. Two
      // apertures the probe cannot be shown to reach in a definite order, or an
      // aperture tied with the chart edge, is an unresolved query -- the honest
      // answer -- not a coin flip decided by whichever was authored first.
      return { kind: 'unresolved', regionId: region.id, distance: tied[0].distance,
        limit: tied[0].limit, tolerance: tie,
        competitors: tied.map((c) => (c.kind === 'portal'
          ? { kind: 'portal', portalId: c.portal.id, toRegionId: c.portal.toRegionId, limit: c.limit }
          : { kind: c.kind, limit: c.limit })) };
    }
    return candidates[0];
  };
}

/**
 * Attempt one crossing as a TRANSACTION. Returns a committed state or a refusal.
 *
 * Nothing here mutates the caller's state. Either every proof passes and a
 * complete destination state is handed back, or the refusal is returned with
 * the reason, and no partial destination state escapes this function.
 */
function attemptCrossing(world, source, event, at, velocity, camera, radius, options) {
  const { portal } = event;
  const destination = world.regions.get(portal.toRegionId);
  if (!destination) return { ok: false, reason: 'unknown-destination' };
  const space = destination.space;
  const { skin, safetyMargin, exitOffset, stepBudget } = options;

  // 2. Destination point, domain and tangent norms, BEFORE ownership moves.
  const transit = portal.transit(at);
  try { space.validatePoint(transit.position); }
  catch (error) { return { ok: false, reason: 'destination-point-invalid', detail: error.message }; }
  if (!space.withinDomain(transit.position))
    return { ok: false, reason: 'destination-outside-domain' };

  const speed = source.space.norm(at, velocity);
  let mappedVelocity, mappedCamera;
  try {
    mappedVelocity = transit.carry(velocity);
    space.validateTangent(transit.position, mappedVelocity);
    // The camera is mapped by the SAME map as the velocity. A second copy of
    // the map is how the picture and the physics come to disagree while each
    // looks right on its own.
    mappedCamera = mapFrame(camera, transit.position, transit.carry, space);
  } catch (error) { return { ok: false, reason: 'destination-tangent-invalid', detail: error.message }; }
  // Equal physical speed is the connection's stated gameplay policy. It is
  // checked, not assumed: a map that quietly rescaled speed would be invisible
  // until a player crossed a portal and found themselves fast.
  if (Math.abs(space.norm(transit.position, mappedVelocity) - speed) > 1e-9 * Math.max(1, speed))
    return { ok: false, reason: 'speed-not-preserved' };

  // 3. Destination clearance. A FAILING LOWER BOUND IS NOT PROOF OF OVERLAP.
  // Both outcomes refuse the crossing, but a host that wants to tell an author
  // "your doorway opens into rock" needs to know which of the two it has.
  const gap = destination.field.distance(transit.position) - radius;
  if (!(gap >= safetyMargin)) {
    const exact = destination.field.capabilities?.exteriorDistance === 'exact';
    return { ok: false, gap,
      reason: exact ? 'destination-clearance-insufficient' : 'destination-clearance-unproven' };
  }

  // 4. A bounded exit offset along the destination exit normal, SWEPT -- its
  // whole path is checked for collision, chart edge and further apertures, and
  // a failure here fails the entire crossing rather than leaving the probe
  // half-arrived.
  const exitNormal = space.normalize(transit.position, transit.normal);
  const outbound = world.portals.filter((p) => p.fromRegionId === destination.id);
  const offset = sweep(destination.field, space, {
    from: transit.position, direction: exitNormal, distance: exitOffset, radius, skin,
    // The offset draws on the SAME step budget as everything else: a crossing
    // does not hand the probe a fresh allowance.
    maxSteps: Math.max(1, Math.min(16, stepBudget)),
    events: regionEvents(destination, outbound, radius, safetyMargin),
    phase: 'correction',
  });
  if (offset.event) return { ok: false, reason: `exit-offset-${offset.event.kind}`, steps: offset.steps };
  if (offset.hit || offset.stalled || offset.travelled < exitOffset - 1e-12)
    return { ok: false, reason: 'exit-offset-obstructed', steps: offset.steps };

  // 5. Commit region, position, velocity and camera together.
  return {
    ok: true, regionId: destination.id, position: offset.position,
    velocity: offset.carry(mappedVelocity),
    camera: mapFrame(mappedCamera, offset.position, offset.carry, space),
    steps: offset.steps, entered: at.slice(), arrived: transit.position.slice(), gap,
  };
}

/**
 * Move a region-owned probe for `dt` seconds.
 *
 * `state` is `{ regionId, position, velocity, radius, camera }` and is NEVER
 * mutated: a new state is returned inside the result. `camera` is the carried
 * camera-frame object, and it must already belong to the region's space and sit
 * at the state's position -- a canonical frame rebuilt at a move or a transit
 * would silently discard roll and, on a sphere, hand two walkers who arrived by
 * different routes the same basis, which is exactly what curvature denies.
 *
 * `status` is one of:
 *   'complete'          the whole of `dt` was spent moving
 *   'stopped'           speed reached zero; the rest of `dt` was spent at rest
 *   'domain-exit'       the chart edge limited the move; NOT a collision
 *   'blocked-exit'      a crossing was refused; source ownership retained
 *   'budget-exhausted'  a step/contact/crossing budget ran out
 *   'unresolved'        competing events, or a correction reaching an aperture
 *
 * Everything except 'complete' and 'stopped' can leave `timeRemaining > 0`.
 * That time is the caller's to decide about: this function will not silently
 * replay it, because replaying an unresolved query is how a probe ends up
 * somewhere no motion could have taken it.
 */
export function moveRegionProbe(world, state, dt, options = {}) {
  if (!world || !(world.regions instanceof Map) || !Array.isArray(world.portals)) {
    throw new Error('world must be a compiled region world');
  }
  if (!state || typeof state !== 'object') throw new Error('state must be a region motion state');
  if (!Number.isFinite(dt) || dt < 0) throw new Error('dt must be a nonnegative finite number');

  const settings = { ...REGION_MOTION_DEFAULTS, ...options };
  requirePositive(settings.skin, 'skin');
  requireCount(settings.maxSteps, 'maxSteps');
  requireCount(settings.maxContacts, 'maxContacts');
  requireCount(settings.maxCrossings, 'maxCrossings');
  const skin = settings.skin, safetyMargin = skin / 2, exitOffset = 4 * skin;

  let region = world.regions.get(state.regionId);
  if (!region) throw new Error(`Unknown region ${state.regionId}`);
  requirePositive(state.radius, 'radius');
  region.space.validatePoint(state.position);
  region.space.validateTangent(state.position, state.velocity);
  const camera = state.camera;
  if (!camera || typeof camera !== 'object' || typeof camera.space !== 'object') {
    throw new Error('state.camera must be a camera frame');
  }
  // OWNERSHIP IS IDENTITY, NOT SHAPE. Two S3 regions of different curvature
  // radius produce identical-looking four-vectors, so the camera's space must
  // BE the region's space, not merely look like it.
  if (camera.space !== region.space) throw new Error('state.camera must be owned by the region space');
  if (!(region.space.distance(camera.position, state.position) <= 1e-9)) {
    throw new Error('state.camera must sit at state.position');
  }

  const radius = state.radius;
  let regionId = state.regionId;
  let position = state.position.slice(), velocity = state.velocity.slice(), frame = camera;
  let timeRemaining = dt, travelTime = 0, restTime = 0;
  let stepsUsed = 0, contactsUsed = 0, crossings = 0;
  let status = 'complete', detail = null, pendingLift = null;
  const events = [], contactSamples = [];

  const finish = () => Object.freeze({
    status, detail,
    state: Object.freeze({
      regionId, radius, camera: frame,
      position: Object.freeze(position.slice()),
      velocity: Object.freeze(velocity.slice()),
    }),
    timeConsumed: travelTime + restTime, timeRemaining,
    time: Object.freeze({ travel: travelTime, rest: restTime, correction: 0 }),
    events: Object.freeze(events), contactSamples: Object.freeze(contactSamples),
    crossings, steps: stepsUsed, contacts: contactsUsed, pendingLift,
  });

  // ZERO TIME IS THE IDENTITY, and it is checked before any geometry is
  // queried. A stationary player standing on a portal plane must not be
  // transported by a frame in which they did not move.
  while (timeRemaining > 0) {
    region = world.regions.get(regionId);
    if (stepsUsed >= settings.maxSteps) { status = 'budget-exhausted'; detail = 'steps'; break; }
    if (contactsUsed > settings.maxContacts) { status = 'budget-exhausted'; detail = 'contacts'; break; }
    const outbound = world.portals.filter((p) => p.fromRegionId === regionId);
    const result = moveProbe(region.field, region.space,
      { position, velocity, radius }, timeRemaining, {
        skin, maxSteps: settings.maxSteps - stepsUsed,
        maxContacts: settings.maxContacts - contactsUsed,
        events: regionEvents(region, outbound, radius, safetyMargin),
      });

    stepsUsed += result.steps;
    contactsUsed += result.contactSamples.length;
    // A NORMAL BELONGS TO THE POINT AND THE REGION IT WAS SAMPLED IN. Carrying
    // it forward bare invites someone downstream to dot it with a final-position
    // up vector in a space where that product is not even defined.
    for (const sample of result.contactSamples) {
      contactSamples.push(Object.freeze({ regionId, position: Object.freeze(sample.position),
        normal: Object.freeze(sample.normal) }));
    }
    travelTime += result.time.travel;
    restTime += result.time.rest;
    timeRemaining = result.timeRemaining;
    // The camera follows the path the probe ACTUALLY took, by the solver's own
    // composed map. `mapFrame` re-validates the mapped vectors, so a broken
    // transport is rejected rather than repaired into plausibility.
    frame = mapFrame(frame, result.position, result.carry, region.space);
    position = result.position.slice();
    velocity = result.velocity.slice();
    pendingLift = result.pendingLift
      ? Object.freeze({ regionId, distance: result.pendingLift.distance,
        normal: Object.freeze(result.pendingLift.normal) })
      : null;

    if (result.event) {
      const event = result.event;
      events.push(Object.freeze({
        kind: event.kind, regionId, phase: event.phase,
        distance: event.distance, limit: event.limit ?? event.distance,
        at: Object.freeze(position.slice()),
        portalId: event.portal?.id ?? null,
        toRegionId: event.portal?.toRegionId ?? null,
        competitors: event.competitors ?? null,
      }));
      if (event.kind === 'unresolved') {
        status = 'unresolved'; detail = 'competing-events'; break;
      }
      if (event.kind === 'domain') {
        // The host may pause, report or ask for a chart transition. Automatic
        // re-entry is not implemented and must not be improvised here.
        status = 'domain-exit'; detail = null; break;
      }
      if (event.phase === 'correction') {
        // A CORRECTION MAY NOT TELEPORT. A lift or a settle that arrives at an
        // aperture is a numerical repair that has run into a decision it is
        // not allowed to make, so it stops and says so.
        status = 'unresolved'; detail = 'correction-boundary'; break;
      }
      if (crossings >= settings.maxCrossings) {
        status = 'budget-exhausted'; detail = 'crossings'; break;
      }
      const crossed = attemptCrossing(world, region, event, position, velocity, frame,
        radius, { skin, safetyMargin, exitOffset, stepBudget: settings.maxSteps - stepsUsed });
      stepsUsed += crossed.steps ?? 0;
      if (!crossed.ok) {
        // Source ownership is retained at the aperture the probe proved it
        // could reach. Nothing tentative was travelled past it, so there is no
        // leg to discard and no elapsed time to give back.
        status = 'blocked-exit'; detail = crossed.reason; break;
      }
      crossings += 1;
      regionId = crossed.regionId;
      position = crossed.position.slice();
      velocity = crossed.velocity.slice();
      frame = crossed.camera;
      // A source floor's settle debt means nothing on the far side of a portal.
      pendingLift = null;
      continue;   // a portal costs no time; carry on in the new region
    }

    if (result.exhausted) {
      status = result.exhausted === 'degenerate-contact' ? 'unresolved' : 'budget-exhausted';
      detail = result.exhausted;
      break;
    }
    if (result.stalled) { status = 'budget-exhausted'; detail = 'steps'; break; }
    status = result.atRest ? 'stopped' : 'complete';
    break;
  }
  return finish();
}
