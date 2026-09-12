import assert from 'node:assert/strict';
import {compileRegionWorld} from './engine/world/region-world.js';
import {traceRegionSight} from './engine/world/region-sight.js';
import {apertureResult} from './engine/world/aperture-result.js';
const ray={regionId:'a',position:[0,0,0],direction:[0,1,0]};
const make=(ball=false)=>({...compileRegionWorld({format:'nil-scene',version:2,id:'unknown',
  units:{name:'design-unit',playerRadius:.1},
  regions:['a','b'].map(id=>({id,geometry:{kind:'e3',curvatureRadius:1},extent:6,topology:'cover'})),
  entities:[...['a','b'].map(regionId=>({id:`spawn-${regionId}`,kind:'spawn',regionId,position:[0,0,0]})),
    ...(ball?[{id:'solid',regionId:'a',kind:'ball',position:[0,2,0],radius:.5}]:[])],connections:[]})});
const portal=(id,value)=>({id,fromId:id,fromRegionId:'a',toId:'exit',toRegionId:'b',center:[0,1,0],radius:1,
  signedHeight:()=>1,crossing:()=>value,
  transit:p=>({position:p.slice(),carry:v=>v.slice()})});
const unknown=(id,bound)=>portal(id,{status:'unresolved',reason:'test-band',distance:5,uncertaintyFrom:bound});
const run=(w)=>traceRegionSight(w,ray,{maxDistance:5});
for(const bound of [0,1.5,4]){
  const w=make(true);w.portals=[unknown('u',bound)];
  const r=run(w);
  assert.equal(r.status,bound>1.5?'hit':'unresolved');
  assert.equal(r.crossings.length,0);
  if(r.status==='unresolved'){
    assert.equal(r.reason,'aperture-query');assert.equal(r.apertures[0].reason,'test-band');
    assert.equal(r.distance,0);assert.deepEqual(r.position,ray.position);
  }else assert.equal(r.distance,1.5);
}
for(const bound of [0,1,4])for(const reverse of [false,true]){
  const w=make(),seen=[];
  const gate=portal('known',{distance:1});
  const original=gate.crossing;gate.crossing=(p,u,end)=>{seen.push(end);return original();};
  const uncertain=unknown('unknown',bound);
  const originalU=uncertain.crossing;uncertain.crossing=(p,u,end)=>{seen.push(end);return originalU();};
  w.portals=reverse?[uncertain,gate]:[gate,uncertain];
  const r=run(w);assert.deepEqual(seen,[5,5]);
  assert.equal(r.crossings.length,bound>1?1:0);
  assert.equal(r.status,bound>1?'miss':'unresolved');
}
for(const malformed of [{status:'oops'}, {distance:NaN}, {distance:-1},
  {status:'unresolved',uncertaintyFrom:-1},{status:'unresolved',uncertaintyFrom:Infinity},
  {status:'miss',checkedDistance:1}]){
  const w=make();w.portals=[portal('bad',malformed)];
  const r=run(w);assert.equal(r.status,'unresolved');assert.equal(r.distance,0);
}
const absentPrefix=apertureResult({status:'unresolved',distance:4},5);
assert.equal(absentPrefix.uncertaintyFrom,0);
assert.deepEqual(apertureResult(null,5),{status:'miss'});
assert.deepEqual(apertureResult({status:'miss',checkedDistance:5},5),{status:'miss'});
assert.deepEqual(ray.position,[0,0,0]);
console.log('Aperture refusal: nearer solids/gates, unknown ties/origin, ordering, bounded miss and malformed packets passed');
