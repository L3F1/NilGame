// REAL GPU EVIDENCE FOR THE EXPERIMENTAL H3 PATH. Nothing here is simulated:
// every status, owner, distance and normal on the GPU side comes from
// createConnectedRenderer -- the runtime GLSL in connected-shader.js -- drawn by
// WebGL2 and read back with gl.readPixels. The CPU side is traceRegionSight on
// the same saved scene and the same camera. No JavaScript reimplementation of
// the shader exists in this file; if the GPU is unavailable the probe REPORTS
// that and produces no numbers.
//
// Compile success is not admission. The probe compares ANSWERS per pixel and
// reports every disagreement, then measures frame time separately from CPU
// query time so neither can be quoted as the other.
//
// The four lead-review findings each have a view that can falsify them:
//   1 metric unitization    h3-metric-camera-radial, h3-metric-camera-oblique
//   2 entry+exit roots      h3-entry-exit-sweep, h3-beyond-ball
//   3 bounded normals       every H3 hit (checkNormal below, in the metric)
//   4 foreground ordering   h3-foreground-bounds-aperture, refusal-far-apertures
import {compileHyperbolicRegionWorld} from '../engine/world/region-world.js';
import {traceRegionSight} from '../engine/world/region-sight.js';
import {createConnectedRenderer} from '../engine/geometry/connected-renderer.js';
import {createCameraFrame,turn} from '../engine/world/camera-frame.js';
import {h3LocalFrame} from '../engine/geometry/hyperbolic-gpu.js';

export const SCENE_PATH='../levels/fixtures/connected-h3-cpu.nil.json';
// Vertical field of view baked into CONNECTED_FRAGMENT (tan(35 degrees)).
export const FOV=70;

// DELIBERATELY NON-AXIS POSES. An axis-aligned camera hides sign and transport
// errors, because the chart basis and the aperture frame then coincide.
// Ranges are chosen from the CPU reference behaviour at this fixture (measured,
// not guessed), so each view carries informative hits, misses or refusals rather
// than one uniform answer.
export const VIEWS=Object.freeze([
  {label:'h3-ball-oblique',regionId:'hyperbolic',position:[0,.5,0],yaw:-Math.atan2(1,.5)+.23,pitch:.17,range:6,
   expect:'single additive H3 ball, off-axis: landmark hits with hyperbolic normals, surrounded by misses'},
  // FINDING 2. The range is far beyond the ball's exit root, so the shared
  // occupancy sweep decides at a midpoint well OUTSIDE the ball unless both
  // boundaries reach it. An entry-only primitive turns these hits into misses.
  // CPU reference at 49x37: 119 hits, and at 21x15 20 hits beside 250
  // aperture-query refusals, so the same view also tests finding 4.
  {label:'h3-entry-exit-sweep',regionId:'hyperbolic',position:[0,.5,0],yaw:-Math.atan2(1,.5)+.11,pitch:.08,range:12,
   expect:'landmark hits must survive a range many times the ball exit: both boundary roots reach the sweep'},
  // Range 20 is roughly twelve times this ball exit root. CPU reference at
  // 49x37: 109 hits and 1704 aperture-query refusals -- the refusals are the
  // pixels where the rejected aperture relaxation used to hand back an answer.
  {label:'h3-beyond-ball',regionId:'hyperbolic',position:[2,2,0],yaw:1.863,pitch:-.17,range:20,
   expect:'hits at an extreme range past the ball exit, and refusals wherever the CPU refuses'},
  // FINDING 1. A non-origin camera, radial and then oblique. At radial distance
  // d the ambient Euclidean norm of a unit tangent is sqrt(cosh(2d/R)); these
  // poses are far enough out that an ambient normalize is a gross speed error,
  // not a rounding difference. ambientStretch reports it per view: 1.31 and 1.20
  // here, against a distance tolerance of 2e-3.
  {label:'h3-metric-camera-radial',regionId:'hyperbolic',position:[5,0,0],yaw:.694,pitch:.07,range:9,
   expect:'camera at radial distance 5 (CPU: 14 hits): ray speed must be metric-unit, not ambient-unit'},
  {label:'h3-metric-camera-oblique',regionId:'hyperbolic',position:[2.5,2.5,1],yaw:1.752,pitch:.11,range:9,
   expect:'oblique off-plane camera (CPU: 27 hits): every axis mixes, so a wrong unitization tilts the rays'},
  {label:'e3-into-h3',regionId:'flat',position:[0,-1,0],yaw:.21,pitch:-.13,range:6,
   expect:'E3 start, landmark hits in H3 through the entry aperture: ownership must change at the gate'},
  {label:'h3-through-return',regionId:'hyperbolic',position:[0,.5,0],yaw:.18,pitch:.11,range:6,
   expect:'forward leg E3/H3/E3: misses must end in the return region for rays through the exit gate'},
  {label:'return-back-to-h3',regionId:'return',position:[0,1,0],yaw:Math.PI+.19,pitch:.09,range:6,
   expect:'return leg: E3 back through the reverse aperture, landmark hits owned by the H3 region'},
  {label:'near-solid-vs-remote-gate',regionId:'hyperbolic',position:[0,.5,0],yaw:-Math.atan2(1,.5)+.05,pitch:.03,range:2,
   expect:'nearer solid wins over the remote gate at the range limit; a tie or rim must still refuse'},
  // FINDING 4. A nearer certified solid does NOT license an uncertain aperture:
  // queryHyperbolicAperture exports uncertaintyFrom 0, so the CPU refuses the
  // whole ray. Every pixel the CPU refuses is counted as answeredRefusals if the
  // GPU answers it; h3-entry-exit-sweep, h3-beyond-ball and refusal-far-apertures
  // together contribute over two thousand such pixels at 49x37.
  {label:'refusal-inside-ball',regionId:'hyperbolic',position:[1,1,0],yaw:.37,pitch:.12,range:4,
   expect:'start inside the ball: every ray unresolved (numerical kind 2), never sky or a surface'},
  {label:'refusal-far-apertures',regionId:'hyperbolic',position:[0,6,0],yaw:-Math.PI/2+.17,pitch:.11,range:12,
   expect:'long H3 rays where the CPU refuses on aperture range/domain ambiguity: the GPU must refuse too'},
  // The two poses with SAVED CPU pixel packets (tools/connected-sight-probe.js
  // --runtime experimental-h3 --range 6, replayed by hyperbolic-sight-packet.test.js),
  // so the GPU is compared on exactly the reference views as well as oblique ones.
  {label:'saved-reference-h3-entry',regionId:'flat',position:[0,-1,0],yaw:0,pitch:0,range:6,
   expect:'saved CPU reference pose h3-entry'},
  {label:'saved-reference-h3-landmark',regionId:'hyperbolic',position:[0,.5,0],yaw:-Math.atan2(1,.5),pitch:0,range:6,
   expect:'saved CPU reference pose h3-landmark'},
]);

const AGREE='agree',CONSERVATIVE='gpu-refused-where-cpu-answered',DISAGREE='disagree';

export function poseCamera(world,view){
  const region=world.regions.get(view.regionId);
  if(!region)throw Error(`Unknown region ${view.regionId}`);
  const position=region.space.decode(view.position),basis=region.space.frame(position);
  return turn(createCameraFrame(region.space,position,{forward:basis[1],up:basis[2]}),
    {yaw:view.yaw??0,pitch:view.pitch??0});
}
// Same convention as the shader's pixelRay: both axes normalised by HEIGHT,
// row 0 at the top. space.normalize is the REGION's metric unitization, which is
// what the repaired pixelRay does; ambientStretch below records how far that is
// from an ambient normalize at this pose, so a view cannot silently be a place
// where the distinction does not matter.
export function pixelDirection(space,camera,{width,height},px,py){
  const focal=1/Math.tan(FOV*Math.PI/360);
  const u=(2*(px+.5)-width)/height,v=(height-2*(py+.5))/height;
  return space.normalize(camera.position,
    camera.forward.map((f,i)=>f*focal+camera.right[i]*u+camera.up[i]*v));
}
// How badly an ambient normalize would have mis-scaled this pose's rays. 1 means
// the two unitizations coincide and the view cannot test finding 1 at all.
export function ambientStretch(space,camera,size){
  let worst=1;
  for(const [px,py] of [[0,0],[size.width-1,0],[0,size.height-1],[size.width-1,size.height-1],
    [size.width>>1,size.height>>1]]){
    const d=pixelDirection(space,camera,size,px,py),ambient=Math.hypot(...d);
    worst=Math.max(worst,ambient,1/ambient);
  }
  return worst;
}
const percentile=(sorted,f)=>sorted.length?sorted[Math.min(sorted.length-1,Math.round(f*(sorted.length-1)))]:0;
const regionIsH3=(packed,index)=>index>=0&&packed.texture[(128+index)*4]>1.5;
// RGBA8 -> [-1,1] per component, the inverse of the shader's x*.5+.5.
const decodeNormal=(bytes,at)=>[0,1,2,3].map(k=>bytes[at+k]/127.5-1);

// FINDING 3. For an H3 hit the shader writes the BOUNDED local orthonormal-frame
// coordinate (h3LocalFrame), not the ambient tangent, whose components leave
// [-1,1] with radius and clip in RGBA8. So compare in that frame -- which is an
// isometry from the tangent metric onto the Euclidean 3-vector -- and require
// the decoded vector to be metric-unit.
//
// The GPU frame sits at the GPU hit point and the CPU frame at the CPU hit
// point. That is a BOUNDED agreement check, not a transported comparison: it is
// only meaningful because the two points already agreed to tolerance.distance,
// and the residual is of that order. It is not offered as a proof of equality.
export function checkNormal(gpuNormal,cpu,isH3,tolerance){
  if(!cpu.query?.normal)return {delta:0};
  if(!isH3){
    const delta=Math.max(...cpu.query.normal.map((x,i)=>Math.abs(x-gpuNormal[i])));
    return delta>tolerance.normal
      ?{delta,detail:`normal ${gpuNormal.map(x=>x.toFixed(3))} vs ${cpu.query.normal.map(x=>x.toFixed(3))}`}
      :{delta};
  }
  if(Math.abs(gpuNormal[3]-1)>tolerance.normal)
    return {delta:1,detail:`H3 normal packet is not tagged with the bounded encoding (alpha ${gpuNormal[3].toFixed(3)})`};
  const reference=h3LocalFrame(cpu.query.point,cpu.query.normal);
  const unit=Math.hypot(...gpuNormal.slice(0,3));
  if(Math.abs(unit-1)>tolerance.unit)
    return {delta:Math.abs(unit-1),detail:`decoded H3 normal has metric norm ${unit.toFixed(4)}, not 1`};
  const delta=Math.max(...reference.map((x,i)=>Math.abs(x-gpuNormal[i])));
  return delta>tolerance.normal
    ?{delta,detail:`H3 normal (local frame) ${gpuNormal.slice(0,3).map(x=>x.toFixed(3))} vs ${reference.map(x=>x.toFixed(3))}`}
    :{delta};
}

// Compare ONE pixel. GPU refusals where the CPU answered are recorded
// separately: float32 guard bands may legitimately be more conservative. The
// reverse -- a GPU answer where the CPU refused -- is always a disagreement,
// and it is the precise shape of the rejected aperture relaxation (finding 4),
// so it is counted on its own as well.
export function comparePixel(gpu,cpu,packed,tolerance){
  const {status,region,owner,kind,distance,normal}=gpu;
  const cpuStatus=cpu.status;
  if(status===2)return {verdict:cpuStatus==='unresolved'?AGREE:CONSERVATIVE,
    detail:`gpu unresolved kind ${kind} vs cpu ${cpuStatus}`};
  if(cpuStatus==='unresolved')return {verdict:DISAGREE,answeredRefusal:true,
    detail:`gpu ${status===1?'hit':'miss'} where cpu refused (${cpu.reason})`};
  // A miss still has provenance: the region the ray ended in must match, or a
  // crossing went to the wrong destination and no colour would reveal it.
  if(status===0)return cpuStatus!=='miss'?{verdict:DISAGREE,detail:`gpu miss vs cpu hit ${cpu.query?.owner}`}
    :packed.ids[region]===cpu.regionId?{verdict:AGREE}
      :{verdict:DISAGREE,detail:`miss ended in ${packed.ids[region]} vs ${cpu.regionId}`};
  if(cpuStatus!=='hit')return {verdict:DISAGREE,detail:`gpu hit vs cpu ${cpuStatus}`};
  const gpuRegion=packed.ids[region],gpuOwner=packed.primitiveIds[owner];
  if(gpuRegion!==cpu.regionId)return {verdict:DISAGREE,detail:`region ${gpuRegion} vs ${cpu.regionId}`};
  const cpuOwner=cpu.query?.owner??cpu.query?.additiveOwner;
  if(gpuOwner!==cpuOwner)return {verdict:DISAGREE,detail:`owner ${gpuOwner} vs ${cpuOwner}`};
  const dd=Math.abs(distance-cpu.distance);
  if(dd>tolerance.distance)return {verdict:DISAGREE,detail:`distance ${distance} vs ${cpu.distance}`,distanceDelta:dd};
  const n=checkNormal(normal,cpu,regionIsH3(packed,region),tolerance);
  if(n.detail)return {verdict:DISAGREE,detail:n.detail,distanceDelta:dd,normalDelta:n.delta};
  return {verdict:AGREE,distanceDelta:dd,normalDelta:n.delta};
}

export function probeView(renderer,world,view,{width=49,height=37,work=4096}={}){
  const camera=poseCamera(world,view),space=world.regions.get(view.regionId).space;
  const state={regionId:view.regionId,position:camera.position,
    camera:{forward:camera.forward,right:camera.right,up:camera.up}};
  const range=view.range??renderer.packed.maxDistance;
  // GPU READBACK of the runtime shader, at the same range as the CPU query.
  const read=renderer.read(state,width,height,{range,polished:false,ao:false});
  const counts={hit:0,miss:0,'unresolved-numeric':0,'unresolved-chart':0};
  const verdicts={[AGREE]:0,[CONSERVATIVE]:0,[DISAGREE]:0};
  const owners=new Map(),reasons=new Map(),samples=[];
  let maxDistanceDelta=0,maxNormalDelta=0,cpuMicroseconds=0,answeredRefusals=0,cpuHits=0;
  for(let py=0;py<height;py++)for(let px=0;px<width;px++){
    // readPixels row 0 is the BOTTOM of the framebuffer; the CPU grid row 0 is
    // the top. Flipping here, not in the comparison, keeps the ray identical.
    const at=((height-1-py)*width+px)*4;
    const gpu={status:read.pixels[at],region:read.pixels[at+1]-1,owner:read.pixels[at+2]-1,
      kind:read.pixels[at+3],distance:read.distances[(height-1-py)*width+px],
      normal:decodeNormal(read.normals,at)};
    counts[gpu.status===1?'hit':gpu.status===0?'miss':gpu.kind===1?'unresolved-chart':'unresolved-numeric']++;
    if(gpu.status===1)owners.set(`${packedId(renderer,gpu)}`,(owners.get(`${packedId(renderer,gpu)}`)??0)+1);
    const direction=pixelDirection(space,camera,{width,height},px,py);
    const started=performance.now();
    const cpu=traceRegionSight(world,{regionId:view.regionId,position:camera.position,direction},
      {maxDistance:range,maxWork:work});
    cpuMicroseconds+=(performance.now()-started)*1000;
    if(cpu.status==='hit')cpuHits++;
    if(cpu.status==='unresolved')reasons.set(cpu.reason,(reasons.get(cpu.reason)??0)+1);
    const tolerance={distance:Math.max(2e-3,5e-4*Math.max(1,cpu.distance)),normal:.04,unit:.03};
    const outcome=comparePixel(gpu,cpu,renderer.packed,tolerance);
    verdicts[outcome.verdict]++;
    if(outcome.answeredRefusal)answeredRefusals++;
    maxDistanceDelta=Math.max(maxDistanceDelta,outcome.distanceDelta??0);
    maxNormalDelta=Math.max(maxNormalDelta,outcome.normalDelta??0);
    if(outcome.verdict!==AGREE&&samples.length<12)
      samples.push({px,py,verdict:outcome.verdict,detail:outcome.detail,
        gpu:{status:gpu.status,kind:gpu.kind,region:renderer.packed.ids[gpu.region],
          owner:renderer.packed.primitiveIds[gpu.owner],distance:gpu.distance},
        cpu:{status:cpu.status,reason:cpu.reason,regionId:cpu.regionId,
          owner:cpu.query?.owner??null,distance:cpu.distance}});
  }
  return {label:view.label,expect:view.expect,range,width,height,counts,verdicts,samples,
    owners:Object.fromEntries(owners),cpuReasons:Object.fromEntries(reasons),cpuHits,
    // A view whose GPU hit count collapses while the CPU still sees hits is the
    // signature of the entry-only sweep; report both so it cannot hide in a sum.
    hitShortfall:Math.max(0,cpuHits-counts.hit),answeredRefusals,
    ambientStretch:ambientStretch(space,camera,{width,height}),
    maxDistanceDelta,maxNormalDelta,cpuMicroseconds};
}
const packedId=(renderer,gpu)=>`${renderer.packed.ids[gpu.region]}/${renderer.packed.primitiveIds[gpu.owner]}`;

// Frame distribution measured on the GPU alone: one wall-clock sample per
// finished draw, plus the driver's own timer queries when the extension exists.
// It shares nothing with the CPU query time reported above.
export function measureFrames(renderer,world,view,{width=320,height=240,frames=90}={}){
  const camera=poseCamera(world,view);
  const state={regionId:view.regionId,position:camera.position,
    camera:{forward:camera.forward,right:camera.right,up:camera.up}};
  const options={width,height,range:view.range,timer:true};
  for(let i=0;i<10;i++){renderer.draw(state,options);}renderer.finish();
  const wall=[];
  for(let i=0;i<frames;i++){
    const started=performance.now();renderer.draw(state,options);renderer.finish();
    wall.push(performance.now()-started);
  }
  const sorted=[...wall].sort((a,b)=>a-b),timer=[...renderer.times].sort((a,b)=>a-b);
  return {label:view.label,width,height,frames,
    wallMilliseconds:{p50:percentile(sorted,.5),p90:percentile(sorted,.9),max:sorted.at(-1)},
    timerMilliseconds:timer.length?{samples:timer.length,p50:percentile(timer,.5),p90:percentile(timer,.9)}:null,
    timerSupported:renderer.timerSupported};
}

export async function runProbe({canvas,scenePath=SCENE_PATH,onProgress=()=>{}}={}){
  const response=await fetch(scenePath);
  if(!response.ok)throw Error(`Cannot load ${scenePath}: ${response.status}. Serve the repo over HTTP.`);
  const scene=await response.json();
  const world=compileHyperbolicRegionWorld(scene);
  // Default admission must still refuse, in the same page that opts in.
  let defaultRefused=null;
  try{createConnectedRenderer(canvas,world);defaultRefused=false;}
  catch(error){defaultRefused=error.message;}
  // This constructor compiles and links the runtime GLSL. A compile error is
  // reported as such -- but a successful compile is NOT admission of anything.
  const renderer=createConnectedRenderer(canvas,world,{experimentalH3:true});
  const views=[];
  for(const view of VIEWS){onProgress(`probing ${view.label}`);views.push(probeView(renderer,world,view));}
  onProgress('measuring frames');
  const frames=[VIEWS[0],VIEWS[2]].map(view=>measureFrames(renderer,world,view));
  // Inspectable images from the SAME shader and poses, at a human size. A
  // reviewer must look at these; counts alone do not show a wrong geometry.
  const images=[];
  for(const view of VIEWS){
    onProgress(`drawing ${view.label}`);
    const camera=poseCamera(world,view);
    const state={regionId:view.regionId,position:camera.position,
      camera:{forward:camera.forward,right:camera.right,up:camera.up}};
    renderer.draw(state,{width:320,height:240,range:view.range,diagnostics:true});
    images.push({label:view.label,dataUrl:canvas.toDataURL('image/png')});
  }
  const disagreements=views.reduce((s,v)=>s+v.verdicts[DISAGREE],0);
  const answeredRefusals=views.reduce((s,v)=>s+v.answeredRefusals,0);
  const hitShortfall=views.reduce((s,v)=>s+v.hitShortfall,0);
  return {scene:scene.id,hardware:renderer.hardware,defaultRefused,
    counts:renderer.packed.counts,views,frames,images,disagreements,
    answeredRefusals,hitShortfall,
    verdict:disagreements?'DISAGREEMENTS FOUND':'no per-pixel disagreement in these views',
    note:'GPU answers come from gl.readPixels on the runtime GLSL. Agreement is evidence, not proof. '+
      'answeredRefusals>0 is a GPU answer where the CPU refused; hitShortfall>0 is the entry-only sweep signature.'};
}
