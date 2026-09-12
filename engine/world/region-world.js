// Scene-v2 executable regions. Host-free: authored coordinates are decoded once;
// physical tangent vectors, region ownership and renderer packets stay distinct.
import { validateScene, upgradeScene } from './document.js';
import { compileSceneField } from './scene-field.js';
import { createMetricSpace } from '../geometry/metric-space.js';
import { compileRegionPortals, compileHyperbolicRegionPortals } from './region-portal.js';
import { createCameraFrame } from './camera-frame.js';
import { createHyperbolicSpace } from '../geometry/hyperbolic-space.js';
import { compileHyperbolicField } from './hyperbolic-field.js';

export const REGION_LIMITS = Object.freeze({ regions: 4, primitives: 64, planes: 192, portals: 8 });
const dot = (a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross = (a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const scale = (v,s)=>v.map(x=>x*s);
const clamp = x=>Math.max(-1,Math.min(1,x));
const unit = v=>{const n=Math.hypot(...v);return n>1e-12?scale(v,1/n):null;};
export function constructionAxes(space, center, frame) {
  const base=space.frame(center), f=frame?.forward||[0,1,0], u=frame?.up||[0,0,1];
  const lift=v=>base[0].map((_,i)=>base.reduce((s,axis,j)=>s+axis[i]*v[j],0));
  return [lift(cross(f,u)),lift(f),lift(u)];
}

function sphericalPrimitive(entity,space) {
  const center=space.decode(entity.position),R=space.curvatureRadius;
  const axes=constructionAxes(space,center,entity.frame);
  let planes=[];
  if(entity.kind==='plane') {
    const base=space.frame(center);
    planes=[base[0].map((_,i)=>base.reduce((s,v,j)=>s+entity.up[j]*v[i],0))];
  } else if(entity.kind==='geodesic-cell') {
    planes=axes.flatMap((axis,i)=>[-1,1].map(sign=>center.map((c,j)=>
      sign*Math.cos(entity.halfExtent[i]/R)*axis[j]-Math.sin(entity.halfExtent[i]/R)*c)));
  } else if(entity.kind!=='ball') throw new Error(`S3 does not support ${entity.kind}; use a geodesic-cell explicitly`);
  const sample=p=>{
    if(entity.kind==='ball') {
      const d=space.distance(p,center)-entity.radius;
      const n=unit(center.map((c,i)=>dot(p,center)*p[i]-c));
      return {distance:d,normal:n,feature:n?'smooth':'undefined',owner:entity.id};
    }
    let best=-Infinity,normal=null,seam=false;
    for(const n of planes) {
      const a=dot(p,n),d=R*Math.asin(clamp(a));
      if(d>best+1e-12){best=d;normal=unit(n.map((x,i)=>x-a*p[i]));seam=false;}
      else if(Math.abs(d-best)<1e-12)seam=true;
    }
    return {distance:best,normal,feature:normal?(seam?'seam':'smooth'):'undefined',owner:entity.id};
  };
  return {entity:structuredClone(entity),center,axes,planes,sample,
    distance:p=>sample(p).distance,normal:p=>sample(p).normal};
}

function sphereField(entities,space) {
  const primitives=entities.filter(e=>['ball','plane','geodesic-cell'].includes(e.kind)).map(e=>sphericalPrimitive(e,space));
  const added=primitives.filter(p=>!p.entity.op||p.entity.op==='add');
  const modifiers=primitives.filter(p=>p.entity.op&&p.entity.op!=='add');
  const groups=added.map(p=>({base:p,modifiers:modifiers.filter(m=>!m.entity.target||m.entity.target===p.entity.id)}));
  function sample(p) {
    space.validatePoint(p);
    let winner={distance:Infinity,normal:null,owner:null,feature:'undefined'};
    for(const group of groups) {
      let s=group.base.sample(p);
      for(const m of group.modifiers) {
        const v=m.sample(p),sign=m.entity.op==='subtract'?-1:1,d=sign*v.distance;
        if(d>s.distance+1e-12)s={...v,distance:d,normal:v.normal&&scale(v.normal,sign)};
        else if(Math.abs(d-s.distance)<=1e-12)s={...s,feature:'seam'};
      }
      if(s.distance<winner.distance-1e-12)winner=s;
      else if(Math.abs(s.distance-winner.distance)<=1e-12)winner={...winner,feature:'seam'};
    }
    return winner;
  }
  return Object.freeze({distance:p=>sample(p).distance,normal:p=>sample(p).normal,sample,
    capabilities:Object.freeze({distance:'bound',exteriorDistance:modifiers.length||added.some(p=>p.entity.kind==='geodesic-cell')?'bound':'exact',
      interior:'sign-with-conservative-magnitude',normal:'piecewise-with-seams',intersection:'bounded-march'}),
    primitives,groups});
}

export function compileRegionWorld(source) {
  return compileWorld(source,false);
}
// CPU-only opt-in; the default runtime and render packets retain their gates.
export function compileHyperbolicRegionWorld(source) {
  return compileWorld(source,true);
}
function compileWorld(source,allowHyperbolic) {
  validateScene(source);
  const scene=upgradeScene(source);
  if(scene.regions.length>REGION_LIMITS.regions)throw new Error('Region renderer supports at most four regions');
  const regions=new Map();
  for(const descriptor of scene.regions) {
    if(!['e3','s3',...(allowHyperbolic?['h3']:[])].includes(descriptor.geometry.kind))throw new Error(`Region runtime does not support ${descriptor.geometry.kind}`);
    const space=descriptor.geometry.kind==='h3'
      ?createHyperbolicSpace({...descriptor.geometry,maxDistance:descriptor.extent})
      :createMetricSpace({...descriptor.geometry,maxDistance:descriptor.extent});
    const entities=scene.entities.filter(e=>e.regionId===descriptor.id);
    if(space.kind==='h3'&&(descriptor.floorId!==undefined||entities.some(e=>!['ball','spawn','objective','anchor'].includes(e.kind))))
      throw Error('H3 runtime supports balls, spawn, objectives and anchors; no floor policy');
    const spawns=entities.filter(e=>e.kind==='spawn');
    if(spawns.length!==1)throw new Error(`Region ${descriptor.id} needs exactly one spawn`);
    const solids=entities.filter(e=>['ball','box','plane','geodesic-cell'].includes(e.kind));
    for(const e of solids) if(e.target!==undefined && !solids.some(s=>s.id===e.target&&(!s.op||s.op==='add')))
      throw new Error(`Modifier ${e.id} must target an additive solid in its own region`);
    let field;
    if(space.kind==='e3') {
      const doc={...scene,regions:[descriptor],entities,connections:[]};
      field=compileSceneField(doc);
    } else field=space.kind==='h3'?compileHyperbolicField(solids,space):sphereField(entities,space);
    const floor=descriptor.floorId?entities.find(e=>e.id===descriptor.floorId):entities.find(e=>e.kind==='plane'&&(!e.op||e.op==='add'));
    const floorPrimitive=floor&&space.kind==='s3'?sphericalPrimitive(floor,space):null;
    const up=p=>floorPrimitive?floorPrimitive.normal(p):floor?floor.up.slice():null;
    const spawnPosition=space.decode(spawns[0].position);
    if(field.distance(spawnPosition)<scene.units.playerRadius-1e-7)throw new Error(`Spawn ${spawns[0].id} overlaps authored solid`);
    regions.set(descriptor.id,Object.freeze({id:descriptor.id,descriptor:structuredClone(descriptor),space,field,up,entities,spawnPosition}));
  }
  const portals=(allowHyperbolic?compileHyperbolicRegionPortals:compileRegionPortals)(scene,regions);
  if(portals.length>REGION_LIMITS.portals)throw new Error('At most eight directional apertures are supported');
  const packets=[];
  for(const [regionId,region] of regions) {
    const {space}=region;
    for(const e of region.entities.filter(e=>['ball','box','plane','geodesic-cell'].includes(e.kind))) {
      const center=space.decode(e.position),axes=constructionAxes(space,center,e.frame);
      let planes=[];
      if(space.kind==='s3')planes=sphericalPrimitive(e,space).planes;
      else if(e.kind==='plane')planes=[[...e.up,-dot(e.up,e.position)]];
      packets.push({id:e.id,regionId,kind:e.kind,op:e.op||'add',target:e.target??null,center,axes,planes,
        radius:e.radius??0,halfExtent:e.halfExtent?.slice()||[0,0,0]});
    }
  }
  if(packets.length>REGION_LIMITS.primitives || packets.reduce((s,p)=>s+p.planes.length,0)>REGION_LIMITS.planes)
    throw new Error('Scene exceeds the bounded renderer primitive/plane capacity');
  function spawn(regionId=scene.regions[0].id) {
    const region=regions.get(regionId);if(!region)throw new Error(`Unknown region ${regionId}`);
    const position=region.spawnPosition.slice();
    // THE CANONICAL FRAME IS CONVERTED ONCE, HERE, AND NEVER AGAIN. space.frame
    // is a CONSTRUCTION frame transported from the chart origin along a
    // canonical path: rebuilding it at a move or a transit would hand two
    // walkers who arrived by different routes the same basis, which is exactly
    // what curvature denies, and would discard roll every time. From this point
    // on the camera is carried, not reconstructed. `frame` stays for existing
    // readers that want the raw construction basis.
    const basis=region.space.frame(position);
    return {regionId,position,velocity:position.map(()=>0),frame:basis,
      camera:createCameraFrame(region.space,position,{forward:basis[1],up:basis[2]}),
      radius:scene.units.playerRadius,grounded:false,transits:0,stalled:false,blocked:null};
  }
  return Object.freeze({document:()=>structuredClone(scene),regions,portals,spawn,
    // Default render packets still refuse H3. experimentalH3 is an explicit
    // caller opt-in for the bounded GPU experiment; it changes no CPU geometry,
    // schema admission or query policy.
    renderData:({experimentalH3=false}={})=>{
      if(!experimentalH3&&[...regions.values()].some(r=>r.space.kind==='h3'))throw Error('H3 region rendering is not implemented');
      return {regions:[...regions.values()].map(r=>({id:r.id,...r.descriptor.geometry,extent:r.descriptor.extent})),
        primitives:structuredClone(packets),portals:portals.map(p=>p.renderData())};
    }});
}

export function editRegionEntity(source,id,patch) {
  const next=upgradeScene(source),entity=next.entities.find(e=>e.id===id);
  if(!entity)throw new Error(`Unknown entity ${id}`);
  if(patch.kind!==undefined||patch.regionId!==undefined||patch.id!==undefined)throw new Error('Construction kind and region ownership are not implicit edit conversions');
  Object.assign(entity,structuredClone(patch));
  return compileRegionWorld(next).document();
}
