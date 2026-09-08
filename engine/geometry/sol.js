// Sol in coordinates (x,y,z), metric exp(2z) dx² + exp(-2z) dy² + dz².
// Used by the bounded Sol navigation laboratory; no quotient yet.
import { integrate } from './numerical-flow.js';
// Velocities use the orthonormal frame (exp(-z)∂x, exp(z)∂y, ∂z).
export function multiply(p, q) {
  return [p[0] + Math.exp(-p[2]) * q[0], p[1] + Math.exp(p[2]) * q[1], p[2] + q[2]];
}

export function derivative(s) {
  const [, , z, a, b, c] = s;
  return [Math.exp(-z) * a, Math.exp(z) * b, c, -a * c, b * c, a * a - b * b];
}

// Fixed maximum step makes the error budget independent of frame time.
// Negative time is supported for reversibility checks; excessive work fails explicitly.
export function flow(p, velocity, time, maxStep = 0.01) {
  return integrate(derivative,p,velocity,time,maxStep);
}

// Exact signed distances to coordinate planes. These are useful building blocks
// for conservative box fields; Euclidean coordinate lengths are not distances.
export function planeDistance(p, axis, offset) {
  if (axis === 0) return Math.asinh(Math.exp(p[2]) * (p[0] - offset));
  if (axis === 1) return Math.asinh(Math.exp(-p[2]) * (p[1] - offset));
  if (axis === 2) return p[2] - offset;
  throw new Error('Sol plane axis must be 0, 1 or 2');
}
