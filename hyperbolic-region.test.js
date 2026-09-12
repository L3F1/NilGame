import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileRegionWorld,compileHyperbolicRegionWorld} from './engine/world/region-world.js';
import {moveRegionProbe} from './engine/world/region-motion.js';
import {compileHyperbolicField} from './engine/world/hyperbolic-field.js';
import {createHyperbolicSpace} from './engine/geometry/hyperbolic-space.js';
const source=JSON.parse(readFileSync('levels/fixtures/connected-h3-cpu.nil.json','utf8'));
const before=JSON.stringify(source),w=compileHyperbolicRegionWorld(source);
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
assert.throws(()=>compileRegionWorld(source),/does not support h3/);
assert.throws(()=>w.renderData(),/rendering is not implemented/);
const start=w.spawn('flat');start.velocity=[0,1,0];
const r=moveRegionProbe(w,start,4,{maxSteps:256});
assert.equal(r.status,'complete',r.detail);assert.equal(r.state.regionId,'return');assert.equal(r.crossings,2);
near(r.timeConsumed,4);near(r.state.position[1],1.0008);
const back=moveRegionProbe(w,{...r.state,velocity:[0,-1,0]},4,{maxSteps:256});
assert.equal(back.status,'complete',back.detail);assert.equal(back.crossings,2);
assert.equal(back.state.regionId,'flat');near(back.state.position[1],-1);
const roundtrip=compileHyperbolicRegionWorld(JSON.parse(JSON.stringify(w.document())));
assert.deepEqual(roundtrip.document(),w.document());
assert.equal(moveRegionProbe(roundtrip,roundtrip.spawn('hyperbolic'),0).state.regionId,'hyperbolic');
assert.equal(JSON.stringify(source),before);
const modified=structuredClone(source);modified.entities.find(e=>e.id==='landmark').position=[0,0,0];
const blockedWorld=compileHyperbolicRegionWorld(modified),blockedStart=blockedWorld.spawn('flat');
blockedStart.velocity=[0,1,0];
assert.throws(()=>moveRegionProbe(blockedWorld,start,2),/owned by the region space/);
const blocked=moveRegionProbe(blockedWorld,blockedStart,2);
assert.equal(blocked.status,'blocked-exit');assert.equal(blocked.state.regionId,'flat');
assert.ok(blocked.state.position[1]<0);
for(const change of [
 d=>{d.regions[1].extent=17;},
 d=>{d.entities.find(e=>e.id==='landmark').radius=9;},
 d=>{d.entities.find(e=>e.id==='landmark').op='subtract';},
 d=>{d.entities.find(e=>e.id==='landmark').position=[0,.5,0];},
 d=>{d.entities.push({id:'floor',regionId:'hyperbolic',kind:'plane',position:[0,0,-1],up:[0,0,1]});},
]){const d=structuredClone(source);change(d);assert.throws(()=>compileHyperbolicRegionWorld(d));}
// Single balls have independently known radial signed distances and ray entry.
// The overlapping union keeps exact exterior distance but no exact interior claim.
for(const R of [.5,8,10000]){
 const s=createHyperbolicSpace({curvatureRadius:R});
 const entities=[{id:'one',kind:'ball',position:[0,0,0],radius:.4*R}];
 const f=compileHyperbolicField(entities,s),p=s.decode([.8*R,0,0]);
 near(f.distance(p),.4*R,1e-8*R);
 const n=f.normal(p);near(s.norm(p,n),1);near(s.dot(p,n,s.frame(p)[0]),1);
 const hit=f.rayCast(p,n.map(x=>-x),{maxDistance:.7*R});
 assert.equal(hit.status,'hit');assert.equal(hit.id,'one');near(hit.distance,.4*R,1e-8*R);
 assert.equal(f.rayCast(p,n.map(x=>-x),{maxDistance:.7*R,maxTests:0}).status,'unresolved');
 assert.equal(f.sample(s.origin).normal,null);
 entities[0].radius=100*R;near(f.distance(p),.4*R,1e-8*R); // compile snapshots
 const union=compileHyperbolicField([{id:'l',kind:'ball',position:[-.2*R,0,0],radius:.4*R},
   {id:'r',kind:'ball',position:[.2*R,0,0],radius:.4*R}],s);
 near(union.distance(s.origin),-.2*R,1e-8*R);
 assert.equal(union.capabilities.exteriorDistance,'exact');assert.equal(union.capabilities.distance,'bound');
 assert.equal(union.sample(s.origin).feature,'seam');
 const empty=compileHyperbolicField([],s);assert.equal(empty.distance(s.origin),Infinity);
 assert.equal(empty.rayCast(s.origin,s.frame(s.origin)[0],{maxDistance:3*R}).reason,'domain-exit');
}
console.log('H3 saved regions: round trip, E3/H3/E3 movement, blocked exit, field guarantees and unsupported author intent passed');
