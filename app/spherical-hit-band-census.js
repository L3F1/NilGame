import {e3PrimaryRayBounds} from '../engine/geometry/primary-ray-bounds.js';
import {e3S3TransferBounds} from '../engine/geometry/portal-transfer-bounds.js';
import {sphericalBallRootBounds,sphericalBallExterior} from '../engine/geometry/spherical-root-bounds.js';
import {selectAdditiveEntry} from '../engine/geometry/additive-event-order.js';
import {interval} from '../engine/geometry/float32-interval.js';
import {traceRegionSight} from '../engine/world/region-sight.js';
import {pixelDirection} from './connected-global-model.js';
// Measurement only, for the recorded first-transfer sphere pixels the live
// shader currently refuses. It answers ONE question: after the certified
// E3 -> S3 transfer box, do this scene's root bands separate well enough for
// additive event ordering to name a first entry at all?
//
// It is NOT a renderer path, a float32 GPU claim, or a shading certificate. A
// returned band certifies owner and order; SPHERICAL_ROOT_PRECISION.md still
// forbids feeding its midpoint to hit position or normal evaluation. The
// binary64 reference model here carries the module's engineering rounding
// allowance, so a separated band is evidence that a float32 port is worth
// deriving, not evidence that float32 separates.
const mid=b=>b.map(([lo,hi])=>(lo+hi)/2);
const halfWidth=b=>b.map(([lo,hi])=>(hi-lo)/2);
const scale=(errors,factor)=>errors.map(x=>x*factor);
// Double-precision replay of the live GLSL tangency guard, so the measured set
// is the set the shader actually refuses. Replay, not GPU provenance: a GPU
// census still owns the real unresolved count.
export const TANGENCY_GUARD=4*0.00003;
function tangencyCandidates(point,direction,balls,curvatureRadius){
  return balls.filter(ball=>{
    const a=point.reduce((sum,v,k)=>sum+v*ball.center[k],0);
    const b=direction.reduce((sum,v,k)=>sum+v*ball.center[k],0);
    return Math.abs(1-Math.cos(ball.radius/curvatureRadius)/Math.hypot(a,b))<TANGENCY_GUARD;
  }).map(ball=>ball.id);
}
// One ordering attempt at one input-error scale. Every ball in the destination
// region competes, including balls the guard did not flag: an ordering that
// only looked at the suspected surface would prove nothing about the first one.
function orderEntry(balls,transfer,curvatureRadius,remaining,factor){
  const position=mid(transfer.position),direction=mid(transfer.direction);
  const positionError=scale(halfWidth(transfer.position),factor);
  const directionError=scale(halfWidth(transfer.direction),factor);
  const queries=[],exterior=[];
  let certified=true,minMargin=Infinity;
  for(const ball of balls){
    const centerBands=ball.center.map(v=>interval(v)),radiusBand=interval(ball.radius);
    const center=mid(centerBands),centerError=halfWidth(centerBands);
    const radiusError=Math.max(ball.radius-radiusBand[0],radiusBand[1]-ball.radius);
    const outside=sphericalBallExterior({point:position,pointError:positionError,
      center,centerError,radius:ball.radius,radiusError,curvatureRadius});
    if(outside.status!=='outside')certified=false;
    if(Number.isFinite(outside.margin))minMargin=Math.min(minMargin,outside.margin);
    exterior.push({owner:ball.id,status:outside.status,reason:outside.reason,margin:outside.margin});
    const root=sphericalBallRootBounds({position,positionError,direction,directionError,
      center,centerError,radius:ball.radius,radiusError,curvatureRadius,maxDistance:remaining});
    queries.push({owner:ball.id,status:root.status,reason:root.reason,events:root.events});
  }
  // An uncertified start is a refusal of the whole ordering, not of one ball.
  if(!certified)return {exterior,certified,minMargin,queries,
    entry:{status:'unresolved',reason:'start-not-certified-outside'}};
  const entry=selectAdditiveEntry(queries.map(({owner,status,events})=>({owner,status,events})),
    {maxDistance:remaining,outsideCertified:true});
  return {exterior,certified,minMargin,queries,entry};
}
export function sphericalHitBandCensus({world,pose,width=160,height=120,range=60,
  inflations=[1,2,4,8,16,32,64,128,256,512,1024]}){
  const source=world.regions.get(pose.regionId);
  if(!source||source.space.kind!=='e3')throw Error('Hit-band census requires an E3 entry region');
  if(!inflations.length||inflations[0]!==1||inflations.some((x,i)=>i&&x<=inflations[i-1]))
    throw Error('Inflation factors must start at the measured box and increase');
  const cameraError={forward:[0,0,0],right:[0,0,0],up:[0,0,0]};
  const records=[],summary={flagged:0,cpu:{},entry:{},exteriorRefused:0,
    bandWidth:{min:Infinity,max:0},containsTracedRoot:0,missingTracedRoot:0,inflation:{}};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const direction=pixelDirection(source.space,pose.position,pose.camera,width,height,x,y);
    const sight=traceRegionSight(world,{regionId:pose.regionId,position:pose.position,direction},
      {maxDistance:range});
    const first=sight.crossings?.[0];
    if(!first||first.fromRegionId!==pose.regionId)continue;
    const destination=world.regions.get(first.toRegionId);
    if(destination?.space.kind!=='s3'||!destination.balls?.length)continue;
    const gate=world.portals.find(g=>g.fromId===first.fromId);
    if(!gate)continue;
    // Ideal transported ray, used ONLY to replay the guard that selects pixels.
    const leg=source.space.stepWithTransport(pose.position,direction,first.distance);
    const mapped=gate.transit(first.entry);
    const carried=mapped.carry(leg.carry(direction));
    const curvatureRadius=destination.space.curvatureRadius;
    const guard=tangencyCandidates(mapped.position,carried,destination.balls,curvatureRadius);
    if(!guard.length)continue;
    summary.flagged++;
    const cpu={status:sight.status,owner:sight.query?.owner??null,distance:sight.distance??null,
      reason:sight.reason??null};
    summary.cpu[cpu.status]=(summary.cpu[cpu.status]??0)+1;
    const bounds=e3PrimaryRayBounds({camera:pose.camera,cameraError,width,height,pixel:[x+.5,y+.5]});
    const transfer=e3S3TransferBounds({position:pose.position,positionError:[0,0,0],
      direction:mid(bounds),directionError:halfWidth(bounds),frame:gate.renderData(),frameError:0,
      curvatureRadius,maxDistance:range});
    if(transfer.status!=='bounded'){
      const key=`transfer-${transfer.reason}`;
      summary.entry[key]=(summary.entry[key]??0)+1;
      records.push({x,y,guard,cpu,transfer:{status:transfer.status,reason:transfer.reason}});
      continue;
    }
    // The remaining budget is measured from the EARLIEST possible crossing, so
    // no competing event inside the original range is excluded by arithmetic.
    const remaining=range-transfer.distance[0];
    const measured=orderEntry(destination.balls,transfer,curvatureRadius,remaining,1);
    if(!measured.certified)summary.exteriorRefused++;
    const key=[measured.entry.status,measured.entry.reason??''].join('|');
    summary.entry[key]=(summary.entry[key]??0)+1;
    // The traced distance is a binary64 estimate, not ground truth; it is
    // reported in the same leg-local frame so a band that cannot contain the
    // traced root is visible instead of averaged away.
    const tracedRoot=cpu.distance===null?null
      :[cpu.distance-transfer.distance[1],cpu.distance-transfer.distance[0]];
    let containsTracedRoot=null,bandWidth=null;
    if(measured.entry.status==='entry'){
      bandWidth=measured.entry.upper-measured.entry.lower;
      summary.bandWidth.min=Math.min(summary.bandWidth.min,bandWidth);
      summary.bandWidth.max=Math.max(summary.bandWidth.max,bandWidth);
      containsTracedRoot=!!tracedRoot&&tracedRoot[0]<=measured.entry.upper&&tracedRoot[1]>=measured.entry.lower;
      if(containsTracedRoot)summary.containsTracedRoot++;else summary.missingTracedRoot++;
    }
    // How much wider the input box may get before this scene's bands stop
    // separating. A float32 port needs its own operation analysis; this only
    // says whether any headroom exists for one.
    let inflationLimit=0,inflationFailure=null;
    for(const factor of inflations){
      const attempt=factor===1?measured:orderEntry(destination.balls,transfer,curvatureRadius,remaining,factor);
      const same=attempt.certified&&attempt.entry.status===measured.entry.status
        &&attempt.entry.owner===measured.entry.owner;
      // How a widened box degrades matters more than when. A wider box must
      // lose the answer, never name a different owner.
      if(!same){inflationFailure={factor,certified:attempt.certified,status:attempt.entry.status,
        reason:attempt.entry.reason??null,owner:attempt.entry.owner??null};break;}
      inflationLimit=factor;
    }
    summary.inflation[inflationLimit]=(summary.inflation[inflationLimit]??0)+1;
    records.push({x,y,guard,cpu,transfer:{status:'bounded',distance:transfer.distance},
      exterior:{certified:measured.certified,minMargin:measured.minMargin,
        refused:measured.exterior.filter(e=>e.status!=='outside').map(e=>e.owner)},
      queries:measured.queries.map(q=>[q.owner,q.status,q.reason??'',q.events.length]),
      entry:measured.entry,bandWidth,tracedRoot,containsTracedRoot,inflationLimit,inflationFailure,remaining});
  }
  if(summary.bandWidth.min===Infinity)summary.bandWidth.min=null;
  return {label:'spherical-hit-band',width,height,range,pose,guard:TANGENCY_GUARD,
    balls:[...world.regions.values()].filter(r=>r.space.kind==='s3').flatMap(r=>r.balls?.map(b=>b.id)??[]),
    inflations,records,summary,
    scope:'binary64 reference model over one recorded pose; ordering and owner only, '
      +'no shading position, normal, float32 operation bound or live rendering claim'};
}
