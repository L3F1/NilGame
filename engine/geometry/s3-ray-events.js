// Primitive boundary candidates along a unit-speed S3 geodesic. These are
// NOT scene hits: cell faces still need clipping and CSG occupancy arbitration.
// Numerical guards report uncertainty; they are not formal interval arithmetic.
const dot = (a,b) => a.reduce((s,x,i)=>s+x*b[i],0);
export const S3_RAY_ROUNDOFF = 128 * Number.EPSILON;
const EPS = S3_RAY_ROUNDOFF;

export function sphericalBoundaryEvents(space, primitive, position, direction, {
  maxDistance, maxEvents = 16,
} = {}) {
  if (space?.kind !== 's3') throw new Error('S3 boundary events require an S3 metric');
  space.validatePoint(position); space.validateTangent(position,direction);
  if (Math.abs(space.norm(position,direction)-1)>1e-8) throw new Error('Ray direction must be unit length');
  const R=space.curvatureRadius;
  if (!Number.isFinite(maxDistance)||maxDistance<0||maxDistance>Math.PI*R)
    throw new Error('maxDistance must be finite within one S3 half-circle');
  if (!Number.isInteger(maxEvents)||maxEvents<0) throw new Error('Invalid maxEvents');
  const kind=primitive?.entity?.kind;
  if (!['ball','plane','geodesic-cell'].includes(kind)) throw new Error('Unsupported S3 primitive');
  const events=[];
  const refuse=(reason,face=null)=>({status:'unresolved',reason,face,events});
  // The public metric accepts small drift for repair. This root equation must
  // not silently use that looser tolerance with much smaller root guards.
  if (Math.abs(dot(position,position)-1)>EPS || Math.abs(dot(direction,direction)-1)>EPS ||
      Math.abs(dot(position,direction))>EPS) return refuse('input-roundoff');
  let surfaces;
  if (kind==='ball') {
    space.validatePoint(primitive.center);
    const radius=primitive.entity.radius;
    if (!Number.isFinite(radius)||radius<=0) throw new Error('Invalid ball radius');
    if (radius>=Math.PI*R) return refuse('degenerate-ball');
    // Ball interior: dot(p,center) >= cos(radius/R). Outward normal is
    // NEGATIVE projected center; plane interiors use the opposite inequality.
    surfaces=[{pole:primitive.center,level:Math.cos(radius/R),sign:-1}];
  } else {
    const count=kind==='plane'?1:6;
    if (!Array.isArray(primitive.planes)||primitive.planes.length!==count) throw new Error('Invalid face planes');
    surfaces=primitive.planes.map(pole=>({pole,level:0,sign:1}));
  }
  for (let face=0;face<surfaces.length;face++) {
    const {pole,level,sign}=surfaces[face];
    if (!Array.isArray(pole)||pole.length!==4||!pole.every(Number.isFinite)||Math.abs(Math.hypot(...pole)-1)>1e-8)
      throw new Error('Surface pole must be a unit four-vector');
    // A plane's zero set is homogeneous in its pole. Compile-legal decimal
    // frame error changes its scale, not the locus solved here. Balls instead
    // compare against a nonzero cosine level and require a unit center.
    if (kind==='ball' && Math.abs(dot(pole,pole)-1)>EPS) return refuse('input-roundoff',face);
    // p(t).pole = A cos(t/R) + B sin(t/R).
    const A=dot(position,pole),B=dot(direction,pole),amplitude=Math.hypot(A,B);
    const error=EPS*(1+Math.abs(A)+Math.abs(B)+Math.abs(level));
    if (amplitude < Math.abs(level)-error) continue;
    if (amplitude<=error) return refuse('coincident-or-ill-conditioned',face);
    if (Math.abs(amplitude-Math.abs(level))<=error) return refuse('tangent-or-ill-conditioned',face);
    const phase=Math.atan2(B,A),offset=Math.acos(level/amplitude);
    const slope=Math.sqrt(Math.max(0,(amplitude-level)*(amplitude+level)));
    // Guard root ordering and range classification in physical units. This
    // screening scale includes cancellation in phase +/- acos, not a proof
    // that a JavaScript transcendental has a particular ulp error bound.
    const guard=R*(4*error/slope+EPS*(1+Math.abs(phase)+offset));
    for (const branch of [-1,1]) for (let period=-2;period<=2;period++) {
      const theta=phase+branch*offset+period*2*Math.PI,t=R*theta;
      if (t < -guard || t > maxDistance+guard) continue;
      if (t<=guard || t>=maxDistance-guard) return refuse('range-boundary',face);
      if (events.length>=maxEvents) return refuse('event-budget',face);
      const c=Math.cos(theta),s=Math.sin(theta);
      const at=position.map((x,i)=>c*x+s*direction[i]);
      const along=direction.map((x,i)=>c*x-s*position[i]);
      const projection=dot(at,pole)/dot(at,at);
      const raw=pole.map((x,i)=>sign*(x-projection*at[i])),length=Math.hypot(...raw);
      if (length<=error) return refuse('singular-normal',face);
      const derivative=sign*(-A*s+B*c)/R;
      events.push({primitiveId:primitive.entity.id,face:kind==='ball'?null:face,
        distance:t,guard,point:at,direction:along,normal:raw.map(x=>x/length),
        transition:derivative<0?'enter':'exit'});
    }
  }
  events.sort((a,b)=>a.distance-b.distance);
  for(let i=1;i<events.length;i++) if(events[i].distance-events[i-1].distance<=events[i].guard+events[i-1].guard)
    return refuse('coincident-events');
  return {status:'complete',events};
}
