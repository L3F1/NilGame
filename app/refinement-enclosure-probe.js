import {FLOAT_BANDS_GLSL} from '../engine/geometry/spherical-miss-pass-glsl.js';
import {ENCLOSURE_MEMBER_GLSL,ENCLOSURE_EXPORT_GLSL} from '../engine/geometry/refinement-enclosure-glsl.js';
import {exactFloatUnits,exactMember,exactSphereBoxMiss} from '../tools/refinement-enclosure-reference.js';
import {CONNECTED_VERTEX,CONNECTED_FRAGMENT} from '../engine/geometry/connected-shader.js';
import {deriveCurveErrorBudget} from '../engine/geometry/spherical-curve-error.js';

// Standalone arithmetic experiment. No certificate is consumed by live rendering.
export async function checkRefinementEnclosure(captured={records:[],refused:0}){
  const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2',{antialias:false});
  if(!gl||!gl.getExtension('EXT_color_buffer_float'))throw Error('Enclosure probe requires float render targets');
  gl.disable(gl.DITHER);canvas.width=canvas.height=1;
  const program=gl.createProgram(),framebuffer=gl.createFramebuffer(),texture=gl.createTexture();
  // Execute the renderer's source, not a rewritten polynomial. Instrument the
  // post-fold argument in the same invocation to check this contract's domain.
  const trig=CONNECTED_FRAGMENT.match(/vec2 sincos\(float x\)\{[\s\S]*?\n\}/)?.[0];
  if(!trig)throw Error('Renderer sincos source not found');
  const curveBudget=deriveCurveErrorBudget();
  if(!curveBudget.sine.holds||!curveBudget.cosine.holds||!curveBudget.dot.holds)throw Error('Curve error derivation failed');
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
const float PI=3.141592653589793;
float curveReduced;
${trig.replace('return vec2(', 'curveReduced=x;return vec2(')}
void main(){
  if(mode==2){vec2 sc=sincos(constant);vec4 p=qp*sc.y+qu*sc.x;
    result=vec4(sc,dot(center,p),curveReduced);return;}
  float rp=radii.x,ru=radii.y;bool excluded=false;
  if(mode==0){
    BI pb,ub;
    if(!exportEnclosure(BI(plo,phi),qp,rp,pb)||!exportEnclosure(BI(ulo,uhi),qu,ru,ub)){
      result=vec4(-1,-1,0,0);return;
    }
    excluded=mutant==2?enclosureSphereMiss(BI(plo,phi),BI(ulo,uhi),center,constant)
      :enclosureSphereMiss(pb,ub,center,constant);
    if(mutant==3||mutant==4)excluded=enclosureCurveExterior(pb,ub,center,constant,mutant==4?65.:64.);
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
    let certified=0,contained=0,differentStateAccepted=0,curveCertified=0,curveRefusedIdeal=0;
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
      const guarded=read({...c,mutant:3});
      if(guarded[2]===1){
        const C=c.center.map(exactFloatUnits),P=c.qp.map(exactFloatUnits),U=c.qu.map(exactFloatUnits);
        const r=exactFloatUnits(guarded[0]),s=exactFloatUnits(guarded[1]),abs=v=>v<0n?-v:v;
        let a=0n,b=0n,total=0n,w=0n;
        for(let k=0;k<4;k++){a+=C[k]*P[k];b+=C[k]*U[k];total+=abs(C[k]);w+=abs(C[k])*(abs(P[k])+r+abs(U[k])+s);}
        a=abs(a)+r*total;b=abs(b)+s*total;
        const gap=(exactFloatUnits(c.constant)<<165n)-w-(1n<<196n);
        if(gap<=0n||gap*gap<=(a*a+b*b)<<32n)throw Error('Computed-exterior certificate failed exact budget oracle');
        if(read({...c,mutant:4})[2]!==0)throw Error('Computed-exterior certificate accepted unsupported angle');
        curveCertified++;
      }else if(out[2]===1)curveRefusedIdeal++;
    }
    if(!certified||!differentStateAccepted)throw Error('No certified box accepted a distinct state');
    if(!curveCertified||!curveRefusedIdeal)throw Error('Curve certificate lacks accepted and newly refused witnesses');
    let endpointRefusals=0;
    for(const [lo,hi] of [[2**-149,2**-126],[-(2**-126),2**-149],
      [2**-126,-(2**-126)],[2**-126,2**-125],[-(2**-125),-(2**-126)],
      [-Infinity,1],[-1,NaN]]){
      const result=read({mode:0,qp:zero,plo:[lo,0,0,0],phi:[hi,0,0,0],qu:zero,ulo:zero,uhi:zero});
      if(result[0]!==-1)throw Error('Invalid original interval was repaired by widening');endpointRefusals++;
    }
    let tinyBoxes=0;
    for(const width of [2**-126,2**-110,2**-100]){
      const result=read({mode:0,qp:zero,plo:zero.map(()=>-width),phi:zero.map(()=>width),qu:zero,ulo:zero,uhi:zero,vp:zero,vu:zero});
      if(!(result[0]>=2**-100)||result[3]!==1||exactFloatUnits(result[0])<exactFloatUnits(width))
        throw Error('Tiny whole-box export lost its enclosure');
      if(result[2]===1&&!exactSphereBoxMiss(zero,zero,result[0],result[1],base.center,base.constant))
        throw Error('Tiny box exclusion failed exact oracle');
      tinyBoxes++;
    }
    let transferExported=0,transferTinyEndpoints=0,transferRefusedState=0;
    for(const record of captured.records){
      const {q,lo,hi}=record;
      const supported=v=>v===0||(Number.isFinite(v)&&Math.abs(v)>=2**-100&&Math.abs(v)<=2**100);
      if(!q.every(supported)){transferRefusedState++;continue;}
      if([...lo,...hi].some(v=>v!==0&&Math.abs(v)<2**-100))transferTinyEndpoints++;
      const out=read({mode:0,qp:q,plo:lo,phi:hi,qu:zero,ulo:zero,uhi:zero,vp:q,vu:zero});
      if(!(out[0]>=0)||out[3]!==1)throw Error('Actual transfer band export refused '+JSON.stringify(record));
      for(let k=0;k<4;k++){
        const n=exactFloatUnits(q[k]),r=exactFloatUnits(out[0]);
        if(n-r>exactFloatUnits(lo[k])||n+r<exactFloatUnits(hi[k]))throw Error('Actual transfer radius lost an endpoint');
      }
      transferExported++;
    }
    if(captured.records.length&&(!transferExported||!transferTinyEndpoints))throw Error('Actual transfer corpus missed tiny endpoints');
    let curveSamples=0,unitCircleFailures=0,idealDotFailures=0,maxPairNorm=0,maxReduced=0;
    const curveAngles=[0,64,-64];
    for(let k=-20;k<=20;k++)for(const offset of [-(2**-18),0,2**-18])curveAngles.push(f(k*Math.PI/2+offset));
    for(let k=0;k<1024;k++)curveAngles.push(f(-64+128*rand()));
    const abs=n=>n<0n?-n:n,unit=exactFloatUnits(1),pairCeiling=exactFloatUnits(1+2*curveBudget.componentError);
    for(const theta of curveAngles){
      const qp=[0,0,0,1],qu=[1,0,0,0];
      const center=[f(Math.sin(theta)),0,0,f(Math.cos(theta))];
      if(curveSamples%2){for(let k=0;k<4;k++){qp[k]=f(rand()*4-2);qu[k]=f(rand()*4-2);center[k]=f(rand()*4-2);}}
      const out=read({mode:2,constant:theta,qp,qu,center});
      if(!out.every(Number.isFinite)||Math.abs(out[3])>curveBudget.reducedLimit)throw Error('Curve reduced domain exceeded');
      const s=exactFloatUnits(out[0]),c=exactFloatUnits(out[1]),pair=s*s+c*c;
      if(pair>pairCeiling*pairCeiling)throw Error('Curve amplitude exceeded derived budget');
      if(pair>unit*unit)unitCircleFailures++;
      let a=0n,b=0n,w=0n;
      for(let k=0;k<4;k++){const ck=exactFloatUnits(center[k]),p=exactFloatUnits(qp[k]),u=exactFloatUnits(qu[k]);
        a+=ck*p;b+=ck*u;w+=abs(ck)*(abs(p)+abs(u));}
      const v=exactFloatUnits(out[2]);
      // Everything below is exact in units 2^-314: no rounded subtraction or
      // square root can conceal a violation of H + 2^-16 W + 2^-118.
      const excess=(v<<165n)-w-(1n<<196n);
      if(excess>0n&&excess*excess>((a*a+b*b)<<32n))throw Error('Curve/dot exceeded derived budget');
      const idealValue=v<<149n;
      if(v>0n&&idealValue*idealValue>a*a+b*b)idealDotFailures++;
      maxPairNorm=Math.max(maxPairNorm,Math.hypot(out[0],out[1]));maxReduced=Math.max(maxReduced,Math.abs(out[3]));curveSamples++;
    }
    if(!unitCircleFailures||!idealDotFailures)throw Error('Curve corpus did not falsify the zero-error shortcuts');
    const info=gl.getExtension('WEBGL_debug_renderer_info');
    return {label:'refinement-enclosure-experiment',hardware:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
      memberships:memberships.length,accepted,rejectedInside,domainRefusals,boxes:boxes.length,contained,certified,differentStateAccepted,
      roundedDifferenceMutation,unreprovedBoxMutation:true,invalidFieldRefusals,
      endpointRefusals,tinyBoxes,
      curve:{samples:curveSamples,unitCircleFailures,idealDotFailures,maxPairNorm,maxReduced,certifiedBoxes:curveCertified,refusedIdealBoxes:curveRefusedIdeal,budget:curveBudget},
      transfer:{captured:captured.records.length,captureRefused:captured.refused,exported:transferExported,tinyEndpointRecords:transferTinyEndpoints,unsupportedNominal:transferRefusedState},
      times,draws,totalWallMs:performance.now()-start,
      scope:'conditional shared-pair arithmetic prototype; not live rendering, an unconditional backend proof, full-frame cost, serialized MRT transport or occupancy equivalence'};
  }finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.deleteFramebuffer(framebuffer);gl.deleteTexture(texture);gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();}
}
