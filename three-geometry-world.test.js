import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileConnectedCoverWorld} from './engine/world/connected-cover-world.js';
import {traceRegionSight} from './engine/world/region-sight.js';
import {moveRegionProbe} from './engine/world/region-motion.js';
const doc=JSON.parse(readFileSync('levels/fixtures/connected-three-geometries.nil.json','utf8'));
const opts={experimentalH3:true},world=compileConnectedCoverWorld(doc,opts);
assert.throws(()=>compileConnectedCoverWorld(doc),/does not support h3/);
assert.throws(()=>compileConnectedCoverWorld(doc,{experimentalH3:'yes'}),/Invalid H3/);
assert.throws(()=>world.renderData(),/H3 region rendering/);
assert.equal(world.regions.get('sphere').space.coverage,'s3-cover');
assert.deepEqual([...world.regions.values()].map(r=>r.space.kind).sort(),['e3','h3','s3']);
const start=world.spawn('flat'),ray={regionId:start.regionId,position:start.position,direction:start.camera.forward};
const sight=traceRegionSight(world,ray,{maxDistance:60});
assert.equal(sight.status,'hit',sight.reason);assert.equal(sight.regionId,'hyperbolic');
assert.equal(sight.query.owner,'h3-target');assert.equal(sight.crossings.length,2);
assert.ok(Math.abs(sight.distance-(2+1.5*Math.PI*8+2.4))<1e-8);
let state=start,antipode=false,visited=['flat'];
for(let i=0;i<140;i++){
 const r=moveRegionProbe(world,{...state,velocity:state.camera.forward.map(x=>x*4)},.1);
 assert.ok(['complete','stopped'].includes(r.status),`${r.status}/${r.detail}`);
 state=r.state;
 if(state.regionId!==visited.at(-1))visited.push(state.regionId);
 if(state.regionId==='sphere'&&state.position[3]<-.999)antipode=true;
 if(visited.length===3)break;
}
assert.deepEqual(visited,['flat','sphere','hyperbolic']);assert.ok(antipode);
// Return through the same portals with the full carried frame still owned.
const returned=['hyperbolic'];
for(let i=0;i<140;i++){
 const r=moveRegionProbe(world,{...state,velocity:state.camera.forward.map(x=>-x*4)},.1);
 assert.ok(['complete','stopped'].includes(r.status),`${r.status}/${r.detail}`);
 state=r.state;
 if(state.regionId!==returned.at(-1))returned.push(state.regionId);
 if(returned.length===3)break;
}
assert.deepEqual(returned,['hyperbolic','sphere','flat']);
const restored=compileConnectedCoverWorld(JSON.parse(JSON.stringify(world.document())),opts);
assert.deepEqual(restored.document(),world.document());
const again=traceRegionSight(restored,ray,{maxDistance:60});
assert.equal(again.query.owner,sight.query.owner);assert.equal(again.distance,sight.distance);
console.log('Three geometry world: saved E3/full-S3/H3, antipode passage, forward/return movement and sight, gates and persistence passed');
