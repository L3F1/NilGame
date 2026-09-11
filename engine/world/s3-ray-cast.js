// Where a ray first enters SOLID in one spherical region -- the Boolean answer,
// not the primitive one.
//
// `s3-ray-events.js` finds where a geodesic crosses each primitive's own
// surface. Those are candidates and emphatically not hits: a face of a cell
// extends past the cell, a carve's boundary is a surface you LEAVE solid
// through, and a modifier scoped to one group says nothing about another. This
// module does the arbitration, and it does it by the only method that cannot
// quietly disagree with the field -- evaluate the SAME Boolean expression
// `field.groups` describes, from atomic occupancy, at every event in order.
//
// THE THREE ANSWERS ARE hit, miss AND unresolved, and the third is not a
// failure mode to be minimised away. Every guard here is a floating-point
// screening policy inherited from the event layer, not a proved enclosure, so
// an answer that would need one is refused instead of estimated. A miss is a
// positive claim -- "no solid anywhere in this range" -- and is only returned
// when every primitive's candidate list came back complete and every Boolean
// evaluation along the way was definite.
//
// WHAT THIS QUERY DOES NOT OWN. Portals, chart exits, and any span longer than
// half a great circle. The sight coordinator arbitrates those first and hands
// this an explicit range it has already decided is meaningful; subdividing one
// here would be inventing a policy in the wrong module. It also does not
// consult `field.distance`: a conservative bound cannot classify occupancy, and
// deciding a Boolean from one is the mistake this module exists to avoid.
import { sphericalBoundaryEvents, S3_RAY_ROUNDOFF } from '../geometry/s3-ray-events.js';

const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const EPS = S3_RAY_ROUNDOFF;

export const S3_CAST_DEFAULTS = Object.freeze({ maxEvents: 512, maxWork: 2048 });

// Three-valued logic, because "I could not tell" is a value and not an error.
// Kleene, so an uncertain primitive nobody is looking at cannot poison an
// answer the rest of the scene settles: false AND unknown is false, true OR
// unknown is true.
const and3 = (a, b) => (a === false || b === false ? false : a === null || b === null ? null : true);
const or3 = (a, b) => (a === true || b === true ? true : a === null || b === null ? null : false);
const not3 = (a) => (a === null ? null : !a);

/**
 * The atomic inequalities, in the same shape the event layer solves.
 *
 * A plane or a cell face is inside where `dot(p, pole) <= 0`. A ball is inside
 * where `dot(p, center) >= cos(radius / R)` -- the OPPOSITE inequality, which
 * is why the event layer carries a `sign` and why a ball's outward normal is
 * the negated projected centre. Both are written here as one signed margin,
 * `sign * (level - A)`, positive inside, so the two cases cannot drift apart.
 *
 * These are inequalities on exact quantities. They never consult
 * `field.distance`, whose magnitude is a conservative bound and whose small
 * values mean "unproven", not "near".
 */
function surfacesOf(primitive, R) {
  const kind = primitive.entity.kind;
  if (kind === 'ball') {
    return [{ pole: primitive.center, level: Math.cos(primitive.entity.radius / R), sign: -1, face: null }];
  }
  return primitive.planes.map((pole, face) => ({ pole, level: 0, sign: 1, face }));
}
const surfaceKey = (primitiveId, face) => `${primitiveId}#${face === null ? 'body' : face}`;

/**
 * Classify one atomic surface at the ray origin.
 *
 * The guard is the event layer's own `error`, built from the same A, B and
 * level, so a point the classifier calls uncertain is a point whose root the
 * event layer would also refuse to place. Using a looser tolerance here would
 * certify occupancy on the wrong side of a boundary the solver declined to find.
 */
function classify(surface, position, direction) {
  const A = dot(position, surface.pole), B = dot(direction, surface.pole);
  const error = EPS * (1 + Math.abs(A) + Math.abs(B) + Math.abs(surface.level));
  const margin = surface.sign * (surface.level - A);
  return margin > error ? true : margin < -error ? false : null;
}

/**
 * Is this primitive occupied, given the state of its atomic surfaces?
 *
 * A CELL IS THE CONJUNCTION OF ITS FACES, and that is the whole reason a
 * subtracted cell cannot be handled by inverting its face constraints one by
 * one. Outside a cell means NOT(all faces inside) -- at least one face outside
 * -- which is a disjunction. Inverting each constraint and conjoining them
 * describes the intersection of the six outer half-spaces, which is a
 * different and usually empty region.
 */
function occupiedBy(primitive, state) {
  const kind = primitive.entity.kind;
  if (kind === 'ball' || kind === 'plane') {
    return state.get(surfaceKey(primitive.entity.id, kind === 'ball' ? null : 0));
  }
  let inside = true;
  for (let face = 0; face < primitive.planes.length; face++) {
    inside = and3(inside, state.get(surfaceKey(primitive.entity.id, face)));
    if (inside === false) return false;
  }
  return inside;
}

/**
 * Group occupancy, exactly as `field.groups` specifies it: the base inside, AND
 * every intersect inside, AND every subtract OUTSIDE. A modifier with no target
 * is global and already appears in every group's list; a targeted one appears
 * in exactly one. This function reads that structure rather than re-deriving
 * the scoping rule, so the two cannot disagree about which cutter bites what.
 */
function groupOccupied(group, state) {
  let occupied = occupiedBy(group.base, state);
  for (const modifier of group.modifiers) {
    const inside = occupiedBy(modifier, state);
    occupied = and3(occupied, modifier.entity.op === 'subtract' ? not3(inside) : inside);
    if (occupied === false) return false;
  }
  return occupied;
}

/**
 * Cast a ray through one compiled S3 region and report the first solid entry.
 *
 * `region` is a compiled region (`world.regions.get(id)`). `position` and
 * `direction` are a unit four-vector and a unit tangent at it. `maxDistance` is
 * an explicit PHYSICAL range the caller has already decided is meaningful.
 *
 * `status` is one of:
 *   'hit'         solid is entered at `distance`; see `contact`
 *   'miss'        NO solid anywhere in [0, maxDistance], certified
 *   'unresolved'  with a `reason`; never silently a miss
 *
 * WORK, in one unit: one atomic surface classified, one atomic surface solved
 * for roots, or one event applied to the Boolean. A region at the compile-time
 * caps (`REGION_LIMITS`: 64 primitives, 192 face planes) therefore costs at
 * most 192 + 64 surfaces to classify and the same again to solve -- about 512
 * before a single event is applied, which is why the default allowance is 2048.
 * The cost is bounded by the SCENE, not by the ray, except for the events.
 */
export function castSphericalRegion(region, position, direction, options = {}) {
  const space = region?.space, field = region?.field;
  if (space?.kind !== 's3') throw new Error('castSphericalRegion requires an S3 region');
  if (!field || !Array.isArray(field.primitives) || !Array.isArray(field.groups)) {
    throw new Error('castSphericalRegion requires a compiled region field');
  }
  space.validatePoint(position);
  space.validateTangent(position, direction);
  if (Math.abs(space.norm(position, direction) - 1) > 1e-8) {
    throw new Error('Ray direction must be unit length');
  }
  const R = space.curvatureRadius;
  const { maxDistance, maxEvents = S3_CAST_DEFAULTS.maxEvents,
    maxWork = S3_CAST_DEFAULTS.maxWork } = options;
  if (!Number.isFinite(maxDistance) || maxDistance <= 0) {
    throw new Error('maxDistance must be a positive finite physical range');
  }
  // REFUSED, NOT SUBDIVIDED. Past half a great circle the root equation stops
  // having a unique branch to screen, and splitting the span is a policy about
  // what a sightline means -- which belongs to the coordinator that owns
  // portals and chart exits, not to this query.
  if (maxDistance > Math.PI * R) {
    throw new Error(`maxDistance ${maxDistance} exceeds one S3 half-circle (${Math.PI * R}); `
      + 'the sight coordinator must arbitrate a longer span, not this query');
  }
  if (!Number.isInteger(maxEvents) || maxEvents < 0) throw new Error('Invalid maxEvents');
  if (!Number.isInteger(maxWork) || maxWork < 0) throw new Error('Invalid maxWork');

  const point = [...position], heading = [...direction];
  let work = 0;
  const refuse = (reason, detail = null) => Object.freeze({
    status: 'unresolved', reason, detail, work, events: 0,
    distance: null, point: null, tangent: null, normal: null, contact: null,
    additiveOwner: null, additiveOwners: Object.freeze([]), surfaceOwner: null, face: null,
  });

  // LIMITS VALIDATED BEFORE ANYTHING IS SPENT. The classification and solving
  // cost is known from the scene alone, so an impossible allowance is reported
  // without doing the work it could not have paid for.
  const surfaces = [];
  for (const primitive of field.primitives) {
    for (const surface of surfacesOf(primitive, R)) surfaces.push({ primitive, ...surface });
  }
  if (2 * surfaces.length > maxWork) {
    return refuse('work-budget', `this region needs ${2 * surfaces.length} work units to classify `
      + `and solve ${surfaces.length} atomic surfaces; the allowance is ${maxWork}`);
  }

  // 1. Atomic occupancy at the origin, from the inequalities themselves.
  const state = new Map();
  for (const surface of surfaces) {
    work++;
    state.set(surfaceKey(surface.primitive.entity.id, surface.face),
      classify(surface, point, heading));
  }
  const sceneOccupied = () => field.groups.reduce((acc, group) => or3(acc, groupOccupied(group, state)), false);

  const atOrigin = sceneOccupied();
  if (atOrigin === null) {
    return refuse('ambiguous-origin', 'the ray begins within the screening guard of a boundary');
  }
  if (atOrigin === true) {
    // AN OCCUPANCY CONVENTION, NOT A SURFACE. There is no boundary at t = 0 and
    // no normal belongs here; reporting one would be inventing a face for a
    // caller that asked where solid begins and was already in it.
    const inside = field.groups.filter(g => groupOccupied(g, state) === true).map(g => g.base.entity.id);
    return Object.freeze({
      status: 'hit', reason: null, detail: null, contact: 'inside',
      distance: 0, point: Object.freeze([...point]), tangent: Object.freeze([...heading]),
      normal: null, surfaceOwner: null, face: null,
      additiveOwner: inside.length === 1 ? inside[0] : null,
      additiveOwners: Object.freeze(inside), work, events: 0,
    });
  }

  // 2. Every primitive's candidates, under ONE shared event budget. A single
  // unresolved list makes the whole cast unresolved: a partial collection
  // cannot certify that the prefix before its first missing root is empty.
  const events = [];
  for (const primitive of field.primitives) {
    work += surfacesOf(primitive, R).length;
    if (work > maxWork) return refuse('work-budget', 'exhausted while solving primitive roots');
    const found = sphericalBoundaryEvents(space, primitive, point, heading, {
      maxDistance, maxEvents: maxEvents - events.length,
    });
    if (found.status !== 'complete') {
      return refuse('primitive-events', `${primitive.entity.id}: ${found.reason}`);
    }
    for (const event of found.events) events.push(event);
    if (events.length > maxEvents) return refuse('event-budget', 'more candidates than the allowance');
  }

  // 3. Merge, and refuse overlap rather than ordering it. Two candidates whose
  // guard intervals meet are not known to be distinguishable, and choosing
  // between them by primitive id would be an ordering the geometry never gave.
  events.sort((a, b) => a.distance - b.distance);
  for (let i = 1; i < events.length; i++) {
    if (events[i].distance - events[i - 1].distance <= events[i].guard + events[i - 1].guard) {
      return refuse('coincident-events',
        `${events[i - 1].primitiveId} and ${events[i].primitiveId} within their screening guards`);
    }
  }

  // 4. Walk. Each event sets its OWN atomic surface -- from the transition the
  // solver reported, not by flipping a bit, so a state cannot drift out of step
  // with the geometry -- and then the whole Boolean is asked again. A face of a
  // cell whose other faces are still outside changes nothing, which is how an
  // inactive face root skips itself without an epsilon step that could also
  // skip a thin cut.
  const owner = new Map(field.primitives.map(p => [p.entity.id, p]));
  for (const event of events) {
    work++;
    if (work > maxWork) return refuse('work-budget', 'exhausted while applying events');
    state.set(surfaceKey(event.primitiveId, event.face), event.transition === 'enter');
    const now = sceneOccupied();
    if (now === null) {
      return refuse('ambiguous-occupancy',
        `after ${event.primitiveId} at ${event.distance}, occupancy could not be decided`);
    }
    if (now !== true) continue;
    const entered = field.groups.filter(g => groupOccupied(g, state) === true).map(g => g.base.entity.id);
    // The surface belongs to the primitive whose root this is. A subtraction's
    // boundary faces INTO the carve, so a ray entering solid through it meets
    // the reversed normal -- the solid is on the other side of that surface
    // from the primitive's own outside.
    const source = owner.get(event.primitiveId);
    const reversed = source?.entity.op === 'subtract';
    return Object.freeze({
      status: 'hit', reason: null, detail: null, contact: 'surface',
      distance: event.distance,
      point: Object.freeze([...event.point]), tangent: Object.freeze([...event.direction]),
      normal: Object.freeze(event.normal.map(x => (reversed ? -x : x))),
      surfaceOwner: event.primitiveId, face: event.face,
      additiveOwner: entered.length === 1 ? entered[0] : null,
      additiveOwners: Object.freeze(entered),
      work, events: events.length,
    });
  }

  // 5. Every candidate was found, every evaluation was definite, and the ray
  // was never inside anything. That is a claim, and it is only made here.
  return Object.freeze({
    status: 'miss', reason: null, detail: null, contact: null,
    distance: null, point: null, tangent: null, normal: null,
    surfaceOwner: null, face: null, additiveOwner: null, additiveOwners: Object.freeze([]),
    work, events: events.length,
  });
}
