import {createSphericalFlight} from './spherical-cover-model.js';
import {castSphericalBalls} from '../engine/geometry/spherical-cover.js';
import {createSphericalCoverRenderer,pixelRay} from '../engine/geometry/spherical-cover-renderer.js';
import {createMouseLook} from './mouse-look.js';

export const LOOP_SECONDS=13;
/**
 * One straight great-circle circuit, animated in small stepLoop legs.
 * start() is the ONLY reset. The final leg lands on the carried endpoint at
 * exactly 2*pi*R of travel; the endpoint is never snapped or reset to home.
 */
export function createLoopRun(flight,{seconds=LOOP_SECONDS,maxDt=.05}={}) {
  const period=2*Math.PI*flight.space.curvatureRadius,speed=period/seconds;
  let done=0,active=false,finished=false;
  return {
    period,speed,
    start(){flight.reset();done=0;active=true;finished=false;},
    cancel(){active=false;},
    clear(){active=false;finished=false;done=0;},
    tick(dt){
      if(!Number.isFinite(dt)||dt<0)throw Error('Invalid loop time');
      if(!active)return 0;
      let leg=Math.min(dt,maxDt)*speed;
      if(leg>=period-done){leg=period-done;active=false;finished=true;}
      if(leg>0)flight.stepLoop(leg);
      done=finished?period:done+leg;
      return leg;
    },
    get active(){return active;},get finished(){return finished;},get distance(){return done;},
  };
}

function describeRay(result,R) {
  if(result.status==='hit')return `hit ${result.id} at ${result.distance.toFixed(2)}${result.distance>Math.PI*R?' (beyond πR: far side of the sphere)':''}`;
  if(result.status==='miss')return 'miss over one full orbit';
  return `unresolved (${result.reason})`;
}

function boot() {
  const canvas=document.querySelector('#view'),status=document.querySelector('#status'),details=document.querySelector('#details');
  const checking=new URLSearchParams(location.search).has('check');
  const checks=[],shots=[];
  async function report(err='',extra={}){await fetch('/__report',{method:'POST',body:JSON.stringify({err,hud:status.textContent,checks,shots,...extra})});}
  function failure(error){status.textContent=`Preview stopped: ${error.message||error}`;if(checking)report(String(error.stack||error));}
  try {
    const flight=createSphericalFlight(),{space,balls}=flight,R=space.curvatureRadius;
    const renderer=createSphericalCoverRenderer(canvas,flight),run=createLoopRun(flight);
    const mouse=createMouseLook(),keys=new Set();let playing=false,last=null,runNote='not run';
    const dimensions=()=>{const width=Number(document.querySelector('#quality').value);return {width,height:width*3/4};};
    function hud() {
      const s=flight.state,centre=castSphericalBalls(space,balls,s.position,s.camera.forward);
      if(run.active)runNote='running';else if(run.finished)runNote='finished (not reset)';
      return `Circuit ${(100*run.distance/run.period).toFixed(1)}% of 2πR = ${run.period.toFixed(2)} · loop ${runNote}\n`
        +`Travel ${s.travel.toFixed(2)} (${(s.travel/run.period).toFixed(3)} circuits) · shortest distance home ${s.returnDistance.toFixed(3)}\n`
        +`Centre ray (CPU): ${describeRay(centre,R)}`;
    }
    function draw(){renderer.draw(flight.state,dimensions());status.textContent=hud();}
    function stop(){playing=false;keys.clear();mouse.reset(false,performance.now());}
    function cancelRun(){if(run.active){run.cancel();runNote=`stopped at ${(100*run.distance/run.period).toFixed(1)}%`;}}
    const wish=()=>[Number(keys.has('KeyD'))-Number(keys.has('KeyA')),Number(keys.has('KeyW'))-Number(keys.has('KeyS')),Number(keys.has('Space'))-Number(keys.has('ShiftLeft')||keys.has('ShiftRight'))];
    // One animation frame. ?check drives this same function with synthetic time.
    function step(dt){
      if(run.active){run.tick(dt);draw();}
      else if(playing){flight.advance(dt,wish(),mouse.drain());draw();}
    }
    document.querySelector('#loop').onclick=()=>{stop();document.exitPointerLock();run.start();draw();};
    document.querySelector('#reset').onclick=()=>{stop();run.clear();runNote='not run';document.exitPointerLock();flight.reset();draw();};
    canvas.onclick=()=>{cancelRun();canvas.requestPointerLock()?.catch(e=>{status.textContent=`Mouse capture failed: ${e.message}`;});};
    document.addEventListener('pointerlockchange',()=>{stop();playing=document.pointerLockElement===canvas;if(playing)cancelRun();mouse.reset(playing,performance.now());});
    document.addEventListener('mousemove',e=>mouse.push(e.movementX,e.movementY,performance.now()));
    document.addEventListener('keydown',e=>{
      if(e.code==='Escape'){stop();cancelRun();draw();return;}
      if(playing&&['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ShiftRight'].includes(e.code)){e.preventDefault();keys.add(e.code);}
    });
    document.addEventListener('keyup',e=>keys.delete(e.code));
    window.addEventListener('blur',()=>{stop();document.exitPointerLock();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();document.exitPointerLock();}});
    document.querySelector('#quality').onchange=draw;
    function frame(time){try{
      const dt=last===null?0:Math.min(.05,(time-last)/1000);last=time;step(dt);requestAnimationFrame(frame);
    }catch(e){stop();run.cancel();failure(e);}}
    draw();
    if(!checking){requestAnimationFrame(frame);return;}

    renderer.finish();
    const records=[],period=run.period;
    const tooMany=Array.from({length:17},(_,i)=>({...balls[0],id:`extra-${i}`}));
    let refused=false;try{createSphericalCoverRenderer(document.createElement('canvas'),{space,balls:tooMany});}catch(e){refused=/at most 16/.test(e.message);}
    if(!refused)throw Error('Renderer accepted more than 16 balls');
    checks.push('renderer refuses a 17-ball fixture');
    for(const radius of [.01*R,.49*Math.PI*R]){
      let caught=false;try{createSphericalCoverRenderer(document.createElement('canvas'),{space,balls:[{...balls[0],radius}]});}catch(e){caught=/angular radii/.test(e.message);}
      if(!caught)throw Error('Renderer accepted a ball outside its numerical envelope');
    }
    checks.push('unsupported tiny and near-hemisphere balls refuse before rendering');
    const same=(a,b,tol)=>['forward','up','right'].every(k=>Math.hypot(...a[k].map((x,i)=>x-b[k][i]))<tol);
    function closure(original,label){
      const s=flight.state;
      if(!(s.returnDistance<1e-9))throw Error(`${label}: position did not close (${s.returnDistance})`);
      if(Math.abs(s.travel-period)>1e-9)throw Error(`${label}: travel ${s.travel}, expected ${period}`);
      if(!same(s.camera,original,1e-9))throw Error(`${label}: carried frame did not return`);
      checks.push(`${label}: position, travel and frame closed after 2πR`);
    }
    let beyondHalf=0;
    function compare(label){
      const width=80,height=60,state=flight.state,{pixels,distances,normals}=renderer.read(state,width,height);
      const basis=[state.position,state.camera.forward,state.camera.right,state.camera.up];
      const record={label,position:state.position,cpuHits:0,gpuHits:0,cpuMisses:0,cpuUnresolved:0,extraRefusals:0,refusedCpuMisses:0,refusalKinds:{},beyondHalfPi:0,worstDistance:0,worstNormal:0};
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const i=y*width+x,cpu=castSphericalBalls(space,balls,state.position,pixelRay(space,state.camera,width,height,x,y));
        const gpu=pixels[4*i],owner=balls[pixels[4*i+1]-1]?.id;
        if(cpu.status==='hit')record.cpuHits++;else if(cpu.status==='miss')record.cpuMisses++;else record.cpuUnresolved++;
        if(gpu===1){
          record.gpuHits++;
          if(cpu.status!=='hit'||owner!==cpu.id)throw Error(`${label} ${x},${y}: GPU hit ${owner}, CPU ${cpu.status}/${cpu.id??cpu.reason}`);
          const error=Math.abs(distances[i]-cpu.distance);record.worstDistance=Math.max(record.worstDistance,error);
          if(error>.001)throw Error(`${label} ${x},${y} ${owner}: GPU ${distances[i]}, CPU ${cpu.distance}`);
          if(cpu.distance>Math.PI*R)record.beyondHalfPi++;
          const normalError=Math.hypot(...basis.map((e,k)=>e.reduce((s,v,j)=>s+v*cpu.normal[j],0)-(normals[4*i+k]/255*2-1)));
          record.worstNormal=Math.max(record.worstNormal,normalError);if(normalError>.02)throw Error(`${label} ${x},${y}: normal error ${normalError}`);
        }else if(gpu===0){if(cpu.status!=='miss')throw Error(`${label} ${x},${y}: GPU miss, CPU ${cpu.status}/${cpu.id??cpu.reason}`);}
        else if(gpu===2){
          if(cpu.status==='hit')record.extraRefusals++;else if(cpu.status==='miss')record.refusedCpuMisses++;
          record.refusalKinds[pixels[4*i+2]]=(record.refusalKinds[pixels[4*i+2]]||0)+1;
        }else throw Error(`${label}: invalid GPU status ${gpu}`);
      }
      if(record.cpuHits===0)throw Error(`${label}: no CPU hits; parity would be vacuous`);
      if(record.gpuHits<record.cpuHits*.95)throw Error(`${label}: too many GPU refusals (${record.gpuHits}/${record.cpuHits} hits)`);
      beyondHalf+=record.beyondHalfPi;records.push(record);
      checks.push(`${label}: CPU/GPU status, owner, distance and normal over 80x60 (${record.gpuHits}/${record.cpuHits} hits, ${record.extraRefusals} extra refusals)`);
      draw();shots.push({name:label,data:canvas.toDataURL()});
    }
    flight.reset();const home=flight.state.camera;compare('start');
    flight.stepLoop(period/4);compare('quarter');
    flight.stepLoop(period/4);
    if(!(flight.state.position[3]<-.999999999))throw Error('Half circuit did not reach the antipode');
    compare('antipode');
    flight.stepLoop(period/4);compare('three-quarter');
    flight.stepLoop(period/4);closure(home,'quarter steps');compare('return');
    if(beyondHalf===0)throw Error('No GPU hit beyond πR was exercised');
    checks.push(`${beyondHalf} GPU hits beyond πR keep physical distance`);
    flight.reset();flight.advance(0,[0,0,0],{yaw:.6,pitch:.3});
    for(let i=0;i<30;i++)flight.advance(.04,[.4,1,.3]);
    flight.advance(0,[0,0,0],{yaw:-1.1,pitch:-.2});
    const p=flight.state.position;
    if(!(Math.hypot(p[1],p[2])*R>.5))throw Error('Noncentral pose stayed on the loop route');
    compare('noncentral-turned');

    // The button path: leave home, then one reset at start, ~13 s of legs, no endpoint reset.
    flight.reset();flight.advance(.04,[0,1,0]);
    document.querySelector('#loop').click();
    if(flight.state.travel!==0||flight.state.returnDistance!==0)throw Error('Loop run did not start from one reset');
    const loopHome=flight.state.camera;let ticks=0,previous=flight.state,maxLeg=0;
    while(run.active){
      if(++ticks>2000)throw Error('Loop run did not finish');
      step(1/60);const s=flight.state,leg=space.distance(previous.position,s.position);
      if(s.travel<previous.travel)throw Error('Loop travel decreased: a reset happened mid-run');
      maxLeg=Math.max(maxLeg,leg);if(leg>run.speed/60+1e-9)throw Error(`Loop teleported ${leg}`);
      previous=s;
    }
    if(Math.abs(ticks/60-LOOP_SECONDS)>1/30)throw Error(`Loop took ${ticks/60} s`);
    closure(loopHome,'animated loop');
    const endpoint=flight.state.position;step(1/60);step(1/60);
    if(flight.state.position!==endpoint&&flight.state.position.some((x,i)=>x!==endpoint[i]))throw Error('Pose moved after the loop finished');
    if(!status.textContent.includes('100.0%')||!status.textContent.includes('finished'))throw Error('HUD did not report the finished circuit');
    if(!/no gravity/i.test(document.body.textContent)||!/no collision/i.test(document.body.textContent))throw Error('Page lost its no gravity/collision label');
    checks.push(`loop button: one reset, ${ticks} legs over ${(ticks/60).toFixed(2)} s, max leg ${maxLeg.toFixed(4)}, endpoint kept`);
    records.push({loop:{ticks,seconds:ticks/60,maxLeg,returnDistance:flight.state.returnDistance,travel:flight.state.travel}},{hardware:renderer.hardware});
    draw();shots.push({name:'loop-finished',data:canvas.toDataURL()});
    document.querySelector('#loop').click();step(1/60);
    document.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}));
    const cancelled=flight.state.position;step(1/60);
    if(run.active||flight.state.position.some((x,i)=>x!==cancelled[i])||!status.textContent.includes('stopped'))throw Error('Escape did not stop the animated loop');
    checks.push('Escape stops loop and updates the visible status');
    details.textContent=JSON.stringify(records,null,2);
    report('',{sphericalEvidence:records});
  } catch(error){failure(error);}
}
if(globalThis.document)boot();
