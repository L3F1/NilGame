import assert from 'node:assert/strict';
import { cylinderHit } from './engine/geometry/nil-cylinder.js';
import { rayPoint } from './nil.js';
let seed=42,checked=0;
const random=()=>((seed=seed*16807%2147483647)/2147483647);
for(let i=0;i<30000;i++) {
  const p=[random()*8-4,random()*8-4,random()*60];
  const v=[random()*2-1,random()*2-1,random()*2-1],len=Math.hypot(...v),u=v.map(x=>x/len);
  if(i%3===0) {u[2]=1e-7; const a=Math.hypot(u[0],u[1]);u[0]/=a;u[1]/=a;}
  const c=[random()*8-4,random()*8-4,.2+random()*.5];
  if(Math.hypot(p[0]-c[0],p[1]-c[1])<=c[2])continue;
  const hit=cylinderHit(p,u,c);
  if(!Number.isFinite(hit)||hit>4096)continue;
  const distance=t=>{const q=rayPoint(p,u,t);return Math.hypot(q[0]-c[0],q[1]-c[1])-c[2];};
  assert.ok(Math.abs(distance(hit))<1e-6,`surface residual ${distance(hit)}`);
  for(let j=0;j<20;j++)assert.ok(distance(hit*j/20)>-1e-6,'returned a later intersection');
  checked++;
}
assert.ok(checked>1000);
assert.equal(cylinderHit([-2,0,0],[1,0,0],[0,0,.5]),1.5);
assert.equal(cylinderHit([-2,0,0],[0,0,1],[0,0,.5]),Infinity);
console.log(`${checked} exact hits checked; horizontal and vertical controls passed`);
