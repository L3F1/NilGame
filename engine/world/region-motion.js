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
//   A CROSSING IS A TRANSACTION, AND THE FINAL APPROACH IS PART OF IT. Source
//   travel, destination point, destination domain, destination clearance and a
//   swept exit offset are all proved before ownership moves. If any of them
//   fails, the approach is rolled back to a checkpoint STRICTLY on the entering
//   side of the aperture -- not to the plane itself, where the one-sided
//   crossing test would decline to look at the walker again and let the next
//   frame carry them straight through a portal that had just refused them.
//   Only the discarded travel time is refunded; the solver work already spent
//   is not, because those queries really happened.
//
// Host-free. No document, no renderer, no frame components: velocity and camera
// are ambient tangent vectors in whichever metric owns them at the time.
import { moveProbe, sweep } from './collision.js';
import { mapFrame } from './camera-frame.js';
import { PORTAL_PLANE_TOLERANCE } from './region-portal.js';

export const REGION_MOTION_DEFAULTS = Object.freeze({
  skin: 1e-4, maxSteps: 96, maxContacts: 4, maxCrossings: 8,
});

/**
 * The budget one CORRECTION RESUME may spend. Fresh, explicit, and small.
 *
 * It is not a movement budget and it is not shared with one: a resume spends
 * queries and ZERO gameplay time, and the movement request that owed the debt
 * had its own budget and its own clock, both of which are finished with.
 */
export const CORRECTION_RESUME_DEFAULTS = Object.freeze({ skin: 1e-4, maxSteps: 24 });

/**
 * The continuations this module has actually issued.
 *
 * A `pendingLift` describes a debt; it is not AUTHORITY TO MOVE A PLAYER. An
 * object with the right fields can be written by anyone, and a resume that
 * accepted one would let a host push a walker a chosen distance in a chosen
 * direction through a door marked "numerical repair". So a resume moves nobody
 * unless the continuation it is handed is one this module made, and a
 * continuation is spent the moment it is used -- which is also what stops the
 * same one being applied twice to two different states.
 *
 * This is a WeakSet and not a registry: it answers "did I issue this?" and
 * nothing else. There is no key, no lookup, no lifetime to manage, and a
 * continuation nobody holds any more is collected without being cleaned up.
 */
const ISSUED = new WeakSet();

/**
 * Issue the continuation that a debt-carrying result hands back.
 *
 * It pins EVERYTHING the resume is not allowed to re-derive: which compiled
 * world (by identity, because two compiles of the same document are different
 * scenes as far as a floor is concerned), which region, the exact endpoint,
 * the player radius, and the residual as a distance plus a unit tangent AT
 * that endpoint. Arrays are snapshots. If the residual cannot be turned into a
 * usable direction, no continuation is issued at all: the debt is still
 * reported, and the host's only recovery is a reset.
 */
function issueContinuation(world, regionId, radius, position, velocity, camera, space, pendingLift) {
  if (!pendingLift) return null;
  let direction;
  try {
    // The lift went along `normal`; the settle goes back down it.
    direction = space.normalize(position, pendingLift.normal.map((x) => -x));
    space.validateTangent(position, direction);
    if (!direction.every(Number.isFinite)) return null;
  } catch { return null; }
  const continuation = Object.freeze({
    world, regionId, radius, camera,
    position: Object.freeze(position.slice()),
    velocity: Object.freeze(velocity.slice()),
    distance: pendingLift.distance,
    normal: Object.freeze([...pendingLift.normal]),
    direction: Object.freeze(direction),
  });
  ISSUED.add(continuation);
  return continuation;
}

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
 * Rebuild the state at `retreat` physical units before the event, on the leg
 * the event was found on.
 *
 * This is arithmetic on ONE already-validated geodesic, not a second attempt at
 * the move. Re-running the move with a shortened `dt` would be a different
 * move: it is free to meet a different surface, lift by a different amount and
 * arrive somewhere the first run never went. Truncating the last leg cannot.
 */
function rewind(space, regionId, checkpoint, frameBefore, retreat) {
  const advance = Math.max(0, checkpoint.distance - retreat);
  const segment = space.stepWithTransport(checkpoint.position, checkpoint.direction, advance);
  return {
    position: segment.position,
    velocity: segment.carry(checkpoint.velocity),
    frame: mapFrame(frameBefore, segment.position,
      (vector) => segment.carry(checkpoint.carry(vector)), space),
    travel: checkpoint.timeConsumed + advance / checkpoint.speed,
    rest: 0,
    // The settle the probe still owed at the checkpoint is owed there again.
    pendingLift: checkpoint.liftNormal && checkpoint.lifted > 0
      ? Object.freeze({ regionId, distance: checkpoint.lifted,
        normal: Object.freeze(segment.carry(checkpoint.liftNormal)) })
      : null,
  };
}

/**
 * A checkpoint the portal itself certifies as being on the entering side.
 *
 * `skin` before the crossing first, then the leg start that qualified the
 * crossing in the first place. Both are judged by `portal.signedHeight` against
 * the SAME tolerance `crossing` uses -- a checkpoint the coordinator believes
 * is outside and the crossing test reads as on-plane is precisely the
 * disagreement this whole mechanism exists to prevent. Nothing is nudged
 * backwards along a guessed normal: every candidate lies on the leg the probe
 * actually travelled. If neither can be certified, the caller is handed null
 * and must refuse to commit the leg at all.
 */
function certifiedCheckpoint(space, regionId, checkpoint, frameBefore, portal, skin) {
  for (const retreat of [skin, checkpoint.distance]) {
    const candidate = rewind(space, regionId, checkpoint, frameBefore, retreat);
    if (portal.signedHeight([...candidate.position]) > PORTAL_PLANE_TOLERANCE) return candidate;
  }
  return null;
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
  let status = 'complete', detail = null, pendingLift = null, limitingContact = null;
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
    crossings, steps: stepsUsed, contacts: contactsUsed, pendingLift, limitingContact,
    // Owing a correction and being ABLE to finish it are two facts, and a host
    // needs both: a debt whose continuation could not be issued has exactly one
    // recovery, and it is not this operation.
    continuation: issueContinuation(world, regionId, radius, position, velocity,
      frame, world.regions.get(regionId).space, pendingLift),
    corrected: 0,
  });

  // ZERO TIME IS THE IDENTITY, and it is checked before any geometry is
  // queried. A stationary player standing on a portal plane must not be
  // transported by a frame in which they did not move.
  while (timeRemaining > 0) {
    region = world.regions.get(regionId);
    const space = region.space;
    if (stepsUsed >= settings.maxSteps) { status = 'budget-exhausted'; detail = 'steps'; break; }
    const outbound = world.portals.filter((p) => p.fromRegionId === regionId);
    const callTime = timeRemaining, frameBefore = frame;
    const result = moveProbe(region.field, space,
      { position, velocity, radius }, callTime, {
        skin, maxSteps: settings.maxSteps - stepsUsed,
        maxContacts: settings.maxContacts - contactsUsed,
        events: regionEvents(region, outbound, radius, safetyMargin),
      });

    // WORK COUNTERS COMMIT UNCONDITIONALLY. A speculative approach that is
    // rolled back still asked the field real questions, and pretending it did
    // not is how a bounded call becomes unbounded by refusing often enough.
    stepsUsed += result.steps;
    contactsUsed += result.responses;
    // A NORMAL BELONGS TO THE POINT AND THE REGION IT WAS SAMPLED IN. Carrying
    // it forward bare invites someone downstream to dot it with a final-position
    // up vector in a space where that product is not even defined.
    for (const sample of result.contactSamples) {
      contactSamples.push(Object.freeze({ regionId, position: Object.freeze(sample.position),
        normal: Object.freeze(sample.normal) }));
    }
    if (result.limitingContact) {
      limitingContact = Object.freeze({ regionId,
        position: Object.freeze(result.limitingContact.position),
        normal: Object.freeze(result.limitingContact.normal) });
    }

    // The camera follows the path the probe ACTUALLY took, by the solver's own
    // composed map. `mapFrame` re-validates the mapped vectors, so a broken
    // transport is rejected rather than repaired into plausibility.
    const reached = {
      position: result.position.slice(), velocity: result.velocity.slice(),
      frame: mapFrame(frameBefore, result.position, result.carry, space),
      travel: result.time.travel, rest: result.time.rest,
      pendingLift: result.pendingLift
        ? Object.freeze({ regionId, distance: result.pendingLift.distance,
          normal: Object.freeze(result.pendingLift.normal) })
        : null,
    };
    const commit = (next) => {
      position = next.position.slice();
      velocity = next.velocity.slice();
      frame = next.frame;
      travelTime += next.travel;
      restTime += next.rest;
      timeRemaining = Math.max(0, callTime - next.travel - next.rest);
      pendingLift = next.pendingLift;
      return next;
    };
    const record = (event, stoppedAt) => events.push(Object.freeze({
      kind: event.kind, regionId, phase: event.phase,
      distance: event.distance, limit: event.limit ?? event.distance,
      // THE POINT AIMED AT AND THE POINT ENDED AT ARE DIFFERENT FACTS. An
      // aperture that refused the walker was still reached; the walker is not
      // standing on it.
      at: Object.freeze(event.at.slice()),
      stoppedAt: Object.freeze(stoppedAt.slice()),
      portalId: event.portal?.id ?? null,
      toRegionId: event.portal?.toRegionId ?? null,
      competitors: event.competitors ?? null,
    }));

    if (result.event) {
      const event = result.event;
      const checkpoint = result.checkpoint;
      // A tie is an uncommitted approach too: retreat to the leg start rather
      // than parking on a plane nobody could show the walker had a right to be
      // on. A correction event committed nothing, so `reached` IS its pre-leg
      // state and there is no checkpoint to rewind to.
      const toLegStart = () => (checkpoint
        ? rewind(space, regionId, checkpoint, frameBefore, checkpoint.distance) : reached);

      if (event.kind === 'unresolved') {
        record(event, commit(toLegStart()).position);
        status = 'unresolved'; detail = 'competing-events'; break;
      }
      if (event.kind === 'domain') {
        // Stopped just inside, and the chart edge is not a surface: this one is
        // a real limit rather than an uncommitted approach, so it stands.
        record(event, commit(reached).position);
        status = 'domain-exit'; detail = null; break;
      }
      if (event.phase === 'correction') {
        // A CORRECTION MAY NOT TELEPORT. A lift or a settle that arrives at an
        // aperture is a numerical repair that has run into a decision it is not
        // allowed to make. None of it was applied, so the probe is still at the
        // contact it was correcting from.
        record(event, commit(reached).position);
        status = 'unresolved'; detail = 'correction-boundary'; break;
      }

      const retain = (reason, kind) => {
        const safe = checkpoint
          && certifiedCheckpoint(space, regionId, checkpoint, frameBefore, event.portal, skin);
        if (safe) { record(event, commit(safe).position); status = kind; detail = reason; return; }
        // The entering side could not be certified even at the leg start, so
        // the leg is not committed at all and the uncertainty is reported.
        record(event, commit(toLegStart()).position);
        status = 'unresolved'; detail = 'uncertifiable-checkpoint';
      };

      if (crossings >= settings.maxCrossings) { retain('crossings', 'budget-exhausted'); break; }
      const crossed = attemptCrossing(world, region, event, result.position, result.velocity,
        reached.frame, radius,
        { skin, safetyMargin, exitOffset, stepBudget: settings.maxSteps - stepsUsed });
      stepsUsed += crossed.steps ?? 0;
      if (!crossed.ok) { retain(crossed.reason, 'blocked-exit'); break; }

      // Only now is the approach real. Commit it, charge its time normally,
      // and move ownership.
      record(event, reached.position);
      commit(reached);
      crossings += 1;
      regionId = crossed.regionId;
      position = crossed.position.slice();
      velocity = crossed.velocity.slice();
      frame = crossed.camera;
      // A source floor's settle debt means nothing on the far side of a portal.
      pendingLift = null;
      continue;   // a portal costs no time; carry on in the new region
    }

    commit(reached);
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

/**
 * Finish a correction the walker was left owing. A SEPARATE OPERATION.
 *
 * This is not `moveRegionProbe` run again with the refused frame's leftover
 * time, and the residual is not a velocity. The unspent time of the request
 * that owed this debt was discarded when it was reported and stays discarded:
 * a correction is a numerical repair and costs NO GAMEPLAY TIME, only queries.
 * So there is no gravity here, no input, no portal transit, no fresh lift and
 * no contact slide -- one swept query in the correction phase, along the
 * direction the settle was already going, for the distance it still owed.
 *
 * `suspended` is the previous result, whole. Its `continuation` is the
 * authority; `state` is checked against it, because a host that moved the
 * walker and then asked to finish an old floor's correction is describing two
 * different walkers. Calls are functional: the host replaces its suspended
 * result with the returned one, and the continuation just used is spent, so
 * the same one cannot be applied twice to two successive states.
 *
 * `status` adds one value to `moveRegionProbe`'s set:
 *   'stale-continuation'  the scene, the endpoint or the authority no longer
 *                         match; NOTHING was changed and no new continuation is
 *                         issued, because an old floor's correction must never
 *                         be applied to a new scene
 */
export function resumeRegionCorrection(world, suspended, options = {}) {
  if (!world || !(world.regions instanceof Map) || !Array.isArray(world.portals)) {
    throw new Error('world must be a compiled region world');
  }
  if (!suspended || typeof suspended !== 'object') {
    throw new Error('suspended must be a region motion result');
  }
  const continuation = suspended.continuation;
  if (!continuation || typeof continuation !== 'object') {
    // Asking to finish a correction that is not owed is a host bug, not a
    // refusal: there is no state to report on and nothing to recover from.
    throw new Error('this result owes no resumable correction');
  }
  const settings = { ...CORRECTION_RESUME_DEFAULTS, ...options };
  requirePositive(settings.skin, 'skin');
  requireCount(settings.maxSteps, 'maxSteps');

  const previous = suspended.state;
  /** A result in `moveRegionProbe`'s shape. Zero time, always: see above. */
  const result = ({ status, detail = null, state = previous, pendingLift = suspended.pendingLift,
    issue = null, corrected = 0, events = [], contactSamples = [], steps = 0 }) => Object.freeze({
    status, detail, state,
    timeConsumed: 0, timeRemaining: 0,
    time: Object.freeze({ travel: 0, rest: 0, correction: 0 }),
    events: Object.freeze(events), contactSamples: Object.freeze(contactSamples),
    crossings: 0, steps, contacts: 0, pendingLift, limitingContact: null,
    continuation: issue, corrected,
  });
  const stale = (detail) => result({ status: 'stale-continuation', detail });

  // AUTHORITY, then identity, then the endpoint -- in that order, because a
  // forged continuation must not get as far as being compared against a real
  // scene. Every one of these is a `stale-continuation`, which changes nothing
  // and offers the host a reset rather than a retry.
  if (!ISSUED.has(continuation)) return stale('not-issued-or-already-spent');
  if (continuation.world !== world) return stale('world-recompiled');
  const region = world.regions.get(continuation.regionId);
  if (!region || region.space !== continuation.camera?.space) return stale('region-changed');
  if (!previous || previous.regionId !== continuation.regionId) return stale('region-changed');
  if (previous.radius !== continuation.radius) return stale('radius-changed');
  // The camera is compared by IDENTITY: two frames with equal components that
  // arrived by different routes are different frames on a sphere, and this is
  // the same rule the coordinator applies to a space.
  if (previous.camera !== continuation.camera) return stale('endpoint-moved');
  if (previous.position.length !== continuation.position.length
    || [...previous.position].some((x, i) => x !== continuation.position[i])) {
    return stale('endpoint-moved');
  }

  // Spent from here on, whatever happens next. A resume that failed still
  // asked its questions, and re-presenting the same authority afterwards is
  // precisely the double-apply this is here to prevent.
  ISSUED.delete(continuation);

  const space = region.space;
  const outbound = world.portals.filter((p) => p.fromRegionId === continuation.regionId);
  const swept = sweep(region.field, space, {
    from: [...continuation.position],
    direction: [...continuation.direction],
    distance: continuation.distance,
    radius: continuation.radius,
    skin: settings.skin,
    maxSteps: settings.maxSteps,
    events: regionEvents(region, outbound, continuation.radius, settings.skin / 2),
    phase: 'correction',
  });

  /** Re-issue the SAME residual at the SAME endpoint, nothing having moved. */
  const reissue = () => issueContinuation(world, continuation.regionId, continuation.radius,
    [...continuation.position], [...continuation.velocity], continuation.camera, space,
    { distance: continuation.distance, normal: [...continuation.normal] });

  if (swept.event) {
    // A CORRECTION MAY NOT CROSS ANYTHING. Same rule as the settle inside a
    // movement request: none of a correction that reached an aperture or a
    // chart edge is kept, so the walker is exactly where they were and the
    // debt is exactly what it was. No continuation is re-issued, because
    // pressing again would ask the identical question and get the identical
    // answer; the recovery is an edit or a reset, and both are the host's.
    return result({
      status: 'unresolved', detail: 'correction-boundary', steps: swept.steps,
      events: [Object.freeze({
        kind: swept.event.kind, regionId: continuation.regionId, phase: 'correction',
        distance: swept.event.distance, limit: swept.event.limit ?? swept.event.distance,
        at: Object.freeze(swept.event.at.slice()),
        stoppedAt: Object.freeze([...continuation.position]),
        portalId: swept.event.portal?.id ?? null,
        toRegionId: swept.event.portal?.toRegionId ?? null,
        competitors: swept.event.competitors ?? null,
      })],
    });
  }
  if (swept.hit && !swept.normal) {
    // A contact with no usable normal is not a landing, and calling it one
    // would clear a debt by declaring the ground to be wherever the query gave
    // up. Unresolved, never completed.
    return result({ status: 'unresolved', detail: 'degenerate-contact', steps: swept.steps });
  }

  // Commit: transport velocity and camera along the legs the correction really
  // walked, by the sweep's own composed map, and let `mapFrame` re-validate.
  let position, velocity, camera;
  try {
    position = swept.position.slice();
    space.validatePoint(position);
    velocity = swept.carry([...continuation.velocity]);
    space.validateTangent(position, velocity);
    camera = mapFrame(continuation.camera, position, swept.carry, space);
    if (!position.every(Number.isFinite) || !velocity.every(Number.isFinite)) {
      throw new Error('correction produced a non-finite state');
    }
  } catch (error) {
    return result({ status: 'unresolved', detail: 'transport-invalid', steps: swept.steps });
  }
  const state = Object.freeze({
    regionId: continuation.regionId, radius: continuation.radius, camera,
    position: Object.freeze(position),
    velocity: Object.freeze(velocity),
  });
  const contactSamples = swept.hit
    ? [Object.freeze({ regionId: continuation.regionId,
      position: Object.freeze(position.slice()), normal: Object.freeze(swept.normal.slice()) })]
    : [];

  if (swept.stalled) {
    // THE RESIDUAL SURVIVES AT THE NEW ENDPOINT, carried there like everything
    // else. Not the original distance and not the original direction: what is
    // left of the one, pointing where the other now points.
    const owed = Object.freeze({
      regionId: continuation.regionId,
      distance: Math.max(0, continuation.distance - swept.travelled),
      normal: Object.freeze(swept.carry([...continuation.normal])),
    });
    return result({
      status: 'budget-exhausted', detail: 'steps', state, pendingLift: owed,
      corrected: swept.travelled, steps: swept.steps, contactSamples,
      issue: issueContinuation(world, continuation.regionId, continuation.radius,
        position, velocity, camera, space, owed),
    });
  }
  // Either the whole residual was walked, or a real surface stopped it partway
  // -- which is a landing, and is what the settle was for. The same outcome the
  // uninterrupted settle inside `moveProbe` reaches, by the same query.
  return result({
    status: 'complete', detail: swept.hit ? 'contact' : null, state,
    pendingLift: null, corrected: swept.travelled, steps: swept.steps, contactSamples,
  });
}
