import assert from 'node:assert/strict';
import {createMetricSpace} from './engine/geometry/metric-space.js';
import {createHyperbolicSpace} from './engine/geometry/hyperbolic-space.js';
import {sampleHyperbolicBall} from './engine/geometry/hyperbolic-balls.js';
import {compileFramedPortals,compileHyperbolicFramedPortals} from './engine/world/region-portal.js';
import {createCameraFrame} from './engine/world/camera-frame.js';
import {moveRegionProbe} from './engine/world/region-motion.js';
const neg=v=>v.map(x=>-x);
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const connection=(id,a,b)=>({id,a,b,kind:'portal',velocity:'preserve-speed',scale:1});
const empty={distance:()=>Infinity,normal:()=>null,capabilities:{exteriorDistance:'exact'}};
let routes=0;
for(const R of [.5,8,10000]){
  const flat=createMetricSpace({kind:'e3',maxDistance:20*R}),h=createHyperbolicSpace({curvatureRadius:R});
  const center=h.decode([.2*R,-.15*R,.1*R]),basis=h.frame(center);
  const n=h.normalize(center,basis[0].map((x,i)=>.6*x+.8*basis[1][i]));
  const up=basis[2],radius=.3*R,body=.05*R;
  const anchors=[{id:'a',regionId:'a',space:flat,center:[0,0,0],normal:[0,-1,0],up:[0,0,1],radius},
    {id:'b',regionId:'b',space:h,center,normal:n,up,radius}];
  const links=[connection('ab','a','b')];
  assert.throws(()=>compileFramedPortals(links,anchors,body),/Unsupported portal geometry/);
  const pair=compileHyperbolicFramedPortals(links,anchors,body),back=pair[1];
  // Construct an off-centre intersection first. Transit and inverse preserve
  // radial placement and the entire tangent map, not ambient Euclidean length.
  const p=[.08*R,0,.06*R],mapped=pair[0].transit(p),inverse=back.transit(mapped.position);
  near(h.distance(center,mapped.position),.1*R,1e-8*R);
  near(flat.distance(p,inverse.position),0,1e-8*R);
  for(const v of [[1,2,3],[0,-1,0],[.2,0,-.8]]){
    const carried=mapped.carry(v),returned=inverse.carry(carried);
    near(h.norm(mapped.position,carried),Math.hypot(...v));
    returned.forEach((x,i)=>near(x,v[i]));
  }
  const at=h.step(center,up,.1*R),normal=h.transport(center,at,n);
  const start=h.step(at,normal,.4*R),toward=h.transport(at,start,neg(normal));
  const hit=back.crossing(start,toward,.7*R,body);
  assert.equal(hit.status,'hit');near(hit.distance,.4*R,1e-8*R);
  near(back.signedHeight(start),.4*R,1e-8*R);
  assert.equal(back.crossing(start,toward,.4*R,body).status,'unresolved');
  assert.equal(back.crossing(center,neg(n),.2*R,body).status,'unresolved');
  // Analytic outward height is R*sinh(t/R), strictly increasing. Inward and
  // zero-slope starts must still refuse; a numerical-domain exit is not a miss.
  assert.equal(back.crossing(center,n,.2*R,body).status,'miss');
  for(const t of [.01,.1,.2])near(h.ambientDot(h.step(center,n,t*R),n),Math.sinh(t),1e-9);
  assert.equal(back.crossing(center,up,.2*R,body).status,'unresolved');
  assert.equal(back.crossing(center,n,4*R,body).reason,'domain-exit');
  const end=h.step(center,n,.8*R),endNormal=h.transport(center,end,n),endUp=h.transport(center,end,up);
  anchors.push({id:'b-out',regionId:'b',space:h,center:end,normal:neg(endNormal),up:endUp,radius},
    {id:'c',regionId:'c',space:flat,center:[0,0,0],normal:[0,1,0],up:[0,0,1],radius});
  links.push(connection('bc','b-out','c'));
  const world={regions:new Map(['a','b','c'].map(id=>[id,{id,space:id==='b'?h:flat,field:empty}])),
    portals:compileHyperbolicFramedPortals(links,anchors,body)};
  const position=[0,-.4*R,0],camera=createCameraFrame(flat,position,{forward:[0,1,0],up:[0,0,1]});
  const state={regionId:'a',position,velocity:[0,1,0],radius:body,camera};
  const result=moveRegionProbe(world,state,1.5*R);
  assert.equal(result.status,'complete',result.detail);assert.equal(result.crossings,2);
  assert.equal(result.state.regionId,'c');near(result.timeConsumed,1.5*R,1e-8*R);
  near(result.state.position[1],.3*R+.0008,1e-8*R);
  near(flat.norm(result.state.position,result.state.velocity),1);routes++;
  const returned=moveRegionProbe(world,{...result.state,velocity:neg(result.state.velocity)},1.5*R);
  assert.equal(returned.status,'complete',returned.detail);assert.equal(returned.crossings,2);
  assert.equal(returned.state.regionId,'a');near(returned.state.position[1],-.4*R,1e-8*R);
  returned.state.camera.forward.forEach((x,i)=>near(x,camera.forward[i]));
  returned.state.camera.up.forEach((x,i)=>near(x,camera.up[i]));
  // A destination ball prevents ownership transfer, retaining a source-side
  // checkpoint; this uses the actual metric ball sampler, not a fake wall.
  const ball={center,radius:.12*R};
  world.regions.get('b').field={distance:p=>sampleHyperbolicBall(h,ball,p).distance,
    normal:p=>sampleHyperbolicBall(h,ball,p).normal,capabilities:{exteriorDistance:'exact'}};
  const blocked=moveRegionProbe(world,state,.7*R);
  assert.equal(blocked.status,'blocked-exit');assert.equal(blocked.state.regionId,'a');
  assert.ok(blocked.state.position[1]<0);assert.equal(blocked.crossings,0);
  assert.throws(()=>compileHyperbolicFramedPortals(links,anchors.map(a=>a.id==='b'?{...a,radius:2*R}:a),body),/radius at most R/);
}
console.log(`H3 framed portals: ${routes} E3/H3/E3 routes, inverse maps, physical height, outward starts and blocked exits passed; scene/GPU gate retained`);
