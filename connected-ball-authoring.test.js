import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createConnectedGlobalPreview} from './app/connected-global-model.js';
import {packConnectedWorld} from './engine/geometry/connected-shader.js';
const fixture=JSON.parse(fs.readFileSync('levels/fixtures/connected-global.nil.json'));
let packed;
const model=createConnectedGlobalPreview(fixture,{installWorld:w=>{packed=packConnectedWorld(w);}});
const saved=()=>JSON.stringify(model.document());
const original=saved(),originalState=model.state;
function refusal(fn,pattern){
  const state=model.state,world=model.world,doc=saved(),history=[model.canUndo,model.canRedo],packet=packed;
  assert.throws(fn,pattern);assert.equal(model.state,state);assert.equal(model.world,world);
  assert.equal(saved(),doc);assert.deepEqual([model.canUndo,model.canRedo],history);assert.equal(packed,packet);
}
const spec={id:'authored-ball',regionId:'sphere',chartId:'south-chart',position:[3,2,0],radius:.6};
assert.equal(model.addBall(spec),true);
assert.deepEqual(model.state.position,originalState.position);
assert.ok(packed.primitiveIds.includes(spec.id));
// Independent spherical exponential map in the EXPLICIT selected author chart.
const chart=fixture.coverRegions[0].charts.find(c=>c.id==='south-chart');
const length=Math.hypot(...spec.position),angle=length/8;
const expected=chart.center.map((x,k)=>x*Math.cos(angle)+chart.basis.reduce((s,v,i)=>s+v[k]*spec.position[i]/length,0)*Math.sin(angle));
const actual=model.world.regions.get('sphere').balls.find(b=>b.id===spec.id).center;
assert.ok(Math.hypot(...actual.map((x,i)=>x-expected[i]))<1e-12,'creation must use selected chart, not always north');
const added=saved();spec.position[0]=999;assert.equal(saved(),added,'caller cannot mutate new entity');
refusal(()=>model.addBall({...spec,position:[3,2,0]}),/unique/);
for(const id of ['flat','north-chart','connected-global','enter-sphere'])
  refusal(()=>model.addBall({...spec,id,position:[3,2,0]}),/unique/);
for(const chartId of [undefined,'missing-chart'])refusal(()=>model.addBall({...spec,id:'bad-chart',chartId,position:[3,2,0]}),/chart/);
refusal(()=>model.addBall({id:'wrong-region',regionId:'unknown',position:[3,2,0],radius:.6}),/region/);
refusal(()=>model.addBall({id:'flat-chart',regionId:'flat',chartId:'north-chart',position:[3,2,0],radius:.6}),/must not/);
refusal(()=>model.addBall({id:'invalid-size',regionId:'sphere',chartId:'north-chart',position:[3,2,0],radius:.9}),/angular radius/);
refusal(()=>model.addBall({id:'body-overlap',regionId:'flat',position:[...model.state.position],radius:.6}),/clearance|spawn/i);
for(const id of ['flat-spawn','sphere-entry'])refusal(()=>model.removeBall(id),/protected/);
refusal(()=>model.removeBall('unknown'),/Unknown/);
model.removeBall('authored-ball');assert.equal(saved(),original);assert.ok(!packed.primitiveIds.includes('authored-ball'));
model.undoEdit();assert.equal(saved(),added);model.redoEdit();assert.equal(saved(),original);
model.undoEdit();const loaded=createConnectedGlobalPreview(JSON.parse(saved()));assert.equal(JSON.stringify(loaded.document()),added);
model.addBall({id:'flat-new',regionId:'flat',position:[4,4,0],radius:.6});
assert.equal(Object.hasOwn(model.document().baseScene.entities.find(e=>e.id==='flat-new'),'chartId'),false);
assert.equal(model.canRedo,false);
// The next over-capacity creation refuses without consuming a history entry.
while(packed.primitiveIds.length<16){const n=packed.primitiveIds.length;
  model.addBall({id:`capacity-${n}`,regionId:'sphere',chartId:'north-chart',position:[3+n*.02,2,0],radius:.6});}
refusal(()=>model.addBall({id:'one-too-many',regionId:'sphere',chartId:'north-chart',position:[3,2,0],radius:.6}),/capacity/);
// Do not silently delete a referenced solid or a modifier masquerading as a ball.
const csg=structuredClone(fixture);
csg.baseScene.entities.push({id:'target-cut',kind:'ball',regionId:'flat',position:[3,3,0],radius:.2,op:'subtract',target:'flat-target'});
const scoped=createConnectedGlobalPreview(csg);
assert.throws(()=>scoped.removeBall('flat-target'),/referenced/);
assert.throws(()=>scoped.removeBall('target-cut'),/protected/);
assert.equal(scoped.canUndo,false);
// Undo is also a live safety check: moving into a deleted ball's old space must
// not make its restoration materialize around the player or consume history.
const restore=createConnectedGlobalPreview(fixture);
restore.addBall({id:'restore-test',regionId:'flat',position:[1.6,-2,0],radius:.2});
restore.removeBall('restore-test');
for(let i=0;i<10;i++)restore.advance(.04,[1,0,0]);
const clearWorld=restore.world,clearState=restore.state;
assert.throws(()=>restore.undoEdit(),/player clearance/);
assert.equal(restore.world,clearWorld);assert.equal(restore.state,clearState);assert.equal(restore.canUndo,true);
for(let i=0;i<20;i++)restore.advance(.04,[-1,0,0]);
restore.undoEdit();assert.ok(restore.document().baseScene.entities.some(e=>e.id==='restore-test'));
console.log('Connected ball authoring: explicit chart geometry, creation/removal/history, persistence, identity/clearance/capacity and protected references passed');
