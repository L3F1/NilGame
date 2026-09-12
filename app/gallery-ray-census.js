import {pixelDirection} from './connected-global-model.js';
// Test-only CPU/GPU census. Raw causes remain raw: no inferred sky policy.
export function galleryRayCensus(model,renderer,width=160,height=120){
  const state=model.state,range=renderer.packed.maxDistance;
  const {pixels,distances}=renderer.read(state,width,height);
  const counts={},samples=[],names=['miss','hit','unresolved'];let disagreements=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x,gpuStatus=names[pixels[4*i]],gpuRegion=renderer.packed.ids[pixels[4*i+1]-1];
    const cpu=model.pixelSight(width,height,x,y,range),kind=pixels[4*i+3];
    if(!gpuStatus)throw Error(`Unknown GPU status at ${x},${y}`);
    const key=[gpuStatus,kind,gpuRegion,cpu.status,cpu.reason??'',cpu.query?.owner??''].join('|');
    counts[key]=(counts[key]??0)+1;
    const gpuOwner=renderer.packed.primitiveIds[pixels[4*i+2]-1];
    if(gpuStatus==='hit'&&(cpu.status!=='hit'||cpu.regionId!==gpuRegion||cpu.query?.owner!==gpuOwner||Math.abs(cpu.distance-distances[i])>.001))disagreements++;
    if(gpuStatus==='miss'&&cpu.status==='hit')disagreements++;
    if(gpuStatus==='unresolved'&&kind===2&&cpu.status!=='unresolved'&&samples.length<128){
      // Double-precision replay of the GLSL ratio guard, NOT internal GPU
      // provenance or a proposed smaller epsilon. Only the first E3 -> S3 leg.
      const first=cpu.crossings?.[0],candidates=[];
      if(first?.fromRegionId===state.regionId&&model.world.regions.get(state.regionId).space.kind==='e3'){
        const gate=model.world.portals.find(g=>g.fromId===first.fromId);
        const destination=model.world.regions.get(first.toRegionId);
        if(destination?.balls&&destination.space.kind==='s3'){
          const source=model.world.regions.get(state.regionId).space;
          const incoming=pixelDirection(source,state.position,state.camera,width,height,x,y);
          const leg=source.stepWithTransport(state.position,incoming,first.distance);
          const mapped=gate.transit(first.entry),u=mapped.carry(leg.carry(incoming)),p=mapped.position;
          for(const ball of destination.balls){
            const a=p.reduce((sum,v,k)=>sum+v*ball.center[k],0),b=u.reduce((sum,v,k)=>sum+v*ball.center[k],0);
            const ratio=Math.cos(ball.radius/destination.space.curvatureRadius)/Math.hypot(a,b);
            if(Math.abs(1-ratio)<4*.00003)candidates.push({id:ball.id,ratio,guard:4*.00003});
          }
        }
      }
      samples.push({x,y,sphericalGuardCandidates:candidates,gpuRegion,cpuStatus:cpu.status,cpuOwner:cpu.query?.owner??null,
        cpuDistance:cpu.distance??null,crossings:cpu.crossings});
    }
  }
  if(disagreements)throw Error(`Gallery census: ${disagreements} confident GPU disagreements`);
  return {label:'gallery-entry-ray-census',width,height,range,hardware:renderer.hardware,
    document:model.document(),pose:{regionId:state.regionId,position:state.position,
      forward:state.camera.forward,up:state.camera.up,right:state.camera.right},
    counts,samples,disagreements};
}
