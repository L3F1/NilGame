import {createConnectedGlobalPreview} from './connected-global-model.js';

// Check-mode only. Use the real motion/transport implementation to produce a
// deterministic itinerary, then replay identical poses for each rendering arm.
export async function checkRefinementMotion(model,renderer){
  const flight=createConnectedGlobalPreview(model.document(),{experimentalH3:true});
  const poses=[],route=[];
  const capture=()=>{const s=flight.state;poses.push({regionId:s.regionId,radius:s.radius,position:[...s.position],
    camera:{forward:[...s.camera.forward],right:[...s.camera.right],up:[...s.camera.up]}});
    if(route.at(-1)!==s.regionId)route.push(s.regionId);};
  capture();
  for(let i=0;i<400&&flight.state.regionId!=='hyperbolic';i++){
    flight.advance(.04,[0,1,0]);if(flight.halted)throw Error('Refinement motion: outbound halted');capture();
  }
  if(flight.state.regionId!=='hyperbolic')throw Error('Refinement motion: no H3 arrival');
  for(let i=0;i<3;i++){flight.advance(.04,[0,1,0]);capture();}
  flight.advance(0,[0,0,0],{yaw:Math.PI,pitch:0});capture();
  for(let i=0;i<400&&flight.state.regionId!=='flat';i++){
    flight.advance(.04,[0,1,0]);if(flight.halted)throw Error('Refinement motion: return halted');capture();
  }
  if(route.join()!=='flat,sphere,hyperbolic,sphere,flat')throw Error('Refinement motion: wrong route '+route);
  const indices=new Set([0,poses.length-1]);
  for(let i=0;i<poses.length;i++)if(i%Math.max(1,Math.ceil(poses.length/96))===0||i&&poses[i].regionId!==poses[i-1].regionId)indices.add(i);
  const samples=[...indices].sort((a,b)=>a-b),pause=()=>new Promise(r=>setTimeout(r,20));
  const quantiles=values=>{const a=[...values].sort((a,b)=>a-b);return a.length?{samples:a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:a.at(-1)}:null;};
  const arms=[];
  for(const enabled of [false,true]){
    // Drain old asynchronous timer queries before attributing new samples.
    for(let i=0;i<16;i++){renderer.draw(poses[0],{width:320,height:240});await pause();}
    renderer.times.length=0;const wall=[],statuses={};let timingError=null;
    for(const i of samples){
      const t=performance.now();
      renderer.draw(poses[i],{width:320,height:240,sphericalMissPass:enabled,timer:true});renderer.finish();
      wall.push(performance.now()-t);const status=renderer.missPass.status;statuses[status]=(statuses[status]||0)+1;
      // Do not overflow the renderer's bounded asynchronous query queue on a
      // slow backend. Retire each timed sample before submitting the next one.
      const sampleDeadline=performance.now()+3000;
      do {await pause();renderer.draw(poses[i],{width:320,height:240,sphericalMissPass:enabled});}
      while(renderer.timerSupported&&renderer.times.length<wall.length&&performance.now()<sampleDeadline);
      if(renderer.timerSupported&&renderer.times.length!==wall.length){
        timingError={pose:i,expected:wall.length,actual:renderer.times.length};break;
      }
    }
    const deadline=performance.now()+3000;
    while(!timingError&&renderer.timerSupported&&renderer.times.length<samples.length&&performance.now()<deadline){renderer.draw(poses.at(-1),{width:320,height:240});await pause();}
    if(!timingError&&renderer.timerSupported&&renderer.times.length!==samples.length)timingError={expected:samples.length,actual:renderer.times.length};
    // Incomplete measurement is not a performance pass. Discard distributions;
    // preserve the failure and still execute ALL independent correctness checks.
    arms.push({enabled,statuses,timingStatus:timingError?'incomplete':renderer.timerSupported?'measured':'unsupported',timingError,
      gpuMs:timingError?null:quantiles(renderer.times),drawFinishCallMs:timingError?null:quantiles(wall)});
  }
  let checked=0,recovered=0;const width=48,height=36;
  for(const i of samples.filter((v,k)=>k%8===0||v===poses.length-1||v&&poses[v].regionId!==poses[v-1].regionId)){
    const state=poses[i],off=renderer.read(state,width,height),on=renderer.read(state,width,height,{sphericalMissPass:true});
    for(let p=0;p<width*height;p++){
      checked++;const a=off.pixels.slice(4*p,4*p+4),b=on.pixels.slice(4*p,4*p+4);
      if(a[0]!==2&&(!a.every((v,k)=>v===b[k])||off.distances[p]!==on.distances[p]))
        throw Error('Refinement motion settled drift '+JSON.stringify({poseIndex:i,state,pixel:[p%width,Math.floor(p/width)],off:[...a],on:[...b],distance:[off.distances[p],on.distances[p]]}));
      if(a[0]===2&&b[0]!==2){const cpu=flight.pixelSight(width,height,p%width,Math.floor(p/width),renderer.packed.maxDistance,state);
        if(b[0]===1&&(cpu.status!=='hit'||cpu.regionId!==renderer.packed.ids[b[1]-1]||cpu.query.owner!==renderer.packed.primitiveIds[b[2]-1]||Math.abs(cpu.distance-on.distances[p])>.001)||b[0]===0&&cpu.status!=='miss')throw Error('Refinement motion recovered answer disagrees with CPU');
        recovered++;
      }
    }
  }
  return {label:'refinement-motion',hardware:renderer.hardware,route,simulationDt:.04,totalPoses:poses.length,sampledIndices:samples,width:320,height:240,arms,parity:{width,height,checked,recovered},scope:'same transported flight poses replayed; AA off; timings exclude readback, CPU checks and 20ms query-yield pacing; not an FPS measurement'};
}
