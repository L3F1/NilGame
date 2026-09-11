import assert from 'node:assert/strict';
import {createSphericalCover} from './engine/geometry/spherical-cover.js';
import {createMetricSpace} from './engine/geometry/metric-space.js';
import {compileFramedPortals} from './engine/world/region-portal.js';
const s=createSphericalCover(),e=createMetricSpace({kind:'e3',maxDistance:20});
const anchors=[{id:'sphere-gate',regionId:'sphere',radius:.9,space:s,center:[0,0,0,1],normal:[1,0,0,0],up:[0,0,1,0]},
  {id:'flat-gate',regionId:'flat',radius:.9,space:e,center:[0,0,0],normal:[0,1,0],up:[0,0,1]}];
const connection={id:'link',kind:'portal',a:'sphere-gate',b:'flat-gate',velocity:'preserve-speed',scale:1};
const [gate,back]=compileFramedPortals([connection],anchors,.25),R=8;
const atCenter=gate.transit(gate.center),a=gate.renderData(),b=back.renderData();
for(const [input,want] of [[a.up,b.up],[a.right,b.right.map(x=>-x)],[a.normal,b.normal.map(x=>-x)]]){
  assert.ok(Math.hypot(...atCenter.carry(input).map((x,i)=>x-want[i]))<1e-10,'all three portal axes must follow the specified map');
}
const start=s.stepWithTransport(s.origin,[1,0,0,0],-.2*R),direction=start.direction.map(x=>-x);
const event=gate.crossing(start.position,direction,2*Math.PI*R,.25);
assert.ok(event,'back-side start must be able to circle around and enter front');
assert.ok(Math.abs(event.distance-(2*Math.PI-.2)*R)<1e-10);
assert.equal(gate.crossing(start.position,direction,Math.PI*R,.25),null);
const legacy={...s,coverage:undefined};
const [oldPolicy]=compileFramedPortals([connection],[{...anchors[0],space:legacy},anchors[1]],.25);
assert.equal(oldPolicy.crossing(start.position,direction,2*Math.PI*R,.25),null,'demonstrate the old bounded-side policy');
const antipodal=gate.crossing([0,0,0,-1],[1,0,0,0],Math.PI*R+.01);
assert.ok(antipodal);assert.ok(s.distance(antipodal.at,s.origin)<1e-10);
const offset=s.expAt(s.origin,[0,.4,0,0]),mapped=gate.transit(offset),returned=back.transit(mapped.position);
assert.ok(s.distance(returned.position,offset)<1e-10);
const v=s.transport(s.origin,offset,[0,0,2,0]),out=mapped.carry(v),roundtrip=returned.carry(out);
assert.ok(Math.abs(Math.hypot(...out)-2)<1e-10);
assert.ok(Math.hypot(...roundtrip.map((x,i)=>x-v[i]))<1e-10);
const radiusMiss=s.expAt(s.origin,[0,.7,0,0]);
const approach=s.stepWithTransport(radiusMiss,s.transport(s.origin,radiusMiss,[1,0,0,0]),.3);
assert.equal(gate.crossing(approach.position,approach.direction.map(x=>-x),1,.25),null);
// Mutating caller-owned arrays must not change a compiled portal.
anchors[0].center[3]=-1;assert.deepEqual(gate.center,[0,0,0,1]);
console.log('global portal: back-side/full-orbit entry, antipode, finite disc, transit and speed passed');
