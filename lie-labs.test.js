import assert from 'node:assert/strict';
import { derivative, planeDistance } from './engine/geometry/sl2r.js';
import { integrate } from './engine/geometry/numerical-flow.js';
import { labMotion, field, coordinateVector, placement, contactNormal } from './engine/world/lie-labs.js';
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
let passed=0;
function test(name,fn){fn();passed++;console.log(`ok ${name}`);}
test('SL2R fibre is unwrapped and vertical flow is exact',()=>{
  const [p,u]=integrate(derivative,[0,0,0],[0,0,1],20);
  near(p[2],20);near(u[2],1);
});
test('SL2R horizontal lift agrees with H2 semicircle',()=>{
  const t=2, [p]=integrate(derivative,[0,0,0],[1,0,0],t);
  near(p[0],Math.tanh(t));near(p[1],-Math.log(Math.cosh(t)));
  near(p[2],-Math.atan(Math.sinh(t)));
});
test('SL2R energy, fibre momentum and x momentum survive flow',()=>{
  const v=[.7,.3,.4], [p,u]=integrate(derivative,[0,0,0],v,10);
  near(Math.hypot(...u),Math.hypot(...v));near(u[2],v[2]);
  near(Math.exp(-p[1])*(u[0]+u[2]),v[0]+v[2]);
  const [back]=integrate(derivative,p,u,-10);
  back.forEach(x=>near(x,0));
});
test('SL2R plane distances have unit metric gradients',()=>{
  const p=[.4,.7,.3],h=1e-5;
  for(let axis=0;axis<3;axis++) {
    const g=[0,1,2].map(i=>{
      const v=[0,0,0];v[i]=1;const d=coordinateVector('sl2r',p,v);
      return (planeDistance(p.map((x,j)=>x+h*d[j]),axis,.1)-planeDistance(p.map((x,j)=>x-h*d[j]),axis,.1))/(2*h);
    });
    near(Math.hypot(...g),1);
  }
});
for(const key of ['sol','sl2r']) {
  test(`${key}: glancing wall contact preserves travel along the wall`,()=>{
    const motion=labMotion(key), start=[-.9,-2.929,0];
    let M=placement(start),vel=[.72,-.96,0];
    for(let i=0;i<60;i++) {
      [M,vel]=motion.step(M,vel,[.6,-.8,0],false,1/120);
      assert.ok(field(key,M.slice(12,15))>=.07);
    }
    const scale=key==='sol'?1:Math.exp(-start[1]);
    assert.ok((M[12]-start[0])*scale>.2,'must make useful tangential progress');
    assert.ok(vel[0]>.4,'contact must retain tangential velocity');
  });
  test(`${key}: contact normal uses metric frame`,()=>{
    const normal=contactNormal(key,[-.9,-2.929,0]);
    const length=Math.hypot(1,.071);
    near(normal[0],0);
    near(normal[1],key==='sol'?1/length:1);
    near(normal[2],key==='sol'?-.071/length:0);
  });
  test(`${key}: spawn clear, movement and collision remain finite`,()=>{
    const motion=labMotion(key);let {M,vel}=motion.spawn();
    assert.ok(field(key,M.slice(12,15))>.07);
    const start=M.slice();let moved=false;
    for(let i=0;i<3000;i++) {
      const want=i<1000?[1,0,0]:i<2000?[0,1,0]:[0,0,1];
      [M,vel]=motion.step(M,vel,want,false,1/120);
      assert.ok([...M,...vel].every(Number.isFinite));
      assert.ok(field(key,M.slice(12,15))>=.07);
      moved ||= Math.hypot(...M.map((x,j)=>x-start[j]))>.1;
    }
    assert.ok(moved);
  });
}
console.log(`${passed} passed, 0 failed`);
