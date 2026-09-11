// Experimental cover-region v1 codec: docs/engineering/COVER_REGION_FORMAT.md.
// Separate from scene-v2. Explicit author charts place entity centers on the
// COMPLETE sphere; nothing here clips geometry, repairs data or claims GPU/editor
// support. Portal compilation stays in compileFramedPortals.
import {createSphericalCover} from '../geometry/spherical-cover.js';

const TOLERANCE=1e-8;
// Same slack region-world applies to a scene-v2 spawn against its solid field.
const CLEARANCE_SLACK=1e-7;
const KIND_FIELDS={ball:['radius'],spawn:[],anchor:['radius','forward','up']};
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);

function requireValue(condition,message){if(!condition)throw new Error(message);}
// Copy caller data into fresh plain JSON-shaped values BEFORE validating, so
// later mutation (or a getter) cannot change what was checked and compiled.
function snapshot(value,path){
  if(Array.isArray(value)){
    const out=[];
    for(let i=0;i<value.length;i++){
      requireValue(Object.hasOwn(value,i),`${path}[${i}]: missing array element`);
      out.push(snapshot(value[i],`${path}[${i}]`));
    }
    return out;
  }
  if(value!==null&&typeof value==='object'){
    const proto=Object.getPrototypeOf(value);
    requireValue(proto===Object.prototype||proto===null,`${path}: expected plain data object`);
    const out={};
    for(const key of Object.keys(value))Object.defineProperty(out,key,{value:snapshot(value[key],`${path}.${key}`),enumerable:true,writable:true,configurable:true});
    return out;
  }
  requireValue(typeof value==='string'||typeof value==='number'||typeof value==='boolean'||value===null,`${path}: unsupported value`);
  return value;
}
function fields(value,allowed,path){
  requireValue(value!==null&&typeof value==='object'&&!Array.isArray(value),`${path}: expected object`);
  for(const key of Object.keys(value))requireValue(allowed.includes(key),`${path}.${key}: unknown field`);
  for(const key of allowed)requireValue(Object.hasOwn(value,key),`${path}.${key}: missing field`);
}
function numbers(value,count,path){
  requireValue(Array.isArray(value)&&value.length===count&&value.every(Number.isFinite),`${path}: expected ${count} finite numbers`);
}
function identify(value,ids,path){
  requireValue(typeof value==='string'&&/^[a-z][a-z0-9_-]*$/.test(value),`${path}: use a lowercase stable ID`);
  requireValue(!ids.has(value),`${path}: duplicate ID ${value}`);
  ids.add(value);
}
function determinant(m){
  return m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
}

/** Validate a snapshot in place of the caller's data. Returns space and charts. */
function validate(doc){
  fields(doc,['format','version','id','geometry','charts','entities'],'region');
  requireValue(doc.format==='nil-cover-region','region.format: expected nil-cover-region');
  requireValue(doc.version===1,'region.version: expected 1; migration required');
  const ids=new Set();
  identify(doc.id,ids,'region.id');
  fields(doc.geometry,['kind','curvatureRadius'],'region.geometry');
  requireValue(doc.geometry.kind==='s3','region.geometry.kind: expected s3');
  const R=doc.geometry.curvatureRadius;
  requireValue(Number.isFinite(R)&&R>0,'region.geometry.curvatureRadius: expected positive finite number');
  const space=createSphericalCover({curvatureRadius:R}),hemisphere=Math.PI*R/2;
  requireValue(Array.isArray(doc.charts)&&doc.charts.length>0,'region.charts: expected nonempty array');
  const charts=new Map();
  doc.charts.forEach((chart,index)=>{
    fields(chart,['id','center','basis','extent'],`charts[${index}]`);
    identify(chart.id,ids,`charts[${index}].id`);
    const path=`chart ${chart.id}`;
    numbers(chart.center,4,`${path}.center`);
    requireValue(Math.abs(dot(chart.center,chart.center)-1)<=TOLERANCE,`${path}.center: expected unit 4-vector`);
    requireValue(Array.isArray(chart.basis)&&chart.basis.length===3,`${path}.basis: expected three tangents`);
    chart.basis.forEach((v,j)=>numbers(v,4,`${path}.basis[${j}]`));
    requireValue(Number.isFinite(chart.extent)&&chart.extent>0&&chart.extent<=hemisphere,`${path}.extent: expected (0, pi*R/2]`);
    let local;
    try{local=space.chartAt(chart.center,{extent:chart.extent,basis:chart.basis});}
    catch(error){throw new Error(`${path}: ${error.message}`);}
    const reference=space.frame(chart.center);
    requireValue(determinant(chart.basis.map(b=>reference.map(e=>dot(b,e))))>0,`${path}.basis: orientation must be positive relative to space.frame(center)`);
    charts.set(chart.id,local);
  });
  requireValue(Array.isArray(doc.entities),'region.entities: expected array');
  let spawns=0;
  doc.entities.forEach((entity,index)=>{
    const path=`entities[${index}]`;
    requireValue(entity!==null&&typeof entity==='object'&&!Array.isArray(entity),`${path}: expected object`);
    requireValue(typeof entity.kind==='string'&&Object.hasOwn(KIND_FIELDS,entity.kind),`${path}.kind: unsupported kind`);
    fields(entity,['id','kind','chartId','position',...KIND_FIELDS[entity.kind]],path);
    identify(entity.id,ids,`${path}.id`);
    const name=`entity ${entity.id}`,chart=typeof entity.chartId==='string'?charts.get(entity.chartId):undefined;
    requireValue(chart,`${name}: unknown chart ${entity.chartId}`);
    numbers(entity.position,3,`${name}.position`);
    // The chart places the CENTER only; the object itself may cross the chart edge.
    requireValue(Math.hypot(...entity.position)<chart.extent,`${name}.position: outside open chart ${entity.chartId}`);
    if(entity.kind==='spawn'){spawns++;return;}
    requireValue(Number.isFinite(entity.radius)&&entity.radius>0&&entity.radius<hemisphere,`${name}.radius: expected (0, pi*R/2)`);
    if(entity.kind==='anchor'){
      numbers(entity.forward,3,`${name}.forward`);numbers(entity.up,3,`${name}.up`);
      requireValue(Math.abs(dot(entity.forward,entity.forward)-1)<=TOLERANCE&&Math.abs(dot(entity.up,entity.up)-1)<=TOLERANCE
        &&Math.abs(dot(entity.forward,entity.up))<=TOLERANCE,`${name}: forward/up must be orthonormal in chart basis`);
    }
  });
  requireValue(spawns===1,'region.entities: exactly one spawn required');
  return {space,charts};
}

/** Parse JSON text, validate, and return fresh author data. */
export function parseCoverRegion(json){
  requireValue(typeof json==='string','parseCoverRegion: expected JSON text');
  let data;
  try{data=JSON.parse(json);}catch(error){throw new Error(`region: invalid JSON (${error.message})`);}
  const doc=snapshot(data,'region');
  validate(doc);
  return doc;
}

export function compileCoverRegion(source,{playerRadius=.25}={}){
  const doc=snapshot(source,'region'),{space,charts}=validate(doc);
  const R=space.curvatureRadius;
  requireValue(Number.isFinite(playerRadius)&&playerRadius>0&&playerRadius<Math.PI*R/2,'playerRadius: expected (0, pi*R/2)');
  const freeze=v=>Object.freeze(v);
  const balls=[],anchors=[];
  let spawnPosition,spawnFrame;
  for(const entity of doc.entities){
    const chart=charts.get(entity.chartId),center=chart.decode(entity.position);
    const lift=v=>chart.center.map((_,i)=>chart.basis.reduce((s,b,j)=>s+b[i]*v[j],0));
    // Chart basis carried along the local center-to-placement segment (< pi*R/2).
    const carry=v=>space.transport(chart.center,center,v);
    if(entity.kind==='ball')balls.push(freeze({id:entity.id,center:freeze(center),radius:entity.radius}));
    else if(entity.kind==='spawn'){spawnPosition=freeze(center);spawnFrame=freeze(chart.basis.map(b=>freeze(carry(b))));}
    else{
      const normal=carry(lift(entity.forward)),up=carry(lift(entity.up));
      // Refuse, not renormalize, if tolerance stacking leaves a frame portals would reject.
      requireValue(Math.abs(space.norm(center,normal)-1)<=TOLERANCE&&Math.abs(space.norm(center,up)-1)<=TOLERANCE
        &&Math.abs(space.dot(center,normal,up))<=TOLERANCE,`entity ${entity.id}: physical frame not orthonormal within tolerance`);
      anchors.push(freeze({id:entity.id,regionId:doc.id,space,center:freeze(center),normal:freeze(normal),up:freeze(up),radius:entity.radius}));
    }
  }
  for(const ball of balls){
    const clearance=space.distance(spawnPosition,ball.center)-ball.radius;
    requireValue(clearance>=playerRadius-CLEARANCE_SLACK,`spawn clearance ${clearance} to ball ${ball.id} is below playerRadius ${playerRadius}`);
  }
  return freeze({id:doc.id,space,balls:freeze(balls),anchors:freeze(anchors),spawnPosition,spawnFrame,
    document:()=>structuredClone(doc)});
}
