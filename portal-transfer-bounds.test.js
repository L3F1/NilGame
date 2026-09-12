import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createConnectedGlobalPreview} from './app/connected-global-model.js';
import {e3S3TransferBounds} from './engine/geometry/portal-transfer-bounds.js';
import {interval,div,square,add} from './engine/geometry/float32-interval.js';
import {sphericalBallRootBounds} from './engine/geometry/spherical-root-bounds.js';
const document=JSON.parse(readFileSync('levels/fixtures/connected-three-geometries.nil.json','utf8'));
const world=createConnectedGlobalPreview(document,{experimentalH3:true}).world;
const gate=world.portals.find(g=>g.fromId==='flat-entry'),frame=gate.renderData();
const zero=[0,0,0],contains=(band,value)=>band[0]<=value&&value<=band[1];
const rotated=structuredClone(document);
const flat=rotated.baseScene.entities.find(e=>e.id==='flat-entry');
flat.position=[1,1,0];flat.forward=[-Math.SQRT1_2,-Math.SQRT1_2,0];
const sphere=rotated.coverRegions[0].entities.find(e=>e.id==='sphere-entry');
sphere.position=[.2,.1,0];sphere.forward=[Math.SQRT1_2,Math.SQRT1_2,0];
const other=createConnectedGlobalPreview(rotated,{experimentalH3:true}).world.portals.find(g=>g.fromId==='flat-entry');
let samples=0,worstWidth=0;
for(const gate of [world.portals.find(g=>g.fromId==='flat-entry'),other]){
const frame=gate.renderData();
for(const x of [-.45,-.2,0,.2,.45])for(const z of [-.45,0,.45]){
  const position=frame.center.map((v,i)=>v+2*frame.normal[i]+x*frame.right[i]+z*frame.up[i]);
  const raw=frame.normal.map((v,i)=>-v+.03*frame.right[i]-.02*frame.up[i]);
  const length=Math.hypot(...raw),direction=raw.map(v=>v/length);
  const input={position,direction,positionError:[1e-7,1e-7,1e-7],directionError:[1e-7,1e-7,1e-7],
    frame,frameError:0,curvatureRadius:8,maxDistance:10};
  const bounds=e3S3TransferBounds(input);assert.equal(bounds.status,'bounded');
  for(const sign of [-1,0,1]){
    // Perturb the input point inside its declared box, independently of the
    // interval execution. The existing metric/portal path is the reference.
    const p=position.map((v,i)=>v+sign*input.positionError[i]);
    const t=-p.reduce((sum,v,i)=>sum+(v-frame.center[i])*frame.normal[i],0)/direction.reduce((sum,v,i)=>sum+v*frame.normal[i],0),at=p.map((v,i)=>v+t*direction[i]);
    const exact=gate.transit(at),out=exact.carry(direction);
    assert.ok(contains(bounds.distance,t));
    for(let i=0;i<4;i++){
      assert.ok(contains(bounds.position[i],exact.position[i]),`position ${i}`);
      assert.ok(contains(bounds.direction[i],out[i]),`direction ${i}`);
      worstWidth=Math.max(worstWidth,bounds.position[i][1]-bounds.position[i][0]);
    }
    samples++;
  }
}
}
const base={position:[0,-2,0],direction:[0,1,0],positionError:zero,directionError:zero,
  frame,frameError:0,curvatureRadius:8,maxDistance:10};
assert.equal(e3S3TransferBounds(base).status,'bounded','Central crossing must avoid sinc singularity');
assert.equal(e3S3TransferBounds({...base,direction:[1,0,0]}).reason,'crossing-direction');
assert.equal(e3S3TransferBounds({...base,maxDistance:2}).reason,'crossing-range');
assert.equal(e3S3TransferBounds({...base,position:[.9,-2,0]}).reason,'aperture-rim');
assert.throws(()=>e3S3TransferBounds({...base,positionError:undefined}),/missing-input-error/);
assert.throws(()=>div(interval(1),interval(-1,1)),/zero-divisor/);
assert.ok(contains(square(interval(-1,1)),0));
assert.ok(contains(add(interval(1),interval(2)),3));
// Feed the propagated intervals directly into the previously landed root API.
// No per-ball tolerance: use interval radii for point, direction and encoding.
const bounded=e3S3TransferBounds(base),mid=v=>v.map(b=>(b[0]+b[1])/2);
const error=v=>v.map(b=>(b[1]-b[0])/2);
const mapped=gate.transit([0,0,0]),out=mapped.carry([0,1,0]);
const center=world.regions.get('sphere').space.step(mapped.position,out,3);
const centerBands=center.map(x=>interval(x));
const roots=sphericalBallRootBounds({position:mid(bounded.position),direction:mid(bounded.direction),
  positionError:error(bounded.position),directionError:error(bounded.direction),
  center:mid(centerBands),centerError:error(centerBands),radius:.6,radiusError:0,
  curvatureRadius:8,maxDistance:6});
assert.equal(roots.status,'roots');
for(const t of [2.4,3.6])assert.ok(roots.events.some(e=>e.lower<=t&&t<=e.upper));
console.log(`Portal transfer bounds: ${samples} reference crossings enclosed; center, rim, horizon and singular refusals; max position width ${worstWidth}`);
