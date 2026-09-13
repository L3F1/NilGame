import {createConnectedRenderer} from '../engine/geometry/connected-renderer.js';
import {checkAARefinement} from './aa-refinement-probe.js';
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
    return {...result,label:'enclosure-aa',referenceOptions:candidateOptions,
      scope:'enclosureRefinement target and independent 2x enclosureRefinement centre-ray reference; '+result.scope+'; no UI admission'};
  }finally{canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();}
}
