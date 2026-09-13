// Queue attribution tests only; actual GPU timing remains a browser check.
import assert from 'node:assert/strict';
import {measureAARefinement} from './app/aa-refinement-timing.js';
let checks=0,now=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
const savedPerformance=Object.getOwnPropertyDescriptor(globalThis,'performance');
const savedTimeout=Object.getOwnPropertyDescriptor(globalThis,'setTimeout');
function renderer({supported=true,known=true,delay=0,seed=false,stalled=false,disjoint=false,foreign=false}={}){
  const queue=seed?[{ready:now+1000,value:999,refined:false}]:[],calls=[],times=[];
  let baselineSubmitted=0;
  const instance={timerSupported:supported,hardware:'queued-double',times,missPass:{revision:7,status:'disabled'},
    get pendingTimerCount(){return known?queue.length:undefined;},
    draw(state,options){
      const refined=options.aaRefinement;
      calls.push({options:{...options},pending:queue.map(q=>({...q})),at:now});now+=2;
      instance.missPass.status=refined?'generated':'disabled';
      if(options.timer){
        queue.push({ready:!refined&&stalled?Infinity:now+delay,value:refined?22:11,refined});
        if(!refined&&++baselineSubmitted===12&&foreign)times.push(777);
      }
      while(queue.length&&queue[0].ready<=now){
        const result=queue.shift();
        if(!(disjoint&&!result.refined))times.push(result.value);
      }
    },
    finish(){now+=3;}};
  return {instance,calls,queue};
}
try{
  Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>now}});
  Object.defineProperty(globalThis,'setTimeout',{configurable:true,value:(callback,ms)=>{now+=ms;callback();return 0;}});
  {
    const h=renderer({delay:500,seed:true}),result=await measureAARefinement(h.instance,{});
    check(result.status==='measured','delayed but drained cases are measured');
    check(result.baseline.gpuMs.samples===12&&result.refined.gpuMs.samples===12,'each case owns exactly twelve queries');
    check(result.baseline.gpuMs.p50===11&&result.baseline.gpuMs.max===11,'baseline excludes pre-existing timing results');
    check(result.refined.gpuMs.p50===22&&result.refined.gpuMs.max===22,'refined case excludes delayed baseline results');
    const firstRefined=h.calls.find(c=>c.options.aaRefinement);
    check(firstRefined.pending.length===0,'baseline queue drains before even the refined warmup');
    check(h.calls[0].options.timer===undefined&&h.calls[0].at<1000,'pre-existing queries drain through untimed draws');
    for(const item of [result.baseline,result.refined]){
      check(item.drawFinishCallMs.samples===12,'wall timing includes twelve measured draws');
      check(item.drawFinishCallMs.p50===5&&item.drawFinishCallMs.max===5,'wall time excludes pauses and drain draws');
      check(item.pendingSamples===0&&item.isolated,'completed case has no pending query');
    }
    check(h.calls.filter(c=>c.options.timer).length===24,'exactly twenty-four queries are submitted');
    check(h.calls.every(c=>c.options.width===320&&c.options.height===240&&c.options.antialias===true),'both cases retain the requested AA viewport');
    check(h.calls.every(c=>c.options.sphericalMissPass===c.options.aaRefinement),'only the refined case enables the exclusion pass');
  }
  {
    const h=renderer({stalled:true}),result=await measureAARefinement(h.instance,{});
    check(result.status==='incomplete'&&result.baseline.gpuStatus==='incomplete','stalled baseline reports incomplete timing');
    check(result.baseline.pendingSamples===12&&!result.baseline.isolated,'outstanding queries retain their baseline ownership');
    check(result.refined===null&&!h.calls.some(c=>c.options.aaRefinement),'second case is never submitted with delayed baseline queries');
    check(result.reason.includes('delayed baseline'),'skip reason explains attribution risk');
  }
  {
    const h=renderer({known:false}),result=await measureAARefinement(h.instance,{});
    check(result.status==='skipped'&&result.baseline===null&&result.refined===null,'unobservable queue cannot start a timing comparison');
    check(h.calls.length===0&&result.reason.includes('unavailable'),'missing count is reported without submitting draws');
  }
  {
    const h=renderer({supported:false,known:false}),result=await measureAARefinement(h.instance,{});
    check(result.status==='gpu-unsupported','missing GPU extension is reported honestly');
    check(!h.calls.some(c=>c.options.timer),'unsupported timer creates no queries');
    check(result.baseline.gpuMs===null&&result.refined.gpuMs===null,'unsupported GPU timings are not inferred from wall time');
    check(result.baseline.drawFinishCallMs.samples===12&&result.refined.drawFinishCallMs.samples===12,'wall measurements remain available without GPU queries');
  }
  {
    const h=renderer({disjoint:true}),result=await measureAARefinement(h.instance,{});
    check(result.status==='incomplete'&&result.baseline.gpuStatus==='incomplete','lost query results do not masquerade as measured timing');
    check(result.baseline.collectedSamples===0&&result.baseline.pendingSamples===0,'dropped results are distinguished from a pending queue');
    check(result.baseline.reason.includes('disjoint'),'missing results include possible disjoint explanation');
    check(result.refined.gpuStatus==='measured'&&result.refined.gpuMs.p50===22,'an empty queue permits an isolated second case despite missing first-case results');
  }
  {
    const h=renderer({foreign:true}),result=await measureAARefinement(h.instance,{});
    check(result.baseline.gpuStatus==='unattributed'&&result.baseline.collectedSamples===13,'extra results expose another timing producer');
    check(result.baseline.gpuMs===null&&!result.baseline.isolated,'contaminated results cannot become GPU quantiles');
    check(result.refined===null,'contaminated baseline blocks the second case');
  }
  {
    const h=renderer({seed:true});h.queue[0].ready=Infinity;
    const result=await measureAARefinement(h.instance,{});
    check(result.status==='skipped'&&result.reason.includes('Pre-existing'),'stalled pre-existing queue is reported before either case');
    check(!h.calls.some(c=>c.options.timer),'initial drain timeout never submits measurement queries');
  }
}finally{
  if(savedPerformance)Object.defineProperty(globalThis,'performance',savedPerformance);else delete globalThis.performance;
  if(savedTimeout)Object.defineProperty(globalThis,'setTimeout',savedTimeout);else delete globalThis.setTimeout;
}
console.log(`aa-refinement-timing: ${checks} checks passed`);
