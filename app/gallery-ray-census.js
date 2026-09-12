import {e3S3TransferBounds} from '../engine/geometry/portal-transfer-bounds.js';
import {sphericalBallRootBounds} from '../engine/geometry/spherical-root-bounds.js';
import {interval} from '../engine/geometry/float32-interval.js';
const mid=b=>b.map(([lo,hi])=>(lo+hi)/2);
const error=b=>b.map(([lo,hi])=>(hi-lo)/2);
import {e3PrimaryRayBounds} from '../engine/geometry/primary-ray-bounds.js';
import {pixelDirection} from './connected-global-model.js';
// Test-only CPU/GPU census. Raw causes remain raw: no inferred sky policy.
export function galleryRayCensus(model,renderer,width=160,height=120){
  const state=model.state,range=renderer.packed.maxDistance;
  const {pixels,distances}=renderer.read(state,width,height);
  const counts={},samples=[],names=['miss','hit','unresolved'];let disagreements=0;
  if(model.world.regions.get(state.regionId).space.kind!=='e3')throw Error('Primary census requires E3 entry');
  const primary=renderer.readPrimaryRays(state,width,height);
  const cameraError={forward:[0,0,0],right:[0,0,0],up:[0,0,0]};
  let primaryMaxError=0,primaryMaxWidth=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x,gpuStatus=names[pixels[4*i]],gpuRegion=renderer.packed.ids[pixels[4*i+1]-1];
    const bounds=e3PrimaryRayBounds({camera:state.camera,cameraError,width,height,pixel:[x+.5,y+.5]});
    const ideal=pixelDirection(model.world.regions.get(state.regionId).space,state.position,state.camera,width,height,x,y);
    for(let k=0;k<3;k++){
      const value=primary[k][i];
      if(!Number.isFinite(value)||value<bounds[k][0]||value>bounds[k][1])throw Error(`Primary ray outside bounds at ${x},${y},${k}: ${value} vs ${bounds[k]}`);
      primaryMaxError=Math.max(primaryMaxError,Math.abs(value-ideal[k]));
      primaryMaxWidth=Math.max(primaryMaxWidth,bounds[k][1]-bounds[k][0]);
    }
    if(primary[3][i]!==0)throw Error('E3 primary ray has nonzero fourth component');
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
      const first=cpu.crossings?.[0],candidates=[];let transferStatus='not-applicable';
      if(first?.fromRegionId===state.regionId&&model.world.regions.get(state.regionId).space.kind==='e3'){
        const gate=model.world.portals.find(g=>g.fromId===first.fromId);
        const destination=model.world.regions.get(first.toRegionId);
        if(destination?.balls&&destination.space.kind==='s3'){
          const source=model.world.regions.get(state.regionId).space;
          const transfer=e3S3TransferBounds({position:state.position,positionError:[0,0,0],
            direction:mid(bounds),directionError:error(bounds),frame:gate.renderData(),frameError:0,
            curvatureRadius:destination.space.curvatureRadius,maxDistance:range});
          transferStatus=transfer.status==='bounded'?'bounded':transfer.reason;
          const incoming=pixelDirection(source,state.position,state.camera,width,height,x,y);
          const leg=source.stepWithTransport(state.position,incoming,first.distance);
          const mapped=gate.transit(first.entry),u=mapped.carry(leg.carry(incoming)),p=mapped.position;
          for(const ball of destination.balls){
            const a=p.reduce((sum,v,k)=>sum+v*ball.center[k],0),b=u.reduce((sum,v,k)=>sum+v*ball.center[k],0);
            const ratio=Math.cos(ball.radius/destination.space.curvatureRadius)/Math.hypot(a,b);
            if(Math.abs(1-ratio)<4*.00003){
              let rootBoundStatus='transfer-unresolved',rootBoundReason;
              if(transfer.status==='bounded'){
                const centerBands=ball.center.map(v=>interval(v)),radiusBand=interval(ball.radius);
                const root=sphericalBallRootBounds({position:mid(transfer.position),positionError:error(transfer.position),
                  direction:mid(transfer.direction),directionError:error(transfer.direction),
                  center:mid(centerBands),centerError:error(centerBands),radius:ball.radius,
                  radiusError:Math.max(ball.radius-radiusBand[0],radiusBand[1]-ball.radius),
                  curvatureRadius:destination.space.curvatureRadius,maxDistance:range-transfer.distance[0]});
                rootBoundStatus=root.status;rootBoundReason=root.reason;
              }
              candidates.push({id:ball.id,ratio,guard:4*.00003,rootBoundStatus,rootBoundReason});
            }
          }
        }
      }
      samples.push({x,y,transferStatus,sphericalGuardCandidates:candidates,gpuRegion,cpuStatus:cpu.status,cpuOwner:cpu.query?.owner??null,
        cpuDistance:cpu.distance??null,crossings:cpu.crossings});
    }
  }
  if(disagreements)throw Error(`Gallery census: ${disagreements} confident GPU disagreements`);
  return {label:'gallery-entry-ray-census',width,height,range,hardware:renderer.hardware,
    document:model.document(),pose:{regionId:state.regionId,position:state.position,
      forward:state.camera.forward,up:state.camera.up,right:state.camera.right},
    rootBoundCounts:samples.flatMap(s=>s.sphericalGuardCandidates).reduce((c,s)=>{const k=s.rootBoundStatus+'|'+(s.rootBoundReason??'');c[k]=(c[k]??0)+1;return c;},{}),
    counts,samples,disagreements,primaryRays:{checked:width*height,maxError:primaryMaxError,maxWidth:primaryMaxWidth}};
}
