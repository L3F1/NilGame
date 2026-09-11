import {createSphericalCover} from '../engine/geometry/spherical-cover.js';
import {createCameraFrame,carryAlong} from '../engine/world/camera-frame.js';
import {GLOBAL_S3_RADIUS,GLOBAL_S3_BALLS} from '../levels/fixtures/global-s3.js';

// Flight reference: no gravity, body collision or portals yet. A separately
// carried reference frame owns heading/up; mouse pitch never tilts the yaw axis.
export function createSphericalFlight(){
  const space=createSphericalCover({curvatureRadius:GLOBAL_S3_RADIUS}),balls=GLOBAL_S3_BALLS;
  let reference,camera,pitch,travel;
  function reset(){
    reference=createCameraFrame(space,space.origin,{forward:[1,0,0,0],up:[0,0,1,0]});
    pitch=0;travel=0;rebuild();
  }
  function rebuild(){
    camera=createCameraFrame(space,reference.position,{forward:reference.forward.map((x,i)=>x*Math.cos(pitch)+reference.up[i]*Math.sin(pitch)),up:reference.up});
  }
  function look({yaw=0,pitch:delta=0}={}){
    if(!Number.isFinite(yaw)||!Number.isFinite(delta))throw Error('Invalid look');
    const forward=reference.forward.map((x,i)=>x*Math.cos(yaw)-reference.right[i]*Math.sin(yaw));
    reference=createCameraFrame(space,reference.position,{forward,up:reference.up});
    pitch=Math.max(-1.5,Math.min(1.5,pitch+delta));rebuild();
  }
  function move(direction,distance){
    const leg=space.stepWithTransport(reference.position,direction,distance);
    reference=carryAlong(reference,leg);travel+=Math.abs(distance);rebuild();
  }
  function advance(dt,wish=[0,0,0],angles={}){
    if(!Number.isFinite(dt)||dt<0||!Array.isArray(wish)||wish.length!==3||!wish.every(Number.isFinite))throw Error('Invalid flight input');
    look(angles);
    const raw=camera.forward.map((x,i)=>x*wish[1]+reference.right[i]*wish[0]+reference.up[i]*wish[2]);
    const n=Math.hypot(...raw);if(n>0)move(raw.map(x=>x/n),Math.min(dt,.04)*4*Math.min(1,Math.hypot(...wish)));
  }
  // Deterministic straight great-circle steps, independent of view pitch.
  // UI may animate this in small increments; never reset the endpoint at 2πR.
  function stepLoop(distance){
    if(!Number.isFinite(distance)||distance<0||distance>2*Math.PI*space.curvatureRadius)throw Error('Invalid loop distance');
    move(reference.forward,distance);
  }
  reset();
  return {space,balls,reset,advance,stepLoop,get state(){return {position:camera.position,camera,reference,travel,returnDistance:space.distance(space.origin,camera.position)};}};
}
