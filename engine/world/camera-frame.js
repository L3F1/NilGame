// A camera frame that is CARRIED rather than rebuilt.
//
// The lab's camera keeps a yaw and a pitch and reconstructs its basis from
// them against a fixed world up. That is a legitimate camera for a walker
// whose up is the world's up, and it is not a camera at all on a sphere:
// there is no global up on S3 to rebuild against, and `space.frame(p)` is a
// CONSTRUCTION frame -- transported from the origin along a canonical path --
// so two walkers who arrive at the same point by different routes would be
// handed the same basis, which is precisely the fact curvature denies.
//
// So the frame is state. It is created once, rotated in place by the mouse,
// carried along the path actually walked by the same `carry` the velocity
// uses, and mapped through a portal by the same matrix the walker is. Two
// consequences fall out, both wanted:
//
//   - ROLL SURVIVES. Yaw and pitch about the frame's OWN axes do not commute,
//     so a loop of look-inputs leaves the view rolled. A reconstruction from
//     world up silently discards that; a carried frame keeps it, which is
//     what a tilted aperture and a curved room both require.
//   - GRAVITY ALIGNMENT BECOMES A POLICY. Standing a walker upright is
//     `alignUp`, applied by whoever wants it, as much or as little as they
//     want. It is no longer an assumption baked into the reconstruction where
//     nothing can decline it.
//
// Host-free: no DOM, no renderer, no scene document. Works in any space
// `engine/geometry/metric-space.js` produces.

// The ambient inner product. Both supported spaces embed in a Euclidean
// ambient space and `metric-space.dot` is that same sum -- the difference is
// which vectors are tangent, not how they multiply. Used here only where a
// vector may have drifted OFF the tangent space and so cannot be handed to
// `space.dot`, which would reject it.
const ambient = (u, v) => u.reduce((sum, x, i) => sum + x * v[i], 0);
const combine = (a, x, b, y) => a.map((v, i) => v * x + b[i] * y);

/**
 * Project a possibly-drifted vector back onto the tangent space at `p`.
 *
 * Numerical drift takes a carried vector off the tangent space slowly -- on
 * S3 a vector must stay orthogonal to the position 4-vector, and float error
 * does not respect that. Left alone the drift compounds over a walk. The
 * tangent basis at `p` is the projector.
 */
function toTangent(space, p, v) {
  const basis = space.frame(p);
  return basis.reduce((acc, e) => combine(acc, 1, e, ambient(v, e)),
    new Array(v.length).fill(0));
}

/**
 * Gram-Schmidt, in the order forward, up, right.
 *
 * Forward goes first because it is what the player aims and the one vector
 * that must not be nudged to satisfy the other two. Right is last and is
 * derived, not preserved -- but the projection keeps the SIGN of its old
 * component, so handedness cannot flip. A flipped handedness reads as the
 * floor drawn above the horizon and looks like a plane-equation bug.
 */
function orthonormalize(space, p, forward, up, right) {
  const f = space.normalize(p, toTangent(space, p, forward));
  const u = space.normalize(p, space.project(p, toTangent(space, p, up), f));
  const rProjected = space.project(p, space.project(p, toTangent(space, p, right), f), u);
  const r = space.normalize(p, rProjected);
  return { forward: f, up: u, right: r };
}

function make(space, position, forward, up, right) {
  const frame = orthonormalize(space, position, forward, up, right);
  return Object.freeze({
    space, position: Object.freeze(position.slice()),
    forward: Object.freeze(frame.forward),
    up: Object.freeze(frame.up),
    right: Object.freeze(frame.right),
  });
}

/**
 * A camera frame at `position`, aimed along `forward` with `up` upright.
 *
 * `up` is a HINT: it is made perpendicular to forward, never the other way
 * round. `right` completes a right-handed frame in the same sense the lab's
 * `basis()` uses, so an E3 camera built from the same yaw and pitch is the
 * same camera -- see camera-frame.test.js, which pins that to 1e-15.
 */
export function createCameraFrame(space, position, { forward, up }) {
  space.validatePoint(position);
  const f = toTangent(space, position, forward);
  if (!(space.norm(position, f) > 1e-9)) throw new Error('camera forward is degenerate');
  const u = toTangent(space, position, up);
  if (!(space.norm(position, space.project(position, u, f)) > 1e-9)) {
    throw new Error('camera up is parallel to forward; it cannot orient the frame');
  }
  // right = forward x up in the lab's sense: at yaw 0 forward is +x, up is
  // +z and right is -y. There is no cross product on the 4-vector tangent
  // space S3 uses, so take it in the COORDINATES of the tangent basis at this
  // point, which is orthonormal and right-handed, and map the answer back.
  // In E3 that basis is the standard one and this is the ordinary cross
  // product; on S3 it is the only place handedness is even defined.
  const basis = space.frame(position);
  const fc = basis.map((e) => ambient(f, e)), uc = basis.map((e) => ambient(u, e));
  const cross = [fc[1] * uc[2] - fc[2] * uc[1], fc[2] * uc[0] - fc[0] * uc[2], fc[0] * uc[1] - fc[1] * uc[0]];
  const right = basis.reduce((acc, e, i) => combine(acc, 1, e, cross[i]),
    new Array(position.length).fill(0));
  return make(space, position, f, u, right);
}

/**
 * Turn the camera about its OWN axes: yaw about up, then pitch about the new
 * right, then roll about the new forward.
 *
 * "Its own axes" is the whole point. Yawing about a world up is what forces a
 * world up to exist. These rotations do not commute, and the residue they
 * leave is real roll, not error.
 *
 * Signs match the lab: increasing yaw turns the view toward -right and
 * increasing pitch lifts forward toward up, so a camera built by
 * `turn(canonical, { yaw, pitch })` equals the old `basis()` exactly.
 */
export function turn(camera, { yaw = 0, pitch = 0, roll = 0 } = {}) {
  const { space, position } = camera;
  let { forward, up, right } = camera;
  if (yaw) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    [forward, right] = [combine(forward, c, right, -s), combine(right, c, forward, s)];
  }
  if (pitch) {
    const c = Math.cos(pitch), s = Math.sin(pitch);
    [forward, up] = [combine(forward, c, up, s), combine(up, c, forward, -s)];
  }
  if (roll) {
    const c = Math.cos(roll), s = Math.sin(roll);
    [right, up] = [combine(right, c, up, s), combine(up, c, right, -s)];
  }
  return make(space, position, forward, up, right);
}

/**
 * Carry the frame along a step actually taken.
 *
 * `segment` is what `space.stepWithTransport` returns, so the camera is
 * carried by the SAME transport as the walker's velocity -- a second,
 * hand-written copy of the map would let the picture and the physics disagree
 * while each looked right alone. On a sphere this is where holonomy enters:
 * walk a closed loop and the frame comes back rotated by the enclosed area
 * over R squared, which is a fact about the space and not a drift to correct.
 */
export function carryAlong(camera, segment) {
  const { space } = camera;
  return make(space, segment.position,
    segment.carry(camera.forward), segment.carry(camera.up), segment.carry(camera.right));
}

/**
 * Map the frame through a portal, at the position it arrives at.
 *
 * `map` is the portal's own `mapVector` or region transit's `carry`.
 * Cross-geometry callers MUST supply the destination space: vector length
 * alone cannot identify a metric (two S3 regions may have different radii).
 * The default preserves existing same-space callers. Mapping carries all three
 * vectors, including roll; gravity alignment remains a separate policy.
 */
export function mapFrame(camera, position, map, destinationSpace = camera.space) {
  destinationSpace.validatePoint(position);
  const mapped = [camera.forward, camera.up, camera.right].map(v => map(v));
  // Reorthonormalization repairs roundoff, not a map into the wrong tangent
  // space. Reject that contract violation before projection can conceal it.
  for (const v of mapped) destinationSpace.validateTangent(position, v);
  return make(destinationSpace, position, ...mapped);
}

/**
 * Roll the frame about its own forward until up points as near `target` as
 * forward allows. THE GRAVITY POLICY, and deliberately a separate call.
 *
 * `amount` is the fraction of the correction to apply, so a host can snap
 * (1), ease (0.1 a frame), or decline (never call it). Forward is untouched:
 * standing a walker upright must not re-aim them.
 *
 * Looking straight along `target` leaves nothing to align -- every up is
 * equally upright -- and the frame is returned unchanged rather than
 * snapping to an arbitrary choice.
 */
export function alignUp(camera, target, amount = 1) {
  const { space, position, forward } = camera;
  const wanted = space.project(position, toTangent(space, position, target), forward);
  if (!(space.norm(position, wanted) > 1e-9)) return camera;
  const unitWanted = space.normalize(position, wanted);
  // Write the wanted up as cos(a)*up + sin(a)*right. A roll of r sends up to
  // cos(r)*up - sin(r)*right, so the roll that lands on it is -a.
  const angle = Math.atan2(space.dot(position, unitWanted, camera.right),
    space.dot(position, unitWanted, camera.up));
  return angle === 0 ? camera : turn(camera, { roll: -angle * amount });
}

/** The angle from the frame's own up to `target`, about forward. */
export function rollAgainst(camera, target) {
  const { space, position, forward } = camera;
  const wanted = space.project(position, toTangent(space, position, target), forward);
  if (!(space.norm(position, wanted) > 1e-9)) return 0;
  const unitWanted = space.normalize(position, wanted);
  return Math.atan2(space.dot(position, unitWanted, camera.right),
    space.dot(position, unitWanted, camera.up));
}
