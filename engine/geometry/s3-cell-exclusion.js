// A sufficient whole-ray exclusion witness, NOT an intersection or distance.
// Numerical screening uses JS doubles; it is not formal interval arithmetic.
import { S3_RAY_ROUNDOFF as EPS } from './s3-ray-events.js';

const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

/**
 * A spherical cell is the conjunction dot(q, pole) <= 0 over its faces.
 * If ONE face is strictly positive over the ENTIRE closed ray interval,
 * the cell is absent on that interval, regardless of its other faces.
 * No witness means unknown, never occupied. A witness applies equally to
 * additive cells, subtractors and intersects, but the caller owns that Boolean.
 * Work: one face screened. Validation is not charged. No roots are requested.
 */
export function excludeSphericalCell(space, cell, position, direction, {
  maxDistance, maxWork = 6,
} = {}) {
  if (space?.kind !== 's3') throw new Error('Cell exclusion requires S3');
  space.validatePoint(position);
  space.validateTangent(position, direction);
  if (Math.abs(space.norm(position, direction) - 1) > 1e-8)
    throw new Error('Ray direction must be unit length');
  const R = space.curvatureRadius;
  if (!Number.isFinite(maxDistance) || maxDistance < 0 || maxDistance > Math.PI * R)
    throw new Error('maxDistance must be within one S3 half-circle');
  if (!Number.isInteger(maxWork) || maxWork < 0) throw new Error('Invalid maxWork');
  if (cell?.entity?.kind !== 'geodesic-cell' || !Array.isArray(cell.planes) || cell.planes.length !== 6)
    throw new Error('Expected six-plane spherical cell');
  for (const pole of cell.planes) {
    if (!Array.isArray(pole) || pole.length !== 4 || !pole.every(Number.isFinite) ||
        Math.abs(Math.hypot(...pole) - 1) > 1e-8) throw new Error('Invalid cell pole');
  }
  let work = 0;
  const unknown = reason => Object.freeze({ status: 'unknown', reason, face: null, work });
  if (Math.abs(dot(position, position) - 1) > EPS ||
      Math.abs(dot(direction, direction) - 1) > EPS ||
      Math.abs(dot(position, direction)) > EPS) return unknown('input-roundoff');

  const length = maxDistance / R;
  for (let face = 0; face < 6; face++) {
    if (work >= maxWork) return unknown('work-budget');
    work++;
    const pole = cell.planes[face];
    const A = dot(position, pole), B = dot(direction, pole);
    const amplitude = Math.hypot(A, B), phase = Math.atan2(B, A);
    // f(theta)=A*cos(theta)+B*sin(theta). Its minimum on a closed interval
    // is at an endpoint or a stationary minimum phase+pi+2*k*pi.
    let minimum = Math.min(A, A * Math.cos(length) + B * Math.sin(length));
    const angleGuard = EPS * (1 + Math.abs(phase) + length);
    for (let k = -2; k <= 2; k++) {
      const theta = phase + Math.PI + k * 2 * Math.PI;
      // Include uncertain endpoint-adjacent extrema rather than exclude them.
      if (theta >= -angleGuard && theta <= length + angleGuard)
        minimum = Math.min(minimum, -amplitude);
    }
    // Cover coefficient and endpoint evaluation roundoff plus angle screening.
    // This is an explicit numerical policy, not a bound on all JS libm ulps.
    const guard = EPS * (1 + Math.abs(A) + Math.abs(B)) + amplitude * angleGuard;
    const lower = minimum - guard;
    if (lower > 0) return Object.freeze({
      status: 'excluded', reason: null, face, work, minimum, guard, lower,
    });
  }
  return unknown('no-witness');
}
