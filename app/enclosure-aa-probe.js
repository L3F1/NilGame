import {createConnectedRenderer} from '../engine/geometry/connected-renderer.js';
import {checkAARefinement} from './aa-refinement-probe.js';
import {measureAARefinement} from './aa-refinement-timing.js';
// Opt-in candidate only: AA against an independent 2x supersampled renderer that
// uses the same enclosure specialization. Passing does not admit it to the UI.
export async function checkEnclosureAA(model,census,shots){
  const candidateOptions={experimentalH3:true,enclosureRefinement:true};
  const canvas=document.createElement('canvas');
  try{
    const renderer=createConnectedRenderer(canvas,model.world,candidateOptions);
    const state={...model.state,regionId:census.pose.regionId,position:census.pose.position,
      camera:{forward:census.pose.forward,right:census.pose.right,up:census.pose.up}};
    const candidateShots=[];
    const result=await checkAARefinement({model,renderer,state,canvas,shots:candidateShots},{...candidateOptions});
    shots.push(...candidateShots.map(s=>({...s,name:'enclosure-'+s.name})));
    const viewport={width:480,height:360},options={...viewport,antialias:true};
    renderer.readColor(state,viewport.width,viewport.height,options);
    shots.push({name:'enclosure-interactive-off',data:canvas.toDataURL()});
    renderer.readColor(state,viewport.width,viewport.height,{...options,sphericalMissPass:true,aaRefinement:true});
    if(renderer.missPass.status!=='generated')throw Error('480x360 enclosure atlas was refused');
    shots.push({name:'enclosure-interactive-on',data:canvas.toDataURL()});
    // Do not issue a larger timing workload after the smaller one failed to
    // drain; in particular, software backends must not mix pending samples.
    const interactiveCosts=result.frameCosts.status==='measured'
      ?await measureAARefinement(renderer,state,viewport)
      :{...viewport,status:'skipped',reason:'320x240 timing incomplete or unavailable; larger workload not submitted.'};
    return {...result,label:'enclosure-aa',referenceOptions:candidateOptions,interactiveCosts,
      scope:'enclosureRefinement target and independent 2x enclosureRefinement centre-ray reference; '+result.scope+'; no UI admission'};
  }finally{canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();}
}
