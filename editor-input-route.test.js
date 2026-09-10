import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMouseLook} from './app/mouse-look.js';
import {compileSceneField} from './engine/world/scene-field.js';
import {e3Space} from './engine/world/collision.js';
import {stepWalker} from './engine/world/walker.js';
let passed=0,failed=0;
function test(name,fn){try{fn();passed++;}catch(e){failed++;console.error(`FAIL ${name}: ${e.message}`);}}
test('lock transitions, spikes and bursty mice do not leak or accumulate deferred turns',()=>{
  const m=createMouseLook();m.reset(true,0);m.push(40,40,249);
  assert.equal(m.drain().yaw,0);
  m.push(10000,1,300);assert.equal(m.drain().pitch,0);
  for(let i=0;i<20;i++)m.push(100,20,301);
  assert.deepEqual(m.drain(),{yaw:-.6,pitch:-.6});
  assert.equal(m.drain().yaw,0);
  m.push(20,10,400);m.reset(false,400);assert.equal(m.drain().yaw,0);
  m.push(20,10,900);assert.equal(m.drain().yaw,0);
});
test('high-rate normal input preserves totals',()=>{
  const m=createMouseLook();m.reset(true,0);
  for(let i=0;i<8;i++)m.push(5,2,300+i);
  assert.deepEqual(m.drain(),{yaw:-.1,pitch:-.04});
});
for(const name of ['box-room','oriented-room'])test(`${name}: walk through the doorway in both directions`,()=>{
  const doc=JSON.parse(fs.readFileSync(new URL(`./levels/fixtures/${name}.nil.json`,import.meta.url)));
  const f=compileSceneField(doc),space=e3Space();
  let s={position:[0,-4,.3],velocity:[0,0,0],radius:doc.units.playerRadius,grounded:false};
  for(let i=0;i<240;i++)s=stepWalker(f,space,s,1/60,{want:[0,2,0]});
  assert.ok(s.position[1]>3.5,`stopped at y=${s.position[1]}`);
  for(let i=0;i<240;i++)s=stepWalker(f,space,s,1/60,{want:[0,-2,0]});
  assert.ok(s.position[1]<-3.5,`return stopped at y=${s.position[1]}`);
});
console.log(`${passed}/${passed+failed} editor input/route checks passed`);
process.exitCode=failed?1:0;
