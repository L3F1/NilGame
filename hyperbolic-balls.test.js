import assert from 'node:assert/strict';
import {createHyperbolicSpace} from './engine/geometry/hyperbolic-space.js';
import {sampleHyperbolicBall,castHyperbolicBalls} from './engine/geometry/hyperbolic-balls.js';
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
for(const R of [.5,8,10000]){
  const s=createHyperbolicSpace({curvatureRadius:R}),p=s.origin,u=[1,0,0,0];
  const ball={id:'ball',center:s.decode([R,0,0]),radius:.2*R};
  const cast=(balls,limit)=>castHyperbolicBalls(s,balls,p,u,{maxDistance:limit});
  const hit=cast([ball],1.5*R);assert.equal(hit.status,'hit');near(hit.distance,.8*R,1e-8*R);
  near(s.dot(hit.point,hit.normal,s.transport(p,hit.point,u)),-1);
  near(sampleHyperbolicBall(s,ball,p).distance,.8*R,1e-8*R);
  const center=sampleHyperbolicBall(s,ball,ball.center);near(center.distance,-.2*R,1e-8*R);assert.equal(center.normal,null);
  assert.equal(cast([ball],.7*R).status,'miss');assert.equal(cast([ball],.8*R).status,'unresolved');
  assert.equal(cast([],2*R).reason,'domain-exit');assert.equal(cast([],1.9*R).status,'miss');
  assert.equal(castHyperbolicBalls(s,[ball],ball.center,s.frame(ball.center)[0],{maxDistance:R}).reason,'inside-start');
  assert.equal(castHyperbolicBalls(s,[ball],p,u,{maxDistance:R,maxTests:0}).reason,'work-budget');
  assert.equal(cast([ball,{...ball,id:'coincident'}],1.5*R).status,'unresolved');
  // Independent right triangle: centre .8 along ray, then .3 perpendicular.
  const foot=s.decode([.8*R,0,0]),c=s.step(foot,s.frame(foot)[1],.3*R);
  const radius=.4*R,offset=R*Math.acosh(Math.cosh(.4)/Math.cosh(.3));
  const angled={id:'angled',center:c,radius};
  const q=cast([angled],1.8*R);assert.equal(q.status,'hit');near(q.distance,.8*R-offset,1e-8*R);
  const tangent=cast([{...angled,radius:.3*R}],1.8*R);assert.equal(tangent.status,'unresolved');
  assert.equal(cast([{...angled,radius:.29*R}],1.8*R).status,'miss');
  assert.equal(cast([angled,ball],1.8*R).id,'angled');
  assert.equal(cast([ball,angled],1.8*R).id,'angled');
}
console.log('H3 balls: physical signed distance/normals, independent intersections, tangency, range, domain and budget passed');
