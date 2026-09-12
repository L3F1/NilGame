import {CONNECTED_VERTEX} from './connected-shader.js';
import {SPHERICAL_MISS_PASS_FRAGMENT,SPHERICAL_MISS_CERTIFICATE_TAG} from './spherical-miss-pass-glsl.js';
export {SPHERICAL_MISS_CERTIFICATE_TAG};
// Scene topology only: compute once per packed-world revision, not per ray.
// An owner used as any modifier, or as a modified base, is never eligible.
export function sphericalEligibleOwners(packed){
  const d=packed.texture;let bases=0,forbidden=0,balls=0;
  for(let g=0;g<packed.counts[2];g++){
    const at=4*(112+g),base=d[at],subtract=d[at+1],intersect=d[at+2];
    bases|=1<<base;forbidden|=subtract|intersect;
    if(subtract||intersect)forbidden|=1<<base;
  }
  for(let j=0;j<packed.counts[1];j++){
    const at=4*(96+j);
    if(d[at+1]===1&&d[at+3]>=.5)balls|=1<<j;
  }
  return bases&balls&~forbidden;
}
// Separately drawn first-transfer exclusion pass for the live connected
// renderer. It never replaces an intersection: every certificate is a proved
// miss of ONE packed additive S3 ball surface for ONE pixel's first stable
// E3 -> S3 transfer, and the main program discards it unless the portal index
// and the transfer result it recomputes match exactly.
//
// Association is the full draw description: packed world texture identity and
// revision, camera pose, region, range, viewport and the centre sample offset.
// A certificate set is generated for exactly one draw and is never reused, so a
// debug/readback draw at a different pose or size cannot consume it.
export const SPHERICAL_MISS_PASS_OFFSET=Object.freeze([0,0]);
const KEY_FIELDS=['revision','regionIndex','width','height','maxDistance','offsetX','offsetY'];
function associationKey(request){
  const pose=[...request.position,...request.forward,...request.right,...request.up];
  return [...KEY_FIELDS.map(f=>request[f]),...pose].join('|');
}
export function createSphericalMissPass(gl){
  const float=gl.getExtension('EXT_color_buffer_float');
  const stats={draws:0,generated:0,refused:0,reasons:Object.create(null),lastStatus:'never-run',
    lastAssociation:null,gpuStatus:'unknown',gpuMs:[]};
  const note=status=>{stats.lastStatus=status;stats.reasons[status]=(stats.reasons[status]||0)+1;
    if(status==='generated')stats.generated++;else stats.refused++;return status;};
  // The textures exist even when the pass is unsupported, so the main program
  // always has a bound, readable (all-zero) sampler and never samples a unit
  // that was left pointing at an unrelated texture.
  const certificate=gl.createTexture(),point=gl.createTexture(),direction=gl.createTexture();
  const targets=[{texture:certificate,internal:gl.RGBA32UI,format:gl.RGBA_INTEGER,type:gl.UNSIGNED_INT},
    {texture:point,internal:gl.RGBA32F,format:gl.RGBA,type:gl.FLOAT},
    {texture:direction,internal:gl.RGBA32F,format:gl.RGBA,type:gl.FLOAT}];
  let sized=null,framebuffer=null,program=null,loc=null,disposed=false;
  function allocate(width,height){
    for(const target of targets){
      gl.bindTexture(gl.TEXTURE_2D,target.texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,target.internal,width,height,0,target.format,target.type,null);
    }
    sized={width,height};
  }
  allocate(1,1);
  function build(){
    if(program)return program;
    const created=gl.createProgram();
    for(const [type,source,label] of [[gl.VERTEX_SHADER,CONNECTED_VERTEX,'vertex'],[gl.FRAGMENT_SHADER,SPHERICAL_MISS_PASS_FRAGMENT,'fragment']]){
      const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(`Spherical miss pass ${label}: ${gl.getShaderInfoLog(shader)}`);
      gl.attachShader(created,shader);gl.deleteShader(shader);
    }
    gl.linkProgram(created);
    if(!gl.getProgramParameter(created,gl.LINK_STATUS))throw Error(`Spherical miss pass link: ${gl.getProgramInfoLog(created)}`);
    program=created;
    loc=Object.fromEntries(['uData','uCounts','uPosition','uForward','uRight','uUp','uResolution','uMaxDistance','uRegion','uEligibleOwners']
      .map(name=>[name,gl.getUniformLocation(program,name)]));
    framebuffer=gl.createFramebuffer();
    return program;
  }
  const timerExt=gl.getExtension('EXT_disjoint_timer_query_webgl2'),pending=[];
  function collectTimes(){
    if(!timerExt)return;
    if(gl.getParameter(timerExt.GPU_DISJOINT_EXT)){
      for(const q of pending)gl.deleteQuery(q);pending.length=0;stats.gpuStatus='disjoint';return;
    }
    while(pending.length&&gl.getQueryParameter(pending[0],gl.QUERY_RESULT_AVAILABLE)){
      const q=pending.shift();stats.gpuMs.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);
      gl.deleteQuery(q);stats.gpuStatus='measured';
    }
  }
  // Returns 'generated' when a fresh certificate set for exactly this request is
  // bound, or a refusal status. Any status other than 'generated' means the
  // caller must run the main draw with consumption switched OFF.
  function generate(request){
    if(disposed)return note('disposed');
    stats.draws++;
    const {dataTexture,counts,position,forward,right,up,width,height,maxDistance,regionIndex,timer=false}=request;
    stats.lastAssociation=null;
    if(!float)return note('unsupported');
    if(!dataTexture)return note('missing-world');
    if(!(width>0&&height>0))return note('invalid-size');
    if(!(maxDistance>0))return note('invalid-range');
    if(!(regionIndex>=0))return note('unknown-region');
    if(request.offsetX!==0||request.offsetY!==0)return note('offset-samples');
    // First delivery refuses antialiasing outright: these certificates are about
    // the centre sample, and centre-sample data must never reach an AA sample.
    if(request.antialias)return note('antialias-refused');
    try{build();}catch(error){stats.lastError=error.message;return note('program-failed');}
    const savedViewport=gl.getParameter(gl.VIEWPORT);
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
    try{
      if(!sized||sized.width!==width||sized.height!==height){allocate(width,height);}
      targets.forEach((target,i)=>gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,target.texture,0));
      gl.drawBuffers(targets.map((_,i)=>gl.COLOR_ATTACHMENT0+i));
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)return note('incomplete-framebuffer');
      gl.useProgram(program);
      gl.viewport(0,0,width,height);
      gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.SCISSOR_TEST);
      // Clear first: a resized or partially drawn attachment must never leave a
      // pixel whose tag survives from an older pose.
      gl.clearBufferuiv(gl.COLOR,0,new Uint32Array(4));
      gl.clearBufferfv(gl.COLOR,1,new Float32Array(4));
      gl.clearBufferfv(gl.COLOR,2,new Float32Array(4));
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,dataTexture);
      gl.uniform1i(loc.uData,0);gl.uniform4iv(loc.uCounts,counts);
      const pad=v=>[...v,...Array(4-v.length).fill(0)];
      gl.uniform4fv(loc.uPosition,pad(position));gl.uniform4fv(loc.uForward,pad(forward));
      gl.uniform4fv(loc.uRight,pad(right));gl.uniform4fv(loc.uUp,pad(up));
      gl.uniform2f(loc.uResolution,width,height);
      gl.uniform1f(loc.uMaxDistance,maxDistance);gl.uniform1i(loc.uRegion,regionIndex);
      gl.uniform1i(loc.uEligibleOwners,request.eligibleOwners??0);
      const query=timer&&timerExt&&pending.length<16?gl.createQuery():null;
      if(query)gl.beginQuery(timerExt.TIME_ELAPSED_EXT,query);
      gl.drawArrays(gl.TRIANGLES,0,3);
      if(query){gl.endQuery(timerExt.TIME_ELAPSED_EXT);pending.push(query);}
      const error=gl.getError();
      if(error!==gl.NO_ERROR){stats.lastError=`GL error ${error}`;return note('gl-error');}
    }finally{
      // Restore everything the main draw relies on BEFORE it runs.
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.drawBuffers([gl.BACK]);
      gl.viewport(savedViewport[0],savedViewport[1],savedViewport[2],savedViewport[3]);
      gl.activeTexture(gl.TEXTURE0);
      if(request.dataTexture)gl.bindTexture(gl.TEXTURE_2D,request.dataTexture);
    }
    collectTimes();
    if(timer&&timerExt&&stats.gpuStatus==='unknown')stats.gpuStatus='pending';
    if(!timerExt)stats.gpuStatus='unsupported';
    stats.lastAssociation=associationKey(request);
    return note('generated');
  }
  // Certificates are generated per draw and never cached, so invalidation is a
  // bookkeeping reset; world replacement and resize call it to make a stale
  // association impossible to match even if generation is later made lazy.
  function invalidate(reason='invalidated'){
    stats.lastAssociation=null;stats.lastStatus=reason;
    for(const q of pending)gl.deleteQuery(q);pending.length=0;
  }
  // Candidate evidence: how many pixels the pass itself certified, and how many
  // surface bits it set, for the certificates currently in the attachments. Read
  // only; it restores the default framebuffer and never feeds the main draw.
  function readCertificates(width,height,pixel){
    if(!framebuffer||!sized||sized.width!==width||sized.height!==height)
      return {pixels:0,certified:0,surfaces:0,status:'unavailable'};
    const data=new Uint32Array(width*height*4);
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0,0,width,height,gl.RGBA_INTEGER,gl.UNSIGNED_INT,data);
    const error=gl.getError();
    // readBuffer is per-framebuffer state; only the binding needs restoring.
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.drawBuffers([gl.BACK]);
    if(error!==gl.NO_ERROR)return {pixels:width*height,certified:0,surfaces:0,status:`gl-error ${error}`};
    let certified=0,surfaces=0;
    const bits=v=>{let n=0;for(let b=0;b<32;b++)if(v&(1<<b))n++;return n;};
    for(let i=0;i<width*height;i++){
      if(data[4*i+3]!==SPHERICAL_MISS_CERTIFICATE_TAG||data[4*i]===0)continue;
      certified++;surfaces+=bits(data[4*i+1])+bits(data[4*i+2]);
    }
    return {pixels:width*height,certified,surfaces,status:'read',
      ...(Number.isInteger(pixel)&&pixel>=0&&pixel<width*height?{sample:[...data.slice(4*pixel,4*pixel+4)]}:{})};
  }
  function dispose(){
    if(disposed)return;disposed=true;invalidate('disposed');
    if(framebuffer)gl.deleteFramebuffer(framebuffer);
    if(program)gl.deleteProgram(program);
    for(const target of targets)gl.deleteTexture(target.texture);
  }
  return {generate,invalidate,dispose,stats,associationKey,readCertificates,
    get supported(){return !!float;},
    get size(){return sized&&{...sized};},
    textures:{certificate,point,direction}};
}
