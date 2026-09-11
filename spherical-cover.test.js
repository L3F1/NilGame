import assert from 'node:assert/strict';
import {createSphericalCover,castSphericalBalls} from './engine/geometry/spherical-cover.js';
import {createCameraFrame,carryAlong} from './engine/world/camera-frame.js';
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const close=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
for(const R of [.5,8,10000]){
  const s=createSphericalCover({curvatureRadius:R}),p=[0,0,0,1],u=[1,0,0,0];
  let camera=createCameraFrame(s,p,{forward:u,up:[0,0,1,0]});
  for(let i=0;i<128;i++){
    const leg=s.stepWithTransport(camera.position,camera.forward,2*Math.PI*R/128);
    camera=carryAlong(camera,leg);assert.ok(s.withinDomain(camera.position));
    assert.equal(s.boundaryDistance(camera.position,camera.forward),Infinity);
  }
  camera.position.forEach((x,i)=>close(x,p[i]));camera.forward.forEach((x,i)=>close(x,u[i]));
  assert.equal(s.boundaryDistance(p,u),Infinity);
  const antipode=[0,0,0,-1],chart=s.chartAt(antipode,{extent:R});
  const q=chart.decode([.2*R,.1*R,0]);chart.encode(q).forEach((x,i)=>close(x,[.2*R,.1*R,0][i],R*1e-9));
  assert.throws(()=>s.encode(p),/single author chart/);
  assert.throws(()=>chart.encode(p),/outside author chart/);
  assert.throws(()=>s.transport(p,antipode,u),/Antipodal/);
  for(const at of [p,antipode,q])for(const v of s.frame(at)){close(dot(at,v),0);close(dot(v,v),1);}
  // Ball after the antipode: first hit must not be clipped to a hemisphere.
  const center=s.step(p,u,1.3*Math.PI*R),ball={id:'far-side',center,radius:.1*R};
  const hit=castSphericalBalls(s,[ball],p,u);
  assert.equal(hit.status,'hit');close(hit.distance,(1.3*Math.PI-.1)*R,R*1e-9);
  close(s.distance(hit.point,center),ball.radius,R*1e-9);close(dot(hit.point,hit.normal),0);
  assert.equal(castSphericalBalls(s,[ball],p,u,{maxDistance:Math.PI*R}).status,'miss');
  const offOrbit={id:'off',center:[0,0,1,0],radius:.1*R};
  const miss=castSphericalBalls(s,[offOrbit],p,u,{maxDistance:10*Math.PI*R});
  assert.equal(miss.status,'miss');assert.equal(miss.periodic,true);close(miss.checkedDistance,2*Math.PI*R,R*1e-9);
  assert.equal(castSphericalBalls(s,[ball],p,u,{maxTests:0}).reason,'work-budget');
  assert.equal(castSphericalBalls(s,[{...ball,center:p}],p,u).reason,'inside-start');
  const tangentCenter=s.expAt(s.step(p,u,1.4*R),[0,0,.1*R,0]);
  const tangent={id:'tangent',center:tangentCenter,radius:.1*R};
  assert.equal(castSphericalBalls(s,[tangent],p,u).status,'unresolved');
  const near={id:'near',center:s.step(p,u,.4*R),radius:.1*R};
  assert.equal(castSphericalBalls(s,[tangent,near],p,u).id,'near','later tangency cannot erase nearer hit');
  assert.equal(castSphericalBalls(s,[near,{...near,id:'coincident'}],p,u).status,'unresolved','coincident ownership is explicit');
  // Independent chord-membership sampling/bisection, no analytic ray roots.
  for(let k=0;k<32;k++){
    const theta=.4+k*.16,base=s.step(p,u,theta*R);
    const obstacle={id:'sample',center:s.expAt(base,[0,0,.04*R,0]),radius:.1*R};
    const threshold=4*Math.sin(.05)**2;
    const inside=t=>{const q=s.step(p,u,t);return q.reduce((a,x,i)=>a+(x-obstacle.center[i])**2,0)<threshold;};
    let lo=0,hi=0;
    for(let j=1;j<=1024;j++){hi=j*2*Math.PI*R/1024;if(inside(hi))break;lo=hi;}
    assert.ok(inside(hi),'sample grid must bracket a hit');
    for(let j=0;j<45;j++){const m=(lo+hi)/2;if(inside(m))hi=m;else lo=m;}
    const found=castSphericalBalls(s,[obstacle],p,u);
    assert.equal(found.status,'hit');close(found.distance,(lo+hi)/2,R*1e-8);
    const tangentAt=s.stepWithTransport(p,u,found.distance).direction;
    assert.ok(dot(found.normal,tangentAt)<0,'first hit enters the ball');
  }
}
console.log('spherical cover: global camera loop, antipodal charts, long rays and refusal cases passed');
