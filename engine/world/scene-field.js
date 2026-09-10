// A scene of solid primitives, compiled into the field the renderer draws and
// the collision solver walks into. One implementation, so the two cannot
// disagree -- which is the whole reason the query boundary exists.
//
// v1 solids: BALL (a metric sphere) and PLANE (a half-space). Both have an
// exact distance, an exact normal and an exact ray hit, which is capability
// (1), (2) and (3) of docs/rendering-contract.md rather than a bound standing
// in for all three.
//
// The union of solids is `min` over their distances. For EXACT distances that
// is exact outside the union, and an underestimate inside a concave junction
// -- the safe direction, and the same rule level.js's `levelMap` follows.
//
// No DOM, no graphics, no host transform.
import { validateScene } from './document.js';
import { portalPair } from './portal.js';

function vector3(p, name = 'position') {
  if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)) {
    throw new Error(`${name} must contain three finite coordinates`);
  }
  return p;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** One solid, as the field sees it. Authored data stays in the document. */
function solidOf(entity) {
  if (entity.kind === 'ball') {
    const c = entity.position.slice(), r = entity.radius;
    return Object.freeze({
      id: entity.id, kind: 'ball', op: entity.op || 'add', target: entity.target ?? null,
      center: c, radius: r,
      distance: (p) => Math.hypot(...sub(p, c)) - r,
      // Undefined at the exact centre: every direction is equally outward, and
      // returning one of them would be a guess the caller cannot detect.
      normal(p) { const v = sub(p, c), d = Math.hypot(...v); return d ? v.map((x) => x / d) : null; },
      rayHit(p, u) {
        const v = sub(p, c), c0 = dot3(v, v) - r * r;
        if (c0 <= 0) return 0;
        const b = dot3(v, u), disc = b * b - c0;
        return b >= 0 || disc < 0 ? Infinity : c0 / (-b + Math.sqrt(disc));
      },
    });
  }
  if (entity.kind === 'plane') {
    // { p : dot(p, n) = offset }, solid on the side n points AWAY from.
    const n = entity.up.slice(), offset = dot3(entity.position, n);
    return Object.freeze({
      id: entity.id, kind: 'plane', op: entity.op || 'add', target: entity.target ?? null,
      normal: n, offset,
      distance: (p) => dot3(p, n) - offset,
      // Constant everywhere, which is what makes a plane the cheapest possible
      // ground contact: no gradient estimate, no finite differences.
      normalAt: () => n.slice(),
      rayHit(p, u) {
        const denom = dot3(u, n);
        const height = dot3(p, n) - offset;
        if (height <= 0) return 0;                 // already inside the solid
        if (denom >= -1e-12) return Infinity;      // parallel, or moving away
        return -height / denom;
      },
    });
  }
  throw new Error(`entity ${entity.id}: kind ${entity.kind} is not a solid`);
}

const SOLID_KINDS = ['ball', 'plane'];

/**
 * Compile a validated document into a field plus the authoring data a host
 * needs. The snapshot is immutable: a failed edit cannot corrupt it, and
 * nothing handed out here aliases the caller's document.
 */
export function compileSceneField(source) {
  validateScene(source);
  if (source.regions.length !== 1 || source.regions[0].geometry.kind !== 'e3') {
    throw new Error('Scene field currently supports one E3 cover region');
  }
  const scene = structuredClone(source);
  const region = scene.regions[0];
  const solids = scene.entities.filter((e) => SOLID_KINDS.includes(e.kind)).map(solidOf);
  const spawns = scene.entities.filter((e) => e.kind === 'spawn');
  if (spawns.length !== 1) throw new Error('Scene field requires exactly one spawn');

  const added = solids.filter((x) => x.op !== 'subtract');
  const carved = solids.filter((x) => x.op === 'subtract');
  const addedIds = new Set(added.map((x) => x.id));
  for (const c of carved) {
    if (c.target !== null && !addedIds.has(c.target)) {
      throw new Error(`entity ${c.id}: target ${c.target} is not a solid in this scene`);
    }
  }
  // Which carves apply to which solid, worked out once. A carve with no
  // target applies to all of them, and that is EQUIVALENT to applying it to
  // the union afterwards, because max distributes over min:
  //     max(min(a, b), k) = min(max(a, k), max(b, k))
  // so the scoped form is a strict generalisation rather than a different
  // operation that happens to agree in one case.
  const carvesFor = new Map(added.map((a) =>
    [a.id, carved.filter((c) => c.target === null || c.target === a.id)]));

  /**
   * The field, as a boolean expression over the authored solids.
   *
   *     d(p) = max( min_i added_i(p) , max_j -carved_j(p) )
   *
   * The union is `min`, and subtraction is `max` against the NEGATED carving
   * solid: a point is in the result when it is inside something added and
   * outside everything carved away.
   *
   * WHICH TERM WON DECIDES THE NORMAL, and this is the part that is easy to
   * get wrong. Taking the normal from a different solid than the distance came
   * from draws and collides against two different surfaces. On a carved face
   * the surface belongs to the carving solid but points the OTHER WAY -- you
   * are standing in the doorway looking at the inside of the box that made it
   * -- so its normal is negated with the distance it came from.
   *
   * EXACTNESS. `min` of two exact signed distances is still exact. `max` is
   * NOT: it under-estimates near a concave seam, where the true nearest point
   * is on neither surface but on the edge where they meet. That is safe for
   * sphere tracing, which only needs a lower bound, and it is why a scene with
   * any carve advertises `distance: 'bound'` rather than `'exact'`. See
   * docs/rendering-contract.md.
   */
  function nearest(p) {
    vector3(p);
    // Nothing to carve FROM is not the same as carving nothing: with no
    // additive solid the scene is empty space, and subtracting from empty
    // space leaves empty space.
    if (!added.length) return { solid: null, distance: Infinity, negate: false };
    let best = null, bestD = Infinity, negate = false;
    for (const a of added) {
      let d = a.distance(p), winner = a, flip = false;
      for (const c of carvesFor.get(a.id)) {
        const cut = -c.distance(p);
        if (cut > d) { d = cut; winner = c; flip = true; }
      }
      if (d < bestD) { bestD = d; best = winner; negate = flip; }
    }
    return { solid: best, distance: bestD, negate };
  }

  // Connections become one-way aperture descriptors, two per portal. An
  // aperture is NOT a solid: it is a hole, and the field must not report it as
  // something to collide with.
  const byId = new Map(scene.entities.map((e) => [e.id, e]));
  const portals = scene.connections.flatMap((c) => {
    const [a, b] = portalPair(byId.get(c.a), byId.get(c.b), { id: c.id });
    // A traveller has to FIT. The schema pins the two radii equal, so one
    // check covers both ends; an aperture narrower than the player is a
    // portal nobody can use, and finding that out by walking into it is
    // worse than being told when the scene is compiled.
    if (byId.get(c.a).radius <= scene.units.playerRadius) {
      throw new Error(`connection ${c.id}: aperture radius ${byId.get(c.a).radius} `
        + `does not admit a player of radius ${scene.units.playerRadius}`);
    }
    return [a, b];
  });

  const ball = scene.entities.find((e) => e.kind === 'ball') || null;
  const plane = scene.entities.find((e) => e.kind === 'plane') || null;
  const planeSolid = solids.find((s) => s.kind === 'plane') || null;

  return Object.freeze({
    id: scene.id,
    regionId: region.id,
    extent: region.extent,
    playerRadius: scene.units.playerRadius,
    spawn: spawns[0].position.slice(),
    // What this field PROMISES, which changes with the operations used to
    // build it. A carve makes the distance a lower bound rather than the true
    // distance, and makes an exact per-primitive ray hit wrong -- the nearest
    // surface along the ray may be one that has been carved away -- so the
    // intersection becomes marched. Advertising this is the difference between
    // a conservative solver and a lying one.
    capabilities: Object.freeze(carved.length
      ? { distance: 'bound', intersection: 'marched', normal: 'exact-except-ball-center' }
      : { distance: 'exact', intersection: 'exact', normal: 'exact-except-ball-center' }),
    /** Solids subtracted rather than added. Non-empty means the field is a bound. */
    carveCount: carved.length,
    carvesUniform: () => carved.filter((x) => x.kind === 'ball')
      .flatMap((x) => [...x.center, x.radius]),
    document: () => structuredClone(scene),
    solidCount: solids.length,
    /** One-way aperture descriptors, two per connection. Holes, not solids. */
    portals,
    portalCount: portals.length,
    /** vec4(centre, radius) per aperture, for drawing them. */
    portalDiscs: () => portals.map((x) => [...x.center, x.radius]),
    portalNormals: () => portals.map((x) => [...x.normal, 0]),
    /** Where each aperture lets out, and the linear part of the map to it. */
    portalExits: () => portals.map((x) => [...x.exitCenter, 0]),
    portalMaps: () => portals.map((x) => x.matrix),
    /** The connections themselves, so an editor can talk about portals. */
    connections: () => scene.connections.map((c) => structuredClone(c)),
    /** The connection an anchor belongs to, or null. */
    connectionOf: (entityId) =>
      structuredClone(scene.connections.find((c) => c.a === entityId || c.b === entityId) || null),
    /** Every entity, in document order, for an inspector to list. */
    entities: () => scene.entities.map((e) => structuredClone(e)),
    /**
     * All balls and all planes as flat uniform arrays.
     *
     * The shader loops over these with a uniform bound rather than branching
     * per object, which is the lesson CLAUDE.md records at length: separate
     * branches in a scene function are re-emitted at every place that function
     * is inlined, and that is what took a link from five seconds to 212. One
     * loop body, N iterations, and an object costs nothing when it is absent.
     */
    ballsUniform: () => solids.filter((x) => x.kind === 'ball')
      .flatMap((x) => [...x.center, x.radius]),
    planesUniform: () => solids.filter((x) => x.kind === 'plane')
      .flatMap((x) => [...x.normal, x.offset]),
    ballCount: solids.filter((x) => x.kind === 'ball').length,
    planeCount: solids.filter((x) => x.kind === 'plane').length,
    /** The FIRST ball/plane, kept for the single-primitive hosts and checks. */
    ballUniform: () => (ball ? [...ball.position, ball.radius] : null),
    planeUniform: () => (planeSolid ? [...planeSolid.normal, planeSolid.offset] : null),
    hasPlane: !!planeSolid,
    planeId: plane ? plane.id : null,
    ballId: ball ? ball.id : null,
    distance(p) {
      // An empty scene is all free space, not distance zero.
      return solids.length ? nearest(p).distance : Infinity;
    },
    normal(p) {
      const { solid, negate } = nearest(p);
      if (!solid) return null;
      const n = solid.kind === 'plane' ? solid.normalAt() : solid.normal(p);
      // A carved face is the carving solid's surface, seen from the other
      // side. Without the flip a walker slides along a doorway's edge as if
      // the wall were still there.
      return n && negate ? n.map((x) => -x) : n;
    },
    rayHit(p, direction) {
      vector3(p); vector3(direction, 'direction');
      if (Math.abs(Math.hypot(...direction) - 1) > 1e-8) throw new Error('Ray direction must be unit length');
      // No carves: every primitive solves in closed form and the nearest one
      // wins. This is the exact path and it stays exact.
      if (!carved.length) {
        let best = Infinity;
        for (const s of added) best = Math.min(best, s.rayHit(p, direction));
        return best;
      }
      // With carves the nearest analytic surface may have been cut away, so
      // the closed forms no longer answer the question. Sphere-trace the
      // expression instead: the distance is a lower bound, which is exactly
      // the guarantee tracing needs, and the capability says so.
      let t = 0;
      for (let step = 0; step < 256; step++) {
        const at = [p[0] + direction[0] * t, p[1] + direction[1] * t, p[2] + direction[2] * t];
        const d = nearest(at).distance;
        if (d < 1e-6) return t;
        t += d;
        if (t > 1e6) break;
      }
      return Infinity;
    },
  });
}

/**
 * Edit one entity by ID and revalidate. The source is never mutated: a
 * rejected edit leaves the caller holding exactly what it had, which is what
 * makes an editor's undo stack trustworthy.
 */
export function editScene(source, id, patch) {
  return editEntities(source, [{ id, patch }]);
}

/**
 * Edit SEVERAL entities as one transaction.
 *
 * Some edits have no valid intermediate. A portal's two apertures must have
 * equal radii, so widening one and then the other passes through a document
 * the validator refuses -- an author who types a new radius would be told
 * their scene is broken by the halfway state of their own edit. The fix is not
 * to relax the rule; it is to stop pretending a two-ended thing is edited one
 * end at a time. Every patch applies, then the whole document is validated
 * once, so a rejected transaction leaves the source exactly as it was.
 */
export function editEntities(source, patches) {
  const next = compileSceneField(source).document();
  for (const { id, patch } of patches) {
    const entity = next.entities.find((e) => e.id === id);
    if (!entity) throw new Error(`No entity with id ${id}`);
    for (const [key, value] of Object.entries(patch)) {
      entity[key] = Array.isArray(value) ? value.slice() : value;
    }
  }
  compileSceneField(next);        // throws before anything is handed back
  return next;
}

/** A stable, readable, unused ID of the form `ball-3`. */
function freshId(scene, kind) {
  const taken = new Set([scene.id, ...scene.regions.map((r) => r.id),
    ...scene.entities.map((e) => e.id), ...scene.connections.map((c) => c.id)]);
  for (let n = 1; ; n++) {
    const id = `${kind}-${n}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * Add a portal: two apertures and the connection between them, in one step.
 *
 * ATOMIC BECAUSE A HALF-BUILT PORTAL IS NOT A PORTAL. The pieces could be
 * added separately -- two loose anchors validate fine -- but then an undo
 * leaves one end behind and the author has to know that a portal is three
 * objects. It is one object to them, so it is one transaction here.
 *
 * `forward` points OUT of each aperture, into the space it serves; that is the
 * convention portal.js depends on and the reason the two defaults face
 * opposite ways.
 */
export function addPortal(source, {
  a = [0, 0, 1.2], b = [6, 4, 1.2], radius = 1.1,
  forwardA = [0, -1, 0], forwardB = [0, -1, 0], up = [0, 0, 1], id,
} = {}) {
  const next = compileSceneField(source).document();
  const connectionId = id || freshId(next, 'portal');
  const end = (position, forward) => {
    const anchor = {
      id: freshId(next, 'gate'), regionId: next.regions[0].id, kind: 'anchor',
      position: position.slice(), radius, forward: forward.slice(), up: up.slice(),
    };
    next.entities.push(anchor);   // pushed as we go, so freshId sees the first one
    return anchor.id;
  };
  const idA = end(a, forwardA), idB = end(b, forwardB);
  next.connections.push({
    id: connectionId, kind: 'portal', a: idA, b: idB,
    velocity: 'preserve-speed', scale: 1,
  });
  compileSceneField(next);
  return next;
}

/** Remove a portal and both of its apertures. The inverse of `addPortal`. */
export function removePortal(source, id) {
  const next = compileSceneField(source).document();
  const connection = next.connections.find((c) => c.id === id);
  if (!connection) throw new Error(`No portal with id ${id}`);
  const ends = new Set([connection.a, connection.b]);
  next.connections = next.connections.filter((c) => c.id !== id);
  next.entities = next.entities.filter((e) => !ends.has(e.id));
  compileSceneField(next);
  return next;
}

/**
 * Add one entity, in the region the scene already has.
 *
 * The caller supplies the kind and whatever that kind needs; everything else
 * is filled from the region. Validation runs before anything is returned, so a
 * rejected addition leaves the source exactly as it was.
 */
export function addEntity(source, kind, props = {}) {
  const next = compileSceneField(source).document();
  const entity = { id: props.id || freshId(next, kind), regionId: next.regions[0].id, kind };
  for (const [key, value] of Object.entries(props)) {
    if (key === 'id') continue;
    entity[key] = Array.isArray(value) ? value.slice() : value;
  }
  next.entities.push(entity);
  compileSceneField(next);
  return next;
}

/**
 * Remove one entity by ID.
 *
 * Deleting the only spawn is refused HERE rather than leaving an invalid
 * document for the validator to reject with a message about entity counts:
 * the author asked to delete a spawn, so that is what the error should be
 * about.
 */
export function removeEntity(source, id) {
  const next = compileSceneField(source).document();
  const entity = next.entities.find((e) => e.id === id);
  if (!entity) throw new Error(`No entity with id ${id}`);
  if (entity.kind === 'spawn' && next.entities.filter((e) => e.kind === 'spawn').length === 1) {
    throw new Error('Cannot delete the only spawn: a scene needs somewhere to start');
  }
  // An aperture is one END of something. Deleting it alone leaves a connection
  // pointing at nothing, and the validator would then complain about an
  // unknown anchor -- true, but about the wreckage rather than about what the
  // author actually did. Say what is in the way and name the operation that
  // does what they meant.
  const holder = next.connections.find((c) => c.a === id || c.b === id);
  if (holder) {
    throw new Error(`Cannot delete ${id} on its own: it is one end of portal `
      + `${holder.id}. Delete the portal, which removes both ends.`);
  }
  next.entities = next.entities.filter((e) => e.id !== id);
  compileSceneField(next);
  return next;
}
