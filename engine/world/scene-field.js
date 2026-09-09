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
      id: entity.id, kind: 'ball', center: c, radius: r,
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
      id: entity.id, kind: 'plane', normal: n, offset,
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
  if (source.connections.length) {
    throw new Error('Scene field does not implement portal connections yet');
  }
  const scene = structuredClone(source);
  const region = scene.regions[0];
  const solids = scene.entities.filter((e) => SOLID_KINDS.includes(e.kind)).map(solidOf);
  const spawns = scene.entities.filter((e) => e.kind === 'spawn');
  if (spawns.length !== 1) throw new Error('Scene field requires exactly one spawn');

  // The nearest solid decides both the distance and the normal. Taking the
  // normal from a different solid than the distance came from is a class of
  // bug that draws and collides against two different surfaces.
  function nearest(p) {
    vector3(p);
    let best = null, bestD = Infinity;
    for (const s of solids) {
      const d = s.distance(p);
      if (d < bestD) { bestD = d; best = s; }
    }
    return { solid: best, distance: bestD };
  }

  const ball = scene.entities.find((e) => e.kind === 'ball') || null;
  const plane = scene.entities.find((e) => e.kind === 'plane') || null;
  const planeSolid = solids.find((s) => s.kind === 'plane') || null;

  return Object.freeze({
    id: scene.id,
    regionId: region.id,
    extent: region.extent,
    playerRadius: scene.units.playerRadius,
    spawn: spawns[0].position.slice(),
    capabilities: Object.freeze({ distance: 'exact', intersection: 'exact', normal: 'exact-except-ball-center' }),
    document: () => structuredClone(scene),
    solidCount: solids.length,
    /** The editable ball, for hosts whose inspector edits one. */
    ballUniform: () => (ball ? [...ball.position, ball.radius] : null),
    /** vec4(normal, offset) for the drawn floor, or null when there is none. */
    planeUniform: () => (planeSolid ? [...planeSolid.normal, planeSolid.offset] : null),
    hasPlane: !!planeSolid,
    planeId: plane ? plane.id : null,
    ballId: ball ? ball.id : null,
    distance(p) {
      // An empty scene is all free space, not distance zero.
      return solids.length ? nearest(p).distance : Infinity;
    },
    normal(p) {
      const { solid } = nearest(p);
      if (!solid) return null;
      return solid.kind === 'plane' ? solid.normalAt() : solid.normal(p);
    },
    rayHit(p, direction) {
      vector3(p); vector3(direction, 'direction');
      if (Math.abs(Math.hypot(...direction) - 1) > 1e-8) throw new Error('Ray direction must be unit length');
      let best = Infinity;
      for (const s of solids) best = Math.min(best, s.rayHit(p, direction));
      return best;
    },
  });
}

/**
 * Edit one entity by ID and revalidate. The source is never mutated: a
 * rejected edit leaves the caller holding exactly what it had, which is what
 * makes an editor's undo stack trustworthy.
 */
export function editScene(source, id, patch) {
  const next = compileSceneField(source).document();
  const entity = next.entities.find((e) => e.id === id);
  if (!entity) throw new Error(`No entity with id ${id}`);
  for (const [key, value] of Object.entries(patch)) {
    entity[key] = Array.isArray(value) ? value.slice() : value;
  }
  compileSceneField(next);        // throws before anything is handed back
  return next;
}
