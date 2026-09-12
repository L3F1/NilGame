import {packConnectedWorld,CONNECTED_VERTEX,CONNECTED_FRAGMENT} from './connected-shader.js';
import {createSphericalMissPass} from './spherical-miss-pass.js';
// experimentalH3 opts this renderer into the bounded H3 experiment. Default
// callers keep the existing E3/S3 admission, including its H3 refusal.
export function createConnectedRenderer(canvas,world,{experimentalH3=false}={}) {
  const packOptions={experimentalH3};
  let packed=packConnectedWorld(world,packOptions);
  const gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:false,antialias:false,preserveDrawingBuffer:true});
  if(!gl)throw Error('Connected preview requires WebGL2');
  gl.disable(gl.DITHER); // Debug packets are bytes, not display colors.
  const program=gl.createProgram();
  for(const [type,source] of [[gl.VERTEX_SHADER,CONNECTED_VERTEX],[gl.FRAGMENT_SHADER,CONNECTED_FRAGMENT]]) {
    const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program,shader);gl.deleteShader(shader);
  }
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  let texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,224,1,0,gl.RGBA,gl.FLOAT,packed.texture);
  const names=['uData','uCounts','uPosition','uForward','uRight','uUp','uResolution','uRegion','uDebug','uDiagnostics','uMaxDistance','uPolished','uAO','uAntialias',
    'uMissCertificate','uMissPoint','uMissDirection','uMissPass'];
  const loc=Object.fromEntries(names.map(n=>[n,gl.getUniformLocation(program,n)]));
  gl.uniform1i(loc.uData,0);gl.uniform4iv(loc.uCounts,packed.counts);
  gl.uniform1f(loc.uMaxDistance,packed.maxDistance);
  // The exclusion pass is constructed with the renderer but never runs until a
  // draw opts in. Its (initially 1x1, all-zero) textures stay bound so the main
  // program never samples a unit left pointing at unrelated data.
  let revision=0,missStatus='disabled',missConsumingDraws=0;
  const missPass=createSphericalMissPass(gl);
  gl.uniform1i(loc.uMissPass,0);
  [['uMissCertificate',missPass.textures.certificate],['uMissPoint',missPass.textures.point],['uMissDirection',missPass.textures.direction]]
    .forEach(([name,texture],i)=>{
      gl.activeTexture(gl.TEXTURE1+i);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(loc[name],1+i);
    });
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
  const ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'), pending=[], times=[];
  function replaceWorld(nextWorld){
    // Capacity/geometry refusals happen before touching GL or the current packet.
    const next=packConnectedWorld(nextWorld,packOptions),candidate=gl.createTexture();
    if(!candidate)throw Error('Cannot allocate connected world texture');
    try{
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,candidate);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,224,1,0,gl.RGBA,gl.FLOAT,next.texture);
      gl.useProgram(program);gl.uniform4iv(loc.uCounts,next.counts);gl.uniform1f(loc.uMaxDistance,next.maxDistance);
      const error=gl.getError();if(error!==gl.NO_ERROR)throw Error(`Connected update GL error ${error}`);
    }catch(error){
      gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform4iv(loc.uCounts,packed.counts);gl.uniform1f(loc.uMaxDistance,packed.maxDistance);
      gl.deleteTexture(candidate);throw error;
    }
    gl.deleteTexture(texture);texture=candidate;packed=next;
    // A replaced world invalidates every certificate: they were proved against
    // the previous packed rows. The revision also changes, so no association
    // from before the replacement can ever match again.
    revision++;missPass.invalidate('world-replaced');
    for(const q of pending)gl.deleteQuery(q);pending.length=0;times.length=0;
  }
  // range overrides the packed ray budget for one draw, so a probe can compare
  // against a CPU query made with the same maxDistance. It never widens it.
  // sphericalMissPass opts THIS draw into the separately drawn first-transfer
  // exclusion pass. Default false; there is no automatic admission, and a
  // refusal always renders through the existing path unchanged.
  function draw(state,{width=320,height=240,debug=0,timer=false,diagnostics=false,polished=true,ao=true,antialias=false,range,sphericalMissPass=false}={}) {
    if(range!==undefined&&(!(range>0)||range>packed.maxDistance))
      throw Error('Draw range must be positive and within the packed budget');
    const resized=canvas.width!==width||canvas.height!==height;
    if(resized){canvas.width=width;canvas.height=height;missPass.invalidate('resized');}
    const maxDistance=range===undefined?packed.maxDistance:range;
    const regionIndex=packed.ids.indexOf(state.regionId);
    // One GPU query covers BOTH passes; nested elapsed queries are forbidden.
    const query=timer&&ext&&pending.length<16?gl.createQuery():null;
    if(query)gl.beginQuery(ext.TIME_ELAPSED_EXT,query);
    // Generated BEFORE the main draw, for exactly this pose/size/range/world,
    // and consumed by exactly this draw. Nothing is cached between draws.
    missStatus=!sphericalMissPass?'disabled'
      :regionIndex>=0&&packed.texture[(128+regionIndex)*4]!==0?'outside-scope'
      :missPass.generate({dataTexture:texture,counts:packed.counts,
        position:state.position,forward:state.camera.forward,right:state.camera.right,up:state.camera.up,
        width,height,maxDistance,regionIndex,revision,offsetX:0,offsetY:0,antialias,timer:false});
    if(missStatus==='generated')missConsumingDraws++;
    gl.viewport(0,0,width,height);gl.useProgram(program);
    gl.uniform1i(loc.uMissPass,missStatus==='generated'?1:0);
    gl.uniform1f(loc.uMaxDistance,maxDistance);
    for(const [key,vector] of [['uPosition',state.position],['uForward',state.camera.forward],['uRight',state.camera.right],['uUp',state.camera.up]])
      gl.uniform4fv(loc[key],[...vector,...Array(4-vector.length).fill(0)]);
    gl.uniform2f(loc.uResolution,width,height);gl.uniform1i(loc.uRegion,regionIndex);gl.uniform1i(loc.uDebug,debug);
    gl.uniform1i(loc.uDiagnostics,diagnostics?1:0);
    gl.uniform1i(loc.uPolished,polished?1:0);gl.uniform1i(loc.uAO,ao?1:0);
    gl.uniform1i(loc.uAntialias,antialias?1:0);
    gl.drawArrays(gl.TRIANGLES,0,3);
    if(query){gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push(query);}
    const disjoint=ext&&gl.getParameter(ext.GPU_DISJOINT_EXT);
    if(disjoint){for(const q of pending)gl.deleteQuery(q);pending.length=0;}
    while(pending.length&&gl.getQueryParameter(pending[0],gl.QUERY_RESULT_AVAILABLE)){
      const q=pending.shift();if(!disjoint)times.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);
    }
    const error=gl.getError();if(error!==gl.NO_ERROR)throw Error(`Connected GL error ${error}`);
  }
  // debug 3 is the NORMAL packet. For an H3 hit the shader writes the bounded
  // local-frame encoding (hyperbolic-gpu.js h3LocalFrame), because an ambient
  // unit H3 tangent does not fit n*.5+.5 in RGBA8; its alpha byte is 255 so a
  // reader can tell the two encodings apart without guessing.
  function read(state,width=16,height=12,options={}) {
    draw(state,{...options,width,height,debug:1});const pixels=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    draw(state,{...options,width,height,debug:2});const bytes=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
    draw(state,{...options,width,height,debug:3});const normals=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,normals);
    return {pixels,distances:new Float32Array(bytes.buffer),normals};
  }
  function readPrimaryRays(state,width=16,height=12){
    return Array.from({length:4},(_,component)=>{
      draw(state,{width,height,debug:4+component});
      const bytes=new Uint8Array(width*height*4);
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
      const view=new DataView(bytes.buffer);
      return Float32Array.from({length:width*height},(_,i)=>view.getFloat32(4*i,true));
    });
  }
  function readColor(state,width=80,height=60,options={}){
    draw(state,{...options,width,height,debug:0});const pixels=new Uint8Array(width*height*4);
    gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;
  }
  // Exclusion evidence for check mode: per pixel, whether the main program
  // ACCEPTED a certificate at its first transfer and how many primitives that
  // certificate omitted. Distinct from the pass's own candidate count, which is
  // read from the certificate texture; the gap between them is the identity
  // rejections (wrong portal, differing transfer result).
  function readMissPass(state,width=16,height=12,options={}){
    draw(state,{...options,width,height,debug:8,antialias:false,sphericalMissPass:true});
    const bytes=new Uint8Array(width*height*4);
    gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
    let accepted=0,omissions=0,pixels=0;
    for(let i=0;i<width*height;i++){accepted+=bytes[4*i]?1:0;omissions+=bytes[4*i+1];pixels++;}
    return {status:missStatus,accepted,omissions,pixels,candidates:missPass.readCertificates(width,height),bytes};
  }
  const info=gl.getExtension('WEBGL_debug_renderer_info');
  return {draw,read,readPrimaryRays,readColor,replaceWorld,readMissPass,
    get packed(){return packed;},times,finish:()=>gl.finish(),
    missPass:{get status(){return missStatus;},get supported(){return missPass.supported;},
      get consumingDraws(){return missConsumingDraws;},get revision(){return revision;},
      get stats(){const s=missPass.stats;return {...s,reasons:{...s.reasons},gpuMs:[...s.gpuMs]};},
      invalidate:reason=>missPass.invalidate(reason)},hardware:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),timerSupported:!!ext};
}
