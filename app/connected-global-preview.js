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
  const model=createConnectedGlobalPreview(scene),coldStart=performance.now(),renderer=createConnectedRenderer(canvas,model.world);
  // CPU comparisons use the renderer's own range; never a local default.
  const maxDistance=renderer.packed.maxDistance;
  if(!Number.isFinite(maxDistance)||maxDistance<=0)throw Error('Renderer packet lacks maxDistance');
  const mouse=createMouseLook(),keys=new Set();let playing=false,last=null;
  const dimensions=()=>{const width=Number(document.querySelector('#quality').value);return{width,height:width*3/4};};
  // Colour-only style; debug packets must not depend on it.
  const appearance=()=>({polished:document.querySelector('#polished').checked,ao:document.querySelector('#ao').checked});
  function draw(){
    renderer.draw(model.state,{...dimensions(),...appearance(),diagnostics:document.querySelector('#diagnostics').checked});
    status.textContent=model.status();
    const guide=model.renderGuide(),near=guide.nearest,aim=guide.aimed;
    document.querySelector('#portal-hint').textContent=[
      near?`Nearest: ${near.name}, ${near.distance.toFixed(2)} units by shortest path, ${near.side} side.`:'',
      aim?`Crosshair: ${aim.name} after ${aim.distance.toFixed(2)} units of forward travel. ${aim.bodyFits?'Body fits the aperture; destination checked on crossing.':'Too close to the rim for your body — aim nearer the centre.'}`:
        guide.solid?`Crosshair hits solid ${guide.solid}; green balls are landmarks, not portals.`:'No entering portal on the crosshair ray. Approach a portal from its front side.'
    ].join(' ');
  }
  function stop(){playing=false;keys.clear();mouse.reset(false,performance.now());last=null;}
  document.querySelector('#controls').onclick=e=>{if(e.target.dataset.action){stop();document.exitPointerLock();model.act(e.target.dataset.action);draw();}};
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
    for(const pose of poses){
      renderer.times.length=0;const timings=[],intervals=[];let previous;
      for(let i=0;i<90;i++){const timestamp=await new Promise(requestAnimationFrame);if(i>=15&&previous!==undefined)intervals.push(timestamp-previous);previous=timestamp;const t=performance.now();renderer.draw(pose.state,{...dimensions(),...appearance(),timer:i>=15});if(i>=15)timings.push(performance.now()-t);}
      for(let i=0;i<4;i++){await new Promise(requestAnimationFrame);renderer.draw(pose.state,{...dimensions(),...appearance()});}
      records.push({pose:pose.label,hardware:renderer.hardware,resolution:dimensions(),gpuTimerSupported:renderer.timerSupported,gpuMs:[...renderer.times],cpuSubmitMs:timings,presentIntervalsMs:intervals});
    }
    records.push({coldReadyWallMs});
    details.textContent=JSON.stringify(records,null,2);draw();
    await report('',{connectedGlobalEvidence:records});
  }
}catch(error){failure(error);}
