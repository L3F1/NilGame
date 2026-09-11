import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createConnectedGlobalPreview} from './app/connected-global-model.js';

// MUSE-61: bounded deterministic corpus for connected preview contact recovery.
// Near-target vs offset E3/S3 ball approaches across frame dt and steering,
// through the host-free preview only. No kernel/app edits, no tolerance
// loosening: clearance and camera bounds below are the pre-existing budgets.
const document=JSON.parse(fs.readFileSync('levels/fixtures/connected-global.nil.json'));
const BODY=0.25, BALL_R=0.6, BUDGET=BODY+BALL_R; // 0.85, as in connected-contact.test.js
const ORTHO_TOL=1e-9, CLR_TOL=1e-9;
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);

// Independent metric check over kernel-authored ball data: the centers/radii
// come from the compiled world, the great-circle math below is our own (same
// convention as connected-contact.test.js). Reconstructing centers by hand
// from fixture tangent coords is wrong here: south/return landmarks sit at
// antipodal embeddings, not at the naive tangent scaling.
function sphereClearance(balls){
  return p=>{
    let worst=Infinity;
    for(const b of balls){
      const c=b.center;
      const d=p.reduce((s,x,k)=>s+x*c[k],0);
      const distance=8*Math.atan2(Math.hypot(...p.map((x,k)=>x-d*c[k])),d);
      worst=Math.min(worst,distance-b.radius-BODY);
    }
    return worst;
  };
}
const FLAT_BALL=[3,3,0];
const flatClearance=p=>Math.hypot(p[0]-FLAT_BALL[0],p[1]-FLAT_BALL[1],p[2]-FLAT_BALL[2])-BUDGET;

function cameraError(model){
  const c=model.state.camera;
  const n=v=>Math.hypot(...v);
  const dev=Math.max(Math.abs(n(c.forward)-1),Math.abs(n(c.up)-1),Math.abs(n(c.right)-1),
    Math.abs(dot(c.forward,c.up)),Math.abs(dot(c.forward,c.right)),Math.abs(dot(c.up,c.right)));
  return {dev,upRef:dot(c.up,model.referenceUp)};
}

const DTS=[0.008,0.016,0.033,0.04];
const STEERS=[
  {name:'straight',wish:()=>[0,1,0],turnAt:null},
  {name:'drift',wish:()=>[0.25,1,0],turnAt:null},
  {name:'veer',wish:()=>[0,1,0],turnAt:'mid'},
];
let debtFreeStops=0, completedCorrections=0, refusals=[], cases=0;
for(const region of ['sphere','flat']){
  const spawn=region==='sphere'?'spawn-sphere':'spawn-flat';
  for(const aim of [{name:'near-target',yaw:-0.5},{name:'offset',yaw:-0.2},{name:'wide',yaw:0.3}]){
    for(const dt of DTS){
      for(const steer of STEERS){
        cases++;
        const model=createConnectedGlobalPreview(document);
        model.act(spawn); model.look({yaw:aim.yaw});
        // Portal crossings change the walker's region mid-case; the metric
        // follows the walker's CURRENT region every frame.
        const sphereClr=sphereClearance(model.world.regions.get('sphere').balls);
        const clearance=()=>model.state.regionId==='sphere'?sphereClr(model.state.position):flatClearance(model.state.position);
        const spaceOf=id=>model.world.regions.get(id).space;
        const frames=Math.ceil(3.2/dt);
        let stop=false, corr=false, refused=null, worstCam=0, worstClr=Infinity;
        for(let i=0;i<frames;i++){
          if(steer.turnAt==='mid'&&i===Math.floor(frames/2))model.look({yaw:0.3});
          model.advance(dt,steer.wish());
          if(model.motion==='budget-exhausted/steps'){stop=true;debtFreeStops++;}
          if(model.motion.includes('correction:complete')){corr=true;completedCorrections++;}
          const {dev,upRef}=cameraError(model);
          worstCam=Math.max(worstCam,dev);
          assert.ok(dev<ORTHO_TOL,`${region}/${aim.name}/${dt}/${steer.name} frame ${i}: camera not orthonormal (${dev})`);
          assert.ok(upRef>1-ORTHO_TOL,`${region}/${aim.name}/${dt}/${steer.name} frame ${i}: camera not upright vs carried reference (${upRef})`);
          const clr=clearance();
          worstClr=Math.min(worstClr,clr);
          assert.ok(clr>=-CLR_TOL,`${region}/${aim.name}/${dt}/${steer.name} frame ${i}: ball clearance violated (${clr})`);
          if(model.halted){
            // Record first; a status name alone does not prove legitimacy.
            // This fixed corpus has no expected refusals (asserted below).
            refused=`${model.motion}`;
            refusals.push(`${region}/${aim.name}/${dt}/${steer.name}: halted at frame ${i} (${model.motion})`);
            break;
          }
        }
        if(!refused){
          // No permanent halt on the pinned paths: retreat works without reset.
          // Step lengths accumulate only between same-region frames, so portal
          // crossings mid-retreat cannot crash the tape.
          let back=0, prev={id:model.state.regionId,pos:[...model.state.position]};
          for(let i=0;i<20;i++){
            model.advance(dt,[0,-1,0]);
            assert.equal(model.halted,false,`${region}/${aim.name}/${dt}/${steer.name} retreat frame ${i}: ${model.motion}`);
            assert.ok(clearance()>=-CLR_TOL,'retreat penetrates ball');
            if(model.state.regionId===prev.id)back+=spaceOf(prev.id).distance(prev.pos,model.state.position);
            prev={id:model.state.regionId,pos:[...model.state.position]};
          }
          assert.ok(back>0.3,`${region}/${aim.name}/${dt}/${steer.name}: retreat stalled (${back})`);
        }
        console.log(`${region} ${aim.name} dt=${dt} ${steer.name}: stop=${stop} corr=${corr} refused=${refused??'no'} worstCam=${worstCam.toExponential(1)} worstClr=${worstClr.toFixed(4)}`);
      }
    }
  }
}
assert.ok(debtFreeStops>0,'corpus must pin at least one actual debt-free budget stop');
assert.ok(completedCorrections>0,'corpus must pin at least one completed correction');
assert.deepEqual(refusals,[],'previously steerable corpus must not acquire permanent halts');
console.log(`Corpus: ${cases} cases, ${debtFreeStops} debt-free stops, ${completedCorrections} completed corrections, ${refusals.length} refusals`);
for(const r of refusals)console.log(`refusal: ${r}`);
