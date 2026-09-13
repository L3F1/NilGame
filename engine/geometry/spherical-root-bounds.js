// Host-free uncertainty contract for a*cos(t/R)+b*sin(t/R)=c, c>0.
// Callers supply ABSOLUTE coefficient errors, including upstream errors.
// This enumerates boundary events, not occupied intervals or scene hits.
// Binary64 transcendentals use an engineering rounding allowance; this is not
// a portable directed-rounding/libm proof. See SPHERICAL_ROOT_PRECISION.md.
const TAU=2*Math.PI;
const rounding=(...values)=>64*Number.EPSILON*Math.max(1,...values.map(Math.abs));

// Shared 4D dot bound and surface constant. Both entry points use these, so an
// exterior certificate and its root bands are always about the same surface.
function product(v,ev,center,centerError){
  let value=0,error=0,absolute=0;
  for(let i=0;i<4;i++){
    value+=v[i]*center[i];absolute+=Math.abs(v[i]*center[i]);
    error+=Math.abs(v[i])*centerError[i]+Math.abs(center[i])*ev[i]+ev[i]*centerError[i];
  }
  return {value,error:error+rounding(absolute,error)};
}
function surfaceConstant(radius,radiusError,curvatureRadius){
  const angle=radius/curvatureRadius,delta=radiusError/curvatureRadius+rounding(angle);
  const c=Math.cos(angle);
  return {c,errorC:Math.abs(Math.sin(angle))*delta+.5*delta*delta+rounding(c)};
}

// Map a metric ball to the shared coefficient problem. Component errors are
// mandatory; zero means the caller explicitly treats those inputs as exact.
// R is the declared physical unit scale, not an uncertain measured parameter.
export function sphericalBallRootBounds({position,direction,center,positionError,
  directionError,centerError,radius,radiusError,curvatureRadius,maxDistance,maxEvents}){
  const vectors=[position,direction,center,positionError,directionError,centerError];
  if(vectors.some(v=>!Array.isArray(v)||v.length!==4||!v.every(Number.isFinite))
    ||[positionError,directionError,centerError].some(v=>v.some(x=>x<0))
    ||![radius,radiusError,curvatureRadius].every(Number.isFinite)
    ||radiusError<0||curvatureRadius<=0||radius<=radiusError
    ||radius+radiusError>=Math.PI*curvatureRadius/2)
    throw Error('Invalid spherical ball or missing input-error bounds');
  const a=product(position,positionError,center,centerError),b=product(direction,directionError,center,centerError);
  const {c,errorC}=surfaceConstant(radius,radiusError,curvatureRadius);
  return sphericalRootBounds({a:a.value,b:b.value,c,errorA:a.error,errorB:b.error,errorC,
    curvatureRadius,maxDistance,maxEvents});
}

export function sphericalRootBounds({a,b,c,errorA,errorB,errorC,curvatureRadius,
  maxDistance,maxEvents=32}){
  const values=[a,b,c,errorA,errorB,errorC,curvatureRadius,maxDistance];
  if(!values.every(Number.isFinite)||Math.max(Math.abs(a),Math.abs(b),Math.abs(c))>2
    ||[errorA,errorB,errorC].some(x=>x<0||x>2)||curvatureRadius<=0||maxDistance<0
    ||!Number.isInteger(maxEvents)||maxEvents<1||maxEvents>1024)
    throw Error('Invalid spherical coefficient bounds or query limits');
  const unresolved=reason=>({status:'unresolved',reason,events:[]});
  if(c-errorC<=0)return unresolved('unsupported-coefficient-domain');
  const h=Math.hypot(a,b),dh=Math.hypot(errorA,errorB)+rounding(h);
  const hLow=Math.max(0,h-dh),hHigh=h+dh;
  const cLow=c-errorC-rounding(c),cHigh=c+errorC+rounding(c);
  if(cLow<=0)return unresolved('unsupported-coefficient-domain');
  if(hHigh<cLow)return {status:'miss',events:[]};
  if(hLow<=0)return unresolved('phase-indeterminate');
  // A coefficient rectangle lies within this disk. Its angular extent about
  // the origin is asin(dh/h), not an arbitrary angle epsilon.
  const phase=Math.atan2(b,a),phaseError=Math.asin(Math.min(1,dh/h))+rounding(phase);
  const ratioLow=Math.max(0,cLow/hHigh-rounding(cLow/hHigh));
  const ratioHigh=cHigh/hLow+rounding(cHigh/hLow);
  const ambiguous=ratioHigh>=1;
  const angleLow=ambiguous?0:Math.max(0,Math.acos(ratioHigh)-rounding(Math.acos(ratioHigh)));
  const angleHigh=Math.acos(Math.min(1,ratioLow))+rounding(Math.acos(Math.min(1,ratioLow)));
  const horizon=maxDistance/curvatureRadius;
  if(!Number.isFinite(horizon))return unresolved('range-overflow');
  const first=Math.floor((-phase-angleHigh-phaseError)/TAU)-1;
  const last=Math.ceil((horizon-phase+angleHigh+phaseError)/TAU)+1;
  if(last-first>maxEvents+4)return unresolved('event-budget');
  const events=[];
  function append(lo,hi,kind){
    const pad=rounding(lo,hi)*curvatureRadius+rounding(maxDistance);
    const lower=lo*curvatureRadius-pad,upper=hi*curvatureRadius+pad;
    if(upper<0||lower>maxDistance)return;
    events.push({kind,lower:Math.max(0,lower),upper:Math.min(maxDistance,upper),
      boundary:lower<=0||upper>=maxDistance});
  }
  for(let k=first;k<=last;k++){
    const center=phase+k*TAU;
    if(ambiguous)append(center-phaseError-angleHigh,center+phaseError+angleHigh,'ambiguous');
    else{
      append(center-phaseError-angleHigh,center+phaseError-angleLow,'entry');
      append(center-phaseError+angleLow,center+phaseError+angleHigh,'exit');
    }
  }
  events.sort((x,y)=>x.lower-y.lower);
  if(events.length>maxEvents)return unresolved('event-budget');
  if(!events.length)return {status:'miss',events};
  const overlap=events.some((event,i)=>i>0&&event.lower<=events[i-1].upper);
  return {status:ambiguous||overlap||events.some(e=>e.boundary)?'unresolved':'roots',
    reason:ambiguous?'tangency-band':overlap?'overlapping-root-bands':events.some(e=>e.boundary)?'range-boundary':undefined,
    events};
}

// Certified EXTERIOR of one metric ball at one point. Additive event ordering
// requires this at the start of every leg: a ray that may already be inside a
// ball has no first entry to order. Refusal is 'unresolved', never 'inside':
// this proves a strict outside, and proves nothing else.
export function sphericalBallExterior({point,pointError,center,centerError,
  radius,radiusError,curvatureRadius}){
  const vectors=[point,center,pointError,centerError];
  if(vectors.some(v=>!Array.isArray(v)||v.length!==4||!v.every(Number.isFinite))
    ||[pointError,centerError].some(v=>v.some(x=>x<0))
    ||![radius,radiusError,curvatureRadius].every(Number.isFinite)
    ||radiusError<0||curvatureRadius<=0||radius<=radiusError
    ||radius+radiusError>=Math.PI*curvatureRadius/2)
    throw Error('Invalid spherical ball or missing input-error bounds');
  const a=product(point,pointError,center,centerError);
  const {c,errorC}=surfaceConstant(radius,radiusError,curvatureRadius);
  // Same widened constant the root bands use, so the two cannot disagree about
  // which surface was certified.
  const cLow=c-errorC-rounding(c);
  if(cLow<=0)return {status:'unresolved',reason:'unsupported-coefficient-domain'};
  const upper=a.value+a.error;
  return upper<cLow?{status:'outside',margin:cLow-upper}
    :{status:'unresolved',reason:'start-not-certified-outside',margin:cLow-upper};
}
