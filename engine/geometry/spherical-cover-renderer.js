// Static metric balls on the COMPLETE S3: first hit over one full 2*pi*R orbit.
// castSphericalBalls (spherical-cover.js) is the authority. This renderer is a
// display plus a debug readback for parity. Float32 bands aim to refuse more
// readily than the CPU; this is tested evidence, not a universal error proof.
// A GPU hit or miss must match the CPU in the acceptance corpus.
// No portals, CSG, moving objects, gravity or body collision.
export const SPHERICAL_COVER_MAX_BALLS=16;
export const SPHERICAL_COVER_FOCAL=1/Math.tan(35*Math.PI/180);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);

function validateBalls(space,balls) {
  if(space?.coverage!=='s3-cover')throw Error('Expected global S3 cover');
  if(!Array.isArray(balls)||balls.length>SPHERICAL_COVER_MAX_BALLS)throw Error(`Spherical cover renderer supports at most ${SPHERICAL_COVER_MAX_BALLS} balls`);
  const R=space.curvatureRadius;
  if(R!==8)throw Error('Spherical GPU preview currently supports radius 8 only');
  for(const ball of balls){
    space.validatePoint(ball.center);
    if(!Number.isFinite(ball.radius)||ball.radius<=0||ball.radius>=Math.PI*R/2)throw Error('Ball radius must be below a hemisphere');
    // The fixed angular uncertainty bands below were designed for small balls.
    // Near-hemisphere balls need an amplitude-dependent tangent envelope.
    if(ball.radius/R<.05||ball.radius/R>.1)throw Error('Spherical GPU preview needs ball angular radii in [0.05, 0.1]');
    if(!Array.isArray(ball.color)||ball.color.length!==3||!ball.color.every(Number.isFinite))throw Error(`Ball ${ball.id} needs an RGB color`);
  }
}

/** The CPU ray for pixel (x,y), row 0 at the bottom, matching the shader. */
export function pixelRay(space,camera,width,height,x,y) {
  const u=(2*(x+.5)-width)/height,v=(2*(y+.5)-height)/height;
  return space.normalize(camera.position,camera.forward.map((f,k)=>f*SPHERICAL_COVER_FOCAL+camera.right[k]*u+camera.up[k]*v));
}

/**
 * Balls in the orthonormal ambient basis (position, forward, right, up), in
 * double precision. The shader then forms a*a+b*b-c*c as (a*a-c*c)+b*b with
 * the nearly cancelling part computed in double before upload, rather than
 * subtracting two separately rounded float32 squares. Upload still rounds.
 */
export function packSphericalCamera(space,balls,camera) {
  const p=camera.position,axes=[camera.forward,camera.right,camera.up];
  const ball=new Float32Array(4*SPHERICAL_COVER_MAX_BALLS),shape=new Float32Array(4*SPHERICAL_COVER_MAX_BALLS);
  let start=0;
  balls.forEach((b,i)=>{
    const a=dot(p,b.center),c=Math.cos(b.radius/space.curvatureRadius);
    ball.set([...axes.map(e=>dot(e,b.center)),a],4*i);
    shape.set([(a-c)*(a+c),c,0,0],4*i);
    // CPU refuses at a>=c-1e-10. The wider float guard also keeps a near-zero
    // entry from wrapping to a full orbit in float32 (extra refusal only).
    if(a>=c-1e-6)start=1;
  });
  return {ball,shape,start};
}

export const SPHERICAL_COVER_VERTEX=`#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}`;
export const SPHERICAL_COVER_FRAGMENT=`#version 300 es
precision highp float;
precision highp int;
uniform vec4 uBall[16];  // forward,right,up components of center; a=dot(position,center)
uniform vec4 uShape[16]; // a*a-c*c (double), c=cos(radius/R)
uniform vec3 uColor[16];
uniform int uCount,uDebug,uStart;
uniform float uRadius,uFocal;
uniform vec2 uResolution;
out vec4 frag;
const float TAU=6.283185307179586;
// Provisional float32 bands, NOT a portable GPU error bound. DISC_BAND is in
// cosine-squared units; the others are orbit angles in radians.
const float DISC_BAND=4e-6,TANGENT_WIDTH=4e-3,END_BAND=1e-5,TIE_BAND=2e-4,ORDER_BAND=1e-4;
// x: 0 miss, 1 hit, 2 unresolved; y: owner; z: refusal 1 tangent/range, 2 tie, 3 start; w: physical distance.
vec4 castBalls(vec3 dir,out vec4 normal,out float light){
  normal=vec4(0);light=0.;
  if(uStart==1)return vec4(2,-1,3,0);
  float best=1e9,second=1e9,uncertain=1e9;int owner=-1;
  for(int i=0;i<16;i++){
    if(i>=uCount)break;
    float a=uBall[i].w,b=dot(uBall[i].xyz,dir),disc=uShape[i].x+b*b;
    if(disc< -DISC_BAND)continue;
    float phase=atan(b,a);if(phase<0.)phase+=TAU;
    if(disc<=DISC_BAND){uncertain=min(uncertain,phase>TAU-TANGENT_WIDTH?0.:max(0.,phase-TANGENT_WIDTH));continue;}
    float entry=phase-atan(sqrt(disc),uShape[i].y);if(entry<0.)entry+=TAU;
    if(entry<END_BAND||entry>TAU-END_BAND){uncertain=0.;continue;}
    if(entry<best){second=best;best=entry;owner=i;}else second=min(second,entry);
  }
  bool tie=owner>=0&&second-best<=TIE_BAND;
  if(owner>=0&&!tie&&best+ORDER_BAND<uncertain){
    // Camera basis coordinates: position (1,0,0,0), ray (0,dir).
    vec4 center=vec4(uBall[owner].w,uBall[owner].xyz),point=vec4(cos(best),sin(best)*dir),along=vec4(-sin(best),cos(best)*dir);
    normal=normalize(dot(point,center)*point-center);light=max(0.,-dot(normal,along));
    return vec4(1,owner,0,best*uRadius);
  }
  if(tie&&best<uncertain)return vec4(2,-1,2,0);
  if(owner>=0||uncertain<=TAU)return vec4(2,-1,1,0);
  return vec4(0,-1,0,0);
}
void main(){
  vec2 uv=(2.*gl_FragCoord.xy-uResolution)/uResolution.y;
  vec3 dir=normalize(vec3(uFocal,uv));vec4 n;float light;
  vec4 r=castBalls(dir,n,light);
  if(uDebug==1){frag=vec4(r.x,r.y+1.,r.z,1)/255.;return;}
  if(uDebug==2){uint bits=floatBitsToUint(r.w);frag=vec4(float(bits&255u),float((bits>>8)&255u),float((bits>>16)&255u),float(bits>>24))/255.;return;}
  if(uDebug==3){frag=n*.5+.5;return;}
  vec3 color;
  if(r.x==1.)color=uColor[int(r.y)]*(.22+.78*light)*(1.-.45*r.w/(TAU*uRadius));
  else if(r.x==2.)color=vec3(.85,.1,.75);
  else color=mix(vec3(.02,.03,.06),vec3(.07,.09,.15),.5+.5*dir.z);
  frag=vec4(color,1);
}`;

export function createSphericalCoverRenderer(canvas,{space,balls}) {
  validateBalls(space,balls);
  const gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:false,antialias:false,preserveDrawingBuffer:true});
  if(!gl)throw Error('Spherical cover preview requires WebGL2');
  gl.disable(gl.DITHER); // Debug packets are bytes, not display colors.
  const program=gl.createProgram();
  for(const [type,source] of [[gl.VERTEX_SHADER,SPHERICAL_COVER_VERTEX],[gl.FRAGMENT_SHADER,SPHERICAL_COVER_FRAGMENT]]) {
    const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program,shader);gl.deleteShader(shader);
  }
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const names=['uBall','uShape','uColor','uCount','uDebug','uStart','uRadius','uFocal','uResolution'];
  const loc=Object.fromEntries(names.map(n=>[n,gl.getUniformLocation(program,n)]));
  const colors=new Float32Array(3*SPHERICAL_COVER_MAX_BALLS);balls.forEach((b,i)=>colors.set(b.color,3*i));
  gl.uniform3fv(loc.uColor,colors);gl.uniform1i(loc.uCount,balls.length);
  gl.uniform1f(loc.uRadius,space.curvatureRadius);gl.uniform1f(loc.uFocal,SPHERICAL_COVER_FOCAL);
  function draw(state,{width=320,height=240,debug=0}={}) {
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    const packed=packSphericalCamera(space,balls,state.camera);
    gl.viewport(0,0,width,height);gl.useProgram(program);
    gl.uniform4fv(loc.uBall,packed.ball);gl.uniform4fv(loc.uShape,packed.shape);gl.uniform1i(loc.uStart,packed.start);
    gl.uniform2f(loc.uResolution,width,height);gl.uniform1i(loc.uDebug,debug);
    gl.drawArrays(gl.TRIANGLES,0,3);
    const error=gl.getError();if(error!==gl.NO_ERROR)throw Error(`Spherical cover GL error ${error}`);
  }
  function read(state,width=16,height=12) {
    const pass=debug=>{draw(state,{width,height,debug});const bytes=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;};
    const pixels=pass(1),distances=new Float32Array(pass(2).buffer),normals=pass(3);
    return {pixels,distances,normals};
  }
  const info=gl.getExtension('WEBGL_debug_renderer_info');
  return {draw,read,finish:()=>gl.finish(),hardware:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
}
