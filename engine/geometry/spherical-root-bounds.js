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
  directionError,centerError,radius,radiusError,curvatureRadius,maxDistance,maxEvents,
  phaseAllowance,angleAllowance}){
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
    curvatureRadius,maxDistance,maxEvents,phaseAllowance,angleAllowance});
}

// phaseAllowance and angleAllowance are absolute-radian models of the arctangent
// and arccosine a CONSUMER will actually execute. Supplying one is an assumption
// about that implementation, never a proof of it; the default 0 keeps this
// module's own binary64 allowance and nothing else.
export function sphericalRootBounds({a,b,c,errorA,errorB,errorC,curvatureRadius,
  maxDistance,maxEvents=32,phaseAllowance=0,angleAllowance=0}){
  const values=[a,b,c,errorA,errorB,errorC,curvatureRadius,maxDistance];
  if(!values.every(Number.isFinite)||Math.max(Math.abs(a),Math.abs(b),Math.abs(c))>2
    ||[errorA,errorB,errorC].some(x=>x<0||x>2)||curvatureRadius<=0||maxDistance<0
    ||!Number.isInteger(maxEvents)||maxEvents<1||maxEvents>1024
    ||![phaseAllowance,angleAllowance].every(x=>Number.isFinite(x)&&x>=0&&x<=1))
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
  const phase=Math.atan2(b,a),phaseError=Math.asin(Math.min(1,dh/h))+rounding(phase)+phaseAllowance;
  const ratioLow=Math.max(0,cLow/hHigh-rounding(cLow/hHigh));
  const ratioHigh=cHigh/hLow+rounding(cHigh/hLow);
  const ambiguous=ratioHigh>=1;
  const angleLow=ambiguous?0:Math.max(0,Math.acos(ratioHigh)-rounding(Math.acos(ratioHigh))-angleAllowance);
  const angleHigh=Math.acos(Math.min(1,ratioLow))+rounding(Math.acos(Math.min(1,ratioLow)))+angleAllowance;
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

// Where a geodesic meets the great sphere dot(q,normal)=0. Same coefficient
// problem as a ball with c=0, and the BEST conditioned case of it: the zeros
// sit a quarter turn from the amplitude peak, where the derivative is largest,
// so no arccosine sensitivity appears and the bands stay narrow.
//
// This bounds the PLANE, not the finite aperture disc cut out of it. A caller
// using these as competing events therefore refuses more often than the real
// geometry demands, never less, which is the safe direction for ordering.
export function sphericalPlaneCrossingBounds({point,pointError,direction,directionError,
  normal,normalError,curvatureRadius,maxDistance,maxEvents=32,phaseAllowance=0}){
  const vectors=[point,direction,normal,pointError,directionError,normalError];
  if(vectors.some(v=>!Array.isArray(v)||v.length!==4||!v.every(Number.isFinite))
    ||[pointError,directionError,normalError].some(v=>v.some(x=>x<0))
    ||!Number.isFinite(curvatureRadius)||curvatureRadius<=0
    ||!Number.isFinite(maxDistance)||maxDistance<0
    ||!Number.isInteger(maxEvents)||maxEvents<1||maxEvents>1024
    ||!Number.isFinite(phaseAllowance)||phaseAllowance<0||phaseAllowance>1)
    throw Error('Invalid spherical plane query or missing input-error bounds');
  const a=product(point,pointError,normal,normalError);
  const b=product(direction,directionError,normal,normalError);
  const h=Math.hypot(a.value,b.value),dh=Math.hypot(a.error,b.error)+rounding(h);
  // A coefficient rectangle straddling the origin has no determined phase, so
  // the crossing times are not located at all.
  if(h-dh<=0)return {status:'unresolved',reason:'phase-indeterminate',events:[]};
  const phase=Math.atan2(b.value,a.value);
  const spread=Math.asin(Math.min(1,dh/h))+rounding(phase)+phaseAllowance;
  if(spread>=Math.PI/2)return {status:'unresolved',reason:'phase-indeterminate',events:[]};
  const horizon=maxDistance/curvatureRadius;
  if(!Number.isFinite(horizon))return {status:'unresolved',reason:'range-overflow',events:[]};
  const quarter=Math.PI/2,events=[];
  const first=Math.floor((-quarter-phase-spread)/Math.PI)-1;
  const last=Math.ceil((horizon-quarter-phase+spread)/Math.PI)+1;
  if(last-first>maxEvents+4)return {status:'unresolved',reason:'event-budget',events:[]};
  for(let k=first;k<=last;k++){
    const centre=phase+quarter+k*Math.PI;
    const pad=rounding(centre-spread,centre+spread)*curvatureRadius+rounding(maxDistance);
    const lower=(centre-spread)*curvatureRadius-pad,upper=(centre+spread)*curvatureRadius+pad;
    if(upper<0||lower>maxDistance)continue;
    // Reported as ambiguous on purpose: this proves WHEN the great sphere is
    // met, never that the ray leaves through the aperture cut out of it.
    events.push({kind:'ambiguous',lower:Math.max(0,lower),upper:Math.min(maxDistance,upper),
      boundary:lower<=0||upper>=maxDistance});
  }
  events.sort((x,y)=>x.lower-y.lower);
  if(events.length>maxEvents)return {status:'unresolved',reason:'event-budget',events:[]};
  return {status:events.length?'crossings':'miss',events};
}

