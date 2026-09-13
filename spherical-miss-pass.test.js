// Opt-in first-transfer exclusion pass: association, refusals, GL state
// restoration, identity requirements and the packed positive-c convention.
// Node has no WebGL2, so the GPU program itself is checked as source and the
// integration is driven through a recording WebGL2 double. GPU behaviour is
// therefore UNPROVEN here; see docs/qa/claude-live-miss-pass.md.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileRegionWorld} from './engine/world/region-world.js';
import {packConnectedWorld,CONNECTED_FRAGMENT} from './engine/geometry/connected-shader.js';
import {createConnectedRenderer} from './engine/geometry/connected-renderer.js';
import {sphericalEligibleOwners} from './engine/geometry/spherical-miss-pass.js';
import {SPHERICAL_MISS_GLSL,SPHERICAL_MISS_PASS_FRAGMENT,SPHERICAL_MISS_CERTIFICATE_TAG}
  from './engine/geometry/spherical-miss-pass-glsl.js';
import {SPHERICAL_MISS_GLSL as EXPERIMENT_GLSL} from './app/spherical-miss-experiment-glsl.js';
import {PRIMARY_NORMALIZATION_GLSL} from './engine/geometry/primary-normalization.js';
let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++;};

// ---------------------------------------------------------------- source ----
// The interval implementation is shared, not duplicated: the experiment keeps
// its import path and gets the very same string.
check(EXPERIMENT_GLSL===SPHERICAL_MISS_GLSL,'experiment must reuse the geometry-layer helper');
// The stabilization candidate changes primary Euclidean normalization only.
// Shared source is a boundary assertion, not proof of equal driver arithmetic.
for(const [name,source] of [['main',CONNECTED_FRAGMENT],['pass',SPHERICAL_MISS_PASS_FRAGMENT]]){
  check(source.split(PRIMARY_NORMALIZATION_GLSL).length===2,`${name} embeds exactly one shared primary normalization helper`);
  check(source.includes('newU=normalize(transported);'),`${name} retains existing selected-transfer normalization`);
}
check(PRIMARY_NORMALIZATION_GLSL.includes('float squared=((raw.x*raw.x+raw.y*raw.y)+raw.z*raw.z)+raw.w*raw.w;')
  &&PRIMARY_NORMALIZATION_GLSL.includes('return raw/sqrt(squared);'),'candidate retains its explicit primary norm arithmetic');
check(CONNECTED_FRAGMENT.includes('return isH3(region)?h3Unit(uPosition,raw):euclideanPrimaryUnit(raw);'),
  'primary H3 rays retain metric normalization while E3/S3 call the shared helper');
check(SPHERICAL_MISS_PASS_FRAGMENT.includes('vec4 u=euclideanPrimaryUnit(uForward*FOCAL_SCALE+uRight*uv.x+uUp*uv.y);'),
  'pass nominal primary ray calls the shared helper');
check(CONNECTED_FRAGMENT.includes('vec4 unitize(vec4 p,vec4 v,vec4 r){return isH3(r)?h3Unit(p,v):normalize(v);}')
  &&CONNECTED_FRAGMENT.includes('newU=unitize(newP,transport(exitCenter,newP,newV,dest),dest);'),
  'general transported-direction unitization is outside the primary-only change');
for(const required of ['BI len=bnorm(raw);if(len.lo.x<=0.)return false;',
  'BI v=bd(raw,len),p=bv(uPosition);',
  '!bcontains(t,vec4(boundDistance))',
  'if(!bcontains(point,boundPoint)||!bcontains(directionBand,boundDirection))return false;'])
  check(SPHERICAL_MISS_GLSL.includes(required),`primary stabilization retains interval refusal/containment: ${required}`);

// The contract forbids interval arithmetic inside the live fragment program.
for(const forbidden of ['struct BI','bdown(','bup(','bdot(','firstTransferBands','sphericalMiss(','rayPointBand'])
  check(!CONNECTED_FRAGMENT.includes(forbidden),`CONNECTED_FRAGMENT must not contain ${forbidden}`);
for(const required of ['struct BI','firstTransferBands','sphericalMiss('])
  check(SPHERICAL_MISS_PASS_FRAGMENT.includes(required),`pass program must contain ${required}`);

// Identity requirements of the consumer, stated exactly.
for(const required of [
  `cert.w==${SPHERICAL_MISS_CERTIFICATE_TAG}u+certificateSample`, // THIS pass and sample
  'int(cert.x)==gate+1',                              // THIS portal
  'texelFetch(uMissPoint,texel,0)==newP',             // THIS ray
  'texelFetch(uMissDirection,texel,0)==newU',
  'uMissPass==1','ivec2 texel=certificateTexel;','crossing==0','stable',
  'certificateRegion=-1;certificateLow=0u;certificateHigh=0u;'])
  check(CONNECTED_FRAGMENT.includes(required),`consumer must require ${required}`);
// Ownership moves from a centre-only refusal to a separate texel for each ray.
for(const required of ['certificateTexel=ivec2(gl_FragCoord.xy);',
  'certificateSample=sampleCount==4?uint(sampleIndex):0u;',
  'if(sampleCount==4)certificateTexel+=ivec2(sampleIndex%2,sampleIndex/2)*ivec2(uResolution);',
  'vec2(float(sampleIndex%2),float(sampleIndex/2))*.5-.25',
  'certificateLow=0u;certificateHigh=0u;certificateRegion=-1;certificateUsed=0;'])
  check(CONNECTED_FRAGMENT.includes(required),`each sample must own its certificate: ${required}`);
check(CONNECTED_FRAGMENT.indexOf('certificateTexel=ivec2(gl_FragCoord.xy);')
  <CONNECTED_FRAGMENT.indexOf('vec4 result=trace(uPosition,primary,uRegion,n,t);'),
  'sample texel ownership must be established before tracing');
check(CONNECTED_FRAGMENT.indexOf('certificateSample=sampleCount==4?uint(sampleIndex):0u;')
  <CONNECTED_FRAGMENT.indexOf('vec4 result=trace(uPosition,primary,uRegion,n,t);'),
  'sample tag ownership must be established before tracing');
check(/vec4 primary=pixelRay\(gl_FragCoord.xy\+offset\);\s*vec4 result=trace\(uPosition,primary,uRegion,n,t\);\s*if\(uDebug==11\)\{frag=vec4\(primary.xyz,result.w\);return;\}/.test(CONNECTED_FRAGMENT),
  'debug11 must export the same primary passed to trace and that invocation\'s distance');
for(const required of ['samplePixel-=tile*uResolution;samplePixel+=tile*.5-.25;',
  'boundPixel=samplePixel;', '(2.*samplePixel-uResolution)/uResolution.y'])
  check(SPHERICAL_MISS_PASS_FRAGMENT.includes(required),`the proof and nominal ray use the same logical sample: ${required}`);
for(const required of ['uint sampleId=0u;', 'sampleId=uint(tile.x)+2u*uint(tile.y);',
  `outCertificate=uvec4(uint(gate+1),low,high,${SPHERICAL_MISS_CERTIFICATE_TAG}u+sampleId);`])
  check(SPHERICAL_MISS_PASS_FRAGMENT.includes(required),`atlas tiles must carry explicit sample stamps: ${required}`);
for(const required of ['(uDebug==0||uDebug==9||uDebug==10)&&uDiagnostics==0?4:1;',
  'aaBySample[sampleIndex]=float(certificateUsed);', 'if(uDebug==10){frag=aaBySample/255.;return;}'])
  check(CONNECTED_FRAGMENT.includes(required),`debug10 must expose four independent omission counts: ${required}`);
check(CONNECTED_FRAGMENT.indexOf('certificateRegion=-1;certificateLow=0u;certificateHigh=0u;')
  <CONNECTED_FRAGMENT.indexOf('uMissPass==1'),'a crossing must retire the certificate before a new one is accepted');
// Consumption is gated on the certificate's own region, and on a single-surface
// ball primitive, so no surface index can omit an unrelated primitive.
for(const required of ['if(certificateRegion!=region)return false;','if(int(pr.y)!=1||pr.w<.5)return false;',
  'if(int(D(2*i+1).w)!=region)return false;'])
  check(CONNECTED_FRAGMENT.includes(required),`certifiedMiss must check ${required}`);
// Eligibility in the pass: E3 source, S3 destination, additive one-surface ball,
// and BOTH packed signs reversed for the positive-c equation.
for(const required of ['if(r.x>.5)return;','if(dest.x<.5||dest.x>1.5)return;',
  '!additiveBallOwner(int(m.y))','sphericalMiss(-D(2*i),-m.z)',
  '(uEligibleOwners&(1<<owner))!=0'])
  check(SPHERICAL_MISS_PASS_FRAGMENT.includes(required),`pass must enforce ${required}`);
// No precision constants moved, and no vendor-string heuristic anywhere.
check(SPHERICAL_MISS_PASS_FRAGMENT.includes('const float E=0.00003;'),'pass reuses the existing refusal band');
for(const source of [CONNECTED_FRAGMENT,SPHERICAL_MISS_PASS_FRAGMENT,
  fs.readFileSync('engine/geometry/spherical-miss-pass.js','utf8'),
  fs.readFileSync('engine/geometry/connected-renderer.js','utf8')])
  check(!/UNMASKED_VENDOR|vendor/i.test(source),'no vendor-string heuristic may gate this pass');

// --------------------------------------------------------------- packing ----
const scene=JSON.parse(fs.readFileSync('levels/fixtures/connected-sight.nil.json'));
const world=compileRegionWorld(scene),packed=packConnectedWorld(world);
// Behavioural ownership tests replace the old shader-source group-scan check.
// Include the highest owner bit and an owner shared across differently scoped groups.
{
  const p={texture:new Float32Array(224*4),counts:[0,16,0,0]};
  for(let j=0;j<16;j++)p.texture.set([j,1,0,1],4*(96+j));
  const groups=rows=>{p.counts[2]=rows.length;rows.forEach((r,i)=>p.texture.set(r,4*(112+i)));return sphericalEligibleOwners(p);};
  check(groups([[0,0,0,0],[15,0,0,0]])===32769,'isolated bases include owner15, exclude unreferenced owners');
  check(groups([[0,1<<15,0,0],[15,0,0,0]])===0,'cutter and modified base both excluded');
  check(groups([[0,0,1<<15,0],[15,0,0,0]])===0,'intersection and modified base both excluded');
  check(groups([[0,0,0,0],[0,2,0,0]])===0,'one unmodified use cannot override another modified use');
  p.texture[4*96+1]=2;
  check(groups([[0,0,0,0]])===0,'multi-face primitive excluded');
  p.texture[4*96+1]=1;p.texture[4*96+3]=0;
  check(groups([[0,0,0,0]])===0,'non-ball excluded');
}
const row=i=>[...packed.texture.slice(i*4,i*4+4)];
const s3Index=packed.ids.indexOf('curve');
let positiveC=0,carved=0;
for(let i=0;i<packed.counts[0];i++){
  const n=row(2*i),m=row(2*i+1);
  if(m[3]!==s3Index||m[0]>0.5)continue;
  const owner=row(96+m[1]);
  if(owner[1]!==1||owner[3]<0.5)continue;
  // Packed S3 solid stores -centre and -cos(radius/R); the pass reverses BOTH.
  check(-m[2]>0,'reversed packed constant must be positive for an S3 ball');
  check(Math.abs(Math.hypot(...n)-1)<1e-6,'S3 ball row must carry a unit (negated) centre');
  positiveC++;
}
check(positiveC>0,'fixture must contain at least one packed additive-shaped S3 ball');
for(let g=0;g<packed.counts[2];g++){const group=row(112+g);if(group[1]||group[2])carved++;}
check(carved>0,'fixture must contain a carved group, so the additive-only guard is exercised by real data');

// ------------------------------------------------------- recording WebGL2 ---
function createGL({colorBufferFloat=true,framebufferComplete=true,failAt=null,
  maxTextureSize=16384,maxViewportDims=[16384,16384],maxDrawBuffers=4,maxAttachments=4,maxSamplers=16,failAllocationOnce=false}={}){
  let next=1;const name=tag=>({tag,id:next++});
  const calls=[],uniforms=new Map(),locations=new Map();
  const E={TEXTURE_2D:3553,RGBA32F:34836,RGBA32UI:36208,RGBA:6408,RGBA_INTEGER:36249,FLOAT:5126,
    UNSIGNED_INT:5125,UNSIGNED_BYTE:5121,TEXTURE0:33984,FRAMEBUFFER:36160,COLOR_ATTACHMENT0:36064,
    FRAMEBUFFER_COMPLETE:36053,COLOR:6144,BACK:1029,NO_ERROR:0,TRIANGLES:4,VERTEX_SHADER:35633,
    FRAGMENT_SHADER:35632,COMPILE_STATUS:35713,LINK_STATUS:35714,VIEWPORT:2978,DITHER:3024,
    DEPTH_TEST:2929,BLEND:3042,SCISSOR_TEST:3089,TEXTURE_MIN_FILTER:10241,TEXTURE_MAG_FILTER:10240,
    TEXTURE_WRAP_S:10242,TEXTURE_WRAP_T:10243,NEAREST:9728,CLAMP_TO_EDGE:33071,RENDERER:7937,
    MAX_TEXTURE_SIZE:3379,MAX_VIEWPORT_DIMS:3386,MAX_DRAW_BUFFERS:34852,MAX_COLOR_ATTACHMENTS:36063,MAX_TEXTURE_IMAGE_UNITS:34930};
  const state={framebuffer:null,program:null,viewport:[0,0,0,0],unit:E.TEXTURE0,bound:new Map(),errors:[]};
  const log=(op,detail)=>{calls.push({op,framebuffer:state.framebuffer,...detail});};
  const gl={...E,
    getExtension:n=>n==='EXT_color_buffer_float'?(colorBufferFloat?{}:null):null,
    createProgram:()=>name('program'),createShader:()=>name('shader'),createTexture:()=>name('texture'),
    createFramebuffer:()=>name('framebuffer'),createQuery:()=>name('query'),deleteQuery(){},
    shaderSource(){},compileShader(){},attachShader(){},deleteShader(){},linkProgram(){},
    getShaderParameter:()=>true,getProgramParameter:()=>true,getShaderInfoLog:()=>'',getProgramInfoLog:()=>'',
    useProgram(p){state.program=p;log('useProgram',{program:p&&p.id});},
    bindTexture(target,texture){state.bound.set(state.unit,texture);log('bindTexture',{texture:texture&&texture.id,unit:state.unit});},
    activeTexture(unit){state.unit=unit;},
    texParameteri(){},texImage2D(target,level,internal,width,height){
      log('texImage2D',{internal,width,height});
      if(failAllocationOnce&&state.framebuffer){state.errors.push(1285);failAllocationOnce=false;}
    },deleteTexture(){},
    bindFramebuffer(target,fb){state.framebuffer=fb;log('bindFramebuffer',{fb:fb&&fb.id});},
    framebufferTexture2D(){},drawBuffers(list){log('drawBuffers',{count:list.length});},
    readBuffer(){},checkFramebufferStatus:()=>framebufferComplete?E.FRAMEBUFFER_COMPLETE:36054,
    clearBufferuiv(){log('clearBufferuiv',{});},clearBufferfv(){log('clearBufferfv',{});},
    viewport(x,y,w,h){state.viewport=[x,y,w,h];log('viewport',{width:w,height:h});},
    disable(){},enable(){},finish(){},
    getUniformLocation(program,n){const key=`${program.id}:${n}`;
      if(!locations.has(key))locations.set(key,{tag:'loc',name:n,program:program.id});
      return locations.get(key);},
    uniform1i(l,v){if(l)uniforms.set(`${l.program}:${l.name}`,v);},
    uniform1f(l,v){if(l)uniforms.set(`${l.program}:${l.name}`,v);},
    uniform2f(l,a,b){if(l)uniforms.set(`${l.program}:${l.name}`,[a,b]);},
    uniform4fv(l,v){if(l)uniforms.set(`${l.program}:${l.name}`,[...v]);},
    uniform4iv(l,v){if(l)uniforms.set(`${l.program}:${l.name}`,[...v]);},
    drawArrays(){log('drawArrays',{program:state.program&&state.program.id,viewport:[...state.viewport],uniforms:new Map(uniforms)});},
    getError(){return state.errors.shift()??(failAt&&calls.filter(c=>c.op==='drawArrays').length===failAt?1282:E.NO_ERROR);},
    getParameter(p){return p===E.VIEWPORT?[...state.viewport]:p===E.RENDERER?'recording-double'
      :p===E.MAX_DRAW_BUFFERS?maxDrawBuffers:p===E.MAX_COLOR_ATTACHMENTS?maxAttachments:p===E.MAX_TEXTURE_IMAGE_UNITS?maxSamplers:p===E.MAX_TEXTURE_SIZE?maxTextureSize:p===E.MAX_VIEWPORT_DIMS?[...maxViewportDims]:0;},
    readPixels(){},
    beginQuery(){},endQuery(){},getQueryParameter:()=>false};
  return {gl,calls,uniforms,state,
    uniformOf:(program,n)=>uniforms.get(`${program}:${n}`),
    drawCount:()=>calls.filter(c=>c.op==='drawArrays').length};
}
function renderer(options={}){
  const harness=createGL(options);
  const canvas={width:0,height:0,getContext:()=>harness.gl};
  const instance=createConnectedRenderer(canvas,world,{enclosureRefinement:!!options.enclosure});
  // The main program is the first one created; the pass builds its own later.
  const main=harness.calls.find(c=>c.op==='useProgram').program;
  return {...harness,instance,canvas,main,missUniform:()=>harness.uniformOf(main,'uMissPass')};
}
const state={regionId:'entry',position:[0,0,0],camera:{forward:[0,0,-1],right:[1,0,0],up:[0,1,0]}};
const pose=extra=>({...state,...extra});
// A packed E3 camera has primary.w=0, allowing xyz plus distance in one RGBA
// witness. Reject other metrics and unknown regions before any diagnostic draw.
{
  const h=renderer(),s3=packed.ids.find((id,i)=>packed.texture[(128+i)*4]===1),before=h.drawCount();
  check(!!s3,'witness refusal regression requires a non-E3 region');
  for(const regionId of ['not-a-region',s3]){
    assert.throws(()=>h.instance.readE3RayDistance({...state,regionId},7,5),/requires an E3 camera region/);checks++;
  }
  check(h.drawCount()===before,'invalid witness metric cannot submit a draw');
  const unsupported=renderer({colorBufferFloat:false});
  const result=unsupported.instance.readE3RayDistance(state,7,5);
  check(result.status==='unsupported'&&result.values===null,'float witness support is explicitly reported');
  check(unsupported.drawCount()===0,'unsupported witness does not submit a diagnostic draw');
}

// ------------------------------------------------------ default behaviour ---
{
  const h=renderer();const before=h.drawCount();
  h.instance.draw(state,{width:8,height:6});
  check(h.drawCount()===before+1,'a default draw must issue exactly one draw call');
  check(h.missUniform()===0,'uMissPass must default to 0');
  check(h.instance.missPass.status==='disabled','default status is disabled');
  check(h.calls.every(c=>c.framebuffer===null),'a default draw must never bind a framebuffer');
  check(h.instance.missPass.stats.draws===0,'a default draw must not touch the pass at all');
}
// ----------------------------------------------------------- opt-in draw ----
{
  const h=renderer();
  h.instance.draw(state,{width:8,height:6,sphericalMissPass:true});
  check(h.instance.missPass.status==='generated','opt-in draw generates certificates');
  check(h.missUniform()===1,'a generated pass enables consumption for that draw');
  const draws=h.calls.filter(c=>c.op==='drawArrays');
  check(draws.length===2,'opt-in costs exactly one extra draw');
  check(draws[0].framebuffer!==null,'the exclusion draw must target its own framebuffer');
  check(draws[1].framebuffer===null,'the main draw must target the default framebuffer');
  check(draws[0].program!==draws[1].program,'exclusion must be a separate program');
  // State restored BEFORE the main draw: framebuffer, viewport, program, unit 0.
  const order=h.calls.map(c=>c.op);
  const passIndex=h.calls.indexOf(draws[0]),mainIndex=h.calls.indexOf(draws[1]);
  check(h.calls.slice(passIndex,mainIndex).some(c=>c.op==='bindFramebuffer'&&c.fb===null),
    'framebuffer must be restored before the main draw');
  check(h.calls.slice(passIndex,mainIndex).some(c=>c.op==='viewport'),'viewport must be reset before the main draw');
  check(h.calls.slice(passIndex,mainIndex).some(c=>c.op==='useProgram'&&c.program===h.main),
    'the main program must be re-selected before the main draw');
  check(draws[1].viewport[2]===8&&draws[1].viewport[3]===6,'the main draw keeps the requested viewport');
  check(order.includes('clearBufferuiv'),'attachments are cleared so no stale tag can survive');
  check(h.instance.missPass.stats.gpuStatus==='unsupported',
    'a missing GPU timer is reported as unknown cost, never as free');
  // A following default draw must switch consumption straight back off.
  h.instance.draw(state,{width:8,height:6});
  check(h.missUniform()===0,'consumption must be switched off for a non-opt-in draw');
  check(h.instance.missPass.status==='disabled','status returns to disabled');
}
// ------------------------------------------------------------- refusals -----
{
  const h=renderer();
  h.instance.draw(state,{width:8,height:6,sphericalMissPass:true,antialias:true});
  check(h.instance.missPass.status==='antialias-refused','AA without aaRefinement retains its legacy refusal');
  check(h.missUniform()===0,'an AA draw must render through the existing path');
  check(h.drawCount()===1,'a refused pass costs no extra draw');
  check(h.calls.every(c=>c.framebuffer===null),'a refused pass touches no framebuffer');
}
// AA atlas -> centre diagnostics -> AA must reallocate and preserve logical resolution.
{
  const h=renderer(),options={width:7,height:5,sphericalMissPass:true,antialias:true,aaRefinement:true};
  const run=(extra,grid)=>{
    const start=h.calls.length;
    h.instance.draw(state,{...options,...extra});
    const calls=h.calls.slice(start),draws=calls.filter(c=>c.op==='drawArrays');
    check(h.instance.missPass.status==='generated'&&h.missUniform()===1,'eligible sample layout enables consumption');
    check(draws.length===2,'each atlas or centre generation is one extra draw');
    const pass=draws[0],main=draws[1];
    assert.deepEqual(pass.viewport,[0,0,7*grid,5*grid]);checks++;
    assert.deepEqual(main.viewport,[0,0,7,5]);checks++;
    assert.deepEqual(pass.uniforms.get(`${pass.program}:uResolution`),[7,5]);checks++;
    check(pass.uniforms.get(`${pass.program}:uSampleGrid`)===grid,'pass receives the effective sample grid');
    check(main.framebuffer===null,'main draw resumes on the default framebuffer');
    check(h.state.unit===h.gl.TEXTURE0,'pass restores the packed-world texture unit');
    const allocations=calls.filter(c=>c.op==='texImage2D');
    check(allocations.length===3&&allocations.every(c=>c.width===7*grid&&c.height===5*grid),
      'layout transition resizes all three attachments');
    return h.instance.missPass.stats.lastAssociation;
  };
  const aaKey=run({},2),centreKey=run({debug:1},1),aaAgain=run({},2);
  check(aaKey!==centreKey,'AA and centre certificates have distinct associations at identical logical size');
  check(aaKey===aaAgain,'returning to the same AA request restores its association description');
  run({diagnostics:true},1);
  run({debug:9},2);
  run({debug:8},1);
  run({debug:10},2);
  run({debug:10,diagnostics:true},1);
  // Refinement alone does not opt a draw into the optimisation.
  const before=h.drawCount();
  h.instance.draw(state,{...options,sphericalMissPass:false});
  check(h.drawCount()===before+1&&h.missUniform()===0,'refinement leaves the unrequested fallback untouched');
}
// The evidence helper performs independent four-sample debug9 and debug10 draws.
{
  const h=renderer();
  const evidence=h.instance.readAAMissPass(state,7,5);
  const draws=h.calls.filter(c=>c.op==='drawArrays'),mainDraws=draws.filter(c=>c.framebuffer===null);
  check(draws.length===4&&mainDraws.length===2,'AA evidence draws one atlas per debug packet');
  assert.deepEqual(mainDraws.map(c=>c.uniforms.get(`${h.main}:uDebug`)),[9,10]);checks++;
  check(draws.filter(c=>c.framebuffer).every(c=>c.uniforms.get(`${c.program}:uSampleGrid`)===2),
    'both evidence packets use the four-sample atlas');
  check(evidence.status==='generated','AA evidence reports successful generation');
}
// The smallest framebuffer still contains four independent atlas texels.
{
  const h=renderer();
  h.instance.draw(state,{width:1,height:1,sphericalMissPass:true,antialias:true,aaRefinement:true});
  const pass=h.calls.find(c=>c.op==='drawArrays'&&c.framebuffer);
  assert.deepEqual(pass.viewport,[0,0,2,2]);checks++;
}
// Refuse physical resource limits before allocation, then retain the ordinary AA draw.
for(const [limits,size] of [
  [{maxTextureSize:15},{width:8,height:6}],
  [{maxViewportDims:[15,100]},{width:8,height:6}],
  [{maxViewportDims:[100,11]},{width:8,height:6}],
  [{},{width:600,height:600}], // 1200*1200*48 exceeds the 64 MiB cap.
]){
  const h=renderer(limits),start=h.calls.length;
  h.instance.draw(state,{...size,sphericalMissPass:true,antialias:true,aaRefinement:true});
  check(h.instance.missPass.status==='resource-limit','oversized physical atlas is refused');
  check(h.missUniform()===0&&h.drawCount()===1,'resource refusal leaves one ordinary draw with consumption off');
  check(h.instance.missPass.stats.lastAssociation===null,'resource refusal cannot retain an association');
  check(!h.calls.slice(start).some(c=>c.op==='texImage2D'||c.framebuffer),'resource refusal does not allocate or bind a target');
  check(h.uniformOf(h.main,'uAntialias')===1,'resource refusal retains requested AA');
}
for(const width of [0,-1,1.5,NaN,Infinity]){
  const h=renderer();
  h.instance.draw(state,{width,height:5,sphericalMissPass:true,antialias:true,aaRefinement:true});
  check(h.instance.missPass.status==='invalid-size'&&h.missUniform()===0,'non-positive or non-integer dimensions cannot generate certificates');
}
// A partial texture allocation must not commit its size or poison recovery.
{
  const h=renderer({failAllocationOnce:true});
  const options={width:7,height:5,sphericalMissPass:true,antialias:true,aaRefinement:true};
  h.instance.draw(state,options);
  check(h.instance.missPass.status==='allocation-failed'&&h.missUniform()===0,'failed allocation disables consumption');
  check(h.instance.missPass.stats.lastAssociation===null,'failed allocation clears association');
  check(h.drawCount()===1&&h.state.framebuffer===null,'failed allocation restores the framebuffer and draws fallback');
  const start=h.calls.length;
  h.instance.draw(state,options);
  const allocations=h.calls.slice(start).filter(c=>c.op==='texImage2D');
  check(allocations.length===3&&allocations.every(c=>c.width===14&&c.height===10),'same-size retry reallocates every attachment after failure');
  check(h.instance.missPass.status==='generated'&&h.missUniform()===1,'a valid retry recovers generation and consumption');
}
{
  const h=renderer({colorBufferFloat:false});
  h.instance.draw(state,{width:8,height:6,sphericalMissPass:true});
  check(h.instance.missPass.supported===false,'float rendering is required');
  check(h.instance.missPass.status==='unsupported','missing resources are reported as unsupported');
  check(h.missUniform()===0,'unsupported must not enable consumption');
}
{
  const h=renderer({framebufferComplete:false});
  h.instance.draw(state,{width:8,height:6,sphericalMissPass:true});
  check(h.instance.missPass.status==='incomplete-framebuffer','an incomplete target is refused');
  check(h.missUniform()===0,'an incomplete target must not enable consumption');
  check(h.calls.at(-1).framebuffer===null,'the framebuffer binding is restored even on refusal');
}
{
  const h=renderer({failAt:1});
  h.instance.draw(state,{width:8,height:6,sphericalMissPass:true});
  check(h.instance.missPass.status==='gl-error','a GL error during the pass is a refusal');
  check(h.missUniform()===0,'a GL error must not enable consumption');
}
{
  const h=renderer();
  h.instance.draw({...state,regionId:'not-a-region'},{width:8,height:6,sphericalMissPass:true});
  check(h.instance.missPass.status==='unknown-region','an unknown region has no bounded portal mapping');
  check(h.missUniform()===0,'an unknown region must not enable consumption');
}
// --------------------------------------------------------- association ------
{
  const h=renderer(),region=packed.ids.find((id,i)=>packed.texture[(128+i)*4]===1);
  check(!!region,'scope regression needs an S3 region');
  const count=h.drawCount();
  h.instance.draw({...state,regionId:region},{width:8,height:6,sphericalMissPass:true});
  check(h.instance.missPass.status==='outside-scope','S3 starts cannot use the first-E3-transfer pass');
  check(h.drawCount()===count+1,'S3 start must submit only the main draw');
  check(h.instance.missPass.stats.draws===0&&h.missUniform()===0,'skipping must neither generate nor consume certificates');
}
// Every distinguishing part of the draw description must change the key: a
// certificate set proved for one of these is not a certificate for another.
{
  const h=renderer(),keys=new Set();
  const record=(next,options)=>{h.instance.draw(next,{width:8,height:6,sphericalMissPass:true,...options});
    check(h.instance.missPass.status==='generated','association probe must generate');
    keys.add(h.instance.missPass.stats.lastAssociation);};
  record(state,{});
  record(pose({position:[0,0,.5]}),{});
  record(pose({camera:{forward:[0,0,-1],right:[1,0,0],up:[0,1,0.001]}}),{});
  record(state,{width:16,height:6});
  record(state,{width:8,height:12});
  record(state,{range:4});
  record({...state,regionId:'far'},{});
  check(keys.size===7,`pose, viewport, range and region must all change the association (${keys.size})`);
  const repeated=h.instance.missPass.stats.lastAssociation;
  h.instance.draw({...state,regionId:'far'},{width:8,height:6,sphericalMissPass:true});
  check(h.instance.missPass.stats.lastAssociation===repeated,'an identical draw description keeps its key');
}
// World replacement: the revision changes, so no earlier association can match.
{
  const h=renderer();
  h.instance.draw(state,{width:8,height:6,sphericalMissPass:true});
  const before=h.instance.missPass.stats.lastAssociation;
  h.instance.replaceWorld(compileRegionWorld(scene));
  check(h.instance.missPass.stats.lastAssociation===null,'world replacement drops the association');
  check(h.instance.missPass.stats.lastStatus==='world-replaced','world replacement is recorded');
  h.instance.draw(state,{width:8,height:6,sphericalMissPass:true});
  check(h.instance.missPass.stats.lastAssociation!==before,
    'certificates from before a world replacement can never be matched again');
}
// Resize invalidates, and the regenerated set is keyed to the new size.
{
  const h=renderer(),mask=()=>[...h.uniforms].find(([key])=>key.endsWith(':uEligibleOwners'))?.[1];
  h.instance.draw(state,{width:8,height:6,sphericalMissPass:true});
  const original=mask(),edited=structuredClone(scene);
  edited.entities=edited.entities.filter(e=>e.id!=='curve-post');
  const replacement=compileRegionWorld(edited),expected=sphericalEligibleOwners(packConnectedWorld(replacement));
  check(expected!==original,'edit must change the eligibility mask');
  h.instance.replaceWorld(replacement);
  h.instance.draw(state,{width:8,height:6,sphericalMissPass:true});
  check(mask()===expected,'world replacement must upload its own recomputed eligibility');
}
{
  const h=renderer();
  h.instance.draw(state,{width:8,height:6,sphericalMissPass:true});
  const before=h.instance.missPass.stats.lastAssociation;
  h.instance.draw(state,{width:12,height:9,sphericalMissPass:true});
  check(h.instance.missPass.stats.lastAssociation!==before,'a resize regenerates against the new viewport');
  check(h.instance.missPass.status==='generated','resize still produces a live certificate set');
}
// Regeneration per eligible draw: certificates are never carried between draws.
{
  const h=renderer();
  for(let i=0;i<3;i++)h.instance.draw(state,{width:8,height:6,sphericalMissPass:true});
  const stats=h.instance.missPass.stats;
  check(stats.draws===3&&stats.generated===3,'every eligible draw regenerates its own certificates');
  check(h.instance.missPass.consumingDraws===3,'consuming draws are counted');
  check(h.drawCount()===6,'each eligible draw pays for exactly one exclusion draw');
}
// Counters distinguish the four states the contract names.
{
  const h=renderer();
  h.instance.draw(state,{width:8,height:6});
  h.instance.draw(state,{width:8,height:6,sphericalMissPass:true});
  h.instance.draw(state,{width:8,height:6,sphericalMissPass:true,antialias:true});
  const reasons=h.instance.missPass.stats.reasons;
  check(reasons.generated===1&&reasons['antialias-refused']===1,'refusal reasons are counted separately');
  check(h.instance.missPass.stats.refused===1,'refusals are counted');
}
// ----------------------------------------------------- uniform coverage -----
// uniform-coverage.test.js does not reach the connected programs, so the same
// rule is enforced here: a declared-but-never-set uniform silently reads zero,
// which for uMissPass would mean a consumer that can never be switched on (and
// for the pass, a world texture it never binds).
{
  const declared=source=>{const names=new Set();
    for(const m of source.replace(/\/\/.*/g,'').matchAll(/uniform\s+(?:highp\s+|lowp\s+|mediump\s+)?\w+\s+([^;]+);/g))
      for(const part of m[1].split(','))names.add(part.trim().split('[')[0]);
    return names;};
  const h=renderer();
  h.instance.draw(state,{width:8,height:6,sphericalMissPass:true});
  const programs=[...new Set(h.calls.filter(c=>c.op==='useProgram').map(c=>c.program))];
  check(programs.length===2,'exactly two programs participate in an opt-in draw');
  const passProgram=programs.find(p=>p!==h.main);
  for(const name of declared(SPHERICAL_MISS_PASS_FRAGMENT))
    check(h.uniformOf(passProgram,name)!==undefined,`pass uniform ${name} must be located and set`);
  for(const name of ['uMissCertificate','uMissPoint','uMissDirection','uMissPass'])
    check(h.uniformOf(h.main,name)!==undefined,`consumer uniform ${name} must be located and set`);
  // The three certificate samplers must occupy units 1..3, never unit 0.
  const units=['uMissCertificate','uMissPoint','uMissDirection'].map(n=>h.uniformOf(h.main,n));
  check(new Set(units).size===3&&units.every(u=>u>=1&&u<=3),`certificate samplers must use units 1..3 (${units})`);
  check(h.uniformOf(h.main,'uData')===0,'the packed world must stay on unit 0');
}
// ------------------------------------------------- identity over real rows --
// The GPU predicates cannot run in Node, but the packed data they rely on can
// be checked here: the surface -> primitive mapping must be injective and
// bounded, and the non-additive primitives of this fixture must be ineligible.
{
  const eligibleOwner=owner=>{
    const pr=row(96+owner);
    if(pr[1]!==1||pr[3]<0.5)return false;
    let base=false;
    for(let g=0;g<packed.counts[2];g++){
      const group=row(112+g);
      if((group[1]&(1<<owner))||(group[2]&(1<<owner)))return false;
      if(group[0]===owner){if(group[1]||group[2])return false;base=true;}
    }
    return base;
  };
  const owners=new Map();
  for(let j=0;j<packed.counts[1];j++){
    const pr=row(96+j);
    check(pr[0]>=0&&pr[0]+pr[1]<=packed.counts[0],`primitive ${j} surface span must stay inside the packed table`);
    if(pr[1]!==1)continue;
    check(!owners.has(pr[0]),`surface ${pr[0]} must own at most one single-surface primitive`);
    owners.set(pr[0],j);
  }
  // A certificate bit is a SURFACE index; it may only omit that surface's own
  // primitive, so a bit set for one primitive can never silently omit another.
  for(const [surface,owner] of owners)check(row(2*surface+1)[1]===owner,
    `surface ${surface} must name primitive ${owner} as its owner`);
  const carvedOwner=[...Array(packed.counts[1]).keys()].find(j=>{
    for(let g=0;g<packed.counts[2];g++){const group=row(112+g);if(group[1]&(1<<j))return true;}
    return false;});
  check(carvedOwner!==undefined&&!eligibleOwner(carvedOwner),
    'a subtracted primitive must never be eligible: omitting it would enlarge its group');
  const basedOnCarve=[...Array(packed.counts[1]).keys()]
    .find(j=>{for(let g=0;g<packed.counts[2];g++){const group=row(112+g);if(group[0]===j&&group[1])return true;}return false;});
  check(basedOnCarve!==undefined&&!eligibleOwner(basedOnCarve),
    'a group base with modifiers must never be eligible: its solid is not just that ball');
  check([...Array(packed.counts[1]).keys()].some(eligibleOwner),
    'the fixture must still contain an eligible additive ball, or this pass could never fire');
}
// Zero is reserved: a cleared, missing or foreign pixel cannot name a portal.
check(SPHERICAL_MISS_PASS_FRAGMENT.includes('outCertificate=uvec4(0u);'),'refused pixels write no certificate');
check(SPHERICAL_MISS_PASS_FRAGMENT.includes('uvec4(uint(gate+1)'),'the portal index is stored offset by one');
check(SPHERICAL_MISS_CERTIFICATE_TAG>0&&Number.isInteger(SPHERICAL_MISS_CERTIFICATE_TAG),'the tag must be a positive integer');

// Fourth-attachment variant must enforce its OWN resource cost, restore ordinary
// drawing on refusal, then recover. These are lifecycle checks, not GPU proofs.
{
  const h=renderer({enclosure:true});
  h.instance.draw(state,{width:480,height:360,antialias:true,sphericalMissPass:true,aaRefinement:true});
  check(h.instance.missPass.status==='generated','enclosure AA480 fits cap');
  check(h.calls.some(c=>c.op==='drawBuffers'&&c.count===4),'enclosure writes four attachments');
  check(h.uniformOf(h.main,'uMissRadii')===4,'radii uses distinct sampler4');
  h.instance.draw(state,{width:640,height:480,antialias:true,sphericalMissPass:true,aaRefinement:true});
  check(h.instance.missPass.status==='resource-limit'&&h.missUniform()===0,'enclosure AA640 refuses and disables consumption');
  h.instance.draw(state,{width:65,height:49,sphericalMissPass:true});
  check(h.instance.missPass.status==='generated'&&h.missUniform()===1,'enclosure recovers at small size');
  for(const limits of [{maxDrawBuffers:3},{maxAttachments:3},{maxSamplers:4}]){
    const k=renderer({enclosure:true,...limits});k.instance.draw(state,{sphericalMissPass:true});
    check(k.instance.missPass.status==='unsupported-enclosure-resources'&&k.missUniform()===0,'enclosure refuses missing attachment/sampler capability');
  }
}
console.log(`spherical-miss-pass: ${checks} checks passed`);
