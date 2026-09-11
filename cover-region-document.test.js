import assert from 'node:assert/strict';
import {parseCoverRegion,compileCoverRegion} from './engine/world/cover-region-document.js';
import {createSphericalCover} from './engine/geometry/spherical-cover.js';
import {compileFramedPortals} from './engine/world/region-portal.js';
const R=8,space=createSphericalCover({curvatureRadius:R});
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const unit=v=>v.map(x=>x/Math.hypot(...v));
const closeVec=(a,b,e,msg)=>assert.ok(Math.hypot(...a.map((x,i)=>x-b[i]))<e,`${msg}: ${a} != ${b}`);
// Independent S3 helpers (explicit great-circle formulas, not metric-space).
const lift=(basis,v)=>[0,1,2,3].map(i=>basis.reduce((s,b,j)=>s+b[i]*v[j],0));
const chord=(p,q)=>2*R*Math.atan2(Math.hypot(...p.map((x,i)=>x-q[i])),Math.hypot(...p.map((x,i)=>x+q[i])));
function place(chart,position,vectors=[]){
  const d=Math.hypot(...position),t=d?unit(lift(chart.basis,position)):[0,0,0,0],a=d/R;
  const at=chart.center.map((x,i)=>Math.cos(a)*x+Math.sin(a)*t[i]);
  // Rotate only the t-component into the transported direction; the rest is unchanged.
  const carried=vectors.map(v=>{const along=dot(v,t);return v.map((x,i)=>x+along*((Math.cos(a)-1)*t[i]-Math.sin(a)*chart.center[i]));});
  return {at,carried};
}
function fixture(){
  const near=unit([.03,-.02,.01,-1]),F=space.frame(near),c=Math.cos(.7),s=Math.sin(.7);
  const rotated=[F[0].map((x,i)=>c*x+s*F[1][i]),F[1].map((x,i)=>c*x-s*F[0][i]),F[2]];
  return {format:'nil-cover-region',version:1,id:'far-room',geometry:{kind:'s3',curvatureRadius:R},
    charts:[{id:'far-chart',center:near,basis:rotated,extent:.45*Math.PI*R},
      {id:'home',center:[0,0,0,1],basis:space.frame([0,0,0,1]),extent:R},
      {id:'antipode',center:[0,0,0,-1],basis:space.frame([0,0,0,-1]),extent:.3*Math.PI*R}],
    entities:[{id:'spawn',kind:'spawn',chartId:'far-chart',position:[0,-1,.5]},
      {id:'rock',kind:'ball',chartId:'far-chart',position:[2,0,0],radius:.75},
      {id:'edge-ball',kind:'ball',chartId:'home',position:[.9*R,0,0],radius:.3*R},
      {id:'antipode-ball',kind:'ball',chartId:'antipode',position:[6,0,0],radius:.5},
      {id:'gate',kind:'anchor',chartId:'far-chart',position:[-1.5,2,.5],radius:.9,forward:[2/3,2/3,1/3],up:[-2/3,1/3,2/3]},
      {id:'gate-b',kind:'anchor',chartId:'home',position:[0,0,-2],radius:.9,forward:[0,1,0],up:[0,0,1]}]};
}
const physical=c=>JSON.parse(JSON.stringify({id:c.id,balls:c.balls,anchors:c.anchors.map(({space:_,...a})=>a),spawnPosition:c.spawnPosition,spawnFrame:c.spawnFrame}));

// Placement, antipode, chart-crossing ball, transported anchor/spawn frames.
const source=fixture(),pristine=structuredClone(source),compiled=compileCoverRegion(source);
const chartOf=id=>source.charts.find(c=>c.id===id),byId=new Map([...compiled.balls,...compiled.anchors].map(x=>[x.id,x]));
for(const e of source.entities.filter(e=>e.kind!=='spawn')){
  const {at,carried}=place(chartOf(e.chartId),e.position,e.kind==='anchor'?[lift(chartOf(e.chartId).basis,e.forward),lift(chartOf(e.chartId).basis,e.up)]:[]);
  closeVec(byId.get(e.id).center,at,1e-12,`${e.id} center`);
  assert.equal(byId.get(e.id).radius,e.radius);
  if(e.kind==='anchor'){
    const a=byId.get(e.id);closeVec(a.normal,carried[0],1e-12,`${e.id} forward`);closeVec(a.up,carried[1],1e-12,`${e.id} up`);
    assert.equal(a.regionId,'far-room');assert.equal(a.space,compiled.space);
    for(const v of [a.normal,a.up])assert.ok(Math.abs(dot(v,a.center))<1e-12&&Math.abs(Math.hypot(...v)-1)<1e-12);
    assert.ok(Math.abs(dot(a.normal,a.up))<1e-12);
  }
}
const antipodeBall=byId.get('antipode-ball');
assert.ok(Math.abs(-antipodeBall.center[3]-Math.cos(6/R))<1e-14,'antipode placement is 6 units from [0,0,0,-1]');
assert.ok(Math.abs(chord(antipodeBall.center,[0,0,0,1])-(Math.PI*R-6))<1e-9);
const edge=byId.get('edge-ball');
assert.ok(chord(edge.center,[0,0,0,1])+edge.radius>R,'ball crosses its chart edge and is still accepted');
// Transport is not a rebuild from the construction frame at the placement.
const gate=source.entities.find(e=>e.id==='gate'),far=chartOf('far-chart'),Fq=space.frame(byId.get('gate').center),F0=space.frame(far.center);
const coefficients=far.basis.map(b=>F0.map(e=>dot(b,e))),rebuilt=lift(coefficients.map(k=>lift(Fq,k)),gate.forward);
assert.ok(Math.hypot(...rebuilt.map((x,i)=>x-byId.get('gate').normal[i]))>1e-4,'construction-frame rebuild must differ from transport');
const spawn=source.entities.find(e=>e.kind==='spawn'),expected=place(far,spawn.position,far.basis);
closeVec(compiled.spawnPosition,expected.at,1e-12,'spawn position');
compiled.spawnFrame.forEach((v,i)=>closeVec(v,expected.carried[i],1e-12,`spawn frame ${i}`));
const portals=compileFramedPortals([{id:'link',kind:'portal',a:'gate',b:'gate-b',velocity:'preserve-speed',scale:1}],compiled.anchors,.25);
assert.equal(portals.length,2);assert.deepEqual(portals[0].renderData().normal,[...byId.get('gate').normal]);

// JSON save/load near the antipode with a rotated chart preserves every physical vector exactly.
const text=JSON.stringify(compiled.document()),loaded=parseCoverRegion(text);
assert.equal(JSON.stringify(loaded),text);
assert.deepEqual(physical(compileCoverRegion(loaded)),physical(compiled));
assert.deepEqual(physical(compileCoverRegion(parseCoverRegion(JSON.stringify(pristine)))),physical(compiled));

// Caller mutation and document clone independence.
const before=physical(compiled);
source.charts[0].center[3]=1;source.charts[0].basis[0][0]=9;source.entities[1].position[0]=-3;source.entities[4].forward[0]=0;
source.entities.push({id:'late',kind:'spawn',chartId:'home',position:[0,0,0]});source.id='mutated';
assert.deepEqual(physical(compiled),before);assert.deepEqual(compiled.document(),pristine);
const d1=compiled.document();d1.entities[0].position[0]=99;d1.charts.pop();d1.geometry.curvatureRadius=1;
assert.notEqual(compiled.document(),compiled.document());assert.deepEqual(compiled.document(),pristine);
assert.throws(()=>{compiled.balls[0].center[0]=1;},TypeError);assert.throws(()=>{compiled.spawnFrame[0][0]=1;},TypeError);
const parsedSource=parseCoverRegion(text);parsedSource.entities[0].position[0]=1e9;
assert.deepEqual(physical(compiled),before);

// Refusal of corrupt data. Each case refuses both as an object and as JSON text.
const corrupt=[
  ['unknown top key',d=>{d.floors=[];},/unknown field/],['missing key',d=>{delete d.entities;},/missing field/],
  ['format',d=>{d.format='nil-scene';},/format/],['version 2',d=>{d.version=2;},/version/],['version text',d=>{d.version='1';},/version/],
  ['uppercase id',d=>{d.id='Far-Room';},/lowercase/],['chart dup region id',d=>{d.charts[1].id='far-room';},/duplicate/],
  ['entity dup chart id',d=>{d.entities[1].id='home';},/duplicate/],['geometry kind',d=>{d.geometry.kind='e3';},/s3/],
  ['radius zero',d=>{d.geometry.curvatureRadius=0;},/curvatureRadius/],['geometry extra',d=>{d.geometry.floor=1;},/unknown field/],
  ['center nan',d=>{d.charts[0].center[1]=NaN;},/finite/],['center not unit',d=>{d.charts[1].center=[0,0,0,2];},/unit/],
  ['center length',d=>{d.charts[1].center=[0,0,1];},/finite/],['basis not tangent',d=>{d.charts[1].basis[0]=[0,0,0,1];},/tangent/],
  ['basis not orthonormal',d=>{d.charts[1].basis[1]=[1,0,0,0];},/orthonormal/],['two tangents',d=>{d.charts[1].basis.pop();},/three/],
  ['negative orientation',d=>{const b=d.charts[0].basis;[b[0],b[1]]=[b[1],b[0]];},/orientation/],
  ['mirrored antipode chart',d=>{d.charts[2].basis[2]=d.charts[2].basis[2].map(x=>-x);},/orientation/],
  ['extent zero',d=>{d.charts[1].extent=0;},/extent/],['extent too big',d=>{d.charts[1].extent=Math.PI*R/2+1e-9;},/extent/],
  ['kind box',d=>{d.entities[1].kind='box';},/kind/],['kind proto',d=>{d.entities[1].kind='toString';},/kind/],
  ['ball with forward',d=>{d.entities[1].forward=[1,0,0];},/unknown field/],['spawn with radius',d=>{d.entities[0].radius=1;},/unknown field/],
  ['anchor missing up',d=>{delete d.entities[4].up;},/missing field/],['unknown chart',d=>{d.entities[1].chartId='nowhere';},/unknown chart/],
  ['position nan',d=>{d.entities[1].position[2]=Infinity;},/finite/],['position length',d=>{d.entities[1].position=[1,0,0,0];},/finite/],
  ['position on chart edge',d=>{d.entities[2].position=[R,0,0];},/outside open chart/],['position text',d=>{d.entities[1].position=['2',0,0];},/finite/],
  ['ball radius zero',d=>{d.entities[1].radius=0;},/radius/],['ball radius hemisphere',d=>{d.entities[1].radius=Math.PI*R/2;},/radius/],
  ['anchor radius negative',d=>{d.entities[4].radius=-1;},/radius/],['forward not unit',d=>{d.entities[4].forward=[1,1,0];},/orthonormal/],
  ['forward not orthogonal',d=>{d.entities[4].up=[2/3,2/3,1/3];},/orthonormal/],['no spawn',d=>{d.entities.shift();},/exactly one spawn/],
  ['two spawns',d=>{d.entities.push({id:'spawn-2',kind:'spawn',chartId:'home',position:[0,0,0]});},/exactly one spawn/],
  ['empty charts',d=>{d.charts=[];d.entities=[];},/charts/],['entity array',d=>{d.entities[1]=[1];},/expected object/],
  ['spawn inside ball',d=>{d.entities[1].position=[0,-1,1];},/clearance/],
];
for(const [name,mutate,pattern] of corrupt){
  const d=fixture();mutate(d);
  assert.throws(()=>compileCoverRegion(d),pattern,name);
  assert.throws(()=>{const json=JSON.stringify(d);compileCoverRegion(parseCoverRegion(json));},Error,`${name} (JSON)`);
}
const sparse=fixture();sparse.entities[1].position=[2,,0];
assert.throws(()=>compileCoverRegion(sparse),/missing array element/);
const exotic=fixture();exotic.charts[1].center=new Float64Array([0,0,0,1]);
assert.throws(()=>compileCoverRegion(exotic),/plain data/);
assert.throws(()=>compileCoverRegion({...fixture(),geometry:new Map()}),/plain data/);
assert.throws(()=>parseCoverRegion('{"format":'),/invalid JSON/);
assert.throws(()=>parseCoverRegion(fixture()),/JSON text/);
assert.throws(()=>parseCoverRegion(JSON.stringify(fixture()).replace('{','{"__proto__":{},')),/__proto__: unknown field/);
for(const playerRadius of [0,-1,NaN,Infinity])assert.throws(()=>compileCoverRegion(fixture(),{playerRadius}),/playerRadius/);

// Spawn clearance measured independently against a ball placed from ANOTHER chart.
function clearanceDoc(gap,radius=.5,playerRadius=.25){
  const b=[0,Math.sin(3/R),0,Math.cos(3/R)],basis=space.frame(b),theta=3/R;
  const log=[0,0,0,1].map((x,i)=>(x-Math.cos(theta)*b[i])*3/Math.sin(theta)),k=basis.map(e=>dot(e,log));
  const along=3-(radius+playerRadius+gap),position=unit(k).map(x=>x*along);
  return {format:'nil-cover-region',version:1,id:'clearance',geometry:{kind:'s3',curvatureRadius:R},
    charts:[{id:'a',center:[0,0,0,1],basis:space.frame([0,0,0,1]),extent:R},{id:'b',center:b,basis,extent:R}],
    entities:[{id:'spawn',kind:'spawn',chartId:'a',position:[0,0,0]},{id:'post',kind:'ball',chartId:'b',position,radius}]};
}
for(const gap of [1e-4,0]){
  const c=compileCoverRegion(clearanceDoc(gap)),measured=chord(c.spawnPosition,c.balls[0].center)-c.balls[0].radius;
  assert.ok(Math.abs(measured-(.25+gap))<1e-12,`measured clearance ${measured}`);
}
assert.throws(()=>compileCoverRegion(clearanceDoc(-1e-4)),/clearance/);
assert.throws(()=>compileCoverRegion(clearanceDoc(1e-4),{playerRadius:.3}),/clearance/);
console.log(`cover region document: placement, antipode, transport, JSON roundtrip, snapshots, ${corrupt.length+7} refusals and measured clearance passed`);
