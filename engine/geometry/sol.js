// Sol in coordinates (x,y,z), metric exp(2z) dx² + exp(-2z) dy² + dz².
// Research kernel only: no quotient, renderer or gameplay registration yet.
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
  if (p.length !== 3 || velocity.length !== 3 ||
      ![...p, ...velocity, time, maxStep].every(Number.isFinite) || maxStep <= 0) {
    throw new Error('Sol flow requires finite 3-vectors, time and positive maxStep');
  }
  const steps = Math.max(1, Math.ceil(Math.abs(time) / maxStep));
  if (steps > 100000) throw new Error('Sol flow exceeds integration budget');
  const h = time / steps;
  let s = [...p, ...velocity];
  const advance = (v, k, dt) => v.map((x, i) => x + dt * k[i]);
  for (let n = 0; n < steps; n++) {
    const a = derivative(s);
    const b = derivative(advance(s, a, h / 2));
    const c = derivative(advance(s, b, h / 2));
    const d = derivative(advance(s, c, h));
    s = s.map((x, i) => x + h * (a[i] + 2 * b[i] + 2 * c[i] + d[i]) / 6);
    if (!s.every(Number.isFinite)) throw new Error('Sol flow left numerical range');
  }
  return [s.slice(0, 3), s.slice(3)];
}

// Exact signed distances to coordinate planes. These are useful building blocks
// for conservative box fields; Euclidean coordinate lengths are not distances.
export function planeDistance(p, axis, offset) {
  if (axis === 0) return Math.asinh(Math.exp(p[2]) * (p[0] - offset));
  if (axis === 1) return Math.asinh(Math.exp(-p[2]) * (p[1] - offset));
  if (axis === 2) return p[2] - offset;
  throw new Error('Sol plane axis must be 0, 1 or 2');
}
