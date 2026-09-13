import {measureAARefinement} from './aa-refinement-timing.js';
import {createConnectedRenderer} from '../engine/geometry/connected-renderer.js';
// referenceOptions selects the independent 2x reference renderer's constructor
// options; callers testing an opt-in variant pass the same options as the target.
export async function checkAARefinement({model,renderer,state,canvas,shots},referenceOptions={experimentalH3:true}){
  const refCanvas=document.createElement('canvas'),reference=createConnectedRenderer(refCanvas,model.world,referenceOptions);
  const records=[];
  try{
    for(const [width,height] of [[65,49],[160,120]]){
      const options={antialias:true,sphericalMissPass:true,aaRefinement:true};
      const off=renderer.readColor(state,width,height,{antialias:true});
      if(width===160)shots.push({name:'aa-refinement-off',data:canvas.toDataURL()});
      const on=renderer.readColor(state,width,height,options);
      if(renderer.missPass.status!=='generated')throw Error('AA refinement atlas not generated');
      if(width===160)shots.push({name:'aa-refinement-on',data:canvas.toDataURL()});
      const evidence=renderer.readAAMissPass(state,width,height);
      const ref=reference.read(state,2*width,2*height,{sphericalMissPass:true});
      const colors=reference.readColor(state,2*width,2*height,{sphericalMissPass:true});
      const bySample=[0,0,0,0];
      let active=0,omissions=0,compared=0,maxError=0,recovered=0,remainingNumeric=0,inconclusive=0,domainDecorations=0;
      const purple=(a,i)=>Math.abs(a[i]-176)<=1&&Math.abs(a[i+1]-32)<=1&&Math.abs(a[i+2]-209)<=1;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const i=4*(y*width+x);for(let k=0;k<4;k++)bySample[k]+=evidence.bySample[i+k];active+=evidence.bytes[i];omissions+=evidence.bytes[i+1];
        const numeric=evidence.bytes[i+2]>0;
        if(numeric&&!purple(on,i))throw Error('AA concealed unresolved sample');
        if(purple(off,i)&&!purple(on,i))recovered++;
        const pixels=[0,1,2,3].map(k=>4*((2*y+Math.floor(k/2))*2*width+2*x+k%2));
        if(pixels.some(j=>ref.pixels[j]===2&&ref.pixels[j+3]===1)){domainDecorations++;continue;} // screen-space decoration, not geometry color
        if(numeric){if(pixels.every(j=>ref.pixels[j]!==2))throw Error('AA refused a resolved supersampled pixel '+JSON.stringify({width,height,x,y}));remainingNumeric++;continue;}
        if(pixels.some(j=>ref.pixels[j]===2)){inconclusive++;continue;}
        for(let c=0;c<3;c++){
          const expected=Math.sqrt(pixels.reduce((sum,j)=>sum+(colors[j+c]/255)**2,0)/4)*255;
          const error=Math.abs(on[i+c]-expected);maxError=Math.max(maxError,error);
          if(error>2)throw Error('AA supersample mismatch '+JSON.stringify({width,height,x,y,c,actual:on[i+c],expected}));
        }
        compared++;
      }
      if(!active||!omissions||bySample.some(v=>v===0)||compared===0)throw Error('AA proof/reference not meaningfully exercised '+JSON.stringify({width,height,active,omissions,compared,maxError,recovered,remainingNumeric,inconclusive}));
      records.push({width,height,active,omissions,bySample,compared,maxError,recovered,remainingNumeric,inconclusive,domainDecorations});
      // Debug paths are centre rays even when the UI's AA checkbox is set.
      const centre=renderer.read(state,width,height,{sphericalMissPass:true}),debugAA=renderer.read(state,width,height,options);
      if(!centre.pixels.every((v,k)=>v===debugAA.pixels[k])||!centre.distances.every((v,k)=>v===debugAA.distances[k]))throw Error('AA changed centre debug packets');
      renderer.draw(state,{width,height,...options});
      if(renderer.missPass.status!=='generated')throw Error('Centre-to-AA transition failed');
    }
    const baseline=renderer.readColor(state,960,720,{antialias:true});
    const limited=renderer.readColor(state,960,720,{antialias:true,sphericalMissPass:true,aaRefinement:true});
    if(renderer.missPass.status!=='resource-limit'||!baseline.every((v,k)=>v===limited[k]))throw Error('AA resource fallback changed ordinary AA');
    renderer.draw(state,{width:65,height:49,antialias:true,sphericalMissPass:true,aaRefinement:true});
    if(renderer.missPass.status!=='generated')throw Error('AA did not recover after resource refusal');
    if(!records.some(r=>r.recovered>0))throw Error('AA refinement produced no visible uncertainty recovery');
    const frameCosts=await measureAARefinement(renderer,state);
    return {label:'aa-refinement',records,frameCosts,hardware:renderer.hardware,scope:'independent 2x centre-ray reference; domain decoration excluded; numerical reference refusals explicitly inconclusive'};
  }finally{refCanvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();}
}
