import {E3_S3_TRANSFER_GLSL} from '../engine/geometry/portal-transfer-gpu.js';
import {e3S3TransferBounds} from '../engine/geometry/portal-transfer-bounds.js';
import {createConnectedGlobalPreview} from './connected-global-model.js';
import {CONNECTED_VERTEX} from '../engine/geometry/connected-shader.js';

// Separate tiny GPU program: exercises the candidate transfer, not a surrogate
// screenshot test or an unreviewed change to the connected renderer.
export function checkPortalTransferGpu(document){
  const canvas=globalThis.document.createElement('canvas');canvas.width=9;canvas.height=1;
  const gl=canvas.getContext('webgl2',{antialias:false,premultipliedAlpha:false});
  if(!gl)throw Error('Transfer probe requires WebGL2');gl.disable(gl.DITHER);
  function program(code){
    const p=gl.createProgram();
    const frag=`#version 300 es
precision highp float;precision highp int;
uniform vec3 p,u,c,right,up,normal;
uniform vec4 exitCenter,exitRight,exitUp,exitNormal;
uniform float radius;
out vec4 color;
${code}
void main(){float t;vec4 q,v;bool ok=e3S3Transfer(p,u,c,right,up,normal,exitCenter,exitRight,exitUp,exitNormal,radius,t,q,v);
int i=int(gl_FragCoord.x);float value=!ok?1e30:i<4?q[i]:i<8?v[i-4]:t;
uint bits=floatBitsToUint(value);color=vec4(float(bits&255u),float((bits>>8)&255u),float((bits>>16)&255u),float(bits>>24))/255.;}`;
    for(const [type,source] of [[gl.VERTEX_SHADER,CONNECTED_VERTEX],[gl.FRAGMENT_SHADER,frag]]){
      const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));
      gl.attachShader(p,s);gl.deleteShader(s);
    }
    gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;
  }
  const cases=[];
  for(const rotated of [false,true]){
    const doc=structuredClone(document);
    if(rotated){
      const a=doc.baseScene.entities.find(e=>e.id==='flat-entry');a.position=[1,1,0];a.forward=[-Math.SQRT1_2,-Math.SQRT1_2,0];
      const b=doc.coverRegions[0].entities.find(e=>e.id==='sphere-entry');b.position=[.2,.1,0];b.forward=[Math.SQRT1_2,Math.SQRT1_2,0];
    }
    const world=createConnectedGlobalPreview(doc,{experimentalH3:true}).world;
    const gate=world.portals.find(g=>g.fromId==='flat-entry'),frame=gate.renderData();
    for(const x of [-.45,-.2,0,.2,.45])for(const z of [-.45,0,.45])for(const slant of [0,.03]){
      const position=frame.center.map((v,i)=>v+2*frame.normal[i]+x*frame.right[i]+z*frame.up[i]);
      const raw=frame.normal.map((v,i)=>-v+slant*frame.right[i]),n=Math.hypot(...raw),direction=raw.map(v=>v/n);
      const bounds=e3S3TransferBounds({position,direction,positionError:[0,0,0],directionError:[0,0,0],frame,frameError:0,curvatureRadius:8,maxDistance:10});
      if(bounds.status!=='bounded')throw Error('Transfer corpus unexpectedly refused');
      const t=-position.reduce((sum,v,i)=>sum+(v-frame.center[i])*frame.normal[i],0)/direction.reduce((sum,v,i)=>sum+v*frame.normal[i],0);
      const at=position.map((v,i)=>v+t*direction[i]),reference=gate.transit(at);
      cases.push({position,direction,frame,bounds,exact:[...reference.position,...reference.carry(direction),t]});
    }
  }
  function run(p,mutant=false){
    gl.useProgram(p);gl.viewport(0,0,9,1);let maxError=0;
    const loc=n=>gl.getUniformLocation(p,n);
    for(const c of cases){
      for(const [name,v] of Object.entries({p:c.position,u:c.direction,c:c.frame.center,right:c.frame.right,up:c.frame.up,normal:c.frame.normal}))gl.uniform3fv(loc(name),v);
      for(const name of ['exitCenter','exitRight','exitUp','exitNormal'])gl.uniform4fv(loc(name),c.frame[name]);
      gl.uniform1f(loc('radius'),8);gl.drawArrays(gl.TRIANGLES,0,3);
      const bytes=new Uint8Array(36);gl.readPixels(0,0,9,1,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
      if(gl.getError()!==gl.NO_ERROR)throw Error('Transfer probe GL error');
      const values=new Float32Array(bytes.buffer),bands=[...c.bounds.position,...c.bounds.direction,c.bounds.distance];
      for(let i=0;i<9;i++){
        if(!Number.isFinite(values[i])||values[i]<bands[i][0]||values[i]>bands[i][1]){
          if(mutant)return true;
          throw Error(`GPU transfer component${i}=${values[i]} outside [${bands[i]}]`);
        }
        maxError=Math.max(maxError,Math.abs(values[i]-c.exact[i]));
      }
    }
    return mutant?false:maxError;
  }
  const good=program(E3_S3_TRANSFER_GLSL),bad=program(E3_S3_TRANSFER_GLSL.replace('normalize(transported)','normalize(vector)'));
  try{
    const maxError=run(good);
    if(!run(bad,true))throw Error('Transfer probe did not reject missing parallel transport');
    return {label:'portal-transfer-gpu',cases:cases.length,components:cases.length*9,maxError,mutationCaught:true};
  }finally{gl.deleteProgram(good);gl.deleteProgram(bad);gl.getExtension('WEBGL_lose_context')?.loseContext();}
}
