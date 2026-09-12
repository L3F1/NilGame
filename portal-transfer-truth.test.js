import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createConnectedGlobalPreview} from './app/connected-global-model.js';
import {e3S3TransferBounds} from './engine/geometry/portal-transfer-bounds.js';

// MUSE-74 (rev, lead oracle correction): seeded audit of e3S3TransferBounds
// against the existing compiled portal transit. Simultaneous point AND
// direction perturbations are drawn inside the declared component error boxes;
// the raw perturbed direction v stays in-box and nonunit and is used as-is
// for the aperture plane crossing. The reference interval API returns a
// NORMALIZED outgoing direction (normalize(transported)), so the oracle must
// normalize exact.carry(v) with the destination S3 metric at exact.position
// before checking output containment. That normalization is output policy
// matching the API contract: it never moves the input v, which remains inside
// its declared box. Only interval containment is asserted, never closeness.
function mulberry32(seed){
  let a=seed>>>0;
  return ()=>{
    a|=0;a=(a+0x6D2B79F5)|0;
    let t=Math.imul(a^(a>>>15),1|a);
    t=(t+Math.imul(t^(t>>>7),61|t))^t;
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
const rand=mulberry32(747400);
const pick=(lo,hi)=>lo+(hi-lo)*rand();
const contains=(band,value)=>band[0]<=value&&value<=band[1];
const inBox=(nominal,errors,actual)=>nominal.every((v,i)=>Math.abs(actual[i]-v)<=errors[i]);
const sub3=(a,b)=>a.map((v,i)=>v-b[i]);
const dot3=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);

function loadGate(mutator){
  const document=JSON.parse(readFileSync('levels/fixtures/connected-three-geometries.nil.json','utf8'));
  if(mutator)mutator(document);
  const world=createConnectedGlobalPreview(document,{experimentalH3:true}).world;
  const gate=world.portals.find(g=>g.fromId==='flat-entry');
  const dest=world.regions.get(gate.toRegionId).space;
  assert.equal(dest.kind,'s3','destination metric must be S3');
  return {gate,dest};
}
const findFlat=document=>document.baseScene.entities.find(e=>e.id==='flat-entry');
const findSphere=document=>document.coverRegions[0].entities.find(e=>e.id==='sphere-entry');
const frames=[
  loadGate(null),
  loadGate(document=>{
    const flat=findFlat(document);
    flat.position=[1,1,0];flat.forward=[-Math.SQRT1_2,-Math.SQRT1_2,0];
    const sphere=findSphere(document);
    sphere.position=[.2,.1,0];sphere.forward=[Math.SQRT1_2,Math.SQRT1_2,0];
  }),
  loadGate(document=>{
    const flat=findFlat(document);
    flat.position=[-0.5,0.4,0.3];flat.forward=[-0.6,-0.8,0];
    const sphere=findSphere(document);
    sphere.position=[-0.1,0.3,-0.2];sphere.forward=[0.6,0.8,0];
  }),
];

const POS_ERR=[1e-7,1e-7,1e-7],DIR_ERR=[1e-4,1e-4,1e-4];
let checks=0,enclosed=0,worstWidth=0,nonunit=0;
for(const {gate,dest} of frames){
  const frame=gate.renderData();
  const unit=v=>{const l=Math.hypot(...v);return v.map(x=>x/l);};
  const grazing=unit(frame.normal.map((n,i)=>-Math.cos(Math.PI*75/180)*n+Math.sin(Math.PI*75/180)*frame.right[i]));
  const tilted=unit(frame.normal.map((n,i)=>-n+0.2*frame.right[i]-0.1*frame.up[i]));
  const cases=[
    {name:'center',target:frame.center.slice(),dir:frame.normal.map(v=>-v)},
    {name:'rim',target:frame.center.map((v,i)=>v+0.75*frame.radius*frame.right[i]),dir:tilted},
    {name:'grazing',target:frame.center.map((v,i)=>v+0.2*frame.radius*frame.up[i]),dir:grazing},
    {name:'off-center',target:frame.center.map((v,i)=>v+0.3*frame.radius*frame.right[i]-0.2*frame.radius*frame.up[i]),dir:tilted},
  ];
  for(const {name,target,dir} of cases){
    const standoff=2;
    const position=target.map((v,i)=>v-standoff*dir[i]);
    const input={position,direction:dir.slice(),positionError:POS_ERR.slice(),directionError:DIR_ERR.slice(),
      frame,frameError:0,curvatureRadius:8,maxDistance:10};
    const bounds=e3S3TransferBounds(input);
    assert.equal(bounds.status,'bounded',`${name}: expected bounded`);
    // One frame-error widening per frame still encloses the nominal-frame reference.
    const wide=e3S3TransferBounds({...input,frameError:1e-7,positionError:POS_ERR.slice(),directionError:DIR_ERR.slice()});
    assert.equal(wide.status,'bounded',`${name}: expected bounded with frame error`);
    for(let k=0;k<3;k++){
      const p=position.map((v,i)=>v+pick(-POS_ERR[i],POS_ERR[i]));
      const v=dir.map((x,i)=>x+pick(-DIR_ERR[i],DIR_ERR[i]));
      assert.ok(inBox(dir,DIR_ERR,v),`${name}: perturbed direction left its error box`);
      assert.ok(inBox(position,POS_ERR,p),`${name}: perturbed point left its error box`);
      const denom=dot3(v,frame.normal);
      assert.ok(denom<-1e-6,`${name}: perturbed ray must stay entering (denom ${denom})`);
      if(Math.abs(Math.hypot(...v)-1)>1e-12)nonunit++;
      const t=-dot3(sub3(p,frame.center),frame.normal)/denom;
      const at=p.map((x,i)=>x+t*v[i]);
      // Raw in-box v drives the crossing; the oracle normalizes only the
      // OUTPUT with the destination S3 metric, matching the API's contract.
      const exact=gate.transit(at),out=dest.normalize(exact.position,exact.carry(v));
      for(const [bands,label] of [[wide,'wide-frame'],[bounds,'exact-frame']]){
        assert.ok(contains(bands.distance,t),`${name}/${label}: distance not enclosed`);
        for(let i=0;i<4;i++){
          assert.ok(contains(bands.position[i],exact.position[i]),`${name}/${label}: position ${i} not enclosed`);
          assert.ok(contains(bands.direction[i],out[i]),`${name}/${label}: direction ${i} not enclosed`);
        }
      }
      for(let i=0;i<4;i++)worstWidth=Math.max(worstWidth,bounds.position[i][1]-bounds.position[i][0]);
      checks++;enclosed++;
    }
  }
}
assert.ok(nonunit>0,`expected at least one perturbed direction with norm != 1 (saw ${nonunit}/${checks})`);
console.log(`Portal transfer truth (MUSE-74): ${enclosed}/${checks} simultaneous point+direction perturbations enclosed across ${frames.length} frames; max position width ${worstWidth}; nonunit perturbed inputs ${nonunit}/${checks}`);
