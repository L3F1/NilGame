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
import {SPHERICAL_MISS_GLSL,SPHERICAL_MISS_PASS_FRAGMENT,SPHERICAL_MISS_CERTIFICATE_TAG}
  from './engine/geometry/spherical-miss-pass-glsl.js';
import {SPHERICAL_MISS_GLSL as EXPERIMENT_GLSL} from './app/spherical-miss-experiment-glsl.js';
let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++;};

// ---------------------------------------------------------------- source ----
// The interval implementation is shared, not duplicated: the experiment keeps
// its import path and gets the very same string.
check(EXPERIMENT_GLSL===SPHERICAL_MISS_GLSL,'experiment must reuse the geometry-layer helper');

// The contract forbids interval arithmetic inside the live fragment program.
for(const forbidden of ['struct BI','bdown(','bup(','bdot(','firstTransferBands','sphericalMiss(','rayPointBand'])
  check(!CONNECTED_FRAGMENT.includes(forbidden),`CONNECTED_FRAGMENT must not contain ${forbidden}`);
for(const required of ['struct BI','firstTransferBands','sphericalMiss('])
  check(SPHERICAL_MISS_PASS_FRAGMENT.includes(required),`pass program must contain ${required}`);

// Identity requirements of the consumer, stated exactly.
for(const required of [
  `cert.w==${SPHERICAL_MISS_CERTIFICATE_TAG}u`,      // written by THIS pass
  'int(cert.x)==gate+1',                              // THIS portal
  'texelFetch(uMissPoint,texel,0)==newP',             // THIS ray
  'texelFetch(uMissDirection,texel,0)==newU',
  'uMissPass==1','uAntialias==0','crossing==0','stable',
  'certificateRegion=-1;certificateLow=0u;certificateHigh=0u;'])
  check(CONNECTED_FRAGMENT.includes(required),`consumer must require ${required}`);
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
  '(group.y&(1<<owner))!=0||(group.z&(1<<owner))!=0'])
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
function createGL({colorBufferFloat=true,framebufferComplete=true,failAt=null}={}){
  let next=1;const name=tag=>({tag,id:next++});
  const calls=[],uniforms=new Map(),locations=new Map();
  const E={TEXTURE_2D:3553,RGBA32F:34836,RGBA32UI:36208,RGBA:6408,RGBA_INTEGER:36249,FLOAT:5126,
    UNSIGNED_INT:5125,UNSIGNED_BYTE:5121,TEXTURE0:33984,FRAMEBUFFER:36160,COLOR_ATTACHMENT0:36064,
    FRAMEBUFFER_COMPLETE:36053,COLOR:6144,BACK:1029,NO_ERROR:0,TRIANGLES:4,VERTEX_SHADER:35633,
    FRAGMENT_SHADER:35632,COMPILE_STATUS:35713,LINK_STATUS:35714,VIEWPORT:2978,DITHER:3024,
    DEPTH_TEST:2929,BLEND:3042,SCISSOR_TEST:3089,TEXTURE_MIN_FILTER:10241,TEXTURE_MAG_FILTER:10240,
    TEXTURE_WRAP_S:10242,TEXTURE_WRAP_T:10243,NEAREST:9728,CLAMP_TO_EDGE:33071,RENDERER:7937};
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
    texParameteri(){},texImage2D(){},deleteTexture(){},
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
    drawArrays(){log('drawArrays',{program:state.program&&state.program.id,viewport:[...state.viewport]});},
    getError(){return failAt&&calls.filter(c=>c.op==='drawArrays').length===failAt?1282:E.NO_ERROR;},
    getParameter(p){return p===E.VIEWPORT?[...state.viewport]:p===E.RENDERER?'recording-double':0;},
    readPixels(){},
    beginQuery(){},endQuery(){},getQueryParameter:()=>false};
  return {gl,calls,uniforms,state,
    uniformOf:(program,n)=>uniforms.get(`${program}:${n}`),
    drawCount:()=>calls.filter(c=>c.op==='drawArrays').length};
}
function renderer(options={}){
  const harness=createGL(options);
  const canvas={width:0,height:0,getContext:()=>harness.gl};
  const instance=createConnectedRenderer(canvas,world);
  // The main program is the first one created; the pass builds its own later.
  const main=harness.calls.find(c=>c.op==='useProgram').program;
  return {...harness,instance,canvas,main,missUniform:()=>harness.uniformOf(main,'uMissPass')};
}
const state={regionId:'entry',position:[0,0,0],camera:{forward:[0,0,-1],right:[1,0,0],up:[0,1,0]}};
const pose=extra=>({...state,...extra});

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
  check(h.instance.missPass.status==='antialias-refused','AA must refuse this optimisation for now');
  check(h.missUniform()===0,'an AA draw must render through the existing path');
  check(h.drawCount()===1,'a refused pass costs no extra draw');
  check(h.calls.every(c=>c.framebuffer===null),'a refused pass touches no framebuffer');
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
console.log(`spherical-miss-pass: ${checks} checks passed`);
