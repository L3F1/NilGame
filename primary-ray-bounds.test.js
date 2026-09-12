import assert from 'node:assert/strict';
import {e3PrimaryRayBounds,CONNECTED_FOCAL_SCALE} from './engine/geometry/primary-ray-bounds.js';

let checks=0;
const cameraError={forward:[0,0,0],right:[0,0,0],up:[0,0,0]};
// Independent pinhole construction: image plane at unit distance, with
// half-height tan(35 degrees), then Euclidean unit direction.
for(const angle of [0,.37,1.5,3.1])for(const [width,height] of [[1,1],[160,120],[1920,1080]]){
  const camera={forward:[Math.cos(angle),Math.sin(angle),0],right:[-Math.sin(angle),Math.cos(angle),0],up:[0,0,1]};
  for(const fx of [.01,.5,.99])for(const fy of [.01,.5,.99]){
    const pixel=[fx*width,fy*height];
    const bands=e3PrimaryRayBounds({camera,cameraError,width,height,pixel});
    const plane=[(2*pixel[0]-width)/height*Math.tan(35*Math.PI/180),(2*pixel[1]-height)/height*Math.tan(35*Math.PI/180)];
    const raw=camera.forward.map((v,k)=>v+camera.right[k]*plane[0]+camera.up[k]*plane[1]);
    const length=Math.hypot(...raw),unit=raw.map(v=>v/length);
    unit.forEach((v,k)=>assert.ok(v>=bands[k][0]&&v<=bands[k][1]));checks++;
  }
}
const camera={forward:[1,0,0],right:[0,1,0],up:[0,0,1]},pixel=[72.5,49.5];
const args={camera,cameraError,width:160,height:120,pixel};
const uncertain={forward:[.001,.002,.001],right:[.002,.001,.002],up:[.001,.001,.002]};
const bands=e3PrimaryRayBounds({...args,cameraError:uncertain});
for(let mask=0;mask<512;mask++){
  let bit=0;
  const c=Object.fromEntries(Object.entries(camera).map(([key,v])=>[key,v.map((x,k)=>x+((mask>>bit++)&1?1:-1)*uncertain[key][k])]));
  const raw=c.forward.map((v,k)=>v*CONNECTED_FOCAL_SCALE+c.right[k]*(2*pixel[0]-160)/120+c.up[k]*(2*pixel[1]-120)/120);
  const n=Math.hypot(...raw);raw.forEach((v,k)=>assert.ok(v/n>=bands[k][0]&&v/n<=bands[k][1]));checks++;
}
assert.throws(()=>e3PrimaryRayBounds({...args,cameraError:undefined}),/missing-input-error/);
assert.throws(()=>e3PrimaryRayBounds({...args,height:0}),/viewport/);
assert.throws(()=>e3PrimaryRayBounds({...args,camera:{...camera,up:[0,0,1,0]}}),/three-component/);
console.log(`${checks} primary directions enclosed; missing uncertainty and invalid domains refused`);
