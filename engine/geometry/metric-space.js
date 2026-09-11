// Physical-unit metric adapter for the scene kernel. No host or scene state.
// S3 points lie on the UNIT sphere; tangent components carry physical speeds.
// Thus dp/dt = velocity / curvatureRadius. A domain limit is numerical policy,
// never a surface: callers must report an exit instead of inventing a wall.
import { geometry } from '../../geom.js';

const spherical = geometry(1);
const scalar = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const tolerance = 1e-8;
function vector(v, count, name) {
  if (!Array.isArray(v) || v.length !== count || !v.every(Number.isFinite)) {
    throw new Error(`${name} must contain ${count} finite numbers`);
  }
}

export function createMetricSpace({ kind, curvatureRadius = 1, maxDistance } = {}) {
  if (kind !== 'e3' && kind !== 's3') throw new Error(`Unsupported metric geometry: ${kind}`);
  if (!(Number.isFinite(curvatureRadius) && curvatureRadius > 0)) throw new Error('curvatureRadius must be positive');
  if (kind === 'e3' && curvatureRadius !== 1) throw new Error('E3 curvatureRadius must be 1');
  const curved = kind === 's3', dimension = curved ? 4 : 3, R = curvatureRadius;
  maxDistance ??= curved ? Math.PI * R / 2 : Infinity;
  if (!(maxDistance > 0) || (!Number.isFinite(maxDistance) && !(maxDistance === Infinity && !curved))) {
    throw new Error('maxDistance must be positive and finite for S3');
  }
  if (curved && maxDistance > Math.PI * R / 2) throw new Error('S3 runtime patch cannot exceed an open hemisphere');
  const origin = curved ? [0, 0, 0, 1] : [0, 0, 0];
  const boundaryHeight = curved ? (maxDistance === Math.PI * R / 2 ? 0 : Math.cos(maxDistance / R)) : null;

  function validatePoint(p) {
    vector(p, dimension, 'point');
    if (curved && Math.abs(scalar(p, p) - 1) > tolerance) throw new Error('S3 point must lie on the unit sphere');
    return true;
  }
  function validateTangent(p, v) {
    validatePoint(p); vector(v, dimension, 'tangent');
    if (curved && Math.abs(scalar(p, v)) > tolerance * Math.max(1, Math.hypot(...v))) {
      throw new Error('S3 vector must be tangent at its point');
    }
    return true;
  }
  function dot(p, u, v) {
    validateTangent(p, u); validateTangent(p, v);
    return scalar(u, v);
  }
  function norm(p, v) { validateTangent(p, v); return Math.hypot(...v); }
  // Remove representational radial error BEFORE normalizing a short tangent.
  // Validation still rejects invalid callers; this does not widen its tolerance.
  const tangentPart = (p, v) => {
    const radial = scalar(p, v) / scalar(p, p);
    return v.map((x, i) => x - radial * p[i]);
  };
  function unitTangent(p, v) {
    const tangent = curved ? tangentPart(p, v) : v;
    const length = Math.hypot(...tangent);
    if (!(length > 0)) throw new Error('Cannot normalize a zero tangent');
    return tangent.map(x => x / length);
  }
  function normalize(p, v) {
    validateTangent(p, v);
    return unitTangent(p, v);
  }
  /** Remove the component of u along the tangent normal n (n need not be unit). */
  function project(p, u, n) {
    const squared = dot(p, n, n);
    if (!(squared > 0)) throw new Error('Projection normal must be nonzero');
    const amount = dot(p, u, n) / squared;
    return u.map((x, i) => x - amount * n[i]);
  }
  function withinDomain(p) {
    validatePoint(p);
    return curved ? p[3] > boundaryHeight : Math.hypot(...p) < maxDistance;
  }
  function decode(author) {
    vector(author, 3, 'author position');
    if (!(Math.hypot(...author) < maxDistance)) throw new Error('Author position lies outside runtime patch');
    return curved ? spherical.exp(author.map(x => x / R)) : author.slice();
  }
  function encode(p) {
    if (!withinDomain(p)) throw new Error('Point lies outside runtime patch');
    // atan2 remains well-conditioned near the chart origin and equator.
    if (!curved) return p.slice();
    const radial = Math.hypot(p[0], p[1], p[2]);
    if (radial === 0) return [0, 0, 0];
    const scale = R * Math.atan2(radial, p[3]) / radial;
    return p.slice(0, 3).map(x => x * scale);
  }
  function distance(p, q) {
    validatePoint(p); validatePoint(q);
    if (!curved) return Math.hypot(...p.map((x, i) => x - q[i]));
    // Half-angle with both chords is stable at coincident AND antipodal points.
    const difference = Math.hypot(...p.map((x, i) => x - q[i]));
    const sum = Math.hypot(...p.map((x, i) => x + q[i]));
    return 2 * R * Math.atan2(difference, sum);
  }
  function unit(p, u) {
    if (Math.abs(norm(p, u) - 1) > tolerance) throw new Error('Geodesic direction must have unit physical norm');
  }
  function advance(p, u, travel, withTransport) {
    unit(p, u);
    if (!Number.isFinite(travel)) throw new Error('Geodesic travel must be finite');
    // Capture inputs: mutating a caller's arrays later cannot change carry().
    const input = withTransport ? p.slice() : p;
    // Zero travel is an exact identity, including the caller's endpoint/token.
    if (travel === 0) return withTransport ? { position: p.slice(), direction: u.slice(),
      carry: v => { validateTangent(input, v); return v.slice(); } } : p.slice();
    // Retraction of floating-point representatives onto the same sphere and
    // tangent plane keeps repeated short contact legs from amplifying drift.
    // This is not a physical collision correction or a reset of camera axes.
    const startLength = curved ? Math.hypot(...p) : 1;
    const start = curved ? p.map(x => x / startLength) : p.slice();
    const initial = curved ? unitTangent(start, u) : u.slice();
    const angle = curved ? travel / R : 0, c = Math.cos(angle), s = Math.sin(angle);
    const rawPosition = curved ? start.map((x, i) => c * x + s * initial[i]) : start.map((x, i) => x + travel * initial[i]);
    const positionLength = curved ? Math.hypot(...rawPosition) : 1;
    const position = curved ? rawPosition.map(x => x / positionLength) : rawPosition;
    // Field samplers only need a point. Do not construct/repair an unused
    // direction or carry closure for every objective evaluation.
    if (!withTransport) return position;
    const direction = curved ? unitTangent(position, initial.map((x, i) => c * x - s * start[i])) : initial.slice();
    function carry(v) {
      validateTangent(input, v);
      if (!curved) return v.slice();
      const tangent = tangentPart(start, v), along = scalar(tangent, initial);
      // Linear carry for velocity, normals and all camera axes together. Never
      // normalize each carried vector: that would destroy speeds and linearity.
      return tangentPart(position, tangent.map((x, i) => x + along * (direction[i] - initial[i])));
    }
    return { position, direction, carry };
  }
  const stepWithTransport = (p, u, travel) => advance(p, u, travel, true);
  const step = (p, u, travel) => advance(p, u, travel, false);
  /** Physical displacement vector at p to the shortest-geodesic endpoint q. */
  function logAt(p, q) {
    validatePoint(p); validatePoint(q);
    if (!curved) return q.map((x, i) => x - p[i]);
    const cosine = scalar(p, q), tangent = q.map((x, i) => x - cosine * p[i]);
    const sine = Math.hypot(...tangent);
    if (sine < 1e-12 && cosine < 0) throw new Error('Antipodal logarithm needs an explicit geodesic direction');
    if (sine === 0) return [0, 0, 0, 0];
    const scale = R * Math.atan2(sine, cosine) / sine;
    return tangent.map(x => x * scale);
  }
  function expAt(p, v) {
    const length = norm(p, v);
    return length === 0 ? p.slice() : step(p, v.map(x => x / length), length);
  }
  /** Shortest endpoint transport only. Actual movement uses segment.carry. */
  function transport(p, q, v) {
    validateTangent(p, v); validatePoint(q);
    if (!curved) return v.slice();
    const denominator = 1 + scalar(p, q);
    if (denominator < 1e-12) throw new Error('Antipodal transport needs an explicit geodesic segment');
    const amount = scalar(v, q) / denominator;
    return v.map((x, i) => x - amount * (p[i] + q[i]));
  }
  /** Canonical [right, forward, up], radially transported from the origin. */
  function frame(p) {
    validatePoint(p);
    const basis = curved ? [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]] : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    return basis.map(v => transport(origin, p, v));
  }
  /** First radial-domain exit, or Infinity if it lies after maxTravel.
   * Starting on/outside the boundary returns zero even when pointing inward:
   * re-entry must be an explicit owner/chart transition, not implicit clamping.
   */
  function boundaryDistance(p, u, maxTravel = Infinity) {
    unit(p, u);
    if (!(maxTravel >= 0) || (!Number.isFinite(maxTravel) && maxTravel !== Infinity)) throw new Error('maxTravel must be nonnegative');
    if (!withinDomain(p)) return 0;
    if (maxDistance === Infinity) return Infinity;
    let exit;
    if (curved) {
      const phase = Math.atan2(u[3], p[3]);
      const amplitude = Math.hypot(p[3], u[3]);
      exit = R * (phase + Math.acos(Math.min(1, boundaryHeight / amplitude)));
    } else {
      const b = scalar(p, u), c = scalar(p, p) - maxDistance * maxDistance;
      const root = Math.sqrt(Math.max(0, b * b - c));
      exit = b >= 0 ? -c / (b + root) : -b + root;
    }
    return exit <= maxTravel ? Math.max(0, exit) : Infinity;
  }
  return Object.freeze({ kind, curvatureRadius: R, maxDistance, dimension,
    origin: Object.freeze(origin), validatePoint, validateTangent, dot, norm,
    normalize, project, withinDomain, decode, encode, distance, step,
    stepWithTransport, logAt, expAt, transport, frame, boundaryDistance });
}
