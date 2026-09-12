import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileRegionWorld} from './engine/world/region-world.js';
import {moveRegionProbe, resumeRegionCorrection} from './engine/world/region-motion.js';
import {createCameraFrame} from './engine/world/camera-frame.js';
const make=(ball=false)=>({...compileRegionWorld({format:'nil-scene',version:2,id:'uncertain-motion',
  units:{name:'design-unit',playerRadius:.1},
  regions:['a','b'].map(id=>({id,geometry:{kind:'e3',curvatureRadius:1},extent:6,topology:'cover'})),
  entities:[...['a','b'].map(regionId=>({id:`spawn-${regionId}`,kind:'spawn',regionId,position:[0,0,0]})),
    ...(ball?[{id:'solid',regionId:'a',kind:'ball',position:[0,2,0],radius:.5}]:[])],connections:[]})});
function state(w,id='a',chart=[0,0,0],speed=1,radius=.1){
  const s=w.regions.get(id).space,p=s.decode(chart),f=s.frame(p);
  return {regionId:id,position:p,velocity:f[1].map(x=>x*speed),radius,
    camera:createCameraFrame(s,p,{forward:f[1],up:f[2]})};
}
const portal=(id,crossing)=>({id,fromId:id,fromRegionId:'a',toRegionId:'b',crossing,
  signedHeight:p=>1-p[1],transit:p=>({position:p.slice(),carry:v=>v.slice(),normal:[0,1,0]})});
const refusal=(reason='test-band')=>({status:'unresolved',reason,distance:999,uncertaintyFrom:0});
// Origin uncertainty and malformed packets cannot advance or fabricate a contact.
for(const packet of [refusal(),{status:'unresolved',distance:4},{distance:NaN},
  {status:'miss',checkedDistance:0},{status:'unknown'}]){
  const w=make(),s=state(w),snapshot=JSON.stringify(s);
  w.portals=[portal('u',()=>packet)];
  const r=moveRegionProbe(w,s,2);
  assert.equal(r.status,'unresolved');assert.equal(r.detail,'aperture-query');
  assert.deepEqual(r.state.position,s.position);assert.deepEqual(r.state.camera,s.camera);
  assert.equal(r.timeConsumed,0);assert.equal(r.timeRemaining,2);
  assert.equal(r.crossings,0);assert.equal(r.contactSamples.length,0);
  assert.equal(r.events[0].apertures[0].portalId,'u');
  assert.equal(JSON.stringify(s),snapshot);
}
// A remote uncertainty permits a definite earlier contact. Prefixes are measured
// from EACH requested leg, and a bounded miss covers the whole requested leg.
{
  const w=make(true),s=state(w);
  w.portals=[portal('remote',(p,u,d)=>4-p[1]>d?{status:'miss',checkedDistance:d}
    :{...refusal(),uncertaintyFrom:Math.max(0,4-p[1])})];
  const r=moveRegionProbe(w,s,5);
  assert.notEqual(r.status,'unresolved');assert.ok(r.contactSamples.length>0);
  assert.ok(r.state.position[1]<1.4);assert.equal(r.crossings,0);
}
// Ties with a definite gate must not select it, regardless of array order.
for(const reverse of [false,true]){
  const w=make(),seen=[];
  const u=portal('unknown',(p,v,d)=>{seen.push(d);return {...refusal(),uncertaintyFrom:1};});
  const gate=portal('known',(p,v,d)=>{seen.push(d);return {distance:1};});
  gate.transit=()=>{throw Error('uncertain crossing must never transit');};
  w.portals=reverse?[u,gate]:[gate,u];
  const s=state(w),r=moveRegionProbe(w,s,2);
  assert.equal(r.status,'unresolved');assert.equal(r.detail,'aperture-query');
  assert.deepEqual(seen,[2,2]);assert.equal(r.timeRemaining,2);
  assert.deepEqual(r.state.position,s.position);assert.equal(r.crossings,0);
}
// Domain ties also refuse, without using the chart as a contact surface.
{
  const w=make(),s=state(w);
  w.portals=[portal('domain-tie',(p,u,d)=>({...refusal(),uncertaintyFrom:6}))];
  const r=moveRegionProbe(w,s,7);
  assert.equal(r.status,'unresolved');assert.equal(r.detail,'aperture-query');
  assert.equal(r.timeConsumed,0);assert.equal(r.contactSamples.length,0);
}
// A definite nearer gate wins; uncertainty on the destination offset instead
// refuses the entire transaction and keeps the responsible destination ID.
for(const destinationUnknown of [false,true]){
  const w=make(),s=state(w);
  w.portals=[portal('known',()=>({status:'hit',distance:1})),
    portal('remote',()=>({...refusal(),uncertaintyFrom:1.5}))];
  if(destinationUnknown)w.portals.push({...portal('destination',()=>refusal()),fromRegionId:'b'});
  const r=moveRegionProbe(w,s,2);
  assert.equal(r.crossings,destinationUnknown?0:1);
  assert.equal(r.state.regionId,destinationUnknown?'a':'b');
  if(destinationUnknown){
    assert.equal(r.status,'blocked-exit');assert.equal(r.detail,'exit-offset-unresolved');
    assert.ok(r.state.position[1]<1);assert.ok(r.timeRemaining>1);
    assert.equal(r.events[0].apertures[0].regionId,'b');
  }else assert.equal(r.status,'complete');
}
// Real S3 correction debt, issued by the solver. Make the aperture uncertain
// only during resume to exercise the shared event provider on a correction leg.
{
  const w={...compileRegionWorld(JSON.parse(readFileSync('levels/fixtures/s3-room.nil.json','utf8')))};
  let uncertain=false;
  w.portals=[{...portal('correction',()=>uncertain?refusal():null),fromRegionId:'sphere'}];
  const debt=moveRegionProbe(w,state(w,'sphere',[0,1,.2501],2.6,.25),1/60,{maxSteps:8});
  assert.ok(debt.pendingLift);assert.ok(debt.continuation);
  uncertain=true;
  const r=resumeRegionCorrection(w,debt);
  assert.equal(r.status,'unresolved');assert.equal(r.detail,'correction-boundary');
  assert.deepEqual(r.state.position,debt.state.position);
  assert.deepEqual(r.pendingLift,debt.pendingLift);assert.equal(r.continuation,null);
  assert.equal(r.timeConsumed,0);assert.equal(r.corrected,0);
  assert.equal(r.events[0].apertures[0].reason,'test-band');
  const again=resumeRegionCorrection(w,debt);
  assert.equal(again.status,'stale-continuation');
  assert.deepEqual(again.state.position,debt.state.position);
}
console.log('Aperture motion refusals: origin, malformed, nearer contact, gate/domain ties, clock and S3 correction debt passed');
