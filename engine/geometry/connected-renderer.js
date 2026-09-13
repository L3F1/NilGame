import {packConnectedWorld,CONNECTED_VERTEX,CONNECTED_FRAGMENT} from './connected-shader.js';
import {createSphericalMissPass,sphericalEligibleOwners} from './spherical-miss-pass.js';
import {enclosureConsumer} from './enclosure-renderer-variant.js';
// experimentalH3 opts this renderer into the bounded H3 experiment. Default
// callers keep the existing E3/S3 admission, including its H3 refusal.
export function createConnectedRenderer(canvas,world,{experimentalH3=false,enclosureRefinement=false}={}) {
  const packOptions={experimentalH3};
  let packed=packConnectedWorld(world,packOptions);
  let eligibleOwners=sphericalEligibleOwners(packed);
  const gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:false,antialias:false,preserveDrawingBuffer:true});
  if(!gl)throw Error('Connected preview requires WebGL2');
  gl.disable(gl.DITHER); // Debug packets are bytes, not display colors.
  const program=gl.createProgram();
  for(const [type,source] of [[gl.VERTEX_SHADER,CONNECTED_VERTEX],[gl.FRAGMENT_SHADER,enclosureRefinement?enclosureConsumer(CONNECTED_FRAGMENT):CONNECTED_FRAGMENT]]) {
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
  if(enclosureRefinement)names.push('uMissRadii');
  const loc=Object.fromEntries(names.map(n=>[n,gl.getUniformLocation(program,n)]));
  gl.uniform1i(loc.uData,0);gl.uniform4iv(loc.uCounts,packed.counts);
  gl.uniform1f(loc.uMaxDistance,packed.maxDistance);
  // The exclusion pass is constructed with the renderer but never runs until a
  // draw opts in. Its (initially 1x1, all-zero) textures stay bound so the main
  // program never samples a unit left pointing at unrelated data.
  let revision=0,missStatus='disabled',missConsumingDraws=0,diagnosticTarget=null;
  const missPass=createSphericalMissPass(gl,{enclosure:enclosureRefinement});
  gl.uniform1i(loc.uMissPass,0);
  [['uMissCertificate',missPass.textures.certificate],['uMissPoint',missPass.textures.point],['uMissDirection',missPass.textures.direction],
    ...(enclosureRefinement?[['uMissRadii',missPass.textures.radii]]:[])]
    .forEach(([name,texture],i)=>{
      gl.activeTexture(gl.TEXTURE1+i);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(loc[name],1+i);
    });
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
  const ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'), pending=[], times=[];
  function replaceWorld(nextWorld){
    // Capacity/geometry refusals happen before touching GL or the current packet.
    const next=packConnectedWorld(nextWorld,packOptions),candidate=gl.createTexture();
    const nextEligibleOwners=sphericalEligibleOwners(next);
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
    gl.deleteTexture(texture);texture=candidate;packed=next;eligibleOwners=nextEligibleOwners;
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
  function draw(state,{width=320,height=240,debug=0,timer=false,diagnostics=false,polished=true,ao=true,antialias=false,range,sphericalMissPass=false,aaRefinement=false,certificateFault=0}={}) {
    if(!Number.isInteger(certificateFault)||certificateFault<0||certificateFault>6||certificateFault&&!enclosureRefinement)
      throw Error('Certificate faults require the experimental enclosure renderer and a supported fault ID');
    if(range!==undefined&&(!(range>0)||range>packed.maxDistance))
      throw Error('Draw range must be positive and within the packed budget');
    const resized=canvas.width!==width||canvas.height!==height;
    if(resized){canvas.width=width;canvas.height=height;missPass.invalidate('resized');}
    const maxDistance=range===undefined?packed.maxDistance:range;
    const regionIndex=packed.ids.indexOf(state.regionId);
    const effectiveAA=antialias&&(debug===0||debug===9||debug===10)&&!diagnostics;
    // One GPU query covers BOTH passes; nested elapsed queries are forbidden.
    const query=timer&&ext&&pending.length<16?gl.createQuery():null;
    if(query)gl.beginQuery(ext.TIME_ELAPSED_EXT,query);
    // Generated BEFORE the main draw, for exactly this pose/size/range/world,
    // and consumed by exactly this draw. Nothing is cached between draws.
    missStatus=!sphericalMissPass?'disabled'
      :regionIndex>=0&&packed.texture[(128+regionIndex)*4]!==0?'outside-scope'
      :missPass.generate({dataTexture:texture,counts:packed.counts,eligibleOwners,
        position:state.position,forward:state.camera.forward,right:state.camera.right,up:state.camera.up,
        width,height,maxDistance,regionIndex,revision,offsetX:0,offsetY:0,antialias:effectiveAA,sampleAtlas:effectiveAA&&aaRefinement,timer:false,certificateFault});
    if(missStatus==='generated')missConsumingDraws++;
    // Private float readback target is selected after the exclusion pass, which
    // restores the default framebuffer on exit. Ordinary draws never use it.
    if(diagnosticTarget){gl.bindFramebuffer(gl.FRAMEBUFFER,diagnosticTarget);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);}
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
  function readPrimaryRays(state,width=16,height=12,options={}){
    return Array.from({length:4},(_,component)=>{
      draw(state,{...options,width,height,debug:4+component});
      const bytes=new Uint8Array(width*height*4);
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
      const view=new DataView(bytes.buffer);
      return Float32Array.from({length:width*height},(_,i)=>view.getFloat32(4*i,true));
    });
  }
  // Correlated E3 witness: xyz is the actual primary passed to trace, w its
  // returned distance, all from one invocation. E3 primary.w is identically 0.
  function readE3RayDistance(state,width=16,height=12,options={}){
    const region=packed.ids.indexOf(state.regionId);
    if(region<0||packed.texture[(128+region)*4]!==0)throw Error('Ray/distance witness requires an E3 camera region');
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0)
      throw Error('Ray/distance witness requires positive integer dimensions');
    const metadata={width,height,hardware:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
    if(!gl.getExtension('EXT_color_buffer_float'))return {...metadata,status:'unsupported',values:null};
    const viewportLimit=gl.getParameter(gl.MAX_VIEWPORT_DIMS),textureLimit=gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if(width>textureLimit||height>textureLimit||width>viewportLimit[0]||height>viewportLimit[1])
      throw Error('Ray/distance witness exceeds framebuffer limits');
    const saved={draw:gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),read:gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
      viewport:gl.getParameter(gl.VIEWPORT),unit:gl.getParameter(gl.ACTIVE_TEXTURE),target:diagnosticTarget,
      buffers:Array.from({length:gl.getParameter(gl.MAX_DRAW_BUFFERS)},(_,i)=>gl.getParameter(gl.DRAW_BUFFER0+i))};
    gl.activeTexture(gl.TEXTURE0);saved.texture=gl.getParameter(gl.TEXTURE_BINDING_2D);
    let targetTexture=null,targetFramebuffer=null;
    try{
      targetTexture=gl.createTexture();targetFramebuffer=gl.createFramebuffer();
      if(!targetTexture||!targetFramebuffer)throw Error('Cannot allocate ray/distance witness target');
      gl.bindTexture(gl.TEXTURE_2D,targetTexture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,width,height,0,gl.RGBA,gl.FLOAT,null);
      gl.bindFramebuffer(gl.FRAMEBUFFER,targetFramebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,targetTexture,0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE||gl.getError()!==gl.NO_ERROR)
        throw Error('Ray/distance witness framebuffer unavailable');
      gl.bindTexture(gl.TEXTURE_2D,texture);
      diagnosticTarget=targetFramebuffer;
      draw(state,{...options,width,height,debug:11,timer:false});
      const data=new Float32Array(width*height*4);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.readPixels(0,0,width,height,gl.RGBA,gl.FLOAT,data);
      const error=gl.getError();if(error!==gl.NO_ERROR)throw Error(`Ray/distance witness readback GL error ${error}`);
      return {...metadata,status:'read',values:data};
    }finally{
      diagnosticTarget=saved.target;
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,saved.draw);
      gl.drawBuffers(saved.draw?saved.buffers:[saved.buffers[0]]);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,saved.read);
      gl.viewport(...saved.viewport);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,saved.texture);gl.activeTexture(saved.unit);
      if(targetFramebuffer)gl.deleteFramebuffer(targetFramebuffer);
      if(targetTexture)gl.deleteTexture(targetTexture);
    }
  }
  function readColor(state,width=80,height=60,options={}){
    draw(state,{...options,width,height,debug:0});const pixels=new Uint8Array(width*height*4);
    gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;
  }
  // Debug 8 evidence comes from its OWN draw, not the preceding distance draw.
  // Legacy 'accepted' counts certificates still ACTIVE at trace termination;
  // subsequent crossings clear that flag, but do not clear cumulative omissions.
  // Candidate-minus-active is therefore NOT an identity-rejection count.
  // Default on; diagnostics may explicitly request off. Off candidate textures
  // may be stale and must not be interpreted as evidence for the off draw.
  function readMissPass(state,width=16,height=12,options={}){
    draw(state,{sphericalMissPass:true,...options,width,height,debug:8,antialias:false});
    const bytes=new Uint8Array(width*height*4);
    gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
    let accepted=0,omissions=0,pixels=0;
    for(let i=0;i<width*height;i++){accepted+=bytes[4*i]?1:0;omissions+=bytes[4*i+1];pixels++;}
    return {status:missStatus,accepted,omissions,pixels,candidates:missPass.readCertificates(width,height,options.certificatePixel),bytes};
  }
  function readAAMissPass(state,width=16,height=12){
    draw(state,{width,height,debug:9,antialias:true,sphericalMissPass:true,aaRefinement:true});
    const bytes=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
    draw(state,{width,height,debug:10,antialias:true,sphericalMissPass:true,aaRefinement:true});
    const bySample=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bySample);
    return {status:missStatus,bytes,bySample};
  }
  const info=gl.getExtension('WEBGL_debug_renderer_info');
  return {draw,read,readPrimaryRays,readE3RayDistance,readColor,replaceWorld,readMissPass,readAAMissPass,
    get packed(){return packed;},times,finish:()=>gl.finish(),
    get pendingTimerCount(){return pending.length;},
    missPass:{get status(){return missStatus;},get supported(){return missPass.supported;},
      get consumingDraws(){return missConsumingDraws;},get revision(){return revision;},
      get stats(){const s=missPass.stats;return {...s,reasons:{...s.reasons},gpuMs:[...s.gpuMs]};},
      invalidate:reason=>missPass.invalidate(reason)},hardware:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),timerSupported:!!ext};
}
