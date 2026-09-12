// Experimental additive H3 balls. Numerical guards are explicit refusals,
// not certified interval arithmetic. Scene/GPU admission remains separate.
function validateBall(space,ball){
  if(space.kind!=='h3')throw Error('Expected H3 adapter');
  space.validatePoint(ball.center);
  if(!space.withinDomain(ball.center)||!Number.isFinite(ball.radius)||ball.radius<=0||ball.radius>space.curvatureRadius)
    throw Error('H3 ball needs an in-domain centre and radius at most R');
}
export function sampleHyperbolicBall(space,ball,p){
  validateBall(space,ball);space.validatePoint(p);
  const distance=space.distance(p,ball.center)-ball.radius;
  const inward=space.logAt(p,ball.center),length=space.norm(p,inward);
  // At the centre, the signed distance is valid but no unique normal exists.
  return {distance,normal:length?inward.map(x=>-x/length):null,normalUnique:length>0};
}
export function castHyperbolicBalls(space,balls,p,u,{maxDistance,maxTests=256}={}){
  if(space.kind!=='h3')throw Error('Expected H3 adapter');
  space.validatePoint(p);
  if(Math.abs(space.norm(p,u)-1)>1e-8||!Number.isFinite(maxDistance)||maxDistance<0
    ||!Number.isInteger(maxTests)||maxTests<0)throw Error('Invalid H3 ray limits/direction');
  if(!space.withinDomain(p))return {status:'unresolved',reason:'domain-exit',distance:0,tests:0};
  const R=space.curvatureRadius,boundary=space.boundaryDistance(p,u),end=Math.min(maxDistance,boundary);
  let tests=0,best=null,uncertain=Infinity;
  for(const ball of balls){
    if(tests>=maxTests)return {status:'unresolved',reason:'work-budget',tests};
    tests++;validateBall(space,ball);
    const A=-space.ambientDot(p,ball.center),B=-space.ambientDot(u,ball.center),C=Math.cosh(ball.radius/R);
    const eps=Math.max(1e-10,128*Number.EPSILON*(A*A+B*B+C*C+1));
    if(A<=C+eps)return {status:'unresolved',reason:A<C-eps?'inside-start':'boundary-start',tests};
    // A cosh(t)+B sinh(t) is the centre separation's hyperbolic cosine.
    // Its minimum lies behind this ray if B>=0.
    if(B>=0)continue;
    const D=A*A-B*B;
    if(D<1-eps)return {status:'unresolved',reason:'numeric-conditioning',tests};
    const H=Math.sqrt(Math.max(1,D)),closest=Math.atanh(-B/A);
    if(!Number.isFinite(closest))return {status:'unresolved',reason:'numeric-conditioning',tests};
    if(H>C+eps)continue;
    // Near tangency, retain the earliest root of the enlarged uncertainty band.
    const near=Math.max(0,(closest-Math.acosh(Math.max(1,(C+eps)/Math.max(1,H-eps))))*R);
    if(H>=C-eps){if(near<=end)uncertain=Math.min(uncertain,near);continue;}
    const entry=(closest-Math.acosh(C/H))*R;
    const far=(closest-Math.acosh(Math.max(1,(C-eps)/(H+eps))))*R;
    if(entry<0||!Number.isFinite(entry))return {status:'unresolved',reason:'numeric-conditioning',tests};
    if(near>end)continue;
    if(far>=end){uncertain=Math.min(uncertain,near);continue;}
    if(best&&Math.abs(entry-best.distance)<=Math.max(far-near,1e-10*R)){
      uncertain=Math.min(uncertain,near,best.distance);continue;
    }
    if(!best||entry<best.distance){
      const point=space.step(p,u,entry),sample=sampleHyperbolicBall(space,ball,point);
      best={status:'hit',id:ball.id,distance:entry,point,normal:sample.normal};
    }
  }
  if(best&&best.distance<uncertain)return {...best,tests};
  if(uncertain<=end)return {status:'unresolved',reason:'tangent-or-range-boundary',tests};
  if(boundary<=maxDistance)return {status:'unresolved',reason:'domain-exit',distance:boundary,tests};
  return {status:'miss',distance:maxDistance,checkedDistance:maxDistance,tests};
}
