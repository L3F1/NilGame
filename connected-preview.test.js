import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createConnectedPreview } from './app/connected-preview-model.js';
const scene = JSON.parse(fs.readFileSync('levels/fixtures/connected-sight.nil.json'));
const preview = createConnectedPreview(scene);
const regions = new Set([preview.state.regionId]);
for (let i = 0; i < 28; i++) {
  preview.act('forward');
  const frame = preview.render(2, 2);
  assert.equal(frame.halted, false, `halted on step ${i}: ${frame.motion}`);
  regions.add(frame.regionId);
}
assert.deepEqual([...regions], ['entry', 'curve', 'far']);
for (let i = 0; i < 28; i++) preview.act('back');
assert.equal(preview.state.regionId, 'entry');
preview.act('reset');
assert.deepEqual(preview.state.position, [0, -3, 0]);
const originalRight=[...preview.state.camera.right];preview.act('left');
assert.ok(preview.state.camera.forward.reduce((sum,x,i)=>sum+x*originalRight[i],0)<0,'left button must turn left');
preview.act('reset');
const blocked = structuredClone(scene);
blocked.entities.push({id:'block-preview',regionId:'entry',kind:'box',position:[0,-2,0],halfExtent:[1,.1,1]});
const collision = createConnectedPreview(blocked);
for(let i=0;i<12;i++) collision.act('forward');
assert.equal(collision.state.regionId,'entry');
assert.ok(collision.state.position[1] < -2, 'obstacle must prevent entry');
console.log('connected preview: route, return, reset and obstacle passed');
