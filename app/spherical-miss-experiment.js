import {SPHERICAL_MISS_GLSL} from './spherical-miss-experiment-glsl.js';
import {CONNECTED_FOCAL_SCALE} from '../engine/geometry/primary-ray-bounds.js';
import {E3_S3_TRANSFER_GLSL} from '../engine/geometry/portal-transfer-gpu.js';
import {packConnectedWorld,CONNECTED_VERTEX} from '../engine/geometry/connected-shader.js';
import {createConnectedGlobalPreview,pixelDirection} from './connected-global-model.js';

// Only test mode calls this. Each sample is a FIRST E3 -> S3 crossing and one
// candidate ball; no certificate is fed back into production rendering.
export function checkSphericalMissExperiment(census){
  const model=createConnectedGlobalPreview(census.document,{experimentalH3:true}),world=model.world;
  const packed=packConnectedWorld(world,{experimentalH3:true});
  const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;
  const gl=canvas.getContext('webgl2',{antialias:false,premultipliedAlpha:false});
  if(!gl)throw Error('Miss experiment requires WebGL2');gl.disable(gl.DITHER);
  const started=performance.now(),times={};
  const fragment=`#version 300 es
precision highp float;precision highp int;
uniform highp sampler2D uData;
uniform vec4 uPosition,uForward,uRight,uUp;
uniform vec2 uResolution,uPixel;
uniform float uMaxDistance;
uniform int uGate,uSurface,uMutant;
out vec4 frag;
vec4 D(int i){return texelFetch(uData,ivec2(i,0),0);}
const float FOCAL_SCALE=${CONNECTED_FOCAL_SCALE.toPrecision(17)};
${E3_S3_TRANSFER_GLSL}
${SPHERICAL_MISS_GLSL}
void main(){
  boundPixel=uPixel;boundGate=uGate;boundTried=false;boundOK=false;
  vec2 uv=(2.*uPixel-uResolution)/uResolution.y;
  vec4 u=normalize(uForward*FOCAL_SCALE+uRight*uv.x+uUp*uv.y);
  int base=132+uGate*10;vec4 c=D(base+1),n=D(base+4),info=D(base),dest=D(128+int(info.y));
  float t=-dot(uPosition-c,n)/dot(u,n);boundDistance=t;
  bool eligible=e3S3TransferSelected(uPosition.xyz,u.xyz,c.xyz,D(base+2).xyz,D(base+3).xyz,n.xyz,
    D(base+5),D(base+6),D(base+7),D(base+8),dest.y,t,boundPoint,boundDirection);
  bool bounded=eligible&&firstTransferBands();
  // Packed S3 solid uses -centre and -cos(radius/R). Convert BOTH signs.
  bool excluded=bounded&&sphericalMiss(-D(2*uSurface),-D(2*uSurface+1).z);
  if(uMutant==1)excluded=bounded;
  frag=vec4(bounded?1.:0.,excluded?1.:0.,0.,255.)/255.;
}`;
  const program=gl.createProgram(),texture=gl.createTexture();
  try{
    for(const [type,source,label] of [[gl.VERTEX_SHADER,CONNECTED_VERTEX,'vertex'],[gl.FRAGMENT_SHADER,fragment,'fragment']]){
      const t=performance.now(),s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(label+': '+gl.getShaderInfoLog(s));
      times[label+'CompileMs']=performance.now()-t;gl.attachShader(program,s);gl.deleteShader(s);
    }
    const linkStart=performance.now();gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('miss experiment link: '+gl.getProgramInfoLog(program));
    times.linkMs=performance.now()-linkStart;gl.useProgram(program);gl.viewport(0,0,1,1);
    gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,224,1,0,gl.RGBA,gl.FLOAT,packed.texture);
    const loc=n=>gl.getUniformLocation(program,n),pad=v=>[...v,...Array(4-v.length).fill(0)];
    for(const [key,v] of Object.entries({uPosition:census.pose.position,uForward:census.pose.forward,uRight:census.pose.right,uUp:census.pose.up}))gl.uniform4fv(loc(key),pad(v));
    gl.uniform1i(loc('uData'),0);gl.uniform2f(loc('uResolution'),census.width,census.height);gl.uniform1f(loc('uMaxDistance'),census.range);
    let checked=0,bounded=0,excluded=0,misses=0,hits=0,outsideAperture=0,mutationCaught=false;
    const cases=[];
    for(const yaw of [0,-.025,.025]){
    const pose={...census.pose,
      forward:census.pose.forward.map((v,k)=>v*Math.cos(yaw)+census.pose.right[k]*Math.sin(yaw)),
      right:census.pose.right.map((v,k)=>v*Math.cos(yaw)-census.pose.forward[k]*Math.sin(yaw))};
    for(const sample of census.samples){
      const crossing=sample.crossings?.[0];if(!crossing)continue;
      const gateIndex=world.portals.findIndex(g=>g.fromId===crossing.fromId);
      const region=world.regions.get(crossing.toRegionId),source=world.regions.get(crossing.fromRegionId);
      if(gateIndex<0||source.space.kind!=='e3'||region.space.kind!=='s3')continue;
      const direction=pixelDirection(source.space,pose.position,pose,census.width,census.height,sample.x,sample.y);
      const frame=world.portals[gateIndex].renderData();
      const dot=(a,b)=>a.reduce((sum,v,k)=>sum+v*b[k],0);
      const t=-dot(pose.position.map((v,k)=>v-frame.center[k]),frame.normal)/dot(direction,frame.normal);
      const at=pose.position.map((v,k)=>v+t*direction[k]);
      // Rotated views can leave the nominated aperture: those cases must refuse.
      // No aperture is certified against other surfaces/portals in the scene.
      const eligible=t>0&&Math.hypot(...at.map((v,k)=>v-frame.center[k]))<frame.radius;
      const mapped=eligible?world.portals[gateIndex].transit(at):null,p=mapped?.position,u=mapped?region.space.normalize(p,mapped.carry(direction)):null;
      for(const candidate of sample.sphericalGuardCandidates){
        const ball=region.balls.find(b=>b.id===candidate.id),owner=packed.primitiveIds.indexOf(candidate.id);
        const a=p?p.reduce((s,v,k)=>s+v*ball.center[k],0):0,b=u?u.reduce((s,v,k)=>s+v*ball.center[k],0):0;
        const hasRoots=eligible?Math.hypot(a,b)>=Math.cos(ball.radius/region.space.curvatureRadius):null;
        const surface=packed.texture[4*(96+owner)];cases.push({sample,gateIndex,surface,hasRoots,eligible,pose,yaw});
      }
    }
    }
    function read(c,mutant){
      for(const [key,v] of Object.entries({uForward:c.pose.forward,uRight:c.pose.right,uUp:c.pose.up}))gl.uniform4fv(loc(key),pad(v));
      gl.uniform2f(loc('uPixel'),c.sample.x+.5,c.sample.y+.5);gl.uniform1i(loc('uGate'),c.gateIndex);gl.uniform1i(loc('uSurface'),c.surface);gl.uniform1i(loc('uMutant'),mutant?1:0);
      gl.drawArrays(gl.TRIANGLES,0,3);const bytes=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
      if(gl.getError()!==gl.NO_ERROR||bytes[3]!==255)throw Error('Miss experiment readback failed');return bytes;
    }
    for(const c of cases){
      const t=performance.now(),value=read(c,false);if(!checked)times.firstDrawReadMs=performance.now()-t;
      checked++;bounded+=value[0];excluded+=value[1];if(c.hasRoots===true)hits++;else if(c.hasRoots===false)misses++;else outsideAperture++;
      if(!c.eligible&&value[0])throw Error(`Out-of-aperture bounds accepted at ${c.sample.x},${c.sample.y}`);
      if(value[1]&&c.hasRoots)throw Error(`Unsafe spherical exclusion at ${c.sample.x},${c.sample.y}`);
    }
    for(const c of cases.filter(c=>c.hasRoots)){if(read(c,true)[1]){mutationCaught=true;break;}}
    if(!checked||!hits||!misses||!excluded||!mutationCaught)throw Error('Miss experiment lacks mixed cases or negative witness');
    return {label:'spherical-miss-small-program',checked,views:3,bounded,excluded,outsideAperture,rootCandidates:hits,missCandidates:misses,mutationCaught,times,totalWallMs:performance.now()-started,
      scope:'sampled first-crossing candidate balls; not used by live rendering'};
  }finally{gl.deleteProgram(program);gl.deleteTexture(texture);gl.getExtension('WEBGL_lose_context')?.loseContext();}
}
