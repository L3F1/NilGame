import assert from 'node:assert/strict';
import {createHyperbolicSpace} from './engine/geometry/hyperbolic-space.js';
import {createMetricSpace} from './engine/geometry/metric-space.js';
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
const same=(a,b,t=1e-8)=>a.forEach((x,i)=>near(x,b[i],t));
const lorentz=(a,b)=>a.slice(0,3).reduce((s,x,i)=>s+x*b[i],0)-a[3]*b[3];
let worst=0;
for(const R of [.5,1,8,10000]){
  const s=createHyperbolicSpace({curvatureRadius:R}),o=s.origin;
  for(let i=1;i<=24;i++){
    const a=i/16,b=(25-i)/20;
    const p=s.decode([R*a,0,0]),q=s.decode([0,R*b,0]);
    // Hyperbolic right-triangle identity, not the chord implementation.
    const truth=R*Math.acosh(Math.cosh(a)*Math.cosh(b));
    worst=Math.max(worst,Math.abs(s.distance(p,q)-truth)/R);
    near(s.distance(p,q),truth,1e-8*R);
    same(s.encode(p),[R*a,0,0],1e-8*R);
    const f=s.frame(p);near(lorentz(f[0],f[0]),1);near(lorentz(p,f[0]),0);
    const v=f[0].map((x,j)=>2*x+3*f[1][j]);
    const leg=s.stepWithTransport(p,f[1],.2*R),carried=leg.carry(v);
    near(lorentz(carried,carried),13);near(lorentz(leg.position,carried),0);
    same(s.transport(leg.position,p,carried),v);
    same(s.expAt(p,s.logAt(p,q)),q);
    same(s.step(leg.position,leg.direction,-.2*R),p);
    const before=leg.carry(v);leg.position.fill(0);same(leg.carry(v),before);
  }
  const p=s.decode([.7*R,0,0]),f=s.frame(p);
  near(s.boundaryDistance(p,f[0]),1.3*R,1e-8*R);
  near(s.boundaryDistance(p,f[0].map(x=>-x)),2.7*R,1e-8*R);
  const side=s.boundaryDistance(p,f[1]);
  near(side,R*Math.acosh(Math.cosh(2)/Math.cosh(.7)),1e-8*R);
  assert.equal(s.boundaryDistance(p,f[1],side*.99),Infinity);
  near(s.distance(o,s.step(p,f[1],side)),2*R,1e-8*R);
  assert.ok(s.withinDomain(s.step(p,f[1],side-1e-6*R)));
  assert.ok(!s.withinDomain(s.step(p,f[1],side+1e-6*R)));
  assert.equal(s.boundaryDistance(s.step(o,[1,0,0,0],2.1*R),[0,1,0,0]),0);
  assert.throws(()=>s.decode([2*R,0,0]),/outside/);
  assert.throws(()=>s.step(o,[1,0,0,0],4.1*R),/Invalid/);
  assert.throws(()=>s.validatePoint([0,0,0,-1]),/upper/);
  assert.throws(()=>s.norm(o,[0,0,0,1]),/tangent/);
  const snapshot=p.slice();s.step(p,f[0],0);same(p,snapshot);
}
const flat=createHyperbolicSpace({curvatureRadius:1e6});
const tiny=createHyperbolicSpace({maxDistance:1e-10});
near(tiny.boundaryDistance(tiny.origin,[1,0,0,0]),1e-10,1e-24);
const edge=createHyperbolicSpace();
// Independent radial identity at separations where subtracting rounded time
// coordinates loses the chord. Use encoded spatial coordinates' rapidities.
for(const a of [.4,1.9,3.9])for(const h of [1e-8,1e-10,1e-12]){
  const p=[Math.sinh(a),0,0,Math.cosh(a)],q=[Math.sinh(a+h),0,0,Math.cosh(a+h)];
  const expected=Math.abs(Math.asinh(q[0])-Math.asinh(p[0]));
  near(edge.distance(p,q),expected,2e-15);
  near(edge.distance(q,p),expected,2e-15);
}
for(let i=0;i<50;i++){
  const p=edge.step(edge.origin,[1,0,0,0],3.9),f=edge.frame(p);
  const u=f[0].map((x,j)=>x*Math.cos(i)+f[1][j]*Math.sin(i));
  const leg=edge.stepWithTransport(p,u,.02);
  near(lorentz(leg.position,leg.position),-1,1e-10);
  near(lorentz(leg.carry(f[2]),leg.carry(f[2])),1,1e-10);
  same(edge.expAt(p,edge.logAt(p,leg.position)),leg.position,1e-8);
}
let p=edge.origin.slice(),u=[1,0,0,0],v=[0,1,0,0];
for(let i=0;i<2000;i++){const leg=edge.stepWithTransport(p,u,(i%2?-.001:.001));v=leg.carry(v);p=leg.position;u=leg.direction;}
same(p,edge.origin,1e-10);near(lorentz(v,v),1,1e-10);
near(flat.distance(flat.decode([1,0,0]),flat.decode([0,2,0])),Math.sqrt(5),1e-9);
assert.throws(()=>createHyperbolicSpace({maxDistance:3}),/extent/);
assert.throws(()=>createMetricSpace({kind:'h3'}),/Unsupported/); // not scene-enabled
console.log(`H3 metric: radial/right-triangle, exp/log, transport, domain/range and flat limit passed; worst scaled distance error ${worst}`);
