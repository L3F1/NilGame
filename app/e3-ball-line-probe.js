import {E3_BALL_LINE_GLSL} from '../engine/geometry/e3-ball-line.js';
import {CONNECTED_VERTEX} from '../engine/geometry/connected-shader.js';
export async function checkE3BallLineGpu(){
  const witness=await (await fetch('../docs/qa/distance-drift-baseline-failure.json')).json();
  const {createConnectedGlobalPreview}=await import('./connected-global-model.js');
  const {packConnectedWorld}=await import('../engine/geometry/connected-shader.js');
  const scene=await (await fetch('../levels/fixtures/connected-three-geometries-gallery.nil.json')).json();
  const packed=packConnectedWorld(createConnectedGlobalPreview(scene,{experimentalH3:true}).world,{experimentalH3:true});
  const owner=packed.primitiveIds.indexOf('flat-portal-marker-left'),surface=packed.texture[4*(96+owner)];
  const centre=[...packed.texture.slice(8*surface,8*surface+3)],radius=packed.texture[8*surface+6];
  const cases=witness.capture.rows.slice(0,2).map(row=>({v:[0,-2,0].map((x,k)=>Math.fround(x-centre[k])),u:row.primary.slice(0,3),radius}));
  for(const scale of [.9999,1,1.0001])for(const x of [0,.5,.99])for(const z of [-4,0,4])cases.push({v:[x,0,z].map(Math.fround),u:[0,0,scale].map(Math.fround),radius:1});
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
  const gl=canvas.getContext('webgl2',{antialias:false,premultipliedAlpha:false});if(!gl)throw Error('E3 line probe requires WebGL2');gl.disable(gl.DITHER);
  const program=gl.createProgram();
  const fragment=`#version 300 es
precision highp float;precision highp int;
uniform vec3 v,u;uniform float radius;uniform int legacy;out vec4 color;
${E3_BALL_LINE_GLSL}
void main(){vec3 q=e3BallLine(v,u,radius);float t=q.x-sqrt(max(0.,q.y)/q.z);
if(legacy==1){float b=dot(v,u),c=dot(v,v)-radius*radius;t=-b-sqrt(max(0.,b*b-c));}
if(legacy==2)t=q.y;if(legacy==3)t=q.z;
uint bits=floatBitsToUint(t);color=vec4(float(bits&255u),float((bits>>8)&255u),float((bits>>16)&255u),float(bits>>24))/255.;}`;
  try{
    for(const [type,source] of [[gl.VERTEX_SHADER,CONNECTED_VERTEX],[gl.FRAGMENT_SHADER,fragment]]){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(program,s);gl.deleteShader(s);}
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);gl.viewport(0,0,1,1);
    const loc=Object.fromEntries(['v','u','radius','legacy'].map(k=>[k,gl.getUniformLocation(program,k)]));
    const records=[];let legacyFailures=0;
    for(const c of cases){
      // Independent surface-sign bisection, not the candidate root expression.
      const dot=(a,b)=>a.reduce((s,x,k)=>s+x*b[k],0),a=dot(c.u,c.u),mid=-dot(c.v,c.u)/a;
      const signed=t=>Math.hypot(...c.v.map((x,k)=>x+t*c.u[k]))-c.radius;
      let lo=mid-2*c.radius/Math.sqrt(a),hi=mid;
      if(!(signed(lo)>0&&signed(hi)<0))throw Error('E3 reference is not bracketed');
      for(let j=0;j<70;j++){const m=(lo+hi)/2;if(signed(m)>0)lo=m;else hi=m;}
      const truth=(lo+hi)/2,values=[];
      gl.uniform3fv(loc.v,c.v);gl.uniform3fv(loc.u,c.u);gl.uniform1f(loc.radius,c.radius);
      for(const legacy of [0,1]){gl.uniform1i(loc.legacy,legacy);gl.drawArrays(gl.TRIANGLES,0,3);const b=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,b);if(gl.getError()!==gl.NO_ERROR)throw Error('E3 root readback error');values.push(new DataView(b.buffer).getFloat32(0,true));}
      const tolerance=1e-6*Math.max(1,Math.abs(truth));
      if(!Number.isFinite(values[0])||Math.abs(values[0]-truth)>tolerance)throw Error('Closest-approach root failed '+JSON.stringify({c,truth,values}));
      if(Math.abs(values[1]-truth)>tolerance)legacyFailures++;
      records.push({truth,candidate:values[0],legacy:values[1]});
    }
    let boundaryChecks=0;
    for(const [v,u,mode,expected] of [[[1,0,-4],[0,0,1],2,0],[[2,0,-4],[0,0,1],2,-3],[[0,0,0],[0,0,0],3,0]]){
      gl.uniform3fv(loc.v,v);gl.uniform3fv(loc.u,u);gl.uniform1f(loc.radius,1);gl.uniform1i(loc.legacy,mode);
      gl.drawArrays(gl.TRIANGLES,0,3);const bytes=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
      if(gl.getError()!==gl.NO_ERROR||new DataView(bytes.buffer).getFloat32(0,true)!==expected)throw Error('E3 tangent/miss/degenerate classification failed');boundaryChecks++;
    }
    if(!legacyFailures)throw Error('Legacy unit-length mutation was not caught');
    return {label:'e3-ball-line',cases:cases.length,boundaryChecks,legacyFailures,packedCentre:centre,packedRadius:radius,witness:records.slice(0,2),worstError:Math.max(...records.map(r=>Math.abs(r.candidate-r.truth)))};
  }finally{gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();}
}
