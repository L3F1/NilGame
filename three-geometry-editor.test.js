import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createConnectedGlobalPreview} from './app/connected-global-model.js';
const doc=JSON.parse(readFileSync('levels/fixtures/connected-three-geometries.nil.json','utf8'));
assert.throws(()=>createConnectedGlobalPreview(doc),/does not support h3/);
let reject=false,installs=0;
const model=createConnectedGlobalPreview(doc,{experimentalH3:true,installWorld:()=>{
  if(reject)throw Error('host refused candidate');installs++;
}});
for(let i=0;i<300&&model.state.regionId!=='hyperbolic';i++)model.advance(.04,[0,1,0]);
assert.equal(model.state.regionId,'hyperbolic');
assert.match(model.status(),/H3/);
assert.equal(model.halted,false);
const position=[...model.state.position],up=[...model.referenceUp];
const axes=['forward','right','up'].map(k=>[...model.state.camera[k]]);
function preserved(){
  assert.deepEqual(model.state.position,position);assert.deepEqual(model.referenceUp,up);
  ['forward','right','up'].forEach((k,j)=>axes[j].forEach((x,i)=>assert.ok(Math.abs(x-model.state.camera[k][i])<1e-12)));
  assert.equal(model.state.camera.space,model.world.regions.get('hyperbolic').space);
}
model.editEntities([{id:'h3-target',patch:{radius:.7}}]);preserved();
const edited=model.document();
assert.equal(model.undoEdit(),true);preserved();
assert.equal(model.redoEdit(),true);preserved();
assert.deepEqual(model.document(),edited);
assert.equal(model.loadDocument(JSON.parse(JSON.stringify(edited))),false);
model.addBall({id:'h3-authored',regionId:'hyperbolic',position:[2,3,0],radius:.4});preserved();
model.removeBall('h3-authored');preserved();
function refusal(action,pattern){
  const world=model.world,state=model.state,data=model.document(),history=[model.canUndo,model.canRedo],count=installs;
  assert.throws(action,pattern);
  assert.equal(model.world,world);assert.equal(model.state,state);assert.deepEqual(model.document(),data);
  assert.deepEqual([model.canUndo,model.canRedo],history);assert.equal(installs,count);
}
refusal(()=>model.editEntities([{id:'h3-target',patch:{radius:8}}]),/Spawn h3-spawn overlaps authored solid/);
reject=true;
refusal(()=>model.editEntities([{id:'h3-target',patch:{radius:.8}}]),/host refused/);
reject=false;
model.advance(.04,[0,1,0],{yaw:.1,pitch:.1});
assert.equal(model.halted,false);
assert.notDeepEqual(model.state.position,position);
console.log('Three-geometry editor: H3 traversal, edits, camera preservation, history, persistence and atomic refusals passed');
