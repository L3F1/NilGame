import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createConnectedGlobalPreview} from './app/connected-global-model.js';
import {packConnectedWorld} from './engine/geometry/connected-shader.js';
const doc=JSON.parse(fs.readFileSync('levels/fixtures/connected-global.nil.json'));
let installed=0,refuseHost=false;
const model=createConnectedGlobalPreview(doc,{installWorld:next=>{
  packConnectedWorld(next);if(refuseHost)throw Error('simulated host refusal');installed++;
}});
const text=()=>JSON.stringify(model.document()),position=()=>[...model.state.position];
const original=text();
model.act('spawn-sphere');model.advance(.04,[.3,1,.2],{yaw:.3,pitch:.2});
const before=position(),camera=model.state.camera,up=[...model.referenceUp];
const edit=radius=>model.editEntities([{id:'north-landmark',patch:{radius}}]);
assert.equal(edit(.7),true);assert.equal(installed,1);assert.equal(model.canUndo,true);
assert.deepEqual(position(),before,'edit must not reset or relocate the player');
assert.deepEqual(model.referenceUp,up,'recompile does not transport reference up');
for(const key of ['forward','up','right'])assert.ok(Math.hypot(...camera[key].map((x,i)=>x-model.state.camera[key][i]))<1e-12);
assert.equal(model.state.camera.space,model.world.regions.get('sphere').space,'camera belongs to newly compiled region');
const edited=text();assert.notEqual(edited,original);
assert.equal(model.undoEdit(),true);assert.equal(text(),original);assert.deepEqual(position(),before);
assert.equal(model.redoEdit(),true);assert.equal(text(),edited);assert.deepEqual(position(),before);
assert.equal(model.loadDocument(JSON.parse(edited)),false,'no-op reload adds no history');
const detached=model.document();detached.coverRegions[0].entities[0].position[0]=999;
assert.equal(text(),edited,'document accessor is a detached snapshot');
function refused(fn,pattern){
  const snapshot=text(),world=model.world,state=model.state,history=[model.canUndo,model.canRedo],count=installed;
  assert.throws(fn,pattern);assert.equal(text(),snapshot);assert.equal(model.world,world);assert.equal(model.state,state);
  assert.deepEqual([model.canUndo,model.canRedo],history);assert.equal(installed,count);
}
refused(()=>edit(-1),/radius/);
refused(()=>edit(.9),/angular radius/); // CPU-valid, unsupported GPU subset.
refused(()=>model.editEntities([{id:'north-landmark',patch:{chartId:'south-chart'}}]),/conversion/);
refused(()=>model.editEntities([{id:'north-landmark',patch:{kind:'anchor'}}]),/conversion/);
refused(()=>model.editEntities([{id:'north-landmark',patch:{radius:.6}},{id:'north-landmark',patch:{radius:.7}}]),/duplicate/);
refuseHost=true;refused(()=>edit(.65),/host refusal/);refuseHost=false;
// Failure on undo must retain its original target and allow retry.
refuseHost=true;refused(()=>model.undoEdit(),/host refusal/);refuseHost=false;
model.undoEdit();assert.equal(text(),original);assert.equal(model.canRedo,true);
edit(.65);assert.equal(model.canRedo,false,'new edit discards redo only after success');
// Paired aperture radii must be one transaction; a single endpoint is refused.
refused(()=>model.editEntities([{id:'sphere-entry',patch:{radius:1}}]),/radii|radius/);
model.editEntities([{id:'sphere-entry',patch:{radius:.95}},{id:'flat-entry',patch:{radius:.95}}]);
assert.equal(model.world.portals.find(p=>p.fromId==='sphere-entry').radius,.95);
model.undoEdit();assert.equal(model.world.portals.find(p=>p.fromId==='sphere-entry').radius,.9);
// Place a ball on the current body, with the authored spawn still clear.
model.act('spawn-flat');for(let i=0;i<10;i++)model.advance(.04,[1,0,0]);
refused(()=>model.editEntities([{id:'flat-target',patch:{position:position()}}]),/player clearance/);
refused(()=>model.editEntities([{id:'flat-target',patch:{position:[0,-2,0]}}]),/spawn|Spawn/);
refused(()=>model.editEntities([{id:'flat-entry',patch:{position:position()}}]),/aperture/);
refused(()=>model.editEntities([{id:'sphere-spawn',patch:{position:[0,0,0]}}]),/aperture/);
const radiusChange=model.document();radiusChange.coverRegions[0].geometry.curvatureRadius=9;
refused(()=>model.loadDocument(radiusChange),/geometry|chart/);
// A full document load is atomic and undoable, preserving world identities.
model.loadDocument(JSON.parse(original));assert.equal(text(),original);assert.equal(model.canUndo,true);
model.undoEdit();assert.notEqual(text(),original);model.redoEdit();assert.equal(text(),original);
// Serialize after real edits; execute both crossings after a reload/reset.
model.act('spawn-flat');model.loadDocument(JSON.parse(text()));
const route=['flat'];
for(let i=0;i<1400;i++){
  model.advance(1/60,[0,1,0]);assert.equal(model.halted,false,model.motion);
  if(model.state.regionId!==route.at(-1))route.push(model.state.regionId);
  if(route.length===3)break;
}
assert.deepEqual(route,['flat','sphere','flat']);
// A convenience placement is not permission to put the body inside edited terrain.
model.editEntities([{id:'return-landmark',patch:{position:[0,-2,0]}}]);
refused(()=>model.act('approach-exit'),/placement clearance/);
model.undoEdit();
// Existing domain halt cannot be erased by recompilation or history.
model.act('spawn-flat');model.look({yaw:Math.PI});
for(let i=0;i<400&&!model.halted;i++)model.advance(.04,[0,1,0]);
assert.equal(model.halted,true);
refused(()=>edit(.7),/Reset/);refused(()=>model.loadDocument(JSON.parse(original)),/Reset/);
console.log('Connected editor: atomic properties/history/load, pose ownership, host/clearance refusals and reloaded two-portal route passed');
