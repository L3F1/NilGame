// Experimental host-free adapter. Deliberately NOT admitted by scene factories,
// portals or shaders until those consumers use the Lorentz metric throughout.
import {geometry} from '../../geom.js';
const hyperbolic=geometry(-1),TOL=1e-8;
const pair=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2]-a[3]*b[3];
const vector=(v,n)=>{if(!Array.isArray(v)||v.length!==n||!v.every(Number.isFinite))throw Error(`Expected ${n} finite components`);};
export function createHyperbolicSpace({curvatureRadius:R=1,maxDistance=2*R}={}){
  if(!Number.isFinite(R)||R<=0||!Number.isFinite(maxDistance)||maxDistance<=0||maxDistance>2*R)
    throw Error('H3 requires positive radius and extent at most 2 curvature radii');
  const origin=Object.freeze([0,0,0,1]);
  function validatePoint(p){
    vector(p,4);
    if(p[3]<1||Math.abs(pair(p,p)+1)>TOL)throw Error('H3 point must lie on the upper unit hyperboloid');
    if(Math.asinh(Math.hypot(...p.slice(0,3)))>4+1e-12)throw Error('H3 numerical range exceeded');
    return true;
  }
  function validateTangent(p,v){validatePoint(p);vector(v,4);
    if(Math.abs(pair(p,v))>TOL*Math.max(1,Math.hypot(...v)))throw Error('H3 vector must be tangent at its point');return true;}
  const ambientDot=(a,b)=>{vector(a,4);vector(b,4);return pair(a,b);};
  function tangentPart(p,v){validatePoint(p);vector(v,4);const c=pair(p,v)/-pair(p,p);return v.map((x,i)=>x+c*p[i]);}
  // Inverse radial Lorentz boost to the origin: avoids subtracting large
  // squared ambient components when measuring a short tangent.
  const local=(p,v)=>v.slice(0,3).map((x,i)=>x-p[i]*v[3]/(1+p[3]));
  function dot(p,u,v){validateTangent(p,u);validateTangent(p,v);const a=local(p,u),b=local(p,v);return a.reduce((s,x,i)=>s+x*b[i],0);}
  function norm(p,v){validateTangent(p,v);return Math.hypot(...local(p,v));}
  function normalize(p,v){const n=norm(p,v);if(!n)throw Error('Cannot normalize zero tangent');return v.map(x=>x/n);}
  function project(p,u,n){const d=dot(p,n,n);if(!d)throw Error('Projection normal must be nonzero');const c=dot(p,u,n)/d;return u.map((x,i)=>x-c*n[i]);}
  const radial=p=>R*Math.asinh(Math.hypot(...p.slice(0,3)));
  function withinDomain(p){validatePoint(p);return radial(p)<maxDistance;}
  function decode(a){vector(a,3);if(Math.hypot(...a)>=maxDistance)throw Error('Author position outside H3 domain');return hyperbolic.exp(a.map(x=>x/R));}
  function encode(p){if(!withinDomain(p))throw Error('Point outside H3 domain');const n=Math.hypot(...p.slice(0,3));return n?p.slice(0,3).map(x=>x*R*Math.asinh(n)/n):[0,0,0];}
  function distance(p,q){validatePoint(p);validatePoint(q);
    const delta=p.slice(0,3).map((x,i)=>x-q[i]),s=Math.hypot(...delta);
    // Rationalize the time-coordinate difference. Subtracting two rounded
    // hypot values can exceed the spatial chord for nearly coincident points.
    const t=Math.abs(delta.reduce((sum,x,i)=>sum+x*(p[i]+q[i]),0)
      /(Math.hypot(1,...p.slice(0,3))+Math.hypot(1,...q.slice(0,3))));
    if(t>s)throw Error('H3 distance lost spacelike chord');
    return 2*R*Math.asinh(Math.sqrt((s-t)*(s+t))/2);
  }
  function transport(p,q,v){validateTangent(p,v);validatePoint(q);
    if(p.every((x,i)=>x===q[i]))return v.slice();
    const c=pair(q,v)/(1-pair(p,q));
    return tangentPart(q,v.map((x,i)=>x+c*(p[i]+q[i])));
  }
  function step(p,u,travel){
    if(Math.abs(norm(p,u)-1)>TOL||!Number.isFinite(travel)||Math.abs(travel)>4*R)throw Error('Invalid H3 geodesic travel/direction');
    if(travel===0)return p.slice();
    const t=travel/R,c=Math.cosh(t),s=Math.sinh(t);
    const q=p.map((x,i)=>c*x+s*u[i]);q[3]=Math.hypot(1,...q.slice(0,3));validatePoint(q);return q;
  }
  function stepWithTransport(p,u,t){const start=p.slice(),initial=u.slice(),position=step(start,initial,t),end=position.slice();
    return {position,direction:transport(start,end,initial),carry:v=>transport(start,end,v)};}
  function logAt(p,q){const d=distance(p,q);if(!d)return [0,0,0,0];
    const difference=q.map((x,i)=>x-p[i]),t=tangentPart(p,difference),n=norm(p,t);
    if(!n)throw Error('H3 logarithm lost direction');return t.map(x=>x*d/n);}
  function expAt(p,v){const n=norm(p,v);return n?step(p,v.map(x=>x/n),n):p.slice();}
  const frame=p=>[[1,0,0,0],[0,1,0,0],[0,0,1,0]].map(v=>transport(origin,p,v));
  function boundaryDistance(p,u,maxTravel=Infinity){
    if(Math.abs(norm(p,u)-1)>TOL||!(maxTravel>=0)||(!Number.isFinite(maxTravel)&&maxTravel!==Infinity))throw Error('Invalid H3 boundary query');
    if(!withinDomain(p))return 0;
    // Solve p.w*cosh(t)+u.w*sinh(t)=cosh(extent/R) in tanh(t/2).
    const a=p[3],b=u[3],extent=maxDistance/R,rho=Math.asinh(Math.hypot(...p.slice(0,3))),C=Math.cosh(extent);
    // cosh(extent)-cosh(rho) cancels for small domains or near the boundary.
    const gap=2*Math.sinh((extent+rho)/2)*Math.sinh((extent-rho)/2);
    const root=Math.sqrt(b*b+gap*(C+a));
    const z=b>=0?gap/(root+b):(root-b)/(a+C);
    const exit=2*R*Math.atanh(z);
    if(!Number.isFinite(exit)||exit<0)throw Error('H3 boundary root unresolved');
    return exit<=maxTravel?exit:Infinity;
  }
  return Object.freeze({kind:'h3',dimension:4,curvatureRadius:R,maxDistance,origin,validatePoint,validateTangent,
    ambientDot,tangentPart,dot,norm,normalize,project,withinDomain,decode,encode,distance,transport,step,stepWithTransport,logAt,expAt,frame,boundaryDistance});
}
