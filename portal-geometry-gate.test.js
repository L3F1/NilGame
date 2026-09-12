import assert from 'node:assert/strict';
import {createMetricSpace} from './engine/geometry/metric-space.js';
import {compileFramedPortals} from './engine/world/region-portal.js';
const flat=createMetricSpace({kind:'e3'});
// A deliberately mislabeled adapter: this is a dispatch test, not an H3 model.
// Reject unsupported metric kinds before executing any adapter operation.
for(const kind of ['h3','nil','sol','future-geometry']){
  let invoked=false;
  const space={...flat,kind,validatePoint:()=>{invoked=true;throw Error('adapter invoked too early');}};
  const anchor={id:'end',regionId:'region',space,center:[0,0,0],normal:[0,1,0],up:[0,0,1],radius:1};
  assert.throws(()=>compileFramedPortals([], [anchor],.25),/Unsupported portal geometry/);
  assert.equal(invoked,false);
}
assert.deepEqual(compileFramedPortals([],[],.25),[]);
console.log('Portal geometry gate: unsupported adapters refused before dispatch; empty graph supported');
