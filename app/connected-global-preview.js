import {createConnectedGlobalPreview} from './connected-global-model.js';
import {createConnectedRenderer} from '../engine/geometry/connected-renderer.js';
import {createMouseLook} from './mouse-look.js';
import {rollAgainst} from '../engine/world/camera-frame.js';
const canvas=document.querySelector('#view'),status=document.querySelector('#status'),details=document.querySelector('#details');
const checking=new URLSearchParams(location.search).has('check');
const checks=[],shots=[];
async function report(err='',extra={}){await fetch('/__report',{method:'POST',body:JSON.stringify({err,hud:status.textContent,checks,shots,...extra})});}
function failure(error){status.textContent=`Preview stopped: ${error.message||error}`;if(checking)report(String(error.stack||error));}
try {
  const response=await fetch('../levels/fixtures/connected-global.nil.json');if(!response.ok)throw Error(`Scene HTTP ${response.status}`);
  const scene=await response.json();
  // The model calls installWorld only for edits, never for its initial compile.
  let renderer;
  const model=createConnectedGlobalPreview(scene,{installWorld:nextWorld=>renderer.replaceWorld(nextWorld)}),coldStart=performance.now();
  renderer=createConnectedRenderer(canvas,model.world);
  // Four rays are affordable on the tested GPU, but not software fallback.
  // This is a starting preference, not a performance guarantee; keep the toggle.
  const defaultSmoothing=!/SwiftShader|llvmpipe|softpipe|software/i.test(renderer.hardware);
  document.querySelector('#smooth').checked=defaultSmoothing;
  // CPU comparisons use the renderer's own range; never a local default.
  const maxDistance=renderer.packed.maxDistance;
  if(!Number.isFinite(maxDistance)||maxDistance<=0)throw Error('Renderer packet lacks maxDistance');
  const mouse=createMouseLook(),keys=new Set();let playing=false,last=null;
  const dimensions=()=>{const width=Number(document.querySelector('#quality').value);return{width,height:width*3/4};};
  // Colour-only style; debug packets must not depend on it.
  const appearance=()=>({polished:document.querySelector('#polished').checked,ao:document.querySelector('#ao').checked});
  // Smooth edges averages four display samples; the diagnostics view always shows single centre rays.
  const smoothing=()=>document.querySelector('#smooth').checked&&!document.querySelector('#diagnostics').checked;
  function draw(){
    renderer.draw(model.state,{...dimensions(),...appearance(),antialias:smoothing(),diagnostics:document.querySelector('#diagnostics').checked});
    status.textContent=model.status();
    const guide=model.renderGuide(),near=guide.nearest,aim=guide.aimed;
    document.querySelector('#portal-hint').textContent=[
      near?`Nearest: ${near.name}, ${near.distance.toFixed(2)} units by shortest path, ${near.side} side.`:'',
      aim?`Crosshair: ${aim.name} after ${aim.distance.toFixed(2)} units of forward travel. ${aim.bodyFits?'Body fits the aperture; destination checked on crossing.':'Too close to the rim for your body — aim nearer the centre.'}`:
        guide.solid?`Crosshair hits solid ${guide.solid}; green balls are landmarks, not portals.`:'No entering portal on the crosshair ray. Approach a portal from its front side.'
    ].join(' ');
    syncEditControls();
  }
  function stop(){playing=false;keys.clear();mouse.reset(false,performance.now());last=null;}
  document.querySelector('#controls').onclick=e=>{if(e.target.dataset.action){stop();document.exitPointerLock();
    try{model.act(e.target.dataset.action);draw();}catch(error){editor.message.textContent=`Placement refused: ${error.message||error}`;}}};
  canvas.onclick=()=>{if(!model.halted)canvas.requestPointerLock()?.catch(e=>{status.textContent=`Mouse capture failed: ${e.message}`;});};
  document.addEventListener('pointerlockchange',()=>{stop();playing=document.pointerLockElement===canvas;mouse.reset(playing,performance.now());});
  document.addEventListener('mousemove',e=>mouse.push(e.movementX,e.movementY,performance.now()));
  document.addEventListener('keydown',e=>{if(playing&&['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ShiftRight'].includes(e.code)){e.preventDefault();keys.add(e.code);}});
  document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{stop();document.exitPointerLock();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();document.exitPointerLock();}});
  document.querySelector('#quality').onchange=draw;
  document.querySelector('#diagnostics').onchange=draw;
  document.querySelector('#polished').onchange=draw;
  document.querySelector('#ao').onchange=draw;
  document.querySelector('#smooth').onchange=draw;
  // Bounded entity editing. The model validates candidates and owns history; the page only builds
  // patches in each entity's own chart-local coordinates. No chart conversion happens here.
  const editor=Object.fromEntries(['region','entity','frame','x','y','z','radius','apply','undo','redo','download','load','message'].map(k=>[k,document.querySelector(`#edit-${k}`)]));
  const editable=typeof model.editEntities==='function',axes=['x','y','z'];
  const EDITABLE={ball:['position','radius'],anchor:['position','radius'],spawn:['position']};
  let selectedFields=[],loading=Promise.resolve(),loadGeneration=0;
  const entityRows=doc=>[...doc.baseScene.entities.map(entity=>({regionId:entity.regionId,frame:`region ${entity.regionId}`,entity})),
    ...(doc.coverRegions||[]).flatMap(r=>r.entities.map(entity=>({regionId:r.id,frame:`chart ${entity.chartId}`,entity})))];
  const regionRows=doc=>[...doc.baseScene.regions.map(r=>({id:r.id,label:`${r.id} · ${r.geometry.kind} region`})),
    ...(doc.coverRegions||[]).map(r=>({id:r.id,label:`${r.id} · ${r.geometry.kind} cover · ${r.charts.length} charts`}))];
  // Every connection naming the anchor; apertures must stay equal, so radius edits resize all of them together.
  const portalPartners=(doc,id)=>[...new Set([...doc.baseScene.connections,...(doc.connections||[])]
    .flatMap(c=>c.a===id?[c.b]:c.b===id?[c.a]:[]).filter(other=>other!==id))];
  function setOptions(select,rows){
    const previous=select.value;
    select.replaceChildren(...rows.map(({id,label})=>new Option(label,id)));
    select.value=rows.some(r=>r.id===previous)?previous:rows[0]?.id??'';
  }
  function syncEditControls(){
    if(!editable)return;
    const halted=model.halted;
    editor.apply.disabled=halted||!selectedFields.length;
    editor.undo.disabled=halted||!model.canUndo;editor.redo.disabled=halted||!model.canRedo;
    editor.load.disabled=halted;
  }
  // Rebuild selectors and fields from the model's current document.
  function refreshEditor(){
    const doc=model.document(),rows=entityRows(doc);
    setOptions(editor.region,regionRows(doc));
    setOptions(editor.entity,rows.filter(r=>r.regionId===editor.region.value).map(r=>({id:r.entity.id,label:`${r.entity.id} · ${r.entity.kind} · ${r.frame}`})));
    const row=rows.find(r=>r.entity.id===editor.entity.value),e=row?.entity;
    selectedFields=EDITABLE[e?.kind]||[];
    const position=selectedFields.includes('position'),radius=selectedFields.includes('radius');
    axes.forEach((k,i)=>{editor[k].disabled=!position;editor[k].value=position?String(e.position[i]):'';});
    editor.radius.disabled=!radius;editor.radius.value=radius?String(e.radius):'';
    editor.frame.textContent=!e?'No entities in this region.':
      `${e.id} (${e.kind}) in ${row.frame} of ${row.regionId}${e.forward?`; forward [${e.forward}], up [${e.up}] (read-only)`:''}${selectedFields.length?'':'; not editable here'}.`;
    syncEditControls();
  }
  function numberField(key){
    const text=editor[key].value.trim(),value=Number(text);
    if(!text||!Number.isFinite(value))throw Error(`${key} must be a finite number`);
    return value;
  }
  // Only changed properties are patched; a paired radius goes into the same editEntities call.
  function buildEdits(){
    const doc=model.document(),row=entityRows(doc).find(r=>r.entity.id===editor.entity.value);
    if(!row)throw Error('Select an entity');
    const e=row.entity,fields=EDITABLE[e.kind]||[],patch={},edits=[{id:e.id,patch}];
    if(!fields.length)throw Error(`${e.kind} entities are not editable here`);
    if(fields.includes('position')){const p=axes.map(k=>numberField(k));if(p.some((v,i)=>v!==e.position[i]))patch.position=p;}
    if(fields.includes('radius')){
      const r=numberField('radius');
      if(r!==e.radius){patch.radius=r;if(e.kind==='anchor')for(const id of portalPartners(doc,e.id))edits.push({id,patch:{radius:r}});}
    }
    return Object.keys(patch).length?edits:null;
  }
  // Validation errors go to the edit message only: no fatal failure and no redraw over the old image.
  function editAction(action,{fromLoad=false}={}){
    if(!fromLoad)loadGeneration++;
    stop();document.exitPointerLock();
    let done;
    try{done=action();}catch(error){editor.message.textContent=`Edit refused: ${error.message||error}`;syncEditControls();return false;}
    editor.message.textContent=done;refreshEditor();
    try{draw();}catch(error){failure(error);}
    return true;
  }
  if(!editable){document.querySelector('#editor').disabled=true;editor.message.textContent='Editing is unavailable: this model has no edit history.';}
  else {
    editor.region.onchange=editor.entity.onchange=()=>{editor.message.textContent='';refreshEditor();};
    editor.apply.onclick=()=>editAction(()=>{
      const edits=buildEdits();if(!edits)return 'No changes to apply.';
      model.editEntities(edits);return `Applied edit to ${edits.map(e=>e.id).join(' and ')}.`;
    });
    editor.undo.onclick=()=>editAction(()=>{model.undoEdit();return 'Undid the last edit.';});
    editor.redo.onclick=()=>editAction(()=>{model.redoEdit();return 'Redid the edit.';});
    editor.download.onclick=()=>{
      const doc=model.document(),url=URL.createObjectURL(new Blob([JSON.stringify(doc,null,2)+'\n'],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download=`${doc.id||'connected-global'}.nil.json`;link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);editor.message.textContent=`Downloaded ${link.download}.`;
    };
    editor.load.onchange=()=>{
      const generation=++loadGeneration;
      const file=editor.load.files[0];stop();document.exitPointerLock();
      loading=(file?file.text():Promise.resolve(null))
        .then(text=>{if(generation===loadGeneration&&text!==null)editAction(()=>{model.loadDocument(JSON.parse(text));return `Loaded ${file.name}.`;},{fromLoad:true});},
          error=>{if(generation===loadGeneration)editor.message.textContent=`Edit refused: could not read file (${error.message||error})`;})
        .finally(()=>{if(generation===loadGeneration)editor.load.value='';});
    };
    refreshEditor();
  }
  const wish=()=>[Number(keys.has('KeyD'))-Number(keys.has('KeyA')),Number(keys.has('KeyW'))-Number(keys.has('KeyS')),Number(keys.has('Space'))-Number(keys.has('ShiftLeft')||keys.has('ShiftRight'))];
  function frame(time){try{
    const dt=last===null?0:Math.min(.04,(time-last)/1000);last=time;
    if(playing){model.advance(dt,wish(),mouse.drain());draw();if(model.halted){stop();document.exitPointerLock();}}
    requestAnimationFrame(frame);
  }catch(e){stop();failure(e);}}
  draw();
  if(checking)renderer.finish();
  const coldReadyWallMs=performance.now()-coldStart;
  if(!checking)requestAnimationFrame(frame);
  else {
    const records=[],poses=[];
    if(!/no gravity/i.test(document.body.textContent)||!/COMPLETE S3/.test(document.body.textContent))throw Error('Page lost its complete-S3/no-gravity label');
    function compare(label){
      const width=80,height=60,state=model.state,{pixels,distances,normals}=renderer.read(state,width,height);
      const record={label,regionId:state.regionId,position:[...state.position],maxDistance,cpuHits:0,gpuHits:0,cpuMisses:0,cpuUnresolved:0,extraUnresolved:0,boundaryPixels:0,worst:0,worstNormal:0,owners:{}};
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const i=y*width+x,cpu=model.pixelSight(width,height,x,y,maxDistance,state);
        const gpu=pixels[4*i],region=renderer.packed.ids[pixels[4*i+1]-1],owner=renderer.packed.primitiveIds[pixels[4*i+2]-1];
        if(cpu.status==='hit'){record.cpuHits++;record.owners[cpu.query.owner]=(record.owners[cpu.query.owner]||0)+1;}
        else if(cpu.status==='miss')record.cpuMisses++;else record.cpuUnresolved++;
        if(gpu===2&&pixels[4*i+3]===1){
          record.boundaryPixels++;
          if(cpu.status!=='unresolved'||cpu.reason!=='domain-exit'||cpu.regionId!==region)throw Error(`${label}: boundary display concealed ${cpu.status}/${cpu.reason}/${cpu.regionId}`);
        }
        if(gpu===1){
          record.gpuHits++;
          if(cpu.status!=='hit'||region!==cpu.regionId||owner!==cpu.query.owner)throw Error(`${label} ${x},${y}: GPU hit ${region}/${owner}, CPU ${cpu.status}/${cpu.reason}/${cpu.regionId}/${cpu.query?.owner}`);
          const error=Math.abs(distances[i]-cpu.distance);record.worst=Math.max(record.worst,error);
          if(error>.001)throw Error(`${label} ${x},${y} ${region}/${owner}: GPU ${distances[i]}, CPU ${cpu.distance}, error ${error}`);
          if(cpu.query.normal){const normalError=Math.hypot(...cpu.query.normal.map((v,k)=>v-(normals[4*i+k]/255*2-1)));record.worstNormal=Math.max(record.worstNormal,normalError);if(normalError>.015)throw Error(`${label} ${x},${y}: normal error ${normalError}`);}
        }else if(gpu===0&&cpu.status!=='miss')throw Error(`${label} ${x},${y}: GPU miss, CPU ${cpu.status}/${cpu.reason}`);
        else if(gpu===2&&cpu.status==='hit')record.extraUnresolved++;
        else if(gpu>2)throw Error(`${label}: invalid GPU status ${gpu}`);
      }
      if(record.cpuHits&&record.gpuHits<record.cpuHits*.95)throw Error(`${label}: too many GPU refusals (${record.gpuHits}/${record.cpuHits} hits)`);
      // Empty-sphere views can be all misses; record that rather than claiming parity evidence.
      record.vacuous=record.cpuHits===0;
      records.push(record);
      checks.push(`${label} (${state.regionId}): CPU/GPU status, region, owner, distance and normal over 80x60 (${record.gpuHits}/${record.cpuHits} hits${record.vacuous?'; NO CPU HITS — vacuous view':''})`);
      poses.push({label,state});draw();shots.push({name:label,data:canvas.toDataURL()});
    }
    // One pixel straight through BOTH portals to the far target.
    model.act('spawn-flat');
    {
      const state=model.state,cpu=model.pixelSight(1,1,0,0,maxDistance,state),gpu=renderer.read(state,1,1);
      if(cpu.status!=='hit'||cpu.query.owner!=='flat-target'||cpu.crossings.length!==2)throw Error(`CPU straight sight ${cpu.status}/${cpu.query?.owner}/${cpu.crossings.length}`);
      const owner=renderer.packed.primitiveIds[gpu.pixels[2]-1],region=renderer.packed.ids[gpu.pixels[1]-1];
      if(gpu.pixels[0]!==1||owner!=='flat-target'||region!=='flat')throw Error(`GPU straight sight ${[...gpu.pixels]} (${region}/${owner})`);
      if(Math.abs(gpu.distances[0]-cpu.distance)>.001)throw Error(`Straight sight distance GPU ${gpu.distances[0]}, CPU ${cpu.distance}`);
      records.push({label:'straight-two-portals',cpu:cpu.distance,gpu:gpu.distances[0]});
      checks.push(`one-pixel sight through both portals hits flat-target at ${cpu.distance.toFixed(4)} (range ${maxDistance})`);
    }
    compare('spawn');
    // Actual real-time model advance flat -> complete S3 -> flat; poses are captured on the way.
    const visited=['flat'];let quarter=false,antipode=false,frames=0;
    for(;frames<3000;frames++){
      model.advance(1/60,[0,1,0]);
      if(model.halted)throw Error(`Flight halted at frame ${frames}: ${model.motion}`);
      const s=model.state;if(s.regionId!==visited.at(-1))visited.push(s.regionId);
      if(s.regionId==='sphere'){
        if(!model.status().includes('COMPLETE S3'))throw Error('Status does not say COMPLETE S3');
        if(!quarter&&s.position[3]<=0){quarter=true;compare('quarter');}
        if(!antipode&&s.position[3]<-.999){antipode=true;compare('antipode');}
      }
      if(visited.length===3&&s.position[1]>.5)break;
    }
    if(visited.join()!=='flat,sphere,flat'||!quarter||!antipode)throw Error(`Route ${visited} quarter ${quarter} antipode ${antipode}`);
    checks.push(`${frames} real-time advance frames flat/sphere/flat through quarter and antipode`);
    compare('return');
    {
      // Appearance at the flat return pose: flat-target is in direct view.
      if(typeof renderer.readColor!=='function')throw Error('Renderer lacks readColor(state,width,height,{polished,ao}); appearance checks pending lead renderer');
      const polishedBox=document.querySelector('#polished'),aoBox=document.querySelector('#ao');
      if(!polishedBox.checked||!aoBox.checked)throw Error('Polished lighting and AO must start checked');
      // Clicking fires the real change handlers, which redraw the canvas.
      const setAppearance=(polished,ao)=>{if(polishedBox.checked!==polished)polishedBox.click();if(aoBox.checked!==ao)aoBox.click();};
      const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
      const packets=(r,state,width,height,options)=>{const {pixels,distances,normals}=r.read(state,width,height,options);return [pixels,new Uint8Array(distances.buffer,distances.byteOffset,distances.byteLength),normals];};
      const color=(r,state,width,height,options)=>{
        const c=r.readColor(state,width,height,options);
        if(!(c instanceof Uint8Array)||c.length!==width*height*4)throw Error(`readColor returned ${c?.constructor?.name}/${c?.length}, expected Uint8Array RGBA ${width}x${height}`);
        return c;
      };
      const state=model.state,W=80,H=60,reference=packets(renderer,state,W,H);
      for(const [polished,ao] of [[false,true],[false,false],[true,false],[true,true]]){
        setAppearance(polished,ao);
        for(const options of [undefined,appearance()]){
          const got=packets(renderer,state,W,H,options);
          if(!got.every((p,k)=>same(p,reference[k])))throw Error(`Debug packets changed after toggling to polished=${polished} ao=${ao} (${options?'explicit':'default'} read options)`);
        }
      }
      checks.push('identical status/region/owner, distance and normal packets across polished/AO toggles (80x60)');
      const hit=i=>reference[0][4*i]===1;
      const basic=color(renderer,state,W,H,{polished:false,ao:false}),polishedColor=color(renderer,state,W,H,{polished:true,ao:false});
      if(!same(basic,color(renderer,state,W,H,{polished:false,ao:false})))throw Error('readColor is not repeatable');
      let hits=0,styled=0,aoBrightened=0;
      const withAO=color(renderer,state,W,H,{polished:true,ao:true});
      for(let i=0;i<W*H;i++){
        if(!hit(i))continue;hits++;
        if(Math.max(...[0,1,2].map(k=>Math.abs(basic[4*i+k]-polishedColor[4*i+k])))>=12)styled++;
        if([0,1,2].some(k=>withAO[4*i+k]>polishedColor[4*i+k]))aoBrightened++;
      }
      if(!hits)throw Error('Appearance pose has no GPU hits');
      if(styled<hits*.1)throw Error(`Polished lighting is not visibly different: ${styled}/${hits} hit pixels changed by >=12/255`);
      if(aoBrightened){
        const examples=[];for(let i=0;i<W*H&&examples.length<4;i++)if(hit(i)&&[0,1,2].some(k=>withAO[4*i+k]>polishedColor[4*i+k]))examples.push({i,ao:[...withAO.slice(4*i,4*i+3)],off:[...polishedColor.slice(4*i,4*i+3)]});
        throw Error(`AO brightened ${aoBrightened}/${hits} hit pixels: ${JSON.stringify(examples)}`);
      }
      checks.push(`polished lighting visibly changes ${styled}/${hits} hit pixels; AO brightens none`);
      const shot=name=>{const data=canvas.toDataURL();shots.push({name,data});return data;};
      setAppearance(false,false);const basicShot=shot('appearance-basic');
      setAppearance(true,false);shot('appearance-polished-noao');
      setAppearance(true,true);const polishedShot=shot('appearance-polished');
      if(basicShot===polishedShot)throw Error('Checkbox toggles did not change the drawn canvas');
      records.push({label:'appearance',pose:'return',hits,styled,aoBrightened});

      // Test-only clone: an E3 floor just under flat-target gives AO a contact to find.
      const floorScene=structuredClone(scene),target=floorScene.baseScene.entities.find(e=>e.id==='flat-target');
      if(target?.regionId!=='flat'||target.position[2]!==0||target.radius!==.6)throw Error('AO fixture expects flat-target at z=0 with radius .6');
      floorScene.baseScene.entities.push({id:'ao-floor',regionId:'flat',kind:'plane',position:[0,0,-.65],up:[0,0,1]});
      const floorModel=createConnectedGlobalPreview(floorScene),floorCanvas=document.createElement('canvas'),floorRenderer=createConnectedRenderer(floorCanvas,floorModel.world);
      if(renderer.packed.primitiveIds.includes('ao-floor')||model.world.renderData().primitives.some(p=>p.id==='ao-floor'))throw Error('AO floor leaked into the main fixture');
      const FW=160,FH=120,floorPackets=packets(floorRenderer,state,FW,FH,{polished:true,ao:true});
      for(const options of [undefined,{polished:true,ao:false},{polished:false,ao:false},{polished:false,ao:true}])
        if(!packets(floorRenderer,state,FW,FH,options).every((p,k)=>same(p,floorPackets[k])))throw Error(`Floor debug packets depend on appearance ${JSON.stringify(options)}`);
      const fp=floorPackets[0],floorMax=floorRenderer.packed.maxDistance,ownerAt=i=>floorRenderer.packed.primitiveIds[fp[4*i+2]-1];
      const floorOwners={},floorDistances=new Float32Array(floorPackets[1].buffer,floorPackets[1].byteOffset,FW*FH);
      for(let i=0;i<FW*FH;i++)if(fp[4*i]===1)floorOwners[ownerAt(i)]=(floorOwners[ownerAt(i)]||0)+1;
      if(!floorOwners['ao-floor']||!floorOwners['flat-target'])throw Error(`AO fixture view lacks floor or target: ${JSON.stringify(floorOwners)}`);
      // Sparse CPU spot check that the clone renders the intended geometry.
      for(let y=0;y<FH;y+=6)for(let x=0;x<FW;x+=6){
        const i=y*FW+x;if(fp[4*i]!==1)continue;
        const cpu=floorModel.pixelSight(FW,FH,x,y,floorMax,state);
        if(cpu.status!=='hit'||cpu.query.owner!==ownerAt(i)||Math.abs(floorDistances[i]-cpu.distance)>.001)
          throw Error(`AO fixture ${x},${y}: GPU ${ownerAt(i)}, CPU ${cpu.status}/${cpu.query?.owner}/${cpu.distance}`);
      }
      const floorAO=color(floorRenderer,state,FW,FH,{polished:true,ao:true}),floorNoAO=color(floorRenderer,state,FW,FH,{polished:true,ao:false});
      const luma=(c,i)=>.2126*c[4*i]+.7152*c[4*i+1]+.0722*c[4*i+2];
      let floorHits=0,darkened=0,brightened=0;const darkenedOwners={};
      for(let i=0;i<FW*FH;i++){
        if(fp[4*i]!==1)continue;floorHits++;
        if([0,1,2].some(k=>floorAO[4*i+k]>floorNoAO[4*i+k]))brightened++;
        if(luma(floorNoAO,i)-luma(floorAO,i)>=6){darkened++;darkenedOwners[ownerAt(i)]=(darkenedOwners[ownerAt(i)]||0)+1;}
      }
      if(brightened)throw Error(`AO brightened ${brightened}/${floorHits} floor-fixture hit pixels`);
      if(darkened<16)throw Error(`AO darkened only ${darkened}/${floorHits} floor-fixture hit pixels by >=6/255 luma (need 16)`);
      checks.push(`AO floor fixture (160x120): ${darkened}/${floorHits} hit pixels darkened, none brightened ${JSON.stringify(darkenedOwners)}`);
      for(const [name,options] of [['ao-floor-basic',{polished:false,ao:false}],['ao-floor-polished-noao',{polished:true,ao:false}],['ao-floor-polished',{polished:true,ao:true}]]){
        floorRenderer.draw(state,{width:320,height:240,...options});shots.push({name,data:floorCanvas.toDataURL()});
      }
      records.push({label:'ao-floor',pose:'return',owners:floorOwners,floorHits,darkened,darkenedOwners,brightened});

      // Smooth edges at the return pose (flat-target silhouette in view): four quarter-pixel samples,
      // averaged as sqrt(mean(c^2)); any numerical refusal keeps the display pixel magenta.
      const smoothBox=document.querySelector('#smooth'),diagnosticsBox=document.querySelector('#diagnostics');
      if(smoothBox.checked!==defaultSmoothing)throw Error('Smooth edges default does not match the renderer policy');
      if(diagnosticsBox.checked)throw Error('Unresolved-ray highlight must start unchecked');
      const setSmooth=on=>{if(smoothBox.checked!==on)smoothBox.click();};
      for(const samplePose of poses.filter(p=>['spawn','quarter','return'].includes(p.label))){
      const state=samplePose.state;
      const SW=320,SH=240,centrePackets=packets(renderer,state,SW,SH);
      for(const on of [false,true]){
        setSmooth(on);
        for(const options of [undefined,{antialias:false},{antialias:true},{...appearance(),antialias:on},{antialias:true,diagnostics:true}])
          if(!packets(renderer,state,SW,SH,options).every((p,k)=>same(p,centrePackets[k])))throw Error(`Debug packets depend on smoothing: checkbox ${on}, options ${JSON.stringify(options)}`);
      }
      checks.push(`identical status/region/owner, distance and normal packets with antialias false/true and Smooth edges toggled (${SW}x${SH})`);
      // Independent same-pose reference: a separate renderer at 2x resolution, centre rays only.
      // High-resolution pixel (2x+dx,2y+dy) has exactly the ray of low-resolution sample (x+.25+dx/2,y+.25+dy/2).
      const refRenderer=createConnectedRenderer(document.createElement('canvas'),model.world),highStatus=refRenderer.read(state,2*SW,2*SH).pixels;
      const smoothRecord={label:'smooth-edges',pose:samplePose.label,width:SW,height:SH,reference:`${2*SW}x${2*SH} centre rays`,styles:[]};
      for(const style of [{polished:true,ao:true},{polished:false,ao:false}]){
        const high=color(refRenderer,state,2*SW,2*SH,{...style,antialias:false});
        const centre=color(renderer,state,SW,SH,{...style,antialias:false}),smooth=color(renderer,state,SW,SH,{...style,antialias:true});
        if(!same(centre,color(renderer,state,SW,SH,style)))throw Error(`readColor antialias must default to false ${JSON.stringify(style)}`);
        if(!same(smooth,color(renderer,state,SW,SH,{...style,antialias:true})))throw Error('Smoothed readColor is not repeatable');
        let eligible=0,worst=0,changed=0,magenta=0;
        for(let y=0;y<SH;y++)for(let x=0;x<SW;x++){
          const i=y*SW+x,samples=[0,1].flatMap(dy=>[0,1].map(dx=>(2*y+dy)*2*SW+2*x+dx));
          if(Math.max(...[0,1,2].map(k=>Math.abs(smooth[4*i+k]-centre[4*i+k])))>=12)changed++;
          // Refusal kind 1 is the domain boundary pattern, which may average; every other refusal is numerical.
          const unresolved=samples.find(j=>highStatus[4*j]===2&&highStatus[4*j+3]!==1);
          if(unresolved!==undefined){
            magenta++;
            if([0,1,2].some(k=>Math.abs(smooth[4*i+k]-high[4*unresolved+k])>2))throw Error(`Smooth edges ${x},${y}: numerical refusal averaged to ${[...smooth.slice(4*i,4*i+3)]}, expected uncertainty colour ${[...high.slice(4*unresolved,4*unresolved+3)]}`);
            continue;
          }
          if(!samples.every(j=>highStatus[4*j]===1))continue;
          eligible++;
          for(let k=0;k<3;k++){
            const expected=255*Math.sqrt(samples.reduce((sum,j)=>sum+(high[4*j+k]/255)**2,0)/4),error=Math.abs(smooth[4*i+k]-expected);
            worst=Math.max(worst,error);
            if(error>2)throw Error(`Smooth edges ${x},${y} channel ${k} ${JSON.stringify(style)}: got ${smooth[4*i+k]}, 2x reference sqrt(mean(c^2)) ${expected.toFixed(2)} from ${samples.map(j=>high[4*j+k])}`);
          }
        }
        if(eligible<256)throw Error(`Smooth edges reference has only ${eligible} pixels whose four 2x rays all hit (need 256)`);
        if(changed<32)throw Error(`Smooth edges visibly change only ${changed} pixels by >=12/255 vs centre sampling (need 32); antialias ignored?`);
        smoothRecord.styles.push({...style,eligible,worst,changed,magenta});
        checks.push(`Smooth edges ${JSON.stringify(style)}: ${eligible} all-hit pixels match 2x sqrt(mean(c^2)) within ${worst.toFixed(2)}/255; ${changed} pixels visibly differ from centre sampling; ${magenta} numerical-refusal pixels stay magenta`);
      }
      records.push(smoothRecord);
      }
      // Same view, before/after, through the real checkbox handlers.
      setSmooth(false);const smoothOff=shot('smooth-edges-off');
      setSmooth(true);const smoothOn=shot('smooth-edges-on');
      if(smoothOff===smoothOn)throw Error('Smooth edges checkbox did not change the drawn canvas');
      diagnosticsBox.click();const diagnosticSmooth=canvas.toDataURL();
      setSmooth(false);const diagnosticCentre=canvas.toDataURL();
      setSmooth(true);diagnosticsBox.click();
      if(diagnosticSmooth!==diagnosticCentre)throw Error('Unresolved-ray highlight changed with Smooth edges; it must use centre rays');
      checks.push('Smooth edges checkbox changes the display; unresolved-ray highlight is identical with it on or off');
      draw();
    }
    model.act('spawn-sphere');model.advance(0,[0,0,0],{yaw:.6,pitch:.3});
    for(let i=0;i<30;i++){model.advance(.04,[.4,1,.3]);if(model.halted)throw Error(`Noncentral flight halted: ${model.motion}`);}
    model.advance(0,[0,0,0],{yaw:-1.1,pitch:-.2});
    const p=model.state.position;if(!(Math.hypot(p[1],p[2])*8>.5))throw Error('Noncentral pose stayed on the route plane');
    compare('noncentral-turned');
    for(let i=0;i<600;i++)model.advance(0,[0,0,0],{yaw:.04*Math.cos(i/15),pitch:.04*Math.sin(i/15)});
    if(Math.abs(rollAgainst(model.state.camera,model.referenceUp))>1e-9)throw Error('Mouse loops rolled against carried up');
    checks.push('no roll after 600 look updates in complete S3');
    document.querySelector('[data-action="approach-exit"]').click();
    if(model.renderGuide().aimed?.id!=='sphere-exit'||!model.renderGuide().aimed.bodyFits)throw Error('Exit approach guide is wrong');
    draw();shots.push({name:'exit-approach',data:canvas.toDataURL()});
    for(let i=0;i<45&&model.state.regionId==='sphere';i++)model.advance(1/60,[0,1,0]);
    if(model.halted||model.state.regionId!=='flat')throw Error('Second exit approach did not cross');
    checks.push('explicit second-exit approach crosses via real-time controls');
    for(const region of ['sphere','flat']){
      model.act(`spawn-${region}`);model.look({yaw:-.5});
      let limits=0;
      for(let i=0;i<160;i++){
        model.advance(.016,[0,1,0]);
        if(model.motion.includes('budget-exhausted'))limits++;
        if(model.halted)throw Error(`${region} contact halted: ${model.motion}`);
      }
      if(!limits)throw Error(`${region} contact did not exercise work limit`);
      const from=[...model.state.position],space=model.world.regions.get(region).space;
      for(let i=0;i<20;i++)model.advance(.016,[0,-1,0]);
      if(model.halted||space.distance(from,model.state.position)<.5)throw Error(`${region} retreat failed`);
      if(Math.abs(rollAgainst(model.state.camera,model.referenceUp))>1e-9)throw Error('Contact recovery rolled camera');
      draw();checks.push(`${region} contact and retreat without reset, bounded recovery and upright camera`);
    }
    for(const pose of poses){
      renderer.times.length=0;const timings=[],intervals=[];let previous;
      for(let i=0;i<90;i++){const timestamp=await new Promise(requestAnimationFrame);if(i>=15&&previous!==undefined)intervals.push(timestamp-previous);previous=timestamp;const t=performance.now();renderer.draw(pose.state,{...dimensions(),...appearance(),timer:i>=15});if(i>=15)timings.push(performance.now()-t);}
      for(let i=0;i<4;i++){await new Promise(requestAnimationFrame);renderer.draw(pose.state,{...dimensions(),...appearance()});}
      records.push({pose:pose.label,hardware:renderer.hardware,resolution:dimensions(),gpuTimerSupported:renderer.timerSupported,gpuMs:[...renderer.times],cpuSubmitMs:timings,presentIntervalsMs:intervals});
    }
    {
      // Centre vs smoothed display timed separately (never pooled) at one pose and resolution.
      for(const pose of poses.filter(p=>['spawn','quarter','return'].includes(p.label))){
      const resolution=dimensions();
      const smoothTiming={label:'smooth-edges-timing',pose:pose.label,hardware:renderer.hardware,resolution,gpuTimerSupported:renderer.timerSupported};
      for(const antialias of [false,true]){
        const options={...resolution,...appearance(),antialias},nextFrame=()=>new Promise(requestAnimationFrame),cpuSubmitMs=[];
        // Warm-up also drains late query results from the previous mode before the buffer is cleared.
        for(let i=0;i<15;i++){await nextFrame();renderer.draw(pose.state,options);}
        renderer.times.length=0;
        for(let i=0;i<75;i++){await nextFrame();const t=performance.now();renderer.draw(pose.state,{...options,timer:true});cpuSubmitMs.push(performance.now()-t);}
        for(let i=0;i<10;i++){await nextFrame();renderer.draw(pose.state,options);}
        smoothTiming[antialias?'antialiasTrue':'antialiasFalse']={gpuMs:[...renderer.times],cpuSubmitMs};
      }
      records.push(smoothTiming);
      }
    }
    {
      // Bounded editing through the real form controls. Needs the lead model history API and renderer.replaceWorld.
      if(!editable||typeof renderer.replaceWorld!=='function')throw Error('Edit checks pending lead integration: model.editEntities and renderer.replaceWorld are required');
      const $=s=>document.querySelector(s);
      const canon=value=>JSON.stringify(value,(key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
      const pose=()=>{const s=model.state;return canon({regionId:s.regionId,position:s.position,forward:s.camera.forward,up:s.camera.up,right:s.camera.right,referenceUp:model.referenceUp,halted:model.halted});};
      const entity=id=>entityRows(model.document()).find(r=>r.entity.id===id)?.entity;
      const pick=(select,value)=>{if(![...select.options].some(o=>o.value===value))throw Error(`#${select.id} has no option ${value}`);select.value=value;select.dispatchEvent(new Event('change'));};
      const choose=(regionId,id)=>{pick(editor.region,regionId);pick(editor.entity,id);};
      const type=(key,value)=>{editor[key].value=String(value);editor[key].dispatchEvent(new Event('input'));};
      const refused=()=>/^Edit refused/.test(editor.message.textContent);
      const accepted=label=>{if(refused())throw Error(`${label} refused: ${editor.message.textContent}`);};
      const expectButtons=label=>{if(editor.undo.disabled!==!model.canUndo||editor.redo.disabled!==!model.canRedo)throw Error(`${label}: Undo/Redo buttons do not reflect canUndo/canRedo`);};
      const expectFields=(label,id)=>{
        const e=entity(id);
        if(editor.entity.value!==id||axes.some((k,i)=>Number(editor[k].value)!==e.position[i])||e.radius!==undefined&&Number(editor.radius.value)!==e.radius)
          throw Error(`${label}: form does not show the current document for ${id}`);
      };
      const snapshot=()=>({doc:canon(model.document()),undo:model.canUndo,redo:model.canRedo,undoButton:editor.undo.disabled,redoButton:editor.redo.disabled,pose:pose(),image:canvas.toDataURL(),world:model.world,status:status.textContent});
      const expectUnchanged=(label,before)=>{
        if(!refused())throw Error(`${label}: no refusal in the edit message`);
        if(/Preview stopped/.test(status.textContent))throw Error(`${label}: reported as a fatal failure`);
        const after=snapshot();for(const k of Object.keys(before))if(after[k]!==before[k])throw Error(`${label} changed ${k}`);
      };
      const images=()=>{const color=renderer.readColor(model.state,80,60);draw();return color;};
      const spotCheck=label=>{
        const W=80,H=60,max=renderer.packed.maxDistance,{pixels,distances}=renderer.read(model.state,W,H);let hits=0;
        for(let y=0;y<H;y+=4)for(let x=0;x<W;x+=4){
          const i=y*W+x;if(pixels[4*i]!==1)continue;
          const cpu=model.pixelSight(W,H,x,y,max),owner=renderer.packed.primitiveIds[pixels[4*i+2]-1];
          if(cpu.status!=='hit'||cpu.query.owner!==owner||Math.abs(distances[i]-cpu.distance)>.001)throw Error(`${label} ${x},${y}: GPU ${owner}/${distances[i]}, CPU ${cpu.status}/${cpu.query?.owner}/${cpu.distance}`);
          hits++;
        }
        draw();if(!hits)throw Error(`${label}: no sampled GPU hits`);return hits;
      };
      // The page's own download handler, with the object URL captured and the browser download suppressed.
      const download=async()=>{
        const blobs=[],names=[],createURL=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;
        URL.createObjectURL=blob=>{blobs.push(blob);return createURL.call(URL,blob);};
        HTMLAnchorElement.prototype.click=function(){names.push(this.download);};
        try{editor.download.click();}finally{URL.createObjectURL=createURL;HTMLAnchorElement.prototype.click=click;}
        if(blobs.length!==1||names.length!==1||!/\.json$/.test(names[0]))throw Error(`Download produced ${blobs.length} blobs named ${names}`);
        return blobs[0].text();
      };
      // The page's own file-input handler, fed a real File.
      const load=async(text,name)=>{
        const files=new DataTransfer();files.items.add(new File([text],name,{type:'application/json'}));
        editor.load.files=files.files;editor.load.dispatchEvent(new Event('change'));await loading;
      };
      const editRecord={label:'editing'};
      if(model.canUndo||model.canRedo||!editor.undo.disabled||!editor.redo.disabled)throw Error('Edit history must start empty with Undo/Redo disabled');
      const originalText=await download(),doc0=canon(model.document());
      if(canon(JSON.parse(originalText))!==doc0)throw Error('Downloaded original JSON differs from model.document()');

      // S3 ball radius edit at a pose that shows the landmark.
      $('[data-action="spawn-sphere"]').click();
      const landmarkPixels=()=>{const {pixels}=renderer.read(model.state,80,60);let n=0;for(let i=0;i<80*60;i++)if(pixels[4*i]===1&&renderer.packed.primitiveIds[pixels[4*i+2]-1]==='north-landmark')n++;return n;};
      const findLandmark=()=>{for(const pitch of [0,-.4,.8]){model.look({pitch});for(let i=0;i<42;i++){if(landmarkPixels()>=20)return true;model.look({yaw:.15});}}return false;};
      if(!findLandmark())throw Error('No sphere pose shows north-landmark');
      draw();
      const pose0=pose(),world0=model.world,image0=canvas.toDataURL(),color0=images();
      choose('sphere','north-landmark');
      const label=editor.entity.selectedOptions[0].textContent;
      if(!/ball/.test(label)||!/north-chart/.test(label))throw Error(`Entity option lacks kind or chart: ${label}`);
      if(editor.x.disabled||editor.radius.disabled)throw Error('Ball position/radius fields are disabled');
      expectFields('select north-landmark','north-landmark');
      if(entity('north-landmark').radius!==.6)throw Error('Edit fixture expects north-landmark radius .6');
      type('radius',.75);editor.apply.click();accepted('S3 radius edit');
      const doc1=canon(model.document()),expected=JSON.parse(doc0);
      expected.coverRegions.find(r=>r.id==='sphere').entities.find(e=>e.id==='north-landmark').radius=.75;
      if(doc1!==canon(expected))throw Error('S3 radius edit did not change exactly north-landmark radius');
      if(model.world===world0)throw Error('model.world did not update after an edit');
      if(pose()!==pose0)throw Error('S3 radius edit moved the player or camera');
      const image1=canvas.toDataURL();if(image1===image0)throw Error('S3 radius edit did not change the drawn canvas');
      const color1=images();let changed=0;
      for(let i=0;i<80*60;i++)if([0,1,2].some(k=>color1[4*i+k]!==color0[4*i+k]))changed++;
      if(changed<8)throw Error(`S3 radius edit changed only ${changed} pixels`);
      editRecord.radiusChangedPixels=changed;editRecord.spotHits=spotCheck('after S3 radius edit');
      if(!model.canUndo||model.canRedo)throw Error('After edit: expected undo available, redo empty');
      expectButtons('after edit');expectFields('after edit','north-landmark');
      checks.push(`S3 north-landmark radius .6 -> .75 via form: ${changed}/4800 pixels changed, pose kept, sparse CPU/GPU agreement on the replaced world`);

      editor.undo.click();accepted('Undo');
      if(canon(model.document())!==doc0)throw Error('Undo did not restore the exact document');
      if(pose()!==pose0||canvas.toDataURL()!==image0)throw Error('Undo changed pose or did not restore the original image');
      if(model.canUndo||!model.canRedo)throw Error('After undo: expected redo only');
      expectButtons('after undo');expectFields('after undo','north-landmark');
      editor.redo.click();accepted('Redo');
      if(canon(model.document())!==doc1||pose()!==pose0||canvas.toDataURL()!==image1)throw Error('Redo did not restore the edited document, pose and image');
      expectButtons('after redo');expectFields('after redo','north-landmark');
      checks.push('Undo restores the exact document and image; Redo restores the edited document and image');

      // Save and reload.
      const savedText=await download();
      if(canon(JSON.parse(savedText))!==doc1)throw Error('Downloaded JSON differs from the edited document');
      if(canon(createConnectedGlobalPreview(JSON.parse(savedText)).document())!==doc1)throw Error('Fresh model load of saved JSON differs');
      editor.undo.click();accepted('Undo before load');
      await load(savedText,'edited.nil.json');accepted('File load');
      if(canon(model.document())!==doc1||pose()!==pose0||canvas.toDataURL()!==image1)throw Error('File load did not restore the saved document/image with pose kept');
      expectButtons('after load');expectFields('after load','north-landmark');
      {const before=snapshot();await load('{"format":','broken.json');expectUnchanged('malformed JSON file',before);}
      checks.push('Download JSON equals document(); fresh model and file-input load reproduce it exactly; malformed file refused without change');

      // Delayed file reads cannot overwrite a newer file choice or an applied edit.
      const fileText=File.prototype.text;let releaseSlow;
      File.prototype.text=function(){return this.name==='slow.nil.json'?new Promise(resolve=>{releaseSlow=resolve;}):fileText.call(this);};
      try{
        for(const newer of ['file','edit']){
          const staleLoad=load(originalText,'slow.nil.json');
          if(newer==='file')await load(savedText,'newer.nil.json');
          else{choose('sphere','north-landmark');type('radius',.72);editor.apply.click();accepted('edit during file read');}
          const kept=snapshot();releaseSlow(originalText);await staleLoad;
          const after=snapshot();for(const k of Object.keys(kept))if(after[k]!==kept[k])throw Error(`Late file overwrote newer ${newer}: ${k}`);
          if(newer==='edit'){editor.undo.click();accepted('undo concurrent edit');}
        }
      }finally{File.prototype.text=fileText;}
      checks.push('late file reads cannot overwrite a newer file selection or property edit');

      // Invalid radii: rejected by the model (negative) and by the GPU packet range (S3 angular radius > .1).
      for(const radius of [-.5,1.2]){
        choose('sphere','north-landmark');type('radius',radius);
        const before=snapshot();editor.apply.click();expectUnchanged(`invalid north-landmark radius ${radius}`,before);
      }
      if(editor.message===status||editor.message.getAttribute('role')!=='status')throw Error('Edit errors need their own role=status message');
      checks.push('invalid radii -0.5 and 1.2 refused in the edit message: document, history, pose, world and image unchanged');

      // Paired anchor radius: both ends in one editEntities call, restored by one undo.
      choose('flat','flat-entry');
      if(!/anchor/.test(editor.entity.selectedOptions[0].textContent)||editor.radius.disabled)throw Error('Anchor radius field unavailable');
      const pairedBefore=canon(model.document()),undoBefore=model.canUndo,calls=[],descriptor=Object.getOwnPropertyDescriptor(model,'editEntities');
      if(descriptor?.writable)model.editEntities=edits=>{calls.push(structuredClone(edits));return descriptor.value.call(model,edits);};
      try{type('radius',.7);editor.apply.click();}finally{if(descriptor?.writable)model.editEntities=descriptor.value;}
      accepted('Paired anchor radius');
      if(descriptor?.writable&&(calls.length!==1||calls[0].length!==2))throw Error(`Paired radius used ${calls.length} editEntities calls: ${JSON.stringify(calls)}`);
      const radii=['flat-entry','sphere-entry','flat-return','sphere-exit'].map(id=>entity(id).radius);
      if(canon(radii)!==canon([.7,.7,.9,.9]))throw Error(`Paired anchor radii ${radii}`);
      if(pose()!==pose0)throw Error('Paired anchor edit moved the player or camera');
      editor.undo.click();accepted('Paired undo');
      if(canon(model.document())!==pairedBefore||model.canUndo!==undoBefore)throw Error('One undo did not restore both anchor radii and prior history');
      checks.push(`flat-entry radius .9 -> .7 also resized sphere-entry in ${descriptor?.writable?'one observed':'one (unobserved)'} editEntities call; one undo restores both`);

      // Spawn position edit; spawn has no radius.
      choose('flat','flat-spawn');
      if(!editor.radius.disabled||editor.y.disabled)throw Error('Spawn fields must be x/y/z only');
      const spawnBefore=canon(model.document());type('y',-2.5);editor.apply.click();accepted('Spawn edit');
      if(canon(entity('flat-spawn').position)!==canon([0,-2.5,0]))throw Error('Spawn position edit failed');
      editor.undo.click();if(canon(model.document())!==spawnBefore)throw Error('Spawn undo differs');

      // Halt forbids edits until reset.
      $('[data-action="spawn-flat"]').click();
      for(let i=0;i<900&&!model.halted;i++)model.advance(1/60,[0,-1,0]);
      if(!model.halted)throw Error('Backward flight did not halt at the flat extent');
      draw();
      if(!editor.apply.disabled||!editor.undo.disabled||!editor.redo.disabled||!editor.load.disabled)throw Error('Edit controls must be disabled while halted');
      $('[data-action="reset"]').click();
      if(model.halted||editor.apply.disabled)throw Error('Reset did not re-enable editing');
      expectButtons('after reset');
      checks.push('halt disables Apply/Undo/Redo/Load until reset');

      // Round trip to the original file, then fly the original route.
      await load(originalText,'connected-global.nil.json');accepted('Original load');
      if(canon(model.document())!==doc0)throw Error('Loading the original download did not restore the original document');
      $('[data-action="spawn-flat"]').click();
      const route=['flat'];
      for(let i=0;i<3000;i++){
        model.advance(1/60,[0,1,0]);
        if(model.halted)throw Error(`Original route halted after round trip: ${model.motion}`);
        const s=model.state;if(s.regionId!==route.at(-1))route.push(s.regionId);
        if(route.length===3&&s.position[1]>.5)break;
      }
      if(route.join()!=='flat,sphere,flat')throw Error(`Route after round trip: ${route}`);
      draw();shots.push({name:'edit-roundtrip-return',data:canvas.toDataURL()});
      editRecord.roundTripSpotHits=spotCheck('after round trip');
      checks.push('original download loaded through the file input; original flat/sphere/flat route flies');
      records.push(editRecord);
    }
    records.push({coldReadyWallMs});
    details.textContent=JSON.stringify(records,null,2);draw();
    await report('',{connectedGlobalEvidence:records});
  }
}catch(error){failure(error);}
