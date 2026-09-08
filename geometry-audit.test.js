// Independent metric audit: derive geodesic residuals from the metric tensor,
// rather than duplicating the implementation's frame-velocity ODEs.
import assert from 'node:assert/strict';
import { geometry } from './geom.js';
import { surface } from './product.js';
import * as Nil from './nil.js';
import * as Sol from './engine/geometry/sol.js';
import * as SL from './engine/geometry/sl2r.js';
let passed=0;
const h=2e-4;
const velocities=[[.6,.48,.64],[-.8,.36,.48],[0,0,1],[1,0,0]];
function test(name,fn){fn();passed++;console.log(`ok ${name}`);}
function derivatives(curve,t){
  const p=curve(t),a=curve(t-h),b=curve(t+h);
  return [p,p.map((_,i)=>(b[i]-a[i])/(2*h)),p.map((x,i)=>(b[i]-2*x+a[i])/(h*h))];
}
for(const k of [-1,0,1]) test(`constant curvature ${k}: ambient geodesic equation`,()=>{
  const g=geometry(k);
  for(const v of velocities) for(const t of [.1,.7,1.8]) {
    const [p,d,a]=derivatives(s=>g.exp(v.map(x=>x*s)),t);
    const speed2=v.reduce((sum,x)=>sum+x*x,0);
    assert.ok(Math.abs(g.dot(d,d)-speed2)<2e-6);
    a.forEach((x,i)=>assert.ok(Math.abs(x+k*speed2*p[i])<2e-6));
  }
});
for(const k of [-1,1]) test(`product curvature ${k}: independent factor equations`,()=>{
  const g=surface(k);
  for(const v of velocities) for(const t of [.1,.7,1.8]) {
    const [p,d,a]=derivatives(s=>g.exp(v.map(x=>x*s)),t);
    const horizontal=v[0]**2+v[1]**2;
    for(const i of [0,1,3]) assert.ok(Math.abs(a[i]+k*horizontal*p[i])<2e-6);
    assert.ok(Math.abs(a[2])<2e-6);
    assert.ok(Math.abs(d[2]-v[2])<2e-6);
  }
});
const models=[
  ['Nil',p=>{const [x,y]=p;return [[1+y*y/4,-x*y/4,y/2],[-x*y/4,1+x*x/4,-x/2],[y/2,-x/2,1]];},(p,v,t)=>Nil.rayPoint(p,v,t)],
  // Tight integration is necessary when differentiating positions twice:
  // changing RK4 step counts otherwise amplifies truncation error by 1/h².
  ['Sol',p=>[[Math.exp(2*p[2]),0,0],[0,Math.exp(-2*p[2]),0],[0,0,1]],(p,v,t)=>Sol.flow(p,v,t,.001)[0]],
  ['SL2R',p=>{const e=Math.exp(-p[1]);return [[2*e*e,0,e],[0,1,0],[e,0,1]];},(p,v,t)=>SL.flow(p,v,t,.001)[0]],
];
for(const [name,metric,flow] of models) test(`${name}: Euler-Lagrange equation from metric tensor`,()=>{
  for(const start of [[0,0,0],[.4,-.3,.2],[-.7,.5,-.4]]) for(const u of velocities) {
    const [p,v,a]=derivatives(t=>flow(start,u,t),.37),g=metric(p);
    const dg=p.map((_,k)=>{
      const lo=[...p],hi=[...p];lo[k]-=h;hi[k]+=h;
      const l=metric(lo),r=metric(hi);
      return l.map((row,i)=>row.map((x,j)=>(r[i][j]-x)/(2*h)));
    });
    for(let i=0;i<3;i++) {
      let residual=0;
      for(let j=0;j<3;j++) {
        residual+=g[i][j]*a[j];
        for(let k=0;k<3;k++) residual+=(dg[k][i][j]-.5*dg[i][j][k])*v[j]*v[k];
      }
      assert.ok(Math.abs(residual)<1e-5,`${name}: residual ${residual}`);
    }
  }
});
console.log(`${passed} passed, 0 failed`);
