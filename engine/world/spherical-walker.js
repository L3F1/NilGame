// First walking policy: one S3 region, one unmodified great-sphere floor.
// No global up, no new collision loop, and no implicit correction resumption.
import {moveRegionProbe} from './region-motion.js';
import {mapFrame,alignUp} from './camera-frame.js';

export function createSphericalWalker(world) {
  if(world.regions.size!==1||world.portals.length)throw Error('Walking requires one region without portals');
  const region=[...world.regions.values()][0],{space,field}=region;
  if(space.kind!=='s3')throw Error('Spherical walking requires S3');
  const floor=region.entities.find(e=>e.id===region.descriptor.floorId);
  if(!floor||floor.kind!=='plane'||(floor.op&&floor.op!=='add'))throw Error('Select an additive great-sphere floor');
  if(region.entities.some(e=>e.op&&e.op!=='add'&&(!e.target||e.target===floor.id)))
    throw Error('Walking does not support a modified floor');
  const center=space.decode(floor.position),basis=space.frame(center);
  const normal=basis[0].map((_,i)=>basis.reduce((sum,a,j)=>sum+a[i]*floor.up[j],0));
  const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
  const finitePositive=(x,name)=>{if(!Number.isFinite(x)||x<=0)throw Error(`${name} must be positive and finite`);};
  function cross(p,a,b) {
    const frame=space.frame(p),x=frame.map(e=>space.dot(p,a,e)),y=frame.map(e=>space.dot(p,b,e));
    const c=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];
    return p.map((_,i)=>frame.reduce((sum,e,j)=>sum+c[j]*e[i],0));
  }
  // Rodrigues rotation IN the orthonormal tangent space, not an ambient 4D
  // rotation chosen without regard to the point. Carries every camera axis.
  function rotate(camera,axis,angle) {
    const p=camera.position,c=Math.cos(angle),s=Math.sin(angle);
    return mapFrame(camera,p,v=>{
      const n=space.dot(p,v,axis),side=cross(p,axis,v);
      return v.map((x,i)=>c*x+s*side[i]+(1-c)*n*axis[i]);
    });
  }

  function support(state,{skin=1e-4}={}) {
    finitePositive(skin,'skin');
    if(state.regionId!==region.id)throw Error('Walker belongs to another region');
    const p=state.position;
    space.validatePoint(p);space.validateTangent(p,state.velocity);
    finitePositive(state.radius,'radius');
    const a=dot(p,normal),height=space.curvatureRadius*Math.asin(Math.max(-1,Math.min(1,a)));
    const gradient=normal.map((x,i)=>x-a*p[i]),length=Math.hypot(...gradient);
    const distance=field.distance(p),gap=distance-state.radius;
    const up=length>1e-10?gradient.map(x=>x/length):null;
    let reason=null;
    if(!space.withinDomain(p))reason='outside-domain';
    else if(!up)reason='singular-floor-up';
    else if(!Number.isFinite(distance)&&distance!==Infinity)reason='invalid-field';
    else if(gap < -skin)reason=distance<0?'center-in-solid':'initial-clearance-unproven';
    return {height,clearance:height-state.radius,sceneClearance:gap,up,reason,
      grounded:!reason&&Math.abs(height-state.radius)<=2*skin&&space.dot(p,state.velocity,up)<=1e-8};
  }

  function step(state,dt,{wish=[0,0],speed=2,gravity=9,jump=false,jumpSpeed=4,
    skin=1e-4,maxSubstep=1/120,maxSubsteps=240,maxSteps=96,maxContacts=4}={}) {
    if(!Number.isFinite(dt)||dt<0)throw Error('dt must be finite and nonnegative');
    if(!Array.isArray(wish)||wish.length!==2||!wish.every(Number.isFinite))throw Error('wish must have two finite components');
    for(const [name,value] of Object.entries({speed,gravity,jumpSpeed,skin,maxSubstep}))finitePositive(value,name);
    if(!Number.isInteger(maxSubsteps)||maxSubsteps<0)throw Error('maxSubsteps must be a nonnegative integer');
    if(!Number.isInteger(maxSteps)||maxSteps<0||!Number.isInteger(maxContacts)||maxContacts<0)throw Error('Invalid motion budgets');
    if(!state.camera||state.camera.space!==space||space.distance(state.position,state.camera.position)>1e-10)
      throw Error('Camera must belong to the walker endpoint');
    let current=state,remaining=dt,travel=0,rest=0,count=0,last=null;
    let sample=support(current,{skin});
    const contacts=[],events=[];
    let steps=0,responses=0;
    const finish=(status,detail=null)=>Object.freeze({
      ...(last||{}),status,detail,state:current,grounded:sample.grounded,
      support:sample,substeps:count,timeConsumed:travel+rest,timeRemaining:remaining,
      time:{travel,rest,correction:0},steps,contacts:responses,contactSamples:contacts,events,
      pendingLift:last?.pendingLift??null,continuation:last?.continuation??null,
    });
    if(sample.reason)return finish('unresolved',sample.reason);
    while(remaining>0&&count<maxSubsteps) {
      const h=Math.min(remaining,maxSubstep),p=current.position,up=sample.up;
      // Use the camera's forward projected into the current floor horizon.
      // Looking along up has no forward projection; camera right supplies a
      // continuous tangent reference there rather than a global-axis fallback.
      let forward=space.project(p,current.camera.forward,up);
      let right=space.project(p,current.camera.right,up);
      if(space.norm(p,forward)>1e-8) {
        forward=space.normalize(p,forward);
        right=space.project(p,right,forward);
        if(space.norm(p,right)<1e-8)right=space.project(p,current.camera.up,up);
        right=space.normalize(p,space.project(p,right,forward));
      } else {
        right=space.normalize(p,right);
        forward=space.normalize(p,space.project(p,space.project(p,current.camera.up,up),right));
      }
      const wishLength=Math.max(1,Math.hypot(...wish));
      let vertical=space.dot(p,current.velocity,up);
      if(sample.grounded&&vertical<0)vertical=0;
      if(jump&&count===0&&sample.grounded)vertical=jumpSpeed;
      vertical-=gravity*h;
      const velocity=up.map((x,i)=>vertical*x+speed*(right[i]*wish[0]+forward[i]*wish[1])/wishLength);
      last=moveRegionProbe(world,{...current,velocity},h,{skin,maxSteps,maxContacts});
      current=last.state;count++;steps+=last.steps;responses+=last.contacts;
      contacts.push(...last.contactSamples);events.push(...last.events);
      travel+=last.time.travel;rest+=last.time.rest;
      remaining=Math.max(0,remaining-last.timeConsumed);
      sample=support(current,{skin});
      // Preserve the exact suspended endpoint and token. Never project its
      // velocity or feed it onward while a correction is still owed.
      if(last.pendingLift||!['complete','stopped'].includes(last.status))return finish(last.status,last.detail);
      if(sample.reason)return finish('unresolved',sample.reason);
      if(sample.grounded) {
        const down=space.dot(current.position,current.velocity,sample.up);
        if(down<0)current=Object.freeze({...current,velocity:Object.freeze(space.project(current.position,current.velocity,sample.up))});
      }
      current=Object.freeze({...current,camera:alignUp(current.camera,sample.up,1-Math.exp(-8*h))});
    }
    return finish(remaining>0?'budget-exhausted':'complete',remaining>0?'substeps':null);
  }
  function look(state,{yaw=0,pitch=0}={}) {
    if(!Number.isFinite(yaw)||!Number.isFinite(pitch))throw Error('Look angles must be finite');
    const sample=support(state);
    if(!sample.up)throw Error('Walking camera has no floor up');
    const p=state.position,up=sample.up;
    let camera=rotate(state.camera,up,yaw);
    const elevation=Math.asin(Math.max(-1,Math.min(1,space.dot(p,camera.forward,up))));
    let axis=cross(p,camera.forward,up);
    if(space.norm(p,axis)<1e-8)axis=space.project(p,camera.right,up);
    axis=space.normalize(p,axis);
    const target=Math.max(-1.5,Math.min(1.5,elevation+pitch));
    camera=rotate(camera,axis,target-elevation);
    return Object.freeze({...state,camera});
  }
  return Object.freeze({support,step,look,regionId:region.id});
}
