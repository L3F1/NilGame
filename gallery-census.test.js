import assert from 'node:assert/strict';
import {galleryRayCensus} from './app/gallery-ray-census.js';
const state={regionId:'flat',position:[0,0,0],camera:{forward:[0,1,0],up:[0,0,1],right:[1,0,0]}};
const model={state,world:{regions:new Map([['flat',{space:{kind:'e3',normalize:(_p,v)=>{const n=Math.hypot(...v);return v.map(x=>x/n);}}}]])},document:()=>({id:'fixture'}),pixelSight:()=>({status:'hit',regionId:'flat',query:{owner:'ball'},distance:2})};
const renderer={packed:{maxDistance:64,ids:['flat'],primitiveIds:['ball','wrong']},
  hardware:'synthetic',readPrimaryRays:()=>[[0],[1],[0],[0]],read:()=>({pixels:new Uint8Array([1,1,1,0]),distances:new Float32Array([2])})};
assert.equal(galleryRayCensus(model,renderer,1,1).disagreements,0);
for(const pixels of [[1,1,2,0],[0,1,0,0]]){
  const broken={...renderer,read:()=>({pixels:new Uint8Array(pixels),distances:new Float32Array([2])})};
  assert.throws(()=>galleryRayCensus(model,broken,1,1),/confident GPU disagreements/);
}
assert.throws(()=>galleryRayCensus(model,{...renderer,read:()=>({pixels:new Uint8Array([1,1,1,0]),distances:new Float32Array([3])})},1,1),/disagreements/);
const uncertain={...renderer,read:()=>({pixels:new Uint8Array([2,1,0,2]),distances:new Float32Array([0])})};
const c=galleryRayCensus(model,uncertain,1,1);
assert.equal(c.samples.length,1);assert.equal(c.samples[0].cpuOwner,'ball');
assert.equal(c.counts['unresolved|2|flat|hit||ball'],1);
assert.throws(()=>galleryRayCensus(model,{...renderer,readPrimaryRays:()=>[[.1],[1],[0],[0]]},1,1),/Primary ray outside bounds/);
console.log('Gallery census: owner, lost-hit and distance faults rejected; conservative refusal retained');
