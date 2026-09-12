import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileHyperbolicRegionWorld} from './engine/world/region-world.js';
import {traceRegionSight} from './engine/world/region-sight.js';
const fixture=JSON.parse(readFileSync('levels/fixtures/connected-h3-cpu.nil.json','utf8'));
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const sourceRay={regionId:'flat',position:[0,-1,0],direction:[0,1,0]};
// A ray has no gameplay exit offset: 1 E3 + 2 H3 + 1.75 E3 = 4.75.
const doc=structuredClone(fixture);
doc.entities.push({id:'end-ball',kind:'ball',regionId:'return',position:[0,2,0],radius:.25});
const w=compileHyperbolicRegionWorld(doc);
for(const s3Method of ['events','march']){
 const r=traceRegionSight(w,sourceRay,{maxDistance:6,s3Method});
 assert.equal(r.status,'hit',r.reason);assert.equal(r.regionId,'return');
 assert.equal(r.crossings.length,2);near(r.distance,4.75);
 assert.deepEqual(r.segments.map(s=>s.regionId),['flat','hyperbolic','return']);
 near(r.segments.reduce((n,s)=>n+s.distance,0),r.distance);
}
const target=structuredClone(fixture);
target.entities.find(e=>e.id==='landmark').position=[0,1,0];
const h=compileHyperbolicRegionWorld(target),before=JSON.stringify(sourceRay);
const r=traceRegionSight(h,sourceRay,{maxDistance:3});
assert.equal(r.status,'hit',r.reason);assert.equal(r.regionId,'hyperbolic');
assert.equal(r.query.owner,'landmark');assert.equal(r.query.method,'h3-balls');
near(r.distance,1.75);near(h.regions.get('hyperbolic').space.norm(r.position,r.query.normal),1);
assert.equal(JSON.stringify(sourceRay),before);
for(const maxDistance of [3,30])for(const reversed of [false,true]){
 const result=traceRegionSight({...h,portals:reversed?[...h.portals].reverse():h.portals},sourceRay,{maxDistance});
 assert.equal(result.status,'hit',result.reason);near(result.distance,1.75);
}
// An uncertain remote field root must not hide a definite earlier portal.
const remote=structuredClone(fixture);
remote.entities.find(e=>e.id==='landmark').position=[0,3.25,0];
remote.entities.push({id:'visible',kind:'ball',regionId:'return',position:[0,.75,0],radius:.1});
const remoteHit=traceRegionSight(compileHyperbolicRegionWorld(remote),sourceRay,{maxDistance:4});
assert.equal(remoteHit.status,'hit',remoteHit.reason);near(remoteHit.distance,3.65);
assert.equal(remoteHit.crossings.length,2);
const tied=structuredClone(fixture);
tied.entities.find(e=>e.id==='landmark').position=[0,2.25,0];
assert.equal(traceRegionSight(compileHyperbolicRegionWorld(tied),sourceRay,{maxDistance:4}).status,'unresolved');
for(let maxWork=0;maxWork<r.work;maxWork++){
 const limited=traceRegionSight(h,sourceRay,{maxDistance:3,maxWork});
 assert.equal(limited.status,'unresolved');assert.equal(limited.reason,'work-budget');
 assert.ok(limited.work<=maxWork);
}
assert.equal(traceRegionSight(w,sourceRay,{maxDistance:6,maxCrossings:1}).reason,'crossing-budget');
// Portal-free region isolates analytic field domain/range and normal behavior.
for(const R of [.5,8,10000]){
 const document={format:'nil-scene',version:2,id:'sight',units:{name:'design-unit',playerRadius:.02*R},
  regions:[{id:'h',geometry:{kind:'h3',curvatureRadius:R},extent:1.8*R,topology:'cover'}],
  entities:[{id:'spawn',kind:'spawn',regionId:'h',position:[0,0,0]},
   {id:'ball',kind:'ball',regionId:'h',position:[.8*R,0,0],radius:.2*R}],connections:[]};
 const world=compileHyperbolicRegionWorld(document),space=world.regions.get('h').space;
 const ray={regionId:'h',position:space.origin,direction:space.frame(space.origin)[0]};
 const hit=traceRegionSight(world,ray,{maxDistance:3*R});
 assert.equal(hit.status,'hit',hit.reason);near(hit.distance,.6*R,1e-8*R);
 assert.equal(traceRegionSight(world,ray,{maxDistance:.4*R}).status,'miss');
 assert.equal(traceRegionSight(world,ray,{maxDistance:.6*R}).status,'unresolved');
 const away={...ray,direction:ray.direction.map(x=>-x)};
 assert.equal(traceRegionSight(world,away,{maxDistance:3*R}).reason,'domain-exit');
 const inside={...ray,position:space.decode([.8*R,0,0]),direction:space.frame(space.decode([.8*R,0,0]))[0]};
 assert.equal(traceRegionSight(world,inside,{maxDistance:R}).reason,'inside-start');
 const regions=new Map(world.regions);
 regions.set('h',{...regions.get('h'),field:{distance:()=>Infinity}});
 assert.equal(traceRegionSight({...world,regions},ray).reason,'unsupported-h3-field');
 regions.set('h',{...regions.get('h'),space:{...space,kind:'nil'}});
 assert.equal(traceRegionSight({...world,regions},ray).reason,'unsupported-geometry');
}
console.log('H3 sight: connected arclength/ownership, analytic hits/normals, range/domain/work/crossing refusals, explicit dispatch passed');
