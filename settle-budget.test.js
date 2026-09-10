import assert from 'node:assert/strict';
import {moveProbe,e3Space} from './engine/world/collision.js';
// A valid 1-Lipschitz lower bound. Its conservative contact envelope is z=.5
// for a .25 probe; the geometric floor itself is z=0.
const space=e3Space(), field={distance:p=>p[2]*.5,normal:()=>[0,0,1]};
const state={position:[0,0,.5],velocity:[1,0,-1],radius:.25};
let passed=0,failed=0;
function test(name,fn){try{fn();passed++;}catch(e){failed++;console.error(`FAIL ${name}: ${e.message}`);}}
test('partial settle reports exhaustion and the remaining correction without refunding time',()=>{
  const limited=moveProbe(field,space,state,.05,{maxSteps:29});
  assert.equal(limited.timeRemaining,0,'regular motion already consumed the clock');
  assert.equal(limited.steps,29);
  assert.equal(limited.stalled,true);
  assert.equal(limited.exhausted,'steps');
  assert.ok(limited.pendingLift?.distance>0);
  assert.deepEqual(limited.pendingLift.normal,[0,0,1]);
  // Total correction demand is the rise above the original contact envelope.
  assert.ok(Math.abs(limited.pendingLift.distance-(limited.position[2]-.5))<1e-12);
  assert.ok(field.distance(limited.position)-state.radius>1e-4,'not yet within contact skin');
  const complete=moveProbe(field,space,state,.05,{maxSteps:96});
  assert.equal(complete.stalled,false);
  assert.equal(complete.pendingLift,null);
  assert.ok(Math.abs(complete.position[0]-limited.position[0])<1e-12,'settling changes no horizontal travel');
});
console.log(`${passed}/${passed+failed} settle budget checks passed`);
process.exitCode=failed?1:0;
