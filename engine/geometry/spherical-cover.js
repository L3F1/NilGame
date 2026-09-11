// Global S3 runtime points; local authoring charts are explicit and bounded.
// Reuses the arena-derived geodesics and segment transport without widening
// the scene-v2 compiler's existing open-hemisphere contract.
import {createMetricSpace} from './metric-space.js';
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);

export function createSphericalCover({curvatureRadius=8}={}) {
  const metric=createMetricSpace({kind:'s3',curvatureRadius});
  const R=metric.curvatureRadius;
  // q*i, q*j, q*k for unit quaternion q=(x,y,z,w). This is a smooth global
  // orthonormal construction basis, NOT a parallel-transported camera frame.
  function frame(p) {
    metric.validatePoint(p);const [x,y,z,w]=p;
    return [[w,z,-y,-x],[-z,w,x,-y],[y,-x,w,-z]];
  }
  const localOnly=()=>{throw Error('Global S3 has no single author chart; use chartAt(center)');};
  function chartAt(center,{extent=Math.PI*R/2,basis=frame(center)}={}) {
    metric.validatePoint(center);
    if(!Number.isFinite(extent)||extent<=0||extent>Math.PI*R/2)throw Error('Author chart must fit an open hemisphere');
    if(!Array.isArray(basis)||basis.length!==3)throw Error('Chart basis needs three tangents');
    basis.forEach(v=>metric.validateTangent(center,v));
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(Math.abs(dot(basis[i],basis[j])-(i===j?1:0))>1e-8)throw Error('Chart basis must be orthonormal');
    const anchor=Object.freeze(center.slice()),axes=basis.map(v=>Object.freeze(v.slice()));
    function contains(p){return metric.distance(anchor,p)<extent;}
    function decode(author){
      if(!Array.isArray(author)||author.length!==3||!author.every(Number.isFinite)||Math.hypot(...author)>=extent)throw Error('Point outside author chart');
      return metric.expAt(anchor,anchor.map((_,i)=>axes.reduce((s,b,j)=>s+b[i]*author[j],0)));
    }
    function encode(p){
      if(!contains(p))throw Error('Point outside author chart');
      const v=metric.logAt(anchor,p);return axes.map(b=>dot(b,v));
    }
    return Object.freeze({center:anchor,basis:Object.freeze(axes),extent,contains,decode,encode});
  }
  return Object.freeze({...metric,coverage:'s3-cover',maxDistance:Infinity,
    withinDomain:p=>{metric.validatePoint(p);return true;},
    boundaryDistance:(p,u,maxTravel=Infinity)=>{
      if(Math.abs(metric.norm(p,u)-1)>1e-8)throw Error('Geodesic direction must be unit');
      if(!(maxTravel>=0)||(!Number.isFinite(maxTravel)&&maxTravel!==Infinity))throw Error('Invalid maxTravel');
      return Infinity;
    },frame,chartAt,decode:localOnly,encode:localOnly});
}

/** First intersection with small metric balls on the COMPLETE sphere.
 * Deliberately no CSG, portals, material policy or body collision in this query.
 * Static ball occupancy repeats every 2*pi*R; an empty whole orbit is an empty
 * longer ray. Tangencies/inside starts/budget exhaustion remain unresolved.
 */
export function castSphericalBalls(space,balls,p,u,{maxDistance=2*Math.PI*space.curvatureRadius,maxTests=256}={}) {
  if(space.coverage!=='s3-cover')throw Error('Expected global S3 cover');
  space.validatePoint(p);
  if(Math.abs(space.norm(p,u)-1)>1e-8)throw Error('Ray direction must be unit');
  if(!Number.isFinite(maxDistance)||maxDistance<0||!Number.isInteger(maxTests)||maxTests<0)throw Error('Invalid query limits');
  const R=space.curvatureRadius,period=2*Math.PI*R,end=Math.min(maxDistance,period),eps=1e-10;
  let best=null,uncertain=Infinity,tests=0;
  for(const ball of balls){
    if(tests++>=maxTests)return {status:'unresolved',reason:'work-budget',tests:maxTests};
    space.validatePoint(ball.center);
    if(!Number.isFinite(ball.radius)||ball.radius<=0||ball.radius>=Math.PI*R/2)throw Error('Ball radius must be below a hemisphere');
    const a=dot(p,ball.center),b=dot(u,ball.center),c=Math.cos(ball.radius/R),h=Math.hypot(a,b);
    if(a>=c-eps)return {status:'unresolved',reason:a>c+eps?'inside-start':'boundary-start',tests};
    if(h<c-eps)continue;
    const phase=Math.atan2(b,a),wrap=x=>((x%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
    if(h<=c+eps){
      const width=Math.acos(Math.min(1,Math.max(-1,(c-eps)/h)));
      const center=wrap(phase),lo=Math.max(0,(center-width)*R),hi=(center+width)*R;
      if(lo<=end&&hi>=0)uncertain=Math.min(uncertain,lo);
      continue;
    }
    const entry=wrap(phase-Math.acos(Math.min(1,c/h)))*R;
    if(entry>end+eps*R)continue;
    if(Math.abs(entry-end)<=eps*R){uncertain=Math.min(uncertain,Math.max(0,entry-eps*R));continue;}
    if(best&&Math.abs(entry-best.distance)<=eps*R){uncertain=Math.min(uncertain,Math.max(0,entry-eps*R));continue;}
    if(!best||entry<best.distance){
      const point=space.step(p,u,entry),projection=dot(point,ball.center);
      const normal=space.normalize(point,point.map((x,i)=>projection*x-ball.center[i]));
      best={status:'hit',id:ball.id,distance:entry,point,normal};
    }
  }
  if(best&&best.distance+eps*R<uncertain)return {...best,tests};
  if(uncertain<=end)return {status:'unresolved',reason:'tangent-or-range-boundary',tests};
  return {status:'miss',distance:maxDistance,checkedDistance:end,periodic:maxDistance>=period,tests};
}
