// Host-free model for the connected complete-S3 preview. No renderer packet is
// built here: the lead's renderer owns world.renderData().
import {compileConnectedCoverWorld} from '../engine/world/connected-cover-world.js';
import {createCameraFrame} from '../engine/world/camera-frame.js';
import {moveRegionProbe,resumeRegionCorrection} from '../engine/world/region-motion.js';
import {traceRegionSight} from '../engine/world/region-sight.js';
import {motionPause} from './motion-pause.js';

export const GLOBAL_FLIGHT_SPEED=4;
export const GLOBAL_PITCH_LIMIT=1.5;
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);

// Same pixel convention as connected-preview.js compare(): GPU rows read bottom-up.
export function pixelDirection(space,position,camera,width,height,x,y){
  const raw=camera.forward.map((f,k)=>f/Math.tan(35*Math.PI/180)+camera.right[k]*(2*(x+.5)-width)/height+camera.up[k]*(2*(y+.5)-height)/height);
  return space.normalize(position,raw);
}

export function createConnectedGlobalPreview(document){
  const world=compileConnectedCoverWorld(document);
  let state,referenceUp,halted=false,motion='spawn',spawnRegion='flat';
  // No gravity and no floor: a reference up is CARRIED. Its coefficients in the
  // camera axes before a move are reapplied to the solver's returned axes, so
  // it follows the net linear frame map of the actual motion, portals included.
  function carryReference(before,after){
    const k=[before.forward,before.up,before.right].map(v=>dot(referenceUp,v));
    const p=after.position,space=after.space;
    return space.normalize(p,after.forward.map((x,i)=>k[0]*x+k[1]*after.up[i]+k[2]*after.right[i]));
  }
  function elevation(){return Math.asin(Math.max(-1,Math.min(1,dot(state.camera.forward,referenceUp))));}
  function look({yaw=0,pitch=0}={}){
    if(!Number.isFinite(yaw)||!Number.isFinite(pitch))throw Error('Look angles must be finite');
    const {space,position:p,forward,right}=state.camera,up=referenceUp,e=elevation();
    let heading=space.project(p,forward,up);
    if(space.norm(p,heading)<1e-9)throw Error('Camera forward is parallel to reference up');
    heading=space.normalize(p,heading);
    const side=space.normalize(p,space.project(p,space.project(p,right,up),heading));
    // Yaw about the carried up; pitch is measured and clamped against the same up.
    const turned=heading.map((x,i)=>x*Math.cos(yaw)-side[i]*Math.sin(yaw));
    const target=Math.max(-GLOBAL_PITCH_LIMIT,Math.min(GLOBAL_PITCH_LIMIT,e+pitch));
    const aim=turned.map((x,i)=>x*Math.cos(target)+up[i]*Math.sin(target));
    state={...state,camera:createCameraFrame(space,p,{forward:aim,up})};
  }
  function spawn(regionId){
    if(!['flat','sphere','exit'].includes(regionId))throw Error('Unknown preview spawn');
    let start=world.spawn(regionId==='exit'?'sphere':regionId);
    if(regionId==='exit'){
      // Explicit test placement on the entering side, not a portal teleport or
      // an automatic correction of the player's ongoing movement.
      const gate=world.portals.find(p=>p.fromId==='sphere-exit'),space=world.regions.get('sphere').space;
      const leg=space.stepWithTransport(gate.center,gate.normal,2),up=leg.carry(gate.renderData().up);
      start={...start,position:leg.position,velocity:leg.position.map(()=>0),
        camera:createCameraFrame(space,leg.position,{forward:leg.carry(gate.normal.map(x=>-x)),up})};
    }
    spawnRegion=regionId;state={...start,radius:start.radius??document.baseScene.units.playerRadius};
    referenceUp=state.camera.up.slice();halted=false;motion='spawn';
  }
  spawn('flat');
  function move(direction,speed,dt){
    const before=state.camera;
    let result=moveRegionProbe(world,{...state,velocity:direction.map(x=>x*speed)},dt);
    motion=result.status+(result.detail?`/${result.detail}`:'');
    // One separately bounded zero-time settle, using the kernel-issued authority.
    // Never resume event refusals automatically, loop on debt, or replay travel.
    if(result.status==='budget-exhausted'&&result.pendingLift&&result.continuation){
      result=resumeRegionCorrection(world,result);
      motion+=` / correction:${result.status}`;
    }
    // Reuse the editor's debt-first policy. A debt-free work limit or plugged
    // exit ends THIS request, not flight: the next frame can steer away with a
    // fresh clock. Never replay timeRemaining or discard an owed correction.
    // This preview still deliberately halts at the flat authoring extent.
    halted=!!motionPause(result)||result.status==='domain-exit';
    state=result.state;
    if(state.camera!==before)referenceUp=carryReference(before,state.camera);
    return result;
  }
  function act(action){
    if(action==='reset')return spawn(spawnRegion);
    if(action==='spawn-flat')return spawn('flat');
    if(action==='spawn-sphere')return spawn('sphere');
    if(action==='approach-exit')return spawn('exit');
    if(halted)return;
    if(['left','right','up','down'].includes(action))return look({
      yaw:action==='left'?.15:action==='right'?-.15:0,pitch:action==='up'?.15:action==='down'?-.15:0});
    if(!['forward','back'].includes(action))throw Error('Unknown preview action');
    move(state.camera.forward.map(x=>action==='forward'?x:-x),1,.25);
  }
  function advance(dt,wish=[0,0,0],angles={}){
    if(!Number.isFinite(dt)||dt<0||!Array.isArray(wish)||wish.length!==3||!wish.every(Number.isFinite))throw Error('Invalid flight input');
    if(halted)return;
    look(angles);
    const c=state.camera,raw=c.forward.map((x,i)=>c.right[i]*wish[0]+x*wish[1]+referenceUp[i]*wish[2]);
    const n=Math.hypot(...raw);
    if(n===0){state={...state,velocity:state.velocity.map(()=>0)};return;}
    move(raw.map(x=>x/n),GLOBAL_FLIGHT_SPEED*Math.min(1,Math.hypot(...wish)),Math.min(.04,dt));
  }
  // CPU reference. maxDistance is required: comparisons must use renderer.packed.maxDistance.
  function sight(direction,maxDistance,pose=state){
    if(!Number.isFinite(maxDistance)||maxDistance<=0)throw Error('Sight requires an explicit maxDistance');
    return traceRegionSight(world,{regionId:pose.regionId,position:pose.position,direction},{maxDistance});
  }
  function pixelSight(width,height,x,y,maxDistance,pose=state){
    const space=world.regions.get(pose.regionId).space;
    return sight(pixelDirection(space,pose.position,pose.camera,width,height,x,y),maxDistance,pose);
  }
  function status(){
    const region=world.regions.get(state.regionId),space=region.space;
    const geometry=region.descriptor.coverage==='s3-cover'
      ?`COMPLETE S3 · radius ${space.curvatureRadius} · no chart boundary, no floor`
      :`E3 · bounded extent ${region.descriptor.extent}`;
    return `${state.regionId} · ${geometry} · ${motion}${halted?' — halted; reset to recover':''}`;
  }
  function portalGuide(){
    const space=world.regions.get(state.regionId).space;
    const nearest=world.portals.filter(g=>g.fromRegionId===state.regionId)
      .map(g=>({gate:g,distance:space.distance(state.position,g.center)})).sort((a,b)=>a.distance-b.distance)[0];
    const name=id=>({'sphere-exit':'Second exit','sphere-entry':'Entry portal','flat-entry':'S3 entrance','flat-return':'S3 return'}[id]||id);
    const ray=sight(state.camera.forward,64),crossing=ray.crossings[0];
    const info={nearest:null,aimed:null,solid:ray.status==='hit'&&!crossing?ray.query.owner:null};
    if(nearest)info.nearest={id:nearest.gate.fromId,name:name(nearest.gate.fromId),distance:nearest.distance,
      side:nearest.gate.signedHeight(state.position)>1e-9?'front':'back / on plane'};
    if(crossing){
      const gate=world.portals.find(g=>g.fromId===crossing.fromId);
      const clearance=gate.radius-space.distance(gate.center,crossing.entry)-state.radius;
      info.aimed={id:gate.fromId,name:name(gate.fromId),distance:crossing.distance,clearance,bodyFits:clearance>=1e-7};
    }
    return info;
  }
  return {world,act,renderGuide:portalGuide,advance,look:angles=>{if(!halted)look(angles);},sight,pixelSight,status,
    get state(){return state;},get referenceUp(){return referenceUp;},get halted(){return halted;},
    get motion(){return motion;},get spawnRegion(){return spawnRegion;},get elevation(){return elevation();}};
}
