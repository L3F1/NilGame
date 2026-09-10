import assert from 'node:assert/strict';
import {createMetricSpace} from './engine/geometry/metric-space.js';
import {moveProbe} from './engine/world/collision.js';
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const close=(a,b)=>assert.ok(Math.hypot(...a.map((x,i)=>x-b[i]))<2e-10);
let passed=0,failed=0;
function test(name,fn){try{fn();passed++;}catch(e){failed++;console.error(`FAIL ${name}: ${e.message}`);}}

test('move carries a camera along slide, lift and settle, independently of velocity projection',()=>{
  const base=createMetricSpace({kind:'s3',curvatureRadius:4});
  const legs=[];
  const space={...base,stepWithTransport(p,u,t){
    const segment=base.stepWithTransport(p,u,t);
    legs.push([p.slice(),segment.position.slice()]);
    return segment;
  }};
  const center=base.origin;
  const field={distance:p=>base.distance(p,center)-1,
    normal:p=>base.normalize(p,p.map((x,i)=>dot(p,center)*x-center[i]))};
  const p=base.decode([0,2.2,0]);
  const inward=base.normalize(p,base.logAt(p,center));
  const u=base.normalize(p,inward.map((x,i)=>0.85*x+0.5*[1,0,0,0][i]));
  const out=moveProbe(field,space,{position:p,velocity:u.map(x=>x*2.5),radius:0.25},0.8);
  assert.ok(out.contacts.length>0,'must exercise collision response');
  assert.equal(typeof out.carry,'function');
  // Independent endpoint formula on EACH recorded leg, not the solver's
  // rotating-plane formula and not shortest transport across the whole move.
  const reference=v=>legs.reduce((v,[a,b])=>{
    const k=dot(v,b)/(1+dot(a,b));
    return v.map((x,i)=>x-k*(a[i]+b[i]));
  },v);
  let endpointDifference=0;
  for(const v of base.frame(p)){
    const mapped=out.carry(v);
    close(mapped,reference(v));
    base.validateTangent(out.position,mapped);
    assert.ok(Math.abs(base.norm(out.position,mapped)-1)<2e-10);
    endpointDifference=Math.max(endpointDifference,Math.hypot(...mapped.map((x,i)=>x-base.transport(p,out.position,v)[i])));
  }
  assert.ok(endpointDifference>1e-7,'route must distinguish path transport from shortest endpoint transport');
  assert.equal(out.contactSamples.length,out.contacts.length);
  for(const c of out.contactSamples)base.validateTangent(c.position,c.normal);
  // Contact projection changes velocity; carry must remain length-preserving.
  assert.ok(base.norm(out.position,out.velocity)<2.5);
});
test('zero-time carry is identity and returns no contacts',()=>{
  const space=createMetricSpace({kind:'e3'}),p=[0,0,0];
  const out=moveProbe({distance:()=>Infinity,normal:()=>null},space,{position:p,velocity:[1,2,3],radius:0.25},0);
  close(out.carry([3,2,1]),[3,2,1]);
  assert.deepEqual(out.contactSamples,[]);
});
console.log(`${passed}/${passed+failed} motion carry checks passed`);
process.exitCode=failed?1:0;
