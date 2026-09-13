import {createConnectedRenderer} from '../engine/geometry/connected-renderer.js';
// Opt-in candidate only. No default UI admission follows merely from passing.
export async function checkEnclosureIntegration(model,census,reference,shots){
  const canvas=document.createElement('canvas'),start=performance.now();
  const renderer=createConnectedRenderer(canvas,model.world,{experimentalH3:true,enclosureRefinement:true});
  const coldBuildMs=performance.now()-start;
  const state={...model.state,regionId:census.pose.regionId,position:census.pose.position,
    camera:{forward:census.pose.forward,right:census.pose.right,up:census.pose.up}};
  const records=[];
  try{
    for(const [width,height] of [[65,49],[160,120]]){
      const old=reference.read(state,width,height),off=renderer.read(state,width,height);
      const on=renderer.read(state,width,height,{sphericalMissPass:true});
      const participation=renderer.readMissPass(state,width,height);
      if(participation.status!=='generated')throw Error('Enclosure producer failed '+participation.status);
      let recovered=0,settledChanged=0,offChanged=0,cpuChecked=0;
      const examples=[];
      for(let i=0;i<width*height;i++){
        const j=4*i;
        const changed=(a,b)=>a.pixels.slice(j,j+4).some((v,k)=>v!==b.pixels[j+k])||a.distances[i]!==b.distances[i];
        if(changed(old,off)){offChanged++;if(examples.length<4)examples.push({i,kind:'shared-pair-off',old:[...old.pixels.slice(j,j+4),old.distances[i]],candidate:[...off.pixels.slice(j,j+4),off.distances[i]]});}
        if(off.pixels[j]!==2&&changed(off,on)){settledChanged++;if(examples.length<4)examples.push({i,kind:'settled',old:[...off.pixels.slice(j,j+4),off.distances[i]],candidate:[...on.pixels.slice(j,j+4),on.distances[i]]});}
        if(off.pixels[j]===2&&on.pixels[j]!==2){
          recovered++;
          const cpu=model.pixelSight(width,height,i%width,Math.floor(i/width),renderer.packed.maxDistance,state);
          const region=renderer.packed.ids[on.pixels[j+1]-1],owner=renderer.packed.primitiveIds[on.pixels[j+2]-1];
          if(on.pixels[j]===1&&(cpu.status!=='hit'||cpu.regionId!==region||cpu.query.owner!==owner
            ||Math.abs(on.distances[i]-cpu.distance)>.001)||on.pixels[j]===0&&cpu.status!=='miss')
            throw Error('Enclosure recovered pixel disagrees with CPU '+JSON.stringify({i,width,height,cpu:cpu.status,region,owner}));
          cpuChecked++;
        }
      }
      records.push({width,height,recovered,cpuChecked,settledChanged,offChanged,examples,accepted:participation.accepted,omissions:participation.omissions});
      if(width===160){renderer.readColor(state,width,height);shots.push({name:'enclosure-candidate-off',data:canvas.toDataURL()});
        renderer.readColor(state,width,height,{sphericalMissPass:true});shots.push({name:'enclosure-candidate-on',data:canvas.toDataURL()});}
    }
    const off=renderer.readColor(state,640,480,{antialias:true});
    const limited=renderer.readColor(state,640,480,{antialias:true,sphericalMissPass:true,aaRefinement:true});
    if(renderer.missPass.status!=='resource-limit'||!off.every((v,k)=>v===limited[k]))throw Error('Enclosure memory refusal changed fallback');
    renderer.draw(state,{width:65,height:49,sphericalMissPass:true});
    if(renderer.missPass.status!=='generated')throw Error('Enclosure failed to recover after memory refusal');
    const costs=[];
    for(const enabled of [false,true]){
      renderer.times.length=0;const wall=[];
      for(let i=0;i<12;i++){const t=performance.now();renderer.draw(state,{width:160,height:120,timer:true,sphericalMissPass:enabled});renderer.finish();wall.push(performance.now()-t);await new Promise(r=>setTimeout(r,20));}
      const deadline=performance.now()+1500;
      while(renderer.pendingTimerCount&&performance.now()<deadline){renderer.draw(state,{width:160,height:120,sphericalMissPass:enabled});await new Promise(r=>setTimeout(r,20));}
      costs.push({enabled,wallMs:wall,gpuMs:[...renderer.times]});
    }
    return {label:'enclosure-integration',hardware:renderer.hardware,coldBuildMs,records,costs,
      memoryRefusal:true,resizeRecovery:true,readyForFurtherAcceptance:records.every(r=>!r.offChanged&&!r.settledChanged)&&records.some(r=>r.recovered>0),
      scope:'experimental separate programs; no UI admission; ownership mutations, AA reference and broader pose checks still required'};
  }finally{canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();}
}
