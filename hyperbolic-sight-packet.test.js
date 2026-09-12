import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {runProbe} from './tools/connected-sight-probe.js';
import {compileHyperbolicRegionWorld} from './engine/world/region-world.js';
import {traceRegionSight} from './engine/world/region-sight.js';
const dir=mkdtempSync(join(tmpdir(),'nil-h3-packet-'));
try{
 const settings={scene:'levels/fixtures/connected-h3-cpu.nil.json',runtime:'experimental-h3',
   pose:'h3-entry',width:33,height:25,range:6,rays:'all',out:join(dir,'view.png'),packet:join(dir,'view.json')};
 for(const pose of ['h3-entry','h3-landmark']){
  const {packet,sample}=runProbe({...settings,pose});
  const saved=JSON.parse(readFileSync(settings.packet,'utf8'));
  assert.equal(saved.rays.length,825);assert.equal(saved.runtime,'experimental-h3');
  assert.ok(saved.counts.status.hit>0,'reference must actually see a surface');
  const world=compileHyperbolicRegionWorld(saved.scene.document);
  assert.deepEqual(world.document(),packet.scene.document);
  for(const ray of saved.rays){
   const r=traceRegionSight(world,{regionId:saved.pose.regionId,position:saved.pose.camera.position,direction:ray.direction},
     {maxDistance:saved.sampling.maxDistance,maxWork:saved.sampling.maxWork});
   assert.equal(r.status,ray.status);assert.equal(r.regionId,ray.regionId);assert.equal(r.distance,ray.distance);
   if(r.status==='hit'){
    // JSON represents -0 as 0; compare the serialized numerical contract.
    assert.equal(JSON.stringify(r.position),JSON.stringify(ray.hitPoint));
    assert.equal(JSON.stringify(r.query.normal),JSON.stringify(ray.hitNormal));
   }
  }
  if(pose==='h3-entry')assert.ok(saved.rays.some(r=>r.crossings.length===2),'must cover both portals');
  assert.equal(sample.rays.length,saved.rays.length);
 }
 assert.throws(()=>runProbe({...settings,runtime:'standard'}),/does not support h3/);
 assert.throws(()=>runProbe({...settings,runtime:'h3'}),/Unknown probe runtime/);
 assert.throws(()=>runProbe({...settings,rays:'none'}),/Unknown ray record/);
}finally{
 // One shell/runtime, checked absolute target confined to the named temp root.
 assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));
 rmSync(dir,{recursive:true,force:true});
}
console.log('H3 diagnostic packet: both portal traversal and H3 camera view replay all 825 pixel records exactly; unsupported runtime gated');
