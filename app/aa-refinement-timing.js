// Renderer-owned elapsed queries include BOTH the exclusion and display draws.
// Call while the preview render loop is paused: concurrent timed draws cannot
// be attributed through the renderer's shared result queue.
export async function measureAARefinement(renderer,state){
  const width=320,height=240,samples=12,drainMs=2000;
  const pause=()=>new Promise(resolve=>setTimeout(resolve,20));
  const quantiles=values=>{
    const sorted=[...values].sort((a,b)=>a-b);
    return sorted.length?{samples:sorted.length,p50:sorted[Math.floor(sorted.length*.5)],max:sorted.at(-1)}:null;
  };
  const report={width,height,requestedSamples:samples,hardware:renderer.hardware,
    revision:renderer.missPass.revision,
    gpuScope:'total renderer draw: exclusion pass plus main draw when enabled',
    wallScope:'synchronous renderer.draw plus gl.finish; excludes waits and drain draws',
    baseline:null,refined:null};
  const options=enabled=>({width,height,antialias:true,sphericalMissPass:enabled,aaRefinement:enabled});
  const pendingKnown=()=>Number.isInteger(renderer.pendingTimerCount)&&renderer.pendingTimerCount>=0;
  const drain=async drawOptions=>{
    if(!renderer.timerSupported)return true;
    if(!pendingKnown())return false;
    const deadline=performance.now()+drainMs;
    while(renderer.pendingTimerCount>0){
      if(performance.now()>=deadline)return false;
      await pause();
      renderer.draw(state,drawOptions); // Untimed draw polls previously submitted queries.
    }
    return true;
  };
  if(!await drain(options(false))){
    report.status='skipped';
    report.reason=pendingKnown()?'Pre-existing GPU queries did not drain; timing cases cannot be isolated.'
      :'Pending GPU query count is unavailable; timing cases cannot be isolated.';
    return report;
  }
  const frameCost=async enabled=>{
    const drawOptions=options(enabled);
    renderer.draw(state,drawOptions);renderer.finish();await pause();
    const start=renderer.times.length,wall=[],passStatuses=new Set();
    for(let i=0;i<samples;i++){
      const t=performance.now();
      renderer.draw(state,{...drawOptions,timer:renderer.timerSupported});renderer.finish();
      wall.push(performance.now()-t);passStatuses.add(renderer.missPass.status);
      await pause();
    }
    const isolated=await drain(drawOptions),gpu=renderer.times.slice(start);
    const contaminated=gpu.length>samples;
    const gpuStatus=!renderer.timerSupported?'unsupported':contaminated?'unattributed'
      :gpu.length===samples&&isolated?'measured':'incomplete';
    return {drawFinishCallMs:quantiles(wall),gpuMs:contaminated?null:quantiles(gpu),gpuStatus,
      collectedSamples:gpu.length,pendingSamples:pendingKnown()?renderer.pendingTimerCount:null,
      passStatuses:[...passStatuses],isolated:isolated&&!contaminated,
      ...(gpuStatus==='incomplete'?{reason:isolated
        ?'Queries ended without all results; disjoint or unavailable GPU timing is possible.'
        :'GPU queries did not drain before the deadline; partial timings are not a complete case.'}:{}),
      ...(contaminated?{reason:'More results than submitted queries; another timing producer may be active.'}:{})};
  };
  report.baseline=await frameCost(false);
  if(!report.baseline.isolated){
    report.status='incomplete';report.reason='Refined case skipped to avoid attributing delayed baseline queries to it.';
    return report;
  }
  report.refined=await frameCost(true);
  report.status=report.baseline.gpuStatus==='measured'&&report.refined.gpuStatus==='measured'
    ?'measured':renderer.timerSupported?'incomplete':'gpu-unsupported';
  return report;
}
