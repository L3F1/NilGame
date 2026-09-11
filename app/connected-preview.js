import {createConnectedPreview} from './connected-preview-model.js';
import {createConnectedRenderer} from '../engine/geometry/connected-renderer.js';
import {traceRegionSight} from '../engine/world/region-sight.js';
import {createMouseLook} from './mouse-look.js';
const canvas=document.querySelector('#view'),status=document.querySelector('#status'),details=document.querySelector('#details');
const checking=new URLSearchParams(location.search).has('check');
const checks=[],shots=[];
async function report(err='',extra={}){await fetch('/__report',{method:'POST',body:JSON.stringify({err,hud:status.textContent,checks,shots,...extra})});}
function failure(error){status.textContent=`Preview stopped: ${error.message||error}`;if(checking)report(String(error.stack||error));}
try {
  const response=await fetch('../levels/fixtures/connected-sight.nil.json');if(!response.ok)throw Error(`Scene HTTP ${response.status}`);
  const model=createConnectedPreview(await response.json()),coldStart=performance.now(),renderer=createConnectedRenderer(canvas,model.world);
  const mouse=createMouseLook(),keys=new Set();let playing=false,last=null;
  const dimensions=()=>{const width=Number(document.querySelector('#quality').value);return{width,height:width*3/4};};
  function draw(){
    renderer.draw(model.state,dimensions());
    const space=model.world.regions.get(model.state.regionId).space;
    const geometry=space.kind==='s3'?`S³ · radius ${space.curvatureRadius}`:'E³';
    status.textContent=`${model.state.regionId} · ${geometry} · ${model.motion}${model.halted?' — halted; reset to recover':''}`;
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
  function frame(time){try{
    const dt=last===null?0:Math.min(.04,(time-last)/1000);last=time;
    if(playing){model.advance(dt,[Number(keys.has('KeyD'))-Number(keys.has('KeyA')),Number(keys.has('KeyW'))-Number(keys.has('KeyS')),Number(keys.has('Space'))-Number(keys.has('ShiftLeft')||keys.has('ShiftRight'))],mouse.drain());draw();if(model.halted){stop();document.exitPointerLock();}}
    requestAnimationFrame(frame);
  }catch(e){stop();failure(e);}}
  draw();
  if(checking)renderer.finish();
  const coldReadyWallMs=performance.now()-coldStart;
  if(!checking)requestAnimationFrame(frame);
  else {
    const records=[],poses=[];
    function compare(label){
      const width=80,height=60,{pixels,distances,normals}=renderer.read(model.state,width,height),state=model.state,c=state.camera,space=model.world.regions.get(state.regionId).space;
      let cpuHits=0,gpuHits=0,extraUnresolved=0,worst=0,worstNormal=0;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const i=y*width+x,raw=c.forward.map((f,k)=>f/Math.tan(35*Math.PI/180)+c.right[k]*(2*(x+.5)-width)/height+c.up[k]*(2*(y+.5)-height)/height);
        const cpu=traceRegionSight(model.world,{regionId:state.regionId,position:state.position,direction:space.normalize(state.position,raw)});
        const gpu=pixels[4*i],region=renderer.packed.ids[pixels[4*i+1]-1],owner=renderer.packed.primitiveIds[pixels[4*i+2]-1];
        if(cpu.status==='hit')cpuHits++;
        if(gpu===1){gpuHits++;const expected=cpu.query?.owner??cpu.query?.additiveOwner;
          if(cpu.status!=='hit'||region!==cpu.regionId||owner!==expected)throw Error(`${label} ${x},${y}: GPU hit ${region}/${owner}, CPU ${cpu.status}/${cpu.reason}/${expected}`);
          const error=Math.abs(distances[i]-cpu.distance);worst=Math.max(worst,error);if(error>.001)throw Error(`${label} ${x},${y} ${region}/${owner}: GPU ${distances[i]}, CPU ${cpu.distance}, error ${error}`);
          if(cpu.query.normal){const normalError=Math.hypot(...cpu.query.normal.map((v,k)=>v-(normals[4*i+k]/255*2-1)));worstNormal=Math.max(worstNormal,normalError);if(normalError>.015)throw Error(`${label}: normal error ${normalError}`);}
        }else if(gpu===0&&cpu.status!=='miss')throw Error(`${label} ${x},${y}: GPU miss, CPU ${cpu.status}`);
        else if(gpu===2&&cpu.status==='hit')extraUnresolved++;
        else if(gpu>2)throw Error('Invalid GPU status');
      }
      if(cpuHits&&gpuHits<cpuHits*.95)throw Error(`${label}: too many GPU refusals (${gpuHits}/${cpuHits} hits)`);
      // This pose's wall is in front of the ball's uncertain tangencies. A
      // whole-ray refusal used to reveal its outline through that opaque wall.
      if(label==='curve'&&extraUnresolved!==0)throw Error('Hidden tangent poisoned the nearer wall');
      records.push({label,cpuHits,gpuHits,extraUnresolved,worst,worstNormal});checks.push(`${label}: CPU/GPU status, owner, distance and normal`);
      if(['entry','curve','far'].includes(label))poses.push({label,state});
      draw();shots.push({name:label,data:canvas.toDataURL()});
    }
    compare('entry');
    model.act('left');compare('entry-turned');model.act('right');
    for(let i=1;i<=28;i++){document.querySelector('[data-action=forward]').click();if(model.halted)throw Error('Traversal halted');if(i===12){if(model.state.regionId!=='curve')throw Error('S3 crossing missing');compare('curve');}}
    if(model.state.regionId!=='far')throw Error('Far crossing missing');compare('far');
    for(let i=0;i<28;i++)model.act('back');if(model.state.regionId!=='entry')throw Error('Return crossing missing');checks.push('round-trip motion');
    model.act('reset');const crossed=new Set([model.state.regionId]);
    for(let i=0;i<260;i++){model.advance(1/60,[0,1,0]);crossed.add(model.state.regionId);if(model.halted)throw Error('Sustained flight halted');if(i%40===20)compare('flight-'+i);}
    if(!crossed.has('curve')||!crossed.has('far'))throw Error('Continuous flight missed a region');checks.push('260 continuous movement frames');
    model.act('reset');
    for(let i=0;i<600;i++)model.advance(0,[0,0,0],{yaw:.04*Math.cos(i/15),pitch:.04*Math.sin(i/15)});
    if(Math.abs(model.state.camera.right[2])>1e-9||model.state.camera.up[2]<=0)throw Error('Mouse loops rolled the preview');
    checks.push('upright camera after 600 look updates');
    // Aim slightly down for a useful structural image rather than the chart boundary.
    model.advance(0,[0,0,0],{pitch:-.15-Math.asin(model.state.camera.forward[2])});
    draw();shots.push({name:'upright-look',data:canvas.toDataURL()});
    for(const pose of poses){
      renderer.times.length=0;const timings=[],intervals=[];let previous;
      for(let i=0;i<90;i++){const timestamp=await new Promise(requestAnimationFrame);if(i>=15&&previous!==undefined)intervals.push(timestamp-previous);previous=timestamp;const t=performance.now();renderer.draw(pose.state,{...dimensions(),timer:i>=15});if(i>=15)timings.push(performance.now()-t);}
      for(let i=0;i<4;i++){await new Promise(requestAnimationFrame);renderer.draw(pose.state,dimensions());}
      records.push({pose:pose.label,hardware:renderer.hardware,resolution:dimensions(),gpuTimerSupported:renderer.timerSupported,gpuMs:[...renderer.times],cpuSubmitMs:timings,presentIntervalsMs:intervals});
    }
    records.push({coldReadyWallMs});
    details.textContent=JSON.stringify(records,null,2);draw();
    await report('',{connectedEvidence:records});
  }
}catch(error){failure(error);}
