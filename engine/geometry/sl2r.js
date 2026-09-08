// Universal cover of the unit tangent bundle of H2, Sasaki metric.
// Coordinates (x,z,theta), y=exp(z), theta is REAL, never reduced modulo 2pi.
// ds² = exp(-2z)dx² + dz² + (dtheta + exp(-z)dx)².
// Frame: (exp(z)∂x-∂theta, ∂z, ∂theta).
import { integrate } from './numerical-flow.js';
export function flow(p,v,t,step=.01) { return integrate(derivative,p,v,t,step); }
export function derivative(s) {
  const [,z,,a,b,c] = s;
  return [Math.exp(z)*a, b, c-a, b*(a+c), -a*(a+c), 0];
}

export function planeDistance(p, axis, offset) {
  if (axis === 0) return Math.asinh(Math.exp(-p[1])*(p[0]-offset));
  if (axis === 1) return p[1]-offset;
  if (axis === 2) return (p[2]-offset)/Math.SQRT2;
  throw new Error('SL2R plane axis must be 0, 1 or 2');
}
