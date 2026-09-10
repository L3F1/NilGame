// A scene of solid primitives, compiled into the field the renderer draws and
// the collision solver walks into. One implementation, so the two cannot
// disagree -- which is the whole reason the query boundary exists.
//
// v1 solids: BALL (a metric sphere), BOX (axis-aligned half-extents) and
// PLANE (a half-space). All three have an exact distance, an exact normal and
// an exact ray hit, which is capability (1), (2) and (3) of
// docs/rendering-contract.md rather than a bound standing in for all three.
// That is why a box is a primitive and not six clipped planes: the clipped
// construction is correct and is only a BOUND, and one bound anywhere makes
// the whole scene marched.
//
// The union of solids is `min` over their distances. For EXACT distances that
// is exact outside the union, and an underestimate inside a concave junction
// -- the safe direction, and the same rule level.js's `levelMap` follows.
//
// No DOM, no graphics, no host transform.
import { validateScene } from './document.js';
import { portalPair } from './portal.js';
import { csgRayCast } from '../geometry/e3-ray-intervals.js';

function vector3(p, name = 'position') {
  if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)) {
    throw new Error(`${name} must contain three finite coordinates`);
  }
  return p;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** One solid, as the field sees it. Authored data stays in the document. */
export function primitiveOf(entity) {
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
  if (entity.kind === 'box') {
    // AXIS-ALIGNED BOX, and the reason it is a primitive rather than sugar
    // over six clipped planes. Six planes is the correct EXPRESSION and it is
    // the wrong FIELD: every intersection is a `max`, so a box built that way
    // is a bound, and a bound turns the whole scene marched. The one shape an
    // author reaches for most would be the shape that costs the most. The
    // closed form below is exact everywhere, so a room made of boxes still
    // renders down the closed-form path.
    //
    // Outside: the distance to the box is the length of the componentwise
    // overshoot, because the nearest point on a box is found per axis
    // independently -- clamp the query into the box and measure. Inside:
    // every overshoot is negative and the distance to the nearest FACE is the
    // largest of them (the least deep), which is exact too. Neither case is
    // an estimate, which is what separates this from `max` over half-spaces.
    const c = entity.position.slice(), h = entity.halfExtent.slice();
    const forward = entity.frame?.forward.slice() || [0, 1, 0];
    const up = entity.frame?.up.slice() || [0, 0, 1];
    const right = [forward[1] * up[2] - forward[2] * up[1],
      forward[2] * up[0] - forward[0] * up[2], forward[0] * up[1] - forward[1] * up[0]];
    const axes = [right, forward, up];
    const localDirection = (v) => axes.map((a) => dot3(a, v));
    const localPoint = (p) => localDirection(sub(p, c));
    const worldDirection = (v) => [0, 1, 2].map((i) => axes.reduce((s, a, j) => s + a[i] * v[j], 0));
    const over = (p) => localPoint(p).map((x, i) => Math.abs(x) - h[i]);
    function normalInfo(p) {
      const q = over(p), local = localPoint(p);
      const o = q.map((x) => Math.max(x, 0)), len = Math.hypot(...o);
      const away = (i) => local[i] < 0 ? -1 : 1;
      if (len > 0) return { normal: worldDirection(o.map((x, i) => away(i) * x / len)), unique: true };
      const m = Math.max(...q), i = q.indexOf(m), n = [0, 0, 0];
      n[i] = away(i);
      return { normal: worldDirection(n), unique: q.filter((x) => x === m).length === 1 && local[i] !== 0 };
    }
    return Object.freeze({
      id: entity.id, kind: 'box', op: entity.op || 'add', target: entity.target ?? null,
      center: c, halfExtent: h, frame: axes.flat(), forward, up,
      localPoint, localDirection, worldDirection,
      distance(p) {
        const q = over(p);
        return Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0))
          + Math.min(Math.max(q[0], q[1], q[2]), 0);
      },
      /**
       * Outside, the direction away from the nearest point, which on a corner
       * or an edge is the diagonal -- that is the true gradient, not a choice.
       * Inside and ON the surface, the face that is nearest.
       *
       * WHERE IT IS A CHOICE: on an edge or a corner reached from inside, two
       * or three faces tie exactly, and no normal is more correct than
       * another. The lowest axis index wins, deterministically. A ball says
       * `null` at its centre because there every direction is equally
       * outward and no answer is defensible; here the tie set is a measure-
       * zero seam a resting walker sits on constantly, and refusing to answer
       * would be worse than answering consistently.
       */
      normal: (p) => normalInfo(p).normal,
      normalInfo,
      /**
       * Slab method, exact. `tmin` starts at 0 so a ray that begins inside
       * reports 0, which is the same convention the ball and the plane use:
       * "you are already in it" is not a distance to travel.
       */
      rayHit(p, u) {
        p = localPoint(p); u = localDirection(u);
        let tmin = 0, tmax = Infinity;
        for (let i = 0; i < 3; i++) {
          if (u[i] === 0) {
            // Parallel to this pair of faces: either always between them or
            // never, and never means the ray misses no matter how far it goes.
            if (Math.abs(p[i]) > h[i]) return Infinity;
            continue;
          }
          const inv = 1 / u[i];
          let t1 = (-h[i] - p[i]) * inv, t2 = (h[i] - p[i]) * inv;
          if (t1 > t2) { const swap = t1; t1 = t2; t2 = swap; }
          if (t1 > tmin) tmin = t1;
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) return Infinity;
        }
        return tmin;
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

const SOLID_KINDS = ['ball', 'box', 'plane'];

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
  const solids = scene.entities.filter((e) => SOLID_KINDS.includes(e.kind)).map(primitiveOf);
  const spawns = scene.entities.filter((e) => e.kind === 'spawn');
  if (spawns.length !== 1) throw new Error('Scene field requires exactly one spawn');

  const added = solids.filter((x) => (x.op || 'add') === 'add');
  const carved = solids.filter((x) => x.op === 'subtract');
  const intersected = solids.filter((x) => x.op === 'intersect');
  const addedIds = new Set(added.map((x) => x.id));
  for (const c of [...carved, ...intersected]) {
    if (c.target !== null && !addedIds.has(c.target)) {
      throw new Error(`entity ${c.id}: target ${c.target} is not a solid in this scene`);
    }
  }
  // MODIFIERS: everything that is not simply added. Both operations are a
  // `max` against the modifying solid and differ only in SIGN --
  //
  //     subtract   max(d, -m)    keep what is outside m
  //     intersect  max(d, +m)    keep what is inside m
  //
  // so they share one path rather than two nearly identical ones. That is not
  // a tidiness argument: two copies of this loop would be two places for the
  // winner-tracking to disagree, and the winner decides the normal.
  //
  // A modifier with no target applies to every solid, and that is EQUIVALENT
  // to applying it to the union afterwards, because max distributes over min:
  //     max(min(a, b), k) = min(max(a, k), max(b, k))
  // so the scoped form is a strict generalisation rather than a different
  // operation that happens to agree in one case.
  const allModifiers = [
    ...carved.map((s) => ({ solid: s, sign: -1 })),
    ...intersected.map((s) => ({ solid: s, sign: 1 })),
  ];
  const modsFor = new Map(added.map((a) =>
    [a.id, allModifiers.filter((m) => m.solid.target === null || m.solid.target === a.id)]));
  const signature = (s) => JSON.stringify(s.kind === 'ball' ? [s.kind, s.center, s.radius]
    : s.kind === 'box' ? [s.kind, s.center, s.halfExtent, s.frame]
      : [s.kind, s.normal, s.offset]);
  // Regularized exact duplicate subtraction is provably empty, unlike an
  // arbitrary near-coincident pair. Remove it from BOTH field and ray queries
  // and expose the retained IDs so hosts do not draw its zero-set shell.
  const activeAdded = added.filter((a) => !modsFor.get(a.id).some((m) =>
    m.sign < 0 && signature(a) === signature(m.solid)));
  const modifiers = allModifiers.filter((m) => activeAdded.some((a) =>
    m.solid.target === null || m.solid.target === a.id));
  const modified = modifiers.length > 0;

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
   * EXACTNESS. A union retains exact EXTERIOR distance, but overlapping
   * interiors do not retain exact signed distance. Boolean max can also lose
   * exterior exactness. The sign and conservative magnitude bound survive.
   */
  function nearest(p) {
    vector3(p);
    // Nothing to carve FROM is not the same as carving nothing: with no
    // additive solid the scene is empty space, and subtracting from empty
    // space leaves empty space.
    if (!activeAdded.length) return { solid: null, distance: Infinity, negate: false };
    let best = null, bestD = Infinity, negate = false, active = [];
    for (const a of activeAdded) {
      let d = a.distance(p), winner = a, flip = false, terms = [{ solid: a, sign: 1 }];
      for (const m of modsFor.get(a.id)) {
        const v = m.sign * m.solid.distance(p);
        // The sign is what makes the surface face the other way. A carved
        // face is the carving solid seen from INSIDE it, so its normal
        // flips; a clipping face is the clipping solid seen from outside,
        // so its normal does not.
        if (v > d) { d = v; winner = m.solid; flip = m.sign < 0; terms = [m]; }
        else if (v === d) terms.push(m);
      }
      if (d < bestD) { bestD = d; best = winner; negate = flip; active = terms; }
      else if (d === bestD) active.push(...terms);
    }
    return { solid: best, distance: bestD, negate, active };
  }

  function normalSample(p) {
    const { solid, active = [] } = nearest(p);
    if (!solid) return { normal: null, unique: false, owner: null, reason: 'empty' };
    const samples = active.map(({ solid: s, sign }) => {
      const n = s.kind === 'plane' ? s.normalAt(p) : s.normal(p);
      return { normal: n && n.map((x) => x * sign), unique: !!n && (!s.normalInfo || s.normalInfo(p).unique) };
    });
    const normal = samples[0].normal;
    const unique = !!normal && samples.every((s) => s.unique && s.normal.every((x, i) => Math.abs(x - normal[i]) <= 1e-12));
    return { normal, unique, owner: solid.id, reason: unique ? 'smooth' : normal ? 'nonsmooth' : 'undefined' };
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

  // Where a modifier's target sits in the arrays the renderer loops over.
  const addedBalls = activeAdded.filter((x) => x.kind === 'ball');
  const addedBoxes = activeAdded.filter((x) => x.kind === 'box');
  const addedPlanes = activeAdded.filter((x) => x.kind === 'plane');
  // One number naming a solid across three arrays: ball i, box 200+i, plane
  // 100+i. The bands are wide enough that no scene can collide them, and the
  // shader compares owners as ints because it cannot compare strings.
  function ownerIndex(mod) {
    if (mod.target === null) return -1;               // applies to everything
    const b = addedBalls.findIndex((x) => x.id === mod.target);
    if (b >= 0) return b;
    const p = addedPlanes.findIndex((x) => x.id === mod.target);
    if (p >= 0) return 100 + p;
    const x = addedBoxes.findIndex((k) => k.id === mod.target);
    return x >= 0 ? 200 + x : -1;
  }

  /**
   * COINCIDENT FACES: two flat surfaces occupying exactly the same plane.
   *
   * This is the condition behind the speckled line the box-room fixture once
   * drew across its doorway sill, and MUSE-31 measured what it actually is.
   * It is NOT a proximity. At an offset of 1e-12 the field is already clean;
   * at exactly zero, 21 of 41 rays across the sill come back
   * `indeterminate`. So there is no "too close" distance to warn on, and a
   * threshold would have been a number invented to fill a slot.
   *
   * What there IS, is an exact predicate. A face plane is (normal, offset),
   * both computed from authored numbers, so two faces coincide when those are
   * EQUAL -- not near, equal. That is cheap, view-independent, and answerable
   * from the document alone, which is what an editor needs and what a fan of
   * camera rays cannot reliably give: whether a ray happens to cross the seam
   * is a matter of where the author is standing.
   *
   * Only flat faces take part. A ball tangent to a plane touches at a point
   * rather than sharing a surface, and is a different condition with a
   * different symptom.
   */
  function facePlanes(s) {
    if (s.kind === 'plane') return [{ n: s.normal, d: s.offset, at: null, span: Infinity }];
    if (s.kind !== 'box') return [];
    const axes = [s.frame.slice(0, 3), s.frame.slice(3, 6), s.frame.slice(6, 9)];
    return axes.flatMap((a, i) => {
      const along = dot3(s.center, a);
      // `at` is the face centre and `span` its half-diagonal in the plane, so
      // two faces can be checked for actually meeting rather than merely
      // lying in the same infinite plane.
      const other = [0, 1, 2].filter((k) => k !== i);
      const span = Math.hypot(...other.map((k) => s.halfExtent[k]));
      return [+1, -1].map((sign) => ({
        n: a, d: along + sign * s.halfExtent[i],
        at: s.center.map((c, k) => c + sign * s.halfExtent[i] * a[k]),
        span, axes: other.map((k) => ({ dir: axes[k], half: s.halfExtent[k] })),
      }));
    });
  }
  // A plane and its opposite describe the same SET, so compare a canonical
  // form -- otherwise a floor written as up +z and a box face facing -z would
  // never be seen to coincide, which is exactly the case that bites.
  function canonicalFace({ n, d }) {
    const lead = n.find((x) => x !== 0) ?? 1;
    return lead < 0 ? `${n.map((x) => -x).join()}|${-d}` : `${n.join()}|${d}`;
  }
  /**
   * SHARING A PLANE IS NOT THE HAZARD. A crate resting on the floor shares the
   * plane z = 0 with it, and that is ordinary authoring, not a defect -- the
   * shipped box-room fixture has six such pairs and draws perfectly. The seam
   * there is BURIED: solid on both sides, so the union has no surface at that
   * plane at all and nothing has to decide which face a ray met.
   *
   * Nor is an EXPOSED shared plane enough on its own. In the shipped fixture
   * the wall's bottom face lies in the floor's plane and is exposed inside the
   * doorway -- but the wall's material there has been carved away, so only one
   * solid actually claims that surface and nothing is ambiguous. That fixture
   * renders perfectly, and a warning on it would be noise an author learns to
   * ignore.
   *
   * So the document supplies CANDIDATES exactly and cheaply, and the field
   * CONFIRMS them with the signal MUSE-31 identified: a ray cast straight onto
   * the seam comes back `indeterminate` when, and only when, the faces are
   * exactly coincident. Measured on the box-room sill: flagged at offset 0,
   * clean at 1e-12 and at every other offset tried. No threshold anywhere --
   * the candidate test is exact equality and the confirmation is the field's
   * own admission that it cannot tell.
   */
  function ambiguousAt(point, n) {
    const reach = Math.max(region.extent * 0.05, 0.5);
    for (const sign of [1, -1]) {
      const from = point.map((x, i) => x + n[i] * reach * sign);
      const dir = n.map((x) => -x * sign);
      try {
        if (api.rayCast(from, dir, { maxDistance: reach * 4 }).status === 'indeterminate') return true;
      } catch { /* a probe that cannot start says nothing either way */ }
    }
    return false;
  }
  function sharedSamples(faceA, faceB) {
    // Sample the smaller face; an unbounded plane has none of its own.
    const bounded = faceA.axes ? faceA : faceB;
    if (!bounded.axes) return [];
    const other = faceA.axes && faceB.axes && faceB.span < faceA.span ? faceB : bounded;
    const points = [];
    for (const su of [-0.6, 0, 0.6]) for (const sv of [-0.6, 0, 0.6]) {
      points.push(other.at.map((c, k) =>
        c + su * other.axes[0].half * other.axes[0].dir[k]
          + sv * other.axes[1].half * other.axes[1].dir[k]));
    }
    return points;
  }
  function coincidentFaces() {
    const byPlane = new Map();
    for (const s of solids) {
      for (const face of facePlanes(s)) {
        const key = canonicalFace(face);
        if (!byPlane.has(key)) byPlane.set(key, []);
        byPlane.get(key).push({ id: s.id, face });
      }
    }
    const found = [];
    for (const [plane, entries] of byPlane) {
      if (entries.length < 2) continue;
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const A = entries[i], B = entries[j];
          if (A.id === B.id) continue;
          const n = A.face.n;
          const where = sharedSamples(A.face, B.face).filter((q) => ambiguousAt(q, n));
          if (where.length) found.push({ a: A.id, b: B.id, plane, at: where[0] });
        }
      }
    }
    return found;
  }

  const ball = scene.entities.find((e) => e.kind === 'ball') || null;
  const plane = scene.entities.find((e) => e.kind === 'plane') || null;
  const planeSolid = solids.find((s) => s.kind === 'plane') || null;

  const api = Object.freeze({
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
    capabilities: Object.freeze({
      distance: activeAdded.length === 1 && !modified ? 'exact' : 'bound',
      exteriorDistance: modified ? 'bound' : 'exact',
      interiorDistance: activeAdded.length === 1 && !modified ? 'exact' : 'magnitude-bound',
      interiorSign: 'exact', intersection: 'analytic-with-numeric-guard',
      normal: 'deterministic-contact', normalUniqueness: 'query-dependent',
    }),
    /** Solids subtracted rather than added. Non-empty means the field is a bound. */
    carveCount: carved.length,
    /** Solids that CLIP their target rather than cutting it. Also a bound. */
    intersectCount: intersected.length,
    /** Everything that is not simply added: any of these makes the field a bound. */
    modifierCount: modifiers.length,
    /**
     * Carves as uniform arrays, plus the OWNER each one cuts.
     *
     * The owner is an index into the arrays the renderer already loops over --
     * ball i, or 100+i for plane i -- and -1 for a carve with no target, which
     * cuts everything. Handing the shader an entity ID instead would make it
     * do a string comparison per sample, which it cannot; handing it the
     * position in the array is the same information in the form the loop needs.
     */
    modBallsUniform: () => modifiers.filter((m) => m.solid.kind === 'ball')
      .flatMap((m) => [...m.solid.center, m.solid.radius]),
    modBallOwners: () => modifiers.filter((m) => m.solid.kind === 'ball')
      .map((m) => ownerIndex(m.solid)),
    modBallSigns: () => modifiers.filter((m) => m.solid.kind === 'ball').map((m) => m.sign),
    modPlanesUniform: () => modifiers.filter((m) => m.solid.kind === 'plane')
      .flatMap((m) => [...m.solid.normal, m.solid.offset]),
    modPlaneOwners: () => modifiers.filter((m) => m.solid.kind === 'plane')
      .map((m) => ownerIndex(m.solid)),
    modPlaneSigns: () => modifiers.filter((m) => m.solid.kind === 'plane').map((m) => m.sign),
    modBoxCentersUniform: () => modifiers.filter((m) => m.solid.kind === 'box')
      .flatMap((m) => m.solid.center),
    modBoxHalvesUniform: () => modifiers.filter((m) => m.solid.kind === 'box')
      .flatMap((m) => m.solid.halfExtent),
    modBoxFramesUniform: () => modifiers.filter((m) => m.solid.kind === 'box').flatMap((m) => m.solid.frame),
    modBoxForwardsUniform: () => modifiers.filter((m) => m.solid.kind === 'box')
      .flatMap((m) => [...m.solid.forward, 0]),
    modBoxUpsUniform: () => modifiers.filter((m) => m.solid.kind === 'box')
      .flatMap((m) => [...m.solid.up, 0]),
    modBoxOwners: () => modifiers.filter((m) => m.solid.kind === 'box')
      .map((m) => ownerIndex(m.solid)),
    modBoxSigns: () => modifiers.filter((m) => m.solid.kind === 'box').map((m) => m.sign),
    modBoxCount: modifiers.filter((m) => m.solid.kind === 'box').length,
    modBallCount: modifiers.filter((m) => m.solid.kind === 'ball').length,
    modPlaneCount: modifiers.filter((m) => m.solid.kind === 'plane').length,
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
    ballsUniform: () => addedBalls.flatMap((x) => [...x.center, x.radius]),
    planesUniform: () => addedPlanes.flatMap((x) => [...x.normal, x.offset]),
    /** Boxes as centre and half-extent, in step. Axis-aligned, so no frame. */
    boxCentersUniform: () => addedBoxes.flatMap((x) => x.center),
    boxHalvesUniform: () => addedBoxes.flatMap((x) => x.halfExtent),
    boxFramesUniform: () => addedBoxes.flatMap((x) => x.frame),
    // FORWARD AND UP ONLY, padded to vec4. The shader derives `right` by the
    // same cross product the field does rather than being handed a third
    // axis, because two places computing a basis is two places that can
    // disagree about handedness -- and a flipped `right` mirrors the box on
    // screen while collision keeps the original.
    boxForwardsUniform: () => addedBoxes.flatMap((x) => [...x.forward, 0]),
    boxUpsUniform: () => addedBoxes.flatMap((x) => [...x.up, 0]),
    ballCount: addedBalls.length,
    boxCount: addedBoxes.length,
    planeCount: addedPlanes.length,
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
    normalSample,
    /**
     * Pairs of entities sharing a face plane EXACTLY. Empty is the normal
     * case; anything here is a place the field cannot say which surface a ray
     * met, and it reports `indeterminate` rather than guessing. Moving either
     * solid by any amount at all fixes it -- see the note on `coincidentFaces`
     * for why there is no threshold to report instead.
     */
    coincidentFaces,
    /** Retained additive IDs after exact duplicate subtraction simplification. */
    activeEntityIds: () => activeAdded.map((s) => s.id),
    /** Owned CSG groups for hosts; cloned authored data, never mutable closures. */
    groups: () => activeAdded.map((s) => ({
      entity: structuredClone(scene.entities.find((e) => e.id === s.id)),
      modifiers: modsFor.get(s.id).map((m) => structuredClone(scene.entities.find((e) => e.id === m.solid.id))),
    })),
    /**
     * Cast a ray and say WHAT HAPPENED, not just how far.
     *
     * `rayHit` returns a number, so it has exactly one way to say "no hit" --
     * and a marcher has two reasons to reach that state. Either nothing is
     * there, or it ran out of steps while something WAS there. Those are not
     * the same answer and collapsing them is the same mistake as a distance
     * bound that claims to be exact: it reports a certainty it does not have.
     *
     * Found by an independent check against a brute-force reference: one
     * grazing ray needed about 300 bound-limited steps to reach a wall at
     * 40.4, the fixed budget of 256 ran out one step short, and the marcher
     * said "nothing there" about a wall it had nearly reached.
     *
     * Returns { t, hit, exhausted, steps }. `exhausted` is the honest answer
     * to "should I believe this miss".
     */
    rayCast(p, direction, {
      maxSteps = 2048, maxDistance = Math.max(region.extent * 8, 64), hitEpsilon = 1e-6,
      method = 'analytic',
    } = {}) {
      vector3(p); vector3(direction, 'direction');
      if (Math.abs(Math.hypot(...direction) - 1) > 1e-8) throw new Error('Ray direction must be unit length');
      if (!Number.isFinite(maxDistance) || maxDistance < 0) throw new Error('maxDistance must be finite and nonnegative');
      if (!Number.isInteger(maxSteps) || maxSteps < 1) throw new Error('maxSteps must be a positive integer');
      if (!Number.isFinite(hitEpsilon) || hitEpsilon <= 0) throw new Error('hitEpsilon must be positive and finite');
      if (!['analytic', 'march'].includes(method)) throw new Error('method must be analytic or march');
      // No modifiers: every primitive solves in closed form and the nearest
      // one wins. This is the exact path, it stays exact, and it cannot be
      // exhausted because it does not iterate.
      if (method === 'analytic') return csgRayCast(activeAdded, modsFor, p, direction, maxDistance);
      // Otherwise the closed forms no longer answer the question -- the
      // nearest analytic surface may have been cut away, or lie outside an
      // intersection. Sphere-trace the expression: the distance is a lower
      // bound, which is exactly the guarantee tracing needs.
      let t = 0;
      for (let step = 0; step < maxSteps; step++) {
        const at = [p[0] + direction[0] * t, p[1] + direction[1] * t, p[2] + direction[2] * t];
        const d = nearest(at).distance;
        if (d < hitEpsilon) return { status: 'hit', method, t, hit: true, exhausted: false, steps: step + 1,
          point: at, ...normalSample(at) };
        t += d;
        // Leaving the scene is a real miss and it is certain. Running out of
        // steps is not, which is why they return different things.
        if (t > maxDistance) return { status: 'miss', method, t: Infinity, hit: false, exhausted: false, steps: step + 1 };
      }
      return { status: 'indeterminate', reason: 'step-budget', method,
        t: Infinity, hit: false, exhausted: true, steps: maxSteps };
    },
    /** Distance to the first surface, or Infinity. See `rayCast` for why. */
    rayHit(p, direction) {
      return this.rayCast(p, direction).t;
    },
  });
  return api;
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
