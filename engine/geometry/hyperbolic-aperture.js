// Experimental finite totally geodesic H3 disc. Not a portal transit API.
// Floating-point guard bands are heuristic; uncertainty never becomes a miss.
export function queryHyperbolicAperture(space, aperture, p, u, {maxDistance, bodyRadius=0}={}) {
  if(space.kind!=='h3')throw Error('Expected H3 adapter');
  const {center,normal,radius}=aperture,R=space.curvatureRadius;
  space.validatePoint(center);space.validatePoint(p);
  if(!space.withinDomain(center)||!Number.isFinite(radius)||radius<=0||radius>R
    ||Math.abs(space.norm(center,normal)-1)>1e-8)throw Error('Invalid H3 aperture');
  if(Math.abs(space.norm(p,u)-1)>1e-8||!Number.isFinite(maxDistance)||maxDistance<0
    ||!Number.isFinite(bodyRadius)||bodyRadius<0)throw Error('Invalid H3 aperture ray');
  // No proven safe prefix is exported from a heuristic root interval. The
  // distance on a refusal is diagnostic, never permission to advance to it.
  const unknown=(reason,distance=0)=>({status:'unresolved',reason,distance,uncertaintyFrom:0});
  if(!space.withinDomain(p))return unknown('domain-exit');
  const boundary=space.boundaryDistance(p,u),end=Math.min(maxDistance,boundary);
  const miss=()=>boundary<=maxDistance?unknown('domain-exit',boundary)
    :{status:'miss',checkedDistance:maxDistance};
  // <gamma(t),n> = A cosh(t/R) + B sinh(t/R).
  const A=space.ambientDot(p,normal),B=space.ambientDot(u,normal);
  const eps=Math.max(1e-10,128*Number.EPSILON*(1+Math.abs(A)+Math.abs(B)));
  const lengthTolerance=1e-9*R;
  if(Math.abs(A)<=eps)return unknown('boundary-start');
  if(A<0)return miss(); // At most one root; a back-side ray cannot ENTER later.
  // Positive front-side A needs B<-A for a finite entering root. Equality
  // approaches the plane only at infinity; refuse its numerical neighbourhood.
  if(B>-A+eps)return miss();
  if(B>=-A-eps)return unknown('asymptotic-plane');
  const ratio=-A/B,t=R*Math.atanh(ratio);
  if(!Number.isFinite(t)||t<0)return unknown('numeric-conditioning');
  // Extremal ratios of perturbed A and -B bound the heuristic root band.
  // They are not rigorous directed-rounding intervals.
  const lo=R*Math.atanh(Math.max(0,(A-eps)/(-B+eps)));
  const upper=(A+eps)/(-B-eps);
  const hi=upper<1?R*Math.atanh(upper):Infinity;
  if(lo>end+lengthTolerance)return miss();
  if(hi>=end-lengthTolerance)return unknown(boundary<=maxDistance?'domain-exit':'range-boundary',Math.min(t,end));
  const point=space.step(p,u,t);
  if(!space.withinDomain(point))return unknown('domain-exit',t);
  const residual=R*Math.asinh(space.ambientDot(point,normal));
  if(Math.abs(residual)>lengthTolerance)return unknown('numeric-conditioning',t);
  const clearance=radius-bodyRadius-space.distance(center,point);
  // Include uncertainty in ray arclength in the rim decision, using distance's
  // 1-Lipschitz property. Clearance is a radial gameplay fit, not an isometry.
  const rimTolerance=lengthTolerance+Math.max(t-lo,hi-t);
  if(Math.abs(clearance)<=rimTolerance)return unknown('aperture-rim',t);
  if(clearance<0)return miss();
  return {status:'hit',distance:t,point,clearance};
}
