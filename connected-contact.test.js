import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createConnectedGlobalPreview} from './app/connected-global-model.js';
const document=JSON.parse(fs.readFileSync('levels/fixtures/connected-global.nil.json'));
const model=createConnectedGlobalPreview(document);
model.act('spawn-sphere');model.look({yaw:-.5});
let exhausted=0;
const a=Math.hypot(2,2)/8;
const center=[Math.sin(a)/Math.SQRT2,Math.sin(a)/Math.SQRT2,0,Math.cos(a)];
for(let i=0;i<100;i++){
  model.advance(.016,[0,1,0]);
  if(model.motion==='budget-exhausted/steps')exhausted++;
  assert.equal(model.halted,false,`sphere contact frame ${i}: ${model.motion}`);
  const p=model.state.position,d=p.reduce((s,x,k)=>s+x*center[k],0);
  const distance=8*Math.atan2(Math.hypot(...p.map((x,k)=>x-d*center[k])),d);
  assert.ok(distance>=.85-1e-10,'independent great-circle clearance protects spherical body');
}
assert.ok(exhausted>0,'corpus must exercise the reported step exhaustion');
const before=[...model.state.position],space=model.world.regions.get('sphere').space;
for(let i=0;i<20;i++)model.advance(.016,[0,-1,0]);
assert.equal(model.halted,false);
assert.ok(space.distance(before,model.state.position)>.5,'can retreat without reset');
console.log(`Connected contact: ${exhausted} bounded stops remain steerable; retreat passed`);
model.act('spawn-flat');model.look({yaw:-.5});
let corrections=0;
for(let i=0;i<160;i++){
  model.advance(.016,[0,1,0]);
  if(model.motion.includes('correction:complete'))corrections++;
  assert.equal(model.halted,false,`flat contact ${i}: ${model.motion}`);
  // Independent Euclidean ball clearance, including the settle endpoint.
  assert.ok(Math.hypot(model.state.position[0]-3,model.state.position[1]-3,model.state.position[2])>=.85,
    'body stays outside flat target');
}
assert.ok(corrections>0,'must exercise actual correction recovery');
const flatBefore=[...model.state.position];
for(let i=0;i<20;i++)model.advance(.016,[0,-1,0]);
assert.equal(model.halted,false);
assert.ok(Math.hypot(...model.state.position.map((x,i)=>x-flatBefore[i]))>.5,'flat retreat works');
console.log(`Flat contact: ${corrections} bounded corrections completed without penetration; retreat passed`);
