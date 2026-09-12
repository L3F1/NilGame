import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createConnectedGlobalPreview} from './app/connected-global-model.js';
import {e3PrimaryRayBounds} from './engine/geometry/primary-ray-bounds.js';
import {e3S3TransferBounds} from './engine/geometry/portal-transfer-bounds.js';

// MUSE-75: independent CPU audit of the composed primary camera -> E3/S3
// transfer path against the compiled gallery portal frame.
//
// Independent truth per (camera frame, pixel): pinhole ray from an image
// plane at unit forward distance with tan(35deg) half-height, Euclidean
// normalized; intersect the source aperture plane; compiled
// gate.transit(at); carried direction normalized in the destination S3
// metric at arrival. The bounds path is e3PrimaryRayBounds followed by
// e3S3TransferBounds with midpoint / component half-width conversion of the
// primary direction bands. Only interval containment is asserted, never
// closeness. Refusals (e.g. aperture-rim) are counted, not weakened, and no
// confident miss or whole-scene claim is inferred from any single root.
function mulberry32(seed){
  let a=seed>>>0;
  return ()=>{
    a|=0;a=(a+0x6D2B79F5)|0;
    let t=Math.imul(a^(a>>>15),1|a);
    t=(t+Math.imul(t^(t>>>7),61|t))^t;
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
const rand=mulberry32(757500);
const pick=(lo,hi)=>lo+(hi-lo)*rand();
const contains=(band,value)=>band[0]<=value&&value<=band[1];
const inBox=(nominal,errors,actual)=>nominal.every((v,i)=>Math.abs(actual[i]-v)<=errors[i]);
const sub3=(a,b)=>a.map((v,i)=>v-b[i]);
const dot3=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const mid=bands=>bands.map(([lo,hi])=>(lo+hi)/2);
const halfWidth=bands=>bands.map(([lo,hi])=>(hi-lo)/2);

const document=JSON.parse(readFileSync('levels/fixtures/connected-three-geometries-gallery.nil.json','utf8'));
const world=createConnectedGlobalPreview(document,{experimentalH3:true}).world;
const gate=world.portals.find(g=>g.fromId==='flat-entry');
const dest=world.regions.get(gate.toRegionId).space;
assert.equal(dest.kind,'s3','gallery flat-entry destination metric must be S3');
const frame=gate.renderData();

// Independent pinhole construction: image plane at unit forward distance,
// half-height tan(35deg). Deliberately NOT the engine's 1/tan focal scale;
// the two forms agree only when both describe the same ray.
const TAN35=Math.tan(35*Math.PI/180);
const WIDTH=160,HEIGHT=120;
function truthRay(camera,pixel){
  const u=(2*pixel[0]-WIDTH)/HEIGHT*TAN35,v=(2*pixel[1]-HEIGHT)/HEIGHT*TAN35;
  const raw=camera.forward.map((f,k)=>f+camera.right[k]*u+camera.up[k]*v);
  const length=Math.hypot(...raw);
  return raw.map(x=>x/length);
}

// Camera station on the entering side of the gallery aperture; four
// yaw-rotated frames (all nonzero rotation) facing it.
const CAMPOS=[0,-2,0];
const yawCamera=yaw=>({forward:[Math.sin(yaw),Math.cos(yaw),0],
  right:[Math.cos(yaw),-Math.sin(yaw),0],up:[0,0,1]});
const FRAMES=[-0.2,-0.07,0.07,0.2].map(yawCamera);
const CAM_ERR={forward:[2e-4,2e-4,2e-4],right:[2e-4,2e-4,2e-4],up:[2e-4,2e-4,2e-4]};
const POS_ERR=[1e-6,1e-6,1e-6];
const PIXELS=[];
for(const fx of [0.3,0.4,0.6,0.7])for(const fy of [0.3,0.4,0.6])PIXELS.push([fx*WIDTH,fy*HEIGHT]);

let candidates=0,bounded=0,refused=0,perturbed=0,nonunitBasis=0;
const refusals={};
for(const camera of FRAMES){
  for(const pixel of PIXELS){
    candidates++;
    const rayBands=e3PrimaryRayBounds({camera,cameraError:CAM_ERR,width:WIDTH,height:HEIGHT,pixel});
    const transfer=e3S3TransferBounds({position:CAMPOS,positionError:POS_ERR.slice(),
      direction:mid(rayBands),directionError:halfWidth(rayBands),
      frame,frameError:0,curvatureRadius:dest.curvatureRadius,maxDistance:10});
    // Nominal truth ray drives the crossing; output normalization matches
    // the transfer API contract (normalize(transported)).
    const d=truthRay(camera,pixel);
    d.forEach((v,k)=>assert.ok(contains(rayBands[k],v),`nominal primary ray ${k} not enclosed`));
    const denom=dot3(d,frame.normal);
    assert.ok(denom<-1e-6,'nominal ray must stay entering');
    const t=-dot3(sub3(CAMPOS,frame.center),frame.normal)/denom;
    const at=CAMPOS.map((x,i)=>x+t*d[i]);
    const exact=gate.transit(at),out=dest.normalize(exact.position,exact.carry(d));
    if(transfer.status!=='bounded'){
      refused++;
      refusals[transfer.reason]=(refusals[transfer.reason]??0)+1;
      continue;
    }
    assert.ok(contains(transfer.distance,t),'nominal distance not enclosed');
    for(let i=0;i<4;i++){
      assert.ok(contains(transfer.position[i],exact.position[i]),`nominal position ${i} not enclosed`);
      assert.ok(contains(transfer.direction[i],out[i]),`nominal direction ${i} not enclosed`);
    }
    bounded++;
    // Simultaneous camera-component + station perturbations inside their
    // declared boxes. The perturbed basis is used raw: normalizing it would
    // change the input, so it is never normalized (only the ray OUTPUT and
    // the carried transfer output are normalized, per transfer policy).
    for(let k=0;k<3;k++){
      const pc=Object.fromEntries(Object.entries(camera).map(([key,v])=>
        [key,v.map((x,i)=>x+pick(-CAM_ERR[key][i],CAM_ERR[key][i]))]));
      const pp=CAMPOS.map((x,i)=>x+pick(-POS_ERR[i],POS_ERR[i]));
      for(const key of ['forward','right','up'])
        assert.ok(inBox(camera[key],CAM_ERR[key],pc[key]),'perturbed camera left its error box');
      assert.ok(inBox(CAMPOS,POS_ERR,pp),'perturbed station left its error box');
      if(['forward','right','up'].some(key=>Math.abs(Math.hypot(...pc[key])-1)>1e-12))nonunitBasis++;
      const pd=truthRay(pc,pixel);
      pd.forEach((v,i)=>assert.ok(contains(rayBands[i],v),`perturbed primary ray ${i} not enclosed`));
      const pdenom=dot3(pd,frame.normal);
      assert.ok(pdenom<-1e-6,`perturbed ray must stay entering (denom ${pdenom})`);
      const pt=-dot3(sub3(pp,frame.center),frame.normal)/pdenom;
      const pat=pp.map((x,i)=>x+pt*pd[i]);
      const pexact=gate.transit(pat),pout=dest.normalize(pexact.position,pexact.carry(pd));
      assert.ok(contains(transfer.distance,pt),'perturbed distance not enclosed');
      for(let i=0;i<4;i++){
        assert.ok(contains(transfer.position[i],pexact.position[i]),`perturbed position ${i} not enclosed`);
        assert.ok(contains(transfer.direction[i],pout[i]),`perturbed direction ${i} not enclosed`);
      }
      perturbed++;
    }
  }
}
assert.ok(bounded>=30,`expected at least 30 bounded crossings, saw ${bounded}/${candidates}`);
assert.ok(nonunitBasis>0,`expected unnormalized perturbed bases (saw ${nonunitBasis}/${perturbed})`);
console.log(`Primary transfer truth (MUSE-75): ${bounded}/${candidates} nominal crossings enclosed across ${FRAMES.length} rotated frames; ${perturbed} simultaneous camera+station perturbations enclosed; refused ${refused} ${JSON.stringify(refusals)}; unnormalized perturbed bases ${nonunitBasis}/${perturbed}`);
