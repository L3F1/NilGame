import {interval as I,sub,mul,div,enclose,scale,plus,normalize} from './float32-interval.js';

// Shared optical constant avoids a backend-native tan in the primary ray.
// This is the existing 70-degree vertical field of view.
export const CONNECTED_FOCAL_SCALE=1/Math.tan(35*Math.PI/180);

// CPU reference execution model, not a portable GLSL normalize guarantee.
// Pixel coordinates are window coordinates (centres are x+.5,y+.5).
// Camera uncertainty must be supplied; zero still includes float32 encoding.
export function e3PrimaryRayBounds({camera,cameraError,width,height,pixel}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1
    ||width>16384||height>16384||!Array.isArray(pixel)||pixel.length!==2
    ||!pixel.every(Number.isFinite)||pixel[0]<0||pixel[0]>width||pixel[1]<0||pixel[1]>height)
    throw Error('Invalid primary ray viewport');
  const vectors={};
  for(const key of ['forward','right','up']){
    if(!Array.isArray(camera?.[key])||camera[key].length!==3||!camera[key].every(Number.isFinite))
      throw Error('E3 primary ray requires three-component camera');
    vectors[key]=enclose(camera[key],cameraError?.[key]);
  }
  const uv=pixel.map((p,i)=>div(sub(mul(I(2),I(p)),I(i===0?width:height)),I(height)));
  return normalize(plus(plus(scale(vectors.forward,I(CONNECTED_FOCAL_SCALE)),
    scale(vectors.right,uv[0])),scale(vectors.up,uv[1])));
}
