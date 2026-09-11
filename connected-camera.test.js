import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createConnectedPreview} from './app/connected-preview-model.js';
import {rollAgainst} from './engine/world/camera-frame.js';
const scene=JSON.parse(fs.readFileSync('levels/fixtures/connected-sight.nil.json'));
const model=createConnectedPreview(scene);
function upAt() {
  const {position:p,regionId}=model.state,r=model.world.regions.get(regionId);
  const floor=r.entities.find(e=>e.id===r.descriptor.floorId);
  const basis=r.space.frame(r.space.decode(floor.position));
  const pole=p.map((_,i)=>basis.reduce((s,b,j)=>s+b[i]*floor.up[j],0));
  const a=r.space.kind==='s3'?pole.reduce((s,x,i)=>s+x*p[i],0):0;
  return r.space.normalize(p,pole.map((x,i)=>x-a*p[i]));
}
function upright() {assert.ok(Math.abs(rollAgainst(model.state.camera,upAt()))<1e-9,'look/movement must not accumulate roll');}
for(let i=0;i<600;i++) {
  model.advance(1/60,[0,0,0],{yaw:.04*Math.cos(i/15),pitch:.04*Math.sin(i/15)});
  upright();
}
model.act('reset');
model.advance(0,[0,0,0],{pitch:.7});
for(let i=0;i<200;i++) {
  model.advance(0,[0,0,0],{yaw:.1});upright();
  assert.ok(Math.abs(Math.asin(model.state.camera.forward[2])-.7)<1e-10,'pure yaw preserves elevation');
}
for(let i=0;i<100;i++)model.advance(0,[0,0,0],{yaw:.2,pitch:.2});
assert.ok(Math.abs(Math.asin(model.state.camera.forward[2])-1.5)<1e-10,'constant input stays at pitch clamp');
model.act('reset');
const seen=new Set();
for(let i=0;i<260;i++){model.advance(1/60,[0,1,0]);seen.add(model.state.regionId);upright();assert.equal(model.halted,false);}
assert.deepEqual([...seen],['entry','curve','far']);
// Repeat the actual mouse-loop regression in the curved region as well.
model.act('reset');for(let i=0;i<12;i++)model.act('forward');
assert.equal(model.state.regionId,'curve');
for(let i=0;i<600;i++){model.advance(0,[0,0,0],{yaw:.04*Math.cos(i/15),pitch:.04*Math.sin(i/15)});upright();}
console.log('connected camera: upright loops in E3/S3, yaw, clamp, transported route passed');
