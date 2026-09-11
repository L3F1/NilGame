import assert from 'node:assert/strict';
import {createMetricSpace} from './engine/geometry/metric-space.js';
import {sphericalBoundaryEvents} from './engine/geometry/s3-ray-events.js';
import {compileRegionWorld} from './engine/world/region-world.js';
let passed=0,failed=0;
function test(name,fn){try{fn();passed++;}catch(e){failed++;console.error(name+': '+e.message);}}
const near=(a,b,t=1e-10)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const p=[0,0,0,1],u=[1,0,0,0];
const ball=(R,a,r)=>({entity:{id:'ball',kind:'ball',radius:r*R},center:[Math.sin(a),0,0,Math.cos(a)]});
const plane=n=>({entity:{id:'plane',kind:'plane'},planes:[n]});
test('metric ball entry/exit and outward normals at three physical scales',()=>{
 for(const R of [.5,8,100]){const space=createMetricSpace({kind:'s3',curvatureRadius:R});
 const b=ball(R,.4,.1),out=sphericalBoundaryEvents(space,b,p,u,{maxDistance:R*.8});
 assert.equal(out.status,'complete');assert.equal(out.events.length,2);
 out.events.forEach((e,i)=>{near(e.distance,R*(i===0?.3:.5),R*1e-12);assert.equal(e.transition,i?'exit':'enter');near(dot(e.point,e.normal),0);near(Math.hypot(...e.normal),1);near(dot(e.normal,e.direction),i?1:-1);near(R*Math.acos(Math.min(1,dot(e.point,b.center))),.1*R,R*1e-12);});
 }
});
test('plane root matches independent sign bisection',()=>{
 const space=createMetricSpace({kind:'s3',curvatureRadius:8}),n=[Math.cos(.37),0,0,-Math.sin(.37)];
 const out=sphericalBoundaryEvents(space,plane(n),p,u,{maxDistance:7});assert.equal(out.status,'complete');
 let a=0,b=7;for(let i=0;i<55;i++){const m=(a+b)/2,value=Math.sin(m/8)*n[0]+Math.cos(m/8)*n[3];if(value<0)a=m;else b=m;}
 near(out.events[0].distance,(a+b)/2);assert.equal(out.events[0].transition,'exit');
});
test('inside start still emits the future boundary, not occupancy at t=0',()=>{
 const space=createMetricSpace({kind:'s3'}),out=sphericalBoundaryEvents(space,ball(1,0,.2),p,u,{maxDistance:.6});assert.equal(out.status,'complete');assert.equal(out.events.length,1);near(out.events[0].distance,.2);assert.equal(out.events[0].transition,'exit');
});
test('range endpoints refuse ambiguity; well-separated outside roots excluded',()=>{
 const space=createMetricSpace({kind:'s3'}),b=ball(1,.4,.1);
 assert.equal(sphericalBoundaryEvents(space,b,p,u,{maxDistance:.3}).reason,'range-boundary');
 const out=sphericalBoundaryEvents(space,b,p,u,{maxDistance:.29});assert.equal(out.status,'complete');assert.equal(out.events.length,0);
 assert.equal(sphericalBoundaryEvents(space,plane([1,0,0,0]),p,u,{maxDistance:.5}).reason,'range-boundary');
});
test('tangent, coplanar, separated miss and event budget are distinct',()=>{
 const space=createMetricSpace({kind:'s3'}),b={entity:{id:'b',kind:'ball',radius:.2},center:[0,Math.sin(.2),0,Math.cos(.2)]};
 assert.equal(sphericalBoundaryEvents(space,b,p,u,{maxDistance:.5}).reason,'tangent-or-ill-conditioned');
 b.entity.radius=.1;assert.equal(sphericalBoundaryEvents(space,b,p,u,{maxDistance:.5}).events.length,0);
 assert.equal(sphericalBoundaryEvents(space,plane([0,1,0,0]),p,u,{maxDistance:.5}).reason,'coincident-or-ill-conditioned');
 assert.equal(sphericalBoundaryEvents(space,ball(1,.4,.1),p,u,{maxDistance:.8,maxEvents:1}).reason,'event-budget');
});
test('compiled cell emits face candidates with no scene-hit claim',()=>{
 const world=compileRegionWorld({format:'nil-scene',version:2,id:'events',units:{name:'design-unit',playerRadius:.1},regions:[{id:'r',geometry:{kind:'s3',curvatureRadius:8},topology:'cover',extent:8}],entities:[{id:'s',kind:'spawn',regionId:'r',position:[0,0,0]},{id:'c',kind:'geodesic-cell',regionId:'r',position:[3,0,0],halfExtent:[.5,.4,.3]}],connections:[]});
 const {space,field}=world.regions.get('r'),before=JSON.stringify(field.primitives[0]);
 const out=sphericalBoundaryEvents(space,field.primitives[0],p,u,{maxDistance:5});assert.equal(out.status,'complete');assert.equal(out.events.length,2);near(out.events[0].distance,2.5);near(out.events[1].distance,3.5);assert.equal(out.hit,undefined);assert.equal(JSON.stringify(field.primitives[0]),before);
 const off=space.decode([0,2,0]),offEvents=sphericalBoundaryEvents(space,field.primitives[0],off,space.frame(off)[0],{maxDistance:5});
 assert.equal(offEvents.status,'complete');assert.ok(offEvents.events.length>0);assert.ok(offEvents.events.every(e=>field.primitives[0].distance(e.point)>0),'unclipped face candidates are outside the actual cell');
});
test('oblique ball intersections bracket actual angular-distance sign',()=>{
 const space=createMetricSpace({kind:'s3',curvatureRadius:8}),center=[Math.sin(.4)*Math.cos(.07),Math.sin(.07),0,Math.cos(.4)*Math.cos(.07)];
 const out=sphericalBoundaryEvents(space,{entity:{id:'b',kind:'ball',radius:1},center},p,u,{maxDistance:6});assert.equal(out.status,'complete');assert.equal(out.events.length,2);
 for(const e of out.events){const value=t=>8*Math.acos(Math.sin(t/8)*center[0]+Math.cos(t/8)*center[3])-1;
 assert.ok(value(e.distance-1e-5)*value(e.distance+1e-5)<0);near(value(e.distance),0,1e-12);}
});
test('bad inputs and unsupported solid degeneracy are explicit',()=>{
 const space=createMetricSpace({kind:'s3'}),b=ball(1,.4,.1);
 assert.throws(()=>sphericalBoundaryEvents(space,b,p,[2,0,0,0],{maxDistance:1}));
 assert.equal(sphericalBoundaryEvents(space,b,[0,0,0,1+1e-10],u,{maxDistance:1}).reason,'input-roundoff');
 assert.throws(()=>sphericalBoundaryEvents(space,b,p,u,{maxDistance:4}));
 assert.throws(()=>sphericalBoundaryEvents(space,b,p,u,{maxDistance:1,maxEvents:-1}));
 b.entity.radius=Math.PI;assert.equal(sphericalBoundaryEvents(space,b,p,u,{maxDistance:1}).reason,'degenerate-ball');
});
console.log(`s3 ray events: ${passed}/${passed+failed}`);if(failed)process.exitCode=1;
