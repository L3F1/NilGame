// Experimental persistence envelope. Scene-v2 retains its bounded meaning;
// each global region owns explicit local authoring charts in its own document.
import {compileRegionWorld,compileHyperbolicRegionWorld,REGION_LIMITS} from './region-world.js';
import {compileCoverRegion} from './cover-region-document.js';
import {compileFramedPortals,compileHyperbolicFramedPortals,decodeRegionAnchor} from './region-portal.js';
import {createCameraFrame} from './camera-frame.js';

function ballField(space,balls){
  function sample(p){
    space.validatePoint(p);let best={distance:Infinity,normal:null,owner:null,feature:'undefined'};
    for(const ball of balls){
      const distance=space.distance(p,ball.center)-ball.radius;
      if(distance<best.distance-1e-12){
        const a=p.reduce((s,x,i)=>s+x*ball.center[i],0),v=p.map((x,i)=>a*x-ball.center[i]),n=Math.hypot(...v);
        best={distance,normal:n>1e-10?v.map(x=>x/n):null,owner:ball.id,feature:n>1e-10?'smooth':'undefined'};
      }else if(Math.abs(distance-best.distance)<=1e-12)best={...best,feature:'seam'};
    }
    return best;
  }
  return Object.freeze({sample,distance:p=>sample(p).distance,normal:p=>sample(p).normal,
    capabilities:Object.freeze({distance:'bound',exteriorDistance:'exact',interior:'sign-with-conservative-magnitude',normal:'piecewise-with-seams',intersection:'global-s3-balls'})});
}

export function compileConnectedCoverWorld(source,{experimentalH3=false}={}){
  if(typeof experimentalH3!=='boolean')throw Error('Invalid H3 runtime opt-in');
  if(!source||Object.keys(source).some(k=>!['format','version','id','baseScene','coverRegions','connections'].includes(k))||source.format!=='nil-connected-cover'||source.version!==1
    ||typeof source.id!=='string'||! /^[a-z][a-z0-9_-]*$/.test(source.id)||!Array.isArray(source.coverRegions)||!Array.isArray(source.connections))throw Error('Invalid connected-cover document');
  const base=(experimentalH3?compileHyperbolicRegionWorld:compileRegionWorld)(source.baseScene),baseDoc=base.document(),radius=baseDoc.units.playerRadius;
  const regions=new Map(base.regions),compiled=source.coverRegions.map(d=>compileCoverRegion(d,{playerRadius:radius}));
  if(regions.size+compiled.length>REGION_LIMITS.regions)throw Error('At most four regions');
  const ids=new Set([baseDoc.id,...baseDoc.regions.map(r=>r.id),...baseDoc.entities.map(e=>e.id),...baseDoc.connections.map(c=>c.id)]);
  const claim=id=>{if(ids.has(id))throw Error(`Duplicate world ID ${id}`);ids.add(id);};
  const anchors=baseDoc.entities.filter(e=>e.kind==='anchor').map(e=>decodeRegionAnchor(e,regions.get(e.regionId).space));
  for(const r of compiled){
    claim(r.id);for(const e of r.document().entities)claim(e.id);
    const balls=r.balls.map(b=>Object.freeze({...b,center:Object.freeze(b.center.slice())}));
    regions.set(r.id,Object.freeze({id:r.id,descriptor:{id:r.id,geometry:{kind:'s3',curvatureRadius:r.space.curvatureRadius},coverage:'s3-cover'},
      space:r.space,balls:Object.freeze(balls),field:ballField(r.space,balls),spawnPosition:r.spawnPosition.slice(),spawnFrame:r.spawnFrame.map(v=>v.slice()),up:()=>null}));
    anchors.push(...r.anchors);
  }
  for(const c of source.connections){
    if(!c||Object.keys(c).some(k=>!['id','kind','a','b','velocity','scale'].includes(k))||typeof c.id!=='string'||! /^[a-z][a-z0-9_-]*$/.test(c.id))throw Error('Invalid connection record');
    claim(c.id);
  }
  const portals=(experimentalH3?compileHyperbolicFramedPortals:compileFramedPortals)([...baseDoc.connections,...source.connections],anchors,radius);
  if(portals.length>REGION_LIMITS.portals)throw Error('Too many portals');
  const document=structuredClone({...source,baseScene:baseDoc,coverRegions:compiled.map(r=>r.document())});
  function spawn(regionId=baseDoc.regions[0].id){
    if(base.regions.has(regionId))return base.spawn(regionId);
    const r=regions.get(regionId);if(!r)throw Error('Unknown spawn region');
    const p=r.spawnPosition.slice();
    return {regionId,position:p,velocity:p.map(()=>0),radius,camera:createCameraFrame(r.space,p,{forward:r.spawnFrame[1],up:r.spawnFrame[2]})};
  }
  function renderData(options){
    const data=base.renderData(options);
    for(const r of compiled){
      data.regions.push({id:r.id,kind:'s3',curvatureRadius:r.space.curvatureRadius,coverage:'s3-cover',extent:null});
      for(const b of r.balls)data.primitives.push({id:b.id,regionId:r.id,kind:'ball',op:'add',target:null,center:b.center.slice(),radius:b.radius,planes:[],axes:[],halfExtent:[0,0,0]});
    }
    return {...data,portals:portals.map(p=>p.renderData())};
  }
  return Object.freeze({regions,portals,spawn,document:()=>structuredClone(document),renderData});
}
