import {FLOAT_BANDS_GLSL} from '../engine/geometry/spherical-miss-pass-glsl.js';
import {ENCLOSURE_MEMBER_GLSL,ENCLOSURE_EXPORT_GLSL} from '../engine/geometry/refinement-enclosure-glsl.js';
import {exactFloatUnits,exactMember,exactSphereBoxMiss} from '../tools/refinement-enclosure-reference.js';
import {CONNECTED_VERTEX} from '../engine/geometry/connected-shader.js';

// Standalone arithmetic experiment. No certificate is consumed by live rendering.
export async function checkRefinementEnclosure(){
  const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2',{antialias:false});
  if(!gl||!gl.getExtension('EXT_color_buffer_float'))throw Error('Enclosure probe requires float render targets');
  gl.disable(gl.DITHER);canvas.width=canvas.height=1;
  const program=gl.createProgram(),framebuffer=gl.createFramebuffer(),texture=gl.createTexture();
  const fragment=`#version 300 es
precision highp float;precision highp int;
uniform vec4 qp,qu,plo,phi,ulo,uhi,center,vp,vu;
uniform vec2 radii;
uniform float constant;
uniform int mode,mutant;
out vec4 result;
${FLOAT_BANDS_GLSL}
${ENCLOSURE_MEMBER_GLSL}
${ENCLOSURE_EXPORT_GLSL}
void main(){
  float rp=radii.x,ru=radii.y;bool excluded=false;
  if(mode==0){
    BI pb,ub;
    if(!exportEnclosure(BI(plo,phi),qp,rp,pb)||!exportEnclosure(BI(ulo,uhi),qu,ru,ub)){
      result=vec4(-1,-1,0,0);return;
    }
    excluded=mutant==2?enclosureSphereMiss(BI(plo,phi),BI(ulo,uhi),center,constant)
      :enclosureSphereMiss(pb,ub,center,constant);
  }
  bool member=enclosureMember(vp,qp,rp)&&enclosureMember(vu,qu,ru);
  if(mutant==1)member=all(lessThanEqual(abs(vp-qp),vec4(rp)))&&all(lessThanEqual(abs(vu-qu),vec4(ru)));
  result=vec4(rp,ru,excluded?1.:0.,member?1.:0.);
}`;
  const f=Math.fround,zero=[0,0,0,0],base={qp:zero,qu:zero,plo:zero,phi:zero,ulo:zero,uhi:zero,
    center:[1,0,0,0],vp:zero,vu:zero,radii:[1,0],constant:f(.8),mode:1,mutant:0};
  const times={},start=performance.now();
  try{
    for(const [type,source,name] of [[gl.VERTEX_SHADER,CONNECTED_VERTEX,'vertex'],[gl.FRAGMENT_SHADER,fragment,'fragment']]){
      const t=performance.now(),shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
      times[name+'CompileMs']=performance.now()-t;gl.attachShader(program,shader);gl.deleteShader(shader);
    }
    const link=performance.now();gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    times.linkMs=performance.now()-link;gl.useProgram(program);
    gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,1,1,0,gl.RGBA,gl.FLOAT,null);
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Enclosure float framebuffer incomplete');
    gl.viewport(0,0,1,1);
    const loc=Object.fromEntries(Object.keys(base).map(n=>[n,gl.getUniformLocation(program,n)]));
    let draws=0;
    function read(input){
      const c={...base,...input};
      for(const n of ['qp','qu','plo','phi','ulo','uhi','center','vp','vu'])gl.uniform4fv(loc[n],c[n]);
      gl.uniform2fv(loc.radii,c.radii);gl.uniform1f(loc.constant,c.constant);gl.uniform1i(loc.mode,c.mode);gl.uniform1i(loc.mutant,c.mutant);
      const t=performance.now();gl.drawArrays(gl.TRIANGLES,0,3);const values=new Float32Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,values);
      if(!draws++)times.firstDrawReadMs=performance.now()-t;
      if(gl.getError()!==gl.NO_ERROR)throw Error('Enclosure readback failed');return [...values];
    }
    const known=[
      {qp:[1,0,0,0],vp:[-(2**-24),0,0,0],radii:[1,0]},
      {qp:[1,0,0,0],vp:[-(2**-100),0,0,0],radii:[1,0]},
      {qp:[-0,0,0,0],vp:zero,radii:[0,0]},
      {qp:[2**100,0,0,0],vp:[-(2**100),0,0,0],radii:[2**100,0]},
      {qp:[2**-100,0,0,0],vp:zero,radii:[2**-100,0]},
    ];
    let seed=1729;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
    const memberships=[...known];
    for(let i=0;i<512;i++){
      const r=2**(Math.floor(rand()*160)-80),q=Array.from({length:4},()=>f((rand()*2-1)*r*4));
      const offsets=i<128?[-.25,0,.25]:[-.5,0,.5,1,1.25];
      memberships.push({qp:q,vp:q.map(x=>f(x+offsets[Math.floor(rand()*offsets.length)]*r)),radii:[r,0],requiredInside:i<128});
    }
    let accepted=0,rejectedInside=0;
    for(const c of memberships){
      const out=read(c),truth=exactMember(c.vp,c.qp,c.radii[0]);
      if(out[3]===1&&!truth)throw Error('Enclosure accepted an outside state '+JSON.stringify(c));
      if(c.requiredInside&&(out[3]!==1||!truth))throw Error('Strictly interior state was not admitted '+JSON.stringify({c,out}));
      if(out[3]===1)accepted++;else if(truth)rejectedInside++;
    }
    if(read(known[2])[3]!==1||accepted<100)throw Error('Enclosure membership not usefully exercised '+JSON.stringify({accepted,zero:read(known[2])}));
    const roundedDifferenceMutation=read({...known[0],mutant:1})[3]===1;
    if(!roundedDifferenceMutation||exactMember(known[0].vp,known[0].qp,1))throw Error('Rounded subtraction mutation not caught');
    let domainRefusals=0;
    for(const c of [{qp:[2**-120,0,0,0],vp:zero},{qp:[2**101,0,0,0],vp:zero},
      {qp:zero,vp:[2**-149,0,0,0],radii:[0,0]},
      {qp:[2**-149,0,0,0],vp:zero,radii:[0,0]},{radii:[2**-149,0]},
      {qp:[Infinity,0,0,0],vp:zero},{qp:[NaN,0,0,0],vp:zero},{radii:[-1,0]}]){
      if(read(c)[3]!==0)throw Error('Enclosure domain refusal failed '+JSON.stringify(c));domainRefusals++;
    }
    const q=[0,0,0,1],u=[1,0,0,0],widths=[f(.2),f(.00001),f(.00001),f(.00001)];
    const anisotropic={mode:0,qp:q,qu:u,plo:q.map((x,k)=>f(x-widths[k])),phi:q.map((x,k)=>f(x+widths[k])),
      ulo:u.map((x,k)=>f(x-widths[k])),uhi:u.map((x,k)=>f(x+widths[k])),center:[0,1,0,0],constant:f(.1),vp:q,vu:u};
    const oldProof=read({...anisotropic,mutant:2}),reproved=read(anisotropic);
    if(oldProof[2]!==1||reproved[2]!==0||exactSphereBoxMiss(q,u,oldProof[0],oldProof[1],anisotropic.center,anisotropic.constant))
      throw Error('Failure to reprove expanded box was not caught');
    let invalidFieldRefusals=0;
    for(const c of [
      {qp:[2**100,0,0,0],center:[1,0,0,0]},
      {qp:[2**100,0,0,0],center:[2**100,0,0,0]},
      {qp:q,center:[Infinity,0,0,0]},
      {qp:q,center:[1,0,0,0],constant:Infinity},
    ]){
      const test={...anisotropic,...c,plo:c.qp,phi:c.qp,ulo:u,uhi:u,vp:c.qp,constant:c.constant??f(.9)};
      if(read(test)[2]!==0)throw Error('Invalid/overflowing field was certified');invalidFieldRefusals++;
    }
    const boxes=[anisotropic];
    for(let i=0;i<256;i++){
      const amplitude=f(.2+rand()*.7),constant=f(amplitude+(i%2?1:-1)*2**(-8-Math.floor(rand()*18)));
      const width=2**(-12-Math.floor(rand()*14)),w=Array.from({length:4},()=>width*(.1+rand()));
      boxes.push({mode:0,qp:q,qu:u,plo:q.map((x,k)=>f(x-w[k])),phi:q.map((x,k)=>f(x+w[k]*.7)),
        ulo:u.map((x,k)=>f(x-w[k]*.4)),uhi:u.map((x,k)=>f(x+w[k])),
        center:[amplitude,f(Math.sqrt(1-amplitude*amplitude)),0,0],constant,vp:q,vu:u});
    }
    let certified=0,contained=0,differentStateAccepted=0;
    for(const c of boxes){
      const out=read(c),[rp,ru]=out;if(!(rp>=0&&ru>=0))throw Error('Valid original box refused');
      for(const [nominal,lo,hi,r] of [[c.qp,c.plo,c.phi,rp],[c.qu,c.ulo,c.uhi,ru]]){
        for(let k=0;k<4;k++){
          const n=exactFloatUnits(nominal[k]),radius=exactFloatUnits(r);
          if(n-radius>exactFloatUnits(lo[k])||n+radius<exactFloatUnits(hi[k]))throw Error('Export radius lost original enclosure');
        }contained++;
      }
      if(out[2]===1){
        if(!exactSphereBoxMiss(c.qp,c.qu,rp,ru,c.center,c.constant))throw Error('GPU miss failed exact dyadic box oracle');certified++;
        const changed={...c,vp:[...c.qp]};changed.vp[1]=f(rp*.5);
        const moved=read(changed);
        if(moved[2]!==1||moved[3]!==1||!exactMember(changed.vp,c.qp,moved[0])
          ||!exactSphereBoxMiss(c.qp,c.qu,moved[0],moved[1],c.center,c.constant))throw Error('Different in-box state not admitted');
        differentStateAccepted++;
      }
    }
    if(!certified||!differentStateAccepted)throw Error('No certified box accepted a distinct state');
    const info=gl.getExtension('WEBGL_debug_renderer_info');
    return {label:'refinement-enclosure-experiment',hardware:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
      memberships:memberships.length,accepted,rejectedInside,domainRefusals,boxes:boxes.length,contained,certified,differentStateAccepted,
      roundedDifferenceMutation,unreprovedBoxMutation:true,invalidFieldRefusals,times,draws,totalWallMs:performance.now()-start,
      scope:'single-pixel arithmetic prototype; exact dyadic oracle; not live rendering, full-frame cost, serialized MRT transport, or rounded trig/occupancy proof'};
  }finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.deleteFramebuffer(framebuffer);gl.deleteTexture(texture);gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();}
}
