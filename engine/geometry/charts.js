// Bounded radial charts for authoring and terrain-transfer experiments.
// No DOM, renderer, scene state or gameplay imports. Distances use document
// units; the underlying quadric uses unit curvature. A chart is NOT a portal.
import { geometry } from '../../geom.js';

const CURVATURE = Object.freeze({ e3: 0, h3: -1, s3: 1 });

function finiteVector(value, length, name) {
  if (!Array.isArray(value) || value.length !== length || !value.every(Number.isFinite)) {
    throw new Error(`${name} must contain ${length} finite numbers`);
  }
}

/**
 * A bounded normal chart: a local direction and distance become a point by
 * following a geodesic from its origin. In S3 this must stop before the
 * antipode, where every direction meets and the inverse is ambiguous.
 * The H3 limit is a conservative numerical budget, not a geometric boundary.
 */
export function createChart({ kind, curvatureRadius = 1, maxDistance = 1, origin } = {}) {
  if (!Object.hasOwn(CURVATURE, kind)) throw new Error(`Unsupported chart geometry: ${kind}`);
  if (!Number.isFinite(curvatureRadius) || curvatureRadius <= 0) throw new Error('curvatureRadius must be positive');
  if (!Number.isFinite(maxDistance) || maxDistance <= 0) throw new Error('maxDistance must be positive');
  if (kind === 'e3' && curvatureRadius !== 1) throw new Error('E3 has no curvature radius; use 1');
  const G = geometry(CURVATURE[kind]);
  const scaledLimit = maxDistance / curvatureRadius;
  if (kind === 's3' && scaledLimit >= Math.PI - 1e-4) throw new Error('S3 chart must stop before its antipode');
  if (kind === 'h3' && scaledLimit > 4) throw new Error('H3 chart exceeds numerical budget; use another chart');
  const M = origin === undefined ? G.IDENTITY.slice() : origin.slice();
  finiteVector(M, 16, 'origin');
  if (G.groupError(M) > 1e-8 || (kind === 'h3' && M[15] <= 0)) throw new Error('origin must be a valid placement');
  if (kind === 'h3' && Math.hypot(...G.log(G.point(M))) > 4) throw new Error('H3 origin exceeds numerical budget');
  const inverse = G.inv(M);

  function checkDistance(r) {
    if (!Number.isFinite(r) || r > maxDistance + 1e-9 * Math.max(1, maxDistance)) {
      throw new Error('Point lies outside chart extent');
    }
  }
  function decode(offset) {
    finiteVector(offset, 3, 'offset');
    checkDistance(Math.hypot(...offset));
    return G.apply(M, G.exp(offset.map((n) => n / curvatureRadius)));
  }
  function encode(point) {
    finiteVector(point, 4, 'point');
    const residual = kind === 'e3' ? point[3] - 1 : G.dot(point, point) - G.k;
    if (Math.abs(residual) > 1e-6 || (kind === 'h3' && point[3] <= 0)) throw new Error('Point does not belong to chart geometry');
    const local = G.apply(inverse, point);
    // geom.log's zero-vector fallback cannot disambiguate the antipode.
    if (kind === 's3' && local[3] <= -Math.cos(1e-4)) throw new Error('Point is at the S3 chart antipode');
    const offset = G.log(local).map((n) => n * curvatureRadius);
    checkDistance(Math.hypot(...offset));
    return offset;
  }
  function distance(a, b) {
    encode(a); encode(b); // Validate model membership and chart bounds.
    return G.dist(a, b) * curvatureRadius;
  }
  // Physical length of an angular displacement at distance r from origin.
  function angularScale(r) {
    if (r < 0) throw new Error('Distance must be nonnegative');
    checkDistance(r);
    return curvatureRadius * G.sinK(r / curvatureRadius);
  }
  return Object.freeze({ kind, curvatureRadius, maxDistance, decode, encode, distance, angularScale });
}

/** Preserve distance and direction about the two chart origins, not all lengths. */
export function transferPoint(source, target, point) {
  return target.decode(source.encode(point));
}

/** Local stretch of the radial transfer. Two transverse axes share the scale. */
export function transferStretch(source, target, distance) {
  const from = source.angularScale(distance), to = target.angularScale(distance);
  const transverse = distance === 0 ? 1 : to / from;
  return { radial: 1, transverse, volume: transverse * transverse };
}
