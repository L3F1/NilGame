import {packConnectedWorld,CONNECTED_VERTEX,CONNECTED_FRAGMENT} from './connected-shader.js';
export function createConnectedRenderer(canvas,world) {
  const gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:false,antialias:false,preserveDrawingBuffer:true});
  if(!gl)throw Error('Connected preview requires WebGL2');
  gl.disable(gl.DITHER); // Debug packets are bytes, not display colors.
  const packed=packConnectedWorld(world), program=gl.createProgram();
  for(const [type,source] of [[gl.VERTEX_SHADER,CONNECTED_VERTEX],[gl.FRAGMENT_SHADER,CONNECTED_FRAGMENT]]) {
    const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program,shader);gl.deleteShader(shader);
  }
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,224,1,0,gl.RGBA,gl.FLOAT,packed.texture);
  const names=['uData','uCounts','uPosition','uForward','uRight','uUp','uResolution','uRegion','uDebug'];
  const loc=Object.fromEntries(names.map(n=>[n,gl.getUniformLocation(program,n)]));
  gl.uniform1i(loc.uData,0);gl.uniform4iv(loc.uCounts,packed.counts);
  const ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'), pending=[], times=[];
  function draw(state,{width=320,height=240,debug=0,timer=false}={}) {
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    gl.viewport(0,0,width,height);gl.useProgram(program);
    for(const [key,vector] of [['uPosition',state.position],['uForward',state.camera.forward],['uRight',state.camera.right],['uUp',state.camera.up]])
      gl.uniform4fv(loc[key],[...vector,...Array(4-vector.length).fill(0)]);
    gl.uniform2f(loc.uResolution,width,height);gl.uniform1i(loc.uRegion,packed.ids.indexOf(state.regionId));gl.uniform1i(loc.uDebug,debug);
    const query=timer&&ext&&pending.length<16?gl.createQuery():null;
    if(query)gl.beginQuery(ext.TIME_ELAPSED_EXT,query);
    gl.drawArrays(gl.TRIANGLES,0,3);
    if(query){gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push(query);}
    const disjoint=ext&&gl.getParameter(ext.GPU_DISJOINT_EXT);
    if(disjoint){for(const q of pending)gl.deleteQuery(q);pending.length=0;}
    while(pending.length&&gl.getQueryParameter(pending[0],gl.QUERY_RESULT_AVAILABLE)){
      const q=pending.shift();if(!disjoint)times.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);
    }
    const error=gl.getError();if(error!==gl.NO_ERROR)throw Error(`Connected GL error ${error}`);
  }
  function read(state,width=16,height=12) {
    draw(state,{width,height,debug:1});const pixels=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    draw(state,{width,height,debug:2});const bytes=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
    draw(state,{width,height,debug:3});const normals=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,normals);
    return {pixels,distances:new Float32Array(bytes.buffer),normals};
  }
  const info=gl.getExtension('WEBGL_debug_renderer_info');
  return {draw,read,packed,times,finish:()=>gl.finish(),hardware:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),timerSupported:!!ext};
}
