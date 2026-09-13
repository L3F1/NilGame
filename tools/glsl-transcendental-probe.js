// REAL BACKEND EVIDENCE FOR ONE DECISION: may a GLSL root envelope use atan and
// acos at all? docs/qa/spherical-hit-band-review.md measured the requirement -
// better than 2^-10 rad absolute at this scene's coefficients - without knowing
// what a backend delivers. This probe measures the delivered accuracy.
//
// Nothing is emulated. Every GPU number comes from a WebGL2 fragment shader
// evaluating atan(y,x) and acos(x) in highp float, read back with gl.readPixels.
// The oracle is binary64 Math.atan2/Math.acos on the SAME binary32 inputs, so
// the difference is the built-in's error plus at most one binary32 rounding of
// its result, not a difference of inputs.
//
// A sampled driver measurement is evidence about these two backends on this
// machine, never a portable guarantee. Admission is the lead's call.
import {compileConnectedCoverWorld} from '../engine/world/connected-cover-world.js';
import {sphericalHitBandCensus} from '../app/spherical-hit-band-census.js';
export const SCENE_PATH='../levels/fixtures/connected-three-geometries.nil.json';
// The requirement the measurement has to clear, from the same review.
export const REQUIRED_ALLOWANCE=2**-10;
export const RELAXED_ALLOWANCE=2**-8;

const VERTEX=`#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}`;
// One sample per pixel: inputs in, both built-ins out. No CPU value enters the
// shader beyond the sample itself, and no result is reduced on the GPU.
const FRAGMENT=`#version 300 es
precision highp float;precision highp int;
uniform highp sampler2D uSamples;
uniform ivec2 uSize;
layout(location=0) out vec4 outValues;
void main(){
  ivec2 texel=ivec2(gl_FragCoord.xy);
  if(texel.x>=uSize.x||texel.y>=uSize.y){outValues=vec4(0);return;}
  vec4 s=texelFetch(uSamples,texel,0);
  outValues=vec4(atan(s.y,s.x),acos(clamp(s.z,-1.,1.)),s.w,1.);
}`;

// The coefficients that actually occur, taken from the census the review used,
// plus a systematic sweep so a spot check cannot be quoted as generality.
export function buildSamples(census){
  const samples=[],push=(kind,a,b,ratio)=>{
    const x=Math.fround(a),y=Math.fround(b),r=Math.fround(ratio);
    if(![x,y,r].every(Number.isFinite)||(x===0&&y===0)||Math.abs(r)>1)return;
    samples.push({kind,a:x,b:y,ratio:r});
  };
  for(const record of census.records)for(const c of record.binary32?.coefficients??[]){
    if(!Number.isFinite(c.a)||!Number.isFinite(c.b))continue;
    const h=Math.hypot(c.a,c.b);
    if(h>0)push(`census:${record.x},${record.y}:${c.owner}`,c.a,c.b,c.c/h);
  }
  // Sweep: phases all round the circle, amplitudes over the admitted magnitude
  // range, and ratios pressed against 1 where acos is most sensitive.
  for(let i=0;i<64;i++){
    const phase=2*Math.PI*i/64;
    for(const amplitude of [.05,.25,1,2]){
      const a=amplitude*Math.cos(phase),b=amplitude*Math.sin(phase);
      for(const gap of [.5,.05,.005,5e-4,5e-5,5e-6])push('sweep',a,b,1-gap);
    }
  }
  for(let i=0;i<=64;i++)push('acos-range',1,0,-1+2*i/64);
  return samples;
}

function compile(gl,type,source,label){
  const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))
    throw Error(`${label}: ${gl.getShaderInfoLog(shader)}`);
  return shader;
}

// Returns absolute errors in radians, per built-in and per sample kind. It draws
// once; a disagreement here is a driver measurement, not a scene result.
export function measureTranscendentals(samples,{gl}){
  const width=Math.min(1024,Math.max(1,samples.length)),height=Math.ceil(samples.length/width);
  if(!gl.getExtension('EXT_color_buffer_float'))throw Error('Probe requires EXT_color_buffer_float');
  const data=new Float32Array(width*height*4);
  samples.forEach((s,i)=>{data.set([s.a,s.b,s.ratio,i],4*i);});
  const input=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,input);
  for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST);
  for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,width,height,0,gl.RGBA,gl.FLOAT,data);
  const output=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,output);
  for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,width,height,0,gl.RGBA,gl.FLOAT,null);
  const program=gl.createProgram();
  for(const [type,source,label] of [[gl.VERTEX_SHADER,VERTEX,'vertex'],[gl.FRAGMENT_SHADER,FRAGMENT,'fragment']]){
    const shader=compile(gl,type,source,label);gl.attachShader(program,shader);gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(`link: ${gl.getProgramInfoLog(program)}`);
  const framebuffer=gl.createFramebuffer();
  const read=new Float32Array(width*height*4);
  try{
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,output,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('incomplete framebuffer');
    gl.useProgram(program);
    gl.viewport(0,0,width,height);
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.SCISSOR_TEST);
    gl.clearBufferfv(gl.COLOR,0,new Float32Array(4));
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,input);
    gl.uniform1i(gl.getUniformLocation(program,'uSamples'),0);
    gl.uniform2i(gl.getUniformLocation(program,'uSize'),width,height);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.readPixels(0,0,width,height,gl.RGBA,gl.FLOAT,read);
    const error=gl.getError();
    if(error!==gl.NO_ERROR)throw Error(`GL error ${error}`);
  }finally{
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.deleteFramebuffer(framebuffer);gl.deleteProgram(program);
    gl.deleteTexture(input);gl.deleteTexture(output);
  }
  const kinds=Object.create(null);
  let worst={atan:null,acos:null},lost=0;
  samples.forEach((s,i)=>{
    // The shader wrote the sample index back; a mismatch means the readback is
    // not the sample, so it is refused rather than averaged in.
    if(read[4*i+3]!==1||read[4*i+2]!==i){lost++;return;}
    const atanError=Math.abs(read[4*i]-Math.atan2(s.b,s.a));
    const acosError=Math.abs(read[4*i+1]-Math.acos(Math.min(1,Math.max(-1,s.ratio))));
    const group=s.kind.startsWith('census')?'census':s.kind;
    const bucket=kinds[group]??(kinds[group]={samples:0,atan:0,acos:0});
    bucket.samples++;
    bucket.atan=Math.max(bucket.atan,atanError);bucket.acos=Math.max(bucket.acos,acosError);
    if(!worst.atan||atanError>worst.atan.error)worst.atan={...s,error:atanError,gpu:read[4*i]};
    if(!worst.acos||acosError>worst.acos.error)worst.acos={...s,error:acosError,gpu:read[4*i+1]};
  });
  return {samples:samples.length,lost,kinds,worst,
    maxAtan:worst.atan?.error??null,maxAcos:worst.acos?.error??null};
}

export async function runProbe({fetchScene=()=>fetch(SCENE_PATH).then(r=>r.json()),
  onProgress=()=>{}}={}){
  onProgress('building the census');
  const world=compileConnectedCoverWorld(await fetchScene(),{experimentalH3:true});
  const start=world.spawn('flat');
  const census=sphericalHitBandCensus({world,
    pose:{regionId:start.regionId,position:start.position,camera:start.camera}});
  const samples=buildSamples(census);
  onProgress(`measuring ${samples.length} samples`);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
  const gl=canvas.getContext('webgl2',{antialias:false});
  if(!gl)throw Error('Transcendental probe requires WebGL2');
  gl.disable(gl.DITHER);
  const info=gl.getExtension('WEBGL_debug_renderer_info');
  const hardware=info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
  try{
    const measurement=measureTranscendentals(samples,{gl});
    const required=Math.max(measurement.maxAtan??Infinity,measurement.maxAcos??Infinity);
    return {label:'glsl-transcendental',hardware,
      requiredAllowance:REQUIRED_ALLOWANCE,relaxedAllowance:RELAXED_ALLOWANCE,
      // The verdict is about THIS backend at these coefficients only.
      clearsRequirement:measurement.lost===0&&required<REQUIRED_ALLOWANCE,
      clearsRelaxed:measurement.lost===0&&required<RELAXED_ALLOWANCE,
      margin:Number.isFinite(required)?REQUIRED_ALLOWANCE/required:null,
      ...measurement,
      scope:'sampled absolute error of atan/acos on one backend and one machine; '
        +'not a portable precision guarantee, not a rendering or ordering result'};
  }finally{gl.getExtension('WEBGL_lose_context')?.loseContext();}
}
