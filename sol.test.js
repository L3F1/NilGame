import assert from 'node:assert/strict';
import { flow, multiply, planeDistance } from './engine/geometry/sol.js';

let passed = 0;
const near = (a, b, eps = 1e-7) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const vectorNear = (a, b, eps) => a.forEach((x, i) => near(x, b[i], eps));
const test = (name, fn) => { fn(); passed++; console.log(`ok ${name}`); };

test('vertical geodesic is exact', () => {
  const [p, u] = flow([1, 2, 0], [0, 0, 1], 3);
  vectorNear(p, [1, 2, 3]); vectorNear(u, [0, 0, 1]);
});
test('balanced horizontal geodesic remains horizontal', () => {
  const a = Math.SQRT1_2;
  vectorNear(flow([0, 0, 0], [a, a, 0], 2)[0], [2*a, 2*a, 0]);
});
test('x-z geodesic agrees with independent hyperbolic closed form', () => {
  const t = 2;
  const [p, u] = flow([0, 0, 0], [1, 0, 0], t);
  vectorNear(p, [Math.tanh(t), 0, Math.log(Math.cosh(t))]);
  vectorNear(u, [1/Math.cosh(t), 0, Math.tanh(t)]);
});
test('energy and both translation momenta survive general flow', () => {
  const start = [.3, -.2, .4], v = [.7, -.4, .3];
  const [p, u] = flow(start, v, 12);
  near(u.reduce((a,x)=>a+x*x,0), v.reduce((a,x)=>a+x*x,0));
  near(Math.exp(p[2])*u[0], Math.exp(start[2])*v[0]);
  near(Math.exp(-p[2])*u[1], Math.exp(-start[2])*v[1]);
});
test('flow reverses and commutes with left translation', () => {
  const p = [.2,.4,-.3], v = [.6,.2,.5], g = [1,-2,.7];
  const [q,u] = flow(p,v,3);
  vectorNear(flow(q,u,-3)[0],p);
  vectorNear(flow(multiply(g,p),v,3)[0],multiply(g,q));
});
test('coordinate plane distance has unit metric gradient', () => {
  const p = [.4,-.3,.7], h = 1e-5;
  for (const axis of [0,1,2]) {
    const grad = p.map((_,i) => {
      const a = [...p], b = [...p]; a[i]+=h; b[i]-=h;
      return (planeDistance(a,axis,.1)-planeDistance(b,axis,.1))/(2*h);
    });
    near(Math.exp(-2*p[2])*grad[0]**2 + Math.exp(2*p[2])*grad[1]**2 + grad[2]**2,1);
  }
});
test('invalid integration inputs fail explicitly', () => {
  assert.throws(()=>flow([0,0,0],[1,0,0],Infinity));
  assert.throws(()=>flow([0,0,0],[1,0,0],1,0));
});
console.log(`${passed} passed, 0 failed`);
