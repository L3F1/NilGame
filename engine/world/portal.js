// Portal apertures and the isometry that carries a traveller through one.
//
// A portal is TWO things kept deliberately apart:
//
//   the APERTURE   a disc: a centre, a unit normal and a radius. Purely
//                  geometric, and the thing a swept path is tested against.
//   the MAP        an isometry of the space carrying the neighbourhood of one
//                  aperture onto the neighbourhood of the other.
//
// Nothing here reads a scene document; `portalPair` takes two anchors' frames
// and returns descriptors that `collision.js` can consume without knowing what
// a connection is. That separation is the point: an aperture between two
// DIFFERENT geometries is the same shape of object, with a map that is no
// longer an isometry of one space but a correspondence between two -- and this
// module is where that will go.
//
// THE FRAME CONVENTION, which everything else depends on.
// An anchor's `forward` points OUT of its aperture, into the space it serves.
// So a traveller entering through A is moving AGAINST forward_A, and must
// emerge from B moving ALONG forward_B. That is the half turn below: without
// it a traveller arrives at B moving backwards into it and immediately
// re-crosses, which reads as the portal "not working" rather than as a sign
// error.

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Columns (right, up, forward), right-handed: right x up = forward. */
function frameOf(anchor) {
  const forward = anchor.forward.slice(), up = anchor.up.slice();
  return { right: cross3(up, forward), up, forward };
}
/** World vector -> that frame's components. */
const toFrame = (F, v) => [dot3(v, F.right), dot3(v, F.up), dot3(v, F.forward)];
/** Frame components -> a world vector. */
const fromFrame = (F, c) => [
  F.right[0] * c[0] + F.up[0] * c[1] + F.forward[0] * c[2],
  F.right[1] * c[0] + F.up[1] * c[1] + F.forward[1] * c[2],
  F.right[2] * c[0] + F.up[2] * c[1] + F.forward[2] * c[2],
];

/**
 * The two one-way descriptors of a connection: A -> B and B -> A.
 *
 * `mapVector` is the same isometry with the translation dropped, which is what
 * a velocity or a look direction needs. Applying `mapPoint` to a direction is
 * a classic and silent error -- it adds the portal's displacement to a vector
 * that has no position -- so the two are separate functions rather than one
 * with a flag.
 */
export function portalPair(anchorA, anchorB, meta = {}) {
  const one = (from, to) => {
    const F = frameOf(from), G = frameOf(to);
    // The half turn: negate the right and forward components, keep up. A
    // traveller going INTO `from` comes OUT of `to`.
    const turn = (c) => [-c[0], c[1], -c[2]];
    return Object.freeze({
      id: meta.id ?? null,
      fromId: from.id, toId: to.id,
      center: from.position.slice(),
      normal: from.forward.slice(),
      radius: from.radius,
      exitCenter: to.position.slice(),
      exitNormal: to.forward.slice(),
      mapPoint: (p) => {
        const local = turn(toFrame(F, sub3(p, from.position)));
        const world = fromFrame(G, local);
        return [world[0] + to.position[0], world[1] + to.position[1], world[2] + to.position[2]];
      },
      mapVector: (v) => fromFrame(G, turn(toFrame(F, v))),
      // The same linear part as a flat 3x3, COLUMN-MAJOR, which is what a
      // renderer needs: a shader cannot call mapVector, and a portal drawn by
      // a second, hand-written copy of the map is a portal whose picture can
      // disagree with its physics. Column j is the image of basis vector j, so
      // this is mapVector applied to e0, e1, e2 and nothing else.
      matrix: [
        ...fromFrame(G, turn(toFrame(F, [1, 0, 0]))),
        ...fromFrame(G, turn(toFrame(F, [0, 1, 0]))),
        ...fromFrame(G, turn(toFrame(F, [0, 0, 1]))),
      ],
    });
  };
  return [one(anchorA, anchorB), one(anchorB, anchorA)];
}

/**
 * Where a straight segment crosses an aperture, or null.
 *
 * ENTERING ONLY: the crossing counts when the segment goes from the front of
 * the disc (positive side of the normal) to the back. A traveller leaving
 * through the back of an aperture they have just come out of must NOT be
 * caught again, which is the same one-sidedness portals in the H3 kit needed.
 */
export function apertureCrossing(portal, from, to) {
  const h0 = dot3(sub3(from, portal.center), portal.normal);
  const h1 = dot3(sub3(to, portal.center), portal.normal);
  if (!(h0 > 0 && h1 <= 0)) return null;
  const denom = h0 - h1;
  const t = denom > 1e-15 ? h0 / denom : 0;
  const at = [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
  // Inside the disc, not merely inside its plane.
  const radial = sub3(at, portal.center);
  const along = dot3(radial, portal.normal);
  const flat = [radial[0] - along * portal.normal[0],
    radial[1] - along * portal.normal[1],
    radial[2] - along * portal.normal[2]];
  if (Math.hypot(...flat) > portal.radius) return null;
  return { portal, t, at };
}

/** The first aperture a segment crosses, by parameter along it. */
export function firstCrossing(portals, from, to) {
  let best = null;
  for (const portal of portals) {
    const hit = apertureCrossing(portal, from, to);
    if (hit && (!best || hit.t < best.t)) best = hit;
  }
  return best;
}
