import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createConnectedGlobalPreview} from './app/connected-global-model.js';
import {removeConnectedPortalPair} from './engine/world/connected-cover-edit.js';
import {packConnectedWorld} from './engine/geometry/connected-shader.js';
const fixture=JSON.parse(fs.readFileSync('levels/fixtures/connected-global.nil.json','utf8'));
let packet,reject=false;
const model=createConnectedGlobalPreview(fixture,{installWorld:w=>{
  const next=packConnectedWorld(w);if(reject)throw Error('upload refused');packet=next;
}});
const json=()=>JSON.stringify(model.document());
const original=json(),state=model.state;
function refuses(action,pattern){
  const before=[json(),model.world,model.state,packet,model.canUndo,model.canRedo];
  assert.throws(action,pattern);
  assert.deepEqual([json(),model.world,model.state,packet,model.canUndo,model.canRedo],before);
  assert.equal(model.world,before[1]);assert.equal(model.state,before[2]);assert.equal(packet,before[3]);
}
refuses(()=>model.removePortalPair('flat-entry'),/connection/);
reject=true;refuses(()=>model.removePortalPair('enter-sphere'),/upload refused/);reject=false;
model.removePortalPair('enter-sphere');
assert.equal(model.world.portals.length,2);
assert.deepEqual(model.state.position,state.position);assert.deepEqual(model.state.camera.forward,state.camera.forward);
assert.deepEqual(model.state.camera.up,state.camera.up);
assert.deepEqual(model.document().connections.map(c=>c.id),['leave-sphere']);
assert.ok(!model.document().baseScene.entities.some(e=>e.id==='flat-entry'));
assert.ok(!model.document().coverRegions[0].entities.some(e=>e.id==='sphere-entry'));
const removed=json();model.undoEdit();assert.equal(json(),original);
refuses(()=>model.removePortalPair('missing'),/connection/);
model.redoEdit();assert.equal(json(),removed);
model.loadDocument(JSON.parse(original));model.loadDocument(JSON.parse(removed));assert.equal(json(),removed);
model.removePortalPair('leave-sphere');assert.equal(model.world.portals.length,0);
assert.ok(model.renderGuide().nearest===null);
const noExitWorld=model.world,noExitState=model.state;
assert.throws(()=>model.act('approach-exit'),/no sphere-exit/);
assert.equal(model.world,noExitWorld);assert.equal(model.state,noExitState);
model.undoEdit();assert.equal(json(),removed);model.undoEdit();assert.equal(json(),original);

// Current SAVED endpoints after reconnection, not original endpoints or UI draft.
model.reconnectPortals([{id:'enter-sphere',a:'flat-entry',b:'sphere-exit'},{id:'leave-sphere',a:'sphere-entry',b:'flat-return'}]);
model.removePortalPair('enter-sphere');
assert.ok(model.document().coverRegions[0].entities.some(e=>e.id==='sphere-entry'));
assert.ok(!model.document().coverRegions[0].entities.some(e=>e.id==='sphere-exit'));
assert.equal(model.world.portals.find(p=>p.fromId==='sphere-entry').toId,'flat-return');

// Base-owned connection and two anchors in the same entity list.
const base=structuredClone(fixture);base.connections=[];
base.baseScene.connections=[{id:'local',kind:'portal',a:'flat-entry',b:'flat-return',velocity:'preserve-speed',scale:1}];
const local=createConnectedGlobalPreview(base,{installWorld:packConnectedWorld});
local.removePortalPair('local');assert.equal(local.document().baseScene.connections.length,0);
assert.ok(local.document().baseScene.entities.every(e=>e.kind!=='anchor'));
assert.equal(local.document().coverRegions[0].entities.filter(e=>e.kind==='anchor').length,2);
local.undoEdit();assert.equal(local.document().baseScene.connections[0].id,'local');

// Defensive helper checks must not silently cascade on malformed input.
for(const mutate of [
  d=>d.connections.push({...d.connections[1],id:'extra',a:'flat-entry'}),
  d=>d.baseScene.entities.push({id:'reference',kind:'ball',target:'flat-entry'}),
  d=>d.baseScene.entities.find(e=>e.id==='flat-entry').kind='spawn',
]){const doc=structuredClone(fixture);mutate(doc);const saved=JSON.stringify(doc);
  assert.throws(()=>removeConnectedPortalPair(doc,'enter-sphere'),/referenced|anchors/);
  assert.equal(JSON.stringify(doc),saved);}

// Removing a pair is allowed while standing in its region, but restoring an
// aperture through the CURRENT centre is not. Refusal must retain undo authority.
const restore=createConnectedGlobalPreview(fixture,{installWorld:packConnectedWorld});
restore.removePortalPair('enter-sphere');
for(let i=0;i<8;i++)restore.act('forward');
assert.ok(Math.abs(restore.state.position[1])<1e-9);
const before=restore.state;
assert.throws(()=>restore.undoEdit(),/player on a portal aperture/);
assert.equal(restore.state,before);assert.equal(restore.canUndo,true);
restore.act('back');restore.undoEdit();assert.equal(restore.world.portals.length,4);
// Reorientation uses the same transaction and preserves the partner/frame pose.
assert.throws(()=>restore.editEntities([{id:'flat-entry',patch:{forward:[1,0,0],up:[0,0,1]}}]),/player on a portal aperture/);
restore.act('spawn-flat');
const partner=restore.document().coverRegions[0].entities.find(e=>e.id==='sphere-entry');
const pose=restore.state.camera;
restore.editEntities([{id:'flat-entry',patch:{forward:[1,0,0],up:[0,0,1]}}]);
assert.deepEqual(restore.document().coverRegions[0].entities.find(e=>e.id==='sphere-entry'),partner);
assert.deepEqual(restore.state.camera.forward,pose.forward);assert.deepEqual(restore.state.camera.up,pose.up);
assert.deepEqual(restore.world.portals.find(p=>p.fromId==='flat-entry').normal,[1,0,0]);
console.log('Portal removal: saved graph, both ownerships, references, zero pairs, upload/history safety and reorientation passed');
