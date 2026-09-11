import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createConnectedGlobalPreview} from './app/connected-global-model.js';
import {packConnectedWorld} from './engine/geometry/connected-shader.js';
const fixture=JSON.parse(fs.readFileSync('levels/fixtures/connected-global.nil.json','utf8'));
const spec={id:'bench-nook',radius:.9,
  a:{id:'flat-bench',regionId:'flat',position:[6,0,0],forward:[0,-1,0],up:[0,0,1]},
  b:{id:'sphere-nook',regionId:'sphere',chartId:'exit-chart',position:[1,1,0],forward:[1,0,0],up:[0,0,1]}};
let packet,refuseHost=false;
const model=createConnectedGlobalPreview(fixture,{installWorld:w=>{
  const candidate=packConnectedWorld(w);if(refuseHost)throw Error('host upload refused');packet=candidate;
}});
const json=()=>JSON.stringify(model.document());
function refuses(action,pattern){
  const before={doc:json(),world:model.world,state:model.state,packet,undo:model.canUndo,redo:model.canRedo};
  assert.throws(action,pattern);
  assert.equal(json(),before.doc);assert.equal(model.world,before.world);assert.equal(model.state,before.state);
  assert.equal(packet,before.packet);assert.equal(model.canUndo,before.undo);assert.equal(model.canRedo,before.redo);
}
const original=json(),position=[...model.state.position],forward=[...model.state.camera.forward];
assert.equal(model.addPortalPair(spec),true);
assert.equal(model.world.portals.length,6);
assert.deepEqual(model.state.position,position);assert.deepEqual(model.state.camera.forward,forward);
assert.equal(model.state.camera.space,model.world.regions.get('flat').space);
const created=json();spec.a.position[0]=8;assert.equal(json(),created);spec.a.position[0]=6;
model.undoEdit();assert.equal(json(),original);assert.equal(model.world.portals.length,4);
model.redoEdit();assert.equal(json(),created);
model.loadDocument(JSON.parse(original));model.loadDocument(JSON.parse(created));assert.equal(json(),created);
refuses(()=>model.addPortalPair(spec),/unique/);
model.undoEdit(); // original
for(const change of [
  s=>s.b.id=s.a.id,s=>s.id='north-chart',s=>s.b.chartId='north-landmark',
  s=>s.a.chartId=undefined,s=>s.radius=-1,s=>s.b.up=[1,0,0],
  s=>s.a.position=[0,-2,0], // current player and saved spawn
  s=>{s.b.chartId='north-chart';s.b.position=[1,0,0];}, // other region's spawn
]){const candidate=structuredClone(spec);change(candidate);refuses(()=>model.addPortalPair(candidate),/./);}
refuseHost=true;refuses(()=>model.addPortalPair(spec),/host upload refused/);refuseHost=false;
const swap=[{id:'enter-sphere',a:'flat-entry',b:'sphere-exit'},{id:'leave-sphere',a:'sphere-entry',b:'flat-return'}];
refuses(()=>model.reconnectPortals([swap[0]]),/already connected/);
refuses(()=>model.reconnectPortals([swap[0],swap[0]]),/duplicate/);
refuses(()=>model.reconnectPortals([{id:'missing',a:'flat-entry',b:'sphere-entry'}]),/Unknown connection/);
model.reconnectPortals(swap);assert.equal(model.world.portals.find(p=>p.fromId==='flat-entry').toId,'sphere-exit');
model.undoEdit();assert.equal(json(),original);model.redoEdit();
assert.equal(model.world.portals.find(p=>p.fromId==='flat-entry').toId,'sphere-exit');
model.undoEdit();
// The fifth pair exceeds the current eight-directed-portal budget. Even both
// new anchors must disappear on refusal, and the preceding undo remains usable.
model.addPortalPair(spec);
const fourth=structuredClone(spec);fourth.id='fourth';fourth.a.id='fourth-a';fourth.b.id='fourth-b';
fourth.a.position=[-6,0,0];fourth.b.chartId='south-chart';fourth.b.position=[0,0,0];
model.addPortalPair(fourth);
const fifth=structuredClone(fourth);fifth.id='fifth';fifth.a.id='fifth-a';fifth.b.id='fifth-b';
refuses(()=>model.addPortalPair(fifth),/./);
assert.equal(model.world.portals.length,8);model.undoEdit();assert.equal(model.world.portals.length,6);

// Nonempty base ownership: migrate one rewritten base pair, keep another base
// pair untouched, and exchange the displaced endpoint in the same transaction.
const base=structuredClone(fixture);
base.connections=[];
base.baseScene.connections=[{id:'local',kind:'portal',a:'flat-entry',b:'flat-return',velocity:'preserve-speed',scale:1}];
base.connections.push({id:'curved',kind:'portal',a:'sphere-entry',b:'sphere-exit',velocity:'preserve-speed',scale:1});
for(const [id,x] of [['local-a',-6],['local-b',6]])base.baseScene.entities.push({id,kind:'anchor',regionId:'flat',position:[x,0,0],radius:.9,forward:[0,1,0],up:[0,0,1]});
base.baseScene.connections.push({id:'untouched',kind:'portal',a:'local-a',b:'local-b',velocity:'preserve-speed',scale:1});
const migrated=createConnectedGlobalPreview(base,{installWorld:packConnectedWorld});
migrated.reconnectPortals([{id:'local',a:'flat-entry',b:'sphere-entry'},{id:'curved',a:'flat-return',b:'sphere-exit'}]);
assert.deepEqual(migrated.document().baseScene.connections.map(c=>c.id),['untouched']);
assert.equal(migrated.document().connections.find(c=>c.id==='local').b,'sphere-entry');
assert.equal(migrated.world.portals.find(p=>p.fromId==='flat-entry').toRegionId,'sphere');
migrated.undoEdit();assert.deepEqual(migrated.document().baseScene.connections.map(c=>c.id),['local','untouched']);
migrated.redoEdit();assert.deepEqual(migrated.document().baseScene.connections.map(c=>c.id),['untouched']);
console.log('portal authoring: create, atomic refusal, graph swaps, ownership migration, history, persistence and capacity passed');
