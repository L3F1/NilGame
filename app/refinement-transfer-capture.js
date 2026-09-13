import {SPHERICAL_MISS_GLSL} from '../engine/geometry/spherical-miss-pass-glsl.js';
import {PRIMARY_NORMALIZATION_GLSL} from '../engine/geometry/primary-normalization.js';
import {CONNECTED_FOCAL_SCALE} from '../engine/geometry/primary-ray-bounds.js';
import {E3_S3_TRANSFER_GLSL} from '../engine/geometry/portal-transfer-gpu.js';
import {packConnectedWorld,CONNECTED_VERTEX} from '../engine/geometry/connected-shader.js';
import {createConnectedGlobalPreview} from './connected-global-model.js';

// Test-only capture. Each record's nominal and BOTH endpoints come from one
// fragment invocation. Point/direction records are not claimed to be one ray.
export function captureTransferEnclosureBands(census){
  const model=createConnectedGlobalPreview(census.document,{experimentalH3:true});
  const packed=packConnectedWorld(model.world,{experimentalH3:true});
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
  const gl=canvas.getContext('webgl2',{antialias:false});
  if(!gl||!gl.getExtension('EXT_color_buffer_float'))throw Error('Transfer capture needs float targets');
  const textures=[],shaders=[],program=gl.createProgram(),fb=gl.createFramebuffer();
  const fragment=`#version 300 es
precision highp float;precision highp int;
uniform highp sampler2D uData;
uniform vec4 uPosition,uForward,uRight,uUp;
uniform vec2 uResolution,uPixel;
uniform float uMaxDistance;
uniform int uGate,uBand;
layout(location=0) out vec4 nominal;
layout(location=1) out vec4 lower;
layout(location=2) out vec4 upper;
layout(location=3) out vec4 status;
vec4 D(int i){return texelFetch(uData,ivec2(i,0),0);}
const float FOCAL_SCALE=${CONNECTED_FOCAL_SCALE.toPrecision(17)};
${PRIMARY_NORMALIZATION_GLSL}
${E3_S3_TRANSFER_GLSL}
${SPHERICAL_MISS_GLSL}
void main(){
  nominal=lower=upper=status=vec4(0);
  boundPixel=uPixel;boundGate=uGate;boundTried=false;boundOK=false;
  vec2 uv=(2.*uPixel-uResolution)/uResolution.y;
  vec4 u=euclideanPrimaryUnit(uForward*FOCAL_SCALE+uRight*uv.x+uUp*uv.y);
  int base=132+uGate*10;vec4 c=D(base+1),n=D(base+4),info=D(base),dest=D(128+int(info.y));
  boundDistance=-dot(uPosition-c,n)/dot(u,n);
  if(!e3S3TransferSelected(uPosition.xyz,u.xyz,c.xyz,D(base+2).xyz,D(base+3).xyz,n.xyz,
    D(base+5),D(base+6),D(base+7),D(base+8),dest.y,boundDistance,boundPoint,boundDirection))return;
  if(!firstTransferBands())return;
  BI band=rayPointBand;if(uBand!=0)band=rayDirectionBand;
  nominal=uBand==0?boundPoint:boundDirection;lower=band.lo;upper=band.hi;status=vec4(1);
}`;
  try{
    gl.disable(gl.DITHER);
    for(const [type,source] of [[gl.VERTEX_SHADER,CONNECTED_VERTEX],[gl.FRAGMENT_SHADER,fragment]]){
      const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(program,s);
    }
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
    const makeTexture=()=>{const t=gl.createTexture();textures.push(t);gl.bindTexture(gl.TEXTURE_2D,t);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);return t;};
    for(let k=0;k<4;k++){const t=makeTexture();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,1,1,0,gl.RGBA,gl.FLOAT,null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+k,gl.TEXTURE_2D,t,0);}
    gl.drawBuffers([0,1,2,3].map(k=>gl.COLOR_ATTACHMENT0+k));
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Transfer capture framebuffer incomplete');
    makeTexture();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,224,1,0,gl.RGBA,gl.FLOAT,packed.texture);
    const loc=n=>gl.getUniformLocation(program,n),pad=v=>[...v,...Array(4-v.length).fill(0)];
    gl.uniform1i(loc('uData'),0);gl.uniform2f(loc('uResolution'),census.width,census.height);
    gl.uniform1f(loc('uMaxDistance'),census.range);gl.uniform4fv(loc('uPosition'),pad(census.pose.position));gl.viewport(0,0,1,1);
    const records=[];let refused=0;
    for(const yaw of [0,-.025,.025]){
      const forward=census.pose.forward.map((v,k)=>v*Math.cos(yaw)+census.pose.right[k]*Math.sin(yaw));
      const right=census.pose.right.map((v,k)=>v*Math.cos(yaw)-census.pose.forward[k]*Math.sin(yaw));
      gl.uniform4fv(loc('uForward'),pad(forward));gl.uniform4fv(loc('uRight'),pad(right));gl.uniform4fv(loc('uUp'),pad(census.pose.up));
      for(const sample of census.samples){
        const crossing=sample.crossings?.[0];if(!crossing)continue;
        const gate=model.world.portals.findIndex(g=>g.fromId===crossing.fromId);
        if(gate<0||model.world.regions.get(crossing.fromRegionId).space.kind!=='e3'
          ||model.world.regions.get(crossing.toRegionId).space.kind!=='s3')continue;
        gl.uniform1i(loc('uGate'),gate);gl.uniform2f(loc('uPixel'),sample.x+.5,sample.y+.5);
        for(let band=0;band<2;band++){
          gl.uniform1i(loc('uBand'),band);gl.drawArrays(gl.TRIANGLES,0,3);
          const values=[0,1,2,3].map(k=>{gl.readBuffer(gl.COLOR_ATTACHMENT0+k);const a=new Float32Array(4);
            gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,a);return [...a];});
          if(gl.getError()!==gl.NO_ERROR)throw Error('Transfer capture readback failed');
          if(values[3][0]!==1){refused++;continue;}
          records.push({q:values[0],lo:values[1],hi:values[2],band,yaw,pixel:[sample.x,sample.y],gate});
        }
      }
    }
    if(!records.length)throw Error('No actual transfer bands captured');
    return {records,refused};
  }finally{shaders.forEach(s=>gl.deleteShader(s));textures.forEach(t=>gl.deleteTexture(t));gl.deleteFramebuffer(fb);gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();}
}
