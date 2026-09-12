import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createConnectedGlobalPreview} from './app/connected-global-model.js';
const scene=JSON.parse(readFileSync('levels/fixtures/connected-three-geometries-gallery.nil.json','utf8'));
const model=createConnectedGlobalPreview(scene,{experimentalH3:true});
const clearance=()=>{
  const region=model.world.regions.get(model.state.regionId);
  assert.ok(region.field.distance(model.state.position)-model.state.radius>0,'Route intersects a solid');
  assert.equal(model.halted,false);
};
const forward=['flat'];
for(let i=0;i<400&&model.state.regionId!=='hyperbolic';i++){
  model.advance(.04,[0,1,0]);clearance();
  if(forward.at(-1)!==model.state.regionId)forward.push(model.state.regionId);
}
assert.equal(forward.join(),'flat,sphere,hyperbolic');
for(let i=0;i<3;i++){model.advance(.04,[0,1,0]);clearance();}
model.advance(0,[0,0,0],{yaw:Math.PI,pitch:0});
const back=['hyperbolic'];
for(let i=0;i<400&&model.state.regionId!=='flat';i++){
  model.advance(.04,[0,1,0]);clearance();
  if(back.at(-1)!==model.state.regionId)back.push(model.state.regionId);
}
assert.equal(back.join(),'hyperbolic,sphere,flat');
const view=model.pixelSight(1,1,0,0,64);
assert.equal(view.status,'hit');
assert.equal(view.query.owner,'flat-return-landmark','Return should face a visible destination');
console.log('Three-gallery: both routes remain clear and the E3 return faces its landmark');
